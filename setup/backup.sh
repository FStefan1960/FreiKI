#!/bin/bash
set -euo pipefail

BACKUP_DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="/tmp/freiki-backup-${BACKUP_DATE}"
BACKUP_FILE="/tmp/freiki-backup-${BACKUP_DATE}.tar.gz"
GONEO_USER="114598f88090u6"
GONEO_PASS="E7r7l7e3n1w1e4g"
GONEO_HOST="450881.test-my-website.de"
GONEO_DIR="freiki"
STACK_DIR="/home/freiki-admin/freiki-package"

echo "=== FreiKI Backup ${BACKUP_DATE} ==="

mkdir -p "${BACKUP_DIR}"

echo "-> Configs sichern..."
rsync -a --exclude='node_modules' --exclude='.git' "${STACK_DIR}/" "${BACKUP_DIR}/freiki-package/"

echo "-> PostgreSQL Dump..."
docker exec PostgreSQL pg_dumpall -U freiki_user --no-role-passwords | gzip > "${BACKUP_DIR}/postgres-dumpall.sql.gz"

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

echo "-> Übertragen nach goneo..."
curl --insecure -u "${GONEO_USER}:${GONEO_PASS}" \
  sftp://${GONEO_HOST}:2222/${GONEO_DIR}/$(basename ${BACKUP_FILE}) \
  -T "${BACKUP_FILE}" --progress-bar

echo "-> Aufräumen..."
rm -rf "${BACKUP_DIR}"
rm -f "${BACKUP_FILE}"

echo "=== Backup abgeschlossen ==="

# Alte Backups lokal auf goneo löschen – nicht automatisch möglich per curl
# → manuelle Bereinigung oder separates Cleanup-Script
