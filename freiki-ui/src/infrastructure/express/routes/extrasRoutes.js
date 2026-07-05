const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { config } = require('../../../shared/config');
const { getSession } = require('../../../core/auth/AuthMiddleware');

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
router.get('/api/pictograms', async (req, res) => {
  const q = (req.query.q || '').trim();
  const lang = (req.query.lang || 'de').trim();
  if (!q) return res.status(400).json({ error: 'Kein Suchbegriff' });
  try {
    const url = `https://api.arasaac.org/v1/pictograms/${encodeURIComponent(lang)}/search/${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, timeout: 10000 });
    if (!r.ok) return res.status(r.status).json({ error: 'ARASAAC nicht erreichbar' });
    const data = await r.json();
    const results = (Array.isArray(data) ? data : []).slice(0, 40).map(p => ({
      id:      p._id,
      keyword: (p.keywords?.[0]?.keyword) || q,
      url:     `https://static.arasaac.org/pictograms/${p._id}/${p._id}_300.png`,
    }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
