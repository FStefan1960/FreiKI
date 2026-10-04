const express = require('express');
const fs = require('fs');
const path = require('path');
const { config } = require('../../../../shared/config');
const prompts = require('../../../../core/chat/PromptService');
const { translateAllLangs } = require('../../../../core/chat/PromptTranslator');
const auditLog = require('../../../../core/audit/AdminAuditRepository');
const kbAreas = require('../../../../core/knowledge/KBAreaRepository');
const { parseFrontmatter, normArea } = require('../../../../shared/utils/text');

const router = express.Router();

router.get('/api/admin/areas', (req, res) => {
  // group/groupLabel (aus areas.json) sind optional - nur gesetzt, wenn der Bereich einer
  // übergeordneten Kategorie zugeordnet ist (z.B. AWS/AD/ID/Rufbereitschaft → OH). Erlaubt
  // der Rechte-/Upload-UI, Unterkategorien gruppiert darzustellen.
  res.json(prompts.modesConfig.filter(prompts.isWissenMode).map(m => {
    const group = kbAreas.getGroup(normArea(m.key));
    return group
      ? { key: m.key, title: m.title, group, groupLabel: kbAreas.getLabel(group) }
      : { key: m.key, title: m.title };
  }));
});

// ── Prompt-Editor: Werkzeug-Prompts (prompts/*.md) direkt in der App bearbeiten statt per
// SSH. Nur ein Teil des Frontmatters ist editierbar (PROMPT_META_FIELDS) - Sprachvarianten
// (title_en, hint_fr, ...) bleiben beim Speichern unangetastet, da sie beim Merge mit dem
// vorher eingelesenen existingMeta erhalten bleiben. reloadPrompts() macht Änderungen sofort
// live, ohne Container-Neustart (siehe PromptService.js).
const PROMPT_META_FIELDS = ['icon', 'title', 'desc', 'welcome', 'hint', 'workspace', 'order', 'websearch', 'multifile', 'hidden', 'paperless', 'imagegen', 'musicgen', 'qrgen', 'examples'];
const PROMPT_BOOL_FIELDS = ['websearch', 'multifile', 'hidden', 'paperless', 'imagegen', 'musicgen', 'qrgen'];

function promptFilePath(key) {
  if (!/^[a-zA-Z0-9_]+$/.test(key || '')) return null;
  const file = key === '_base' ? '_base.md' : `${key}.md`;
  const full = path.join(config.PROMPT_DIR, file);
  // Directory-Traversal-Schutz: Ergebnis muss weiterhin direkt im PROMPT_DIR liegen.
  if (path.dirname(full) !== path.resolve(config.PROMPT_DIR)) return null;
  return full;
}

router.get('/api/admin/prompts', (req, res) => {
  const list = [...prompts.modesConfig]
    .sort((a, b) => a.order - b.order)
    .map(m => ({ key: m.key, icon: m.icon, title: m.title, desc: m.desc, hidden: m.hidden }));
  res.json({ hasBase: fs.existsSync(path.join(config.PROMPT_DIR, '_base.md')), prompts: list });
});

router.get('/api/admin/prompts/:key', (req, res) => {
  const file = promptFilePath(req.params.key);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Prompt nicht gefunden' });
  const raw = fs.readFileSync(file, 'utf-8');
  if (req.params.key === '_base') return res.json({ key: '_base', meta: null, body: raw.trim() });
  const { meta, body } = parseFrontmatter(raw);
  res.json({ key: req.params.key, meta, body });
});

router.put('/api/admin/prompts/:key', async (req, res) => {
  const file = promptFilePath(req.params.key);
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Prompt nicht gefunden' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'System-Prompt darf nicht leer sein' });

  try {
    if (req.params.key === '_base') {
      fs.writeFileSync(file, body + '\n');
    } else {
      const raw = fs.readFileSync(file, 'utf-8');
      const { meta: existingMeta } = parseFrontmatter(raw);
      const incoming = req.body.meta || {};
      const merged = { ...existingMeta };
      let deExamples = existingMeta.examples ? existingMeta.examples.split('|').map(s => s.trim()).filter(Boolean) : [];

      for (const field of PROMPT_META_FIELDS) {
        if (!(field in incoming)) continue;
        const val = incoming[field];
        if (PROMPT_BOOL_FIELDS.includes(field)) {
          if (val) merged[field] = 'true'; else delete merged[field];
        } else if (field === 'examples') {
          const list = Array.isArray(val) ? val.map(s => String(s).replace(/[\r\n]+/g, ' ').trim()).filter(Boolean) : [];
          deExamples = list;
          if (list.length) merged[field] = list.join(' | '); else delete merged[field];
        } else {
          const s = String(val ?? '').replace(/[\r\n]+/g, ' ').trim();
          if (s) merged[field] = s; else delete merged[field];
        }
      }

      // Übersetzungen (title_en, hint_fr, ...) automatisch aus dem aktuellen deutschen Stand
      // per LLM nachziehen, damit sie nach einer Bearbeitung nicht veraltet stehen bleiben.
      // Schlägt eine Sprache fehl (LLM nicht erreichbar, kaputtes JSON), bleibt ihre bisherige
      // Übersetzung unangetastet statt das Speichern zu blockieren (siehe PromptTranslator.js).
      const deFields = { title: merged.title || '', desc: merged.desc || '', hint: merged.hint || '', welcome: merged.welcome || '', examples: deExamples };
      const translations = await translateAllLangs(deFields, prompts.UI_LANGS);
      for (const lang of prompts.UI_LANGS) {
        const t = translations[lang];
        if (!t) continue;
        merged[`title_${lang}`] = t.title;
        merged[`desc_${lang}`] = t.desc;
        merged[`hint_${lang}`] = t.hint;
        merged[`welcome_${lang}`] = t.welcome;
        if (t.examples.length) merged[`examples_${lang}`] = t.examples.join(' | ');
      }

      const frontmatter = Object.entries(merged).map(([k, v]) => `${k}: ${v}`).join('\n');
      fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}\n`);
    }
    prompts.reloadPrompts();
    auditLog.log(req.admin, 'prompt.update', { username: req.params.key });
    res.json({ ok: true });
  } catch (e) {
    console.error('Prompt-Speichern fehlgeschlagen:', e.message);
    res.status(500).json({ error: 'Speichern fehlgeschlagen' });
  }
});

module.exports = router;
