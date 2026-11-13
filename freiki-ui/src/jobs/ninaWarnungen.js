// Ersatz für den n8n-Workflow "NINA-Warnungen" - stündlicher Check der amtlichen
// Gefahrenwarnungen (warnung.bund.de) für den in .env hinterlegten Amtlichen
// Gemeindeschlüssel (AGS). Ohne NINA_WARN_AGS/RECIPIENTS überspringt sich der Job selbst.
// Die Dashboard-API gibt es nur auf Kreis-Ebene und liefert jede Warnung, die irgendwo im
// Kreis gilt. Sind NINA_WARN_LAT/LON gesetzt, bleiben nur Warnungen, deren Warngebiet
// (GeoJSON) diesen Punkt enthält - wie in der NINA-App für den eigenen Standort.
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
const { sendReportMail } = require('../core/integrations/EmailService');

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function geoContains(geojson, lon, lat) {
  for (const f of (geojson && geojson.features) || []) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const [outer, ...holes] of polys) {
      if (inRing(lon, lat, outer) && !holes.some(h => inRing(lon, lat, h))) return true;
    }
  }
  return false;
}

// Bei Fehlern am Geo-Abruf lieber warnen als eine Warnung zu verschlucken.
async function betrifftStandort(item, lon, lat) {
  try {
    const r = await fetchWithTimeout(`https://warnung.bund.de/api31/warnings/${item.id}.geojson`, {}, 15000);
    if (!r.ok) return true;
    return geoContains(await r.json(), lon, lat);
  } catch {
    return true;
  }
}

async function run() {
  if (!config.NINA_WARN_AGS || !config.NINA_WARN_RECIPIENTS.length) return;

  const url = `https://warnung.bund.de/api31/dashboard/${config.NINA_WARN_AGS}.json`;
  const r = await fetchWithTimeout(url, {}, 15000);
  if (!r.ok) throw new Error(`NINA-API HTTP ${r.status}`);
  const items = await r.json();

  let kandidaten = (Array.isArray(items) ? items : []).filter(item => item.payload && item.payload.data);
  if (Number.isFinite(config.NINA_WARN_LAT) && Number.isFinite(config.NINA_WARN_LON)) {
    const treffer = await Promise.all(kandidaten.map(i => betrifftStandort(i, config.NINA_WARN_LON, config.NINA_WARN_LAT)));
    kandidaten = kandidaten.filter((_, idx) => treffer[idx]);
  }

  const warnungen = kandidaten
    .map(item => {
      const d = item.payload.data;
      const titel = d.headline || d.event || 'Unbekannte Warnung';
      const beschr = d.description ? d.description.slice(0, 200) : '';
      const severity = d.severity || '';
      return `🚨 NINA [${severity}]: ${titel}${beschr ? ' – ' + beschr : ''}`;
    });
  if (!warnungen.length) return;

  const timeStr = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const liItems = warnungen.map(w => `<li style="margin:8px 0;padding:8px;background:#fdecea;border-left:4px solid #e74c3c;border-radius:4px">${w}</li>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;color:#333">
  <div style="background:#e74c3c;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:20px">🚨 NINA Gefahrenwarnung</h1>
    <p style="margin:4px 0 0;opacity:0.85;font-size:13px">${timeStr}</p>
  </div>
  <div style="background:#f9f9f9;padding:24px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">Folgende NINA-Warnungen liegen vor:</p>
    <ul style="padding-left:0;list-style:none;margin:0">${liItems}</ul>
  </div>
</div>`;

  await sendReportMail(config.NINA_WARN_RECIPIENTS, `🚨 NINA-Warnung: ${warnungen.length} Meldung(en) – ${timeStr}`, { html });
}

module.exports = { run };
