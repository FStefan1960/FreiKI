const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// otplib-Default ist window:0 – akzeptiert NUR den exakten aktuellen 30s-Schritt, ohne jede
// Toleranz. Das lässt praktisch jeden Login scheitern, wenn der Zeitschritt während der
// Eingabe wechselt. window:1 erlaubt zusätzlich den vorherigen/nächsten Schritt (±30s,
// insgesamt ~90s Gültigkeit) – Standardverhalten von Google Authenticator/GitHub/AWS.
authenticator.options = { window: 1 };

const REQUIRED_ROLES = ['admin', 'high_risk'];
const requires2FA = (role) => REQUIRED_ROLES.includes(role);

function generateSecret(username, issuer) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(username, issuer, secret);
  return { secret, otpauth };
}

async function qrDataUrl(otpauth) {
  return QRCode.toDataURL(otpauth);
}

function verifyToken(secret, token) {
  if (!secret || !token) return false;
  try { return authenticator.check(String(token).trim(), secret); } catch { return false; }
}

// 10 Backup-Codes (5 Byte Hex = 10 Zeichen), einmal im Klartext zurückgegeben,
// nur die bcrypt-Hashes werden gespeichert.
async function generateBackupCodes(count = 10) {
  const plain = Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex'));
  const hashed = await Promise.all(plain.map((c) => bcrypt.hash(c, 10)));
  return { plain, hashed };
}

async function consumeBackupCode(hashedCodes, submitted) {
  const codes = Array.isArray(hashedCodes) ? hashedCodes : [];
  for (let i = 0; i < codes.length; i++) {
    if (await bcrypt.compare(String(submitted || '').trim(), codes[i])) {
      return { valid: true, remaining: codes.slice(0, i).concat(codes.slice(i + 1)) };
    }
  }
  return { valid: false, remaining: codes };
}

module.exports = { requires2FA, generateSecret, qrDataUrl, verifyToken, generateBackupCodes, consumeBackupCode };
