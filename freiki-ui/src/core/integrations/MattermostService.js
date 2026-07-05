const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { config } = require('../../shared/config');
const { getBrandConfig } = require('../../shared/config/BrandConfig');
const { htmlAttrEscape } = require('../../shared/utils/text');
const users = require('../auth/UserRepository');

// Minimaler OpenID-Connect-Provider: FreiKI/BonKI selbst als Identity-Provider für
// Mattermost, damit ein Account für App + Team-Chat reicht. Mattermost Team Edition hat
// kein generisches "OpenID Connect" (Enterprise-Feature), nutzt für den GitLab-SSO-Slot
// aber frei konfigurierbare Endpoints (Auth/Token/User-API) – das wird hier zweckentfremdet.
const oidcCodes = new Map(); // code -> { uid, username, email, expires }
const OIDC_CODE_TTL_MS = 2 * 60 * 1000;

function cleanupOidcCodes() {
  const now = Date.now();
  for (const [code, entry] of oidcCodes) {
    if (entry.expires < now) oidcCodes.delete(code);
  }
}

function loginPageHtml(error, params) {
  const brand = getBrandConfig();
  const hidden = ['response_type', 'client_id', 'redirect_uri', 'state', 'scope']
    .map(k => `<input type="hidden" name="${k}" value="${htmlAttrEscape(params[k])}">`)
    .join('\n');
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand.name} Login</title>
  <style>
    *{box-sizing:border-box;}
    body{font-family:system-ui,sans-serif;background:#F4F6FA;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
    form{background:#fff;padding:32px;border-radius:14px;box-shadow:0 4px 20px rgba(0,0,0,0.08);width:100%;max-width:360px;}
    h1{font-size:18px;margin:0 0 18px;color:#15294A;}
    input[type=text],input[type=password]{width:100%;padding:12px;margin-bottom:12px;border:1px solid #E3E8F0;border-radius:8px;font-size:16px;}
    button{width:100%;padding:12px;background:${brand.color};color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:16px;}
    .err{color:#B43C32;font-size:13px;margin-bottom:12px;}
  </style></head><body>
  <form method="POST">
    <h1>Anmeldung bei ${brand.name}</h1>
    ${error ? `<div class="err">${error}</div>` : ''}
    ${hidden}
    <input type="text" name="username" placeholder="Benutzername" autocomplete="username" required autofocus>
    <input type="password" name="password" placeholder="Passwort" autocomplete="current-password" required>
    <button type="submit">Anmelden</button>
  </form></body></html>`;
}

function isValidClient(clientId, redirectUri) {
  return clientId === config.OIDC_CLIENT_ID && redirectUri === config.OIDC_REDIRECT_URI;
}

async function authenticateForOidc(username, password) {
  const u = await users.findByUsername(username);
  const ok = u && !u.suspended && await bcrypt.compare(password || '', u.password_hash || '');
  if (!ok) return null;
  cleanupOidcCodes();
  const code = crypto.randomBytes(24).toString('hex');
  oidcCodes.set(code, { uid: u.id, username: u.username, email: u.email, expires: Date.now() + OIDC_CODE_TTL_MS });
  return code;
}

function isValidClientCredentials(clientId, clientSecret) {
  return clientId === config.OIDC_CLIENT_ID && clientSecret === config.OIDC_CLIENT_SECRET;
}

function exchangeCode(code, redirectUri) {
  cleanupOidcCodes();
  const entry = oidcCodes.get(code);
  if (!entry || (redirectUri && redirectUri !== config.OIDC_REDIRECT_URI)) return null;
  oidcCodes.delete(code); // einmal verwendbar

  const claims = {
    sub: String(entry.uid),
    preferred_username: entry.username,
    name: entry.username,
    email: entry.email || '',
    email_verified: true,
  };
  const accessToken = jwt.sign(claims, config.JWT_SECRET, { expiresIn: '1h' });
  const idToken = jwt.sign({ ...claims, iss: config.APP_URL, aud: config.OIDC_CLIENT_ID }, config.JWT_SECRET, { expiresIn: '1h' });
  return { accessToken, idToken };
}

function verifyBearer(authHeader) {
  if (!authHeader.startsWith('Bearer ')) return null;
  try { return jwt.verify(authHeader.slice(7), config.JWT_SECRET); } catch { return null; }
}

module.exports = {
  loginPageHtml, isValidClient, authenticateForOidc,
  isValidClientCredentials, exchangeCode, verifyBearer,
};
