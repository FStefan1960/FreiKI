const fs = require('fs');
const path = require('path');
const { config } = require('../../shared/config');
const { parseFrontmatter, toTitle } = require('../../shared/utils/text');

const systemPrompts = {};
const modesConfig = [];

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
      hint:       meta.hint       || '💡 Datei hochladen mit <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="vertical-align:-2px"><path d="M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9z"></path><path d="M14 3v6h6"></path><path d="M12 12v7"></path><path d="m9 16 3-3 3 3"></path></svg>, dann senden.',
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

module.exports = { systemPrompts, modesConfig, basePromptText, isWissenMode, findMode };
