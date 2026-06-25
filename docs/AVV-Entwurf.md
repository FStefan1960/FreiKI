# Auftragsverarbeitungsvertrag (AVV) – Entwurf

**Hinweis:** Dies ist eine Vorlage zur Orientierung, keine Rechtsberatung. Vor Verwendung bitte von einem Anwalt oder Datenschutzbeauftragten prüfen lassen.

zwischen

**[Name der Institution/des Kunden]**, [Anschrift]
– nachfolgend „Verantwortlicher" oder „Auftraggeber" –

und

**Frank Stefan**, Erlenweg 14, 77731 Willstätt
– nachfolgend „Auftragsverarbeiter" oder „Auftragnehmer" –

## 1. Gegenstand und Dauer des Auftrags

Der Auftragsverarbeiter erbringt für den Verantwortlichen folgende Leistungen im Zusammenhang mit dem Betrieb von FreiKI:

- Erstinstallation und Konfiguration der FreiKI-Plattform auf der vom Verantwortlichen bereitgestellten oder beauftragten Server-Infrastruktur
- Weiterentwicklung, Anpassung und Wartung des Systems
- Gestaltung und Pflege von n8n-Automatisierungs-Workflows („Agenten")
- Technischer Support bei Störungen

Der Verantwortliche bleibt **Betreiber** des Systems im Sinne der DSGVO. Eigene Hosting-Verträge (z. B. mit Hetzner, Centron o. ä.) schließt der Verantwortliche selbstständig und in eigener Verantwortung ab; dieser AVV deckt nicht das Verhältnis zum Hosting-Anbieter ab.

Die Laufzeit richtet sich nach dem zugrunde liegenden Dienstleistungsvertrag.

## 2. Art und Zweck der Verarbeitung

Der Auftragsverarbeiter erhält im Rahmen von Wartungs-, Support- und Entwicklungstätigkeiten **technischen Zugriff** auf das System (z. B. per SSH/Tailscale) und kann dabei grundsätzlich auch mit personenbezogenen Daten in Berührung kommen, die in der vom Verantwortlichen betriebenen FreiKI-Instanz verarbeitet werden (z. B. Chatverläufe im Browser-Cache, hochgeladene Dokumente in Wissensbereichen, Nutzerkonten).

Eine systematische oder dauerhafte Verarbeitung personenbezogener Daten durch den Auftragsverarbeiter ist **nicht** Gegenstand des Auftrags; der Zugriff erfolgt ausschließlich punktuell zu Wartungs- und Entwicklungszwecken.

## 3. Kategorien betroffener Personen

- Mitarbeitende des Verantwortlichen, die FreiKI nutzen
- ggf. Personen, deren Daten in hochgeladenen Dokumenten/Wissensbereichen enthalten sind

## 4. Kategorien personenbezogener Daten

- Zugangsdaten (Benutzername, E-Mail, Passwort-Hash)
- Inhalte von Chatanfragen (soweit nicht durch die im System angelegte Nicht-Speicherung ausgeschlossen)
- Dokumenteninhalte in Wissensbereichen, soweit vom Verantwortlichen dort personenbezogene Daten abgelegt werden

## 5. Pflichten des Auftragsverarbeiters

Der Auftragsverarbeiter verpflichtet sich,

- personenbezogene Daten ausschließlich im Rahmen der dokumentierten Weisungen des Verantwortlichen zu verarbeiten,
- die Vertraulichkeit zu wahren (Verpflichtung auf Vertraulichkeit gemäß Art. 28 Abs. 3 lit. b DSGVO),
- geeignete technische und organisatorische Maßnahmen (TOM, siehe Anlage) einzuhalten,
- den Verantwortlichen unverzüglich über Datenschutzverletzungen zu informieren, von denen er im Rahmen seiner Tätigkeit Kenntnis erlangt,
- nach Beendigung der Leistungen sämtliche im Rahmen der Tätigkeit ggf. erlangten Kopien personenbezogener Daten zu löschen, soweit keine gesetzliche Aufbewahrungspflicht entgegensteht,
- dem Verantwortlichen alle erforderlichen Informationen zum Nachweis der Einhaltung der Pflichten nach Art. 28 DSGVO zur Verfügung zu stellen.

## 6. Unterauftragsverarbeiter

Der Einsatz weiterer Auftragsverarbeiter (Subunternehmer) bedarf der vorherigen schriftlichen Zustimmung des Verantwortlichen. Aktuell werden keine Subunternehmer eingesetzt.

## 7. Technische und organisatorische Maßnahmen (TOM)

Siehe gesonderte Anlage „TOM-Übersicht" (Verschlüsselung der Verbindung via TLS, Zugriffsbeschränkung per VPN/Tailscale, Trennung von Secrets in `.env`-Dateien, rollenbasierte Zugriffsrechte in FreiKI).

## 8. Kontrollrechte des Verantwortlichen

Der Verantwortliche ist berechtigt, sich von der Einhaltung der vereinbarten Pflichten in geeigneter Form (z. B. Auskunft, Dokumentation) zu überzeugen.

## 9. Schlussbestimmungen

Sollten einzelne Bestimmungen dieses Vertrags unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.

---

Ort, Datum: ______________________

Verantwortlicher: ______________________

Auftragsverarbeiter (Frank Stefan): ______________________
