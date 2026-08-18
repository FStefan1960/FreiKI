const { config } = require('../../shared/config');

// /no_think im Prompt wird von Qwen3.6 nicht mehr zuverlässig respektiert (siehe KorKI-Fix).
// chat_template_kwargs ist Qwen/vLLM-spezifisch - Mistral (FrankKI) lehnt unbekannte Felder mit
// HTTP 422 "extra_forbidden" ab, daher NUR setzen, wenn das konfigurierte Modell ein Qwen ist.
const THINKING_KWARGS = /qwen/i.test(config.VLLM_MODEL || '')
  ? { chat_template_kwargs: { enable_thinking: false } }
  : {};

module.exports = { THINKING_KWARGS };
