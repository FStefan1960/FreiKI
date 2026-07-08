const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { config } = require('../../shared/config');
const { getBrandConfig } = require('../../shared/config/BrandConfig');

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

module.exports = { sendWelcomeMail, sendTranscriptMail, sendTranscriptFailureMail };
