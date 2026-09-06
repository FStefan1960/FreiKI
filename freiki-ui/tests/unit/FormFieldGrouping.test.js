const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildSteps, locateStep } = require('../../src/core/forms/FormFieldGrouping');

function field(field_key, overrides = {}) {
  return { field_key, field_type: 'checkbox', question_text: 'Familienstand?', required: false, ...overrides };
}

describe('buildSteps', () => {
  it('behandelt Felder ohne group_key als eigene Schritte', () => {
    const fields = [field('vorname', { field_type: 'text' }), field('nachname', { field_type: 'text' })];
    const steps = buildSteps(fields);
    assert.strictEqual(steps.length, 2);
    assert.strictEqual(steps[0].isGroup, false);
    assert.strictEqual(steps[1].isGroup, false);
  });

  it('fasst aufeinanderfolgende Felder mit gleichem group_key zu einem Schritt zusammen', () => {
    const fields = [
      field('fs_ledig', { group_key: 'familienstand', option_value: 'ledig' }),
      field('fs_verheiratet', { group_key: 'familienstand', option_value: 'verheiratet', required: true }),
      field('fs_geschieden', { group_key: 'familienstand', option_value: 'geschieden' }),
      field('kurzarbeit', { group_key: null }),
    ];
    const steps = buildSteps(fields);
    assert.strictEqual(steps.length, 2);
    assert.strictEqual(steps[0].isGroup, true);
    assert.strictEqual(steps[0].fields.length, 3);
    assert.strictEqual(steps[1].isGroup, false);
    assert.strictEqual(steps[1].fields[0].field_key, 'kurzarbeit');
  });

  it('behandelt eine Gruppe mit nur einem Mitglied wie ein Einzelfeld', () => {
    const fields = [field('fs_ledig', { group_key: 'familienstand', option_value: 'ledig' })];
    const steps = buildSteps(fields);
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].isGroup, false);
  });

  it('trennt zwei verschiedene Gruppen ohne Feld dazwischen korrekt', () => {
    const fields = [
      field('a1', { group_key: 'a' }), field('a2', { group_key: 'a' }),
      field('b1', { group_key: 'b' }), field('b2', { group_key: 'b' }),
    ];
    const steps = buildSteps(fields);
    assert.strictEqual(steps.length, 2);
    assert.strictEqual(steps[0].fields.map(f => f.field_key).join(','), 'a1,a2');
    assert.strictEqual(steps[1].fields.map(f => f.field_key).join(','), 'b1,b2');
  });
});

describe('locateStep', () => {
  const fields = [
    field('fs_ledig', { group_key: 'familienstand', option_value: 'ledig' }),
    field('fs_verheiratet', { group_key: 'familienstand', option_value: 'verheiratet' }),
    field('kurzarbeit', { group_key: null }),
  ];

  it('findet den Gruppenschritt am Startindex der Gruppe', () => {
    const { step, stepIndex, totalSteps } = locateStep(fields, 0);
    assert.strictEqual(step.isGroup, true);
    assert.strictEqual(stepIndex, 0);
    assert.strictEqual(totalSteps, 2);
  });

  it('findet den Einzelfeld-Schritt nach der Gruppe (Index springt um die Gruppengröße)', () => {
    const { step, stepIndex } = locateStep(fields, 2);
    assert.strictEqual(step.isGroup, false);
    assert.strictEqual(step.fields[0].field_key, 'kurzarbeit');
    assert.strictEqual(stepIndex, 1);
  });

  it('liefert step:null, wenn der Index auf keinen Schrittanfang trifft (z.B. fertig)', () => {
    const { step, totalSteps } = locateStep(fields, 3);
    assert.strictEqual(step, null);
    assert.strictEqual(totalSteps, 2);
  });

  it('liefert step:null bei einem Index mitten in einer Gruppe (inkonsistenter Zustand)', () => {
    const { step } = locateStep(fields, 1);
    assert.strictEqual(step, null);
  });
});

describe('bedingte Felder (depends_on_field_key)', () => {
  const fields = [
    field('verheiratet', { field_type: 'checkbox' }),
    field('seit_wann', { field_type: 'date', depends_on_field_key: 'verheiratet' }),
    field('kinder', { field_type: 'number' }),
  ];

  it('blendet ein bedingtes Feld ohne erfüllte Bedingung aus den Schritten aus', () => {
    const steps = buildSteps(fields, {});
    assert.strictEqual(steps.length, 2);
    assert.strictEqual(steps.map((s) => s.fields[0].field_key).join(','), 'verheiratet,kinder');
  });

  it('blendet ein bedingtes Feld auch bei "nein" (nicht nur bei fehlender Antwort) aus', () => {
    const steps = buildSteps(fields, { verheiratet: 'nein' });
    assert.strictEqual(steps.length, 2);
  });

  it('zeigt das bedingte Feld, sobald die Bedingung mit "ja" erfüllt ist', () => {
    const steps = buildSteps(fields, { verheiratet: 'ja' });
    assert.strictEqual(steps.length, 3);
    assert.strictEqual(steps[1].fields[0].field_key, 'seit_wann');
  });

  it('kaskadiert: ein Feld, das von einem selbst ausgeblendeten bedingten Feld abhängt, bleibt auch ausgeblendet', () => {
    const chained = [
      field('verheiratet', { field_type: 'checkbox' }),
      field('seit_wann', { field_type: 'date', depends_on_field_key: 'verheiratet' }),
      field('ort_der_hochzeit', { field_type: 'text', depends_on_field_key: 'seit_wann' }),
    ];
    // seit_wann selbst wurde nie gefragt (verheiratet nicht "ja") -> answers enthaelt seit_wann nicht
    const steps = buildSteps(chained, {});
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].fields[0].field_key, 'verheiratet');
  });

  it('blendet eine ganze Auswahlgruppe aus, wenn alle Mitglieder dieselbe unerfuellte Bedingung haben', () => {
    const grouped = [
      field('mietet', { field_type: 'checkbox' }),
      field('vt_befristet', { group_key: 'vertragstyp', option_value: 'befristet', depends_on_field_key: 'mietet' }),
      field('vt_unbefristet', { group_key: 'vertragstyp', option_value: 'unbefristet', depends_on_field_key: 'mietet' }),
    ];
    const steps = buildSteps(grouped, {});
    assert.strictEqual(steps.length, 1);
    assert.strictEqual(steps[0].fields[0].field_key, 'mietet');
  });

  it('locateStep zaehlt Positionen im gefilterten Raum, ausgeblendete Felder werden uebersprungen', () => {
    // Position 0 = 'verheiratet', Position 1 = 'kinder' (seit_wann faellt komplett aus dem Zählraum)
    const { step, stepIndex, totalSteps } = locateStep(fields, 1, {});
    assert.strictEqual(totalSteps, 2);
    assert.strictEqual(stepIndex, 1);
    assert.strictEqual(step.fields[0].field_key, 'kinder');
  });
});
