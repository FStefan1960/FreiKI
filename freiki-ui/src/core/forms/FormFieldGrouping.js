// Fasst aufeinanderfolgende Checkbox-Felder mit gleichem group_key zu einem gemeinsamen
// Frage-Schritt zusammen (z.B. Familienstand: ledig/verheiratet/geschieden/verwitwet als vier
// im Admin-Editor einzeln gezeichnete Checkbox-Felder mit je eigener PDF-Koordinate). Ohne
// group_key bleibt ein Feld wie bisher ein eigener Schritt. adminFormRoutes.js stellt beim
// Speichern sicher, dass Felder derselben Gruppe im fields-Array immer direkt aufeinanderfolgen -
// diese Funktion geht davon aus und muss daher nicht nach verstreuten Gruppenmitgliedern suchen.
function buildSteps(fields) {
  const steps = [];
  let i = 0;
  while (i < fields.length) {
    const key = fields[i].group_key;
    let j = i + 1;
    if (key) {
      while (j < fields.length && fields[j].group_key === key) j++;
    }
    const group = fields.slice(i, j);
    steps.push({ fields: group, isGroup: group.length > 1 });
    i = j;
  }
  return steps;
}

// current_field_index (siehe FormSessionRepository.js) zeigt immer auf den Feld-Index, an dem
// ein Schritt beginnt - formRoutes.js springt beim Beantworten/Überspringen stets um die volle
// Schrittlänge weiter, nie um ein einzelnes Gruppenmitglied. Liefert null, wenn der Index
// (z.B. nach nachträglicher Änderung der Vorlage während einer laufenden Sitzung) auf keinen
// Schrittanfang mehr trifft - der Aufrufer behandelt das wie "fertig" statt abzustürzen.
function locateStep(fields, fieldIndex) {
  const steps = buildSteps(fields);
  let pos = 0;
  for (let i = 0; i < steps.length; i++) {
    if (pos === fieldIndex) return { step: steps[i], stepIndex: i, totalSteps: steps.length };
    pos += steps[i].fields.length;
  }
  return { step: null, stepIndex: steps.length, totalSteps: steps.length };
}

module.exports = { buildSteps, locateStep };
