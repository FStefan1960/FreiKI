const express = require('express');
const fs = require('fs');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { formResumeLimiter } = require('../middlewares/security');
const templates = require('../../../core/forms/FormTemplateRepository');
const sessions = require('../../../core/forms/FormSessionRepository');
const { translateLabels, buildQuestionPayload, DEFAULT_LANGUAGE } = require('../../../core/forms/FormDialogService');
const { buildSteps, locateStep } = require('../../../core/forms/FormFieldGrouping');
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
  const { step, stepIndex, totalSteps } = locateStep(fields, session.current_field_index, session.answers);
  if (!step) return { ok: true, sessionId: session.id, done: true, totalFields: totalSteps };
  const payload = await buildQuestionPayload(step, session.language);
  return { ok: true, sessionId: session.id, done: false, fieldIndex: stepIndex, totalFields: totalSteps, ...payload };
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

// Seitenvorschau vor dem eigentlichen Start (Thumbnail + Weiter/Zurück im Formular-Chat) -
// bewusst nur eingeloggt statt admin/manager (im Unterschied zu /api/form-templates/:id in
// adminFormRoutes.js), da jede Nutzerin/jeder Nutzer die Vorlage anschauen soll, bevor sie
// den Dialog startet.
router.get('/api/forms/:slug/pages', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const template = await templates.getTemplateBySlug(req.params.slug);
  if (!template || !template.active) return res.status(404).json({ error: 'Formular nicht gefunden.' });
  const pages = await templates.listPages(template.id);
  res.json({
    ok: true,
    pages: pages.map(p => ({ pageNumber: p.page_number, url: `/api/forms/${encodeURIComponent(req.params.slug)}/pages/${p.page_number}/image` })),
  });
}));

router.get('/api/forms/:slug/pages/:pageNumber/image', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });
  const template = await templates.getTemplateBySlug(req.params.slug);
  if (!template || !template.active) return res.status(404).json({ error: 'Formular nicht gefunden.' });
  const pages = await templates.listPages(template.id);
  const page = pages.find(p => p.page_number === Number(req.params.pageNumber));
  if (!page || !fs.existsSync(page.image_path)) return res.status(404).json({ error: 'Seite nicht gefunden.' });
  res.type('png').sendFile(page.image_path);
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
  const { step, stepIndex, totalSteps } = locateStep(fields, 0);
  const [payload, labels] = await Promise.all([
    buildQuestionPayload(step, language),
    translateLabels(language),
  ]);
  res.json({
    ok: true, sessionId: id, pin, done: false,
    fieldIndex: stepIndex, totalFields: totalSteps, ...payload, labels,
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
  const { step } = locateStep(fields, session.current_field_index, session.answers);
  if (!step) return res.json(await stateResponse(session, fields));
  const stepRequired = step.fields.some((f) => f.required);
  const nextIndex = session.current_field_index + step.fields.length;

  if (skip) {
    if (stepRequired) return res.status(400).json({ error: 'Dieses Feld ist ein Pflichtfeld und kann nicht übersprungen werden.' });
    await sessions.advanceField(sessionId, nextIndex);
  } else if (step.isGroup) {
    // Bei einer Auswahlgruppe schickt der Chat den field_key der angeklickten Option statt
    // Freitext (siehe formular-chat.html) - gespeichert wird nur die gewählte Option, die
    // übrigen Gruppenmitglieder bleiben ohne Antwort (FormFillService zeichnet dort kein "X").
    const chosen = step.fields.find((f) => f.field_key === String(message || '').trim());
    if (!chosen) return res.status(400).json({ error: 'Ungültige Auswahl.' });
    await sessions.saveAnswer(sessionId, chosen.field_key, 'ja', nextIndex);
  } else {
    const value = String(message || '').trim();
    if (!value) return res.status(400).json({ error: 'Keine Antwort übergeben.' });
    await sessions.saveAnswer(sessionId, step.fields[0].field_key, value, nextIndex);
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

  // Gruppenweise statt feldweise geprüft: bei einer Auswahlgruppe bekommt planmäßig nur die
  // gewählte Option eine Antwort, alle anderen Mitglieder bleiben leer (siehe /answer oben) -
  // eine feldweise Prüfung würde deshalb jede unvollständig beantwortete Gruppe fälschlich als
  // "fehlt" melden, sobald mehr als eine Option als required markiert ist.
  const missing = buildSteps(fields, session.answers).filter(
    (step) => step.fields.some((f) => f.required) && !step.fields.some((f) => session.answers[f.field_key])
  );
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
