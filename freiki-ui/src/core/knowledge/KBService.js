const pool = require('../../infrastructure/database/postgres/pool');
const { config } = require('../../shared/config');
const { getBrandConfig } = require('../../shared/config/BrandConfig');
const { fetchWithTimeout } = require('../../shared/utils/text');
const { normArea } = require('../../shared/utils/text');
const { getEmbeddings } = require('./EmbeddingService');
const kbAreas = require('./KBAreaRepository');

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const EMBED_BATCH = 4;
const BOT_CHUNKS_PER_AREA = 4;
const BOT_TOP_CHUNKS = 8;

// Siehe ChatService.js: chat_template_kwargs nur bei Qwen-Modellen setzen (Mistral/FrankKI
// lehnt unbekannte Felder mit HTTP 422 ab).
const THINKING_KWARGS = /qwen/i.test(config.VLLM_MODEL || '')
  ? { chat_template_kwargs: { enable_thinking: false } }
  : {};

function chunkText(text, source) {
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  const chunks = [];
  let buf = '';
  for (const p of paras) {
    if (p.length > CHUNK_SIZE) {
      // Einzelner Absatz zu groß (z.B. unformatierte Tabelle ohne Leerzeilen) – hart zerlegen
      if (buf.trim()) { chunks.push(buf.trim()); buf = ''; }
      for (let i = 0; i < p.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(p.slice(i, i + CHUNK_SIZE).trim());
      }
      continue;
    }
    if (buf.length + p.length + 2 > CHUNK_SIZE && buf) {
      chunks.push(buf.trim());
      // Overlap: letzten vollständigen Absatz weitertragen statt roher Zeichenschnitt
      const prevParas = buf.trim().split(/\n{2,}/);
      const lastPara = prevParas[prevParas.length - 1] || '';
      buf = (lastPara.length <= CHUNK_OVERLAP ? lastPara + '\n\n' : '') + p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(c => c.length > 30).map(c => ({ content: c, source }));
}

async function insertChunks(table, chunks, sourceUrl) {
  const client = await pool.connect();
  let inserted = 0;
  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      if (i > 0) await new Promise(r => setTimeout(r, 2000));
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const embeddings = await getEmbeddings(batch.map(c => c.content));
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const vecStr = '[' + embeddings[j].join(',') + ']';
        const meta = JSON.stringify({ source: chunk.source, source_url: sourceUrl || null });
        await client.query(
          `INSERT INTO ${table} (id,"pageContent",metadata,embedding) VALUES (gen_random_uuid(),$1,$2,$3::vector)`,
          [chunk.content, meta, vecStr]
        );
        inserted++;
      }
    }
  } finally { client.release(); }
  return inserted;
}

async function clearTable(table) {
  await pool.query('DELETE FROM ' + table);
}

// Normalisiert einen Dokumentnamen für den Dubletten-Abgleich: Groß/Kleinschreibung und
// Dateiendung raus. Nötig, weil derselbe Titel je nach Ingest-Pfad unterschiedlich ankommt -
// z.B. "Datei.PDF" bei einem alten Direkt-Upload vs. "Datei" (Paperless-Titel ohne Endung)
// beim paperless-sync-Re-Ingest. Ohne Normalisierung bleibt bei jedem Re-Sync die alte,
// unverlinkte Kopie neben der neuen liegen (siehe KorKI kb_allgemein-Altlast, 2026-08-20).
function normalizeSourceName(source) {
  return (source || '').toLowerCase().trim().replace(/\.(pdf|docx?|pptx?)$/i, '');
}

async function deleteBySource(bereich, source) {
  const table = kbAreas.getTable((bereich || '').toLowerCase().trim());
  if (!table) throw Object.assign(new Error('Unbekannter Bereich: ' + bereich), { status: 400 });
  if (!source) return { deleted: 0 };
  const result = await pool.query(
    `DELETE FROM ${table} WHERE regexp_replace(lower(metadata->>'source'), '\\.(pdf|docx?|pptx?)$', '') = $1`,
    [normalizeSourceName(source)]
  );
  return { deleted: result.rowCount || 0 };
}

async function ingestText(bereich, text, source, sourceUrl, opts = {}) {
  const table = kbAreas.getTable((bereich || '').toLowerCase().trim());
  if (!table) throw Object.assign(new Error('Unbekannter Bereich: ' + bereich), { status: 400 });
  const src = source || 'Paperless-Dokument';
  let deleted = 0;
  if (opts.replace) {
    deleted = (await deleteBySource(bereich, src)).deleted;
  }
  const chunks = chunkText(text, src);
  const inserted = await insertChunks(table, chunks, sourceUrl);
  return { inserted, chunks: chunks.length, deleted };
}

// Cosine-Distanz-Schwelle: schwächere Treffer nicht in den Kontext legen.
const WISSEN_MAX_DISTANCE = 0.45;
// Keyword-Treffer dürfen weiter entfernt sein; reine Vektor-Suche verfehlt oft Fachbegriffe.
const WISSEN_KEYWORD_MAX_DISTANCE = 0.65;
const WISSEN_KEYWORD_BOOST = 0.12; // wird von der Distanz abgezogen beim Ranking

// Instanzspezifische Synonyme (Format: { suchbegriff: ['synonym1', 'synonym2', ...] }),
// analog KorKI - aktuell leer, da keine passende Fachvokabular-Liste für diese Instanz vorliegt.
const QUERY_SYNONYMS = {};

function normalizeChunkRow(row) {
  let metadata = row.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch (_) { metadata = {}; }
  }
  return {
    pageContent: row.pageContent,
    metadata: metadata || {},
    distance: Number(row.distance),
  };
}

function extractKeywordTerms(queryText) {
  const q = (queryText || '').toLowerCase();
  const terms = new Set();
  for (const [key, syns] of Object.entries(QUERY_SYNONYMS)) {
    if (q.includes(key) || syns.some(s => q.includes(s))) {
      syns.forEach(s => terms.add(s));
    }
  }
  // ISO-Datumsangaben (YYYY-MM-DD) als ganzes Token behalten – der generische Split
  // unten würde sie am Bindestrich in unspezifische "2026"/"08"/"01"-Fragmente zerreißen.
  for (const dateMatch of q.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
    terms.add(dateMatch[0]);
  }
  // zusätzliche Inhaltswörter aus der Frage (≥5 Zeichen, keine Stoppwörter)
  const stop = new Set(['welche', 'welcher', 'welches', 'gibt', 'haben', 'oder', 'und', 'für', 'eine', 'einen', 'über', 'nach', 'bitte', 'sowie']);
  for (const w of q.split(/[^a-zäöüß0-9]+/i)) {
    if (w.length >= 5 && !stop.has(w)) terms.add(w);
  }
  return [...terms].slice(0, 12);
}

function mergeChunksByDistance(chunks, limit, maxPerSource = 3) {
  const seen = new Set();
  const perSource = new Map();
  const out = [];
  const sorted = [...chunks].sort((a, b) => a.distance - b.distance);
  for (const c of sorted) {
    const key = (c.pageContent || '').slice(0, 160);
    if (!key || seen.has(key)) continue;
    const src = c.metadata?.source || '_';
    const n = perSource.get(src) || 0;
    if (n >= maxPerSource) continue;
    seen.add(key);
    perSource.set(src, n + 1);
    out.push(c);
    if (out.length >= limit) break;
  }
  // Falls Diversität zu streng war: Rest nach Distanz auffüllen
  if (out.length < limit) {
    for (const c of sorted) {
      const key = (c.pageContent || '').slice(0, 160);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// Hybrid-Suche (Vektor + Keyword) auf genau einer Bereichs-Tabelle. Von retrieveWissenChunks
// (ein Bereich) und retrieveWissenChunksMulti (alle erlaubten Bereiche) gemeinsam genutzt.
async function hybridAreaChunks(client, areaKey, table, vecStr, terms, maxDistance, fetchLimit) {
  const { rows: vectorRows } = await client.query(
    `SELECT "pageContent", metadata, embedding <=> $1::vector AS distance
     FROM ${table} ORDER BY distance ASC LIMIT $2`,
    [vecStr, fetchLimit]
  );
  const merged = vectorRows
    .map(normalizeChunkRow)
    .filter((r) => Number.isFinite(r.distance) && r.distance < maxDistance);

  if (terms.length) {
    const likes = terms.map((_, i) => `"pageContent" ILIKE $${i + 2}`).join(' OR ');
    const params = [vecStr, ...terms.map(t => `%${t}%`)];
    const { rows: kwRows } = await client.query(
      `SELECT "pageContent", metadata, embedding <=> $1::vector AS distance
       FROM ${table}
       WHERE ${likes}
       ORDER BY distance ASC
       LIMIT 40`,
      params
    );
    for (const row of kwRows.map(normalizeChunkRow)) {
      if (!Number.isFinite(row.distance) || row.distance >= WISSEN_KEYWORD_MAX_DISTANCE) continue;
      // Keyword-Treffer im Ranking bevorzugen
      merged.push({
        ...row,
        distance: Math.max(0, row.distance - WISSEN_KEYWORD_BOOST),
      });
    }
  }

  const area = kbAreas.getLabel(areaKey) || areaKey;
  return merged.map((r) => ({ ...r, area }));
}

// Retrieval für den "Wissen"-Modus: Vektor + Keyword (Hybrid), damit Fachbegriffe nicht untergehen.
async function retrieveWissenChunks(wissenKey, queryText, limit = 10, maxDistance = WISSEN_MAX_DISTANCE) {
  const table = kbAreas.getTable(wissenKey);
  if (!table) throw Object.assign(new Error('Unbekannter Wissensbereich: ' + wissenKey), { status: 400 });
  const terms = extractKeywordTerms(queryText);
  // Synonyme/Terme an die Embedding-Query hängen → bessere Nachbarn für Fachbegriffe
  const embedQuery = terms.length
    ? `${queryText}\n${terms.slice(0, 8).join(' ')}`
    : queryText;
  const [queryEmbedding] = await getEmbeddings([embedQuery]);
  const vecStr = '[' + queryEmbedding.join(',') + ']';
  const fetchLimit = Math.min(50, Math.max(limit * 4, 20));
  const client = await pool.connect();
  try {
    const rows = await hybridAreaChunks(client, wissenKey, table, vecStr, terms, maxDistance, fetchLimit);
    return mergeChunksByDistance(rows, limit);
  } finally {
    client.release();
  }
}

// Bonus für den gerade angeklickten Menüpunkt: bei echten Nahtreffern gewinnt der aktuelle
// Bereich, hat er aber nichts Passendes, schlägt trotzdem der relevanteste andere Bereich durch.
const WISSEN_CURRENT_AREA_BOOST = 0.08;

// Wie retrieveWissenChunks, aber über alle Bereiche, auf die der Nutzer laut use_areas Zugriff
// hat (allowedAreaKeys === null -> alle Bereiche, analog answerBotChat). preferredAreaKey (der
// angeklickte Menüpunkt) bekommt einen Ranking-Bonus, ist aber keine harte Grenze mehr – andere
// erlaubte Bereiche werden trotzdem durchsucht.
async function retrieveWissenChunksMulti(allowedAreaKeys, queryText, { limit = 10, maxDistance = WISSEN_MAX_DISTANCE, preferredAreaKey = null } = {}) {
  const areaEntries = kbAreas.entries().filter(
    ([areaKey]) => !allowedAreaKeys || allowedAreaKeys.includes(normArea(areaKey))
  );
  if (!areaEntries.length) return [];

  const terms = extractKeywordTerms(queryText);
  const embedQuery = terms.length
    ? `${queryText}\n${terms.slice(0, 8).join(' ')}`
    : queryText;
  const [queryEmbedding] = await getEmbeddings([embedQuery]);
  const vecStr = '[' + queryEmbedding.join(',') + ']';
  // Pro Bereich weniger holen als bei Einzelbereichs-Suche, da mehrere Tabellen abgefragt werden.
  const fetchLimit = Math.min(30, Math.max(limit * 2, 15));
  const preferredKey = preferredAreaKey ? normArea(preferredAreaKey) : null;

  const client = await pool.connect();
  try {
    let all = [];
    for (const [areaKey, table] of areaEntries) {
      const rows = await hybridAreaChunks(client, areaKey, table, vecStr, terms, maxDistance, fetchLimit);
      const boosted = preferredKey && normArea(areaKey) === preferredKey
        ? rows.map((r) => ({ ...r, distance: Math.max(0, r.distance - WISSEN_CURRENT_AREA_BOOST) }))
        : rows;
      all = all.concat(boosted);
    }
    return mergeChunksByDistance(all, limit);
  } finally {
    client.release();
  }
}

// Eigenständiger RAG-QA-Endpunkt für die Hilfe-Chatbubble (nicht Teil des Haupt-Chat-Streams)
async function answerHilfeChat(message) {
  const hilfeTable = config.HILFE_KB_TABLE;
  if (!hilfeTable) return { error: 'HILFE_KB_TABLE nicht konfiguriert', status: 503 };
  const [queryEmbedding] = await getEmbeddings([message]);
  const vecStr = '[' + queryEmbedding.join(',') + ']';
  const client = await pool.connect();
  let chunks = [];
  try {
    const { rows } = await client.query(
      `SELECT "pageContent", metadata, embedding <=> $1::vector AS distance
       FROM ${hilfeTable} ORDER BY distance ASC LIMIT 5`,
      [vecStr]
    );
    chunks = rows;
  } finally {
    client.release();
  }
  const brand = getBrandConfig();
  const contextText = chunks.map((c, i) => `[${i + 1}] ${c.pageContent}`).join('\n\n');
  const systemPrompt = `Du bist der Hilfe-Assistent von ${brand.name}. Beantworte Fragen zu ${brand.name} ausschließlich auf Basis der folgenden Dokumentauszüge. Antworte kurz, präzise und auf Deutsch. Wenn die Antwort nicht in den Dokumenten steht, sage das klar.\n\n${contextText}`;
  const vllmRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({
      model: config.VLLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt + ' /no_think' },
        { role: 'user', content: message }
      ],
      stream: false,
      max_tokens: 512,
      ...THINKING_KWARGS
    })
  });
  const data = await vllmRes.json();
  let answer = data.choices?.[0]?.message?.content || '(Keine Antwort)';
  answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return { answer };
}

// Eigenständiger RAG-QA-Endpunkt für Bot-Integrationen (z.B. Mattermost via n8n) –
// sucht über ALLE Wissensbereiche, statt an einen einzelnen Bereich gebunden zu sein.
async function answerBotChat(message, username) {
  let allowedAreaKeys = null; // null = alle erlaubt
  if (username) {
    const { rows: userRows } = await pool.query(
      'SELECT role, use_areas FROM freiki_users WHERE lower(username)=lower($1) AND suspended=false',
      [username]
    );
    const u = userRows[0];
    if (u && (u.role === 'default' || u.role === 'high_risk' || u.role === 'manager') && u.use_areas && u.use_areas.length) {
      allowedAreaKeys = u.use_areas.map(normArea);
    }
  }
  const areaEntries = kbAreas.entries().filter(
    ([areaKey]) => !allowedAreaKeys || allowedAreaKeys.includes(normArea(areaKey))
  );

  const [queryEmbedding] = await getEmbeddings([message]);
  const vecStr = '[' + queryEmbedding.join(',') + ']';

  const client = await pool.connect();
  let allChunks = [];
  try {
    for (const [areaKey, table] of areaEntries) {
      const { rows } = await client.query(
        `SELECT "pageContent", metadata, embedding <=> $1::vector AS distance
         FROM ${table} ORDER BY distance ASC LIMIT $2`,
        [vecStr, BOT_CHUNKS_PER_AREA]
      );
      for (const row of rows) {
        allChunks.push({
          area: kbAreas.getLabel(areaKey) || areaKey,
          content: row.pageContent,
          distance: row.distance,
        });
      }
    }
  } finally {
    client.release();
  }

  allChunks.sort((a, b) => a.distance - b.distance);
  const topChunks = allChunks.filter(c => c.distance < 0.45).slice(0, BOT_TOP_CHUNKS);

  const brand = getBrandConfig();
  const contextText = topChunks.length
    ? topChunks.map((c, i) => `[${i + 1}] (Bereich: ${c.area})\n${c.content}`).join('\n\n')
    : '';

  const heuteDatum = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

  const systemPrompt = (contextText
    ? `Du bist ${brand.name}, ein interner KI-Assistent. Heutiges Datum: ${heuteDatum}. Beantworte die Frage des Nutzers ausschließlich auf Basis der folgenden Auszüge aus den Wissensbereichen. Nenne den jeweiligen Bereich, wenn du dich auf eine Quelle beziehst. Wenn die Auszüge die Frage nicht beantworten, sage das ehrlich – erfinde nichts.\n\n${contextText}`
    : `Du bist ${brand.name}, ein interner KI-Assistent. Heutiges Datum: ${heuteDatum}. Es wurden keine passenden Treffer in den Wissensbereichen gefunden – beantworte die Frage nach bestem Wissen, weise aber darauf hin, dass keine interne Quelle gefunden wurde.`
  ) + '\n\nAntworte direkt, ohne Gedankengang. /no_think';

  const llmRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({
      model: config.VLLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 1024,
      temperature: 0.3,
      ...THINKING_KWARGS,
    }),
  });
  if (!llmRes.ok) throw new Error('LLM-Aufruf fehlgeschlagen: ' + llmRes.status);
  const llmJson = await llmRes.json();
  let answer = llmJson.choices?.[0]?.message?.content?.trim() || '(keine Antwort)';
  answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  return { answer, sources: [...new Set(topChunks.map(c => c.area))] };
}

module.exports = {
  chunkText, insertChunks, clearTable, deleteBySource, ingestText,
  retrieveWissenChunks, retrieveWissenChunksMulti, answerHilfeChat, answerBotChat,
};
