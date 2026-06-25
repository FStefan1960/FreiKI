# Mattermost – Benutzerhandbuch

## 1. Was ist Mattermost?

Mattermost ist der interne Team-Chat Ihrer Organisation. Er läuft vollständig auf Ihrem eigenen Server – keine Daten gehen an Slack, Microsoft oder andere Dritte. Sie melden sich mit denselben Zugangsdaten wie bei FreiKI an.

---

## 2. Grundbegriffe

| Begriff | Bedeutung |
|---|---|
| **Team** | Ihre gesamte Organisation – alle Mitglieder sind Teil desselben Teams |
| **Kanal** | Themenraum, in dem Nachrichten ausgetauscht werden |
| **Direktnachricht (DM)** | Private Nachricht an eine einzelne Person |
| **Gruppennachricht** | Private Nachricht an mehrere Personen gleichzeitig |
| **Thread** | Antwort-Kette unter einer bestimmten Nachricht |

---

## 3. Kanäle

### Kanaltypen
- **Öffentliche Kanäle** (🔓): Für alle Teammitglieder sichtbar und beitrittbar. Geeignet für abteilungsweite Themen.
- **Private Kanäle** (🔒): Nur für eingeladene Mitglieder sichtbar. Geeignet für vertrauliche Themen oder Projektgruppen.

### Kanäle finden und beitreten
Klicken Sie auf **„+"** neben „Kanäle" in der Seitenleiste → „Kanäle durchsuchen". Öffentliche Kanäle werden gelistet, Private nur nach Einladung.

### Kanal anlegen
„+" → „Neuen Kanal erstellen". Name wählen, Typ (öffentlich/privat), Mitglieder hinzufügen.

### Kanal verlassen
Rechtsklick auf den Kanal in der Seitenleiste → „Kanal verlassen".

---

## 4. Nachrichten schreiben

### Formatierung (Markdown)
Mattermost unterstützt Markdown direkt im Textfeld:

| Eingabe | Ergebnis |
|---|---|
| `**fett**` | **fett** |
| `*kursiv*` | *kursiv* |
| `` `Code` `` | `Code` |
| ` ```codeblock``` ` | Mehrzeiliger Code |
| `# Überschrift` | Überschrift |
| `- Punkt` | Aufzählung |
| `> Zitat` | Eingerücktes Zitat |

### Mentions
- `@Name` – benachrichtigt eine bestimmte Person
- `@all` – benachrichtigt alle Kanalmitglieder (sparsam verwenden)
- `@channel` – benachrichtigt alle aktiven Mitglieder des Kanals

### Emojis
`:emoji-name:` eingeben oder auf das 😊-Symbol klicken. Auf Nachrichten kann man auch mit Emojis reagieren (Hover über Nachricht → Smiley-Symbol).

### Dateien und Bilder hochladen
Auf das Büroklammer-Symbol klicken oder Datei per Drag & Drop ins Textfeld ziehen. Unterstützt alle gängigen Formate (PDF, DOCX, Bilder, etc.).

### Nachricht bearbeiten und löschen
Hover über eigene Nachricht → „…" → „Bearbeiten" oder „Löschen".

---

## 5. Threads

Antworten Sie direkt unter einer Nachricht statt im Kanal-Hauptstrom: Hover über Nachricht → „Antworten". Der Thread öffnet sich rechts als eigene Ansicht. Hält Diskussionen übersichtlich.

---

## 6. Suche

Das Lupen-Symbol oben öffnet die Suche. Mattermost durchsucht alle Nachrichten in Kanälen, denen Sie angehören.

**Suchoperatoren:**
| Operator | Funktion |
|---|---|
| `from:name` | Nachrichten von einer bestimmten Person |
| `in:kanal` | Suche nur in einem bestimmten Kanal |
| `before:2025-01-01` | Nachrichten vor einem Datum |
| `after:2025-01-01` | Nachrichten nach einem Datum |
| `"exakter Satz"` | Exakte Phrase suchen |

---

## 7. Nachrichten speichern und anpinnen

### Gespeicherte Nachrichten (Lesezeichen)
Hover über Nachricht → Lesezeichen-Symbol. Gespeicherte Nachrichten finden Sie über das Lesezeichen-Symbol oben rechts – persönliche Merkliste, nur für Sie sichtbar.

### Angepinnte Nachrichten
Hover über Nachricht → „…" → „An Kanal anpinnen". Angepinnte Nachrichten sind für alle Kanalmitglieder unter dem Pin-Symbol (oben im Kanal) sichtbar. Geeignet für wichtige Infos, die immer auffindbar sein sollen.

---

## 8. Benachrichtigungen

### Benachrichtigungseinstellungen
Profilbild oben rechts → „Profileinstellungen" → „Benachrichtigungen".

- **Desktop-Benachrichtigungen**: Browser-Popup bei neuen Nachrichten
- **E-Mail-Benachrichtigungen**: Zusammenfassung per Mail, wenn Sie offline sind (nach konfigurierbarer Zeit)
- **Schlüsselwörter**: Bestimmte Begriffe lösen immer eine Benachrichtigung aus

### Kanal-spezifische Benachrichtigungen
Klicken Sie auf den Kanalnamen oben → „Benachrichtigungseinstellungen". Hier können Sie für einzelne Kanäle stummschalten oder alle Nachrichten notifizieren lassen.

### Stummschalten
Rechtsklick auf Kanal → „Stummschalten". Der Kanal erscheint ausgegraut, Sie erhalten keine Benachrichtigungen mehr.

### Nicht stören (DND)
Klick auf Ihr Status-Symbol (grüner Punkt neben Profilbild) → „Nicht stören". Alle Benachrichtigungen werden unterdrückt – auch @Mentions.

---

## 9. Status

Klick auf das farbige Punkt-Symbol neben Ihrem Profilbild:
- 🟢 **Online** – aktiv und erreichbar
- 🟡 **Gleich zurück** – kurz abwesend
- 🔴 **Nicht stören** – keine Benachrichtigungen
- ⚪ **Offline** – nicht angemeldet

Sie können auch eine **benutzerdefinierte Status-Nachricht** setzen (z. B. „Im Urlaub bis 30.6.").

---

## 10. Slash-Befehle

Slash-Befehle werden direkt ins Textfeld eingegeben:

| Befehl | Funktion |
|---|---|
| `/away` | Status auf „Gleich zurück" setzen |
| `/dnd` | „Nicht stören" aktivieren |
| `/online` | Status auf Online setzen |
| `/msg @name Text` | Direktnachricht senden |
| `/join kanalname` | Kanal beitreten |
| `/leave` | Aktuellen Kanal verlassen |
| `/search Begriff` | Suche starten |
| `/shrug` | ¯\_(ツ)_/¯ in den Chat einfügen |

---

## 11. FreiKI-Bot

Im Team-Chat ist der FreiKI-Bot direkt erreichbar. Er durchsucht die freigegebenen Wissensbereiche und antwortet direkt im Kanal.

**Verwendung:** Schreiben Sie den Bot in einem Kanal an, in dem er Mitglied ist, oder öffnen Sie eine Direktnachricht mit ihm.

```
@FreiKI Was regelt das Wunsch- und Wahlrecht nach SGB IX?
```

Der Bot antwortet mit Quellenangabe aus der internen Wissensdatenbank. Kein Internetzugang – nur internes Wissen.

---

## 12. Mobile App

Mattermost gibt es als App für iOS und Android (kostenlos im App Store / Play Store). Nach der Installation:

1. App öffnen → „Server hinzufügen"
2. Server-URL eingeben: `https://chat.freiki.com` (bzw. KorKI-Adresse)
3. Mit Ihren normalen Zugangsdaten anmelden

Push-Benachrichtigungen funktionieren auch wenn die App im Hintergrund ist.

---

## 13. Tastaturkürzel (Desktop)

| Kürzel | Funktion |
|---|---|
| `Ctrl + K` | Kanal/Person schnell wechseln |
| `Ctrl + F` | Im aktuellen Kanal suchen |
| `↑` (leeres Feld) | Letzte eigene Nachricht bearbeiten |
| `Ctrl + Shift + M` | Erwähnungen anzeigen |
| `Ctrl + Shift + L` | Gespeicherte Nachrichten anzeigen |
| `Alt + ↑/↓` | Zwischen Kanälen wechseln |
| `Escape` | Thread oder Suchleiste schließen |

---

## 14. Datenschutz

Alle Nachrichten, Dateien und Kanäle verbleiben auf dem eigenen Server der Organisation. Kein Zugriff durch externe Anbieter. Nachrichten werden nicht automatisch gelöscht – Administratoren können Aufbewahrungszeiten konfigurieren.
