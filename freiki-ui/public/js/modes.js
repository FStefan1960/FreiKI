// ── Load modes from server ──
function switchTab(tab) {
  ['werkzeuge','wissen','extras'].forEach(t => {
    const btn = document.getElementById('tab-' + t);
    const panel = document.getElementById('mode-buttons-' + t);
    if (btn) btn.classList.toggle('active', tab === t);
    if (panel) panel.style.display = tab === t ? '' : 'none';
  });
}

const ICON_MAP = {
  '🧐': 'chat', '💬': 'chat',
  '📄': 'document', '📃': 'document',
  '🌐': 'globe', '🌍': 'globe',
  'search': 'search',
  '✏️': 'pencil',
  '📝': 'report',
  '📚': 'multidoc',
  '🖼️': 'image',
  '🎙️': 'mic',
  '📅': 'calendar',
  '🙏': 'book',
  '📋': 'form-fill',
  '🔲': 'qrcode',
  '📷': 'scan',
};

// Emoji, die als Text-Badge dargestellt werden (z. B. Flaggen)
const TEXT_ICON_MAP = {
  '🇩🇪': 'DE',
};

// Liefert den SVG-Dateinamen für einen Mode, sonst null.
// Wissen-Kategorien (key w_*) haben eine eigene SVG: /icons/<key>.svg
function modeSvgName(icon, key) {
  if (key && key.startsWith('w_')) return key;
  return ICON_MAP[icon] || null;
}

function modeIconHTML(icon, key) {
  if (TEXT_ICON_MAP[icon]) {
    return `<span class="icon-text-badge">${TEXT_ICON_MAP[icon]}</span>`;
  }
  const name = modeSvgName(icon, key);
  return name
    ? `<img src="/icons/${name}.svg" width="19" height="19" alt="">`
    : icon;
}

function setHeaderIcon(icon, key) {
  const el = document.getElementById('header-icon');
  if (!el) return;
  if (TEXT_ICON_MAP[icon]) {
    el.innerHTML = `<span style="font-size:11px;font-weight:800;letter-spacing:0.02em;">${TEXT_ICON_MAP[icon]}</span>`;
    return;
  }
  const name = modeSvgName(icon, key);
  if (name) {
    el.innerHTML = `<img src="/icons/${name}.svg" width="20" height="20" alt="" style="filter:var(--header-icon-filter,none)">`;
  } else {
    el.textContent = icon || '💬';
  }
}

function makeModeBtn(m) {
  const btn = document.createElement('button');
  btn.className = 'mode-btn' + (m.websearch ? ' mode-btn-web' : '');
  btn.id = 'btn-' + m.key;
  btn.onclick = () => setMode(m.key);
  btn.innerHTML = `<div class="mode-icon">${modeIconHTML(m.icon, m.key)}</div><div class="mode-nav-text"><div class="mode-nav-title">${m.title}</div>${m.desc ? `<div class="mode-nav-sub">${m.desc}</div>` : ''}</div>`;
  return btn;
}

async function loadModes() {
  try {
    const res = await fetch('/api/modes?lang=' + encodeURIComponent(fkGetUiLang()), { cache: 'no-store' });
    const list = await res.json();
    modes = {};
    list.forEach(m => { modes[m.key] = m; });

    const cw = document.getElementById('mode-buttons-werkzeuge');
    const ck = document.getElementById('mode-buttons-wissen');
    cw.innerHTML = '';
    ck.innerHTML = '';

    const werkzeuge = list.filter(m => !m.workspace);
    const wissen    = list.filter(m =>  m.workspace);

    werkzeuge.forEach(m => cw.appendChild(makeModeBtn(m)));
    // Fest eingebaute Panel-Werkzeuge (bei allen Instanzen gleich)
    const builtinTools = [
      { panel: '/scanner.html', icon: '📷', title: t('tools.scanner.title', 'QR/Barcode-Scanner'), desc: t('tools.scanner.desc', 'Code mit der Kamera scannen') },
      { panel: '/whisper.html', icon: '🎙️', title: t('tools.transcription.title', 'Transkription'), desc: t('tools.transcription.desc', 'Audio → Text per E-Mail') },
      { panel: '/formular-chat.html', icon: '📋', title: t('tools.form_chat.title', 'Formular-Chat'), desc: t('tools.form_chat.desc', 'Formular per Dialog ausfüllen & drucken') },
    ];
    if (['admin', 'manager'].includes(currentRole)) {
      builtinTools.push({ panel: '/admin-formulare.html', icon: '📋', title: t('tools.form_templates.title', 'Formular-Vorlagen'), desc: t('tools.form_templates.desc', 'Scans hochladen & Felder markieren') });
    }
    builtinTools.forEach(t => {
      const b = document.createElement('button');
      b.className = 'mode-btn';
      b.onclick = () => openToolPanel(t.panel);
      b.innerHTML = `<div class="mode-icon">${modeIconHTML(t.icon)}</div><div class="mode-nav-text"><div class="mode-nav-title">${t.title}</div><div class="mode-nav-sub">${t.desc}</div></div>`;
      cw.appendChild(b);
    });
    wissen.forEach(m => ck.appendChild(makeModeBtn(m)));

    // Kundenspezifische Extras aus public/extras/*.json
    try {
      const extRes = await fetch('/api/extras', { cache: 'no-store' });
      const extras = await extRes.json();
      // Optionales roles-Feld im Manifest (analog zum admin/manager-Filter oben bei
      // builtinTools): fehlt es, ist das Extra wie bisher für alle Rollen sichtbar.
      const visibleExtras = extras.filter(t => !t.roles || t.roles.includes(currentRole));
      const ce = document.getElementById('mode-buttons-extras');
      const tabExtras = document.getElementById('tab-extras');
      if (ce) ce.innerHTML = '';
      if (visibleExtras.length > 0 && ce && tabExtras) {
        tabExtras.style.display = '';
        visibleExtras.forEach(t => {
          const b = document.createElement('button');
          b.className = 'mode-btn' + (t.external ? ' mode-btn-web' : '');
          b.onclick = () => t.api ? openExtraPanel(t) : t.panel ? openToolPanel(t.panel) : t.url ? window.open(t.url, '_blank') : null;
          b.innerHTML = `<div class="mode-icon">${modeIconHTML(t.icon)}</div><div class="mode-nav-text"><div class="mode-nav-title">${t.title}</div><div class="mode-nav-sub">${t.desc || ''}</div></div>`;
          ce.appendChild(b);
        });
      }
    } catch (e) { /* Extras nicht verfügbar – kein Problem */ }

    const first = werkzeuge[0] || wissen[0];
    if (first) setMode(first.key);
  } catch (e) {
    console.error('Fehler beim Laden der Modes:', e);
  }
}

// ── Demo-Hinweis ──
function closeDemoModal() {
  document.getElementById('demo-modal').classList.add('hide');
}
