// Generische Start-Stichwortliste für die Muster-Erkennung sensibler Inhalte (Diakonie Kork /
// Behindertenhilfe-Kontext). Bewusst grob gehalten -- soll mit fachlicher Kenntnis verfeinert
// werden (siehe MEMORY project_korki_compliance_dokumente). Deterministisch, keine KI-Bewertung.
const CATEGORIES = [
  {
    key: 'diagnose',
    label: 'Diagnose/Befund',
    words: ['diagnose', 'diagnostik', 'befund', 'krankheitsbild'],
  },
  {
    key: 'medikation',
    label: 'Medikation',
    words: ['medikament', 'medikation', 'dosierung', 'wirkstoff', 'beipackzettel', 'verordnung'],
  },
  {
    key: 'psychisch',
    label: 'Psychische Erkrankung',
    words: ['depression', 'schizophrenie', 'psychose', 'angststörung', 'borderline', 'trauma', 'ptbs', 'suizid', 'selbstverletzung', 'selbstmord'],
  },
  {
    key: 'sucht',
    label: 'Sucht',
    words: ['sucht', 'abhängigkeit', 'entzug', 'alkoholismus', 'drogenkonsum'],
  },
  {
    key: 'behinderung_pflege',
    label: 'Behinderung/Pflege',
    words: ['pflegegrad', 'behinderungsgrad', 'schwerbehindert', 'betreuungsgrad'],
  },
  {
    key: 'missbrauch',
    label: 'Missbrauch/Übergriff',
    words: ['missbrauch', 'übergriff', 'vergewaltigung'],
  },
  {
    key: 'palliativ',
    label: 'Sterbebegleitung',
    words: ['palliativ', 'sterbebegleitung'],
  },
];

// Grobe ICD-10-Näherung (z.B. F20.1, G40, E10.9) -- approximativ, kann falsch-positiv treffen.
const ICD10_PATTERN = /\b[A-TV-Z][0-9]{2}(\.[0-9]{1,2})?\b/;

function detect(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.words.some((w) => lower.includes(w))) return cat.label;
  }
  if (ICD10_PATTERN.test(text)) return 'ICD-10-ähnlicher Code';
  return null;
}

module.exports = { detect, CATEGORIES };
