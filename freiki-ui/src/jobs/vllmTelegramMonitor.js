// Ersatz für den n8n-Workflow "KorKI Monitoring" (vLLM-Down/Up-Alert per Telegram, mit
// De-Dup-Status und Morgens/Abends-Heartbeat). Ursprünglich für Signal via CallMeBot gebaut,
// aber nie scharf (SIGNAL_PHONE/SIGNAL_APIKEY fehlten auf KorKI in der Config, Monitor lief
// seither ins Leere) - jetzt auf Telegram (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID aus .env)
// umgestellt. Ohne beide Werte bleibt der Monitor inaktiv (macht z.B. auf FreiKI ohne
// lokales vLLM keinen Sinn).
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
const { sendTelegramMessage } = require('../core/integrations/TelegramService');

let vllmDown = false;
let vllmDownSince = null;

function healthUrl() {
  return config.VLLM_URL.replace(/\/v1\/?$/, '') + '/health';
}

async function checkStatus() {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) return;

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
    await sendTelegramMessage('🚨 KorKI ALERT: vLLM nicht erreichbar! KorKI funktioniert nicht. Bitte Server prüfen.');
  } else if (!isDown && vllmDown) {
    vllmDown = false;
    const seit = vllmDownSince
      ? vllmDownSince.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
      : '?';
    await sendTelegramMessage(`✅ KorKI: vLLM ist wieder online (war ausgefallen seit ${seit} Uhr).`);
  }
}

async function sendHeartbeat() {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) return;
  const stunde = new Date().getHours();
  const gruss = stunde < 12 ? 'Guten Morgen' : 'Guten Abend';
  await sendTelegramMessage(`${gruss}! ✅ KorKI läuft. Monitoring aktiv – nächste Meldung nur bei Ausfall.`);
}

module.exports = { checkStatus, sendHeartbeat };
