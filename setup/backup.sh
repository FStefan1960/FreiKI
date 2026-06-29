#!/bin/bash
set -e

BACKUP_DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="/tmp/freiki-backup-${BACKUP_DATE}"
BACKUP_FILE="/tmp/freiki-backup-${BACKUP_DATE}.tar.gz"
REMOTE_USER="frank"
REMOTE_HOST="fst60-de"
REMOTE_DIR="/home/frank/freiki-backups"
SSH_KEY="/home/freiki-admin/.ssh/backup_key"
STACK_DIR="/home/freiki-admin/freiki-package"

echo "=== FreiKI Backup ${BACKUP_DATE} ==="

mkdir -p "${BACKUP_DIR}"

echo "-> Configs sichern..."
# node_modules ausschließen – kann jederzeit per npm install wiederhergestellt werden
rsync -a --exclude='node_modules' --exclude='.git' "${STACK_DIR}/" "${BACKUP_DIR}/freiki-package/"

echo "-> PostgreSQL Dump..."
docker exec PostgreSQL pg_dumpall -U n8n_user --no-role-passwords | gzip > "${BACKUP_DIR}/postgres-dumpall.sql.gz"

echo "-> Volumes sichern..."
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
    echo "   ${VOLUME}..."
    docker run --rm \
        -v ${VOLUME}:/data \
        -v "${BACKUP_DIR}":/backup \
        alpine tar czf /backup/${VOLUME}.tar.gz -C /data . 2>/dev/null || true
done

echo "-> Packen..."
tar czf "${BACKUP_FILE}" -C /tmp "freiki-backup-${BACKUP_DATE}"

echo "-> Übertragen nach ${REMOTE_HOST}..."
ssh -i "${SSH_KEY}" "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}"
scp -i "${SSH_KEY}" "${BACKUP_FILE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "-> Aufräumen..."
rm -rf "${BACKUP_DIR}"
rm -f "${BACKUP_FILE}"

echo "=== Backup abgeschlossen ==="

# Alte Backups auf Zielserver löschen (älter als 14 Tage)
echo "-> Alte Backups löschen (>14 Tage)..."
ssh -i "${SSH_KEY}" "${REMOTE_USER}@${REMOTE_HOST}" "find ${REMOTE_DIR} -name '*.tar.gz' -mtime +14 -delete"
