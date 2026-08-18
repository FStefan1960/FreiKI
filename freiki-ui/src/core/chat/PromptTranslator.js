const { config } = require('../../shared/config');
const { fetchWithTimeout } = require('../../shared/utils/text');
const { THINKING_KWARGS } = require('./ThinkingConfig');

const LANG_NAMES = { en: 'Englisch', fr: 'Französisch', es: 'Spanisch', ru: 'Russisch', id: 'Indonesisch', mg: 'Malagasy' };

// hint-Felder enthalten oft eingebettetes SVG-Markup (Büroklammer-Icon vorm Datei-Upload-
// Hinweis). Das Modell übersetzt oder verstümmelt eingebettetes Markup gern trotz Anweisung -
// deshalb vor dem Übersetzen durch schlanke Platzhalter ersetzen und danach exakt zurücksetzen,
// statt dem Modell zu vertrauen, Tags unangetastet zu lassen.
function protectHtml(text) {
  const blocks = [];
  const protectedText = (text || '').replace(/<svg[\s\S]*?<\/svg>/g, (m) => {
    blocks.push(m);
    return `§HTML${blocks.length - 1}§`;
  });
  return { protectedText, blocks };
}
function restoreHtml(text, blocks) {
  let out = text;
  blocks.forEach((block, i) => { out = out.split(`§HTML${i}§`).join(block); });
  return out;
}

async function translateFields(de, langCode) {
  const langName = LANG_NAMES[langCode];
  if (!langName) return null;
  const { protectedText: hintProtected, blocks } = protectHtml(de.hint);
  const payload = {
    title: de.title || '',
    desc: de.desc || '',
    hint: hintProtected,
    welcome: de.welcome || '',
    examples: de.examples || [],
  };
  try {
    const r = await fetchWithTimeout(`${config.VLLM_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.VLLM_API_KEY}` },
      body: JSON.stringify({
        model: config.VLLM_MODEL,
        messages: [
          { role: 'system', content: `Du übersetzt kurze UI-Texte einer Chat-App vom Deutschen ins ${langName}. Gib NUR ein JSON-Objekt zurück mit genau den Schlüsseln title, desc, hint, welcome, examples (examples als Array in gleicher Reihenfolge und Länge wie die Eingabe). Übersetze jeden Wert natürlich und knapp, keine wörtliche Übersetzung. Platzhalter der Form §HTML0§, §HTML1§ usw. bleiben exakt unverändert stehen - niemals übersetzen, entfernen oder umformatieren. Kein Markdown, keine Erklärung, nur das rohe JSON-Objekt. /no_think` },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        max_tokens: 800,
        temperature: 0.2,
        ...THINKING_KWARGS,
      }),
    });
    const d = await r.json();
    let raw = d.choices?.[0]?.message?.content?.trim() || '';
    raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(raw);
    if (typeof parsed.title !== 'string' || typeof parsed.hint !== 'string' || !Array.isArray(parsed.examples)) return null;
    // Jeder Platzhalter muss im rohen Modell-Output noch vorhanden sein, bevor restoreHtml()
    // ihn ersetzt - sonst hat das Modell ihn verschluckt statt nur stehen zu lassen, und das
    // SVG-Markup wäre nach restoreHtml() sang- und klanglos verschwunden, ohne dass ein
    // Leftover-"§HTML"-Rest das noch anzeigen würde.
    if (!blocks.every((_, i) => parsed.hint.includes(`§HTML${i}§`))) return null;
    const hint = restoreHtml(parsed.hint, blocks);
    return {
      title: parsed.title || de.title,
      desc: typeof parsed.desc === 'string' ? parsed.desc : de.desc,
      hint,
      welcome: typeof parsed.welcome === 'string' ? parsed.welcome : de.welcome,
      examples: parsed.examples.length ? parsed.examples : de.examples,
    };
  } catch (e) {
    console.warn(`Prompt-Übersetzung (${langCode}) fehlgeschlagen:`, e.message);
    return null;
  }
}

// Übersetzt title/desc/hint/welcome/examples für mehrere Zielsprachen parallel. Fehlgeschlagene
// Sprachen fehlen im Ergebnis (statt eines Fehlers) - der Aufrufer lässt die bestehende
// Übersetzung dieser Sprache dann einfach unangetastet, statt sie mit einem Fehler zu blockieren.
async function translateAllLangs(de, langs) {
  const results = await Promise.all(langs.map(async (lang) => [lang, await translateFields(de, lang)]));
  return Object.fromEntries(results.filter(([, v]) => v !== null));
}

module.exports = { translateAllLangs };
