// Ersatz für den n8n-Workflow "Wetterwarnungen (DWD)" - täglicher Check auf Hitze/Sturm/
// Starkregen für die in .env hinterlegten Koordinaten. Ohne WEATHER_WARN_LAT/LON/RECIPIENTS
// überspringt sich der Job selbst (instanzspezifisch, auf FreiKI standardmäßig nicht gesetzt).
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
const { sendReportMail } = require('../core/integrations/EmailService');

async function run() {
  if (!config.WEATHER_WARN_LAT || !config.WEATHER_WARN_LON || !config.WEATHER_WARN_RECIPIENTS.length) return;

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${config.WEATHER_WARN_LAT}&longitude=${config.WEATHER_WARN_LON}&hourly=temperature_2m,windspeed_10m,precipitation&timezone=Europe%2FBerlin&forecast_days=14`;
  const r = await fetchWithTimeout(url, {}, 15000);
  if (!r.ok) throw new Error(`open-meteo HTTP ${r.status}`);
  const w = await r.json();

  const times = w.hourly.time;
  const temps = w.hourly.temperature_2m;
  const winds = w.hourly.windspeed_10m || [];
  const precip = w.hourly.precipitation || [];
  const now = new Date();

  const tagesmaxima = {};
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]);
    if (t < now) continue;
    const tag = times[i].slice(0, 10);
    if (!tagesmaxima[tag] || temps[i] > tagesmaxima[tag].temp) {
      tagesmaxima[tag] = { temp: temps[i], wind: winds[i] || 0, precip: precip[i] || 0 };
    }
  }

  const warnungen = [];
  for (const [tag, werte] of Object.entries(tagesmaxima)) {
    const datum = new Date(tag + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    if (werte.temp >= 28) warnungen.push(`🌡️ Hitze: max. ${werte.temp}°C am ${datum}`);
    if (werte.wind >= 50) warnungen.push(`💨 Sturm: max. ${werte.wind} km/h am ${datum}`);
    if (werte.precip >= 5) warnungen.push(`🌧️ Starkregen: max. ${werte.precip} mm/h am ${datum}`);
  }
  if (!warnungen.length) return;

  const timeStr = now.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const liItems = warnungen.map(w => `<li style="margin:8px 0;padding:8px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:4px">${w}</li>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#333">
  <div style="background:#2980b9;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:20px">🌤️ Wetterwarnung</h1>
    <p style="margin:4px 0 0;opacity:0.85;font-size:13px">${timeStr}</p>
  </div>
  <div style="background:#f9f9f9;padding:24px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">Folgende Wetterwarnungen liegen vor:</p>
    <ul style="padding-left:0;list-style:none;margin:0">${liItems}</ul>
  </div>
</div>`;

  await sendReportMail(config.WEATHER_WARN_RECIPIENTS, `🌤️ Wetterwarnung: ${warnungen.length} Meldung(en) – ${timeStr}`, { html });
}

module.exports = { run };
