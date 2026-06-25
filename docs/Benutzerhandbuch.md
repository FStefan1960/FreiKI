# FreiKI – Benutzerhandbuch

## 1. Was ist FreiKI?

FreiKI ist Ihr interner KI-Assistent. Er läuft vollständig auf einem dedizierten Server Ihrer Organisation – Ihre Eingaben verlassen nie Ihre Organisation und werden nicht zum Training der KI verwendet. Kein externer Anbieter hat Zugriff auf Ihre Daten.

FreiKI besteht aus mehreren Werkzeugen, die Sie je nach Aufgabe einzeln auswählen. Die Auswahl erfolgt über die Seitenleiste links.

---

## 2. Zugang und Installation

FreiKI läuft im Browser – keine Installation notwendig. Unterstützte Browser: Chrome, Edge, Firefox, Safari (aktuell).

**Als App installieren (empfohlen):** FreiKI kann auf Smartphones, Tablets und Desktop-PCs als App installiert werden (PWA). Öffnen Sie FreiKI im Browser und wählen Sie im Browser-Menü „Zum Startbildschirm hinzufügen" (iOS/Android) bzw. das Installations-Symbol in der Adressleiste (Chrome/Edge am PC).

**Anmeldung:** Benutzername und Passwort erhalten Sie von Ihrer IT-Administration. Nach dem ersten Login empfehlen wir, das Passwort zu ändern.

---

## 3. Werkzeuge im Überblick

### 3.1 Chat

Freies Gespräch mit dem lokalen Sprachmodell. Geeignet für:
- Allgemeine Fragen und Recherchen (ohne Internet – Kenntnisstand des Modells)
- Texte formulieren, überarbeiten oder kürzen
- Einfache Berechnungen und Strukturierungsaufgaben
- Erste Orientierung bei unbekannten Themen

**Datei hochladen:** Klicken Sie auf das 📎-Symbol, um ein Dokument (PDF, DOCX, TXT, Bild) hochzuladen. FreiKI liest den Inhalt und bezieht ihn in die Antwort ein.

**Wichtig:** Der Chat hat keinen Internetzugang. Für aktuelle Informationen nutzen Sie den Modus „Web-Recherche".

---

### 3.2 Zusammenfassen / OCR

Lädt eine Datei oder ein Foto und fasst den Inhalt strukturiert zusammen.

- **Unterstützte Formate:** PDF, DOCX, TXT, Bilder (JPG, PNG), Scans
- **Texterkennung (OCR):** Bei Bildern und Scans erkennt FreiKI zunächst den Text und gibt ihn aus – danach folgt die Zusammenfassung
- **Automatische Schwerpunkte:** Bei Bewilligungsbescheiden: Betrag, Zeitraum, Bedingungen, Fristen. Bei E-Mails: Kernanliegen und Handlungsbedarf. Bei Fachartikeln: Kernaussagen und Schlussfolgerungen

**So verwenden Sie es:** Wählen Sie den Modus, klicken Sie auf 📎, laden Sie die Datei hoch und drücken Sie Senden. Eine weitere Eingabe ist nicht notwendig – FreiKI beginnt sofort mit der Zusammenfassung.

---

### 3.3 Übersetzen ins Deutsche

Übersetzt Texte aus beliebigen Sprachen ins Deutsche.

- Erkennt die Ausgangssprache automatisch
- Funktioniert mit eingetipptem Text und mit hochgeladenen Dateien oder Fotos (inkl. OCR)
- Behält Stil und Struktur des Originals bei
- Bei Fachtexten werden korrekte deutsche Fachbegriffe verwendet

**Anwendungsbeispiel:** Foto eines fremdsprachigen Beipackzettels hochladen → FreiKI erkennt den Text und liefert die deutsche Übersetzung.

---

### 3.4 Übersetzen in andere Sprachen

Übersetzt Texte vom Deutschen (oder einer anderen Sprache) in eine Zielsprache nach Wahl.

- Über 100 Sprachen verfügbar
- Text direkt eingeben oder Datei hochladen
- Wenn die Zielsprache nicht klar ist, fragt FreiKI nach

**Anwendungsbeispiel:** Einen Informationsbrief auf Arabisch oder Tagalog übersetzen, um ihn an Mitarbeitende oder Klienten mit anderen Muttersprachen weiterzugeben.

---

### 3.5 Wissenssuche (RAG)

Suche in den für Sie freigegebenen internen Wissensbereichen. FreiKI durchsucht die hinterlegten Dokumente (Richtlinien, Handbücher, Gesetze, interne Prozesse) und antwortet mit konkreter Quellenangabe.

- Nur Wissensbereiche, die Ihre Administration für Sie freigegeben hat, sind sichtbar
- FreiKI antwortet ausschließlich auf Basis der hinterlegten Dokumente – keine freien Antworten
- Quellenangabe zeigt, aus welchem Dokument/Abschnitt die Antwort stammt

**Anwendungsbeispiel:** „Was muss ich tun, wenn ein Bewohner stürzt?" → FreiKI durchsucht die internen Dienstanweisungen und zeigt die genauen Handlungsschritte mit Quellenangabe.

---

### 3.6 Berichte & Dokumente

Erstellt professionelle Dokumente auf Basis Ihrer Angaben. Geeignet für:

- Entwicklungsberichte und Förderberichte
- Arztbriefe und medizinische Zusammenfassungen
- Gutachten und Stellungnahmen
- Mitarbeiter- und Praktikantenbeurteilungen
- Verlaufsberichte und Pflegedokumentationen

**Ablauf:** FreiKI fragt zunächst nach dem Dokumenttyp (falls nicht angegeben) und dann gezielt nach den benötigten Informationen. Sie können auch eine Vorlage oder Rohnotizen als Datei hochladen.

---

### 3.7 MultiDoc – Mehrere Dokumente gleichzeitig

Analysiert und vergleicht mehrere Dokumente in einem Schritt.

- **Unterstützte Formate:** PDF, DOCX, TXT
- Lädt bis zu mehrere Dateien gleichzeitig (per 📎 oder Drag & Drop)
- Erstellt zunächst eine Kurzzusammenfassung jedes Dokuments, dann eine übergreifende Zusammenfassung mit Gemeinsamkeiten und Unterschieden
- Sie können auch konkrete Fragen zu den hochgeladenen Dokumenten stellen

**Anwendungsbeispiel:** Drei Gutachten zu einem Klienten hochladen → FreiKI liefert einen Gesamtüberblick und beantwortet Fragen wie „Welches Gutachten empfiehlt stationäre Betreuung?"

---

### 3.8 Web-Recherche

Sucht aktuelle Informationen im Internet und fasst die Ergebnisse zusammen.

⚠️ **Wichtiger Datenschutzhinweis:** Beim Einsatz dieses Werkzeugs wird Ihre Suchanfrage über die interne Metasuchmaschine (SearXNG) ins Internet übertragen. **Geben Sie keine personenbezogenen Daten ein.**

- Ergebnisse werden mit Quellenangaben und URLs geliefert
- Geeignet für aktuelle Themen, Gesetzesänderungen, Nachrichten

---

### 3.9 Leichte Sprache

Übersetzt beliebige Texte in Leichte Sprache auf Niveau B1/A2.

- Kurze Sätze, einfache Wörter, keine Abkürzungen oder Fachbegriffe ohne Erklärung
- Aktive Sprache, positive Formulierungen, Zahlen als Ziffern
- Ausgabe immer auf Deutsch, unabhängig von der Eingabesprache
- Funktioniert mit eingetipptem Text und mit hochgeladenen Dateien

**Anwendungsbeispiel:** Amtsbrief zur Betreuungsplanänderung eingeben → FreiKI erstellt eine Version, die Klienten mit kognitiven Einschränkungen selbst lesen können.

---

### 3.10 Archiv durchsuchen

Durchsucht das interne Dokumentenarchiv (Paperless-ngx) nach archivierten Dokumenten.

- **Zugriff:** Nur für Benutzer, denen diese Funktion von der Administration freigeschaltet wurde
- **Suchfilter:** Freitext, Korrespondent, Dokumenttyp, Tags, Datumsbereich
- Suchergebnisse zeigen Titel, Datum, Typ und Korrespondent
- Durch Klick auf ein Ergebnis wird der erkannte Text (OCR) direkt inline angezeigt – kein Login in Paperless notwendig

---

### 3.11 Transkription und Sprachausgabe

**Transkription (Audio → Text):** Klicken Sie auf das Mikrofon-Symbol und sprechen Sie – FreiKI wandelt die Aufnahme in Text um. Alternativ können Sie eine Audiodatei hochladen.

**Sprachausgabe (Text → Audio):** Klicken Sie auf das 🔊-Symbol neben einer Antwort, um sie vorlesen zu lassen.

Alle Audiodaten werden lokal verarbeitet – nichts wird an externe Dienste übertragen.

---

## 4. Team-Chat (Mattermost)

Unter der von Ihrer Administration bekannt gegebenen Adresse steht ein interner Team-Chat bereit (Mattermost). Sie melden sich mit denselben Zugangsdaten wie bei FreiKI an.

- **FreiKI-Bot:** Im Team-Chat ist ein FreiKI-Bot direkt ansprechbar. Er durchsucht die freigegebenen Wissensbereiche und antwortet direkt im Chat-Kanal.
- **Datenschutz:** Alle Nachrichten verbleiben auf dem eigenen Server – keine Cloud-Abhängigkeit.

---

## 5. Datenschutz und Nutzungshinweise

### Kein Gedächtnis zwischen Sitzungen
FreiKI speichert Eingaben und Antworten nicht dauerhaft. Der Chatverlauf bleibt ausschließlich in Ihrem Browser und nur für die aktuelle Sitzung erhalten. Nach dem Schließen des Tabs oder dem Abmelden ist er unwiederbringlich gelöscht.

### Antworten prüfen
Wie jedes KI-System kann FreiKI Fehler machen oder Informationen erfinden (sogenannte „Halluzinationen"). Prüfen Sie wichtige Aussagen immer – insbesondere bei Zahlen, Rechtsfragen, Medikamentendosierungen oder medizinischen Fakten. FreiKI ist ein Hilfsinstrument, kein Ersatz für menschliches Urteilsvermögen.

### Personenbezogene Daten
Beachten Sie die internen Richtlinien Ihrer Organisation. Auch wenn FreiKI die Daten nicht weitergibt, sollten Sie nicht mehr personenbezogene Informationen eingeben als für die jeweilige Aufgabe notwendig ist.

### Web-Recherche
Nur dieser Modus überträgt Anfragen ins Internet. Alle anderen Werkzeuge laufen vollständig intern.

---

## 6. Rollen und Rechte

| Rolle | Rechte |
|---|---|
| **User** | Chat, Transkription, Übersetzen, Leichte Sprache, Zusammenfassen, freigegebene Wissensbereiche, ggf. Archivsuche |
| **Manager** | Wie User + Hochladen von Dokumenten in freigegebene Wissensbereiche |
| **Admin** | Vollzugriff: Benutzerverwaltung, Wissensbereiche anlegen, Systemkonfiguration, alle Werkzeuge |

Welche Wissensbereiche und Werkzeuge Ihnen zur Verfügung stehen, richtet sich nach den Einstellungen Ihres Benutzerkontos.

---

## 7. Häufige Fragen

**Kann FreiKI meine Eingaben für Modell-Training verwenden?**
Nein. Das Modell ist statisch und lernt nicht aus Ihren Eingaben. Es gibt keine Rückkopplung an den Modellhersteller.

**Warum sehe ich bestimmte Wissensbereiche nicht?**
Wissensbereiche werden individuell für jeden Benutzer freigeschaltet. Wenden Sie sich an Ihre Administration, wenn Sie Zugriff benötigen.

**Kann ich FreiKI in meiner Muttersprache nutzen?**
Ja. FreiKI versteht und antwortet in über 100 Sprachen. Sie müssen nicht auf Deutsch schreiben.

**Was passiert, wenn ich eine Audiodatei hochlade?**
Die Datei wird lokal auf dem Server transkribiert. Sie verlässt die Infrastruktur Ihrer Organisation nicht.

**Ist die Archivsuche mit Paperless identisch?**
Nein. Die Archivsuche zeigt Suchergebnisse und OCR-Texte an, erlaubt aber kein Bearbeiten, Löschen oder Umtaggen von Dokumenten. Dafür ist Paperless direkt zuständig.

---

## 8. Support und Feedback

- **In der App:** Nutzen Sie die Feedback-Funktion (🔔- oder Feedback-Button), um Wünsche, Fehler oder Verbesserungsvorschläge direkt zu melden.
- **IT-Administration:** Bei Login-Problemen, Zugriffsfragen oder technischen Störungen wenden Sie sich an Ihre interne IT-Administration.
