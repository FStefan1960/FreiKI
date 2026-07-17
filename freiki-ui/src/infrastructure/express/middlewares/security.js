const rateLimit = require('express-rate-limit');

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(), camera=(), geolocation=()');
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
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Zu viele Login-Versuche' },
  skip: (req) => isDockerInternalIp(req.ip),
});

module.exports = { securityHeaders, apiLimiter, loginLimiter, isDockerInternalIp };
