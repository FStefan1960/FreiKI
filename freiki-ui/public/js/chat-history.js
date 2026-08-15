// ── Chat-Verlauf localStorage (tagesaktuell) ──
const TODAY = new Date().toISOString().slice(0, 10);

function historyKey(mode) {
  return `freiki_history_${currentUsername}_${mode}_${TODAY}`;
}

function saveHistory(mode) {
  try {
    // Nur Rolle + Inhalt speichern, keine langen Datei-Inhalte (> 500 Zeichen kürzen) —
    // die letzte Nachricht bleibt aber immer vollständig erhalten
    const lastIndex = chatHistory.length - 1;
    const slim = chatHistory.map((m, i) => ({
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

function clearOldHistory() {
  // Alle freiki_history-Einträge löschen die nicht von heute sind
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('freiki_history_') && !k.endsWith(`_${TODAY}`))
      .forEach(k => localStorage.removeItem(k));
  } catch(e) {}
}
clearOldHistory();
