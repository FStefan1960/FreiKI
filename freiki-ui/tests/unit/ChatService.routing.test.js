// Setze Test-Umgebungsvariablen, falls außerhalb von Docker ausgeführt (gleiches Muster wie
// tests/integration/apiRoutes.test.js / tests/unit/AuthService.test.js).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_longer_than_32_characters_for_security_testing';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test_vllm_api_key';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test_pg_pass';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// ChatService.handleChat verteilt jede Chat-Anfrage anhand der Modus-Konfiguration (aus
// prompts/*.md-Frontmatter, siehe Adminhandbuch 5.3 "Routing-Logik") an genau einen von sechs
// Modus-Handlern und ist damit der meistgenutzte, bislang ungetestete Pfad der App. Ohne
// Mocking-Framework im Projekt (nur node:test, mock.module auf der hier verfügbaren
// Node-Version nicht nutzbar) werden alle Abhängigkeiten klassisch per require.cache-
// Vorbelegung durch In-Memory-Fakes ersetzt, BEVOR ChatService requiret wird - gleiches Muster
// wie tests/unit/AuthService.test.js.
const calls = {
  paperless: [], imagegen: [], musicgen: [], qrgen: [], wissen: [], direct: [],
};
let fakeModes = {};
let fakeUseAreas = {};

function fakeModule(relPath, exportsObj) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

fakeModule('../../src/core/chat/PromptService', {
  findMode: (key) => fakeModes[key],
});
fakeModule('../../src/core/knowledge/KBAreaRepository', {
  expandWithParents: (keys) => keys, // keine Eltern-Bereiche in den Testdaten nötig
});
fakeModule('../../src/core/chat/ChatRepository', {
  trackChatRequest: () => {},
});
fakeModule('../../src/core/audit/SensitiveQueryLog', {
  checkAndLog: () => {},
});
fakeModule('../../src/core/documents/DocumentService', {
  extractForChat: async () => ({ text: '', isOcr: false }),
  extractForMultidoc: async () => [],
});
fakeModule('../../src/core/auth/UserRepository', {
  findLiveAreasById: async (id) => ({ use_areas: fakeUseAreas[id] || [] }),
  findLiveLanguageById: async () => 'de',
});
fakeModule('../../src/core/integrations/SearXNGService', {
  webSearch: async () => '',
});
fakeModule('../../src/jobs/usageStatsReport', {
  recordChatEvent: () => {},
  isSystemUser: () => false,
});
fakeModule('../../src/core/chat/MediaGenChatMode', {
  handleImageGenMode: async (res, message) => { calls.imagegen.push({ message }); },
  handleMusicGenMode: async (res, message) => { calls.musicgen.push({ message }); },
  handleQrGenMode: async (res, message) => { calls.qrgen.push({ message }); },
  waitWhileImageGenerating: async () => {},
  GPU_CHAT_WAIT_HINT: '(wartet)',
});
fakeModule('../../src/core/chat/PaperlessChatMode', {
  handlePaperlessMode: async (res, message) => { calls.paperless.push({ message }); },
});
fakeModule('../../src/core/chat/WissenChatMode', {
  handleWissenMode: async (res, args) => { calls.wissen.push(args); },
});
fakeModule('../../src/core/chat/DirectChatMode', {
  handleDirectMode: async (res, args) => { calls.direct.push(args); },
});

const { handleChat } = require('../../src/core/chat/ChatService');

function makeReq({ mode, message = 'Hallo', session = { username: 'tester', uid: 1, role: 'admin' } }) {
  return { body: { message, mode, history: [] }, files: undefined, session };
}

function makeRes() {
  const state = { statusCode: 200, jsonBody: null, headersSent: false };
  return {
    state,
    setHeader: () => {},
    flushHeaders: () => {},
    write: () => {},
    end: () => {},
    status(code) { state.statusCode = code; return this; },
    json(body) { state.jsonBody = body; state.headersSent = true; return this; },
    get headersSent() { return state.headersSent; },
  };
}

describe('ChatService.handleChat Routing (produktiver Haupt-Chat-Pfad)', () => {
  beforeEach(() => {
    calls.paperless = []; calls.imagegen = []; calls.musicgen = []; calls.qrgen = []; calls.wissen = []; calls.direct = [];
    fakeModes = {
      chat: { key: 'chat', title: 'Chat' },
      w_allgemein: { key: 'w_allgemein', workspace: 'wissen' },
      w_vip: { key: 'w_vip', workspace: 'wissen' },
      archiv: { key: 'archiv', paperless: true },
      bilder: { key: 'bilder', imagegen: true },
      musik: { key: 'musik', musicgen: true },
      qr: { key: 'qr', qrgen: true },
    };
    fakeUseAreas = { 42: ['allgemein'] };
  });

  it('routet einen Modus ohne workspace/paperless/*gen in den direkten Chat-Modus', async () => {
    await handleChat(makeReq({ mode: 'chat' }), makeRes());
    assert.strictEqual(calls.direct.length, 1);
    assert.strictEqual(calls.wissen.length, 0);
  });

  it('routet workspace:"wissen" in den Wissen-Modus und leitet den Bereichs-Key aus dem w_-Präfix ab', async () => {
    await handleChat(makeReq({ mode: 'w_allgemein' }), makeRes());
    assert.strictEqual(calls.wissen.length, 1);
    assert.strictEqual(calls.wissen[0].wissenKey, 'allgemein');
    assert.strictEqual(calls.direct.length, 0);
  });

  it('routet paperless:true in den Archiv-Modus', async () => {
    await handleChat(makeReq({ mode: 'archiv' }), makeRes());
    assert.strictEqual(calls.paperless.length, 1);
  });

  it('routet imagegen:true in die Bildgenerierung', async () => {
    await handleChat(makeReq({ mode: 'bilder' }), makeRes());
    assert.strictEqual(calls.imagegen.length, 1);
  });

  it('routet musicgen:true in die Musikgenerierung', async () => {
    await handleChat(makeReq({ mode: 'musik' }), makeRes());
    assert.strictEqual(calls.musicgen.length, 1);
  });

  it('routet qrgen:true in die QR-Code-Generierung', async () => {
    await handleChat(makeReq({ mode: 'qr' }), makeRes());
    assert.strictEqual(calls.qrgen.length, 1);
  });

  it('verweigert den Zugriff mit 403, wenn der angefragte Wissensbereich nicht in use_areas des Nutzers enthalten ist - kein Modus-Handler wird aufgerufen', async () => {
    const req = makeReq({ mode: 'w_vip', session: { username: 'restricted', uid: 42, role: 'default' } });
    const res = makeRes();
    await handleChat(req, res);
    assert.strictEqual(res.state.statusCode, 403);
    assert.strictEqual(calls.wissen.length, 0);
  });

  it('lässt Zugriff auf einen freigegebenen Wissensbereich zu, auch für eingeschränkte Rollen', async () => {
    const req = makeReq({ mode: 'w_allgemein', session: { username: 'restricted', uid: 42, role: 'default' } });
    await handleChat(req, makeRes());
    assert.strictEqual(calls.wissen.length, 1);
  });
});
