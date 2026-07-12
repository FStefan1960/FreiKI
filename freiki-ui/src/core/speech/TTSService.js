const fetch = require('node-fetch');
const { config } = require('../../shared/config');

// Zusaetzliche Stimme neben dem Default (config.TTS_MODEL/TTS_VOICE) -- Kerstin
// gibt es bei Piper nur in "low"-Qualitaet (kein medium/high), klanglich also
// hörbar simpler als die Thorsten-Stimme, aber vom Nutzer bewusst gewuenscht.
const VOICE_MAP = {
  thorsten: { model: config.TTS_MODEL, voice: config.TTS_VOICE },
  kerstin: { model: 'speaches-ai/piper-de_DE-kerstin-low', voice: 'kerstin' },
};

function sanitizeForSpeech(text) {
  return text
    .replace(/[#*_`>~]/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

// Gibt { ok, status, body } zurück; body ist der node-fetch Response-Stream (mp3).
async function synthesize(text, voiceKey) {
  const cleanText = sanitizeForSpeech(text);
  const { model, voice } = VOICE_MAP[voiceKey] || VOICE_MAP.thorsten;
  try {
    const piperRes = await fetch(`${config.PIPER_URL}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        voice,
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
