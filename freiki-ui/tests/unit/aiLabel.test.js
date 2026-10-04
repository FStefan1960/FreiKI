process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_longer_than_32_characters_for_security_testing';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test_vllm_api_key';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test_pg_pass';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const { applyAiLabel, pillGray } = require('../../src/shared/utils/aiLabel');

let haveMagick = true;
try { execFileSync('convert', ['-version']); } catch { haveMagick = false; }

describe('applyAiLabel', { skip: !haveMagick && 'ImageMagick nicht installiert' }, () => {
  const white = (w, h) => execFileSync('convert', ['-size', `${w}x${h}`, 'xc:white', 'png:-']);
  const mean = (img, geom) => Number(execFileSync('convert', ['png:-', '-crop', geom, '+repage', '-colorspace', 'Gray', '-format', '%[fx:mean]', 'info:'], { input: img }).toString());
  const dims = (img) => execFileSync('identify', ['-format', '%w %h', 'png:-'], { input: img }).toString();

  for (const kind of ['generated', 'modified']) {
    it(`fügt das Label "${kind}" unten rechts ein, Format und Größe bleiben gleich`, () => {
      const out = applyAiLabel(white(1000, 800), 'png', kind);
      assert.strictEqual(dims(out), '1000 800');
      assert.ok(mean(out, '100x100+0+0') > 0.999, 'oben links bleibt weiß');
      assert.ok(mean(out, '200x80+790+700') < 0.999, 'unten rechts enthält das Label');
    });
  }

  it('Label-Höhe ist ~4,8 % der kürzeren Seite und die beiden Arten sind gleich hoch', () => {
    const bbox = (img) => execFileSync('convert', ['png:-', '-fuzz', '5%', '-trim', '-format', '%w %h', 'info:'], { input: img }).toString().split(' ').map(Number);
    const [, hg] = bbox(applyAiLabel(white(1000, 800), 'png', 'generated'));
    const [, hm] = bbox(applyAiLabel(white(1000, 800), 'png', 'modified'));
    assert.ok(Math.abs(hg - 38) <= 2, `generated ${hg}`);
    assert.ok(Math.abs(hm - hg) <= 2);
  });

  it('färbt die Pille in den Durchschnittsgrauton des Bildes, Schrift bleibt weiß', () => {
    // Hälfte schwarz / Hälfte weiß -> Mittel 0,5 -> auf 0,46 gedeckelt (~#757575)
    const img = execFileSync('convert', ['-size', '500x400', 'xc:black', '(', '-size', '500x400', 'xc:white', '-crop', '250x400+0+0', '+repage', ')', '-gravity', 'east', '-composite', 'png:-']);
    const out = applyAiLabel(img, 'png', 'modified');
    // Pille liegt unten rechts auf der weißen Hälfte: dunkelster Wert dort ~ Pillenton
    const min = Number(execFileSync('convert', ['png:-', '-crop', '200x40+300+340', '+repage', '-colorspace', 'Gray', '-format', '%[fx:minima]', 'info:'], { input: out }).toString());
    assert.ok(Math.abs(min - 0.46) < 0.03, `Pillenton ${min}`);
  });

  it('die Pille bleibt abgerundet (Ecken des Rahmens behalten die Bildfarbe)', () => {
    const out = applyAiLabel(white(1000, 800), 'png', 'generated');
    const m = execFileSync('convert', ['png:-', '-fuzz', '5%', '-format', '%@', 'info:'], { input: out }).toString().match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
    const [, , , x, y] = m.map(Number);
    const px = execFileSync('convert', ['png:-', '-colorspace', 'Gray', '-format', `%[fx:p{${x + 1},${y + 1}}.intensity]`, 'info:'], { input: out }).toString();
    assert.ok(Number(px) > 0.99, `Ecke ${px}`);
  });

  it('pillGray: dunkle Bilder bleiben dunkel, helle werden gedeckelt, Unsinn fällt auf Standard', () => {
    assert.strictEqual(pillGray(0.2), 0.2);
    assert.strictEqual(pillGray(0.9), 0.46);
    assert.strictEqual(pillGray(NaN), 0.4);
  });

  it('lehnt unbekannte Arten ab', () => {
    assert.throws(() => applyAiLabel(white(100, 100), 'png', 'foo'), /Unbekannte/);
  });
});
