#!/bin/bash
set -euo pipefail

# ── KorKI-spezifisch ──────────────────────────────────────────
# IONOS HiDrive (2026-07-05: löst Goneo ab), Key-basiert statt Passwort.
HIDRIVE_USER="freiki-admin"
HIDRIVE_KEY="/home/aiadmin/.ssh/hidrive_backup_key"
HIDRIVE_SFTP_HOST="sftp.hidrive.ionos.com"
HIDRIVE_RSYNC_HOST="rsync.hidrive.ionos.com"
HIDRIVE_DIR="users/freiki-admin/backups/korki"
SSH_OPTS="-o IdentitiesOnly=yes -i ${HIDRIVE_KEY} -o StrictHostKeyChecking=accept-new"
STACK_DIR="/home/aiadmin/freiki-package"
PG_USER="n8n_user"

echo "=== KorKI Restore ==="
echo ""

echo "Verfügbare Backups auf HiDrive:"
sftp $SSH_OPTS -b <(printf 'cd %s\nls -1\n' "${HIDRIVE_DIR}") "${HIDRIVE_USER}@${HIDRIVE_SFTP_HOST}" | grep -E '\.tar\.zst$'
echo ""
read -p "Backup-Dateiname eingeben (z.B. korki-backup-2026-07-05_03-00.tar.zst): " BACKUP_FILE

echo "-> Backup herunterladen..."
rsync -e "ssh $SSH_OPTS" "${HIDRIVE_USER}@${HIDRIVE_RSYNC_HOST}:${HIDRIVE_DIR}/${BACKUP_FILE}" "/tmp/${BACKUP_FILE}"

echo "-> Entpacken..."
zstd -d -f "/tmp/${BACKUP_FILE}" -o "/tmp/${BACKUP_FILE%.zst}"
tar xf "/tmp/${BACKUP_FILE%.zst}" -C /tmp/
rm -f "/tmp/${BACKUP_FILE%.zst}"
BACKUP_DIR="/tmp/$(basename "${BACKUP_FILE}" .tar.zst)"

echo "-> Docker-Stack stoppen..."
cd "${STACK_DIR}" && docker compose down

echo "-> Configs wiederherstellen..."
cp -r "${BACKUP_DIR}/freiki-package" "${STACK_DIR}-restore"
echo "   Configs liegen in ${STACK_DIR}-restore – bitte manuell prüfen!"
echo ""
read -p "Configs jetzt automatisch übernehmen? (j/N): " CONFIRM
if [[ "$CONFIRM" == "j" || "$CONFIRM" == "J" ]]; then
    cp -r "${STACK_DIR}-restore"/* "${STACK_DIR}/"
    echo "   Configs übernommen."
fi

# Hinweis: postgres-dumpall.sql.gz liegt zusätzlich im Backup, wird hier bewusst NICHT
# verwendet (würde bei parallelem Volume-Restore zu Korruption führen). Nur als manueller
# Fallback gedacht, falls der rohe Volume-Restore mal nicht funktioniert:
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
    freiki-package_portainer_data \
    freiki-package_hermes_data; do
    ZSTFILE="${BACKUP_DIR}/${VOLUME}.tar.zst"
    if [ -f "${ZSTFILE}" ]; then
        echo "   ${VOLUME}..."
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

echo "-> Stack starten..."
cd "${STACK_DIR}" && docker compose up -d

echo "-> Warte auf Postgres..."
sleep 10

echo "-> Aufräumen..."
rm -rf "${BACKUP_DIR}"
rm -f "/tmp/${BACKUP_FILE}"
if [ -d "${STACK_DIR}-restore" ]; then
    echo "   Hinweis: ${STACK_DIR}-restore liegt noch da (Configs-Kopie), bei Bedarf manuell löschen."
fi

echo ""
echo "=== Restore abgeschlossen ==="
echo "Bitte prüfen: Uptime Kuma für Dienststatus"
