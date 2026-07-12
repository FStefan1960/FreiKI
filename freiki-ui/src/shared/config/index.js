const path = require('path');

// freiki-ui-Wurzel (drei Ebenen über dieser Datei: config → shared → src → Wurzel).
// Content-Dateien (public/, prompts/, welcome.md, ...) bleiben dort, weil docker-compose.yml
// sie genau an diesen Pfaden bind-mountet.
const APP_ROOT = path.join(__dirname, '..', '..', '..');

const config = {
  APP_ROOT,
  PUBLIC_DIR: path.join(APP_ROOT, 'public'),
  PROMPT_DIR: path.join(APP_ROOT, 'prompts'),
  PORT: 3000,

  VLLM_URL: process.env.VLLM_URL || 'http://vllm:8000',
  VLLM_API_KEY: process.env.VLLM_API_KEY || '',
  VLLM_MODEL: process.env.VLLM_MODEL || 'Qwen/Qwen3-32B',
  VLLM_EMBED_URL: process.env.VLLM_EMBED_URL || 'http://vLLM-Embedding:8001/v1/embeddings',
  VLLM_EMBED_MODEL: process.env.VLLM_EMBED_MODEL || 'BAAI/bge-m3',

  SEARXNG_URL: process.env.SEARXNG_URL || 'http://searxng:8080',
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || '',
  N8N_DAILY_REPORT_WEBHOOK_URL: process.env.N8N_DAILY_REPORT_WEBHOOK_URL || '',
  WHISPER_URL: process.env.WHISPER_URL || 'http://whisper:9000',
  PIPER_URL: process.env.PIPER_URL || 'http://piper:8000',
  TTS_MODEL: process.env.TTS_MODEL || 'speaches-ai/piper-de_DE-thorsten-high',
  TTS_VOICE: process.env.TTS_VOICE || 'thorsten',

  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587'),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || '',

  APP_URL: process.env.APP_URL || 'http://localhost:3000',

  PAPERLESS_INTERNAL_URL: process.env.PAPERLESS_INTERNAL_URL || 'http://paperless:8000',
  PAPERLESS_TOKEN: process.env.PAPERLESS_TOKEN || '',

  MAX_CONTEXT_CHARS: parseInt(process.env.MAX_CONTEXT_CHARS || '40000'),
  MAX_VLLM_CHARS: parseInt(process.env.MAX_VLLM_CHARS || '20000'),
  MAX_CONTEXT_CHARS_MULTI: parseInt(process.env.MAX_CONTEXT_CHARS_MULTI || '90000'),
  MAX_VLLM_CHARS_MULTI: parseInt(process.env.MAX_VLLM_CHARS_MULTI || '80000'),
  SEARXNG_RESULTS: 5,

  JWT_SECRET: process.env.JWT_SECRET || '',

  PG_HOST: process.env.PG_HOST || 'PostgreSQL',
  PG_DB: process.env.PG_DB || 'flowise',
  PG_USER_KB: process.env.PG_USER_KB || 'n8n_user',
  PG_PASS_KB: process.env.PG_PASS_KB || '',

  HILFE_KB_TABLE: process.env.HILFE_KB_TABLE || '',
  KB_INGEST_API_KEY: process.env.KB_INGEST_API_KEY || '',
  BOT_API_KEY: process.env.BOT_API_KEY || '',

  OIDC_CLIENT_ID: process.env.MATTERMOST_OIDC_CLIENT_ID || '',
  OIDC_CLIENT_SECRET: process.env.MATTERMOST_OIDC_CLIENT_SECRET || '',
  OIDC_REDIRECT_URI: process.env.MATTERMOST_OIDC_REDIRECT_URI || '',
};

const REQUIRED_ENV = ['JWT_SECRET', 'VLLM_URL', 'VLLM_API_KEY', 'PG_PASS_KB'];
const OPTIONAL_ENV = ['SMTP_HOST', 'WHISPER_URL', 'PIPER_URL', 'PAPERLESS_TOKEN',
                      'MATTERMOST_URL', 'KB_INGEST_API_KEY', 'BOT_API_KEY'];

function validateEnv() {
  const missingRequired = REQUIRED_ENV.filter(k => !process.env[k]);
  if (missingRequired.length) {
    console.error(`FATAL: Fehlende Pflicht-Umgebungsvariablen: ${missingRequired.join(', ')}`);
    process.exit(1);
  }
  const missingOptional = OPTIONAL_ENV.filter(k => !process.env[k]);
  if (missingOptional.length) {
    console.warn(`WARNUNG: Optionale Variablen nicht gesetzt (Features deaktiviert): ${missingOptional.join(', ')}`);
  }
  if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
    console.error('FEHLER: JWT_SECRET muss gesetzt sein und mindestens 32 Zeichen lang!');
    process.exit(1);
  }
}

module.exports = { config, validateEnv };
