const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const ocr = require('./OCRService');

// Extrahiert Text aus einer einzelnen hochgeladenen Datei (Chat-Upload).
// Rückgabe: { text, isOcr }
async function extractForChat(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  let text = '';
  let isOcr = false;

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: file.path });
    text = result.value;
  } else if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(file.path);
    const pdfData = await pdfParse(dataBuffer);
    text = pdfData.text.trim();
    if (text.length < 50) {
      // Gescanntes PDF ohne Textlayer → OCR-Fallback
      const result = await ocr.ocrPdf(file.path);
      text = result.text;
      isOcr = true;
    }
  } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    text = await ocr.ocrImage(file.path);
    isOcr = true;
  } else {
    text = fs.readFileSync(file.path, 'utf-8');
  }
  return { text, isOcr };
}

// Extrahiert Text aus mehreren Dateien für den Multidoc-Modus (Vergleichen/Zusammenfassen).
async function extractForMultidoc(files) {
  const parts = [];
  for (const f of files) {
    const ext = path.extname(f.originalname).toLowerCase();
    let text = '';
    try {
      if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: f.path });
        text = result.value;
      } else if (ext === '.pdf') {
        const dataBuffer = fs.readFileSync(f.path);
        const pdfData = await pdfParse(dataBuffer);
        text = pdfData.text.trim();
        if (text.length < 50) {
          const result = await ocr.ocrPdf(f.path);
          text = result.text;
        }
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
  let text = '';

  if (lower.endsWith('.pdf')) {
    const { stdout } = await execFileAsync('pdftotext', [file.path, '-']);
    text = stdout.trim();
    if (text.replace(/\s/g, '').length < 50) {
      onProgress(`${fname}: kein Text gefunden – starte OCR (Tesseract)…`);
      const result = await ocr.ocrPdf(file.path);
      text = result.text;
      onProgress(`${fname}: OCR abgeschlossen (${result.pageCount} Seiten).`);
    }
  } else if (lower.match(/\.(txt|md)$/)) {
    text = fs.readFileSync(file.path, 'utf8');
  } else if (lower.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ path: file.path });
    text = result.value.trim();
    onProgress(`${fname}: Word-Dokument extrahiert (${text.length} Zeichen).`);
  } else {
    return null; // nicht unterstützt
  }
  return text;
}

module.exports = { extractForChat, extractForMultidoc, extractForKB };
