const express = require('express');
const { adminSession } = require('../../../core/auth/AuthMiddleware');
const { renderAdminConfigPage } = require('./admin/AdminConfigPage');

// Aufgeteilt in fachliche Module unter ./admin/ (Branding/Config, Prompt-Editor,
// Nutzerverwaltung, Statistik/Audit, native Berichts-Jobs) - vorher eine einzelne
// ~860-Zeilen-Datei. Der Auth-Gate (requireAdmin) und die eine bewusst öffentliche
// Route (GET /admin/config) bleiben hier, weil beide vor dem Mounten der Submodule
// feststehen müssen (siehe Kommentar bei router.use('/admin', requireAdmin) unten).
const router = express.Router();
router.use(['/admin', '/api/admin'], express.json({ limit: '256kb' }));

// ── Admin: editierbare Konfigurations-Seite ──────────────────
// Die Seite selbst (GET) bleibt öffentlich erreichbar, rendert aber KEINE
// Konfigurationswerte mehr server-seitig - die lädt load() erst per fetch() nach
// (Session-Cookie wird automatisch mitgeschickt). So bleibt mattermostUrl/paperlessUrl
// etc. tatsächlich hinter requireAdmin, ohne dass die Seite für normale
// Browser-Navigation unerreichbar wird (siehe requireAdmin-Kommentar unten).
router.get('/admin/config', (req, res) => {
  res.type('html').send(renderAdminConfigPage(req.query.saved === '1'));
});

function requireAdmin(req, res, next) {
  const admin = adminSession(req);
  if (!admin) return res.status(403).json({ error: 'Nur für Administratoren' });
  req.admin = admin;
  next();
}
// Auf /admin und /api/admin beschränkt statt router.use(requireAdmin) ohne Pfad: dieser
// Router hängt in app.js an der Wurzel (app.use(require('./routes/adminRoutes'))), ein
// pfadloses .use() hätte JEDEN Request blockiert, der keine der obigen Routen matcht -
// also auch /api/health, /api/chat etc. aus ganz anderen Routendateien.
router.use('/admin', requireAdmin);
router.use('/api/admin', requireAdmin);

router.use(require('./admin/adminBrandRoutes'));
router.use(require('./admin/adminPromptRoutes'));
router.use(require('./admin/adminUserRoutes'));
router.use(require('./admin/adminStatsRoutes'));
router.use(require('./admin/adminJobsRoutes'));

module.exports = router;
