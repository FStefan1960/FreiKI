// Ersatz für den n8n-Workflow "Medienspiegel täglich" - SearXNG-Suche + LLM-Zusammenfassung,
// direkt in medienspiegel.json geschrieben (vorher per Self-HTTP-Login mit einem im Workflow
// hinterlegten Klartext-Passwort - entfällt hier, da der Job im selben Prozess läuft wie die
// Route, die die Datei liest).
const fs = require('fs');
const path = require('path');
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');

const QUERY = 'Deutschland OR Politik OR Wirtschaft OR Gesellschaft OR Klima OR Gesundheit OR Digitalisierung OR "Künstliche Intelligenz"';

async function searxSearch() {
  const url = `${config.SEARXNG_URL}/search?` + new URLSearchParams({
    q: QUERY, format: 'json', language: 'de', time_range: 'day', categories: 'news,general',
  });
  const r = await fetchWithTimeout(url, {}, 20000);
  if (!r.ok) throw new Error(`SearXNG HTTP ${r.status}`);
  const data = await r.json();
  return data.results || [];
}

// Nur <li>-Punkte behalten, deren Link wörtlich aus den echten Suchergebnissen stammt - schützt
// gegen vom LLM erfundene Meldungen/URLs (siehe n8n-Original-Kommentar dazu).
function filterHallucinatedLinks(html, allowedUrls) {
  const filtered = html.replace(/<li>[\s\S]*?<\/li>/gi, (li) => {
    const m = li.match(/<a\s+href="([^"]+)"/i);
    return (m && allowedUrls.has(m[1])) ? li : '';
  });
  return filtered.replace(/<h2>[^<]*<\/h2>\s*<ul>\s*<\/ul>/gi, '').trim();
}

async function run() {
  const results = await searxSearch();
  const top = results.slice(0, 20);

  // Kein Fallback auf LLM-Wissen: ohne echte Suchergebnisse lieber nichts speichern, statt
  // einen erfundenen Medienspiegel mit toten Links zu erzeugen (SearXNG liefert an schlechten
  // Tagen 0 Treffer, wenn Engines geblockt/CAPTCHA sind).
  if (!top.length) return;

  const allowedUrls = new Set(top.map((r) => r.url));
  const text = top.map((r, i) => `${i + 1}. ${r.title} | ${r.url} | ${r.content || ''}`).join(' || ');

  const thinkingKwargs = /qwen/i.test(config.VLLM_MODEL || '') ? { chat_template_kwargs: { enable_thinking: false } } : {};
  const llmRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({
      model: config.VLLM_MODEL,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: 'Du erstellst einen täglichen Medienspiegel ausschließlich aus den unten gelieferten Suchergebnissen. Erfinde NIEMALS eigene Meldungen, Titel, Daten oder URLs. Verwende für jeden Listenpunkt exakt eine URL wörtlich aus den Suchergebnissen (kein Ändern, Kürzen oder Raten der URL). Wenn zu einem Thema keine passende Meldung in den Suchergebnissen vorhanden ist, lass das Thema komplett weg. Wenn insgesamt keine relevanten Meldungen dabei sind, gib nur "<p>Keine relevanten Meldungen heute.</p>" aus. Gib sauberes HTML aus (nur body-Inhalt). Verwende h2 für Themenblöcke, ul/li für Meldungen mit Titel als Link und 1-2 Sätzen.' },
        { role: 'user', content: `Suchergebnisse von heute: ${text}` },
      ],
      ...thinkingKwargs,
    }),
  }, 120000);
  if (!llmRes.ok) throw new Error(`LLM HTTP ${llmRes.status}`);
  const data = await llmRes.json();
  let html = (data.choices?.[0]?.message?.content || '').trim();
  html = html.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  html = html.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
  if (!html) return;

  const safeHtml = filterHallucinatedLinks(html, allowedUrls);
  if (!/<li>/i.test(safeHtml)) return; // alle Meldungen ohne echten Suchtreffer verworfen

  fs.writeFileSync(path.join(config.APP_ROOT, 'medienspiegel.json'), JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    html: safeHtml,
  }));
}

module.exports = { run };
