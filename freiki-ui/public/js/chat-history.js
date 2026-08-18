// ── Chat-Verlauf localStorage (persistent pro User+Modus, bleibt rein clientseitig — kein Server-Sync) ──
const MAX_HISTORY_MESSAGES = 200; // Obergrenze in Nachrichten statt Bytes, damit die Größe unabhängig von Nachrichtenlänge vorhersagbar bleibt

function historyKey(mode) {
  return `freiki_history_${State.currentUsername}_${mode}`;
}

function saveHistory(mode) {
  try {
    // Auf die letzten MAX_HISTORY_MESSAGES begrenzen, älteste zuerst raus.
    // Nur Rolle + Inhalt speichern, keine langen Datei-Inhalte (> 500 Zeichen kürzen) —
    // die letzte Nachricht bleibt aber immer vollständig erhalten
    const capped = State.chatHistory.slice(-MAX_HISTORY_MESSAGES);
    const lastIndex = capped.length - 1;
    const slim = capped.map((m, i) => ({
      role: m.role,
      content: i < lastIndex && m.content.length > 500 ? m.content.slice(0, 500) + ' [...]' : m.content
    }));
    localStorage.setItem(historyKey(mode), JSON.stringify(slim));
  } catch(e) {}
}

function loadHistory(mode) {
  try {
    const raw = localStorage.getItem(historyKey(mode));
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function migrateOldHistory() {
  // Einmalige Migration von der alten tagesgebundenen Key-Form
  // (freiki_history_<user>_<mode>_YYYY-MM-DD) auf den neuen persistenten Key.
  // Danach räumt sich diese Funktion selbst weg (keine datierten Keys mehr übrig).
  try {
    const datedKeyPattern = /^freiki_history_.+_\d{4}-\d{2}-\d{2}$/;
    Object.keys(localStorage).forEach(k => {
      if (!datedKeyPattern.test(k)) return;
      const newKey = k.replace(/_\d{4}-\d{2}-\d{2}$/, '');
      if (!localStorage.getItem(newKey)) {
        const val = localStorage.getItem(k);
        if (val) localStorage.setItem(newKey, val);
      }
      localStorage.removeItem(k);
    });
  } catch(e) {}
}
migrateOldHistory();
