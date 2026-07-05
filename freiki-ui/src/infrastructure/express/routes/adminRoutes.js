const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { config } = require('../../../shared/config');
const { getBrandConfig, updateBrandConfig } = require('../../../shared/config/BrandConfig');
const { adminSession } = require('../../../core/auth/AuthMiddleware');
const AuthService = require('../../../core/auth/AuthService');
const users = require('../../../core/auth/UserRepository');
const prompts = require('../../../core/chat/PromptService');
const chatRepo = require('../../../core/chat/ChatRepository');

const router = express.Router();

// ── Admin: editierbare Konfigurations-Seite ──────────────────
function adminConfigPage(saved) {
  const b = getBrandConfig();
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
document.querySelectorAll('input[type=text]').forEach(el => el.addEventListener('input', preview));
preview();
</script>
</body></html>`;
}

router.get('/admin/config', (req, res) => {
  if (!adminSession(req)) return res.status(403).send('Kein Zugriff');
  res.type('html').send(adminConfigPage(req.query.saved === '1'));
});

router.post('/admin/config', express.urlencoded({ extended: true }), async (req, res) => {
  if (!adminSession(req)) return res.status(403).send('Kein Zugriff');
  try {
    await updateBrandConfig(req.body);
    res.redirect('/admin/config?saved=1');
  } catch (e) {
    console.error('Fehler beim Speichern der Konfiguration:', e.message);
    res.status(500).send('Fehler beim Speichern');
  }
});

router.get('/api/admin/areas', (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  res.json(prompts.modesConfig.filter(prompts.isWissenMode).map(m => ({ key: m.key, title: m.title })));
});

router.get('/api/admin/users', async (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  try {
    res.json({ users: await users.listAll() });
  } catch (e) { console.error('admin/users GET:', e.message); res.status(500).json({ error: 'Datenbankfehler' }); }
});

router.post('/api/admin/users', async (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  const { username, role, use, manage, first_name, last_name, funktion, email, use_paperless, password } = req.body || {};
  if (!users.isValidUsername(username)) return res.status(400).json({ error: 'Benutzername: 3–64 Zeichen, nur Buchstaben, Zahlen und ._-' });
  if (email && !users.isValidEmail(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  if (password && password.length < 6) return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
  try {
    const result = await AuthService.createUser({ username, role, use, manage, first_name, last_name, funktion, email, use_paperless, password });
    res.json({ ok: true, id: result.id, mailSent: result.mailSent });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Benutzername existiert bereits' });
    console.error('admin/users POST:', e.message); res.status(500).json({ error: 'Anlegen fehlgeschlagen' });
  }
});

router.post('/api/admin/users/:id', async (req, res) => {
  const admin = adminSession(req);
  if (!admin) return res.status(403).json({ error: 'Nur für Administratoren' });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Ungültige Nutzer-ID' });
  const { role, use, manage, suspended, first_name, last_name, funktion, email, use_paperless } = req.body || {};
  if (email && !users.isValidEmail(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  // Selbstschutz: eigenes Konto nicht sperren / nicht zu Nicht-Admin herabstufen
  if (id === admin.uid && (suspended === true || (role && role !== 'admin')))
    return res.status(400).json({ error: 'Das eigene Admin-Konto kann nicht gesperrt oder herabgestuft werden.' });
  try {
    const ok = await users.update(id, { role, use, manage, suspended, first_name, last_name, funktion, email, use_paperless });
    if (!ok) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('admin/users update:', e.message); res.status(500).json({ error: 'Speichern fehlgeschlagen' }); }
});

router.post('/api/admin/users/:id/password', async (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen haben' });
  try {
    const ok = await AuthService.resetPassword(parseInt(req.params.id, 10), password);
    if (!ok) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('admin/users password:', e.message); res.status(500).json({ error: 'Fehlgeschlagen' }); }
});

router.post('/api/admin/users/:id/resend-welcome', async (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  try {
    const result = await AuthService.resendWelcome(parseInt(req.params.id, 10));
    if (result.error === 'not-found') return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    if (result.error === 'no-email') return res.status(400).json({ error: 'Keine E-Mail-Adresse hinterlegt' });
    res.json({ ok: true });
  } catch (e) { console.error('resend-welcome:', e.message); res.status(500).json({ error: 'Fehlgeschlagen' }); }
});

router.delete('/api/admin/users/:id', async (req, res) => {
  const admin = adminSession(req);
  if (!admin) return res.status(403).json({ error: 'Nur für Administratoren' });
  const id = parseInt(req.params.id, 10);
  if (id === admin.uid) return res.status(400).json({ error: 'Das eigene Konto kann nicht gelöscht werden.' });
  try {
    const ok = await users.remove(id);
    if (!ok) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('admin/users DELETE:', e.message); res.status(500).json({ error: 'Löschen fehlgeschlagen' }); }
});

// ── Medienspiegel / Gesellschaftstrends / Tageslosung: Admin-seitiges Schreiben ──
router.post('/api/admin/medienspiegel', (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  const { html, date } = req.body || {};
  if (!html) return res.status(400).json({ error: 'html fehlt' });
  try {
    fs.writeFileSync(path.join(config.APP_ROOT, 'medienspiegel.json'),
      JSON.stringify({ date: date || new Date().toISOString().slice(0, 10), html }));
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Interner Fehler' }); }
});

router.post('/api/admin/gesellschaftstrends', (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  const { html, date } = req.body || {};
  if (!html) return res.status(400).json({ error: 'html fehlt' });
  try {
    fs.writeFileSync(path.join(config.APP_ROOT, 'gesellschaftstrends.json'),
      JSON.stringify({ date: date || new Date().toISOString().slice(0, 10), html }));
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Interner Fehler' }); }
});

router.post('/api/admin/losung', (req, res) => {
  if (!adminSession(req)) return res.status(403).json({ error: 'Nur für Administratoren' });
  const { date, losung, losungRef, lehrtext, lehrtextRef, gedanken } = req.body || {};
  if (!losung || !lehrtext) return res.status(400).json({ error: 'losung/lehrtext fehlt' });
  try {
    fs.writeFileSync(path.join(config.APP_ROOT, 'losung.json'), JSON.stringify({
      date: date || new Date().toISOString().slice(0, 10),
      losung, losungRef, lehrtext, lehrtextRef, gedanken
    }));
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Interner Fehler' }); }
});

// ── Tages-Statistiken (Admin-Widget) ─────────────────────────
const gpuCache = { live: 0, peak: 0, peakDate: '' };

async function pollGpuCache() {
  try {
    const r = await fetch(`${config.VLLM_URL}/metrics`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return;
    const text = await r.text();
    const match = text.match(/vllm:gpu_cache_usage_perc\s+([\d.]+)/);
    if (match) {
      const val = parseFloat(match[1]) * 100;
      gpuCache.live = val;
      const today = new Date().toDateString();
      if (today !== gpuCache.peakDate) { gpuCache.peak = 0; gpuCache.peakDate = today; }
      if (val > gpuCache.peak) gpuCache.peak = val;
    }
  } catch (_) {}
}
setInterval(pollGpuCache, 60_000);
pollGpuCache();

router.get('/api/admin/stats', async (req, res) => {
  const s = adminSession(req);
  if (!s) return res.status(403).json({ error: 'Kein Zugriff' });
  try {
    const stats = await chatRepo.getTodayStats();
    res.json({
      ...stats,
      gpuCacheLive: Math.round(gpuCache.live * 10) / 10,
      gpuCachePeak: Math.round(gpuCache.peak * 10) / 10,
    });
  } catch (e) {
    res.status(500).json({ error: 'DB-Fehler' });
  }
});

module.exports = router;
