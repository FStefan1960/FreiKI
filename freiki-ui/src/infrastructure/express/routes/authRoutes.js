const express = require('express');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const AuthService = require('../../../core/auth/AuthService');
const users = require('../../../core/auth/UserRepository');
const { loginLimiter } = require('../middlewares/security');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

const router = express.Router();

router.post('/api/login', loginLimiter, asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  try {
    const result = await AuthService.login(username, password);
    if (result.error) {
      console.warn(`Login fehlgeschlagen: "${username}" von ${req.ip}`);
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
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
    res.json(result);
  } catch (e) {
    console.error('verify-2fa error:', e.message);
    res.status(500).json({ error: 'Verbindungsfehler' });
  }
}));

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
  if (!newPassword || newPassword.length < 6)
    return res.status(400).json({ error: 'Neues Passwort muss mindestens 6 Zeichen haben' });
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
