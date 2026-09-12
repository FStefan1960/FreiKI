const fetch = require('node-fetch');
const crypto = require('crypto');

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

// Leitet aus einem Text einen dateinamentauglichen Slug ab (Kleinbuchstaben, Umlaute
// transkribiert, Sonderzeichen raus, Leerzeichen zu Bindestrichen). Serverseitiges
// Gegenstück zu slugifyForFilename() in public/index.html (dort fürs PNG-/draw.io-Export
// von Diagrammen genutzt) - gleiche Logik, damit Download-Dateinamen app-weit einheitlich
// aussehen statt generischer Namen wie "bild.png" oder des rohen Modus-Schlüssels.
function slugifyForFilename(text, fallback) {
  const slug = String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || fallback;
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
  for (let i = 0; i < length; i++) pw += chars[crypto.randomInt(chars.length)];
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

// Sichtbarer Hinweis, wenn Dokumentinhalt/Nachricht/Verlauf wegen des Zeichenlimits
// (MAX_CONTEXT_CHARS[_MULTI] / MAX_VLLM_CHARS[_MULTI]) gekürzt wurde - vorher landete das
// nur im Server-Log, der Nutzer bekam nie mit, dass ein Teil seiner Eingabe fehlt (siehe Feedback).
const TRUNCATION_NOTICES = {
  de: { doc: 'Der hochgeladene Inhalt war sehr lang und wurde vor der Verarbeitung gekürzt – nicht der komplette Text wurde berücksichtigt.', msg: 'Der Text war zu lang und wurde gekürzt – nicht der komplette Inhalt wurde berücksichtigt.', history: 'Der bisherige Gesprächsverlauf konnte dabei nicht mit einbezogen werden.' },
  en: { doc: 'The uploaded content was very long and was shortened before processing – not all of the text could be taken into account.', msg: 'The text was too long and was shortened – not all of the content could be taken into account.', history: 'The previous conversation history could not be included.' },
  fr: { doc: "Le contenu téléversé était très long et a été raccourci avant traitement – tout le texte n'a pas pu être pris en compte.", msg: "Le texte était trop long et a été raccourci – tout le contenu n'a pas pu être pris en compte.", history: "L'historique de conversation précédent n'a pas pu être inclus." },
  es: { doc: 'El contenido subido era muy largo y se acortó antes de procesarlo – no se pudo tener en cuenta todo el texto.', msg: 'El texto era demasiado largo y se acortó – no se pudo tener en cuenta todo el contenido.', history: 'No se pudo incluir el historial de conversación anterior.' },
  ru: { doc: 'Загруженный контент был очень длинным и был сокращён перед обработкой – не весь текст удалось учесть.', msg: 'Текст был слишком длинным и был сокращён – не всё содержимое удалось учесть.', history: 'Предыдущую историю разговора не удалось включить.' },
  id: { doc: 'Konten yang diunggah sangat panjang dan telah dipersingkat sebelum diproses – tidak semua teks dapat dipertimbangkan.', msg: 'Teks terlalu panjang dan telah dipersingkat – tidak semua konten dapat dipertimbangkan.', history: 'Riwayat percakapan sebelumnya tidak dapat disertakan.' },
  mg: { doc: 'Lava be ny votoaty nalefa ka nohafohezina talohan\'ny nandinihana azy – tsy afaka nodinihina daholo ny lahatsoratra.', msg: 'Lava loatra ny lahatsoratra ka nohafohezina – tsy afaka nodinihana daholo ny votoaty.', history: 'Tsy azo nampidirina ny tantaram-piresahana teo aloha.' },
};

function truncationNotice(userLanguage, ...keys) {
  const n = TRUNCATION_NOTICES[userLanguage] || TRUNCATION_NOTICES.de;
  const text = keys.map(k => n[k]).filter(Boolean).join(' ');
  return `⚠️ *${text}*\n\n`;
}

module.exports = {
  fetchWithTimeout, withRetry, parseFrontmatter, toTitle, normArea,
  htmlAttrEscape, generatePassword, secondsUntilMidnightBerlin, slugifyForFilename,
  truncationNotice,
};
