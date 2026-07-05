const fetch = require('node-fetch');

function fetchWithTimeout(url, options, ms = 120_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
}

async function withRetry(fn, retries = 2, delayMs = 1000) {
  try { return await fn(); }
  catch (e) {
    if (retries <= 0) throw e;
    await new Promise(r => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { meta: {}, body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: content };
  const yamlStr = content.slice(4, end);
  const body = content.slice(end + 4).trim();
  const meta = {};
  yamlStr.split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (key) meta[key] = val;
  });
  return { meta, body };
}

function toTitle(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Bereichscode normalisieren (optionales w_-Präfix entfernen)
function normArea(a) {
  return String(a || '').toLowerCase().trim().replace(/^w_/, '');
}

function htmlAttrEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Zufallspasswort ohne verwechselbare Zeichen (0/O, 1/l/I)
function generatePassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < length; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

// Sekunden bis Mitternacht (Europe/Berlin) – Token stirbt synchron zum
// client-seitigen Mitternachts-Cutoff, damit beide Seiten übereinstimmen.
function secondsUntilMidnightBerlin() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Berlin', hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  const secondsPassedToday = (parseInt(parts.hour, 10) % 24) * 3600
    + parseInt(parts.minute, 10) * 60 + parseInt(parts.second, 10);
  return 86400 - secondsPassedToday;
}

module.exports = {
  fetchWithTimeout, withRetry, parseFrontmatter, toTitle, normArea,
  htmlAttrEscape, generatePassword, secondsUntilMidnightBerlin,
};
