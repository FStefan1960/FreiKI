const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://vllm:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test';

// prompts/ und areas.json sind wie public/index.html instanzspezifisch und nicht in Git (siehe
// .gitignore) - PromptService.js und KBAreaRepository.js lesen sie aber synchron beim Laden von
// app.js. In einem frischen CI-Checkout existieren sie nicht, deshalb hier bei Bedarf minimal
// anlegen und danach wieder entfernen.
const promptDir = path.join(__dirname, '..', 'prompts');
const areasFile = path.join(__dirname, '..', 'areas.json');
const createdPromptDir = !fs.existsSync(promptDir);
const createdAreasFile = !fs.existsSync(areasFile);
if (createdPromptDir) fs.mkdirSync(promptDir);
if (createdAreasFile) fs.writeFileSync(areasFile, '{}');

const request = require('supertest');
const { app } = require('../src/infrastructure/express/app');

after(() => {
  if (createdPromptDir) fs.rmdirSync(promptDir);
  if (createdAreasFile) fs.rmSync(areasFile);
});

// Diese Tests decken nur die Guard-Pfade ab, die vor jedem DB-Zugriff greifen (fehlende
// Zugangsdaten, fehlende Session) - ein echter Login-Durchlauf braucht eine echte Postgres-
// Verbindung und ist hier bewusst nicht Teil des Unit-Tests.

test('POST /api/login ohne Zugangsdaten -> 401, kein Cookie', async () => {
  const res = await request(app).post('/api/login').send({});
  assert.equal(res.status, 401);
  assert.equal(res.headers['set-cookie'], undefined);
});

test('GET /api/me ohne Session-Cookie -> 401', async () => {
  const res = await request(app).get('/api/me');
  assert.equal(res.status, 401);
});

test('GET /api/health/detail ohne Admin-Session -> 401', async () => {
  const res = await request(app).get('/api/health/detail');
  assert.equal(res.status, 401);
});

test('POST /api/logout loescht das freiki_session-Cookie', async () => {
  const res = await request(app).post('/api/logout');
  assert.equal(res.status, 200);
  const setCookie = res.headers['set-cookie'] || [];
  assert.ok(setCookie.some(c => c.startsWith('freiki_session=;') || c.includes('freiki_session=;')));
});
