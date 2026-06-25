# FreiKI und der EU AI Act – Einordnung

**Hinweis:** Diese Einordnung dient der Orientierung und ersetzt keine Rechtsberatung. Die endgültige Risikoeinstufung hängt vom konkreten Einsatzkontext beim Betreiber ab.

## 1. Was ist der EU AI Act?

Die EU-Verordnung über Künstliche Intelligenz (AI Act, in Kraft seit August 2024, stufenweise anwendbar bis 2027) regelt KI-Systeme risikobasiert: je höher das Risiko für Grundrechte und Sicherheit, desto strenger die Anforderungen.

## 2. Wie ist FreiKI einzuordnen?

FreiKI basiert auf einem Open-Source-Sprachmodell (General Purpose AI Model, GPAI) wie Qwen, das selbst gehostet und für allgemeine Bürokommunikation, Recherche und Wissensmanagement eingesetzt wird.

- **Als General Purpose AI Model (GPAI):** Modelle wie Qwen fallen unter die GPAI-Regeln des AI Act (Kapitel V). Diese Pflichten (technische Dokumentation, Transparenz über Trainingsdaten, Urheberrechts-Compliance) treffen in erster Linie den **Modell-Hersteller** (z. B. Alibaba/Qwen-Team), nicht den Betreiber, der das Modell lediglich selbst hostet.
- **Als Anwendung (FreiKI als Chat-/RAG-System):** In der Standardnutzung für Bürokommunikation, interne Wissenssuche, Transkription und Übersetzung fällt FreiKI in der Regel unter **kein Hochrisiko-System** im Sinne von Anhang III des AI Act. Hochrisiko-Einstufungen betreffen z. B. Systeme zur Personalauswahl, Kreditwürdigkeitsprüfung, Strafverfolgung oder kritische Infrastruktur.
- **Transparenzpflichten (Art. 50 AI Act):** Da FreiKI ein Chatbot ist, gilt die Pflicht, Nutzende erkennbar darüber zu informieren, dass sie mit einem KI-System interagieren – dies ist durch die klare Kennzeichnung als „KI-Assistent" in der Oberfläche bereits erfüllt.

## 3. Wann wird es kritischer?

Wird FreiKI in einem Anwendungsfall eingesetzt, der unter Anhang III fällt (z. B. automatisierte Entscheidungsunterstützung bei Bewerbungen, Sozialleistungen oder medizinischer Diagnostik), greifen zusätzliche Pflichten: Risikomanagement, menschliche Aufsicht, Protokollierung, Konformitätsbewertung. **In diesem Fall ist eine gesonderte Prüfung des konkreten Einsatzzwecks erforderlich.**

## 4. Vorteile der FreiKI-Architektur im Hinblick auf den AI Act

- **Volle Transparenz:** Da FreiKI auf offenen Modellen basiert und selbst gehostet wird, ist jederzeit nachvollziehbar, welches Modell mit welcher Konfiguration läuft – im Gegensatz zu proprietären Cloud-APIs.
- **Keine versteckte Weiterverarbeitung:** Eingaben werden nicht an Dritte übermittelt oder zu Trainingszwecken genutzt – das reduziert Risiken im Bereich Datenschutz, die eng mit AI-Act-Anforderungen an Datenqualität und Governance verknüpft sind.
- **Kontrolle über den Einsatzzweck:** Da der Betreiber selbst bestimmt, wofür FreiKI eingesetzt wird, liegt die Verantwortung für die korrekte Risikoeinstufung beim Betreiber – mit voller Handlungsfähigkeit, da keine Abhängigkeit von Drittanbieter-Entscheidungen besteht.

## 5. Handlungsempfehlung

1. Dokumentieren Sie die konkreten Einsatzzwecke von FreiKI in Ihrer Organisation.
2. Prüfen Sie für jeden Einsatzzweck, ob er unter Anhang III des AI Act fällt.
3. Stellen Sie sicher, dass Nutzende erkennen, dass sie mit einer KI interagieren (in FreiKI bereits gegeben).
4. Bei unklaren Fällen: Rechtliche Beratung einholen, bevor FreiKI für automatisierte Entscheidungen mit Außenwirkung eingesetzt wird.
