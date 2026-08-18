// Ersatz für den n8n-Workflow "NINA-Warnungen" - stündlicher Check der amtlichen
// Gefahrenwarnungen (warnung.bund.de) für den in .env hinterlegten Amtlichen
// Gemeindeschlüssel (AGS). Ohne NINA_WARN_AGS/RECIPIENTS überspringt sich der Job selbst.
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
const { sendReportMail } = require('../core/integrations/EmailService');

async function run() {
  if (!config.NINA_WARN_AGS || !config.NINA_WARN_RECIPIENTS.length) return;

  const url = `https://warnung.bund.de/api31/dashboard/${config.NINA_WARN_AGS}.json`;
  const r = await fetchWithTimeout(url, {}, 15000);
  if (!r.ok) throw new Error(`NINA-API HTTP ${r.status}`);
  const items = await r.json();

  const warnungen = (Array.isArray(items) ? items : [])
    .filter(item => item.payload && item.payload.data)
    .map(item => {
      const d = item.payload.data;
      const titel = d.headline || d.event || 'Unbekannte Warnung';
      const beschr = d.description ? d.description.slice(0, 200) : '';
      const severity = d.severity || '';
      return `🚨 NINA [${severity}]: ${titel}${beschr ? ' – ' + beschr : ''}`;
    });
  if (!warnungen.length) return;

  const timeStr = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const liItems = warnungen.map(w => `<li style="margin:8px 0;padding:8px;background:#fdecea;border-left:4px solid #e74c3c;border-radius:4px">${w}</li>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#333">
  <div style="background:#e74c3c;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:20px">🚨 NINA Gefahrenwarnung</h1>
    <p style="margin:4px 0 0;opacity:0.85;font-size:13px">${timeStr}</p>
  </div>
  <div style="background:#f9f9f9;padding:24px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">Folgende NINA-Warnungen liegen vor:</p>
    <ul style="padding-left:0;list-style:none;margin:0">${liItems}</ul>
  </div>
</div>`;

  await sendReportMail(config.NINA_WARN_RECIPIENTS, `🚨 NINA-Warnung: ${warnungen.length} Meldung(en) – ${timeStr}`, { html });
}

module.exports = { run };
