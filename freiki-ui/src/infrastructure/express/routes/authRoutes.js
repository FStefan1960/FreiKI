const express = require('express');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const AuthService = require('../../../core/auth/AuthService');
const users = require('../../../core/auth/UserRepository');
const { loginLimiter } = require('../middlewares/security');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');
const { secondsUntilMidnightBerlin } = require('../../../shared/utils/text');
const { config } = require('../../../shared/config');

const router = express.Router();
router.use(express.json({ limit: '100kb' }));

// JWT liegt als HttpOnly-Cookie beim Client, nie im JS-erreichbaren localStorage (XSS-Schutz) -
// das Frontend liest/speichert data.token bewusst nicht mehr. Der Login-Response behaelt token
// trotzdem im Body (zusaetzlich zum Cookie), weil serverseitige Automation (n8n-Workflows,
// Skripte ohne Cookie-Jar) ihn dort abgreift und als Bearer-Header weiterreicht - das ist kein
// XSS-Risiko, da dort kein Browser/JS im Spiel ist (siehe getSession()-Kommentar).
// secure nur wenn APP_URL auf https laeuft (Produktion hinter Caddy) - im lokalen http-Dev
// wuerde der Browser eine secure-Cookie sonst gar nicht erst speichern.
// sameSite:'lax' statt 'strict', da /oauth/authorize (oidcRoutes.js) einen eigenstaendigen
// Redirect-Login-Flow fuer Mattermost nutzt und von Lax nicht betroffen ist.
function setSessionCookie(res, token) {
  res.cookie('freiki_session', token, {
    httpOnly: true,
    secure: config.APP_URL.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: secondsUntilMidnightBerlin() * 1000,
  });
}

router.post('/api/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  try {
    const result = await AuthService.login(username, password);
    if (result.error) {
      console.warn(`Login fehlgeschlagen: "${username}" von ${req.ip}`);
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    if (result.token) setSessionCookie(res, result.token);
    res.json(result);
  } catch (e) {
    console.error('Login error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
}));

router.post('/api/login/verify-2fa', loginLimiter, asyncHandler(async (req, res) => {
  const { pendingToken, code } = req.body || {};
  if (!pendingToken || !code) return res.status(400).json({ error: 'Code erforderlich' });
  try {
    const result = await AuthService.verifyTwoFactor(pendingToken, code);
    if (result.error) {
      console.warn(`2FA-Verifizierung fehlgeschlagen von ${req.ip}`);
      return res.status(401).json({ error: 'Ungültiger Code' });
    }
    setSessionCookie(res, result.token);
    res.json(result);
  } catch (e) {
    console.error('verify-2fa error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
}));

// Passkey als Alternative zum TOTP-Code im 2. Login-Schritt (gleicher Pending-Token). Bewusst
// OHNE loginLimiter: eine WebAuthn-Antwort ist eine kryptografische Signatur des physischen
// Authenticators, nicht erratbar wie ein Passwort/TOTP-Code - die strenge Brute-Force-Bremse
// (5/15min) passt hier nicht und hat beim Testen auf mehreren Geräten (geteiltes Budget mit
// Passwort+TOTP) zu Fehlsperren geführt. Der globale apiLimiter (100/15min) greift weiterhin.
router.post('/api/webauthn/login/options', asyncHandler(async (req, res) => {
  const { pendingToken } = req.body || {};
  if (!pendingToken) return res.status(400).json({ error: 'Ungültige Anfrage' });
  const result = await AuthService.getPasskeyLoginOptions(pendingToken);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
}));

router.post('/api/webauthn/login/verify', asyncHandler(async (req, res) => {
  const { pendingToken, response } = req.body || {};
  if (!pendingToken || !response) return res.status(400).json({ error: 'Ungültige Anfrage' });
  try {
    const result = await AuthService.verifyPasskeyLogin(pendingToken, response);
    if (result.error) {
      console.warn(`Passkey-Login fehlgeschlagen von ${req.ip}: ${result.error}`);
      return res.status(401).json({ error: 'Passkey-Anmeldung fehlgeschlagen' });
    }
    setSessionCookie(res, result.token);
    res.json(result);
  } catch (e) {
    console.error('webauthn/login/verify error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
}));

router.post('/api/logout', (req, res) => {
  res.clearCookie('freiki_session', { path: '/' });
  res.json({ ok: true });
});

router.post('/api/2fa/setup', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const result = await AuthService.start2FASetup(s.uid);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) { console.error('2fa/setup:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

router.post('/api/2fa/confirm', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code erforderlich' });
  try {
    const result = await AuthService.confirm2FASetup(s.uid, code);
    if (result.error) return res.status(400).json({ error: result.error === 'invalid-code' ? 'Ungültiger Code' : 'Kein Setup gestartet' });
    if (result.token) setSessionCookie(res, result.token);
    res.json(result);
  } catch (e) { console.error('2fa/confirm:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

router.post('/api/2fa/reinit', loginLimiter, asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { currentPassword } = req.body || {};
  if (!currentPassword) return res.status(400).json({ error: 'Aktuelles Passwort erforderlich' });
  try {
    const result = await AuthService.requestReinit2FA(s.uid, currentPassword);
    if (result.error === 'wrong-current') return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) { console.error('2fa/reinit:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

router.post('/api/change-password', asyncHandler(async (req, res) => {
  const s = getSession(req);
  const { currentPassword, newPassword } = req.body || {};
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (!newPassword || newPassword.length < 10)
    return res.status(400).json({ error: 'Neues Passwort muss mindestens 10 Zeichen haben' });
  try {
    const result = await AuthService.changePassword(s.uid, currentPassword, newPassword);
    if (result.error === 'no-session') return res.status(401).json({ error: 'Sitzung ungültig – bitte neu anmelden' });
    if (result.error === 'wrong-current') return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
    res.json({ success: true });
  } catch (e) {
    console.error('change-password error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
}));

router.post('/api/change-language', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { language } = req.body || {};
  if (!language || !String(language).trim()) return res.status(400).json({ error: 'Sprache erforderlich' });
  try {
    const result = await AuthService.changeLanguage(s.uid, language);
    if (result.error === 'invalid-language') return res.status(400).json({ error: 'Sprache nicht erkannt – bitte anders formulieren' });
    res.json(result);
  } catch (e) {
    console.error('change-language error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
}));

// Passkey-Selbstverwaltung (nur für eingeloggte Nutzer - Registrieren/Auflisten/Löschen).
router.post('/api/webauthn/register/options', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const result = await AuthService.getPasskeyRegistrationOptions(s.uid);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) { console.error('webauthn/register/options:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

router.post('/api/webauthn/register/verify', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { response, nickname } = req.body || {};
  if (!response) return res.status(400).json({ error: 'Ungültige Anfrage' });
  try {
    const result = await AuthService.confirmPasskeyRegistration(s.uid, response, nickname);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) { console.error('webauthn/register/verify:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

router.get('/api/webauthn/credentials', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const list = await AuthService.listPasskeys(s.uid);
    res.json({ passkeys: list });
  } catch (e) { console.error('webauthn/credentials:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

router.delete('/api/webauthn/credentials/:id', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const removed = await AuthService.removePasskey(s.uid, parseInt(req.params.id, 10));
    if (!removed) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ ok: true });
  } catch (e) { console.error('webauthn/credentials delete:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

router.post('/api/training/complete', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const result = await AuthService.completeTraining(s.uid);
    res.json(result);
  } catch (e) { console.error('training/complete:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

router.post('/api/change-enter-to-send', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { enterToSend } = req.body || {};
  try {
    const result = await AuthService.changeEnterToSend(s.uid, !!enterToSend);
    res.json(result);
  } catch (e) {
    console.error('change-enter-to-send error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
}));

router.get('/api/me', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Nicht angemeldet' });
  try {
    const profile = await users.findProfileById(s.uid);
    if (!profile) return res.status(404).json({ error: 'Unbekannt' });
    res.json(profile);
  } catch (e) { console.error('api/me:', e.message); res.status(500).json({ error: 'Fehler' }); }
}));

module.exports = router;
