# FreiKI Compliance-Paket

Stand: 12.07.2026

Dieses Verzeichnis ist für die Übergabe einer FreiKI-Instanz an den jeweiligen Betreiber bestimmt.
Der Betreiber mietet oder kauft die Infrastruktur selbst und entscheidet selbst über lokalen GPU-
oder API-Betrieb. Installation, Branding und Support sind Dienstleistungen; die Rechte an den
eingebundenen Programmen richten sich weiterhin nach deren jeweiligen Lizenzen.

## Enthaltene Unterlagen

- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): Drittanbieter, Lizenzen,
  Nutzungshinweise und Quellen
- [`COMPONENT_VERSIONS.md`](COMPONENT_VERSIONS.md): produktiv festgestellte Versionen,
  Images, Digests und Quellcode-Links
- [`IMAGE_DIGESTS.txt`](IMAGE_DIGESTS.txt): kopierbare OCI-Referenzen zur eindeutigen
  Identifikation der geprüften Images
- [`NPM_DEPENDENCIES.md`](NPM_DEPENDENCIES.md): vollständige, aus `package-lock.json`
  abgeleitete Laufzeit-Abhängigkeitsliste

## Übergabecheckliste

1. Diese Unterlagen zusammen mit der Instanz übergeben.
2. Dem Betreiber Zugriff auf den FreiKI-Quellstand und die Konfigurationsvorlagen geben.
3. API-Konten, API-Schlüssel und Abrechnung direkt auf den Betreiber einrichten.
4. Container nach Möglichkeit direkt aus den offiziellen Registries beziehen lassen.
5. In der produktiven Compose-Datei die Referenzen aus `IMAGE_DIGESTS.txt` verwenden.
6. Kundenlogos nur mit dokumentierter Nutzungsberechtigung einbinden.
7. Lizenz- und Copyright-Hinweise in Drittanbieter-Oberflächen nicht entfernen.
8. Bei Änderungen an AGPL-Komponenten den geänderten korrespondierenden Quellcode
   den Netzwerknutzern kostenlos anbieten.

## Vor einer Kundenübergabe noch zu entscheiden

- **FreiKI-Eigencode:** Im Repository ist derzeit keine `LICENSE` hinterlegt. Bis zur
  Lizenzentscheidung gilt der Code nicht als Open Source. Für jede Übergabe ist daher eine
  ausdrückliche Nutzungsvereinbarung erforderlich. Vorgeschlagen ist
  `AGPL-3.0-or-later`.
- **ARASAAC:** Die Piktogramme stehen unter `CC BY-NC-SA 4.0`. Vor Einbindung in eine
  entgeltlich installierte oder vertriebsnahe Instanz ist eine schriftliche Genehmigung für
  den konkreten Einsatz einzuholen oder das Modul zu deaktivieren.
- **Ghostscript:** Das FreiKI-Image enthält derzeit Ghostscript unter AGPL. Da FreiKI
  Ghostscript nach der Codeprüfung nicht direkt nutzt, sollte das Paket vor der nächsten
  Auslieferung aus dem Image entfernt werden.

## Pflege

Die Dateien dokumentieren einen technischen Snapshot und müssen bei jedem Image- oder
Abhängigkeitsupdate neu erzeugt beziehungsweise geprüft werden. Besonders bewegliche Tags wie
`latest`, `7`, `8` oder `pg16` dürfen nicht ohne erneute Lizenzprüfung übernommen werden.

Die Original-Lizenztexte und Bedingungen der Rechteinhaber gehen dieser Zusammenfassung vor.
Dieses Paket ist eine technische Dokumentation und keine Rechtsberatung.
