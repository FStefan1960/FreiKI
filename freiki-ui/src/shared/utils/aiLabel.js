// Sichtbare KI-Kennzeichnung (Art. 50 EU AI Act, ab 02.08.2026): die offiziellen EU-Icons
// "AI GENERATED" (vollständig erzeugt) und "AI MODIFIED" (KI-bearbeitet), Quelle
// https://digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-ai-generated-content
// (frei nutzbar), zugeschnitten (assets/ai-label-generated.png / -modified.png, schwarze
// Pille mit weißer Schrift, je 270 px hoch). Die Pille wird in den Durchschnittsgrauton des
// Bildes eingefärbt (Schrift bleibt weiß) und per ImageMagick unten rechts eingefügt. Gemeinsamer Weg für Bildgenerierung und
// KI-Bildbearbeitung, egal ob DeepInfra oder lokaler GPU-Server.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { config } = require('../config');

const ICON_HEIGHT_RATIO = 0.048;  // Höhe des Labels relativ zur kürzeren Bildseite
// Obergrenze für den Grauton der Pille (~#757575): ab hier hat weiße Schrift 4,5:1 Kontrast.
// Bei hellen Bildern wird die Pille also nicht heller, damit die Schrift lesbar bleibt.
const MAX_PILL_GRAY = 0.46;

function pillGray(mean) {
  const m = Number.isFinite(mean) ? mean : 0.4;
  return Math.min(MAX_PILL_GRAY, Math.max(0, m));
}
const KINDS = ['generated', 'modified'];
const iconPath = (kind) => path.join(config.APP_ROOT, 'assets', `ai-label-${kind}.png`);

function applyAiLabel(buf, ext, kind = 'generated') {
  if (!KINDS.includes(kind)) throw new Error(`Unbekannte Label-Art: ${kind}`);
  const tmpIn = path.join(os.tmpdir(), `${crypto.randomUUID()}-src.${ext}`);
  const tmpOut = path.join(os.tmpdir(), `${crypto.randomUUID()}-out.${ext}`);
  try {
    fs.writeFileSync(tmpIn, buf);
    const dims = execFileSync('identify', ['-format', '%w %h', tmpIn]).toString().trim();
    const [w, h] = dims.split(' ').map(Number);
    const iconHeight = Math.max(22, Math.round(Math.min(w, h) * ICON_HEIGHT_RATIO));
    const margin = Math.max(6, Math.round(iconHeight * 0.5));
    const mean = parseFloat(execFileSync('convert', [tmpIn, '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:']).toString());
    const g = Math.round(pillGray(mean) * 255);
    execFileSync('convert', [
      tmpIn,
      '(', iconPath(kind), '-resize', `x${iconHeight}`, '-channel', 'RGB', '+level-colors', `rgb(${g},${g},${g}),white`, '+channel', ')',
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

module.exports = { applyAiLabel, pillGray, iconPath, KINDS };
