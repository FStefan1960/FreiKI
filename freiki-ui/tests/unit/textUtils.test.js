const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  parseFrontmatter,
  toTitle,
  normArea,
  slugifyForFilename,
  generatePassword,
  htmlAttrEscape
} = require('../../src/shared/utils/text');
const { safeEqual } = require('../../src/shared/utils/security');

describe('Text & Security Utilities', () => {
  it('sollte YAML-Frontmatter und Body sauber parsen', () => {
    const raw = `---
title: Mein Werkzeug
icon: 🛠️
order: 2.5
---
Dies ist der eigentliche Systemprompt-Inhalt.`;

    const { meta, body } = parseFrontmatter(raw);
    assert.strictEqual(meta.title, 'Mein Werkzeug');
    assert.strictEqual(meta.icon, '🛠️');
    assert.strictEqual(meta.order, '2.5');
    assert.strictEqual(body, 'Dies ist der eigentliche Systemprompt-Inhalt.');
  });

  it('sollte Markdown ohne Frontmatter unverändert im Body belassen', () => {
    const raw = 'Reiner Markdown-Text ohne Metadaten.';
    const { meta, body } = parseFrontmatter(raw);
    assert.deepStrictEqual(meta, {});
    assert.strictEqual(body, raw);
  });

  it('sollte Bereichs-Keys normalisieren (w_ Präfix entfernen)', () => {
    assert.strictEqual(normArea('w_datenschutz'), 'datenschutz');
    assert.strictEqual(normArea('w_STVO'), 'stvo');
    assert.strictEqual(normArea(' allgemeine_fragen '), 'allgemeine_fragen');
    assert.strictEqual(normArea(''), '');
  });

  it('sollte saubere Dateinamen-Slugs mit korrekter Umlaut-Transkription erzeugen', () => {
    assert.strictEqual(
      slugifyForFilename('Übersicht für Ärztliche Bescheinigungen!', 'fallback'),
      'uebersicht-fuer-aerztliche-bescheinigungen'
    );
    assert.strictEqual(slugifyForFilename('ÄÖÜß-Test 2026', 'fb'), 'aeoeuess-test-2026');
    assert.strictEqual(slugifyForFilename('', 'standard-name'), 'standard-name');
  });

  it('sollte sichere Zufallspasswörter ohne verwechselbare Zeichen generieren', () => {
    const pw = generatePassword(12);
    assert.strictEqual(pw.length, 12);
    // 0, O, 1, l, I dürfen wegen Verwechslungsgefahr nicht vorkommen
    assert.match(pw, /^[^0O1lI]+$/);
  });

  it('sollte HTML-Attribute gegen Injection escapen', () => {
    assert.strictEqual(
      htmlAttrEscape('<script>"alert(1)"&</script>'),
      '&lt;script&gt;&quot;alert(1)&quot;&amp;&lt;/script&gt;'
    );
  });

  it('sollte konstante Zeit-Strings (safeEqual) sicher vergleichen', () => {
    assert.strictEqual(safeEqual('geheim123', 'geheim123'), true);
    assert.strictEqual(safeEqual('geheim123', 'falsch123'), false);
    assert.strictEqual(safeEqual('kurz', 'sehrlangerstring'), false);
    assert.strictEqual(safeEqual(null, 'test'), false);
    assert.strictEqual(safeEqual('test', undefined), false);
  });
});
