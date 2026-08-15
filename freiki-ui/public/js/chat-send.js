// ── Send ──
async function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  const isMulti = !!(modes[currentMode]?.multifile);
  if (!text && !selectedFile && selectedFiles.length === 0) return;
  if (text) { inputHistory.unshift(text); if (inputHistory.length > 50) inputHistory.pop(); historyIndex = -1; historyDraft = ''; }

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  const fileLabel = isMulti && selectedFiles.length > 0
    ? t('chat.n_documents', '{n} Dokument(e)').replace('{n}', selectedFiles.length)
    : selectedFile?.name;
  const displayText = text || t('chat.process_files_fallback', 'Bitte verarbeite diese Datei(en).');
  addMessage('user', displayText, fileLabel);
  chatHistory.push({ role: 'user', content: displayText });

  input.value = '';
  input.style.height = 'auto';
  addTyping();

  try {
    const formData = new FormData();
    formData.append('message', text || t('chat.process_files_fallback', 'Bitte verarbeite diese Datei(en).'));
    formData.append('mode', currentMode);
    formData.append('username', currentUsername);
    formData.append('history', JSON.stringify(chatHistory.slice(-4)));
    formData.append('threadId', getThreadId(currentMode));
    if (isMulti) {
      selectedFiles.forEach(f => formData.append('files', f));
      formData.append('multidoc_task', multidocTaskChoice);
      multidocTaskChoice = 'zusammenfassen';
    } else if (selectedFile) {
      formData.append('file', selectedFile);
    }
    removeFile();

    const response = await fetch('/api/chat', { method: 'POST', body: formData });
    if (response.status === 401) { forceLogout(); return; }

    // Tipp-Animation bleibt sichtbar, bis der erste echte Content-Chunk da ist:
    // response.body ist schon verfuegbar, sobald der Server die Header flusht
    // (passiert noch vor dem eigentlichen LLM-Aufruf) - ohne diese Verzoegerung
    // haengt bei langsamem Modell/Provider eine leere, animationslose Blase da.
    let bubble = null;
    let fullText = '';

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop(); // unvollständige letzte Zeile puffern
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              if (!bubble) {
                document.getElementById('typing')?.remove();
                bubble = addMessage('ai', '');
              }
              fullText += delta;
              bubble.innerHTML = safeMarked(fullText);
              patchPaperlessLinks(bubble);
              bubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
          } catch (e) {}
        }
      }
    }
    document.getElementById('typing')?.remove();
    if (!bubble) bubble = addMessage('ai', '');

    // Manche Modelle (z.B. Qwen3) liefern leere <think></think>-Bloecke, die im
    // gerenderten HTML unsichtbar sind, aber beim Kopieren/Vorlesen mitgehen.
    fullText = fullText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    chatHistory.push({ role: 'assistant', content: fullText });
    saveHistory(currentMode);
    if (fullText) {
      const msgId = bubble.id;
      bubble.innerHTML = safeMarked(fullText);
      patchPaperlessLinks(bubble);
      renderMermaidBlocks(bubble, displayText);
      renderMathBlocks(bubble);
      // Text als data-Attribut speichern für sauberes Kopieren
      bubble.dataset.copyText = fullText;
      // Zugehörige User-Frage merken, damit z.B. der Word-Export einen sprechenden
      // Dateinamen ableiten kann (analog zu promptText bei Mermaid-Diagramm-Exporten).
      bubble.dataset.promptText = displayText;
      addMessageActions(bubble, msgId, !!(modes[currentMode]?.imagegen || modes[currentMode]?.qrgen));
      addStarRating(bubble, msgId);
      const msgs = document.getElementById('messages');
      requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
    }

  } catch (e) {
    document.getElementById('typing')?.remove();
    addMessage('ai', t('chat.processing_error', '⚠️ Fehler bei der Verarbeitung. Bitte versuchen Sie es erneut.'));
  }

  sendBtn.disabled = false;
  input.focus();
}
