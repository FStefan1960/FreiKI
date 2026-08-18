// Setze Test-Umgebungsvariablen, falls außerhalb von Docker ausgeführt (gleiches Muster wie
// tests/integration/apiRoutes.test.js).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_longer_than_32_characters_for_security_testing';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test_vllm_api_key';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test_pg_pass';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// AuthService.login() greift direkt auf UserRepository/WebauthnCredentialRepository zu
// (beide Postgres) statt sie injiziert zu bekommen. Ohne Mocking-Framework im Projekt (nur
// node:test) ersetzen wir die Module klassisch per require.cache-Vorbelegung durch
// In-Memory-Fakes, BEVOR AuthService requiret wird - node:test's mock.module() ist auf der
// hier verfügbaren Node-Version nicht nutzbar (mock.module ist undefined).
const userRepoPath = require.resolve('../../src/core/auth/UserRepository');
const webauthnCredsPath = require.resolve('../../src/core/auth/WebauthnCredentialRepository');

let fakeUsers = [];
let passkeyCounts = {};

require.cache[userRepoPath] = {
  id: userRepoPath, filename: userRepoPath, loaded: true,
  exports: {
    findByUsername: async (username) => fakeUsers.find(u => u.username === username) || null,
    findById: async (id) => fakeUsers.find(u => u.id === id) || null,
  },
};
require.cache[webauthnCredsPath] = {
  id: webauthnCredsPath, filename: webauthnCredsPath, loaded: true,
  exports: {
    countByUser: async (uid) => passkeyCounts[uid] || 0,
  },
};

const { login } = require('../../src/core/auth/AuthService');
const { config } = require('../../src/shared/config');

describe('AuthService.login (kritischer Auth-Pfad, per Fake-Repository statt echter DB)', () => {
  before(async () => {
    fakeUsers = [
      { id: 1, username: 'normaluser', password_hash: await bcrypt.hash('correct-horse', 10), role: 'default', suspended: false, totp_enabled: false, use_areas: ['allgemein'], manage_areas: [] },
      { id: 2, username: 'suspendeduser', password_hash: await bcrypt.hash('whatever', 10), role: 'default', suspended: true, totp_enabled: false },
      { id: 3, username: 'admin2fa', password_hash: await bcrypt.hash('adminpass', 10), role: 'admin', suspended: false, totp_enabled: true },
      { id: 4, username: 'adminnosetup', password_hash: await bcrypt.hash('adminpass2', 10), role: 'admin', suspended: false, totp_enabled: false },
      { id: 5, username: 'admin2fa-nopasskey', password_hash: await bcrypt.hash('pw', 10), role: 'admin', suspended: false, totp_enabled: true },
    ];
    passkeyCounts = { 3: 2 };
  });

  it('sollte unbekannten Benutzernamen mit invalid ablehnen', async () => {
    const result = await login('doesnotexist', 'irrelevant');
    assert.deepStrictEqual(result, { error: 'invalid' });
  });

  it('sollte gesperrte Nutzer mit invalid ablehnen, auch bei korrektem Passwort', async () => {
    const result = await login('suspendeduser', 'whatever');
    assert.deepStrictEqual(result, { error: 'invalid' });
  });

  it('sollte falsches Passwort mit invalid ablehnen', async () => {
    const result = await login('normaluser', 'wrong-password');
    assert.deepStrictEqual(result, { error: 'invalid' });
  });

  it('sollte bei korrekten Zugangsdaten ohne 2FA ein gültiges Session-Token ausstellen', async () => {
    const result = await login('normaluser', 'correct-horse');
    assert.ok(result.token, 'Token muss gesetzt sein');
    assert.strictEqual(result.role, 'default');
    assert.strictEqual(result.user.username, 'normaluser');
    assert.deepStrictEqual(result.useAreas, ['allgemein']);
    assert.strictEqual(result.mustSetup2fa, undefined, 'default-Rolle braucht kein 2FA-Setup');
    const decoded = jwt.verify(result.token, config.JWT_SECRET);
    assert.strictEqual(decoded.uid, 1);
    assert.strictEqual(decoded.totpEnabled, false);
  });

  it('sollte bei aktivem 2FA einen Pending-Token statt eines vollen Session-Tokens liefern', async () => {
    const result = await login('admin2fa', 'adminpass');
    assert.strictEqual(result.requires2fa, true);
    assert.ok(result.pendingToken);
    assert.strictEqual(result.hasPasskeys, true, 'Nutzer 3 hat laut Fake-Repository 2 Passkeys');
    assert.strictEqual(result.token, undefined, 'darf vor der 2FA-Bestätigung kein volles Session-Token liefern');
    const decoded = jwt.verify(result.pendingToken, config.JWT_SECRET);
    assert.strictEqual(decoded.pending2fa, true);
    assert.strictEqual(decoded.role, undefined, 'Pending-Token darf keine role/use/manage-Claims tragen (siehe Kommentar in AuthMiddleware.js)');
  });

  it('sollte hasPasskeys korrekt auf false setzen, wenn keine Passkeys registriert sind', async () => {
    const result = await login('admin2fa-nopasskey', 'pw');
    assert.strictEqual(result.requires2fa, true);
    assert.strictEqual(result.hasPasskeys, false);
  });

  it('sollte mustSetup2fa setzen, wenn die Rolle 2FA verlangt, es aber noch nicht eingerichtet ist', async () => {
    const result = await login('adminnosetup', 'adminpass2');
    assert.ok(result.token, 'Login gelingt trotzdem, sonst gäbe es keinen Weg zum Einrichten (siehe Kommentar in AuthService.js)');
    assert.strictEqual(result.mustSetup2fa, true);
  });
});
