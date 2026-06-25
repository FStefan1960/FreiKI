const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const tesseract = require('node-tesseract-ocr');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // hinter Caddy
const upload = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','text/plain','text/markdown','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg','image/png','image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: PDF, TXT, MD, DOC/DOCX, JPG, PNG, WEBP'), false);
  }
});
const uploadAudio = multer({
  dest: '/tmp/uploads/',
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/mpeg','audio/wav','audio/ogg','audio/webm','audio/mp4'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp für Audio. Erlaubt: MP3, WAV, OGG, WEBM'), false);
  }
});

// ── Rate Limiting ─────────────────────────────────────────────
const apiLimiter   = rateLimit({ windowMs: 15*60*1000, max: 100, message: { error: 'Zu viele Anfragen' } });
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 5,   message: { error: 'Zu viele Login-Versuche' } });
app.use('/api/', apiLimiter);

// ── Upload-Cleanup (Temp-Dateien älter als 24h löschen) ───────
const cleanupUploads = () => {
  ['/tmp/uploads/', '/tmp/kb_uploads/'].forEach(dir => {
    try {
      fs.readdirSync(dir).forEach(file => {
        const fp = path.join(dir, file);
        if (Date.now() - fs.statSync(fp).mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(fp);
      });
    } catch (_) {}
  });
};
cleanupUploads();
setInterval(cleanupUploads, 24 * 60 * 60 * 1000);

// ── Brand-Konfiguration (White-Label) ────────────────────────
// Defaults aus .env; DB-Einträge überschreiben diese zur Laufzeit
const BRAND_DEFAULTS = {
  name:          process.env.APP_NAME          || 'FreiKI',
  color:         process.env.APP_COLOR         || '#1F54C0',
  colorHover:    process.env.APP_COLOR_HOVER   || '#1A4AAD',
  colorActive:   process.env.APP_COLOR_ACTIVE  || '#173F95',
  navy:          process.env.APP_NAVY          || '#14306B',
  logo:          process.env.APP_LOGO          || '/freiki-header.png',
  logoSidebar:   process.env.APP_LOGO_SIDEBAR  || process.env.APP_LOGO || '/freiki-header.png',
  tagline:       process.env.APP_TAGLINE       || 'Ihr souveräner KI-Assistent',
  supportEmail:  process.env.APP_SUPPORT_EMAIL || '',
  mattermostUrl: process.env.MATTERMOST_URL    || '',
  paperlessUrl:  process.env.PAPERLESS_URL     || '',
  swVersion:     process.env.APP_SW_VERSION    || '1',
  demoMode:      process.env.APP_DEMO_MODE === 'true',
  footerNote:    process.env.APP_FOOTER_NOTE   || '',
};
let brandConfig = { ...BRAND_DEFAULTS };

const VLLM_URL = process.env.VLLM_URL || 'http://vllm:8000';
const VLLM_API_KEY = process.env.VLLM_API_KEY || '';
const VLLM_MODEL = process.env.VLLM_MODEL || 'Qwen/Qwen3-32B';
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://searxng:8080';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const WHISPER_URL = process.env.WHISPER_URL || 'http://whisper:9000';
const PIPER_URL = process.env.PIPER_URL || 'http://piper:8000';
const TTS_VOICE = process.env.TTS_VOICE || 'thorsten';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const PAPERLESS_INTERNAL_URL = process.env.PAPERLESS_INTERNAL_URL || 'http://paperless:8000';
const PAPERLESS_TOKEN = process.env.PAPERLESS_TOKEN || '';
const MAX_CONTEXT_CHARS       = parseInt(process.env.MAX_CONTEXT_CHARS       || '40000');
const MAX_VLLM_CHARS          = parseInt(process.env.MAX_VLLM_CHARS          || '20000');
const MAX_CONTEXT_CHARS_MULTI = parseInt(process.env.MAX_CONTEXT_CHARS_MULTI || '90000');
const MAX_VLLM_CHARS_MULTI    = parseInt(process.env.MAX_VLLM_CHARS_MULTI    || '80000');
const SEARXNG_RESULTS = 5;

// ── Auth: eigene Benutzer-DB (PostgreSQL) + JWT ──────────────
const JWT_SECRET = process.env.KORKI_JWT_SECRET || '';
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FEHLER: KORKI_JWT_SECRET muss gesetzt sein und mindestens 32 Zeichen lang!');
  process.exit(1);
}
const pgPool = new Pool({
  host: process.env.PG_HOST || 'PostgreSQL',
  database: process.env.PG_DB || 'flowise',
  user: process.env.PG_USER_KB || 'n8n_user',
  password: process.env.PG_PASS_KB || '',
  port: 5432,
});
function fetchWithTimeout(url, options, ms = 120_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) });
}

async function withRetry(fn, retries = 2, delayMs = 1000) {
  try { return await fn(); }
  catch (e) {
    if (retries <= 0) throw e;
    await new Promise(r => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}

async function loadBrandConfig() {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    const { rows } = await pgPool.query('SELECT key, value FROM app_config');
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
    _indexHtml = null; // Cache leeren
  } catch (e) {
    console.error('loadBrandConfig Fehler:', e.message);
  }
}

function signToken(u) {
  return jwt.sign(
    { uid: u.id, username: u.username, role: u.role, use: u.use_areas || [], manage: u.manage_areas || [], usePaperless: !!u.use_paperless },
    JWT_SECRET, { expiresIn: '12h' }
  );
}
function getSession(req) {
  const t = ((req.headers['authorization'] || '').replace('Bearer ', '') || req.query._t || '').trim();
  if (!t || !JWT_SECRET) return null;
  try { return jwt.verify(t, JWT_SECRET); } catch { return null; }
}

// Zufallspasswort ohne verwechselbare Zeichen (0/O, 1/l/I)
function generatePassword(length = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < length; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

function renderWelcomeText(username, password) {
  const template = fs.readFileSync(path.join(__dirname, 'welcome.md'), 'utf8');
  return template
    .replace(/\{\{APP_NAME\}\}/g, brandConfig.name)
    .replace(/\{\{APP_URL\}\}/g, APP_URL)
    .replace(/\{\{USERNAME\}\}/g, username)
    .replace(/\{\{PASSWORD\}\}/g, password);
}

async function sendWelcomeMail(to, username, password) {
  if (!to || !SMTP_HOST) return;
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await transporter.sendMail({
    from: `${brandConfig.name} <${SMTP_FROM}>`,
    to,
    subject: `Ihr ${brandConfig.name}-Zugang`,
    text: renderWelcomeText(username, password)
  });
}

function sendToN8n(payload) {
  if (!N8N_WEBHOOK_URL) return;
  fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(e => console.error('n8n Webhook Fehler:', e.message));
}

async function webSearch(query) {
  try {
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&language=de`;
    const res = await fetch(url);
    const data = await res.json();
    const results = (data.results || []).slice(0, SEARXNG_RESULTS);
    if (!results.length) return '';
    return results.map((r, i) =>
      `[${i + 1}] ${r.title}\n${r.url}\n${r.content || ''}`
    ).join('\n\n');
  } catch (e) {
    console.error('SearXNG Fehler:', e.message);
    return '';
  }
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { meta: {}, body: content };
  const end = content.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: content };
  const yamlStr = content.slice(4, end);
  const body = content.slice(end + 4).trim();
  const meta = {};
  yamlStr.split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (key) meta[key] = val;
  });
  return { meta, body };
}

function toTitle(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const promptDir = path.join(__dirname, 'prompts');
const systemPrompts = {};
const modesConfig = [];

const basePromptFile = path.join(promptDir, '_base.md');
const basePromptText = fs.existsSync(basePromptFile)
  ? fs.readFileSync(basePromptFile, 'utf-8').trim() + '\n\n'
  : '';

fs.readdirSync(promptDir)
  .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  .sort()
  .forEach(file => {
    const key = path.basename(file, '.md');
    const raw = fs.readFileSync(path.join(promptDir, file), 'utf-8');
    const { meta, body } = parseFrontmatter(raw);

    systemPrompts[key] = body;

    modesConfig.push({
      key,
      icon:       meta.icon       || '💬',
      title:      meta.title      || toTitle(key),
      desc:       meta.desc       || '',
      welcome:    meta.welcome    || 'Text eingeben oder Datei hochladen.',
      hint:       meta.hint       || '💡 Datei hochladen mit 📎, dann senden.',
      workspace:  meta.workspace  || null,
      websearch:  meta.websearch === 'true',
      multifile:  meta.multifile  === 'true',
      hidden:     meta.hidden     === 'true',
      paperless:  meta.paperless  === 'true',
    });

    console.log(`Prompt geladen: ${key} – ${meta.title || key}`);
  });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── Brand-Injection: index.html als Template rendern ─────────
const PUBLIC_DIR = path.join(__dirname, 'public');
let _indexHtml = null;
function getIndexHtml() {
  if (!_indexHtml) {
    _indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
      .replace(/\{\{APP_NAME\}\}/g,          brandConfig.name)
      .replace(/\{\{APP_LOGO\}\}/g,          brandConfig.logo)
      .replace(/\{\{APP_LOGO_SIDEBAR\}\}/g,  brandConfig.logoSidebar)
      .replace(/\{\{APP_TAGLINE\}\}/g,       brandConfig.tagline)
      .replace(/\{\{APP_COLOR\}\}/g,         brandConfig.color)
      .replace(/\{\{PAPERLESS_URL\}\}/g,     brandConfig.paperlessUrl)
      .replace(/\{\{MATTERMOST_URL\}\}/g,    brandConfig.mattermostUrl)
      .replace(/\{\{DEMO_MODE\}\}/g,         brandConfig.demoMode ? '' : 'display:none')
      .replace(/\{\{FOOTER_NOTE\}\}/g,       brandConfig.footerNote || brandConfig.name);
  }
  return _indexHtml;
}
app.get('/', (_req, res) => res.type('html').send(getIndexHtml()));

// ── Dynamische Brand-Assets ───────────────────────────────────
// /brand.css: Farb-Override für CSS-Variablen
app.get('/brand.css', (_req, res) => {
  res.type('text/css').send(`
:root {
  --fk-primary:        ${brandConfig.color};
  --fk-primary-hover:  ${brandConfig.colorHover};
  --fk-primary-active: ${brandConfig.colorActive};
  --fk-navy:           ${brandConfig.navy};
}
`);
});

// /manifest.json: dynamisch mit APP_NAME + APP_COLOR
app.get('/manifest.json', (_req, res) => {
  res.json({
    name: `${brandConfig.name} – ${brandConfig.tagline}`,
    short_name: brandConfig.name,
    description: 'DSGVO-konformer, quelloffener KI-Assistent',
    start_url: '/',
    display: 'standalone',
    background_color: '#f0f4f8',
    theme_color: brandConfig.color,
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ]
  });
});

// /sw.js: dynamisch mit korrektem Cache-Name + Logo-Pfad
app.get('/sw.js', (_req, res) => {
  const cacheName = `${brandConfig.name.toLowerCase().replace(/\s+/g, '-')}-v${brandConfig.swVersion}`;
  const logoPath  = brandConfig.logo.split('?')[0];
  res.type('application/javascript').send(`
const CACHE_NAME = '${cacheName}';
const STATIC_ASSETS = [
  '/style.css',
  '/brand.css',
  '${logoPath}',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/apple-touch-icon.png',
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && STATIC_ASSETS.includes(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`);
});

// /api/brand: JSON für Client-seitige Nutzung
app.get('/api/brand', (_req, res) => {
  res.json({
    name:          brandConfig.name,
    logo:          brandConfig.logo,
    tagline:       brandConfig.tagline,
    color:         brandConfig.color,
    mattermost:    brandConfig.mattermostUrl,
    paperless:     brandConfig.paperlessUrl,
    supportEmail:  brandConfig.supportEmail,
  });
});

// ── Admin: editierbare Konfigurations-Seite ──────────────────
function adminConfigPage(saved) {
  const b = brandConfig;
  const field = (key, label, val, type = 'text') => {
    const isColor = type === 'color';
    return `
    <div class="field">
      <label for="${key}">${label}</label>
      <div class="input-row">
        ${isColor ? `<input type="color" id="${key}_picker" value="${val}"
          oninput="document.getElementById('${key}').value=this.value;preview()">` : ''}
        <input type="text" id="${key}" name="${key}" value="${val.replace(/"/g, '&quot;')}"
          ${isColor ? `oninput="document.getElementById('${key}_picker').value=this.value;preview()"` : ''}>
      </div>
    </div>`;
  };
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${b.name} – Konfiguration</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;margin:0;background:#f4f6fa;color:#15294a}
.wrap{max-width:960px;margin:0 auto;padding:32px 24px;display:grid;grid-template-columns:1fr 340px;gap:32px;align-items:start}
@media(max-width:700px){.wrap{grid-template-columns:1fr}}
h1{font-size:22px;font-weight:800;margin:0 0 4px}
.sub{color:#5a6b82;font-size:13px;margin:0 0 24px}
.card{background:#fff;border-radius:14px;box-shadow:0 1px 6px rgba(0,0,0,.07);padding:24px}
.card h2{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#5a6b82;margin:0 0 18px}
.field{margin-bottom:16px}
.field label{display:block;font-size:12px;font-weight:600;color:#5a6b82;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
.input-row{display:flex;gap:8px;align-items:center}
input[type=text]{width:100%;padding:9px 12px;border:1px solid #d8e0ec;border-radius:8px;font-size:14px;color:#15294a;background:#fff;outline:none}
input[type=text]:focus{border-color:#1f54c0;box-shadow:0 0 0 3px rgba(31,84,192,.12)}
input[type=color]{width:40px;height:38px;padding:2px;border:1px solid #d8e0ec;border-radius:8px;cursor:pointer;flex-shrink:0}
.btn-save{width:100%;padding:12px;background:var(--pk,#1f54c0);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer;margin-top:8px;transition:background .15s}
.btn-save:hover{filter:brightness(.9)}
.toast{display:none;background:#22a05a;color:#fff;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:14px;font-weight:600}
.toast.show{display:block}
/* Vorschau */
.preview-box{position:sticky;top:24px}
.preview-header{background:var(--pv-navy,#14306b);border-radius:12px 12px 0 0;padding:14px 18px;display:flex;align-items:center;gap:12px}
.preview-header img{height:32px;object-fit:contain;max-width:160px}
.preview-body{background:#f4f6fa;border-radius:0 0 12px 12px;padding:18px}
.preview-btn{display:inline-block;padding:9px 18px;border-radius:8px;background:var(--pv-primary,#1f54c0);color:#fff;font-weight:700;font-size:13px;border:none;cursor:default}
.preview-tagline{font-size:12px;color:#5a6b82;margin-top:10px}
.preview-card{background:#fff;border-radius:10px;padding:14px;margin-top:12px;font-size:13px;border:1px solid #e3e8f0}
.preview-card strong{color:var(--pv-primary,#1f54c0)}
code{background:#eaf0fe;color:#1f54c0;padding:1px 6px;border-radius:4px;font-size:12px}
a.back{font-size:13px;color:#5a6b82;text-decoration:none;display:inline-block;margin-bottom:20px}
a.back:hover{color:#1f54c0}
</style></head><body>
<div style="max-width:960px;margin:24px auto;padding:0 24px">
  <a href="/" class="back">← Zurück zur App</a>
  <h1 id="pv-name">${b.name}</h1>
  <p class="sub">Instanz-Konfiguration · Änderungen werden sofort aktiv, kein Neustart erforderlich</p>
  ${saved ? '<div class="toast show">Konfiguration gespeichert.</div>' : ''}
</div>
<div class="wrap">
  <form method="POST" action="/admin/config" onsubmit="return true">
    <div class="card" style="margin-bottom:20px">
      <h2>Identität</h2>
      ${field('name',    'App-Name (z. B. FreiKI, EvaKI, KorKI)', b.name)}
      ${field('tagline', 'Untertitel',                              b.tagline)}
      ${field('logo',    'Logo-Pfad oder URL',                     b.logo)}
      ${field('supportEmail', 'Support-E-Mail (optional)',         b.supportEmail)}
    </div>
    <div class="card" style="margin-bottom:20px">
      <h2>Farben</h2>
      ${field('color',       'Primärfarbe',          b.color,       'color')}
      ${field('colorHover',  'Hover-Farbe',          b.colorHover,  'color')}
      ${field('colorActive', 'Aktiv-Farbe',          b.colorActive, 'color')}
      ${field('navy',        'Header-/Footer-Farbe', b.navy,        'color')}
    </div>
    <div class="card" style="margin-bottom:20px">
      <h2>Verknüpfte Dienste</h2>
      ${field('mattermostUrl', 'Mattermost-URL', b.mattermostUrl)}
      ${field('paperlessUrl',  'Paperless-URL',  b.paperlessUrl)}
    </div>
    <div class="card">
      <h2>Service Worker</h2>
      ${field('swVersion', 'Cache-Version (bei Farbwechsel +1)', b.swVersion)}
      <p style="font-size:12px;color:#5a6b82;margin:4px 0 12px">Wenn Farben oder Logo geändert werden, diese Zahl um 1 erhöhen, damit der Browser-Cache geleert wird.</p>
      <button type="submit" class="btn-save" id="save-btn">Speichern</button>
    </div>
  </form>

  <div class="preview-box">
    <div class="card">
      <h2>Live-Vorschau</h2>
      <div class="preview-header" id="pv-header">
        <img id="pv-logo" src="${b.logo}" alt="${b.name}" onerror="this.style.display='none'">
      </div>
      <div class="preview-body">
        <div id="pv-tagline" class="preview-tagline">${b.tagline}</div>
        <div class="preview-card">
          Willkommen bei <strong id="pv-name2">${b.name}</strong>! Wie kann ich Ihnen helfen?
        </div>
        <div style="margin-top:14px">
          <button class="preview-btn" id="pv-btn">Senden</button>
        </div>
      </div>
    </div>
    <p style="font-size:11px;color:#93a1b5;margin-top:12px;text-align:center">
      Farben werden im Browser erst nach Seiten-Reload übernommen.
    </p>
  </div>
</div>

<script>
function preview() {
  const get = id => document.getElementById(id)?.value || '';
  const name     = get('name')    || '${b.name}';
  const tagline  = get('tagline') || '';
  const logo     = get('logo')    || '';
  const primary  = get('color')   || '#1f54c0';
  const navy     = get('navy')    || '#14306b';
  document.getElementById('pv-name').textContent  = name;
  document.getElementById('pv-name2').textContent = name;
  document.getElementById('pv-tagline').textContent = tagline;
  const logoEl = document.getElementById('pv-logo');
  logoEl.src = logo;
  logoEl.style.display = logo ? '' : 'none';
  document.getElementById('pv-header').style.background = navy;
  document.getElementById('pv-btn').style.background    = primary;
  document.getElementById('pv-name2').style.color       = primary;
  document.querySelector('.btn-save').style.background  = primary;
}
// Wire all text inputs
document.querySelectorAll('input[type=text]').forEach(el => el.addEventListener('input', preview));
preview();
</script>
</body></html>`;
}

app.get('/admin/config', (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.role !== 'admin') return res.status(403).send('Kein Zugriff');
  res.type('html').send(adminConfigPage(req.query.saved === '1'));
});

app.post('/admin/config', express.urlencoded({ extended: true }), async (req, res) => {
  const sess = getSession(req);
  if (!sess || sess.role !== 'admin') return res.status(403).send('Kein Zugriff');
  const allowed = ['name','color','colorHover','colorActive','navy','logo','tagline','supportEmail','mattermostUrl','paperlessUrl','swVersion'];
  try {
    for (const key of allowed) {
      const val = (req.body[key] || '').trim();
      await pgPool.query(
        'INSERT INTO app_config(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value',
        [key, val]
      );
    }
    await loadBrandConfig();
    res.redirect('/admin/config?saved=1');
  } catch (e) {
    console.error('Fehler beim Speichern der Konfiguration:', e.message);
    res.status(500).send('Fehler beim Speichern');
  }
});

// Alle anderen Routen: static files
app.use(express.static(PUBLIC_DIR));

// Bereichscode normalisieren (optionales w_-Präfix entfernen)
function normArea(a) { return String(a || '').toLowerCase().trim().replace(/^w_/, ''); }
function isWissenMode(m) { return !!m.workspace || m.key.startsWith('w_'); }

app.get('/api/tips', (req, res) => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'tips.md'), 'utf8')
      .replace(/\{\{APP_NAME\}\}/g, brandConfig.name)
      .replace(/\{\{MATTERMOST_URL\}\}/g, brandConfig.mattermostUrl || 'dem Team-Chat');
    const tips = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    res.json({ tips });
  } catch (e) { res.json({ tips: [] }); }
});

app.get('/api/modes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = getSession(req);
  const isAdmin = session?.role === 'admin';

  // use_areas live aus der DB lesen (JWT-Token kann veraltet sein)
  let liveUse = session?.use || [];
  if (session?.uid && !isAdmin) {
    try {
      const client = await pgPool.connect();
      const r = await client.query('SELECT use_areas FROM korki_users WHERE id=$1', [session.uid]);
      client.release();
      if (r.rows[0]) liveUse = r.rows[0].use_areas || [];
    } catch { /* Fallback auf Token */ }
  }

  const userAreas = liveUse.map(normArea);
  const hasPaperless = session.usePaperless === true || isAdmin;

  const visible = modesConfig
    .filter(m => !m.hidden)
    .filter(m => !m.paperless || hasPaperless);

  // Nur 'default'-Nutzer mit gesetzten use-Bereichen werden eingeschränkt.
  // Werkzeuge bleiben immer frei; leere use-Liste = alle Wissens-Bereiche.
  if (session && session.role === 'default' && liveUse.length) {
    const allowed = userAreas;
    return res.json(visible.filter(m => !isWissenMode(m) || allowed.includes(normArea(m.key))));
  }
  res.json(visible);
});


app.post('/api/feedback', async (req, res) => {
  const payload = {
    ...req.body,
    event: 'feedback',
    timestamp: req.body.timestamp || new Date().toISOString()
  };
  console.log(`Feedback: ${payload.type}`);
  await sendToN8n(payload);
  res.json({ ok: true });
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  try {
    const { rows } = await pgPool.query('SELECT * FROM korki_users WHERE lower(username)=lower($1)', [username]);
    const u = rows[0];
    if (!u || u.suspended) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    const ok = await bcrypt.compare(password, u.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    const token = signToken(u);
    res.json({ token, role: u.role, user: { username: u.username }, useAreas: u.use_areas, manageAreas: u.manage_areas , usePaperless: !!u.use_paperless });
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
});

app.post('/api/change-password', async (req, res) => {
  const s = getSession(req);
  const { currentPassword, newPassword } = req.body || {};
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Neues Passwort muss mindestens 6 Zeichen haben' });
  try {
    const { rows } = await pgPool.query('SELECT * FROM korki_users WHERE id=$1', [s.uid]);
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'Sitzung ungültig – bitte neu anmelden' });
    const ok = await bcrypt.compare(currentPassword || '', u.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pgPool.query('UPDATE korki_users SET password_hash=$1, updated_at=now() WHERE id=$2', [hash, u.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('change-password error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
});

// ── Benutzerverwaltung (nur Admin) – eigene DB ───────────────
function adminSession(req) {
  const s = getSession(req);
  return (s && s.role === 'admin') ? s : null;
}
const cleanAreas = (a) => Array.isArray(a) ? a.map(x => String(x).trim()).filter(Boolean) : [];
const VALID_ROLES = ['admin', 'manager', 'default'];

// Bereiche (aus den w_-Prompts) für die UI
app.get('/api/admin/areas', (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  res.json(modesConfig.filter(isWissenMode).map(m => ({ key: m.key, title: m.title })));
});

// Nutzerliste
app.get('/api/admin/users', async (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  try {
    const { rows } = await pgPool.query(
      `SELECT id, username, role, first_name, last_name, funktion, email,
              use_areas, manage_areas, suspended, use_paperless FROM korki_users ORDER BY username`);
    const users = rows.map(u => ({
      id: u.id, username: u.username, role: u.role, suspended: !!u.suspended,
      first_name: u.first_name || '', last_name: u.last_name || '', funktion: u.funktion || '', email: u.email || '',
      use: u.use_areas || [], manage: u.manage_areas || [], usePaperless: !!u.use_paperless,
    }));
    res.json({ users });
  } catch (e) { console.error('admin/users GET:', e.message); res.status(500).json({ error: 'Datenbankfehler' }); }
});

// Nutzer anlegen
app.post('/api/admin/users', async (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  const { username, role, use, manage, first_name, last_name, funktion, email, usePaperless } = req.body || {};
  let password = (req.body || {}).password;
  if (!username) return res.status(400).json({ error: 'Benutzername erforderlich' });
  const autoGenerated = !password;
  if (autoGenerated) password = generatePassword();
  if (password.length < 6) return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
  const r = VALID_ROLES.includes(role) ? role : 'default';
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pgPool.query(
      `INSERT INTO korki_users (username,password_hash,role,first_name,last_name,funktion,email,use_areas,manage_areas,use_paperless)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [username.trim(), hash, r, first_name||'', last_name||'', funktion||'', email||'', cleanAreas(use), cleanAreas(manage), !!usePaperless]);
    if (autoGenerated && email) {
      try { await sendWelcomeMail(email.trim(), username.trim(), password); }
      catch (mailErr) { console.error('Willkommensmail fehlgeschlagen:', mailErr.message); }
    }
    res.json({ ok: true, id: rows[0].id, mailSent: autoGenerated && !!email });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Benutzername existiert bereits' });
    console.error('admin/users POST:', e.message); res.status(500).json({ error: 'Anlegen fehlgeschlagen' });
  }
});

// Nutzer bearbeiten (Rolle, Bereiche, Stammdaten, Sperre)
app.post('/api/admin/users/:id', async (req, res) => {
  const admin = adminSession(req);
  if (!admin) return res.status(403).json({ error: 'Nur für Administratoren' });
  const id = parseInt(req.params.id, 10);
  const { role, use, manage, suspended, first_name, last_name, funktion, email, usePaperless } = req.body || {};
  const r = VALID_ROLES.includes(role) ? role : 'default';
  // Selbstschutz: eigenes Konto nicht sperren / nicht zu Nicht-Admin herabstufen
  if (id === admin.uid && (suspended === true || (role && role !== 'admin')))
    return res.status(400).json({ error: 'Das eigene Admin-Konto kann nicht gesperrt oder herabgestuft werden.' });
  try {
    const fields = ['role=$2','use_areas=$3','manage_areas=$4','first_name=$5','last_name=$6','funktion=$7','email=$8','use_paperless=$9','updated_at=now()'];
    const vals = [id, r, cleanAreas(use), cleanAreas(manage), first_name||'', last_name||'', funktion||'', email||'', !!usePaperless];
    if (suspended !== undefined) { fields.push('suspended=$10'); vals.push(!!suspended); }
    const { rowCount } = await pgPool.query(`UPDATE korki_users SET ${fields.join(',')} WHERE id=$1`, vals);
    if (!rowCount) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('admin/users update:', e.message); res.status(500).json({ error: 'Speichern fehlgeschlagen' }); }
});

// Passwort zurücksetzen
app.post('/api/admin/users/:id/password', async (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rowCount } = await pgPool.query('UPDATE korki_users SET password_hash=$1, updated_at=now() WHERE id=$2', [hash, parseInt(req.params.id,10)]);
    if (!rowCount) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('admin/users password:', e.message); res.status(500).json({ error: 'Fehlgeschlagen' }); }
});

// Nutzer löschen
app.delete('/api/admin/users/:id', async (req, res) => {
  const admin = adminSession(req);
  if (!admin) return res.status(403).json({ error: 'Nur für Administratoren' });
  const id = parseInt(req.params.id, 10);
  if (id === admin.uid) return res.status(400).json({ error: 'Das eigene Konto kann nicht gelöscht werden.' });
  try {
    const { rowCount } = await pgPool.query('DELETE FROM korki_users WHERE id=$1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('admin/users DELETE:', e.message); res.status(500).json({ error: 'Löschen fehlgeschlagen' }); }
});

async function rewriteQuery(question, hist) {
      if (!hist || hist.length < 2) return question;
      const vague = question.length < 60 ||
        /^(und|aber|warum|wie|was|wer|wann|wo|wieso|weshalb|doch|nein|ja|schau|gib|zeig|erkl|sag|das|die|der|da|dort|davon|dazu|daraus|darüber|damit|dessen|darin)\b/i.test(question.trim());
      if (!vague) return question;

      const histText = hist.slice(-4).map(m =>
        (m.role === 'user' ? 'Nutzer' : brandConfig.name) + ': ' + m.content.slice(0, 300)
      ).join('\n');

      try {
        const r = await fetchWithTimeout(`${VLLM_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VLLM_API_KEY}` },
          body: JSON.stringify({
            model: VLLM_MODEL,
            messages: [
              { role: 'system', content: 'Du formulierst kurze oder vage Folgefragen anhand des Gesprächsverlaufs in eigenständige, präzise Suchanfragen um. Gib NUR die umformulierte Frage zurück – ohne Erklärung, ohne Anführungszeichen. /no_think' },
              { role: 'user', content: `Gesprächsverlauf:\n${histText}\n\nFolgefrage: "${question}"\n\nUmformuliert:` }
            ],
            max_tokens: 120,
            temperature: 0.1
          })
        });
        const d = await r.json();
        const rewritten = d.choices?.[0]?.message?.content?.trim();
        if (rewritten && rewritten.length > 5) {
          console.log(`Query rewrite: ${question.length} → ${rewritten.length} Zeichen`);
          return rewritten;
        }
      } catch(e) {
        console.warn('Query rewrite fehlgeschlagen:', e.message);
      }
      return question;
    }


app.post('/api/chat', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 20 }]), async (req, res) => {
  const { message, mode, history, multidoc_task, threadId } = req.body;
  const modeConf = modesConfig.find(m => m.key === mode);
  const isMulti = modeConf?.multifile || false;
  const file  = req.files?.['file']?.[0] || null;
  const files = req.files?.['files'] || [];

  console.log(`Chat request - mode: ${mode}, file: ${file ? file.originalname : 'none'}, files: ${files.length}, task: ${multidoc_task || 'none'}`);

  try {
    let fileContent = '';
    let isOcr = false;
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase();
      console.log(`Verarbeite Datei: ${ext}`);
      try {
        if (ext === '.docx') {
          const result = await mammoth.extractRawText({ path: file.path });
          fileContent = result.value;
          console.log(`DOCX extrahiert: ${fileContent.length} Zeichen`);
        } else if (ext === '.pdf') {
          const dataBuffer = fs.readFileSync(file.path);
          const pdfData = await pdfParse(dataBuffer);
          fileContent = pdfData.text.trim();
          console.log(`PDF extrahiert: ${fileContent.length} Zeichen`);

          // Fallback: OCR wenn PDF leer oder zu kurz (gescanntes PDF)
          if (fileContent.length < 50) {
            console.log('PDF scheint gescannt – starte OCR mit Tesseract...');
            const pngDir = `/tmp/ocr-${Date.now()}`;
            fs.mkdirSync(pngDir, { recursive: true });
            try {
              execSync(`pdftoppm -r 200 -png "${file.path}" "${pngDir}/page"`, { timeout: 60000 });
              const pages = fs.readdirSync(pngDir).filter(f => f.endsWith('.png')).sort();
              const ocrResults = await Promise.all(pages.map(p =>
                tesseract.recognize(path.join(pngDir, p), { lang: 'deu+eng', oem: 1, psm: 3 })
              ));
              fileContent = ocrResults.join('\n\n').trim();
              isOcr = true;
              console.log(`OCR abgeschlossen: ${fileContent.length} Zeichen aus ${pages.length} Seiten`);
            } finally {
              fs.rmSync(pngDir, { recursive: true, force: true });
            }
          }
        } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          console.log('Bild erkannt – korrigiere Rotation und starte OCR...');
          const rotatedPath = file.path + '_rotated.png';
          try {
            execSync(`magick convert -auto-orient "${file.path}" "${rotatedPath}"`, { timeout: 30000 });
          } catch (rotErr) {
            console.warn('Auto-Orient fehlgeschlagen, nutze Original:', rotErr.message);
            fs.copyFileSync(file.path, rotatedPath);
          }
          const ocrRaw = await tesseract.recognize(rotatedPath, { lang: 'deu+eng', oem: 1, psm: 3 });
          try { fs.unlinkSync(rotatedPath); } catch(_) {}
          console.log(`Bild-OCR Rohtext: ${ocrRaw.trim().length} Zeichen – bereinige mit vLLM...`);
          try {
            const cleanRes = await fetchWithTimeout(`${VLLM_URL}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VLLM_API_KEY}` },
              body: JSON.stringify({
                model: VLLM_MODEL,
                messages: [
                  { role: 'system', content: 'Du bereinigst automatisch per OCR erkannten Text aus Fotos. Füge fehlende Satzzeichen ein, korrigiere offensichtliche OCR-Fehler (z. B. "l" statt "1", "0" statt "O"), entferne Artefakte und stelle einen gut lesbaren Fließtext her. Behalte den gesamten Inhalt bei – erfinde nichts, kürze nichts weg. Gib NUR den bereinigten Text zurück. /no_think' },
                  { role: 'user', content: `OCR-Rohtext:\n\n${ocrRaw.trim()}` }
                ],
                max_tokens: 4096, temperature: 0.1
              })
            });
            if (cleanRes.ok) {
              const cleanJson = await cleanRes.json();
              const cleaned = cleanJson.choices?.[0]?.message?.content?.trim();
              fileContent = (cleaned && cleaned.length > 20) ? cleaned : ocrRaw.trim();
            } else {
              fileContent = ocrRaw.trim();
            }
          } catch (cleanErr) {
            console.warn('OCR-Bereinigung fehlgeschlagen:', cleanErr.message);
            fileContent = ocrRaw.trim();
          }
          isOcr = true;
          console.log(`Bild-OCR abgeschlossen: ${fileContent.length} Zeichen`);
        } else {
          fileContent = fs.readFileSync(file.path, 'utf-8');
          console.log(`Text gelesen: ${fileContent.length} Zeichen`);
        }
      } catch (readErr) {
        console.error('Datei-Lesefehler:', readErr);
        fileContent = `[Fehler beim Lesen der Datei: ${readErr.message}]`;
      }
      fs.unlinkSync(file.path);

      if (fileContent.length > MAX_CONTEXT_CHARS) {
        console.log(`Datei gekürzt von ${fileContent.length} auf ${MAX_CONTEXT_CHARS} Zeichen`);
        fileContent = fileContent.substring(0, MAX_CONTEXT_CHARS) +
          `\n\n[... Text gekürzt – Original hatte ${Math.round(file.size / 1024)}KB ...]`;
      }
    }

    // ── Mehrfachdokumente (multidoc-Modus) ──
    if (isMulti && files.length > 0) {
      const parts = [];
      for (const f of files) {
        const ext = path.extname(f.originalname).toLowerCase();
        let text = '';
        try {
          if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: f.path });
            text = result.value;
          } else if (ext === '.pdf') {
            const dataBuffer = fs.readFileSync(f.path);
            const pdfData = await pdfParse(dataBuffer);
            text = pdfData.text.trim();
            if (text.length < 50) {
              const pngDir = `/tmp/ocr-${Date.now()}`;
              fs.mkdirSync(pngDir, { recursive: true });
              try {
                execSync(`pdftoppm -r 200 -png "${f.path}" "${pngDir}/page"`, { timeout: 60000 });
                const pages = fs.readdirSync(pngDir).filter(p => p.endsWith('.png')).sort();
                const ocrResults = await Promise.all(pages.map(p =>
                  tesseract.recognize(path.join(pngDir, p), { lang: 'deu+eng', oem: 1, psm: 3 })
                ));
                text = ocrResults.join('\n\n').trim();
              } finally {
                fs.rmSync(pngDir, { recursive: true, force: true });
              }
            }
          } else {
            text = fs.readFileSync(f.path, 'utf-8');
          }
        } catch (e) {
          text = `[Fehler beim Lesen: ${e.message}]`;
        } finally {
          fs.unlinkSync(f.path);
        }
        parts.push(`=== Dokument: ${f.originalname} ===\n${text}`);
        console.log(`Multi-Doc: ${f.originalname} – ${text.length} Zeichen`);
      }
      fileContent = parts.join('\n\n');
      if (fileContent.length > MAX_CONTEXT_CHARS_MULTI) {
        fileContent = fileContent.substring(0, MAX_CONTEXT_CHARS_MULTI) +
          '\n\n[... weitere Dokumente gekürzt ...]';
      }
    }

    const modeConfig = modesConfig.find(m => m.key === mode);
    const useWebSearch  = modeConfig?.websearch  || false;
    const isPaperless   = modeConfig?.paperless  || false;
    const wissenKey     = mode.startsWith('w_') ? mode.slice(2) : mode;
    const isWissen      = modeConfig?.workspace === 'wissen' && KB_TABLES[wissenKey];
    const username = req.body.username || 'unknown';

    // Nutzung tracken
    sendToN8n({
      event: 'chat',
      user: username,
      mode,
      title: modeConfig?.title || mode,
      hasFile: !!file,
      timestamp: new Date().toISOString()
    });

    const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });

    let userMessage = message || '';
    if (fileContent) {
      if (isMulti) {
        const taskLabel = multidoc_task === 'vergleichen'
          ? `Vergleiche die folgenden Dokumente präzise und detailliert. Gehe dabei so vor:
1. Erstelle eine Tabelle mit den wichtigsten Regelungen/Inhalten als Zeilen und den Dokumenten als Spalten – markiere Unterschiede deutlich.
2. Liste danach konkrete wörtliche Unterschiede auf: Was steht in Dokument A, was in Dokument B? Zitiere direkt aus den Texten.
3. Benenne Widersprüche, Lücken und Gemeinsamkeiten explizit.
Sei so konkret wie möglich – keine allgemeinen Aussagen.`
          : 'Fasse die folgenden Dokumente zusammen. Erstelle zuerst eine Kurzzusammenfassung je Dokument, dann einen übergreifenden Überblick mit den wichtigsten gemeinsamen Themen und Erkenntnissen.';
        userMessage = `${taskLabel}${userMessage ? '\n\nZusätzliche Anweisung: ' + userMessage : ''}\n\n${fileContent}`;
      } else {
        userMessage = userMessage
          ? `${userMessage}\n\n--- Dateiinhalt ---\n${fileContent}`
          : `Bitte verarbeite folgenden Inhalt:\n\n${fileContent}`;
      }
    }

    // Web-Suche wenn aktiviert und kein Datei-Upload
    if (useWebSearch && !fileContent && userMessage) {
      console.log('Starte Web-Suche...');
      const searchResults = await webSearch(userMessage);
      if (searchResults) {
        userMessage = `${userMessage}\n\n--- Aktuelle Web-Suchergebnisse ---\n${searchResults}\n\nBitte beantworte die Frage auf Basis dieser Ergebnisse.`;
        console.log(`Web-Suche: ${SEARXNG_RESULTS} Ergebnisse gefunden`);
      }
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    if (isOcr && fileContent) {
      const ocrBlock = `**Erkannter Text (OCR):**\n\`\`\`\n${fileContent}\n\`\`\`\n\n---\n\n`;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ocrBlock } }] })}\n\n`);
    }

    if (isPaperless) {
      // ── Paperless-Dokumentensuche ──
      const query = (message || '').trim();
      if (!query) {
        const hint = '🔍 Bitte einen Suchbegriff eingeben.';
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: hint } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      try {
        const token = PAPERLESS_TOKEN || process.env.PAPERLESS_TOKEN || '';
        const plUrl = `${PAPERLESS_INTERNAL_URL}/api/documents/?query=${encodeURIComponent(query)}&page_size=10&ordering=-created`;
        const plRes = await fetch(plUrl, {
          headers: { 'Authorization': `Token ${token}` }
        });
        const plData = await plRes.json();
        const docs = plData.results || [];
        const publicUrl = brandConfig.paperlessUrl || process.env.PAPERLESS_URL || '';

        let md = '';
        if (!docs.length) {
          md = `Keine Dokumente gefunden für **„${query}"**.`;
        } else {
          md = `**${docs.length} Treffer** für „${query}":\n\n`;
          for (const doc of docs) {
            const date = doc.created_date || doc.created || '';
            const type = doc.document_type ? `· ${doc.document_type}` : '';
            const link = `[${doc.title}](/api/paperless/download/${doc.id})`;
            md += `- ${link}  \n  📅 ${date}${type}\n`;
          }
        }
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: md } }] })}\n\n`);
      } catch (e) {
        const err = '⚠️ Paperless nicht erreichbar.';
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: err } }] })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      return res.end();

    } else if (isWissen) {
      // ── Direkter pgvector-RAG-Pfad (kein Flowise, kein AnythingLLM) ──
      const kbTable = KB_TABLES[wissenKey];
      const hist = history ? JSON.parse(history).slice(-6) : [];
      userMessage = await rewriteQuery(userMessage, hist);

      const [queryEmbedding] = await getEmbeddings([userMessage]);
      const vecStr = '[' + queryEmbedding.join(',') + ']';

      const client = await kbPool.connect();
      let chunks = [];
      try {
        const { rows } = await client.query(
          `SELECT "pageContent", metadata, embedding <=> $1::vector AS distance
           FROM ${kbTable} ORDER BY distance ASC LIMIT 8`,
          [vecStr]
        );
        chunks = rows;
      } finally {
        client.release();
      }

      const contextText = chunks.length
        ? chunks.map((c, i) => `[${i + 1}]\n${c.pageContent}`).join('\n\n')
        : '';

      const systemPrompt = (systemPrompts[mode] || '') +
        (contextText ? `\n\n---\nRelevante Auszüge aus der Wissensdatenbank:\n\n${contextText}\n---` : '');

      const chatHistory = hist.slice(0, -1);
      const messages = [
        { role: 'system', content: systemPrompt + `\n\nSystemzeit: ${now}. /no_think` },
        ...chatHistory,
        { role: 'user', content: userMessage }
      ];

      const vllmRes = await fetchWithTimeout(`${VLLM_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VLLM_API_KEY}` },
        body: JSON.stringify({ model: VLLM_MODEL, messages, stream: true, max_tokens: 4096, chat_template_kwargs: { enable_thinking: false } })
      });

      if (!vllmRes.ok) throw new Error(`vLLM Fehler ${vllmRes.status}`);

      // Quellen als Markdown-Block nach dem Stream anfügen.
      // Mit source_url → klickbarer Link ("Original N"); ohne URL → Dateiname als Klartext.
      const seenSrc = new Set();
      const sources = [];
      for (const c of chunks) {
        const url  = c.metadata?.source_url || null;
        const name = c.metadata?.source || null;
        const key  = url || name;
        if (!key || seenSrc.has(key)) continue;
        seenSrc.add(key);
        // Paperless-URLs auf internen Proxy umschreiben
        let resolvedUrl = (url && /^https?:\/\//.test(url)) ? url : null;
        if (resolvedUrl) {
          const pmatch = resolvedUrl.match(/\/documents\/(\d+)/);
          if (pmatch) resolvedUrl = `/api/paperless/download/${pmatch[1]}`;
        }
        sources.push({ url: resolvedUrl, name });
        if (sources.length >= 5) break;
      }

      const reader = vllmRes.body;
      let buf = '';
      function finishWissen() {
        if (res.writableEnded) return;
        if (sources.length) {
          const label = sources.length > 1 ? 'Quellen' : 'Quelle';
          let linkIdx = 0;
          const parts = sources.map(s => {
            if (s.url) {
              linkIdx++;
              return `<a href="${s.url}" target="_blank" rel="noopener">Original${sources.filter(x => x.url).length > 1 ? ' ' + linkIdx : ''}</a>`;
            }
            return s.name; // kein Link – Dateiname als Klartext
          });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n**${label}:** ${parts.join(', ')}` } }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      }
      reader.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (raw === '[DONE]') { finishWissen(); return; }
          res.write(line + '\n');
        }
      });
      reader.on('end', () => { finishWissen(); });

    } else {
      // ── Direkter vLLM-Pfad ──
      if (!fileContent) {
        if (mode === 'uebersetzen') {
          userMessage = `Übersetze folgenden Text ins Deutsche: "${userMessage}"`;
        } else if (mode === 'leichte_sprache') {
          userMessage = `Übersetze folgenden Text in Leichte Sprache auf Deutsch: "${userMessage}"`;
        }
      }

      const basePrompt = basePromptText + (systemPrompts[mode] || systemPrompts[modesConfig[0]?.key] || '');
      const systemPrompt = `${basePrompt}\n\nSystemzeit: ${now}. Diese Angabe ist verbindlich korrekt. Kommentiere sie niemals, zweifle nie daran. /no_think`;
      const chatHistory = history ? JSON.parse(history).slice(-4) : [];

      // Aktuelle Nachricht kürzen
      const vllmLimit = isMulti ? MAX_VLLM_CHARS_MULTI : MAX_VLLM_CHARS;
      if (userMessage.length > vllmLimit) {
        console.log(`Nachricht gekürzt von ${userMessage.length} auf ${vllmLimit} Zeichen`);
        userMessage = userMessage.substring(0, vllmLimit) +
          `\n\n[... Text gekürzt ...]`;
      }

      // History kürzen bis Gesamtkontext passt
      let trimmedHistory = [...chatHistory];
      while (trimmedHistory.length > 0) {
        const total = systemPrompt.length + userMessage.length +
          trimmedHistory.reduce((s, m) => s + (m.content?.length || 0), 0);
        if (total <= vllmLimit) break;
        trimmedHistory.shift(); // älteste Nachricht entfernen
      }
      if (trimmedHistory.length < chatHistory.length) {
        console.log(`History gekürzt von ${chatHistory.length} auf ${trimmedHistory.length} Nachrichten`);
      }

      const messages = [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory,
        { role: 'user', content: userMessage },
      ];

      console.log(`Sende an vLLM - ${messages.length} Nachrichten, letzte Nachricht: ${userMessage.length} Zeichen`);

      const lowTempModes = ['leichte_sprache', 'zusammenfassen'];
      const vllmResponse = await fetchWithTimeout(`${VLLM_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${VLLM_API_KEY}`
        },
        body: JSON.stringify({
          model: VLLM_MODEL,
          messages,
          stream: true,
          temperature: lowTempModes.includes(mode) ? 0.3 : 0.5,
          max_tokens: 4096
        })
      });

      console.log(`vLLM Response Status: ${vllmResponse.status}`);
      if (vllmResponse.status >= 400) {
        const errText = await vllmResponse.text();
        console.error(`vLLM Fehler Body: ${errText}`);
        // Gesamtgröße aller Messages loggen
        const totalChars = messages.reduce((s, m) => s + (m.content?.length || 0), 0);
        console.error(`Gesamt-Zeichen in Messages: ${totalChars}`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `⚠️ Fehler: Anfrage zu lang (${totalChars} Zeichen). Bitte Text kürzen.` } }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      vllmResponse.body.pipe(res);
    }

  } catch (e) {
    console.error('Chat error:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    }
  }
});

// ── Hilfe-Chat (pgvector RAG) ──────────────────────────────────
app.post('/api/hilfe-chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Keine Nachricht' });
  const hilfeTable = process.env.HILFE_KB_TABLE || '';
  if (!hilfeTable) return res.status(503).json({ error: 'HILFE_KB_TABLE nicht konfiguriert' });
  try {
    const [queryEmbedding] = await getEmbeddings([message]);
    const vecStr = '[' + queryEmbedding.join(',') + ']';
    const client = await kbPool.connect();
    let chunks = [];
    try {
      const { rows } = await client.query(
        `SELECT "pageContent", metadata, embedding <=> $1::vector AS distance
         FROM ${hilfeTable} ORDER BY distance ASC LIMIT 5`,
        [vecStr]
      );
      chunks = rows;
    } finally {
      client.release();
    }
    const contextText = chunks.map((c, i) => `[${i + 1}] ${c.pageContent}`).join('\n\n');
    const systemPrompt = `Du bist der Hilfe-Assistent von ${brandConfig.name}. Beantworte Fragen zu ${brandConfig.name} ausschließlich auf Basis der folgenden Dokumentauszüge. Antworte kurz, präzise und auf Deutsch. Wenn die Antwort nicht in den Dokumenten steht, sage das klar.\n\n${contextText}`;
    const vllmRes = await fetchWithTimeout(`${VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VLLM_API_KEY}` },
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt + ' /no_think' },
          { role: 'user', content: message }
        ],
        stream: false,
        max_tokens: 512
      })
    });
    const data = await vllmRes.json();
    let answer = data.choices?.[0]?.message?.content || '(Keine Antwort)';
    answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    res.json({ answer });
  } catch (e) {
    console.error('Hilfe-Chat Fehler:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Transkription (Whisper) ───────────────────────────────────
// Eigene Konto-Infos (für Anzeige, z. B. hinterlegte E-Mail)
app.get('/api/me', async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const { rows } = await pgPool.query('SELECT username, email, role, first_name, last_name FROM korki_users WHERE id=$1', [s.uid]);
    if (!rows[0]) return res.status(404).json({ error: 'Unbekannt' });
    res.json(rows[0]);
  } catch (e) { console.error('api/me:', e.message); res.status(500).json({ error: 'Fehler' }); }
});

app.post('/api/transcribe', uploadAudio.single('audio'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Keine Audiodatei' });

  // Empfänger-Adresse aus dem angemeldeten Konto (JWT → DB), nicht aus dem Formular
  const s = getSession(req);
  if (!s) { fs.unlink(file.path, () => {}); return res.status(401).json({ error: 'Bitte neu anmelden.' }); }
  let email = '';
  try {
    const { rows } = await pgPool.query('SELECT email FROM korki_users WHERE id=$1', [s.uid]);
    email = (rows[0]?.email || '').trim().toLowerCase();
  } catch (e) { console.error('transcribe email lookup:', e.message); }
  if (!email) {
    fs.unlink(file.path, () => {});
    return res.status(400).json({ error: 'Für Ihr Konto ist keine E-Mail-Adresse hinterlegt. Bitte an die Administration wenden.' });
  }

  // Sofort antworten – Verarbeitung läuft async
  res.json({ ok: true, message: 'Datei empfangen. Das Transkript wird per E-Mail gesendet.' });

  // Async Verarbeitung
  (async () => {
    try {
      console.log(`Transkription gestartet: ${file.originalname}`);

      // M4A/AAC → WAV konvertieren für maximale Whisper-Kompatibilität
      const { execFile } = require('child_process');
      const { promisify } = require('util');
      const execFileAsync = promisify(execFile);
      const wavPath = file.path + '.wav';
      await execFileAsync('ffmpeg', ['-y', '-i', file.path, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath]);

      // Datei an Whisper senden
      const FormData = require('form-data');
      const form = new FormData();
      form.append('audio_file', fs.createReadStream(wavPath), {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      });

      const whisperRes = await fetch(`${WHISPER_URL}/asr?task=transcribe&language=de&output=json`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
        timeout: 7200000 // 2 Stunden
      });

      if (!whisperRes.ok) {
        const errBody = await whisperRes.text();
        throw new Error(`Whisper Fehler: ${whisperRes.status} – ${errBody}`);
      }

      const whisperJson = await whisperRes.json();
      console.log(`Whisper Antwort: ${whisperJson.text?.length ?? 0} Zeichen`);
      const transcript = (whisperJson.text || '').trim();

      if (!transcript) {
        throw new Error('Whisper hat kein Transkript zurückgegeben (leeres Ergebnis)');
      }

      // Transkript per vLLM formatieren
      let formattedTranscript = transcript;
      try {
        console.log('Formatiere Transkript mit vLLM...');
        const fmtRes = await fetchWithTimeout(`${VLLM_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VLLM_API_KEY}` },
          body: JSON.stringify({
            model: VLLM_MODEL,
            messages: [
              { role: 'system', content: 'Du bereinigst automatisch transkribierte Sprachtexte. Füge fehlende Satzzeichen ein, setze sinnvolle Absätze, korrigiere offensichtliche Erkennungsfehler und sorge für einen gut lesbaren Fließtext. Behalte den gesamten Inhalt bei – erfinde nichts, kürze nichts weg. Gib NUR den formatierten Text zurück, ohne Kommentar oder Erklärung. /no_think' },
              { role: 'user', content: `Bitte formatiere dieses Transkript:

${transcript}` }
            ],
            max_tokens: 4096,
            temperature: 0.2
          })
        });
        if (fmtRes.ok) {
          const fmtJson = await fmtRes.json();
          const result = fmtJson.choices?.[0]?.message?.content?.trim();
          if (result && result.length > 20) {
            formattedTranscript = result;
            console.log('Transkript formatiert: ' + result.length + ' Zeichen');
          }
        }
      } catch (fmtErr) {
        console.warn('Formatierung fehlgeschlagen, sende Rohtranskript:', fmtErr.message);
      }

      // E-Mail senden
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      });

      const filename = (file.originalname || 'aufnahme').replace(/\.[^.]+$/, '') + '_Transkript.txt';

      await transporter.sendMail({
        from: `${brandConfig.name} Transkription <${SMTP_FROM}>`,
        to: email,
        subject: `Transkript: ${file.originalname || 'Aufnahme'}`,
        text: `Hallo,\n\nanbei das Transkript deiner Aufnahme.\n\nDas Transkript kann in ${brandConfig.name} weiterverarbeitet werden (z. B. Zusammenfassung, Protokoll).\n\nViele Grüße\n${brandConfig.name}`,
        attachments: [{ filename, content: formattedTranscript, contentType: 'text/plain; charset=utf-8' }]
      });

      console.log('Transkript gesendet.');
    } catch (e) {
      console.error('Transkription Fehler:', e.message);
      // Fehler-Mail senden
      try {
        const transporter = nodemailer.createTransport({
          host: SMTP_HOST, port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS }
        });
        await transporter.sendMail({
          from: `${brandConfig.name} Transkription <${SMTP_FROM}>`,
          to: email,
          subject: 'Transkription fehlgeschlagen',
          text: `Die Transkription deiner Aufnahme ist leider fehlgeschlagen.\n\nFehler: ${e.message}\n\nBitte wende dich an den Administrator.`
        });
      } catch (mailErr) {
        console.error('Fehler-Mail fehlgeschlagen:', mailErr.message);
      }
    } finally {
      fs.unlink(file.path, () => {});
      fs.unlink(file.path + '.wav', () => {});
    }
  })();
});

// ── Text-to-Speech (Piper, deutsch) ──────────────────────────
app.post('/api/tts', async (req, res) => {
  let text = (req.body && req.body.text ? String(req.body.text) : '').trim();
  if (!text) return res.status(400).json({ error: 'Kein Text' });
  // Markdown-Reste entfernen und Länge begrenzen (Schutz vor Überlast)
  text = text
    .replace(/[#*_`>~]/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  try {
    const piperRes = await fetch(`${PIPER_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        voice: TTS_VOICE,
        input: text,
        response_format: 'mp3'
      }),
      timeout: 120000
    });

    if (!piperRes.ok) {
      const errBody = await piperRes.text().catch(() => '');
      console.error(`Piper Fehler: ${piperRes.status} – ${errBody.slice(0, 200)}`);
      return res.status(502).json({ error: 'Sprachausgabe nicht verfügbar' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    piperRes.body.pipe(res);
  } catch (e) {
    console.error('TTS Fehler:', e.message);
    res.status(502).json({ error: 'Sprachausgabe nicht verfügbar' });
  }
});

// ── Piktogramm-Suche (ARASAAC) ───────────────────────────────
app.get('/api/pictograms', async (req, res) => {
  const q = (req.query.q || '').trim();
  const lang = (req.query.lang || 'de').trim();
  if (!q) return res.status(400).json({ error: 'Kein Suchbegriff' });
  try {
    const url = `https://api.arasaac.org/v1/pictograms/${encodeURIComponent(lang)}/search/${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' }, timeout: 10000 });
    if (!r.ok) return res.status(r.status).json({ error: 'ARASAAC nicht erreichbar' });
    const data = await r.json();
    const results = (Array.isArray(data) ? data : []).slice(0, 40).map(p => ({
      id:      p._id,
      keyword: (p.keywords?.[0]?.keyword) || q,
      url:     `https://static.arasaac.org/pictograms/${p._id}/${p._id}_300.png`,
    }));
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── KB-Upload (PDF → pdftotext → vLLM-Embed → pgvector) ─────────────────────
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const PG_HOST       = process.env.PG_HOST       || 'PostgreSQL';
const PG_DB         = process.env.PG_DB         || 'flowise';
const PG_USER_KB    = process.env.PG_USER_KB    || 'n8n_user';
const PG_PASS_KB    = process.env.PG_PASS_KB    || '';
const EMBED_URL     = process.env.VLLM_EMBED_URL || 'http://vLLM-Embedding:8001/v1/embeddings';
const EMBED_MODEL   = 'BAAI/bge-m3';

const areasConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'areas.json'), 'utf-8'));
const KB_TABLES = {};
const KB_LABELS = {};
for (const [key, def] of Object.entries(areasConfig)) {
  KB_TABLES[key] = def.table;
  KB_LABELS[key] = def.label;
}

const CHUNK_SIZE    = 800;
const CHUNK_OVERLAP = 150;
const EMBED_BATCH   = 8;

function chunkText(text, source) {
  const paras = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  const chunks = [];
  let buf = '';
  for (const p of paras) {
    if (p.length > CHUNK_SIZE) {
      // Einzelner Absatz zu groß (z.B. unformatierte Tabelle ohne Leerzeilen) – hart zerlegen
      if (buf.trim()) { chunks.push(buf.trim()); buf = ''; }
      for (let i = 0; i < p.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(p.slice(i, i + CHUNK_SIZE).trim());
      }
      continue;
    }
    if (buf.length + p.length + 2 > CHUNK_SIZE && buf) {
      chunks.push(buf.trim());
      // Overlap: letzten vollständigen Absatz weitertragen statt roher Zeichenschnitt
      const prevParas = buf.trim().split(/\n{2,}/);
      const lastPara = prevParas[prevParas.length - 1] || '';
      buf = (lastPara.length <= CHUNK_OVERLAP ? lastPara + '\n\n' : '') + p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(c => c.length > 30).map(c => ({ content: c, source }));
}

async function getEmbeddings(texts) {
  const r = await withRetry(() => fetchWithTimeout(EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + VLLM_API_KEY,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  }, 30_000));
  if (!r.ok) throw new Error('Embedding API ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  return data.data.map(d => d.embedding);
}

const kbPool = pgPool;

async function insertChunks(table, chunks, sourceUrl) {
  const client = await kbPool.connect();
  let inserted = 0;
  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const embeddings = await getEmbeddings(batch.map(c => c.content));
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const vecStr = '[' + embeddings[j].join(',') + ']';
        const meta = JSON.stringify({ source: chunk.source, source_url: sourceUrl || null });
        await client.query(
          `INSERT INTO ${table} (id,"pageContent",metadata,embedding) VALUES (gen_random_uuid(),$1,$2,$3::vector)`,
          [chunk.content, meta, vecStr]
        );
        inserted++;
      }
    }
  } finally { client.release(); }
  return inserted;
}

// ── Wissensbereiche aus Prompts-Dir auflisten ─────────────────────────────────
app.get('/api/kb-areas', (req, res) => {
  if (!KB_INGEST_API_KEY || req.headers['x-api-key'] !== (process.env.KB_INGEST_API_KEY || '')) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const areas = fs.readdirSync(promptDir)
    .filter(f => f.startsWith('w_') && f.endsWith('.md'))
    .map(f => f.slice(2, -3)); // w_stvo.md → stvo
  res.json({ areas });
});

// ── Paperless: Metadaten (Tags, Korrespondenten, Dokumenttypen) ──────────────
app.get('/api/paperless/meta', async (req, res) => {
  try {
    const headers = { 'Authorization': `Token ${PAPERLESS_TOKEN}` };
    const [tagsRes, corrRes, typesRes] = await Promise.all([
      fetch(`${PAPERLESS_INTERNAL_URL}/api/tags/?page_size=200`, { headers }),
      fetch(`${PAPERLESS_INTERNAL_URL}/api/correspondents/?page_size=200`, { headers }),
      fetch(`${PAPERLESS_INTERNAL_URL}/api/document_types/?page_size=200`, { headers }),
    ]);
    const [tagsData, corrData, typesData] = await Promise.all([
      tagsRes.json(), corrRes.json(), typesRes.json()
    ]);
    res.json({
      tags:          (tagsData.results  || []).map(t => ({ id: t.id, name: t.name })),
      correspondents:(corrData.results  || []).map(c => ({ id: c.id, name: c.name })),
      document_types:(typesData.results || []).map(d => ({ id: d.id, name: d.name })),
    });
  } catch (e) {
    console.error('paperless/meta Fehler:', e.message);
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
});

// ── Paperless: Einzeldokument-Inhalt (OCR-Text) ──────────────────────────────
app.get('/api/paperless/document/:id', async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const plRes = await fetch(`${PAPERLESS_INTERNAL_URL}/api/documents/${req.params.id}/`, {
      headers: { 'Authorization': `Token ${PAPERLESS_TOKEN}` }
    });
    if (!plRes.ok) return res.status(plRes.status).json({ error: 'Dokument nicht gefunden' });
    const d = await plRes.json();
    res.json({
      id:            d.id,
      title:         d.title,
      content:       d.content || '',
      created:       d.created_date || d.created || '',
      correspondent: d.correspondent_name || null,
      document_type: d.document_type_name || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
});

// ── Paperless: Dokument-PDF proxied (Browser-Download) ───────────────────────
app.get('/api/paperless/download/:id', async (req, res) => {
  if (!getSession(req)) return res.status(401).end();
  try {
    const metaRes = await fetch(`${PAPERLESS_INTERNAL_URL}/api/documents/${req.params.id}/`, {
      headers: { 'Authorization': `Token ${PAPERLESS_TOKEN}` }
    });
    if (!metaRes.ok) return res.status(404).end();
    const meta = await metaRes.json();
    const dlRes = await fetch(`${PAPERLESS_INTERNAL_URL}/api/documents/${req.params.id}/download/`, {
      headers: { 'Authorization': `Token ${PAPERLESS_TOKEN}` }
    });
    if (!dlRes.ok) return res.status(dlRes.status).end();
    const ct = dlRes.headers.get('content-type') || 'application/pdf';
    const filename = encodeURIComponent((meta.title || `dokument-${req.params.id}`) + '.pdf');
    res.setHeader('Content-Type', ct);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${filename}`);
    dlRes.body.pipe(res);
  } catch (e) {
    res.status(500).end();
  }
});

// ── Paperless: Dokumente suchen (Filter-Parameter) ───────────────────────────
app.post('/api/paperless/search', async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { tag_ids, correspondent_id, document_type_id, created_after, created_before, query } = req.body || {};
  try {
    const params = new URLSearchParams();
    params.set('page_size', '25');
    params.set('ordering', '-created');
    if (query) params.set('query', query);
    if (correspondent_id) params.set('correspondent__id', correspondent_id);
    if (document_type_id) params.set('document_type__id', document_type_id);
    if (created_after)    params.set('created__date__gte', created_after);
    if (created_before)   params.set('created__date__lte', created_before);
    if (Array.isArray(tag_ids) && tag_ids.length) {
      tag_ids.forEach(id => params.append('tags__id__all', id));
    }
    const plRes = await fetch(`${PAPERLESS_INTERNAL_URL}/api/documents/?${params}`, {
      headers: { 'Authorization': `Token ${PAPERLESS_TOKEN}` }
    });
    const plData = await plRes.json();
    const publicUrl = brandConfig.paperlessUrl || '';
    const docs = (plData.results || []).map(d => ({
      id:            d.id,
      title:         d.title,
      created:       d.created_date || d.created || '',
      correspondent: d.correspondent_name || null,
      document_type: d.document_type_name || null,
      url:           `/api/paperless/download/${d.id}`,
    }));
    res.json({ count: plData.count || docs.length, docs });
  } catch (e) {
    console.error('paperless/search Fehler:', e.message);
    res.status(500).json({ error: 'Paperless nicht erreichbar' });
  }
});

// ── Paperless-ngx-Ingest: nimmt bereits OCR'ten Text entgegen (z.B. von n8n) und
// verlinkt jeden Chunk per source_url auf das Originaldokument in Paperless ────
const KB_INGEST_API_KEY = process.env.KB_INGEST_API_KEY || '';

app.post('/api/kb-ingest-text', async (req, res) => {
  if (!KB_INGEST_API_KEY || req.headers['x-api-key'] !== KB_INGEST_API_KEY) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const { bereich, text, source, source_url } = req.body || {};
  const table = KB_TABLES[(bereich || '').toLowerCase().trim()];
  if (!table) return res.status(400).json({ error: 'Unbekannter Bereich: ' + bereich });
  if (!text || !text.trim()) return res.status(400).json({ error: 'Kein Text übergeben' });

  try {
    const chunks = chunkText(text, source || 'Paperless-Dokument');
    const inserted = await insertChunks(table, chunks, source_url);
    res.json({ ok: true, inserted, chunks: chunks.length });
  } catch (e) {
    console.error('kb-ingest-text Fehler:', e.message);
    res.status(500).json({ error: 'Einlesen fehlgeschlagen: ' + e.message });
  }
});

const uploadKB = multer({
  dest: '/tmp/kb_uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','text/plain','text/markdown','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg','image/png','image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Ungültiger Dateityp. Erlaubt: PDF, TXT, MD, DOC/DOCX, JPG, PNG, WEBP'), false);
  }
});

app.post('/api/kb-upload', uploadKB.array('files', 20), async (req, res) => {
  const session = getSession(req);
  if (!session || !['admin', 'manager'].includes(session.role)) {
    return res.status(403).json({ error: 'Keine Berechtigung. Nur Admins und Manager können Dokumente einlesen.' });
  }
  if (session.role === 'manager' && session.manage && session.manage.length) {
    const allowed = session.manage.map(normArea);
    if (!allowed.includes(normArea(req.body.bereich))) {
      return res.status(403).json({ error: 'Kein Schreibrecht für diesen Bereich.' });
    }
  }
  const bereich = (req.body.bereich || '').toLowerCase().trim();
  const table   = KB_TABLES[bereich];
  if (!table) return res.status(400).json({ error: 'Unbekannter Bereich: ' + bereich });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Keine Dateien hochgeladen' });

  const clearFirst = req.body.clear === 'true';
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  const send = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n');

  try {
    if (clearFirst) {
      await kbPool.query('DELETE FROM ' + table);
      send({ type: 'info', msg: 'Tabelle geleert – alle bisherigen Dokumente entfernt.' });
    }

    let totalChunks = 0, totalInserted = 0;
    for (const file of req.files) {
      const fname = file.originalname;
      send({ type: 'progress', msg: 'Extrahiere Text: ' + fname });
      try {
        let text = '';
        if (fname.toLowerCase().endsWith('.pdf')) {
          const { stdout } = await execFileAsync('pdftotext', [file.path, '-']);
          text = stdout.trim();
          // Fallback: OCR wenn pdftotext keinen verwertbaren Text liefert
          if (text.replace(/\s/g, '').length < 50) {
            send({ type: 'progress', msg: fname + ': kein Text gefunden – starte OCR (Tesseract)…' });
            const pngDir = `/tmp/ocr-kb-${Date.now()}`;
            fs.mkdirSync(pngDir, { recursive: true });
            try {
              await execFileAsync('pdftoppm', ['-r', '200', '-png', file.path, `${pngDir}/page`]);
              const pages = fs.readdirSync(pngDir).filter(p => p.endsWith('.png')).sort();
              const { recognize } = require('node-tesseract-ocr');
              const ocrResults = await Promise.all(pages.map(p =>
                recognize(path.join(pngDir, p), { lang: 'deu+eng', oem: 1, psm: 3 })
              ));
              text = ocrResults.join('\n\n').trim();
              send({ type: 'progress', msg: fname + ': OCR abgeschlossen (' + pages.length + ' Seiten).' });
            } finally {
              fs.rmSync(pngDir, { recursive: true, force: true });
            }
          }
        } else if (fname.toLowerCase().match(/\.(txt|md)$/)) {
          text = fs.readFileSync(file.path, 'utf8');
        } else if (fname.toLowerCase().endsWith('.docx')) {
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ path: file.path });
          text = result.value.trim();
          send({ type: 'progress', msg: fname + ': Word-Dokument extrahiert (' + text.length + ' Zeichen).' });
        } else {
          send({ type: 'warn', msg: fname + ': nur PDF/TXT/MD/DOCX unterstützt, übersprungen.' });
          fs.unlinkSync(file.path);
          continue;
        }

        const chunks = chunkText(text, fname);
        totalChunks += chunks.length;
        send({ type: 'progress', msg: fname + ': ' + chunks.length + ' Abschnitte – erstelle Embeddings…' });

        const inserted = await insertChunks(table, chunks);
        totalInserted += inserted;
        send({ type: 'file_done', msg: fname + ': ' + inserted + ' Abschnitte gespeichert.', count: inserted });
      } catch (e) {
        send({ type: 'error', msg: 'Fehler bei ' + fname + ': ' + e.message });
      } finally {
        try { fs.unlinkSync(file.path); } catch(_) {}
      }
    }
    send({ type: 'done', msg: 'Fertig! ' + totalInserted + ' Abschnitte in "' + KB_LABELS[bereich] + '" gespeichert.', inserted: totalInserted });
  } catch (e) {
    send({ type: 'error', msg: 'Fehler: ' + e.message });
  }
  res.end();
});


// ── Bot-Chat (z.B. Mattermost via n8n): RAG über ALLE Wissensbereiche ───────
// Eigenständig von /api/chat – sucht direkt per pgvector über alle KB_TABLES,
// statt an einen einzelnen Flowise-Chatflow/AnythingLLM-Workspace gebunden zu sein.
const BOT_API_KEY = process.env.BOT_API_KEY || '';
const BOT_CHUNKS_PER_AREA = 4;
const BOT_TOP_CHUNKS = 8;

app.post('/api/bot-chat', async (req, res) => {
  if (!BOT_API_KEY || req.headers['x-api-key'] !== BOT_API_KEY) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const { message, username } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Kein message übergeben' });
  }

  try {
    // Bereichsrechte des Users ermitteln (gleiche Logik wie /api/modes):
    // unbekannter User / Rolle != 'default' / leeres use_areas → alle Bereiche.
    let allowedAreaKeys = null; // null = alle erlaubt
    if (username) {
      const { rows: userRows } = await pgPool.query(
        'SELECT role, use_areas FROM korki_users WHERE lower(username)=lower($1) AND suspended=false',
        [username]
      );
      const u = userRows[0];
      if (u && u.role === 'default' && u.use_areas && u.use_areas.length) {
        allowedAreaKeys = u.use_areas.map(normArea);
      }
    }
    const areaEntries = Object.entries(KB_TABLES).filter(
      ([areaKey]) => !allowedAreaKeys || allowedAreaKeys.includes(normArea(areaKey))
    );

    const [queryEmbedding] = await getEmbeddings([message]);
    const vecStr = '[' + queryEmbedding.join(',') + ']';

    const client = await kbPool.connect();
    let allChunks = [];
    try {
      for (const [areaKey, table] of areaEntries) {
        const { rows } = await client.query(
          `SELECT "pageContent", metadata, embedding <=> $1::vector AS distance
           FROM ${table} ORDER BY distance ASC LIMIT $2`,
          [vecStr, BOT_CHUNKS_PER_AREA]
        );
        for (const row of rows) {
          allChunks.push({
            area: KB_LABELS[areaKey] || areaKey,
            content: row.pageContent,
            distance: row.distance,
          });
        }
      }
    } finally {
      client.release();
    }

    allChunks.sort((a, b) => a.distance - b.distance);
    const topChunks = allChunks.slice(0, BOT_TOP_CHUNKS);

    const contextText = topChunks.length
      ? topChunks.map((c, i) => `[${i + 1}] (Bereich: ${c.area})\n${c.content}`).join('\n\n')
      : '';

    const systemPrompt = (contextText
      ? `Du bist ${brandConfig.name}, ein interner KI-Assistent. Beantworte die Frage des Nutzers ausschließlich auf Basis der folgenden Auszüge aus den Wissensbereichen. Nenne den jeweiligen Bereich, wenn du dich auf eine Quelle beziehst. Wenn die Auszüge die Frage nicht beantworten, sage das ehrlich – erfinde nichts.\n\n${contextText}`
      : `Du bist ${brandConfig.name}, ein interner KI-Assistent. Es wurden keine passenden Treffer in den Wissensbereichen gefunden – beantworte die Frage nach bestem Wissen, weise aber darauf hin, dass keine interne Quelle gefunden wurde.`
    ) + '\n\nAntworte direkt, ohne Gedankengang. /no_think';

    const llmRes = await fetchWithTimeout(`${VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${VLLM_API_KEY}` },
      body: JSON.stringify({
        model: VLLM_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });
    if (!llmRes.ok) throw new Error('LLM-Aufruf fehlgeschlagen: ' + llmRes.status);
    const llmJson = await llmRes.json();
    let answer = llmJson.choices?.[0]?.message?.content?.trim() || '(keine Antwort)';
    answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    sendToN8n({
      event: 'bot-chat',
      user: username || 'bot',
      areasFound: [...new Set(topChunks.map(c => c.area))],
      timestamp: new Date().toISOString(),
    });

    res.json({
      answer,
      sources: [...new Set(topChunks.map(c => c.area))],
    });
  } catch (e) {
    console.error('bot-chat Fehler:', e.message);
    res.status(500).json({ error: 'Fehler bei der Bot-Anfrage: ' + e.message });
  }
});

// ── OpenID Connect Provider: FreiKI als Identity-Provider für Mattermost ───
// Minimaler Authorization-Code-Flow, genug für Mattermosts "OpenID Connect"-
// Login (System Console → Authentication → OpenID Connect, manuelle Endpoints,
// keine Discovery nötig). Ein Account, ein Login für FreiKI + Mattermost.
const OIDC_CLIENT_ID     = process.env.MATTERMOST_OIDC_CLIENT_ID || '';
const OIDC_CLIENT_SECRET = process.env.MATTERMOST_OIDC_CLIENT_SECRET || '';
const OIDC_REDIRECT_URI  = process.env.MATTERMOST_OIDC_REDIRECT_URI || '';
const oidcCodes = new Map(); // code -> { uid, username, role, expires }
const OIDC_CODE_TTL_MS = 2 * 60 * 1000;

function cleanupOidcCodes() {
  const now = Date.now();
  for (const [code, entry] of oidcCodes) {
    if (entry.expires < now) oidcCodes.delete(code);
  }
}

function htmlAttrEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function oidcLoginPage(error, params) {
  const hidden = ['response_type', 'client_id', 'redirect_uri', 'state', 'scope']
    .map(k => `<input type="hidden" name="${k}" value="${htmlAttrEscape(params[k])}">`)
    .join('\n');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandConfig.name} Login</title>
  <style>
    *{box-sizing:border-box;}
    body{font-family:system-ui,sans-serif;background:#F4F6FA;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
    form{background:#fff;padding:32px;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,0.08);width:100%;max-width:360px;}
    h1{font-size:18px;margin:0 0 18px;color:#15294A;}
    input[type=text],input[type=password]{width:100%;padding:12px;margin-bottom:12px;border:1px solid #E3E8F0;border-radius:8px;font-size:16px;}
    button{width:100%;padding:12px;background:${brandConfig.color};color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:16px;}
    .err{color:#B43C32;font-size:13px;margin-bottom:12px;}
  </style></head><body>
  <form method="POST">
    <h1>Anmeldung bei ${brandConfig.name}</h1>
    ${error ? `<div class="err">${error}</div>` : ''}
    ${hidden}
    <input type="text" name="username" placeholder="Benutzername" autocomplete="username" required autofocus>
    <input type="password" name="password" placeholder="Passwort" autocomplete="current-password" required>
    <button type="submit">Anmelden</button>
  </form></body></html>`;
}

app.get('/oauth/authorize', (req, res) => {
  if (req.query.client_id !== OIDC_CLIENT_ID || req.query.redirect_uri !== OIDC_REDIRECT_URI) {
    return res.status(400).send('Ungültiger client_id oder redirect_uri');
  }
  res.set('Content-Type', 'text/html').send(oidcLoginPage(null, req.query));
});

app.post('/oauth/authorize', async (req, res) => {
  const { username, password, client_id, redirect_uri, state } = req.body || {};
  if (client_id !== OIDC_CLIENT_ID || redirect_uri !== OIDC_REDIRECT_URI) {
    return res.status(400).send('Ungültiger client_id oder redirect_uri');
  }
  try {
    const { rows } = await pgPool.query('SELECT * FROM korki_users WHERE lower(username)=lower($1)', [username]);
    const u = rows[0];
    const ok = u && !u.suspended && await bcrypt.compare(password || '', u.password_hash || '');
    if (!ok) {
      return res.set('Content-Type', 'text/html').status(401).send(
        oidcLoginPage('Ungültige Anmeldedaten', req.body)
      );
    }
    cleanupOidcCodes();
    const code = crypto.randomBytes(24).toString('hex');
    oidcCodes.set(code, { uid: u.id, username: u.username, email: u.email, expires: Date.now() + OIDC_CODE_TTL_MS });
    const redirect = new URL(redirect_uri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    res.redirect(redirect.toString());
  } catch (e) {
    console.error('oauth/authorize Fehler:', e.message);
    res.status(500).send('Serverfehler');
  }
});

app.post('/oauth/token', (req, res) => {
  const { grant_type, code, redirect_uri, client_id, client_secret } = req.body || {};
  const authHeader = req.headers['authorization'] || '';
  let basicId = client_id, basicSecret = client_secret;
  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    [basicId, basicSecret] = decoded.split(':');
  }
  if (grant_type !== 'authorization_code' || basicId !== OIDC_CLIENT_ID || basicSecret !== OIDC_CLIENT_SECRET) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  cleanupOidcCodes();
  const entry = oidcCodes.get(code);
  if (!entry || (redirect_uri && redirect_uri !== OIDC_REDIRECT_URI)) {
    return res.status(400).json({ error: 'invalid_grant' });
  }
  oidcCodes.delete(code); // einmal verwendbar

  const claims = {
    sub: String(entry.uid),
    preferred_username: entry.username,
    name: entry.username,
    email: entry.email || '',
    email_verified: true,
  };
  const accessToken = jwt.sign(claims, JWT_SECRET, { expiresIn: '1h' });
  const idToken = jwt.sign({ ...claims, iss: APP_URL, aud: OIDC_CLIENT_ID }, JWT_SECRET, { expiresIn: '1h' });
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    id_token: idToken,
    scope: 'openid profile email',
  });
});

app.get('/oauth/userinfo', (req, res) => {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'invalid_token' });
  try {
    const claims = jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({
      sub: claims.sub,
      preferred_username: claims.preferred_username,
      name: claims.name,
      email: claims.email,
      email_verified: claims.email_verified,
    });
  } catch (e) {
    res.status(401).json({ error: 'invalid_token' });
  }
});

// Mattermost Team Edition hat kein generisches "OpenID Connect" (Enterprise-Feature),
// nutzt aber für den GitLab-SSO-Slot frei konfigurierbare Endpoints (Auth/Token/User-API).
// Dieser Endpoint liefert die User-Daten im GitLab-API-Format (v4/user), damit sich der
// GitLab-Login-Slot zweckentfremden lässt – Auth/Token-Endpoints sind Standard-OAuth2 und
// damit identisch zu /oauth/authorize und /oauth/token.
app.get('/api/v4/user', (req, res) => {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ message: '401 Unauthorized' });
  try {
    const claims = jwt.verify(auth.slice(7), JWT_SECRET);
    res.json({
      id: parseInt(claims.sub, 10),
      username: claims.preferred_username,
      login: claims.preferred_username,
      email: claims.email,
      name: claims.name,
      state: 'active',
      avatar_url: `${APP_URL}/apple-touch-icon.png`,
      web_url: APP_URL,
      confirmed_at: new Date().toISOString(),
      two_factor_enabled: false,
    });
  } catch (e) {
    res.status(401).json({ message: '401 Unauthorized' });
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

loadBrandConfig().then(() => {
  app.listen(3000, () => console.log(`${brandConfig.name} UI läuft auf Port 3000`));
});
