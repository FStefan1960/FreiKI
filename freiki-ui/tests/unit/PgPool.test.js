const { test } = require('node:test');
const assert = require('node:assert');
const pool = require('../../src/infrastructure/database/postgres/pool');

test('PG Pool hat einen error-Listener, damit ein idle-Client-Fehler (z.B. Postgres-Neustart) nicht zur uncaughtException wird', () => {
  assert.ok(
    pool.listenerCount('error') > 0,
    'pool.on("error", ...) fehlt – ein idle-Client-Fehler würde den Prozess crashen (siehe node-postgres Doku)'
  );

  assert.doesNotThrow(() => {
    pool.emit('error', new Error('simulierter Verbindungsabbruch'));
  });
});
