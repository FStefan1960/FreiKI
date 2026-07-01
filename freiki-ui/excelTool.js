const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const EXCEL_MCP_LAUNCHER = require.resolve('@negokaz/excel-mcp-server/dist/launcher.js');
const MAX_TOOL_ITERATIONS = 5;

function mcpToolsToOpenAI(mcpTools) {
  return mcpTools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.inputSchema || { type: 'object', properties: {} }
    }
  }));
}

async function runExcelChat(filePath, messages, { vllmUrl, vllmModel, vllmApiKey, fetchWithTimeout }) {
  const transport = new StdioClientTransport({ command: 'node', args: [EXCEL_MCP_LAUNCHER] });
  const client = new Client({ name: 'freiki-excel-test', version: '0.1.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const { tools: mcpTools } = await client.listTools();
    const openAiTools = mcpToolsToOpenAI(mcpTools);

    let convo = [...messages];
    let finalText = '';

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
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
            const result = await client.callTool({ name: tc.function.name, arguments: args });
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

module.exports = { runExcelChat, mcpToolsToOpenAI };
