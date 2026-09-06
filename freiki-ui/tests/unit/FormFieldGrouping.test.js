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
