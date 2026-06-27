#!/bin/bash
set -e

REMOTE_USER="frank"
REMOTE_HOST="fst60-de"
REMOTE_DIR="/home/frank/freiki-backups"
SSH_KEY="/home/freiki-admin/.ssh/backup_key"

echo "=== FreiKI Restore ==="
echo ""

# Verfügbare Backups anzeigen
echo "Verfügbare Backups:"
ssh -i "${SSH_KEY}" "${REMOTE_USER}@${REMOTE_HOST}" "ls -1t ${REMOTE_DIR}/"
echo ""
read -p "Backup-Dateiname eingeben (z.B. freiki-backup-2026-06-22_03-00.tar.gz): " BACKUP_FILE

# Backup herunterladen
echo "-> Backup herunterladen..."
scp -i "${SSH_KEY}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${BACKUP_FILE}" /tmp/

# Entpacken
echo "-> Entpacken..."
tar xzf "/tmp/${BACKUP_FILE}" -C /tmp/
BACKUP_DIR="/tmp/$(basename ${BACKUP_FILE} .tar.gz)"

# Stack stoppen
echo "-> Docker-Stack stoppen..."
cd ~/freiki-package && docker compose down

# Configs wiederherstellen
echo "-> Configs wiederherstellen..."
cp -r "${BACKUP_DIR}/freiki-package" ~/freiki-package-restore
echo "   Configs liegen in ~/freiki-package-restore – bitte manuell prüfen!"
echo ""
read -p "Configs jetzt automatisch übernehmen? (j/N): " CONFIRM
if [[ "$CONFIRM" == "j" || "$CONFIRM" == "J" ]]; then
    cp -r ~/freiki-package-restore/* ~/freiki-package/
    echo "   Configs übernommen."
fi

# PostgreSQL wiederherstellen
echo "-> PostgreSQL Dump wiederherstellen..."
docker compose up -d PostgreSQL
sleep 10
zcat "${BACKUP_DIR}/postgres-dumpall.sql.gz" | docker exec -i PostgreSQL psql -U freiki_user -d postgres
echo "   PostgreSQL wiederhergestellt."

# Docker Volumes wiederherstellen
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
        docker volume create ${VOLUME} 2>/dev/null || true
        docker run --rm \
            -v ${VOLUME}:/data \
            -v "${BACKUP_DIR}":/backup \
            alpine sh -c "cd /data && tar xzf /backup/${VOLUME}.tar.gz"
    else
        echo "   WARNUNG: ${VOLUME} nicht im Backup gefunden – übersprungen."
    fi
done

# Custom Image wiederherstellen
if [ -f "${BACKUP_DIR}/freiki-ui-image.tar.gz" ]; then
    echo "-> freiki-ui Image wiederherstellen..."
    docker load < "${BACKUP_DIR}/freiki-ui-image.tar.gz"
fi

# Stack starten
echo "-> Stack starten..."
cd ~/freiki-package && docker compose up -d

# Aufräumen
echo "-> Aufräumen..."
rm -rf "${BACKUP_DIR}"
rm -f "/tmp/${BACKUP_FILE}"

echo ""
echo "=== Restore abgeschlossen ==="
echo "Bitte prüfen:"
echo "  - https://app.freiki.com  (FreiKI-UI)"
echo "  - https://chat.freiki.com  (Mattermost)"
echo "  - Uptime Kuma für Dienststatus"
