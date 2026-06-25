# FreiKI
FreiKi - Die souveräne Datenschutz-KI

FreiKI ist eine selbst gehostete KI-Assistenz-Plattform auf Basis von Open-Source-Komponenten. Sie dient als Referenzimplementierung und Demo-Instanz — alle Weiterentwicklungen entstehen hier zuerst und werden anschließend in abgeleitete Instanzen (z. B. KorKI) portiert.

## Architektur

```
Browser → Caddy (Reverse Proxy)
               ├── korki-ui (Node.js / Express)   ← Frontend + API-Gateway
               ├── vLLM / DeepInfra API            ← LLM-Inferenz
               ├── Flowise                          ← RAG / Wissensdatenbank
               ├── Whisper                          ← Sprachtranskription
               ├── Piper (openedai-speech)          ← TTS (Text-to-Speech)
               └── SearXNG                          ← Websuche
```

Alle Services laufen als Docker-Container via `docker compose`. Die Datenhaltung erfolgt in PostgreSQL (Flowise-DB + eigene User-Tabelle) sowie in gemounteten Volumes für Modelle und Konfiguration.

## Features

- **Chat-Interface** — PWA mit Service Worker, Offline-fähig, installierbar auf Desktop und Mobilgeräten
- **Wissens-Modi** — bereichsspezifische RAG-Assistenten über Flowise (Wissensdatenbank)
- **Werkzeuge** — Websuche (SearXNG), Sprachtranskription (Whisper), TTS (Piper/Thorsten-DE)
- **Benutzerverwaltung** — eigene PostgreSQL-Tabelle mit bcrypt + JWT; Rollen (admin / manager / default); bereichsbasierte Zugriffskontrolle
- **Admin-Panel** — CRUD für Nutzer, Passwort-Reset, Sperren, Bereichszuweisungen

## Instanz-Hierarchie

| Instanz   | Zweck | LLM-Backend | Zielgruppe |
|-----------|-------|-------------|------------|
| **FreiKI** | Referenz & Demo | Qwen3-32B via DeepInfra API | Öffentlich / Interessierte |
| **KorKI** | Produktiv / on-premise | Qwen3-32B via vLLM (lokale GPU) | Diakonie Kork (DSGVO) |
| **Frank-KI** | Persönlicher Assistent | Mistral API | Privat |

## Stack

| Komponente | Technologie |
|------------|-------------|
| Frontend | HTML/CSS/JS PWA, Service Worker |
| Backend | Node.js / Express (`server.js`) |
| Auth | bcryptjs + jsonwebtoken (JWT, 12h) |
| Datenbank | PostgreSQL (Flowise-Container) |
| LLM | vLLM (lokal) oder DeepInfra / Mistral API |
| RAG | Flowise |
| TTS | Piper / openedai-speech (Stimme: Thorsten-DE) |
| STT | Whisper |
| Proxy | Caddy |
| Orchestrierung | Docker Compose |

## Deployment

```bash
# Dateien deployen (gemountete Volumes — sofort live)
scp -r public/ prompts/ user@server:/home/user/ai-stack/korki-ui/

# Nach Änderungen an server.js — Image rebuild erforderlich
scp server.js user@server:/home/user/ai-stack/korki-ui/
ssh user@server "cd /home/user/ai-stack && docker compose build korki-ui && docker compose up -d korki-ui"
```

### Cache-Busting (PWA)

Bei jeder CSS/JS-Änderung beide Versionsnummern erhöhen:

- `sw.js` → `const CACHE_NAME = 'freiki-vN+1'`
- `index.html` → `<link href="/style.css?v=N+1">`

## Lokale Entwicklung

```bash
# Voraussetzungen: Node.js, Docker, Docker Compose

cd korki-ui
npm install
npm start   # Startet den Express-Server lokal

# Statische Assets (public/) mit korrektem Pfad voransehen:
npx serve --directory public
```

## Umgebungsvariablen

| Variable | Beschreibung |
|----------|-------------|
| `JWT_SECRET` | Secret für JWT-Signierung |
| `PG_*` | PostgreSQL-Verbindungsdaten |
| `DEEPINFRA_API_KEY` | API-Key für DeepInfra (LLM) |
| `FLOWISE_*` | Flowise-Verbindung und API-Key |

(Vollständige Liste in `.env.example`)

## Lizenz

Privates Repository — kein öffentliches Lizenzmodell.
