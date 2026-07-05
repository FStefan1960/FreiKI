const express = require('express');
const { config } = require('../../../shared/config');
const Mattermost = require('../../../core/integrations/MattermostService');

const router = express.Router();

router.get('/oauth/authorize', (req, res) => {
  if (!Mattermost.isValidClient(req.query.client_id, req.query.redirect_uri)) {
    return res.status(400).send('Ungültiger client_id oder redirect_uri');
  }
  res.set('Content-Type', 'text/html').send(Mattermost.loginPageHtml(null, req.query));
});

router.post('/oauth/authorize', async (req, res) => {
  const { username, password, client_id, redirect_uri, state } = req.body || {};
  if (!Mattermost.isValidClient(client_id, redirect_uri)) {
    return res.status(400).send('Ungültiger client_id oder redirect_uri');
  }
  try {
    const code = await Mattermost.authenticateForOidc(username, password);
    if (!code) {
      return res.set('Content-Type', 'text/html').status(401).send(
        Mattermost.loginPageHtml('Ungültige Anmeldedaten', req.body)
      );
    }
    const redirect = new URL(redirect_uri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    res.redirect(redirect.toString());
  } catch (e) {
    console.error('oauth/authorize Fehler:', e.message);
    res.status(500).send('Serverfehler');
  }
});

router.post('/oauth/token', (req, res) => {
  const { grant_type, code, redirect_uri, client_id, client_secret } = req.body || {};
  const authHeader = req.headers['authorization'] || '';
  let basicId = client_id, basicSecret = client_secret;
  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    [basicId, basicSecret] = decoded.split(':');
  }
  if (grant_type !== 'authorization_code' || !Mattermost.isValidClientCredentials(basicId, basicSecret)) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  const tokens = Mattermost.exchangeCode(code, redirect_uri);
  if (!tokens) return res.status(400).json({ error: 'invalid_grant' });
  res.json({
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    id_token: tokens.idToken,
    scope: 'openid profile email',
  });
});

router.get('/oauth/userinfo', (req, res) => {
  const claims = Mattermost.verifyBearer(req.headers['authorization'] || '');
  if (!claims) return res.status(401).json({ error: 'invalid_token' });
  res.json({
    sub: claims.sub,
    preferred_username: claims.preferred_username,
    name: claims.name,
    email: claims.email,
    email_verified: claims.email_verified,
  });
});

// Mattermost Team Edition hat kein generisches "OpenID Connect" (Enterprise-Feature),
// nutzt aber für den GitLab-SSO-Slot frei konfigurierbare Endpoints (Auth/Token/User-API).
// Dieser Endpoint liefert die User-Daten im GitLab-API-Format (v4/user), damit sich der
// GitLab-Login-Slot zweckentfremden lässt.
router.get('/api/v4/user', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ message: '401 Unauthorized' });
  const claims = Mattermost.verifyBearer(authHeader);
  if (!claims) return res.status(401).json({ message: '401 Unauthorized' });
  res.json({
    id: parseInt(claims.sub, 10),
    username: claims.preferred_username,
    login: claims.preferred_username,
    email: claims.email,
    name: claims.name,
    state: 'active',
    avatar_url: `${config.APP_URL}/apple-touch-icon.png`,
    web_url: config.APP_URL,
    confirmed_at: new Date().toISOString(),
    two_factor_enabled: false,
  });
});

module.exports = router;
