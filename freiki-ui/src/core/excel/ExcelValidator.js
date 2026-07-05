const multer = require('multer');

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

module.exports = { uploadExcel, isValidFileId };
