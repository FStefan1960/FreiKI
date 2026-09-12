const rateLimit = require('express-rate-limit');
const { getSession, verifyPendingToken } = require('../../../core/auth/AuthMiddleware');
const { requires2FA } = require('../../../core/auth/TotpService');

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(self), geolocation=()');
  next();
}

// Docker-Bridge-Netzwerke (ai_network etc.) liegen im privaten 172.16.0.0/12-Bereich.
// Von außen nie erreichbar (nur Container-zu-Container, z.B. n8n-Workflows, die sich
// bei jedem Lauf per /api/login neu einloggen) — daher sicher vom Login-Rate-Limit
// ausnehmbar, ohne den eigentlichen Brute-Force-Schutz gegen echte Login-Versuche
// von außen zu schwächen.
function isDockerInternalIp(ip) {
  const clean = (ip || '').replace(/^::ffff:/, '');
  const parts = clean.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

// Piktogramm-Bilder: bis zu 40 parallele img-Requests pro Suche – nicht gegen das
// API-Limit zählen (sonst leere Kacheln nach wenigen Suchen).
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Zu viele Anfragen' },
  skip: (req) => /^\/api\/pictograms\/\d+\/image(?:\?|$)/.test(req.originalUrl || ''),
});
// handler statt message, damit die Sperrfrist als retryAfterSeconds mitgeschickt wird -
// das Frontend zeigt darauf ein Countdown-Modal (siehe lockout-modal in index.html), statt
// die Sperre nur als generische Fehlermeldung im Login-Formular anzuzeigen.
function loginLimiterHandler(req, res, _next, options) {
  const resetTime = req.rateLimit && req.rateLimit.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(options.windowMs / 1000);
  res.status(options.statusCode).json({ error: 'Zu viele Login-Versuche', retryAfterSeconds });
}

// Userbasiert statt IP-basiert (vorher teilten sich z.B. mehrere Kolleg:innen hinter derselben
// Firmen-IP/NAT einen Zähler), und skipSuccessfulRequests, damit nur fehlgeschlagene Versuche
// zählen - vorher verbrauchte schon ein ganz normaler erfolgreicher Login (Passwort + 2FA-Code
// = 2 Requests gegen denselben, geteilten Limiter) einen Großteil des 5er-Kontingents.
// Jede der drei Login-Routen bekommt außerdem einen eigenen Zähler statt sich einen zu teilen,
// damit z.B. ein falscher 2FA-Code nicht das Kontingent des Passwort-Schritts mit aufbraucht.
function makeLoginLimiter(keyGenerator) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    skip: (req) => isDockerInternalIp(req.ip),
    keyGenerator,
    handler: loginLimiterHandler,
  });
}

// Passwort-Schritt: Key ist der eingegebene Benutzername (normalisiert), nicht die IP - fällt
// auf die IP zurück, falls kein Username im Body steckt (z.B. leere/fehlerhafte Anfrage).
const loginLimiter = makeLoginLimiter((req) => {
  const username = String((req.body && req.body.username) || '').trim().toLowerCase();
  return username || req.ip;
});

// 2FA-Code-Schritt: kein Username im Body, daher Key = uid aus dem pendingToken (JWT aus dem
// ersten Schritt, siehe AuthService.login()). Eigener Zähler statt geteilt mit loginLimiter.
const verify2faLimiter = makeLoginLimiter((req) => {
  const pending = verifyPendingToken(req.body && req.body.pendingToken);
  return pending ? `pending:${pending.uid}` : req.ip;
});

// 2FA-Reinit: Nutzer ist bereits eingeloggt und bestätigt sein aktuelles Passwort erneut - Key
// ist die Session-uid. Eigener Zähler statt geteilt mit loginLimiter.
const reinit2faLimiter = makeLoginLimiter((req) => {
  const s = getSession(req);
  return s ? `uid:${s.uid}` : req.ip;
});

// Öffentliches Anmeldeformular: legt DB-Zeilen an und verschickt Mails, daher enger als
// der globale API-Limiter - verhindert, dass die Registrierungsanfragen-Liste zugespamt wird.
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Zu viele Registrierungsversuche – bitte später erneut versuchen' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Öffentliches "Passwort vergessen"-Formular: verschickt Mails und erlaubt (trotz generischer
// {ok:true}-Antwort, siehe AuthService.requestPasswordReset) Brute-Force-Versuche gegen den
// Reset-Token selbst - enger als der globale API-Limiter, analog zu registrationLimiter.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Zu viele Anfragen – bitte später erneut versuchen' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Gegen Brute-Force der 8-stelligen DokumentenPIN beim Formular-Fortsetzen (Formular-Chat).
const formResumeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Zu viele Versuche. Bitte später erneut versuchen.' },
  skip: (req) => isDockerInternalIp(req.ip),
});

// Rollen mit 2FA-Pflicht (admin/high_risk), die noch kein TOTP eingerichtet haben, bekamen
// beim Login trotzdem schon ein volles Session-Token (sonst gäbe es keinen Weg zum Einrichten -
// siehe Kommentar in AuthService.login()). Bisher war die Pflicht daher rein optisch: das
// Setup-Modal ließ sich im Frontend per "Verstanden, weiter" (closeSetup2FAModal() in
// index.html) folgenlos wegklicken. Diese Middleware sperrt deshalb serverseitig alle
// API-Routen außer den zum Einrichten nötigen, bis totp_enabled=true ist. Docker-interne
// Automation bleibt ausgenommen wie beim Login-Rate-Limit oben - dort ist ohnehin kein
// interaktiver TOTP-Flow möglich.
const TWO_FA_SETUP_ALLOWLIST = new Set([
  '/api/login', '/api/login/verify-2fa',
  '/api/webauthn/login/options', '/api/webauthn/login/verify',
  '/api/logout', '/api/me',
  '/api/2fa/setup', '/api/2fa/confirm', '/api/2fa/reinit',
  '/api/training/complete', '/api/training/decline',
]);

function require2FASetupComplete(req, res, next) {
  // req.path ist hier relativ zum Mount-Punkt ('/login' statt '/api/login', da diese
  // Middleware per app.use('/api/', ...) eingehängt ist - Express kappt das Prefix). Die
  // Allowlist führt volle Pfade, deshalb gegen originalUrl (ohne Query-String) prüfen, nicht
  // gegen req.path - sonst matcht die Allowlist nie und auch Login/Setup selbst werden gesperrt.
  const path = (req.originalUrl || '').split('?')[0];
  if (isDockerInternalIp(req.ip) || TWO_FA_SETUP_ALLOWLIST.has(path)) return next();
  const s = getSession(req);
  if (!s || !requires2FA(s.role) || s.totpEnabled) return next();
  res.status(403).json({ error: 'mustSetup2fa' });
}

module.exports = {
  securityHeaders, apiLimiter, loginLimiter, verify2faLimiter, reinit2faLimiter, registrationLimiter, forgotPasswordLimiter, formResumeLimiter, isDockerInternalIp,
  require2FASetupComplete,
};
