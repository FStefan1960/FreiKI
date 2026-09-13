const express = require('express');
const AuthService = require('../../../../core/auth/AuthService');
const users = require('../../../../core/auth/UserRepository');
const auditLog = require('../../../../core/audit/AdminAuditRepository');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');

const router = express.Router();

router.get('/api/admin/users', asyncHandler(async (req, res) => {
  try {
    res.json({ users: await users.listAll() });
  } catch (e) { console.error('admin/users GET:', e.message); res.status(500).json({ error: 'Datenbankfehler' }); }
}));

router.post('/api/admin/users', asyncHandler(async (req, res) => {
  const { username, role, use, manage, first_name, last_name, dienststelle, funktion, telefon, email, language, use_paperless, use_metacom, password } = req.body || {};
  if (!users.isValidUsername(username)) return res.status(400).json({ error: 'Benutzername: 3–64 Zeichen, nur Buchstaben, Zahlen und ._-' });
  if (email && !users.isValidEmail(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  if (password && password.length < 8) return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  try {
    const result = await AuthService.createUser({ username, role, use, manage, first_name, last_name, dienststelle, funktion, telefon, email, language, use_paperless, use_metacom, password });
    auditLog.log(req.admin, 'user.create', { id: result.id, username }, { role: role || 'default', use, manage, use_paperless: !!use_paperless, use_metacom: !!use_metacom });
    res.json({ ok: true, id: result.id, mailSent: result.mailSent });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Benutzername existiert bereits' });
    console.error('admin/users POST:', e.message); res.status(500).json({ error: 'Anlegen fehlgeschlagen' });
  }
}));

router.post('/api/admin/users/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Ungültige Nutzer-ID' });
  const { role, use, manage, suspended, first_name, last_name, dienststelle, funktion, telefon, email, language, use_paperless, use_metacom } = req.body || {};
  if (email && !users.isValidEmail(email)) return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  // Selbstschutz: eigenes Konto nicht sperren / nicht zu Nicht-Admin herabstufen
  if (id === req.admin.uid && (suspended === true || (role && role !== 'admin')))
    return res.status(400).json({ error: 'Das eigene Admin-Konto kann nicht gesperrt oder herabgestuft werden.' });
  try {
    const before = await users.findById(id);
    const ok = await users.update(id, { role, use, manage, suspended, first_name, last_name, dienststelle, funktion, telefon, email, language, use_paperless, use_metacom });
    if (!ok) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    if (before) {
      const changes = {};
      if (role !== undefined && role !== before.role) changes.role = { from: before.role, to: role };
      if (suspended !== undefined && !!suspended !== !!before.suspended) changes.suspended = { from: !!before.suspended, to: !!suspended };
      const newUse = users.cleanAreas(use);
      if (use !== undefined && JSON.stringify(newUse) !== JSON.stringify(before.use_areas || [])) changes.use_areas = { from: before.use_areas || [], to: newUse };
      const newManage = users.cleanAreas(manage);
      if (manage !== undefined && JSON.stringify(newManage) !== JSON.stringify(before.manage_areas || [])) changes.manage_areas = { from: before.manage_areas || [], to: newManage };
      if (Object.keys(changes).length) auditLog.log(req.admin, 'user.update', { id, username: before.username }, changes);
    }
    res.json({ ok: true });
  } catch (e) { console.error('admin/users update:', e.message); res.status(500).json({ error: 'Speichern fehlgeschlagen' }); }
}));

router.post('/api/admin/users/:id/password', asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  const id = parseInt(req.params.id, 10);
  try {
    const ok = await AuthService.resetPassword(id, password);
    if (!ok) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    const target = await users.findProfileById(id);
    auditLog.log(req.admin, 'user.password_reset', { id, username: target?.username });
    res.json({ ok: true });
  } catch (e) { console.error('admin/users password:', e.message); res.status(500).json({ error: 'Fehlgeschlagen' }); }
}));

router.post('/api/admin/users/:id/resend-welcome', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await AuthService.resendWelcome(id);
    if (result.error === 'not-found') return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    if (result.error === 'no-email') return res.status(400).json({ error: 'Keine E-Mail-Adresse hinterlegt' });
    const target = await users.findProfileById(id);
    auditLog.log(req.admin, 'user.resend_welcome', { id, username: target?.username });
    res.json({ ok: true });
  } catch (e) { console.error('resend-welcome:', e.message); res.status(500).json({ error: 'Fehlgeschlagen' }); }
}));

router.post('/api/admin/users/:id/reset-2fa', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const target = await users.findById(id);
    if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    await AuthService.disable2FA(id);
    auditLog.log(req.admin, 'user.2fa_reset', { id, username: target.username });
    res.json({ ok: true });
  } catch (e) { console.error('reset-2fa:', e.message); res.status(500).json({ error: 'Fehlgeschlagen' }); }
}));

router.post('/api/admin/users/:id/reset-passkeys', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const target = await users.findById(id);
    if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    await AuthService.resetPasskeys(id);
    auditLog.log(req.admin, 'user.passkeys_reset', { id, username: target.username });
    res.json({ ok: true });
  } catch (e) { console.error('reset-passkeys:', e.message); res.status(500).json({ error: 'Fehlgeschlagen' }); }
}));

router.post('/api/admin/users/:id/reset-training', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const target = await users.findById(id);
    if (!target) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    await users.resetTraining(id);
    auditLog.log(req.admin, 'user.training_reset', { id, username: target.username });
    res.json({ ok: true });
  } catch (e) { console.error('reset-training:', e.message); res.status(500).json({ error: 'Fehlgeschlagen' }); }
}));

router.delete('/api/admin/users/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.admin.uid) return res.status(400).json({ error: 'Das eigene Konto kann nicht gelöscht werden.' });
  try {
    const target = await users.findById(id);
    const ok = await users.remove(id);
    if (!ok) return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    auditLog.log(req.admin, 'user.delete', { id, username: target?.username }, { role: target?.role });
    res.json({ ok: true });
  } catch (e) { console.error('admin/users DELETE:', e.message); res.status(500).json({ error: 'Löschen fehlgeschlagen' }); }
}));

// ── Registrierungsanfragen (öffentliches Anmeldeformular, siehe registrationRoutes.js) ──
router.get('/api/admin/registrations', asyncHandler(async (req, res) => {
  try {
    res.json({ registrations: await users.listPending() });
  } catch (e) { console.error('admin/registrations GET:', e.message); res.status(500).json({ error: 'Datenbankfehler' }); }
}));

router.post('/api/admin/registrations/:id/approve', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role, use, manage, use_paperless, use_metacom } = req.body || {};
  try {
    const before = await users.findById(id);
    const result = await AuthService.approveRegistration(id, { role, use, manage, use_paperless, use_metacom });
    if (result.error === 'not-found') return res.status(404).json({ error: 'Registrierung nicht gefunden' });
    auditLog.log(req.admin, 'user.registration_approved', { id, username: before?.username }, { role: role || 'default', use, manage, use_paperless: !!use_paperless, use_metacom: !!use_metacom });
    res.json({ ok: true, mailSent: result.mailSent });
  } catch (e) { console.error('registrations approve:', e.message); res.status(500).json({ error: 'Freischalten fehlgeschlagen' }); }
}));

router.post('/api/admin/registrations/:id/reject', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const result = await AuthService.rejectRegistration(id);
    if (result.error === 'not-found') return res.status(404).json({ error: 'Registrierung nicht gefunden' });
    auditLog.log(req.admin, 'user.registration_rejected', { id, username: result.username });
    res.json({ ok: true });
  } catch (e) { console.error('registrations reject:', e.message); res.status(500).json({ error: 'Ablehnen fehlgeschlagen' }); }
}));

module.exports = router;
