// Setze Test-Umgebungsvariablen, falls außerhalb von Docker ausgeführt
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_longer_than_32_characters_for_security_testing';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test_vllm_api_key';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test_pg_pass';
// prompts/ ist instanzspezifisch und gitignored (siehe .gitignore) - im frischen
// Checkout (CI) existiert der Ordner nicht. Fixture mit einem Chat-Modus verwenden.
process.env.PROMPT_DIR = process.env.PROMPT_DIR || require('path').join(__dirname, '../fixtures/prompts');

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { app } = require('../../src/infrastructure/express/app');
const pool = require('../../src/infrastructure/database/postgres/pool');

describe('API Routes & Authorization (Native Fetch / No External Dependencies)', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try { await pool.end(); } catch (_) {}
  });

  it('GET /api/modes sollte verfügbare Werkzeuge und Wissensbereiche liefern', async () => {
    const res = await fetch(`${baseUrl}/api/modes`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body), 'Antwort muss ein Array von Modi sein');
    assert.ok(body.length > 0, 'Es müssen Modi vorhanden sein');
    assert.ok(body.some(m => m.key === '0chat' || m.key === 'chat'), 'Hauptchat muss vorhanden sein');
  });

  it('POST /api/chat sollte nicht authentifizierte Anfragen mit 401 abweisen', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hallo' })
    });
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.error, 'Nicht angemeldet');
  });

  it('POST /api/feedback sollte nicht authentifizierte Anfragen mit 401 abweisen', async () => {
    const res = await fetch(`${baseUrl}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'feedback', text: 'Tolles Tool' })
    });
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/admin/users sollte für unauthentifizierte Anfragen gesperrt sein', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`);
    assert.ok([401, 403].includes(res.status), `Erwartet 401/403, erhalten: ${res.status}`);
  });

  it('GET /api/admin/audit sollte für unauthentifizierte Anfragen gesperrt sein', async () => {
    const res = await fetch(`${baseUrl}/api/admin/audit`);
    assert.ok([401, 403].includes(res.status), `Erwartet 401/403, erhalten: ${res.status}`);
  });
});
