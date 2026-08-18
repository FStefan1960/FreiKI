const path = require('path');

// freiki-ui-Wurzel (drei Ebenen über dieser Datei: config → shared → src → Wurzel).
// Content-Dateien (public/, prompts/, welcome.md, ...) bleiben dort, weil docker-compose.yml
// sie genau an diesen Pfaden bind-mountet.
const APP_ROOT = path.join(__dirname, '..', '..', '..');

const config = {
  APP_ROOT,
  PUBLIC_DIR: path.join(APP_ROOT, 'public'),
  PROMPT_DIR: process.env.PROMPT_DIR || path.join(APP_ROOT, 'prompts'),
  FORM_TEMPLATES_DIR: path.join(APP_ROOT, 'form-templates'),
  PORT: 3000,

  VLLM_URL: process.env.VLLM_URL || 'http://vllm:8000',
  VLLM_API_KEY: process.env.VLLM_API_KEY || '',
  VLLM_MODEL: process.env.VLLM_MODEL || 'Qwen/Qwen3-32B',
  VLLM_EMBED_URL: process.env.VLLM_EMBED_URL || 'http://vLLM-Embedding:8001/v1/embeddings',
  VLLM_EMBED_MODEL: process.env.VLLM_EMBED_MODEL || 'BAAI/bge-m3',

  IMAGE_GEN_URL: process.env.IMAGE_GEN_URL || 'https://api.deepinfra.com/v1/openai/images/generations',
  IMAGE_GEN_API_KEY: process.env.IMAGE_GEN_API_KEY || '',
  IMAGE_GEN_MODEL: process.env.IMAGE_GEN_MODEL || 'black-forest-labs/FLUX-2-klein-4b',

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

  // Signal-Alert bei vLLM-Ausfall (CallMeBot, siehe jobs/vllmSignalMonitor.js) - optional,
  // Monitor bleibt inaktiv ohne beide Werte. Vorher hartkodiert im n8n-Workflow-JSON.
  SIGNAL_PHONE: process.env.SIGNAL_PHONE || '',
  SIGNAL_APIKEY: process.env.SIGNAL_APIKEY || '',

  // Feste Adresse für Benachrichtigungen über neue Selbstregistrierungen (zusätzlich zu
  // allen Admin-Konten mit hinterlegter E-Mail, siehe UserRepository.listAdminEmails()) -
  // deckt z.B. ein Sammelpostfach ab, das keinem einzelnen Admin-Login zugeordnet ist.
  REGISTRATION_NOTIFY_EMAIL: process.env.REGISTRATION_NOTIFY_EMAIL || '',

  // ── Instanzspezifische Berichte (src/jobs/*.js) - alle optional, Job überspringt sich
  // selbst (siehe jeweiliges Modul), wenn die nötigen Werte fehlen. ──
  WEATHER_WARN_LAT: process.env.WEATHER_WARN_LAT || '',
  WEATHER_WARN_LON: process.env.WEATHER_WARN_LON || '',
  WEATHER_WARN_RECIPIENTS: (process.env.WEATHER_WARN_RECIPIENTS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Amtlicher Gemeindeschlüssel (AGS) der Region, siehe warnung.bund.de API-Dokumentation.
  NINA_WARN_AGS: process.env.NINA_WARN_AGS || '',
  NINA_WARN_RECIPIENTS: (process.env.NINA_WARN_RECIPIENTS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Zielgruppen-Beschreibung für den LLM-Gedanken der Tageslosung, z.B. eine diakonische
  // Einrichtung mit eigenem Alltagsbezug. Leer = generischer Default (siehe tageslosung.js).
  TAGESLOSUNG_AUDIENCE: process.env.TAGESLOSUNG_AUDIENCE || '',

  APP_URL: process.env.APP_URL || 'http://localhost:3000',

  PAPERLESS_INTERNAL_URL: process.env.PAPERLESS_INTERNAL_URL || 'http://paperless:8000',
  PAPERLESS_TOKEN: process.env.PAPERLESS_TOKEN || '',

  // Passwort des dedizierten "healthcheck"-Testnutzers (siehe jobs/syntheticHealthCheck.js) -
  // bisher nur von n8n gelesen, jetzt auch von der App selbst gebraucht.
  HEALTHCHECK_PASSWORD: process.env.HEALTHCHECK_PASSWORD || '',

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

  MATTERMOST_URL: process.env.MATTERMOST_URL || '',
  // Verifikations-Token des Mattermost-Slash-Commands "/freiki" (siehe commands-Tabelle in der
  // Mattermost-DB) - ersetzt den früheren n8n-Webhook-Workflow "FreiKI Mattermost Bot".
  MATTERMOST_SLASH_TOKEN: process.env.MATTERMOST_SLASH_TOKEN || '',
  // Verifikations-Token des Outgoing Webhooks "@freiki" (siehe outgoingwebhooks-Tabelle in der
  // Mattermost-DB) - ersetzt den früheren n8n-Workflow "FreiKI @mention Handler".
  MATTERMOST_MENTION_TOKEN: process.env.MATTERMOST_MENTION_TOKEN || '',
  // Personal Access Token des Mattermost-Bot-Nutzers "freiki", zum Zurückposten der Antwort.
  MATTERMOST_BOT_TOKEN: process.env.MATTERMOST_BOT_TOKEN || '',
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
