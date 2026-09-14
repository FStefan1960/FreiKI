const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

// Wandelt eine Video-/Audiodatei per ffmpeg in eine MP3-Datei um (nur Tonspur). Anders als
// TranscriptionService.transcribeAudio() (16kHz-Mono-WAV, verlustfrei aber groß, nur als
// Whisper-Zwischenschritt gedacht) hier bewusst komprimiert und kein Whisper-Aufruf - der
// Extras-Menüpunkt "Audio extrahieren" ist ein reines ffmpeg-Utility ohne KI, für Nutzer,
// die aus einem Video nur die kleinere Audiodatei zum Weiterverwenden brauchen.
async function extractAudioToMp3(filePath) {
  const mp3Path = filePath + '.mp3';
  await execFileAsync('ffmpeg', ['-y', '-i', filePath, '-vn', '-acodec', 'libmp3lame', '-b:a', '128k', mp3Path]);
  return mp3Path;
}

module.exports = { extractAudioToMp3 };
