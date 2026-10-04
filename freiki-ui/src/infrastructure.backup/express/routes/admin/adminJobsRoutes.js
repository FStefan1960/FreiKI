const express = require('express');
const fs = require('fs');
const path = require('path');
const { config } = require('../../../../shared/config');
const jobsScheduler = require('../../../../jobs/scheduler');
const auditLog = require('../../../../core/audit/AdminAuditRepository');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');

const router = express.Router();

// ── Native Berichts-Jobs (Ersatz für die entsprechenden n8n-Workflows, siehe src/jobs/) ──
router.get('/api/admin/jobs', (req, res) => {
  res.json({ jobs: jobsScheduler.listRegistry() });
});

router.post('/api/admin/jobs/:name/run', asyncHandler(async (req, res) => {
  try {
    await jobsScheduler.runNow(req.params.name);
    auditLog.log(req.admin, 'job.manual_run', { name: req.params.name });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

// ── Medienspiegel / Gesellschaftstrends / Tageslosung: Admin-seitiges Schreiben ──
router.post('/api/admin/medienspiegel', (req, res) => {
  const { html, date } = req.body || {};
  if (!html) return res.status(400).json({ error: 'html fehlt' });
  try {
    fs.writeFileSync(path.join(config.APP_ROOT, 'medienspiegel.json'),
      JSON.stringify({ date: date || new Date().toISOString().slice(0, 10), html }));
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Interner Fehler' }); }
});

router.post('/api/admin/gesellschaftstrends', (req, res) => {
  const { html, date } = req.body || {};
  if (!html) return res.status(400).json({ error: 'html fehlt' });
  try {
    fs.writeFileSync(path.join(config.APP_ROOT, 'gesellschaftstrends.json'),
      JSON.stringify({ date: date || new Date().toISOString().slice(0, 10), html }));
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Interner Fehler' }); }
});

router.post('/api/admin/losung', (req, res) => {
  const { date, losung, losungRef, lehrtext, lehrtextRef, gedanken } = req.body || {};
  if (!losung || !lehrtext) return res.status(400).json({ error: 'losung/lehrtext fehlt' });
  try {
    fs.writeFileSync(path.join(config.APP_ROOT, 'losung.json'), JSON.stringify({
      date: date || new Date().toISOString().slice(0, 10),
      losung, losungRef, lehrtext, lehrtextRef, gedanken
    }));
    res.json({ ok: true });
  } catch (e) { console.error(e.message); res.status(500).json({ error: 'Interner Fehler' }); }
});

module.exports = router;
