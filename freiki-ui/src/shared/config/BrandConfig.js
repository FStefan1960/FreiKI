const pool = require('../../infrastructure/database/postgres/pool');

const BRAND_DEFAULTS = {
  name:          process.env.APP_NAME          || 'FreiKI',
  color:         process.env.APP_COLOR         || '#1F54C0',
  colorHover:    process.env.APP_COLOR_HOVER   || '#1A4AAD',
  colorActive:   process.env.APP_COLOR_ACTIVE  || '#173F95',
  navy:          process.env.APP_NAVY          || '#14306B',
  logo:          process.env.APP_LOGO          || '/header.png',
  logoSidebar:   process.env.APP_LOGO_SIDEBAR  || process.env.APP_LOGO || '/header.png',
  tagline:       process.env.APP_TAGLINE       || 'Ihr souveräner KI-Assistent',
  supportEmail:  process.env.APP_SUPPORT_EMAIL || '',
  mattermostUrl: process.env.MATTERMOST_URL    || '',
  paperlessUrl:  process.env.PAPERLESS_URL     || '',
  swVersion:     process.env.APP_SW_VERSION    || '1',
  demoMode:      process.env.APP_DEMO_MODE === 'true',
  footerNote:    process.env.APP_FOOTER_NOTE   || '',
};

// Laufzeit-Zustand + Setter statt Export des rohen Objekts: Module, die getBrandConfig()
// aufrufen, sehen so nach jedem loadBrandConfig()/updateBrandConfig() den aktuellen Stand,
// statt eine veraltete Objekt-Referenz von vor dem Reload zu behalten.
let brandConfig = { ...BRAND_DEFAULTS };

function getBrandConfig() {
  return brandConfig;
}

const ALLOWED_FIELDS = ['name','color','colorHover','colorActive','navy','logo','tagline','supportEmail','mattermostUrl','paperlessUrl','swVersion'];

async function loadBrandConfig() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    const { rows } = await pool.query('SELECT key, value FROM app_config');
    const db = Object.fromEntries(rows.map(r => [r.key, r.value]));
    brandConfig = {
      name:          db.name          ?? BRAND_DEFAULTS.name,
      color:         db.color         ?? BRAND_DEFAULTS.color,
      colorHover:    db.colorHover    ?? BRAND_DEFAULTS.colorHover,
      colorActive:   db.colorActive   ?? BRAND_DEFAULTS.colorActive,
      navy:          db.navy          ?? BRAND_DEFAULTS.navy,
      logo:          db.logo          ?? BRAND_DEFAULTS.logo,
      logoSidebar:   db.logoSidebar   ?? BRAND_DEFAULTS.logoSidebar,
      tagline:       db.tagline       ?? BRAND_DEFAULTS.tagline,
      supportEmail:  db.supportEmail  ?? BRAND_DEFAULTS.supportEmail,
      mattermostUrl: db.mattermostUrl ?? BRAND_DEFAULTS.mattermostUrl,
      paperlessUrl:  db.paperlessUrl  ?? BRAND_DEFAULTS.paperlessUrl,
      swVersion:     db.swVersion     ?? BRAND_DEFAULTS.swVersion,
      demoMode:      BRAND_DEFAULTS.demoMode,   // nur aus .env steuerbar
      footerNote:    db.footerNote    ?? BRAND_DEFAULTS.footerNote,
    };
  } catch (e) {
    console.error('loadBrandConfig Fehler:', e.message);
  }
}

async function updateBrandConfig(fields) {
  for (const key of ALLOWED_FIELDS) {
    const val = (fields[key] || '').trim();
    await pool.query(
      'INSERT INTO app_config(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
      [key, val]
    );
  }
  await loadBrandConfig();
}

module.exports = { getBrandConfig, loadBrandConfig, updateBrandConfig, BRAND_DEFAULTS, ALLOWED_FIELDS };
