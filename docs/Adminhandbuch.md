# FreiKI / KorKI – Administratorhandbuch

**Stand Juni 2026**

> Dieses Handbuch richtet sich an Personen mit SSH-Zugang zum Server und Admin-Zugang in der Oberfläche. Grundkenntnisse in Linux und Docker werden vorausgesetzt.

---

## Inhaltsverzeichnis

1. [Systemarchitektur](#1-systemarchitektur)
2. [Konfiguration (.env)](#2-konfiguration-env)
3. [Instanz-Branding (Admin-UI)](#3-instanz-branding-admin-ui)
4. [Benutzerverwaltung](#4-benutzerverwaltung)
5. [Modi und Prompt-Mechanik](#5-modi-und-prompt-mechanik)
6. [Wissensbereiche und Knowledge Bases](#6-wissensbereiche-und-knowledge-bases)
7. [Mailserver](#7-mailserver)
8. [Paperless – Zwei-Mailbox-Pipeline](#8-paperless--zwei-mailbox-pipeline)
9. [n8n-Workflows](#9-n8n-workflows)
10. [Monitoring (Uptime Kuma & n8n)](#10-monitoring-uptime-kuma--n8n)
11. [Deployment und Updates](#11-deployment-und-updates)
12. [Service Worker / PWA-Cache](#12-service-worker--pwa-cache)
13. [Wichtige Wartungsaufgaben](#13-wichtige-wartungsaufgaben)
14. [Fehlerbehebung](#14-fehlerbehebung)
15. [Sicherheitshinweise](#15-sicherheitshinweise)

---

## 1. Systemarchitektur

Das System besteht aus mehreren Docker-Diensten, die zusammen einen vollständig selbst gehosteten KI-Stack bilden.

```
Internet / LAN
       │
    [Caddy / Reverse Proxy]
       │
       ├── freiki-ui / korki-ui  (Node.js/Express, Port 3003 → 3000 intern)
       │       ├── Auth: freiki_users / korki_users (PostgreSQL)
       │       ├── Prompt-Dateien: /prompts/*.md
       │       ├── Wissensbereiche: areas.json → pgvector-Tabellen
       │       └── Brand-Konfiguration: app_config (PostgreSQL)
       │
       ├── vLLM  (Qwen 2.5 32B AWQ, GPU – nur KorKI)
       ├── PostgreSQL  (KB-Tabellen + Benutzer + app_config)
       ├── n8n  (Workflows: Sync, KI-Tagging, Monitoring)
       ├── Paperless-ngx  (Dokumentenarchiv)
       ├── Mailserver  (docker-mailserver)
       ├── Mattermost  (Team-Chat + Bot)
       ├── SearXNG  (Web-Suche)
       ├── Whisper  (Sprache → Text)
       └── Piper  (Text → Sprache)

Deaktiviert (Daten erhalten, Volumes bleiben):
       ├── AnythingLLM  (RAG läuft direkt über pgvector)
       └── Flowise      (nicht mehr genutzt)
```

**Instanzen:**

| Instanz | Zweck | Server | SSH |
|---|---|---|---|
| FreiKI | Mutter-Instanz + Demo | freiki.frank-stefan.de | `ssh freiki-admin@freiki` |
| KorKI | Produktiv (Diakonie Kork, GPU) | korki.diakonie-kork-ki.de | `ssh aiadmin@korki` |
| FrankKI | Privat / Mistral API | fst60.de | — (in Planung) |

**Datenbank (KorKI):**
- Host: `PostgreSQL`
- DB: `flowise`
- User: `n8n_user`
- Tabellen: `korki_users`, `app_config`, `kb_*`

**Verzeichnisstruktur auf dem Server:**
```
~/freiki-package/
├── docker-compose.yml        ← instanzspezifisch, nicht im Repo versioniert
├── .env                      ← alle Secrets, nicht im Repo
└── freiki-ui/
    ├── server.js
    ├── areas.json
    ├── welcome.md
    ├── prompts/
    │   ├── _base.md
    │   ├── 0chat.md
    │   └── w_*.md
    └── public/
        ├── index.html
        ├── style.css
        ├── app-header.png    ← instanzspezifisch, nicht im Repo
        ├── app-icon-192.png  ← instanzspezifisch, nicht im Repo
        └── icons/            ← SVG-Icons für Wissensbereiche
```

---

## 2. Konfiguration (.env)

```bash
# ── Anwendung ─────────────────────────────────────────────
APP_NAME=KorKI
APP_COLOR=#1F54C0
APP_COLOR_HOVER=#1A4AAD
APP_COLOR_ACTIVE=#173F95
APP_NAVY=#14306B
APP_TAGLINE=Ihr souveräner KI-Assistent
APP_URL=https://assi.diakonie-kork-ki.de
APP_SW_VERSION=1              # PWA-Cache-Version (bei CSS/JS-Änderungen +1)
APP_DEMO_MODE=false
APP_FOOTER_NOTE=

# ── Authentifizierung ─────────────────────────────────────
JWT_SECRET=<langer_zufälliger_string>   # min. 32 Zeichen, pro Instanz einzigartig

# ── Datenbank ─────────────────────────────────────────────
PG_HOST=PostgreSQL
PG_DB=flowise
PG_USER_KB=n8n_user
PG_PASS_KB=<passwort>

# ── KI-Modell (vLLM) ──────────────────────────────────────
VLLM_URL=http://vllm:8000
VLLM_API_KEY=<api_key>
VLLM_MODEL=Qwen/Qwen2.5-32B-Instruct-AWQ
VLLM_EMBED_URL=http://vllm-embedding:8000

# ── Kontext-Limits ────────────────────────────────────────
MAX_CONTEXT_CHARS=40000
MAX_VLLM_CHARS=20000
MAX_CONTEXT_CHARS_MULTI=90000
MAX_VLLM_CHARS_MULTI=80000

# ── Paperless ─────────────────────────────────────────────
PAPERLESS_URL=https://paperless.diakonie-kork-ki.de   # öffentliche URL für Admins
PAPERLESS_ADMIN_URL=https://paperless.diakonie-kork-ki.de
PAPERLESS_INTERNAL_URL=http://paperless:8000
PAPERLESS_TOKEN=<token>

# ── Optionale Dienste ─────────────────────────────────────
SEARXNG_URL=http://searxng:8080
WHISPER_URL=http://whisper:9000
PIPER_URL=http://piper:8000
TTS_VOICE=thorsten

# ── E-Mail ────────────────────────────────────────────────
SMTP_HOST=mailserver
SMTP_PORT=587
SMTP_USER=ki_agent@diakonie-kork-ki.de
SMTP_PASS=<passwort>
SMTP_FROM=ki_agent@diakonie-kork-ki.de
MAIL_DOMAIN=diakonie-kork-ki.de

# ── n8n ───────────────────────────────────────────────────
N8N_WEBHOOK_URL=http://n8n:5678/webhook/<id>
N8N_API_KEY=<key>

# ── Mattermost ────────────────────────────────────────────
MATTERMOST_URL=https://chat.diakonie-kork-ki.de
```

> **Sicherheit:** `.env` niemals einchecken. Dateirechte: `chmod 600 .env`.

---

## 3. Instanz-Branding (Admin-UI)

**Aufruf:** `/users` → Admin-Menü → Konfiguration (nur mit Admin-Zugang)

Branding-Einstellungen sind sofort aktiv ohne Neustart.

| Feld | Beschreibung |
|---|---|
| **App-Name** | Anzeigename in Header, Manifest, E-Mails |
| **Tagline** | Zeile unter dem Logo |
| **Primärfarbe** | Buttons, Links, Akzente |
| **Cache-Version** | Bei CSS/JS-Änderungen +1 setzen → zwingt Browser-Cache-Aktualisierung |
| **Mattermost-URL** | Link zum Team-Chat |
| **Paperless-URL** | Öffentliche URL für Paperless-Dokumentenlinks |

**Logos** sind instanzspezifisch und werden **nicht** im Git-Repo verwaltet:
- `public/app-header.png` — Banner-Logo (800×200 px empfohlen)
- `public/app-icon-192.png` — App-Icon (quadratisch, 192×192 px)

Diese Dateien werden bei `git pull` nicht überschrieben (in `.gitignore`).

> **Wichtig:** Nach Farb- oder Logo-Änderungen die Cache-Version um 1 erhöhen, damit PWA-Nutzer die Änderungen sofort sehen.

---

## 4. Benutzerverwaltung

### 4.1 Rollen

| Rolle | Rechte |
|---|---|
| **admin** | Vollzugriff: alle Modi, alle Bereiche, Benutzerverwaltung, Admin-Konfiguration |
| **manager** | Wie `default` + bestimmte Wissensbereiche verwalten |
| **default** | Nur zugewiesene Wissensbereiche; alle Werkzeuge immer verfügbar |

### 4.2 Benutzer anlegen

1. Als Admin anmelden → **Benutzerverwaltung** aufrufen
2. **Neuer Nutzer** → Felder ausfüllen:
   - **Benutzername** (Pflicht, eindeutig)
   - **Rolle** (default / manager / admin)
   - **Wissensbereiche** (use_areas): sichtbare Bereiche
   - **Paperless-Zugriff**: Checkbox – Archiv durchsuchen erlaubt
   - **E-Mail**: Bei leerem Passwort → automatische Willkommensmail mit generiertem Passwort

**Passwort-Logik:**
- Kein Passwort + E-Mail → Zufallspasswort per Mail
- Passwort angegeben → dieses wird verwendet (min. 6 Zeichen)

### 4.3 Sichtbarkeitslogik

```
Rolle = admin         → ALLE Wissensbereiche + alle Werkzeuge + Paperless
Rolle = default
  use_areas leer      → alle Wissensbereiche sichtbar
  use_areas gefüllt   → nur eingetragene Bereiche sichtbar
  use_paperless       → Paperless-Archivsuche sichtbar (unabhängig von use_areas)
```

Werkzeuge (Chat, Übersetzen, Zusammenfassen …) sind immer für alle sichtbar.

### 4.4 Datenbankschema (freiki_users / korki_users)

```sql
CREATE TABLE korki_users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'default',
  first_name    TEXT DEFAULT '',
  last_name     TEXT DEFAULT '',
  funktion      TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  use_areas     TEXT[] DEFAULT '{}',
  manage_areas  TEXT[] DEFAULT '{}',
  use_paperless BOOLEAN DEFAULT FALSE,
  suspended     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

Wird beim ersten Start automatisch angelegt.

---

## 5. Modi und Prompt-Mechanik

### 5.1 Wie Modi entstehen

Jede Datei in `prompts/` (außer `_base.md`) erzeugt einen Modus. Der Dateiname (ohne `.md`) wird zum Modus-Schlüssel.

**Nach Änderungen an Prompt-Dateien:** Container recreaten.

```bash
docker compose up -d --force-recreate freiki-ui
```

### 5.2 Frontmatter-Felder

```markdown
---
icon: 🚦
title: Verkehrsregeln (StVO)
desc: Fragen zu Verkehrsregeln und Paragraphen
welcome: Stellen Sie Ihre Frage zur StVO.
hint: 💡 Fragen Sie z. B. nach Paragraphen oder Bußgeldern.
examples: Was kostet Fahren ohne Gurt? | Wann darf ich überholen? | Was bedeutet Zeichen 206?
workspace: wissen
websearch: false
multifile: false
hidden: false
paperless: false
---
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `icon` | Emoji oder SVG-Pfad | Icon im Menü. Für `w_*`-Modi: `/icons/<key>.svg` wird automatisch geladen |
| `title` | Text | Anzeigename im Menü |
| `desc` | Text | Kurzbeschreibung |
| `welcome` | Text/HTML | Willkommenstext im leeren Chat-Fenster |
| `hint` | Text | Hinweistext unter dem Willkommenstext |
| `examples` | Pipe-getrennte Texte | Bis zu 4 Beispiel-Chips im Willkommens-Screen (nur zur Anzeige, keine Funktion) |
| `workspace` | `wissen` / leer | `wissen` → pgvector-RAG; leer → direktes LLM |
| `websearch` | `true` / `false` | Web-Suche via SearXNG |
| `multifile` | `true` / `false` | Mehrfachdokument-Modus |
| `hidden` | `true` / `false` | Modus unsichtbar im Menü |
| `paperless` | `true` / `false` | Nur für Nutzer mit Paperless-Recht |

### 5.3 Routing-Logik

```
workspace = "wissen"  → pgvector-RAG (areas.json → KB-Tabelle)
workspace leer        → direktes LLM (kein RAG)
paperless = true      → Paperless-Suchmodus
websearch = true      → SearXNG-Suche vor LLM-Anfrage
```

### 5.4 _base.md – globaler Basiskontext

`prompts/_base.md` wird vor jeden Modus-Prompt vorangestellt. Hier stehen globale Regeln (Sprache, Verhalten, Grundton).

### 5.5 Icons für Wissensbereiche

Für jeden `w_*`-Modus wird `/public/icons/<key>.svg` als Icon geladen.

Beispiel: `w_stvo.md` → `/public/icons/w_stvo.svg`

SVG-Vorlage:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <text x="12" y="18" font-family="Georgia, serif" font-size="20"
    font-weight="bold" text-anchor="middle" fill="currentColor">§</text>
</svg>
```

`fill="currentColor"` sorgt dafür, dass das Icon die Menüfarbe übernimmt.

---

## 6. Wissensbereiche und Knowledge Bases

### 6.1 areas.json

Verknüpft Modus-Schlüssel mit pgvector-Tabellen:

```json
{
  "stvo": {
    "table": "kb_stvo",
    "label": "Verkehrsregeln (StVO)"
  },
  "kita": {
    "table": "kb_kita",
    "label": "Kita-Recht"
  }
}
```

Der Schlüssel entspricht dem Modus-Key ohne `w_`-Präfix.

### 6.2 KB-Tabellenschema

```sql
CREATE TABLE kb_<name> (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  "pageContent" TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  embedding   vector(1024)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_<name> TO n8n_user;
```

**Wichtig:** `"pageContent"` muss in Anführungszeichen stehen (Groß-/Kleinschreibung!).

### 6.3 Neuen Wissensbereich anlegen

```bash
# 1. KB-Tabelle erstellen
docker exec -it PostgreSQL psql -U n8n_user -d flowise -c "
CREATE TABLE kb_neuerbereich (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  \"pageContent\" TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1024)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_neuerbereich TO n8n_user;
"
```

2. `areas.json` um den neuen Bereich ergänzen
3. `prompts/w_neuerbereich.md` anlegen (mit `workspace: wissen`)
4. `public/icons/w_neuerbereich.svg` erstellen
5. Container recreaten: `docker compose up -d --force-recreate freiki-ui`
6. Dokumente hochladen via `/kb-upload` (Admin/Manager-Login)

### 6.4 Dokumente hochladen (API)

```bash
curl -X POST https://assi.diakonie-kork-ki.de/api/kb-upload \
  -H "Authorization: Bearer <admin-jwt>" \
  -F "file=@dokument.pdf" \
  -F "area=neuerbereich" \
  -F "clear=false"
```

`clear=true` leert die Tabelle vor dem Upload.

---

## 7. Mailserver

### 7.1 Mailkonten (KorKI)

| Adresse | Zweck |
|---|---|
| `ki_agent@diakonie-kork-ki.de` | Ausgehender SMTP (Willkommensmails, Benachrichtigungen) |
| `wissen@diakonie-kork-ki.de` | Dokumente → Wissensbereich (RAG) |
| `archiv@diakonie-kork-ki.de` | Dokumente → Archiv (nur KI-Tagging) |
| `fstefan@diakonie-kork-ki.de` | Administrator |

### 7.2 DNS-Records (KorKI)

| Typ | Name | Wert |
|---|---|---|
| A | `mail` | `158.181.52.40` |
| MX | `@` | `[10] mail.diakonie-kork-ki.de` |
| TXT | `@` | `v=spf1 mx -all` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:frank@frank-stefan.de` |
| TXT | `mail._domainkey` | DKIM-Public-Key |

### 7.3 Firewall-Ports

```bash
sudo ufw allow 25/tcp    # SMTP eingehend
sudo ufw allow 143/tcp   # IMAP
sudo ufw allow 587/tcp   # Submission (STARTTLS)
sudo ufw allow 993/tcp   # IMAPS
```

### 7.4 TLS-Zertifikate

Der Mailserver teilt die Zertifikate mit Caddy:

```yaml
SSL_TYPE=manual
SSL_CERT_PATH=/caddy-certs/.../mail.diakonie-kork-ki.de.crt
SSL_KEY_PATH=/caddy-certs/.../mail.diakonie-kork-ki.de.key
```

Nach Zertifikatserneuerung: `docker compose restart mailserver`

### 7.5 Passwort eines Mailkontos ändern

```bash
docker exec -it Mailserver setup email update wissen@diakonie-kork-ki.de neuespasswort
```

### 7.6 DKIM-Key anzeigen

```bash
docker exec -it Mailserver setup config dkim
cat ~/freiki-package/docker-data/dms/config/opendkim/keys/<domain>/mail.txt
```

---

## 8. Paperless – Zwei-Mailbox-Pipeline

```
wissen@...
        ↓
Paperless → Tag "ready-for-rag"
        ↓
n8n (alle 15 Min) → Embedding → KB-Tabelle → Tag entfernt
        ↓
Wissensbereich durchsuchbar

archiv@...
        ↓
Paperless → Tag "not-yet-tagged"
        ↓
n8n (alle 2 h) → KI-Tagging → Bereichs-Tags → Tag entfernt
        ↓
Dokument archiviert + getaggt (nicht im RAG)
```

### 8.1 Absender → Bereich (filter_from)

| Absender | Bereich | Tag |
|---|---|---|
| `hmaelger@diakonie-kork.de` | HLW | `hlw` |
| `pkraus@diakonie-kork.de` | Wohnverbund | `wv` |
| `tschwendemann@diakonie-kork.de` | Bildungsraum | `br` |
| `frank@frank-stefan.de` | Allgemein | `allgemein` |

**Neue Regel:** Paperless → Einstellungen → E-Mail-Regeln → Konto „Archiv" → Filter (Von) → Tag zuweisen. Die `not-yet-tagged`-Regel bleibt als Fallback.

### 8.2 Paperless-Zugang

Paperless ist **nicht öffentlich** erreichbar. Zugang für Admins via Tailscale oder direkt im Docker-Netzwerk.

Nutzer mit `use_paperless = true` können das Archiv über den „Archiv durchsuchen"-Modus in der App abfragen.

> **Wichtig:** `markSeen` in n8n-IMAP-Knoten niemals auf `true` setzen – das markiert alle Mails im Postfach als gelesen.

---

## 9. n8n-Workflows

### Aktive Workflows (KorKI)

| Workflow | Trigger | Funktion |
|---|---|---|
| Paperless → KorKI Sync | alle 15 Min | `ready-for-rag` → Embeddings → KB-Tabelle |
| Paperless KI-Tagging | alle 2 h | `not-yet-tagged` → KI-Tags → Paperless |
| Paperless Tags synchronisieren | täglich | Bereichs-Tags in Paperless aktuell halten |
| KorKI Tagesbericht | täglich 07:00 | Dienststatus → Mattermost #monitoring |
| KorKI Monitoring | alle 30 Min | Disk/RAM-Warnung → Mattermost |
| KorKI @mention Handler | Webhook | Mattermost-Erwähnungen → KI-Antwort |
| Mattermost KorKI Bot | Webhook | /korki-Befehle |
| KorKI Abwesenheitsassistent | inaktiv | — |
| KorKI Wetterwarnungen | Trigger | DWD-Warnungen → Mattermost |
| KorKI NINA-Warnungen | Trigger | Katastrophenschutz → Mattermost |
| KorKI Docker Update Check | Trigger | neue Docker-Images → Mattermost |

### Workflow importieren

```bash
docker exec -it n8n n8n import:workflow --input=/home/node/.n8n/workflows/datei.json
```

---

## 10. Monitoring (Uptime Kuma & n8n)

| Monitor | URL |
|---|---|
| KorKI-UI | `https://assi.diakonie-kork-ki.de` |
| Mattermost | `https://chat.diakonie-kork-ki.de` |
| n8n | `http://n8n:5678/healthz` (intern!) |
| Paperless | `http://Paperless:8000` (intern!) |
| Mailserver | SMTP-Port-Check auf `mailserver:587` |

Mailbenachrichtigungen via `ki_agent@...` (SMTP: `mailserver:587`, STARTTLS).

---

## 11. Deployment und Updates

### 11.1 Git-Workflow

Das Repo liegt auf GitHub: `github.com/FStefan1960/FreiKI`

**FreiKI** hat Write-Zugriff und kann direkt pushen.
**KorKI** hat Read-only Deploy Key → nur pullen.

**Änderungsfluss:**
```
Lokal (Mac) oder FreiKI-Server
        ↓ git commit + push
    GitHub
        ↓ git pull
    KorKI / weitere Instanzen
```

**Wichtige Regel:** Vor jedem `git pull` auf einem Server prüfen ob lokale Änderungen vorhanden sind (`git status`). Instanzspezifische Dateien (docker-compose.yml, .env, Logos) niemals blind überschreiben.

### 11.2 Was braucht recreate, was nicht?

| Dateityp | Aktion |
|---|---|
| `server.js`, `prompts/*.md` | `docker compose up -d --force-recreate freiki-ui` |
| `public/` (HTML, CSS, Icons) | `docker compose up -d --force-recreate freiki-ui` |
| `extras/*.json`, `areas.json` | sofort aktiv, kein Neustart |

### 11.3 Deploy-Befehle

```bash
# Auf dem Server: aktuellen Stand holen und deployen
cd ~/freiki-package
git pull origin main
docker compose up -d --force-recreate freiki-ui

# Von FreiKI aus pushen (hat Write-Zugriff):
git add <dateien> && git commit -m "Beschreibung" && git push

# Container-Status prüfen
docker compose ps
docker logs freiki-ui --tail 50
```

### 11.4 Port-Übersicht (KorKI)

| Dienst | Host-Port | Öffentlich |
|---|---|---|
| korki-ui | 3003 | ja (via Caddy) |
| vLLM | 8000 | nein |
| PostgreSQL | 5432 | nein |
| n8n | 5678 | nein (Webhooks via Caddy) |
| Paperless | 3005 | nein (nur Tailscale) |
| Mattermost | 8065 | ja (via Caddy) |
| Mailserver SMTP | 25, 587 | ja |
| Mailserver IMAP | 143, 993 | ja |

---

## 12. Service Worker / PWA-Cache

Cache-Name: `<app-name-lowercase>-v<swVersion>` (Beispiel: `korki-v3`)

**Wann Cache-Version erhöhen:**
- Farb- oder Logo-Änderungen
- Neue `style.css` oder geänderte `index.html`

**So aktualisieren:** Admin-UI → Konfiguration → Cache-Version +1 → Speichern.

Der Service Worker löscht automatisch den alten Cache beim nächsten Seitenaufruf.

API-Routen (`/api/*`) werden nie gecacht.

---

## 13. Wichtige Wartungsaufgaben

### Backup & Restore

Backups laufen täglich:
- KorKI: 02:00 Uhr → `fst60-de:/home/frank/korki-backups/` (14 Tage)
- FreiKI: 03:00 Uhr → `fst60-de:/home/frank/freiki-backups/` (14 Tage)

```bash
# Manuelles Backup
bash ~/freiki-package/setup/backup.sh

# Backup-Liste ansehen
ssh frank@fst60-de "ls -lh ~/korki-backups/"

# Restore (interaktiv)
bash ~/freiki-package/setup/restore.sh
```

Ausführliche Anleitung: **Restore-Anleitung.md**

### Logs überwachen

```bash
docker logs -f freiki-ui
docker logs freiki-ui --tail 100
```

### Datenbankgröße prüfen

```bash
docker exec -it PostgreSQL psql -U n8n_user -d flowise -c "
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;"
```

### KB-Tabelle leeren

```sql
TRUNCATE TABLE kb_stvo RESTART IDENTITY;
```

### Nutzer-Passwort (Notfall, direkt in DB)

```bash
# Hash erzeugen
docker run --rm python:3 python3 -c \
  "import bcrypt; print(bcrypt.hashpw(b'NeuesPasswort', bcrypt.gensalt(10)).decode())"

# In DB eintragen
docker exec -it PostgreSQL psql -U n8n_user -d flowise -c \
  "UPDATE korki_users SET password_hash='\$2b\$10\$...' WHERE username='frank';"
```

---

## 14. Fehlerbehebung

### Nutzer sieht falsche Wissensbereiche

Veralteter JWT. Nutzer muss sich ausloggen und neu einloggen.

```bash
curl -s http://localhost:3003/api/modes \
  -H "Authorization: Bearer <token>" | jq '[.[] | .key]'
```

### Browser zeigt veraltete Farben / Logo

Cache-Version in Admin-UI erhöhen. Nutzer: Browser-Cache leeren (Strg+Shift+R).

### Wissensbereich antwortet nicht

```sql
-- Einträge prüfen
SELECT COUNT(*) FROM kb_stvo;
SELECT "pageContent"[1:50], metadata FROM kb_stvo LIMIT 3;
```

1. Ist die Tabelle in `areas.json` eingetragen?
2. Hat die Tabelle das richtige Schema (`"pageContent"`, nicht `content`)?
3. Sind vLLM und Embedding-Dienst erreichbar?

### Login schlägt fehl

```bash
# .env prüfen
grep JWT_SECRET ~/freiki-package/.env
grep PG_PASS_KB ~/freiki-package/.env

# Nutzer prüfen
docker exec -it PostgreSQL psql -U n8n_user -d flowise -c \
  "SELECT username, role, suspended FROM korki_users WHERE username = 'frank';"
```

### `<think>`-Tags in Antworten

In `server.js` in allen vLLM-Anfragen prüfen:
```javascript
chat_template_kwargs: { enable_thinking: false }
```

---

## 15. Sicherheitshinweise

- **`JWT_SECRET`** muss kryptographisch zufällig sein (≥ 32 Zeichen), pro Instanz einzigartig, niemals ins Repo.
- Passwörter werden mit **bcrypt (10 Runden)** gehasht.
- JWT-Token laufen nach **12 Stunden** ab.
- Das eigene Admin-Konto kann weder gesperrt noch gelöscht werden.
- **IMAP in n8n:** `markSeen` niemals auf `true` setzen.
- Alle `/api/*`-Antworten für authentifizierte Endpunkte: `Cache-Control: no-store`.

### fail2ban (KorKI)

| Jail | Log | maxretry | findtime | bantime |
|---|---|---|---|---|
| `korki-app` | `/var/log/caddy/app-access.log` | 10 | 5 min | 30 min |
| `korki-chat` | `/var/log/caddy/chat-access.log` | 5 | 5 min | 1 h |
| `recidive` | fail2ban-Log | 5 Bans | 24 h | 7 Tage |

```bash
sudo fail2ban-client status
sudo fail2ban-client status korki-app
sudo fail2ban-client set korki-app unbanip <IP>
```

**SSH:** UFW blockt SSH von außen.
**Mailserver:** docker-mailserver hat eigenen Fail2Ban (`ENABLE_FAIL2BAN=1`).

---

*Stand: Juni 2026 – FreiKI/KorKI mit pgvector-RAG, eigenem Mailserver, Mattermost, Paperless, n8n-Monitoring.*
