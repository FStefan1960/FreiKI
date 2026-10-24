const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { runCalcTool, calcToolsForLlm, CALC_TOOL_NAMES, normalizeFormulaValues, _internal } = require('../../src/core/excel/ExcelCalc');

// Minimale xlsx von Hand: ein Blatt mit Shared Strings, ein Blatt mit Inline-Strings und deutschen Zahlentexten.
async function buildWorkbook(file) {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook xmlns:r="x"><sheets><sheet name="Plan" sheetId="1" r:id="rId1"/><sheet name="Ist &amp; Co" sheetId="2" r:id="rId2"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="/xl/worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/sharedStrings.xml', '<sst><si><t>KST</t></si><si><t>Name</t></si><si><t>Betrag</t></si><si><r><t>Pfle</t></r><r><t>ge</t></r></si><si><t>Küche</t></si></sst>');
  // Plan: A=KST, B=Name, C=Betrag
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2"><v>7000</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>100</v></c></row>
    <row r="3"><c r="A3"><v>7010</v></c><c r="B3" t="s"><v>4</v></c><c r="C3"><v>50.5</v></c></row>
    <row r="4"><c r="A4"><v>7020</v></c><c r="B4" t="s"><v>4</v></c><c r="C4" s="3"/></row>
  </sheetData></worksheet>`);
  zip.file('xl/worksheets/sheet2.xml', `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>KST</t></is></c><c r="C1" t="inlineStr"><is><t>Betrag</t></is></c></row>
    <row r="2"><c r="A2"><v>7000</v></c><c r="C2" t="inlineStr"><is><t>1.234,50</t></is></c></row>
    <row r="3"><c r="A3"><v>7010</v></c><c r="C3"><f>A3*0</f><v>20</v></c></row>
    <row r="4"><c r="A4"><v>7030</v></c><c r="C4"><v>5</v></c></row>
    <row r="5"><c r="A5"><v>7000</v></c><c r="C5"><v>10</v></c></row>
  </sheetData></worksheet>`);
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('ExcelCalc', () => {
  let dir, file;
  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'excelcalc-'));
    file = path.join(dir, 'test.xlsx');
    await buildWorkbook(file);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('toNumber versteht deutsche und englische Formate', () => {
    const { toNumber } = _internal;
    assert.strictEqual(toNumber('1.234,50'), 1234.5);
    assert.strictEqual(toNumber('12,5 %'), 12.5);
    assert.strictEqual(toNumber('3 €'), 3);
    assert.strictEqual(toNumber('-7,25'), -7.25);
    assert.strictEqual(toNumber('1234.5'), 1234.5);
    assert.ok(Number.isNaN(toNumber('abc')));
    assert.ok(Number.isNaN(toNumber('')));
  });

  it('calc_aggregate: Summe nach Überschrift und nach Buchstabe, leere Zellen ignoriert', async () => {
    const byHeader = await runCalcTool('calc_aggregate', file, { sheetName: 'Plan', valueCol: 'Betrag', op: 'sum' });
    assert.strictEqual(byHeader.result, 150.5);
    assert.strictEqual(byHeader.count, 2);
    assert.strictEqual(byHeader.valueCol, 'C');
    assert.strictEqual(byHeader.valueColHeader, 'Betrag'); // Überschrift im Ergebnis sichtbar
    const byLetter = await runCalcTool('calc_aggregate', file, { sheetName: 'plan', valueCol: 'c', op: 'max' });
    assert.strictEqual(byLetter.result, 100);
  });

  it('calc_aggregate: Gruppierung, Shared-String-Runs und Textzahlen', async () => {
    const r = await runCalcTool('calc_aggregate', file, { sheetName: 'Ist & Co', valueCol: 'C', groupByCol: 'A' });
    const g = Object.fromEntries(r.groups.map(x => [x.key, x.value]));
    assert.strictEqual(g['7000'], 1244.5);
    assert.strictEqual(g['7010'], 20);
    assert.strictEqual(r.result, 1269.5); // 1234,5 + 20 + 5 + 10
    const names = await runCalcTool('calc_top_n', file, { sheetName: 'Plan', valueCol: 'Betrag', labelCol: 'Name', n: 1 });
    assert.strictEqual(names.top[0].label, 'Pflege');
  });

  it('calc_top_n: Reihenfolge und Zeilennummer', async () => {
    const r = await runCalcTool('calc_top_n', file, { sheetName: 'Plan', valueCol: 'Betrag', labelCol: 'Name', order: 'asc', n: 5 });
    assert.deepStrictEqual(r.top.map(t => [t.row, t.value]), [[3, 50.5], [2, 100]]);
  });

  it('calc_compare: Ist minus Plan über Schlüssel, Dubletten summiert', async () => {
    const r = await runCalcTool('calc_compare', file, {
      sheetA: 'Ist & Co', valueColA: 'C', sheetB: 'Plan', valueColB: 'Betrag', keyCol: 'A', keyColB: 'KST',
    });
    assert.strictEqual(r.matchedKeys, 2);
    assert.strictEqual(r.onlyInA, 1); // 7030
    assert.strictEqual(r.onlyInB, 0); // 7020 hat im Plan keinen Betrag und zählt nicht
    const up = r.largestPositiveDiff[0];
    assert.strictEqual(up.key, '7000');
    assert.strictEqual(up.diff, 1144.5);
    assert.strictEqual(r.largestNegativeDiff[0].key, '7010');
    assert.strictEqual(r.largestNegativeDiff[0].diff, -30.5);
    assert.strictEqual(r.totalA, 1264.5);
    assert.strictEqual(r.totalB, 150.5);
    assert.strictEqual(r.totalDiff, 1114);
  });

  it('Fehler nennen Blätter bzw. Überschriften', async () => {
    await assert.rejects(() => runCalcTool('calc_aggregate', file, { sheetName: 'Nix', valueCol: 'A' }), /Vorhandene Blätter: Plan, Ist & Co/);
    await assert.rejects(() => runCalcTool('calc_aggregate', file, { sheetName: 'Plan', valueCol: 'Gibtsnicht' }), /Kopfzeile 1: A="KST"/);
  });

  it('Tool-Definitionen passen zu den Handlern', () => {
    const names = calcToolsForLlm().map(t => t.function.name);
    assert.deepStrictEqual(names.sort(), [...CALC_TOOL_NAMES].sort());
  });

  it('normalizeFormulaValues: "==" wird zu "=", Rest bleibt', () => {
    assert.deepStrictEqual(
      normalizeFormulaValues([['==B2*C2', '=SUM(A1:A2)', 'Text', 5, '= =A1']]),
      [['=B2*C2', '=SUM(A1:A2)', 'Text', 5, '=A1']]
    );
    assert.strictEqual(normalizeFormulaValues(undefined), undefined);
  });
});
