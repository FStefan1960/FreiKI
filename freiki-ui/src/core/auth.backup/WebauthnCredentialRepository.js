const pool = require('../../infrastructure/database/postgres/pool');

// Eigene Tabelle statt Spalten auf freiki_users, da ein Nutzer mehrere Passkeys
// (verschiedene Geräte) registrieren kann.
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES freiki_users(id) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      device_type TEXT,
      backed_up BOOLEAN NOT NULL DEFAULT false,
      transports JSONB NOT NULL DEFAULT '[]',
      nickname TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      last_used_at TIMESTAMP
    )
  `);
}

function listByUser(userId) {
  return pool.query(
    'SELECT id, credential_id, nickname, device_type, created_at, last_used_at FROM webauthn_credentials WHERE user_id=$1 ORDER BY created_at',
    [userId]
  ).then(r => r.rows);
}

function findByCredentialId(credentialId) {
  return pool.query('SELECT * FROM webauthn_credentials WHERE credential_id=$1', [credentialId])
    .then(r => r.rows[0] || null);
}

async function create({ userId, credentialId, publicKey, counter, deviceType, backedUp, transports, nickname }) {
  const { rows } = await pool.query(
    `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, device_type, backed_up, transports, nickname)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
    [userId, credentialId, publicKey, counter || 0, deviceType || null, !!backedUp, JSON.stringify(transports || []), nickname || null]
  );
  return rows[0].id;
}

async function updateCounter(credentialId, counter) {
  await pool.query(
    'UPDATE webauthn_credentials SET counter=$1, last_used_at=now() WHERE credential_id=$2',
    [counter, credentialId]
  );
}

async function remove(id, userId) {
  const { rowCount } = await pool.query(
    'DELETE FROM webauthn_credentials WHERE id=$1 AND user_id=$2',
    [id, userId]
  );
  return rowCount > 0;
}

async function removeAllForUser(userId) {
  await pool.query('DELETE FROM webauthn_credentials WHERE user_id=$1', [userId]);
}

async function countByUser(userId) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM webauthn_credentials WHERE user_id=$1', [userId]);
  return rows[0].n;
}

module.exports = {
  ensureSchema, listByUser, findByCredentialId, create, updateCounter, remove, removeAllForUser, countByUser,
};
