// Ersatz für den n8n-Workflow "Workflow-Gesundheitscheck" - prüft statt n8n's Executions-API
// jetzt die eigene Job-Registry (siehe scheduler.js): ist ein Job überfällig (nie gelaufen,
// obwohl sein Intervall längst erreicht wäre) oder zuletzt fehlgeschlagen, geht eine Mail an
// alle Admins raus. Läuft selbst außerhalb der Registry (prüft sich nicht selbst).
const users = require('../core/auth/UserRepository');
const { sendReportMail } = require('../core/integrations/EmailService');
const { listRegistry } = require('./scheduler');

const SELF_NAME = 'workflowHealthCheck';

async function run() {
  const now = Date.now();
  const problems = [];

  for (const job of listRegistry()) {
    if (job.name === SELF_NAME) continue;

    if (!job.lastRunAt) {
      // Grace-Periode: 2x Intervall, damit ein Job direkt nach dem Deploy nicht sofort als
      // überfällig gilt, bevor sein erster Termin überhaupt erreicht ist.
      const grace = job.intervalMs * 2;
      const age = now - new Date(job.registeredAt).getTime();
      if (age > grace) problems.push(`- "${job.name}" (${job.schedule}): seit Registrierung noch NIE ausgeführt`);
      continue;
    }
    if (job.lastError) {
      problems.push(`- "${job.name}": letzter Lauf fehlgeschlagen (${job.lastRunAt.toISOString()}): ${job.lastError}`);
    }
  }

  if (!problems.length) return;

  const recipients = await users.listAdminEmails();
  if (!recipients.length) return;
  await sendReportMail(recipients, `Job-Alarm: ${problems.length} Problem(e)`, { text: problems.join('\n') });
}

module.exports = { run };
