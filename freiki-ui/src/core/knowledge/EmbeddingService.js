const { config } = require('../../shared/config');
const { fetchWithTimeout, withRetry } = require('../../shared/utils/text');

async function getEmbeddings(texts) {
  const r = await withRetry(() => fetchWithTimeout(config.VLLM_EMBED_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + config.VLLM_API_KEY,
    },
    body: JSON.stringify({ model: config.VLLM_EMBED_MODEL, input: texts }),
  }, 30_000));
  if (!r.ok) throw new Error('Embedding API ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  return data.data.map(d => d.embedding);
}

module.exports = { getEmbeddings };
