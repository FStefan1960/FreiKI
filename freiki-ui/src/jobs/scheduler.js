// Ersetzt n8n-Schedule-Trigger für Berichte, die keinen eigenen Orchestrator brauchen
// (siehe Migrationsentscheidung: einfache Cron-Jobs bleiben im laufenden Prozess statt
// eines separaten Systems). Registry hält Zeitstempel/Fehler pro Job für den
// Gesundheitscheck (siehe workflowHealthCheck.js) - Ersatz für n8n's eigene Executions-API.
const registry = [];

function msUntil(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function runTracked(entry) {
  try {
    await entry.fn();
    entry.lastRunAt = new Date();
    entry.lastError = null;
  } catch (e) {
    entry.lastRunAt = new Date();
    entry.lastError = e.message;
    console.error(`[jobs] ${entry.name} fehlgeschlagen:`, e.message);
  }
}

// Täglich zu fester Uhrzeit (Europe/Berlin-Serverzeit, wie bisher bei n8n).
function scheduleDaily(name, hour, minute, fn) {
  const entry = {
    name, schedule: `täglich ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, fn,
    intervalMs: 24 * 60 * 60 * 1000, registeredAt: new Date(), lastRunAt: null, lastError: null,
  };
  registry.push(entry);
  setTimeout(function tick() {
    runTracked(entry);
    setInterval(() => runTracked(entry), 24 * 60 * 60 * 1000).unref();
  }, msUntil(hour, minute)).unref();
}

// Stündlich zu fester Minute (z.B. NINA-Warnungen, die zeitnah rausgehen sollen).
function scheduleHourly(name, minute, fn) {
  const entry = {
    name, schedule: `stündlich :${String(minute).padStart(2, '0')}`, fn,
    intervalMs: 60 * 60 * 1000, registeredAt: new Date(), lastRunAt: null, lastError: null,
  };
  registry.push(entry);
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(minute, 0, 0);
  if (next <= now) next.setHours(next.getHours() + 1);
  setTimeout(function tick() {
    runTracked(entry);
    setInterval(() => runTracked(entry), 60 * 60 * 1000).unref();
  }, next.getTime() - now.getTime()).unref();
}

// Wöchentlich an einem festen Wochentag (0=So..6=Sa) + Uhrzeit - für Jobs, die täglich zu
// aufwendig wären (z.B. mehrere externe API-Calls + LLM-Zusammenfassung).
function scheduleWeekly(name, weekday, hour, minute, fn) {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const entry = {
    name, schedule: `wöchentlich ${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][weekday]} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    fn, intervalMs: weekMs, registeredAt: new Date(), lastRunAt: null, lastError: null,
  };
  registry.push(entry);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  let daysAhead = (weekday - next.getDay() + 7) % 7;
  if (daysAhead === 0 && next <= now) daysAhead = 7;
  next.setDate(next.getDate() + daysAhead);
  setTimeout(function tick() {
    runTracked(entry);
    setInterval(() => runTracked(entry), weekMs).unref();
  }, next.getTime() - now.getTime()).unref();
}

// Alle N Minuten, ab dem nächsten vollen Vielfachen (z.B. minutes=15 -> :00/:15/:30/:45).
// Für Checks, die kein festes Tageszeit-Raster brauchen (Ressourcen-/Health-/vLLM-Monitor).
function scheduleEvery(name, minutes, fn) {
  const ms = minutes * 60 * 1000;
  const entry = {
    name, schedule: `alle ${minutes} Min`, fn,
    intervalMs: ms, registeredAt: new Date(), lastRunAt: null, lastError: null,
  };
  registry.push(entry);
  const now = new Date();
  const next = new Date(Math.ceil(now.getTime() / ms) * ms);
  setTimeout(function tick() {
    runTracked(entry);
    setInterval(() => runTracked(entry), ms).unref();
  }, next.getTime() - now.getTime()).unref();
}

function listRegistry() {
  return registry.map(({ name, schedule, intervalMs, registeredAt, lastRunAt, lastError }) =>
    ({ name, schedule, intervalMs, registeredAt, lastRunAt, lastError }));
}

// Für den manuellen Trigger (Admin-Button) - führt den Job sofort aus, außerhalb des Zeitplans.
async function runNow(name) {
  const entry = registry.find(e => e.name === name);
  if (!entry) throw new Error(`Unbekannter Job: ${name}`);
  await runTracked(entry);
  if (entry.lastError) throw new Error(entry.lastError);
}

module.exports = { scheduleDaily, scheduleHourly, scheduleEvery, scheduleWeekly, listRegistry, runNow };
