// ── Leichte Sprache: Piktogramme pro Zeile, Schritt für Schritt bestätigen ──
let _symbolsWizard = null; // { msgId, btn, lines: [{text, keyword, candidates}], index, chosen: [{text, pictogram|null}] }

async function addSymbolsToMessage(msgId, btn) {
  const bubble = document.getElementById(msgId);
  if (!bubble) return;
  const text = bubble.dataset.copyText || bubble.innerText.replace(/Vorlesen \(m\)|Vorlesen \(w\)|Read aloud \(M\)|Read aloud \(F\)|Lire \(H\)|Lire \(F\)|Leer \(H\)|Leer \(M\)|Прослушать \(М\)|Прослушать \(Ж\)|Kopieren|Copy|Copier|Copiar|Копировать|Word|\+ Symbole|\+ Symbols|\+ Symboles|\+ Símbolos|\+ Символы/g, '').trim();
  if (!text) return;

  btn.innerHTML = '<span class="tts-spinner"></span> <span>…</span>';
  btn.disabled = true;

  let lines;
  try {
    const res = await fetch('/api/leichte-sprache/symbols', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 401) { forceLogout(); return; }
    if (!res.ok) throw new Error('Symbole ' + res.status);
    ({ lines } = await res.json());
  } catch (e) {
    console.error('Symbole fehlgeschlagen:', e.message);
    btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('common.error_word', 'Fehler') + '</span>';
    setTimeout(() => { btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.add_symbols', '+ Symbole') + '</span>'; btn.disabled = false; }, 2000);
    return;
  }

  if (!lines || !lines.length) {
    btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.add_symbols', '+ Symbole') + '</span>';
    btn.disabled = false;
    return;
  }

  _symbolsWizard = { msgId, btn, lines, index: 0, chosen: lines.map(l => ({ text: l.text, pictogram: null })) };
  document.getElementById('symbols-wizard-modal').classList.add('show');
  renderSymbolsWizardStep();
}

function renderSymbolsWizardStep() {
  const w = _symbolsWizard;
  if (!w) return;
  const step = w.lines[w.index];
  const chosenPictogram = w.chosen[w.index].pictogram;

  document.getElementById('symbols-wizard-progress').textContent = t('symbols.line_x_of_y', 'Zeile {i} von {n}').replace('{i}', w.index + 1).replace('{n}', w.lines.length);
  document.getElementById('symbols-wizard-text').textContent = step.text;

  // Suchfeld nur bei Zeilenwechsel neu befüllen, nicht bei jedem Re-Render (sonst geht ein
  // gerade eingetipptes, noch nicht abgeschicktes Suchwort beim Auswählen eines Kandidaten verloren).
  if (w._renderedForIndex !== w.index) {
    document.getElementById('symbols-wizard-search').value = step.keyword || '';
    w._renderedForIndex = w.index;
  }

  const grid = document.getElementById('symbols-wizard-grid');
  grid.innerHTML = '';

  const noneTile = document.createElement('button');
  noneTile.type = 'button';
  noneTile.className = 'symbols-candidate symbols-candidate-none' + (chosenPictogram ? '' : ' selected');
  noneTile.innerHTML = '<span>' + t('symbols.no_symbol', 'Kein Symbol') + '</span>';
  noneTile.onclick = () => { w.chosen[w.index].pictogram = null; renderSymbolsWizardStep(); };
  grid.appendChild(noneTile);

  (step.candidates || []).forEach(candidate => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'symbols-candidate' + (chosenPictogram && chosenPictogram.id === candidate.id ? ' selected' : '');
    tile.innerHTML = `<img src="${candidate.url}" alt="${candidate.keyword || ''}">`;
    tile.onclick = () => { w.chosen[w.index].pictogram = candidate; renderSymbolsWizardStep(); };
    grid.appendChild(tile);
  });

  if (!step.candidates || !step.candidates.length) {
    const hint = document.createElement('div');
    hint.className = 'symbols-wizard-hint';
    hint.textContent = t('symbols.no_arasaac_match', 'Kein ARASAAC-Treffer für diese Zeile gefunden.');
    grid.appendChild(hint);
  }

  document.getElementById('symbols-wizard-back').disabled = (w.index === 0);
  document.getElementById('symbols-wizard-next').textContent = (w.index === w.lines.length - 1) ? t('symbols.done', 'Fertig') : t('symbols.next', 'Weiter →');
}

// Manuelle Suche: die vom Modell vorgeschlagenen Suchwörter treffen nicht immer - hier kann
// die Nutzerin/der Nutzer selbst einen Begriff eingeben und die ARASAAC-Suche neu anstoßen
// (nutzt dieselbe /api/pictograms-Route wie das Piktogramme-Werkzeug).
async function symbolsWizardSearch() {
  const w = _symbolsWizard;
  if (!w) return;
  const q = document.getElementById('symbols-wizard-search').value.trim();
  if (!q) return;

  const btn = document.getElementById('symbols-wizard-search-btn');
  const originalLabel = btn.textContent;
  btn.textContent = '…';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/pictograms?q=${encodeURIComponent(q)}&lang=de`);
    if (res.status === 401) { forceLogout(); return; }
    if (!res.ok) throw new Error('Suche ' + res.status);
    const { results } = await res.json();
    w.lines[w.index].candidates = (results || []).slice(0, 6);
    w.lines[w.index].keyword = q;
    renderSymbolsWizardStep();
  } catch (e) {
    console.error('Symbol-Suche fehlgeschlagen:', e.message);
  } finally {
    btn.textContent = originalLabel;
    btn.disabled = false;
  }
}

function symbolsWizardBack() {
  if (!_symbolsWizard || _symbolsWizard.index === 0) return;
  _symbolsWizard.index -= 1;
  renderSymbolsWizardStep();
}

function symbolsWizardNext() {
  const w = _symbolsWizard;
  if (!w) return;
  if (w.index < w.lines.length - 1) {
    w.index += 1;
    renderSymbolsWizardStep();
  } else {
    finishSymbolsWizard();
  }
}

function symbolsWizardCancel() {
  const w = _symbolsWizard;
  document.getElementById('symbols-wizard-modal').classList.remove('show');
  if (w) { w.btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.add_symbols', '+ Symbole') + '</span>'; w.btn.disabled = false; }
  _symbolsWizard = null;
}

function finishSymbolsWizard() {
  const w = _symbolsWizard;
  document.getElementById('symbols-wizard-modal').classList.remove('show');
  if (!w) return;

  const bubble = document.getElementById(w.msgId);
  if (bubble) {
    const wrap = document.createElement('div');
    wrap.className = 'symbols-view';
    w.chosen.forEach(line => {
      const row = document.createElement('div');
      row.className = 'symbols-line';
      if (line.pictogram) {
        const img = document.createElement('img');
        img.src = line.pictogram.url;
        img.alt = line.pictogram.keyword || '';
        img.className = 'symbols-pictogram';
        row.appendChild(img);
      }
      const span = document.createElement('span');
      span.textContent = line.text;
      row.appendChild(span);
      wrap.appendChild(row);
    });

    const pdfBtn = document.createElement('button');
    pdfBtn.className = 'copy-btn symbols-btn';
    pdfBtn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.as_pdf', 'Als PDF') + '</span>';
    pdfBtn.onclick = function() { exportSymbolsAsPdf(w.chosen, this); };
    wrap.appendChild(pdfBtn);

    const wordBtn = document.createElement('button');
    wordBtn.className = 'copy-btn symbols-btn';
    wordBtn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.as_word', 'Als Word') + '</span>';
    wordBtn.onclick = function() { exportSymbolsAsWord(w.chosen, this); };
    wrap.appendChild(wordBtn);

    bubble.appendChild(wrap);
  }

  w.btn.innerHTML = CHECK_ICON + ' <span>' + t('symbols.inserted', 'Symbole eingefügt') + '</span>';
  w.btn.disabled = true; // verhindert doppelt angehängte .symbols-view-Blöcke bei erneutem Klick
  _symbolsWizard = null;
}

async function exportSymbolsAsPdf(chosenLines, btn) {
  btn.innerHTML = '<span class="tts-spinner"></span> <span>…</span>';
  btn.disabled = true;
  try {
    const lines = chosenLines.map(l => ({ text: l.text, imageDataUrl: l.pictogram ? l.pictogram.url : null }));
    const res = await fetch('/api/leichte-sprache/symbols/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    if (res.status === 401) { forceLogout(); return; }
    if (!res.ok) throw new Error('PDF ' + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leichte-sprache-symbole.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('PDF-Export fehlgeschlagen:', e.message);
    btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('common.error_word', 'Fehler') + '</span>';
    setTimeout(() => { btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.as_pdf', 'Als PDF') + '</span>'; btn.disabled = false; }, 2000);
    return;
  }
  btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.as_pdf', 'Als PDF') + '</span>';
  btn.disabled = false;
}

async function exportSymbolsAsWord(chosenLines, btn) {
  btn.innerHTML = '<span class="tts-spinner"></span> <span>…</span>';
  btn.disabled = true;
  try {
    const lines = chosenLines.map(l => ({ text: l.text, imageDataUrl: l.pictogram ? l.pictogram.url : null }));
    const res = await fetch('/api/leichte-sprache/symbols/word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
    });
    if (res.status === 401) { forceLogout(); return; }
    if (!res.ok) throw new Error('Word ' + res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leichte-sprache-symbole.docx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Word-Export fehlgeschlagen:', e.message);
    btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('common.error_word', 'Fehler') + '</span>';
    setTimeout(() => { btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.as_word', 'Als Word') + '</span>'; btn.disabled = false; }, 2000);
    return;
  }
  btn.innerHTML = SYMBOLS_ICON + ' <span>' + t('symbols.as_word', 'Als Word') + '</span>';
  btn.disabled = false;
}
