// KI-Kennzeichnung von Bildern (Art. 50 EU AI Act, ab 02.08.2026), zwei Ebenen:
//  1. Sichtbar: die offiziellen EU-Icons "AI GENERATED" (vollständig erzeugt) und "AI MODIFIED"
//     (KI-bearbeitet), Quelle
//     https://digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-ai-generated-content
//     (frei nutzbar), zugeschnitten (assets/ai-label-generated.png / -modified.png, schwarze
//     Pille mit weißer Schrift, je 270 px hoch). Die Pille wird in den Durchschnittsgrauton des
//     Bildes eingefärbt (Schrift bleibt weiß) und unten rechts eingefügt. Kann der Nutzer bei
//     der Bildbearbeitung abwählen (visible: false).
//  2. Maschinenlesbar: XMP mit IPTC-DigitalSourceType (trainedAlgorithmicMedia bzw.
//     compositeWithTrainedAlgorithmicMedia). Wird IMMER eingebettet, auch ohne sichtbares Badge.
//     Bewusst ohne Prompt, Nutzername o. Ä. - nur die Herkunftsangabe.
// Gemeinsamer Weg für Bildgenerierung und KI-Bildbearbeitung (ImageMagick), egal ob DeepInfra
// oder lokaler GPU-Server.
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
const SOURCE_TYPE = {
  generated: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia',
  modified: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia',
};
const iconPath = (kind) => path.join(config.APP_ROOT, 'assets', `ai-label-${kind}.png`);

function xmpPacket(kind) {
  return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">' +
    `<Iptc4xmpExt:DigitalSourceType>${SOURCE_TYPE[kind]}</Iptc4xmpExt:DigitalSourceType>` +
    '</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>';
}

// PNG: XMP gehört laut Adobe-Spezifikation in einen iTXt-Chunk "XML:com.adobe.xmp" (so lesen
// exiftool, IPTC-Prüfer usw.). ImageMagicks -profile würde daraus einen komprimierten
// "Raw profile"-Chunk machen, den Standardwerkzeuge nicht als XMP erkennen - daher selbst einfügen.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function injectPngXmp(png, xmp) {
  const IHDR_END = 8 + 8 + 13 + 4;   // Signatur + Chunk-Kopf + IHDR-Daten + CRC
  if (png.length < IHDR_END || png.readUInt32BE(0) !== 0x89504E47) throw new Error('Kein PNG');
  const data = Buffer.concat([Buffer.from('XML:com.adobe.xmp\0\0\0\0\0', 'latin1'), Buffer.from(xmp, 'utf8')]);
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write('iTXt', 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([png.subarray(0, IHDR_END), head, data, crc, png.subarray(IHDR_END)]);
}

function markAiImage(buf, ext, kind = 'generated', { visible = true } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`Unbekannte Label-Art: ${kind}`);
  const id = crypto.randomUUID();
  const tmpIn = path.join(os.tmpdir(), `${id}-src.${ext}`);
  const tmpOut = path.join(os.tmpdir(), `${id}-out.${ext}`);
  const tmpXmp = path.join(os.tmpdir(), `${id}-meta.xmp`);
  try {
    fs.writeFileSync(tmpIn, buf);
    fs.writeFileSync(tmpXmp, xmpPacket(kind));
    const isPng = ext === 'png';
    const args = [tmpIn];
    if (visible) {
      const dims = execFileSync('identify', ['-format', '%w %h', tmpIn]).toString().trim();
      const [w, h] = dims.split(' ').map(Number);
      const iconHeight = Math.max(22, Math.round(Math.min(w, h) * ICON_HEIGHT_RATIO));
      const margin = Math.max(6, Math.round(iconHeight * 0.5));
      const mean = parseFloat(execFileSync('convert', [tmpIn, '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:']).toString());
      const g = Math.round(pillGray(mean) * 255);
      args.push(
        '(', iconPath(kind), '-resize', `x${iconHeight}`, '-channel', 'RGB', '+level-colors', `rgb(${g},${g},${g}),white`, '+channel', ')',
        '-gravity', 'southeast',
        '-geometry', `+${margin}+${margin}`,
        '-composite',
      );
    }
    if (!isPng) args.push('-profile', tmpXmp);
    args.push(tmpOut);
    execFileSync('convert', args);
    const out = fs.readFileSync(tmpOut);
    return isPng ? injectPngXmp(out, xmpPacket(kind)) : out;
  } finally {
    fs.rmSync(tmpIn, { force: true });
    fs.rmSync(tmpOut, { force: true });
    fs.rmSync(tmpXmp, { force: true });
  }
}

module.exports = { markAiImage, pillGray, iconPath, KINDS, SOURCE_TYPE, _test: { injectPngXmp, crc32 } };
