// ── Paperless Dokumenten-Filter ──
let plMetaLoaded = false;

async function plLoadMeta() {
  if (plMetaLoaded) return;
  try {
    const res = await fetch('/api/paperless/meta');
    if (!res.ok) return;
    const { tags, correspondents, document_types } = await res.json();

    const corrSel = document.getElementById('pl-correspondent');
    correspondents.sort((a,b) => a.name.localeCompare(b.name, 'de')).forEach(c => {
      const o = document.createElement('option'); o.value = c.id; o.textContent = c.name;
      corrSel.appendChild(o);
    });

    const typeSel = document.getElementById('pl-doctype');
    document_types.sort((a,b) => a.name.localeCompare(b.name, 'de')).forEach(d => {
      const o = document.createElement('option'); o.value = d.id; o.textContent = d.name;
      typeSel.appendChild(o);
    });

    const tagSel = document.getElementById('pl-tags');
    tags.filter(t => !['not-yet-tagged','kein-wissen'].includes(t.name))
        .sort((a,b) => a.name.localeCompare(b.name, 'de'))
        .forEach(t => {
          const o = document.createElement('option'); o.value = t.id; o.textContent = t.name;
          tagSel.appendChild(o);
        });

    plMetaLoaded = (tags.length > 0 || correspondents.length > 0 || document_types.length > 0);
  } catch (e) { console.warn('plLoadMeta:', e); }
}

async function plToggleDoc(row, id) {
  const panel = document.getElementById(`pl-doc-${id}`);
  const chevron = row.querySelector('.pl-result-chevron');
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    chevron.textContent = '▶';
    return;
  }
  chevron.textContent = '▼';
  if (panel.dataset.loaded) { panel.style.display = ''; return; }
  panel.style.display = '';
  panel.innerHTML = '<span style="color:var(--fk-muted);font-size:13px;">' + t('common.loading', 'Lade…') + '</span>';
  try {
    const res = await fetch(`/api/paperless/document/${id}`);
    const d = await res.json();
    const text = (d.content || '').trim();
    panel.innerHTML = (text
        ? `<pre class="pl-doc-text">${text.replace(/</g,'&lt;')}</pre>`
        : '<span style="color:var(--fk-muted);font-size:13px;">' + t('paperless.no_text_content', 'Kein Textinhalt verfügbar.') + '</span>');
    panel.dataset.loaded = '1';
  } catch (e) {
    panel.innerHTML = '<span style="color:var(--fk-muted);">' + t('common.load_error', 'Fehler beim Laden.') + '</span>';
  }
}

async function plSearch() {
  const btn = document.getElementById('pl-search-btn');
  const resultsEl = document.getElementById('pl-results');
  btn.disabled = true;
  resultsEl.innerHTML = '<div class="pl-empty">' + t('paperless.searching', 'Suche läuft…') + '</div>';

  const tagSel = document.getElementById('pl-tags');
  const tag_ids = tagSel.value ? [tagSel.value] : [];

  try {
    const res = await fetch('/api/paperless/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:            document.getElementById('pl-query').value.trim() || undefined,
        correspondent_id: document.getElementById('pl-correspondent').value || undefined,
        document_type_id: document.getElementById('pl-doctype').value || undefined,
        created_after:    document.getElementById('pl-from').value || undefined,
        created_before:   document.getElementById('pl-to').value || undefined,
        tag_ids:          tag_ids.length ? tag_ids : undefined,
      })
    });
    if (res.status === 401) { forceLogout(); return; }
    const { docs, count } = await res.json();

    if (!docs || !docs.length) {
      resultsEl.innerHTML = '<div class="pl-empty">' + t('paperless.no_docs_found', 'Keine Dokumente gefunden.') + '</div>';
    } else {
      const header = `<div style="font-size:12px;color:var(--fk-muted);padding:8px 4px 4px;">${t('paperless.n_hits', '{n} Treffer').replace('{n}', count)}</div>`;
      const rows = docs.map(d => {
        const meta = [d.created, d.correspondent, d.document_type].filter(Boolean).join(' · ');
        return `<div class="pl-result-row" onclick="plToggleDoc(this,${d.id})" data-id="${d.id}">
          <span class="pl-result-title">${d.title}</span>
          <span class="pl-result-meta">${meta}</span>
          <a href="/api/paperless/download/${d.id}" onclick="event.stopPropagation()" class="pl-search-btn" style="font-size:12px;text-decoration:none;white-space:nowrap;">${t('paperless.open_doc', '📄 Öffnen')}</a>
          <span class="pl-result-chevron">▶</span>
        </div>
        <div class="pl-doc-content" id="pl-doc-${d.id}" style="display:none;"></div>`;
      }).join('');
      resultsEl.innerHTML = `${header}<div class="pl-results-card">${rows}</div>`;
      patchPaperlessLinks(resultsEl);
    }
  } catch (e) {
    resultsEl.innerHTML = '<div class="pl-empty">' + t('paperless.unreachable', '⚠️ Paperless nicht erreichbar.') + '</div>';
  } finally {
    btn.disabled = false;
  }
}
