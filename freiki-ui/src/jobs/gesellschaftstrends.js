// Ersatz für den n8n-Workflow "Gesellschaftstrends täglich" - Google-Trends-RSS + SearXNG-Suche
// zu Sozialpolitik + LLM-Zusammenfassung, direkt in gesellschaftstrends.json geschrieben
// (vorher per Self-HTTP-Login mit einem im Workflow hinterlegten Klartext-Passwort).
const fs = require('fs');
const path = require('path');
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');

const QUERY = 'Sozialpolitik OR Sozialleistungen OR Bürgergeld OR Pflegereform OR Rentenpolitik OR Armut';

function parseGoogleTrends(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>[\s\S]*?<\/item>/g)) {
    const block = m[0];
    const title = (block.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
    const traffic = (block.match(/<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/) || [])[1] || '';
    const newsTitle = (block.match(/<ht:news_item_title>([^<]+)<\/ht:news_item_title>/) || [])[1] || '';
    const newsUrl = (block.match(/<ht:news_item_url>([^<]+)<\/ht:news_item_url>/) || [])[1] || '';
    items.push({ title, traffic, newsTitle, newsUrl });
  }
  return items;
}

async function fetchTrends() {
  const r = await fetchWithTimeout('https://trends.google.com/trending/rss?geo=DE', {}, 15000);
  if (!r.ok) return [];
  return parseGoogleTrends(await r.text());
}

async function fetchSocialNews() {
  const url = `${config.SEARXNG_URL}/search?` + new URLSearchParams({
    q: QUERY, format: 'json', language: 'de', time_range: 'day', categories: 'news,general',
  });
  const r = await fetchWithTimeout(url, {}, 20000);
  if (!r.ok) return [];
  return (await r.json()).results || [];
}

async function run() {
  const [trends, news] = await Promise.all([fetchTrends(), fetchSocialNews()]);

  const top20Trends = trends.slice(0, 20);
  const trendsText = top20Trends.map((t, i) =>
    `${i + 1}. ${t.title} (${t.traffic} Suchen) – ${t.newsTitle} | ${t.newsUrl}`
  ).join(' || ');

  const top15News = news.slice(0, 15);
  const newsText = top15News.map((r, i) => `${i + 1}. ${r.title} | ${r.url} | ${r.content || ''}`).join(' || ');

  if (!trendsText && !newsText) return;

  const thinkingKwargs = /qwen/i.test(config.VLLM_MODEL || '') ? { chat_template_kwargs: { enable_thinking: false } } : {};
  const llmRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({
      model: config.VLLM_MODEL,
      max_tokens: 3000,
      messages: [
        { role: 'system', content: 'Du erstellst einen täglichen Überblick über Gesellschaftstrends und aktuelle gesellschaftliche/politische Themen in Deutschland. Strukturiere den Bericht in zwei Teile: 1) "Was bewegt die Gesellschaft" (Google Trends) und 2) "Gesellschaft & Politik aktuell" (Nachrichten). Gib sauberes HTML aus (nur body-Inhalt). Verwende h2 für Abschnitte, ul/li für Einträge mit Titel als Link und 1-2 Sätzen Kontext.' },
        { role: 'user', content: `Google Trends Deutschland heute: ${trendsText} ||| Nachrichten: ${newsText}` },
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

  fs.writeFileSync(path.join(config.APP_ROOT, 'gesellschaftstrends.json'), JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    html,
  }));
}

module.exports = { run };
