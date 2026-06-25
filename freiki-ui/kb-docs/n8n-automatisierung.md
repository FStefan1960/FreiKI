# n8n-Automatisierung bei FreiKI – Möglichkeiten jenseits der Oberfläche

FreiKI nutzt n8n als zusätzliche Automatisierungs-Engine im Hintergrund. n8n läuft
unabhängig von der Chat-Oberfläche und kann eigene Workflows ausführen, die nicht
in der App sichtbar sind, aber auf dieselbe Infrastruktur (LLM-Backend, Postgres,
Paperless, E-Mail) zugreifen.

## Bereits umgesetztes Beispiel: Intelligenter Abwesenheitsassistent

Ein Anwender hat sich über n8n einen Abwesenheitsassistenten gebaut, der eingehende
E-Mails automatisch klassifiziert:

- Newsletter und ähnliche automatisierte Mails werden ignoriert (keine Antwort, keine Weiterleitung).
- Anfragen, die menschliche Bearbeitung brauchen, werden ans Sekretariat weitergeleitet.
- Allen anderen Absendern wird automatisch eine passende Abwesenheitsinfo geschickt.

Die Klassifizierung übernimmt das LLM-Backend, das auch für den FreiKI-Chat genutzt wird.

## Weitere Automatisierungs-Ideen für n8n

- **Posteingangs-Triage** (wie oben): IMAP-Trigger → LLM ordnet die Mail ein
  (Newsletter/Spam ignorieren, Anfrage weiterleiten, Standardantwort automatisch senden).
- **Paperless-Auto-Tagging**: Neues Dokument in Paperless-ngx löst einen Workflow aus,
  der per LLM Tags, Korrespondent und Dokumenttyp vorschlägt und automatisch setzt
  oder zur manuellen Freigabe vorlegt.
- **Automatische Wissensbereich-Pflege**: Cron-Workflow erkennt neue oder geänderte
  Dokumente in Paperless und zieht sie automatisch über den Ingest-Endpunkt
  `/api/kb-ingest-text` in die passende FreiKI-Wissensbasis nach.
- **Anfragen zu Aufgaben machen**: Eingehende Mail oder Formular-Eintrag erzeugt
  automatisch eine Aufgabe (z. B. in einer Postgres-Tabelle oder einem externen
  Tool), ergänzt um eine LLM-Zusammenfassung des Inhalts.
- **Eskalations-Workflow**: Das LLM bewertet die Dringlichkeit einer eingehenden
  Anfrage und löst bei Bedarf eine sofortige Benachrichtigung aus (z. B. Chat-Nachricht
  an eine zuständige Person), statt nur auf die normale Mail-Bearbeitung zu warten.
- **Wiederkehrende Reports**: Zeitgesteuerter Workflow erstellt z. B. wöchentlich eine
  LLM-Zusammenfassung neuer Paperless-Dokumente oder der Nutzungsstatistik und
  verschickt sie per E-Mail.
- **Sprachnachrichten-Pipeline**: Audio-Anhang oder Webhook löst Transkription per
  Whisper aus, das LLM fasst den Inhalt zusammen, das Ergebnis wird automatisch
  zurückgeschickt – ganz ohne Interaktion mit der FreiKI-Oberfläche.
- **Systemabgleich**: Neue Nutzer in der Benutzerverwaltung lösen automatisch
  Folgeaktionen aus, z. B. den Versand der Begrüßungsmail oder das Anlegen in
  weiteren Systemen.

## Warum das wichtig ist

Diese Automatisierungen laufen vollständig serverseitig über n8n und sind nicht an
die FreiKI-Chat-Oberfläche gebunden. Sie zeigen, dass FreiKI nicht nur ein Chat-Tool
ist, sondern eine Plattform, auf der sich mit n8n eigene, auf den jeweiligen Bedarf
zugeschnittene Automatisierungen bauen lassen – unter Nutzung derselben
DSGVO-/DSG-EKD-konformen, selbst gehosteten Infrastruktur.
