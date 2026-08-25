// Ersatz für den Statistik-Teil von "KorKI Tagesbericht v2 (akkumuliert)" - eigenständiger Flow.
// recordChatEvent() wird direkt aus ChatService.js aufgerufen (vorher: Fire-and-forget-POST an
// einen n8n-Webhook). "chats" wird nach jedem Bericht auf den aktuellen Tag zurückgestutzt,
// "chatsGesamt" wächst unbegrenzt (Nutzungshistorie).
const fs = require('fs');
const path = require('path');
const { config } = require('../shared/config');
const users = require('../core/auth/UserRepository');
const { sendReportMail } = require('../core/integrations/EmailService');
const { getBrandConfig } = require('../shared/config/BrandConfig');

const STATE_PATH = path.join(config.APP_ROOT, 'usage-state.json');
const SYSTEM_USERS = ['n8n', 'system', 'webhook', 'test', 'unknown', 'healthcheck'];
function isSystemUser(name) {
  return SYSTEM_USERS.includes((name || '').toLowerCase());
}

// Historische Einträge tragen den Werkzeug-Titel, der zum Zeitpunkt der Anfrage galt (siehe
// recordChatEvent) - bei einer Umbenennung/Zusammenlegung von Modi taucht ein Werkzeug sonst
// dauerhaft als zwei getrennte Balken in der Statistik auf. Alte Titel hier auf den aktuellen
// mappen, damit Alt- und Neu-Daten in allen Auswertungen (Dashboard + Tagesbericht) zusammen
// gezählt werden, ohne usage-state.json rückwirkend anfassen zu müssen.
const LEGACY_TOOL_TITLES = {
  'Bild (Experimentell)': 'Bilder generieren',
  'Bild (Exp.)': 'Bilder generieren',
  'Bild': 'Bilder generieren',
  'Übersetzen nach ...': 'Übersetzen',
};
function normalizeToolLabel(label) {
  return LEGACY_TOOL_TITLES[label] || label;
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { chats: parsed.chats || [], chatsGesamt: parsed.chatsGesamt || [] };
  } catch { return { chats: [], chatsGesamt: [] }; }
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state));
}

async function recordChatEvent(payload) {
  const state = loadState();
  const entry = {
    user: payload.user || 'unknown',
    mode: payload.mode || 'unknown',
    title: payload.title || payload.mode || 'unknown',
    hasFile: !!payload.hasFile,
    timestamp: payload.timestamp || new Date().toISOString(),
  };
  state.chats.push(entry);
  state.chatsGesamt.push(entry);
  saveState(state);
}

function buildMatrixHtml(userWorkspace) {
  const th = (t, extra = '') => `<th style="padding:8px 12px;background:#1E3A8A;color:#fff;font-size:12px;font-weight:600;text-align:left;white-space:nowrap;${extra}">${t}</th>`;
  const td = (t, extra = '') => `<td style="padding:7px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;${extra}">${t}</td>`;
  const usersList = Object.keys(userWorkspace).sort();
  const workspaces = [...new Set(usersList.flatMap(u => Object.keys(userWorkspace[u])))].sort();
  if (!usersList.length || !workspaces.length) return '<p style="color:#6b7280;font-size:13px;margin:8px 0;">Keine Nutzungsdaten vorhanden.</p>';
  const header = `<tr>${th('Benutzer')}${workspaces.map(w => th(w)).join('')}${th('Gesamt', 'background:#0f2460;')}</tr>`;
  const rows = usersList.map((user, i) => {
    const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
    const gesamt = workspaces.reduce((s, w) => s + (userWorkspace[user][w] || 0), 0);
    const cells = workspaces.map(w => {
      const val = userWorkspace[user][w] || 0;
      return td(val > 0 ? `<strong>${val}</strong>` : '–', `background:${bg};color:${val > 0 ? '#1E3A8A' : '#d1d5db'};`);
    });
    return `<tr>${td(`<strong>${user}</strong>`, `background:${bg};`)}${cells.join('')}${td(`<strong>${gesamt}</strong>`, `background:${bg};color:#1E3A8A;`)}</tr>`;
  });
  const sumRow = workspaces.map(w => usersList.reduce((s, u) => s + (userWorkspace[u][w] || 0), 0));
  const gesamtGesamt = sumRow.reduce((a, b) => a + b, 0);
  const sumCells = sumRow.map(v => td(`<strong>${v}</strong>`, 'background:#eef2ff;color:#1E3A8A;'));
  const sumRowHtml = `<tr>${td('<strong>Gesamt</strong>', 'background:#eef2ff;font-weight:700;')}${sumCells.join('')}${td(`<strong>${gesamtGesamt}</strong>`, 'background:#dbeafe;color:#1E3A8A;font-weight:700;')}</tr>`;
  return `<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);"><thead>${header}</thead><tbody>${rows.join('')}${sumRowHtml}</tbody></table>`;
}

function buildUserWorkspace(chats) {
  const uw = {};
  chats.forEach(c => {
    const user = c.user || 'unbekannt';
    const label = normalizeToolLabel(c.title || c.mode || '?');
    if (!uw[user]) uw[user] = {};
    uw[user][label] = (uw[user][label] || 0) + 1;
  });
  return uw;
}

// Für das In-App-Admin-Dashboard: liefert die gleichen Rohdaten wie run()/buildMatrixHtml,
// aber als JSON statt HTML-Mail, gefiltert auf einen wählbaren Zeitraum. chatsGesamt ist die
// einzige Quelle mit Tool-Zuordnung (chat_log in Postgres hat nur ts+user_id, siehe
// ChatRepository.getTodayStats) - für Dutzende/wenige Tausend Einträge ist ein synchrones
// JSON-Parsing pro Request unkritisch.
function getHistoricalStats(days = 30) {
  const state = loadState();
  const allTime = state.chatsGesamt.filter(c => !isSystemUser(c.user));
  const cutoff = Date.now() - days * 86400000;
  const inRange = allTime.filter(c => c.timestamp && new Date(c.timestamp).getTime() >= cutoff);

  // Auch Tage ohne Aktivität mit 0 auffüllen, damit der Balken-Verlauf lückenlos bleibt.
  const dailyMap = {};
  for (let i = days - 1; i >= 0; i--) {
    dailyMap[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = 0;
  }
  inRange.forEach(c => {
    const day = c.timestamp.slice(0, 10);
    if (day in dailyMap) dailyMap[day] += 1;
  });
  const daily = Object.keys(dailyMap).sort().map(date => ({ date, count: dailyMap[date] }));

  const toolCounts = {};
  inRange.forEach(c => { const label = normalizeToolLabel(c.title || c.mode || '?'); toolCounts[label] = (toolCounts[label] || 0) + 1; });
  const byTool = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).map(([title, count]) => ({ title, count }));

  const uw = buildUserWorkspace(inRange);
  const byUser = Object.keys(uw)
    .map(user => ({ user, total: Object.values(uw[user]).reduce((s, v) => s + v, 0), byTool: uw[user] }))
    .sort((a, b) => b.total - a.total);

  return {
    days,
    totals: {
      requests: inRange.length,
      users: byUser.length,
      withFile: inRange.filter(c => c.hasFile).length,
    },
    daily,
    byTool,
    byUser,
    allTime: {
      requests: allTime.length,
      users: new Set(allTime.map(c => c.user)).size,
      since: allTime[0]?.timestamp || null,
    },
  };
}

// Baut die Tagesbericht-Mail aus bereits gefilterten Daten - von run() (echter Versand, danach
// Tagespuffer geprunt) UND buildDailyReportPreview() (read-only, für die Admin-Vorschau) genutzt,
// damit beide exakt dasselbe Layout erzeugen und nicht auseinanderlaufen.
function buildReportHtml(chatsHeute, chatsGesamt) {
  const nutzerSet = [...new Set(chatsHeute.map(c => c.user))];
  const werkzeuge = {};
  chatsHeute.forEach(c => { const label = normalizeToolLabel(c.title || c.mode); werkzeuge[label] = (werkzeuge[label] || 0) + 1; });
  const topWerkzeug = Object.entries(werkzeuge).sort((a, b) => b[1] - a[1])[0];

  const h2 = txt => `<h2 style="font-size:15px;color:#1E3A8A;border-bottom:2px solid #bfdbfe;padding-bottom:6px;margin:20px 0 12px;">${txt}</h2>`;
  const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const appName = getBrandConfig().name;
  const html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#0e0f0f;">
  <div style="background:linear-gradient(135deg,#1E3A8A,#2B9CD8);padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:20px;">📊 Nutzungs-Statistik</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${datum} – ${chatsHeute.length} Gespräche, ${nutzerSet.length} Nutzer${topWerkzeug ? `, meistgenutzt: ${topWerkzeug[0]} (${topWerkzeug[1]}×)` : ''}</p>
  </div>
  <div style="background:#fff;padding:24px 28px;border:1px solid #e5e7eb;border-top:none;">
    ${h2('Heute – Benutzer &amp; Werkzeug')}
    ${buildMatrixHtml(buildUserWorkspace(chatsHeute))}
    ${h2('Gesamt – Benutzer &amp; Werkzeug')}
    <div id="matrix-gesamt">${buildMatrixHtml(buildUserWorkspace(chatsGesamt))}</div>
  </div>
  <div style="background:#f8fafc;padding:12px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;font-size:11px;color:#9ca3af;text-align:center;">${appName} · Automatisch generiert</div>
</div>`;

  return { html, subject: `${appName} Nutzungs-Statistik – ${datum}` };
}

function splitTodayBuffers(state) {
  const heute = new Date().toISOString().slice(0, 10);
  const gestern = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const chatsHeute = state.chats.filter(c =>
    c.timestamp && (c.timestamp.startsWith(gestern) || c.timestamp.startsWith(heute)) &&
    !isSystemUser(c.user)
  );
  const chatsGesamt = state.chatsGesamt.filter(c => !isSystemUser(c.user));
  return { gestern, chatsHeute, chatsGesamt };
}

async function run() {
  const state = loadState();
  const { gestern, chatsHeute, chatsGesamt } = splitTodayBuffers(state);

  // Nur gestrige Chats aus dem Tagespuffer entfernen, chatsGesamt bleibt für immer.
  state.chats = state.chats.filter(c => !c.timestamp || !c.timestamp.startsWith(gestern));
  saveState(state);

  if (!chatsHeute.length) return; // nichts zu berichten

  const { html, subject } = buildReportHtml(chatsHeute, chatsGesamt);
  const recipients = await users.listAdminEmails();
  if (!recipients.length) return;
  await sendReportMail(recipients, subject, { html });
}

// Admin-Vorschau (siehe adminRoutes.js) - rein lesend: im Gegensatz zu run() wird der
// Tagespuffer NICHT geprunt und keine Mail verschickt, sonst würde ein Vorschau-Klick echte
// Daten aus dem nächsten automatischen Bericht entfernen.
function buildDailyReportPreview() {
  const state = loadState();
  const { chatsHeute, chatsGesamt } = splitTodayBuffers(state);
  return buildReportHtml(chatsHeute, chatsGesamt);
}

module.exports = { recordChatEvent, run, getHistoricalStats, buildDailyReportPreview, isSystemUser };
