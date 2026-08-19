const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../../../shared/config');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { normArea } = require('../../../shared/utils/text');
const { uploadKB } = require('../../../infrastructure/storage/FileStorage');
const kbAreas = require('../../../core/knowledge/KBAreaRepository');
const kb = require('../../../core/knowledge/KBService');
const documents = require('../../../core/documents/DocumentService');
const { textToDocxBuffer } = require('../../../core/documents/DocxExportService');
const { markdownToSlideData, buildTitleImagePrompt, markdownToPptxBuffer } = require('../../../core/documents/PptxExportService');
const { buildPptxFromTemplate, resolveTemplateEntry, listAllTemplates } = require('../../../core/documents/PptxTemplateService');
const { generateAiImage } = require('../../../core/chat/MediaGenChatMode');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');
const { safeEqual } = require('../../../shared/utils/security');

const router = express.Router();
router.use(express.json({ limit: '10mb' }));

// Wandelt eine Chat-Antwort (Markdown-Text) in eine .docx zum Download um
router.post('/api/export-docx', asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const { text, filename } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Kein Text übergeben' });

  const buffer = await textToDocxBuffer(text);
  const safeName = (filename || 'antwort').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '').trim().slice(0, 80) || 'antwort';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.docx`);
  res.send(buffer);
}));

// Liste für das Vorlagen-Dropdown im Export-Modal (siehe message-actions.js) - eingeloggt,
// aber NICHT admin-only: jeder Nutzer soll beim Export wählen können, nur das Hochladen/
// Löschen selbst ist admin-only (siehe /api/admin/pptx-templates in adminRoutes.js).
router.get('/api/pptx-templates', asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  res.json({ ok: true, templates: await listAllTemplates() });
}));

// Wandelt eine Chat-Antwort (Markdown mit #/##-Ueberschriften als Folien) in eine .pptx um.
// "template" ist eine Whitelist statt eines freien Pfads vom Client (siehe resolveTemplateEntry
// in PptxTemplateService.js, das fest einprogrammierte UND per Admin hochgeladene Vorlagen
// abdeckt) - alles außer "generic" nutzt eine echte .pptx-Vorlage mit Logo/Verlauf/Layouts,
// "generic" den alten pptxgenjs-Fallback ohne Branding und ohne Bildunterstützung. Optional
// wird ein KI-Titelbild fürs Deck generiert (kostet auf DeepInfra-Instanzen echtes Geld pro
// Export, daher per includeImage abschaltbar).
router.post('/api/export-pptx', asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const { text, filename, includeImage = true, template } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Kein Text übergeben' });

  const safeName = (filename || 'gliederung').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '').trim().slice(0, 80) || 'gliederung';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.pptx`);

  if (template === 'generic') {
    return res.send(await markdownToPptxBuffer(text));
  }

  const templateEntry = (await resolveTemplateEntry(template)) || (await resolveTemplateEntry('diakonie-kork'));
  const slides = markdownToSlideData(text);
  let titleImagePath = null;
  if (includeImage) {
    try {
      const { buffer: imgBuf, ext } = await generateAiImage(buildTitleImagePrompt(slides));
      titleImagePath = path.join(os.tmpdir(), `${crypto.randomUUID()}-pptx-title.${ext}`);
      fs.writeFileSync(titleImagePath, imgBuf);
    } catch (e) {
      console.warn('PPTX-Titelbild fehlgeschlagen, Export läuft ohne Bild weiter:', e.message);
    }
  }

  try {
    const buffer = buildPptxFromTemplate(slides, { titleImagePath, templatePath: templateEntry.path });
    res.send(buffer);
  } finally {
    if (titleImagePath) fs.rmSync(titleImagePath, { force: true });
  }
}));

// Wissensbereiche aus Prompts-Dir auflisten (für n8n-Ingest-Workflows)
router.get('/api/kb-areas', (req, res) => {
  if (!config.KB_INGEST_API_KEY || !safeEqual(config.KB_INGEST_API_KEY, req.headers['x-api-key'])) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const areas = fs.readdirSync(config.PROMPT_DIR)
    .filter(f => f.startsWith('w_') && f.endsWith('.md'))
    .map(f => f.slice(2, -3)); // w_stvo.md → stvo
  res.json({ areas });
});

// Paperless-ngx-Ingest: nimmt bereits OCR'ten Text entgegen (z.B. von n8n) und
// verlinkt jeden Chunk per source_url auf das Originaldokument in Paperless
router.post('/api/kb-ingest-text', asyncHandler(async (req, res) => {
  if (!config.KB_INGEST_API_KEY || !safeEqual(config.KB_INGEST_API_KEY, req.headers['x-api-key'])) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const { bereich, text, source, source_url, replace } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Kein Text übergeben' });
  try {
    const result = await kb.ingestText(bereich, text, source, source_url, { replace: !!replace });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('kb-ingest-text Fehler:', e.message);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Einlesen fehlgeschlagen: ' + e.message });
  }
}));

router.post('/api/kb-upload', uploadKB.array('files', 20), asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session || !['admin', 'manager'].includes(session.role)) {
    return res.status(403).json({ error: 'Keine Berechtigung. Nur Admins und Manager können Dokumente einlesen.' });
  }
  if (session.role === 'manager' && session.manage && session.manage.length) {
    const allowed = session.manage.map(normArea);
    if (!allowed.includes(normArea(req.body.bereich))) {
      return res.status(403).json({ error: 'Kein Schreibrecht für diesen Bereich.' });
    }
  }
  const bereich = (req.body.bereich || '').toLowerCase().trim();
  const table = kbAreas.getTable(bereich);
  if (!table) return res.status(400).json({ error: 'Unbekannter Bereich: ' + bereich });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Keine Dateien hochgeladen' });

  const clearFirst = req.body.clear === 'true';
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();
  const send = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n');

  try {
    if (clearFirst) {
      await kb.clearTable(table);
      send({ type: 'info', msg: 'Tabelle geleert – alle bisherigen Dokumente entfernt.' });
    }

    let totalInserted = 0;
    for (const file of req.files) {
      const fname = file.originalname;
      send({ type: 'progress', msg: 'Extrahiere Text: ' + fname });
      try {
        const text = await documents.extractForKB(file, msg => send({ type: 'progress', msg }));
        if (text === null) {
          send({ type: 'warn', msg: fname + ': nur PDF/TXT/MD/DOCX unterstützt, übersprungen.' });
          continue;
        }
        const chunks = kb.chunkText(text, fname);
        send({ type: 'progress', msg: fname + ': ' + chunks.length + ' Abschnitte – erstelle Embeddings…' });
        const inserted = await kb.insertChunks(table, chunks);
        totalInserted += inserted;
        send({ type: 'file_done', msg: fname + ': ' + inserted + ' Abschnitte gespeichert.', count: inserted });
      } catch (e) {
        send({ type: 'error', msg: 'Fehler bei ' + fname + ': ' + e.message });
      } finally {
        try { fs.unlinkSync(file.path); } catch (_) {}
      }
    }
    send({ type: 'done', msg: 'Fertig! ' + totalInserted + ' Abschnitte in "' + kbAreas.getLabel(bereich) + '" gespeichert.', inserted: totalInserted });
  } catch (e) {
    send({ type: 'error', msg: 'Fehler: ' + e.message });
  }
  res.end();
}));

module.exports = router;
