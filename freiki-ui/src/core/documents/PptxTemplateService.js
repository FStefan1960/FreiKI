const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const JSZip = require('jszip');
const { config } = require('../../shared/config');
const pptxTemplateRepo = require('./PptxTemplateRepository');

const BUILD_SCRIPT = path.join(config.APP_ROOT, 'scripts', 'build_pptx_from_template.py');

// Whitelist statt freiem Pfad vom Client - eine ungeprüfte "template"-Angabe im Request
// wäre sonst eine Path-Traversal-Einladung (siehe documentRoutes.js, das nur diese Keys
// akzeptiert). PPTX_TEMPLATE_PATH bleibt als Env-Override nutzbar, falls eine andere
// Instanz (KorKI/FrankKI) hier ihre eigene Vorlage unter demselben Key hinterlegen will.
// Von Admins hochgeladene Vorlagen (siehe PptxTemplateRepository.js) kommen zur Laufzeit
// per resolveTemplateEntry()/listAllTemplates() dazu, stehen NICHT fest in diesem Objekt.
const TEMPLATES = {
  'diakonie-kork': { label: 'Diakonie Kork', path: config.PPTX_TEMPLATE_PATH },
  'madison': { label: 'Madison', path: path.join(config.APP_ROOT, 'assets', 'pptx-templates', 'Madison.pptx') },
};

// Liefert {label, path} für einen Template-Key - erst die fest einprogrammierten, dann
// (falls nicht gefunden) eine per Admin-Upload registrierte Vorlage aus der DB.
async function resolveTemplateEntry(key) {
  if (TEMPLATES[key]) return TEMPLATES[key];
  const row = await pptxTemplateRepo.getTemplateByKey(key);
  if (!row) return null;
  return { label: row.label, path: path.join(config.PPTX_UPLOAD_DIR, row.filename) };
}

async function listAllTemplates() {
  const builtin = Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label }));
  const custom = (await pptxTemplateRepo.listTemplates()).map(t => ({ key: t.key, label: t.label }));
  return [...builtin, ...custom];
}

// .potx-Dateien deklarieren sich selbst als "Vorlage" statt "Präsentation" - python-pptx
// (und PowerPoint beim regulären Öffnen) akzeptiert nur Letzteres. Reines Umbenennen der
// Endung reicht nicht, der Content-Type steckt in [Content_Types].xml im Zip.
async function convertPotxToPptxBuffer(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const contentTypesPath = '[Content_Types].xml';
  const xml = await zip.file(contentTypesPath).async('string');
  const patched = xml.replace(
    'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'
  );
  zip.file(contentTypesPath, patched);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// Testet eine hochgeladene Vorlage mit einer Mini-Folie durch dieselbe Pipeline wie ein
// echter Export (siehe buildPptxFromTemplate unten) - fängt inkompatible Layouts (siehe
// find_content_layout()/find_title_only_layout() in build_pptx_from_template.py) VOR dem
// Speichern ab, statt erst beim ersten echten Nutzer-Export.
function validateTemplate(templatePath) {
  buildPptxFromTemplate(
    [{ title: 'Testfolie', body: [{ text: 'Testpunkt', bullet: true, indent: 0 }] }],
    { templatePath }
  );
}

// Reine Bridge zum Python-Skript (python-pptx kann - anders als pptxgenjs - eine echte
// .pptx-Vorlage öffnen und deren Layouts/Platzhalter/Logo/Verlauf 1:1 weiterverwenden,
// siehe build_pptx_from_template.py). Datenaustausch über Temp-Dateien statt stdin/stdout,
// weil Binärdaten über Kindprozess-Pipes in Node unnötig fehleranfällig sind.
function buildPptxFromTemplate(slides, { titleImagePath, templatePath } = {}) {
  const runId = crypto.randomUUID();
  const inPath = path.join(os.tmpdir(), `${runId}-pptx-in.json`);
  const outPath = path.join(os.tmpdir(), `${runId}-pptx-out.pptx`);

  const payload = {
    templatePath: templatePath || config.PPTX_TEMPLATE_PATH,
    slides: slides.map((s, i) => ({
      title: s.title || '',
      body: s.body || [],
      image: (i === 0 && titleImagePath) ? titleImagePath : null,
    })),
  };

  try {
    fs.writeFileSync(inPath, JSON.stringify(payload), 'utf-8');
    execFileSync(config.PYTHON_BIN, [BUILD_SCRIPT, inPath, outPath], { timeout: 30_000 });
    return fs.readFileSync(outPath);
  } catch (e) {
    // Python-Traceback auf die letzte Zeile (die eigentliche Fehlermeldung, z.B. aus
    // find_content_layout()) eindampfen - der Rest ist für Admin-Fehlermeldungen nur Rauschen.
    const stderr = e.stderr ? e.stderr.toString().trim() : '';
    const lastLine = stderr.split('\n').filter(Boolean).pop();
    throw new Error(lastLine || e.message);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}

module.exports = { buildPptxFromTemplate, TEMPLATES, resolveTemplateEntry, listAllTemplates, convertPotxToPptxBuffer, validateTemplate };
