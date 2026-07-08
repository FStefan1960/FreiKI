const fs = require('fs');
const fetch = require('node-fetch');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const FormData = require('form-data');
const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');
const { sendTranscriptMail, sendTranscriptFailureMail } = require('../integrations/EmailService');

async function formatTranscript(transcript) {
  try {
    const fmtRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: 'Du bereinigst automatisch transkribierte Sprachtexte. Füge fehlende Satzzeichen ein, korrigiere offensichtliche Erkennungsfehler. Gliedere den Text zwingend in Absätze: Beginne einen neuen Absatz (Leerzeile dazwischen), sobald das Thema wechselt, ein neuer Gedanke beginnt oder eine deutliche Sprechpause erkennbar ist. Bei einem längeren Transkript sind mehrere Absätze Pflicht – ein einziger durchgehender Textblock ist nicht akzeptabel. Behalte den gesamten Inhalt bei – erfinde nichts, kürze nichts weg. Gib NUR den formatierten Text zurück, ohne Kommentar oder Erklärung. /no_think' },
          { role: 'user', content: `Bitte formatiere dieses Transkript:\n\n${transcript}` }
        ],
        max_tokens: 8192,
        temperature: 0.2
      })
    });
    if (fmtRes.ok) {
      const fmtJson = await fmtRes.json();
      const result = fmtJson.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (result && result.length > 20) return result;
    }
  } catch (fmtErr) {
    console.warn('Formatierung fehlgeschlagen, sende Rohtranskript:', fmtErr.message);
  }
  return transcript;
}

// Läuft asynchron im Hintergrund (fire-and-forget vom Route-Handler aus aufgerufen):
// konvertiert Audio, transkribiert per Whisper, formatiert per vLLM, verschickt per Mail.
async function transcribeAndEmail(file, email) {
  const wavPath = file.path + '.wav';
  try {
    console.log(`Transkription gestartet: ${file.originalname}`);

    await execFileAsync('ffmpeg', ['-y', '-i', file.path, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath]);

    const form = new FormData();
    form.append('audio_file', fs.createReadStream(wavPath), { filename: 'audio.wav', contentType: 'audio/wav' });

    const whisperRes = await fetch(`${config.WHISPER_URL}/asr?task=transcribe&language=de&output=json`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      timeout: 7200000 // 2 Stunden
    });
    if (!whisperRes.ok) {
      const errBody = await whisperRes.text();
      throw new Error(`Whisper Fehler: ${whisperRes.status} – ${errBody}`);
    }

    const whisperJson = await whisperRes.json();
    console.log(`Whisper Antwort: ${whisperJson.text?.length ?? 0} Zeichen`);
    const transcript = (whisperJson.text || '').trim();
    if (!transcript) throw new Error('Whisper hat kein Transkript zurückgegeben (leeres Ergebnis)');

    console.log('Formatiere Transkript mit vLLM...');
    const formatted = await formatTranscript(transcript);

    await sendTranscriptMail(email, file.originalname, formatted);
    console.log('Transkript gesendet.');
  } catch (e) {
    console.error('Transkription Fehler:', e.message);
    try {
      await sendTranscriptFailureMail(email, e.message);
    } catch (mailErr) {
      console.error('Fehler-Mail fehlgeschlagen:', mailErr.message);
    }
  } finally {
    fs.unlink(file.path, () => {});
    fs.unlink(wavPath, () => {});
  }
}

module.exports = { transcribeAndEmail };
