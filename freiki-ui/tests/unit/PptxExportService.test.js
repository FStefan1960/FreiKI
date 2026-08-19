const { describe, it } = require('node:test');
const assert = require('node:assert');
const JSZip = require('jszip');
const { markdownToSlideData, markdownToPptxBuffer } = require('../../src/core/documents/PptxExportService');

describe('PptxExportService', () => {
  describe('markdownToSlideData', () => {
    it('sollte #/##-Ueberschriften als neue Folien erkennen', () => {
      const slides = markdownToSlideData('# Folie 1\nText A\n## Folie 2\nText B');
      assert.strictEqual(slides.length, 2);
      assert.strictEqual(slides[0].title, 'Folie 1');
      assert.strictEqual(slides[1].title, 'Folie 2');
    });

    it('sollte ---/***/___ als Folientrenner behandeln, auch ohne Ueberschrift', () => {
      const slides = markdownToSlideData('Erste Folie\n---\nZweite Folie');
      assert.strictEqual(slides.length, 2);
      assert.strictEqual(slides[0].title, 'Erste Folie');
      assert.strictEqual(slides[1].title, 'Zweite Folie');
    });

    it('sollte Bullet- und nummerierte Listen als Body-Items mit Einrueckung erfassen', () => {
      const slides = markdownToSlideData('# Titel\n- Punkt eins\n  - Unterpunkt\n1. Erster\n2. Zweiter');
      const body = slides[0].body;
      assert.strictEqual(body[0].bullet, true);
      assert.strictEqual(body[0].indent, 0);
      assert.strictEqual(body[1].indent, 1);
      assert.strictEqual(body[2].number, true);
      assert.strictEqual(body[3].number, true);
    });

    it('sollte **fett** und `code`-Markierungen entfernen statt sie umzusetzen', () => {
      const slides = markdownToSlideData('# **Titel** mit `code`\n- **fett** und `code` im Text');
      assert.strictEqual(slides[0].title, 'Titel mit code');
      assert.strictEqual(slides[0].body[0].text, 'fett und code im Text');
    });

    it('sollte bei leerem Input eine leere Folie liefern statt zu crashen', () => {
      assert.deepStrictEqual(markdownToSlideData(''), [{ title: '', body: [] }]);
      assert.deepStrictEqual(markdownToSlideData(null), [{ title: '', body: [] }]);
    });
  });

  describe('markdownToPptxBuffer', () => {
    it('sollte eine gueltige .pptx-Datei mit korrekter Folienanzahl und Inhalt erzeugen', async () => {
      const md = '# Erste Folie\n- Punkt eins\n- Punkt zwei\n## Zweite Folie\nFliesstext hier';
      const buffer = await markdownToPptxBuffer(md);

      assert.ok(Buffer.isBuffer(buffer));
      // ZIP-Magic-Bytes ('PK'): pptx ist ein ZIP-Container, faengt der Aufbau
      // an falsch zu laufen (z.B. inkompatible pptxgenjs-Version), entsteht
      // hier kein oeffenbares Ergebnis mehr.
      assert.strictEqual(buffer.slice(0, 2).toString('ascii'), 'PK');

      const zip = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort();
      assert.strictEqual(slideFiles.length, 2);

      const slide1Xml = await zip.file('ppt/slides/slide1.xml').async('string');
      assert.match(slide1Xml, /Erste Folie/);
      assert.match(slide1Xml, /Punkt eins/);

      const slide2Xml = await zip.file('ppt/slides/slide2.xml').async('string');
      assert.match(slide2Xml, /Zweite Folie/);
      assert.match(slide2Xml, /Fliesstext hier/);
    });
  });
});
