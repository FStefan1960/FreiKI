const { describe, it } = require('node:test');
const assert = require('node:assert');
const { mcpToolsToOpenAI } = require('../../src/core/excel/ExcelService');

const tools = ['excel_describe_sheets', 'excel_read_sheet', 'excel_write_to_sheet', 'excel_create_table', 'excel_copy_sheet', 'excel_format_range', 'evil_tool']
  .map(name => ({ name, inputSchema: { type: 'object', properties: { fileAbsolutePath: {}, x: {} }, required: ['fileAbsolutePath'] } }));

describe('ExcelService: Schreibfreigabe', () => {
  it('ohne Freigabe nur Lesewerkzeuge', () => {
    const names = mcpToolsToOpenAI(tools).map(t => t.function.name);
    assert.deepStrictEqual(names, ['excel_describe_sheets', 'excel_read_sheet']);
  });

  it('mit Freigabe alle bekannten Werkzeuge, unbekannte nie', () => {
    const names = mcpToolsToOpenAI(tools, { canWrite: true }).map(t => t.function.name);
    assert.strictEqual(names.length, 6);
    assert.ok(!names.includes('evil_tool'));
  });

  it('fileAbsolutePath wird dem Modell nie gezeigt', () => {
    for (const t of mcpToolsToOpenAI(tools, { canWrite: true })) {
      assert.ok(!('fileAbsolutePath' in t.function.parameters.properties));
      assert.ok(!t.function.parameters.required.includes('fileAbsolutePath'));
    }
  });
});
