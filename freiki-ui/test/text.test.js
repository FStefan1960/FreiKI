const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFrontmatter, toTitle, normArea, htmlAttrEscape,
  generatePassword, secondsUntilMidnightBerlin, withRetry,
} = require('../src/shared/utils/text');

test('parseFrontmatter: kein Frontmatter -> Body unverändert, meta leer', () => {
  const r = parseFrontmatter('Einfacher Text ohne Frontmatter');
  assert.deepEqual(r, { meta: {}, body: 'Einfacher Text ohne Frontmatter' });
});

test('parseFrontmatter: gültiges Frontmatter wird geparst', () => {
  const r = parseFrontmatter('---\ntitle: Hallo Welt\nkey: value\n---\nDer eigentliche Inhalt.');
  assert.deepEqual(r.meta, { title: 'Hallo Welt', key: 'value' });
  assert.equal(r.body, 'Der eigentliche Inhalt.');
});

test('parseFrontmatter: fehlender schließender Marker -> gesamter Inhalt als Body', () => {
  const r = parseFrontmatter('---\ntitle: kaputt\nkein Ende hier');
  assert.deepEqual(r, { meta: {}, body: '---\ntitle: kaputt\nkein Ende hier' });
});

test('parseFrontmatter: Zeile ohne Doppelpunkt wird ignoriert', () => {
  const r = parseFrontmatter('---\nohne-doppelpunkt\ntitle: X\n---\nBody');
  assert.deepEqual(r.meta, { title: 'X' });
});

test('toTitle: Unterstriche werden zu Leerzeichen, jedes Wort großgeschrieben', () => {
  assert.equal(toTitle('mein_wissensbereich'), 'Mein Wissensbereich');
  assert.equal(toTitle('stvo'), 'Stvo');
});

test('normArea: lowercased, getrimmt, w_-Präfix entfernt', () => {
  assert.equal(normArea('W_StVO'), 'stvo');
  assert.equal(normArea('  datenschutz  '), 'datenschutz');
  assert.equal(normArea('w_hilfe'), 'hilfe');
  assert.equal(normArea('kein_praefix'), 'kein_praefix');
});

test('normArea: null/undefined/leer ergeben leeren String, kein Crash', () => {
  assert.equal(normArea(null), '');
  assert.equal(normArea(undefined), '');
  assert.equal(normArea(''), '');
});

test('htmlAttrEscape: escaped &, ", <, > in der richtigen Reihenfolge', () => {
  assert.equal(htmlAttrEscape('<script>"test" & mehr</script>'),
    '&lt;script&gt;&quot;test&quot; &amp; mehr&lt;/script&gt;');
});

test('htmlAttrEscape: kein Double-Escaping von & aus anderen Entities', () => {
  // & muss zuerst ersetzt werden, sonst würde z.B. < -> &lt; danach das & nochmal treffen
  assert.equal(htmlAttrEscape('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

test('htmlAttrEscape: null/undefined ergeben leeren String', () => {
  assert.equal(htmlAttrEscape(null), '');
  assert.equal(htmlAttrEscape(undefined), '');
});

test('generatePassword: Standardlänge 10, nur erlaubte Zeichen', () => {
  const pw = generatePassword();
  assert.equal(pw.length, 10);
  assert.match(pw, /^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]+$/);
});

test('generatePassword: enthält keine verwechselbaren Zeichen (0, O, 1, l, I)', () => {
  // Über viele Läufe statistisch absichern, dass die Ausschlussliste wirklich greift
  const combined = Array.from({ length: 200 }, () => generatePassword(20)).join('');
  assert.equal(/[0O1lI]/.test(combined), false);
});

test('generatePassword: respektiert übergebene Länge', () => {
  assert.equal(generatePassword(24).length, 24);
  assert.equal(generatePassword(1).length, 1);
});

test('generatePassword: zwei Aufrufe erzeugen (praktisch immer) unterschiedliche Passwörter', () => {
  assert.notEqual(generatePassword(16), generatePassword(16));
});

test('secondsUntilMidnightBerlin: liefert eine Ganzzahl im gültigen Tagesbereich', () => {
  const s = secondsUntilMidnightBerlin();
  assert.equal(Number.isInteger(s), true);
  assert.ok(s >= 0 && s <= 86400, `${s} außerhalb [0, 86400]`);
});

test('withRetry: gibt das Ergebnis zurück, wenn fn sofort erfolgreich ist', async () => {
  const result = await withRetry(async () => 'ok', 2, 1);
  assert.equal(result, 'ok');
});

test('withRetry: versucht es erneut nach einem Fehlschlag und gibt dann den Erfolg zurück', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 2) throw new Error('erster Versuch schlägt fehl');
    return 'zweiter Versuch klappt';
  }, 2, 1);
  assert.equal(result, 'zweiter Versuch klappt');
  assert.equal(calls, 2);
});

test('withRetry: wirft nach Ausschöpfen aller Versuche den letzten Fehler', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls++; throw new Error('immer kaputt'); }, 2, 1),
    /immer kaputt/
  );
  assert.equal(calls, 3); // 1 Erstversuch + 2 Retries
});
