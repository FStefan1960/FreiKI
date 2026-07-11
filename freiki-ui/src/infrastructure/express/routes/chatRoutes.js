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
const { sendToN8n } = require('../../../core/integrations/N8nService');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

const router = express.Router();

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

  // 'default'- und 'high_risk'-Nutzer mit gesetzten use-Bereichen werden eingeschränkt.
  if (session && (session.role === 'default' || session.role === 'high_risk') && liveUse.length) {
    const allowed = userAreas;
    return res.json(visible.filter(m => !prompts.isWissenMode(m) || allowed.includes(normArea(m.key))));
  }
  res.json(visible);
}));

router.post('/api/feedback', asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    event: 'feedback',
    timestamp: req.body.timestamp || new Date().toISOString()
  };
  console.log(`Feedback: ${payload.type}`);
  await sendToN8n(payload);
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

// Bot-Chat (z.B. Mattermost via n8n): RAG über ALLE Wissensbereiche, API-Key statt Session
router.post('/api/bot-chat', asyncHandler(async (req, res) => {
  if (!config.BOT_API_KEY || req.headers['x-api-key'] !== config.BOT_API_KEY) {
    return res.status(403).json({ error: 'Ungültiger oder fehlender API-Key (Header X-API-Key)' });
  }
  const { message, username } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Kein message übergeben' });
  }
  try {
    const result = await kb.answerBotChat(message, username);
    sendToN8n({
      event: 'bot-chat', user: username || 'bot',
      areasFound: result.sources, timestamp: new Date().toISOString(),
    });
    res.json(result);
  } catch (e) {
    console.error('bot-chat Fehler:', e);
    res.status(500).json({ error: 'Fehler bei der Bot-Anfrage' });
  }
}));

module.exports = router;
