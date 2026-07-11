const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const ocr = require('./OCRService');

async function extractDocxText(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractRawViaPdfParse(pdfPath) {
  const pdfData = await pdfParse(fs.readFileSync(pdfPath));
  return pdfData.text;
}

// extractForKB nutzt bewusst pdftotext statt pdf-parse (schnellere/robustere Extraktion
// für den KB-Ingest-Batch-Pfad) - andere Bibliothek, daher eigene Raw-Extraktion.
async function extractRawViaPdftotext(pdfPath) {
  const { stdout } = await execFileAsync('pdftotext', [pdfPath, '-']);
  return stdout;
}

// Gemeinsame OCR-Fallback-Logik: extrahiert Rohtext, prüft per isEmpty() ob das PDF
// vermutlich keinen Textlayer hat (gescannt), und OCRt in dem Fall automatisch nach.
// isEmpty ist parametrisiert, weil die Aufrufer unterschiedlich strenge Leer-Kriterien
// nutzen (extractForKB ignoriert z.B. reinen Whitespace bei der Längenprüfung).
async function extractPdfText(pdfPath, extractRaw, isEmpty, onOcrStart) {
  const raw = (await extractRaw(pdfPath)).trim();
  if (!isEmpty(raw)) return { text: raw, isOcr: false, pageCount: null };
  if (onOcrStart) onOcrStart();
  const result = await ocr.ocrPdf(pdfPath);
  return { text: result.text, isOcr: true, pageCount: result.pageCount };
}

const isShortText = (t) => t.length < 50;

// Extrahiert Text aus einer einzelnen hochgeladenen Datei (Chat-Upload).
// Rückgabe: { text, isOcr }
async function extractForChat(file) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.docx') {
    return { text: await extractDocxText(file.path), isOcr: false };
  }
  if (ext === '.pdf') {
    const { text, isOcr } = await extractPdfText(file.path, extractRawViaPdfParse, isShortText);
    return { text, isOcr };
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return { text: await ocr.ocrImage(file.path), isOcr: true };
  }
  return { text: fs.readFileSync(file.path, 'utf-8'), isOcr: false };
}

// Extrahiert Text aus mehreren Dateien für den Multidoc-Modus (Vergleichen/Zusammenfassen).
async function extractForMultidoc(files) {
  const parts = [];
  for (const f of files) {
    const ext = path.extname(f.originalname).toLowerCase();
    let text = '';
    try {
      if (ext === '.docx') {
        text = await extractDocxText(f.path);
      } else if (ext === '.pdf') {
        text = (await extractPdfText(f.path, extractRawViaPdfParse, isShortText)).text;
      } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        text = await ocr.ocrImage(f.path);
      } else {
        text = fs.readFileSync(f.path, 'utf-8');
      }
    } catch (e) {
      text = `[Fehler beim Lesen: ${e.message}]`;
    } finally {
      fs.unlinkSync(f.path);
    }
    parts.push({ filename: f.originalname, text });
    console.log(`Multi-Doc: ${f.originalname} – ${text.length} Zeichen`);
  }
  return parts;
}

// Extrahiert Text für den KB-Upload (nutzt pdftotext statt pdf-parse, mit OCR-Fallback + Fortschritts-Callback).
async function extractForKB(file, onProgress = () => {}) {
  const fname = file.originalname;
  const lower = fname.toLowerCase();

  if (lower.endsWith('.pdf')) {
    const { text, isOcr, pageCount } = await extractPdfText(
      file.path, extractRawViaPdftotext,
      (t) => t.replace(/\s/g, '').length < 50,
      () => onProgress(`${fname}: kein Text gefunden – starte OCR (Tesseract)…`)
    );
    if (isOcr) onProgress(`${fname}: OCR abgeschlossen (${pageCount} Seiten).`);
    return text;
  }
  if (lower.match(/\.(txt|md)$/)) {
    return fs.readFileSync(file.path, 'utf8');
  }
  if (lower.endsWith('.docx')) {
    const text = (await extractDocxText(file.path)).trim();
    onProgress(`${fname}: Word-Dokument extrahiert (${text.length} Zeichen).`);
    return text;
  }
  return null; // nicht unterstützt
}

module.exports = { extractForChat, extractForMultidoc, extractForKB };
