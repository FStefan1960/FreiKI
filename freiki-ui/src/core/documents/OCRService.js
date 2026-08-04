const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');

const TESSERACT_ARGS = ['-l', 'deu', '--oem', '1', '--psm', '3'];

// Siehe ChatService.js: chat_template_kwargs nur bei Qwen-Modellen setzen (Mistral/FrankKI
// lehnt unbekannte Felder mit HTTP 422 ab).
const THINKING_KWARGS = /qwen/i.test(config.VLLM_MODEL || '')
  ? { chat_template_kwargs: { enable_thinking: false } }
  : {};

// execFile statt der node-tesseract-ocr-Bibliothek (die exec() mit string-konkateniertem
// Shell-Befehl nutzt - GHSA-8j44-735h-w4w2, Command Injection, kein Fix verfügbar). Mit
// execFile gibt es keine Shell-Interpretation, also keine Injection-Klasse, unabhängig
// davon ob imagePath je aus Nutzereingabe stammen könnte.
function tesseractRecognize(imagePath) {
  return execFileSync('tesseract', [imagePath, 'stdout', ...TESSERACT_ARGS], {
    timeout: 60000,
    maxBuffer: 20 * 1024 * 1024,
  }).toString('utf8');
}

// Rendert alle Seiten eines PDFs als PNG in ein neues Temp-Verzeichnis (Aufrufer ist für das
// Aufräumen des Verzeichnisses zuständig). Wird sowohl von ocrPdf() als auch vom Formular-Vorlagen-
// Upload genutzt (dort werden die PNGs anschließend dauerhaft abgelegt statt gelöscht).
function rasterizePdfToPngs(pdfPath, dpi = 200) {
  const pngDir = `/tmp/rasterize-${Date.now()}-${crypto.randomUUID()}`;
  fs.mkdirSync(pngDir, { recursive: true });
  execFileSync('pdftoppm', ['-r', String(dpi), '-png', pdfPath, `${pngDir}/page`], { timeout: 60000 });
  const pages = fs.readdirSync(pngDir).filter(f => f.endsWith('.png')).sort()
    .map(f => path.join(pngDir, f));
  return { dir: pngDir, pages };
}

// Rendert alle Seiten eines PDFs als PNG und OCRt sie.
async function ocrPdf(pdfPath) {
  const { dir, pages } = rasterizePdfToPngs(pdfPath);
  try {
    const ocrResults = pages.map(p => tesseractRecognize(p));
    return { text: ocrResults.join('\n\n').trim(), pageCount: pages.length };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
  const ocrRaw = tesseractRecognize(rotatedPath);
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
        max_tokens: 4096, temperature: 0.1,
        ...THINKING_KWARGS
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

module.exports = { ocrPdf, ocrImage, rasterizePdfToPngs };
