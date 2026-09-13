const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../../../../shared/config');
const { getBrandConfig, updateBrandConfig, ALLOWED_FIELDS, publishBreakingNews, clearBreakingNews } = require('../../../../shared/config/BrandConfig');
const auditLog = require('../../../../core/audit/AdminAuditRepository');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');
const { slugifyForFilename } = require('../../../../shared/utils/text');
const { uploadPptxTemplate } = require('../../../storage/FileStorage');
const pptxTemplateRepo = require('../../../../core/documents/PptxTemplateRepository');
const pptxTemplateService = require('../../../../core/documents/PptxTemplateService');

const router = express.Router();

router.get('/api/admin/brand-config', (req, res) => {
  const b = getBrandConfig();
  res.json(Object.fromEntries(ALLOWED_FIELDS.map((k) => [k, b[k]])));
});

router.post('/admin/config', asyncHandler(async (req, res) => {
  try {
    await updateBrandConfig(req.body);
    res.json({ ok: true });
  } catch (e) {
    console.error('Fehler beim Speichern der Konfiguration:', e.message);
    res.status(500).json({ error: 'Fehler beim Speichern' });
  }
}));

// ── Breaking News (Login-Hinweis, siehe BrandConfig.publishBreakingNews) ──
router.get('/api/admin/breaking-news', (req, res) => {
  const b = getBrandConfig();
  res.json({ text: b.breakingNewsText || '', version: b.breakingNewsVersion || 0 });
});

router.post('/api/admin/breaking-news', asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Text erforderlich' });
  try {
    await publishBreakingNews(text);
    auditLog.log(req.admin, 'breaking_news.publish', { version: getBrandConfig().breakingNewsVersion });
    res.json({ ok: true });
  } catch (e) {
    console.error('breaking-news publish:', e.message);
    res.status(500).json({ error: 'Fehler beim Veröffentlichen' });
  }
}));

router.delete('/api/admin/breaking-news', asyncHandler(async (req, res) => {
  try {
    await clearBreakingNews();
    auditLog.log(req.admin, 'breaking_news.clear', {});
    res.json({ ok: true });
  } catch (e) {
    console.error('breaking-news clear:', e.message);
    res.status(500).json({ error: 'Fehler beim Zurückziehen' });
  }
}));

// PPTX-Export-Vorlagen (siehe PptxTemplateService.js/PptxTemplateRepository.js) - Upload,
// Liste und Löschen sind bewusst admin-only (anders als Formular-Vorlagen, die auch Manager
// pflegen dürfen): eine PPTX-Vorlage prägt das Branding aller Nutzer:innen der Instanz.
router.get('/api/admin/pptx-templates', asyncHandler(async (req, res) => {
  res.json({ ok: true, templates: await pptxTemplateRepo.listTemplates() });
}));

router.post('/api/admin/pptx-templates', uploadPptxTemplate.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen.' });
  const cleanupUpload = () => { try { fs.unlinkSync(req.file.path); } catch (_) {} };

  const label = (req.body.label || '').trim();
  if (!label) { cleanupUpload(); return res.status(400).json({ error: 'Anzeigename erforderlich.' }); }

  let key = slugifyForFilename(label, 'vorlage');
  const existingKeys = new Set([
    ...Object.keys(pptxTemplateService.TEMPLATES),
    ...(await pptxTemplateRepo.listTemplates()).map(t => t.key),
  ]);
  if (existingKeys.has(key)) {
    let n = 2;
    while (existingKeys.has(`${key}-${n}`)) n++;
    key = `${key}-${n}`;
  }

  let candidateBuffer;
  try {
    candidateBuffer = fs.readFileSync(req.file.path);
    if (/\.potx$/i.test(req.file.originalname)) {
      candidateBuffer = await pptxTemplateService.convertPotxToPptxBuffer(candidateBuffer);
    }
  } catch (e) {
    cleanupUpload();
    return res.status(400).json({ error: 'Datei konnte nicht gelesen werden: ' + e.message });
  }

  const filename = `${crypto.randomUUID()}.pptx`;
  const destPath = path.join(config.PPTX_UPLOAD_DIR, filename);
  fs.writeFileSync(destPath, candidateBuffer);

  try {
    // Testfolie durch die echte Export-Pipeline schicken - fängt Vorlagen ohne nutzbares
    // Titel/Text-Layout ab (siehe find_content_layout() im Python-Skript), bevor sie im
    // Export-Dropdown landen und beim ersten echten Nutzer-Export scheitern würden.
    pptxTemplateService.validateTemplate(destPath);
  } catch (e) {
    fs.rmSync(destPath, { force: true });
    cleanupUpload();
    return res.status(400).json({ error: 'Vorlage nicht kompatibel: ' + e.message });
  }

  cleanupUpload();
  const template = await pptxTemplateRepo.createTemplate({ key, label, filename, createdBy: req.admin.uid });
  res.json({ ok: true, template });
}));

router.delete('/api/admin/pptx-templates/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const deleted = await pptxTemplateRepo.deleteTemplate(id);
  if (!deleted) return res.status(404).json({ error: 'Vorlage nicht gefunden.' });
  fs.rmSync(path.join(config.PPTX_UPLOAD_DIR, deleted.filename), { force: true });
  res.json({ ok: true });
}));

module.exports = router;
