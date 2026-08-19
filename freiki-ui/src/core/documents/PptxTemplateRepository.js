const pool = require('../../infrastructure/database/postgres/pool');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pptx_templates (
      id           SERIAL PRIMARY KEY,
      key          TEXT UNIQUE NOT NULL,
      label        TEXT NOT NULL,
      filename     TEXT NOT NULL,
      created_by   INT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function listTemplates() {
  const { rows } = await pool.query(
    `SELECT id, key, label, filename, created_at FROM pptx_templates ORDER BY created_at DESC`
  );
  return rows;
}

async function getTemplateByKey(key) {
  const { rows } = await pool.query(
    `SELECT id, key, label, filename FROM pptx_templates WHERE key=$1`, [key]
  );
  return rows[0] || null;
}

async function createTemplate({ key, label, filename, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO pptx_templates (key, label, filename, created_by)
     VALUES ($1,$2,$3,$4) RETURNING id, key, label, filename, created_at`,
    [key, label, filename, createdBy || null]
  );
  return rows[0];
}

async function deleteTemplate(id) {
  const { rows } = await pool.query(
    `DELETE FROM pptx_templates WHERE id=$1 RETURNING id, filename`, [id]
  );
  return rows[0] || null;
}

module.exports = { ensureSchema, listTemplates, getTemplateByKey, createTemplate, deleteTemplate };
