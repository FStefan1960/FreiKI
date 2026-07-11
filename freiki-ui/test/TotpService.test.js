const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authenticator } = require('otplib');
const bcrypt = require('bcryptjs');
const {
  requires2FA, generateSecret, verifyToken,
  generateBackupCodes, consumeBackupCode,
} = require('../src/core/auth/TotpService');

test('requires2FA: nur admin und high_risk brauchen 2FA', () => {
  assert.equal(requires2FA('admin'), true);
  assert.equal(requires2FA('high_risk'), true);
  assert.equal(requires2FA('manager'), false);
  assert.equal(requires2FA('default'), false);
  assert.equal(requires2FA(undefined), false);
});

test('generateSecret: liefert ein gültiges Secret + otpauth-URI mit Username/Issuer', () => {
  const { secret, otpauth } = generateSecret('m.mustermann', 'FreiKI');
  assert.equal(typeof secret, 'string');
  assert.ok(secret.length >= 16);
  assert.match(otpauth, /^otpauth:\/\/totp\//);
  assert.match(otpauth, /m\.mustermann/);
  assert.match(otpauth, /FreiKI/);
});

test('verifyToken: akzeptiert einen korrekt für das Secret generierten Token', () => {
  const { secret } = generateSecret('test-user', 'FreiKI');
  const token = authenticator.generate(secret);
  assert.equal(verifyToken(secret, token), true);
});

test('verifyToken: lehnt einen falschen Token ab', () => {
  const { secret } = generateSecret('test-user', 'FreiKI');
  const realToken = authenticator.generate(secret);
  // Garantiert abweichender 6-stelliger Code
  const wrongToken = String((parseInt(realToken, 10) + 1) % 1000000).padStart(6, '0');
  assert.equal(verifyToken(secret, wrongToken), false);
});

test('verifyToken: trimmt Whitespace um den eingegebenen Token', () => {
  const { secret } = generateSecret('test-user', 'FreiKI');
  const token = authenticator.generate(secret);
  assert.equal(verifyToken(secret, `  ${token}  `), true);
});

test('verifyToken: fehlendes Secret oder Token -> false statt Exception', () => {
  assert.equal(verifyToken(null, '123456'), false);
  assert.equal(verifyToken('SOMESECRET', null), false);
  assert.equal(verifyToken(null, null), false);
});

test('verifyToken: kaputtes Secret führt zu false statt Exception', () => {
  assert.equal(verifyToken('offensichtlich-kein-base32-secret!!!', '123456'), false);
});

test('generateBackupCodes: liefert 10 Codes standardmäßig, alle 10 Zeichen hex', async () => {
  const { plain, hashed } = await generateBackupCodes();
  assert.equal(plain.length, 10);
  assert.equal(hashed.length, 10);
  for (const code of plain) assert.match(code, /^[0-9a-f]{10}$/);
});

test('generateBackupCodes: respektiert übergebene Anzahl', async () => {
  const { plain, hashed } = await generateBackupCodes(3);
  assert.equal(plain.length, 3);
  assert.equal(hashed.length, 3);
});

test('generateBackupCodes: Codes sind untereinander verschieden', async () => {
  const { plain } = await generateBackupCodes(10);
  assert.equal(new Set(plain).size, 10);
});

test('generateBackupCodes: jeder Hash passt zum jeweiligen Klartext-Code', async () => {
  const { plain, hashed } = await generateBackupCodes(3);
  for (let i = 0; i < plain.length; i++) {
    assert.equal(await bcrypt.compare(plain[i], hashed[i]), true);
  }
});

test('consumeBackupCode: gültiger Code wird erkannt und aus der Restliste entfernt', async () => {
  const { plain, hashed } = await generateBackupCodes(5);
  const { valid, remaining } = await consumeBackupCode(hashed, plain[2]);
  assert.equal(valid, true);
  assert.equal(remaining.length, 4);
  assert.equal(remaining.includes(hashed[2]), false);
});

test('consumeBackupCode: ungültiger Code -> invalid, Liste bleibt unverändert', async () => {
  const { hashed } = await generateBackupCodes(5);
  const { valid, remaining } = await consumeBackupCode(hashed, 'ist-nicht-drin');
  assert.equal(valid, false);
  assert.deepEqual(remaining, hashed);
});

test('consumeBackupCode: leere/fehlende Codeliste -> invalid statt Exception', async () => {
  assert.deepEqual(await consumeBackupCode(undefined, 'egal'), { valid: false, remaining: [] });
  assert.deepEqual(await consumeBackupCode([], 'egal'), { valid: false, remaining: [] });
});

test('consumeBackupCode: derselbe Code kann nach dem Verbrauch nicht erneut genutzt werden', async () => {
  const { plain, hashed } = await generateBackupCodes(3);
  const first = await consumeBackupCode(hashed, plain[0]);
  assert.equal(first.valid, true);
  const second = await consumeBackupCode(first.remaining, plain[0]);
  assert.equal(second.valid, false);
});
