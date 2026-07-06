const jwt = require('jsonwebtoken');
const { config } = require('../../shared/config');
const { secondsUntilMidnightBerlin } = require('../../shared/utils/text');

function signToken(u) {
  return jwt.sign(
    { uid: u.id, username: u.username, role: u.role, use: u.use_areas || [], manage: u.manage_areas || [] },
    config.JWT_SECRET, { expiresIn: secondsUntilMidnightBerlin() }
  );
}

function getSession(req) {
  const t = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!t || !config.JWT_SECRET) return null;
  try { return jwt.verify(t, config.JWT_SECRET); } catch { return null; }
}

function adminSession(req) {
  const s = getSession(req);
  return (s && s.role === 'admin') ? s : null;
}

module.exports = { signToken, getSession, adminSession };
