const jwt = require('jsonwebtoken');
const { config } = require('../../shared/config');
const { secondsUntilMidnightBerlin } = require('../../shared/utils/text');

function signToken(u) {
  return jwt.sign(
    { uid: u.id, username: u.username, role: u.role, use: u.use_areas || [], manage: u.manage_areas || [] },
    config.JWT_SECRET, { expiresIn: secondsUntilMidnightBerlin() }
  );
}

// Kurzlebiger Zwischen-Token für den zweiten Login-Schritt bei aktivem 2FA – trägt bewusst
// keine role/use/manage-Claims, damit er (falls abgefangen) für nichts außer der
// Code-Verifizierung nutzbar ist.
function signPendingToken(u) {
  return jwt.sign({ uid: u.id, pending2fa: true }, config.JWT_SECRET, { expiresIn: 300 });
}

function getSession(req) {
  const t = req.cookies && req.cookies.freiki_session;
  if (!t || !config.JWT_SECRET) return null;
  try { return jwt.verify(t, config.JWT_SECRET); } catch { return null; }
}

// Nimmt den rohen Token-String entgegen (nicht req), damit AuthService.verifyTwoFactor()
// ihn direkt aus dem Request-Body prüfen kann, ohne einen Express-req vorzutäuschen.
function verifyPendingToken(token) {
  if (!token || !config.JWT_SECRET) return null;
  try {
    const s = jwt.verify(token, config.JWT_SECRET);
    return s && s.pending2fa ? s : null;
  } catch { return null; }
}

function getPendingSession(req) {
  return verifyPendingToken((req.headers['authorization'] || '').replace('Bearer ', '').trim());
}

function adminSession(req) {
  const s = getSession(req);
  return (s && s.role === 'admin') ? s : null;
}

module.exports = { signToken, signPendingToken, getSession, getPendingSession, verifyPendingToken, adminSession };
