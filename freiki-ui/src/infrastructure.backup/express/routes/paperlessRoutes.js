const express = require('express');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const Paperless = require('../../../core/integrations/PaperlessService');
const users = require('../../../core/auth/UserRepository');
const { normArea } = require('../../../shared/utils/text');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

const router = express.Router();
router.use(express.json({ limit: '256kb' }));

// Paperless-Zugriff ist zweistufig: use_paperless schaltet das Archiv grundsätzlich frei,
// use_areas grenzt danach auf einzelne Bereichs-Tags (bereich-<area> in Paperless) ein - live
// aus der DB, da das JWT veraltet sein kann. Anders als das use_areas-Verhalten bei der
// Wissensdatenbank (leer = uneingeschränkt) gilt hier bewusst: kein gesetzter Bereich = kein
// Zugriff, auf Nutzerwunsch strenger als der Rest der App.
async function getPaperlessAuth(session) {
  if (!session) return { ok: false };
  if (session.role === 'admin') return { ok: true, admin: true, allowedAreas: null };
  try {
    const row = await users.findLiveAreasById(session.uid);
    if (!row?.use_paperless) return { ok: false };
    const allowedAreas = (row.use_areas || []).map(normArea).filter(Boolean);
    if (!allowedAreas.length) return { ok: false };
    return { ok: true, admin: false, allowedAreas };
  } catch {
    return { ok: false };
  }
}

// Prüft, ob ein Dokument mindestens einen Bereich hat, auf den der Nutzer laut allowedAreas
// Zugriff hat - Dokumente ganz ohne bereich-Tag sind für eingeschränkte Nutzer damit nie sichtbar.
function hasDocAccess(auth, bereiche) {
  return auth.admin || (bereiche || []).some(b => auth.allowedAreas.includes(b));
}

router.get('/api/paperless/meta', asyncHandler(async (req, res) => {
  const auth = await getPaperlessAuth(getSession(req));
  if (!auth.ok) return res.status(403).json({ error: 'Kein Zugriff auf das Archiv' });
  try {
    res.json(await Paperless.getMeta());
  } catch (e) {
    console.error('paperless/meta Fehler:', e.message);
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
}));

router.get('/api/paperless/document/:id', asyncHandler(async (req, res) => {
  const auth = await getPaperlessAuth(getSession(req));
  if (!auth.ok) return res.status(403).json({ error: 'Kein Zugriff auf das Archiv' });
  try {
    const doc = await Paperless.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden' });
    if (!hasDocAccess(auth, doc.bereiche)) return res.status(403).json({ error: 'Kein Zugriff auf dieses Dokument' });
    const { bereiche, ...docOut } = doc;
    res.json(docOut);
  } catch (e) {
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
}));

router.get('/api/paperless/download/:id', asyncHandler(async (req, res) => {
  const auth = await getPaperlessAuth(getSession(req));
  if (!auth.ok) return res.status(403).end();
  try {
    const result = await Paperless.downloadDocument(req.params.id);
    if (!result.ok) return res.status(result.status || 404).end();
    if (!hasDocAccess(auth, result.meta.bereiche)) return res.status(403).end();
    const file = await result.fetchBody();
    if (!file.ok) return res.status(file.status || 404).end();
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    file.body.pipe(res);
  } catch (e) {
    res.status(500).end();
  }
}));

router.post('/api/paperless/search', asyncHandler(async (req, res) => {
  const auth = await getPaperlessAuth(getSession(req));
  if (!auth.ok) return res.status(403).json({ error: 'Kein Zugriff auf das Archiv' });
  try {
    const result = await Paperless.searchDocuments(req.body || {});
    const docs = result.docs
      .filter(d => hasDocAccess(auth, d.bereiche))
      .map(({ bereiche, ...docOut }) => docOut);
    res.json({ count: docs.length, docs });
  } catch (e) {
    console.error('paperless/search Fehler:', e.message);
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
}));

module.exports = router;
