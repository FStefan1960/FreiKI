// ── File ──
function fileSelected(input) {
  if (!input.files.length) return;
  if (State.modes[State.currentMode]?.multifile) {
    State.selectedFiles = Array.from(input.files);
    document.getElementById('file-name').textContent =
      State.selectedFiles.length === 1 ? State.selectedFiles[0].name : t('files.n_selected', '{n} Dateien ausgewählt').replace('{n}', State.selectedFiles.length);
  } else {
    State.selectedFile = input.files[0];
    document.getElementById('file-name').textContent = State.selectedFile.name;
  }
  document.getElementById('file-preview').classList.add('show');
}

function filesSelected(input) {
  State.selectedFiles = Array.from(input.files);
  if (State.selectedFiles.length > 0) {
    document.getElementById('file-name').textContent =
      State.selectedFiles.length === 1 ? State.selectedFiles[0].name : t('files.n_selected', '{n} Dateien ausgewählt').replace('{n}', State.selectedFiles.length);
    document.getElementById('file-preview').classList.add('show');
  }
}

function removeFile() {
  State.selectedFile = null;
  State.selectedFiles = [];
  document.getElementById('file-input').value = '';
  document.getElementById('file-preview').classList.remove('show');
}

function attachFile(file) {
  if (State.modes[State.currentMode]?.multifile) {
    State.selectedFiles = [...State.selectedFiles, file];
    document.getElementById('file-name').textContent =
      State.selectedFiles.length === 1 ? file.name : t('files.n_selected', '{n} Dateien ausgewählt').replace('{n}', State.selectedFiles.length);
  } else {
    State.selectedFile = file;
    document.getElementById('file-name').textContent = file.name;
  }
  document.getElementById('file-preview').classList.add('show');
}

function insertTextAtCursor(text) {
  const input = document.getElementById('message-input');
  const start = input.selectionStart, end = input.selectionEnd;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  input.selectionStart = input.selectionEnd = start + text.length;
  autoResize(input);
  input.focus();
}

// ── Einfügen (Button) ──
// navigator.clipboard.read() braucht eine Nutzeraktion und wird nicht überall unterstützt
// (Firefox/Safari lehnen Bild-Zugriff oft ab) - dann bleibt Strg+V als Fallback.
async function pasteFromClipboard() {
  if (!navigator.clipboard?.read) {
    document.getElementById('message-input').focus();
    alert(t('js.paste_use_shortcut', 'Bitte Strg+V (oder Cmd+V) im Eingabefeld verwenden.'));
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(ty => ty.startsWith('image/'));
      if (imageType) {
        const blob = await item.getType(imageType);
        attachFile(new File([blob], `Einfuegung.${imageType.split('/')[1] || 'png'}`, { type: imageType }));
        return;
      }
    }
    const textItem = items.find(item => item.types.includes('text/plain'));
    if (textItem) {
      const blob = await textItem.getType('text/plain');
      insertTextAtCursor(await blob.text());
      return;
    }
    alert(t('js.paste_empty', 'Die Zwischenablage enthält keinen unterstützten Inhalt.'));
  } catch (e) {
    document.getElementById('message-input').focus();
    alert(t('js.paste_use_shortcut', 'Bitte Strg+V (oder Cmd+V) im Eingabefeld verwenden.'));
  }
}

// ── Einfügen (Strg+V im Textfeld) ──
// Bilder (z.B. Screenshot) werden als Anhang übernommen, reiner Text läuft normal weiter
// über das native Paste-Verhalten des Textarea.
document.getElementById('message-input').addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
  if (!imageItem) return;
  const blob = imageItem.getAsFile();
  if (!blob) return;
  e.preventDefault();
  attachFile(new File([blob], `Einfuegung.${imageItem.type.split('/')[1] || 'png'}`, { type: imageItem.type }));
});


// ── Drag & Drop ──
const inputBox = document.getElementById('input-box');
inputBox.addEventListener('dragover', e => {
  e.preventDefault();
  inputBox.classList.add('drag-over');
});
inputBox.addEventListener('dragleave', e => {
  if (!inputBox.contains(e.relatedTarget)) inputBox.classList.remove('drag-over');
});
inputBox.addEventListener('drop', e => {
  e.preventDefault();
  inputBox.classList.remove('drag-over');
  const allowed = ['.txt','.pdf','.doc','.docx','.md','.csv'];
  const droppedFiles = Array.from(e.dataTransfer.files).filter(f => {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    return allowed.includes(ext);
  });
  if (!droppedFiles.length) return;

  if (State.modes[State.currentMode]?.multifile) {
    State.selectedFiles = droppedFiles;
    document.getElementById('file-name').textContent =
      droppedFiles.length === 1 ? droppedFiles[0].name : t('files.n_selected', '{n} Dateien ausgewählt').replace('{n}', droppedFiles.length);
  } else {
    State.selectedFile = droppedFiles[0];
    document.getElementById('file-name').textContent = State.selectedFile.name;
  }
  const file = droppedFiles[0]; // für Kompatibilität mit dem nachfolgenden Code
  document.getElementById('file-preview').classList.add('show');
});

// ── Input ──
function handleKey(e) {
  const input = document.getElementById('message-input');
  if (e.key === 'Enter') {
    const shouldSend = State.enterToSend ? !e.shiftKey : (e.ctrlKey || e.metaKey);
    if (shouldSend) { e.preventDefault(); sendMessage(); }
    return;
  }
  if (e.key === 'ArrowUp' && input.selectionStart === 0) {
    e.preventDefault();
    if (State.inputHistory.length === 0) return;
    if (State.historyIndex === -1) State.historyDraft = input.value;
    State.historyIndex = Math.min(State.historyIndex + 1, State.inputHistory.length - 1);
    input.value = State.inputHistory[State.historyIndex];
    autoResize(input);
    setTimeout(() => input.setSelectionRange(0, 0), 0);
    return;
  }
  if (e.key === 'ArrowDown' && input.selectionStart === input.value.length) {
    e.preventDefault();
    if (State.historyIndex === -1) return;
    State.historyIndex--;
    input.value = State.historyIndex === -1 ? State.historyDraft : State.inputHistory[State.historyIndex];
    autoResize(input);
    setTimeout(() => { const l = input.value.length; input.setSelectionRange(l, l); }, 0);
    return;
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}
