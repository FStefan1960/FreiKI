const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const EXCEL_MCP_LAUNCHER = require.resolve('@negokaz/excel-mcp-server/dist/launcher.js');
const MAX_TOOL_ITERATIONS = 5;
const TOOL_TIMEOUT_MS = 60 * 1000;
const TOTAL_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_CONCURRENT = 3;
// Feste Werkzeugliste: neue/unbekannte MCP-Tools nach einem Paket-Update werden nicht automatisch ans Modell durchgereicht.
const ALLOWED_TOOLS = new Set([
  'excel_describe_sheets', 'excel_read_sheet', 'excel_write_to_sheet',
  'excel_create_table', 'excel_copy_sheet', 'excel_format_range'
]);
let activeRuns = 0;

function mcpToolsToOpenAI(mcpTools) {
  return mcpTools.filter(t => ALLOWED_TOOLS.has(t.name)).map(t => {
    const schema = t.inputSchema || { type: 'object', properties: {} };
    const properties = { ...(schema.properties || {}) };
    delete properties.fileAbsolutePath; // wird immer serverseitig erzwungen, Modell soll ihn nicht raten müssen
    const required = (schema.required || []).filter(r => r !== 'fileAbsolutePath');
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: { ...schema, properties, required }
      }
    };
  });
}

async function runExcelChatInner(filePath, messages, { vllmUrl, vllmModel, vllmApiKey, fetchWithTimeout }, deadline) {
  const transport = new StdioClientTransport({ command: 'node', args: [EXCEL_MCP_LAUNCHER] });
  const client = new Client({ name: 'freiki-excel-test', version: '0.1.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const { tools: mcpTools } = await client.listTools();
    const openAiTools = mcpToolsToOpenAI(mcpTools);

    let convo = [...messages];
    let finalText = '';

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (Date.now() > deadline) throw new Error('Zeitlimit überschritten');
      const res = await fetchWithTimeout(`${vllmUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${vllmApiKey}` },
        body: JSON.stringify({
          model: vllmModel,
          messages: convo,
          tools: openAiTools,
          tool_choice: 'auto',
          max_tokens: 4096,
          temperature: 0.2
        })
      });
      if (!res.ok) throw new Error(`LLM Fehler: ${res.status} – ${await res.text()}`);
      const json = await res.json();
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error('Keine Antwort vom Modell');

      if (msg.tool_calls && msg.tool_calls.length) {
        convo.push(msg);
        for (const tc of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
          args.fileAbsolutePath = filePath; // nie dem Modell vertrauen, immer serverseitig erzwingen
          let toolResultText;
          try {
            if (!ALLOWED_TOOLS.has(tc.function.name)) throw new Error('Werkzeug nicht erlaubt');
            const result = await client.callTool({ name: tc.function.name, arguments: args }, undefined, { timeout: TOOL_TIMEOUT_MS });
            toolResultText = JSON.stringify(result.content ?? result);
          } catch (toolErr) {
            toolResultText = JSON.stringify({ error: toolErr.message });
          }
          convo.push({ role: 'tool', tool_call_id: tc.id, content: toolResultText });
        }
        continue;
      }

      finalText = (msg.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      break;
    }

    if (!finalText) finalText = 'Ich konnte innerhalb der erlaubten Schritte keine abschließende Antwort erzeugen. Bitte die Frage präzisieren.';
    return finalText;
  } finally {
    try { await client.close(); } catch (_) {}
  }
}

async function runExcelChat(filePath, messages, deps) {
  if (activeRuns >= MAX_CONCURRENT) {
    const err = new Error('Excel-Chat ist gerade ausgelastet. Bitte in einer Minute erneut versuchen.');
    err.code = 'EXCEL_BUSY';
    throw err;
  }
  activeRuns++;
  const run = runExcelChatInner(filePath, messages, deps, Date.now() + TOTAL_TIMEOUT_MS);
  run.catch(() => {}).finally(() => { activeRuns--; });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Zeitlimit überschritten')), TOTAL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { runExcelChat, mcpToolsToOpenAI };
