// ── BGT-Speicher-Warnung: erkennt vor dem Speichern in die (rein clientseitige, siehe
// chat-history.js) Chat-History, ob eine Antwort besonders schützenswerte Inhalte enthalten
// könnte, und zeigt in dem Fall ein Modal mit Übersteuerungsoption (siehe chat-send.js).
// Kategorien kommen per Fetch vom Server (SensitivePatterns.js), damit hier keine zweite,
// potenziell abweichende Stichwortliste gepflegt werden muss.
let _sensitiveCategories = null;
let _sensitiveIcd10Regex = null;
let _sensitiveCategoriesPromise = null;

function loadSensitiveCategories() {
  if (_sensitiveCategoriesPromise) return _sensitiveCategoriesPromise;
  _sensitiveCategoriesPromise = fetch('/api/sensitive-categories')
    .then(r => r.ok ? r.json() : { categories: [] })
    .then(data => {
      _sensitiveCategories = data.categories || [];
      _sensitiveIcd10Regex = data.icd10Source ? new RegExp(data.icd10Source) : null;
    })
    .catch(() => { _sensitiveCategories = []; });
  return _sensitiveCategoriesPromise;
}

// Spiegelt SensitivePatterns.js#detect() (Server) 1:1.
function detectSensitiveCategory(text) {
  if (!text || !_sensitiveCategories) return null;
  const lower = text.toLowerCase();
  for (const cat of _sensitiveCategories) {
    if (cat.words.some(w => lower.includes(w))) return cat.label;
  }
  if (_sensitiveIcd10Regex && _sensitiveIcd10Regex.test(text)) return 'ICD-10-ähnlicher Code';
  return null;
}

let _sensitiveSaveResolve = null;

// Gibt ein Promise<boolean> zurück: true = "Trotzdem speichern", false = "Nicht speichern".
function showSensitiveSaveModal(category) {
  document.getElementById('sensitive-save-body').textContent = window.t(
    'sensitive_save.body',
    'Diese Antwort enthält möglicherweise besonders schützenswerte Inhalte ({category}) und wird deshalb nicht im Chatverlauf gespeichert.'
  ).replace('{category}', category);
  document.getElementById('sensitive-save-modal').classList.add('show');
  return new Promise(resolve => { _sensitiveSaveResolve = resolve; });
}

function sensitiveSaveConfirm() { // "Nicht speichern" (empfohlen) bzw. Klick auf den Hintergrund
  document.getElementById('sensitive-save-modal').classList.remove('show');
  if (_sensitiveSaveResolve) _sensitiveSaveResolve(false);
  _sensitiveSaveResolve = null;
}

function sensitiveSaveOverride() { // "Trotzdem speichern"
  document.getElementById('sensitive-save-modal').classList.remove('show');
  if (_sensitiveSaveResolve) _sensitiveSaveResolve(true);
  _sensitiveSaveResolve = null;
}
