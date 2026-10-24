const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { cleanupUploads } = require('../../src/infrastructure/storage/FileStorage');

const EXCEL_DIR = '/tmp/excel_uploads/';
const OTHER_DIR = '/tmp/uploads/';
const H = 60 * 60 * 1000;
const created = [];

function make(dir, name, ageMs) {
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, name);
  fs.writeFileSync(fp, 'x');
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(fp, t, t);
  created.push(fp);
  return fp;
}

describe('cleanupUploads', () => {
  after(() => created.forEach(fp => fs.rmSync(fp, { force: true })));

  it('Excel-Uploads: nach 2 h weg, Datei + Besitzer-Eintrag zählen gemeinsam', () => {
    const oldA = make(EXCEL_DIR, 'ffffffff-0000-0000-0000-00000000a001.xlsx', 3 * H);
    const oldAm = make(EXCEL_DIR, 'ffffffff-0000-0000-0000-00000000a001.meta.json', 3 * H);
    const freshB = make(EXCEL_DIR, 'ffffffff-0000-0000-0000-00000000a002.xlsx', 1 * H);
    const freshBm = make(EXCEL_DIR, 'ffffffff-0000-0000-0000-00000000a002.meta.json', 1 * H);
    // Meta alt, Datei gerade bearbeitet: bleibt (maßgeblich ist die jüngste Änderung der Upload-ID)
    const editedC = make(EXCEL_DIR, 'ffffffff-0000-0000-0000-00000000a003.xlsx', 10 * 60 * 1000);
    const editedCm = make(EXCEL_DIR, 'ffffffff-0000-0000-0000-00000000a003.meta.json', 3 * H);
    cleanupUploads();
    assert.ok(!fs.existsSync(oldA) && !fs.existsSync(oldAm), 'alte Datei und Meta müssen weg sein');
    assert.ok(fs.existsSync(freshB) && fs.existsSync(freshBm), '1 h alt bleibt');
    assert.ok(fs.existsSync(editedC) && fs.existsSync(editedCm), 'frisch bearbeitet bleibt samt Meta');
  });

  it('andere Upload-Ordner behalten die 24-h-Grenze', () => {
    const threeH = make(OTHER_DIR, 'cleanup-test-3h', 3 * H);
    const thirtyH = make(OTHER_DIR, 'cleanup-test-30h', 30 * H);
    cleanupUploads();
    assert.ok(fs.existsSync(threeH), '3 h alt bleibt');
    assert.ok(!fs.existsSync(thirtyH), '30 h alt wird gelöscht');
  });
});
