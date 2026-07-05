const { upload } = require('../../infrastructure/storage/FileStorage');

// Chat-Uploads: ein einzelnes Dokument ("file") ODER mehrere für den Multidoc-Modus ("files").
// Multer-Konfiguration (Dateityp-Filter, Größenlimit) lebt zentral in FileStorage,
// hier nur die für den Chat-Endpunkt spezifische Feld-Kombination.
const chatUpload = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]);

module.exports = { chatUpload };
