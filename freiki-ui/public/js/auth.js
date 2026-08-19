// ── Login ──
function applyRoleIndicator(role) {
  const avatar = document.getElementById('user-avatar');
  if (!avatar) return;
  const isHighRisk = role === 'high_risk';
  avatar.classList.toggle('role-high_risk', isHighRisk);
  avatar.title = isHighRisk ? t('js.bgt_access_title', 'BGT-Zugang (Berufsgeheimnisträger) – besondere Sorgfaltspflicht bei sensiblen Daten') : '';
}

// DMS-Button (Paperless-Admin-Oberfläche) bekommt seine URL erst nach bestätigtem
// Admin-Login vom Server - PAPERLESS_ADMIN_URL zeigt oft auf einen internen
// Docker-Hostnamen und darf nicht im öffentlich ausgelieferten HTML stehen.
async function loadDmsLink() {
  const btn = document.getElementById('dms-btn');
  if (!btn) return;
  try {
    const r = await fetch('/api/admin/service-links');
    if (!r.ok) return;
    const { links } = await r.json();
    const paperless = links.find(l => l.key === 'paperless');
    if (paperless) btn.href = paperless.url;
  } catch {}
}

function completeLogin(data, username) {
  State.authToken = true;
  const role = data.role || 'default';
  sessionStorage.setItem('freiki_user', username);
  sessionStorage.setItem('freiki_role', role);
  State.currentUsername = username;
  State.currentRole = role;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('disclaimer-banner').style.display = 'flex';
  document.getElementById('user-name').textContent = username;
  document.getElementById('user-avatar').textContent = username[0].toUpperCase();
  document.querySelectorAll('.kb-admin-link').forEach(el => {
    el.style.display = ['admin', 'manager'].includes(role) ? '' : 'none';
  });
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = role === 'admin' ? '' : 'none');
  document.querySelectorAll('.bgt-2fa-only').forEach(el => el.style.display = ['admin', 'high_risk'].includes(role) ? '' : 'none');
  if (role === 'admin') loadDmsLink();
  applyRoleIndicator(role);
  const tcBtn = document.getElementById('teamchat-btn');
  if (tcBtn && tcBtn.dataset.url) tcBtn.style.display = '';
  loadModes();
  loadTips();
  if (data.mustCompleteTraining) startTraining(role, !!data.mustSetup2fa);
  else if (data.mustSetup2fa) startSetup2FA();
  else if (role === 'high_risk') showHighRiskModal();
}

// ── Pflichtschulung beim ersten Login ──
let trainingTrack = 'default';
let trainingSlide = 1;
let trainingTotal = 8;
let trainingRole = 'default';
let trainingThenSetup2fa = false;

function startTraining(role, thenSetup2fa) {
  trainingRole = role;
  trainingThenSetup2fa = thenSetup2fa;
  trainingTrack = role === 'high_risk' ? 'bgt' : 'default';
  trainingTotal = trainingTrack === 'bgt' ? 9 : 8;
  trainingSlide = 1;
  renderTrainingSlide();
  document.getElementById('training-modal').classList.remove('hide');
}

function renderTrainingSlide() {
  document.getElementById('training-slide-img').src = `/training/${trainingTrack}/slide-${trainingSlide}.jpg`;
  document.getElementById('training-progress').textContent = t('training.progress', 'Folie {i} / {n}').replace('{i}', trainingSlide).replace('{n}', trainingTotal);
  document.getElementById('training-prev-btn').style.visibility = trainingSlide === 1 ? 'hidden' : 'visible';
  document.getElementById('training-next-btn').textContent = trainingSlide === trainingTotal ? t('training.finish', 'Abschließen') : t('training.next', 'Weiter');
}

function prevTrainingSlide() {
  if (trainingSlide > 1) { trainingSlide--; renderTrainingSlide(); }
}

async function nextTrainingSlide() {
  if (trainingSlide < trainingTotal) { trainingSlide++; renderTrainingSlide(); return; }
  try {
    await fetch('/api/training/complete', { method: 'POST' });
  } catch (e) { /* Abschluss beim nächsten Login erneut versucht */ }
  document.getElementById('training-modal').classList.add('hide');
  if (trainingThenSetup2fa) startSetup2FA();
  else if (trainingRole === 'high_risk') showHighRiskModal();
}

async function login() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.requires2fa) {
      State.pending2faToken = data.pendingToken;
      State.pendingUsername = username;
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('twofa-form').style.display = 'flex';
      document.getElementById('twofa-code').focus();
      const passkeyBtn = document.getElementById('passkey-login-btn');
      if (data.hasPasskeys && window.PublicKeyCredential
          && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
        passkeyBtn.style.display = '';
      } else {
        passkeyBtn.style.display = 'none';
      }
    } else if (res.ok && data.role) {
      completeLogin(data, username);
    } else {
      errorEl.textContent = data.error || t('login.error_invalid', 'Ungültige Anmeldedaten');
      errorEl.style.display = 'block';
    }
  } catch (e) {
    errorEl.textContent = t('common.connection_error', 'Verbindungsfehler.');
    errorEl.style.display = 'block';
  }
}

async function verifyTwoFactor() {
  const code = document.getElementById('twofa-code').value.trim();
  const errorEl = document.getElementById('twofa-error');
  errorEl.style.display = 'none';
  try {
    const res = await fetch('/api/login/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken: State.pending2faToken, code })
    });
    const data = await res.json();
    if (res.ok && data.role) {
      completeLogin(data, State.pendingUsername);
    } else {
      errorEl.textContent = data.error || t('common.invalid_code', 'Ungültiger Code');
      errorEl.style.display = 'block';
    }
  } catch (e) {
    errorEl.textContent = t('common.connection_error', 'Verbindungsfehler.');
    errorEl.style.display = 'block';
  }
}

// ── 2FA-Pflicht-Setup (admin/high_risk) ──
async function populateSetupModal(endpoint, body) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const data = await res.json();
    if (!data.secret) return { error: data.error || t('js.setup_start_failed', 'Fehler beim Starten der Einrichtung.') };
    document.getElementById('setup2fa-qr').src = data.qrCode;
    document.getElementById('setup2fa-secret').textContent = data.secret;
    document.getElementById('setup2fa-step-qr').style.display = '';
    document.getElementById('setup2fa-step-codes').style.display = 'none';
    document.getElementById('setup2fa-modal').classList.remove('hide');
    return { ok: true };
  } catch (e) { return { error: t('common.connection_error', 'Verbindungsfehler.') }; }
}

async function startSetup2FA() {
  // Pflicht-Setup nach Login: Fehler werden hier bewusst nicht angezeigt, Setup kann beim
  // nächsten Login erneut versucht werden.
  await populateSetupModal('/api/2fa/setup', {});
}

// ── Selbstbedienung: 2FA neu einrichten (z. B. bei Gerätewechsel) ──
async function loginWithPasskey() {
  const errorEl = document.getElementById('twofa-error');
  errorEl.style.display = 'none';
  try {
    const optRes = await fetch('/api/webauthn/login/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken: State.pending2faToken })
    });
    const options = await optRes.json();
    if (!optRes.ok) throw new Error(options.error || 'Fehler');

    const response = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });

    const res = await fetch('/api/webauthn/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken: State.pending2faToken, response })
    });
    const data = await res.json();
    if (res.ok && data.role) {
      completeLogin(data, State.pendingUsername);
    } else {
      errorEl.textContent = data.error || t('js.passkey_login_failed', 'Passkey-Anmeldung fehlgeschlagen');
      errorEl.style.display = 'block';
    }
  } catch (e) {
    // Nutzer bricht den Face-ID/Touch-ID-Dialog ab (NotAllowedError) - kein hartes Fehlerbild,
    // einfach zurueck zur Code-Eingabe.
    if (e.name !== 'NotAllowedError') {
      errorEl.textContent = t('js.passkey_login_failed_period', 'Passkey-Anmeldung fehlgeschlagen.');
      errorEl.style.display = 'block';
    }
  }
}

// ── Sicherheit: TOTP-Reinit + Passkey-Verwaltung ──
function openSecurityModal() {
  document.getElementById('security-modal-error').style.display = 'none';
  document.getElementById('security-modal').classList.add('show');
  loadPasskeyList();
}
function closeSecurityModal() {
  document.getElementById('security-modal').classList.remove('show');
}

function passkeyLabel(p) {
  const date = p.created_at ? new Date(p.created_at).toLocaleDateString('de-DE') : '';
  return (p.nickname || p.device_type || t('security.passkey_word', 'Passkey')) + (date ? ' \u00b7 ' + date : '');
}

async function loadPasskeyList() {
  const listEl = document.getElementById('passkey-list');
  listEl.textContent = t('common.loading_dots', 'Lade...');
  try {
    const res = await fetch('/api/webauthn/credentials');
    const data = await res.json();
    const list = data.passkeys || [];
    if (!list.length) { listEl.textContent = t('security.no_passkey_yet', 'Noch kein Passkey eingerichtet.'); return; }
    listEl.innerHTML = '';
    list.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0';
      const label = document.createElement('span');
      label.textContent = passkeyLabel(p);
      const del = document.createElement('button');
      del.className = 'modal-cancel';
      del.style.cssText = 'padding:2px 10px;font-size:12px';
      del.textContent = t('common.delete', 'Löschen');
      del.onclick = () => deletePasskey(p.id);
      row.append(label, del);
      listEl.appendChild(row);
    });
  } catch (e) { listEl.textContent = t('common.load_error', 'Fehler beim Laden.'); }
}

async function addPasskey() {
  const errEl = document.getElementById('security-modal-error');
  errEl.style.display = 'none';
  try {
    const optRes = await fetch('/api/webauthn/register/options', { method: 'POST' });
    const options = await optRes.json();
    if (!optRes.ok) throw new Error(options.error || 'Fehler');

    const response = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON: options });

    const nickname = (navigator.userAgentData?.platform || navigator.platform || '') || undefined;
    const verifyRes = await fetch('/api/webauthn/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response, nickname })
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || verifyData.error) throw new Error(verifyData.error || 'Fehler');
    loadPasskeyList();
  } catch (e) {
    if (e.name !== 'NotAllowedError') {
      errEl.textContent = t('security.passkey_register_failed', 'Passkey konnte nicht registriert werden.');
      errEl.style.display = 'block';
    }
  }
}

async function deletePasskey(id) {
  if (!confirm(t('security.confirm_delete_passkey', 'Diesen Passkey löschen?'))) return;
  try {
    await fetch('/api/webauthn/credentials/' + id, { method: 'DELETE' });
    loadPasskeyList();
  } catch (e) { /* Liste bleibt beim naechsten Oeffnen aktuell */ }
}

// ── Selbstbedienung: 2FA neu einrichten (z. B. bei Gerätewechsel) ──
function openReinit2FA() {
  document.getElementById('reinit2fa-password').value = '';
  document.getElementById('reinit2fa-error').style.display = 'none';
  document.getElementById('reinit2fa-modal').classList.add('show');
  setTimeout(() => document.getElementById('reinit2fa-password').focus(), 50);
}
function closeReinit2FA() {
  document.getElementById('reinit2fa-modal').classList.remove('show');
}
async function submitReinit2FA() {
  const pw = document.getElementById('reinit2fa-password').value;
  const errEl = document.getElementById('reinit2fa-error');
  const btn = document.getElementById('reinit2fa-submit-btn');
  errEl.style.display = 'none';
  if (!pw) { errEl.textContent = t('common.enter_password', 'Bitte Passwort eingeben.'); errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = '...';
  const result = await populateSetupModal('/api/2fa/reinit', { currentPassword: pw });
  btn.disabled = false; btn.textContent = t('common.next', 'Weiter');
  if (result.error) { errEl.textContent = result.error; errEl.style.display = 'block'; return; }
  closeReinit2FA();
}

async function confirmSetup2FA() {
  const code = document.getElementById('setup2fa-code').value.trim();
  const errorEl = document.getElementById('setup2fa-error');
  errorEl.style.display = 'none';
  try {
    const res = await fetch('/api/2fa/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('setup2fa-backup-codes').textContent = data.backupCodes.join('\n');
      document.getElementById('setup2fa-step-qr').style.display = 'none';
      document.getElementById('setup2fa-step-codes').style.display = '';
    } else {
      errorEl.textContent = data.error || t('common.invalid_code', 'Ungültiger Code');
      errorEl.style.display = 'block';
    }
  } catch (e) {
    errorEl.textContent = t('common.connection_error', 'Verbindungsfehler.');
    errorEl.style.display = 'block';
  }
}

function closeSetup2FAModal() {
  document.getElementById('setup2fa-modal').classList.add('hide');
  if (State.currentRole === 'high_risk') showHighRiskModal();
}

// ── Hinweis für BGT-Nutzer (Berufsgeheimnisträger) ──
function showHighRiskModal() {
  document.getElementById('highrisk-modal').classList.remove('hide');
}
function closeHighRiskModal() {
  document.getElementById('highrisk-modal').classList.add('hide');
}

function logout() {
  if (!confirm(t('sidebar.confirm_logout', 'Wirklich abmelden?'))) return;
  State.chatHistory = [];
  forceLogout();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || document.getElementById('login-screen').style.display === 'none') return;
  if (document.getElementById('twofa-form').style.display !== 'none') verifyTwoFactor();
  else login();
});
