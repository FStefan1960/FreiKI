const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const QRCode = require('qrcode');
const { config } = require('../../shared/config');
const { fetchWithTimeout, slugifyForFilename } = require('../../shared/utils/text');
const { THINKING_KWARGS } = require('./ThinkingConfig');

const GENERATED_IMAGES_DIR = path.join(config.APP_ROOT, 'generated_images');
fs.mkdirSync(GENERATED_IMAGES_DIR, { recursive: true });

function cleanupGeneratedImages() {
  try {
    for (const file of fs.readdirSync(GENERATED_IMAGES_DIR)) {
      const fp = path.join(GENERATED_IMAGES_DIR, file);
      if (Date.now() - fs.statSync(fp).mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(fp);
    }
  } catch (_) { /* Verzeichnis ggf. noch leer/nicht vorhanden */ }
}
setInterval(cleanupGeneratedImages, 6 * 60 * 60 * 1000).unref();

// FLUX ist überwiegend auf englischen Bildbeschreibungen trainiert; kurze deutsche
// Eingaben ("ein Mann auf einer Wiese") führen gerade beim kleinen 4B-Modell zu
// Anatomiefehlern. Das LLM reichert die Eingabe deshalb zu einem detaillierten
// englischen Prompt an. Bei Fehlern läuft die Generierung mit der Original-Eingabe weiter.
async function enhanceImagePrompt(prompt) {
  try {
    const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: 'Du wandelst Bildwünsche in detaillierte englische Prompts für ein Text-zu-Bild-Modell um. Beschreibe in 60-100 Wörtern Motiv, Bildaufbau, Umgebung, Licht und Stil konkret. Bleibe inhaltlich exakt beim Wunsch des Nutzers, erfinde keine abweichenden Motive und füge keinen Text im Bild hinzu, außer er ist ausdrücklich gewünscht. Gib NUR den englischen Prompt zurück – ohne Erklärung, ohne Anführungszeichen. /no_think' },
          { role: 'user', content: `Bildwunsch: "${prompt}"\n\nEnglischer Prompt:` }
        ],
        max_tokens: 250,
        temperature: 0.3,
        ...THINKING_KWARGS
      })
    });
    const d = await r.json();
    // Qwen3 kann trotz /no_think leere <think>-Blöcke voranstellen – immer strippen.
    // Mistral (FrankKI) umschließt den Prompt trotz Anweisung gern mit Anführungszeichen.
    const enhanced = d.choices?.[0]?.message?.content
      ?.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      .replace(/^["'„]+|["'“]+$/g, '').trim();
    if (enhanced && enhanced.length > 20) {
      console.log(`Bild-Prompt angereichert: ${prompt.length} → ${enhanced.length} Zeichen`);
      return enhanced;
    }
  } catch (e) {
    console.warn('Bild-Prompt-Anreicherung fehlgeschlagen:', e.message);
  }
  return prompt;
}

// Rechtlich vorgeschriebene sichtbare KI-Kennzeichnung (Art. 50 EU AI Act, ab 02.08.2026).
// Zuvor liess KorKIs lokaler image-gen-Service das Diffusionsmodell selbst einen Text
// ("KI-pic") ins Bild rendern - unzuverlässig und nur auf KorKI. Jetzt wird das offizielle
// EU-Icon (https://digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-ai-generated-content)
// hier zentral per ImageMagick eingefügt, damit alle drei Instanzen (FreiKI/KorKI/FrankKI,
// egal ob DeepInfra oder KorKIs lokaler GPU-Server) denselben, verlässlichen Weg nutzen.
const AI_LABEL_ICON_PATH = path.join(config.APP_ROOT, 'assets', 'ai-label.png');

function applyAiLabel(buf, ext) {
  const tmpIn = path.join(os.tmpdir(), `${crypto.randomUUID()}-src.${ext}`);
  const tmpOut = path.join(os.tmpdir(), `${crypto.randomUUID()}-out.${ext}`);
  try {
    fs.writeFileSync(tmpIn, buf);
    const dims = execFileSync('identify', ['-format', '%w %h', tmpIn]).toString().trim();
    const [w, h] = dims.split(' ').map(Number);
    const iconSize = Math.max(48, Math.floor(Math.min(w, h) * 0.12));
    const margin = Math.floor(iconSize * 0.15);
    execFileSync('convert', [
      tmpIn,
      '(', AI_LABEL_ICON_PATH, '-resize', `${iconSize}x${iconSize}`, ')',
      '-gravity', 'southeast',
      '-geometry', `+${margin}+${margin}`,
      '-composite', tmpOut,
    ]);
    return fs.readFileSync(tmpOut);
  } finally {
    fs.rmSync(tmpIn, { force: true });
    fs.rmSync(tmpOut, { force: true });
  }
}

// Antwortformat folgt DeepInfras OpenAI-kompatibler Images-API (data[0].b64_json) - KorKIs
// lokaler image-gen-Service spiegelt dasselbe Format, damit dieser Code auf allen drei
// Instanzen identisch ist (nur IMAGE_GEN_URL/-KEY/-MODEL unterscheiden sich). Wird sowohl vom
// Chat-Bildgen-Modus als auch vom PPTX-Titelbild (PptxExportService.js) genutzt.
async function generateAiImage(prompt) {
  const genPrompt = await enhanceImagePrompt(prompt);
  const r = await fetchWithTimeout(config.IMAGE_GEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.IMAGE_GEN_API_KEY}` },
    body: JSON.stringify({ model: config.IMAGE_GEN_MODEL, prompt: genPrompt, n: 1 }),
  });
  if (!r.ok) throw new Error(`Bildgenerierung fehlgeschlagen (${r.status})`);
  const { data } = await r.json();
  const image_base64 = data?.[0]?.b64_json;
  if (!image_base64) throw new Error('Keine Bilddaten erhalten');
  const buf = Buffer.from(image_base64, 'base64');
  // DeepInfra liefert trotz OpenAI-kompatiblem Response-Schema teils JPEG statt PNG -
  // Format anhand der echten Magic Bytes bestimmen statt blind ".png" anzunehmen.
  const ext = (buf[0] === 0x89 && buf[1] === 0x50) ? 'png' : 'jpg';
  return { buffer: applyAiLabel(buf, ext), ext };
}

// Generierte Bilder als Datei statt Base64 im Chatverlauf: Base64-Inline-Bilder blähen die
// "history" bei jeder Folgenachricht auf mehrere hundert KB auf (Multer-Feldlimit, siehe
// FileStorage.js) und landen 1:1 im "Kopieren"-Button (dataset.copyText = Rohtext) – dort
// dann als Buchstabensalat statt eines nutzbaren Downloads. Eine Datei-URL bleibt kurz und
// ist per Rechtsklick/Download-Link speicherbar.
async function handleImageGenMode(res, message) {
  const prompt = (message || '').trim();
  if (!prompt) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '🎨 Bitte eine Bildbeschreibung eingeben.' } }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }
  try {
    const { buffer: labeledBuf, ext } = await generateAiImage(prompt);
    const filename = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(GENERATED_IMAGES_DIR, filename), labeledBuf);
    const url = `/api/generated-images/${filename}`;
    const alt = prompt.replace(/[[\]]/g, '');
    const downloadName = `${slugifyForFilename(prompt, 'bild')}.${ext}`;
    const md = `![${alt}](${url})\n\n<a href="${url}" download="${downloadName}" class="copy-btn">⬇️ Bild herunterladen</a>`;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: md } }] })}\n\n`);
  } catch (e) {
    console.error('Bildgenerierung Fehler:', e.message);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '⚠️ Bildgenerierung nicht erreichbar.' } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

// Musikgenerierung läuft auf KorKI über einen lokalen GPU-Service (ACE-Step, siehe
// music-gen/server.py) und hat kein DeepInfra-Äquivalent, auf das FreiKI ausweichen könnte.
// Der Modus ist daher hier bewusst nur als UI-Vorschau vorhanden: keine Prompt-Anreicherung,
// kein Backend-Call, nur der Hinweis. Bei Bedarf ist der echte Ablauf 1:1 aus KorKIs
// generateAiMusic()/handleMusicGenMode() übernehmbar (config.MUSIC_GEN_URL ergänzen).
async function handleMusicGenMode(res, message) {
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '🎵 In dieser Demo nicht verfügbar.' } }] })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

// QR-Codes sind deterministisch codierte Nutzereingaben, keine KI-generierten Inhalte -
// bekommen bewusst KEIN applyAiLabel()-Badge (anders als handleImageGenMode).
async function handleQrGenMode(res, message) {
  const text = (message || '').trim();
  if (!text) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '🔲 Bitte einen Text oder eine URL eingeben.' } }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }
  try {
    const dataUrl = await QRCode.toDataURL(text, { width: 512, margin: 2 });
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const filename = `${crypto.randomUUID()}.png`;
    fs.writeFileSync(path.join(GENERATED_IMAGES_DIR, filename), buf);
    const url = `/api/generated-images/${filename}`;
    const alt = text.replace(/[[\]]/g, '');
    const md = `![${alt}](${url})\n\n\`\`\`\n${text}\n\`\`\`\n\n<a href="${url}" download="qrcode.png" class="copy-btn">⬇️ QR-Code herunterladen</a>`;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: md } }] })}\n\n`);
  } catch (e) {
    console.error('QR-Code-Generierung Fehler:', e.message);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '⚠️ QR-Code konnte nicht erstellt werden.' } }] })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}

module.exports = { handleImageGenMode, handleMusicGenMode, handleQrGenMode, generateAiImage };
