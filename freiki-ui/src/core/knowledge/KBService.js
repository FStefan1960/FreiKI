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

async function ingestText(bereich, text, source, sourceUrl) {
  const table = kbAreas.getTable((bereich || '').toLowerCase().trim());
  if (!table) throw Object.assign(new Error('Unbekannter Bereich: ' + bereich), { status: 400 });
  const chunks = chunkText(text, source || 'Paperless-Dokument');
  const inserted = await insertChunks(table, chunks, sourceUrl);
  return { inserted, chunks: chunks.length };
}

// Retrieval für den "Wissen"-Modus im interaktiven Chat (Streaming-Antwort lebt in ChatService)
async function retrieveWissenChunks(wissenKey, queryText, limit = 8) {
  const table = kbAreas.getTable(wissenKey);
  const [queryEmbedding] = await getEmbeddings([queryText]);
  const vecStr = '[' + queryEmbedding.join(',') + ']';
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT "pageContent", metadata, embedding <=> $1::vector AS distance
       FROM ${table} ORDER BY distance ASC LIMIT ${limit}`,
      [vecStr]
    );
    return rows;
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
      max_tokens: 512
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
    if (u && u.role === 'default' && u.use_areas && u.use_areas.length) {
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

  const systemPrompt = (contextText
    ? `Du bist ${brand.name}, ein interner KI-Assistent. Beantworte die Frage des Nutzers ausschließlich auf Basis der folgenden Auszüge aus den Wissensbereichen. Nenne den jeweiligen Bereich, wenn du dich auf eine Quelle beziehst. Wenn die Auszüge die Frage nicht beantworten, sage das ehrlich – erfinde nichts.\n\n${contextText}`
    : `Du bist ${brand.name}, ein interner KI-Assistent. Es wurden keine passenden Treffer in den Wissensbereichen gefunden – beantworte die Frage nach bestem Wissen, weise aber darauf hin, dass keine interne Quelle gefunden wurde.`
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
    }),
  });
  if (!llmRes.ok) throw new Error('LLM-Aufruf fehlgeschlagen: ' + llmRes.status);
  const llmJson = await llmRes.json();
  let answer = llmJson.choices?.[0]?.message?.content?.trim() || '(keine Antwort)';
  answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  return { answer, sources: [...new Set(topChunks.map(c => c.area))] };
}

module.exports = {
  chunkText, insertChunks, clearTable, ingestText,
  retrieveWissenChunks, answerHilfeChat, answerBotChat,
};
