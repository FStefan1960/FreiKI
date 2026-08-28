const bcrypt = require('bcryptjs');
const users = require('./UserRepository');
const { signToken, signPendingToken, verifyPendingToken } = require('./AuthMiddleware');
const totp = require('./TotpService');
const webauthn = require('./WebauthnService');
const webauthnCreds = require('./WebauthnCredentialRepository');
const { sendWelcomeMail, sendBgtWelcomeMail, sendRegistrationNotificationMail } = require('../integrations/EmailService');
const { generatePassword, fetchWithTimeout } = require('../../shared/utils/text');
const { getBrandConfig } = require('../../shared/config/BrandConfig');
const { config } = require('../../shared/config');

const THINKING_KWARGS = /qwen/i.test(config.VLLM_MODEL || '')
  ? { chat_template_kwargs: { enable_thinking: false } }
  : {};

// Pflichtschulung greift vor der 2FA-Einrichtung, gilt aber (anders als 2FA) für alle Rollen
// und nur, wo APP_MANDATORY_TRAINING=true gesetzt ist (aktuell nirgends aktiv).
function trainingDue(u) {
  return getBrandConfig().mandatoryTraining && !u.training_completed;
}

// Breaking-News-Hinweis: fällig, wenn eine Nachricht aktiv ist (Text nicht leer) und der
// Nutzer die aktuelle Version noch nicht quittiert hat (siehe news_ack_version).
function breakingNewsDue(u) {
  const b = getBrandConfig();
  return !!b.breakingNewsText && (u.news_ack_version || 0) < (b.breakingNewsVersion || 0);
}

function breakingNewsPayload(u) {
  if (!breakingNewsDue(u)) return null;
  const b = getBrandConfig();
  return { text: b.breakingNewsText, version: b.breakingNewsVersion };
}

async function login(username, password) {
  const u = await users.findByUsername(username);
  if (!u || u.suspended) return { error: 'invalid' };
  const ok = await bcrypt.compare(password, u.password_hash || '');
  if (!ok) return { error: 'invalid' };

  if (u.totp_enabled) {
    const hasPasskeys = (await webauthnCreds.countByUser(u.id)) > 0;
    return { requires2fa: true, pendingToken: signPendingToken(u), mustCompleteTraining: trainingDue(u), hasPasskeys };
  }

  const token = signToken(u);
  const result = { token, role: u.role, user: { username: u.username }, useAreas: u.use_areas, manageAreas: u.manage_areas };
  // Rolle verlangt 2FA, aber noch nicht eingerichtet: Login gelingt (sonst kein Weg zum
  // Einrichten), Frontend muss den Setup-Dialog erzwingen, bevor der Nutzer weiterarbeitet.
  if (totp.requires2FA(u.role)) result.mustSetup2fa = true;
  if (trainingDue(u)) result.mustCompleteTraining = true;
  result.breakingNews = breakingNewsPayload(u);
  return result;
}

// Zweiter Login-Schritt bei bereits aktiviertem 2FA: prüft TOTP-Code oder Backup-Code
// gegen den Pending-Token aus login(), stellt erst danach das volle Session-Token aus.
async function verifyTwoFactor(pendingToken, code) {
  const pending = verifyPendingToken(pendingToken);
  if (!pending) return { error: 'invalid-pending' };
  const u = await users.findById(pending.uid);
  if (!u || u.suspended || !u.totp_enabled) return { error: 'invalid-pending' };

  if (totp.verifyToken(u.totp_secret, code)) {
    const token = signToken(u);
    return {
      token, role: u.role, user: { username: u.username }, useAreas: u.use_areas, manageAreas: u.manage_areas,
      mustCompleteTraining: trainingDue(u),
      breakingNews: breakingNewsPayload(u),
    };
  }

  const { valid, remaining } = await totp.consumeBackupCode(u.totp_backup_codes, code);
  if (valid) {
    await users.updateBackupCodes(u.id, remaining);
    const token = signToken(u);
    return {
      token, role: u.role, user: { username: u.username }, useAreas: u.use_areas, manageAreas: u.manage_areas,
      backupCodeUsed: true, backupCodesRemaining: remaining.length,
      mustCompleteTraining: trainingDue(u),
      breakingNews: breakingNewsPayload(u),
    };
  }
  return { error: 'invalid-code' };
}

// Setup Schritt 1: Secret erzeugen (noch nicht aktiv), QR-Code zur Anzeige zurückgeben.
async function start2FASetup(uid) {
  const u = await users.findById(uid);
  if (!u) return { error: 'no-session' };
  const { secret, otpauth } = totp.generateSecret(u.username, getBrandConfig().name);
  await users.setPendingTotpSecret(uid, secret);
  const qrCode = await totp.qrDataUrl(otpauth);
  return { secret, qrCode };
}

// Setup Schritt 2: Code bestätigen, Backup-Codes erzeugen und 2FA scharf schalten.
// Stellt zugleich ein frisches Session-Token mit totpEnabled:true aus - die 2FA-Sperre in
// require2FASetupComplete() (security.js) prüft diesen Claim, das alte Token vor dem Setup
// hatte ihn noch auf false. Ohne Neuausstellung bliebe der Nutzer bis zum nächsten Login
// gesperrt, obwohl das Setup gerade erfolgreich war.
async function confirm2FASetup(uid, code) {
  const u = await users.findById(uid);
  if (!u || !u.totp_secret) return { error: 'no-pending-setup' };
  if (!totp.verifyToken(u.totp_secret, code)) return { error: 'invalid-code' };
  const { plain, hashed } = await totp.generateBackupCodes();
  await users.enableTotp(uid, hashed);
  const token = signToken({ ...u, totp_enabled: true });
  return { ok: true, backupCodes: plain, token };
}

async function disable2FA(uid) {
  await users.disableTotp(uid);
  return { ok: true };
}

// Selbstbedienung bei Gerätewechsel: Nutzer kann sein 2FA selbst neu einrichten (neues
// Secret + neue Backup-Codes), ohne einen Admin zu bemühen. Zum Schutz gegen ein entwendetes
// Session-Token wird das aktuelle Passwort erneut verlangt, bevor der Setup-Flow startet.
async function requestReinit2FA(uid, currentPassword) {
  const u = await users.findById(uid);
  if (!u) return { error: 'no-session' };
  const ok = await bcrypt.compare(currentPassword || '', u.password_hash || '');
  if (!ok) return { error: 'wrong-current' };
  return start2FASetup(uid);
}

async function changePassword(uid, currentPassword, newPassword) {
  const u = await users.findById(uid);
  if (!u) return { error: 'no-session' };
  const ok = await bcrypt.compare(currentPassword || '', u.password_hash || '');
  if (!ok) return { error: 'wrong-current' };
  const hash = await bcrypt.hash(newPassword, 10);
  await users.updatePasswordHash(u.id, hash);
  return { ok: true };
}

// Freitext-Eingabe ("italiano", "auf Englisch bitte") auf ein einzelnes deutsches Adjektiv
// normalisieren, bevor sie in freiki_users.language landet. Wichtig: dieser Wert wird später
// ungefiltert in eine "SPRACHANWEISUNG MIT HÖCHSTER PRIORITÄT"-Systemnachricht gespliced
// (siehe ChatService.js languageInstruction()) - ohne diese Normalisierung könnte ein Nutzer
// sich darüber eine dauerhafte Prompt-Injection in jede eigene Chat-Anfrage schreiben.
async function normalizeLanguage(rawInput) {
  const input = (rawInput || '').trim().slice(0, 100);
  if (!input) return null;
  if (/^(de|deutsch)$/i.test(input)) return 'deutsch';
  try {
    const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: 'Extrahiere aus der folgenden Nutzereingabe ausschließlich das deutsche Adjektiv der gemeinten Sprache (z.B. "italienisch", "englisch", "französisch"). Die Eingabe kann auf Deutsch oder in der Fremdsprache selbst erfolgen (z.B. "italiano" -> "italienisch"). Antworte NUR mit dem Adjektiv in Kleinschreibung, ohne Satzzeichen oder weitere Wörter. Ist keine Sprache erkennbar, antworte ausschließlich mit "ungueltig". /no_think' },
          { role: 'user', content: `Nutzereingabe: "${input}"` }
        ],
        max_tokens: 20,
        temperature: 0.1,
        ...THINKING_KWARGS
      })
    });
    const d = await r.json();
    const out = (d.choices?.[0]?.message?.content || '').trim().toLowerCase()
      .replace(/[^a-zäöüß\s]/g, '').replace(/\s+/g, ' ').trim();
    if (!out || out === 'ungueltig' || out.length > 30) return null;
    return out;
  } catch (e) {
    console.warn('Sprach-Normalisierung fehlgeschlagen:', e.message);
    return null;
  }
}

async function changeLanguage(uid, rawInput) {
  const normalized = await normalizeLanguage(rawInput);
  if (!normalized) return { error: 'invalid-language' };
  await users.updateLanguage(uid, normalized);
  return { ok: true, language: normalized };
}

async function changeEnterToSend(uid, enterToSend) {
  await users.updateEnterToSend(uid, enterToSend);
  return { ok: true, enterToSend: !!enterToSend };
}

// Legt einen Nutzer an; generiert bei Bedarf ein Passwort und verschickt die Willkommensmail.
async function createUser(fields) {
  let password = fields.password;
  const autoGenerated = !password;
  if (autoGenerated) password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const id = await users.create({ ...fields, passwordHash });
  let mailSent = false;
  if (autoGenerated && fields.email) {
    try {
      await sendWelcomeMail(fields.email.trim(), fields.username.trim(), password, fields.first_name || '', fields.last_name || '');
      mailSent = true;
    } catch (mailErr) {
      console.error('Willkommensmail fehlgeschlagen:', mailErr.message);
    }
  }
  if (fields.role === 'high_risk' && fields.email) {
    try {
      await sendBgtWelcomeMail(fields.email.trim(), fields.first_name || '', fields.last_name || '');
    } catch (mailErr) {
      console.error('BGT-Zusatzmail fehlgeschlagen:', mailErr.message);
    }
  }
  return { id, mailSent };
}

async function resetPassword(id, password) {
  const hash = await bcrypt.hash(password, 10);
  return users.updatePasswordHash(id, hash);
}

// Setzt ein neues Zufallspasswort und schickt die Willkommensmail erneut.
async function resendWelcome(id) {
  const u = await users.findProfileById(id);
  if (!u) return { error: 'not-found' };
  if (!u.email) return { error: 'no-email' };
  const newPassword = generatePassword();
  const hash = await bcrypt.hash(newPassword, 10);
  await users.updatePasswordHash(id, hash);
  await sendWelcomeMail(u.email, u.username, newPassword, u.first_name || '', u.last_name || '');
  return { ok: true };
}

// Passkey als Alternative zum TOTP-Code im 2. Login-Schritt: gleicher Pending-Token wie
// verifyTwoFactor(), aber Bestätigung per Face ID/Touch ID statt Code-Eingabe.
async function getPasskeyLoginOptions(pendingToken) {
  const pending = verifyPendingToken(pendingToken);
  if (!pending) return { error: 'invalid-pending' };
  const u = await users.findById(pending.uid);
  if (!u || u.suspended || !u.totp_enabled) return { error: 'invalid-pending' };
  return webauthn.getAuthenticationOptions(u.id);
}

async function verifyPasskeyLogin(pendingToken, response) {
  const pending = verifyPendingToken(pendingToken);
  if (!pending) return { error: 'invalid-pending' };
  const u = await users.findById(pending.uid);
  if (!u || u.suspended || !u.totp_enabled) return { error: 'invalid-pending' };

  const result = await webauthn.verifyAuthentication(u.id, response);
  if (result.error) return result;

  const token = signToken(u);
  return {
    token, role: u.role, user: { username: u.username }, useAreas: u.use_areas, manageAreas: u.manage_areas,
    mustCompleteTraining: trainingDue(u),
    breakingNews: breakingNewsPayload(u),
  };
}

// Passkey-Selbstverwaltung für eingeloggte Nutzer (Registrieren/Auflisten/Löschen).
async function getPasskeyRegistrationOptions(uid) {
  const u = await users.findById(uid);
  if (!u) return { error: 'no-session' };
  return webauthn.getRegistrationOptions(uid, u.username);
}

async function confirmPasskeyRegistration(uid, response, nickname) {
  return webauthn.verifyRegistration(uid, response, nickname);
}

function listPasskeys(uid) {
  return webauthnCreds.listByUser(uid);
}

function removePasskey(uid, credentialDbId) {
  return webauthnCreds.remove(credentialDbId, uid);
}

// Admin-Aktion bei Gerätewechsel/-verlust ohne Zugriff mehr auf die Passkeys.
async function resetPasskeys(uid) {
  await webauthnCreds.removeAllForUser(uid);
  return { ok: true };
}

async function completeTraining(uid) {
  await users.completeTraining(uid);
  return { ok: true };
}

// ── Selbstregistrierung (öffentliches Anmeldeformular) ──────────────────────
// Legt den Nutzer bewusst gesperrt und ohne Rolle/Bereiche an (role bleibt 'default',
// use/manage leer) - erst die Admin-Freischaltung (approveRegistration) vergibt echte
// Rechte. Anders als createUser() wird HIER NIE eine Willkommensmail verschickt: das
// Passwort ist ein Wegwerfwert, der Nutzer bekommt sein echtes Passwort erst bei der
// Freischaltung per resendWelcome().
async function registerInterest(rawFields) {
  const throwawayPassword = generatePassword();
  const passwordHash = await bcrypt.hash(throwawayPassword, 10);
  // Antwortsprache ist im Formular ein Freitextfeld (kein festes Auswahlmenü) - dieselbe
  // KI-gestützte Normalisierung wie bei changeLanguage() für eingeloggte Nutzer, nicht
  // interpretierbare Angaben fallen auf '' zurück -> users.create() ergänzt dann 'de'.
  const language = (await normalizeLanguage(rawFields.language)) || '';
  const fields = { ...rawFields, language };
  // Benutzername wird NICHT vom Formular übernommen, sondern serverseitig aus Vor-/Nachname
  // generiert (siehe UserRepository.generateUniqueUsername) - das Formular fragt ihn gar
  // nicht erst ab.
  const username = await users.generateUniqueUsername(fields.first_name, fields.last_name);
  let id;
  try {
    id = await users.create({
      ...fields, username, passwordHash, role: 'default', use: [], manage: [],
      use_paperless: false, use_metacom: false, suspended: true, pending_approval: true,
    });
  } catch (e) {
    // Seltene Race zwischen der Verfuegbarkeitspruefung in generateUniqueUsername() und
    // diesem INSERT (zwei Registrierungen mit identischem Namen zur exakt selben Zeit) -
    // ein einziger Versuch mit Zeitstempel-Suffix statt Endlosschleife.
    if (e.code !== '23505') throw e;
    const retryUsername = username + Date.now().toString().slice(-4);
    id = await users.create({
      ...fields, username: retryUsername, passwordHash, role: 'default', use: [], manage: [],
      use_paperless: false, use_metacom: false, suspended: true, pending_approval: true,
    });
    return await notifyAndReturn(id, retryUsername, fields);
  }
  return await notifyAndReturn(id, username, fields);
}

async function notifyAndReturn(id, username, fields) {
  try {
    const adminEmails = await users.listAdminEmails();
    const recipients = [...new Set([...adminEmails, config.REGISTRATION_NOTIFY_EMAIL].filter(Boolean))];
    await sendRegistrationNotificationMail(recipients, { ...fields, id, username });
  } catch (mailErr) {
    console.error('Registrierungs-Benachrichtigung fehlgeschlagen:', mailErr.message);
  }
  return { id, username };
}

// Admin-Freischaltung einer Selbstregistrierung: weist Rolle/Bereiche zu, entsperrt,
// generiert das echte Passwort und verschickt die Willkommensmail (resendWelcome deckt
// beides ab, da der Nutzer technisch bereits existiert - nur eben noch gesperrt war).
async function approveRegistration(id, adminFields) {
  const before = await users.findById(id);
  if (!before || !before.pending_approval) return { error: 'not-found' };
  // update() erwartet ein komplettes Formular und überschreibt sonst first_name/last_name/
  // funktion/telefon/email/language mit '' (siehe Kommentar bei updateLanguage()) - die bei
  // der Registrierung erfassten Werte hier explizit mitgeben, adminFields liefert nur
  // role/use/manage/use_paperless/use_metacom.
  await users.update(id, {
    ...adminFields,
    first_name: before.first_name, last_name: before.last_name, funktion: before.funktion,
    telefon: before.telefon, email: before.email, language: before.language,
    suspended: false, pending_approval: false,
  });
  const result = await resendWelcome(id);
  if (adminFields.role === 'high_risk' && before.email) {
    try {
      await sendBgtWelcomeMail(before.email, before.first_name || '', before.last_name || '');
    } catch (mailErr) {
      console.error('BGT-Zusatzmail fehlgeschlagen:', mailErr.message);
    }
  }
  return { ok: true, mailSent: !result.error };
}

async function rejectRegistration(id) {
  const before = await users.findById(id);
  if (!before || !before.pending_approval) return { error: 'not-found' };
  await users.remove(id);
  return { ok: true, username: before.username };
}

module.exports = {
  login, verifyTwoFactor, start2FASetup, confirm2FASetup, disable2FA, requestReinit2FA,
  changePassword, changeLanguage, changeEnterToSend, createUser, resetPassword, resendWelcome, completeTraining,
  getPasskeyLoginOptions, verifyPasskeyLogin, getPasskeyRegistrationOptions,
  confirmPasskeyRegistration, listPasskeys, removePasskey, resetPasskeys,
  registerInterest, approveRegistration, rejectRegistration,
};
