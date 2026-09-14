const express = require('express');
const fs = require('fs');
const { getSession } = require('../../../core/auth/AuthMiddleware');
const { uploadAudio, uploadVideo, uploadDictation } = require('../../../infrastructure/storage/FileStorage');
const users = require('../../../core/auth/UserRepository');
const { transcribeAndEmail, transcribeAudio } = require('../../../core/speech/TranscriptionService');
const { extractAudioToMp3 } = require('../../../core/speech/AudioExtractionService');
const TTSService = require('../../../core/speech/TTSService');
const { asyncHandler } = require('../../../shared/utils/asyncHandler');
const { recordChatEvent } = require('../../../jobs/usageStatsReport');

const router = express.Router();
router.use(express.json({ limit: '256kb' }));

router.post('/api/transcribe', uploadAudio.single('audio'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Keine Audiodatei' });

  // Empfänger-Adresse aus dem angemeldeten Konto (JWT → DB), nicht aus dem Formular
  const s = getSession(req);
  if (!s) { fs.unlink(file.path, () => {}); return res.status(401).json({ error: 'Bitte neu anmelden.' }); }
  let email = '';
  try {
    const profile = await users.findProfileById(s.uid);
    email = (profile?.email || '').trim().toLowerCase();
  } catch (e) { console.error('transcribe email lookup:', e.message); }
  if (!email) {
    fs.unlink(file.path, () => {});
    return res.status(400).json({ error: 'Für Ihr Konto ist keine E-Mail-Adresse hinterlegt. Bitte an die Administration wenden.' });
  }

  // Für den Tagesbericht (siehe usageStatsReport.js) - Transkription ist ein "builtinTool"
  // (modes.js), kein regulärer Chat-Modus, und lief bisher an recordChatEvent() vorbei.
  recordChatEvent({ user: s.username, mode: 'transkription', title: 'Transkription', hasFile: true });

  // Sofort antworten – Verarbeitung läuft async
  res.json({ ok: true, message: 'Datei empfangen. Das Transkript wird per E-Mail gesendet.' });

  transcribeAndEmail(file, email); // fire-and-forget
}));

// Kurzes Diktat aus dem Mic-Button in der Eingabezeile - anders als /api/transcribe synchron
// und ohne E-Mail-Versand: Antwort geht direkt zurück, landet im Eingabefeld zum Nachbessern.
// Bewusst OHNE formatTranscript()-Durchlauf (LLM-Absatzformatierung) - bei kurzen Diktaten
// unnötige Zusatzlatenz, der Rohtext ist eh sofort editierbar bevor er gesendet wird.
router.post('/api/dictate', uploadDictation.single('audio'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Keine Audiodaten' });

  const s = getSession(req);
  if (!s) { fs.unlink(file.path, () => {}); return res.status(401).json({ error: 'Bitte neu anmelden.' }); }

  try {
    const text = await transcribeAudio(file.path);
    res.json({ text });
  } catch (e) {
    console.error('Diktat-Transkription Fehler:', e.message);
    res.status(502).json({ error: 'Spracherkennung nicht verfügbar' });
  } finally {
    fs.unlink(file.path, () => {});
  }
}));

// Extras-Menüpunkt "Audio extrahieren" - reines ffmpeg-Utility ohne KI/Whisper: liefert die
// Tonspur synchron als MP3-Download zurück statt wie /api/transcribe per E-Mail. Eigenes
// uploadVideo-Limit (1GB) statt uploadAudio (200MB), siehe FileStorage.js.
router.post('/api/extract-audio', uploadVideo.single('video'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Keine Datei' });

  const s = getSession(req);
  if (!s) { fs.unlink(file.path, () => {}); return res.status(401).json({ error: 'Bitte neu anmelden.' }); }

  let mp3Path;
  try {
    mp3Path = await extractAudioToMp3(file.path);
  } catch (e) {
    console.error('Audio-Extraktion Fehler:', e.message);
    fs.unlink(file.path, () => {});
    return res.status(502).json({ error: 'Audio-Extraktion fehlgeschlagen' });
  }

  recordChatEvent({ user: s.username, mode: 'audio-extraktion', title: 'Audio extrahieren', hasFile: true });

  const downloadName = file.originalname.replace(/\.[^.]+$/, '').replace(/["\r\n]/g, '') + '.mp3';
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

  const stream = fs.createReadStream(mp3Path);
  stream.on('close', () => { fs.unlink(file.path, () => {}); fs.unlink(mp3Path, () => {}); });
  stream.on('error', (e) => { console.error('extract-audio stream:', e.message); if (!res.headersSent) res.status(500).end(); });
  stream.pipe(res);
}));

router.post('/api/tts', asyncHandler(async (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Bitte neu anmelden.' });

  const text = (req.body && req.body.text ? String(req.body.text) : '').trim();
  if (!text) return res.status(400).json({ error: 'Kein Text' });
  const voice = TTSService.VOICE_KEYS.includes(req.body && req.body.voice) ? req.body.voice : 'thorsten';

  const result = await TTSService.synthesize(text, voice);
  if (!result.ok) return res.status(502).json({ error: 'Sprachausgabe nicht verfügbar' });

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'no-store');
  result.body.pipe(res);
}));

module.exports = router;
