# KorKI – Hilfe / Häufige Fragen

Stand: Benutzerhandbuch 0.7.8 (August 2026). Jeder Abschnitt ist ein eigener Hilfe-Chunk.

## Was ist KorKI?

KorKI ist Ihr interner KI-Assistent. Er läuft vollständig auf einem dedizierten Server Ihrer Organisation (lokales Sprachmodell auf eigener GPU). Ihre Eingaben werden nicht zum Training der KI verwendet. Kein externer Anbieter erhält Zugriff auf Chat, Wissen, Archiv oder Sprache – außer bei den bewusst gekennzeichneten Ausnahmen (Web-Recherche, Piktogramme, optionales Weiterbearbeiten von Diagrammen in draw.io, ggf. Bildgenerierung). KorKI ist ein Hilfsinstrument: Alle Ergebnisse müssen geprüft werden. Die Verantwortung liegt bei Ihnen.

## Warum sehe ich bestimmte Menüpunkte, Werkzeuge oder das Archiv nicht?

Das Erscheinungsbild und die sichtbaren Einträge hängen von der Freigabe Ihres Kontos und der Einrichtung der Instanz ab. Was im Handbuch beschrieben ist, muss in Ihrer App nicht alles sichtbar sein – das ist kein Fehler. Bei Bedarf die Administration fragen.

## Wie öffne ich KorKI und installiere es als App?

KorKI läuft im Browser – keine Installation notwendig. Unterstützte Browser: Chrome, Edge, Firefox, Safari (aktuell). Als App installieren (PWA, empfohlen): Adresse im Browser öffnen und „Zum Startbildschirm hinzufügen“ (iOS/Android) bzw. das Installations-Symbol in der Adressleiste wählen (Chrome/Edge am PC).

## Wie melde ich mich an und ändere ich das Passwort?

Benutzername und Passwort erhalten Sie in der Regel von Ihrer Administration. Nach dem ersten Login empfehlen wir, das Passwort zu ändern: Konto-Menü unten links (Avatar/Name) → Passwort ändern. Mindestlänge 6 Zeichen. Abmelden: Ausgang-Button neben dem Avatar.

## Wie bekomme ich einen Zugang (Account)?

Neue Nutzerinnen und Nutzer können einen Account bekommen, wenn sie sich an admin@diakonie-kork-ki.de wenden. Manche Instanzen bieten zusätzlich ein öffentliches Formular „Zugang beantragen“ (/register.html). Dort ist das ein Antrag mit anschließender Freischaltung, kein sofortiger Login. Ohne Freischaltung gibt es keinen Login.

## Warum muss ich um Mitternacht neu anmelden?

Die Sitzung gilt bis Mitternacht (Europe/Berlin). Die Anmeldung ist bewusst auf den Kalendertag begrenzt. Danach melden Sie sich erneut an.

## Kann ich die Oberfläche in einer anderen Sprache nutzen?

Ja. Auf der Anmeldeseite können Sie die Oberflächensprache wählen: Deutsch, Englisch, Französisch, Spanisch, Russisch, Indonesisch, Malagasy. Zusätzlich können Sie im Konto-Menü eine feste Chat-Antwortsprache setzen (Freitext, z. B. „Englisch“, „italiano“) – unabhängig von der Oberflächensprache. Der Chat versteht und antwortet in vielen Sprachen.

## Was ist Zwei-Faktor-Authentifizierung (2FA) und was sind Passkeys?

Administratoren und Berufsgeheimnisträger (Rolle BGT) müssen Zwei-Faktor-Authentifizierung einrichten: Authenticator-App, Backup-Codes, optional Passkey / Face ID / Touch ID. Einrichtung im Konto-Menü unter „Sicherheit: 2FA / Passkeys“. Statt Passwort oder TOTP-Code können Sie sich danach per Face ID, Touch ID oder Windows Hello anmelden.

## Ich habe den Authenticator verloren – was tun?

Backup-Codes aus dem 2FA-Setup verwenden oder die Administration um ein Zurücksetzen bitten (erneute Einrichtung nach Passwortbestätigung).

## Was ist die Datenschutz-Schulung beim ersten Login?

Wo aktiviert, erscheint beim ersten Login eine Datenschutz-Schulung. Alle Folien müssen durchgeklickt werden; die Teilnahme wird dokumentiert.

## Wie ist die App aufgebaut?

Links die Seitenleiste mit den Tabs Werkzeuge, Wissen und (falls vorhanden) Extras. Oben die Kopfzeile mit aktuellem Werkzeug, Button „+ Neu“, Hilfe „?“ und ggf. Team-Chat. In der Mitte das Chatfenster mit Verlauf, Eingabezeile und Datei-Upload. Unten links öffnet Avatar/Name das Konto-Menü; daneben der Abmelden-Button. Die Hilfe (Fragezeichen oben rechts) öffnet einen kleinen Assistenten zu Bedienung und Funktionen.

## Wie sende ich eine Nachricht im Chat?

Text eingeben und Enter zum Senden. Im Konto-Menü umstellbar auf „Enter = neuer Absatz“. Shift+Enter erzeugt immer einen Absatz. Inhalt aus der Zwischenablage über „Einfügen“. Dateien per Büroklammer anhängen oder per Drag & Drop ins Eingabefeld ziehen. Auf dem Smartphone kann der Upload die Kamera öffnen.

## Wie lade ich eine Datei hoch?

Klicken Sie im Eingabefeld auf die Büroklammer oder ziehen Sie die Datei in das Feld. Unterstützt je nach Werkzeug: PDF, DOCX, TXT, Bilder. KorKI liest den Inhalt (inkl. OCR bei Bildern) und bezieht ihn in die Antwort ein. MultiDoc erlaubt mehrere Dateien gleichzeitig.

## Wie diktiere ich Text ins Eingabefeld?

Das Mikrofon in der Eingabezeile (falls sichtbar) ist für kurze Spracheingabe / Diktat. Lange Aufnahmen gehören ins Werkzeug Transkription. Zusätzlich: auf Smartphones die Mikrofon-Funktion der Tastatur, unter Windows Windows-Taste+H, am Mac zweimal die fn-Taste.

## Wo wird der Chatverlauf gespeichert?

Der Chatverlauf bleibt in Ihrem Browser gespeichert (pro Benutzer und Werkzeug, bis zu 200 Nachrichten). Er wird nicht auf den Server synchronisiert. Nach dem Abmelden bleibt er auf diesem Gerät erhalten; auf einem anderen Gerät oder nach dem Löschen der Browserdaten ist er weg. „+ Neu“ startet einen leeren Chat für das aktuelle Werkzeug.

## Wie lasse ich mir eine Antwort vorlesen?

Unter jeder Antwort finden Sie „Vorlesen (m)“ / „Vorlesen (w)“ – deutsche Stimmen Thorsten und Kerstin. Bei anderer Oberflächensprache eine passende Stimme. Erneuter Klick stoppt. Vorlesen ist als KI-Ausgabe gekennzeichnet.

## Wie kopiere ich eine Antwort oder speichere sie als Word oder PowerPoint?

Unter jeder Antwort: „Kopieren“ übernimmt den Text in die Zwischenablage. „Word“ lädt die Antwort als .docx herunter. „PowerPoint“ erscheint bei gegliederten Texten mit Überschriften und erzeugt eine .pptx. „Erneut senden“ stellt dieselbe Frage noch einmal.

## Was bedeuten die Schaltflächen + Symbole, Diagramme und KI-Kennzeichen?

Bei Leichter Sprache: „+ Symbole“ illustriert den Text experimentell mit Piktogrammen; danach auch als Word exportierbar. Flowcharts und Mindmaps aus dem Chat werden als Diagramm dargestellt. Klick öffnet eine Großansicht (PNG speichern oder – nach Bestätigung – in draw.io weiterbearbeiten; dabei geht der Diagramminhalt an einen externen Dienst). Mathematische Formeln werden lesbar gesetzt. Generierte Bilder und Vorlesen tragen ein KI-Kennzeichen (EU-AI-Act-Transparenz).

## Wie erzeuge ich ein Ablaufdiagramm (Flowchart)?

Im Chat schreiben Sie z. B.: „Erstelle mir ein Flowchart für / mit …“. Das Diagramm wird angezeigt. Zur Weiterbearbeitung nach Bestätigung in draw.io (diagrams.net) öffnen – das überträgt den Diagramminhalt an einen externen Dienst.

## Welche Werkzeuge gibt es?

Auswahl über den Tab Werkzeuge. Sichtbar je nach Konto: Chat; Zusammenfassen/OCR; Übersetzen; Wissenssuche; Berichte & Dokumente; MultiDoc; Web-Recherche; Leichte Sprache; Archiv durchsuchen; Bilder generieren; QR-Code erstellen. Fest darunter (eigene Seiten): QR-/Barcode-Scanner, Formular-Chat, Transkription.

## Was kann das Werkzeug Chat?

Freies Gespräch mit dem lokalen Sprachmodell: Formulieren, Kürzen, Rechnen, Checklisten, Flowcharts, erste Orientierung. Datei-Upload: PDF, Word, Text und Bilder (inkl. OCR). Wichtig: Der Chat hat keinen Internetzugang. Kenntnisstand des Modells, kein Live-Web. Für Aktuelles nutzen Sie Web-Recherche.

## Wie fasse ich ein Dokument zusammen (OCR)?

Werkzeug „Zusammenfassen / OCR“: Datei, Foto oder eingefügten Text laden. Formate: PDF, DOCX, TXT, Bilder (JPG, PNG, WebP), Scans. Bei Bildern und gescannten PDFs erkennt KorKI zuerst den Text, danach folgt die Zusammenfassung. Schwerpunkte je nach Texttyp (z. B. Fristen und Beträge bei Bescheiden). Modus wählen, Datei anhängen und senden – eine weitere Eingabe ist nicht nötig.

## Wie übersetze ich einen Text?

Ein Werkzeug für alle Richtungen. Standard ist ins Deutsche. Eine andere Zielsprache einfach dazuschreiben oder per Beispiel-Button wählen (über 100 Sprachen). Funktioniert mit Tipptext, Datei und Foto (inkl. OCR). Stil und Struktur bleiben möglichst erhalten.

## Wie funktioniert die Wissenssuche?

Im Tab Wissen erscheinen nur Bereiche, die Ihre Administration für Sie freigegeben hat (z. B. interne Richtlinien). KorKI antwortet auf Basis der hinterlegten Dokumente und nennt die Quelle. Im Werkzeuge-Tab gibt es oft zusätzlich eine übergreifende Suche über alle für Sie freigegebenen Bereiche. Manager können in freigegebene Bereiche Dokumente hochladen.

## Was macht Berichte & Dokumente?

Erstellt professionelle Texte auf Basis Ihrer Angaben, z. B. Berichte, Stellungnahmen, Protokolle, Anschreiben. KorKI fragt nach, wenn Angaben fehlen. Eine Vorlage oder Rohnotizen können Sie als Datei hochladen. Die fertige Antwort lässt sich als Word oder PowerPoint speichern.

## Was ist MultiDoc?

Analysiert und vergleicht mehrere Dokumente in einem Schritt. Formate: PDF, DOCX, TXT (mehrere Dateien gleichzeitig, Büroklammer oder Drag & Drop). Zuerst Kurzzusammenfassung je Datei, dann Gemeinsamkeiten und Unterschiede. Anschließend konkrete Fragen zu den hochgeladenen Dateien möglich.

## Wie funktioniert die Web-Recherche – und was ist mit Datenschutz?

Sucht aktuelle Informationen im Internet und fasst sie mit Quellen und URLs zusammen. Datenschutz: Ihre Suchanfrage wird ins Internet übertragen. Keine personenbezogenen oder vertraulichen Daten eingeben.

## Was ist Leichte Sprache und der Symbole-Wizard?

Übersetzt in Leichte Sprache nach dem Regelwerk des Netzwerks Leichte Sprache (Niveau A2): kurze Sätze, einfache Wörter, erklärte Fachbegriffe, aktive Sprache. Ausgabe auf Deutsch, unabhängig von der Eingabesprache. Danach optional „+ Symbole“: zu jeder Zeile passende Piktogramme aus der ARASAAC-Bibliothek vorschlagen lassen (experimentell), danach auch als Word exportierbar.

## Wie durchsuche ich das Archiv (Paperless)?

Werkzeug „Archiv durchsuchen“, sofern Ihre Administration den Zugriff freigeschaltet hat. Filter: Freitext, Korrespondent, Dokumenttyp, Tags, Datumsbereich. Klick auf ein Ergebnis zeigt den erkannten Text – ohne extra Login ins Archiv. Bearbeiten, Löschen oder Umschlagworten erfolgt im Archiv-System selbst, nicht in KorKI. Die Archivsuche in KorKI ist nicht dasselbe wie das Archiv-System.

## Wie generiere ich ein Bild?

Werkzeug „Bilder generieren“: Bild aus einer Textbeschreibung (z. B. Clipart, Illustration). Je genauer die Beschreibung, desto besser. Die Ausgabe ist als KI-generiert gekennzeichnet. Je nach Instanz kann ein externer Bilddienst genutzt werden. Keine Fotos von Personen und keine vertraulichen Inhalte als Prompt verwenden.

## Wie erstelle ich einen QR-Code oder eine Visitenkarte?

Werkzeug „QR-Code erstellen“: aus Text oder URL einen herunterladbaren QR-Code. Geeignet für Links, WLAN-Zugangsdaten, Kontaktdaten (vCard) oder interne APPDOC:-Verweise auf Archivdokumente. Für die eigene Visitenkarte gibt es oft den Schnellstart „Meine Visitenkarte (editierbar)“ – füllt Name, Funktion, Telefon, E-Mail aus dem Profil.

## Was ist der QR-/Barcode-Scanner?

Öffnet die Kamera und liest QR-Codes und Barcodes. KorKI schlägt passende Aktionen vor: Link öffnen; WLAN-Daten anzeigen; Kontakt speichern oder E-Mail starten; EAN/UPC: Produktsuche inkl. Allergenen und Spuren, sofern bekannt; PZN: Suche nach dem Beipackzettel; APPDOC: öffnet das zugehörige Dokument im internen Archiv (nur mit Archivzugriff). Die Kamera-Berechtigung muss der Browser erlauben.

## Was bedeutet APPDOC auf einem QR-Code?

APPDOC:<Dokument-ID> verweist auf ein Dokument im internen Archiv und lässt sich nur innerhalb der App öffnen, nicht mit einer normalen Handy-Kamera. Passend für Aufkleber an Geräten oder Räumen (z. B. Bedienungsanleitung), ohne den Inhalt öffentlich zu machen. Erzeugen im Werkzeug „QR-Code erstellen“: APPDOC: plus Dokument-ID. Beim Scannen erscheint „Dokument öffnen“. Zugriff hängt an den Bereichsrechten des Kontos.

## Wie fülle ich ein Formular aus (Formular-Chat)?

Unter Werkzeuge „Formular-Chat“: aktive Vorlage wählen und Fragen im Dialog beantworten. Am Ende erhalten Sie das ausgefüllte Formular als PDF zum Drucken. Zwischenspeichern: Button Speichern erzeugt eine achtstellige PIN. Damit setzen Sie innerhalb von 7 Tagen unter „Bereits begonnenes Formular fortsetzen“ fort. Danach wird die Sitzung gelöscht. PIN vergessen: ohne PIN kein Fortsetzen – Formular neu beginnen.

## Wer kann Formularvorlagen anlegen?

Nur Admins und Manager unter „Formular-Vorlagen“: Scan hochladen (PDF/JPG/PNG), Felder auf dem Scan markieren (technischer Feldname, Typ Text/Zahl/Datum/Checkbox, Frage für den Chat), Haken „Formular ist aktiv“, Felder speichern. Nur aktive Vorlagen erscheinen im Formular-Chat. Alle angemeldeten Nutzer können den Formular-Chat nutzen.

## Wie transkribiere ich eine Audiodatei?

Lange Aufnahmen im Werkzeug Transkription hochladen. KorKI transkribiert lokal und schickt das formatierte Transkript an Ihre hinterlegte E-Mail-Adresse. Geeignete Aufnahme-Apps: Sprachmemos (iOS/macOS), Sprachrekorder (Windows). Kurzes Diktieren geht über das Mikrofon in der Eingabezeile, nicht über dieses Werkzeug. Beides verlässt Ihre Infrastruktur nicht.

## Welche Extras und Piktogramme gibt es?

Der Tab Extras erscheint nur, wenn Zusatzangebote hinterlegt sind. Typisch: Tageslosung; IT-Sicherheitslage; Medienspiegel; Gesellschaftstrends; Piktogramme; Tagesplan (druckbar mit Symbolen). Piktogramme: Suche in der ARASAAC-Bibliothek (über 12 000 freie Bildkarten, Lizenz CC BY-NC-SA). Die Bilder werden über KorKI ausgeliefert. Manche Extras sind auf bestimmte Rollen beschränkt.

## Was ist der Team-Chat und wie spreche ich KorKI dort an?

Falls eingerichtet, öffnet der Chat-Button in der Kopfzeile den internen Team-Chat (Mattermost). Melden Sie sich dort nicht mit E-Mail und Passwort an. Nutzen Sie den GitLab-Button – dahinter steckt die Verbindung zu Ihrem KorKI-Konto (kein separates GitLab). Ansprechen: @korki Ihre Frage (Antwort im Kanal, für alle sichtbar) oder /korki Ihre Frage (Antwort nur für Sie). Durchsucht werden dieselben Wissensbereiche wie in der App. Nachrichten bleiben auf dem eigenen Server.

## Was finde ich im Konto-Menü?

Klick auf Avatar/Name unten links. Typische Einträge: Feedback & Wünsche; Passwort ändern; Sicherheit 2FA/Passkeys; Antwortsprache ändern; Enter-Verhalten; Dunkelmodus. Nur für bestimmte Rollen: Benutzerverwaltung, Prompts verwalten (Administratoren). Administratoren sehen zusätzlich Kennzahlen und ein Dashboard – das ist kein Endnutzer-Werkzeug.

## Wie sende ich Feedback oder einen Wunsch?

Im Konto-Menü „Feedback & Wünsche“: Fehler, Idee oder Wunsch direkt aus der App senden. Support außerdem über den Hilfe-Button „?“ und bei Login-, Rechte- oder Technikproblemen über die IT-Administration.

## Welche Rollen gibt es?

Standard: Chat und freigegebene Werkzeuge / Wissensbereiche / Archiv. Manager: wie Standard, plus Dokumente in freigegebene Wissensbereiche laden und Formular-Vorlagen pflegen. BGT (Berufsgeheimnisträger): wie Standard, plus Pflicht-2FA; sensible Stichworte werden kategorisiert protokolliert (ohne Inhalt). Admin: Vollzugriff auf Benutzer, Bereiche, Branding, Prompts, alle Werkzeuge.

## Werden meine Eingaben gespeichert oder zum Training verwendet?

Nein. Das Modell lernt nicht aus Ihren Eingaben. Es gibt keine Rückkopplung an den Modellhersteller. Der sichtbare Chatverlauf liegt nur im Browser dieses Geräts, nicht als vollständige Kopie auf dem Server.

## Prüft KorKI sensible Inhalte?

Eingaben in Chat und Excel-Chat werden auf Stichworte geprüft (u. a. Diagnosen, Medikamente, psychische Erkrankungen, Sucht, Behinderung/Pflege). Bei einem Treffer wird nicht der Inhalt gespeichert, sondern nur Zeitpunkt, Benutzername, Werkzeug und Kategorie. Zweck ist die Rechenschaft nach DSGVO, nicht Leistungsbewertung. Für BGT ist ein Treffer im Rahmen der fachlichen Aufgabe zulässig.

## Was bleibt lokal, was geht nach außen?

Chat, Wissen, Archiv, OCR, Vorlesen, Transkription und Formulare: eigene Infrastruktur (dieser Server). Web-Recherche: Internetsuche, Anfragetext verlässt das Haus. Piktogramme: Abfrage der ARASAAC-Bibliothek, Anzeige über KorKI. Bilder generieren: je nach Instanz eigener oder externer Bilddienst. Diagramm in draw.io: nur nach Ihrer Bestätigung an diagrams.net.

## Eine Antwort ist falsch – was tun?

KorKI kann Fehler machen oder Angaben erfinden. Prüfen Sie Zahlen, Rechtsfragen, Medikation und medizinische Fakten immer selbst. Wichtige Aussagen immer gegen verlässliche Quellen prüfen.

## Wo bekomme ich Hilfe?

In der App: Hilfe-Button „?“ und Feedback & Wünsche. IT-Administration: Login, Rechte, technische Störungen (admin@diakonie-kork-ki.de). Team-Chat: falls eingerichtet, für den Austausch im Team.
