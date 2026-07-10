const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { config } = require('../../shared/config');
const { getBrandConfig } = require('../../shared/config/BrandConfig');
const { htmlAttrEscape } = require('../../shared/utils/text');

// Wird von Auth (Willkommensmail) UND Speech (Transkript-Versand) genutzt,
// daher als eigenständiger Integrations-Service statt in einer der beiden Domänen.
function createTransporter() {
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS }
  });
}

function renderWelcomeText(username, password, firstName = '', lastName = '') {
  const brand = getBrandConfig();
  const template = fs.readFileSync(path.join(config.APP_ROOT, 'welcome.md'), 'utf8');
  return template
    .replace(/\{\{APP_NAME\}\}/g, brand.name)
    .replace(/\{\{APP_URL\}\}/g, config.APP_URL)
    .replace(/\{\{USERNAME\}\}/g, username)
    .replace(/\{\{PASSWORD\}\}/g, password)
    .replace(/\{\{FIRST_NAME\}\}/g, firstName)
    .replace(/\{\{LAST_NAME\}\}/g, lastName);
}

async function sendWelcomeMail(to, username, password, firstName = '', lastName = '') {
  if (!to || !config.SMTP_HOST) return;
  const brand = getBrandConfig();
  const transporter = createTransporter();
  const handbuchPath = path.join(config.APP_ROOT, `${brand.name}_Benutzerhandbuch.pdf`);
  const attachments = fs.existsSync(handbuchPath)
    ? [{ filename: `${brand.name}_Benutzerhandbuch.pdf`, path: handbuchPath }]
    : [];
  await transporter.sendMail({
    from: `${brand.name} <${config.SMTP_FROM}>`,
    to,
    subject: `Ihr ${brand.name}-Zugang`,
    text: renderWelcomeText(username, password, firstName, lastName),
    attachments
  });
}

async function sendTranscriptMail(to, originalFilename, transcriptText) {
  const brand = getBrandConfig();
  const transporter = createTransporter();
  const filename = (originalFilename || 'aufnahme').replace(/\.[^.]+$/, '') + '_Transkript.txt';
  await transporter.sendMail({
    from: `${brand.name} Transkription <${config.SMTP_FROM}>`,
    to,
    subject: `Transkript: ${originalFilename || 'Aufnahme'}`,
    text: `Hallo,\n\nanbei das Transkript deiner Aufnahme.\n\nDas Transkript kann in ${brand.name} weiterverarbeitet werden (z. B. Zusammenfassung, Protokoll).\n\nViele Grüße\n${brand.name}`,
    attachments: [{ filename, content: transcriptText, contentType: 'text/plain; charset=utf-8' }]
  });
}

async function sendTranscriptFailureMail(to, errorMessage) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `${getBrandConfig().name} Transkription <${config.SMTP_FROM}>`,
    to,
    subject: 'Transkription fehlgeschlagen',
    text: `Die Transkription deiner Aufnahme ist leider fehlgeschlagen.\n\nFehler: ${errorMessage}\n\nBitte wende dich an den Administrator.`
  });
}

async function sendSensitiveQueryReportMail(to, entries) {
  if (!to || !to.length || !config.SMTP_HOST) return;
  const brand = getBrandConfig();
  const transporter = createTransporter();
  const fmt = (ts) => new Date(ts).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

  const lines = entries.map((e) => `${fmt(e.ts)} – ${e.username} – ${e.tool} – ${e.category}`);
  const text = `Tägliche Zusammenfassung: ${brand.name} hat in den letzten 24 Stunden ${entries.length} Anfrage(n) von Standard-Nutzern (Rolle "default") mit möglicherweise besonders schützenswerten Inhalten protokolliert.\n\n` +
    `Zeitpunkt – Benutzer – Werkzeug – Kategorie\n${lines.join('\n')}\n\n` +
    `Es wird nur protokolliert, WER wann WELCHES Werkzeug mit welcher Kategorie genutzt hat – nicht der Inhalt der Anfrage selbst.\n\n` +
    `Details: Benutzerverwaltung → Protokoll sensibler Anfragen.`;

  const rows = entries.map((e) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;white-space:nowrap">${htmlAttrEscape(fmt(e.ts))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${htmlAttrEscape(e.username)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151">${htmlAttrEscape(e.tool)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px"><span style="background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600">${htmlAttrEscape(e.category)}</span></td>
    </tr>`).join('');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#15294a">
  <div style="background:#14306b;border-radius:12px 12px 0 0;padding:18px 24px">
    <h1 style="margin:0;font-size:16px;color:#fff;font-weight:700">${htmlAttrEscape(brand.name)} – Tägliche Zusammenfassung sensibler Anfragen</h1>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:20px 24px">
    <p style="font-size:14px;line-height:1.5;margin:0 0 16px">
      In den letzten 24 Stunden wurden <strong>${entries.length}</strong> Anfrage(n) von Standard-Nutzern (Rolle „default") mit möglicherweise besonders schützenswerten Inhalten protokolliert.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;border-bottom:2px solid #e5e7eb">Zeitpunkt</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;border-bottom:2px solid #e5e7eb">Benutzer</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;border-bottom:2px solid #e5e7eb">Werkzeug</th>
          <th style="text-align:left;padding:8px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;border-bottom:2px solid #e5e7eb">Kategorie</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:12px;line-height:1.6;color:#6b7280;margin:0 0 8px">
      Es wird nur protokolliert, <strong>wer wann welches Werkzeug</strong> mit welcher Kategorie genutzt hat – <strong>nicht der Inhalt der Anfrage selbst.</strong>
    </p>
    <p style="font-size:12px;color:#9ca3af;margin:0">Details: Benutzerverwaltung → Protokoll sensibler Anfragen.</p>
  </div>
</div>`;

  await transporter.sendMail({
    from: `${brand.name} <${config.SMTP_FROM}>`,
    to,
    subject: `${brand.name}: Tägliche Zusammenfassung sensibler Anfragen (${entries.length})`,
    text,
    html
  });
}

module.exports = { sendWelcomeMail, sendTranscriptMail, sendTranscriptFailureMail, sendSensitiveQueryReportMail };
