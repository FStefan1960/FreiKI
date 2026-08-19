const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { config } = require('../../shared/config');

const BUILD_SCRIPT = path.join(config.APP_ROOT, 'scripts', 'build_pptx_from_template.py');

// Whitelist statt freiem Pfad vom Client - eine ungeprüfte "template"-Angabe im Request
// wäre sonst eine Path-Traversal-Einladung (siehe documentRoutes.js, das nur diese Keys
// akzeptiert). PPTX_TEMPLATE_PATH bleibt als Env-Override nutzbar, falls eine andere
// Instanz (KorKI/FrankKI) hier ihre eigene Vorlage unter demselben Key hinterlegen will.
const TEMPLATES = {
  'diakonie-kork': { label: 'Diakonie Kork', path: config.PPTX_TEMPLATE_PATH },
  'madison': { label: 'Madison', path: path.join(config.APP_ROOT, 'assets', 'pptx-templates', 'Madison.pptx') },
};

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
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}

module.exports = { buildPptxFromTemplate, TEMPLATES };
