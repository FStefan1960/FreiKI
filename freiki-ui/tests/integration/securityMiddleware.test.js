const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  isDockerInternalIp,
  securityHeaders,
  require2FASetupComplete
} = require('../../src/infrastructure/express/middlewares/security');

describe('Security Middlewares & Headers', () => {
  it('sollte Docker-interne IP-Adressen (172.16.0.0/12) korrekt erkennen', () => {
    assert.strictEqual(isDockerInternalIp('172.16.0.1'), true);
    assert.strictEqual(isDockerInternalIp('172.20.0.5'), true);
    assert.strictEqual(isDockerInternalIp('172.31.255.254'), true);
    assert.strictEqual(isDockerInternalIp('::ffff:172.20.0.2'), true);

    // Externe und andere private Netze
    assert.strictEqual(isDockerInternalIp('172.32.0.1'), false);
    assert.strictEqual(isDockerInternalIp('192.168.1.50'), false);
    assert.strictEqual(isDockerInternalIp('10.0.0.1'), false);
    assert.strictEqual(isDockerInternalIp('100.105.90.20'), false);
    assert.strictEqual(isDockerInternalIp('8.8.8.8'), false);
    assert.strictEqual(isDockerInternalIp(''), false);
    assert.strictEqual(isDockerInternalIp(null), false);
  });

  it('sollte zwingend notwendige Security-Header setzen', () => {
    const headers = {};
    const req = {};
    const res = {
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; }
    };
    let nextCalled = false;

    securityHeaders(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(headers['x-frame-options'], 'SAMEORIGIN');
    assert.strictEqual(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(headers['permissions-policy'].includes('microphone=(self)'));
  });

  it('sollte 2FA-Einrichtung für unvollständige Admin-/High-Risk-Sessions erzwingen', () => {
    // 1. Allowlisted Route (muss immer durchgelassen werden)
    let passed = false;
    require2FASetupComplete(
      { originalUrl: '/api/login', ip: '1.2.3.4' },
      {},
      () => { passed = true; }
    );
    assert.strictEqual(passed, true, 'Login-Route muss ohne 2FA erreichbar sein');

    // 2. Docker-interne IP
    passed = false;
    require2FASetupComplete(
      { originalUrl: '/api/chat', ip: '172.20.0.5' },
      {},
      () => { passed = true; }
    );
    assert.strictEqual(passed, true, 'Docker-interne Aufrufe sind ausgenommen');
  });
});
