const { config } = require('../../shared/config');
const { getBrandConfig } = require('../../shared/config/BrandConfig');
const { fetchWithTimeout } = require('../../shared/utils/text');
const prompts = require('./PromptService');
const kb = require('../knowledge/KBService');
const { THINKING_KWARGS } = require('./ThinkingConfig');
const { withLanguageMessage } = require('./LanguageInstruction');
const { parseHistory } = require('./ChatHistory');

// Relative/absolute deutsche Datumsangaben ("heute", "morgen", "1. August") in ISO-Daten
// auflösen und der Retrieval-Query anhängen. Ohne das findet weder die Vektorsuche noch der
// Keyword-Boost verlässliche Treffer, weil Wissensdokumente Tage typischerweise als ISO-Datum
// ablegen, nie als deutsches Datum oder Monatsname.
const MONTHS_DE = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function resolveDateHints(text, todayISO) {
  const q = (text || '').toLowerCase();
  const hints = new Set();
  if (/\bheute\b/.test(q)) hints.add(todayISO);
  if (/\bübermorgen\b/.test(q)) hints.add(addDaysISO(todayISO, 2));
  else if (/\bmorgen\b/.test(q)) hints.add(addDaysISO(todayISO, 1));
  if (/\bgestern\b/.test(q)) hints.add(addDaysISO(todayISO, -1));

  const todayY = parseInt(todayISO.slice(0, 4), 10);
  const monthPattern = Object.keys(MONTHS_DE).join('|');
  const re = new RegExp(`\\b(\\d{1,2})\\.\\s*(${monthPattern})\\b(?:\\s*(\\d{4}))?`, 'g');
  let m;
  while ((m = re.exec(q)) !== null) {
    const day = parseInt(m[1], 10);
    const month = MONTHS_DE[m[2]];
    if (day < 1 || day > 31) continue;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    if (m[3]) {
      hints.add(`${m[3]}-${mm}-${dd}`);
    } else {
      // Kein Jahr genannt: beide naheliegenden Jahre als Kandidaten anhängen
      // (kostet nur ein zusätzliches, ungefährliches Keyword bei Fehltreffer).
      hints.add(`${todayY}-${mm}-${dd}`);
      hints.add(`${todayY + 1}-${mm}-${dd}`);
    }
  }
  return [...hints];
}

// Vage/kurze Folgefragen ("und was noch?", "warum?") anhand des Gesprächsverlaufs
// in eine eigenständige, präzise Suchanfrage umformulieren (nur für den Wissen-RAG-Pfad relevant).
async function rewriteQuery(question, hist) {
  if (!hist || hist.length < 2) return question;
  const vague = question.length < 60 ||
    /^(und|aber|warum|wie|was|wer|wann|wo|wieso|weshalb|doch|nein|ja|schau|gib|zeig|erkl|sag|das|die|der|da|dort|davon|dazu|daraus|darüber|damit|dessen|darin)\b/i.test(question.trim());
  if (!vague) return question;

  const brand = getBrandConfig();
  const histText = hist.slice(-4).map(m =>
    (m.role === 'user' ? 'Nutzer' : brand.name) + ': ' + m.content.slice(0, 300)
  ).join('\n');

  try {
    const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: 'Du formulierst kurze oder vage Folgefragen anhand des Gesprächsverlaufs in eigenständige, präzise Suchanfragen um. Gib NUR die umformulierte Frage zurück – ohne Erklärung, ohne Anführungszeichen. /no_think' },
          { role: 'user', content: `Gesprächsverlauf:\n${histText}\n\nFolgefrage: "${question}"\n\nUmformuliert:` }
        ],
        max_tokens: 120,
        temperature: 0.1,
        ...THINKING_KWARGS
      })
    });
    const d = await r.json();
    const rewritten = d.choices?.[0]?.message?.content?.trim();
    if (rewritten && rewritten.length > 5) {
      console.log(`Query rewrite: ${question.length} → ${rewritten.length} Zeichen`);
      return rewritten;
    }
  } catch (e) {
    console.warn('Query rewrite fehlgeschlagen:', e.message);
  }
  return question;
}

function resolveSourceFromChunk(c) {
  const meta = c?.metadata || {};
  const url = meta.source_url || null;
  const name = meta.source || null;
  let resolvedUrl = (url && /^https?:\/\//.test(url)) ? url : null;
  if (resolvedUrl) {
    const pmatch = resolvedUrl.match(/\/documents\/(\d+)/);
    if (pmatch) resolvedUrl = `/api/paperless/download/${pmatch[1]}`;
  }
  return { url: resolvedUrl, name, area: c?.area || null };
}

/** Nur Quellen, die im Antworttext als [n] zitiert wurden (1-basiert). */
function sourcesFromCitations(answerText, chunks) {
  const cited = new Set();
  const re = /\[(\d+)\]/g;
  let m;
  while ((m = re.exec(answerText || '')) !== null) {
    const idx = parseInt(m[1], 10);
    if (idx >= 1 && idx <= chunks.length) cited.add(idx);
  }
  const seen = new Set();
  const sources = [];
  for (const idx of [...cited].sort((a, b) => a - b)) {
    const s = resolveSourceFromChunk(chunks[idx - 1]);
    const key = s.url || s.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push(s);
    if (sources.length >= 5) break;
  }
  return sources;
}

async function handleWissenMode(res, { wissenKey, userMessage, history, mode, allowedAreaKeys, userLanguage, searchAllAreas }) {
  // "Hilfe" bleibt immer auf den eigenen Bereich begrenzt, unabhängig vom Client-Flag - eine
  // App-Hilfe-Frage soll klar "nicht in den Unterlagen" sagen statt fachfremde Treffer aus
  // anderen Wissensbereichen zu ziehen. Das begrenzt gleichzeitig den internen w_hilfe-
  // Health-Check auf einen Bereich (siehe KBService.retrieveWissenChunksMulti).
  const effectiveSearchAllAreas = wissenKey === 'hilfe' ? false : !!searchAllAreas;
  const hist = parseHistory(history).slice(-6);
  const originalQuestion = userMessage;
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  userMessage = await rewriteQuery(userMessage, hist);
  // Für die Nutzerantwort Originalfrage behalten; Rewrite nur für Retrieval.
  // Datumshinweise aus der Originalfrage (nicht der Umformulierung) auflösen, damit
  // "heute"/"morgen"/"1. August" als ISO-Datum fürs Keyword-Boosting verfügbar sind.
  const dateHints = resolveDateHints(originalQuestion, todayISO);
  const retrievalQuery = dateHints.length ? `${userMessage} ${dateHints.join(' ')}` : userMessage;
  userMessage = originalQuestion;

  // Sucht über alle Wissensbereiche, auf die der Nutzer Zugriff hat (nicht nur den angeklickten
  // wissenKey) – der bekommt aber weiterhin einen Ranking-Bonus (preferredAreaKey), damit der
  // Menüpunkt eine echte Präferenz bleibt statt nur den Systemprompt zu bestimmen.
  const chunks = await kb.retrieveWissenChunksMulti(allowedAreaKeys, retrievalQuery, { limit: 10, preferredAreaKey: wissenKey, searchAllAreas: effectiveSearchAllAreas });
  const multiArea = new Set(chunks.map(c => c.area).filter(Boolean)).size > 1;

  const contextText = chunks.length
    ? chunks.map((c, i) => `[${i + 1}]${multiArea && c.area ? ` (Bereich: ${c.area})` : ''}\n${c.pageContent}`).join('\n\n')
    : '';

  const citeHint = contextText
    ? '\n\nEs liegen relevante Dokumentauszüge vor. Behaupte NICHT, dass dazu nichts in den Unterlagen steht. ' +
      'Priorisiere die Auszüge unter „---“ vor früheren Chatantworten. ' +
      'Wenn du dich auf einen Auszug stützt, zitiere ihn mit seiner Nummer in eckigen Klammern (z. B. [2]). Nenne nur Auszüge, die du wirklich nutzt.'
    : '\n\nEs liegen keine passenden Dokumentauszüge vor. Sage nur: „Dazu steht in den Unterlagen nichts.“';

  const systemPrompt = (prompts.systemPrompts[mode] || '') +
    (contextText ? `\n\n---\nRelevante Auszüge aus der Wissensdatenbank:\n\n${contextText}\n---` : '') +
    citeHint;

  const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });
  // Mit Treffern: Verlauf weglassen, damit frühere Absagen die RAG-Antwort nicht überschreiben.
  const chatHistory = chunks.length ? [] : hist.slice(0, -1);
  const messages = withLanguageMessage([
    { role: 'system', content: systemPrompt + `\n\nSystemzeit: ${now}. /no_think` },
    ...chatHistory,
    { role: 'user', content: userMessage }
  ], userLanguage, mode);

  const vllmRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({ model: config.VLLM_MODEL, messages, stream: true, max_tokens: 4096, temperature: 0, ...THINKING_KWARGS })
  });
  if (!vllmRes.ok) throw new Error(`vLLM Fehler ${vllmRes.status}`);

  const reader = vllmRes.body;
  let buf = '';
  let answerText = '';
  let finished = false;
  function finishWissen() {
    if (finished || res.writableEnded) return;
    finished = true;
    // Nur zitierte Auszüge [n] – keine Mitläufer aus dem Top-k-Retrieval.
    const sources = sourcesFromCitations(answerText, chunks);
    const multiAreaSources = new Set(sources.map(s => s.area).filter(Boolean)).size > 1;
    if (sources.length) {
      const label = sources.length > 1 ? 'Quellen' : 'Quelle';
      const urlCount = sources.filter((x) => x.url).length;
      let linkIdx = 0;
      const parts = sources.map((s) => {
        const areaBit = multiAreaSources && s.area ? `${s.area}: ` : '';
        if (s.url) {
          linkIdx++;
          const labelLink = urlCount > 1 ? `Original ${linkIdx}` : 'Original';
          const nameBit = s.name ? ` (${s.name})` : '';
          return `${areaBit}<a href="${s.url}" target="_blank" rel="noopener">${labelLink}</a>${nameBit}`;
        }
        return `${areaBit}${s.name}`;
      });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n**${label}:** ${parts.join(', ')}` } }] })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
  reader.on('data', chunk => {
    buf += chunk.toString();
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (raw === '[DONE]') { finishWissen(); return; }
      try {
        const parsed = JSON.parse(raw);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') answerText += delta;
      } catch (_) { /* Keepalive / unvollständiges JSON */ }
      res.write(line + '\n');
    }
  });
  reader.on('end', () => { finishWissen(); });
}

module.exports = { handleWissenMode };
