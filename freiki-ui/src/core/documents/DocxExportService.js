const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

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

// Wandelt einfaches Markdown (wie es die Chat-Antworten liefern: #-Überschriften,
// **fett**, `code`, -/* Listen) in ein Word-Dokument um. Kein vollständiger
// Markdown-Parser, deckt aber ab, was die LLM-Antworten typischerweise enthalten.
function markdownToDocx(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const paragraphs = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

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
