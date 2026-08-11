const fetch = require('node-fetch');
const { config } = require('../../shared/config');

async function webSearch(query) {
  try {
    const url = `${config.SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&language=de`;
    const res = await fetch(url);
    const data = await res.json();
    const results = (data.results || []).slice(0, config.SEARXNG_RESULTS);
    if (!results.length) return '';
    return results.map((r, i) =>
      `[${i + 1}] ${r.title}\n${r.url}\n${r.content || ''}`
    ).join('\n\n');
  } catch (e) {
    console.error('SearXNG Fehler:', e.message);
    return '';
  }
}

// Wie webSearch(), aber als strukturierte Titel/URL-Paare statt vorformatiertem LLM-Kontext-
// Text - für Stellen, die die Trefferliste selbst rendern (z.B. Scanner-Manual-Suche), statt
// sie an ein Sprachmodell weiterzureichen.
async function searchLinks(query, limit = 4) {
  try {
    const url = `${config.SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&language=de`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).slice(0, limit).map(r => ({ title: r.title, url: r.url }));
  } catch (e) {
    console.error('SearXNG Fehler:', e.message);
    return [];
  }
}

module.exports = { webSearch, searchLinks };
