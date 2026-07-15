const express = require('express');
const os = require('os');
const fs = require('fs');
const { config } = require('../../../shared/config');
const pool = require('../../database/postgres/pool');
const { fetchWithTimeout } = require('../../../shared/utils/text');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');
const { adminSession } = require('../../../core/auth/AuthMiddleware');

const router = express.Router();

const HEALTH_CACHE_MS = 5000;
let healthCache = null;
let healthCacheTs = 0;

async function checkServiceHealth(url, headers = {}, ms = 5000) {
  try {
    const r = await fetchWithTimeout(url, { headers }, ms);
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkPostgresHealth() {
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
    ]);
    await client.query('SELECT 1');
    client.release();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function formatBytes(bytes) {
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

async function checkDiskHealth(dir, minFreeBytes) {
  try {
    const stats = await fs.promises.statfs(dir);
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bfree;
    const usedBytes = totalBytes - freeBytes;
    return {
      ok: freeBytes >= minFreeBytes,
      freeBytes,
      usedPercent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
      used: formatBytes(usedBytes),
      total: formatBytes(totalBytes),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Liveness: Prozess laeuft und antwortet - keine Abhaengigkeitschecks.
// Fuer Docker HEALTHCHECK/Orchestrierung: ein kurzer Ausfall von vLLM/Paperless/Whisper
// soll den Container nicht als "unhealthy" markieren und einen Neustart ausloesen,
// der das externe Problem ohnehin nicht behebt.
router.get('/api/health/live', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

async function computeReadiness() {
  if (healthCache && Date.now() - healthCacheTs < HEALTH_CACHE_MS) {
    return healthCache;
  }
  const diskCheck = await checkDiskHealth('/tmp', 10 * 1024 * 1024 * 1024);
  const checks = {
    vllm: await checkServiceHealth(`${config.VLLM_URL}/models`, { Authorization: `Bearer ${config.VLLM_API_KEY}` }),
    postgres: await checkPostgresHealth(),
    diskSpace: diskCheck,
  };
  if (config.PAPERLESS_TOKEN) checks.paperless = await checkServiceHealth(`${config.PAPERLESS_INTERNAL_URL}/api/`);
  if (config.WHISPER_URL) checks.whisper = await checkServiceHealth(`${config.WHISPER_URL}/`);

  const allOk = Object.values(checks).every(c => c.ok);
  if (!allOk) {
    const failed = Object.entries(checks)
      .filter(([, c]) => !c.ok)
      .map(([name, c]) => `${name}: ${c.error || `status ${c.status}`}`)
      .join(', ');
    console.warn(`[health] Check fehlgeschlagen - ${failed}`);
  }
  const body = {
    status: allOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks,
    disk: { usedPercent: diskCheck.usedPercent, used: diskCheck.used, total: diskCheck.total },
    memory: { used: os.totalmem() - os.freemem(), total: os.totalmem() },
  };
  healthCache = { status: allOk ? 200 : 503, body };
  healthCacheTs = Date.now();
  return healthCache;
}

// Readiness: kann die App gerade echte Anfragen vollstaendig bedienen (inkl. Abhaengigkeiten).
// Fuer externes Monitoring (z. B. Uptime-Kuma) - URL bleibt /api/health fuer Kompatibilitaet
// mit bestehenden Monitoren. Antwort bewusst minimal (nur Status/Zeitstempel) - interne
// Dienstnamen, Fehlermeldungen und Ressourcenzahlen sind kein oeffentliches Detail.
router.get('/api/health', asyncHandler(async (req, res) => {
  const { status, body } = await computeReadiness();
  res.status(status).json({ status: body.status, timestamp: body.timestamp });
}));

// Wie /api/health, aber mit vollem Detail (Dienste, Disk, Memory) - nur fuer angemeldete
// Admins, fuer interne Diagnose.
router.get('/api/health/detail', asyncHandler(async (req, res) => {
  if (!adminSession(req)) return res.status(401).json({ error: 'Nicht angemeldet' });
  const { status, body } = await computeReadiness();
  res.status(status).json(body);
}));

module.exports = router;
