let modes = {};
let currentMode = null;
let chatHistory = [];
  const threadIds = {}; // mode -> threadId for AnythingLLM
  function getThreadId(mode) {
    if (!threadIds[mode]) threadIds[mode] = `${currentUsername}_${mode}_${Date.now()}`;
    return threadIds[mode];
  }
  function resetThreadId(mode) {
    threadIds[mode] = `${currentUsername}_${mode}_${Date.now()}`;
  }

let selectedFile = null;
let selectedFiles = [];
let authToken = null;

let currentUsername = '';
let currentRole = '';
let enterToSend = true;

let pending2faToken = null;
let pendingUsername = null;

// MultiDoc: welche Aufgabe die zwei Beispiel-Buttons ("Vergleiche ..." / "Fasse ... zusammen")
// serverseitig auslösen sollen (ersetzt das frühere Dropdown, siehe useExample() und sendMessage()).
let multidocTaskChoice = 'zusammenfassen';

const inputHistory = [];
let historyIndex = -1;
let historyDraft = '';

// Icon-Konstanten, die dateiuebergreifend genutzt werden (session-bootstrap.js/
// dictation.js bzw. message-actions.js/symbols-wizard.js) - restliche, nur lokal
// genutzte Icons stehen weiter in ihrer jeweiligen Datei.
const CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"></polyline></svg>';
const SYMBOLS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
const MIC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>';
const MIC_STOP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
