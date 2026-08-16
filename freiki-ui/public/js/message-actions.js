const COPY_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const DOC_ICON   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';
const PPTX_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><rect x="2" y="4" width="20" height="14" rx="2"></rect><path d="M8 21h8"></path><path d="M12 18v3"></path></svg>';

function copyMessage(msgId, btn) {
  const bubble = document.getElementById(msgId);
  if (!bubble) return;
  // Nur den Text-Inhalt kopieren, keine Kind-Elemente (Buttons etc.)
  const text = bubble.dataset.copyText || bubble.innerText.replace(/Kopieren|Copy|Copier|Copiar|Копировать/g, '').trim();
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = CHECK_ICON + ' <span>' + t('common.copied', 'Kopiert') + '</span>';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = COPY_ICON + ' <span>' + t('common.copy', 'Kopieren') + '</span>'; btn.classList.remove('copied'); }, 2000);
  });
}

let _wordExportMsgId = null;
let _wordExportBtn = null;

function exportMessageAsWord(msgId, btn) {
  const bubble = document.getElementById(msgId);
  if (!bubble) return;
  const text = bubble.dataset.copyText || bubble.innerText.replace(/Kopieren|Copy|Copier|Copiar|Копировать|Word/g, '').trim();
  if (!text) return;

  _wordExportMsgId = msgId;
  _wordExportBtn = btn;
  const nameInput = document.getElementById('word-export-filename');
  const modeFallback = slugifyForFilename(modes[currentMode]?.title, 'antwort');
  nameInput.value = slugifyForFilename(bubble.dataset.promptText, modeFallback) + '-antwort';
  document.getElementById('word-export-modal').classList.add('show');
  setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
}

function closeWordExportModal() {
  document.getElementById('word-export-modal').classList.remove('show');
  _wordExportMsgId = null;
  _wordExportBtn = null;
}

async function submitWordExport() {
  const msgId = _wordExportMsgId;
  const btn = _wordExportBtn;
  const bubble = msgId && document.getElementById(msgId);
  if (!bubble || !btn) { closeWordExportModal(); return; }
  const text = bubble.dataset.copyText || bubble.innerText.replace(/Kopieren|Copy|Copier|Copiar|Копировать|Word/g, '').trim();
  if (!text) { closeWordExportModal(); return; }

  let rawName = document.getElementById('word-export-filename').value.trim() || 'antwort';
  rawName = rawName.replace(/\.docx$/i, '');

  closeWordExportModal();
  btn.innerHTML = '<span class="tts-spinner"></span> <span>…</span>';
  btn.disabled = true;

  try {
    const res = await fetch('/api/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, filename: rawName })
    });
    if (!res.ok) throw new Error('Export ' + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rawName + '.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Word-Export fehlgeschlagen:', e.message);
    btn.innerHTML = DOC_ICON + ' <span>' + t('common.error_word', 'Fehler') + '</span>';
    setTimeout(() => { btn.innerHTML = DOC_ICON + ' <span>Word</span>'; btn.disabled = false; }, 2000);
    return;
  }
  btn.innerHTML = DOC_ICON + ' <span>Word</span>';
  btn.disabled = false;
}

let _pptxExportMsgId = null;
let _pptxExportBtn = null;

function exportMessageAsPptx(msgId, btn) {
  const bubble = document.getElementById(msgId);
  if (!bubble) return;
  const text = bubble.dataset.copyText || bubble.innerText.replace(/Kopieren|Copy|Copier|Copiar|Копировать|PowerPoint/g, '').trim();
  if (!text) return;

  _pptxExportMsgId = msgId;
  _pptxExportBtn = btn;
  const nameInput = document.getElementById('pptx-export-filename');
  const modeFallback = slugifyForFilename(modes[currentMode]?.title, 'gliederung');
  nameInput.value = slugifyForFilename(bubble.dataset.promptText, modeFallback) + '-gliederung';
  document.getElementById('pptx-export-modal').classList.add('show');
  setTimeout(() => { nameInput.focus(); nameInput.select(); }, 50);
}

function closePptxExportModal() {
  document.getElementById('pptx-export-modal').classList.remove('show');
  _pptxExportMsgId = null;
  _pptxExportBtn = null;
}

async function submitPptxExport() {
  const msgId = _pptxExportMsgId;
  const btn = _pptxExportBtn;
  const bubble = msgId && document.getElementById(msgId);
  if (!bubble || !btn) { closePptxExportModal(); return; }
  const text = bubble.dataset.copyText || bubble.innerText.replace(/Kopieren|Copy|Copier|Copiar|Копировать|PowerPoint/g, '').trim();
  if (!text) { closePptxExportModal(); return; }

  let rawName = document.getElementById('pptx-export-filename').value.trim() || 'gliederung';
  rawName = rawName.replace(/\.pptx$/i, '');

  closePptxExportModal();
  btn.innerHTML = '<span class="tts-spinner"></span> <span>…</span>';
  btn.disabled = true;

  try {
    const res = await fetch('/api/export-pptx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, filename: rawName })
    });
    if (!res.ok) throw new Error('Export ' + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rawName + '.pptx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('PowerPoint-Export fehlgeschlagen:', e.message);
    btn.innerHTML = PPTX_ICON + ' <span>' + t('common.error_word', 'Fehler') + '</span>';
    setTimeout(() => { btn.innerHTML = PPTX_ICON + ' <span>PowerPoint</span>'; btn.disabled = false; }, 2000);
    return;
  }
  btn.innerHTML = PPTX_ICON + ' <span>PowerPoint</span>';
  btn.disabled = false;
}

// ── Sprechtext-Aufbereitung: Diagramme/Code liest niemand sinnvoll vor, Tabellen-Rohsyntax
// ("Pipe Name Pipe Alter Pipe") auch nicht, Formeln wuerden Zeichen fuer Zeichen buchstabiert.
// Nur fuer Vorlesen relevant - Kopieren/Word-Export nutzen weiterhin den rohen Markdown-Text
// (bubble.dataset.copyText), weil der fuer Weiterverarbeitung (z.B. LaTeX in Overleaf) oft
// wertvoller ist als eine bereinigte Fassung. Nutzt den ohnehin geladenen marked-Lexer statt
// eigener Regex-Parser pro Block-Typ.
function tableTokenToSpeech(token) {
  const header = (token.header || []).map(c => (c.text || '').trim());
  const rows = token.rows || [];
  if (!rows.length) return ' (Tabelle) ';
  return rows.map((row, i) => {
    const cells = row.map((c, j) => `${header[j] || 'Spalte ' + (j + 1)}: ${(c.text || '').trim()}`);
    return `Zeile ${i + 1} – ${cells.join(', ')}.`;
  }).join(' ');
}

function tokensToSpeech(tokens) {
  let out = '';
  for (const token of tokens || []) {
    if (token.type === 'code') {
      out += token.lang === 'mermaid' ? ' (Diagramm) ' : ' (Codeblock) ';
    } else if (token.type === 'table') {
      out += ' ' + tableTokenToSpeech(token) + ' ';
    } else if (token.type === 'list') {
      for (const item of token.items || []) {
        const itemSpeech = tokensToSpeech(item.tokens);
        out += (itemSpeech || item.text || '') + '. ';
      }
    } else if (token.type === 'blockquote') {
      out += tokensToSpeech(token.tokens);
    } else if (token.raw) {
      out += token.raw;
    }
  }
  return out;
}

// protectMathBlocks() wiederverwendet dieselbe MATH{n}-Platzhalterlogik wie safeMarked(),
// damit $...$/$$...$$ nicht als Markdown-Kursivsyntax vom Lexer missverstanden werden.
function buildSpeechText(raw) {
  if (!raw) return '';
  try {
    const { protectedMd } = protectMathBlocks(raw);
    let speech = tokensToSpeech(marked.lexer(protectedMd));
    speech = speech.replace(/MATH\d+/g, ' (Formel) ');
    return speech.replace(/\s+/g, ' ').trim();
  } catch (e) {
    console.warn('Sprechtext-Aufbereitung fehlgeschlagen, nutze Rohtext:', e.message);
    return raw;
  }
}

// ── Vorlesen (Text-to-Speech) ──
const AI_BADGE_HTML = '<img src="/badge-ai.svg" alt="KI" class="tts-ai-badge">';
const TTS_ICON_SPEAK = AI_BADGE_HTML + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M11 5 6 9H2v6h4l5 4V5z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M19 5a9 9 0 0 1 0 14"></path></svg>';
const TTS_ICON_STOP  = AI_BADGE_HTML + '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
let _ttsAudio = null;
let _ttsBtn = null;

function ttsReset(btn) {
  if (btn) { btn.innerHTML = TTS_ICON_SPEAK + ' <span>' + (btn.dataset.ttsLabel || 'Vorlesen') + '</span>'; btn.classList.remove('tts-active'); btn.disabled = false; }
}
function ttsStop() {
  if (_ttsAudio) {
    _ttsAudio.onended = null;
    _ttsAudio.onerror = null;
    _ttsAudio.pause();
    if (_ttsAudio._blobUrl) URL.revokeObjectURL(_ttsAudio._blobUrl);
    _ttsAudio = null;
  }
  ttsReset(_ttsBtn);
  _ttsBtn = null;
}

async function speakMessage(msgId, btn, voice) {
  // Läuft gerade dieselbe Nachricht (mit derselben Stimme)? -> Stopp
  if (_ttsBtn === btn && _ttsAudio) { ttsStop(); return; }
  // Andere Wiedergabe läuft -> erst stoppen
  ttsStop();

  const bubble = document.getElementById(msgId);
  if (!bubble) return;
  const rawText = (bubble.dataset.copyText || bubble.innerText || '').trim();
  if (!rawText) return;
  const text = buildSpeechText(rawText);
  if (!text) return;

  btn.innerHTML = AI_BADGE_HTML + '<span class="tts-spinner"></span> <span>' + t('common.loading_ellipsis', 'Lädt…') + '</span>';
  btn.disabled = true;
  _ttsBtn = btn;

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice })
    });
    if (!res.ok) throw new Error('TTS ' + res.status);
    const blob = await res.blob();
    if (_ttsBtn !== btn) return; // wurde inzwischen abgebrochen
    const url = URL.createObjectURL(blob);
    _ttsAudio = new Audio(url);
    _ttsAudio._blobUrl = url;
    _ttsAudio.onended = () => { URL.revokeObjectURL(url); ttsReset(btn); _ttsAudio = null; _ttsBtn = null; };
    _ttsAudio.onerror = () => { URL.revokeObjectURL(url); ttsReset(btn); _ttsAudio = null; _ttsBtn = null; };
    btn.disabled = false;
    btn.classList.add('tts-active');
    btn.innerHTML = TTS_ICON_STOP + ' <span>' + t('tts.stop', 'Stopp') + '</span>';
    await _ttsAudio.play();
  } catch (e) {
    console.error('Vorlesen fehlgeschlagen:', e.message);
    btn.innerHTML = TTS_ICON_SPEAK + ' <span>' + t('common.error_word', 'Fehler') + '</span>';
    btn.disabled = false;
    setTimeout(() => ttsReset(btn), 2000);
    _ttsBtn = null;
  }
}

function addMessageActions(bubble, msgId, skipTtsAndCopy) {
  // Bei generierten Bildern ergeben Vorlesen (kein sinnvoller Text) und Kopieren
  // (koepiert nur den Bild-Link/Alt-Text, nicht das Bild selbst) keinen Sinn.
  if (skipTtsAndCopy) return null;

  const row = document.createElement('div');
  row.className = 'msg-actions';

  // Deutsch hat zwei Stimmen (m/w, Thorsten/Kerstin) - für die übrigen UI-Sprachen gibt es
  // bewusst nur je eine Piper-Stimme (siehe TTSService.VOICE_MAP), daher dort nur ein
  // generischer "Vorlesen"-Button statt der m/w-Auswahl.
  const uiLang = fkGetUiLang();
  const ttsButtons = [];
  if (uiLang === 'de') {
    const ttsM = document.createElement('button');
    ttsM.className = 'tts-btn';
    ttsM.dataset.ttsLabel = t('tts.read_male', 'Vorlesen (m)');
    ttsM.innerHTML = TTS_ICON_SPEAK + ' <span>' + t('tts.read_male', 'Vorlesen (m)') + '</span>';
    ttsM.onclick = function() { speakMessage(msgId, this, 'thorsten'); };
    ttsButtons.push(ttsM);

    const ttsW = document.createElement('button');
    ttsW.className = 'tts-btn';
    ttsW.dataset.ttsLabel = t('tts.read_female', 'Vorlesen (w)');
    ttsW.innerHTML = TTS_ICON_SPEAK + ' <span>' + t('tts.read_female', 'Vorlesen (w)') + '</span>';
    ttsW.onclick = function() { speakMessage(msgId, this, 'kerstin'); };
    ttsButtons.push(ttsW);
  } else {
    const tts = document.createElement('button');
    tts.className = 'tts-btn';
    tts.dataset.ttsLabel = t('tts.read', 'Vorlesen');
    tts.innerHTML = TTS_ICON_SPEAK + ' <span>' + t('tts.read', 'Vorlesen') + '</span>';
    tts.onclick = function() { speakMessage(msgId, this, uiLang); };
    ttsButtons.push(tts);
  }

  const copy = document.createElement('button');
  copy.className = 'copy-btn';
  copy.innerHTML = COPY_ICON + ' <span>' + t('common.copy', 'Kopieren') + '</span>';
  copy.onclick = function() { copyMessage(msgId, this); };

  const word = document.createElement('button');
  word.className = 'copy-btn';
  word.innerHTML = DOC_ICON + ' <span>Word</span>';
  word.onclick = function() { exportMessageAsWord(msgId, this); };

  const pptx = document.createElement('button');
  pptx.className = 'copy-btn';
  pptx.innerHTML = PPTX_ICON + ' <span>PowerPoint</span>';
  pptx.onclick = function() { exportMessageAsPptx(msgId, this); };

  ttsButtons.forEach(b => row.appendChild(b));
  row.appendChild(copy);
  row.appendChild(word);
  row.appendChild(pptx);

  // Nur im Leichte-Sprache-Modus: ARASAAC-Piktogramme pro Zeile ergänzen (externer
  // Dienst - daher wie Web-Recherche/Mermaid-Export orange markiert).
  if (currentMode === 'leichte_sprache') {
    const symbols = document.createElement('button');
    symbols.className = 'copy-btn symbols-btn';
    symbols.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.add_symbols', '+ Symbole') + '</span>';
    symbols.onclick = function() { addSymbolsToMessage(msgId, this); };
    row.appendChild(symbols);
    showFeatureHint('symbols', t('hint.symbols.title', '💡 Text illustrieren'),
      t('hint.symbols.body', 'Diesen Text kannst du jetzt mit passenden Symbolen illustrieren (experimentell). Klicke dazu unten auf <strong>„+ Symbole“</strong>.'));
  }
  bubble.parentElement.insertBefore(row, bubble.nextSibling);
  return row;
}
