const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Eigene Datei statt zusätzlicher it()s in DocumentService.test.js: node --test führt jede
// Testdatei standardmäßig in einem eigenen Prozess aus, daher stört das globale Mocken von
// pdf-parse hier (per require.cache, siehe unten) nicht den echten Extraktions-Pfad in
// DocumentService.test.js, der bewusst mit einer echten PDF gegen das echte pdf-parse testet.
//
// Warum hier gemockt statt eine "leere" Test-PDF zu bauen: synthetisch per pdf-lib erzeugte
// PDFs bringen pdfjs-dist (via pdf-parse) in diesem Projekt zuverlässig mit "bad XRef entry"
// zum Absturz, sobald node-fetch im Prozess geladen ist (was DocumentService über
// OCRService -> shared/utils/text immer transitiv tut) - reproduziert lokal UND im echten
// Docker-Image (Node 20-alpine). Für DIESEN Test interessiert ohnehin nur DocumentServices
// eigene Fallback-Entscheidung (kurzer Text -> OCR), nicht pdfjs' Parsing selbst.
const ocrServicePath = require.resolve('../../src/core/documents/OCRService');
let ocrPdfCalls = 0;
require.cache[ocrServicePath] = {
  id: ocrServicePath, filename: ocrServicePath, loaded: true,
  exports: {
    ocrPdf: async () => { ocrPdfCalls++; return { text: '[OCR-Fake] erkannter Text', pageCount: 1 }; },
    ocrImage: async () => '[OCR-Fake] Bildtext',
  },
};

const pdfParsePath = require.resolve('pdf-parse');
let fakePdfText = '';
require.cache[pdfParsePath] = {
  id: pdfParsePath, filename: pdfParsePath, loaded: true,
  exports: async () => ({ text: fakePdfText }),
};

const { extractForChat } = require('../../src/core/documents/DocumentService');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'docsvc-ocrfallback-test-'));
const dummyPdfPath = path.join(TMP, 'dummy.pdf');
fs.writeFileSync(dummyPdfPath, '%PDF-1.4 Platzhalter, wird nie echt geparst (pdf-parse ist gemockt).');

describe('DocumentService: OCR-Fallback-Entscheidung bei PDFs (isShortText < 50 Zeichen)', () => {
  it('nutzt den pdf-parse-Text direkt, wenn er lang genug ist (kein OCR)', async () => {
    fakePdfText = 'x'.repeat(50); // isShortText prüft < 50, exakt 50 zählt schon als lang genug
    const before = ocrPdfCalls;
    const result = await extractForChat({ originalname: 'test.pdf', path: dummyPdfPath });
    assert.strictEqual(result.isOcr, false);
    assert.strictEqual(result.text, fakePdfText);
    assert.strictEqual(ocrPdfCalls, before);
  });

  it('fällt bei zu kurzem/leerem pdf-parse-Text automatisch auf OCR zurück', async () => {
    fakePdfText = 'kurz';
    const before = ocrPdfCalls;
    const result = await extractForChat({ originalname: 'scan.pdf', path: dummyPdfPath });
    assert.strictEqual(result.isOcr, true);
    assert.strictEqual(result.text, '[OCR-Fake] erkannter Text');
    assert.strictEqual(ocrPdfCalls, before + 1);
  });

  it('behandelt eine komplett leere PDF (kein Textlayer, z.B. Scan) ebenfalls als OCR-Fall', async () => {
    fakePdfText = '';
    const result = await extractForChat({ originalname: 'blank-scan.pdf', path: dummyPdfPath });
    assert.strictEqual(result.isOcr, true);
    assert.strictEqual(result.text, '[OCR-Fake] erkannter Text');
  });
});
