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

const router = express.Router();

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

  const filePath = path.join('/tmp/excel_uploads/', fileId + '.xlsx');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Datei nicht gefunden oder abgelaufen. Bitte erneut hochladen.' });

  sensitiveLog.checkAndLog(s, 'excel-chat', message);

  try {
    const messages = [
      { role: 'system', content: 'Du bist ein Assistent, der Excel-Dateien über bereitgestellte Werkzeuge liest und bearbeitet. Nutze ausschließlich die Werkzeuge, um Zellinhalte zu lesen oder zu schreiben – erfinde keine Werte. Antworte auf Deutsch.' },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: String(message) }
    ];
    const reply = await runExcelChat(filePath, messages, {
      vllmUrl: config.VLLM_URL, vllmModel: config.VLLM_MODEL, vllmApiKey: config.VLLM_API_KEY, fetchWithTimeout
    });
    res.json({ ok: true, reply });
  } catch (e) {
    console.error('excel-chat Fehler:', e.message);
    next(e);
  }
});

module.exports = router;
