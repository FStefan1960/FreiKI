const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { config } = require('../../../shared/config');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

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

module.exports = router;
