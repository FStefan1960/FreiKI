const express = require('express');
const fetch = require('node-fetch');
const { config } = require('../../../../shared/config');
const { getBrandConfig } = require('../../../../shared/config/BrandConfig');
const chatRepo = require('../../../../core/chat/ChatRepository');
const auditLog = require('../../../../core/audit/AdminAuditRepository');
const sensitiveLog = require('../../../../core/audit/SensitiveQueryLog');
const usageStatsReport = require('../../../../jobs/usageStatsReport');
const feedbackReport = require('../../../../jobs/feedbackReport');
const gpuMetricsReport = require('../../../../jobs/gpuMetricsReport');
const { asyncHandler } = require('../../../../shared/utils/asyncHandler');

const router = express.Router();

// ── Tages-Statistiken (Admin-Widget) ─────────────────────────
const gpuCache = { live: 0, peak: 0, peakDate: '' };

async function pollGpuCache() {
  try {
    // VLLM_URL zeigt auf die Chat-API (z.B. ".../v1") - die Prometheus-Metriken liegen
    // unauthentifiziert am Server-Root, daher hier auf die Origin zurueckschneiden.
    const metricsUrl = `${new URL(config.VLLM_URL).origin}/metrics`;
    const r = await fetch(metricsUrl, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return;
    const text = await r.text();
    // vLLM hat die Metrik mit v0.24 von "gpu_cache_usage_perc" auf "kv_cache_usage_perc"
    // umbenannt (Postmortem 2026-07-16) - beide Namen abdecken, optionale Prometheus-Labels
    // ("{...}") vor dem Wert zulassen.
    const match = text.match(/vllm:(?:kv|gpu)_cache_usage_perc(?:\{[^}]*\})?\s+([\d.]+)/);
    if (match) {
      const val = parseFloat(match[1]) * 100;
      gpuCache.live = val;
      const today = new Date().toDateString();
      if (today !== gpuCache.peakDate) { gpuCache.peak = 0; gpuCache.peakDate = today; }
      if (val > gpuCache.peak) gpuCache.peak = val;
    }
  } catch (_) {}
}
setInterval(pollGpuCache, 60_000).unref();
pollGpuCache();

router.get('/api/admin/stats', asyncHandler(async (req, res) => {
  try {
    const stats = await chatRepo.getTodayStats();
    res.json({
      ...stats,
      gpuCacheLive: Math.round(gpuCache.live * 10) / 10,
      gpuCachePeak: Math.round(gpuCache.peak * 10) / 10,
    });
  } catch (e) {
    res.status(500).json({ error: 'DB-Fehler' });
  }
}));

// Quicklinks zu Infrastruktur-Diensten (Beszel, Uptime Kuma, n8n, Dozzle, Portainer,
// Swagger, Paperless, Mattermost) für die Nutzungsstatistik-Seite. Nur konfigurierte
// URLs (nicht-leer) werden zurückgegeben, damit auf Instanzen ohne z.B. Portainer
// einfach kein Button erscheint statt auf einen toten Link zu zeigen.
router.get('/api/admin/service-links', (req, res) => {
  const brand = getBrandConfig();
  const links = [
    { key: 'n8n', label: 'n8n', hint: 'Automatisierung', url: config.N8N_URL },
    { key: 'paperless', label: 'Paperless', hint: 'Dokumente', url: process.env.PAPERLESS_ADMIN_URL || brand.paperlessUrl },
    { key: 'mattermost', label: 'Mattermost', hint: 'Team-Chat', url: brand.mattermostUrl },
    { key: 'kuma', label: 'Uptime Kuma', hint: 'Verfügbarkeit', url: config.UPTIME_KUMA_URL },
    { key: 'beszel', label: 'Beszel', hint: 'Server-/GPU-Metriken', url: config.BESZEL_HUB_URL },
    { key: 'dozzle', label: 'Dozzle', hint: 'Container-Logs', url: config.DOZZLE_URL },
    { key: 'portainer', label: 'Portainer', hint: 'Container-Verwaltung', url: config.PORTAINER_URL },
    { key: 'swagger', label: 'Swagger', hint: 'API-Doku', url: config.SWAGGER_URL },
  ].filter(l => l.url);
  res.json({ links });
});

router.get('/api/admin/usage-history', (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  try {
    res.json(usageStatsReport.getHistoricalStats(days));
  } catch (e) {
    res.status(500).json({ error: 'Statistik konnte nicht geladen werden' });
  }
});

router.get('/api/admin/audit-log', asyncHandler(async (req, res) => {
  try {
    res.json({ entries: await auditLog.list() });
  } catch (e) { console.error('admin/audit-log:', e.message); res.status(500).json({ error: 'Datenbankfehler' }); }
}));

router.get('/api/admin/sensitive-query-log', asyncHandler(async (req, res) => {
  try {
    res.json({ entries: await sensitiveLog.list() });
  } catch (e) { console.error('admin/sensitive-query-log:', e.message); res.status(500).json({ error: 'Datenbankfehler' }); }
}));

// Rendert die Tagesbericht-Mail (nur den Nutzungsstatistik-Teil, siehe usageStatsReport.js) als
// HTML-Seite statt sie zu verschicken (Vorschau-Button im Dashboard) - liest denselben Stand wie
// ein echter Lauf, prunt aber nichts und verschickt nichts, siehe buildDailyReportPreview().
//
// Die Sortierbarkeit ist bewusst nur hier im Preview-Wrapper (Vanilla-JS per <script>) statt in
// buildReportHtml() selbst, da dieselbe HTML-Ausgabe auch die echte Mail ist - E-Mail-Clients
// fuehren kein JS aus, ein Klick-Handler dort waere toter Code. Sortiert wird analog zur
// Nutzungsstatistik-Tabelle im Dashboard (renderTable() in admin-dashboard.html): Klick auf
// Spaltenkopf sortiert, nochmaliger Klick kehrt um, Pfeil zeigt die aktive Sortierung, die
// Gesamt-Summenzeile bleibt fixiert am Tabellenende statt mitsortiert zu werden.
const DAILY_REPORT_PREVIEW_SORT_SCRIPT = `<script>
(function () {
  var table = document.querySelector('#matrix-gesamt table');
  if (!table) return;
  var ths = Array.from(table.querySelectorAll('thead th'));
  var tbody = table.querySelector('tbody');
  var sortKey = null, sortDir = 1;
  function cellValue(tr, idx) {
    var text = tr.children[idx].textContent.trim();
    if (idx === 0) return text.toLowerCase();
    if (text === '–') return 0;
    var n = parseFloat(text.replace(/[^0-9.,-]/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  function render() {
    var rows = Array.from(tbody.querySelectorAll('tr'));
    var sumRow = rows.pop();
    if (sortKey !== null) {
      rows.sort(function (a, b) {
        var va = cellValue(a, sortKey), vb = cellValue(b, sortKey);
        if (va < vb) return -1 * sortDir;
        if (va > vb) return 1 * sortDir;
        return 0;
      });
    }
    rows.forEach(function (r) { tbody.appendChild(r); });
    tbody.appendChild(sumRow);
    ths.forEach(function (th, i) {
      th.innerHTML = th.innerHTML.replace(/ (▲|▼)$/, '');
      if (i === sortKey) th.innerHTML += sortDir === 1 ? ' ▲' : ' ▼';
    });
  }
  ths.forEach(function (th, i) {
    th.style.cursor = 'pointer';
    th.style.userSelect = 'none';
    th.addEventListener('click', function () {
      if (sortKey === i) sortDir *= -1; else { sortKey = i; sortDir = 1; }
      render();
    });
  });
})();
</script>`;

router.get('/api/admin/daily-report-preview', (req, res) => {
  try {
    const { html, subject } = usageStatsReport.buildDailyReportPreview();
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="background:#f1f5f9;margin:0;padding:24px 16px">${html}${DAILY_REPORT_PREVIEW_SORT_SCRIPT}</body></html>`);
  } catch (e) {
    res.status(500).send('Vorschau konnte nicht erzeugt werden: ' + e.message);
  }
});

// Vorher: Weiterleitung an einen n8n-Webhook. Jetzt drei unabhängige native Flows direkt
// aufgerufen (siehe jobs/feedbackReport.js, usageStatsReport.js, gpuMetricsReport.js) -
// jeder meldet für sich, ob er wegen fehlender Daten stillbleibt.
router.post('/api/admin/trigger-daily-report', asyncHandler(async (req, res) => {
  const results = await Promise.allSettled([feedbackReport.run(), usageStatsReport.run(), gpuMetricsReport.run()]);
  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
  if (errors.length) return res.status(500).json({ error: errors.join('; ') });
  res.json({ ok: true });
}));

module.exports = router;
