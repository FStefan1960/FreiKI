const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { isValidFileId, writeMeta, readMeta, isOwner, downloadName, UPLOAD_DIR } = require('../../src/core/excel/ExcelValidator');

describe('ExcelValidator: Besitzer und Download-Name', () => {
  it('isOwner nur bei gleicher uid', () => {
    assert.strictEqual(isOwner({ uid: 5 }, { uid: 5 }), true);
    assert.strictEqual(isOwner({ uid: 5 }, { uid: 6 }), false);
    assert.strictEqual(isOwner(null, { uid: 5 }), false);
    assert.strictEqual(isOwner({ uid: 5 }, null), false);
  });

  it('downloadName: Endung ersetzt, Sonderzeichen und Pfade entschärft', () => {
    assert.strictEqual(downloadName('BERICHT2026-09.xlsx'), 'BERICHT2026-09_bearbeitet.xlsx');
    assert.strictEqual(downloadName('Übersicht Q3.xlsm'), 'Übersicht Q3_bearbeitet.xlsx');
    assert.strictEqual(downloadName('../../etc/pass"wd<>.xlsx'), 'pass_wd___bearbeitet.xlsx');
    assert.strictEqual(downloadName(''), 'Datei_bearbeitet.xlsx');
    assert.ok(downloadName('a'.repeat(300) + '.xlsx').length <= 120);
  });

  it('readMeta liefert null bei unbekannter oder kaputter Datei, Roundtrip funktioniert', async (t) => {
    if (!fs.existsSync(UPLOAD_DIR)) { t.skip('kein /tmp/excel_uploads (nur im Container)'); return; }
    const id = '00000000-0000-0000-0000-0000000000aa';
    assert.strictEqual(readMeta(id), null);
    await writeMeta(id, { uid: 7, filename: 'x.xlsx' });
    try { assert.deepStrictEqual(readMeta(id), { uid: 7, filename: 'x.xlsx' }); }
    finally { fs.unlinkSync(`${UPLOAD_DIR}${id}.meta.json`); }
  });

  it('isValidFileId lehnt Pfade ab', () => {
    assert.strictEqual(isValidFileId('../../etc/passwd'), false);
    assert.strictEqual(isValidFileId('00000000-0000-0000-0000-0000000000aa'), true);
  });
});
