// Ersatz für den n8n-Workflow "Monitoring – Täglicher Report". Prüft die intern erreichbaren
// Kern-Dienste (Docker-Compose-Servicenamen) + Paperless-Zähler, verschickt eine HTML-Mail.
// Mattermost/Paperless nur, wenn für die Instanz konfiguriert.
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
const { sendReportMail } = require('../core/integrations/EmailService');
const { getBrandConfig } = require('../shared/config/BrandConfig');
const users = require('../core/auth/UserRepository');

function services() {
  const list = [
    { name: `${getBrandConfig().name} App`, url: `http://127.0.0.1:${config.PORT}/api/brand` },
  ];
  if (config.N8N_URL) list.push({ name: 'n8n', url: 'http://n8n:5678/healthz' });
  if (config.MATTERMOST_URL) list.push({ name: 'Mattermost', url: 'http://mattermost:8065/api/v4/system/ping' });
  if (config.WHISPER_URL) list.push({ name: 'Whisper', url: `${config.WHISPER_URL}/` });
  return list;
}

async function checkService(url) {
  try {
    const r = await fetchWithTimeout(url, {}, 5000);
    return r.ok;
  } catch {
    return false;
  }
}

async function run() {
  const statusLines = [];
  for (const s of services()) {
    const ok = await checkService(s.url);
    statusLines.push((ok ? '✅' : '❌') + ' ' + s.name);
  }

  let paperlessHtml = '';
  if (config.PAPERLESS_TOKEN) {
    try {
      const headers = { Authorization: `Token ${config.PAPERLESS_TOKEN}` };
      const countRes = await fetchWithTimeout(`${config.PAPERLESS_INTERNAL_URL}/api/documents/?page_size=1`, { headers }, 10000);
      const countData = countRes.ok ? await countRes.json() : { count: 0 };
      const tagsRes = await fetchWithTimeout(`${config.PAPERLESS_INTERNAL_URL}/api/tags/?page_size=100`, { headers }, 10000);
      const tags = tagsRes.ok ? (await tagsRes.json()).results || [] : [];
      const readyTag = tags.find(t => t.name === 'ready-for-rag');
      const notYetTag = tags.find(t => t.name === 'not-yet-tagged');
      paperlessHtml = `<p><strong>Paperless:</strong><br>Dokumente gesamt: <strong>${countData.count || 0}</strong><br>`;
      if (readyTag) paperlessHtml += `Ausstehend (ready-for-rag): <strong>${readyTag.document_count ?? 0}</strong><br>`;
      if (notYetTag) paperlessHtml += `Zu taggen (not-yet-tagged): <strong>${notYetTag.document_count ?? 0}</strong><br>`;
      paperlessHtml += '</p>';
    } catch (e) {
      paperlessHtml = `<p><strong>Paperless:</strong> Abfrage fehlgeschlagen (${e.message})</p>`;
    }
  }

  const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const appName = getBrandConfig().name;
  const html = `<h3>📊 ${appName} System-Report – ${now}</h3>`
    + `<p><strong>Services:</strong><br>${statusLines.join('<br>')}</p>`
    + paperlessHtml;

  const recipients = await users.listAdminEmails();
  if (!recipients.length) return;
  await sendReportMail(recipients, `${appName} Tagesbericht`, { html });
}

module.exports = { run };
