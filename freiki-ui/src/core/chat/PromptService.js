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
  .forEach(file => {
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
      hint:       meta.hint       || '💡 Datei hochladen mit 📎, dann senden.',
      workspace:  meta.workspace  || null,
      websearch:  meta.websearch === 'true',
      multifile:  meta.multifile  === 'true',
      hidden:     meta.hidden     === 'true',
      paperless:  meta.paperless  === 'true',
      examples:   meta.examples ? meta.examples.split('|').map(s => s.trim()).filter(Boolean) : [],
    });

    console.log(`Prompt geladen: ${key} – ${meta.title || key}`);
  });

function isWissenMode(m) {
  return !!m.workspace || m.key.startsWith('w_');
}

function findMode(key) {
  return modesConfig.find(m => m.key === key);
}

module.exports = { systemPrompts, modesConfig, basePromptText, isWissenMode, findMode };
