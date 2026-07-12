# Drittanbieterhinweise für FreiKI

Stand: 12.07.2026

FreiKI verbindet eigenständige Programme, Bibliotheken, Modelle, Schriften und externe Dienste.
Die jeweiligen Rechteinhaber behalten sämtliche Rechte, die nicht ausdrücklich durch die
genannte Lizenz eingeräumt werden. Die Nennung eines Projekts bedeutet keine Partnerschaft,
Zertifizierung oder Empfehlung von FreiKI durch dessen Rechteinhaber.

Die vollständigen Versions-, Image-, Digest- und Quellenangaben stehen in
[`COMPONENT_VERSIONS.md`](COMPONENT_VERSIONS.md). Die Original-Lizenztexte in den verlinkten
Quellständen und Containerimages sind verbindlich und müssen bei einer Weitergabe erhalten
bleiben.

## FreiKI-Eigencode

Der FreiKI-Eigencode steht unter der **GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later)**. Der vollständige Lizenztext ist in der [`LICENSE`](../LICENSE)
im Repository-Root enthalten. Der korrespondierende Quellcode ist im öffentlichen
GitHub-Repository unter <https://github.com/FStefan1960/FreiKI> verfügbar.

Wer eine modifizierte FreiKI-Version über ein Netzwerk betreibt, muss den jeweiligen
Netzwerknutzern gemäß Abschnitt 13 AGPLv3 den korrespondierenden Quellcode dieser
betriebenen Version anbieten. Installation, Branding, Hosting und Support können
unabhängig davon als Dienstleistungen angeboten werden.

## Containerisierte Hauptkomponenten

| Komponente | Lizenzstatus | wesentlicher Hinweis |
|---|---|---|
| Caddy | Apache-2.0 | Lizenz- und gegebenenfalls NOTICE-Hinweise erhalten |
| Mattermost Team Edition | offizielles Binary unter MIT; Quellcode/Forks teilweise AGPL | Mattermost-Marken und Plugin-Lizenzen separat beachten |
| n8n | Sustainable Use License; Enterprise-Dateien separat | interne Nutzung sowie Installation und Support erlaubt; kein White-Label-, Embed- oder n8n-as-a-Service-Angebot ohne passenden Vertrag |
| Paperless-ngx | GPL-3.0 | bei Image-Weitergabe Lizenz und korrespondierenden Quellcodezugang bereitstellen |
| Redis 7.4.9 | RSALv2 oder SSPLv1 | source-available, nicht OSI-Open-Source; nur als internes Backend eingesetzt |
| SearXNG | AGPL-3.0-or-later | bei Änderungen am Netzwerkdienst korrespondierenden Quellcode für Netzwerknutzer anbieten |
| openedai-speech | AGPL-3.0 | bei Änderungen am Netzwerkdienst korrespondierenden Quellcode für Netzwerknutzer anbieten |
| Whisper ASR Webservice | MIT | Copyright- und Lizenzhinweise bei Weitergabe erhalten |
| Gotenberg | MIT | enthaltene Chromium-, LibreOffice- und PDF-Komponenten haben eigene Lizenzen |
| Apache Tika | Apache-2.0 | Apache-Lizenz und Upstream-NOTICE mitliefern |
| Swagger UI | Apache-2.0 | Apache-Lizenz und Upstream-NOTICE mitliefern |
| Uptime Kuma | MIT | Copyright- und Lizenzhinweise bei Weitergabe erhalten |
| Dozzle | MIT | Copyright- und Lizenzhinweise bei Weitergabe erhalten |
| docker-mailserver | Integrationscode MIT | Postfix, Dovecot, Rspamd, ClamAV und weitere enthaltene Dienste separat lizenziert |
| PostgreSQL und pgvector | PostgreSQL License | Copyright- und Lizenzhinweise bei Weitergabe erhalten |
| Portainer CE | Zlib | Copyright-Hinweis erhalten; geänderte Fassungen als geändert kennzeichnen |

Die offiziellen Images sollen vom Betreiber direkt aus den jeweiligen Registries bezogen
werden. Werden Images exportiert, gespiegelt oder anderweitig durch den Installationsdienstleister
weitergegeben, müssen auch sämtliche Lizenz- und Source-Pflichten der enthaltenen Image-Layer
erfüllt werden.

## FreiKI-Node-Anwendung

Die Node-Laufzeitabhängigkeiten sind überwiegend unter MIT, ISC, BSD oder Apache-2.0
lizenziert. Die vollständige Liste mit den im Lockfile festgelegten Versionen steht in
[`NPM_DEPENDENCIES.md`](NPM_DEPENDENCIES.md).

Besonders zu beachten:

- `mammoth` steht unter BSD-2-Clause.
- `jszip` kann nach Wahl unter MIT oder GPL-3.0-or-later genutzt werden; FreiKI nutzt den
  MIT-Lizenzweg.
- `pako` steht unter MIT und Zlib.
- `nodemailer` steht unter MIT-0.
- Für `busboy`, `streamsearch` und `thirty-two` enthält das Lockfile kein Lizenzfeld.
  Die Upstream-Pakete müssen deshalb bei jedem Release zusätzlich anhand ihres mitgelieferten
  Lizenztexts geprüft werden.

Für alle MIT-/BSD-/ISC-Abhängigkeiten müssen die jeweiligen Copyright- und Lizenzhinweise
in Kopien beziehungsweise wesentlichen Teilen erhalten bleiben. `package-lock.json` allein
ersetzt diese Hinweise nicht.

## Direkt an Browser ausgelieferte Bibliotheken und Schriften

### marked 9.1.6

- Copyright: 2011–2023 Christopher Jeffrey
- Lizenz: MIT
- Quelle: <https://github.com/markedjs/marked/tree/9.1.6>
- Der Copyright- und MIT-Hinweis ist im ausgelieferten `marked.min.js` erhalten.

### DOMPurify 3.2.6

- Copyright: Cure53 und weitere Beitragende
- Lizenzwahl: Apache License 2.0 oder Mozilla Public License 2.0
- Quelle: <https://github.com/cure53/DOMPurify/tree/3.2.6>
- Der Lizenzheader ist im ausgelieferten `purify.min.js` erhalten. Für FreiKI wird der
  Apache-2.0-Lizenzweg dokumentiert.

### Hanken Grotesk

- Copyright: 2021 The Hanken Grotesk Project Authors
- Lizenz: SIL Open Font License 1.1
- Quelle und OFL-Text: <https://github.com/marcologous/hanken-grotesk>
- Die Schrift darf auch kommerziell eingebettet und weitergegeben, aber nicht allein verkauft
  werden. Der OFL-Text muss gemeinsam mit den Schriftdateien übergeben werden.

### Tabler Icons Webfont

- Lizenz: MIT
- Quelle: <https://github.com/tabler/tabler-icons>
- Bei lokaler Weitergabe oder CDN-Nutzung ist der MIT-Hinweis in die Drittanbieterhinweise
  aufzunehmen.

### Microsoft Office.js

- Bezugsquelle: <https://appsforoffice.microsoft.com/lib/1/hosted/office.js>
- Nutzung nach den Microsoft-Bedingungen für Office-Add-ins:
  <https://learn.microsoft.com/legal/office-add-ins/terms-of-use>
- Office.js wird extern geladen und nicht als Open-Source-Bestandteil von FreiKI bezeichnet.

## Modelle und Sprachkomponenten

### Qwen3-32B

- Rechteinhaber: Alibaba Cloud / Qwen-Team
- Lizenz: Apache-2.0
- Modell, Model Card und Lizenz: <https://huggingface.co/Qwen/Qwen3-32B>
- Bei Weitergabe der Gewichte sind Lizenz-, Copyright- und gegebenenfalls NOTICE-Angaben zu
  erhalten.

### OpenAI Whisper

- Copyright: 2022 OpenAI
- Lizenz für Code und Modellgewichte: MIT
- Quelle und Lizenz: <https://github.com/openai/whisper>

### Thorsten Piper-Stimme

- Verwendete Modelle: `de_DE-thorsten-high` und `de_DE-thorsten-medium`
- Festgestellter Upstream-Lizenzstatus: CC0
- Quelle: <https://github.com/thorstenMueller/Thorsten-Voice>
- Die Benennung ist rein beschreibend und stellt keine Empfehlung oder Mitwirkung des
  Sprechers beziehungsweise Projekts an FreiKI dar.

## ARASAAC-Piktogramme

Die ARASAAC-Piktogramme sind **kein allgemein kommerziell nutzbarer Bestandteil**.

- Autor: Sergio Palao
- Quelle: ARASAAC, <https://arasaac.org>
- Rechteinhaber: Regierung von Aragón, Spanien
- Lizenz: Creative Commons Namensnennung – Nicht kommerziell – Weitergabe unter gleichen
  Bedingungen 4.0 International (`CC BY-NC-SA 4.0`)
- Bedingungen: <https://aulaabierta.arasaac.org/en/terms-of-use>
- Lizenztext: <https://creativecommons.org/licenses/by-nc-sa/4.0/>

Empfohlener Hinweis in jeder Anzeige, Druckausgabe oder exportierten Datei:

> Die verwendeten Piktogramme sind Eigentum der Regierung von Aragón und wurden von
> Sergio Palao für ARASAAC (https://arasaac.org) erstellt. Verbreitung unter
> CC BY-NC-SA 4.0.

Die Nutzung in einer entgeltlich installierten, vertriebsnahen oder sonst kommerziellen
FreiKI-Instanz ist ohne schriftliche Genehmigung des Rechteinhabers nicht freigegeben.
Das ARASAAC-Modul ist in solchen Instanzen bis zur Klärung zu deaktivieren.

## Systemprogramme im FreiKI-Image

Das selbst gebaute FreiKI-Image basiert auf `node:20-alpine` und installiert unter anderem:

| Programm | Lizenz |
|---|---|
| Node.js | MIT und Lizenzen der eingebundenen Drittkomponenten |
| Alpine Linux / BusyBox / apk-tools | gemischte Lizenzen, unter anderem GPL-2.0-only |
| Tesseract OCR | Apache-2.0 |
| Poppler | GPL-2.0-or-later |
| Ghostscript und jbig2dec | AGPL-3.0-or-later |
| FFmpeg und verwendete Codec-Bibliotheken | gemischte GPL-2.0-or-later-, LGPL-, BSD- und weitere Lizenzen |
| ImageMagick | ImageMagick License |

Quellen:

- Alpine-Pakete: <https://pkgs.alpinelinux.org/>
- Alpine-Quellen (`aports`): <https://gitlab.alpinelinux.org/alpine/aports>
- Node.js: <https://github.com/nodejs/node>
- Tesseract: <https://github.com/tesseract-ocr/tesseract>
- Poppler: <https://gitlab.freedesktop.org/poppler/poppler>
- Ghostscript: <https://github.com/ArtifexSoftware/ghostpdl>
- FFmpeg: <https://ffmpeg.org/download.html>
- ImageMagick: <https://github.com/ImageMagick/ImageMagick>

Ghostscript ist nach der Codeprüfung nicht direkt erforderlich und sollte aus dem nächsten
FreiKI-Image entfernt werden. Solange es enthalten ist, muss die konkrete serverseitige Nutzung
beziehungsweise Weitergabe gegen die AGPL- oder Artifex-Lizenzbedingungen geprüft werden.

## Externe API-Dienste

Bei API-Betrieb soll der Betreiber selbst Vertragspartner des API-Anbieters sein und eigene
Zugangsdaten sowie ein eigenes Abrechnungskonto verwenden.

Für die öffentliche FreiKI-Demo wird DeepInfra eingesetzt:

- Bedingungen: <https://deepinfra.com/terms>
- Datenverarbeitung: <https://docs.deepinfra.com/account/data-privacy>
- Zusätzlich gilt jeweils die Lizenz des ausgewählten Modells.

DeepInfra ist ein externer kommerzieller Dienst und kein Open-Source-Bestandteil. Eingaben der
API-Demo verlassen die FreiKI-Infrastruktur.

## Marken

Mattermost, Redis, OpenAI, Whisper, Qwen, n8n, ARASAAC, Microsoft und weitere Produktnamen
können geschützte Marken sein. Sie werden ausschließlich zur Beschreibung der technischen
Kompatibilität verwendet. Kundenbranding darf Drittanbieter-Logos und -Oberflächen nicht ohne
entsprechende Erlaubnis verändern oder als eigene Produkte ausgeben.
