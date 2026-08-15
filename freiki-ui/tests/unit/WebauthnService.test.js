// Setze Test-Umgebungsvariablen, falls außerhalb von Docker ausgeführt
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_longer_than_32_characters_for_security_testing';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test_vllm_api_key';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test_pg_pass';
// Node <20 stellt globalThis.crypto nicht automatisch bereit; @simplewebauthn/server
// braucht das für die Challenge-Erzeugung (Produktiv-Container läuft auf node:20-alpine,
// aber ein Host-seitiges `npm test` z.B. auf diesem Server nutzt Node 18).
if (!globalThis.crypto) {
  globalThis.crypto = require('node:crypto').webcrypto;
}

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { config } = require('../../src/shared/config');

// WebauthnCredentialRepository ist ein Singleton (require-Cache) - Methoden werden pro Test
// direkt am Objekt überschrieben statt echter DB-Zugriffe, damit keine Postgres-Instanz nötig ist.
const creds = require('../../src/core/auth/WebauthnCredentialRepository');
const webauthn = require('../../src/core/auth/WebauthnService');

describe('WebauthnService (Passkey/FIDO2)', () => {
  let originalListByUser, originalFindByCredentialId;

  beforeEach(() => {
    originalListByUser = creds.listByUser;
    originalFindByCredentialId = creds.findByCredentialId;
  });

  afterEach(() => {
    creds.listByUser = originalListByUser;
    creds.findByCredentialId = originalFindByCredentialId;
  });

  it('sollte Registrierungs-Optionen mit erzwungener Nutzerverifikation (Face ID/Touch ID) erzeugen', async () => {
    creds.listByUser = async () => [];
    const options = await webauthn.getRegistrationOptions(101, 'frank');
    assert.strictEqual(options.rp.id, new URL(config.APP_URL).hostname);
    assert.strictEqual(options.user.name, 'frank');
    assert.strictEqual(options.authenticatorSelection.userVerification, 'required');
    assert.strictEqual(options.authenticatorSelection.authenticatorAttachment, 'platform');
    assert.ok(options.challenge, 'Challenge muss erzeugt werden');
  });

  it('sollte bereits registrierte Passkeys von neuen Registrierungen ausschließen (excludeCredentials)', async () => {
    creds.listByUser = async () => [{ credential_id: 'cred-abc', transports: ['internal'] }];
    const options = await webauthn.getRegistrationOptions(102, 'frank');
    assert.ok(
      options.excludeCredentials.some(c => c.id === 'cred-abc'),
      'Vorhandener Passkey muss in excludeCredentials auftauchen'
    );
  });

  it('sollte Registrierungs-Verifikation ohne zuvor angeforderte Optionen ablehnen (challenge-expired)', async () => {
    const result = await webauthn.verifyRegistration(103, { id: 'irrelevant' }, 'Mein Handy');
    assert.strictEqual(result.error, 'challenge-expired');
  });

  it('sollte "no-passkeys" liefern, wenn ein Nutzer keine Passkeys registriert hat', async () => {
    creds.listByUser = async () => [];
    const result = await webauthn.getAuthenticationOptions(104);
    assert.strictEqual(result.error, 'no-passkeys');
  });

  it('sollte Authentifizierungs-Optionen mit erzwungener Nutzerverifikation erzeugen', async () => {
    creds.listByUser = async () => [{ credential_id: 'cred-abc', transports: ['internal'] }];
    const options = await webauthn.getAuthenticationOptions(105);
    assert.strictEqual(options.userVerification, 'required');
    assert.ok(options.allowCredentials.some(c => c.id === 'cred-abc'));
  });

  it('sollte Authentifizierungs-Verifikation ohne zuvor angeforderte Optionen ablehnen (challenge-expired)', async () => {
    const result = await webauthn.verifyAuthentication(106, { id: 'cred-abc' });
    assert.strictEqual(result.error, 'challenge-expired');
  });

  it('sollte unbekannte Credential-IDs bei der Verifikation ablehnen', async () => {
    creds.listByUser = async () => [{ credential_id: 'cred-abc', transports: ['internal'] }];
    await webauthn.getAuthenticationOptions(107); // Challenge stashen
    creds.findByCredentialId = async () => null;
    const result = await webauthn.verifyAuthentication(107, { id: 'nicht-registriert' });
    assert.strictEqual(result.error, 'unknown-credential');
  });

  it('sollte Credentials anderer Nutzer bei der Verifikation ablehnen (Cross-User-Schutz)', async () => {
    creds.listByUser = async () => [{ credential_id: 'cred-abc', transports: ['internal'] }];
    await webauthn.getAuthenticationOptions(108); // Challenge für uid 108 stashen
    creds.findByCredentialId = async () => ({ credential_id: 'cred-abc', user_id: 999 }); // gehört uid 999
    const result = await webauthn.verifyAuthentication(108, { id: 'cred-abc' });
    assert.strictEqual(result.error, 'unknown-credential');
  });
});
