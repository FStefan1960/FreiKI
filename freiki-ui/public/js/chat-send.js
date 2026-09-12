// ── Send ──
// Ob der Nutzer gerade am unteren Rand von #messages ist - nur dann soll ein neuer
// Streaming-Chunk automatisch nach unten scrollen. Wer während der Generierung
// hochscrollt, um Vorheriges zu lesen, wird sonst bei jedem Chunk zurückgerissen.
function nearBottom(el, threshold = 120) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

// Send-Button wird während der Generierung zum Stop-Button (Klick bricht ab statt zu senden,
// siehe activeAbortController-Check am Anfang von sendMessage()).
function setSendButtonState(generating) {
  const btn = document.getElementById('send-btn');
  btn.setAttribute('aria-label', generating ? t('input.stop_title', 'Generierung abbrechen') : t('input.send_title', 'Nachricht senden'));
  btn.innerHTML = generating
    ? MIC_STOP_ICON
    : '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
}

// forceSearchAllAreas: nur von retryMessageSearchAllAreas() gesetzt (Button "Auch andere
// Bereiche durchsuchen" unter einer Wissen-Antwort, siehe message-actions.js) - kein
// dauerhafter UI-Zustand mehr, gilt nur für genau diesen einen Retry.
async function sendMessage(forceSearchAllAreas = false) {
  // Während eine Antwort generiert wird, ist dies der Stop-Button: derselbe Klick
  // bricht die laufende Anfrage ab, statt eine neue zu senden.
  if (State.activeAbortController) { State.activeAbortController.abort(); return; }

  const input = document.getElementById('message-input');
  const text = input.value.trim();
  const isMulti = !!(State.modes[State.currentMode]?.multifile);
  if (!text && !State.selectedFile && State.selectedFiles.length === 0) return;
  if (text) { State.inputHistory.unshift(text); if (State.inputHistory.length > 50) State.inputHistory.pop(); State.historyIndex = -1; State.historyDraft = ''; }

  const fileLabel = isMulti && State.selectedFiles.length > 0
    ? t('chat.n_documents', '{n} Dokument(e)').replace('{n}', State.selectedFiles.length)
    : State.selectedFile?.name;
  const displayText = text || t('chat.process_files_fallback', 'Bitte verarbeite diese Datei(en).');
  addMessage('user', displayText, fileLabel);
  State.chatHistory.push({ role: 'user', content: displayText });

  input.value = '';
  input.style.height = 'auto';
  addTyping();

  const controller = new AbortController();
  State.activeAbortController = controller;
  setSendButtonState(true);
  let aborted = false;

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

    const response = await fetch('/api/chat', { method: 'POST', body: formData, signal: controller.signal });
    if (response.status === 401) {
      State.activeAbortController = null;
      setSendButtonState(false);
      forceLogout();
      return;
    }

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
      let chunk;
      try {
        chunk = await reader.read();
      } catch (readErr) {
        if (readErr.name === 'AbortError') { aborted = true; break; }
        throw readErr;
      }
      if (chunk.done) break;
      sseBuffer += decoder.decode(chunk.value, { stream: true });
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
              const msgs = document.getElementById('messages');
              const stick = nearBottom(msgs);
              fullText += delta;
              bubble.innerHTML = safeMarked(fullText);
              patchPaperlessLinks(bubble);
              if (stick) bubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
    if (aborted && fullText) fullText += `\n\n*${t('chat.generation_stopped', 'Generierung abgebrochen.')}*`;

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
      const msgs = document.getElementById('messages');
      const stick = nearBottom(msgs);
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
      if (stick) requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
    }

  } catch (e) {
    document.getElementById('typing')?.remove();
    if (e.name !== 'AbortError') {
      addMessage('ai', t('chat.processing_error', '⚠️ Fehler bei der Verarbeitung. Bitte versuchen Sie es erneut.'));
    }
  }

  State.activeAbortController = null;
  setSendButtonState(false);
  input.focus();
}
