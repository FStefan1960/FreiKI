const pool = require('../../infrastructure/database/postgres/pool');
const patterns = require('./SensitivePatterns');
const users = require('../auth/UserRepository');
const { sendSensitiveQueryReportMail } = require('../integrations/EmailService');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sensitive_query_log (
      id       SERIAL PRIMARY KEY,
      ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id  INT         NOT NULL,
      username TEXT        NOT NULL,
      role     TEXT        NOT NULL,
      tool     TEXT        NOT NULL,
      category TEXT        NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS sensitive_query_log_ts_idx ON sensitive_query_log (ts)`);
}

// Rein detektiv, nie blockierend: prüft den Text gegen die Stichwortliste und protokolliert
// bei Treffer nur Metadaten (wer, welches Werkzeug, welche Kategorie) -- NIE den Anfrage-Text
// selbst, sonst legt man sich das sensible Datenlager an, das man vermeiden will.
function checkAndLog(session, tool, text) {
  if (!session?.uid) return;
  const category = patterns.detect(text);
  if (!category) return;
  pool.query(
    'INSERT INTO sensitive_query_log (user_id, username, role, tool, category) VALUES ($1,$2,$3,$4,$5)',
    [session.uid, session.username, session.role, tool, category]
  ).catch((e) => console.error('sensitive_query_log insert fehlgeschlagen:', e.message));
}

async function list(limit = 200) {
  const { rows } = await pool.query(
    `SELECT id, ts, username, role, tool, category
     FROM sensitive_query_log ORDER BY ts DESC LIMIT $1`, [limit]);
  return rows;
}

// Für den täglichen Report: nur 'default'-Treffer der letzten 24h -- bei high_risk/admin ist
// ein Treffer erwartbar (siehe Dienstanweisung-Ausnahme), bei default die eigentliche Anomalie.
async function listDefaultRoleLast24h() {
  const { rows } = await pool.query(
    `SELECT ts, username, tool, category FROM sensitive_query_log
     WHERE role = 'default' AND ts >= now() - INTERVAL '24 hours'
     ORDER BY ts ASC`
  );
  return rows;
}

const RETENTION_DAYS = 180; // DSGVO Art. 5 Abs. 1 lit. e (Speicherbegrenzung) - Log dient nur der
                             // kurzfristigen Anomalie-Erkennung, keine Notwendigkeit fuer unbegrenzte Aufbewahrung

async function purgeOld() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM sensitive_query_log WHERE ts < now() - ($1 || ' days')::interval`, [RETENTION_DAYS]
    );
    if (rowCount) console.log(`[sensitive_query_log] ${rowCount} Eintraege aelter als ${RETENTION_DAYS} Tage geloescht`);
  } catch (e) { console.error('sensitive_query_log purge fehlgeschlagen:', e.message); }
}

function startRetentionPurgeSchedule() {
  purgeOld();
  setInterval(purgeOld, 24 * 60 * 60 * 1000);
}

const REPORT_HOUR_BERLIN = 7; // Uhrzeit (Europe/Berlin), zu der der Tagesbericht verschickt wird
let lastReportSentDate = null; // 'YYYY-MM-DD' (Europe/Berlin) -- verhindert Mehrfachversand am selben Tag

// Stündlicher Check statt exaktem Cron-Zeitpunkt -- ein fester Zeitpunkt-Trigger hat sich bei
// n8n in diesem Projekt schon als unzuverlässig erwiesen (siehe MEMORY
// feedback_n8n_workflow_testing). Ein Stunden-Fenster + Datums-Merker ist robuster gegen
// Container-Neustarts und leichte Zeitverschiebungen.
async function checkAndSendDailyReport() {
  const now = new Date();
  const berlinHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }), 10);
  const berlinDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  if (berlinHour !== REPORT_HOUR_BERLIN || lastReportSentDate === berlinDate) return;
  lastReportSentDate = berlinDate;
  try {
    const entries = await listDefaultRoleLast24h();
    if (!entries.length) return;
    const admins = await users.listAdminEmails();
    if (!admins.length) return;
    await sendSensitiveQueryReportMail(admins, entries);
  } catch (e) {
    console.error('Tagesbericht sensible Anfragen fehlgeschlagen:', e.message);
  }
}

function startDailyReportSchedule() {
  setInterval(checkAndSendDailyReport, 60 * 60 * 1000);
}

module.exports = { ensureSchema, checkAndLog, list, listDefaultRoleLast24h, startDailyReportSchedule, purgeOld, startRetentionPurgeSchedule };
