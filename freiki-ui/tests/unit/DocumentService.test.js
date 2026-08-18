const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Document, Packer, Paragraph, TextRun } = require('docx');

// OCRService ruft externe Binaries (tesseract/pdftoppm) auf - per require.cache durch ein Fake
// ersetzt, statt echtes Tesseract in CI zu brauchen. Muss VOR dem require von DocumentService
// passieren, siehe gleiches Muster in AuthService.test.js. Die OCR-Fallback-Entscheidung selbst
// (kurzer pdf-parse-Text -> OCR) wird separat in DocumentService.ocrFallback.test.js getestet,
// dort mit gemocktem pdf-parse statt einer echten PDF - siehe Kommentar dort für den Grund.
const ocrServicePath = require.resolve('../../src/core/documents/OCRService');
let ocrPdfCalls = 0;
require.cache[ocrServicePath] = {
  id: ocrServicePath, filename: ocrServicePath, loaded: true,
  exports: {
    ocrPdf: async () => { ocrPdfCalls++; return { text: '[OCR-Fake] erkannter Text', pageCount: 1 }; },
    ocrImage: async () => '[OCR-Fake] Bildtext',
  },
};

const { extractForChat, extractForMultidoc, extractForKB } = require('../../src/core/documents/DocumentService');

// Echtes, bereits im Repo vorhandenes PDF statt einer zur Testzeit per pdf-lib erzeugten Datei -
// kleine/synthetische PDFs bringen pdfjs-dist (via pdf-parse) in Kombination mit node-fetch
// (transitiv immer geladen, da DocumentService -> OCRService -> shared/utils/text -> node-fetch)
// zuverlässig mit "bad XRef entry" zum Absturz, reproduziert lokal UND im echten Docker-Image.
// Größere/komplexere echte PDFs sind davon nicht betroffen.
const REAL_PDF = path.join(__dirname, '../../FreiKI_Benutzerhandbuch.pdf');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'docsvc-test-'));
after(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

function tmpPath(ext) {
  return path.join(TMP, `t-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
}

async function makeDocx(text) {
  const doc = new Document({ sections: [{ properties: {}, children: [new Paragraph({ children: [new TextRun(text)] })] }] });
  const buf = await Packer.toBuffer(doc);
  const p = tmpPath('.docx');
  fs.writeFileSync(p, buf);
  return p;
}

function makeTxt(text, ext = '.txt') {
  const p = tmpPath(ext);
  fs.writeFileSync(p, text, 'utf-8');
  return p;
}

describe('DocumentService (Dokument-Extraktion — echte Extraktion via mammoth/pdf-parse, OCR gemockt)', () => {
  it('extractForChat: .docx liefert den echten Textinhalt, kein OCR', async () => {
    const filePath = await makeDocx('Hallo Welt aus dem Test-Dokument.');
    const result = await extractForChat({ originalname: 'test.docx', path: filePath });
    assert.match(result.text, /Hallo Welt aus dem Test-Dokument/);
    assert.strictEqual(result.isOcr, false);
  });

  it('extractForChat: .txt liefert den Rohinhalt unverändert', async () => {
    const filePath = makeTxt('Reiner Text-Inhalt.');
    const result = await extractForChat({ originalname: 'test.txt', path: filePath });
    assert.strictEqual(result.text, 'Reiner Text-Inhalt.');
    assert.strictEqual(result.isOcr, false);
  });

  it('extractForChat: .pdf mit echtem Textlayer nutzt pdf-parse, kein OCR', async () => {
    const before = ocrPdfCalls;
    const result = await extractForChat({ originalname: 'handbuch.pdf', path: REAL_PDF });
    assert.match(result.text, /FreiKI/);
    assert.match(result.text, /Benutzerhandbuch/);
    assert.strictEqual(result.isOcr, false);
    assert.strictEqual(ocrPdfCalls, before, 'OCR darf bei vorhandenem Textlayer nicht aufgerufen werden');
  });

  it('extractForMultidoc: verarbeitet mehrere Dateien und löscht die Uploads danach', async () => {
    const f1 = await makeDocx('Dokument eins.');
    const f2 = makeTxt('Dokument zwei.');
    const files = [
      { originalname: 'a.docx', path: f1 },
      { originalname: 'b.txt', path: f2 },
    ];
    const parts = await extractForMultidoc(files);
    assert.strictEqual(parts.length, 2);
    assert.match(parts[0].text, /Dokument eins/);
    assert.strictEqual(parts[1].text, 'Dokument zwei.');
    assert.strictEqual(fs.existsSync(f1), false, 'Upload-Datei muss nach Verarbeitung gelöscht sein');
    assert.strictEqual(fs.existsSync(f2), false, 'Upload-Datei muss nach Verarbeitung gelöscht sein');
  });

  it('extractForMultidoc: liest trotz Extraktionsfehler in einer Datei weiter und meldet ihn im Text', async () => {
    // Gültige Datei, aber kein echtes docx-Binärformat -> mammoth wirft beim Parsen; das
    // demonstriert das catch/finally-Verhalten, ohne den unlinkSync()-im-finally-Pfad selbst
    // zum Werfen zu bringen (was bei einem Verzeichnis statt einer Datei passieren würde).
    const badPath = makeTxt('Das ist kein gültiges docx-Binärformat.', '.docx');
    const files = [{ originalname: 'broken.docx', path: badPath }];
    const parts = await extractForMultidoc(files);
    assert.strictEqual(parts.length, 1);
    assert.match(parts[0].text, /Fehler beim Lesen/);
    assert.strictEqual(fs.existsSync(badPath), false, 'Datei muss trotz Fehler gelöscht werden (finally)');
  });

  it('extractForKB: .md wird direkt als Rohtext gelesen', async () => {
    const filePath = makeTxt('# Überschrift\n\nInhalt.', '.md');
    const text = await extractForKB({ originalname: 'wissen.md', path: filePath });
    assert.strictEqual(text, '# Überschrift\n\nInhalt.');
  });

  it('extractForKB: .docx wird getrimmt zurückgegeben', async () => {
    const filePath = await makeDocx('KB-Dokument-Inhalt.');
    const text = await extractForKB({ originalname: 'wissen.docx', path: filePath });
    assert.match(text, /KB-Dokument-Inhalt/);
  });

  it('extractForKB: nicht unterstütztes Format liefert null', async () => {
    const filePath = makeTxt('Egal', '.xyz');
    const result = await extractForKB({ originalname: 'unknown.xyz', path: filePath });
    assert.strictEqual(result, null);
  });
});
