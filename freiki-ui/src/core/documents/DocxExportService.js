const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } = require('docx');

// Zerlegt eine Zeile in TextRuns und wertet dabei **fett** und `code` aus.
function parseInline(line) {
  const parts = line.split(/(\*\*.+?\*\*|`[^`]+`)/g).filter(p => p !== '');
  if (parts.length === 0) return [new TextRun('')];
  return parts.map(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return new TextRun({ text: part.slice(2, -2), bold: true });
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return new TextRun({ text: part.slice(1, -1), font: 'Consolas' });
    }
    return new TextRun(part);
  });
}

// Erkennt den Beginn einer Markdown-Tabelle: Kopfzeile mit Pipe, gefolgt von einer
// Trennzeile aus Bindestrichen (optional mit :/Ausrichtung), z.B. "|---|:---:|".
function isTableStart(lines, i) {
  const header = lines[i];
  const sep = lines[i + 1];
  if (!header || !sep || !header.includes('|')) return false;
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(sep);
}

// Zerlegt eine Tabellenzeile in getrimmte Zellen (fuehrende/abschliessende Pipes optional).
function splitTableRow(line) {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map(c => c.trim());
}

function buildTableCell(text, isHeader) {
  return new TableCell({
    children: [new Paragraph({ children: parseInline(text) })],
    shading: isHeader ? { fill: 'E8EDFB' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });
}

// Baut eine docx-Tabelle aus Kopf- und Datenzeilen. Zeilen mit abweichender Zellenzahl
// (fehlerhaftes LLM-Markdown) werden auf die Kopfzeilenlaenge auf-/abgeschnitten, damit
// Word keine unregelmaessige Tabelle bekommt.
function buildDocxTable(headerCells, dataRows) {
  const colCount = headerCells.length;
  const normalize = cells => {
    const row = cells.slice(0, colCount);
    while (row.length < colCount) row.push('');
    return row;
  };
  const headerRow = new TableRow({
    tableHeader: true,
    children: normalize(headerCells).map(c => buildTableCell(c, true)),
  });
  const bodyRows = dataRows.map(cells => new TableRow({
    children: normalize(cells).map(c => buildTableCell(c, false)),
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] });
}

// Wandelt einfaches Markdown (wie es die Chat-Antworten liefern: #-Überschriften,
// **fett**, `code`, -/* Listen, Tabellen) in ein Word-Dokument um. Kein vollständiger
// Markdown-Parser, deckt aber ab, was die LLM-Antworten typischerweise enthalten.
function markdownToDocx(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const paragraphs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();

    if (isTableStart(lines, i)) {
      const headerCells = splitTableRow(lines[i]);
      i += 2; // Kopf- und Trennzeile ueberspringen
      const dataRows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        dataRows.push(splitTableRow(lines[i]));
        i++;
      }
      i--; // for-Schleife erhoeht selbst wieder um 1
      paragraphs.push(buildDocxTable(headerCells, dataRows));
      paragraphs.push(new Paragraph({ text: '' })); // Abstand nach der Tabelle
      continue;
    }

    if (!line.trim()) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 }[heading[1].length];
      paragraphs.push(new Paragraph({ heading: level, children: parseInline(heading[2]) }));
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      paragraphs.push(new Paragraph({ bullet: { level: 0 }, children: parseInline(bullet[1]) }));
      continue;
    }

    const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      paragraphs.push(new Paragraph({ children: parseInline(`${numbered[1]}. ${numbered[2]}`) }));
      continue;
    }

    paragraphs.push(new Paragraph({ children: parseInline(line) }));
  }

  return new Document({ sections: [{ properties: {}, children: paragraphs }] });
}

async function textToDocxBuffer(text) {
  const doc = markdownToDocx(text);
  return Packer.toBuffer(doc);
}

module.exports = { textToDocxBuffer };
