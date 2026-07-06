#!/bin/bash
set -euo pipefail

# ── FreiKI-spezifisch ──────────────────────────────────────────
# IONOS HiDrive (2026-07-05: löst Goneo ab), Key-basiert statt Passwort.
HIDRIVE_USER="freiki-admin"
HIDRIVE_KEY="/home/freiki-admin/.ssh/hidrive_backup_key"
HIDRIVE_SFTP_HOST="sftp.hidrive.ionos.com"
HIDRIVE_RSYNC_HOST="rsync.hidrive.ionos.com"
HIDRIVE_DIR="users/freiki-admin/backups/freiki"
SSH_OPTS="-o IdentitiesOnly=yes -i ${HIDRIVE_KEY} -o StrictHostKeyChecking=accept-new"
STACK_DIR="/home/freiki-admin/freiki-package"
PG_USER="freiki_user"

echo "=== FreiKI Restore ==="
echo ""

# ── Verfügbare Backups anzeigen ──
echo "Verfügbare Backups auf HiDrive:"
sftp $SSH_OPTS -b <(printf 'cd %s\nls -1\n' "${HIDRIVE_DIR}") "${HIDRIVE_USER}@${HIDRIVE_SFTP_HOST}" | grep -E '\.tar\.zst$'
echo ""
read -p "Backup-Dateiname eingeben (z.B. freiki-backup-2026-07-05_08-07.tar.zst): " BACKUP_FILE

# ── Backup herunterladen (rsync, schneller als SFTP) ──
echo "-> Backup herunterladen..."
rsync -e "ssh $SSH_OPTS" "${HIDRIVE_USER}@${HIDRIVE_RSYNC_HOST}:${HIDRIVE_DIR}/${BACKUP_FILE}" "/tmp/${BACKUP_FILE}"

# ── Entpacken (zstd, seit backup.sh-Umbau 2026-07-04 kein gzip mehr) ──
echo "-> Entpacken..."
zstd -d -f "/tmp/${BACKUP_FILE}" -o "/tmp/${BACKUP_FILE%.zst}"
tar xf "/tmp/${BACKUP_FILE%.zst}" -C /tmp/
rm -f "/tmp/${BACKUP_FILE%.zst}"
BACKUP_DIR="/tmp/$(basename "${BACKUP_FILE}" .tar.zst)"

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
    ZSTFILE="${BACKUP_DIR}/${VOLUME}.tar.zst"
    if [ -f "${ZSTFILE}" ]; then
        echo "   ${VOLUME}..."
        # zstd läuft hier bewusst auf dem HOST (nicht im Container, siehe backup.sh-Notiz zum
        # zstd-Pfad-Bug) -- Ergebnis ist ein normales .tar, das der Alpine-Container ohne
        # zstd-Unterstützung einfach mit "tar xf" einlesen kann.
        zstd -d -f "${ZSTFILE}" -o "${BACKUP_DIR}/${VOLUME}.tar"
        docker volume create ${VOLUME} >/dev/null 2>&1 || true
        docker run --rm \
            -v ${VOLUME}:/data \
            -v "${BACKUP_DIR}":/backup \
            alpine sh -c "rm -rf /data/..?* /data/.[!.]* /data/* 2>/dev/null; cd /data && tar xf /backup/${VOLUME}.tar"
        rm -f "${BACKUP_DIR}/${VOLUME}.tar"
    else
        echo "   WARNUNG: ${VOLUME} nicht im Backup gefunden – übersprungen."
    fi
done

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
