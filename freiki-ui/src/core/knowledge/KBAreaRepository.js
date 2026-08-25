const fs = require('fs');
const path = require('path');
const { config } = require('../../shared/config');

const areasConfigFile = path.join(config.APP_ROOT, 'areas.json');
const areasConfig = fs.existsSync(areasConfigFile)
  ? JSON.parse(fs.readFileSync(areasConfigFile, 'utf-8'))
  : {};

// Tabellennamen aus areas.json landen unquoted in SQL (KBService). Nur Identifier der
// Form kb_… zulassen, sonst würde ein Tippfehler/Injection in areas.json den Query-String
// verbiegen. Bereichs-Keys analog: Kleinbuchstaben, Ziffern, Unterstrich.
const KB_TABLE_RE = /^kb_[a-z0-9_]+$/;
const AREA_KEY_RE = /^[a-z][a-z0-9_]*$/;

function isValidKbTable(name) {
  return typeof name === 'string' && KB_TABLE_RE.test(name);
}

const KB_TABLES = {};
const KB_LABELS = {};
const KB_GROUPS = {};
for (const [key, def] of Object.entries(areasConfig)) {
  if (!AREA_KEY_RE.test(key) || !isValidKbTable(def?.table)) {
    console.error(`KBArea: ungültiger Eintrag übersprungen (${key} → ${def?.table})`);
    continue;
  }
  KB_TABLES[key] = def.table;
  KB_LABELS[key] = def.label;
  KB_GROUPS[key] = def.group || null;
}

// group-Referenzen erst validieren, wenn alle Areas eingelesen sind (Ziel könnte später
// im JSON stehen als die Kind-Area selbst).
for (const [key, group] of Object.entries(KB_GROUPS)) {
  if (group && (!AREA_KEY_RE.test(group) || !KB_TABLES[group])) {
    console.error(`KBArea: ungültige group-Referenz übersprungen (${key} → ${group})`);
    KB_GROUPS[key] = null;
  }
}

function getTable(areaKey) {
  return KB_TABLES[areaKey];
}

function getLabel(areaKey) {
  return KB_LABELS[areaKey];
}

// Liefert den Area-Key der übergeordneten Kategorie (z.B. "oh" für "aws"), oder null, wenn
// der Bereich keiner Kategorie zugeordnet ist. Optionales "group"-Feld in areas.json.
function getGroup(areaKey) {
  return KB_GROUPS[areaKey] || null;
}

function entries() {
  return Object.entries(KB_TABLES);
}

// Zugriffsrechte: wer eine Unterkategorie sieht (z.B. "rws"), soll automatisch auch die
// allgemeine Elternkategorie sehen ("wv") - aber NICHT umgekehrt: die Elternkategorie allein
// gibt keinen Zugriff auf die übrigen Unterkategorien. Einseitige Ableitung Kind -> Eltern,
// keine echte Vererbung.
function expandWithParents(areaKeys) {
  const result = new Set(areaKeys);
  for (const key of areaKeys) {
    const group = KB_GROUPS[key];
    if (group) result.add(group);
  }
  return [...result];
}

module.exports = { KB_TABLES, KB_LABELS, KB_GROUPS, getTable, getLabel, getGroup, entries, isValidKbTable, expandWithParents };
