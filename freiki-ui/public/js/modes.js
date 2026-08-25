// ── Load modes from server ──
function switchTab(tab) {
  ['werkzeuge','wissen','extras','verlauf'].forEach(t => {
    const btn = document.getElementById('tab-' + t);
    const panel = document.getElementById('mode-buttons-' + t);
    if (btn) btn.classList.toggle('active', tab === t);
    if (panel) panel.style.display = tab === t ? '' : 'none';
  });
  if (tab === 'verlauf') renderHistoryPanel();
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
  '🛡️': 'shield',
  '📊': 'chart',
  '📰': 'newspaper',
  '🎵': 'music',
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

// Tooltip-Bubble für abgeschnittene Menü-Titel/-Untertitel (Sidebar). Delegiert
// auf document, weil die Buttons in loadModes() bei jedem Reload neu erzeugt werden.
(function initModeNavTooltip() {
  let bubble = null;
  function ensureBubble() {
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'mode-nav-tooltip';
      document.body.appendChild(bubble);
    }
    return bubble;
  }

  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('.mode-nav-title, .mode-nav-sub');
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const b = ensureBubble();
    b.textContent = el.textContent;
    b.classList.remove('visible');
    b.style.left = '0px';
    b.style.top = '0px';
    const r = el.getBoundingClientRect();
    const bw = b.offsetWidth, bh = b.offsetHeight;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - bw - 8);
    let top = r.top - bh - 8;
    let arrowDown = true;
    if (top < 8) { top = r.bottom + 8; arrowDown = false; }
    b.style.setProperty('--arrow-left', Math.min(Math.max(12, r.left + r.width / 2 - left), bw - 12) + 'px');
    b.style.left = left + 'px';
    b.style.top = top + 'px';
    b.classList.toggle('arrow-down', arrowDown);
    b.classList.toggle('arrow-up', !arrowDown);
    b.classList.add('visible');
  });

  document.addEventListener('mouseout', (e) => {
    if (!bubble || !e.target.closest('.mode-nav-title, .mode-nav-sub')) return;
    bubble.classList.remove('visible');
  });
})();

function makeModeBtn(m) {
  const btn = document.createElement('button');
  btn.className = 'mode-btn' + (m.websearch ? ' mode-btn-web' : '');
  btn.id = 'btn-' + m.key;
  btn.onclick = () => setMode(m.key);
  btn.innerHTML = `<div class="mode-icon">${modeIconHTML(m.icon, m.key)}</div><div class="mode-nav-text"><div class="mode-nav-title">${m.title}</div>${m.desc ? `<div class="mode-nav-sub">${m.desc}</div>` : ''}</div>`;
  return btn;
}

// Rendert die Wissen-Buttons gruppiert: Bereiche mit "group" (aus areas.json, z.B. AWS/AD/ID/
// Rufbereitschaft → OH) erscheinen eingerückt unter dem Button ihrer übergeordneten Kategorie.
// Bereiche ohne group (die meisten) bleiben unverändert eine flache Liste.
function renderWissenMenu(container, wissen) {
  // "group" (aus areas.json) verweist auf den unpräfixten Area-Key (z.B. "oh"), der Mode-Key
  // trägt aber das "w_"-Präfix (z.B. "w_oh") - für den Gruppen-Abgleich muss das Präfix runter.
  const bareKey = (k) => k.replace(/^w_/, '');
  // Nur Bereiche, die der Nutzer aktuell auch sieht (use_areas), zählen als "vorhandener Root" -
  // sonst würde eine Unterkategorie ohne freigeschalteten Eltern-Bereich (z.B. nur AWS, nicht OH)
  // beim fehlenden Root stillschweigend verschwinden, obwohl der Server sie korrekt freigegeben hat.
  const presentKeys = new Set(wissen.map(m => bareKey(m.key)));
  const rendered = new Set();
  wissen.forEach(m => {
    if (rendered.has(m.key)) return;
    if (m.group && !presentKeys.has(m.group)) {
      container.appendChild(makeModeBtn(m));
      rendered.add(m.key);
      return;
    }
    if (m.group) return; // wird gleich beim zugehörigen Root mitgerendert
    const btn = makeModeBtn(m);
    rendered.add(m.key);
    const children = wissen.filter(x => x.group === bareKey(m.key));
    if (children.length) {
      btn.classList.add('mode-btn-group-head');
      container.appendChild(btn);
      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'mode-group-children';
      children.forEach(child => {
        childrenWrap.appendChild(makeModeBtn(child));
        rendered.add(child.key);
      });
      container.appendChild(childrenWrap);
    } else {
      container.appendChild(btn);
    }
  });
}

async function loadModes() {
  try {
    const res = await fetch('/api/modes?lang=' + encodeURIComponent(fkGetUiLang()), { cache: 'no-store' });
    const list = await res.json();
    State.modes = {};
    list.forEach(m => { State.modes[m.key] = m; });

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
    if (['admin', 'manager'].includes(State.currentRole)) {
      builtinTools.push({ panel: '/admin-formulare.html', icon: '📋', title: t('tools.form_templates.title', 'Formular-Vorlagen'), desc: t('tools.form_templates.desc', 'Scans hochladen & Felder markieren') });
    }
    // PPT-Vorlagen bewusst NICHT hier (Werkzeuge-Menü) - liegt im Admin-Panel
    // (admin-dashboard.html), damit es nicht wie ein reguläres Werkzeug für alle
    // Rollen im selben Menü auftaucht.
    builtinTools.forEach(t => {
      const b = document.createElement('button');
      b.className = 'mode-btn';
      b.onclick = () => openToolPanel(t.panel);
      b.innerHTML = `<div class="mode-icon">${modeIconHTML(t.icon)}</div><div class="mode-nav-text"><div class="mode-nav-title">${t.title}</div><div class="mode-nav-sub">${t.desc}</div></div>`;
      cw.appendChild(b);
    });
    renderWissenMenu(ck, wissen);

    // Kundenspezifische Extras aus public/extras/*.json
    try {
      const extRes = await fetch('/api/extras', { cache: 'no-store' });
      const extras = await extRes.json();
      // Optionales roles-Feld im Manifest (analog zum admin/manager-Filter oben bei
      // builtinTools): fehlt es, ist das Extra wie bisher für alle Rollen sichtbar.
      const visibleExtras = extras.filter(t => !t.roles || t.roles.includes(State.currentRole));
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

    // Beim Laden zuletzt offene Unterhaltung wiederherstellen (Reload-Schutz), sonst
    // normalen Standard-Modus starten - siehe chat-history.js für das History-Modell.
    const resumable = getResumableConversation();
    if (resumable && State.modes[resumable.mode]) {
      loadConversation(resumable.id);
    } else {
      const first = werkzeuge[0] || wissen[0];
      if (first) setMode(first.key);
    }
  } catch (e) {
    console.error('Fehler beim Laden der Modes:', e);
  }
}

// ── Demo-Hinweis ──
function closeDemoModal() {
  document.getElementById('demo-modal').classList.add('hide');
}
