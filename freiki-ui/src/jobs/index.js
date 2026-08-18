// Registriert alle nativen Berichts-Jobs beim Scheduler (Ersatz für die entsprechenden
// n8n-Workflows, siehe Migrationsplan). Wird einmalig aus app.js beim Start aufgerufen.
// Uhrzeiten in Server-Zeit (Container läuft in UTC) - entsprechen den ursprünglichen
// n8n-Cron-Ausdrücken, nicht immer den (teils veralteten) menschenlesbaren Node-Namen dort.
const { scheduleDaily, scheduleHourly, scheduleEvery, scheduleWeekly } = require('./scheduler');
const workflowHealthCheck = require('./workflowHealthCheck');
const tageslosung = require('./tageslosung');
const wetterwarnungen = require('./wetterwarnungen');
const ninaWarnungen = require('./ninaWarnungen');
const sicherheitslage = require('./sicherheitslage');
const resourceHealthAlert = require('./resourceHealthAlert');
const syntheticHealthCheck = require('./syntheticHealthCheck');
const statusReport = require('./statusReport');
const vllmSignalMonitor = require('./vllmSignalMonitor');
const dockerUpdateCheck = require('./dockerUpdateCheck');
const feedbackReport = require('./feedbackReport');
const usageStatsReport = require('./usageStatsReport');
const gpuMetricsReport = require('./gpuMetricsReport');
const medienspiegel = require('./medienspiegel');
const gesellschaftstrends = require('./gesellschaftstrends');

function startJobs() {
  scheduleDaily('workflowHealthCheck', 7, 0, workflowHealthCheck.run);
  scheduleDaily('tageslosung', 4, 15, tageslosung.run);
  scheduleDaily('wetterwarnungen', 6, 0, wetterwarnungen.run);
  scheduleDaily('sicherheitslage-morgens', 6, 30, sicherheitslage.run);
  scheduleDaily('sicherheitslage-mittags', 12, 30, sicherheitslage.run);
  scheduleHourly('ninaWarnungen', 0, ninaWarnungen.run);
  scheduleEvery('resourceHealthAlert', 30, resourceHealthAlert.run);
  scheduleEvery('syntheticHealthCheck', 15, syntheticHealthCheck.run);
  scheduleDaily('statusReport', 7, 0, statusReport.run);
  scheduleEvery('vllmSignalMonitor', 5, vllmSignalMonitor.checkStatus);
  scheduleDaily('vllmHeartbeat-morgens', 7, 30, vllmSignalMonitor.sendHeartbeat);
  scheduleDaily('vllmHeartbeat-abends', 17, 30, vllmSignalMonitor.sendHeartbeat);
  // Vereinheitlicht auf wöchentlich Fr 08:00 (Original: FreiKI wöchentlich, KorKI werktäglich -
  // täglich wäre für einen Update-Hinweis unnötig häufig und mehr externe API-Last).
  scheduleWeekly('dockerUpdateCheck', 5, 8, 0, dockerUpdateCheck.run);
  // Vorher ein gemeinsamer "Tagesbericht v2 (akkumuliert)" - jetzt drei unabhängige Flows.
  scheduleDaily('feedbackReport', 1, 55, feedbackReport.run);
  scheduleDaily('usageStatsReport', 1, 55, usageStatsReport.run);
  scheduleDaily('gpuMetricsReport', 1, 55, gpuMetricsReport.run);
  scheduleDaily('medienspiegel', 7, 4, medienspiegel.run);
  scheduleDaily('gesellschaftstrends', 7, 28, gesellschaftstrends.run);
}

module.exports = { startJobs };
