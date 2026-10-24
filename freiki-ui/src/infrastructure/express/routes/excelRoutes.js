const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../../../shared/config');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { uploadExcel, isValidFileId } = require('../../../core/excel/ExcelValidator');
const { runExcelChat } = require('../../../core/excel/ExcelService');
const { fetchWithTimeout } = require('../../../shared/utils/text');
const sensitiveLog = require('../../../core/audit/SensitiveQueryLog');

const MAX_MESSAGE_CHARS = 20000;
const MAX_HISTORY_ENTRIES = 6;
const MAX_HISTORY_ENTRY_CHARS = 6000;

// History kommt vom Client: nur user/assistant mit Text zulassen, sonst könnte jemand system-/tool-Nachrichten einschleusen.
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_ENTRIES)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_ENTRY_CHARS) }));
}

const router = express.Router();
router.use(express.json({ limit: '5mb' }));

router.post('/api/excel-upload', uploadExcel.single('file'), async (req, res, next) => {
  const s = getSession(req);
  if (!s) { if (req.file) fs.unlink(req.file.path, () => {}); return res.status(401).json({ error: 'Bitte neu anmelden.' }); }
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  try {
    const fileId = crypto.randomUUID();
    const destPath = path.join('/tmp/excel_uploads/', fileId + '.xlsx');
    await fs.promises.rename(req.file.path, destPath);
    res.json({ ok: true, fileId, filename: req.file.originalname });
  } catch (e) {
    fs.unlink(req.file.path, () => {});
    next(e);
  }
});

router.post('/api/excel-chat', async (req, res, next) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const { fileId, message, history } = req.body || {};
  if (!isValidFileId(fileId)) return res.status(400).json({ error: 'Ungültige fileId' });
  if (!message || !String(message).trim()) return res.status(400).json({ error: 'Keine Nachricht' });
  if (String(message).length > MAX_MESSAGE_CHARS) return res.status(400).json({ error: 'Nachricht zu lang' });

  const filePath = path.join('/tmp/excel_uploads/', fileId + '.xlsx');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden oder abgelaufen. Bitte erneut hochladen.' });

  sensitiveLog.checkAndLog(s, 'excel-chat', message);

  try {
    const messages = [
      { role: 'system', content: 'Du bist ein Assistent, der Excel-Dateien über bereitgestellte Werkzeuge liest und bearbeitet. Nutze ausschließlich die Werkzeuge, um Zellinhalte zu lesen oder zu schreiben – erfinde keine Werte. Antworte auf Deutsch.' },
      ...sanitizeHistory(history),
      { role: 'user', content: String(message) }
    ];
    const reply = await runExcelChat(filePath, messages, {
      vllmUrl: config.VLLM_URL, vllmModel: config.VLLM_MODEL, vllmApiKey: config.VLLM_API_KEY, fetchWithTimeout
    });
    res.json({ ok: true, reply });
  } catch (e) {
    console.error('excel-chat Fehler:', e.message);
    if (e.code === 'EXCEL_BUSY') return res.status(429).json({ error: e.message });
    if (e.code === 'EXCEL_TOO_LARGE') return res.status(413).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
