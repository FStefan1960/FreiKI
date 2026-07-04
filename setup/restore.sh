#!/bin/bash
set -euo pipefail

# ── FreiKI-spezifisch ──────────────────────────────────────────
GONEO_USER="114598f88090u6"
GONEO_PASS="E7r7l7e3n1w1e4g"
GONEO_HOST="450881.test-my-website.de"
GONEO_DIR="freiki"
STACK_DIR="/home/freiki-admin/freiki-package"
PG_USER="freiki_user"

echo "=== FreiKI Restore ==="
echo ""

# ── Verfügbare Backups anzeigen (gleicher Weg wie backup.sh hochlädt: SFTP+Passwort) ──
echo "Verfügbare Backups auf Goneo:"
curl -s --insecure -u "${GONEO_USER}:${GONEO_PASS}" "sftp://${GONEO_HOST}:2222/${GONEO_DIR}/"
echo ""
read -p "Backup-Dateiname eingeben (z.B. freiki-backup-2026-07-02_03-30.tar.gz): " BACKUP_FILE

# ── Backup herunterladen ──
echo "-> Backup herunterladen..."
curl --insecure -u "${GONEO_USER}:${GONEO_PASS}" \
    "sftp://${GONEO_HOST}:2222/${GONEO_DIR}/${BACKUP_FILE}" \
    -o "/tmp/${BACKUP_FILE}" --progress-bar

# ── Entpacken ──
echo "-> Entpacken..."
tar xzf "/tmp/${BACKUP_FILE}" -C /tmp/
BACKUP_DIR="/tmp/$(basename "${BACKUP_FILE}" .tar.gz)"

# ── Stack stoppen (muss vor dem Volume-Restore passieren, sonst droht Korruption) ──
echo "-> Docker-Stack stoppen..."
cd "${STACK_DIR}" && docker compose down

# ── Configs wiederherstellen ──
echo "-> Configs wiederherstellen..."
cp -r "${BACKUP_DIR}/freiki-package" "${STACK_DIR}-restore"
echo "   Configs liegen in ${STACK_DIR}-restore – bitte manuell prüfen!"
echo ""
read -p "Configs jetzt automatisch übernehmen? (j/N): " CONFIRM
if [[ "$CONFIRM" == "j" || "$CONFIRM" == "J" ]]; then
    cp -r "${STACK_DIR}-restore"/* "${STACK_DIR}/"
    echo "   Configs übernommen."
fi

# ── Docker Volumes wiederherstellen (EINZIGE Postgres-Restore-Methode – roh, bei gestopptem Stack) ──
# Hinweis: postgres-dumpall.sql.gz liegt zusätzlich im Backup, wird hier bewusst NICHT
# verwendet (würde bei parallelem Volume-Restore zu Korruption führen). Nur als manueller
# Fallback gedacht, falls der rohe Volume-Restore mal nicht funktioniert (z.B. PG-Versionswechsel):
#   zcat "${BACKUP_DIR}/postgres-dumpall.sql.gz" | docker exec -i PostgreSQL psql -U ${PG_USER} -d postgres
echo "-> Volumes wiederherstellen..."
for VOLUME in \
    freiki-package_caddy_config \
    freiki-package_caddy_data \
    freiki-package_n8n_storage \
    freiki-package_postgres_data \
    freiki-package_paperless_data \
    freiki-package_paperless_media \
    freiki-package_paperless_export \
    freiki-package_paperless_consume \
    freiki-package_paperless_redis \
    freiki-package_mail_config \
    freiki-package_mail_data \
    freiki-package_mail_logs \
    freiki-package_mail_state \
    freiki-package_mattermost_config \
    freiki-package_mattermost_data \
    freiki-package_mattermost_logs \
    freiki-package_mattermost_plugins \
    freiki-package_mattermost_client_plugins \
    freiki-package_kuma_data \
    freiki-package_portainer_data; do
    TARFILE="${BACKUP_DIR}/${VOLUME}.tar.gz"
    if [ -f "${TARFILE}" ]; then
        echo "   ${VOLUME}..."
        docker volume create ${VOLUME} >/dev/null 2>&1 || true
        docker run --rm \
            -v ${VOLUME}:/data \
            -v "${BACKUP_DIR}":/backup \
            alpine sh -c "rm -rf /data/..?* /data/.[!.]* /data/* 2>/dev/null; cd /data && tar xzf /backup/${VOLUME}.tar.gz"
    else
        echo "   WARNUNG: ${VOLUME} nicht im Backup gefunden – übersprungen."
    fi
done

# ── Custom Image wiederherstellen (falls im Backup enthalten) ──
if [ -f "${BACKUP_DIR}/freiki-ui-image.tar.gz" ]; then
    echo "-> freiki-ui Image wiederherstellen..."
    docker load < "${BACKUP_DIR}/freiki-ui-image.tar.gz"
fi

# ── Stack starten ──
echo "-> Stack starten..."
cd "${STACK_DIR}" && docker compose up -d

echo "-> Warte auf Postgres..."
sleep 10

# ── Aufräumen ──
echo "-> Aufräumen..."
rm -rf "${BACKUP_DIR}"
rm -f "/tmp/${BACKUP_FILE}"
if [ -d "${STACK_DIR}-restore" ]; then
    echo "   Hinweis: ${STACK_DIR}-restore liegt noch da (Configs-Kopie), bei Bedarf manuell löschen."
fi

echo ""
echo "=== Restore abgeschlossen ==="
echo "Bitte prüfen:"
echo "  - https://app.freiki.com"
echo "  - Uptime Kuma für Dienststatus"
