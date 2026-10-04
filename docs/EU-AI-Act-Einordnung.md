# FreiKI und der EU AI Act – Einordnung

**Hinweis:** Diese Einordnung dient der Orientierung und ersetzt keine Rechtsberatung. Die endgültige Risikoeinstufung hängt vom konkreten Einsatzkontext beim Betreiber ab.

## 1. Was ist der EU AI Act?

Die EU-Verordnung über Künstliche Intelligenz (AI Act, in Kraft seit August 2024, stufenweise anwendbar bis 2027) regelt KI-Systeme risikobasiert: je höher das Risiko für Grundrechte und Sicherheit, desto strenger die Anforderungen.

## 2. Wie ist FreiKI einzuordnen?

FreiKI basiert auf einem Open-Source-Sprachmodell (General Purpose AI Model, GPAI) wie Qwen, das selbst gehostet und für allgemeine Bürokommunikation, Recherche und Wissensmanagement eingesetzt wird.

- **Als General Purpose AI Model (GPAI):** Modelle wie Qwen fallen unter die GPAI-Regeln des AI Act (Kapitel V). Diese Pflichten (technische Dokumentation, Transparenz über Trainingsdaten, Urheberrechts-Compliance) treffen in erster Linie den **Modell-Hersteller** (z. B. Alibaba/Qwen-Team), nicht den Betreiber, der das Modell lediglich selbst hostet.
- **Als Anwendung (FreiKI als Chat-/RAG-System):** In der Standardnutzung für Bürokommunikation, interne Wissenssuche, Transkription und Übersetzung fällt FreiKI in der Regel unter **kein Hochrisiko-System** im Sinne von Anhang III des AI Act. Hochrisiko-Einstufungen betreffen z. B. Systeme zur Personalauswahl, Kreditwürdigkeitsprüfung, Strafverfolgung oder kritische Infrastruktur.
- **Transparenzpflichten (Art. 50 AI Act):** Da FreiKI ein Chatbot ist, gilt die Pflicht, Nutzende erkennbar darüber zu informieren, dass sie mit einem KI-System interagieren – dies ist durch die klare Kennzeichnung als „KI-Assistent" in der Oberfläche bereits erfüllt.
- **Kennzeichnung KI-erzeugter und KI-bearbeiteter Bilder (Art. 50 Abs. 2 und 4 AI Act):** Wer KI-Systeme anbietet, die synthetische Bilder erzeugen, muss die Ausgaben in maschinenlesbarer Form als künstlich erzeugt oder manipuliert kennzeichnen (Abs. 2); wer realistische Bilder veröffentlicht, die reale Personen, Orte oder Ereignisse vortäuschen (Deepfakes), muss das offenlegen (Abs. 4). Die Pflichten gelten seit 2. August 2026. Die sichtbare Kennzeichnung generierter Bilder ist seit diesem Stichtag in Betrieb (erste Umsetzung am 02.08.2026); die maschinenlesbare Herkunftsangabe und die Kennzeichnung der KI-Bildbearbeitung sind im Oktober 2026 ergänzt worden. FreiKI und KorKI kennzeichnen deshalb Bilder aus „Bilder generieren“ und „Bild mit KI bearbeiten“ auf zwei Ebenen:
  - **Maschinenlesbar, immer:** XMP-Metadaten mit der IPTC-Herkunftsangabe (`DigitalSourceType`: „von KI erzeugt“ bzw. „mit KI bearbeitet“). Sie enthalten weder Anweisung noch Nutzernamen und lassen sich mit gängigen Werkzeugen (z. B. `exiftool`) auslesen. Bei Screenshots oder Diensten, die Metadaten entfernen, gehen sie verloren.
  - **Sichtbar:** die offiziellen EU-Symbole „AI GENERATED“ bzw. „AI MODIFIED“ unten rechts im Bild. Bei der Bildbearbeitung kann das sichtbare Badge in Instanzen mit dieser Funktion (z. B. KorKI) per Checkbox abgewählt werden (Standard: aus, auf eigene Verantwortung); die maschinenlesbare Angabe bleibt in jedem Fall erhalten. Veröffentlicht eine Person ein solches Bild ohne Badge, trägt sie die Offenlegungspflicht nach Abs. 4 selbst.

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
4. Legen Sie intern fest, wann das sichtbare Badge bei der KI-Bildbearbeitung abgewählt werden darf (empfohlen: nie bei der Veröffentlichung realistischer Bilder echter Personen, Orte oder Ereignisse) und weisen Sie Nutzende darauf hin, dass KI-Bilder bei Veröffentlichung gekennzeichnet bleiben müssen.
5. Bei unklaren Fällen: Rechtliche Beratung einholen, bevor FreiKI für automatisierte Entscheidungen mit Außenwirkung eingesetzt wird.
