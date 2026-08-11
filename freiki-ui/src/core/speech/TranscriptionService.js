const fs = require('fs');
const fetch = require('node-fetch');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const FormData = require('form-data');
const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');
const { sendTranscriptMail, sendTranscriptFailureMail } = require('../integrations/EmailService');

// Siehe ChatService.js: chat_template_kwargs nur bei Qwen-Modellen setzen (Mistral/FrankKI
// lehnt unbekannte Felder mit HTTP 422 ab).
const THINKING_KWARGS = /qwen/i.test(config.VLLM_MODEL || '')
  ? { chat_template_kwargs: { enable_thinking: false } }
  : {};

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
        temperature: 0.2,
        ...THINKING_KWARGS
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

// Konvertiert eine Audiodatei zu 16kHz-Mono-WAV und transkribiert sie per Whisper. Wirft bei
// Fehlern (kein try/catch) - Aufrufer entscheiden selbst, wie sie damit umgehen (E-Mail-Fehler-
// Benachrichtigung vs. HTTP-Fehlerantwort). Geteilt zwischen der E-Mail-Transkription (lange
// Dateien) und dem kurzen Chat-Diktat, damit die Whisper-Anbindung nicht doppelt existiert.
async function transcribeAudio(filePath) {
  const wavPath = filePath + '.wav';
  try {
    await execFileAsync('ffmpeg', ['-y', '-i', filePath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath]);

    const form = new FormData();
    form.append('audio_file', fs.createReadStream(wavPath), { filename: 'audio.wav', contentType: 'audio/wav' });

    const whisperRes = await fetch(`${config.WHISPER_URL}/asr?task=transcribe&language=de&output=json`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
      timeout: 7200000 // 2 Stunden - deckt auch lange Datei-Uploads ab, kurze Diktate sind ohnehin in Sekunden fertig
    });
    if (!whisperRes.ok) {
      const errBody = await whisperRes.text();
      throw new Error(`Whisper Fehler: ${whisperRes.status} – ${errBody}`);
    }

    const whisperJson = await whisperRes.json();
    const transcript = (whisperJson.text || '').trim();
    if (!transcript) throw new Error('Whisper hat kein Transkript zurückgegeben (leeres Ergebnis)');
    return transcript;
  } finally {
    fs.unlink(wavPath, () => {});
  }
}

// Läuft asynchron im Hintergrund (fire-and-forget vom Route-Handler aus aufgerufen):
// konvertiert Audio, transkribiert per Whisper, formatiert per vLLM, verschickt per Mail.
async function transcribeAndEmail(file, email) {
  try {
    console.log(`Transkription gestartet: ${file.originalname}`);
    const transcript = await transcribeAudio(file.path);
    console.log(`Whisper Antwort: ${transcript.length} Zeichen`);

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
  }
}

module.exports = { transcribeAndEmail, transcribeAudio };
