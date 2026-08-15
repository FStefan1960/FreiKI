const hilfeSessionId = 'hilfe-' + Math.random().toString(36).slice(2);
let hilfePanelOpen = false;

function toggleHilfeBubble() {
  hilfePanelOpen = !hilfePanelOpen;
  document.getElementById('hilfe-bubble-panel').classList.toggle('open', hilfePanelOpen);
  if (hilfePanelOpen) document.getElementById('hilfe-input').focus();
}

async function sendHilfeFrage() {
  const input = document.getElementById('hilfe-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const msgs = document.getElementById('hilfe-bubble-messages');

  // User-Nachricht
  const userDiv = document.createElement('div');
  userDiv.className = 'hilfe-msg hilfe-user';
  userDiv.textContent = text;
  msgs.appendChild(userDiv);

  // Typing-Indikator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'hilfe-msg hilfe-bot hilfe-typing';
  typingDiv.textContent = '…';
  msgs.appendChild(typingDiv);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const res = await fetch('/api/hilfe-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: hilfeSessionId })
    });
    const data = await res.json();
    typingDiv.classList.remove('hilfe-typing');
    typingDiv.textContent = data.answer || data.error || t('hilfe_bubble.no_answer', '⚠️ Keine Antwort');
  } catch(e) {
    typingDiv.classList.remove('hilfe-typing');
    typingDiv.textContent = t('hilfe_bubble.connection_error', '⚠️ Verbindungsfehler');
  }
  msgs.scrollTop = msgs.scrollHeight;
}
