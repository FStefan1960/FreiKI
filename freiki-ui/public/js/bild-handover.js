// Bildübergabe zwischen den Extras "Bild verbessern" (bild-verbessern) und "Bild mit KI bearbeiten"
// (bild-ki). Alles läuft im Browser: Das Bild wandert kurz über die IndexedDB (gleicher Ursprung),
// nie über den Server, und wird nach der Übernahme sofort gelöscht (spätestens nach 10 Minuten verfällt es).
//
// Beide Extras liegen als iframe im Panel der Hauptoberfläche und werden nur einmal geladen. Die
// Zielseite bemerkt eine neue Übergabe deshalb auf drei Wegen: beim Laden, per BroadcastChannel und
// wenn sie wieder sichtbar wird (IntersectionObserver am .card-Element).
(function () {
  const DB_NAME = 'bild-handover';
  const STORE = 'inbox';
  const MAX_AGE_MS = 10 * 60 * 1000;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB nicht verfügbar'));
    });
  }

  // Eine Transaktion; fn bekommt den Store und liefert optional einen Request, dessen Ergebnis zurückkommt.
  async function withStore(mode, fn) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('abgebrochen'));
      });
    } finally {
      db.close();
    }
  }

  function channel() {
    try { return typeof BroadcastChannel === 'function' ? new BroadcastChannel(DB_NAME) : null; } catch (e) { return null; }
  }

  // Übergibt ein Bild an das Extra mit dem Schlüssel `to` (pro Ziel höchstens eine wartende Übergabe).
  async function send(to, blob, name) {
    const data = await blob.arrayBuffer();   // ArrayBuffer statt Blob: in allen Browsern zuverlässig speicherbar
    await withStore('readwrite', s => s.put({ name: name || 'bild', type: blob.type || 'image/jpeg', data, ts: Date.now() }, to));
    const ch = channel();
    if (ch) { ch.postMessage({ to }); ch.close(); }
  }

  // Registriert den Empfänger. handler(file) gibt true zurück, wenn das Bild übernommen wurde; bei false
  // (z. B. "gerade beschäftigt") bleibt es liegen und wird beim nächsten Anlass erneut angeboten.
  function onReceive(to, handler) {
    let running = false;
    async function check() {
      if (running) return;
      running = true;
      try {
        const entry = await withStore('readonly', s => s.get(to));
        if (!entry) return;
        if (Date.now() - entry.ts > MAX_AGE_MS) { await withStore('readwrite', s => s.delete(to)); return; }
        const file = new File([entry.data], entry.name, { type: entry.type });
        if (await handler(file)) await withStore('readwrite', s => s.delete(to));
      } catch (e) { /* IndexedDB nicht verfügbar: dann gibt es auch keine Übergabe */ } finally { running = false; }
    }
    check();
    const ch = channel();
    if (ch) ch.onmessage = ev => { if (ev.data && ev.data.to === to) check(); };
    const card = document.querySelector('.card');
    if (card && typeof IntersectionObserver === 'function') {
      new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) check(); }).observe(card);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }

  // Gibt den Extras-Eintrag zurück, wenn das Ziel für diese Instanz und Rolle echt angeboten wird
  // (nicht gesperrt und keine Demo ohne GPU), sonst null - dann zeigt die Seite den Knopf nicht.
  async function available(key) {
    try {
      const res = await fetch('/api/extras', { cache: 'no-store' });
      if (!res.ok) return null;
      const entry = (await res.json()).find(e => e.key === key);
      if (!entry || !entry.panel || /[?&]demo=1(?:&|$)/.test(entry.panel)) return null;
      return entry;
    } catch (e) { return null; }
  }

  // Öffnet das Extra in der Hauptoberfläche, genau wie ein Klick in der Seitenleiste (Kopfzeile und
  // Markierung inklusive). Ohne Hauptoberfläche (Seite einzeln geöffnet) wird die Seite selbst geladen.
  function open(entry) {
    try {
      const p = window.parent;
      if (p && p !== window && typeof p.openToolPanel === 'function') {
        const btn = [...p.document.querySelectorAll('.mode-btn')]
          .find(b => ((b.querySelector('.mode-nav-title') || {}).textContent || '').trim() === entry.title);
        p.openToolPanel(entry.panel, { title: entry.title, desc: entry.desc, icon: entry.icon }, btn);
        return;
      }
    } catch (e) { /* fällt auf direkten Aufruf zurück */ }
    window.location.href = entry.panel;
  }

  window.BildHandover = { send, onReceive, available, open };
})();
