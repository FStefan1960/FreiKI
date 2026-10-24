const pool = require('../../infrastructure/database/postgres/pool');

// Schlankes Nutzungsprotokoll für den Excel-Chat: nur Metadaten (wer, wann, welche Datei, welche
// Aktion), NIE Fragen, Antworten oder Zellinhalte -- gleiche Datensparsamkeit wie sensitive_query_log.
const ACTIONS = new Set(['upload', 'write', 'download']);
const RETENTION_DAYS = 180;

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS excel_usage_log (
      id       SERIAL PRIMARY KEY,
      ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id  INT         NOT NULL,
      username TEXT        NOT NULL,
      filename TEXT        NOT NULL DEFAULT '',
      action   TEXT        NOT NULL
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS excel_usage_log_ts_idx ON excel_usage_log (ts)');
}

// Fire-and-forget: ein Protokollfehler darf den Excel-Chat nie blockieren.
function log(session, action, filename) {
  if (!session?.uid || !ACTIONS.has(action)) return;
  pool.query(
    'INSERT INTO excel_usage_log (user_id, username, filename, action) VALUES ($1,$2,$3,$4)',
    [session.uid, session.username || '', String(filename || '').slice(0, 120), action]
  ).catch((err) => console.error('excel_usage_log insert fehlgeschlagen:', err.message));
}

async function list(limit = 200) {
  const { rows } = await pool.query(
    'SELECT id, ts, username, filename, action FROM excel_usage_log ORDER BY ts DESC LIMIT $1', [limit]);
  return rows;
}

async function purgeOld() {
  try {
    await pool.query(`DELETE FROM excel_usage_log WHERE ts < now() - ($1 || ' days')::interval`, [RETENTION_DAYS]);
  } catch (e) { console.error('excel_usage_log purge fehlgeschlagen:', e.message); }
}

function startRetentionPurgeSchedule() {
  purgeOld();
  setInterval(purgeOld, 24 * 60 * 60 * 1000).unref();
}

module.exports = { ensureSchema, log, list, purgeOld, startRetentionPurgeSchedule };
