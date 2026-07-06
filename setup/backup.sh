#!/bin/bash
set -euo pipefail

# --- Konfiguration ---
BACKUP_DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_ROOT="/home/aiadmin/backups"
BACKUP_DIR="${BACKUP_ROOT}/korki-${BACKUP_DATE}"
BACKUP_FILE="${BACKUP_ROOT}/korki-backup-${BACKUP_DATE}.tar.zst"
LOG_FILE="/home/aiadmin/korki-backup.log"
MAX_BACKUPS=7
STACK_DIR="/home/aiadmin/freiki-package"
NOTIFY_EMAIL="admin@diakonie-kork-ki.de"

# IONOS HiDrive (2026-07-05: löst Goneo ab), Key-basiert statt Passwort,
# dedizierter Key nur für diesen Zweck. Gemeinsamer HiDrive-Account für alle
# Instanzen, aber eigener Unterordner je Instanz und eigener SSH-Key je Server.
HIDRIVE_USER="freiki-admin"
HIDRIVE_KEY="/home/aiadmin/.ssh/hidrive_backup_key"
HIDRIVE_SFTP_HOST="sftp.hidrive.ionos.com"
HIDRIVE_RSYNC_HOST="rsync.hidrive.ionos.com"
HIDRIVE_DIR="users/freiki-admin/backups/korki"
SSH_OPTS="-o IdentitiesOnly=yes -i ${HIDRIVE_KEY} -o StrictHostKeyChecking=accept-new"

# .env enthält teils unquotierte Werte mit Leerzeichen (z.B. APP_TAGLINE) -> nicht sourcen,
# gezielt nur die benötigten Variablen auslesen
get_env() { grep -m1 "^$1=" "${STACK_DIR}/.env" | cut -d'=' -f2-; }
POSTGRES_USER=$(get_env POSTGRES_USER)
SMTP_HOST=$(get_env SMTP_HOST)
SMTP_PORT=$(get_env SMTP_PORT)
SMTP_USER=$(get_env SMTP_USER)
SMTP_PASS=$(get_env SMTP_PASS)
SMTP_FROM=$(get_env SMTP_FROM)

FAILURES=()

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE" || true
}
export -f log
export LOG_FILE

notify() {
  local subject="$1" message="$2"
  # curl kann den EHLO-Hostnamen nicht überschreiben; der Server-Hostname "korki" (kein FQDN)
  # wird vom Mailserver mit "Helo command rejected: Invalid name" abgelehnt -> smtplib mit
  # explizitem local_hostname (= eigener Mail-Domain) statt curl.
  python3 - "$SMTP_HOST" "$SMTP_PORT" "$SMTP_USER" "$SMTP_PASS" "$SMTP_FROM" "$NOTIFY_EMAIL" "$subject" "$message" << 'PYEOF' || log "WARNUNG: Mail-Benachrichtigung fehlgeschlagen"
import smtplib, sys
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid
host, port, user, pw, sender, rcpt, subject, message = sys.argv[1:9]
msg = MIMEText(message)
msg['Subject'] = subject
msg['From'] = sender
msg['To'] = rcpt
msg['Date'] = formatdate(localtime=True)
msg['Message-ID'] = make_msgid()
s = smtplib.SMTP(host, int(port), local_hostname=host, timeout=15)
s.starttls()
s.login(user, pw)
s.sendmail(sender, [rcpt], msg.as_string())
s.quit()
PYEOF
}

cleanup_remote() {
  local listing old_files f
  listing=$(sftp $SSH_OPTS -b <(printf 'cd %s\nls -1\n' "${HIDRIVE_DIR}") "${HIDRIVE_USER}@${HIDRIVE_SFTP_HOST}" 2>/dev/null) \
    || { log "WARNUNG: Remote-Listing fehlgeschlagen, überspringe Bereinigung"; return; }
  old_files=$(echo "$listing" | grep -E '^korki-backup-.*\.tar\.zst$' | sort | head -n -"${MAX_BACKUPS}" || true)
  if [ -z "$old_files" ]; then
    log "   Keine alten Backups zu löschen."
    return
  fi
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    log "   Lösche altes Backup: $f"
    sftp $SSH_OPTS -b <(printf 'cd %s\nrm %s\nrm %s.sha256\n' "${HIDRIVE_DIR}" "$f" "$f") "${HIDRIVE_USER}@${HIDRIVE_SFTP_HOST}" \
      || { log "   Fehler beim Löschen von $f"; FAILURES+=("cleanup:$f"); }
  done <<< "$old_files"
}

# --- Backup ---
log "=== KorKI Backup ${BACKUP_DATE} ==="
mkdir -p "$BACKUP_DIR"
START_TIME=$(date +%s)

log "-> Configs sichern..."
if ! rsync -a --exclude='node_modules' --exclude='.git' "$STACK_DIR/" "$BACKUP_DIR/freiki-package/"; then
  log "FEHLER: Configs-Sync fehlgeschlagen"
  FAILURES+=("configs")
fi

log "-> PostgreSQL Dump..."
if ! docker exec PostgreSQL pg_dumpall -U "${POSTGRES_USER}" --no-role-passwords --clean --if-exists \
    | gzip > "$BACKUP_DIR/postgres-dumpall.sql.gz"; then
  log "FEHLER: PostgreSQL-Dump fehlgeschlagen"
  FAILURES+=("postgres-dump")
fi

log "-> Volumes sichern..."
VOLUMES=(
  freiki-package_caddy_config
  freiki-package_caddy_data
  freiki-package_n8n_storage
  freiki-package_postgres_data
  freiki-package_paperless_data
  freiki-package_paperless_media
  freiki-package_paperless_export
  freiki-package_paperless_consume
  freiki-package_paperless_redis
  freiki-package_mail_config
  freiki-package_mail_data
  freiki-package_mail_logs
  freiki-package_mail_state
  freiki-package_mattermost_config
  freiki-package_mattermost_data
  freiki-package_mattermost_logs
  freiki-package_mattermost_plugins
  freiki-package_mattermost_client_plugins
  freiki-package_kuma_data
  freiki-package_portainer_data
  freiki-package_hermes_data
  # bewusst NICHT gesichert: freiki-package_whisper_cache, freiki-package_vllm_cache,
  # freiki-package_embedding_cache (lokale LLM-Modell-Gewichte/Caches, neu herunterladbar,
  # keine Nutzerdaten -- ausdrückliche Vorgabe: LLM-Modelle nie mitsichern).
  # anythingllm_db/anythingllm_storage gehören zu keinem freiki-package-Service, bewusst
  # ignoriert (ungenutzter Rest, nicht Teil von docker-compose.yml).
)
FAIL_MARKER="$BACKUP_DIR/.volume-failures"
: > "$FAIL_MARKER"
printf "%s\n" "${VOLUMES[@]}" | xargs -P 4 -I {} bash -c '
  set -o pipefail
  log "   {}..."
  docker run --rm -v {}:/data alpine tar c /data 2>/dev/null | zstd -T1 -9 -o "'"$BACKUP_DIR"'/{}.tar.zst" \
    || { log "   Fehler bei {}"; echo "{}" >> "'"$FAIL_MARKER"'"; }
'
while IFS= read -r vol; do
  [ -z "$vol" ] && continue
  FAILURES+=("volume:$vol")
done < "$FAIL_MARKER"
rm -f "$FAIL_MARKER"

log "-> Packen..."
if ! tar c -C "$BACKUP_ROOT" "korki-${BACKUP_DATE}" | zstd -T0 -19 -o "$BACKUP_FILE"; then
  log "FEHLER: Packen fehlgeschlagen"
  FAILURES+=("pack")
fi

log "-> Prüfsumme berechnen..."
sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256" || FAILURES+=("checksum")

log "-> Übertragen nach HiDrive (rsync, Key-Auth)..."
if ! rsync -e "ssh $SSH_OPTS" "$BACKUP_FILE" "$BACKUP_FILE.sha256" "${HIDRIVE_USER}@${HIDRIVE_RSYNC_HOST}:${HIDRIVE_DIR}/"; then
  log "FEHLER: Upload fehlgeschlagen"
  FAILURES+=("upload")
fi

log "-> Aufräumen (lokal)..."
rm -rf "$BACKUP_DIR"
rm -f "$BACKUP_FILE" "$BACKUP_FILE.sha256"

log "-> Alte Backups auf HiDrive bereinigen..."
cleanup_remote

DURATION=$(( $(date +%s) - START_TIME ))

if [ "${#FAILURES[@]}" -eq 0 ]; then
  log "=== Backup erfolgreich abgeschlossen (Dauer: ${DURATION}s) ==="
  notify "✅ KorKI Backup Erfolgreich" "KorKI Backup ${BACKUP_DATE} abgeschlossen (Dauer: ${DURATION}s)."
else
  log "=== Backup FEHLGESCHLAGEN (Dauer: ${DURATION}s): ${FAILURES[*]} ==="
  notify "❌ KorKI Backup Fehlgeschlagen" "KorKI Backup ${BACKUP_DATE} hatte Fehler: ${FAILURES[*]}. Prüfe ${LOG_FILE}."
  exit 1
fi
