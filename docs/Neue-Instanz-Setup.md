# FreiKI/KorKI/FrankKI – Neue Instanz aufsetzen

**Stand 2026-07-05**

Diese Anleitung beschreibt, was bei einer neuen Installation (z. B. für einen weiteren Kunden) angepasst werden muss. `server.js` bzw. `src/` bleibt kundenneutral – alle instanzspezifischen Inhalte stecken in externen, gitignorten Dateien.

---

## 1. Prinzip: Was ist instanzspezifisch?

| Datei / Variable | Wo | Versioniert? |
|---|---|---|
| `docker-compose.yml` | Server | nein (gitignore) |
| `.env` | Server | nein (gitignore) |
| `freiki-ui/public/app-header.png` | Server | nein (gitignore) |
| `freiki-ui/public/app-icon-192.png` | Server | nein (gitignore) |
| `freiki-ui/public/apple-touch-icon.png` | Server | nein (gitignore) |
| `freiki-ui/public/manifest.json` | Server | wird dynamisch generiert, nicht gepflegt |
| `freiki-ui/areas.json` | Server | nein (gitignore) |
| `freiki-ui/welcome.md` | Server | nein (gitignore) |
| `freiki-ui/tips.md` | Server | nein (gitignore) |
| `freiki-ui/losung.json` / `medienspiegel.json` / `gesellschaftstrends.json` | Server | nein (gitignore, Laufzeitdaten von n8n) |
| `freiki-ui/prompts/w_*.md` | Server | nein (gitignore für `w_*`, instanzspezifische Wissensbereiche) |
| `freiki-ui/prompts/0chat.md` usw. (Basismodi) | Repo | ja – gilt für alle Instanzen |
| `freiki-ui/src/` bzw. `freiki-ui/server.js` (Code) | Repo | ja – gilt für alle Instanzen (FreiKI kanonisch, siehe [[feedback_develop_in_freiki]]) |

---

## 2. Neue Instanz einrichten

### Schritt 1: Repo klonen

Falls der Server noch keinen SSH-Zugriff auf das Repo hat, erst einen Deploy-Key anlegen:

```bash
ssh-keygen -t ed25519 -C "<instanz>-server-deploy" -f ~/.ssh/id_ed25519 -N ''
cat ~/.ssh/id_ed25519.pub
# → GitHub → FStefan1960/FreiKI → Settings → Deploy keys → Add (Read-only)
ssh-keyscan github.com >> ~/.ssh/known_hosts
```

```bash
git clone git@github.com:FStefan1960/FreiKI.git ~/freiki-package
cd ~/freiki-package
```

### Schritt 2: .env anlegen

Vorlage aus `.env.example` kopieren und befüllen:

```bash
cp .env.example .env
nano .env
```

Wichtige Variablen:

```bash
APP_NAME=NeueInstanz
APP_URL=https://neue-instanz.example.com
JWT_SECRET=<einzigartiger_zufaelliger_string_min_32_zeichen>

# LLM: bei eigener GPU → lokales vLLM; ohne GPU → externer API-Anbieter
# (FreiKI: DeepInfra/Qwen3-32B; KorKI: lokales vLLM/Qwen3-32B-AWQ; FrankKI: Mistral-API)
VLLM_URL=https://api.mistral.ai/v1      # Beispiel Mistral API
VLLM_API_KEY=<api_key>
VLLM_MODEL=mistral-medium-latest

# Embedding (ohne GPU: externer Dienst; bei lokalem vLLM: eigener Embedding-Container)
VLLM_EMBED_URL=http://vllm-embedding:8000

PG_HOST=PostgreSQL
PG_DB=freiki
PG_USER_KB=freiki_user
PG_PASS_KB=<passwort>
```

**Hinweis:** `PG_DB=freiki` (nicht `flowise` — Flowise/AnythingLLM wurden nie produktiv genutzt und sind fester Bestandteil keiner Instanz).

Weitere Infrastruktur-Variablen, je nach Instanz relevant (vollständige Liste in `.env.example`):

| Bereich | Variablen |
|---|---|
| Datenbank/Docker | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| n8n | `N8N_HOST`, `WEBHOOK_URL`, `N8N_ENCRYPTION_KEY`, `N8N_WEBHOOK_URL`, `N8N_API_KEY` |
| Mail | `MAIL_DOMAIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Mattermost (optional) | `MATTERMOST_URL`, `MATTERMOST_OIDC_CLIENT_ID`, `MATTERMOST_OIDC_CLIENT_SECRET`, `MATTERMOST_OIDC_REDIRECT_URI` |
| Paperless (optional) | `PAPERLESS_URL`, `PAPERLESS_INTERNAL_URL`, `PAPERLESS_TOKEN`, `PAPERLESS_SECRET_KEY`, `PAPERLESS_ADMIN_USER`, `PAPERLESS_ADMIN_PASSWORD` |
| GPU-Instanz | `HUGGING_FACE_HUB_TOKEN` (nur bei eigenem vLLM) |
| Sonstige APIs | `KB_INGEST_API_KEY`, `BOT_API_KEY` |

Feature-Flags für optionale Bausteine (alle standardmäßig aus, siehe `.env.example`):

| Variable | Feature |
|---|---|
| `APP_SELF_REGISTRATION` | Öffentliches Anmeldeformular (`/register.html`) mit Admin-Freischaltung |
| `APP_MANDATORY_TRAINING` | Pflichtschulung beim ersten Login (braucht eigene Folien unter `public/training/`, siehe unten) |
| `APP_USE_METACOM` | METACOM-Nutzungsfeld in der Nutzerverwaltung |
| `WEATHER_WARN_LAT` / `_LON` / `_RECIPIENTS` | Native Wetterwarnungen (DWD), siehe Schritt 8a |
| `NINA_WARN_AGS` / `_RECIPIENTS` | Native NINA-Gefahrenwarnungen, siehe Schritt 8a |
| `TAGESLOSUNG_AUDIENCE` | Zielgruppen-Text für den LLM-Gedanken der Tageslosung (leer = generisch) |

**Wichtig:** Eine neue Variable in `.env` zu setzen reicht nicht. `docker-compose.yml` hat pro Dienst eine explizite `environment:`-Allowlist (`- VAR=${VAR}`) — fehlt die Variable dort, kommt sie nie im Container an, ohne Fehlermeldung (nur eine leicht zu übersehende Compose-Warnung "variable is not set"). Bei jedem neuen Flag also **drei** Stellen pflegen: `.env`, `.env.example` (Dokumentation) und `docker-compose.yml` (Allowlist beim `freiki-ui`-Dienst).

### Schritt 3: docker-compose.yml anpassen

Ausgehend von der Vorlage im Repo – instanzspezifisch anpassen:
- `vllm`, `vllm_embedding` → nur bei eigenem GPU-Server, sonst entfernen (externer API-Anbieter reicht über `.env`)
- Mattermost → nur wenn Team-Chat gewünscht (FrankKI/BeB-KI hat keins)
- Ports falls nötig anpassen
- `portainer`, `dozzle`, `beszel` / `beszel-agent` → optional

### Schritt 4: Logos und Branding einspielen

```bash
# Logos direkt auf den Server kopieren (nicht ins Repo!)
scp logo-banner.png user@server:~/freiki-package/freiki-ui/public/app-header.png
scp logo-icon.png user@server:~/freiki-package/freiki-ui/public/app-icon-192.png
scp logo-icon.png user@server:~/freiki-package/freiki-ui/public/apple-touch-icon.png
```

Empfohlene Größen:
- `app-header.png`: 800×200 px (Banner)
- `app-icon-192.png`: 192×192 px (quadratisch)

`manifest.json`, `brand.css` und `sw.js` werden zur Laufzeit aus den `APP_*`-Variablen der `.env` bzw. der Admin-UI-Konfiguration generiert — nicht manuell anlegen.

### Schritt 5: Instanzspezifische Textdateien anlegen

```bash
# Willkommensmail-Vorlage
cp instance-template/welcome.md freiki-ui/welcome.md
# → Inhalt anpassen (App-Name, Domain, Ansprechpartner)

# Benutzerhandbuch als PDF-Anhang der Willkommensmail
# Liegt versioniert unter freiki-ui/<APP_NAME>_Benutzerhandbuch.pdf (und docs/).
# Neu erzeugen:  /opt/anaconda3/bin/python docs/create_benutzerhandbuch_pdf.py

# Tipp des Tages
cp instance-template/tips.md freiki-ui/tips.md
```

### Schritt 6: Wissensbereiche einrichten

Nur wenn Wissensbereiche gewünscht:

```bash
# areas.json anlegen (Mapping Bereich → DB-Tabelle)
cp instance-template/areas.json freiki-ui/areas.json
# → Bereiche eintragen

# Pro Bereich: Prompt-Datei
cp instance-template/prompts/w_stvo.md freiki-ui/prompts/w_neuerbereich.md
# → Frontmatter anpassen (title, welcome, hint, examples)
# → workspace: wissen setzen!

# Pro Bereich: Icon
cp freiki-ui/public/icons/w_stvo.svg freiki-ui/public/icons/w_neuerbereich.svg
# → SVG-Inhalt anpassen
```

KB-Tabelle in PostgreSQL anlegen (nach erstem Stack-Start):
```sql
CREATE TABLE kb_neuerbereich (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "pageContent" TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1024)
);
```

### Schritt 7: Caddyfile anpassen

```bash
cp caddy/Caddyfile.example caddy/Caddyfile
# → Domain(s) eintragen
```

### Schritt 8: Stack starten

```bash
docker compose up -d
bash setup/deploy.sh <git-sha-des-release-commits>
```

`deploy.sh` baut versioniert (Image-Tags nach `package.json`-Version + Git-SHA), prüft nach dem Deploy, dass der Container läuft und erreichbar ist — sicherer als ein bloßes `docker compose up -d --force-recreate freiki-ui` bei künftigen Updates.

Beim ersten Start legt die App die Tabelle `freiki_users` selbst an (`CREATE TABLE IF NOT EXISTS`, seit 2026-08 — vorher brauchte es dafür ein inzwischen entferntes Einmal-Skript). Einheitlicher Name auf allen Instanzen, kein `korki_users`.

### Schritt 8a: Native Berichts-Module (optional)

Wetterwarnungen (DWD), NINA-Gefahrenwarnungen, Tageslosung, IT-Sicherheitslage-Digest, Ressourcen-Alert, synthetischer Health-Check, Tagesbericht, vLLM-Signal-Monitor und Docker-Update-Check laufen als eingebaute Module (`freiki-ui/src/jobs/`), nicht mehr über n8n. Aktivierung ausschließlich per `.env` (siehe Feature-Flag-Tabelle oben):
- Wetterwarnungen/NINA: nur aktiv, wenn Koordinaten/AGS **und** Empfängerliste gesetzt sind
- Tageslosung/IT-Sicherheitslage/synthetischer Health-Check/Docker-Update-Check: laufen automatisch, sobald `VLLM_URL`/`VLLM_MODEL` konfiguriert sind
- vLLM-Signal-Monitor: nur aktiv, wenn `SIGNAL_PHONE` **und** `SIGNAL_APIKEY` gesetzt sind
- Synthetischer Health-Check braucht zusätzlich einen dedizierten `healthcheck`-Testnutzer (`HEALTHCHECK_PASSWORD`) und testet echten Login+RAG-Chat über den eigenen HTTP-Endpunkt
- Docker-Update-Check braucht `docker-compose.yml` lesbar im Container (siehe `docker-compose.example.yml`: Mount `./docker-compose.yml:/data/docker-compose.yml:ro` bei `freiki-ui`) sowie eine vorab angelegte leere `freiki-ui/docker-update-state.json` (Inhalt `{"digests":{}}`) auf dem Host — sonst legt Docker beim ersten Start ein Verzeichnis statt einer Datei an
- Status/manueller Trigger: `GET /api/admin/jobs`, `POST /api/admin/jobs/:name/run` (Admin-Session nötig)

### Schritt 9: Ersten Admin-User anlegen

```bash
bash setup/create-admin.sh <username> <passwort>
```

Alternativ manuell:

```bash
docker exec -it PostgreSQL psql -U freiki_user -d freiki
```

```sql
-- Hash IMMER via Node.js/bcryptjs erzeugen, nie Python (siehe Projekt-Konvention):
-- docker exec -it FreiKI node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('IhrPasswort', 10));"

INSERT INTO freiki_users (username, password_hash, role)
VALUES ('admin', '$2a$10$...', 'admin');
```

### Schritt 10: Branding in Admin-UI setzen

Nach dem ersten Login: Admin-UI → Konfiguration (`/admin/config`):
- App-Name, Tagline, Farben eintragen
- Cache-Version (`swVersion`) auf 1 setzen

---

## 3. n8n-Workflows einrichten (optional)

Für Paperless-Integration, Medienspiegel/Gesellschaftstrends-Extras (Tageslosung, Wetterwarnungen, NINA-Warnungen, IT-Sicherheitslage und der Workflow-Gesundheitscheck laufen seit 2026-08 nativ, siehe Schritt 8a — dafür kein n8n-Import mehr nötig):

Workflows per n8n-API von einer bestehenden Instanz exportieren und importieren (siehe [[feedback_n8n_sql_statt_cli]] — CLI-Import/Export war unzuverlässig, lieber über die REST-API `/api/v1/workflows`). Beim Übernehmen von einer anderen Instanz immer prüfen:
- Login-Node nutzt das richtige Service-Konto/Passwort dieser Instanz
- LLM-Aufrufe zeigen auf den richtigen Provider dieser Instanz (nicht versehentlich fremden API-Key übernehmen)
- Organisationsspezifische Prompts generisch formulieren, nicht 1:1 von einer anderen Instanz übernehmen
- Schedule-Trigger wirklich auf "täglich zu Uhrzeit X" prüfen (`field: days` + `triggerAtHour`/`triggerAtMinute`), nicht nur am Node-Namen ablesen — `field: hours` ohne `hoursInterval` läuft z. B. stündlich, nicht täglich
- `NODE_FUNCTION_ALLOW_BUILTIN` in der n8n-Umgebung muss die vom Workflow per `require()` genutzten Node-Built-ins enthalten (z. B. `https,http`), sonst blockiert n8ns Sandbox den Code-Node

Nach Anlage des n8n-API-Keys:
```bash
# In .env eintragen:
N8N_API_KEY=<key>
```

---

## 4. Checkliste neue Instanz

- [ ] Repo geklont
- [ ] `.env` vollständig befüllt (insb. `JWT_SECRET`, `APP_URL`, `PG_DB=freiki`, LLM-Credentials)
- [ ] `docker-compose.yml` instanzspezifisch angepasst
- [ ] Logos eingespielt (`app-header.png`, `app-icon-192.png`)
- [ ] `welcome.md`, `tips.md` angepasst
- [ ] Benutzerhandbuch-PDF nach `freiki-ui/<APP_NAME>_Benutzerhandbuch.pdf` kopiert (Willkommensmail-Anhang)
- [ ] `Caddyfile` mit Domain konfiguriert
- [ ] Stack gestartet: `docker compose up -d` + `bash setup/deploy.sh <git-sha>`
- [ ] Ersten Admin-User angelegt: `bash setup/create-admin.sh <user> <passwort>`
- [ ] Branding in Admin-UI gesetzt (Name, Farben, Cache-Version)
- [ ] Wissensbereiche: `areas.json` + `prompts/w_*.md` + Icons + KB-Tabellen
- [ ] Native Berichts-Module: gewünschte Feature-Flags/Empfänger in `.env` gesetzt, per `POST /api/admin/jobs/:name/run` getestet
- [ ] Paperless: Tags in Paperless anlegen, n8n-Workflows importieren und aktivieren
- [ ] Mailserver: DNS-Records prüfen, DKIM eintragen
- [ ] Backup-Script einrichten und testen (`setup/backup.sh`/`setup/restore.sh`, IONOS HiDrive — eigener SSH-Key + eigener Unterordner je Instanz, siehe [`docs/Restore-Anleitung.md`](Restore-Anleitung.md))
- [ ] Uptime Kuma konfigurieren

---

## 5. Instanz-Übersicht

| Instanz | Hoster | Domain | Modell | Status |
|---|---|---|---|---|
| FreiKI | IONOS VPS | app.freiki.com | Qwen3-32B via DeepInfra API | produktiv / Demo (modularisierter Code) |
| KorKI | IONOS VPS (GPU) | assi.diakonie-kork-ki.de | Qwen3-32B-AWQ via lokales vLLM | produktiv (Diakonie Kork) |
| FrankKI / BeB-KI | IONOS VPS | ki.fst60.de | Mistral API (mistral-medium-latest) | produktiv (BeB e.V.) |

---

*Bei Fragen: frank@frank-stefan.de*
