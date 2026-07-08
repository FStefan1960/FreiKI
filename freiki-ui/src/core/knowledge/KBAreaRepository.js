const fs = require('fs');
const path = require('path');
const { config } = require('../../shared/config');

const areasConfig = JSON.parse(fs.readFileSync(path.join(config.APP_ROOT, 'areas.json'), 'utf-8'));

const KB_TABLES = {};
const KB_LABELS = {};
for (const [key, def] of Object.entries(areasConfig)) {
  KB_TABLES[key] = def.table;
  KB_LABELS[key] = def.label;
}

function getTable(areaKey) {
  return KB_TABLES[areaKey];
}

function getLabel(areaKey) {
  return KB_LABELS[areaKey];
}

function entries() {
  return Object.entries(KB_TABLES);
}

module.exports = { KB_TABLES, KB_LABELS, getTable, getLabel, entries };
