const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { config } = require('../../../shared/config');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { uploadFormScan } = require('../../../infrastructure/storage/FileStorage');
const { rasterizePdfToPngs } = require('../../../core/documents/OCRService');
const templates = require('../../../core/forms/FormTemplateRepository');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

const SLUG_RE = /^[a-z][a-z0-9-]{1,49}$/;
const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,49}$/;
const FIELD_TYPES = new Set(['text', 'number', 'date', 'checkbox']);

// Formularvorlagen dürfen Admins und Manager anlegen/bearbeiten (wie /api/kb-upload) -
// bewusst kein reines requireAdmin, da Manager Wissensinhalte in FreiKI generell pflegen.
function requireAdminOrManager(req, res, next) {
  const s = getSession(req);
  if (!s || !['admin', 'manager'].includes(s.role)) {
    return res.status(403).json({ error: 'Keine Berechtigung. Nur Admins und Manager können Formularvorlagen verwalten.' });
  }
  req.session = s;
  next();
}
// Bewusst NICHT unter /api/admin/*: dieses Pfadpräfix wird in adminRoutes.js bereits global auf
// role==='admin' beschränkt (router.use('/api/admin', requireAdmin), vor diesem Router in app.js
// eingehängt) - Manager kämen dort nie durch. Auf /api/form-templates beschränkt statt
// router.use(requireAdminOrManager) ohne Pfad: dieser Router hängt in app.js an der Wurzel
// (app.use(require('./routes/adminFormRoutes'))), ein pfadloses .use() würde JEDEN Request
// blockieren, der hier durchläuft - auch /api/health, /api/chat etc. (siehe identischer
// Kommentar zu requireAdmin in adminRoutes.js).
router.use('/api/form-templates', requireAdminOrManager);

router.get('/api/form-templates', asyncHandler(async (req, res) => {
  res.json({ ok: true, templates: await templates.listTemplates() });
}));

router.get('/api/form-templates/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const template = await templates.getTemplateById(id);
  if (!template) return res.status(404).json({ error: 'Vorlage nicht gefunden.' });
  const [pages, fields] = await Promise.all([templates.listPages(id), templates.listFields(id)]);
  res.json({
    ok: true, template,
    pages: pages.map(p => ({ pageNumber: p.page_number, url: `/api/form-templates/${id}/pages/${p.page_number}/image` })),
    fields,
  });
}));

router.get('/api/form-templates/:id/pages/:pageNumber/image', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const pageNumber = parseInt(req.params.pageNumber, 10);
  const pages = await templates.listPages(id);
  const page = pages.find(p => p.page_number === pageNumber);
  if (!page || !fs.existsSync(page.image_path)) return res.status(404).json({ error: 'Seite nicht gefunden.' });
  res.type('png').sendFile(page.image_path);
}));

router.post('/api/form-templates', uploadFormScan.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen.' });
  const cleanup = () => { try { fs.unlinkSync(req.file.path); } catch (_) {} };

  const slug = (req.body.slug || '').toLowerCase().trim();
  const title = (req.body.title || '').trim();
  if (!SLUG_RE.test(slug)) { cleanup(); return res.status(400).json({ error: 'Ungültiger Kurzname (nur a-z, 0-9, Bindestrich, min. 2 Zeichen).' }); }
  if (!title) { cleanup(); return res.status(400).json({ error: 'Titel erforderlich.' }); }
  if (await templates.getTemplateBySlug(slug)) { cleanup(); return res.status(409).json({ error: 'Kurzname bereits vergeben.' }); }

  let rasterDir = null;
  try {
    let sourcePngs;
    if (req.file.mimetype === 'application/pdf') {
      const r = rasterizePdfToPngs(req.file.path);
      rasterDir = r.dir;
      sourcePngs = r.pages;
    } else {
      rasterDir = `/tmp/form_scan_uploads/single-${Date.now()}`;
      fs.mkdirSync(rasterDir, { recursive: true });
      const pngPath = path.join(rasterDir, 'page-1.png');
      if (req.file.mimetype === 'image/png') {
        fs.copyFileSync(req.file.path, pngPath);
      } else {
        execFileSync('magick', ['convert', req.file.path, pngPath], { timeout: 30000 });
      }
      sourcePngs = [pngPath];
    }

    const destDir = path.join(config.FORM_TEMPLATES_DIR, slug);
    fs.mkdirSync(destDir, { recursive: true });

    const template = await templates.createTemplate({ slug, title, description: req.body.description, createdBy: req.session.uid });
    const pages = [];
    for (let i = 0; i < sourcePngs.length; i++) {
      const pageNumber = i + 1;
      const destPath = path.join(destDir, `page-${pageNumber}.png`);
      fs.copyFileSync(sourcePngs[i], destPath);
      await templates.addPage(template.id, pageNumber, destPath);
      pages.push({ pageNumber, url: `/api/form-templates/${template.id}/pages/${pageNumber}/image` });
    }

    res.json({ ok: true, template, pages });
  } finally {
    cleanup();
    if (rasterDir) fs.rmSync(rasterDir, { recursive: true, force: true });
  }
}));

router.patch('/api/form-templates/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, description, active } = req.body || {};
  const updated = await templates.updateTemplate(id, { title, description, active });
  if (!updated) return res.status(404).json({ error: 'Vorlage nicht gefunden.' });
  res.json({ ok: true, template: updated });
}));

router.put('/api/form-templates/:id/fields', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const template = await templates.getTemplateById(id);
  if (!template) return res.status(404).json({ error: 'Vorlage nicht gefunden.' });

  const fields = Array.isArray(req.body?.fields) ? req.body.fields : null;
  if (!fields) return res.status(400).json({ error: 'Feldliste erforderlich.' });

  const seen = new Set();
  for (const f of fields) {
    if (!FIELD_KEY_RE.test(f.field_key || '')) return res.status(400).json({ error: `Ungültiger Feldname: ${f.field_key}` });
    if (seen.has(f.field_key)) return res.status(400).json({ error: `Feldname doppelt: ${f.field_key}` });
    seen.add(f.field_key);
    if (!FIELD_TYPES.has(f.field_type)) return res.status(400).json({ error: `Ungültiger Feldtyp: ${f.field_type}` });
    if (!f.question_text || !String(f.question_text).trim()) return res.status(400).json({ error: `Fragetext fehlt für ${f.field_key}` });
    for (const k of ['x', 'y', 'width', 'height']) {
      const v = Number(f[k]);
      if (!Number.isFinite(v) || v < 0 || v > 1) return res.status(400).json({ error: `Ungültige Koordinate (${k}) für ${f.field_key}` });
    }
    if (!Number.isInteger(f.page_number) || f.page_number < 1) return res.status(400).json({ error: `Ungültige Seitenzahl für ${f.field_key}` });
  }

  await templates.setFields(id, fields);
  res.json({ ok: true, fields: await templates.listFields(id) });
}));

router.delete('/api/form-templates/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const template = await templates.getTemplateById(id);
  if (!template) return res.status(404).json({ error: 'Vorlage nicht gefunden.' });
  await templates.deleteTemplate(id);
  fs.rmSync(path.join(config.FORM_TEMPLATES_DIR, template.slug), { recursive: true, force: true });
  res.json({ ok: true });
}));

module.exports = router;
