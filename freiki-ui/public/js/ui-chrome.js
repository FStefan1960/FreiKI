// ── Sidebar Mobile ──
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const menuBtn = document.querySelector('.menu-btn');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}

function toggleAccountMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('account-menu');
  if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
  const r = e.currentTarget.getBoundingClientRect();
  menu.style.left = r.left + 'px';
  menu.style.bottom = (window.innerHeight - r.top + 8) + 'px';
  menu.classList.add('open');
}
function closeAccountMenu() {
  document.getElementById('account-menu').classList.remove('open');
}
document.addEventListener('click', (e) => {
  const menu = document.getElementById('account-menu');
  if (menu && menu.classList.contains('open') && !menu.contains(e.target)) closeAccountMenu();
});

// ── Panel-Hilfsfunktionen ──
function closeAllPanels() {
  document.getElementById('messages').style.display = 'none';
  document.querySelector('.input-area').style.display = 'none';
  document.getElementById('tool-panel').style.display = 'none';
  document.getElementById('extra-panel').style.display = 'none';
  document.getElementById('paperless-filter-panel').style.display = 'none';
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  closeSidebar();
}

function showChat() {
  document.getElementById('tool-panel').style.display = 'none';
  document.getElementById('extra-panel').style.display = 'none';
  document.getElementById('paperless-filter-panel').style.display = 'none';
  document.getElementById('messages').style.display = '';
  document.querySelector('.input-area').style.display = '';
  document.body.classList.remove('tool-open');
}


// ── Eingebettete Werkzeug-Panels (iframe) ──
function openToolPanel(src) {
  closeAllPanels();
  const frame = document.getElementById('tool-frame');
  // Formular-Chat immer frisch laden: die Ansicht bleibt sonst (gleicher iframe-src wird
  // nicht neu geladen) beim zuletzt begonnenen Formular stehen, statt wieder die Startmaske
  // zu zeigen - laufende Sitzungen sind serverseitig gespeichert und per PIN wieder erreichbar.
  // Scanner ebenfalls: sonst bleibt eine einmal geladene scanner.html
  // (ohne neuen APPDOC-Button, mit veralteter Antwortsprache) für die ganze Tab-Sitzung liegen.
  const forceReload = src === '/formular-chat.html' || src === '/scanner.html';
  if (forceReload) {
    frame.setAttribute('src', src + '?_r=' + Date.now());
  } else if (frame.getAttribute('src') !== src) {
    frame.setAttribute('src', src);
  }
  document.getElementById('tool-panel').style.display = 'flex';
  document.body.classList.add('tool-open');
}

function closeToolPanel() {
  showChat();
}

// Generisches In-App-Panel für "api"-Extras aus public/extras/*.json (Medienspiegel,
// Gesellschaftstrends, Sicherheitslage, Losung) - ersetzt vier frühere, fast identische
// open*()-Funktionen. Losung bleibt als einzige Ausnahme in renderExtraPanelContent(), weil
// sie drei strukturierte Felder statt eines HTML-Blobs liefert.
async function openExtraPanel(extra) {
  closeAllPanels();
  document.getElementById('extra-panel').style.display = 'flex';
  document.body.classList.add('tool-open');
  document.getElementById('extra-panel-title').textContent =
    t('panel.' + extra.key + '_title', (extra.icon ? extra.icon + ' ' : '') + extra.title);
  const dateEl = document.getElementById('extra-panel-date');
  const content = document.getElementById('extra-panel-content');
  dateEl.textContent = '';
  content.innerHTML = '<span style="color:var(--fk-muted);">' + t('common.loading', 'Lade…') + '</span>';
  try {
    const res = await fetch(extra.api);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    dateEl.textContent = data.date ? t('common.as_of_prefix', 'Stand: ') + data.date : '';
    content.innerHTML = renderExtraPanelContent(extra.key, data);
    content.querySelectorAll('a').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  } catch (e) {
    content.innerHTML = '<span style="color:var(--fk-muted);">' + t('common.load_error', 'Fehler beim Laden.') + '</span>';
  }
}

function renderExtraPanelContent(key, data) {
  if (key === 'losung') {
    if (!data.losung) return '<span style="color:var(--fk-muted);">' + t('panel.no_losung', 'Noch keine Losung verfügbar.') + '</span>';
    return `
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--fk-muted);margin-bottom:4px;">${t('panel.losung_label', 'Losung')}</div>
        <p style="font-size:16px;line-height:1.5;">${data.losung}</p>
        <div style="font-size:12px;color:var(--fk-muted);">${data.losungRef || ''}</div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--fk-muted);margin-bottom:4px;">${t('panel.lehrtext_label', 'Lehrtext')}</div>
        <p style="font-size:16px;line-height:1.5;">${data.lehrtext}</p>
        <div style="font-size:12px;color:var(--fk-muted);">${data.lehrtextRef || ''}</div>
      </div>
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--fk-muted);margin-bottom:4px;">${t('panel.gedanke_label', 'Gedanke für den Tag')}</div>
        <p style="font-size:15px;line-height:1.6;">${data.gedanken || ''}</p>
      </div>`;
  }
  return data.html || '<span style="color:var(--fk-muted);">' + t('common.no_data_available', 'Noch keine Daten verfügbar.') + '</span>';
}

function closeExtraPanel() {
  showChat();
}


// Scanner-APPDOC: OCR-Text in „Übersetzen nach“ legen und direkt übersetzen.
// language ist die gespeicherte Antwortsprache (Adjektiv, z.B. "türkisch").
function openTranslateWithText(text, language) {
  const body = (text || '').trim();
  if (!body) return;
  setMode('3translate');
  newChat();
  const raw = String(language || 'deutsch').trim() || 'deutsch';
  const label = /^de$/i.test(raw) ? 'Deutsch' : (raw.charAt(0).toUpperCase() + raw.slice(1));
  const prefix = /^Deutsch$/i.test(label) ? 'Übersetze ins Deutsche:' : `Übersetze ins ${label}:`;
  const input = document.getElementById('message-input');
  input.value = `${prefix}\n\n${body}`;
  autoResize(input);
  sendMessage();
}

// ── Kontextuelle Hinweise (einmalig pro Browser, siehe localStorage-Flag) ──
let _featureHintKey = null;
function showFeatureHint(key, title, bodyHtml) {
  if (localStorage.getItem('freiki_hint_' + key)) return;
  _featureHintKey = key;
  document.getElementById('feature-hint-title').textContent = title;
  document.getElementById('feature-hint-body').innerHTML = bodyHtml;
  document.getElementById('feature-hint-modal').classList.add('show');
}
function closeFeatureHint() {
  document.getElementById('feature-hint-modal').classList.remove('show');
  if (_featureHintKey) localStorage.setItem('freiki_hint_' + _featureHintKey, '1');
  _featureHintKey = null;
}
