// Sofort-Alarm per Telegram Bot API - ergänzt die E-Mail-Berichte (EmailService.js) um einen
// Kanal, der tatsächlich als Push aufs Handy kommt statt erst beim nächsten Mail-Abruf
// aufzufallen. Genutzt von jobs/vllmTelegramMonitor.js und jobs/syntheticHealthCheck.js.
const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');

async function sendTelegramMessage(text) {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) return false;
  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const r = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.TELEGRAM_CHAT_ID, text }),
    }, 10000);
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
    return true;
  } catch (e) {
    console.error('sendTelegramMessage:', e.message);
    return false;
  }
}

module.exports = { sendTelegramMessage };
