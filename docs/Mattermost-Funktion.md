# Mattermost-Integration bei FreiKI

## Was ist hinzugekommen?

FreiKI hat einen eigenständigen Team-Chat bekommen: **Mattermost** (Open Source, self-hosted), erreichbar unter **https://chat.freiki.com**. Damit lässt sich FreiKI von einem reinen Browser-Tool zu einer Plattform erweitern, auf der Team-Kommunikation und KI-Unterstützung zusammenlaufen.

## Architektur

- **Container:** `mattermost/mattermost-team-edition:9.11`, läuft im bestehenden Docker-Stack
- **Datenbank:** nutzt die vorhandene PostgreSQL-Instanz (eigene Datenbank `mattermost`, kein separater DB-Server)
- **Reverse Proxy:** Caddy, automatisches TLS-Zertifikat für `chat.freiki.com`
- **Konfiguration:** ausschließlich über Umgebungsvariablen in der `.env` – nichts ist im Docker-Image fest codiert (wichtig für die Rückportierung, siehe unten)

## Single Sign-On (ein Account für FreiKI + Mattermost)

Mattermost **Team Edition** (kostenlose Version) unterstützt kein generisches OpenID Connect – das ist eine Enterprise-Funktion. Gelöst wurde das über einen Workaround: Mattermosts **GitLab-Login-Slot** ist technisch nur ein generischer OAuth2-Client mit frei konfigurierbaren Endpoints (Auth/Token/User-API). FreiKI wurde um einen kleinen OAuth2/OIDC-Provider erweitert, der sich als "GitLab" ausgibt:

- `GET/POST /oauth/authorize` – eigene Login-Seite, prüft Zugangsdaten gegen `korki_users` (gleiche Logik wie der normale FreiKI-Login)
- `POST /oauth/token` – tauscht den Authorization Code gegen ein JWT-Access-Token
- `GET /api/v4/user` – liefert die Nutzerdaten im GitLab-API-Format (von Mattermost erwartetes Format)

**Effekt:** Ein FreiKI-Benutzername = derselbe Mattermost-Benutzername. Kein separates Mapping nötig. Neue Mattermost-Accounts entstehen automatisch beim ersten Login über "Mit GitLab anmelden".

**Eingerichtete Werte** (Mattermost System Console → Authentication → GitLab):
- Application ID / Secret: eigene zufällige Werte, hinterlegt in `.env` als `MATTERMOST_OIDC_CLIENT_ID` / `MATTERMOST_OIDC_CLIENT_SECRET`
- GitLab Site URL: `https://app.freiki.com`
- Auth Endpoint: `https://app.freiki.com/oauth/authorize`
- Token Endpoint: `https://app.freiki.com/oauth/token`
- User API Endpoint: `https://app.freiki.com/api/v4/user`

Neue User müssen nach dem ersten Login einem Team zugeordnet werden (System Console → User Management → Teams), oder es wird "Allow any user with an account on this server to join this team" aktiviert.

## Bot-Anbindung (FreiKI im Chat fragen)

Neuer Backend-Endpoint **`POST /api/bot-chat`** in `server.js`:

- Sucht per Vektorsuche (pgvector) über die Wissensbereiche, **bereichsscoped pro Nutzer** – genau wie in der normalen FreiKI-Oberfläche (leere Bereichsrechte / Rolle Admin/Manager = alle Bereiche, sonst nur die freigegebenen)
- Authentifizierung über `X-API-Key`-Header (`BOT_API_KEY` in `.env`), getrennt vom bestehenden `KB_INGEST_API_KEY`
- Filtert die `<think>`-Reasoning-Ausgabe des Modells automatisch heraus (sauberer Antworttext für den Chat)
- Request: `{"message": "...", "username": "..."}` → Response: `{"answer": "...", "sources": [...]}`

**Slash-Command `/freiki` – umgesetzt:** Die Verkabelung Mattermost ↔ n8n ↔ `/api/bot-chat` ist fertig. Da Mattermost eine sofortige Antwort < 3 Sekunden erwartet, antwortet n8n zunächst mit einer kurzen Bestätigung („FreiKI denkt nach…") und liefert die eigentliche LLM-Antwort anschließend asynchron über die `response_url` nach.

**@-Erwähnung `@freiki` – umgesetzt:** Zusätzlich zum Slash-Command kann FreiKI in jedem Kanal per `@freiki Frage` angesprochen werden. Die Antwort erscheint direkt im Kanal (kein Thread).

**Technische Umsetzung:**
- Bot-Konto `freiki` in Mattermost angelegt (System Console → Integrations → Bot Accounts, Team Edition)
- Bot dem Team hinzugefügt via API (`POST /api/v4/teams/{id}/members`)
- Outgoing Webhook eingerichtet: Trigger Word `@freiki`, Callback `https://n8n.freiki.com/webhook/freiki-bot-mention`
- n8n-Workflow `FreiKI @mention Handler` (`n8n-freiki-mention-workflow.json`): Webhook antwortet sofort mit 200, ruft `/api/bot-chat` auf, postet Antwort per Bot-Token (`BOT_BEARER_TOKEN`) via `POST /api/v4/posts` in denselben Kanal
- Bot-Token in n8n direkt im HTTP-Request-Node hinterlegt (nicht in `.env`, da n8n-intern)

## E-Mail-Benachrichtigungen

Mattermost nutzt dieselben SMTP-Zugangsdaten wie der Rest von FreiKI (goneo, `admin@freiki.net`). `MM_EMAILSETTINGS_SENDEMAILNOTIFICATIONS=true` musste zusätzlich gesetzt werden, da SMTP-Zugangsdaten allein nicht reichen, um Benachrichtigungen zu aktivieren (sonst "Preview Mode"-Hinweis).

## Sprache

Server- und Client-Standardsprache auf Deutsch gesetzt (`MM_LOCALIZATIONSETTINGS_DEFAULTSERVERLOCALE`/`DEFAULTCLIENTLOCALE=de`). Einzelne UI-Bereiche (z. B. System Console, manche Plugins) bleiben bei Mattermost auch dann teilweise auf Englisch – das ist eine Mattermost-Einschränkung.

## Monitoring

Zwei Uptime-Kuma-Monitore wurden ergänzt: ein HTTP-Check gegen `https://chat.freiki.com` und ein Docker-Container-Check für `Mattermost`, beide mit der bestehenden E-Mail-Benachrichtigung verknüpft.

## Rückportierbarkeit (KorKI)

Alle Anpassungen sind bewusst portabel gehalten:
- Der komplette Mattermost-Service-Block in `docker-compose.yml` ist eigenständig kopierbar
- Alle individuellen Werte stecken in `.env`-Variablen (`MATTERMOST_URL`, `MATTERMOST_OIDC_*`, `BOT_API_KEY`)
- Die neuen `server.js`-Endpoints (`/api/bot-chat`, `/oauth/*`, `/api/v4/user`) sind generischer FreiKI-Code ohne Diakonie/FreiKI-spezifische Sonderlogik
- Caddy-Route ist ein eigenständiger Block in der `Caddyfile`
