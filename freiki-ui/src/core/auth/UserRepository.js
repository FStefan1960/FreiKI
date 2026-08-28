const pool = require('../../infrastructure/database/postgres/pool');

const VALID_ROLES = ['admin', 'manager', 'high_risk', 'default'];
const cleanAreas = (a) => Array.isArray(a) ? a.map(x => String(x).trim()).filter(Boolean) : [];

// Bis 2026-08 wurde freiki_users nicht von dieser App angelegt, sondern historisch per
// Einmal-Skript (setup/schema.sql, seither veraltet und entfernt) - auf einer leeren DB
// scheiterte ensureSchema() dadurch, weil ALTER TABLE eine bestehende Tabelle voraussetzt.
// Jetzt wie alle anderen Repositories (AdminAuditRepository, WebauthnCredentialRepository,
// FormTemplateRepository) selbstbootstrappend per CREATE TABLE IF NOT EXISTS.
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS freiki_users (
      id                 SERIAL PRIMARY KEY,
      username           TEXT NOT NULL UNIQUE,
      password_hash      TEXT NOT NULL,
      role               TEXT NOT NULL DEFAULT 'default',
      first_name         TEXT DEFAULT '',
      last_name          TEXT DEFAULT '',
      funktion           TEXT DEFAULT '',
      email              TEXT DEFAULT '',
      use_areas          TEXT[] DEFAULT '{}',
      manage_areas       TEXT[] DEFAULT '{}',
      suspended          BOOLEAN DEFAULT false,
      legacy_bio         TEXT DEFAULT '',
      created_at         TIMESTAMPTZ DEFAULT now(),
      updated_at         TIMESTAMPTZ DEFAULT now(),
      use_paperless      BOOLEAN NOT NULL DEFAULT false
    )
  `);
  await pool.query(`
    ALTER TABLE freiki_users
      ADD COLUMN IF NOT EXISTS totp_secret TEXT,
      ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS totp_backup_codes JSONB NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS telefon TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'de',
      ADD COLUMN IF NOT EXISTS training_completed BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS training_completed_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS enter_to_send BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS use_metacom BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS dienststelle TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS news_ack_version INTEGER NOT NULL DEFAULT 0
  `);
}

function findByUsername(username) {
  return pool.query('SELECT * FROM freiki_users WHERE lower(username)=lower($1)', [username])
    .then(r => r.rows[0] || null);
}

function findById(id) {
  return pool.query('SELECT * FROM freiki_users WHERE id=$1', [id]).then(r => r.rows[0] || null);
}

function findProfileById(id) {
  return pool.query('SELECT username, email, role, first_name, last_name, funktion, telefon, language, enter_to_send FROM freiki_users WHERE id=$1', [id])
    .then(r => r.rows[0] || null);
}

// Liefert auch language mit, damit ChatService bei Bedarf (Wissen-Modus) auf den
// separaten findLiveLanguageById()-Roundtrip verzichten kann.
function findLiveAreasById(id) {
  return pool.query('SELECT use_areas, use_paperless, use_metacom, language FROM freiki_users WHERE id=$1', [id])
    .then(r => r.rows[0] || null);
}

// Sprache live aus der DB lesen statt aus dem Login-Token (JWT) - sonst wirkt eine
// Sprachänderung durch den Admin erst nach dem nächsten Login des Nutzers, analog zu
// findLiveAreasById() für use_areas.
function findLiveLanguageById(id) {
  return pool.query('SELECT language FROM freiki_users WHERE id=$1', [id])
    .then(r => r.rows[0]?.language || 'de');
}

async function listAll() {
  const { rows } = await pool.query(
    `SELECT id, username, role, first_name, last_name, funktion, telefon, email, language,
            use_areas, manage_areas, suspended, use_paperless, use_metacom, dienststelle FROM freiki_users
     WHERE pending_approval=false ORDER BY username`);
  return rows.map(u => ({
    id: u.id, username: u.username, role: u.role, suspended: !!u.suspended,
    first_name: u.first_name || '', last_name: u.last_name || '', funktion: u.funktion || '', telefon: u.telefon || '', email: u.email || '',
    language: u.language || 'de', dienststelle: u.dienststelle || '',
    use: u.use_areas || [], manage: u.manage_areas || [], use_paperless: !!u.use_paperless, use_metacom: !!u.use_metacom,
  }));
}

// Selbstregistrierungen, die noch auf Admin-Freischaltung warten (siehe registerInterest()
// in AuthService.js) - bewusst getrennt von listAll(), damit sie nicht zwischen den regulär
// gesperrten Bestandsnutzern untergehen.
async function listPending() {
  const { rows } = await pool.query(
    `SELECT id, username, first_name, last_name, funktion, telefon, email, language, dienststelle, created_at
     FROM freiki_users WHERE pending_approval=true ORDER BY created_at`);
  return rows.map(u => ({
    id: u.id, username: u.username,
    first_name: u.first_name || '', last_name: u.last_name || '', funktion: u.funktion || '', telefon: u.telefon || '', email: u.email || '',
    language: u.language || 'de', dienststelle: u.dienststelle || '', created_at: u.created_at,
  }));
}

async function create({ username, passwordHash, role, first_name, last_name, funktion, telefon, email, language, dienststelle, use, manage, use_paperless, use_metacom, suspended, pending_approval }) {
  const r = VALID_ROLES.includes(role) ? role : 'default';
  const { rows } = await pool.query(
    `INSERT INTO freiki_users (username,password_hash,role,first_name,last_name,funktion,telefon,email,language,dienststelle,use_areas,manage_areas,use_paperless,use_metacom,suspended,pending_approval)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [username.trim(), passwordHash, r, first_name||'', last_name||'', funktion||'', telefon||'', email||'', (language||'').trim() || 'de', dienststelle||'', cleanAreas(use), cleanAreas(manage), !!use_paperless, !!use_metacom, !!suspended, !!pending_approval]);
  return rows[0].id;
}

async function update(id, { role, use, manage, suspended, first_name, last_name, funktion, telefon, email, language, dienststelle, use_paperless, use_metacom, pending_approval }) {
  const r = VALID_ROLES.includes(role) ? role : 'default';
  const fields = ['role=$2','use_areas=$3','manage_areas=$4','first_name=$5','last_name=$6','funktion=$7','telefon=$8','email=$9','language=$10','updated_at=now()'];
  const vals = [id, r, cleanAreas(use), cleanAreas(manage), first_name||'', last_name||'', funktion||'', telefon||'', email||'', (language||'').trim() || 'de'];
  if (suspended !== undefined) { fields.push(`suspended=$${vals.length+1}`); vals.push(!!suspended); }
  if (use_paperless !== undefined) { fields.push(`use_paperless=$${vals.length+1}`); vals.push(!!use_paperless); }
  if (use_metacom !== undefined) { fields.push(`use_metacom=$${vals.length+1}`); vals.push(!!use_metacom); }
  if (pending_approval !== undefined) { fields.push(`pending_approval=$${vals.length+1}`); vals.push(!!pending_approval); }
  if (dienststelle !== undefined) { fields.push(`dienststelle=$${vals.length+1}`); vals.push(dienststelle||''); }
  const { rowCount } = await pool.query(`UPDATE freiki_users SET ${fields.join(',')} WHERE id=$1`, vals);
  return rowCount > 0;
}

// ── Selbstregistrierung: Benutzername = 1. Buchstabe Vorname + Nachname (bei Doppelnamen
// nur der erste Teil), klein geschrieben. Bei Kollision laufende Nummer anhängen.
function baseUsernameFrom(firstName, lastName) {
  const firstInitial = (firstName || '').trim().toLowerCase().replace(/[^a-zäöüß]/g, '').charAt(0);
  const lastFirstPart = (lastName || '').trim().split(/[\s-]+/)[0] || '';
  const lastClean = lastFirstPart.toLowerCase().replace(/[^a-zäöüß]/g, '');
  return (firstInitial + lastClean) || 'user';
}

async function generateUniqueUsername(firstName, lastName) {
  const base = baseUsernameFrom(firstName, lastName);
  let candidate = base;
  let n = 2;
  while (await findByUsername(candidate)) {
    candidate = base + n;
    n++;
  }
  return candidate;
}

async function updatePasswordHash(id, hash) {
  const { rowCount } = await pool.query('UPDATE freiki_users SET password_hash=$1, updated_at=now() WHERE id=$2', [hash, id]);
  return rowCount > 0;
}

// Gezielte Selbst-Service-Änderung nur der Sprache (im Unterschied zu update(), das ein
// komplettes Admin-Formular erwartet und sonst first_name/last_name/etc. mit '' überschreiben würde).
async function updateLanguage(id, language) {
  const { rowCount } = await pool.query('UPDATE freiki_users SET language=$1, updated_at=now() WHERE id=$2', [language, id]);
  return rowCount > 0;
}

// Gezielte Selbst-Service-Änderung nur des Enter-Verhaltens, analog zu updateLanguage().
async function updateEnterToSend(id, enterToSend) {
  const { rowCount } = await pool.query('UPDATE freiki_users SET enter_to_send=$1, updated_at=now() WHERE id=$2', [!!enterToSend, id]);
  return rowCount > 0;
}

async function remove(id) {
  const { rowCount } = await pool.query('DELETE FROM freiki_users WHERE id=$1', [id]);
  return rowCount > 0;
}

async function listAdminEmails() {
  const { rows } = await pool.query(
    "SELECT email FROM freiki_users WHERE role='admin' AND suspended=false AND email IS NOT NULL AND email <> ''"
  );
  return rows.map((r) => r.email);
}

// ── 2FA (TOTP) ────────────────────────────────────────────────
// Secret wird bereits beim Setup-Start geschrieben (aber totp_enabled bleibt false),
// damit /api/2fa/confirm nur noch den Code prüfen muss statt den Secret erneut zu übergeben.
async function setPendingTotpSecret(id, secret) {
  await pool.query('UPDATE freiki_users SET totp_secret=$1 WHERE id=$2', [secret, id]);
}

async function enableTotp(id, hashedBackupCodes) {
  await pool.query(
    'UPDATE freiki_users SET totp_enabled=true, totp_backup_codes=$1::jsonb WHERE id=$2',
    [JSON.stringify(hashedBackupCodes), id]
  );
}

async function disableTotp(id) {
  await pool.query(
    "UPDATE freiki_users SET totp_enabled=false, totp_secret=NULL, totp_backup_codes='[]' WHERE id=$1",
    [id]
  );
}

async function updateBackupCodes(id, hashedBackupCodes) {
  await pool.query('UPDATE freiki_users SET totp_backup_codes=$1::jsonb WHERE id=$2', [JSON.stringify(hashedBackupCodes), id]);
}

// ── Pflichtschulung (nur wo APP_MANDATORY_TRAINING=true, siehe BrandConfig) ──
async function completeTraining(id) {
  await pool.query('UPDATE freiki_users SET training_completed=true, training_completed_at=now() WHERE id=$1', [id]);
}

// Nutzer lehnt die Kenntnisnahme am Ende der Pflichtschulung ab -> Konto wird gesperrt
// (training_completed bleibt bewusst false, damit ihm nach einer Admin-Entsperrung die
// Schulung beim naechsten Login erneut angezeigt wird).
async function declineTraining(id) {
  await pool.query('UPDATE freiki_users SET suspended=true WHERE id=$1', [id]);
}

// ── Breaking News (Login-Hinweis, siehe BrandConfig.breakingNewsVersion) ──
// Speichert die zuletzt quittierte Version statt eines reinen Booleans: eine neue
// Nachricht erhöht global breakingNewsVersion, wodurch das Modal automatisch wieder für
// alle User erscheint (news_ack_version < breakingNewsVersion), ohne dass diese Tabelle
// dafür angefasst werden muss.
async function ackBreakingNews(id, version) {
  await pool.query('UPDATE freiki_users SET news_ack_version=$1 WHERE id=$2', [version, id]);
}

const isValidUsername = (s) => typeof s === 'string' && s.trim().length >= 3 && s.trim().length <= 64 && /^[a-zA-Z0-9._\-äöüÄÖÜß]+$/.test(s.trim());
const isValidEmail    = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

module.exports = {
  VALID_ROLES, ensureSchema, findByUsername, findById, findProfileById, findLiveAreasById, findLiveLanguageById,
  listAll, listPending, create, update, updatePasswordHash, updateLanguage, updateEnterToSend, remove, listAdminEmails,
  generateUniqueUsername,
  setPendingTotpSecret, enableTotp, disableTotp, updateBackupCodes, completeTraining, declineTraining, ackBreakingNews,
  isValidUsername, isValidEmail, cleanAreas,
};
