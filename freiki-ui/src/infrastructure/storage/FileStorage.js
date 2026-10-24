const multer = require('multer');
const fs = require('fs');
const path = require('path');

const DOC_TYPES = ['application/pdf','text/plain','text/markdown','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg','image/png','image/webp'];

// Für Chat-Uploads (Dokument-Analyse, Multidoc)
// fieldSize (nicht nur fileSize!) muss großzügig sein: das "history"-Textfeld trägt bei der
// Bildgenerierung Base64-PNGs aus vorherigen Antworten mit sich und überschreitet sonst
// Multers Default von 1MB (LIMIT_FIELD_VALUE, bricht dann JEDEN Chat-Request in der
// Unterhaltung ab, nicht nur Bild-Anfragen).
const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 50 * 1024 * 1024, fieldSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (DOC_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: PDF, TXT, MD, DOC/DOCX, JPG, PNG, WEBP'), false);
  }
});

// Für Sprachaufnahmen (Transkription) - akzeptiert bewusst auch Video-Container (video/mp4,
// video/quicktime, video/webm, video/x-matroska): ffmpeg in TranscriptionService.transcribeAudio()
// wandelt jede Eingabedatei nach WAV um und verwirft dabei automatisch die Videospur, ein
// separater Audio-Extraktionsschritt ist also nicht nötig.
const uploadAudio = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4','audio/x-m4a','audio/aac',
      'video/mp4','video/quicktime','video/webm','video/x-matroska'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp für Audio. Erlaubt: MP3, WAV, OGG, WEBM, M4A, AAC, MP4, MOV, MKV'), false);
  }
});

// Für "Audio extrahieren" (reines ffmpeg-Utility, siehe AudioExtractionService.js) - eigenes,
// deutlich höheres Limit als uploadAudio: Whisper-Transkription braucht die 200MB-Deckelung
// wegen der Verarbeitungszeit, aber ein Rohvideo-Upload, aus dem nur die (kleine) Tonspur
// gezogen wird, ist ein leichtgewichtiger ffmpeg-Durchlauf ohne diese Einschränkung - ein
// paar Minuten iPhone-4K-Video sprengen die 200MB sonst locker.
const uploadVideo = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4','audio/x-m4a','audio/aac',
      'video/mp4','video/quicktime','video/webm','video/x-matroska'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: MP3, WAV, OGG, WEBM, M4A, AAC, MP4, MOV, MKV'), false);
  }
});

// Für kurzes Chat-Diktat (Mic-Button in der Eingabezeile) - anders als uploadAudio bewusst
// klein limitiert (kurze Aufnahmen von Sekunden bis wenigen Minuten) und mimetype-tolerant,
// weil Browser/Betriebssystem beim MediaRecorder unterschiedliche Codecs liefern (Chrome/
// Android meist audio/webm, iOS Safari meist audio/mp4).
const uploadDictation = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Ungültiger Dateityp für Diktat.'), false);
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

// Für Formular-Vorlagen-Scans (Admin/Manager-Upload im Formular-Chat-Tool)
const uploadFormScan = multer({
  dest: '/tmp/form_scan_uploads/',
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: PDF, JPG, PNG'), false);
  }
});

// Für PPTX-Vorlagen-Uploads (Admin-Tool, siehe adminRoutes.js) - Mimetype-Check bewusst
// über die Dateiendung statt file.mimetype: Browser/OS liefern für .pptx/.potx je nach
// Plattform uneinheitliche oder gar generische (application/octet-stream) Werte. Die
// eigentliche Validierung (ist es eine echte, kompatible Praesentation?) passiert ohnehin
// erst per Dry-Run-Build in adminRoutes.js, nicht hier.
const uploadPptxTemplate = multer({
  dest: '/tmp/pptx_template_uploads/',
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(pptx|potx)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: .pptx, .potx'), false);
  }
});

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Excel-Uploads enthalten Geschäftsdaten: nur kurz aufbewahren. Dateien einer Upload-ID (<uuid>.xlsx und
// <uuid>.meta.json) zählen gemeinsam - maßgeblich ist die jüngste Änderung, damit der Besitzer-Eintrag
// nicht vor einer gerade bearbeiteten Datei verschwindet.
const EXCEL_DIR = '/tmp/excel_uploads/';
const EXCEL_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Temp-Dateien aus den Upload-Verzeichnissen löschen (Standard 24 h, Excel 2 h)
function cleanupUploads() {
  ['/tmp/uploads/', '/tmp/kb_uploads/', '/tmp/excel_uploads/', '/tmp/form_scan_uploads/', '/tmp/pptx_template_uploads/'].forEach(dir => {
    try {
      const maxAge = dir === EXCEL_DIR ? EXCEL_MAX_AGE_MS : MAX_AGE_MS;
      const files = fs.readdirSync(dir);
      const newest = {}; // nur für EXCEL_DIR: jüngste Änderung je Upload-ID
      if (dir === EXCEL_DIR) {
        files.forEach(file => {
          try {
            const id = file.split('.')[0];
            newest[id] = Math.max(newest[id] || 0, fs.statSync(path.join(dir, file)).mtimeMs);
          } catch (_) {}
        });
      }
      files.forEach(file => {
        const fp = path.join(dir, file);
        try {
          const mtime = dir === EXCEL_DIR ? newest[file.split('.')[0]] : fs.statSync(fp).mtimeMs;
          if (Date.now() - mtime > maxAge) {
            fs.unlinkSync(fp);
          }
        } catch (err) {
          // ENOENT: Datei wurde von anderem Prozess gelöscht
          // EACCES: Permissions fehlgeschlagen
          // Andere Fehler ignorieren oder loggen; cleanup nicht blockieren
          if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
            console.warn(`Cleanup-Fehler bei ${fp}:`, err.message);
          }
        }
      });
    } catch (_) {}
  });
}

function startUploadCleanupSchedule() {
  cleanupUploads();
  // Alle 15 Minuten (der Lauf ist billig), damit die 2-h-Grenze für Excel-Uploads zeitnah greift.
  setInterval(cleanupUploads, 15 * 60 * 1000).unref();
}

module.exports = { upload, uploadAudio, uploadVideo, uploadDictation, uploadKB, uploadFormScan, uploadPptxTemplate, cleanupUploads, startUploadCleanupSchedule };
