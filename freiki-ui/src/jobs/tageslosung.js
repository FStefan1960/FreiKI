// Ersatz für den n8n-Workflow "Tageslosung" - holt die Losung von losungen.de, lässt das
// interne LLM einen kurzen Gedankenimpuls schreiben und speichert direkt in losung.json
// (vorher per Self-HTTP-Login mit einem im Workflow hinterlegten Klartext-Passwort - das
// entfällt hier komplett, da der Job im selben Prozess läuft wie die Route, die es liest).
const fs = require('fs');
const path = require('path');
const https = require('https');
const nodeFetch = require('node-fetch');
const { config } = require('../shared/config');
const { fetchWithTimeout } = require('../shared/utils/text');
const { getBrandConfig } = require('../shared/config/BrandConfig');

// losungen.de liefert eine unvollständige Zertifikatskette (fehlendes Intermediate-Zertifikat) -
// bewusst NUR für diesen einen Request gelockert (eigener Agent + node-fetch statt globalem
// fetch, da undici keinen klassischen "agent"-Parameter kennt), nicht global für die App.
// War im n8n-Original per "allowUnauthorizedCerts" auf Node-Ebene gesetzt.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function clean(s) {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLosung(html) {
  const losungM = html.match(/class="watchword">\s*([\s\S]*?)<span class="watchwordPassage[^>]*>([^<]+)<\/span>/);
  const lehrtextM = html.match(/class="instructiveText">\s*([\s\S]*?)<span class="instructiveTextPassage[^>]*>([^<]+)<\/span>/);
  if (!losungM || !lehrtextM) {
    throw new Error('Losung/Lehrtext konnten nicht aus losungen.de geparst werden - HTML-Struktur hat sich evtl. geändert.');
  }
  return {
    losungText: clean(losungM[1]), losungRef: clean(losungM[2]),
    lehrtextText: clean(lehrtextM[1]), lehrtextRef: clean(lehrtextM[2]),
  };
}

async function run() {
  const r = await nodeFetch('https://www.losungen.de/', { agent: insecureAgent, timeout: 15000 });
  if (!r.ok) throw new Error(`losungen.de HTTP ${r.status}`);
  const html = await r.text();
  const { losungText, losungRef, lehrtextText, lehrtextRef } = parseLosung(html);

  const brand = getBrandConfig();
  // Instanzspezifisch anpassbar (z.B. auf eine diakonische Zielgruppe zugeschnitten),
  // Default ist bewusst allgemein gehalten für Instanzen ohne eigene Vorgabe.
  const audience = config.TAGESLOSUNG_AUDIENCE || `Mitarbeitende von ${brand.name}`;
  const thinkingKwargs = /qwen/i.test(config.VLLM_MODEL || '') ? { chat_template_kwargs: { enable_thinking: false } } : {};

  const llmRes = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.VLLM_API_KEY}` },
    body: JSON.stringify({
      model: config.VLLM_MODEL,
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        { role: 'system', content: `Du bist ein seelsorglicher Begleiter für ${audience}. Schreibe zu der folgenden Losung und dem Lehrtext einen kurzen, positiven Gedankenimpuls (6-8 Sätze) mit klarem, konkretem Bezug zum Arbeitsalltag der Zielgruppe. Warmherzig und ermutigend, keine theologische Abhandlung, keine Wiederholung des Bibeltexts. Gib NUR den Fließtext zurück, ohne Überschrift, ohne Anführungszeichen. /no_think` },
        { role: 'user', content: `Losung: ${losungText} (${losungRef})\nLehrtext: ${lehrtextText} (${lehrtextRef})` },
      ],
      ...thinkingKwargs,
    }),
  }, 120000);
  if (!llmRes.ok) throw new Error(`LLM HTTP ${llmRes.status}`);
  const data = await llmRes.json();
  const gedanken = (data.choices?.[0]?.message?.content || '').trim();

  fs.writeFileSync(path.join(config.APP_ROOT, 'losung.json'), JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    losung: losungText, losungRef, lehrtext: lehrtextText, lehrtextRef, gedanken,
  }));
}

module.exports = { run };
