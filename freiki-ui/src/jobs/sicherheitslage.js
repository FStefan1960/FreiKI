// Ersatz für den n8n-Workflow "IT-Sicherheitslage" - liest den BSI/CERT-Bund-RSS-Feed,
// lässt das interne LLM daraus einen Digest bauen und speichert ihn wie zuvor in
// sicherheitslage.json (vorher per Self-HTTP-Call mit API-Key, jetzt direkter Dateizugriff
// im selben Prozess). Generisch für jede Instanz, kein instanzspezifisches Flag nötig.
const fs = require('fs');
const path = require('path');
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');

const FEED_URL = 'https://wid.cert-bund.de/content/public/securityAdvisory/rss';

function parseItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    if (title && link) items.push({ title: title.trim(), link: link.trim() });
  }
  return items;
}

async function run() {
  const r = await fetchWithTimeout(FEED_URL, {}, 15000);
  if (!r.ok) throw new Error(`BSI-Feed HTTP ${r.status}`);
  const xml = await r.text();
  const items = parseItems(xml).slice(0, 10);
  if (!items.length) return;

  const text = items.map((it, i) => `${i + 1}. ${it.title} | ${it.link}`).join('\n');
  const thinkingKwargs = /qwen/i.test(config.VLLM_MODEL || '') ? { chat_template_kwargs: { enable_thinking: false } } : {};

  const llmRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({
      model: config.VLLM_MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: 'Du erstellst einen IT-Sicherheitslage-Digest aus aktuellen Meldungen von BSI/CERT-Bund. Gib sauberes HTML aus (nur body-Inhalt, kein Markdown, kein <html>/<body>). Gliedere mit h2, darunter ul/li je Meldung mit dem Titel als Link (a href) und einem kurzen Satz zur Einordnung. Hebe kritische oder hochstufige Schwachstellen hervor, fasse den Rest knapp zusammen. Antworte NUR mit dem HTML, keine Erklärungen, keine Denkschritte.' },
        { role: 'user', content: `Aktuelle Meldungen:\n${text}` },
      ],
      ...thinkingKwargs,
    }),
  }, 120000);
  if (!llmRes.ok) throw new Error(`LLM HTTP ${llmRes.status}`);
  const data = await llmRes.json();
  let html = (data.choices?.[0]?.message?.content || '').trim();
  html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
  if (!html) return;

  fs.writeFileSync(path.join(config.APP_ROOT, 'sicherheitslage.json'), JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    html,
  }));
}

module.exports = { run };
