# Neue Instanz aus GitHub aufsetzen

Diese Anleitung beschreibt, wie aus dem FreiKI-Repository eine neue, eigenständige Instanz (z.B. „EvaKI") aufgesetzt wird. Ausgangspunkt ist ein laufendes Ubuntu-System.

---

## 1. Servervorbereitung

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
sudo apt install -y git curl openssl ufw
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

Deployment-User anlegen:

```bash
sudo adduser evaki-admin
sudo usermod -aG docker,sudo evaki-admin
su - evaki-admin
```

---

## 2. Repository klonen

```bash
git clone git@github.com:FStefan1960/FreiKI.git evaki-package
cd evaki-package
```

> SSH-Key des Servers vorher bei GitHub hinterlegen (Settings → SSH and GPG keys).

---

## 3. .env anlegen und anpassen

```bash
cp .env.example .env
nano .env
```

Folgende Felder **zwingend** anpassen:

| Variable | Hinweis |
|----------|---------|
| `POSTGRES_USER` | z.B. `evaki_user` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `POSTGRES_DB` | z.B. `evaki` |
| `N8N_HOST` | `n8n.evaki.de` |
| `WEBHOOK_URL` | `https://n8n.evaki.de/` |
| `N8N_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `VLLM_URL` | API-Endpunkt (z.B. DeepInfra) |
| `VLLM_API_KEY` | API-Key für neuen Mandanten |
| `VLLM_MODEL` | z.B. `Qwen/Qwen3-32B` |
| `APP_URL` | `https://app.evaki.de` |
| `KORKI_JWT_SECRET` | `openssl rand -hex 32` |
| `KB_INGEST_API_KEY` | `openssl rand -hex 32` |
| `MATTERMOST_URL` | `https://chat.evaki.de` |
| `PAPERLESS_URL` | `https://paperless.evaki.de` |
| `PAPERLESS_SECRET_KEY` | `openssl rand -hex 32` |
| `PAPERLESS_ADMIN_PASSWORD` | neu generieren |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | nach Mailserver-Einrichtung (Schritt 9) |

Secrets schnell generieren:
```bash
openssl rand -hex 32
```

---

## 4. Branding (White-Label)

In `.env` die App-Variablen auf die neue Instanz anpassen:

```env
APP_NAME=EvaKI
APP_COLOR=#IHRE_FARBE
APP_COLOR_HOVER=#DUNKLERE
APP_COLOR_ACTIVE=#NOCH_DUNKLER
APP_NAVY=#IHRE_DUNKELFARBE
APP_TAGLINE=Ihr KI-Assistent
APP_LOGO=/icons/evaki-logo.svg
APP_LOGO_SIDEBAR=/icons/evaki-mark.svg
APP_SW_VERSION=1
APP_DEMO_MODE=false
APP_FOOTER_NOTE=
```

Logos als SVG nach `freiki-ui/public/icons/` kopieren.

### Caddyfile anpassen

```bash
sed -i 's/freiki\.com/evaki.de/g' caddy/Caddyfile
```

### Wissensbereiche anpassen

```bash
nano freiki-ui/areas.json
# Bereiche umbenennen, Icons zuweisen
# Prompts in freiki-ui/prompts/ anpassen (w_freiki.md → für neue Instanz)
```

---

## 5. DNS einrichten

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

Reverse DNS (PTR) im Hoster-Panel: `SERVER-IP → mail.evaki.de`

---

## 6. Stack starten

```bash
docker compose up -d
docker compose logs -f
```

Beim ersten Start lädt Docker alle Images automatisch herunter, inkl. Piper-TTS (`ghcr.io/matatonic/openedai-speech-min`). Das kann einige Minuten dauern.

Danach das freiki-ui Image bauen (enthält server.js):

```bash
docker compose build freiki-ui
docker compose up -d freiki-ui
```

---

## 7. Piper-Stimme einrichten

Die Stimmdatei ist nicht im Repo enthalten und muss manuell heruntergeladen werden:

```bash
mkdir -p piper/voices

# Deutsche Stimme Thorsten (ca. 65 MB)
wget -O piper/voices/de_DE-thorsten-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx

wget -O piper/voices/de_DE-thorsten-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx.json

# Piper neu starten damit er die Stimme erkennt
docker compose restart piper
```

---

## 8. Ersten Admin-User anlegen

```bash
bash setup/create-admin.sh
```

---

## 9. Mailserver einrichten

```bash
# DKIM-Key generieren
docker exec Mailserver setup config dkim

# Key für DNS auslesen → TXT-Eintrag mail._domainkey anlegen
docker exec Mailserver cat /tmp/docker-mailserver/opendkim/keys/evaki.de/mail.txt

# Mailkonten anlegen
for ACCOUNT in noreply paperless n8n info admin postmaster; do
    PASS=$(openssl rand -base64 20)
    docker exec Mailserver setup email add ${ACCOUNT}@evaki.de "$PASS"
    echo "${ACCOUNT}@evaki.de: $PASS"
done >> ~/mail-accounts.txt
chmod 600 ~/mail-accounts.txt

# SMTP_PASS in .env auf noreply-Passwort setzen, dann neu starten:
docker compose up -d freiki-ui
```

Port 25 beim Hoster freischalten lassen (Voraussetzung: PTR, SPF, FQDN gesetzt).

---

## 10. Paperless IMAP-Verbindung konfigurieren

In Paperless unter **Einstellungen → E-Mail** → neues Konto:

| Feld | Wert |
|------|------|
| IMAP-Server | `Mailserver` (interner Container-Name) |
| IMAP-Port | `143` |
| Benutzername | `paperless@evaki.de` |
| Passwort | aus `mail-accounts.txt` |
| Sicherheit | STARTTLS |
| Nach Verarbeitung | **In Papierkorb verschieben** (niemals „Als gelesen markieren") |

---

## 11. Backup-Cronjob einrichten

```bash
# backup.sh anpassen: REMOTE_DIR, Pfade
cp setup/backup.sh ~/backup.sh
nano ~/backup.sh
chmod +x ~/backup.sh

# SSH-Key für Backup-Transfer
ssh-keygen -t ed25519 -f ~/.ssh/backup_key -N ""
cat ~/.ssh/backup_key.pub
# → Public Key auf Backup-Server in authorized_keys eintragen

crontab -e
# 0 3 * * * /home/evaki-admin/backup.sh >> /home/evaki-admin/backup.log 2>&1
```

---

## 12. Abschlusskontrolle

```bash
docker ps   # Alle Container running?

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

---

## Updates einspielen

```bash
cd evaki-package
git pull
docker compose build freiki-ui
docker compose up -d
```
