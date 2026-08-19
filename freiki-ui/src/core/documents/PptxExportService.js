const pptxgen = require('pptxgenjs');

// Entfernt **fett** und `code`-Markierungen statt sie umzusetzen (anders als beim
// Word-Export): pptxgenjs' Text-Run-Array mit gemischter Formatierung pro Zeile ist
// fehleranfällig (breakLine-Semantik), fuer eine Gliederung reicht reiner Text.
function stripInline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}

// Wandelt Markdown (wie es die Chat-Antworten liefern: #/##-Ueberschriften pro Folie,
// ###+ als hervorgehobene Zwischenzeile, -/* und nummerierte Listen als Bulletpoints,
// Fliesstext als normale Zeile) in eine Folienstruktur um. Kein vollstaendiger
// Markdown-Parser, deckt aber ab, was fuer eine PPT-Gliederung gebraucht wird.
function markdownToSlideData(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const slides = [];
  let current = null;

  const newSlide = (title) => {
    current = { title, body: [] };
    slides.push(current);
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    const heading = line.match(/^(#{1,2})\s+(.*)$/);
    if (heading) { newSlide(stripInline(heading[2])); continue; }

    const subheading = line.match(/^#{3,6}\s+(.*)$/);
    if (subheading) {
      if (!current) newSlide(stripInline(subheading[1]));
      else current.body.push({ text: stripInline(subheading[1]), bold: true });
      continue;
    }

    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bullet) {
      if (!current) newSlide('');
      current.body.push({ text: stripInline(bullet[2]), bullet: true, indent: Math.floor(bullet[1].length / 2) });
      continue;
    }

    const numbered = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (!current) newSlide('');
      current.body.push({ text: stripInline(numbered[2]), number: true, indent: Math.floor(numbered[1].length / 2) });
      continue;
    }

    if (!current) newSlide(stripInline(line));
    else current.body.push({ text: stripInline(line) });
  }

  return slides.length ? slides : [{ title: '', body: [] }];
}

async function markdownToPptxBuffer(text) {
  const slides = markdownToSlideData(text);
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';

  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.addText(s.title || ' ', {
      x: 0.5, y: 0.3, w: 9, h: 0.9,
      fontSize: 28, bold: true, fontFace: 'Arial', color: '1F2937',
    });
    if (s.body.length) {
      const paragraphs = s.body.map(b => ({
        text: b.text,
        options: {
          breakLine: true,
          bold: !!b.bold,
          bullet: b.number ? { type: 'number' } : (b.bullet ? true : false),
          indentLevel: b.indent || 0,
          fontSize: b.bold ? 20 : 18,
        },
      }));
      slide.addText(paragraphs, {
        x: 0.6, y: 1.4, w: 8.8, h: 3.9, fontFace: 'Arial', color: '374151', valign: 'top',
      });
    }
  }

  return pptx.write({ outputType: 'nodebuffer' });
}

// Kurzer, beschreibender Wunsch für ein einzelnes Titelbild fürs ganze Deck - wird an
// generateAiImage() (MediaGenChatMode.js) übergeben, das den Wunsch selbst noch per LLM zu
// einem detaillierten englischen Bild-Prompt anreichert. Kein eigener LLM-Aufruf nötig.
function buildTitleImagePrompt(slides) {
  const mainTitle = slides[0]?.title || '';
  const otherTitles = slides.slice(1, 4).map(s => s.title).filter(Boolean);
  let prompt = `Symbolisches, freundliches Titelbild für eine Präsentation zum Thema "${mainTitle}".`;
  if (otherTitles.length) prompt += ` Weitere behandelte Themen: ${otherTitles.join(', ')}.`;
  return prompt;
}

module.exports = { markdownToPptxBuffer, markdownToSlideData, buildTitleImagePrompt };
