// ── Diktieren (kurzes Sprach-Chat-Diktat, /api/dictate) ──
// Getrennt von der langen Datei-Transkription (whisper.html/api/transcribe): hier synchron,
// Ergebnis wird nach der Transkription direkt abgeschickt (kein Nachbessern im Eingabefeld).
let _dictateRecorder = null;
let _dictateChunks = [];
let _dictateStream = null;

async function toggleDictation() {
  if (_dictateRecorder && _dictateRecorder.state === 'recording') {
    _dictateRecorder.stop(); // onstop übernimmt Upload + UI-Reset
    return;
  }

  const btn = document.getElementById('mic-btn');
  try {
    _dictateStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    alert(t('js.mic_access_denied', 'Mikrofonzugriff wurde verweigert oder ist nicht verfügbar.'));
    return;
  }

  _dictateChunks = [];
  // Chrome/Android liefert meist webm/opus, iOS Safari meist mp4/aac - Browser wählen lassen,
  // wenn das bevorzugte Format nicht unterstützt wird (kein explizites mimeType erzwingen).
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
  _dictateRecorder = mimeType ? new MediaRecorder(_dictateStream, { mimeType }) : new MediaRecorder(_dictateStream);

  _dictateRecorder.ondataavailable = e => { if (e.data.size > 0) _dictateChunks.push(e.data); };
  _dictateRecorder.onstop = async () => {
    _dictateStream.getTracks().forEach(t => t.stop());
    btn.classList.remove('mic-recording');
    btn.disabled = true;
    btn.innerHTML = '<span class="tts-spinner"></span>';

    try {
      const blob = new Blob(_dictateChunks, { type: _dictateRecorder.mimeType || 'audio/webm' });
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      const formData = new FormData();
      formData.append('audio', blob, `diktat.${ext}`);

      const res = await fetch('/api/dictate', { method: 'POST', body: formData });
      if (res.status === 401) { forceLogout(); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('js.speech_recognition_failed', 'Spracherkennung fehlgeschlagen'));

      const input = document.getElementById('message-input');
      const sep = input.value && !/\s$/.test(input.value) ? ' ' : '';
      input.value += sep + data.text;
      autoResize(input);
      if (input.value.trim()) await sendMessage(); else input.focus();
    } catch (e) {
      console.error('Diktat fehlgeschlagen:', e.message);
      alert(t('js.speech_recognition_failed_colon', 'Spracherkennung fehlgeschlagen: ') + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = MIC_ICON;
      _dictateRecorder = null;
    }
  };

  _dictateRecorder.start();
  btn.classList.add('mic-recording');
  btn.innerHTML = MIC_STOP_ICON;
}
