// Ersatz für den n8n-Workflow "Health-Check: LLM + Embedding + RAG + Login + Archiv".
// Login+RAG-Chat werden bewusst per echtem Self-HTTP-Call gegen den eigenen, laufenden
// Server getestet (nicht per internem Funktionsaufruf) - hier soll ja genau der reale
// HTTP-Pfad (Routing, Middleware, Auth) mitgeprüft werden, nicht nur die Kernlogik.
// Alarmiert nur bei Fehler (kein Erfolgsrauschen), analog zum Original.
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
const { getEmbeddings } = require('../core/knowledge/EmbeddingService');
const users = require('../core/auth/UserRepository');
const { sendReportMail } = require('../core/integrations/EmailService');
const { getBrandConfig } = require('../shared/config/BrandConfig');

const SELF_URL = `http://127.0.0.1:${config.PORT}`;

async function testLLM() {
  const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({ model: config.VLLM_MODEL, messages: [{ role: 'user', content: 'Hallo' }], max_tokens: 10 }),
  }, 30000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.choices?.[0]) throw new Error('Keine Antwort');
}

async function testEmbedding() {
  const vectors = await getEmbeddings(['Test']);
  if (!vectors?.[0]?.length) throw new Error('Kein Vektor');
}

async function testLoginAndRag() {
  if (!config.HEALTHCHECK_PASSWORD) throw new Error('HEALTHCHECK_PASSWORD nicht konfiguriert');
  const loginRes = await fetchWithTimeout(`${SELF_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'healthcheck', password: config.HEALTHCHECK_PASSWORD }),
  }, 10000);
  const loginData = await loginRes.json();
  if (!loginRes.ok || !loginData.token) throw new Error('Login: ' + (loginData.error || 'Kein Token'));

  const ragRes = await fetchWithTimeout(`${SELF_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` },
    body: JSON.stringify({ message: 'Wie funktioniert die Hilfe-Funktion?', mode: 'w_hilfe' }),
  }, 30000);
  if (!ragRes.ok) throw new Error('RAG-Chat: HTTP ' + ragRes.status);
  const raw = await ragRes.text();
  let answer = '';
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (payload === '[DONE]' || !payload) continue;
    try {
      const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
      if (delta) answer += delta;
    } catch { /* nicht-JSON-Zeile ignorieren */ }
  }
  answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!answer) throw new Error('RAG-Chat: Keine Antwort erhalten (Modus w_hilfe) - LLM, Embedding oder RAG-DB gestört');
}

async function testArchive() {
  if (!config.PAPERLESS_TOKEN) return; // Paperless optional pro Instanz
  const r = await fetchWithTimeout(`${config.PAPERLESS_INTERNAL_URL}/api/documents/?query=und&page_size=1`, {
    headers: { Authorization: `Token ${config.PAPERLESS_TOKEN}` },
  }, 15000);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.count) throw new Error('Keine Ergebnisse');
}

async function run() {
  const checks = [
    ['LLM', testLLM],
    ['Embedding', testEmbedding],
    ['Login + RAG-Chat', testLoginAndRag],
    ['Archiv', testArchive],
  ];
  const errors = [];
  for (const [label, fn] of checks) {
    try { await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); }
  }
  if (!errors.length) return;

  const recipients = await users.listAdminEmails();
  if (!recipients.length) return;
  const appName = getBrandConfig().name;
  await sendReportMail(
    recipients,
    `[FEHLER] ${appName} Health-Check: ${errors.length} Problem(e)`,
    { text: `${appName} meldet Probleme:\n\n${errors.join('\n')}\n\nBitte prüfen.` }
  );
}

module.exports = { run };
