// Sprachanweisung, wenn der Nutzer eine andere Sprache als Deutsch eingestellt hat
// (freiki_users.language, per Admin gepflegt).
// - leichte_sprache: Zielsprache ist im Prompt fest verdrahtet (immer Deutsch) - da gibt's
//   nichts zu überschreiben.
// - 3translate: Zielsprache kommt vom Nutzer selbst in der Nachricht ("Übersetze ins
//   Französische: ...", siehe 3translate.md), nur bei fehlender Angabe fällt der Prompt auf
//   Deutsch zurück. Eine harte "antworte IMMER auf X"-Anweisung würde eine explizite Angabe im
//   Chat überstimmen und die Kernfunktion des Modus kaputt machen - hier deshalb eine weichere
//   Anweisung, die nur den Deutsch-Fallback durch die Profilsprache ersetzt.
const FIXED_GERMAN_MODES = ['leichte_sprache', '4leichte_sprache'];
const DEFAULT_LANGUAGE_MODES = ['3translate'];

function languageInstruction(userLanguage, mode) {
  const lang = (userLanguage || '').trim();
  if (!lang || lang.toLowerCase() === 'de' || lang.toLowerCase() === 'deutsch') return '';
  if (FIXED_GERMAN_MODES.includes(mode)) return '';
  if (DEFAULT_LANGUAGE_MODES.includes(mode)) {
    return `SPRACHANWEISUNG MIT HÖCHSTER PRIORITÄT: Wenn der Nutzer in seiner Nachricht keine Zielsprache nennt, übersetze nach ${lang} statt ins Deutsche. Nennt der Nutzer explizit eine andere Zielsprache, hat diese Vorrang vor dieser Anweisung.`;
  }
  return `SPRACHANWEISUNG MIT HÖCHSTER PRIORITÄT: Formuliere deinen gesamten Fließtext ab jetzt auf ${lang}, auch wenn eine frühere Anweisung Deutsch verlangt. Das betrifft ausschließlich die Sprache deines Fließtexts - deine sonstigen Fähigkeiten und Ausgabeformate (z.B. Mermaid-Diagramme, Codeblöcke, Tabellen) bleiben unverändert nutzbar. Technische Syntax-Elemente wie \`\`\`mermaid, graph TD, mindmap, Node-IDs und Pfeile schreibst du weiterhin exakt wie von Mermaid.js verlangt (nicht übersetzt), nur die Node-/Kantentexte selbst auf ${lang}.`;
}

// Fast jeder Modus-Prompt enthält selbst "Schreibe immer auf Deutsch" (siehe z.B. 0chat.md,
// 5berichte.md, w_*.md). Ein bloß an den Systemprompt angehängter Override verliert im Test
// zuverlässig gegen diese Anweisung (nur eine Signaturzeile wurde übersetzt, der Rest blieb
// Deutsch) - siehe project_freiki_sprache_feld_2026-08-10 in den Memories für die Testreihe.
// Eine zusätzliche role:'system'-Nachricht vor der letzten User-Message (frühere Version) verletzt
// bei vorhandenem Chatverlauf Qwens Vorgabe "System message must be at the beginning" (vLLM
// antwortet dann mit HTTP 400, das Frontend zeigt fälschlich "Anfrage zu lang") - stattdessen wird
// die Anweisung direkt in die letzte User-Message eingebettet (gleiche Zuverlässigkeit im Test,
// aber schema-konform, da sich Anzahl/Rollen der Messages nicht ändern).
function withLanguageMessage(messages, userLanguage, mode) {
  const instruction = languageInstruction(userLanguage, mode);
  if (!instruction) return messages;
  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  const wrapped = { ...last, content: `${instruction}\n\n---\n\n${last.content}` };
  return [...messages.slice(0, lastIdx), wrapped];
}

module.exports = { withLanguageMessage };
