const express = require('express');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { config, validateEnv } = require('../../shared/config');
const { getBrandConfig, loadBrandConfig } = require('../../shared/config/BrandConfig');
const { errorHandler } = require('../../shared/utils/errors');
const { securityHeaders, apiLimiter, require2FASetupComplete } = require('./middlewares/security');
const { startUploadCleanupSchedule } = require('../storage/FileStorage');
const { startJobs } = require('../../jobs');
const pool = require('../database/postgres/pool');
const chatRepo = require('../../core/chat/ChatRepository');
const auditLog = require('../../core/audit/AdminAuditRepository');
const sensitiveLog = require('../../core/audit/SensitiveQueryLog');
const users = require('../../core/auth/UserRepository');
const webauthnCreds = require('../../core/auth/WebauthnCredentialRepository');
const formTemplates = require('../../core/forms/FormTemplateRepository');
const formSessions = require('../../core/forms/FormSessionRepository');
const pptxTemplates = require('../../core/documents/PptxTemplateRepository');

validateEnv();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // hinter Caddy
app.use(securityHeaders);
app.use(cookieParser());
app.use('/api/', apiLimiter, require2FASetupComplete);

// Eigenständige Routen (Reihenfolge wichtig: müssen VOR express.static stehen,
// damit z.B. '/' und '/sw.js' vom Brand-Template statt der statischen Datei bedient werden).
app.use(require('./routes/brandRoutes').router);
app.use(require('./routes/adminRoutes'));
app.use(express.static(config.PUBLIC_DIR));

app.use(require('./routes/chatRoutes'));
app.use(require('./routes/authRoutes'));
app.use(require('./routes/documentRoutes'));
app.use(require('./routes/excelRoutes'));
app.use(require('./routes/formRoutes'));
app.use(require('./routes/adminFormRoutes'));
app.use(require('./routes/speechRoutes'));
app.use(require('./routes/paperlessRoutes'));
app.use(require('./routes/oidcRoutes'));
app.use(require('./routes/extrasRoutes'));
app.use(require('./routes/scannerRoutes'));
app.use(require('./routes/healthRoutes'));
// Öffentliches Anmeldeformular nur, wo per APP_SELF_REGISTRATION=true aktiviert - siehe
// registrationRoutes.js. Ungated wäre jede Instanz (auch die öffentliche Demo) sofort offen.
if (getBrandConfig().selfRegistration) app.use(require('./routes/registrationRoutes'));

app.use(errorHandler);

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception – beende Prozess:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection – beende Prozess:', reason);
  process.exit(1);
});

async function start() {
  // DB-Verbindung prüfen bevor der Server startet
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
  } catch (e) {
    console.error(`FATAL: Keine DB-Verbindung (${config.PG_HOST}): ${e.message}`);
    process.exit(1);
  }

  await chatRepo.ensureSchema();
  await auditLog.ensureSchema();
  await sensitiveLog.ensureSchema();
  await users.ensureSchema();
  await webauthnCreds.ensureSchema();
  await formTemplates.ensureSchema();
  await formSessions.ensureSchema();
  await pptxTemplates.ensureSchema();
  fs.mkdirSync(config.FORM_TEMPLATES_DIR, { recursive: true });
  fs.mkdirSync(config.PPTX_UPLOAD_DIR, { recursive: true });
  await loadBrandConfig();
  startUploadCleanupSchedule();
  sensitiveLog.startDailyReportSchedule();
  sensitiveLog.startRetentionPurgeSchedule();
  auditLog.startRetentionPurgeSchedule();
  formSessions.startFormSessionPurgeSchedule();
  startJobs();

  app.listen(config.PORT, () => console.log(`${getBrandConfig().name} UI läuft auf Port ${config.PORT}`));
}

module.exports = { app, start };
