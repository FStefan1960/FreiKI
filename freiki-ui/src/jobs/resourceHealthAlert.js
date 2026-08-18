// Ersatz für den n8n-Workflow "Disk & Memory Alert" - nutzt computeReadiness() direkt statt
// eines Self-HTTP-Calls gegen /api/health, das absichtlich nur minimale Daten öffentlich
// zurückgibt (siehe healthRoutes.js). Der n8n-Workflow rief genau diesen Endpunkt auf und
// bekam disk/memory/checks nie geliefert - der Alert dürfte seit der Härtung von /api/health
// nie mehr ausgelöst haben, unabhängig vom tatsächlichen Ressourcenstand.
const { computeReadiness } = require('../infrastructure/express/routes/healthRoutes');
const users = require('../core/auth/UserRepository');
const { sendReportMail } = require('../core/integrations/EmailService');

const SERVICE_LABELS = { vllm: 'vLLM', postgres: 'Postgres', paperless: 'Paperless', whisper: 'Whisper' };

async function run() {
  const { body } = await computeReadiness();
  const alerts = [];

  if (body.disk) {
    const pct = body.disk.usedPercent || 0;
    if (pct > 85) alerts.push(`🚨 Disk: ${pct.toFixed(1)}% belegt (${body.disk.used} / ${body.disk.total})`);
    else if (pct > 70) alerts.push(`⚠️ Disk: ${pct.toFixed(1)}% belegt`);
  }

  if (body.memory) {
    const pct = (body.memory.used / body.memory.total) * 100;
    if (pct > 90) alerts.push(`🚨 RAM: ${pct.toFixed(1)}% belegt`);
    else if (pct > 80) alerts.push(`⚠️ RAM: ${pct.toFixed(1)}% belegt`);
  }

  for (const [key, label] of Object.entries(SERVICE_LABELS)) {
    const c = body.checks?.[key];
    if (c && c.ok === false) alerts.push(`🚨 ${label}: nicht erreichbar (${c.error || 'Status ' + c.status})`);
  }

  if (!alerts.length) return;

  const recipients = await users.listAdminEmails();
  if (!recipients.length) return;
  await sendReportMail(recipients, '🔔 Ressourcen-Alert', { text: alerts.join('\n') });
}

module.exports = { run };
