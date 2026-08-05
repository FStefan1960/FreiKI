const express = require('express');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { formResumeLimiter } = require('../middlewares/security');
const templates = require('../../../core/forms/FormTemplateRepository');
const sessions = require('../../../core/forms/FormSessionRepository');
const { translateQuestion, translateLabels, DEFAULT_LANGUAGE } = require('../../../core/forms/FormDialogService');
const { fillFormToPdfBuffer } = require('../../../core/forms/FormFillService');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');

const router = express.Router();
router.use(express.json({ limit: '1mb' }));

const isUuid = (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);

// Freier Sprachname statt fester Liste (zu viele mögliche Sprachen) - hier nur technisch
// begrenzt (Länge, keine Zeilenumbrüche), inhaltlich validiert nicht mehr als das LLM selbst.
function sanitizeLanguage(input) {
  const s = String(input || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 40);
  return s || DEFAULT_LANGUAGE;
}

async function loadSessionState(sessionId) {
  const session = await sessions.getById(sessionId);
  if (!session) return null;
  const fields = await templates.listFields(session.template_id);
  return { session, fields };
}

async function stateResponse(session, fields) {
  const total = fields.length;
  const idx = session.current_field_index;
  if (idx >= total) return { ok: true, sessionId: session.id, done: true, totalFields: total };
  const field = fields[idx];
  const question = await translateQuestion(field.question_text, session.language);
  return {
    ok: true, sessionId: session.id, done: false,
    question, fieldIndex: idx, totalFields: total,
    fieldType: field.field_type, required: field.required,
  };
}

// Aktive Formularvorlagen für den Formular-Chat
router.get('/api/forms', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const list = await templates.listTemplates({ activeOnly: true });
  res.json({ ok: true, templates: list.map(t => ({ slug: t.slug, title: t.title, description: t.description })) });
}));

// Offene (pausierte) Sitzungen für die Fortsetzen-Auswahl - zeigt WER welches Formular
// begonnen hat, damit sich mehrere Nutzer mit derselben Vorlage nicht verwechseln. Enthält
// bewusst keine Antwortinhalte, nur Vorlage + Nutzername + letzte Aktivität; die PIN bleibt
// der einzige Weg, tatsächlich fortzusetzen.
router.get('/api/forms/sessions', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const list = await sessions.listOpen();
  res.json({
    ok: true,
    sessions: list.map(r => ({ slug: r.slug, title: r.title, username: r.username, updatedAt: r.updated_at })),
  });
}));

router.post('/api/forms/:slug/start', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const template = await templates.getTemplateBySlug(req.params.slug);
  if (!template || !template.active) return res.status(404).json({ error: 'Formular nicht gefunden.' });
  const fields = await templates.listFields(template.id);
  if (fields.length === 0) return res.status(400).json({ error: 'Dieses Formular hat noch keine Felder.' });

  const language = sanitizeLanguage(req.body?.language);
  const { id, pin } = await sessions.create(template.id, language, s.username);
  const [question, labels] = await Promise.all([
    translateQuestion(fields[0].question_text, language),
    translateLabels(language),
  ]);
  res.json({
    ok: true, sessionId: id, pin, done: false,
    question, fieldIndex: 0, totalFields: fields.length,
    fieldType: fields[0].field_type, required: fields[0].required, labels,
  });
}));

router.post('/api/forms/resume', formResumeLimiter, asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const { slug, pin } = req.body || {};
  if (!slug || !pin) return res.status(400).json({ error: 'Vorlage und PIN erforderlich.' });
  const template = await templates.getTemplateBySlug(slug);
  if (!template) return res.status(404).json({ error: 'Formular nicht gefunden.' });
  const session = await sessions.findByPin(template.id, pin);
  if (!session) return res.status(404).json({ error: 'Keine Sitzung mit dieser PIN gefunden.' });
  const fields = await templates.listFields(template.id);
  const [state, labels] = await Promise.all([
    stateResponse(session, fields),
    translateLabels(session.language),
  ]);
  res.json({ ...state, labels });
}));

// Antworten werden bewusst NICHT durch ein LLM geprüft/normalisiert (siehe FormDialogService.js)
// - reale Namen und Zahlen sind nicht zuverlässig algorithmisch validierbar, das hat vorher echte
// Angaben fälschlich abgelehnt. Die einzige "Validierung" ist die native HTML-Eingabe im Browser
// (type="number"/"date" je Feldtyp) - hier wird nur noch entgegengenommen bzw. übersprungen.
router.post('/api/forms/:sessionId/answer', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const { sessionId } = req.params;
  if (!isUuid(sessionId)) return res.status(400).json({ error: 'Ungültige Sitzung.' });
  const { message, skip } = req.body || {};

  const state = await loadSessionState(sessionId);
  if (!state) return res.status(404).json({ error: 'Sitzung nicht gefunden oder abgelaufen.' });
  const { session, fields } = state;
  if (session.current_field_index >= fields.length) {
    return res.json(await stateResponse(session, fields));
  }
  const field = fields[session.current_field_index];
  const nextIndex = session.current_field_index + 1;

  if (skip) {
    if (field.required) return res.status(400).json({ error: 'Dieses Feld ist ein Pflichtfeld und kann nicht übersprungen werden.' });
    await sessions.advanceField(sessionId, nextIndex);
  } else {
    const value = String(message || '').trim();
    if (!value) return res.status(400).json({ error: 'Keine Antwort übergeben.' });
    await sessions.saveAnswer(sessionId, field.field_key, value, nextIndex);
  }

  const updated = await sessions.getById(sessionId);
  res.json(await stateResponse(updated, fields));
}));

router.post('/api/forms/:sessionId/finish', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const { sessionId } = req.params;
  if (!isUuid(sessionId)) return res.status(400).json({ error: 'Ungültige Sitzung.' });

  const state = await loadSessionState(sessionId);
  if (!state) return res.status(404).json({ error: 'Sitzung nicht gefunden oder abgelaufen.' });
  const { session, fields } = state;

  const missing = fields.filter(f => f.required && !session.answers[f.field_key]);
  if (missing.length > 0) {
    return res.status(400).json({ error: 'Noch nicht alle Pflichtfelder beantwortet.' });
  }

  const template = await templates.getTemplateById(session.template_id);
  const pages = await templates.listPages(session.template_id);
  const buffer = await fillFormToPdfBuffer(pages, fields, session.answers);

  const safeName = (template.slug || 'formular').replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'formular';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}.pdf`);
  // Sitzung wird NICHT automatisch gelöscht - der Download kann fehlschlagen (z.B. Drucker),
  // ohne dass die Sitzung dabei verloren geht. Löschung erst nach expliziter Bestätigung
  // durch den Nutzer über /confirm-print (Datenminimierung, aber erst wenn der Ausdruck
  // wirklich erfolgreich war). Verwaiste Sitzungen fängt weiterhin der TTL-Purge-Job ab.
  res.send(buffer);
}));

// Nutzer bestätigt, dass der Ausdruck geklappt hat - erst dann wird die Sitzung gelöscht.
router.post('/api/forms/:sessionId/confirm-print', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const { sessionId } = req.params;
  if (!isUuid(sessionId)) return res.status(400).json({ error: 'Ungültige Sitzung.' });
  const session = await sessions.getById(sessionId);
  if (!session) return res.status(404).json({ error: 'Sitzung nicht gefunden oder abgelaufen.' });
  await sessions.deleteSession(sessionId);
  res.json({ ok: true });
}));

module.exports = router;
