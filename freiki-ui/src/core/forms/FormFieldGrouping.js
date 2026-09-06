// Blendet Felder aus, deren depends_on_field_key gesetzt ist und deren Bedingung (noch) nicht
// erfüllt ist (z.B. "Seit wann verheiratet?" nur wenn die Checkbox "verheiratet" mit "ja"
// beantwortet wurde) - answers enthält nur bereits beantwortete field_keys, ein noch unbeantwortetes
// oder mit "nein"/übersprungenes Bedingungsfeld führt daher automatisch zum Ausblenden. Da
// adminFormRoutes.js erzwingt, dass die Bedingung immer auf ein vorheriges Feld zeigt, ist deren
// Antwort an dieser Stelle im Gespräch bereits bekannt (oder das Bedingungsfeld wurde selbst schon
// ausgeblendet, was hier kaskadiert - Folgefragen einer nie gestellten Bedingung entfallen dann mit).
function applicableFields(fields, answers) {
  return fields.filter((f) => !f.depends_on_field_key || answers[f.depends_on_field_key] === 'ja');
}

// Fasst aufeinanderfolgende Checkbox-Felder mit gleichem group_key zu einem gemeinsamen
// Frage-Schritt zusammen (z.B. Familienstand: ledig/verheiratet/geschieden/verwitwet als vier
// im Admin-Editor einzeln gezeichnete Checkbox-Felder mit je eigener PDF-Koordinate). Ohne
// group_key bleibt ein Feld wie bisher ein eigener Schritt. adminFormRoutes.js stellt beim
// Speichern sicher, dass Felder derselben Gruppe im fields-Array immer direkt aufeinanderfolgen -
// diese Funktion geht davon aus und muss daher nicht nach verstreuten Gruppenmitgliedern suchen
// (die Bedingungsfilterung oben erhält die Reihenfolge, Gruppenmitglieder bleiben also auch nach
// dem Filtern zueinander benachbart, auch wenn einzelne Mitglieder herausgefiltert werden).
function buildSteps(fields, answers = {}) {
  const applicable = applicableFields(fields, answers);
  const steps = [];
  let i = 0;
  while (i < applicable.length) {
    const key = applicable[i].group_key;
    let j = i + 1;
    if (key) {
      while (j < applicable.length && applicable[j].group_key === key) j++;
    }
    const group = applicable.slice(i, j);
    steps.push({ fields: group, isGroup: group.length > 1 });
    i = j;
  }
  return steps;
}

// current_field_index (siehe FormSessionRepository.js) zeigt immer auf den Schritt-Index
// innerhalb von buildSteps(fields, answers) - ein reiner Zähler ohne Bezug zu Array-Positionen
// in fields, da bedingte Felder ohne erfüllte Bedingung aus dem Zählraum herausfallen (siehe
// applicableFields). Das bleibt in sich konsistent, weil eine Bedingung immer auf ein vorheriges
// Feld zeigt: dessen Antwort steht schon fest, wenn der Zähler diese Stelle erreicht, und ändert
// sich danach nicht mehr. formRoutes.js springt beim Beantworten/Überspringen stets um die volle
// Schrittlänge weiter, nie um ein einzelnes Gruppenmitglied. Liefert null, wenn der Index
// (z.B. nach nachträglicher Änderung der Vorlage während einer laufenden Sitzung) auf keinen
// Schrittanfang mehr trifft - der Aufrufer behandelt das wie "fertig" statt abzustürzen.
function locateStep(fields, fieldIndex, answers = {}) {
  const steps = buildSteps(fields, answers);
  let pos = 0;
  for (let i = 0; i < steps.length; i++) {
    if (pos === fieldIndex) return { step: steps[i], stepIndex: i, totalSteps: steps.length };
    pos += steps[i].fields.length;
  }
  return { step: null, stepIndex: steps.length, totalSteps: steps.length };
}

module.exports = { buildSteps, locateStep };
