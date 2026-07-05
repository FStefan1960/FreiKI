const pool = require('../../infrastructure/database/postgres/pool');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_log (
      ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id INT         NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS chat_log_ts_idx ON chat_log (ts)`);
  await pool.query(`DELETE FROM chat_log WHERE ts < now() - INTERVAL '90 days'`);
}

function trackChatRequest(userId) {
  if (userId) pool.query('INSERT INTO chat_log (user_id) VALUES ($1)', [userId]).catch(() => {});
}

async function getTodayStats() {
  const { rows } = await pool.query(`
    SELECT COUNT(*) AS requests, COUNT(DISTINCT user_id) AS users
    FROM chat_log WHERE ts >= date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin'
  `);
  return { requests: parseInt(rows[0].requests), users: parseInt(rows[0].users) };
}

module.exports = { ensureSchema, trackChatRequest, getTodayStats };
