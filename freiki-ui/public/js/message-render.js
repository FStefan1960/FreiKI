// Paperless-Download-Links: per Fetch statt direktem <a href> laden, damit ein 401 (Session
// abgelaufen) abgefangen werden kann, statt den Browser auf eine Fehlerseite navigieren zu lassen.
function patchPaperlessLinks(el) {
  el.querySelectorAll('a[href^="/api/paperless/download/"]').forEach(a => {
    const url = a.getAttribute('href').split('?')[0];
    if (!/^\/api\/paperless\/download\/\d+$/.test(url)) return;
    a.removeAttribute('href');
    a.style.cursor = 'pointer';
    a.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const res = await fetch(url);
        if (!res.ok) { alert(t('js.document_unavailable', 'Dokument nicht verfügbar.')); return; }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } catch(e) { alert(t('js.document_load_error', 'Fehler beim Laden des Dokuments.')); }
    };
  });
}

// ── Messages ──
function addMessage(role, content, fileName) {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `message ${role}`;

  const avatarHtml = role === 'user'
    ? `<div class="message-avatar">${currentUsername[0]?.toUpperCase() || 'U'}</div>`
    : `<div class="message-avatar">K</div>`;
  const fileBadge = fileName ? `<div class="file-badge">📎 ${fileName}</div>\n` : '';
  const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (role === 'ai') {
    div.innerHTML = `
      ${avatarHtml}
      <div class="message-wrapper">
        <div class="message-bubble" id="${msgId}">${fileBadge}${content}</div>
      </div>`;
  } else {
    div.innerHTML = `
      ${avatarHtml}
      <div class="message-bubble" id="${msgId}">${fileBadge}${content}</div>`;
  }

  document.getElementById('messages').appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return div.querySelector('.message-bubble');
}

function addTyping() {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();
  const div = document.createElement('div');
  div.className = 'message ai';
  div.id = 'typing';
  div.innerHTML = `
    <div class="message-avatar">K</div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>`;
  document.getElementById('messages').appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'end' });
}
