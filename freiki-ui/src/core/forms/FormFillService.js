const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

// pdf-lib's StandardFonts (z.B. Helvetica) betten KEINE echten Zeichenumrisse ein - das PDF
// verlässt sich darauf, dass der Betrachter selbst eine passende Schrift hat. Fehlt die (z.B.
// in schlanken Containern ohne Systemschriften, aber auch bei manchen echten PDF-Viewern),
// bleibt der Text unsichtbar, obwohl das PDF fehlerfrei erzeugt wird. Außerdem deckt Helvetica
// nur Latin-1 ab - für die Mehrsprachigkeit (Türkisch, Polnisch, Ukrainisch/Russisch, ...)
// reicht das nicht. Deshalb wird eine echte, breit-unicodefähige Schrift (DejaVu Sans, siehe
// fonts/DejaVuSans-LICENSE.txt) direkt ins PDF eingebettet - macht das PDF unabhängig vom
// Viewer. Deckt KEIN Arabisch/Hebräisch (Schriftformen/Shaping) ab, das bräuchte eine
// eigene Text-Shaping-Bibliothek, nicht nur eine andere Schriftdatei.
const FONT_PATH = path.join(__dirname, '..', '..', '..', 'fonts', 'DejaVuSans.ttf');

// Seitenbilder werden mit 200 DPI gerastert (siehe OCRService.rasterizePdfToPngs Default).
// PDF-Punkte sind aber IMMER 1/72 Zoll - Bildpixel 1:1 als Punkte zu behandeln (addPage([width,
// height]) mit den rohen Pixelmaßen) machte die Seite ca. 200/72 = 2,8x zu groß (eine A4-Seite
// landete bei ~23x32 Zoll statt ~8,3x11,7 Zoll). Jede feste Schriftgröße wirkte dadurch winzig
// im Vergleich zur (fälschlich aufgeblähten) Seite/den Feldboxen. PX_TO_PT rechnet Pixel in
// echte Punkte um, sodass Seite und Schrift wieder im richtigen physischen Verhältnis stehen.
const PAGE_DPI = 200;
const PX_TO_PT = 72 / PAGE_DPI;

// Antworten werden nicht mehr per LLM normalisiert (siehe FormDialogService.js) - bei Checkbox-
// Feldern kommt deshalb roher Nutzertext an ("ja", "Ja bitte", "x", ...) statt eines fest
// vorgegebenen "true"/"false". Einfache, deterministische Erkennung statt LLM-Aufruf.
const CHECKBOX_TRUE = /^(ja|j|yes|y|true|wahr|x|✓|1)\b/i;

// Das native HTML-Datumsfeld im Chat (type="date") liefert immer ISO "JJJJ-MM-TT", unabhängig
// von der Dialogsprache/Locale des Browsers. Deutsche Formulare erwarten aber TT.MM.JJJJ -
// deshalb hier beim Ausgeben ins PDF umformatieren statt bereits beim Speichern (damit der
// gespeicherte Rohwert unverändert/nachvollziehbar bleibt). Unbekanntes Format wird unverändert
// durchgereicht statt zu raten.
function formatDateForOutput(raw) {
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : raw;
}

function groupByPage(fields) {
  const byPage = {};
  for (const f of fields) {
    (byPage[f.page_number] = byPage[f.page_number] || []).push(f);
  }
  return byPage;
}

// Baut aus den Seitenbildern der Vorlage + den Feldkoordinaten (relative Anteile 0..1) + den
// gesammelten Antworten ein neues, ausgefülltes PDF. Jede Seite wird als Hintergrundbild
// eingebettet, die Antworten werden als Text darübergezeichnet.
async function fillFormToPdfBuffer(pages, fields, answers) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  // subset:true bettet nur die tatsächlich genutzten Zeichen ein statt der kompletten
  // ~750KB-Schriftdatei - deutlich kleinere PDFs (relevant für den Blob-Download im Browser).
  const font = await pdfDoc.embedFont(fs.readFileSync(FONT_PATH), { subset: true });
  const fieldsByPage = groupByPage(fields);

  const sortedPages = [...pages].sort((a, b) => a.page_number - b.page_number);
  for (const page of sortedPages) {
    const imgBytes = fs.readFileSync(page.image_path);
    const img = await pdfDoc.embedPng(imgBytes);
    const width = img.width * PX_TO_PT;
    const height = img.height * PX_TO_PT;
    const pdfPage = pdfDoc.addPage([width, height]);
    pdfPage.drawImage(img, { x: 0, y: 0, width, height });

    for (const field of fieldsByPage[page.page_number] || []) {
      const raw = answers[field.field_key];
      if (raw === undefined || raw === null || raw === '') continue;

      const text = field.field_type === 'checkbox'
        ? (CHECKBOX_TRUE.test(String(raw).trim()) ? 'X' : '')
        : field.field_type === 'date'
        ? formatDateForOutput(raw)
        : String(raw);
      if (!text) continue;

      const boxWidthPt = field.width * width;
      const boxHeightPt = field.height * height;
      const xPt = field.x * width;
      const yTopPt = field.y * height; // Bild-Koordinaten: Ursprung oben links
      const fontSize = Math.max(7, Math.min(14, boxHeightPt * 0.7)) * 0.9; // 10% kleiner auf Wunsch
      // PDF-Koordinaten: Ursprung unten links - Y-Achse umrechnen.
      const yPdf = height - yTopPt - boxHeightPt + (boxHeightPt - fontSize) / 2;

      pdfPage.drawText(text, {
        x: xPt + 2,
        y: Math.max(0, yPdf),
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: Math.max(10, boxWidthPt - 4),
      });
    }
  }

  return Buffer.from(await pdfDoc.save());
}

module.exports = { fillFormToPdfBuffer };
