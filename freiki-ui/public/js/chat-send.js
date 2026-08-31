// ── Send ──
// forceSearchAllAreas: nur von retryMessageSearchAllAreas() gesetzt (Button "Auch andere
// Bereiche durchsuchen" unter einer Wissen-Antwort, siehe message-actions.js) - kein
// dauerhafter UI-Zustand mehr, gilt nur für genau diesen einen Retry.
async function sendMessage(forceSearchAllAreas = false) {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  const isMulti = !!(State.modes[State.currentMode]?.multifile);
  if (!text && !State.selectedFile && State.selectedFiles.length === 0) return;
  if (text) { State.inputHistory.unshift(text); if (State.inputHistory.length > 50) State.inputHistory.pop(); State.historyIndex = -1; State.historyDraft = ''; }

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  const fileLabel = isMulti && State.selectedFiles.length > 0
    ? t('chat.n_documents', '{n} Dokument(e)').replace('{n}', State.selectedFiles.length)
    : State.selectedFile?.name;
  const displayText = text || t('chat.process_files_fallback', 'Bitte verarbeite diese Datei(en).');
  addMessage('user', displayText, fileLabel);
  State.chatHistory.push({ role: 'user', content: displayText });

  input.value = '';
  input.style.height = 'auto';
  addTyping();

  try {
    const formData = new FormData();
    formData.append('message', text || t('chat.process_files_fallback', 'Bitte verarbeite diese Datei(en).'));
    formData.append('mode', State.currentMode);
    formData.append('username', State.currentUsername);
    formData.append('history', JSON.stringify(State.chatHistory.slice(-4)));
    const usedSearchAllAreas = !!forceSearchAllAreas;
    if (usedSearchAllAreas) formData.append('searchAllAreas', '1');
    if (isMulti) {
      State.selectedFiles.forEach(f => formData.append('files', f));
      formData.append('multidoc_task', State.multidocTaskChoice);
      State.multidocTaskChoice = 'zusammenfassen';
    } else if (State.selectedFile) {
      formData.append('file', State.selectedFile);
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

    // BGT-Speicher-Warnung: nur für die Rolle "high_risk" (Berufsgeheimnisträger), siehe
    // bgt-welcome.md. Prüft die fertige Antwort (nicht die Frage - die bleibt wie gewohnt
    // gespeichert) gegen dieselbe Stichwortliste wie der serverseitige Audit-Log.
    let noHistory = false;
    if (State.currentRole === 'high_risk' && fullText) {
      const category = detectSensitiveCategory(fullText);
      if (category) noHistory = !(await showSensitiveSaveModal(category));
    }

    State.chatHistory.push(noHistory ? { role: 'assistant', content: fullText, noHistory: true } : { role: 'assistant', content: fullText });
    upsertCurrentConversation(State.currentMode);
    if (fullText) {
      const msgId = bubble.id;
      bubble.innerHTML = safeMarked(fullText);
      patchPaperlessLinks(bubble);
      renderMermaidBlocks(bubble, displayText);
      renderMathBlocks(bubble);
      enhanceChatImages(bubble);
      // Text als data-Attribut speichern für sauberes Kopieren
      bubble.dataset.copyText = fullText;
      // Zugehörige User-Frage merken, damit z.B. der Word-Export einen sprechenden
      // Dateinamen ableiten kann (analog zu promptText bei Mermaid-Diagramm-Exporten).
      bubble.dataset.promptText = displayText;
      // Button "Auch andere Bereiche durchsuchen": immer bei Wissen-Antworten außer Hilfe (die
      // bleibt bewusst begrenzt, siehe WissenChatMode.js) und nur, wenn diese Antwort noch NICHT
      // schon bereichsübergreifend gesucht hat - sonst gäbe es nichts Breiteres mehr zu suchen.
      // Bewusst unabhängig von Trefferqualität/-anzahl: ein Schwellwert lässt sich nie so genau
      // treffen, dass er echte Nahtreffer durchlässt, aber verwandte Falschtreffer aus einem
      // engen Bereich zuverlässig ausschließt (siehe KBService.WISSEN_SINGLE_AREA_MAX_DISTANCE).
      const isWissenNonHilfe = State.modes[State.currentMode]?.workspace === 'wissen' &&
        State.currentMode.replace(/^w_/, '') !== 'hilfe';
      addMessageActions(bubble, msgId, !!(State.modes[State.currentMode]?.imagegen || State.modes[State.currentMode]?.qrgen), isWissenNonHilfe && !usedSearchAllAreas);
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
