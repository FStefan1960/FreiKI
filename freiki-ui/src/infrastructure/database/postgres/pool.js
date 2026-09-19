const { Pool } = require('pg');
const { config } = require('../../../shared/config');

// Einziger Pool für die gesamte App – dient sowohl der App-DB (freiki_users, app_config, ...)
// als auch den KB-Tabellen (pgvector). Im alten server.js hieß das zweite noch "kbPool",
// war aber bereits derselbe Pool (kbPool = pgPool).
const pool = new Pool({
  host: config.PG_HOST,
  database: config.PG_DB,
  user: config.PG_USER_KB,
  password: config.PG_PASS_KB,
  port: 5432,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// pg emittiert 'error' auf dem Pool, wenn ein idle Client die Verbindung verliert
// (z.B. Postgres-Neustart bei einem Update). Ohne Listener wird das zur uncaughtException
// und reißt den ganzen Prozess mit runter – siehe https://node-postgres.com/apis/pool.
pool.on('error', (err) => {
  console.error('PG Pool: idle client error (Verbindung wird beim nächsten Query neu aufgebaut):', err.message);
});

module.exports = pool;
