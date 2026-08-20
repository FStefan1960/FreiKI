// ── Chat-Verlauf: mehrere gespeicherte Unterhaltungen pro Nutzer, rein clientseitig in
// localStorage (kein Server-Sync) - Grundlage für die History-Leiste (Sidebar-Tab "Verlauf").
// Jede Unterhaltung ist ein Eintrag { id, mode, title, updatedAt, messages }. Die aktuell
// offene Unterhaltung wird bei jeder Nachricht live in der Liste aktualisiert (kein separater
// Zwischenspeicher nötig) und dient zugleich als Reload-Schutz (siehe getResumableConversation()).
const MAX_HISTORY_MESSAGES = 200; // Obergrenze in Nachrichten statt Bytes, damit die Größe unabhängig von Nachrichtenlänge vorhersagbar bleibt
const MAX_CONVERSATIONS = 50;
const MAX_TITLE_LENGTH = 60;

function convStoreKey() {
  return `freiki_conversations_${State.currentUsername}`;
}
function currentConvKey() {
  return `freiki_current_conv_${State.currentUsername}`;
}

function loadConversations() {
  try {
    const raw = localStorage.getItem(convStoreKey());
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function saveConversations(list) {
  try {
    localStorage.setItem(convStoreKey(), JSON.stringify(list.slice(0, MAX_CONVERSATIONS)));
  } catch (e) {} // z.B. Speicher voll - Verlauf ist nur "nice to have", kein harter Fehler
}

// Nur Rolle + Inhalt speichern, keine langen Datei-Inhalte (> 500 Zeichen kürzen) - die
// letzte Nachricht bleibt aber immer vollständig erhalten.
function slimMessages(history) {
  const capped = history.slice(-MAX_HISTORY_MESSAGES);
  const lastIndex = capped.length - 1;
  return capped.map((m, i) => ({
    role: m.role,
    content: i < lastIndex && m.content.length > 500 ? m.content.slice(0, 500) + ' [...]' : m.content
  }));
}

function deriveTitle(messages) {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return t('history.untitled', 'Neuer Chat');
  const text = firstUser.content.replace(/\s+/g, ' ').trim();
  return text.length > MAX_TITLE_LENGTH ? text.slice(0, MAX_TITLE_LENGTH) + '…' : text;
}

// Nach jedem Senden/Empfangen aufgerufen (siehe chat-send.js): legt bei der ersten
// Nachricht einer Unterhaltung einen neuen History-Eintrag an und hält ihn danach aktuell.
function upsertCurrentConversation(mode) {
  if (!State.chatHistory.length) return;
  const list = loadConversations();
  const messages = slimMessages(State.chatHistory);
  let entry = State.currentConversationId && list.find(c => c.id === State.currentConversationId);
  if (!entry) {
    entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), title: '', mode, updatedAt: 0, messages: [] };
    list.unshift(entry);
    State.currentConversationId = entry.id;
    try { localStorage.setItem(currentConvKey(), entry.id); } catch (e) {}
  }
  entry.mode = mode;
  entry.messages = messages;
  entry.updatedAt = Date.now();
  if (!entry.title) entry.title = deriveTitle(messages);
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  saveConversations(list);
}

// Aktuell offene Unterhaltung "schließen" (der Eintrag selbst bleibt in der Liste, also in
// der History-Leiste, erhalten) - aufgerufen von newChat() in chat-session.js.
function endCurrentConversation() {
  State.currentConversationId = null;
  try { localStorage.removeItem(currentConvKey()); } catch (e) {}
}

function deleteConversation(id) {
  saveConversations(loadConversations().filter(c => c.id !== id));
  if (State.currentConversationId === id) endCurrentConversation();
}

// Für den Reload-Schutz beim App-Start (siehe modes.js/loadModes()): liefert die
// zuletzt offene Unterhaltung, falls noch vorhanden.
function getResumableConversation() {
  try {
    const id = localStorage.getItem(currentConvKey());
    if (!id) return null;
    return loadConversations().find(c => c.id === id) || null;
  } catch (e) { return null; }
}

// Eine gespeicherte Unterhaltung aus der History-Leiste öffnen.
function loadConversation(id) {
  const entry = loadConversations().find(c => c.id === id);
  if (!entry) return;
  showChat();
  const m = applyModeChrome(entry.mode);
  if (!m) { newChat(); closeSidebar(); return; } // Modus existiert nicht mehr (z.B. Bereich entfernt)
  State.currentConversationId = entry.id;
  try { localStorage.setItem(currentConvKey(), entry.id); } catch (e) {}
  restoreChat(entry.mode, entry.messages);
  closeSidebar();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatHistoryDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const HISTORY_TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

function renderHistoryPanel() {
  const panel = document.getElementById('mode-buttons-verlauf');
  if (!panel) return;
  const list = loadConversations();
  if (!list.length) {
    panel.innerHTML = `<div class="history-empty">${t('history.empty', 'Noch keine gespeicherten Unterhaltungen.')}</div>`;
    return;
  }
  panel.innerHTML = '';
  list.forEach(entry => {
    const m = State.modes[entry.mode] || {};
    const row = document.createElement('button');
    row.className = 'mode-btn history-row' + (entry.id === State.currentConversationId ? ' active' : '');
    row.type = 'button';
    row.onclick = () => loadConversation(entry.id);
    row.innerHTML = `
      <div class="mode-icon">${modeIconHTML(m.icon || '💬', m.key)}</div>
      <div class="mode-nav-text">
        <div class="mode-nav-title">${escapeHtml(entry.title || t('history.untitled', 'Neuer Chat'))}</div>
        <div class="mode-nav-sub">${escapeHtml(m.title || entry.mode)} · ${formatHistoryDate(entry.updatedAt)}</div>
      </div>
      <span class="history-row-delete" role="button" tabindex="0" title="${t('history.delete', 'Unterhaltung löschen')}" aria-label="${t('history.delete', 'Unterhaltung löschen')}">${HISTORY_TRASH_ICON}</span>`;
    row.querySelector('.history-row-delete').addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!confirm(t('history.delete_confirm', 'Diese Unterhaltung wirklich löschen?'))) return;
      deleteConversation(entry.id);
      renderHistoryPanel();
    });
    panel.appendChild(row);
  });
}

// Migration: alte Einzel-Verlauf-Keys (freiki_history_<user>_<mode>, ein Array direkt als
// Wert - Vorgänger-Modell mit genau einer laufenden Unterhaltung pro Modus statt einer
// Liste) in je einen Eintrag der neuen Liste überführen, damit laufende Chats beim Umstieg
// nicht verloren gehen. Räumt die alten Keys danach weg. Muss NACH dem Setzen von
// State.currentUsername aufgerufen werden (siehe session-bootstrap.js).
function migrateOldChatHistory() {
  if (!State.currentUsername) return;
  try {
    // Uralte, tagesgebundene Zwischenform (vor der ersten Migration von damals) noch abfangen.
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

    const prefix = `freiki_history_${State.currentUsername}_`;
    const list = loadConversations();
    let changed = false;
    Object.keys(localStorage).forEach(k => {
      if (!k.startsWith(prefix)) return;
      const mode = k.slice(prefix.length);
      try {
        const messages = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(messages) && messages.length) {
          list.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            title: deriveTitle(messages),
            mode,
            updatedAt: Date.now(),
            messages: slimMessages(messages),
          });
          changed = true;
        }
      } catch (e) {}
      localStorage.removeItem(k);
    });
    if (changed) {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      saveConversations(list);
    }
  } catch (e) {}
}
