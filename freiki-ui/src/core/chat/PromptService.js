const fs = require('fs');
const path = require('path');
const { config } = require('../../shared/config');
const { parseFrontmatter, toTitle } = require('../../shared/utils/text');

const systemPrompts = {};
const modesConfig = [];

// UI-Sprachen, für die title_<lang>/desc_<lang>/hint_<lang> im Frontmatter gelesen werden.
// Fehlt ein Feld für eine Sprache, greift der deutsche Standardwert (siehe localizeMode()).
const UI_LANGS = ['en', 'fr', 'es', 'ru'];

const DEFAULT_HINT_DE = '💡 Datei hochladen mit <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:-2px"><path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path><path d="M12 12v7"></path><path d="m9 16 3-3 3 3"></path></svg>, dann senden.';

function splitExamples(str) {
  return str ? str.split('|').map(s => s.trim()).filter(Boolean) : null;
}

const basePromptFile = path.join(config.PROMPT_DIR, '_base.md');
const basePromptText = fs.existsSync(basePromptFile)
  ? fs.readFileSync(basePromptFile, 'utf-8').trim() + '\n\n'
  : '';

fs.readdirSync(config.PROMPT_DIR)
  .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  .sort()
  .forEach((file, fileIndex) => {
    const key = path.basename(file, '.md');
    const raw = fs.readFileSync(path.join(config.PROMPT_DIR, file), 'utf-8');
    const { meta, body } = parseFrontmatter(raw);

    systemPrompts[key] = body;

    modesConfig.push({
      key,
      icon:       meta.icon       || '💬',
      title:      meta.title      || toTitle(key),
      desc:       meta.desc       || '',
      welcome:    meta.welcome    || 'Text eingeben oder Datei hochladen.',
      hint:       meta.hint       || DEFAULT_HINT_DE,
      // Übersetzungen aus title_en/desc_en/hint_en (usw.) fürs sprachabhängige /api/modes.
      // Fehlende Felder bleiben null - localizeMode() fällt dann automatisch auf Deutsch zurück.
      i18n: UI_LANGS.reduce((acc, lang) => {
        acc[lang] = {
          title:    meta[`title_${lang}`]    || null,
          desc:     meta[`desc_${lang}`]     || null,
          hint:     meta[`hint_${lang}`]     || null,
          welcome:  meta[`welcome_${lang}`]  || null,
          examples: splitExamples(meta[`examples_${lang}`]),
        };
        return acc;
      }, {}),
      workspace:  meta.workspace  || null,
      websearch:  meta.websearch === 'true',
      multifile:  meta.multifile  === 'true',
      hidden:     meta.hidden     === 'true',
      paperless:  meta.paperless  === 'true',
      imagegen:   meta.imagegen   === 'true',
      qrgen:      meta.qrgen      === 'true',
      examples:   meta.examples ? meta.examples.split('|').map(s => s.trim()).filter(Boolean) : [],
      // Menüreihenfolge: standardmäßig alphabetisch (Dateiname), per "order:" im Frontmatter
      // gezielt dazwischenschiebbar, ohne key/Bereichs-Zuordnung oder die Dateireihenfolge der
      // übrigen Prompts anzufassen.
      order:      meta.order !== undefined ? parseFloat(meta.order) : fileIndex,
    });

    console.log(`Prompt geladen: ${key} – ${meta.title || key}`);
  });

modesConfig.sort((a, b) => a.order - b.order);

function isWissenMode(m) {
  return !!m.workspace || m.key.startsWith('w_');
}

function findMode(key) {
  return modesConfig.find(m => m.key === key);
}

// Liefert eine Kopie von mode mit title/desc/hint in der gewünschten UI-Sprache (Fallback:
// deutscher Standardwert pro Feld, falls keine Übersetzung im Frontmatter hinterlegt ist).
// i18n-Rohdaten werden dabei aus der Antwort entfernt (nur intern gebraucht).
function localizeMode(mode, lang) {
  const { i18n, ...rest } = mode;
  if (lang === 'de' || !UI_LANGS.includes(lang)) return rest;
  const t = i18n[lang] || {};
  return {
    ...rest,
    title:    t.title    || rest.title,
    desc:     t.desc     || rest.desc,
    hint:     t.hint     || rest.hint,
    welcome:  t.welcome  || rest.welcome,
    examples: (t.examples && t.examples.length) ? t.examples : rest.examples,
  };
}

module.exports = { systemPrompts, modesConfig, basePromptText, isWissenMode, findMode, localizeMode, UI_LANGS };
