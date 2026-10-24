const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOAD_DIR = '/tmp/excel_uploads/';

const uploadExcel = multer({
  dest: '/tmp/excel_uploads/',
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: XLSX, XLSM'), false);
  }
});

const isValidFileId = (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

// Besitzer pro Upload (Sidecar-Datei neben der xlsx): nur der hochladende Nutzer darf die Datei im Chat
// verwenden oder herunterladen. Die UUID allein reicht nicht. Aufräumen übernimmt cleanupUploads() (24 h).
const metaPath = (fileId) => path.join(UPLOAD_DIR, fileId + '.meta.json');

function writeMeta(fileId, meta) {
  return fs.promises.writeFile(metaPath(fileId), JSON.stringify(meta), { mode: 0o600 });
}

function readMeta(fileId) {
  try { return JSON.parse(fs.readFileSync(metaPath(fileId), 'utf8')); } catch { return null; }
}

const isOwner = (meta, session) => !!meta && !!session && meta.uid === session.uid;

// Dateiname für den Download: Originalname ohne Endung + "_bearbeitet.xlsx", ohne Sonderzeichen.
function downloadName(originalName) {
  const base = path.basename(String(originalName || ''), path.extname(String(originalName || '')))
    .replace(/[^\p{L}\p{N} ._-]/gu, '_').trim().slice(0, 100) || 'Datei';
  return base + '_bearbeitet.xlsx';
}

module.exports = { uploadExcel, isValidFileId, writeMeta, readMeta, isOwner, downloadName, UPLOAD_DIR };
