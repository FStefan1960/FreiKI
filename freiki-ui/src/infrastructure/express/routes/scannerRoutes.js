const express = require('express');
const fetch = require('node-fetch');
const { config } = require('../../../shared/config');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');
const { fetchWithTimeout } = require('../../../shared/utils/text');
const { searchLinks } = require('../../../core/integrations/SearXNGService');

const router = express.Router();
router.use(express.json({ limit: '20kb' }));

// Siehe FormDialogService.js: chat_template_kwargs nur bei Qwen-Modellen setzen
// (Mistral/FrankKI lehnt unbekannte Felder mit HTTP 422 ab).
const THINKING_KWARGS = /qwen/i.test(config.VLLM_MODEL || '')
  ? { chat_template_kwargs: { enable_thinking: false } }
  : {};

// Feste Aktions-Vokabular: das LLM darf nur aus diesen Typen wählen (Prompt-Anweisung),
// serverseitig zusätzlich hart gefiltert - eine Halluzination des Modells kann so höchstens
// dazu führen, dass gar kein Button erscheint, nie zu einer unbekannten/unsicheren Aktion
// im Frontend.
const KNOWN_ACTION_TYPES = new Set(['open_url', 'ean_lookup', 'save_contact', 'send_email', 'wifi_info', 'web_lookup']);

// Ordnet einem gescannten QR-/Barcode-Inhalt per LLM mögliche Folgeaktionen zu (z.B. Link
// öffnen, Produktsuche). Bewusst als reine Klassifikation gebaut, nicht als Ausführung -
// das Modell schlägt nur Buttons vor, die eigentliche Aktion (externer Link, Produkt-Lookup)
// übernimmt fest verdrahteter Frontend-/Backend-Code.
router.post('/api/scanner/analyze', asyncHandler(async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  const format = String(req.body?.format || '').trim().slice(0, 40);
  if (!text) return res.status(400).json({ error: 'Kein Text' });

  try {
    const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Du bekommst den Inhalt eines gescannten QR-/Barcodes und sein erkanntes Format. '
              + 'Bestimme, welche der folgenden Aktionen sinnvoll sind, und gib NUR ein JSON-Array zurück, keine Erklärung.\n\n'
              + 'Erlaubte Aktions-Typen:\n'
              + '- "open_url": der Inhalt ist eine aufrufbare Web-Adresse (http/https)\n'
              + '- "ean_lookup": der Inhalt ist ein numerischer Produkt-Barcode (EAN/UPC), zu dem sich Produktinfos abrufen lassen\n'
              + '- "save_contact": der Inhalt ist eine vCard (beginnt mit BEGIN:VCARD)\n'
              + '- "send_email": der Inhalt ist ein mailto:-Link\n'
              + '- "wifi_info": der Inhalt ist ein WLAN-QR-Code (beginnt mit WIFI:)\n'
              + '- "web_lookup": der Inhalt ist ein sonstiger Produkt-/Artikelcode ohne eigene Struktur oben '
              + '(z.B. PZN/Pharmazentralnummer, ITF- oder Code-39-Artikelnummer wie bei IKEA), zu dem sich online '
              + 'nachschlagen ließe\n\n'
              + 'Format je Eintrag: {"type": "open_url"|"ean_lookup"|"save_contact"|"send_email"|"wifi_info"|"web_lookup", "label": "kurzer deutscher Button-Text"}\n'
              + 'Gib ein leeres Array [] zurück, wenn keine Aktion zutrifft (z.B. reiner Freitext). /no_think',
          },
          { role: 'user', content: `Format: ${format || 'unbekannt'}\nInhalt: ${text}` },
        ],
        max_tokens: 200,
        temperature: 0.1,
        ...THINKING_KWARGS,
      }),
    }, 15_000);

    const data = await r.json();
    const raw = (data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = raw.match(/\[[\s\S]*\]/);
    let actions = [];
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          actions = parsed
            .filter(a => a && KNOWN_ACTION_TYPES.has(a.type))
            .slice(0, 3)
            .map(a => ({ type: a.type, label: String(a.label || '').slice(0, 60) || null }));
        }
      } catch (_) { /* kein valides JSON - actions bleibt leer */ }
    }
    res.json({ actions });
  } catch (e) {
    console.error('scanner/analyze fehlgeschlagen:', e.message);
    res.json({ actions: [] });
  }
}));

// EAN/UPC-Produktsuche über Open Food Facts (öffentliche API, kein Key nötig). Deckt primär
// Lebensmittel/Konsumgüter ab, viele andere Hersteller sind aber ebenfalls registriert -
// reicht als erster Produkt-Hinweis, ohne eigene Produktdatenbank aufzubauen.
router.get('/api/barcode/product', asyncHandler(async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const code = String(req.query.code || '').trim();
  if (!/^\d{6,14}$/.test(code)) return res.status(400).json({ error: 'Ungültiger Code' });

  try {
    const r = await fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,image_front_small_url,quantity`,
      { headers: { 'User-Agent': 'FreiKI-Scanner/1.0 (+https://freiki.com)' } },
      8000
    );
    if (!r.ok) return res.json({ found: false });
    const data = await r.json();
    if (data.status !== 1 || !data.product) return res.json({ found: false });
    const p = data.product;
    res.json({
      found: true,
      title: p.product_name || null,
      brand: p.brands || null,
      quantity: p.quantity || null,
      image: p.image_front_small_url || null,
    });
  } catch (e) {
    res.json({ found: false });
  }
}));

// Bedienungsanleitung zu einem per EAN gefundenen Produkt suchen (SearXNG, dieselbe Web-
// Recherche-Infrastruktur wie der Chat-Modus "Web-Recherche"). Liefert nur Titel/URL - die
// Ergebnisse sind fremde Websites, das Frontend markiert sie entsprechend als externe Links.
router.get('/api/barcode/manual', asyncHandler(async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const title = String(req.query.title || '').trim().slice(0, 200);
  const brand = String(req.query.brand || '').trim().slice(0, 100);
  if (!title) return res.status(400).json({ error: 'Kein Produktname' });

  const query = `${brand} ${title} Bedienungsanleitung PDF`.trim();
  const results = await searchLinks(query, 4);
  res.json({ results });
}));

// Anders als EAN/UPC gibt es für PZN (Pharmazentralnummer, meist Code 39), ITF-Artikel-
// nummern (z.B. IKEA) oder sonstige Barcode-Formate keine einzelne freie Lookup-API -
// stattdessen generische SearXNG-Suche mit einem formatabhängigen Hinweiswort, das die
// Trefferqualität deutlich verbessert (reine Ziffernfolge allein streut zu breit).
// "PZN Pharmazentralnummer <Code>" als Suchbegriff landet bei Definitionsseiten ("was ist
// eine PZN"), nicht beim Produkt selbst - "Beipackzettel" ist dagegen das Zielwort, das auch
// Apotheken-Umschau & Co. selbst in Titel/URL ihrer Produktseiten führen (Beispiel:
// ".../Beipackzettel/TEUFELSKRALLE-KAPSELN-7450516.html"). Der Code steht zusätzlich als
// exakte Phrase VORNE in der Query, damit Suchmaschinen ihn als festen Bestandteil werten
// statt ihn mit den übrigen Wörtern zu vermischen.
const FORMAT_SEARCH_HINTS = {
  CODE_39: 'Beipackzettel PZN',
  CODE_93: 'Artikelnummer',
  CODE_128: 'Artikelnummer',
  ITF: 'Artikelnummer',
  CODABAR: 'Artikelnummer',
};

router.get('/api/barcode/websearch', asyncHandler(async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const code = String(req.query.code || '').trim().slice(0, 100);
  const format = String(req.query.format || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Kein Code' });

  const hint = FORMAT_SEARCH_HINTS[format] || 'Produktcode';
  const results = await searchLinks(`"${code}" ${hint}`, 4);
  res.json({ results });
}));

module.exports = router;
