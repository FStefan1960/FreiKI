const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { config } = require('../../../shared/config');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');
const { fetchWithTimeout } = require('../../../shared/utils/text');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// Siehe FormFillService.js für die ausführliche Begründung (echte Unicode-Schrift statt
// pdf-lib-Standardfonts, wegen Zeichenumrissen/Mehrsprachigkeit).
const SYMBOLS_FONT_PATH = path.join(__dirname, '..', '..', '..', '..', 'fonts', 'DejaVuSans.ttf');

// Siehe FormDialogService.js: chat_template_kwargs nur bei Qwen-Modellen setzen
// (Mistral/FrankKI lehnt unbekannte Felder mit HTTP 422 ab).
const THINKING_KWARGS = /qwen/i.test(config.VLLM_MODEL || '')
  ? { chat_template_kwargs: { enable_thinking: false } }
  : {};

const router = express.Router();

// Instanzspezifische Zusatz-Tools aus public/extras/*.json
router.get('/api/extras', (_req, res) => {
  const dir = path.join(config.PUBLIC_DIR, 'extras');
  try {
    if (!fs.existsSync(dir)) return res.json([]);
    const extras = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } })
      .filter(Boolean);
    res.json(extras);
  } catch (e) { res.json([]); }
});

function jsonFileRoute(routePath, filename) {
  const filePath = path.join(config.APP_ROOT, filename);
  router.get(routePath, (req, res) => {
    if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
    try {
      if (!fs.existsSync(filePath)) return res.json({ date: null });
      res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (e) { console.error(e.message); res.status(500).json({ error: 'Interner Fehler' }); }
  });
}

jsonFileRoute('/api/medienspiegel', 'medienspiegel.json');
jsonFileRoute('/api/gesellschaftstrends', 'gesellschaftstrends.json');
jsonFileRoute('/api/losung', 'losung.json');
jsonFileRoute('/api/sicherheitslage', 'sicherheitslage.json');

// Piktogramm-Suche (ARASAAC)
// Bilder als data:-URLs ausliefern: die CSP erlaubt img-src 'self' data: https:,
// in der Praxis blockiert der Browser aber externe https-Bilder (transferSize 0,
// kein CSP-Violation-Event). data: und Same-Origin funktionieren – daher serverseitig
// laden und als data: bzw. Proxy-URL zurückgeben.
router.get('/api/pictograms', asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  const lang = (req.query.lang || 'de').trim();
  if (!q) return res.status(400).json({ error: 'Kein Suchbegriff' });
  try {
    const url = `https://api.arasaac.org/v1/pictograms/${encodeURIComponent(lang)}/search/${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, timeout: 10000 });
    if (!r.ok) return res.status(r.status).json({ error: 'ARASAAC nicht erreichbar' });
    const data = await r.json();
    const slice = (Array.isArray(data) ? data : []).slice(0, 40);

    const results = await Promise.all(slice.map(async (p) => {
      const id = p._id;
      const keyword = (p.keywords?.[0]?.keyword) || q;
      const proxyUrl = `/api/pictograms/${id}/image`;
      try {
        const ir = await fetch(`https://static.arasaac.org/pictograms/${id}/${id}_300.png`, { timeout: 12000 });
        if (ir.ok) {
          const buf = await ir.buffer();
          const ct = ir.headers.get('content-type') || 'image/png';
          return { id, keyword, url: `data:${ct};base64,${buf.toString('base64')}` };
        }
      } catch (_) { /* Fallback auf Proxy */ }
      return { id, keyword, url: proxyUrl };
    }));

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}));

router.get('/api/pictograms/:id/image', asyncHandler(async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'Ungültige ID' });
  const upstream = `https://static.arasaac.org/pictograms/${id}/${id}_300.png`;
  try {
    const r = await fetch(upstream, { timeout: 15000 });
    if (!r.ok) return res.status(r.status).send('Bild nicht verfügbar');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Disposition', `inline; filename="pictogram-${id}.png"`);
    r.body.pipe(res);
  } catch (e) {
    res.status(502).json({ error: 'ARASAAC-Bild nicht erreichbar' });
  }
}));

// ── Leichte Sprache + Symbole ──
// Cache für ARASAAC-Suchergebnisse (Kandidatenlisten): der Wortschatz in Leichte-Sprache-
// Texten wiederholt sich stark (trinken, Termin, Arzt, Pause, ...) - vermeidet wiederholte
// Außen-Calls für dieselben Begriffe. Nur Treffer werden gecacht, keine Fehlschläge
// (ein vorübergehend nicht erreichbares ARASAAC soll sich nicht dauerhaft festsetzen).
const PICTOGRAM_CACHE = new Map();
const PICTOGRAM_CACHE_MAX = 500;
const CANDIDATES_PER_LINE = 4;

// Liefert bis zu `limit` Kandidaten für ein Suchwort (mit Bild als data:-URL, siehe
// /api/pictograms oben). Die automatische Auswahl von Treffer #1 hat sich in der Praxis
// als zu unzuverlässig erwiesen - stattdessen wählt die Nutzerin/der Nutzer im Frontend
// pro Zeile selbst aus (siehe symbolsWizard* in index.html).
async function fetchPictogramCandidates(keyword, lang) {
  const cacheKey = `${lang}:${keyword.toLowerCase()}`;
  if (PICTOGRAM_CACHE.has(cacheKey)) return PICTOGRAM_CACHE.get(cacheKey);

  try {
    const url = `https://api.arasaac.org/v1/pictograms/${encodeURIComponent(lang)}/search/${encodeURIComponent(keyword)}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, timeout: 10000 });
    if (!r.ok) return [];
    const data = await r.json();
    const slice = (Array.isArray(data) ? data : []).slice(0, CANDIDATES_PER_LINE);

    const candidates = (await Promise.all(slice.map(async (p) => {
      const id = p._id;
      try {
        const ir = await fetch(`https://static.arasaac.org/pictograms/${id}/${id}_300.png`, { timeout: 12000 });
        if (!ir.ok) return null;
        const buf = await ir.buffer();
        const ct = ir.headers.get('content-type') || 'image/png';
        return { id, keyword: (p.keywords?.[0]?.keyword) || keyword, url: `data:${ct};base64,${buf.toString('base64')}` };
      } catch (_) { return null; }
    }))).filter(Boolean);

    if (candidates.length) {
      if (PICTOGRAM_CACHE.size >= PICTOGRAM_CACHE_MAX) {
        PICTOGRAM_CACHE.delete(PICTOGRAM_CACHE.keys().next().value);
      }
      PICTOGRAM_CACHE.set(cacheKey, candidates);
    }
    return candidates;
  } catch (_) {
    return [];
  }
}

// Nimmt eine bereits fertige Leichte-Sprache-Antwort (siehe prompts/4leichte_sprache.md,
// ein Gedanke pro Zeile/Absatz) und liefert pro Zeile mehrere ARASAAC-Kandidaten statt
// einer automatischen Auswahl. Bewusst zweistufig statt den Leichte-Sprache-Prompt selbst
// zu ändern: die Symbolsuche ist optional (Button "+ Symbole") und soll die eigentliche
// Übersetzung nicht verlangsamen/riskieren.
router.post('/api/leichte-sprache/symbols', express.json({ limit: '200kb' }), asyncHandler(async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Kein Text' });

  // **fett**-Markierungen entfernen: die Leichte-Sprache-Signaturzeile ("**Hierbei hat
  // KorKI geholfen**") kommt als Markdown-Rohtext an, im Wizard soll aber nur der reine
  // Text erscheinen.
  const rawLines = text.split(/\n+/).map(l => l.trim().replace(/\*\*/g, '')).filter(Boolean);
  if (!rawLines.length) return res.json({ lines: [] });

  let keywords = rawLines.map(() => null);
  try {
    const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: 'Gib zu jeder nummerierten Zeile GENAU EIN deutsches Suchwort (Nomen im Singular oder Verb im Infinitiv) zurück, das den Kerninhalt der Zeile für eine Piktogramm-Suche beschreibt. Antworte AUSSCHLIESSLICH mit einem JSON-Array aus Strings in derselben Reihenfolge wie die Zeilen, keine Erklärung. /no_think' },
          { role: 'user', content: rawLines.map((l, i) => `${i + 1}. ${l}`).join('\n') },
        ],
        max_tokens: 500, temperature: 0.1,
        ...THINKING_KWARGS,
      }),
    }, 20_000);
    if (r.ok) {
      const json = await r.json();
      const raw = (json.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) keywords = rawLines.map((_, i) => (typeof parsed[i] === 'string' ? parsed[i] : null));
      }
    }
  } catch (e) { console.error('Keyword-Extraktion für Symbole fehlgeschlagen:', e.message); }

  const lines = await Promise.all(rawLines.map(async (lineText, i) => {
    const keyword = keywords[i];
    const candidates = keyword ? await fetchPictogramCandidates(keyword, 'de') : [];
    return { text: lineText, keyword, candidates };
  }));

  res.json({ lines });
}));

// Baut aus den im Wizard bestätigten Zeilen (Text + optionales Piktogramm) ein PDF -
// robuster als ein Word-Export mit eingebetteten Bildern, gleiches Font-/Embedding-Muster
// wie FormFillService.fillFormToPdfBuffer.
router.post('/api/leichte-sprache/symbols/pdf', express.json({ limit: '15mb' }), asyncHandler(async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!lines.length) return res.status(400).json({ error: 'Keine Zeilen' });

  const PAGE_WIDTH = 595.28;  // A4 hoch, in PDF-Punkten (1/72 Zoll)
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 40;
  const ICON_SIZE = 60;
  const ROW_GAP = 16;
  const FONT_SIZE = 14;
  const LINE_HEIGHT = 18;
  const TEXT_X = MARGIN + ICON_SIZE + 16;
  const TEXT_MAX_WIDTH = PAGE_WIDTH - TEXT_X - MARGIN;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fs.readFileSync(SYMBOLS_FONT_PATH), { subset: true });

  function wrapText(text, maxWidth) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const out = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, FONT_SIZE) > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
    return out.length ? out : [''];
  }

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  for (const line of lines) {
    const wrapped = wrapText(line.text, TEXT_MAX_WIDTH);
    const rowHeight = Math.max(ICON_SIZE, wrapped.length * LINE_HEIGHT);

    if (y - rowHeight < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }

    const rowTop = y;
    if (line.imageDataUrl && /^data:image\/png;base64,/.test(line.imageDataUrl)) {
      try {
        const base64 = line.imageDataUrl.split(',')[1];
        const img = await pdfDoc.embedPng(Buffer.from(base64, 'base64'));
        page.drawImage(img, { x: MARGIN, y: rowTop - ICON_SIZE, width: ICON_SIZE, height: ICON_SIZE });
      } catch (_) { /* Bild überspringen, Text bleibt lesbar */ }
    }

    wrapped.forEach((textLine, i) => {
      page.drawText(textLine, {
        x: TEXT_X,
        y: rowTop - FONT_SIZE - (i * LINE_HEIGHT),
        size: FONT_SIZE,
        font,
        maxWidth: TEXT_MAX_WIDTH,
      });
    });

    y = rowTop - rowHeight - ROW_GAP;
  }

  const buffer = Buffer.from(await pdfDoc.save());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="leichte-sprache-symbole.pdf"');
  res.send(buffer);
}));

module.exports = router;
