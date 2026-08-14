const crypto = require('crypto');

function safeEqual(expected, actual) {
  if (!expected || !actual || typeof actual !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { safeEqual };
