# Neuen Wissensbereich in FreiKI anlegen (inkl. Paperless-Anbindung)

Komplettanleitung, Schritt für Schritt — am Beispiel eines neuen Bereichs `BEISPIEL`. Ersetze
`beispiel` überall durch deinen eigenen Bereichs-Key (klein geschrieben, ohne Sonderzeichen/Leerzeichen).

## 1. Postgres-Tabelle anlegen

```bash
ssh freiki-admin@freiki "docker exec PostgreSQL psql -U freiki_user -d freiki -c 'CREATE TABLE IF NOT EXISTS kb_beispiel (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, \"pageContent\" text, metadata jsonb, embedding vector);'"
```

## 2. Bereich in `areas.json` eintragen

`freiki-ui/areas.json` öffnen, neue Zeile ergänzen:

```json
"beispiel": { "table": "kb_beispiel", "label": "Beispiel – Demo" }
```

## 3. Prompt-/Menü-Datei anlegen

Neue Datei `freiki-ui/prompts/w_beispiel.md`:

```markdown
---
icon: 📋
title: Beispiel
desc: Kurze Beschreibung
welcome: Stellen Sie Ihre Frage zu Beispiel.
hint: 💡 z.B. "Beispielfrage?"
workspace: wissen
flowise_id: HIER_NEUE_FLOWISE_CHATFLOW_ID_EINTRAGEN
---

Du bist FreiKI, ein KI-Assistent.

- Beantworte Fragen ausschließlich auf Basis der bereitgestellten Dokumente aus der Wissensdatenbank.
- Gib keine allgemeinen Antworten, sondern nur aus den Dokumenten.
- Antworte immer auf Deutsch.
- Wenn die Antwort nicht in den Dokumenten steht, sage das klar.
- Antworte präzise und strukturiert.
- Vermeide unnötige Füllsätze.
```

**Wichtig:** `workspace: wissen` nicht vergessen — das Frontend sortiert nur danach in „Wissen" vs.
„Werkzeuge" ein, nicht am Dateinamen-Präfix `w_`.

**Auch wichtig:** Der Text in dieser `.md`-Datei wird für Wissens-Bereiche mit `flowise_id` **nicht**
als Prompt verwendet — er dient nur als Fallback/Dokumentation. Die eigentliche Antwort-Logik
(inkl. Zitierregeln) sitzt im Flowise-Chatflow (Schritt 5).

## 4. Icon (optional)

`freiki-ui/public/icons/w_beispiel.svg` anlegen (20×20 viewBox, `stroke="currentColor"`, Stil wie
die anderen Icons im Ordner). Ohne eigenes Icon wird einfach das Emoji aus `icon:` im Frontmatter
angezeigt.

## 5. Flowise-Chatflow anlegen

**Nicht von Grund auf neu bauen** — einen bestehenden, funktionierenden Chatflow (z. B. „StVO")
als Vorlage exportieren und anpassen:

```bash
ssh freiki-admin@freiki "docker exec PostgreSQL psql -U freiki_user -d freiki -t -A -c \"SELECT \\\"flowData\\\" FROM chat_flow WHERE id='<ID-des-StVO-Chatflows>';\"" > /tmp/vorlage.json
```

Dann mit einem kurzen Python-Snippet (oder manuell im JSON) zwei Felder anpassen:
- Im `postgres`-Knoten: `tableName` auf `kb_beispiel`
- Im `conversationalRetrievalQAChain`-Knoten: `responsePrompt` auf den neuen Bereich umformulieren,
  **am Ende unbedingt `/no_think` anhängen** (schaltet Qwen3s sichtbaren „Thinking"-Modus ab)

Datei auf den Server kopieren, dann in Flowise (`https://flowise.freiki.com`) importieren:
**„..." → Import**.

**Danach unbedingt prüfen**, dass diese Felder wirklich korrekt sind (Import übernimmt teils alte
Werte, das hat uns schon mehrfach erwischt):
- `OpenAI Custom Embedding`-Knoten: Base Path = `https://api.deepinfra.com/v1/openai`, Credential gesetzt
- `OpenAI Custom Model`-Knoten: Model Name = `Qwen/Qwen3-32B`, Base Path = `https://api.deepinfra.com/v1/openai`, Credential gesetzt
- `Postgres`-Knoten: Host = `postgres`, Database = `freiki`, Table Name = `kb_beispiel`, Credential gesetzt
- `Conversational Retrieval QA Chain`-Knoten: **„Return Source Documents"** aktivieren (zeigt bei
  Paperless-Inhalten automatisch einen Link zum Originaldokument unter der Antwort an, siehe
  `paperless-integration.md`)

Chatflow-ID aus der Browser-URL kopieren (`https://flowise.freiki.com/canvas/<ID>`) und in
`w_beispiel.md` bei `flowise_id` eintragen.

## 6. Deployen

```bash
scp freiki-ui/areas.json freiki-ui/prompts/w_beispiel.md freiki-admin@freiki:~/freiki-package/freiki-ui/
scp freiki-ui/public/icons/w_beispiel.svg freiki-admin@freiki:~/freiki-package/freiki-ui/public/icons/   # falls vorhanden
ssh freiki-admin@freiki "cd freiki-package && docker compose build freiki-ui && docker compose up -d freiki-ui"
```

## 7a. Inhalte manuell hochladen (ohne Paperless)

`https://app.freiki.com/kb-upload.html` öffnen (Admin-Login), Bereich „Beispiel" wählen, Datei
hochladen (TXT, MD, PDF oder DOCX).

## 7b. Inhalte automatisch über Paperless einlesen

1. **Tag in Paperless anlegen**, Name = Bereichs-Key (hier `beispiel`):
   ```bash
   curl -s -X POST -H "Authorization: Token <Paperless-API-Token>" -H "Content-Type: application/json" \
     -d '{"name":"beispiel","matching_algorithm":0}' https://paperless.freiki.com/api/tags/
   ```
   Die zurückgegebene `id` notieren (z. B. `5`).

2. **n8n-Workflow „Paperless -> FreiKI Sync" öffnen** (über Tailscale/SSH-Tunnel, der Editor ist
   öffentlich gesperrt) und zwei Stellen anpassen:
   - Knoten **„Neue Dokumente holen"**: in der URL die neue Tag-ID zur Liste ergänzen, z. B.
     `tags__id__in=1,2,4,5`
   - Knoten **„Bereich ableiten & filtern"**: im Code die `tagMap` um die neue ID ergänzen, z. B.
     `{ 1: 'stvo', 2: 'sgb9', 4: 'freiki', 5: 'beispiel' }`
   - Speichern

3. **Dokument in Paperless hochladen** und mit dem neuen Tag versehen.

4. **Workflow einmal manuell ausführen** (Button „Execute Workflow"), um sofort zu testen, statt
   auf den nächsten 15-Minuten-Lauf zu warten.

## 8. Testen

Im Chat unter „Beispiel" eine Frage stellen. Antwortet FreiKI nicht oder mit Fehler, in dieser
Reihenfolge prüfen:
1. `docker logs FreiKI --tail 30` — kommt die Anfrage überhaupt an, welcher Fehler?
2. Flowise-Chatflow nochmal öffnen — sind wirklich alle Felder aus Schritt 5 korrekt (nicht nur
   beim Import übernommen, sondern auch gespeichert)?
3. `docker exec PostgreSQL psql -U freiki_user -d freiki -c 'SELECT count(*) FROM kb_beispiel;'`
   — sind überhaupt Daten drin?
