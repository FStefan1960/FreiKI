const fs = require('fs');
const fetch = require('node-fetch');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const FormData = require('form-data');
const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');
const { sendTranscriptMail, sendTranscriptFailureMail, sendStructuredTranscriptMail, sendStructureFailureMail } = require('../integrations/EmailService');
const { textToDocxBuffer } = require('../documents/DocxExportService');
const { THINKING_KWARGS } = require('../chat/ThinkingConfig');

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

// Gliedert ein bereits per formatTranscript() bereinigtes Transkript nach Themen, arbeitet
// Termine und ToDos als eigene Listen heraus und liefert Markdown für textToDocxBuffer()
// (Button "Extrahieren, Transkribieren & Formatieren", audio-extrahieren.html). Whisper
// (openai-whisper-asr-webservice) liefert keine Sprecher-Metadaten - echte Diarisierung ist
// damit nicht möglich. Bei erkennbarem Dialog markiert das LLM Redebeiträge bestenfalls
// heuristisch mit generischen Labels (Sprecher A/B), rät aber keine echten Namen.
async function structureTranscript(formattedTranscript) {
  const res = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({
      model: config.VLLM_MODEL,
      messages: [
        { role: 'system', content: 'Du strukturierst ein transkribiertes Gespräch oder eine Aufnahme für ein Protokoll. Arbeite AUSSCHLIESSLICH mit dem Inhalt des Transkripts - erfinde, ergänze oder interpretiere nichts, das nicht wörtlich oder sinngemäß darin vorkommt. Gib das Ergebnis als Markdown zurück, exakt in dieser Struktur:\n\n# Protokoll\n\n## Termine\nStichpunkte mit allen im Transkript genannten Terminen, Fristen oder Zeitangaben (Datum/Uhrzeit + Anlass). Wird kein Termin genannt, schreibe genau: "Keine Termine erkannt."\n\n## ToDos\nStichpunkte mit allen im Transkript genannten Aufgaben, Zusagen oder offenen Punkten (wer macht was, falls erkennbar). Wird kein ToDo genannt, schreibe genau: "Keine ToDos erkannt."\n\n## Inhalt\nGliedere den restlichen Inhalt in thematische Abschnitte mit ##-Überschriften, ein Abschnitt pro Thema bzw. Sinneinheit. Sind im Text mehrere Sprecher im klaren Wechsel erkennbar (z.B. Frage/Antwort, deutlich wechselnde Perspektiven), kennzeichne die Redebeiträge zusätzlich mit **Sprecher A:**/**Sprecher B:** usw. - nutze NUR diese generischen Bezeichnungen, rate keine echten Namen. Ist keine Sprechertrennung erkennbar, gliedere ausschließlich nach Thema.\n\nGib NUR das Markdown zurück, ohne Einleitung, Kommentar oder Codeblock-Umrandung. /no_think' },
        { role: 'user', content: `Bitte strukturiere dieses Transkript:\n\n${formattedTranscript}` }
      ],
      max_tokens: 8192,
      temperature: 0.2,
      ...THINKING_KWARGS
    })
  });
  if (!res.ok) throw new Error(`Strukturierung fehlgeschlagen: vLLM ${res.status}`);
  const json = await res.json();
  const result = json.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!result || result.length < 20) throw new Error('Strukturierung lieferte kein verwertbares Ergebnis');
  return result;
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
// Die Originaldatei wird nur bei erfolgreichem Mailversand sofort gelöscht - schlägt
// irgendein Schritt fehl, bleibt sie liegen (z.B. für einen manuellen Retry) und wird
// spätestens nach 24h vom generischen Upload-Cleanup (FileStorage.cleanupUploads) entsorgt.
async function transcribeAndEmail(file, email) {
  try {
    console.log(`Transkription gestartet: ${file.originalname}`);
    const transcript = await transcribeAudio(file.path);
    console.log(`Whisper Antwort: ${transcript.length} Zeichen`);

    console.log('Formatiere Transkript mit vLLM...');
    const formatted = await formatTranscript(transcript);

    await sendTranscriptMail(email, file.originalname, formatted);
    console.log('Transkript gesendet.');
    fs.unlink(file.path, () => {});
  } catch (e) {
    console.error('Transkription Fehler:', e.message);
    try {
      await sendTranscriptFailureMail(email, e.message);
    } catch (mailErr) {
      console.error('Fehler-Mail fehlgeschlagen:', mailErr.message);
    }
  }
}

// Button "Extrahieren, Transkribieren & Formatieren" (audio-extrahieren.html): läuft wie
// transcribeAndEmail() bis einschließlich der normalen Transkript-Mail, hängt danach aber
// einen zweiten, unabhängigen Schritt an (Themen-Gliederung + Termine/ToDos + Word-Export)
// und verschickt dessen Ergebnis als EIGENE, zweite Mail. Bewusst zwei getrennte try-Blöcke:
// scheitert nur der Zusatzschritt, ist das Rohtranskript trotzdem schon sicher beim Nutzer -
// eine generische "Transkription fehlgeschlagen"-Mail wäre dann irreführend, stattdessen eine
// eigene, sanftere Fehlermeldung für den Formatierungsschritt.
async function transcribeStructureAndEmail(file, email) {
  let formatted;
  try {
    console.log(`Transkription (mit Formatierung) gestartet: ${file.originalname}`);
    const transcript = await transcribeAudio(file.path);
    console.log(`Whisper Antwort: ${transcript.length} Zeichen`);

    console.log('Formatiere Transkript mit vLLM...');
    formatted = await formatTranscript(transcript);

    await sendTranscriptMail(email, file.originalname, formatted);
    console.log('Rohtranskript gesendet.');
  } catch (e) {
    console.error('Transkription Fehler:', e.message);
    try {
      await sendTranscriptFailureMail(email, e.message);
    } catch (mailErr) {
      console.error('Fehler-Mail fehlgeschlagen:', mailErr.message);
    }
    return; // Datei bleibt liegen (Retry/generischer 24h-Cleanup), wie bei transcribeAndEmail()
  }

  try {
    console.log('Strukturiere Transkript (Themen, Termine, ToDos)...');
    const structuredMd = await structureTranscript(formatted);
    const docxBuffer = await textToDocxBuffer(structuredMd);
    await sendStructuredTranscriptMail(email, file.originalname, docxBuffer);
    console.log('Formatiertes Word-Dokument gesendet.');
    fs.unlink(file.path, () => {});
  } catch (e) {
    console.error('Formatierung/Word-Export Fehler:', e.message);
    try {
      await sendStructureFailureMail(email, e.message);
    } catch (mailErr) {
      console.error('Fehler-Mail (Formatierung) fehlgeschlagen:', mailErr.message);
    }
    // Datei bleibt liegen (Rohtranskript kam aber bereits an, siehe oben).
  }
}

module.exports = { transcribeAndEmail, transcribeStructureAndEmail, transcribeAudio };
