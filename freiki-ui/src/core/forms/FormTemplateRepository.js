const pool = require('../../infrastructure/database/postgres/pool');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_templates (
      id           SERIAL PRIMARY KEY,
      slug         TEXT UNIQUE NOT NULL,
      title        TEXT NOT NULL,
      description  TEXT,
      active       BOOLEAN NOT NULL DEFAULT false,
      created_by   INT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_template_pages (
      id            SERIAL PRIMARY KEY,
      template_id   INT NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
      page_number   INT NOT NULL,
      image_path    TEXT NOT NULL,
      UNIQUE (template_id, page_number)
    )
  `);
  // x/y/width/height sind Anteile (0..1) der jeweiligen Seite - auflösungsunabhängig,
  // da Admin-Overlay und PDF-Fülllogik dieselben Seitenbilder unterschiedlich groß anzeigen können.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS form_template_fields (
      id             SERIAL PRIMARY KEY,
      template_id    INT NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
      field_key      TEXT NOT NULL,
      page_number    INT NOT NULL,
      x              NUMERIC NOT NULL,
      y              NUMERIC NOT NULL,
      width          NUMERIC NOT NULL,
      height         NUMERIC NOT NULL,
      field_type     TEXT NOT NULL DEFAULT 'text',
      question_text  TEXT NOT NULL,
      required       BOOLEAN NOT NULL DEFAULT true,
      order_index    INT NOT NULL DEFAULT 0,
      UNIQUE (template_id, field_key)
    )
  `);
}

async function createTemplate({ slug, title, description, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO form_templates (slug, title, description, created_by)
     VALUES ($1,$2,$3,$4) RETURNING id, slug, title, description, active, created_at`,
    [slug, title, description || null, createdBy || null]
  );
  return rows[0];
}

async function addPage(templateId, pageNumber, imagePath) {
  await pool.query(
    `INSERT INTO form_template_pages (template_id, page_number, image_path) VALUES ($1,$2,$3)`,
    [templateId, pageNumber, imagePath]
  );
}

async function listPages(templateId) {
  const { rows } = await pool.query(
    `SELECT id, page_number, image_path FROM form_template_pages WHERE template_id=$1 ORDER BY page_number`,
    [templateId]
  );
  return rows;
}

async function listTemplates({ activeOnly = false } = {}) {
  const { rows } = await pool.query(
    `SELECT t.id, t.slug, t.title, t.description, t.active, t.created_at,
            (SELECT COUNT(*) FROM form_template_pages p WHERE p.template_id = t.id)::int AS page_count,
            (SELECT COUNT(*) FROM form_template_fields f WHERE f.template_id = t.id)::int AS field_count
     FROM form_templates t
     ${activeOnly ? 'WHERE t.active = true' : ''}
     ORDER BY t.created_at DESC`
  );
  return rows;
}

async function getTemplateBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT id, slug, title, description, active FROM form_templates WHERE slug=$1`, [slug]
  );
  return rows[0] || null;
}

async function getTemplateById(id) {
  const { rows } = await pool.query(
    `SELECT id, slug, title, description, active FROM form_templates WHERE id=$1`, [id]
  );
  return rows[0] || null;
}

async function updateTemplate(id, { title, description, active }) {
  const { rows } = await pool.query(
    `UPDATE form_templates SET
       title = COALESCE($2, title),
       description = COALESCE($3, description),
       active = COALESCE($4, active)
     WHERE id=$1 RETURNING id, slug, title, description, active`,
    [id, title ?? null, description ?? null, typeof active === 'boolean' ? active : null]
  );
  return rows[0] || null;
}

async function deleteTemplate(id) {
  const { rows } = await pool.query(
    `DELETE FROM form_templates WHERE id=$1 RETURNING id`, [id]
  );
  return rows.length > 0;
}

// Felder werden immer komplett ersetzt (einfacher als granulares Diffing) - das Admin-Tool
// schickt beim Speichern stets den vollständigen aktuellen Feldsatz einer Vorlage.
async function setFields(templateId, fields) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM form_template_fields WHERE template_id=$1`, [templateId]);
    for (const f of fields) {
      await client.query(
        `INSERT INTO form_template_fields
           (template_id, field_key, page_number, x, y, width, height, field_type, question_text, required, order_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [templateId, f.field_key, f.page_number, f.x, f.y, f.width, f.height,
         f.field_type, f.question_text, f.required !== false, f.order_index ?? 0]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listFields(templateId) {
  const { rows } = await pool.query(
    `SELECT id, field_key, page_number, x, y, width, height, field_type, question_text, required, order_index
     FROM form_template_fields WHERE template_id=$1 ORDER BY order_index, id`,
    [templateId]
  );
  return rows;
}

module.exports = {
  ensureSchema, createTemplate, addPage, listPages, listTemplates,
  getTemplateBySlug, getTemplateById, updateTemplate, deleteTemplate,
  setFields, listFields,
};
