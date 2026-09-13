// Setze Test-Umgebungsvariablen, falls außerhalb von Docker ausgeführt (gleiches Muster wie
// tests/integration/apiRoutes.test.js).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_must_be_longer_than_32_characters_for_security_testing';
process.env.VLLM_URL = process.env.VLLM_URL || 'http://localhost:8000';
process.env.VLLM_API_KEY = process.env.VLLM_API_KEY || 'test_vllm_api_key';
process.env.PG_PASS_KB = process.env.PG_PASS_KB || 'test_pg_pass';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// KBService.retrieveWissenChunksMulti ist der Retrieval-Pfad des Wissen-Modus (pgvector-Hybrid-
// suche über eine oder mehrere Bereichs-Tabellen) und bislang ohne eigene Tests, obwohl genau
// hier zwei frühere Vorfälle saßen: der ~2min App-Ausfall durch ungebremsten Cross-Area-Fanout
// (siehe [[project_korki_wissen_search_perf_2026-08-31]]) und die vergiftete Cross-Area-Retry-
// Query (siehe [[project_korki_freiki_crossarea_retry_query_bug_2026-09-03]]). Wie bei
// AuthService.test.js: kein Mocking-Framework im Projekt, also pool/KBAreaRepository/
// EmbeddingService klassisch per require.cache-Vorbelegung fingiert, BEVOR KBService requiret wird.
const queryLog = [];
let tableFixtures = {};

function fakeModule(relPath, exportsObj) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
}

const fakeClient = {
  query: async (sql) => {
    const m = sql.match(/FROM (kb_\w+)/);
    const table = m ? m[1] : null;
    queryLog.push(table);
    return { rows: tableFixtures[table] || [] };
  },
  release: () => {},
};

fakeModule('../../src/infrastructure/database/postgres/pool', {
  connect: async () => fakeClient,
  query: async () => ({ rows: [] }),
});
fakeModule('../../src/core/knowledge/KBAreaRepository', {
  getTable: (k) => ({ allgemein: 'kb_allgemein', brandschutz: 'kb_brandschutz', vip: 'kb_vip' }[k]),
  getLabel: (k) => k,
  entries: () => [['allgemein', 'kb_allgemein'], ['brandschutz', 'kb_brandschutz'], ['vip', 'kb_vip']],
  expandWithParents: (keys) => keys,
});
fakeModule('../../src/core/knowledge/EmbeddingService', {
  getEmbeddings: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
});

const { retrieveWissenChunksMulti, mergeChunksByDistance } = require('../../src/core/knowledge/KBService');

// Kurze Wörter (<5 Zeichen) erzeugen keine zusätzlichen Keyword-Terme (siehe
// extractKeywordTerms), damit pro Bereich genau eine Vektor-Query läuft statt zusätzlich
// eine Keyword-Query - hält die Fixtures einfach.
const NO_KEYWORD_QUERY = 'Wer ist da?';

// Rohe DB-Zeile, wie sie client.query() liefert (metadata als JSON-String, wird erst von
// normalizeChunkRow innerhalb von hybridAreaChunks geparst) - fuer die retrieveWissenChunksMulti-Tests.
function dbRow(distance, source, text) {
  return { pageContent: text || `Inhalt von ${source}`, metadata: JSON.stringify({ source }), distance };
}

// Bereits normalisierter Chunk (metadata als Objekt), wie ihn mergeChunksByDistance von seinen
// Aufrufern erhält - fuer die direkten mergeChunksByDistance-Tests.
function normalizedChunk(distance, source, text) {
  return { pageContent: text || `Inhalt von ${source}`, metadata: { source }, distance };
}

describe('KBService.retrieveWissenChunksMulti (Wissen-Modus Retrieval)', () => {
  beforeEach(() => {
    queryLog.length = 0;
    tableFixtures = {
      kb_allgemein: [dbRow(0.30, 'Allgemein-Doc')],
      kb_brandschutz: [dbRow(0.20, 'Brandschutz-Doc')],
      kb_vip: [dbRow(0.25, 'VIP-Doc')],
    };
  });

  it('durchsucht bei einem angeklickten Bereich (Default, searchAllAreas aus) NUR dessen Tabelle - kein Fanout über alle Bereiche', async () => {
    const results = await retrieveWissenChunksMulti(null, NO_KEYWORD_QUERY, { preferredAreaKey: 'allgemein' });
    assert.deepStrictEqual(queryLog, ['kb_allgemein']);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].metadata.source, 'Allgemein-Doc');
  });

  it('durchsucht mit searchAllAreas:true alle erlaubten Bereiche', async () => {
    await retrieveWissenChunksMulti(null, NO_KEYWORD_QUERY, { searchAllAreas: true });
    assert.deepStrictEqual([...queryLog].sort(), ['kb_allgemein', 'kb_brandschutz', 'kb_vip']);
  });

  it('filtert bei searchAllAreas:true auf die per allowedAreaKeys erlaubten Bereiche', async () => {
    await retrieveWissenChunksMulti(['allgemein'], NO_KEYWORD_QUERY, { searchAllAreas: true });
    assert.deepStrictEqual(queryLog, ['kb_allgemein']);
  });

  it('bevorzugt den angeklickten Bereich im Ranking (WISSEN_CURRENT_AREA_BOOST), ohne andere Bereiche auszuschließen', async () => {
    // Roh liegt Brandschutz näher (0.25 < 0.30), der Boost von 0.08 auf den bevorzugten
    // Bereich "allgemein" (0.30 -> 0.22) soll ihn trotzdem nach vorne holen. Ohne den Boost
    // würde dieser Test fehlschlagen (0.30 > 0.25) - er deckt also genau den Boost-Effekt ab.
    tableFixtures.kb_brandschutz = [dbRow(0.25, 'Brandschutz-Doc')];
    const results = await retrieveWissenChunksMulti(null, NO_KEYWORD_QUERY, {
      searchAllAreas: true, preferredAreaKey: 'allgemein',
    });
    assert.strictEqual(results[0].metadata.source, 'Allgemein-Doc');
    // Andere Bereiche bleiben im Ergebnis enthalten, nur im Ranking benachteiligt.
    assert.ok(results.some(r => r.metadata.source === 'Brandschutz-Doc'));
  });
});

describe('KBService.mergeChunksByDistance (Ranking/Dedup, reine Logik)', () => {
  it('sortiert nach Distanz aufsteigend', () => {
    const out = mergeChunksByDistance([normalizedChunk(0.3, 'B'), normalizedChunk(0.1, 'A'), normalizedChunk(0.2, 'C')], 10);
    assert.deepStrictEqual(out.map(c => c.metadata.source), ['A', 'C', 'B']);
  });

  it('verwirft inhaltsgleiche Chunks (gleicher Textanfang)', () => {
    const out = mergeChunksByDistance([normalizedChunk(0.1, 'A', 'Gleicher Text'), normalizedChunk(0.2, 'B', 'Gleicher Text')], 10);
    assert.strictEqual(out.length, 1);
  });

  it('begrenzt Treffer pro Quelle (maxPerSource), holt den Rest aber zur Auffüllung nach', () => {
    const many = Array.from({ length: 5 }, (_, i) => normalizedChunk(0.1 + i * 0.01, 'Quelle-A', `Text ${i}`));
    const out = mergeChunksByDistance(many, 5, 3);
    const fromA = out.filter(c => c.metadata.source === 'Quelle-A').length;
    // Erst maximal 3 aus derselben Quelle, danach werden die übrigen zur Auffüllung ans Limit nachgezogen.
    assert.strictEqual(out.length, 5);
    assert.ok(fromA >= 3);
  });
});
