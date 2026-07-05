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
});

module.exports = pool;
