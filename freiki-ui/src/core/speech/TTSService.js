const fetch = require('node-fetch');
const { config } = require('../../shared/config');

function sanitizeForSpeech(text) {
  return text
    .replace(/[#*_`>~]/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

// Gibt { ok, status, body } zurück; body ist der node-fetch Response-Stream (mp3).
async function synthesize(text) {
  const cleanText = sanitizeForSpeech(text);
  try {
    const piperRes = await fetch(`${config.PIPER_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        voice: config.TTS_VOICE,
        input: cleanText,
        response_format: 'mp3'
      }),
      timeout: 120000
    });
    if (!piperRes.ok) {
      const errBody = await piperRes.text().catch(() => '');
      console.error(`Piper Fehler: ${piperRes.status} – ${errBody.slice(0, 200)}`);
      return { ok: false };
    }
    return { ok: true, body: piperRes.body };
  } catch (e) {
    console.error('TTS Fehler:', e.message);
    return { ok: false };
  }
}

module.exports = { synthesize, sanitizeForSpeech };
