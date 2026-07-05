const pool = require('../../infrastructure/database/postgres/pool');

const VALID_ROLES = ['admin', 'manager', 'default'];
const cleanAreas = (a) => Array.isArray(a) ? a.map(x => String(x).trim()).filter(Boolean) : [];

function findByUsername(username) {
  return pool.query('SELECT * FROM freiki_users WHERE lower(username)=lower($1)', [username])
    .then(r => r.rows[0] || null);
}

function findById(id) {
  return pool.query('SELECT * FROM freiki_users WHERE id=$1', [id]).then(r => r.rows[0] || null);
}

function findProfileById(id) {
  return pool.query('SELECT username, email, role, first_name, last_name FROM freiki_users WHERE id=$1', [id])
    .then(r => r.rows[0] || null);
}

function findLiveAreasById(id) {
  return pool.query('SELECT use_areas, use_paperless FROM freiki_users WHERE id=$1', [id])
    .then(r => r.rows[0] || null);
}

async function listAll() {
  const { rows } = await pool.query(
    `SELECT id, username, role, first_name, last_name, funktion, email,
            use_areas, manage_areas, suspended, use_paperless FROM freiki_users ORDER BY username`);
  return rows.map(u => ({
    id: u.id, username: u.username, role: u.role, suspended: !!u.suspended,
    first_name: u.first_name || '', last_name: u.last_name || '', funktion: u.funktion || '', email: u.email || '',
    use: u.use_areas || [], manage: u.manage_areas || [], use_paperless: !!u.use_paperless,
  }));
}

async function create({ username, passwordHash, role, first_name, last_name, funktion, email, use, manage, use_paperless }) {
  const r = VALID_ROLES.includes(role) ? role : 'default';
  const { rows } = await pool.query(
    `INSERT INTO freiki_users (username,password_hash,role,first_name,last_name,funktion,email,use_areas,manage_areas,use_paperless)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [username.trim(), passwordHash, r, first_name||'', last_name||'', funktion||'', email||'', cleanAreas(use), cleanAreas(manage), !!use_paperless]);
  return rows[0].id;
}

async function update(id, { role, use, manage, suspended, first_name, last_name, funktion, email, use_paperless }) {
  const r = VALID_ROLES.includes(role) ? role : 'default';
  const fields = ['role=$2','use_areas=$3','manage_areas=$4','first_name=$5','last_name=$6','funktion=$7','email=$8','updated_at=now()'];
  const vals = [id, r, cleanAreas(use), cleanAreas(manage), first_name||'', last_name||'', funktion||'', email||''];
  if (suspended !== undefined) { fields.push(`suspended=$${vals.length+1}`); vals.push(!!suspended); }
  if (use_paperless !== undefined) { fields.push(`use_paperless=$${vals.length+1}`); vals.push(!!use_paperless); }
  const { rowCount } = await pool.query(`UPDATE freiki_users SET ${fields.join(',')} WHERE id=$1`, vals);
  return rowCount > 0;
}

async function updatePasswordHash(id, hash) {
  const { rowCount } = await pool.query('UPDATE freiki_users SET password_hash=$1, updated_at=now() WHERE id=$2', [hash, id]);
  return rowCount > 0;
}

async function remove(id) {
  const { rowCount } = await pool.query('DELETE FROM freiki_users WHERE id=$1', [id]);
  return rowCount > 0;
}

const isValidUsername = (s) => typeof s === 'string' && s.trim().length >= 3 && s.trim().length <= 64 && /^[a-zA-Z0-9._\-äöüÄÖÜß]+$/.test(s.trim());
const isValidEmail    = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

module.exports = {
  VALID_ROLES, findByUsername, findById, findProfileById, findLiveAreasById,
  listAll, create, update, updatePasswordHash, remove,
  isValidUsername, isValidEmail, cleanAreas,
};
