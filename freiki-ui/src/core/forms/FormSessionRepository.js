const crypto = require('crypto');
const pool = require('../../infrastructure/database/postgres/pool');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_sessions (
      id                   UUID PRIMARY KEY,
      template_id          INT NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
      pin_hash             TEXT NOT NULL,
      answers              JSONB NOT NULL DEFAULT '{}'::jsonb,
      current_field_index  INT NOT NULL DEFAULT 0,
      language             TEXT NOT NULL DEFAULT 'Deutsch',
      username             TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // ADD COLUMN IF NOT EXISTS zusätzlich zum CREATE TABLE: Tabelle existiert auf bereits
  // deployten Instanzen schon ohne diese Spalten (Mehrsprachigkeit/Username kamen nachträglich dazu).
  await pool.query(`ALTER TABLE form_sessions ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'Deutsch'`);
  await pool.query(`ALTER TABLE form_sessions ADD COLUMN IF NOT EXISTS username TEXT`);
  // PIN wird per SHA-256 statt bcrypt gehasht: sie muss beim Fortsetzen direkt per Query
  // gefunden werden (kein Session-Cookie vorhanden), bcrypt erlaubt nur Vergleich, kein
  // Lookup. Da die PIN zufällig/serverseitig generiert wird (kein wiederverwendetes
  // Nutzerpasswort), ist ein deterministischer Hash mit Index hier vertretbar.
  await pool.query(`CREATE INDEX IF NOT EXISTS form_sessions_pin_idx ON form_sessions (template_id, pin_hash)`);
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

// 8-stellige, zufällige DokumentenPIN - siehe Kommentar oben zur Hash-Wahl.
function generatePin() {
  return String(crypto.randomInt(0, 100000000)).padStart(8, '0');
}

async function create(templateId, language = 'Deutsch', username = null) {
  const id = crypto.randomUUID();
  const pin = generatePin();
  await pool.query(
    `INSERT INTO form_sessions (id, template_id, pin_hash, language, username) VALUES ($1,$2,$3,$4,$5)`,
    [id, templateId, hashPin(pin), language, username]
  );
  return { id, pin };
}

// Für die Fortsetzen-Auswahl im Formular-Chat: zeigt WER welches Formular offen hat, damit sich
// mehrere Nutzer mit derselben Vorlage nicht verwechseln - die PIN selbst bleibt trotzdem der
// einzige Weg, tatsächlich fortzusetzen (keine sensiblen Antwortinhalte in dieser Liste).
async function listOpen() {
  const { rows } = await pool.query(
    `SELECT ft.slug, ft.title, fs.username, fs.updated_at
     FROM form_sessions fs
     JOIN form_templates ft ON ft.id = fs.template_id
     ORDER BY fs.updated_at DESC`
  );
  return rows;
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT id, template_id, answers, current_field_index, language, created_at, updated_at
     FROM form_sessions WHERE id=$1`, [id]
  );
  return rows[0] || null;
}

async function findByPin(templateId, pin) {
  const { rows } = await pool.query(
    `SELECT id, template_id, answers, current_field_index, language, created_at, updated_at
     FROM form_sessions WHERE template_id=$1 AND pin_hash=$2`,
    [templateId, hashPin(pin)]
  );
  return rows[0] || null;
}

async function saveAnswer(id, fieldKey, value, nextFieldIndex) {
  await pool.query(
    `UPDATE form_sessions
     SET answers = jsonb_set(answers, $2, to_jsonb($3::text), true),
         current_field_index = $4,
         updated_at = now()
     WHERE id=$1`,
    [id, `{${fieldKey}}`, value, nextFieldIndex]
  );
}

// Für übersprungene (nicht-pflicht) Felder - rückt weiter, ohne einen Wert zu speichern.
async function advanceField(id, nextFieldIndex) {
  await pool.query(
    `UPDATE form_sessions SET current_field_index=$2, updated_at=now() WHERE id=$1`,
    [id, nextFieldIndex]
  );
}

async function deleteSession(id) {
  await pool.query(`DELETE FROM form_sessions WHERE id=$1`, [id]);
}

// DSGVO Art. 5 Abs. 1 lit. e - verwaiste (nie zu Ende geführte) Sitzungen. Frontend verspricht
// dem Nutzer "7 Tage" Zeit zum Fortsetzen (siehe pinNote/modalHint in FormDialogService.js) -
// 10 Tage hier als bewusster Sicherheitspuffer, damit niemand exakt am 7. Tag ausgesperrt wird.
const RETENTION_DAYS = 10;

async function purgeOld() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM form_sessions WHERE updated_at < now() - ($1 || ' days')::interval`, [RETENTION_DAYS]
    );
    if (rowCount) console.log(`[form_sessions] ${rowCount} verwaiste Sitzung(en) aelter als ${RETENTION_DAYS} Tage geloescht`);
  } catch (e) { console.error('form_sessions purge fehlgeschlagen:', e.message); }
}

function startFormSessionPurgeSchedule() {
  purgeOld();
  setInterval(purgeOld, 24 * 60 * 60 * 1000);
}

module.exports = {
  ensureSchema, create, listOpen, getById, findByPin, saveAnswer, advanceField, deleteSession,
  purgeOld, startFormSessionPurgeSchedule,
};
