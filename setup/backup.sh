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
cp -r "${STACK_DIR}" "${BACKUP_DIR}/freiki-package"

echo "-> PostgreSQL Dump..."
docker exec PostgreSQL pg_dumpall -U freiki_user | gzip > "${BACKUP_DIR}/postgres-dumpall.sql.gz"

echo "-> Volumes sichern..."
for VOLUME in freiki-package_n8n_storage freiki-package_postgres_data freiki-package_mail_data freiki-package_mail_state freiki-package_mail_config freiki-package_portainer_data freiki-package_caddy_config freiki-package_caddy_data freiki-package_whisper_cache freiki-package_paperless_data freiki-package_paperless_media freiki-package_paperless_export freiki-package_paperless_consume freiki-package_paperless_redis freiki-package_kuma_data freiki-package_mattermost_data freiki-package_mattermost_logs freiki-package_mattermost_config freiki-package_mattermost_plugins freiki-package_mattermost_client_plugins; do
    echo "   ${VOLUME}..."
    docker run --rm \
        -v ${VOLUME}:/data \
        -v "${BACKUP_DIR}":/backup \
        alpine tar czf /backup/${VOLUME}.tar.gz -C /data .
done

echo "-> Custom Image sichern..."
docker save freiki-ui:latest | gzip > "${BACKUP_DIR}/freiki-ui-image.tar.gz"

echo "-> Packen..."
tar czf "${BACKUP_FILE}" -C /tmp "freiki-backup-${BACKUP_DATE}"

echo "-> Übertragen nach ${REMOTE_HOST}..."
ssh -i "${SSH_KEY}" "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}"
scp -i "${SSH_KEY}" "${BACKUP_FILE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "-> Aufräumen..."
rm -rf "${BACKUP_DIR}"
rm -f "${BACKUP_FILE}"

echo "=== Backup abgeschlossen ==="
