// Comic-/Bildserien-Modus: dieselbe Figur über mehrere Bilder.
//
// Ein reiner Text-zu-Bild-Aufruf kennt die Figur vom letzten Bild nicht, jedes Bild wird neu
// gewürfelt. Deshalb gibt es zwei Schritte: Die erste Nachricht beschreibt die Figur und erzeugt
// ein Referenzbild; jede weitere Nachricht beschreibt eine Szene und wird als Bildbearbeitung
// MIT diesem Referenzbild ausgeführt (immer dasselbe Original, nicht das letzte Panel - sonst
// summiert sich die Abweichung von Bild zu Bild). "Neue Figur: ..." startet eine andere Figur.
//
// Die Referenz liegt pro Nutzer serverseitig (nicht im Chatverlauf): der Client schickt nur die
// letzten 4 Nachrichten mit, das Referenzbild wäre nach zwei Panels aus dem Verlauf gefallen.
// Gespeichert wird das Bild OHNE KI-Label, sonst würde die Label-Pille ins nächste Bild wandern.
//
// Bearbeitung läuft hier über DeepInfras OpenAI-kompatible Images-Edit-API (gleiches Modell wie die
// Generierung). KorKIs lokaler image-edit-Server spricht ein anderes Format (JSON, image_b64) und
// ist hier bewusst noch nicht angebunden.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { config } = require('../../shared/config');
const { fetchWithTimeout, slugifyForFilename } = require('../../shared/utils/text');
const { THINKING_KWARGS } = require('./ThinkingConfig');
const { markAiImage } = require('../../shared/utils/aiLabel');
const {
  GENERATED_IMAGES_DIR, parseImageAspect, isLocalGpuService, writeSseText, generateAiImage,
} = require('./MediaGenChatMode');

const REF_DIR = path.join(config.APP_ROOT, 'comic_refs');
// Referenzbilder (evtl. Fotos hochgeladener Personen) bleiben nur 15 Minuten ohne Benutzung; jede
// Szene verlängert die Frist, damit eine laufende Serie nicht mittendrin die Figur verliert.
const REF_MAX_AGE_MS = 15 * 60 * 1000;
const RESET_RE = /^\s*(neue[rn]?\s+(figur|charakter)|new\s+(character|figure))\s*[:,\-–]?\s*/i;

fs.mkdirSync(REF_DIR, { recursive: true });

function cleanupRefs() {
  try {
    for (const file of fs.readdirSync(REF_DIR)) {
      const fp = path.join(REF_DIR, file);
      if (Date.now() - fs.statSync(fp).mtimeMs > REF_MAX_AGE_MS) fs.unlinkSync(fp);
    }
  } catch (_) { /* Verzeichnis ggf. noch leer */ }
}
setInterval(cleanupRefs, 60 * 1000).unref();

function refKey(userKey) {
  return crypto.createHash('sha256').update(String(userKey)).digest('hex').slice(0, 32);
}

function loadRef(userKey) {
  const key = refKey(userKey);
  for (const ext of ['png', 'jpg']) {
    const fp = path.join(REF_DIR, `${key}.${ext}`);
    try {
      if (Date.now() - fs.statSync(fp).mtimeMs > REF_MAX_AGE_MS) continue;
      const buffer = fs.readFileSync(fp);
      const now = new Date();
      fs.utimesSync(fp, now, now);   // Frist ab letzter Benutzung
      return { buffer, ext };
    } catch (_) { /* nicht vorhanden */ }
  }
  return null;
}

function saveRef(userKey, buffer, ext) {
  const key = refKey(userKey);
  for (const e of ['png', 'jpg']) {
    try { fs.unlinkSync(path.join(REF_DIR, `${key}.${e}`)); } catch (_) { /* egal */ }
  }
  fs.writeFileSync(path.join(REF_DIR, `${key}.${ext}`), buffer);
}

// Szene nur übersetzen, nicht "veredeln": enhanceImagePrompt() fügt Stil, Licht und Stimmung hinzu
// ("warmes, cineastisches Licht") und kippt damit einen Comic beim Bearbeiten ins Foto. Hier
// zählt nur, WAS passiert und WO; Aussehen und Stil kommen aus dem Referenzbild.
async function describeScene(text) {
  try {
    const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: 'Übersetze die Szenenbeschreibung ins Englische als EINEN kurzen Satz (höchstens 30 Wörter). Beschreibe nur Ort, Handlung, Haltung, Gesichtsausdruck und Bildausschnitt. Füge KEINE Angaben zu Stil, Licht, Stimmung, Kamera oder Qualität hinzu und beschreibe das Aussehen der Person nicht. Gib NUR den Satz zurück, ohne Anführungszeichen. /no_think' },
          { role: 'user', content: text },
        ],
        max_tokens: 100,
        temperature: 0.2,
        ...THINKING_KWARGS,
      }),
    });
    const d = await r.json();
    const out = d.choices?.[0]?.message?.content
      ?.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      .replace(/^["'„]+|["'“]+$/g, '').trim();
    if (out && out.length > 5) return out;
  } catch (e) {
    console.warn('Szenen-Übersetzung fehlgeschlagen:', e.message);
  }
  return text;
}

// Hochgeladenes Referenzbild prüfen und vereinheitlichen: nur JPEG/PNG/WebP (Magic Bytes, nicht
// dem Dateinamen trauen), EXIF-Drehung anwenden, auf höchstens 1536 px verkleinern (Handyfotos
// sprengen sonst Upload und Modell), Metadaten entfernen, als JPEG ausgeben.
function normalizeUpload(buf) {
  const isJpg = buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  if (!isJpg && !isPng && !isWebp) throw new Error('KEIN_BILD');
  const out = execFileSync('convert', [
    '-', '-auto-orient', '-background', 'white', '-alpha', 'remove', '-alpha', 'off',
    '-resize', '1536x1536>', '-strip', '-quality', '92', 'jpg:-',
  ], { input: buf, maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
  return { buffer: out, ext: 'jpg' };
}

function editUrl() {
  return String(config.IMAGE_GEN_URL).replace(/\/generations\/?$/, '/edits');
}

// Bearbeitung mit Referenzbild (multipart, wie OpenAIs /v1/images/edits).
async function editWithReference(ref, prompt, { width, height } = {}) {
  const url = editUrl();
  if (isLocalGpuService(url)) throw new Error('Comic-Modus: lokaler image-edit-Server ist nicht angebunden');
  const fd = new FormData();
  fd.append('model', config.IMAGE_GEN_MODEL);
  fd.append('prompt', prompt);
  fd.append('n', '1');
  if (width && height) fd.append('size', `${width}x${height}`);
  fd.append('image', new Blob([ref.buffer], { type: ref.ext === 'png' ? 'image/png' : 'image/jpeg' }), `ref.${ref.ext}`);
  // Bewusst das eingebaute fetch: fetchWithTimeout() läuft über node-fetch v2, das den globalen
  // FormData nicht versteht (Body kommt leer an, DeepInfra antwortet 422).
  const r = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.IMAGE_GEN_API_KEY}` },
    body: fd,
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 300);
    throw new Error(`Bildbearbeitung fehlgeschlagen (${r.status}) ${detail}`);
  }
  const { data } = await r.json();
  const b64 = data?.[0]?.b64_json;
  if (!b64) throw new Error('Keine Bilddaten erhalten');
  const buf = Buffer.from(b64, 'base64');
  const ext = (buf[0] === 0x89 && buf[1] === 0x50) ? 'png' : 'jpg';
  return { buffer: markAiImage(buf, ext, 'generated'), ext };
}

function writeImage(res, { buffer, ext }, prompt, caption) {
  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(GENERATED_IMAGES_DIR, filename), buffer);
  const url = `/api/generated-images/${filename}`;
  const alt = prompt.replace(/[[\]]/g, '');
  const downloadName = `${slugifyForFilename(prompt, 'comic')}.${ext}`;
  const md = `![${alt}](${url})\n\n<a href="${url}" download="${downloadName}" class="copy-btn">⬇️ Bild herunterladen</a>` +
    (caption ? `\n\n${caption}` : '');
  writeSseText(res, md);
}

async function handleComicMode(res, message, { userKey, upload } = {}) {
  const done = () => { res.write('data: [DONE]\n\n'); res.end(); };
  const raw = (message || '').trim();
  if (!raw && !upload) {
    writeSseText(res, '🎞️ Bitte eine Beschreibung eingeben.');
    return done();
  }
  const { dims, cleanedPrompt } = parseImageAspect(raw);
  const reset = RESET_RE.test(cleanedPrompt);
  const text = cleanedPrompt.replace(RESET_RE, '').trim();
  try {
    // Eigenes Referenzbild (z. B. eine frühere Figur für eine neue Folge): ersetzt die gespeicherte
    // Figur. Ohne Text wird sie nur übernommen, mit Text gleich als erste Szene verwendet.
    if (upload) {
      let norm;
      try {
        norm = normalizeUpload(upload);
      } catch (e) {
        writeSseText(res, e.message === 'KEIN_BILD'
          ? '⚠️ Bitte ein Bild als Referenz anhängen (JPG, PNG oder WebP).'
          : '⚠️ Das Bild konnte nicht gelesen werden.');
        return done();
      }
      saveRef(userKey, norm.buffer, norm.ext);
      if (!text) {
        writeSseText(res, '✅ Referenzbild übernommen. Beschreiben Sie jetzt die erste Szene.');
        return done();
      }
    }
    if (reset && !text) {
      writeSseText(res, '🎞️ Bitte beschreiben Sie die neue Figur, z. B. „Neue Figur: eine junge Frau mit roten Locken und gelbem Regenmantel“.');
    } else {
      const ref = (reset && !upload) ? null : loadRef(userKey);
      if (!ref) {
        // Schritt 1: Figur festlegen. Ganzkörper auf neutralem Grund ergibt eine brauchbare Referenz.
        const fig = await generateAiImage(
          `${text}. Ganzkörperdarstellung, neutrale Pose, einfarbiger heller Hintergrund`,
          { width: dims?.width, height: dims?.height });
        saveRef(userKey, fig.raw, fig.ext);
        writeImage(res, fig, text,
          '✅ Figur festgelegt. Beschreiben Sie jetzt die erste Szene. Mit „Neue Figur: …“ beginnen Sie mit einer anderen Figur, oder hängen Sie ein eigenes Referenzbild an.');
      } else {
        // Schritt 2: Szene mit derselben Figur.
        const scene = await describeScene(text);
        const editPrompt = 'Keep the character from the input image exactly the same: same face, hairstyle, body and clothing, ' +
          'and the exact same art style and rendering technique (a drawing stays a drawing, a photo stays a photo). ' +
          'Do not copy any badge, label, logo or watermark from the input image. ' +
          `Place this exact character in a new scene: ${scene}`;
        const out = await editWithReference(ref, editPrompt, { width: dims?.width, height: dims?.height });
        writeImage(res, out, text);
      }
    }
  } catch (e) {
    console.error('Comic-Modus Fehler:', e.message);
    writeSseText(res, '⚠️ Bildgenerierung nicht erreichbar.');
  }
  done();
}

module.exports = { handleComicMode, RESET_RE, refKey, loadRef, saveRef, normalizeUpload };
