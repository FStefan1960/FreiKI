const { ALLOWED_FIELDS } = require('../../../../shared/config/BrandConfig');

function renderAdminConfigPage(saved) {
  const field = (key, label, type = 'text') => {
    const isColor = type === 'color';
    return `
    <div class="field">
      <label for="${key}">${label}</label>
      <div class="input-row">
        ${isColor ? `<input type="color" id="${key}_picker" value="#000000" data-color-picker="${key}" class="color-input">` : ''}
        <input type="${type}" id="${key}" name="${key}" value="" ${isColor ? `data-color-input="${key}"` : ''} class="text-input">
      </div>
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Konfiguration</title>
  <style>
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f4f6fa;
      --text-primary: #15294a;
      --text-secondary: #5a6b82;
      --border-color: #d8e0ec;
      --primary: #1f54c0;
      --primary-dark: #14306b;
      --success: #22a05a;
      --error: #b3261e;
      --error-bg: #fdeaea;
      --shadow: 0 1px 6px rgba(0,0,0,.07);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-primary: #1e1e1e;
        --bg-secondary: #2a2a2a;
        --text-primary: #e0e0e0;
        --text-secondary: #a0a0a0;
        --border-color: #3a3a3a;
        --error-bg: #3a2020;
      }
    }

    * { box-sizing: border-box; }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      background: var(--bg-secondary);
      color: var(--text-primary);
      line-height: 1.5;
    }

    .header {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px 0;
    }

    .header a {
      font-size: 13px;
      color: var(--text-secondary);
      text-decoration: none;
      display: inline-block;
      margin-bottom: 20px;
      transition: color 0.2s;
    }

    .header a:hover { color: var(--primary); }

    h1 {
      font-size: 22px;
      font-weight: 800;
      margin: 0 0 4px;
    }

    .sub {
      color: var(--text-secondary);
      font-size: 13px;
      margin: 0 0 24px;
    }

    .alert {
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      margin-bottom: 12px;
      animation: slideIn 0.3s ease-out;
    }

    .alert.success {
      background: var(--success);
      color: white;
    }

    .alert.error {
      background: var(--error-bg);
      color: var(--error);
    }

    .alert.hidden { display: none; }

    @keyframes slideIn {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .wrap {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 24px;
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 32px;
      align-items: start;
    }

    @media (max-width: 700px) {
      .wrap { grid-template-columns: 1fr; }
      .preview-box { position: static; }
    }

    .card {
      background: var(--bg-primary);
      border-radius: 14px;
      box-shadow: var(--shadow);
      padding: 24px;
      margin-bottom: 20px;
    }

    .card h2 {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-secondary);
      margin: 0 0 18px;
    }

    .field {
      margin-bottom: 16px;
    }

    .field label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .input-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .text-input, textarea {
      width: 100%;
      padding: 9px 12px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-size: 14px;
      color: var(--text-primary);
      background: var(--bg-primary);
      font-family: inherit;
      outline: none;
      transition: border-color 0.2s;
    }

    .text-input:focus, textarea:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(31, 84, 192, 0.12);
    }

    .color-input {
      width: 40px;
      height: 38px;
      padding: 2px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      cursor: pointer;
      flex-shrink: 0;
    }

    .btn-group {
      display: flex;
      gap: 10px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .btn-save {
      padding: 12px 18px;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 10px;
      font-weight: 700;
      font-size: 15px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
    }

    .btn-save:hover:not(:disabled) { filter: brightness(0.9); }

    .btn-save:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-save.loading::after {
      content: '';
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .btn-secondary {
      background: var(--text-secondary);
    }

    textarea {
      resize: vertical;
    }

    .help-text {
      font-size: 12px;
      color: var(--text-secondary);
      margin: 4px 0 12px;
    }

    .preview-box {
      position: sticky;
      top: 24px;
    }

    .preview-header {
      background: var(--primary-dark);
      border-radius: 12px 12px 0 0;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .preview-header img {
      height: 32px;
      object-fit: contain;
      max-width: 160px;
    }

    .preview-body {
      background: var(--bg-secondary);
      border-radius: 0 0 12px 12px;
      padding: 18px;
    }

    .preview-btn {
      display: inline-block;
      padding: 9px 18px;
      border-radius: 8px;
      background: var(--primary);
      color: white;
      font-weight: 700;
      font-size: 13px;
      border: none;
    }

    .preview-tagline {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 10px;
    }

    .preview-card {
      background: var(--bg-primary);
      border-radius: 10px;
      padding: 14px;
      margin-top: 12px;
      font-size: 13px;
      border: 1px solid var(--border-color);
    }

    .preview-card strong {
      color: var(--primary);
    }

    code {
      background: rgba(31, 84, 192, 0.1);
      color: var(--primary);
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 12px;
    }

    .hint {
      background: rgba(31, 84, 192, 0.05);
      border-left: 3px solid var(--primary);
      padding: 10px 12px;
      border-radius: 4px;
      font-size: 13px;
      margin-top: 12px;
    }
  </style>
</head>

<body>
  <div class="header">
    <a href="/">← Zurück zur App</a>
    <h1 id="pv-name">Instanz-Konfiguration</h1>
    <p class="sub">Ändere Name, Logo und Farben – Änderungen werden sofort aktiv, kein Neustart erforderlich</p>
    <div id="auth-error" class="alert error hidden"></div>
    <div id="saved-toast" class="alert success hidden">✅ Konfiguration gespeichert</div>
  </div>

  <div class="wrap" id="config-wrap" style="display:none">
    <form id="config-form">
      <div class="card">
        <h2>Identität</h2>
        ${field('name', 'App-Name (z. B. FreiKI, EvaKI, KorKI)')}
        ${field('tagline', 'Untertitel')}
        ${field('logo', 'Logo-Pfad oder URL')}
        ${field('supportEmail', 'Support-E-Mail (optional)')}
      </div>

      <div class="card">
        <h2>Farben</h2>
        ${field('color', 'Primärfarbe', 'color')}
        ${field('colorHover', 'Hover-Farbe', 'color')}
        ${field('colorActive', 'Aktiv-Farbe', 'color')}
        ${field('navy', 'Header-/Footer-Farbe', 'color')}
      </div>

      <div class="card">
        <h2>Verknüpfte Dienste</h2>
        ${field('mattermostUrl', 'Mattermost-URL')}
        ${field('paperlessUrl', 'Paperless-URL')}
      </div>

      <div class="card">
        <h2>Service Worker Cache</h2>
        ${field('swVersion', 'Cache-Version (bei Farbwechsel +1)')}
        <p class="help-text">Erhöhe diese Zahl, wenn du Logo oder Farben änderst, damit der Browser-Cache geleert wird.</p>
        <div id="save-error" class="alert error hidden"></div>
        <div class="btn-group">
          <button type="submit" id="save-btn" class="btn-save">Speichern</button>
        </div>
      </div>

      <div class="card">
        <h2>Breaking News (Login-Hinweis)</h2>
        <p class="help-text">Wird allen Nutzer:innen beim nächsten Login einmalig als Modal angezeigt.</p>
        <div id="bn-current" class="help-text"></div>
        <textarea id="bn-text" rows="4" placeholder="Optionale Hinweis-Nachricht eingeben..."></textarea>
        <div id="bn-error" class="alert error hidden"></div>
        <div id="bn-success" class="alert success hidden"></div>
        <div class="btn-group">
          <button type="button" id="bn-publish" class="btn-save">📢 Veröffentlichen</button>
          <button type="button" id="bn-clear" class="btn-save btn-secondary">Zurückziehen</button>
        </div>
      </div>
    </form>

    <div class="preview-box">
      <div class="card">
        <h2>Live-Vorschau</h2>
        <div class="preview-header" id="pv-header">
          <img id="pv-logo" src="" alt="">
        </div>
        <div class="preview-body">
          <div id="pv-tagline" class="preview-tagline"></div>
          <div class="preview-card">
            Willkommen bei <strong id="pv-name2"></strong>! Wie kann ich Ihnen helfen?
          </div>
          <div style="margin-top: 14px;">
            <button class="preview-btn" id="pv-btn">Senden</button>
          </div>
        </div>
      </div>
      <p style="font-size: 11px; color: var(--text-secondary); margin-top: 12px; text-align: center;">
        Farben werden nach Seiten-Reload übernommen
      </p>
    </div>
  </div>

  <script>
    // Live Preview
    function preview() {
      const get = id => document.getElementById(id)?.value || '';
      const name = get('name') || 'Instanz-Konfiguration';
      const tagline = get('tagline') || '';
      const logo = get('logo') || '';
      const primary = get('color') || '#1f54c0';
      const navy = get('navy') || '#14306b';

      document.getElementById('pv-name').textContent = name;
      document.getElementById('pv-name2').textContent = name;
      document.getElementById('pv-tagline').textContent = tagline;
      const logoEl = document.getElementById('pv-logo');
      logoEl.src = logo;
      logoEl.style.display = logo ? '' : 'none';
      logoEl.onerror = () => { logoEl.style.display = 'none'; };

      document.getElementById('pv-header').style.background = navy;
      document.getElementById('pv-btn').style.background = primary;
      document.getElementById('pv-name2').style.color = primary;
      document.querySelector('.btn-save').style.background = primary;
    }

    // Color sync
    document.querySelectorAll('[data-color-picker]').forEach(picker => {
      picker.addEventListener('input', (e) => {
        const key = e.target.dataset.colorPicker;
        document.getElementById(key).value = e.target.value;
        preview();
      });
    });

    document.querySelectorAll('[data-color-input]').forEach(input => {
      input.addEventListener('input', (e) => {
        const key = e.target.dataset.colorInput;
        document.getElementById(key + '_picker').value = e.target.value;
        preview();
      });
    });

    // Regular inputs trigger preview
    document.querySelectorAll('.text-input').forEach(el => el.addEventListener('input', preview));

    // Form submit
    document.getElementById('config-form').addEventListener('submit', save);

    // Breaking News
    document.getElementById('bn-publish').addEventListener('click', publishBreakingNews);
    document.getElementById('bn-clear').addEventListener('click', clearBreakingNews);

    async function load() {
      const errEl = document.getElementById('auth-error');
      try {
        const res = await fetch('/api/admin/brand-config');
        if (!res.ok) {
          errEl.textContent = res.status === 403 ? 'Kein Zugriff (nur Administratoren)' : 'Fehler beim Laden: ' + res.status;
          errEl.classList.remove('hidden');
          return;
        }
        const b = await res.json();
        const fields = ${JSON.stringify(ALLOWED_FIELDS)};
        fields.forEach(k => {
          const el = document.getElementById(k);
          if (el) el.value = b[k] || '';
          const picker = document.getElementById(k + '_picker');
          if (picker && b[k]) picker.value = b[k];
        });
        document.getElementById('config-wrap').style.display = '';
        document.title = (b.name || 'Instanz') + ' – Konfiguration';
        preview();
        loadBreakingNews();
      } catch (e) {
        errEl.textContent = 'Verbindungsfehler: ' + e.message;
        errEl.classList.remove('hidden');
      }
    }

    async function loadBreakingNews() {
      try {
        const res = await fetch('/api/admin/breaking-news');
        if (!res.ok) return;
        const d = await res.json();
        document.getElementById('bn-text').value = d.text || '';
        document.getElementById('bn-current').textContent = d.text
          ? '📌 Aktiv (Version ' + d.version + ')'
          : 'Keine aktive Nachricht';
      } catch (e) { }
    }

    async function save(ev) {
      ev.preventDefault();
      const btn = document.getElementById('save-btn');
      const errEl = document.getElementById('save-error');
      const name = document.getElementById('name')?.value.trim();

      if (!name) {
        errEl.textContent = 'App-Name ist erforderlich';
        errEl.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btn.classList.add('loading');
      errEl.classList.add('hidden');

      try {
        const fields = ${JSON.stringify(ALLOWED_FIELDS)};
        const body = Object.fromEntries(fields.map(k => [k, document.getElementById(k)?.value || '']));
        const res = await fetch('/admin/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (res.ok) {
          document.getElementById('saved-toast').classList.remove('hidden');
          setTimeout(() => {
            document.getElementById('saved-toast').classList.add('hidden');
          }, 3000);
        } else {
          const d = await res.json().catch(() => ({}));
          errEl.textContent = 'Fehler: ' + (d.error || res.status);
          errEl.classList.remove('hidden');
        }
      } catch (e) {
        errEl.textContent = 'Verbindungsfehler: ' + e.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }

    async function publishBreakingNews() {
      const btn = document.getElementById('bn-publish');
      const errEl = document.getElementById('bn-error');
      const okEl = document.getElementById('bn-success');
      const text = document.getElementById('bn-text').value.trim();

      if (!text) {
        errEl.textContent = 'Bitte einen Text eingeben';
        errEl.classList.remove('hidden');
        return;
      }

      btn.disabled = true;
      btn.classList.add('loading');
      errEl.classList.add('hidden');
      okEl.classList.add('hidden');

      try {
        const res = await fetch('/api/admin/breaking-news', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });

        if (res.ok) {
          loadBreakingNews();
          okEl.textContent = '✅ Veröffentlicht – wird beim nächsten Login angezeigt';
          okEl.classList.remove('hidden');
        } else {
          const d = await res.json().catch(() => ({}));
          errEl.textContent = 'Fehler: ' + (d.error || res.status);
          errEl.classList.remove('hidden');
        }
      } catch (e) {
        errEl.textContent = 'Verbindungsfehler: ' + e.message;
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }

    async function clearBreakingNews() {
      if (!confirm('Breaking-News-Nachricht wirklich zurückziehen?')) return;
      const btn = document.getElementById('bn-clear');
      const errEl = document.getElementById('bn-error');
      const okEl = document.getElementById('bn-success');

      btn.disabled = true;
      btn.classList.add('loading');

      try {
        await fetch('/api/admin/breaking-news', { method: 'DELETE' });
        loadBreakingNews();
        okEl.textContent = '✅ Zurückgezogen';
        okEl.classList.remove('hidden');
      } catch (e) { }
      finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }

    load();
  </script>
</body>
</html>`;
}

module.exports = { renderAdminConfigPage };
