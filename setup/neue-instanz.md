# Neue FreiKI-Instanz einrichten

## 1 · Server vorbereiten

```bash
# SSH-Key für GitHub generieren
ssh-keygen -t ed25519 -C "<instanz>-server-deploy" -f ~/.ssh/id_ed25519 -N ''
cat ~/.ssh/id_ed25519.pub
# → GitHub → FStefan1960/FreiKI → Settings → Deploy keys → Add (Read-only)

# GitHub als known host eintragen
ssh-keyscan github.com >> ~/.ssh/known_hosts

# Repo klonen
git clone git@github.com:FStefan1960/FreiKI.git ~/freiki-package
cd ~/freiki-package
```

---

## 2 · .env ausfüllen

```bash
cp .env.example .env
nano .env
```

### Pflichtfelder

| Variable | Bedeutung | Beispiel |
|---|---|---|
| `APP_NAME` | Name der Instanz | `KorKI` |
| `APP_TAGLINE` | Slogan unter dem Logo | `KI für die Diakonie Kork` |
| `APP_URL` | Öffentliche URL der App | `https://assi.diakonie-kork-ki.de` |
| `APP_COLOR` | Hauptfarbe (Hex) | `#1F54C0` |
| `APP_COLOR_HOVER` | Hover-Farbe | `#1A4AAD` |
| `APP_COLOR_ACTIVE` | Aktiv-Farbe | `#173F95` |
| `APP_NAVY` | Dunkle Akzentfarbe | `#14306B` |
| `APP_LOGO` | Pfad Logo Header | `/header.png` |
| `APP_LOGO_SIDEBAR` | Pfad Logo Sidebar | `/header.png` |
| `APP_FOOTER_NOTE` | Fußzeilen-Text | `F. Stefan · Diakonie Kork · 2026` |
| `APP_DEMO_MODE` | Demo-Hinweis zeigen? | `false` |
| `KORKI_JWT_SECRET` | JWT-Geheimnis (zufällig) | `openssl rand -hex 32` |
| `KB_INGEST_API_KEY` | API-Key für KB-Ingest | `openssl rand -hex 20` |
| `BOT_API_KEY` | API-Key für Bot | `openssl rand -hex 20` |

### LLM-Backend

| Variable | Bedeutung |
|---|---|
| `VLLM_URL` | OpenAI-kompatibler Endpunkt |
| `VLLM_API_KEY` | API-Key des Providers |
| `VLLM_MODEL` | Modellname |
| `VLLM_EMBED_URL` | Embedding-Endpunkt |
| `WHISPER_MODEL` | `tiny` / `base` / `large-v3` |

### Datenbank & Automatisierung

| Variable | Bedeutung |
|---|---|
| `POSTGRES_USER` | DB-Benutzername |
| `POSTGRES_PASSWORD` | DB-Passwort |
| `POSTGRES_DB` | DB-Name |
| `N8N_HOST` | n8n-Hostname |
| `WEBHOOK_URL` | n8n Webhook-Basis-URL |
| `N8N_ENCRYPTION_KEY` | n8n Verschlüsselungskey |
| `N8N_WEBHOOK_URL` | Webhook-URL für KI-Assistent |

### Mail

| Variable | Bedeutung |
|---|---|
| `MAIL_DOMAIN` | Domain des Mailservers |
| `SMTP_HOST` | SMTP-Server |
| `SMTP_PORT` | Port (587 / 465) |
| `SMTP_USER` | SMTP-Benutzername |
| `SMTP_PASS` | SMTP-Passwort |
| `SMTP_FROM` | Absenderadresse |

### Optionale Dienste

| Variable | Bedeutung |
|---|---|
| `MATTERMOST_URL` | Öffentliche Mattermost-URL |
| `MATTERMOST_OIDC_CLIENT_ID` | SSO Client-ID |
| `MATTERMOST_OIDC_CLIENT_SECRET` | SSO Client-Secret |
| `MATTERMOST_OIDC_REDIRECT_URI` | SSO Redirect-URI |
| `PAPERLESS_URL` | Öffentliche Paperless-URL |
| `PAPERLESS_INTERNAL_URL` | Interne Paperless-URL |
| `PAPERLESS_TOKEN` | Paperless API-Token |
| `PAPERLESS_SECRET_KEY` | Paperless Secret |
| `PAPERLESS_ADMIN_USER` | Paperless Admin |
| `PAPERLESS_ADMIN_PASSWORD` | Paperless Passwort |
| `HUGGING_FACE_HUB_TOKEN` | Nur bei GPU-Instanz mit vLLM |

---

## 3 · Instanz-spezifische Dateien

Aus `instance-template/` kopieren und anpassen:

```bash
cp -r instance-template/public/. freiki-ui/public/
cp instance-template/areas.json freiki-ui/areas.json
cp instance-template/welcome.md freiki-ui/welcome.md
cp instance-template/tips.md freiki-ui/tips.md
cp -r instance-template/prompts/. freiki-ui/prompts/
```

### Checkliste

- [ ] `freiki-ui/public/header.png` — Logo für Header und Login (ersetzt FreiKI-Standard)
- [ ] `freiki-ui/public/apple-touch-icon.png` — PWA-Icon fürs Handy
- [ ] `freiki-ui/public/favicon-32.png` — Browser-Tab-Icon
- [ ] `freiki-ui/public/icons/icon-192.png` — PWA-Icon 192px
- [ ] `freiki-ui/public/icons/icon-512.png` — PWA-Icon 512px
- [ ] `freiki-ui/public/manifest.json` — App-Name, Farbe, Icon-Pfade anpassen
- [ ] `freiki-ui/public/extras/` — Instanz-spezifische Extras hinzufügen/entfernen
- [ ] `freiki-ui/areas.json` — Wissenskategorien konfigurieren
- [ ] `freiki-ui/welcome.md` — Willkommenstext anpassen
- [ ] `freiki-ui/tips.md` — Tipps anpassen
- [ ] `freiki-ui/prompts/w_*.md` — Wissen-Prompts hinzufügen

---

## 4 · Caddy & Docker konfigurieren

```bash
nano caddy/Caddyfile   # Domains anpassen
nano docker-compose.yml
```

- [ ] Alle Domains in `caddy/Caddyfile` auf neue Instanz gesetzt
- [ ] `docker-compose.yml`: Volume-Namen mit `name:` explizit gesetzt
- [ ] `docker-compose.yml`: Netzwerke als `external: true` (wenn bestehend)

---

## 5 · Starten & deployen

```bash
# Datenbank-Schema einrichten (einmalig)
docker compose up -d postgres
sleep 10
docker exec -i PostgreSQL psql -U $POSTGRES_USER -d $POSTGRES_DB < setup/schema.sql

# Alle Dienste starten
docker compose up -d

# Erstes Deploy (schreibt VERSION-Datei)
bash setup/deploy.sh
```

---

## 6 · Nach dem Start

- [ ] Admin-User anlegen: `bash setup/create-admin.sh`
- [ ] DNS-Einträge prüfen (A-Records zeigen auf Server)
- [ ] DKIM einrichten: `docker exec Mailserver setup config dkim ...`
- [ ] n8n-Workflows importieren: `setup/n8n-workflows-export.json`
- [ ] Versionsnummer in der Fußzeile sichtbar ✓
