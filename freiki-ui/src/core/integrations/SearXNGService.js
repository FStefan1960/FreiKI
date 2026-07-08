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

module.exports = { webSearch };
