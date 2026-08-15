const { describe, it } = require('node:test');
const assert = require('node:assert');
const { detect, CATEGORIES } = require('../../src/core/audit/SensitivePatterns');

describe('SensitivePatterns (BGT / Berufsgeheimnisträger)', () => {
  it('sollte leere Eingaben oder Falsy-Werte mit null beantworten', () => {
    assert.strictEqual(detect(null), null);
    assert.strictEqual(detect(''), null);
    assert.strictEqual(detect(undefined), null);
  });

  it('sollte unkritische Alltagsfragen NICHT als sensibel einstufen (False-Positive-Schutz)', () => {
    const safeQueries = [
      'Wie wird das Wetter morgen in Kehl?',
      'Schreibe eine formelle Einladung zur Dienstbesprechung.',
      'Erstelle eine Tabelle mit den Öffnungszeiten der Verwaltung.',
      'Formuliere einen freundlichen Gruß zum Geburtstag.',
      'Kannst du ein Organigramm mit Mermaid erstellen?',
      'Fasse diesen Zeitungsartikel über den Neubau zusammen.'
    ];

    for (const q of safeQueries) {
      assert.strictEqual(detect(q), null, `Fehlalarm bei unkritischer Anfrage: "${q}"`);
    }
  });

  it('sollte Diagnosen und Befunde zuverlässig erkennen', () => {
    assert.strictEqual(detect('Der Arzt stellte die Diagnose gestern aus.'), 'Diagnose/Befund');
    assert.strictEqual(detect('Hier ist der aktuelle Untersuchungsbefund der Person.'), 'Diagnose/Befund');
    assert.strictEqual(detect('Das Krankheitsbild hat sich verändert.'), 'Diagnose/Befund');
    assert.strictEqual(detect('Ergebnisse der Diagnostik liegen vor.'), 'Diagnose/Befund');
  });

  it('sollte Medikation und Verordnungen erkennen', () => {
    assert.strictEqual(detect('Welche Dosierung wird für dieses Medikament empfohlen?'), 'Medikation');
    assert.strictEqual(detect('Der Wirkstoff ist im Beipackzettel beschrieben.'), 'Medikation');
    assert.strictEqual(detect('Gibt es eine ärztliche Verordnung?'), 'Medikation');
    assert.strictEqual(detect('Die Medikation muss angepasst werden.'), 'Medikation');
  });

  it('sollte psychische Erkrankungen und Krisen erkennen', () => {
    assert.strictEqual(detect('Die Person leidet unter einer schweren Depression.'), 'Psychische Erkrankung');
    assert.strictEqual(detect('Verdacht auf Schizophrenie und akute Psychose.'), 'Psychische Erkrankung');
    assert.strictEqual(detect('Diagnostizierte Angststörung und PTBS nach Trauma.'), 'Psychische Erkrankung');
    assert.strictEqual(detect('Akute Suizidgefahr gemeldet.'), 'Psychische Erkrankung');
    assert.strictEqual(detect('Hinweise auf Selbstverletzung gefunden.'), 'Psychische Erkrankung');
  });

  it('sollte Sucht- und Abhängigkeitsthemen erkennen', () => {
    assert.strictEqual(detect('Befindet sich im stationären Entzug.'), 'Sucht');
    assert.strictEqual(detect('Therapie wegen Alkoholismus und Drogenkonsum.'), 'Sucht');
    assert.strictEqual(detect('Besteht eine chronische Abhängigkeit?'), 'Sucht');
  });

  it('sollte Pflegegrade und Behinderungsgrade erkennen', () => {
    assert.strictEqual(detect('Der Antrag auf Pflegegrad 3 wurde bewilligt.'), 'Behinderung/Pflege');
    assert.strictEqual(detect('Einstufung für den Schwerbehindertenausweis.'), 'Behinderung/Pflege');
    assert.strictEqual(detect('Wie hoch ist der anerkannte Behinderungsgrad?'), 'Behinderung/Pflege');
    assert.strictEqual(detect('Feststellung des Betreuungsgrades.'), 'Behinderung/Pflege');
  });

  it('sollte Übergriffe und Missbrauch erkennen', () => {
    assert.strictEqual(detect('Es gab einen Vorwurf wegen Missbrauch im Wohnbereich.'), 'Missbrauch/Übergriff');
    assert.strictEqual(detect('Meldung über einen tätlichen Übergriff.'), 'Missbrauch/Übergriff');
  });

  it('sollte Sterbebegleitung und Palliativversorgung erkennen', () => {
    assert.strictEqual(detect('Einbindung des ambulanten Palliativdienstes.'), 'Sterbebegleitung');
    assert.strictEqual(detect('Begleitung in der Phase der Sterbebegleitung.'), 'Sterbebegleitung');
  });

  it('sollte typische ICD-10 Diagnosecodes erkennen', () => {
    assert.strictEqual(detect('Dokumentation enthält Code F20.1.'), 'ICD-10-ähnlicher Code');
    assert.strictEqual(detect('Eintrag lautet G40 und E10.9.'), 'ICD-10-ähnlicher Code');
  });
});
