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
    ? `<div class="message-avatar">${State.currentUsername[0]?.toUpperCase() || 'U'}</div>`
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

// Chat-Bilder in der Bubble skalieren (CSS) und per Klick in Originalgroesse oeffnen,
// inkl. seitlichem Scrollen - analog zur Mermaid-Grossansicht. Ohne Wrapper wuerde
// overflow-x:hidden auf .messages den nicht passenden Teil einfach abschneiden.
function enhanceChatImages(bubble) {
  bubble.querySelectorAll('img').forEach(img => {
    if (img.classList.contains('mermaid-ai-badge') || img.classList.contains('tts-ai-badge')) return;
    if (img.closest('.message-image-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'message-image-wrap';
    img.replaceWith(wrap);
    wrap.appendChild(img);
    img.title = t('js.mermaid_click_zoom', 'Klicken zum Vergrößern');
    img.addEventListener('click', () => openImageLightbox(img));
  });
}

function openImageLightbox(imgEl) {
  const overlay = document.createElement('div');
  overlay.className = 'mermaid-lightbox-overlay';
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  const box = document.createElement('div');
  box.className = 'mermaid-lightbox';
  const full = document.createElement('img');
  full.className = 'image-lightbox-img';
  full.src = imgEl.currentSrc || imgEl.src;
  full.alt = imgEl.alt || '';
  const actions = document.createElement('div');
  actions.className = 'mermaid-lightbox-actions';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = t('js.close_x', '✕ Schließen');
  closeBtn.addEventListener('click', close);
  actions.append(closeBtn);
  box.append(full, actions);
  overlay.append(box);
  document.body.append(overlay);
}
