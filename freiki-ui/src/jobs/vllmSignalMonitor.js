// Ersatz für den n8n-Workflow "KorKI Monitoring" (vLLM-Down/Up-Alert per Signal via CallMeBot,
// mit De-Dup-Status und Morgens/Abends-Heartbeat). Vorher hartkodierte Signal-Telefonnummer/
// API-Key direkt im n8n-Workflow-JSON - jetzt aus .env (SIGNAL_PHONE/SIGNAL_APIKEY). Ohne
// beide Werte bleibt der Monitor inaktiv (macht z.B. auf FreiKI ohne lokales vLLM keinen Sinn).
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');

let vllmDown = false;
let vllmDownSince = null;

function healthUrl() {
  return config.VLLM_URL.replace(/\/v1\/?$/, '') + '/health';
}

async function sendSignal(text) {
  const url = 'https://api.callmebot.com/signal/send.php';
  const qs = new URLSearchParams({ phone: config.SIGNAL_PHONE, apikey: config.SIGNAL_APIKEY, text });
  await fetchWithTimeout(`${url}?${qs}`, {}, 10000);
}

async function checkStatus() {
  if (!config.SIGNAL_PHONE || !config.SIGNAL_APIKEY) return;

  let isDown;
  try {
    const r = await fetchWithTimeout(healthUrl(), {}, 10000);
    isDown = !r.ok;
  } catch {
    isDown = true;
  }

  if (isDown && !vllmDown) {
    vllmDown = true;
    vllmDownSince = new Date();
    await sendSignal('🚨 KorKI ALERT: vLLM nicht erreichbar! KorKI funktioniert nicht. Bitte Server prüfen.');
  } else if (!isDown && vllmDown) {
    vllmDown = false;
    const seit = vllmDownSince
      ? vllmDownSince.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
      : '?';
    await sendSignal(`✅ KorKI: vLLM ist wieder online (war ausgefallen seit ${seit} Uhr).`);
  }
}

async function sendHeartbeat() {
  if (!config.SIGNAL_PHONE || !config.SIGNAL_APIKEY) return;
  const stunde = new Date().getHours();
  const gruss = stunde < 12 ? 'Guten Morgen' : 'Guten Abend';
  await sendSignal(`${gruss}! ✅ KorKI läuft. Monitoring aktiv – nächste Meldung nur bei Ausfall.`);
}

module.exports = { checkStatus, sendHeartbeat };
