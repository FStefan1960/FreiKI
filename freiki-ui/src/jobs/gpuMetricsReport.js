// Ersatz für den GPU/vLLM-Teil von "KorKI Tagesbericht v2 (akkumuliert)" - eigenständiger Flow,
// reine Momentaufnahme, kein akkumulierter Zustand nötig. Läuft auf Instanzen ohne lokales
// vLLM/Beszel (z.B. FreiKI) einfach leer durch - keine Mail, wenn nichts abrufbar ist.
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
// BeszelService.js existiert nur auf Instanzen mit eigener GPU (aktuell nur KorKI) - Import
// darf den Start auf anderen Instanzen nicht mit MODULE_NOT_FOUND crashen (siehe adminRoutes.js
// für dasselbe Muster).
let getLatestRawStats = async () => null;
try {
  ({ getLatestRawStats } = require('../core/integrations/BeszelService'));
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND') throw e;
}
const users = require('../core/auth/UserRepository');
const { sendReportMail } = require('../core/integrations/EmailService');
const { getBrandConfig } = require('../shared/config/BrandConfig');

function metricsUrl() {
  return config.VLLM_URL.replace(/\/v1\/?$/, '') + '/metrics';
}

async function fetchVllmMetrics() {
  try {
    const r = await fetchWithTimeout(metricsUrl(), {}, 10000);
    if (!r.ok) return null;
    const text = await r.text();
    const get = key => {
      const m = text.match(new RegExp(`^${key}(?:\\{[^}]*\\})?\\s+([\\d.eE+\\-]+)`, 'm'));
      return m ? parseFloat(m[1]) : null;
    };
    return {
      running: get('vllm:num_requests_running'),
      waiting: get('vllm:num_requests_waiting'),
      promptToks: get('vllm:prompt_tokens_total'),
      genToks: get('vllm:generation_tokens_total'),
      success: get('vllm:request_success_total'),
    };
  } catch {
    return null;
  }
}

function buildMetricsHtml(vllm, gpu) {
  const th = t => `<th style="padding:8px 12px;background:#1E3A8A;color:#fff;font-size:12px;font-weight:600;text-align:left;">${t}</th>`;
  const td = (t, bg) => `<td style="padding:7px 12px;font-size:13px;border-bottom:1px solid #e5e7eb;background:${bg};">${t}</td>`;
  const rows = [];
  if (gpu) {
    rows.push(['GPU-Speicherauslastung', gpu.cachePct], ['GPU-Auslastung', gpu.utilPct], ['GPU-Temperatur', gpu.tempC], ['GPU-Leistung', gpu.powerW], ['GPU-Speicher (belegt/gesamt)', gpu.memMb]);
  }
  if (vllm) {
    rows.push(['Aktive Anfragen', vllm.running ?? 'n/v'], ['Wartende Anfragen', vllm.waiting ?? 'n/v'], ['Prompt-Tokens gesamt', vllm.promptToks ?? 'n/v'], ['Generierte Tokens', vllm.genToks ?? 'n/v'], ['Erfolgreiche Anfragen', vllm.success ?? 'n/v']);
  }
  const tableRows = rows.map(([label, val], i) => {
    const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
    return `<tr>${td(label, bg)}${td(`<strong>${val}</strong>`, bg)}</tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);"><thead><tr>${th('Metrik')}${th('Wert')}</tr></thead><tbody>${tableRows}</tbody></table>`;
}

async function run() {
  const vllm = await fetchVllmMetrics();
  const rawStats = await getLatestRawStats();

  let gpu = null;
  if (rawStats?.g) {
    const g = Object.values(rawStats.g)[0];
    if (g) {
      const tempC = g.n && rawStats.t ? rawStats.t[g.n] : undefined;
      gpu = {
        cachePct: (g.mu !== undefined && g.mt) ? `${((g.mu / g.mt) * 100).toFixed(2)} %` : 'n/v',
        utilPct: g.u !== undefined ? `${g.u.toFixed(0)} %` : 'n/v',
        tempC: tempC !== undefined ? `${tempC.toFixed(0)} °C` : 'n/v',
        powerW: g.p !== undefined ? `${g.p.toFixed(0)} W` : 'n/v',
        memMb: (g.mu !== undefined && g.mt !== undefined) ? `${Math.round(g.mu)} / ${Math.round(g.mt)} MB` : 'n/v',
      };
    }
  }

  if (!vllm && !gpu) return; // Instanz ohne lokales vLLM/Beszel (z.B. FreiKI) - nichts zu melden

  const jetzt = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'full', timeStyle: 'short' });
  const appName = getBrandConfig().name;
  const html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#0e0f0f;">
  <div style="background:linear-gradient(135deg,#1E3A8A,#2B9CD8);padding:24px 28px;border-radius:10px 10px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:20px;">⚙️ GPU/vLLM-Werte</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Momentaufnahme ${jetzt} Uhr</p>
  </div>
  <div style="background:#fff;padding:24px 28px;border:1px solid #e5e7eb;border-top:none;">
    ${buildMetricsHtml(vllm, gpu)}
  </div>
  <div style="background:#f8fafc;padding:12px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;font-size:11px;color:#9ca3af;text-align:center;">${appName} · Automatisch generiert</div>
</div>`;

  const recipients = await users.listAdminEmails();
  if (!recipients.length) return;
  await sendReportMail(recipients, `${appName} GPU/vLLM-Werte – ${new Date().toLocaleDateString('de-DE')}`, { html });
}

module.exports = { run };
