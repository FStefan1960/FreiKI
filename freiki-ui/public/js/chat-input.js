// ── File ──
function fileSelected(input) {
  if (!input.files.length) return;
  if (modes[currentMode]?.multifile) {
    selectedFiles = Array.from(input.files);
    document.getElementById('file-name').textContent =
      selectedFiles.length === 1 ? selectedFiles[0].name : t('files.n_selected', '{n} Dateien ausgewählt').replace('{n}', selectedFiles.length);
  } else {
    selectedFile = input.files[0];
    document.getElementById('file-name').textContent = selectedFile.name;
  }
  document.getElementById('file-preview').classList.add('show');
}

function filesSelected(input) {
  selectedFiles = Array.from(input.files);
  if (selectedFiles.length > 0) {
    document.getElementById('file-name').textContent =
      selectedFiles.length === 1 ? selectedFiles[0].name : t('files.n_selected', '{n} Dateien ausgewählt').replace('{n}', selectedFiles.length);
    document.getElementById('file-preview').classList.add('show');
  }
}

function removeFile() {
  selectedFile = null;
  selectedFiles = [];
  document.getElementById('file-input').value = '';
  document.getElementById('file-preview').classList.remove('show');
}


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

  if (modes[currentMode]?.multifile) {
    selectedFiles = droppedFiles;
    document.getElementById('file-name').textContent =
      droppedFiles.length === 1 ? droppedFiles[0].name : t('files.n_selected', '{n} Dateien ausgewählt').replace('{n}', droppedFiles.length);
  } else {
    selectedFile = droppedFiles[0];
    document.getElementById('file-name').textContent = selectedFile.name;
  }
  const file = droppedFiles[0]; // für Kompatibilität mit dem nachfolgenden Code
  document.getElementById('file-preview').classList.add('show');
});

// ── Input ──
function handleKey(e) {
  const input = document.getElementById('message-input');
  if (e.key === 'Enter') {
    const shouldSend = enterToSend ? !e.shiftKey : (e.ctrlKey || e.metaKey);
    if (shouldSend) { e.preventDefault(); sendMessage(); }
    return;
  }
  if (e.key === 'ArrowUp' && input.selectionStart === 0) {
    e.preventDefault();
    if (inputHistory.length === 0) return;
    if (historyIndex === -1) historyDraft = input.value;
    historyIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
    input.value = inputHistory[historyIndex];
    autoResize(input);
    setTimeout(() => input.setSelectionRange(0, 0), 0);
    return;
  }
  if (e.key === 'ArrowDown' && input.selectionStart === input.value.length) {
    e.preventDefault();
    if (historyIndex === -1) return;
    historyIndex--;
    input.value = historyIndex === -1 ? historyDraft : inputHistory[historyIndex];
    autoResize(input);
    setTimeout(() => { const l = input.value.length; input.setSelectionRange(l, l); }, 0);
    return;
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}
