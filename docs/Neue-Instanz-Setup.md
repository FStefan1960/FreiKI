# FreiKI/KorKI – Neue Instanz aufsetzen

**Stand Juni 2026**

Diese Anleitung beschreibt, was bei einer neuen Installation (z. B. FrankKI oder Kundensystem) angepasst werden muss. `server.js` bleibt kundenneutral – alle instanzspezifischen Inhalte stecken in externen Dateien.

---

## 1. Prinzip: Was ist instanzspezifisch?

| Datei / Variable | Wo | Versioniert? |
|---|---|---|
| `docker-compose.yml` | Server | nein (gitignore) |
| `.env` | Server | nein (gitignore) |
| `public/app-header.png` | Server | nein (gitignore) |
| `public/app-icon-192.png` | Server | nein (gitignore) |
| `public/apple-touch-icon.png` | Server | nein (gitignore) |
| `public/favicon-32.png` | Server | nein (gitignore) |
| `public/manifest.json` | Server | nein (gitignore) |
| `areas.json` | Server | nein (gitignore) |
| `welcome.md` | Server | nein (gitignore) |
| `tips.md` | Server | nein (gitignore) |
| `prompts/w_*.md` | Server | nein (gitignore für `w_*`) |
| `prompts/0chat.md` usw. | Repo | ja – gilt für alle Instanzen |

---

## 2. Neue Instanz einrichten

### Schritt 1: Repo klonen

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
APP_NAME=FrankKI
APP_URL=https://frankki.fst60.de
JWT_SECRET=<einzigartiger_zufaelliger_string_min_32_zeichen>

# LLM: bei GPU → vLLM; ohne GPU → externer API-Anbieter
VLLM_URL=https://api.mistral.ai/v1      # Beispiel Mistral API
VLLM_API_KEY=<api_key>
VLLM_MODEL=mistral-small-latest

# Embedding (ohne GPU: externer Dienst oder lokales Modell auf CPU)
VLLM_EMBED_URL=http://vllm-embedding:8000

PG_HOST=PostgreSQL
PG_DB=flowise
PG_USER_KB=n8n_user
PG_PASS_KB=<passwort>
```

### Schritt 3: docker-compose.yml anpassen

Ausgehend von der Vorlage im Repo – instanzspezifisch anpassen:
- GPU-Services (`vllm`, `vllm_embedding`) → nur bei GPU-Server
- Ports falls nötig anpassen
- Dienstnamen/Volumes bei Bedarf umbenennen

**Demo-/Cloud-Instanz ohne GPU** – diese Services entfallen:
- `vllm`, `vllm_embedding` → durch externen API-Anbieter ersetzt (nur `.env` ändern, kein Code-Umbau)
- `portainer`, `dozzle` → optional

### Schritt 4: Logos und Branding einspielen

```bash
# Logos direkt auf den Server kopieren (nicht ins Repo!)
scp logo-banner.png user@server:~/freiki-package/freiki-ui/public/app-header.png
scp logo-icon.png user@server:~/freiki-package/freiki-ui/public/app-icon-192.png
scp logo-icon.png user@server:~/freiki-package/freiki-ui/public/apple-touch-icon.png
scp favicon.png user@server:~/freiki-package/freiki-ui/public/favicon-32.png
```

Empfohlene Größen:
- `app-header.png`: 800×200 px (Banner)
- `app-icon-192.png`: 192×192 px (quadratisch)

### Schritt 5: Instanzspezifische Textdateien anlegen

```bash
# Willkommensmail-Vorlage
cp freiki-ui/instance-template/welcome.md freiki-ui/welcome.md
# → Inhalt anpassen (App-Name, Domain, Ansprechpartner)

# Tipp des Tages
cp freiki-ui/instance-template/tips.md freiki-ui/tips.md

# manifest.json
cp freiki-ui/public/manifest.json.example freiki-ui/public/manifest.json
# → name, short_name, theme_color anpassen
```

### Schritt 6: Wissensbereiche einrichten

Nur wenn Wissensbereiche gewünscht:

```bash
# areas.json anlegen (Mapping Bereich → DB-Tabelle)
cp freiki-ui/instance-template/areas.json freiki-ui/areas.json
# → Bereiche eintragen

# Pro Bereich: Prompt-Datei
cp freiki-ui/instance-template/prompts/w_stvo.md freiki-ui/prompts/w_neuerbereich.md
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
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_neuerbereich TO n8n_user;
```

### Schritt 7: Caddyfile anpassen

```bash
cp caddy/Caddyfile.example caddy/Caddyfile
# → Domain(s) eintragen
```

### Schritt 8: Stack starten

```bash
docker compose up -d
```

Beim ersten Start wird die Tabelle `korki_users` / `freiki_users` automatisch angelegt.

### Schritt 9: Ersten Admin-User anlegen

```bash
docker exec -it PostgreSQL psql -U n8n_user -d flowise
```

```sql
-- Hash vorher erzeugen:
-- docker run --rm python:3 python3 -c "import bcrypt; print(bcrypt.hashpw(b'IhrPasswort', bcrypt.gensalt(10)).decode())"

INSERT INTO korki_users (username, password_hash, role)
VALUES ('admin', '$2b$10$...', 'admin');
```

### Schritt 10: Branding in Admin-UI setzen

Nach dem ersten Login: Admin-UI → Konfiguration:
- App-Name, Tagline, Farben eintragen
- Cache-Version auf 1 setzen

---

## 3. n8n-Workflows einrichten (optional)

Für Paperless-Integration und Monitoring:

```bash
# Workflow importieren
docker exec -it n8n n8n import:workflow --input=/path/to/workflow.json
```

Vorlagen in `freiki-package/setup/`:
- `paperless-freiki-tag-sync-workflow.json` → täglich, legt Paperless-Tags an
- `paperless-freiki-sync-workflow.json` → alle 15 Min, Dokumente → KB

URLs und API-Keys in den Workflows anpassen (n8n-UI → Workflow → Knoten editieren).

Nach Anlage des n8n-API-Keys:
```bash
# In .env eintragen:
N8N_API_KEY=<key>
```

---

## 4. Checkliste neue Instanz

- [ ] Repo geklont
- [ ] `.env` vollständig befüllt (insb. `JWT_SECRET`, `APP_URL`, LLM-Credentials)
- [ ] `docker-compose.yml` instanzspezifisch angepasst
- [ ] Logos eingespielt (`app-header.png`, `app-icon-192.png`)
- [ ] `welcome.md`, `tips.md`, `manifest.json` angepasst
- [ ] `Caddyfile` mit Domain konfiguriert
- [ ] Stack gestartet: `docker compose up -d`
- [ ] Ersten Admin-User angelegt (SQL)
- [ ] Branding in Admin-UI gesetzt (Name, Farben, Cache-Version)
- [ ] Wissensbereiche: `areas.json` + `prompts/w_*.md` + Icons + KB-Tabellen
- [ ] Paperless: Tags in Paperless anlegen, n8n-Workflows importieren und aktivieren
- [ ] Mailserver: DNS-Records prüfen, DKIM eintragen
- [ ] Backup-Script einrichten und testen
- [ ] Uptime Kuma konfigurieren

---

## 5. Instanz-Übersicht

| Instanz | Server | Domain | Modell | Status |
|---|---|---|---|---|
| FreiKI | Hetzner | freiki.frank-stefan.de | Qwen 2.5 32B (vLLM, GPU) | produktiv / Demo |
| KorKI | Hetzner | assi.diakonie-kork-ki.de | Qwen 2.5 32B (vLLM, GPU) | produktiv |
| FrankKI | fst60.de | frankki.fst60.de | Mistral API | in Planung |

---

*Bei Fragen: frank@frank-stefan.de*
