const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');

// Siehe ChatService.js/OCRService.js: chat_template_kwargs nur bei Qwen-Modellen setzen
// (Mistral/FrankKI lehnt unbekannte Felder mit HTTP 422 ab).
const THINKING_KWARGS = /qwen/i.test(config.VLLM_MODEL || '')
  ? { chat_template_kwargs: { enable_thinking: false } }
  : {};

const DEFAULT_LANGUAGE = 'Deutsch';
const isGerman = (language) => !language || language.trim().toLowerCase() === 'deutsch';

// Antworten werden NICHT mehr per LLM geprüft/normalisiert (frühere Versuche haben reale,
// aber ungewöhnlich wirkende Angaben wie den Nachnamen "Stefan" fälschlich abgelehnt - Namen
// und Zahlen aus der echten Welt sind grundsätzlich nicht zuverlässig algorithmisch validierbar).
// Der Nutzer wird beim Antworten also nicht mehr bevormundet - die Eingabe wird 1:1 übernommen
// (siehe formRoutes.js /answer). Nur der Fragetext wird bei Bedarf übersetzt (unten).

// Übersetzt den (fest admin-verfassten, deutschen) Fragetext für die Anzeige im Chat - die
// gespeicherten field_key/question_text bleiben immer Deutsch, nur die Anzeige wird lokalisiert.
async function translateQuestion(questionText, language) {
  if (isGerman(language)) return questionText;
  try {
    const res = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: `Übersetze den folgenden Satz präzise in die Sprache "${language}". Gib NUR die Übersetzung zurück, ohne Anführungszeichen oder Erklärung. Falls "${language}" keine dir bekannte Sprache ist, gib den Satz unverändert zurück. /no_think` },
          { role: 'user', content: questionText },
        ],
        max_tokens: 200, temperature: 0.1,
        ...THINKING_KWARGS,
      }),
    }, 20_000);
    if (!res.ok) return questionText;
    const json = await res.json();
    const translated = (json.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return translated || questionText;
  } catch {
    return questionText;
  }
}

// Alle statischen Bedienelemente-/Meldungstexte (Buttons, Platzhalter, PIN-Hinweise,
// Statusmeldungen) - werden einmal pro Sitzung (bei Start/Fortsetzen) übersetzt, nicht bei
// jeder einzelnen Antwort. Nur die Fragen selbst (admin-verfasst) laufen über translateQuestion.
const UI_LABELS_DE = {
  send: 'Senden',
  skip: 'Überspringen',
  finish: 'PDF erzeugen & herunterladen',
  printOk: 'Ja, fertig',
  printRetry: 'Nein, nochmal',
  placeholder: 'Antwort eingeben …',
  pinCopy: 'PIN kopieren',
  pinCopied: 'Kopiert!',
  pinIntro: 'Deine DokumentenPIN zum späteren Fortsetzen (falls du zwischendurch etwas nachschauen musst):',
  pinNote: 'Bitte notieren – erst nach bestätigtem, erfolgreichem Ausdruck wird die Sitzung gelöscht.',
  doneMessage: 'Danke, alle Angaben sind vollständig. Du kannst jetzt das ausgefüllte PDF herunterladen.',
  printQuestion: 'War der Ausdruck erfolgreich?',
  printedSuccess: 'Fertig. Die Sitzung wurde gelöscht.',
  retryNote: 'Kein Problem – die PIN gilt weiter, du kannst es erneut versuchen.',
  progressQuestion: 'Frage',
  progressOf: 'von',
  progressOptional: '(optional)',
  progressComplete: 'Alle Angaben vollständig.',
  back: '← Zurück', pending: 'Einen Moment …', generating: 'Erzeuge PDF …', connectionError: 'Verbindungsfehler: ',
};

async function translateLabels(language) {
  if (isGerman(language)) return UI_LABELS_DE;
  try {
    const res = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: `Übersetze die Werte des folgenden JSON-Objekts (Beschriftungen für Buttons/Eingabefelder) präzise in die Sprache "${language}", behalte exakt dieselben Schlüssel. Gib AUSSCHLIESSLICH das übersetzte JSON-Objekt zurück, keinen weiteren Text. /no_think` },
          { role: 'user', content: JSON.stringify(UI_LABELS_DE) },
        ],
        max_tokens: 900, temperature: 0.1,
        ...THINKING_KWARGS,
      }),
    }, 20_000);
    if (!res.ok) return UI_LABELS_DE;
    const json = await res.json();
    const raw = (json.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return UI_LABELS_DE;
    const parsed = JSON.parse(match[0]);
    const result = { ...UI_LABELS_DE };
    for (const key of Object.keys(UI_LABELS_DE)) {
      if (typeof parsed[key] === 'string' && parsed[key].trim()) result[key] = parsed[key].trim();
    }
    return result;
  } catch {
    return UI_LABELS_DE;
  }
}

module.exports = { translateQuestion, translateLabels, DEFAULT_LANGUAGE };
