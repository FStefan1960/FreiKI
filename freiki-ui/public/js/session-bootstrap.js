if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

function forceLogout() {
  authToken = null;
  currentRole = '';
  fetch('/api/logout', { method: 'POST' }).catch(() => {});
  sessionStorage.removeItem('freiki_user');
  sessionStorage.removeItem('freiki_role');
  localStorage.removeItem('freiki_areas'); // Altlast frueherer Version - fuer bestehende Browser weiter aufraeumen
  sessionStorage.removeItem('freiki_tip_shown');
  document.getElementById('login-screen').style.display = 'flex';
  const app = document.getElementById('app');
  if (app) app.style.display = 'none';
  const banner = document.getElementById('disclaimer-banner');
  if (banner) banner.style.display = 'none';
  const pw = document.getElementById('password');
  if (pw) pw.value = '';
  const twofaCode = document.getElementById('twofa-code');
  if (twofaCode) twofaCode.value = '';
  document.getElementById('twofa-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'flex';
  pending2faToken = null; pendingUsername = null;
}

// Session beim Laden prüfen: das Session-Cookie ist HttpOnly (für JS nicht lesbar), daher
// entscheidet ein Server-Rundruf über /api/me statt eines lokal gespeicherten Tokens.
document.addEventListener('DOMContentLoaded', async () => {
  const storedRole = sessionStorage.getItem('freiki_role') || 'default';
  if (['admin', 'manager'].includes(storedRole)) {
    document.querySelectorAll('.kb-admin-link').forEach(el => el.style.display = '');
  }
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = storedRole === 'admin' ? '' : 'none');
  document.querySelectorAll('.bgt-2fa-only').forEach(el => el.style.display = ['admin', 'high_risk'].includes(storedRole) ? '' : 'none');

  // Mic-Button nur zeigen, wenn der Browser Aufnahme tatsächlich unterstützt (alte Browser,
  // Nicht-HTTPS-Kontexte oder deaktivierte Mikrofon-APIs liefern sonst einen toten Button).
  if (window.MediaRecorder && navigator.mediaDevices?.getUserMedia) {
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) { micBtn.style.display = ''; micBtn.innerHTML = MIC_ICON; }
  }

  let me = null;
  try {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (r.ok) me = await r.json();
  } catch {}

  if (me) {
    authToken = true;
    const username = me.username || sessionStorage.getItem('freiki_user') || '';
    currentUsername = username;
    currentRole = me.role || storedRole;
    sessionStorage.setItem('freiki_user', username);
    sessionStorage.setItem('freiki_role', currentRole);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    const banner = document.getElementById('disclaimer-banner');
    if (banner) banner.style.display = 'flex';
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = username;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.textContent = username[0]?.toUpperCase() || '?';
    applyRoleIndicator(me.role || storedRole);
    const tcBtn = document.getElementById('teamchat-btn');
    if (tcBtn && tcBtn.dataset.url) tcBtn.style.display = '';
    enterToSend = me.enter_to_send !== false;
    if (window.FK_I18N_READY) await window.FK_I18N_READY;
    updateEnterToSendUI();
    loadModes();
    loadTips();
  } else if (sessionStorage.getItem('freiki_user')) {
    forceLogout();
  }
  // Mitternachts-Watchdog
  const now = new Date();
  const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  setTimeout(() => { if (authToken) forceLogout(); }, msUntilMidnight);
});
function updateEnterToSendUI() {
  const btn = document.getElementById('enter-to-send-toggle');
  const label = document.getElementById('enter-to-send-label');
  if (btn) btn.setAttribute('aria-pressed', String(enterToSend));
  if (label) {
    label.textContent = enterToSend
      ? window.t('account_menu.enter_to_send_on', 'Enter-Verhalten: Senden')
      : window.t('account_menu.enter_to_send_off', 'Enter-Verhalten: Absatz');
  }
  const input = document.getElementById('message-input');
  if (input) {
    input.placeholder = enterToSend
      ? window.t('input.message_placeholder', 'Nachricht eingeben oder Datei hierher ziehen... (Shift+Enter für einen Absatz, Enter zum Senden)')
      : window.t('input.message_placeholder_ctrl', 'Nachricht eingeben oder Datei hierher ziehen... (Enter für einen Absatz, Strg+Enter zum Senden)');
  }
}

// Optimistisch umschalten (sofortiges UI-Feedback), bei Server-Fehler zurückrollen -
// analog zu anderen Selbst-Service-Änderungen (Sprache) ohne eigenes Modal, da nur ein Bool.
async function toggleEnterToSend() {
  const next = !enterToSend;
  enterToSend = next;
  updateEnterToSendUI();
  try {
    const res = await fetch('/api/change-enter-to-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enterToSend: next })
    });
    if (!res.ok) throw new Error('request failed');
  } catch (e) {
    enterToSend = !next;
    updateEnterToSendUI();
  }
}

// ── Tip of the day ──
let tipList = [];
let lastTipIndex = -1;

async function loadTips() {
  if (sessionStorage.getItem('freiki_tip_shown')) return;
  try {
    const r = await fetch('/api/tips');
    const d = await r.json();
    tipList = d.tips || [];
    if (tipList.length) {
      showNextTip();
      setTimeout(() => { document.getElementById('tip-modal').classList.add('show'); }, 600);
      sessionStorage.setItem('freiki_tip_shown', '1');
    }
  } catch (e) { /* Tipps optional */ }
}

function showNextTip() {
  if (!tipList.length) return;
  let i = Math.floor(Math.random() * tipList.length);
  if (tipList.length > 1 && i === lastTipIndex) i = (i + 1) % tipList.length;
  lastTipIndex = i;
  document.getElementById('tip-text').textContent = tipList[i];
}

function closeTipModal() {
  document.getElementById('tip-modal').classList.remove('show');
}

