process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_longer_than_32_characters_for_security_testing';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test_vllm_api_key';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test_pg_pass';

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { config } = require('../../src/shared/config');
const { RESET_RE, refKey, loadRef, saveRef, normalizeUpload } = require('../../src/core/chat/ComicChatMode');

const TEST_USER = `comic-test-${process.pid}`;

describe('ComicChatMode', () => {
  after(() => {
    for (const ext of ['png', 'jpg']) {
      try { fs.unlinkSync(path.join(config.APP_ROOT, 'comic_refs', `${refKey(TEST_USER)}.${ext}`)); } catch (_) { /* egal */ }
    }
  });

  it('erkennt "Neue Figur:" in verschiedenen Schreibweisen als Neustart', () => {
    for (const m of ['Neue Figur: ein Mann', 'neue figur ein Mann', 'Neuer Charakter - ein Mann', 'new character: a man']) {
      assert.ok(RESET_RE.test(m), m);
    }
    assert.strictEqual('Neue Figur: ein Mann'.replace(RESET_RE, ''), 'ein Mann');
  });

  it('hält normale Szenenbeschreibungen nicht für einen Neustart', () => {
    for (const m of ['Sie sitzt im Café', 'Die neue Figur läuft durch den Regen', 'Neue Szene: im Park']) {
      assert.ok(!RESET_RE.test(m), m);
    }
  });

  it('speichert die Referenz pro Nutzer und ersetzt sie beim erneuten Speichern', () => {
    assert.strictEqual(loadRef(TEST_USER), null);
    saveRef(TEST_USER, Buffer.from('eins'), 'png');
    assert.strictEqual(loadRef(TEST_USER).buffer.toString(), 'eins');
    saveRef(TEST_USER, Buffer.from('zwei'), 'jpg');
    const ref = loadRef(TEST_USER);
    assert.strictEqual(ref.buffer.toString(), 'zwei');
    assert.strictEqual(ref.ext, 'jpg');
  });

  it('trennt die Referenzen verschiedener Nutzer', () => {
    assert.notStrictEqual(refKey('a'), refKey('b'));
    assert.strictEqual(loadRef(`${TEST_USER}-anderer`), null);
  });

  it('nimmt hochgeladene Bilder an und gibt JPEG zurück (PNG)', () => {
    const png = require('child_process').execFileSync('convert', ['-size', '8x8', 'xc:red', 'png:-']);
    const out = normalizeUpload(png);
    assert.strictEqual(out.ext, 'jpg');
    assert.deepStrictEqual([out.buffer[0], out.buffer[1]], [0xFF, 0xD8]);
  });

  it('meldet ein beschädigtes Bild als Fehler statt zu hängen', () => {
    const kaputt = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.from('kaputt')]);
    assert.throws(() => normalizeUpload(kaputt));
  });

  it('lehnt Nicht-Bilder per Magic Bytes ab, auch mit Bild-Dateiendung', () => {
    assert.throws(() => normalizeUpload(Buffer.from('%PDF-1.7 fake')), /KEIN_BILD/);
    assert.throws(() => normalizeUpload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), /KEIN_BILD/);
  });

  it('verwirft eine Referenz nach 15 Minuten ohne Benutzung, verlängert sie aber bei Benutzung', () => {
    const fp = path.join(config.APP_ROOT, 'comic_refs', `${refKey(TEST_USER)}.png`);
    saveRef(TEST_USER, Buffer.from('x'), 'png');
    const vor10 = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(fp, vor10, vor10);
    assert.ok(loadRef(TEST_USER));                      // 10 min alt: noch gültig, wird aufgefrischt
    assert.ok(Date.now() - fs.statSync(fp).mtimeMs < 5000);
    const vor20 = new Date(Date.now() - 20 * 60 * 1000);
    fs.utimesSync(fp, vor20, vor20);
    assert.strictEqual(loadRef(TEST_USER), null);       // 20 min alt: abgelaufen
  });
});
