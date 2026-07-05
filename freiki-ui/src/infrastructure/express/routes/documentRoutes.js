const express = require('express');
const fs = require('fs');
const { config } = require('../../../shared/config');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { normArea } = require('../../../shared/utils/text');
const { uploadKB } = require('../../../infrastructure/storage/FileStorage');
const kbAreas = require('../../../core/knowledge/KBAreaRepository');
const kb = require('../../../core/knowledge/KBService');
const documents = require('../../../core/documents/DocumentService');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

const router = express.Router();

// Wissensbereiche aus Prompts-Dir auflisten (für n8n-Ingest-Workflows)
router.get('/api/kb-areas', (req, res) => {
  if (!config.KB_INGEST_API_KEY || req.headers['x-api-key'] !== config.KB_INGEST_API_KEY) {
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
  if (!config.KB_INGEST_API_KEY || req.headers['x-api-key'] !== config.KB_INGEST_API_KEY) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const { bereich, text, source, source_url } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Kein Text übergeben' });
  try {
    const result = await kb.ingestText(bereich, text, source, source_url);
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
