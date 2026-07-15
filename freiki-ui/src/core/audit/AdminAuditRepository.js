const pool = require('../../infrastructure/database/postgres/pool');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id              SERIAL PRIMARY KEY,
      ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
      actor_id        INT         NOT NULL,
      actor_username  TEXT        NOT NULL,
      action          TEXT        NOT NULL,
      target_id       INT,
      target_username TEXT,
      details         JSONB
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS admin_audit_log_ts_idx ON admin_audit_log (ts)`);
}

// Fire-and-forget wie trackChatRequest in ChatRepository.js – ein Logging-Fehler
// darf die eigentliche Admin-Aktion nie blockieren oder scheitern lassen.
function log(actor, action, target = {}, details = {}) {
  pool.query(
    `INSERT INTO admin_audit_log (actor_id, actor_username, action, target_id, target_username, details)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [actor.uid, actor.username, action, target.id ?? null, target.username ?? null, JSON.stringify(details)]
  ).catch((e) => console.error('admin_audit_log insert fehlgeschlagen:', e.message));
}

async function list(limit = 200) {
  const { rows } = await pool.query(
    `SELECT id, ts, actor_username, action, target_username, details
     FROM admin_audit_log ORDER BY ts DESC LIMIT $1`, [limit]);
  return rows;
}

const RETENTION_DAYS = 180; // DSGVO Art. 5 Abs. 1 lit. e (Speicherbegrenzung)

async function purgeOld() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM admin_audit_log WHERE ts < now() - ($1 || ' days')::interval`, [RETENTION_DAYS]
    );
    if (rowCount) console.log(`[admin_audit_log] ${rowCount} Eintraege aelter als ${RETENTION_DAYS} Tage geloescht`);
  } catch (e) { console.error('admin_audit_log purge fehlgeschlagen:', e.message); }
}

function startRetentionPurgeSchedule() {
  purgeOld();
  setInterval(purgeOld, 24 * 60 * 60 * 1000);
}

module.exports = { ensureSchema, log, list, purgeOld, startRetentionPurgeSchedule };
