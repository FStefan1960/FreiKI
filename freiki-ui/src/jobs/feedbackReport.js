// Ersatz für den Feedback-Teil von "KorKI Tagesbericht v2 (akkumuliert)" - eigenständiger Flow.
// recordFeedback() wird direkt aus chatRoutes.js aufgerufen (vorher: Fire-and-forget-POST an
// einen n8n-Webhook). Feedback-Texte werden nie gelöscht (Gesamt-Historie), nur für den
// "heute"-Teil des Berichts gefiltert.
const fs = require('fs');
const path = require('path');
const { config } = require('../shared/config');
const users = require('../core/auth/UserRepository');
const { sendReportMail } = require('../core/integrations/EmailService');
const { getBrandConfig } = require('../shared/config/BrandConfig');

const STATE_PATH = path.join(config.APP_ROOT, 'feedback-state.json');

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { feedbacks: parsed.feedbacks || [] };
  } catch { return { feedbacks: [] }; }
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state));
}

async function recordFeedback(payload) {
  const state = loadState();
  state.feedbacks.push({
    user: payload.user || 'unknown',
    type: payload.type || 'feedback',
    rating: payload.rating || null,
    text: payload.text || payload.message || null,
    timestamp: payload.timestamp || new Date().toISOString(),
  });
  saveState(state);
}

function buildFeedbackHtml(texte, mitDatum) {
  if (!texte.length) return '<p style="color:#6b7280;font-size:13px;font-style:italic;">Kein schriftliches Feedback in diesem Zeitraum.</p>';
  const typeColor = { wish: '#7c3aed', idea: '#0891b2', feedback: '#065f46' };
  const items = texte.map(f => {
    const color = typeColor[(f.type || '').toLowerCase()] || '#374151';
    const badge = `<span style="display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;background:${color}20;color:${color};margin-right:6px;">${f.type}</span>`;
    const meta = mitDatum
      ? `<span style="font-size:11px;color:#9ca3af;margin-left:6px;">— ${f.user} · ${f.timestamp.slice(0, 10)}</span>`
      : `<span style="font-size:11px;color:#9ca3af;margin-left:6px;">— ${f.user}</span>`;
    return `<li style="margin-bottom:10px;font-size:13px;color:#374151;">${badge}${f.text}${meta}</li>`;
  }).join('');
  return `<ul style="margin:0;padding-left:18px;list-style:none;">${items}</ul>`;
}

function avgRating(feedbacks) {
  const ratings = feedbacks.filter(f => f.type === 'rating' && f.rating);
  if (!ratings.length) return { avg: '–', count: 0 };
  const avg = (ratings.reduce((s, f) => s + parseInt(f.rating, 10), 0) / ratings.length).toFixed(1);
  return { avg, count: ratings.length };
}

async function run() {
  const state = loadState();
  const heute = new Date().toISOString().slice(0, 10);
  const gestern = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const heuteFeedbacks = state.feedbacks.filter(f => f.timestamp && (f.timestamp.startsWith(gestern) || f.timestamp.startsWith(heute)));
  const heuteTexte = heuteFeedbacks.filter(f => f.type !== 'rating' && f.text);
  const gesamtTexte = state.feedbacks.filter(f => f.type !== 'rating' && f.text);
  const heuteRating = avgRating(heuteFeedbacks);
  const gesamtRating = avgRating(state.feedbacks);

  if (!heuteTexte.length && !heuteRating.count) return; // nichts Neues, keine Mail

  const h2 = txt => `<h2 style="font-size:15px;color:#1E3A8A;border-bottom:2px solid #bfdbfe;padding-bottom:6px;margin:20px 0 12px;">${txt}</h2>`;
  const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const appName = getBrandConfig().name;
  const html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#0e0f0f;">
  <div style="background:linear-gradient(135deg,#1E3A8A,#2B9CD8);padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:20px;">💬 Feedback-Bericht</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${datum}</p>
  </div>
  <div style="background:#fff;padding:24px 28px;border:1px solid #e5e7eb;border-top:none;">
    ${h2('Heute')}
    <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">⭐ Ø ${heuteRating.avg} / 4 (${heuteRating.count} Bewertungen)</p>
    ${buildFeedbackHtml(heuteTexte, false)}
    ${h2('Gesamt')}
    <p style="font-size:12px;color:#6b7280;margin:0 0 8px;">⭐ Ø ${gesamtRating.avg} / 4 (${gesamtRating.count} Bewertungen · ${gesamtTexte.length} Text-Feedbacks insgesamt)</p>
    ${buildFeedbackHtml(gesamtTexte, true)}
  </div>
  <div style="background:#f8fafc;padding:12px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;font-size:11px;color:#9ca3af;text-align:center;">${appName} · Automatisch generiert</div>
</div>`;

  const recipients = await users.listAdminEmails();
  if (!recipients.length) return;
  await sendReportMail(recipients, `${appName} Feedback-Bericht – ${datum}`, { html });
}

module.exports = { recordFeedback, run };
