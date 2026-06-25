# Neue Instanz aus FreiKI-Backup aufsetzen

Diese Anleitung beschreibt, wie aus einem FreiKI-Backup eine neue, eigenständige Instanz (z.B. „EvaKI") aufgesetzt wird. Ausgangspunkt ist ein laufendes Ubuntu-Basissystem.

---

## 1. Servervorbereitung

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Docker installieren
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Weitere Tools
sudo apt install -y git curl openssl unzip ufw
```

### Firewall einrichten

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 25/tcp
sudo ufw allow 587/tcp
sudo ufw allow 143/tcp
sudo ufw allow 993/tcp
sudo ufw enable
```

Tailscale installieren und einloggen, dann:

```bash
sudo ufw allow in on tailscale0
```

Einloggen als Deployment-User (z.B. `evaki-admin`):

```bash
sudo adduser evaki-admin
sudo usermod -aG docker,sudo evaki-admin
```

---

## 2. Backup vom Quellserver holen

```bash
# Auf dem Zielserver als evaki-admin
scp frank@fst60-de:/home/frank/freiki-backups/freiki-backup-DATUM.tar.gz ~/
tar xzf freiki-backup-DATUM.tar.gz
```

Das entpackte Verzeichnis enthält:
- `freiki-package/` – alle Configs, Compose-File, Caddyfile, Prompts etc.
- `postgres-dumpall.sql.gz` – vollständiger DB-Dump
- `freiki-package_*.tar.gz` – Docker-Volumes (n8n, Paperless, Mattermost etc.)
- `freiki-ui-image.tar.gz` – Custom Docker Image

---

## 3. Dateien einrichten

```bash
cp -r ~/freiki-backup-DATUM/freiki-package ~/evaki-package
cd ~/evaki-package

# .env auf Basis der Vorlage anlegen
cp .env.example .env
```

---

## 4. .env anpassen

Alle Werte die `freiki` oder `freiki.com` enthalten auf die neue Instanz anpassen:

```bash
nano .env
```

Folgende Felder **zwingend** ändern:

| Variable | Beispiel EvaKI |
|----------|---------------|
| `POSTGRES_USER` | `evaki_user` |
| `POSTGRES_PASSWORD` | *(neu generieren)* |
| `POSTGRES_DB` | `evaki` |
| `N8N_HOST` | `n8n.evaki.de` |
| `WEBHOOK_URL` | `https://n8n.evaki.de/` |
| `N8N_ENCRYPTION_KEY` | *(neu: `openssl rand -hex 32`)* |
| `VLLM_API_KEY` | *(API-Key für neuen Mandanten)* |
| `APP_URL` | `https://app.evaki.de` |
| `KORKI_JWT_SECRET` | *(neu: `openssl rand -hex 32`)* |
| `KB_INGEST_API_KEY` | *(neu: `openssl rand -hex 32`)* |
| `BOT_API_KEY` | *(neu: `openssl rand -hex 32`)* |
| `MATTERMOST_OIDC_CLIENT_ID` | *(neu generieren)* |
| `MATTERMOST_OIDC_CLIENT_SECRET` | *(neu: `openssl rand -hex 32`)* |
| `MATTERMOST_OIDC_REDIRECT_URI` | `https://chat.evaki.de/signup/gitlab/complete` |
| `PAPERLESS_URL` | `https://paperless.evaki.de` |
| `PAPERLESS_SECRET_KEY` | *(neu: `openssl rand -hex 32`)* |
| `PAPERLESS_ADMIN_PASSWORD` | *(neu generieren)* |
| `MAIL_DOMAIN` | `evaki.de` |
| `SMTP_USER` | `noreply@evaki.de` |
| `SMTP_PASS` | *(nach Mailkonto-Einrichtung, s.u.)* |
| `SMTP_FROM` | `noreply@evaki.de` |
| `MATTERMOST_URL` | `https://chat.evaki.de` |

Secrets schnell generieren:
```bash
openssl rand -hex 32
```

---

## 5. Customizing (Branding)

### App-Name und Farben

In `.env` ergänzen (falls noch nicht vorhanden):

```env
APP_NAME=EvaKI
APP_COLOR=#IHRE_FARBE        # Primärfarbe (Hex)
APP_COLOR_HOVER=#DUNKLERE    # Hover-Zustand
APP_COLOR_ACTIVE=#NOCH_DUNKLER
APP_NAVY=#IHRE_DUNKELFARBE   # Sidebar-Hintergrund
APP_TAGLINE=Ihr KI-Assistent
APP_LOGO=/icons/evaki-logo.svg
APP_LOGO_SIDEBAR=/icons/evaki-mark.svg
APP_SW_VERSION=1             # Service Worker Cache-Version (bei CSS-Änderungen hochzählen)
APP_FOOTER_NOTE=             # Optionaler Hinweistext im Footer
```

### Logo ersetzen

```bash
# Eigene SVG-Logos nach public/icons/ kopieren
cp evaki-logo.svg ~/evaki-package/freiki-ui/public/icons/
cp evaki-mark.svg ~/evaki-package/freiki-ui/public/icons/
```

### Wissensbereiche anpassen

```bash
nano ~/evaki-package/freiki-ui/areas.json
```

Jeden Bereich mit eigenem `key`, `title`, `icon` und ggf. angepassten Prompts versehen.

### Prompts anpassen

```bash
ls ~/evaki-package/freiki-ui/prompts/
# w_freiki.md → enthält Infos über FreiKI → für EvaKI anpassen
nano ~/evaki-package/freiki-ui/prompts/w_freiki.md
```

### Caddyfile anpassen

```bash
nano ~/evaki-package/caddy/Caddyfile
# Alle freiki.com → evaki.de ersetzen
sed -i 's/freiki\.com/evaki.de/g' ~/evaki-package/caddy/Caddyfile
```

---

## 6. Docker Image laden und bauen

```bash
cd ~/evaki-package

# Gesichertes Image laden (enthält den letzten Stand der UI)
docker load < ~/freiki-backup-DATUM/freiki-ui-image.tar.gz

# Image für neue Instanz umtaggen
docker tag freiki-ui:latest evaki-ui:latest

# In docker-compose.yml den Image-Namen anpassen
sed -i 's/freiki-ui:latest/evaki-ui:latest/g' docker-compose.yml
sed -i 's/container_name: FreiKI/container_name: EvaKI/g' docker-compose.yml
```

Wenn Änderungen am UI vorgenommen wurden, neu bauen:
```bash
docker compose build freiki-ui
```

---

## 7. DNS einrichten

Bei eurem DNS-Anbieter folgende Einträge für `evaki.de` setzen:

| Typ | Hostname | Wert |
|-----|----------|------|
| A | `@` | Server-IP |
| A | `app` | Server-IP |
| A | `n8n` | Server-IP |
| A | `chat` | Server-IP |
| A | `paperless` | Server-IP |
| A | `mail` | Server-IP |
| MX | `@` | `mail.evaki.de` (Prio 10) |
| TXT | `@` | `v=spf1 mx ~all` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@evaki.de` |

Reverse DNS (PTR) im Hoster-Panel: `SERVER-IP` → `mail.evaki.de`

---

## 8. Container starten

```bash
cd ~/evaki-package
docker compose up -d
```

Logs beobachten:
```bash
docker compose logs -f
```

---

## 9. Datenbank wiederherstellen

```bash
# Warten bis PostgreSQL healthy ist
docker exec PostgreSQL pg_isready -U evaki_user

# Dump einspielen
gunzip -c ~/freiki-backup-DATUM/postgres-dumpall.sql.gz | \
  docker exec -i PostgreSQL psql -U evaki_user

# Hinweis: Der Dump enthält noch den alten User-Namen (freiki_user).
# Falls nötig, User-Mappings anpassen oder Dump vorher bearbeiten.
```

---

## 10. Volumes wiederherstellen (optional)

Nur wenn Daten aus dem Backup übernommen werden sollen (z.B. n8n-Workflows, Paperless-Dokumente):

```bash
BACKUP_DIR=~/freiki-backup-DATUM
STACK=evaki-package   # Name des Compose-Projekts

for VOLUME in n8n_storage paperless_data paperless_media mattermost_data mattermost_config; do
    docker run --rm \
        -v ${STACK}_${VOLUME}:/data \
        -v ${BACKUP_DIR}:/backup \
        alpine sh -c "cd /data && tar xzf /backup/freiki-package_${VOLUME}.tar.gz"
done
```

---

## 11. Mailserver einrichten

```bash
# DKIM-Key generieren
docker exec Mailserver setup config dkim

# Key für DNS auslesen
docker exec Mailserver cat /tmp/docker-mailserver/opendkim/keys/evaki.de/mail.txt
# → TXT-Eintrag mail._domainkey in DNS eintragen

# SSH-Key für Backup-Transfer generieren
ssh-keygen -t ed25519 -f ~/.ssh/backup_key -N ""
cat ~/.ssh/backup_key.pub
# → Public Key auf Backup-Server in authorized_keys eintragen

# Mailkonten anlegen
for ACCOUNT in noreply paperless n8n info admin postmaster; do
    PASS=$(openssl rand -base64 20)
    docker exec Mailserver setup email add ${ACCOUNT}@evaki.de "$PASS"
    echo "${ACCOUNT}@evaki.de: $PASS"
done >> ~/mail-accounts.txt
chmod 600 ~/mail-accounts.txt

# SMTP_PASS in .env auf noreply-Passwort setzen
```

Port 25 beim Hoster freischalten lassen (Voraussetzungen: PTR, SPF, FQDN).

---

## 12. Paperless IMAP-Verbindung konfigurieren

In Paperless unter **Einstellungen → E-Mail** → neues Konto anlegen:

| Feld | Wert |
|------|------|
| Name | FreiKI Eingang |
| IMAP-Server | `Mailserver` |
| IMAP-Port | `143` |
| Benutzername | `paperless@evaki.de` |
| Passwort | *(aus mail-accounts.txt)* |
| Sicherheit | STARTTLS |

Danach unter **E-Mail-Regeln** eine Regel anlegen:

| Feld | Wert |
|------|------|
| Konto | FreiKI Eingang |
| Ordner | INBOX |
| Aktion | Anhänge importieren |
| Nach Verarbeitung | In Papierkorb verschieben |

Tags können über den Betreff vergeben werden: Regel „Betreff enthält `[Rechnung]`" → Tag `Rechnung` automatisch setzen.

---

## 13. Backup-Cronjob einrichten

```bash
cp ~/evaki-package/setup/backup.sh ~/evaki-package/setup/backup.sh
# backup.sh anpassen: REMOTE_DIR auf evaki-backups, Pfade auf evaki-package
chmod +x ~/evaki-package/setup/backup.sh

crontab -e
# Eintrag: 0 3 * * * /home/evaki-admin/evaki-package/setup/backup.sh >> /home/evaki-admin/backup.log 2>&1
```

---

## 14. Abschlusskontrolle

```bash
# Alle Container laufen?
docker ps

# Mailversand testen
docker exec Mailserver swaks --to admin@evaki.de --from noreply@evaki.de \
  --server localhost --port 587 --auth LOGIN \
  --auth-user noreply@evaki.de --auth-password PASSWORT --tls \
  --h-Subject "EvaKI Test" --body "Mailserver funktioniert"

# DNS-Check
dig MX evaki.de +short
dig TXT evaki.de +short
dig -x SERVER-IP +short
```
