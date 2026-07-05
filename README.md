# FreiKI
FreiKi - Die souveräne Datenschutz-KI

FreiKI ist eine selbst gehostete KI-Assistenz-Plattform auf Basis von Open-Source-Komponenten. Sie dient als Referenzimplementierung und Demo-Instanz — alle Weiterentwicklungen entstehen hier zuerst und werden anschließend in abgeleitete Instanzen (KorKI, FrankKI/BeB-KI) portiert.

## Architektur

```
Browser → Caddy (Reverse Proxy)
               ├── freiki-ui (Node.js / Express)    ← Frontend + API-Gateway
               ├── PostgreSQL (pgvector)             ← User-DB + direktes RAG (kb_*-Tabellen)
               ├── vLLM (lokal) / DeepInfra / Mistral ← LLM-Inferenz (instanzabhängig)
               ├── n8n                               ← Automatisierung (Paperless-Sync, Monitoring, Bots)
               ├── Paperless-ngx (+Gotenberg, Tika)   ← Dokumentenarchiv
               ├── Mattermost                        ← Team-Chat (FreiKI/KorKI, nicht FrankKI)
               ├── Mailserver (docker-mailserver)     ← eigener SMTP/IMAP
               ├── Whisper                            ← Sprachtranskription
               ├── Piper (openedai-speech)            ← TTS (Text-to-Speech)
               └── SearXNG                            ← Websuche
```

Alle Services laufen als Docker-Container via `docker compose`. Die Datenhaltung erfolgt in PostgreSQL (eigene `freiki_users`-Tabelle + direkte pgvector-RAG-Tabellen `kb_*`, kein Flowise/AnythingLLM — diese Ansätze wurden verworfen) sowie in gemounteten Volumes für Modelle und Konfiguration.

## Features

- **Chat-Interface** — PWA mit Service Worker, Offline-fähig, installierbar auf Desktop und Mobilgeräten
- **Wissens-Modi** — bereichsspezifische RAG-Assistenten, direkt über pgvector (`kb_*`-Tabellen), kein externes RAG-Tool
- **Werkzeuge** — Websuche (SearXNG), Sprachtranskription (Whisper), TTS (Piper/Thorsten-DE), Excel-Chat (MCP Tool-Calling, experimentell)
- **Benutzerverwaltung** — eigene PostgreSQL-Tabelle mit bcrypt + JWT (Token gültig bis Mitternacht Europe/Berlin); Rollen (admin / manager / default); bereichsbasierte Zugriffskontrolle
- **Admin-Panel** — CRUD für Nutzer, Passwort-Reset, Sperren, Bereichszuweisungen, Branding-Konfiguration
- **Extras** — instanzspezifische Zusatzfeatures (Tageslosung, Medienspiegel, Gesellschaftstrends), über n8n täglich aktualisiert
- **Integrationen** — Paperless-ngx (Dokumentenarchiv als Wissensquelle), Mattermost (Team-Chat + Bot), n8n (Automatisierung)

## Instanz-Hierarchie

| Instanz | Zweck | LLM-Backend | Domain | Zielgruppe |
|---------|-------|-------------|--------|------------|
| **FreiKI** | Referenz & Demo | Qwen3-32B via DeepInfra API | app.freiki.com | Öffentlich / Interessierte |
| **KorKI** | Produktiv / on-premise | Qwen3-32B-AWQ via vLLM (lokale GPU) | assi.diakonie-kork-ki.de | Diakonie Kork (DSGVO) |
| **FrankKI / BeB-KI** | Persönlicher Assistent / Kunde | Mistral API (mistral-medium-latest) | ki.fst60.de | Privat / BeB e.V. |

Alle drei laufen auf IONOS VPS. Codebasis: FreiKI ist seit 2026-07-05 modularisiert (`freiki-ui/src/`, siehe unten) — KorKI und FrankKI laufen noch auf dem monolithischen `server.js`, Portierung steht aus.

## Stack

| Komponente | Technologie |
|------------|-------------|
| Frontend | HTML/CSS/JS PWA, Service Worker |
| Backend | Node.js / Express (`freiki-ui/`) |
| Auth | bcryptjs + jsonwebtoken (JWT, gültig bis Mitternacht Europe/Berlin) |
| Datenbank | PostgreSQL mit pgvector-Extension (`freiki_users`, `kb_*`-RAG-Tabellen, n8n/Paperless/Mattermost je eigene DB im selben Postgres-Server) |
| LLM | vLLM (lokal, GPU) oder DeepInfra / Mistral API, je nach Instanz |
| RAG | Direkt über pgvector — kein Flowise, kein AnythingLLM |
| TTS | Piper / openedai-speech (Stimme: Thorsten-DE) |
| STT | Whisper |
| Dokumentenarchiv | Paperless-ngx (+ Gotenberg, Tika) |
| Team-Chat | Mattermost (FreiKI, KorKI) |
| Mail | docker-mailserver (eigener SMTP/IMAP) |
| Automatisierung | n8n |
| Proxy | Caddy |
| Orchestrierung | Docker Compose |

## Code-Struktur (`freiki-ui/`)

Seit der Modularisierung (2026-07-05, bisher nur FreiKI) ist `server.js` nur noch ein Einzeiler:

```js
require('./src/infrastructure/express/app').start();
```

Die eigentliche Logik liegt in `src/`:

```
src/
├── core/               # Domänenlogik: chat, documents, excel, auth, knowledge, speech, integrations
├── infrastructure/      # Express-App, Routen, Postgres-Pool, Datei-Storage
└── shared/              # Config (Env-Variablen, Brand-Config), Utils
```

KorKI und FrankKI haben diesen Umbau noch nicht erhalten — dort ist `server.js` weiterhin der ~2500-Zeilen-Monolith.

## Deployment

```bash
# Volume-gemountete Dateien (public/, prompts/, welcome.md, tips.md, areas.json,
# losung.json, medienspiegel.json, gesellschaftstrends.json) — sofort live nach scp
scp -r freiki-ui/public/ freiki-ui/prompts/ user@server:~/freiki-package/freiki-ui/

# Nach Code-Änderungen (server.js bzw. src/) — Image-Rebuild + Recreate erforderlich
scp -r freiki-ui/server.js freiki-ui/src/ user@server:~/freiki-package/freiki-ui/
ssh user@server "cd ~/freiki-package && docker compose build freiki-ui && docker compose up -d --force-recreate freiki-ui"
```

### Cache-Busting (PWA)

Bei jeder CSS/JS-Änderung: `APP_SW_VERSION` in der `.env` der jeweiligen Instanz hochzählen (nicht mehr manuell im Code, `/sw.js` wird dynamisch anhand von Markenname + Version generiert).

## Backup & Restore

Siehe [`docs/Restore-Anleitung.md`](docs/Restore-Anleitung.md). Kurzfassung: tägliches Backup (Configs, alle Docker-Volumes, PostgreSQL-Dump) nach IONOS HiDrive, Key-basierte Authentifizierung, 7 Generationen Aufbewahrung.

```bash
# Manuell auslösen
bash ~/freiki-package/setup/backup.sh

# Wiederherstellen (interaktiv)
bash ~/freiki-package/setup/restore.sh
```

## Lokale Entwicklung

```bash
# Voraussetzungen: Node.js, Docker, Docker Compose

cd freiki-ui
npm install
node server.js   # Startet den Express-Server lokal (braucht laufendes Postgres + .env)

# Statische Assets (public/) mit korrektem Pfad voransehen:
npx serve --directory public
```
