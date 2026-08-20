// Ersatz für drei n8n-Workflows (FreiKI Paperless Tags synchronisieren, Paperless -> FreiKI
// Sync, Paperless KI-Tagging) — Logik 1:1 aus den live auf dem FreiKI-n8n laufenden Workflows
// übernommen (per SQL aus workflow_entity gelesen, siehe
// [[feedback_n8n_workflows_server_ist_wahrheit]]). Analog zu KorKIs paperless-sync/, hier ohne
// "oh-"-Tag-Präfixe (die gibt es nur bei KorKI) und mit Mattermost-Report (bei FreiKI noch aktiv
// genutzt, bei KorKI inzwischen abgeschaltet).

const PAPERLESS_URL = process.env.PAPERLESS_INTERNAL_URL || 'http://paperless:8000';
const PAPERLESS_TOKEN = process.env.PAPERLESS_TOKEN || '';
const PAPERLESS_PUBLIC_URL = process.env.PAPERLESS_URL || 'https://paperless.freiki.com';

const FREIKI_URL = process.env.FREIKI_URL || 'http://FreiKI:3000';
const KB_INGEST_API_KEY = process.env.KB_INGEST_API_KEY || '';

const VLLM_URL = process.env.VLLM_URL || '';
const VLLM_API_KEY = process.env.VLLM_API_KEY || '';
const VLLM_MODEL = process.env.VLLM_MODEL || '';

const MATTERMOST_URL = process.env.MATTERMOST_URL || 'http://mattermost:8065';
const MATTERMOST_BOT_TOKEN = process.env.MATTERMOST_BOT_TOKEN || '';
const MATTERMOST_REPORT_CHANNEL_ID = process.env.MATTERMOST_REPORT_CHANNEL_ID || '';

const TAGSYNC_HOUR = parseInt(process.env.TAGSYNC_HOUR || '3', 10);
const TAGSYNC_MIN = parseInt(process.env.TAGSYNC_MIN || '0', 10);
const RAGSYNC_INTERVAL_MIN = parseInt(process.env.RAGSYNC_INTERVAL_MIN || '20', 10);
const KITAGGING_INTERVAL_HOURS = parseInt(process.env.KITAGGING_INTERVAL_HOURS || '2', 10);

function log(job, ...args) {
  console.log(`[${new Date().toISOString()}] [${job}]`, ...args);
}

async function paperlessFetch(path, options = {}) {
  const res = await fetch(`${PAPERLESS_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Token ${PAPERLESS_TOKEN}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Paperless ${options.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function postToMattermost(message) {
  if (!MATTERMOST_BOT_TOKEN || !MATTERMOST_REPORT_CHANNEL_ID) return;
  try {
    await fetch(`${MATTERMOST_URL}/api/v4/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MATTERMOST_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: MATTERMOST_REPORT_CHANNEL_ID, message }),
    });
  } catch (e) {
    log('mattermost', 'Report-Post fehlgeschlagen:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Job 1: FreiKI Paperless Tags synchronisieren (täglich)
// ─────────────────────────────────────────────────────────────────────────
async function runTagSync() {
  const areasResp = await fetch(`${FREIKI_URL}/api/kb-areas`, {
    headers: { 'X-API-Key': KB_INGEST_API_KEY },
  });
  if (!areasResp.ok) throw new Error(`KB-Bereiche holen -> ${areasResp.status}`);
  const areas = (await areasResp.json()).areas || [];

  const tags = (await paperlessFetch('/api/tags/?page_size=100')).results || [];
  const existingNames = tags.map((t) => t.name.toLowerCase());

  const missing = areas.filter((name) => !existingNames.includes(name));
  for (const name of missing) {
    await paperlessFetch('/api/tags/', { method: 'POST', body: JSON.stringify({ name }) });
    log('tag-sync', 'Tag angelegt:', name);
  }
  log('tag-sync', missing.length ? `${missing.length} Tag(s) angelegt.` : 'Keine fehlenden Tags.');
}

// ─────────────────────────────────────────────────────────────────────────
// Job 2: Paperless -> FreiKI Sync (alle 20 Minuten)
// ─────────────────────────────────────────────────────────────────────────
async function runRagSync() {
  const tagList = (await paperlessFetch('/api/tags/?page_size=100')).results || [];
  const readyTag = tagList.find((t) => t.name.toLowerCase() === 'ready-for-rag');
  if (!readyTag) throw new Error('Tag "ready-for-rag" nicht in Paperless gefunden');
  const readyId = readyTag.id;

  const tagMap = {};
  for (const t of tagList) {
    if (t.id !== readyId) tagMap[t.id] = t.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const docs = (await paperlessFetch(`/api/documents/?tags__id__all=${readyId}&page_size=100`)).results || [];
  let synced = 0;
  const bereiche = new Set();
  for (const doc of docs) {
    if (!doc.tags.includes(readyId)) continue;
    const bereichTagId = doc.tags.find((t) => tagMap[t]);
    if (!bereichTagId) continue;

    const bereich = tagMap[bereichTagId];
    const source_url = `${PAPERLESS_PUBLIC_URL}/documents/${doc.id}/details`;
    const newTags = doc.tags.filter((id) => id !== readyId);

    try {
      const ingestRes = await fetch(`${FREIKI_URL}/api/kb-ingest-text`, {
        method: 'POST',
        headers: { 'X-API-Key': KB_INGEST_API_KEY, 'Content-Type': 'application/json' },
        // replace:true räumt eine ältere Kopie desselben Dokuments weg (z.B. ein alter
        // Direkt-Upload ohne source_url oder ein vorheriger Sync-Lauf) - kb-ingest-text
        // matcht den Dokumentnamen dabei normalisiert (ohne Endung/Groß-Kleinschreibung),
        // siehe deleteBySource() in KBService.js.
        body: JSON.stringify({ bereich, text: doc.content || '', source: doc.title, source_url, replace: true }),
      });
      if (!ingestRes.ok) throw new Error(`kb-ingest-text -> ${ingestRes.status} ${await ingestRes.text()}`);

      await paperlessFetch(`/api/documents/${doc.id}/`, { method: 'PATCH', body: JSON.stringify({ tags: newTags }) });
      synced++;
      bereiche.add(bereich);
      log('rag-sync', `Dokument ${doc.id} ("${doc.title}") -> Bereich "${bereich}" übernommen.`);
    } catch (e) {
      log('rag-sync', `Dokument ${doc.id} fehlgeschlagen:`, e.message);
    }
  }

  const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const msg = synced
    ? `🔄 **RAG-Sync FreiKI** (${now})\n${synced} Dokument(e) ins Wissen aufgenommen.\nBereiche: ${[...bereiche].join(', ')}`
    : `🔄 **RAG-Sync FreiKI** (${now})\nKeine neuen Dokumente.`;
  await postToMattermost(msg);
  log('rag-sync', synced ? `${synced} Dokument(e) übernommen.` : 'Keine neuen Dokumente.');
}

// ─────────────────────────────────────────────────────────────────────────
// Job 3: Paperless KI-Tagging (alle 2 Stunden)
// ─────────────────────────────────────────────────────────────────────────
function normalizeTag(t) {
  return t.toLowerCase().trim().replace(/[^a-z0-9\-äöüß]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function callLLM(content) {
  const prompt = `Analysiere dieses Dokument und gib zurück:
{
  "title": "präziser, kurzer Titel auf Deutsch, max. 60 Zeichen",
  "correspondent": "offizieller Name des Absenders/der Firma (oder null)",
  "document_type": "Typ: Rechnung, Vertrag, Bescheid, Brief, Kontoauszug, Quittung, Versicherung oder Sonstiges",
  "created": "Datum des Dokuments YYYY-MM-DD (oder null wenn nicht erkennbar)",
  "tags": ["tag1", "tag2"]
}
Regeln:
- Titel: kurz, präzise, deutsch
- Correspondent: offizieller Name der ausstellenden Stelle oder Firma
- Tags: 2-5 Stück, deutsch, nur lowercase Buchstaben und Bindestriche
- NUR das JSON zurückgeben

Dokumenttext:
${content}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${VLLM_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${VLLM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [
          { role: 'system', content: 'Du analysierst Dokumente für ein digitales Archiv. Antworte NUR mit einem JSON-Objekt, kein Text davor oder danach. /no_think' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 300,
      }),
    });
    if (!res.ok) throw new Error(`LLM -> ${res.status} ${await res.text()}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

function parseLLMResponse(raw, currentTitle) {
  let title = currentTitle;
  let tags = [];
  let correspondent = null;
  let documentType = null;
  let created = null;
  try {
    const match = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim().match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.title) title = parsed.title.trim().slice(0, 80);
      tags = (parsed.tags || []).map(normalizeTag);
      if (parsed.correspondent && parsed.correspondent !== 'null') correspondent = String(parsed.correspondent).trim();
      if (parsed.document_type && parsed.document_type !== 'null') documentType = String(parsed.document_type).trim();
      if (parsed.created && parsed.created !== 'null' && !isNaN(new Date(parsed.created).getTime())) created = parsed.created;
    }
  } catch { /* Antwort nicht als JSON parsbar -> Fallback-Werte behalten */ }
  return { title, tags, correspondent, documentType, created };
}

async function resolveOrCreate(kind, name, map) {
  const key = name.toLowerCase();
  if (map[key] !== undefined) return map[key];
  const endpoint = kind === 'correspondent' ? '/api/correspondents/' : '/api/document_types/';
  try {
    const created = await paperlessFetch(endpoint, { method: 'POST', body: JSON.stringify({ name }) });
    return created.id;
  } catch (e) {
    log('ki-tagging', `${kind} "${name}" konnte nicht angelegt werden:`, e.message);
    return null;
  }
}

async function tagDocument(doc, tagMap, corrMap, docTypeMap, notYetTaggedId) {
  const currentTags = doc.tags.filter((id) => id !== notYetTaggedId);
  const content = (doc.content || '').slice(0, 6000);

  const raw = await callLLM(content);
  const parsed = parseLLMResponse(raw, doc.title);

  const finalTagIds = [...currentTags];
  for (const name of parsed.tags) {
    if (tagMap[name] !== undefined) {
      if (!finalTagIds.includes(tagMap[name])) finalTagIds.push(tagMap[name]);
    } else {
      const created = await paperlessFetch('/api/tags/', { method: 'POST', body: JSON.stringify({ name }) }).catch((e) => {
        log('ki-tagging', `Tag "${name}" konnte nicht angelegt werden:`, e.message);
        return null;
      });
      if (created?.id) { tagMap[name] = created.id; finalTagIds.push(created.id); }
    }
  }

  const correspondentId = parsed.correspondent ? await resolveOrCreate('correspondent', parsed.correspondent, corrMap) : null;
  const documentTypeId = parsed.documentType ? await resolveOrCreate('document_type', parsed.documentType, docTypeMap) : null;

  const body = { title: parsed.title, tags: finalTagIds };
  if (correspondentId != null) body.correspondent = correspondentId;
  if (documentTypeId != null) body.document_type = documentTypeId;
  if (parsed.created) body.created = parsed.created;

  await paperlessFetch(`/api/documents/${doc.id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  log('ki-tagging', `Dokument ${doc.id} getaggt: "${parsed.title}"`);
}

async function runKiTagging() {
  const [tagsRes, corrRes, docTypeRes] = await Promise.all([
    paperlessFetch('/api/tags/?page_size=200'),
    paperlessFetch('/api/correspondents/?page_size=200'),
    paperlessFetch('/api/document_types/?page_size=200'),
  ]);

  const tagMap = {};
  for (const t of tagsRes.results || []) tagMap[t.name.toLowerCase()] = t.id;
  const notYetTaggedId = tagMap['not-yet-tagged'];
  if (!notYetTaggedId) throw new Error('Tag "not-yet-tagged" nicht in Paperless gefunden');

  const corrMap = {};
  for (const c of corrRes.results || []) corrMap[c.name.toLowerCase()] = c.id;
  const docTypeMap = {};
  for (const d of docTypeRes.results || []) docTypeMap[d.name.toLowerCase()] = d.id;

  const docs = (await paperlessFetch(`/api/documents/?tags__id__all=${notYetTaggedId}&page_size=25&ordering=created`)).results || [];
  if (!docs.length) { log('ki-tagging', 'Keine neuen Dokumente.'); return; }

  let tagged = 0;
  for (const doc of docs) {
    try {
      await tagDocument(doc, tagMap, corrMap, docTypeMap, notYetTaggedId);
      tagged++;
    } catch (e) {
      log('ki-tagging', `Dokument ${doc.id} fehlgeschlagen:`, e.message);
    }
  }
  const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  await postToMattermost(`📄 **Paperless KI-Tagging** (${now})\n${tagged} Dokument(e) automatisch verschlagwortet.`);
  log('ki-tagging', `${tagged}/${docs.length} Dokument(e) verschlagwortet.`);
}

// ─────────────────────────────────────────────────────────────────────────
// Scheduling
// ─────────────────────────────────────────────────────────────────────────
function msUntilDaily(hour, min) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, min, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target.getTime() - now.getTime();
}

async function loopDaily(name, hour, min, fn) {
  for (;;) {
    const wait = msUntilDaily(hour, min);
    log(name, `Nächster Lauf in ${Math.round(wait / 60000)} Minuten.`);
    await new Promise((r) => setTimeout(r, wait));
    try { await fn(); } catch (e) { log(name, 'Lauf fehlgeschlagen:', e.message); }
  }
}

async function loopInterval(name, intervalMs, fn) {
  for (;;) {
    try { await fn(); } catch (e) { log(name, 'Lauf fehlgeschlagen:', e.message); }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function main() {
  if (process.env.RUN_ONCE === 'true') {
    const only = process.env.RUN_ONLY || '';
    if (!only || only === 'tagsync') await runTagSync().catch((e) => log('tag-sync', 'fehlgeschlagen:', e.message));
    if (!only || only === 'ragsync') await runRagSync().catch((e) => log('rag-sync', 'fehlgeschlagen:', e.message));
    if (!only || only === 'kitagging') await runKiTagging().catch((e) => log('ki-tagging', 'fehlgeschlagen:', e.message));
    process.exit(0);
  }

  await Promise.all([
    loopDaily('tag-sync', TAGSYNC_HOUR, TAGSYNC_MIN, runTagSync),
    loopInterval('rag-sync', RAGSYNC_INTERVAL_MIN * 60000, runRagSync),
    loopInterval('ki-tagging', KITAGGING_INTERVAL_HOURS * 3600000, runKiTagging),
  ]);
}

main();
