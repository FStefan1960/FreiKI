const multer = require('multer');
const fs = require('fs');
const path = require('path');

const DOC_TYPES = ['application/pdf','text/plain','text/markdown','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg','image/png','image/webp'];

// Für Chat-Uploads (Dokument-Analyse, Multidoc)
const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (DOC_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: PDF, TXT, MD, DOC/DOCX, JPG, PNG, WEBP'), false);
  }
});

// Für Sprachaufnahmen (Transkription)
const uploadAudio = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4','audio/x-m4a','audio/aac'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp für Audio. Erlaubt: MP3, WAV, OGG, WEBM, M4A, AAC'), false);
  }
});

// Für Wissensdatenbank-Uploads (KB-Ingest)
const uploadKB = multer({
  dest: '/tmp/kb_uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (DOC_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: PDF, TXT, MD, DOC/DOCX, JPG, PNG, WEBP'), false);
  }
});

// Temp-Dateien älter als 24h aus den Upload-Verzeichnissen löschen
function cleanupUploads() {
  ['/tmp/uploads/', '/tmp/kb_uploads/', '/tmp/excel_uploads/'].forEach(dir => {
    try {
      fs.readdirSync(dir).forEach(file => {
        const fp = path.join(dir, file);
        if (Date.now() - fs.statSync(fp).mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(fp);
      });
    } catch (_) {}
  });
}

function startUploadCleanupSchedule() {
  cleanupUploads();
  setInterval(cleanupUploads, 6 * 60 * 60 * 1000);
}

module.exports = { upload, uploadAudio, uploadKB, cleanupUploads, startUploadCleanupSchedule };
