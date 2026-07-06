const fetch = require('node-fetch');
const { config } = require('../../shared/config');

function sendToN8n(payload) {
  if (!config.N8N_WEBHOOK_URL) return;
  fetch(config.N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(e => console.error('n8n Webhook Fehler:', e.message));
}

module.exports = { sendToN8n };
