const express = require('express');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const Paperless = require('../../../core/integrations/PaperlessService');

const router = express.Router();

router.get('/api/paperless/meta', async (req, res) => {
  try {
    res.json(await Paperless.getMeta());
  } catch (e) {
    console.error('paperless/meta Fehler:', e.message);
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
});

router.get('/api/paperless/document/:id', async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const doc = await Paperless.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
});

router.get('/api/paperless/download/:id', async (req, res) => {
  if (!getSession(req)) return res.status(401).end();
  try {
    const result = await Paperless.downloadDocument(req.params.id);
    if (!result.ok) return res.status(result.status || 404).end();
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
    result.body.pipe(res);
  } catch (e) {
    res.status(500).end();
  }
});

router.post('/api/paperless/search', async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    res.json(await Paperless.searchDocuments(req.body || {}));
  } catch (e) {
    console.error('paperless/search Fehler:', e.message);
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
});

module.exports = router;
