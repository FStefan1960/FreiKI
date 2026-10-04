const { ALLOWED_FIELDS } = require('../../../../shared/config/BrandConfig');

// ── Admin: editierbare Konfigurations-Seite ──────────────────
// Die Seite selbst (GET) bleibt öffentlich erreichbar, rendert aber KEINE
// Konfigurationswerte mehr server-seitig - die lädt load() erst per fetch() nach
// (Session-Cookie wird automatisch mitgeschickt). So bleibt mattermostUrl/paperlessUrl
// etc. tatsächlich hinter requireAdmin, ohne dass die Seite für normale
// Browser-Navigation unerreichbar wird (siehe requireAdmin-Kommentar in adminRoutes.js).
function renderAdminConfigPage(saved) {
  const field = (key, label, type = 'text') => {
    const isColor = type === 'color';
    return `
    <div class="field">
      <label for="${key}">${label}</label>
      <div class="input-row">
        ${isColor ? `<input type="color" id="${key}_picker" value="#000000"
          oninput="document.getElementById('${key}').value=this.value;preview()">` : ''}
        <input type="text" id="${key}" name="${key}" value=""
          ${isColor ? `oninput="document.getElementById('${key}_picker').value=this.value;preview()"` : ''}>
      </div>
    </div>`;
  };
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Konfiguration</title>
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
  <h1 id="pv-name">Instanz-Konfiguration</h1>
  <p class="sub">Instanz-Konfiguration · Änderungen werden sofort aktiv, kein Neustart erforderlich</p>
  ${saved ? '<div class="toast show">Konfiguration gespeichert.</div>' : ''}
  <div id="auth-error" style="display:none;background:#fdeaea;color:#b3261e;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:12px"></div>
</div>
<div class="wrap" id="config-wrap" style="display:none">
  <form id="config-form" onsubmit="return save(event)">
    <div class="card" style="margin-bottom:20px">
      <h2>Identität</h2>
      ${field('name',    'App-Name (z. B. FreiKI, EvaKI, KorKI)')}
      ${field('tagline', 'Untertitel')}
      ${field('logo',    'Logo-Pfad oder URL')}
      ${field('supportEmail', 'Support-E-Mail (optional)')}
    </div>
    <div class="card" style="margin-bottom:20px">
      <h2>Farben</h2>
      ${field('color',       'Primärfarbe',          'color')}
      ${field('colorHover',  'Hover-Farbe',          'color')}
      ${field('colorActive', 'Aktiv-Farbe',          'color')}
      ${field('navy',        'Header-/Footer-Farbe', 'color')}
    </div>
    <div class="card" style="margin-bottom:20px">
      <h2>Verknüpfte Dienste</h2>
      ${field('mattermostUrl', 'Mattermost-URL')}
      ${field('paperlessUrl',  'Paperless-URL')}
    </div>
    <div class="card">
      <h2>Service Worker</h2>
      ${field('swVersion', 'Cache-Version (bei Farbwechsel +1)')}
      <p style="font-size:12px;color:#5a6b82;margin:4px 0 12px">Wenn Farben oder Logo geändert werden, diese Zahl um 1 erhöhen, damit der Browser-Cache geleert wird.</p>
      <div id="save-error" style="display:none;background:#fdeaea;color:#b3261e;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:12px"></div>
      <button type="submit" class="btn-save" id="save-btn">Speichern</button>
    </div>
    <div class="card" id="bn-card" style="margin-top:20px">
      <h2>Breaking News (Login-Hinweis)</h2>
      <p style="font-size:12px;color:#5a6b82;margin:0 0 14px">Wird allen Nutzer:innen beim nächsten Login einmalig als Hinweis-Modal angezeigt. Beim Veröffentlichen einer neuen Nachricht wird die Kenntnisnahme aller Nutzer zurückgesetzt.</p>
      <div id="bn-current" style="font-size:12px;color:#5a6b82;margin-bottom:8px"></div>
      <textarea id="bn-text" rows="4" style="width:100%;padding:9px 12px;border:1px solid #d8e0ec;border-radius:8px;font-size:14px;color:#15294a;font-family:inherit;resize:vertical"></textarea>
      <div id="bn-error" style="display:none;background:#fdeaea;color:#b3261e;border-radius:8px;padding:10px 14px;font-size:13px;margin-top:12px"></div>
      <div id="bn-success" class="toast" style="margin:12px 0 0"></div>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <button type="button" class="btn-save" style="margin-top:0;width:auto;padding:12px 18px" onclick="publishBreakingNews()">Veröffentlichen</button>
        <button type="button" class="btn-save" style="margin-top:0;width:auto;padding:12px 18px;background:#8a94a6" onclick="clearBreakingNews()">Zurückziehen</button>
      </div>
    </div>
  </form>

  <div class="preview-box">
    <div class="card">
      <h2>Live-Vorschau</h2>
      <div class="preview-header" id="pv-header">
        <img id="pv-logo" src="" alt="" onerror="this.style.display='none'">
      </div>
      <div class="preview-body">
        <div id="pv-tagline" class="preview-tagline"></div>
        <div class="preview-card">
          Willkommen bei <strong id="pv-name2"></strong>! Wie kann ich Ihnen helfen?
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
  const name     = get('name')    || 'Instanz-Konfiguration';
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

// GET /admin/config selbst ist öffentlich erreichbar, rendert aber keine Werte mehr
// server-seitig - die holt load() per fetch() nach (Session-Cookie wird automatisch
// mitgeschickt). So bleiben mattermostUrl/paperlessUrl etc. tatsächlich hinter
// requireAdmin (/api/admin/brand-config), ohne dass die Seite für normale Navigation
// unerreichbar wird.
async function load() {
  const errEl = document.getElementById('auth-error');
  try {
    const res = await fetch('/api/admin/brand-config');
    if (!res.ok) {
      errEl.textContent = res.status === 403 ? 'Kein Zugriff (nur für Administratoren).' : 'Fehler beim Laden: ' + res.status;
      errEl.style.display = 'block';
      return;
    }
    const b = await res.json();
    const fields = ${JSON.stringify(ALLOWED_FIELDS)};
    for (const k of fields) {
      const el = document.getElementById(k);
      if (el) el.value = b[k] || '';
      const picker = document.getElementById(k + '_picker');
      if (picker && b[k]) picker.value = b[k];
    }
    document.getElementById('config-wrap').style.display = '';
    document.title = (b.name || 'Instanz') + ' – Konfiguration';
    preview();
    loadBreakingNews();
  } catch (e) {
    errEl.textContent = 'Verbindungsfehler: ' + e.message;
    errEl.style.display = 'block';
  }
}
load();

async function loadBreakingNews() {
  try {
    const res = await fetch('/api/admin/breaking-news');
    if (!res.ok) return;
    const d = await res.json();
    document.getElementById('bn-text').value = d.text || '';
    document.getElementById('bn-current').textContent = d.text
      ? 'Aktuell aktiv (Version ' + d.version + ').'
      : 'Aktuell keine aktive Nachricht.';
  } catch (e) { /* Karte bleibt leer, kein Blocker fuer den Rest der Seite */ }
}

async function publishBreakingNews() {
  const errEl = document.getElementById('bn-error');
  const okEl = document.getElementById('bn-success');
  errEl.style.display = 'none';
  okEl.classList.remove('show');
  const text = document.getElementById('bn-text').value.trim();
  if (!text) { errEl.textContent = 'Bitte einen Text eingeben.'; errEl.style.display = 'block'; return; }
  try {
    const res = await fetch('/api/admin/breaking-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (res.ok) {
      loadBreakingNews();
      okEl.textContent = '✅ Veröffentlicht – wird allen Nutzer:innen beim nächsten Login angezeigt.';
      okEl.classList.add('show');
    } else {
      const d = await res.json().catch(() => ({}));
      errEl.textContent = 'Fehler: ' + (d.error || res.status);
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = 'Verbindungsfehler: ' + e.message;
    errEl.style.display = 'block';
  }
}

async function clearBreakingNews() {
  if (!confirm('Aktuelle Breaking-News-Nachricht zurückziehen?')) return;
  const errEl = document.getElementById('bn-error');
  const okEl = document.getElementById('bn-success');
  errEl.style.display = 'none';
  okEl.classList.remove('show');
  try {
    await fetch('/api/admin/breaking-news', { method: 'DELETE' });
    loadBreakingNews();
    okEl.textContent = '✅ Zurückgezogen.';
    okEl.classList.add('show');
  } catch (e) { /* Karte zeigt beim naechsten Laden ohnehin den echten Stand */ }
}

// Formular postet als fetch() statt eines nativen <form method="POST">, damit ein Fehler
// (z. B. 403 bei fehlender Admin-Rolle) im Formular angezeigt werden kann statt auf eine
// Fehlerseite zu navigieren. adminSession() prüft das HttpOnly-Session-Cookie, das bei
// Same-Origin-fetch() automatisch mitgeschickt wird.
async function save(ev) {
  ev.preventDefault();
  const errEl = document.getElementById('save-error');
  const btn = document.getElementById('save-btn');
  errEl.style.display = 'none';
  const fields = ${JSON.stringify(ALLOWED_FIELDS)};
  const body = Object.fromEntries(fields.map(k => [k, document.getElementById(k)?.value || '']));
  btn.disabled = true;
  try {
    const res = await fetch('/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      window.location.href = '/admin/config?saved=1';
    } else {
      const d = await res.json().catch(() => ({}));
      errEl.textContent = 'Fehler: ' + (d.error || res.status);
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent = 'Verbindungsfehler: ' + e.message;
    errEl.style.display = 'block';
  }
  btn.disabled = false;
  return false;
}
</script>
</body></html>`;
}

module.exports = { renderAdminConfigPage };
