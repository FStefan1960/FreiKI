const express = require('express');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const Paperless = require('../../../core/integrations/PaperlessService');
const users = require('../../../core/auth/UserRepository');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

const router = express.Router();

// Paperless-Zugriff ist (wie im Frontend-Modefilter /api/modes) eine einzelne use_paperless-
// Flag pro Nutzer, kein bereichsfeines Recht - live aus der DB, da das JWT veraltet sein kann.
async function hasPaperlessAccess(session) {
  if (!session) return false;
  if (session.role === 'admin') return true;
  try {
    const row = await users.findLiveAreasById(session.uid);
    return !!row?.use_paperless;
  } catch {
    return false;
  }
}

router.get('/api/paperless/meta', asyncHandler(async (req, res) => {
  if (!(await hasPaperlessAccess(getSession(req)))) return res.status(403).json({ error: 'Kein Zugriff auf das Archiv' });
  try {
    res.json(await Paperless.getMeta());
  } catch (e) {
    console.error('paperless/meta Fehler:', e.message);
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
}));

router.get('/api/paperless/document/:id', asyncHandler(async (req, res) => {
  if (!(await hasPaperlessAccess(getSession(req)))) return res.status(403).json({ error: 'Kein Zugriff auf das Archiv' });
  try {
    const doc = await Paperless.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
}));

router.get('/api/paperless/download/:id', asyncHandler(async (req, res) => {
  if (!(await hasPaperlessAccess(getSession(req)))) return res.status(403).end();
  try {
    const result = await Paperless.downloadDocument(req.params.id);
    if (!result.ok) return res.status(result.status || 404).end();
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
    result.body.pipe(res);
  } catch (e) {
    res.status(500).end();
  }
}));

router.post('/api/paperless/search', asyncHandler(async (req, res) => {
  if (!(await hasPaperlessAccess(getSession(req)))) return res.status(403).json({ error: 'Kein Zugriff auf das Archiv' });
  try {
    res.json(await Paperless.searchDocuments(req.body || {}));
  } catch (e) {
    console.error('paperless/search Fehler:', e.message);
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
}));

module.exports = router;
