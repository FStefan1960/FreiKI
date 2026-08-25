# FreiKI – Benutzerhandbuch

> **Hinweis:** Das Erscheinungsbild (Logo, Farben, Name) kann je nach Einsatzort an das Corporate Design Ihrer Organisation angepasst sein. Welche Menüpunkte, Werkzeuge, Wissensbereiche, Extras und Konto-Einträge Sie sehen, hängt von der **Freigabe Ihres Kontos** und der **Einrichtung der jeweiligen Instanz** ab. Was in diesem Handbuch beschrieben ist, muss in Ihrer App nicht alle sichtbar sein – das ist kein Fehler.

---

## 1. Was ist FreiKI?

FreiKI ist Ihr interner KI-Assistent. Er läuft vollständig auf einem dedizierten Server Ihrer Organisation (lokales Sprachmodell auf eigener GPU). Ihre Eingaben werden nicht zum Training der KI verwendet. Kein externer Anbieter erhält Zugriff auf Chat, Wissen, Archiv oder Sprache – außer bei den bewusst gekennzeichneten Ausnahmen (Web-Recherche, Piktogramme, optionales Weiterbearbeiten von Diagrammen in draw.io, ggf. Bildgenerierung).

FreiKI ist ein Hilfsinstrument. Alle Ergebnisse müssen geprüft werden. Die Verantwortung liegt bei Ihnen.

---

## 2. Zugang und Oberfläche

FreiKI läuft im Browser – keine Installation notwendig. Unterstützte Browser: Chrome, Edge, Firefox, Safari (aktuell).

**Als App installieren (empfohlen):** FreiKI ist eine PWA. Öffnen Sie die Adresse im Browser und wählen Sie „Zum Startbildschirm hinzufügen“ (iOS/Android) bzw. das Installations-Symbol in der Adressleiste (Chrome/Edge am PC).

**Anmeldung:** Benutzername und Passwort erhalten Sie in der Regel von Ihrer Administration. Nach dem ersten Login empfehlen wir, das Passwort zu ändern (Konto-Menü → Passwort ändern).

**Zugang selbst beantragen:** Manche Instanzen bieten ein öffentliches Formular „Zugang beantragen“ (`/register.html`). Dort tragen Sie Name, Dienststelle, Funktion, Telefon und E-Mail ein. Eine Administratorin oder ein Administrator prüft die Anfrage und schaltet Sie frei – erst danach kommen die Zugangsdaten per E-Mail. Ohne Freischaltung gibt es keinen Login. Ist das Formular bei Ihnen nicht erreichbar, ist die Selbstregistrierung für diese Instanz ausgeschaltet.

- Die Sitzung gilt bis **Mitternacht (Europe/Berlin)**. Danach melden Sie sich erneut an.
- Auf der Anmeldeseite können Sie die **Oberflächensprache** wählen: Deutsch, Englisch, Französisch, Spanisch, Russisch, Indonesisch, Malagasy.
- Administratoren und Berufsgeheimnisträger (Rolle BGT) müssen **Zwei-Faktor-Authentifizierung** einrichten (Authenticator-App, Backup-Codes, optional Passkey / Face ID / Touch ID).
- Wo aktiviert, erscheint beim ersten Login eine **Datenschutz-Schulung**. Alle Folien müssen durchgeklickt werden; die Teilnahme wird dokumentiert.

**Aufbau der App:**

| Bereich | Inhalt |
|---|---|
| **Seitenleiste links** | Tabs *Werkzeuge*, *Wissen* und (falls vorhanden) *Extras* |
| **Kopfzeile** | aktuelles Werkzeug, Button **+ Neu**, Hilfe **?**, ggf. Team-Chat |
| **Chatfenster** | Verlauf, Eingabezeile, Datei-Upload |
| **Konto unten links** | Avatar/Name öffnet das Konto-Menü; daneben der Abmelden-Button |

---

## 3. Den Chat bedienen

### 3.1 Eingabe

- Text eingeben und **Enter** zum Senden (im Konto-Menü umstellbar auf „Enter = neuer Absatz“).
- **Shift+Enter** erzeugt immer einen Absatz.
- **Büroklammer:** Datei anhängen (PDF, DOCX, TXT, Bilder; je nach Werkzeug auch mehrere Dateien). Auf dem Smartphone kann der Upload die Kamera öffnen.
- **Einfügen:** Inhalt aus der Zwischenablage.
- **Mikrofon** (falls sichtbar): kurze Spracheingabe direkt in die Eingabezeile (Diktat). Lange Aufnahmen gehören ins Werkzeug *Transkription*.
- Dateien können per **Drag & Drop** ins Eingabefeld gezogen werden.

### 3.2 Verlauf

Der Chatverlauf bleibt **in Ihrem Browser** gespeichert (pro Benutzer und Werkzeug, bis zu 200 Nachrichten). Er wird nicht auf den Server synchronisiert. Nach dem Abmelden bleibt er auf diesem Gerät erhalten; auf einem anderen Gerät oder nach dem Löschen der Browserdaten ist er weg. **+ Neu** startet einen leeren Chat für das aktuelle Werkzeug.

### 3.3 Aktionen unter einer Antwort

Unter jeder Antwort finden Sie – je nach Inhalt – Schaltflächen:

- **Vorlesen (m) / Vorlesen (w)** – deutsche Stimmen Thorsten und Kerstin. Bei anderer Oberflächensprache eine passende Stimme. Erneuter Klick stoppt. Gekennzeichnet als KI-Ausgabe.
- **Kopieren** – Text in die Zwischenablage
- **Word** – Antwort als `.docx` herunterladen
- **PowerPoint** – erscheint bei gegliederten Texten (Überschriften) und erzeugt eine `.pptx`
- **Erneut senden** – dieselbe Frage noch einmal stellen
- **+ Symbole** – bei Leichter Sprache: Text experimentell mit Piktogrammen illustrieren, danach auch als Word exportierbar

**Diagramme und Formeln:** Flowcharts und Mindmaps aus dem Chat werden als Diagramm dargestellt. Klick öffnet eine Großansicht (PNG speichern oder – nach Bestätigung – in draw.io weiterbearbeiten; dabei geht der Diagramminhalt an einen externen Dienst). Mathematische Formeln werden lesbar gesetzt.

**Generierte Bilder** und Vorlesen tragen ein **KI-Kennzeichen** (EU-AI-Act-Transparenz).

---

## 4. Werkzeuge

Die Auswahl erfolgt über den Tab **Werkzeuge** in der Seitenleiste. Welche Einträge Sie sehen, richtet sich nach Ihrem Konto.

### 4.1 Chat

Freies Gespräch mit dem lokalen Sprachmodell. Geeignet für Formulieren, Kürzen, Rechnen, Checklisten, Flowcharts, erste Orientierung.

**Datei hochladen:** FreiKI liest PDF, Word, Text und Bilder (inkl. OCR) und bezieht den Inhalt in die Antwort ein.

**Wichtig:** Der Chat hat keinen Internetzugang. Kenntnisstand des Modells, kein Live-Web. Für Aktuelles nutzen Sie *Web-Recherche*.

### 4.2 Zusammenfassen / OCR

Lädt eine Datei, ein Foto oder eingefügten Text und fasst den Inhalt strukturiert zusammen.

- Formate: PDF, DOCX, TXT, Bilder (JPG, PNG, WebP), Scans
- Bei Bildern und gescannten PDFs erkennt FreiKI zuerst den Text, danach folgt die Zusammenfassung
- Schwerpunkte je nach Texttyp (z. B. Fristen und Beträge bei Bescheiden, Kernanliegen bei E-Mails)

Wählen Sie den Modus, hängen Sie die Datei an und senden Sie. Eine weitere Eingabe ist nicht nötig.

### 4.3 Übersetzen

Ein Werkzeug für alle Richtungen: Standard ist **ins Deutsche**. Eine andere Zielsprache einfach dazuschreiben oder per Beispiel-Button wählen (über 100 Sprachen). Funktioniert mit Tipptext, Datei und Foto (inkl. OCR). Stil und Struktur bleiben möglichst erhalten.

### 4.4 Wissenssuche

Eigene Einträge im Tab **Wissen** (siehe Kapitel 5). Im Werkzeuge-Tab erscheint zusätzlich oft eine übergreifende Suche über alle für Sie freigegebenen Bereiche.

### 4.5 Berichte & Dokumente

Erstellt professionelle Texte auf Basis Ihrer Angaben, z. B. Berichte, Stellungnahmen, Protokolle, Anschreiben. FreiKI fragt nach, wenn Angaben fehlen. Eine Vorlage oder Rohnotizen können Sie als Datei hochladen. Die fertige Antwort lässt sich als Word oder PowerPoint speichern.

### 4.6 MultiDoc

Analysiert und vergleicht mehrere Dokumente in einem Schritt.

- Formate: PDF, DOCX, TXT (mehrere Dateien gleichzeitig, Büroklammer oder Drag & Drop)
- Zuerst Kurzzusammenfassung je Datei, dann Gemeinsamkeiten und Unterschiede
- Anschließend konkrete Fragen zu den hochgeladenen Dateien möglich

### 4.7 Web-Recherche

Sucht aktuelle Informationen im Internet und fasst sie mit Quellen und URLs zusammen.

⚠️ **Datenschutz:** Ihre Suchanfrage wird ins Internet übertragen. **Keine personenbezogenen oder vertraulichen Daten eingeben.**

### 4.8 Leichte Sprache

Übersetzt in Leichte Sprache nach dem Regelwerk des Netzwerks Leichte Sprache (**Niveau A2**): kurze Sätze, einfache Wörter, erklärte Fachbegriffe, aktive Sprache. Ausgabe auf Deutsch, unabhängig von der Eingabesprache. Danach optional **+ Symbole** (experimentell).

### 4.9 Archiv durchsuchen

Durchsucht das interne Dokumentenarchiv (Paperless), sofern Ihre Administration den Zugriff freigeschaltet hat.

- Filter: Freitext, Korrespondent, Dokumenttyp, Tags, Datumsbereich
- Klick auf ein Ergebnis zeigt den erkannten Text – ohne extra Login ins Archiv
- Bearbeiten, Löschen oder Umschlagworten erfolgt im Archiv-System selbst, nicht in FreiKI

### 4.10 Bilder generieren

Erzeugt ein Bild aus einer Textbeschreibung (z. B. Clipart, Illustration). Je genauer die Beschreibung, desto besser das Ergebnis. Die Ausgabe ist als KI-generiert gekennzeichnet.

Je nach Instanz kann dafür ein **externer Bilddienst** genutzt werden. Keine Fotos von Personen und keine vertraulichen Inhalte als Prompt verwenden.

### 4.11 QR-Code erstellen

Macht aus Text oder einer URL einen herunterladbaren QR-Code. Geeignet für Links, WLAN-Zugangsdaten, Kontaktdaten (vCard) oder interne `APPDOC:`-Verweise auf Archivdokumente.

---

## 5. Wissensbereiche

Im Tab **Wissen** erscheinen nur Bereiche, die Ihre Administration für Sie freigegeben hat (z. B. interne Richtlinien, Fachrecht, Hilfetexte). FreiKI antwortet auf Basis der hinterlegten Dokumente und nennt die Quelle.

Beispiel: „Was muss ich tun, wenn ein Bewohner stürzt?“ → Handlungsschritte aus den hinterlegten Unterlagen mit Angabe des Dokuments.

Manager können in freigegebene Bereiche Dokumente hochladen (über die von der Administration vorgesehene Upload-Seite). Sichtbarkeit und Reihenfolge der Bereiche legt die Administration fest.

---

## 6. Scanner, Formular-Chat und Transkription

Diese drei Einträge sitzen fest unter **Werkzeuge** (eigene Bildschirmseiten, nicht der normale Chat).

### 6.1 QR-/Barcode-Scanner

Öffnet die Kamera und liest Codes. FreiKI schlägt passende Aktionen vor, zum Beispiel:

- Link öffnen
- WLAN-Daten anzeigen
- Kontakt speichern oder E-Mail starten
- **EAN/UPC:** Produktsuche inkl. Allergenen und Spuren, sofern bekannt
- **APPDOC:** öffnet das zugehörige Dokument im internen Archiv (nur mit Archivzugriff); optional den erkannten Text zum Übersetzen übernehmen

Die Kamera-Berechtigung muss der Browser erlauben.

### 6.2 Formular-Chat

Wählen Sie eine aktive Vorlage (z. B. einen Antrag) und beantworten Sie die Fragen im Dialog. Am Ende erhalten Sie das ausgefüllte Formular als **PDF** zum Drucken.

**Zwischenspeichern:** Button *Speichern* erzeugt eine achtstellige PIN. Damit setzen Sie innerhalb von **7 Tagen** unter „Bereits begonnenes Formular fortsetzen“ fort. Danach wird die Sitzung gelöscht.

Neue Vorlagen legen **Admins und Manager** unter *Formular-Vorlagen* an: Scan hochladen (PDF/JPG/PNG), Felder auf dem Scan markieren, Fragen formulieren, Haken „Formular ist aktiv“.

### 6.3 Transkription (Audio → Text per E-Mail)

Lange Aufnahmen hier hochladen. FreiKI transkribiert lokal und schickt das formatierte Transkript an Ihre hinterlegte E-Mail-Adresse. Geeignete Aufnahme-Apps: Sprachmemos (iOS/macOS), Sprachrekorder (Windows).

Kurzes Diktieren in den Chat geht über das Mikrofon in der Eingabezeile, nicht über dieses Werkzeug.

---

## 7. Extras

Der Tab **Extras** erscheint nur, wenn Ihre Instanz Zusatzangebote hinterlegt hat. Je nach Instanz zum Beispiel:

| Extra | Inhalt |
|---|---|
| **Tageslosung** | Losung, Lehrtext und Gedanke des Tages |
| **Piktogramme** | Suche in der ARASAAC-Bibliothek (über 12 000 freie Bildkarten, Lizenz CC BY-NC-SA). Die Bilder werden über FreiKI ausgeliefert. |
| **Tagesplan** | druckbarer Tagesplan mit Symbolen |
| **IT-Sicherheitslage** | aktuelle Bedrohungshinweise (sofern eingerichtet) |
| **Medienspiegel / Gesellschaftstrends** | tägliche Presseschau bzw. Trends (sofern eingerichtet) |

Manche Extras sind auf bestimmte Rollen beschränkt.

---

## 8. Team-Chat (Mattermost)

Falls eingerichtet, öffnet der **Chat**-Button in der Kopfzeile den internen Team-Chat.

> ⚠️ Melden Sie sich dort **nicht** mit E-Mail und Passwort an. Nutzen Sie den **GitLab-Button**. Dahinter steckt die Verbindung zu Ihrem FreiKI-Konto (kein separates GitLab). Nur so stimmen die Zugänge überein.

FreiKI im Kanal ansprechen:

- **`@freiki Ihre Frage`** — Antwort im Kanal, für alle sichtbar
- **`/freiki Ihre Frage`** — Antwort nur für Sie sichtbar

Durchsucht werden dieselben Wissensbereiche wie in der App. Nachrichten bleiben auf dem eigenen Server.

---

## 9. Konto-Menü

Klick auf Avatar/Name unten links. Einträge, die nur für bestimmte Rollen gelten, erscheinen bei anderen Konten nicht.

| Eintrag | Funktion |
|---|---|
| **Feedback & Wünsche** | Fehler, Idee oder Wunsch direkt aus der App senden |
| **Benutzerverwaltung** | nur Administratoren |
| **Prompts verwalten** | nur Administratoren (Werkzeugtexte und Übersetzungen) |
| **Passwort ändern** | mindestens 6 Zeichen |
| **Sicherheit: 2FA / Passkeys** | Authenticator, Backup-Codes, Face ID / Touch ID; Pflicht für Admin und BGT |
| **Antwortsprache ändern** | feste Chat-Antwortsprache (Freitext, z. B. „Englisch“, „italiano“) – unabhängig von der Oberflächensprache |
| **Enter-Verhalten** | Senden oder neuer Absatz |
| **Dunkelmodus** | An / Aus |

Abmelden: Ausgang-Button neben dem Avatar.

Die **Hilfe** (Fragezeichen oben rechts) öffnet einen kleinen Assistenten zu Bedienung und Funktionen.

Administratoren sehen zusätzlich Kennzahlen und ein Dashboard (Nutzung, Prompt-Editor). Das ist kein Endnutzer-Werkzeug.

---

## 10. Rollen und Rechte

| Rolle | Typische Rechte |
|---|---|
| **Standard** | Chat und freigegebene Werkzeuge / Wissensbereiche / Archiv |
| **Manager** | wie Standard, plus Dokumente in freigegebene Wissensbereiche laden und Formular-Vorlagen pflegen |
| **BGT** (Berufsgeheimnisträger) | wie Standard, plus Pflicht-2FA; sensible Stichworte werden kategorisiert protokolliert (ohne Inhalt, siehe Kapitel 11) |
| **Admin** | Vollzugriff: Benutzer, Bereiche, Branding, Prompts, alle Werkzeuge |

Welche Wissensbereiche und das Archiv Sie sehen, legt Ihr Konto fest. Die Sitzung endet um Mitternacht.

---

## 11. Datenschutz und Nutzungshinweise

### Kein Training, begrenztes Gedächtnis
Das Modell lernt nicht aus Ihren Eingaben. Der sichtbare Chatverlauf liegt nur im Browser dieses Geräts, nicht als vollständige Kopie auf dem Server.

### Antworten prüfen
FreiKI kann Fehler machen oder Angaben erfinden. Prüfen Sie Zahlen, Rechtsfragen, Medikation und medizinische Fakten immer selbst.

### Personenbezogene Daten
Nur so viel eingeben, wie die Aufgabe verlangt. Interne Richtlinien Ihrer Organisation gelten weiter. Web-Recherche, Bildgenerierung und draw.io sind extra zu beachten (Datenabfluss nach außen).

### Automatisierte Prüfung auf sensible Inhalte
Eingaben in Chat und Excel-Chat werden auf Stichworte geprüft (u. a. Diagnosen, Medikamente, psychische Erkrankungen, Sucht, Behinderung/Pflege). Bei einem Treffer wird **nicht** der Inhalt gespeichert, sondern nur:

| Zeitpunkt | Benutzername | Werkzeug | Kategorie |
|---|---|---|---|
| 18.08.2026, 14:32 Uhr | m.mustermann | Chat | Diagnose/Befund |

Zweck ist die Rechenschaft nach DSGVO und interner Dienstanweisung, **nicht** Leistungsbewertung. Für **BGT** ist ein Treffer im Rahmen der fachlichen Aufgabe zulässig (dokumentierte Ausnahme).

### Was lokal bleibt, was nach außen geht

| Vorgang | Wohin |
|---|---|
| Chat, Wissen, Archiv, OCR, TTS, Transkription, Formulare | eigene Infrastruktur (dieser Server) |
| Web-Recherche | Internetsuche (Anfragetext verlässt das Haus) |
| Piktogramme | Abfrage der ARASAAC-Bibliothek, Anzeige über FreiKI |
| Bilder generieren | je nach Instanz eigener oder externer Bilddienst |
| Diagramm in draw.io | nur nach Ihrer Bestätigung an diagrams.net |

---

## 12. Häufige Fragen

**Kann FreiKI meine Eingaben für Modell-Training verwenden?**  
Nein. Es gibt keine Rückkopplung an den Modellhersteller.

**Warum sehe ich bestimmte Menüpunkte, Wissensbereiche oder das Archiv nicht?**  
Freigabe und Einrichtung der Instanz. Was hier beschrieben ist, kann bei Ihnen fehlen, ohne dass etwas kaputt ist. Bei Bedarf die Administration fragen.

**Kann ich mir selbst einen Zugang einrichten?**  
Nur wenn Ihre Instanz die Selbstregistrierung anbietet. Dann ist das ein Antrag mit anschließender Freischaltung, kein sofortiger Login. Sonst vergibt die Administration die Zugangsdaten.

**Kann ich FreiKI in meiner Muttersprache nutzen?**  
Ja. Der Chat versteht und antwortet in vielen Sprachen. Zusätzlich: Oberflächensprache auf der Anmeldeseite, feste Antwortsprache im Konto-Menü.

**Was passiert mit einer Audiodatei?**  
Lange Dateien: lokale Transkription, Versand per E-Mail. Kurzes Diktat: direkt in die Eingabezeile. Beides verlässt Ihre Infrastruktur nicht.

**Ist die Archivsuche dasselbe wie das Archiv-System?**  
Nein. FreiKI zeigt Treffer und Text. Verwalten der Dokumente bleibt im Archiv (Paperless).

**Warum muss ich um Mitternacht neu anmelden?**  
Die Anmeldung ist bewusst auf den Kalendertag begrenzt.

**Ich habe den Authenticator verloren.**  
Backup-Codes aus dem 2FA-Setup verwenden oder die Administration um ein Zurücksetzen bitten (erneute Einrichtung nach Passwortbestätigung).

**Formular-PIN vergessen?**  
Ohne PIN kein Fortsetzen. Nach 7 Tagen ist die Sitzung ohnehin gelöscht – Formular neu beginnen.

---

## 13. Support

- **In der App:** Hilfe-Button **?** und *Feedback & Wünsche*
- **IT-Administration:** Login, Rechte, technische Störungen
- **Team-Chat:** falls eingerichtet, für den Austausch im Team
