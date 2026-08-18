const express = require('express');
const users = require('../../../core/auth/UserRepository');
const AuthService = require('../../../core/auth/AuthService');
const { registrationLimiter } = require('../middlewares/security');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

const router = express.Router();
router.use(express.json({ limit: '64kb' }));

// Öffentliches Anmeldeformular (public/register.html) - bewusst OHNE Session-Prüfung,
// legt einen gesperrten, admin-freizuschaltenden Nutzer an (siehe AuthService.registerInterest).
// Der Benutzername wird NICHT abgefragt, sondern serverseitig generiert - das Formular hat
// dafür also kein Feld. Alle übrigen Felder sind Pflicht.
router.post('/api/register', registrationLimiter, asyncHandler(async (req, res) => {
  const { first_name, last_name, funktion, telefon, email, dienststelle, language } = req.body || {};
  const required = { Vorname: first_name, Nachname: last_name, Funktion: funktion, Telefon: telefon, Dienststelle: dienststelle };
  const missing = Object.entries(required).find(([, v]) => !v || !String(v).trim());
  if (missing) return res.status(400).json({ error: `${missing[0]} erforderlich` });
  if (!users.isValidEmail(email)) return res.status(400).json({ error: 'Gültige E-Mail-Adresse erforderlich' });

  try {
    const result = await AuthService.registerInterest({ first_name, last_name, funktion, telefon, email, dienststelle, language });
    res.json({ ok: true, username: result.username });
  } catch (e) {
    console.error('register POST:', e.message);
    res.status(500).json({ error: 'Registrierung fehlgeschlagen' });
  }
}));

module.exports = router;
