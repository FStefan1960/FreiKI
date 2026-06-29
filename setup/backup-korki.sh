#!/bin/bash
set -e

BACKUP_DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="/tmp/korki-backup-${BACKUP_DATE}"
BACKUP_FILE="/tmp/korki-backup-${BACKUP_DATE}.tar.gz"
GONEO_USER="114598f88090u6"
GONEO_PASS="E7r7l7e3n1w1e4g"
GONEO_HOST="450881.test-my-website.de"
GONEO_DIR="korki"
STACK_DIR="/home/aiadmin/freiki-package"

echo "=== KorKI Backup ${BACKUP_DATE} ==="

mkdir -p "${BACKUP_DIR}"

echo "-> Configs sichern..."
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
tar czf "${BACKUP_FILE}" -C /tmp "korki-backup-${BACKUP_DATE}"

echo "-> Übertragen nach Goneo (${GONEO_HOST})..."
curl --ftp-create-dirs -T "${BACKUP_FILE}" \
    "ftp://${GONEO_HOST}/${GONEO_DIR}/$(basename ${BACKUP_FILE})" \
    --user "${GONEO_USER}:${GONEO_PASS}" \
    --silent --show-error

echo "-> Aufräumen..."
rm -rf "${BACKUP_DIR}"
rm -f "${BACKUP_FILE}"

echo "-> Alte Backups auf Goneo löschen (>14 Tage)..."
CUTOFF=$(date -d '14 days ago' +%Y-%m-%d 2>/dev/null || date -v-14d +%Y-%m-%d)
curl "ftp://${GONEO_HOST}/${GONEO_DIR}/" \
    --user "${GONEO_USER}:${GONEO_PASS}" \
    --silent | awk '{print $NF}' | while read FILE; do
    FILEDATE=$(echo "${FILE}" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1)
    if [[ -n "${FILEDATE}" && "${FILEDATE}" < "${CUTOFF}" ]]; then
        echo "   Lösche: ${FILE}"
        curl "ftp://${GONEO_HOST}/${GONEO_DIR}/${FILE}" \
            --user "${GONEO_USER}:${GONEO_PASS}" \
            -Q "DELE ${GONEO_DIR}/${FILE}" \
            --silent || true
    fi
done

echo "=== Backup abgeschlossen ==="
