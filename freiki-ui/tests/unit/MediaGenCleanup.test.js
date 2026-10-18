process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_longer_than_32_characters_for_security_testing';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test_vllm_api_key';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test_pg_pass';

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { GENERATED_IMAGES_DIR, cleanupGeneratedImages } = require('../../src/core/chat/MediaGenChatMode');

const ALT = path.join(GENERATED_IMAGES_DIR, `test-alt-${process.pid}.png`);
const NEU = path.join(GENERATED_IMAGES_DIR, `test-neu-${process.pid}.png`);

describe('Aufräumen erzeugter Bilder', () => {
  after(() => { for (const f of [ALT, NEU]) { try { fs.unlinkSync(f); } catch (_) { /* egal */ } } });

  it('löscht Bilder nach 15 Minuten und lässt frische stehen', () => {
    fs.writeFileSync(ALT, 'a');
    fs.writeFileSync(NEU, 'b');
    const vor16 = new Date(Date.now() - 16 * 60 * 1000);
    fs.utimesSync(ALT, vor16, vor16);
    const vor14 = new Date(Date.now() - 14 * 60 * 1000);
    fs.utimesSync(NEU, vor14, vor14);
    cleanupGeneratedImages();
    assert.ok(!fs.existsSync(ALT), '16 Minuten altes Bild muss weg sein');
    assert.ok(fs.existsSync(NEU), '14 Minuten altes Bild muss bleiben');
  });
});
