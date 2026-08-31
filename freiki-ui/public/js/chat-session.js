// ── Mode ──
// Header/Icon/Paperless-Filter/Upload-Modus für einen Modus setzen, OHNE den Chat-Inhalt
// anzufassen - gemeinsam genutzt von setMode() (startet frisch) und loadConversation()
// (stellt eine gespeicherte Unterhaltung wieder her, siehe chat-history.js).
function applyModeChrome(key) {
  State.currentMode = key;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + key);
  if (btn) btn.classList.add('active');
  const m = State.modes[key];
  if (!m) return null;
  setHeaderIcon(m.icon, m.key);
  document.getElementById('header-title').textContent = m.title;
  document.getElementById('header-desc').textContent = m.desc || '';

  // Paperless-Filter-Modus vs. normaler Chat
  const isPaperless = !!m.paperless;
  document.getElementById('input-box').style.display        = isPaperless ? 'none' : '';
  document.getElementById('messages').style.display         = isPaperless ? 'none' : '';
  document.getElementById('paperless-filter-panel').style.display = isPaperless ? 'flex' : 'none';
  if (isPaperless) plLoadMeta();

  // Upload-Modus umschalten
  const isMulti = !!m.multifile;
  const fi = document.getElementById('file-input');
  if (isMulti) { fi.setAttribute('multiple', ''); } else { fi.removeAttribute('multiple'); }
  removeFile();
  return m;
}

function setMode(key) {
  showChat();
  const m = applyModeChrome(key);
  if (!m) return;
  // Jeder Moduswechsel startet einen frischen Chat - die vorherige Unterhaltung bleibt
  // über die History-Leiste (Tab "Verlauf") erreichbar, siehe chat-history.js.
  newChat();
  closeSidebar();
}


function newChat() {
  State.chatHistory = [];
  endCurrentConversation(); // vorherige Unterhaltung bleibt als History-Eintrag erhalten
  State.selectedFile = null;
  State.multidocTaskChoice = 'zusammenfassen';
  document.getElementById('file-preview').classList.remove('show');
  document.getElementById('message-input').value = '';
  const m = State.modes[State.currentMode] || {};
  document.getElementById('messages').innerHTML = `
    <div class="welcome" id="welcome">
      <div class="welcome-icon-tile">${modeIconHTML(m.icon || '💬', State.currentMode)}</div>
      <h2>${m.title || window.FK_APP_NAME}</h2>
      <p>${m.welcome || ''}</p>
      ${m.hint ? `<div class="welcome-hint">${m.hint}</div>` : ''}
      ${m.examples && m.examples.length ? `<div class="welcome-examples">${m.examples.map((e, i) => `<span class="welcome-example-chip" onclick="useExample(${i})">${e.startsWith('BEGIN:VCARD') ? t('chat.my_vcard_example', '📇 Meine Visitenkarte (editierbar)') : e}</span>`).join('')}</div>` : ''}
    </div>`;

  // "Übersetzen" (3translate): Eingabefeld mit Standard-Zielsprache Deutsch vorbelegen,
  // die Sprach-Buttons überschreiben das beim Klick (siehe useExample()).
  if (State.currentMode === '3translate') {
    const input = document.getElementById('message-input');
    input.value = 'Übersetze ins Deutsche: ';
    autoResize(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

// Beispiel-Chip angeklickt: Text (ohne trägendes "…") ins Eingabefeld übernehmen und Cursor ans Ende setzen
async function useExample(i) {
  const m = State.modes[State.currentMode] || {};
  const text = (m.examples || [])[i];
  if (!text) return;
  const input = document.getElementById('message-input');
  let value = text.replace(/\s*…+\s*$/, ' ');
  // QR-Code vCard-Beispiel: Platzhalter-Daten durch die des eingeloggten Users ersetzen.
  // \n im statischen Beispieltext (Frontmatter kennt keine echten Zeilenumbrüche) hier erst
  // in echte Umbrüche wandeln, damit der QR-Code eine gültige mehrzeilige vCard codiert.
  if (value.startsWith('BEGIN:VCARD')) {
    value = (await buildVCardForCurrentUser()) || value.replace(/\\n/g, '\n');
  }
  input.value = value;
  input.focus();
  autoResize(input);
  const len = input.value.length;
  input.setSelectionRange(len, len);
  // MultiDoc: erster Beispiel-Button = Vergleichen, zweiter = Zusammenfassen (siehe State.multidocTaskChoice)
  if (State.currentMode === '7multidoc') {
    State.multidocTaskChoice = i === 0 ? 'vergleichen' : 'zusammenfassen';
  }
}

// Baut eine vCard aus dem Profil des eingeloggten Users (/api/me liefert first_name/
// last_name/funktion/telefon/email nur dort, nicht im Login-Response). Bei Fehler/fehlenden
// Namensdaten null, damit useExample() auf den statischen Beispieltext zurückfällt.
async function buildVCardForCurrentUser() {
  try {
    const r = await fetch('/api/me', { cache: 'no-store' });
    if (!r.ok) return null;
    const me = await r.json();
    const first = (me.first_name || '').trim();
    const last = (me.last_name || '').trim();
    if (!first && !last) return null;
    const funktion = (me.funktion || '').trim();
    // Kein persönlicher Durchwahl-Anschluss in den Userdaten hinterlegt -
    // Zentrale als Platzhalter-Telefonnummer, falls keine hinterlegt ist.
    const telefon = (me.telefon || '').trim() || '07851/84-0';
    const email = (me.email || '').trim();
    const lines = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `N:${last};${first};;;`,
      `FN:${[first, last].filter(Boolean).join(' ')}`,
      'ORG:Diakonie Kork',
    ];
    if (funktion) lines.push(`TITLE:${funktion}`);
    lines.push(`TEL;TYPE=work,voice:${telefon}`);
    if (email) lines.push(`EMAIL;TYPE=work:${email}`);
    lines.push('ADR;TYPE=work:;;Landstr. 1;Kehl;;77694;Deutschland');
    lines.push('URL:https://diakonie-kork.de');
    lines.push('END:VCARD');
    return lines.join('\n');
  } catch {
    return null;
  }
}

function restoreChat(mode, history) {
  State.chatHistory = history;
  State.selectedFile = null;
  document.getElementById('file-preview').classList.remove('show');
  document.getElementById('message-input').value = '';
  const m = State.modes[mode] || {};
  const container = document.getElementById('messages');
  container.innerHTML = '';

  // Nachrichten wiederherstellen - nur die letzten 20 rendern (Performance bei langem
  // Verlauf). State.chatHistory selbst bleibt vollständig, für den LLM-Kontext wird ohnehin
  // nur State.chatHistory.slice(-4) verschickt (siehe sendMessage()).
  const MAX_DISPLAYED_HISTORY = 20;
  const truncated = history.length > MAX_DISPLAYED_HISTORY;
  const displayHistory = history.slice(-MAX_DISPLAYED_HISTORY);
  let lastUserText = '';
  displayHistory.forEach(msg => {
    const bubble = addMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
    if (msg.role === 'user') lastUserText = msg.content;
    if (msg.role === 'assistant' && bubble) {
      bubble.innerHTML = safeMarked(msg.content);
      patchPaperlessLinks(bubble);
      renderMermaidBlocks(bubble, lastUserText);
      renderMathBlocks(bubble);
      enhanceChatImages(bubble);
      bubble.dataset.copyText = msg.content;
      bubble.dataset.promptText = lastUserText;
      const msgId = bubble.id;
      addMessageActions(bubble, msgId, !!(m.imagegen || m.qrgen));
    }
  });

  // Hinweis dass es ein wiederhergestellter Verlauf ist
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;font-size:11px;color:#9ca3af;margin:8px 0;';
  hint.textContent = truncated
    ? t('chat.history_hint_truncated', '↑ Nur die letzten {n} Nachrichten angezeigt – "+ Neu" für neues Gespräch').replace('{n}', MAX_DISPLAYED_HISTORY)
    : t('chat.history_hint_full', '↑ Bisheriger Verlauf – "+ Neu" für neues Gespräch');
  document.getElementById('messages').appendChild(hint);
}
