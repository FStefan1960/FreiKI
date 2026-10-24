// Serverseitige Rechenwerkzeuge für den Excel-Chat. Das Modell soll bei großen Tabellen weder Zahlen
// lesen noch selbst rechnen müssen: Summen, Rangfolgen und Plan/Ist-Vergleiche rechnet dieses Modul direkt
// auf der xlsx-Datei und gibt nur das kurze Ergebnis zurück. Gelesen wird nur (Schreiben bleibt beim
// Excel-MCP-Server). Formelzellen werden mit dem in der Datei gespeicherten Wert gelesen; fehlt er
// (z. B. frisch per MCP geschriebene Formel), zählt die Zelle als leer.
const fs = require('fs');
const JSZip = require('jszip');

const DEFAULT_N = 10;
const MAX_N = 50;
const MAX_SHEET_XML_CHARS = 150 * 1024 * 1024;
const MAX_CACHED_WORKBOOKS = 2;

const workbookCache = new Map();

function decodeXml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : m;
  });
}

function attr(tag, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : null;
}

function colToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function indexToCol(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function textOf(xml) {
  let out = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) out += decodeXml(m[1]);
  return out;
}

function parseSharedStrings(xml) {
  const list = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(xml))) list.push(m[1] ? textOf(m[1]) : '');
  return list;
}

function parseSheetXml(xml, sharedStrings) {
  const rows = new Map(); // Zeilennummer -> Map(Spaltenindex -> Wert)
  const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const inner = m[2];
    if (!inner) continue;
    const ref = /^([A-Za-z]+)(\d+)$/.exec(attr(attrs, 'r') || '');
    if (!ref) continue;
    const type = attr(attrs, 't');
    let value = null;
    if (type === 'inlineStr') {
      value = textOf(inner);
    } else {
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      if (!v) continue;
      const raw = decodeXml(v[1]);
      if (type === 's') value = sharedStrings[parseInt(raw, 10)] ?? null;
      else if (type === 'str') value = raw;
      else if (type === 'b') value = raw === '1';
      else if (type === 'e') value = null;
      else { const num = Number(raw); value = Number.isFinite(num) ? num : raw; }
    }
    if (value === null || value === '') continue;
    const r = parseInt(ref[2], 10);
    let row = rows.get(r);
    if (!row) { row = new Map(); rows.set(r, row); }
    row.set(colToIndex(ref[1]), value);
  }
  return rows;
}

function resolveTarget(target) {
  const t = target.replace(/^\/+/, '');
  return t.startsWith('xl/') ? t : `xl/${t}`;
}

async function loadWorkbook(filePath) {
  const stat = fs.statSync(filePath);
  const key = `${filePath}:${stat.mtimeMs}:${stat.size}`;
  const cached = workbookCache.get(key);
  if (cached) return cached;

  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const wbXml = await zip.file('xl/workbook.xml')?.async('string');
  if (!wbXml) throw new Error('Keine gültige xlsx-Datei.');
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) rels[id] = resolveTarget(target);
  }
  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], 'name');
    const rid = attr(m[1], 'r:id');
    if (name && rid && rels[rid]) sheets.push({ name, path: rels[rid] });
  }
  const ssXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const wb = { zip, sheets, sharedStrings: ssXml ? parseSharedStrings(ssXml) : [], parsed: new Map() };

  workbookCache.set(key, wb);
  while (workbookCache.size > MAX_CACHED_WORKBOOKS) workbookCache.delete(workbookCache.keys().next().value);
  return wb;
}

async function readSheet(wb, sheetName) {
  const wanted = String(sheetName || '').trim().toLowerCase();
  const sheet = wb.sheets.find(s => s.name.toLowerCase() === wanted);
  if (!sheet) {
    throw new Error(`Blatt "${sheetName}" nicht gefunden. Vorhandene Blätter: ${wb.sheets.map(s => s.name).join(', ')}`);
  }
  if (wb.parsed.has(sheet.name)) return wb.parsed.get(sheet.name);
  const xml = await wb.zip.file(sheet.path)?.async('string');
  if (!xml) throw new Error(`Blatt "${sheet.name}" ist nicht lesbar.`);
  if (xml.length > MAX_SHEET_XML_CHARS) throw new Error(`Blatt "${sheet.name}" ist für die Auswertung zu groß.`);
  const rows = parseSheetXml(xml, wb.sharedStrings);
  const parsed = { name: sheet.name, rows, lastRow: Math.max(0, ...rows.keys()) };
  wb.parsed.set(sheet.name, parsed);
  return parsed;
}

// Zahl aus Zelle: echte Zahlen direkt, Text auch im deutschen Format ("1.234,50", "12,5 %", "3 €").
function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean' || v == null) return NaN;
  let s = String(v).trim().replace(/[\s€%]/g, '').replace(/^\+/, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

const round2 = x => Math.round(x * 100) / 100;

// Spalte per Buchstabe ("C") oder Überschrift ("Ist"). Überschrift hat Vorrang, falls beides passt.
function resolveColumn(spec, sheet, headerRow, what) {
  const s = String(spec ?? '').trim();
  if (!s) throw new Error(`Parameter ${what} fehlt (Spaltenbuchstabe oder Überschrift).`);
  const header = sheet.rows.get(headerRow);
  if (header) {
    for (const [idx, val] of header) {
      if (String(val).trim().toLowerCase() === s.toLowerCase()) return idx;
    }
  }
  if (/^[A-Za-z]{1,3}$/.test(s)) return colToIndex(s);
  const known = header ? [...header].map(([i, v]) => `${indexToCol(i)}="${v}"`).slice(0, 40).join(', ') : '(keine Kopfzeile in Zeile ' + headerRow + ')';
  throw new Error(`Spalte "${s}" in Blatt "${sheet.name}" nicht gefunden. Kopfzeile ${headerRow}: ${known}`);
}

function rowRange(sheet, a) {
  const headerRow = Number.isInteger(a.headerRow) ? a.headerRow : 1;
  const first = Number.isInteger(a.firstRow) ? a.firstRow : headerRow + 1;
  const last = Number.isInteger(a.lastRow) ? Math.min(a.lastRow, sheet.lastRow) : sheet.lastRow;
  return { headerRow, first, last };
}

function clampN(n) {
  const v = Number.isInteger(n) ? n : DEFAULT_N;
  return Math.max(1, Math.min(MAX_N, v));
}

function cellLabel(sheet, r, labelIdx) {
  if (!labelIdx) return null;
  const v = sheet.rows.get(r)?.get(labelIdx);
  return v == null ? null : String(v).trim();
}

async function calcAggregate(filePath, a) {
  const wb = await loadWorkbook(filePath);
  const sheet = await readSheet(wb, a.sheetName);
  const { headerRow, first, last } = rowRange(sheet, a);
  const valueIdx = resolveColumn(a.valueCol, sheet, headerRow, 'valueCol');
  const groupIdx = a.groupByCol ? resolveColumn(a.groupByCol, sheet, headerRow, 'groupByCol') : null;
  const op = ['sum', 'avg', 'min', 'max', 'count'].includes(a.op) ? a.op : 'sum';

  const acc = () => ({ sum: 0, count: 0, min: Infinity, max: -Infinity });
  const add = (g, x) => { g.sum += x; g.count++; g.min = Math.min(g.min, x); g.max = Math.max(g.max, x); };
  const finish = g => (g.count === 0 ? null : round2(op === 'sum' ? g.sum : op === 'avg' ? g.sum / g.count : op === 'min' ? g.min : op === 'max' ? g.max : g.count));

  const total = acc();
  const groups = new Map();
  let skipped = 0;
  for (let r = first; r <= last; r++) {
    const row = sheet.rows.get(r);
    if (!row) continue;
    const raw = row.get(valueIdx);
    if (raw === undefined) continue;
    const x = toNumber(raw);
    if (Number.isNaN(x)) { skipped++; continue; }
    add(total, x);
    if (groupIdx) {
      const key = String(row.get(groupIdx) ?? '(leer)').trim();
      if (!groups.has(key)) groups.set(key, acc());
      add(groups.get(key), x);
    }
  }
  const out = { sheet: sheet.name, op, rows: `${first}-${last}`, valueCol: indexToCol(valueIdx), count: total.count, result: finish(total) };
  if (skipped) out.skippedNonNumeric = skipped;
  if (groupIdx) {
    const n = clampN(a.topN ?? 20);
    const list = [...groups].map(([key, g]) => ({ key, value: finish(g), count: g.count }));
    list.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
    out.groupByCol = indexToCol(groupIdx);
    out.groupCount = list.length;
    out.groups = list.slice(0, n);
    if (list.length > n) out.note = `Nur die ${n} größten von ${list.length} Gruppen gezeigt.`;
  }
  return out;
}

async function calcTopN(filePath, a) {
  const wb = await loadWorkbook(filePath);
  const sheet = await readSheet(wb, a.sheetName);
  const { headerRow, first, last } = rowRange(sheet, a);
  const valueIdx = resolveColumn(a.valueCol, sheet, headerRow, 'valueCol');
  const labelIdx = a.labelCol ? resolveColumn(a.labelCol, sheet, headerRow, 'labelCol') : null;
  const n = clampN(a.n);
  const items = [];
  for (let r = first; r <= last; r++) {
    const raw = sheet.rows.get(r)?.get(valueIdx);
    if (raw === undefined) continue;
    const x = toNumber(raw);
    if (Number.isNaN(x)) continue;
    items.push({ row: r, label: cellLabel(sheet, r, labelIdx), value: round2(x) });
  }
  const asc = a.order === 'asc';
  items.sort((p, q) => (asc ? p.value - q.value : q.value - p.value));
  return { sheet: sheet.name, valueCol: indexToCol(valueIdx), order: asc ? 'asc' : 'desc', numericRows: items.length, top: items.slice(0, n) };
}

function collectByKey(sheet, headerRow, first, last, keyIdx, valueIdx) {
  const map = new Map();
  for (let r = first; r <= last; r++) {
    const row = sheet.rows.get(r);
    if (!row) continue;
    const keyRaw = row.get(keyIdx);
    if (keyRaw == null) continue;
    const x = toNumber(row.get(valueIdx));
    if (Number.isNaN(x)) continue;
    const key = String(keyRaw).trim();
    const e = map.get(key);
    if (e) e.value += x;
    else map.set(key, { value: x, row: r });
  }
  return map;
}

// A minus B pro Schlüssel (z. B. Ist minus Plan je Kostenstelle). Gleiche Schlüssel werden summiert.
async function calcCompare(filePath, a) {
  const wb = await loadWorkbook(filePath);
  const sheetA = await readSheet(wb, a.sheetA);
  const sheetB = a.sheetB ? await readSheet(wb, a.sheetB) : sheetA;
  const ra = rowRange(sheetA, a);
  const rb = rowRange(sheetB, a);
  const keyA = resolveColumn(a.keyCol, sheetA, ra.headerRow, 'keyCol');
  const keyB = resolveColumn(a.keyColB ?? a.keyCol, sheetB, rb.headerRow, 'keyColB');
  const valA = resolveColumn(a.valueColA, sheetA, ra.headerRow, 'valueColA');
  const valB = resolveColumn(a.valueColB, sheetB, rb.headerRow, 'valueColB');
  const labelIdx = a.labelCol ? resolveColumn(a.labelCol, sheetA, ra.headerRow, 'labelCol') : null;
  const n = clampN(a.n);

  const mapA = collectByKey(sheetA, ra.headerRow, ra.first, ra.last, keyA, valA);
  const mapB = collectByKey(sheetB, rb.headerRow, rb.first, rb.last, keyB, valB);

  const diffs = [];
  let totalA = 0, totalB = 0, onlyA = 0;
  for (const [key, ea] of mapA) {
    const eb = mapB.get(key);
    if (!eb) { onlyA++; continue; }
    totalA += ea.value; totalB += eb.value;
    diffs.push({ key, label: cellLabel(sheetA, ea.row, labelIdx), a: round2(ea.value), b: round2(eb.value), diff: round2(ea.value - eb.value) });
  }
  const onlyB = [...mapB.keys()].filter(k => !mapA.has(k)).length;
  const byDesc = [...diffs].sort((p, q) => q.diff - p.diff);
  const out = {
    sheetA: sheetA.name, valueColA: indexToCol(valA), sheetB: sheetB.name, valueColB: indexToCol(valB),
    matchedKeys: diffs.length, onlyInA: onlyA, onlyInB: onlyB,
    totalA: round2(totalA), totalB: round2(totalB), totalDiff: round2(totalA - totalB),
    largestPositiveDiff: byDesc.filter(d => d.diff > 0).slice(0, n),
    largestNegativeDiff: byDesc.filter(d => d.diff < 0).reverse().slice(0, n),
    meaning: 'diff = Wert in A minus Wert in B',
  };
  if (!diffs.length) out.warning = 'Keine gemeinsamen Schlüssel gefunden – Schlüsselspalte, Kopfzeile und Zeilenbereich prüfen.';
  return out;
}

const colProp = (desc) => ({ type: 'string', description: `${desc} (Spaltenbuchstabe wie "C" oder Text der Überschrift)` });
const common = {
  headerRow: { type: 'integer', description: 'Zeile mit den Überschriften (Standard 1)' },
  firstRow: { type: 'integer', description: 'Erste Datenzeile (Standard: Zeile nach der Kopfzeile)' },
  lastRow: { type: 'integer', description: 'Letzte Datenzeile (Standard: bis Blattende)' },
};

const CALC_TOOL_DEFS = [
  {
    name: 'calc_aggregate',
    description: 'Rechnet exakt auf einer Spalte: Summe, Durchschnitt, Minimum, Maximum oder Anzahl. Optional gruppiert nach einer zweiten Spalte (z. B. Summe je Kostenstelle). Immer statt selbst zu addieren verwenden.',
    parameters: {
      type: 'object',
      properties: {
        sheetName: { type: 'string' },
        valueCol: colProp('Spalte mit den Zahlen'),
        op: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'], description: 'Standard sum' },
        groupByCol: colProp('Optional: Spalte zum Gruppieren'),
        topN: { type: 'integer', description: 'Bei Gruppierung: wie viele Gruppen (nach Betrag), Standard 20, max 50' },
        ...common,
      },
      required: ['sheetName', 'valueCol'],
    },
  },
  {
    name: 'calc_top_n',
    description: 'Liefert die Zeilen mit den größten (desc) oder kleinsten (asc) Werten einer Spalte, mit Zeilennummer und Bezeichnung.',
    parameters: {
      type: 'object',
      properties: {
        sheetName: { type: 'string' },
        valueCol: colProp('Spalte mit den Zahlen'),
        labelCol: colProp('Spalte mit der Bezeichnung der Zeile'),
        n: { type: 'integer', description: 'Anzahl, Standard 10, max 50' },
        order: { type: 'string', enum: ['desc', 'asc'], description: 'Standard desc' },
        ...common,
      },
      required: ['sheetName', 'valueCol'],
    },
  },
  {
    name: 'calc_compare',
    description: 'Vergleicht zwei Zahlenspalten über einen gemeinsamen Schlüssel (z. B. Kostenstelle) und liefert A minus B: Gesamtsummen sowie die größten positiven und negativen Abweichungen. Für Plan/Ist, Vorjahr/aktuell, zwei Blätter oder zwei Spalten im selben Blatt. A und B auf demselben Blatt: sheetB weglassen.',
    parameters: {
      type: 'object',
      properties: {
        sheetA: { type: 'string' },
        valueColA: colProp('Zahlenspalte A'),
        sheetB: { type: 'string', description: 'Blatt für B; weglassen, wenn B im selben Blatt wie A liegt' },
        valueColB: colProp('Zahlenspalte B'),
        keyCol: colProp('Schlüsselspalte, die A und B verbindet (z. B. Kostenstelle)'),
        keyColB: colProp('Nur wenn die Schlüsselspalte in Blatt B anders heißt oder woanders liegt'),
        labelCol: colProp('Optional: Spalte mit einer lesbaren Bezeichnung (aus Blatt A)'),
        n: { type: 'integer', description: 'Anzahl je Richtung, Standard 10, max 50' },
        ...common,
      },
      required: ['sheetA', 'valueColA', 'valueColB', 'keyCol'],
    },
  },
];

const CALC_HANDLERS = { calc_aggregate: calcAggregate, calc_top_n: calcTopN, calc_compare: calcCompare };

const CALC_TOOL_NAMES = new Set(Object.keys(CALC_HANDLERS));

async function runCalcTool(name, filePath, args) {
  const handler = CALC_HANDLERS[name];
  if (!handler) throw new Error('Unbekanntes Rechenwerkzeug');
  return handler(filePath, args || {});
}

function calcToolsForLlm() {
  return CALC_TOOL_DEFS.map(d => ({ type: 'function', function: d }));
}

// Formeln: der Excel-MCP-Server erwartet ein einzelnes führendes "=" (verifiziert); "==" ergibt eine leere Zelle.
function normalizeFormulaValues(values) {
  if (!Array.isArray(values)) return values;
  return values.map(row => (Array.isArray(row)
    ? row.map(v => (typeof v === 'string' && /^=\s*=/.test(v) ? v.replace(/^=\s*=+\s*/, '=') : v))
    : row));
}

module.exports = {
  runCalcTool, calcToolsForLlm, CALC_TOOL_NAMES, normalizeFormulaValues,
  _internal: { parseSheetXml, parseSharedStrings, toNumber, loadWorkbook, readSheet, colToIndex, indexToCol },
};
