const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');

function sendToN8n(payload) {
  if (!config.N8N_WEBHOOK_URL) return;
  fetchWithTimeout(config.N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 3_000).catch(e => console.error('n8n Webhook Fehler:', e.message));
}

module.exports = { sendToN8n };
