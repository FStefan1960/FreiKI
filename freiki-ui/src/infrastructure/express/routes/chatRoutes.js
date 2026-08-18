const express = require('express');
const fs = require('fs');
const path = require('path');
const { config } = require('../../../shared/config');
const { getBrandConfig } = require('../../../shared/config/BrandConfig');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { normArea } = require('../../../shared/utils/text');
const prompts = require('../../../core/chat/PromptService');
const { chatUpload } = require('../../../core/chat/ChatValidator');
const ChatService = require('../../../core/chat/ChatService');
const kb = require('../../../core/knowledge/KBService');
const users = require('../../../core/auth/UserRepository');
const { recordFeedback } = require('../../../jobs/feedbackReport');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');
const { safeEqual } = require('../../../shared/utils/security');

const router = express.Router();
router.use(express.json({ limit: '2mb' }));

router.get('/api/tips', (_req, res) => {
  try {
    const brand = getBrandConfig();
    const raw = fs.readFileSync(path.join(config.APP_ROOT, 'tips.md'), 'utf8')
      .replace(/\{\{APP_NAME\}\}/g, brand.name)
      .replace(/\{\{MATTERMOST_URL\}\}/g, brand.mattermostUrl || 'dem Team-Chat');
    const tips = raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    res.json({ tips });
  } catch (e) { res.json({ tips: [] }); }
});

// Generierte Bilder (Modus "Bild"): Dateiname ist ein server-seitig erzeugtes UUID.png,
// daher reicht ein striktes Format-Match als Schutz vor Path-Traversal.
router.get('/api/generated-images/:file', (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (!/^[a-f0-9-]+\.(png|jpg)$/.test(req.params.file)) return res.status(400).end();
  const filePath = path.join(config.APP_ROOT, 'generated_images', req.params.file);
  res.sendFile(filePath, err => { if (err) res.status(404).end(); });
});

router.get('/api/modes', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = getSession(req);
  const isAdmin = session?.role === 'admin';

  // use_areas live aus der DB lesen (JWT-Token kann veraltet sein)
  let liveUse = session?.use || [];
  let livePaperless = false;
  if (session?.uid && !isAdmin) {
    try {
      const row = await users.findLiveAreasById(session.uid);
      if (row) {
        liveUse = row.use_areas || [];
        livePaperless = !!row.use_paperless;
      }
    } catch { /* Fallback auf Token */ }
  }

  const userAreas = liveUse.map(normArea);
  const hasPaperless = isAdmin || livePaperless;

  const visible = prompts.modesConfig
    .filter(m => !m.hidden)
    .filter(m => !m.paperless || hasPaperless);

  const lang = prompts.UI_LANGS.includes(req.query.lang) ? req.query.lang : 'de';
  const localize = (list) => list.map(m => prompts.localizeMode(m, lang));

  // 'default'-, 'high_risk'- und 'manager'-Nutzer mit gesetzten use-Bereichen werden eingeschränkt.
  if (session && (session.role === 'default' || session.role === 'high_risk' || session.role === 'manager') && liveUse.length) {
    const allowed = userAreas;
    return res.json(localize(visible.filter(m => !prompts.isWissenMode(m) || allowed.includes(normArea(m.key)))));
  }
  res.json(localize(visible));
}));

router.post('/api/feedback', asyncHandler(async (req, res) => {
  if (!getSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const payload = {
    ...req.body,
    event: 'feedback',
    timestamp: req.body.timestamp || new Date().toISOString()
  };
  console.log(`Feedback: ${payload.type}`);
  await recordFeedback(payload);
  res.json({ ok: true });
}));

router.post('/api/chat', chatUpload, asyncHandler(async (req, res) => {
  const session = getSession(req);
  if (!session) {
    (req.files?.['file'] || []).forEach(f => fs.unlinkSync(f.path));
    (req.files?.['files'] || []).forEach(f => fs.unlinkSync(f.path));
    return res.status(401).json({ error: 'Nicht angemeldet' });
  }
  req.session = session;
  return ChatService.handleChat(req, res);
}));

router.post('/api/hilfe-chat', asyncHandler(async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Keine Nachricht' });
  try {
    const result = await kb.answerHilfeChat(message);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    res.json(result);
  } catch (e) {
    console.error('Hilfe-Chat Fehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
}));

// IT-Sicherheitslage (n8n): Digest speichern, API-Key statt Session
router.post('/api/bot/sicherheitslage', (req, res) => {
  if (!config.BOT_API_KEY || !safeEqual(config.BOT_API_KEY, req.headers['x-api-key'])) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const { html, date } = req.body || {};
  if (!html) return res.status(400).json({ error: 'html fehlt' });
  try {
    fs.writeFileSync(path.join(config.APP_ROOT, 'sicherheitslage.json'),
      JSON.stringify({ date: date || new Date().toISOString().slice(0, 10), html }));
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Interner Fehler' }); }
});

// Bot-Chat (z.B. Mattermost via n8n): RAG über ALLE Wissensbereiche, API-Key statt Session
router.post('/api/bot-chat', asyncHandler(async (req, res) => {
  if (!config.BOT_API_KEY || !safeEqual(config.BOT_API_KEY, req.headers['x-api-key'])) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const { message, username } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Kein message übergeben' });
  }
  try {
    const result = await kb.answerBotChat(message, username);
    res.json(result);
  } catch (e) {
    console.error('bot-chat Fehler:', e);
    res.status(500).json({ error: 'Fehler bei der Bot-Anfrage' });
  }
}));

// Mattermost Slash-Command "/freiki" - ersetzt den früheren n8n-Webhook-Workflow
// "FreiKI Mattermost Bot" (nur intern erreichbar, Mattermost commands.url zeigt jetzt
// direkt hierher statt auf http://n8n:5678/webhook/freiki-bot). Mattermost verlangt eine
// Antwort binnen 3s, daher sofortige Bestätigung + asynchrone Auslieferung über response_url.
router.post('/api/mattermost/slash-command', express.urlencoded({ extended: false, limit: '20kb' }), (req, res) => {
  const { token, text, user_name, response_url } = req.body || {};
  if (!config.MATTERMOST_SLASH_TOKEN || !safeEqual(config.MATTERMOST_SLASH_TOKEN, token || '')) {
    return res.status(403).json({ text: 'Ungültiges Slash-Command-Token.' });
  }
  if (!text || !text.trim() || !response_url) {
    return res.status(200).json({ response_type: 'ephemeral', text: 'Bitte eine Frage nach /freiki eingeben.' });
  }
  res.status(200).json({ response_type: 'ephemeral', text: 'FreiKI denkt nach …' });

  kb.answerBotChat(text, user_name).then((result) => {
    return fetch(response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response_type: 'in_channel', text: result.answer }),
    });
  }).catch((e) => {
    console.error('Mattermost Slash-Command Fehler:', e);
    fetch(response_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response_type: 'ephemeral', text: 'Fehler bei der Bot-Anfrage.' }),
    }).catch(() => {});
  });
});

// Mattermost Outgoing Webhook "@freiki" (Erwähnung in einem Channel) - ersetzt den früheren
// n8n-Workflow "FreiKI @mention Handler" (outgoingwebhooks.callbackurls in der Mattermost-DB
// zeigt jetzt direkt hierher). Antwort kommt nicht über die Webhook-Response, sondern per
// separatem REST-Aufruf mit dem Bot-Access-Token, weil die RAG/LLM-Antwort zu lange dauert.
router.post('/api/mattermost/mention', express.urlencoded({ extended: false, limit: '20kb' }), (req, res) => {
  const { token, text, user_name, channel_id } = req.body || {};
  if (!config.MATTERMOST_MENTION_TOKEN || !safeEqual(config.MATTERMOST_MENTION_TOKEN, token || '')) {
    return res.status(403).end();
  }
  res.status(200).end();

  const message = (text || '').replace(/@freiki\s*/i, '').trim();
  if (!message || !channel_id) return;

  kb.answerBotChat(message, user_name).then((result) => {
    return fetch(`${config.MATTERMOST_URL}/api/v4/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.MATTERMOST_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id, message: result.answer }),
    });
  }).catch((e) => {
    console.error('Mattermost @mention Fehler:', e);
  });
});

module.exports = router;
