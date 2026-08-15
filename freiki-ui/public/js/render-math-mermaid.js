    // $$...$$ (Block) und $...$ (Inline) vor dem Markdown-Parsing durch inerte Platzhalter
    // ersetzen (sonst zerlegt Markdown z.B. Unterstriche in Exponenten/Indizes als
    // Kursiv-Syntax). Bei Inline-Mathe darf der Inhalt nicht mit Leerzeichen beginnen/enden -
    // das schliesst die meisten Preisangaben ("$5 und $10") aus. Nach dem Parsen+Sanitize
    // werden die Platzhalter als code.language-math-* wiederhergestellt und per
    // renderMathBlocks() zu echtem KaTeX-HTML gerendert.
    function protectMathBlocks(md) {
      const blocks = [];
      let protectedMd = String(md).replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => {
        blocks.push({ display: true, tex });
        return `MATH${blocks.length - 1}`;
      });
      protectedMd = protectedMd.replace(/\$([^\s$](?:[^$\n]*[^\s$])?)\$/g, (m, tex) => {
        blocks.push({ display: false, tex });
        return `MATH${blocks.length - 1}`;
      });
      return { protectedMd, blocks };
    }

    function restoreMathBlocks(html, blocks) {
      return html.replace(/MATH(\d+)/g, (m, i) => {
        const item = blocks[+i];
        if (!item) return '';
        const cls = item.display ? 'language-math-display' : 'language-math-inline';
        const escaped = item.tex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<code class="${cls}">${escaped}</code>`;
      });
    }

    function safeMarked(md) {
      const { protectedMd, blocks } = protectMathBlocks(md);
      const html = DOMPurify.sanitize(marked.parse(protectedMd), {
        ALLOWED_TAGS: ['p','br','strong','em','u','del','a','ul','ol','li',
          'code','pre','blockquote','h1','h2','h3','h4','h5','h6',
          'table','thead','tbody','tr','th','td','img'],
        ALLOWED_ATTR: ['href','title','target','src','alt','width','height','class','download'],
        ALLOW_DATA_ATTR: false,
      });
      return restoreMathBlocks(html, blocks);
    }

    // KaTeX wird erst bei Bedarf nachgeladen (~1.4MB inkl. Fonts), nicht bei jedem Seitenaufruf.
    let _katexLoad = null;
    function loadKatex() {
      if (!_katexLoad) {
        _katexLoad = new Promise((resolve, reject) => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = '/katex.min.css';
          document.head.appendChild(link);
          const s = document.createElement('script');
          s.src = '/katex.min.js';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      return _katexLoad;
    }

    // Ersetzt $$...$$/$...$-Platzhalter (code.language-math-display/-inline) in einer fertig
    // gerenderten Antwort durch echtes KaTeX-HTML. Analog zu renderMermaidBlocks().
    async function renderMathBlocks(bubble) {
      const displayBlocks = bubble.querySelectorAll('code.language-math-display');
      const inlineBlocks = bubble.querySelectorAll('code.language-math-inline');
      if (!displayBlocks.length && !inlineBlocks.length) return;
      try { await loadKatex(); } catch { return; }
      for (const block of displayBlocks) {
        try {
          const wrapper = document.createElement('div');
          wrapper.className = 'math-display';
          wrapper.innerHTML = katex.renderToString(block.textContent, { displayMode: true, throwOnError: false });
          block.replaceWith(wrapper);
        } catch (e) {
          console.warn('Math-Rendering fehlgeschlagen:', e.message);
        }
      }
      for (const block of inlineBlocks) {
        try {
          const span = document.createElement('span');
          span.className = 'math-inline';
          span.innerHTML = katex.renderToString(block.textContent, { displayMode: false, throwOnError: false });
          block.replaceWith(span);
        } catch (e) {
          console.warn('Math-Rendering fehlgeschlagen:', e.message);
        }
      }
    }

    // Mermaid wird erst bei Bedarf nachgeladen (~3.5MB), nicht bei jedem Seitenaufruf.
    let _mermaidLoad = null;
    function loadMermaid() {
      if (!_mermaidLoad) {
        _mermaidLoad = new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = '/mermaid.min.js';
          s.onload = () => { mermaid.initialize({ startOnLoad: false, theme: 'neutral', suppressErrorRendering: true }); resolve(); };
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      return _mermaidLoad;
    }

    // Das LLM haelt sich nicht immer an die Anfuehrungszeichen-Anweisung im System-Prompt -
    // hier automatisch nachbessern: Node-/Kantentext in [...]/{...}, der Klammern, Fragezeichen
    // oder Doppelpunkt enthaelt und noch nicht in Anfuehrungszeichen steht, selbst quoten.
    function sanitizeMermaidText(text) {
      return text.replace(/([\[{])([^\[\]{}"]*[()?:][^\[\]{}"]*)([\]}])/g,
        (match, open, inner, close) => `${open}"${inner}"${close}`);
    }

    // Leitet aus der Nutzer-Anfrage einen dateinamentauglichen Slug ab (fuer PNG-Download und
    // draw.io-Diagrammtitel) - Kleinbuchstaben, Umlaute transkribiert, Sonderzeichen raus,
    // Leerzeichen zu Bindestrichen, auf sinnvolle Laenge begrenzt.
    function slugifyForFilename(text, fallback) {
      const slug = (text || '')
        .toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
      return slug || fallback;
    }

    // Ersetzt ```mermaid-Codebloecke in einer fertig gerenderten Antwort durch echtes SVG.
    // Nur auf den fertigen Text anwenden (nicht bei jedem Streaming-Chunk) - unvollstaendige
    // Mermaid-Syntax waehrend des Streamens wuerde sonst staendig Parse-Fehler zeigen.
    async function renderMermaidBlocks(bubble, promptText) {
      const blocks = Array.from(bubble.querySelectorAll('code.language-mermaid'));
      // Fallback: manche Modell-Antworten setzen "mermaid" versehentlich auf eine eigene
      // Zeile statt direkt hinter die drei Backticks (``` \n mermaid \n graph TD ...) - marked.js
      // erkennt dann keine Sprache und "mermaid" landet als erste Textzeile im Codeblock. Nur
      // Bloecke ohne jede erkannte Sprache anfassen (className leer), um echte Codebeispiele
      // (z.B. ein Python-Snippet, das zufaellig "mermaid" enthaelt) nicht falsch zu erkennen.
      for (const block of bubble.querySelectorAll('code:not(.language-mermaid)')) {
        if (block.className) continue;
        const firstLine = block.textContent.split('\n', 1)[0].trim().toLowerCase();
        if (firstLine === 'mermaid') {
          block.textContent = block.textContent.replace(/^[^\n]*\n/, '');
          block.classList.add('language-mermaid');
          blocks.push(block);
        }
      }
      if (!blocks.length) return;
      try { await loadMermaid(); } catch { return; }
      for (const block of blocks) {
        const pre = block.closest('pre') || block;
        const definition = sanitizeMermaidText(block.textContent);
        try {
          const id = 'mermaid-' + Math.random().toString(36).slice(2);
          const { svg } = await mermaid.render(id, definition);
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram';
          wrapper.innerHTML = svg;
          const aiBadge = document.createElement('img');
          aiBadge.src = '/badge-ai-generated.svg';
          aiBadge.alt = t('js.ai_generated_alt', 'KI-generiert');
          aiBadge.className = 'mermaid-ai-badge';
          wrapper.appendChild(aiBadge);
          wrapper.title = t('js.mermaid_click_zoom', 'Klicken zum Vergrößern');
          wrapper.addEventListener('click', () => openMermaidLightbox(wrapper.querySelector('svg'), definition, promptText));
          pre.replaceWith(wrapper);
        } catch (e) {
          console.warn('Mermaid-Rendering fehlgeschlagen:', e.message);
        }
      }
      showFeatureHint('flowchart', t('hint.flowchart.title', '💡 Diagramm-Optionen'),
        t('hint.flowchart.body', 'Klicke auf das Diagramm für weitere Optionen: als PNG speichern oder in draw.io weiterbearbeiten.'));
    }

    // Grossansicht + PNG-Export fuer ein gerendertes Mermaid-Diagramm. Kein Extra-Button im
    // Chat selbst (Klick aufs Diagramm reicht) - Download-Button nur in der Grossansicht.
    function openMermaidLightbox(svgEl, definition, promptText) {
      const slug = slugifyForFilename(promptText, 'diagramm');
      const overlay = document.createElement('div');
      overlay.className = 'mermaid-lightbox-overlay';
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      const box = document.createElement('div');
      box.className = 'mermaid-lightbox';
      // Anzeige-Klon ohne feste width/height/style, damit das SVG per CSS auf Containergroesse
      // skaliert (das Original ist sonst durch mermaids eigene Groessenangaben klein fixiert).
      const displayClone = svgEl.cloneNode(true);
      displayClone.removeAttribute('style');
      displayClone.removeAttribute('width');
      displayClone.removeAttribute('height');
      const diagramWrap = document.createElement('div');
      diagramWrap.className = 'mermaid-lightbox-diagram-wrap';
      diagramWrap.appendChild(displayClone);
      const lightboxBadge = document.createElement('img');
      lightboxBadge.src = '/badge-ai-generated.svg';
      lightboxBadge.alt = t('js.ai_generated_alt', 'KI-generiert');
      lightboxBadge.className = 'mermaid-ai-badge mermaid-lightbox-ai-badge';
      diagramWrap.appendChild(lightboxBadge);

      const actions = document.createElement('div');
      actions.className = 'mermaid-lightbox-actions';
      const pngBtn = document.createElement('button');
      pngBtn.textContent = t('js.save_as_png', '⬇️ Als PNG speichern');
      // Fuer den Export das ORIGINAL-SVG (mit intakter width/height) nutzen, nicht den
      // Anzeige-Klon - manche Browser (Firefox) rastern ein SVG ohne explizite Groesse nicht.
      pngBtn.addEventListener('click', () => downloadSvgAsPng(svgEl, slug + '.png'));
      const drawioBtn = document.createElement('button');
      drawioBtn.className = 'mermaid-drawio-btn';
      drawioBtn.textContent = t('js.open_in_drawio', '✏️ In draw.io öffnen (Externer Link!)');
      // draw.io kann Mermaid-Syntax direkt importieren (create-Parameter, siehe
      // https://www.drawio.com/doc/faq/supported-url-parameters) - so laesst sich das
      // Diagramm dort als vollwertige, frei editierbare Zeichnung weiterbearbeiten. Anders als
      // PNG-Export/Kopieren verlaesst der Diagrammtext dabei den Server (externer Dienst) -
      // eigene Warnfarbe (wie Web-Recherche) + Bestaetigung, analog zum Demo-Hinweis oben.
      drawioBtn.addEventListener('click', () => {
        const ok = confirm(t('js.confirm_drawio_transfer', 'Der Diagramm-Inhalt wird dabei an den externen Dienst draw.io (diagrams.net) übertragen. Fortfahren?'));
        if (!ok) return;
        // create-Payload bewusst im Hash-Fragment (#create=...) statt als Query-Parameter:
        // der Hash geht laut draw.io-Doku nie an den Server, dadurch keine Gefahr, dass eine
        // lange, umlautlastige URL serverseitig irgendwo gekappt wird (kappt man sie mitten in
        // einer UTF-8-%-Sequenz, gibt draw.io genau "malformed URI sequence").
        const url = 'https://app.diagrams.net/?title=' + encodeURIComponent(slug + '.drawio') +
          '#create=' + encodeURIComponent(JSON.stringify({ type: 'mermaid', data: definition }));
        window.open(url, '_blank', 'noopener');
      });
      const closeBtn = document.createElement('button');
      closeBtn.textContent = t('js.close_x', '✕ Schließen');
      closeBtn.addEventListener('click', () => overlay.remove());
      actions.append(pngBtn, drawioBtn, closeBtn);

      box.append(diagramWrap, actions);
      overlay.append(box);
      document.body.append(overlay);
    }

    function downloadSvgAsPng(svgEl, filename) {
      const clone = svgEl.cloneNode(true);
      clone.removeAttribute('style');
      if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      // viewBox zuerst pruefen - mermaid setzt width/height oft auf "100%" (fuer responsives CSS),
      // das ist keine echte Pixelzahl und wuerde parseFloat("100%") faelschlich zu 100 machen.
      const vb = clone.viewBox && clone.viewBox.baseVal;
      const baseW = (vb && vb.width) || parseFloat(clone.getAttribute('width')) || 800;
      const baseH = (vb && vb.height) || parseFloat(clone.getAttribute('height')) || 600;

      // Das SVG VOR dem Rastern auf die Zielaufloesung setzen (nicht die kleine Originalgroesse
      // laden und danach im Canvas hochskalieren - das waere unscharf, da der Browser die SVG->
      // Bitmap-Wandlung schon bei der kleinen Originalgroesse vornimmt). Vektorgrafik bleibt beim
      // Hochsetzen von width/height scharf, das viewBox-Koordinatensystem bleibt unveraendert.
      // Mindestbreite 800px, damit auch kleine/einfache Diagramme lesbar exportiert werden.
      const targetW = Math.max(Math.round(baseW * 3), 800);
      const targetH = Math.round(baseH * (targetW / baseW));
      clone.setAttribute('width', targetW);
      clone.setAttribute('height', targetH);

      // data:-URI statt blob: - die CSP (img-src 'self' data: https:) erlaubt kein blob:,
      // ohne den Server-seitigen CSP-Header anzufassen.
      const svgData = new XMLSerializer().serializeToString(clone);
      const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const finishExport = () => {
          canvas.toBlob((blob) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename || 'diagramm.png';
            a.click();
            URL.revokeObjectURL(a.href);
          });
        };

        // Rechtlich vorgeschriebene KI-Kennzeichnung (Art. 50 EU AI Act) mit ins PNG brennen -
        // im Chat ist die Badge nur ein separat positioniertes <img> neben dem SVG (siehe
        // .mermaid-ai-badge in style.css) und landet sonst nicht im gerasterten Diagramm.
        // Position/Groesse orientieren sich an diesen CSS-Werten (bottom-right, kleiner Rand).
        const badge = new Image();
        badge.onload = () => {
          const badgeH = Math.round(targetH * 0.045);
          const badgeW = Math.round(badgeH * (badge.naturalWidth / badge.naturalHeight));
          const margin = Math.round(targetW * 0.015);
          ctx.drawImage(badge, targetW - badgeW - margin, targetH - badgeH - margin, badgeW, badgeH);
          finishExport();
        };
        badge.onerror = () => {
          console.warn('KI-Badge konnte nicht geladen werden, exportiere PNG ohne Badge.');
          finishExport();
        };
        badge.src = '/badge-ai-generated.svg';
      };
      img.onerror = (e) => {
        console.error('PNG-Export fehlgeschlagen: SVG konnte nicht als Bild geladen werden.', e);
        alert(t('js.png_export_failed', 'PNG-Export ist fehlgeschlagen. Bitte Browser-Konsole für Details prüfen.'));
      };
      img.src = dataUrl;
    }
