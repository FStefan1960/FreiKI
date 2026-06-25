# Paperless-ngx → FreiKI: Wissensbereiche aus Originaldokumenten

Idee: Dokumente werden in Paperless-ngx eingescannt/hochgeladen und nach Bereich getaggt (manuell
oder durch die einlesende Person). Ein n8n-Workflow holt neu getaggte Dokumente automatisch ab,
schickt den (von Paperless bereits OCR'ten) Text an FreiKI, wo er wie gewohnt gechunkt und
eingebettet wird – jeder Chunk bekommt zusätzlich einen Link zurück zum Originaldokument in
Paperless. So kann FreiKI bei Bedarf auf den exakten Originaltext verweisen, statt zu versuchen,
ihn aus einzelnen Chunks zu rekonstruieren.

## 1. Tagging-Konvention

Jeder Paperless-**Tag** entspricht einem Bereich-Key aus `freiki-ui/areas.json`. Für die
mitgelieferten Demo-Bereiche also: Tags `stvo` und `sgb9` in Paperless anlegen.

Wer ein Dokument einscannt/hochlädt, vergibt direkt den passenden Tag (manuell, oder als Standard-
Tag bei der Mailbox-/Scanner-Quelle). Zusätzlich legt der Workflow nach erfolgreichem Einlesen
automatisch den Tag `freiki-synced` an – damit werden bereits verarbeitete Dokumente nicht doppelt
eingelesen.

## 2. Paperless-Vorbereitung

1. `https://paperless.freiki.com` öffnen, mit `PAPERLESS_ADMIN_USER`/`PAPERLESS_ADMIN_PASSWORD`
   aus `.env` einloggen.
2. Unter **Einstellungen → Tags** die Tags `stvo`, `sgb9` (und `freiki-synced`) anlegen.
3. Unter **Einstellungen → API-Token** (oder Profil-Icon → "Meine Profil-Einstellungen" →
   "Auth Token") einen API-Token erzeugen – wird im n8n-Workflow gebraucht.

## 3. n8n-Workflow aufbauen

In n8n (`https://n8n.freiki.com`, Editor nur intern/per SSH-Tunnel erreichbar, siehe Caddyfile)
einen neuen Workflow mit folgenden Knoten anlegen:

### Node 1: Schedule Trigger
- Intervall z. B. alle 15 Minuten

### Node 2: HTTP Request – "Neue Dokumente holen"
- Methode: `GET`
- URL: `https://paperless.freiki.com/api/documents/?tags__name__in=stvo,sgb9&tags__name__nin=freiki-synced`
- Header: `Authorization: Token <Paperless-API-Token>`
- Liefert eine Liste der Dokumente, die einen Bereich-Tag, aber noch nicht `freiki-synced` haben

### Node 3: Split In Batches / Loop Over Items
- Iteriert über `response.results`

### Node 4: Function/Set – "Bereich aus Tags ableiten"
- Aus den Tags des Dokuments (`item.tags`) den Bereich-Key herausfiltern (das Tag, das nicht
  `freiki-synced` ist und einem bekannten Bereich aus `areas.json` entspricht)
- Felder zusammenstellen:
  - `bereich` = erkannter Tag (z. B. `stvo`)
  - `text` = `item.content` (von Paperless bereits per OCR extrahierter Text)
  - `source` = `item.title`
  - `source_url` = `https://paperless.freiki.com/documents/{{item.id}}/details`

### Node 5: HTTP Request – "An FreiKI schicken"
- Methode: `POST`
- URL: `https://app.freiki.com/api/kb-ingest-text`
- Header: `X-API-Key: <KB_INGEST_API_KEY aus .env>`, `Content-Type: application/json`
- Body (JSON): `{ "bereich": "...", "text": "...", "source": "...", "source_url": "..." }`

### Node 6: HTTP Request – "Dokument in Paperless als synced markieren"
- Methode: `PATCH`
- URL: `https://paperless.freiki.com/api/documents/{{item.id}}/`
- Header: `Authorization: Token <Paperless-API-Token>`
- Body: Tag-Liste des Dokuments um die ID des `freiki-synced`-Tags ergänzen (vorher per
  `GET /api/tags/?name=freiki-synced` einmalig die Tag-ID ermitteln und im Workflow als
  Konstante hinterlegen)

Workflow aktivieren – danach werden neu getaggte Paperless-Dokumente automatisch alle 15 Minuten
in den passenden FreiKI-Wissensbereich übernommen.

## 4. Flowise-Chatflow: Quelle mitausgeben

Der `source_url`-Link wird **automatisch und zuverlässig** unter jeder Antwort angehängt – nicht
über den Prompt (Sprachmodelle geben URLs unzuverlässig wieder), sondern serverseitig:

1. Im Chatflow-Knoten **„Conversational Retrieval QA Chain"** die Option **„Return Source
   Documents"** aktivieren.
2. `server.js` liest das mitgelieferte `sourceDocuments`-Event aus dem Flowise-Stream, sammelt die
   eindeutigen `source_url`-Werte aller verwendeten Chunks und hängt sie als `**Quelle:** [Original](…)`
   ans Ende der Antwort an – ganz ohne dass das Sprachmodell selbst einen Link generieren muss.

Kein Prompt-Zusatz nötig. Falls ein neuer Wissensbereich angelegt wird (siehe
`neuer-wissensbereich.md`), bei Schritt 5 einfach **„Return Source Documents"** mit aktivieren.

## 5. Manuelles Nachladen (ohne n8n) zum Testen

Bevor der Workflow steht, lässt sich der neue Endpoint auch direkt testen:

```bash
curl -X POST https://app.freiki.com/api/kb-ingest-text \
  -H "X-API-Key: <KB_INGEST_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "bereich": "stvo",
    "text": "Testinhalt ...",
    "source": "Testdokument",
    "source_url": "https://paperless.freiki.com/documents/1/details"
  }'
```

Erwartete Antwort: `{"ok":true,"inserted":<N>,"chunks":<N>}`
