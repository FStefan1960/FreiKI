const { describe, it } = require('node:test');
const assert = require('node:assert');
const { authenticator } = require('otplib');
const {
  requires2FA,
  generateSecret,
  qrDataUrl,
  verifyToken,
  generateBackupCodes,
  consumeBackupCode
} = require('../../src/core/auth/TotpService');

describe('TotpService (2FA & Backup Codes)', () => {
  it('sollte 2FA-Pflicht nur für administrative und privilegierte Rollen erzwingen', () => {
    assert.strictEqual(requires2FA('admin'), true);
    assert.strictEqual(requires2FA('high_risk'), true);
    assert.strictEqual(requires2FA('default'), false);
    assert.strictEqual(requires2FA('manager'), false);
    assert.strictEqual(requires2FA(''), false);
  });

  it('sollte ein valides Secret und otpauth-URI erzeugen', () => {
    const { secret, otpauth } = generateSecret('testuser', 'FreiKI');
    assert.ok(typeof secret === 'string' && secret.length >= 16, 'Secret muss ein Base32-String sein');
    assert.ok(otpauth.startsWith('otpauth://totp/'), 'URI muss das otpauth-Protokoll nutzen');
    assert.ok(otpauth.includes('testuser'), 'URI muss den Benutzernamen enthalten');
    assert.ok(otpauth.includes('FreiKI'), 'URI muss den Issuer enthalten');
  });

  it('sollte einen gültigen QR-Code Data-URL generieren', async () => {
    const { otpauth } = generateSecret('testuser', 'FreiKI');
    const dataUrl = await qrDataUrl(otpauth);
    assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'QR-Code muss eine Base64-PNG-Data-URL sein');
  });

  it('sollte gültige TOTP-Tokens verifizieren und ungültige ablehnen', () => {
    const secret = authenticator.generateSecret();
    const validToken = authenticator.generate(secret);

    assert.strictEqual(verifyToken(secret, validToken), true, 'Gültiger TOTP-Code muss akzeptiert werden');
    assert.strictEqual(verifyToken(secret, '000000'), false, 'Falscher Code muss abgelehnt werden');
    assert.strictEqual(verifyToken(secret, ''), false, 'Leerer Code muss abgelehnt werden');
    assert.strictEqual(verifyToken(null, validToken), false, 'Fehlendes Secret muss abgelehnt werden');
  });

  it('sollte Einmal-Backup-Codes erzeugen und den sicheren Verbrauch unterstützen', async () => {
    const { plain, hashed } = await generateBackupCodes(5);
    assert.strictEqual(plain.length, 5, 'Muss 5 Klartext-Codes erzeugen');
    assert.strictEqual(hashed.length, 5, 'Muss 5 Hashes erzeugen');

    const firstCode = plain[0];

    // 1. Verbrauch des ersten Codes
    const firstConsume = await consumeBackupCode(hashed, firstCode);
    assert.strictEqual(firstConsume.valid, true, 'Erster Code muss gültig sein');
    assert.strictEqual(firstConsume.remaining.length, 4, 'Es dürfen nur noch 4 Codes verbleiben');

    // 2. Erneuter Versuch mit demselben Code (Muss scheitern, da Einmal-Code)
    const secondConsume = await consumeBackupCode(firstConsume.remaining, firstCode);
    assert.strictEqual(secondConsume.valid, false, 'Bereits genutzter Code darf nicht erneut funktionieren');
    assert.strictEqual(secondConsume.remaining.length, 4, 'Anzahl der verbleibenden Codes darf sich bei Fehlschlag nicht ändern');

    // 3. Falscher Code
    const invalidConsume = await consumeBackupCode(firstConsume.remaining, 'ungueltiger_code');
    assert.strictEqual(invalidConsume.valid, false, 'Ungültiger Code muss abgewiesen werden');
  });
});
