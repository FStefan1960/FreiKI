const fs = require('fs');
const path = require('path');
const tesseract = require('node-tesseract-ocr');
const { execFileSync } = require('child_process');
const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');

const OCR_LANG_OPTS = { lang: 'deu+eng', oem: 1, psm: 3 };

// Rendert alle Seiten eines PDFs als PNG in ein Temp-Verzeichnis und OCRt sie.
async function ocrPdf(pdfPath) {
  const pngDir = `/tmp/ocr-${Date.now()}`;
  fs.mkdirSync(pngDir, { recursive: true });
  try {
    execFileSync('pdftoppm', ['-r', '200', '-png', pdfPath, `${pngDir}/page`], { timeout: 60000 });
    const pages = fs.readdirSync(pngDir).filter(f => f.endsWith('.png')).sort();
    const ocrResults = await Promise.all(pages.map(p =>
      tesseract.recognize(path.join(pngDir, p), OCR_LANG_OPTS)
    ));
    return { text: ocrResults.join('\n\n').trim(), pageCount: pages.length };
  } finally {
    fs.rmSync(pngDir, { recursive: true, force: true });
  }
}

// OCR für ein einzelnes Foto/Bild, inkl. Auto-Rotation und LLM-Bereinigung des Rohtexts.
async function ocrImage(imagePath) {
  const rotatedPath = imagePath + '_rotated.png';
  try {
    execFileSync('magick', ['convert', '-auto-orient', imagePath, rotatedPath], { timeout: 30000 });
  } catch (rotErr) {
    console.warn('Auto-Orient fehlgeschlagen, nutze Original:', rotErr.message);
    fs.copyFileSync(imagePath, rotatedPath);
  }
  const ocrRaw = await tesseract.recognize(rotatedPath, OCR_LANG_OPTS);
  try { fs.unlinkSync(rotatedPath); } catch (_) {}

  let cleaned = ocrRaw.trim();
  try {
    const cleanRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: 'Du bereinigst automatisch per OCR erkannten Text aus Fotos. Füge fehlende Satzzeichen ein, korrigiere offensichtliche OCR-Fehler (z. B. "l" statt "1", "0" statt "O"), entferne Artefakte und stelle einen gut lesbaren Fließtext her. Behalte den gesamten Inhalt bei – erfinde nichts, kürze nichts weg. Gib NUR den bereinigten Text zurück. /no_think' },
          { role: 'user', content: `OCR-Rohtext:\n\n${ocrRaw.trim()}` }
        ],
        max_tokens: 4096, temperature: 0.1
      })
    });
    if (cleanRes.ok) {
      const cleanJson = await cleanRes.json();
      const result = cleanJson.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (result && result.length > 20) cleaned = result;
    }
  } catch (cleanErr) {
    console.warn('OCR-Bereinigung fehlgeschlagen:', cleanErr.message);
  }
  return cleaned;
}

module.exports = { ocrPdf, ocrImage };
