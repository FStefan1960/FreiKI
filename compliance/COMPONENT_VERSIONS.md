# Komponenten, Versionen, Digests und Quellen

Erfasst am 12.07.2026 auf der FreiKI-Referenzinstanz. Der Digest ist gegenüber dem
menschenlesbaren Tag maßgeblich. Er identifiziert den tatsächlich geprüften Image-Inhalt.

## Produktivcontainer

| Komponente | Festgestellte Version | verwendeter Tag | OCI-Digest | Lizenz | Quellcode und Lizenz |
|---|---|---|---|---|---|
| FreiKI | `VERSION c47c9ae` | `freiki-ui:latest` | `sha256:860b41cd55891e918c73a706ffdd01a1648bba883c9cf82c8a29db11df322b3d` | noch nicht festgelegt | übergebener FreiKI-Quellstand; Lizenzentscheidung offen |
| Mattermost Team Edition | 10.11.1 | `mattermost/mattermost-team-edition:10.11.1` | `sha256:c71503496855041eff0251cc2223db19b7677156f1a80eefe8ec79531d739145` | offizielles Team-Edition-Binary: MIT | [Source](https://github.com/mattermost/mattermost/tree/v10.11.1) · [Lizenz-FAQ](https://docs.mattermost.com/product-overview/faq-license.html) |
| n8n | 2.30.1 | `n8nio/n8n:2.30.1` | `sha256:0e4f6dc0d69358440446ae44d39527771281d9748b46db844cc42c1c14edaaf9` | Sustainable Use License; `.ee`-Teile separat | [Source](https://github.com/n8n-io/n8n) · [Lizenz](https://docs.n8n.io/sustainable-use-license/) |
| Uptime Kuma | 2.4.0 | `louislam/uptime-kuma:2.4.0` | `sha256:91e963bfda569ba115206e843febb446f473ab525add4e08b2b9e3beffa16985` | MIT | [Source](https://github.com/louislam/uptime-kuma/tree/2.4.0) · [Lizenz](https://github.com/louislam/uptime-kuma/blob/2.4.0/LICENSE) |
| Portainer CE | 2.43.0 | `portainer/portainer-ce:2.43.0` | `sha256:707366c811956fe077135a6633af67e698529612869711cdb24896c892b28feb` | Zlib | [Source](https://github.com/portainer/portainer) · [Lizenz](https://github.com/portainer/portainer/blob/develop/LICENSE) |
| Caddy | 2.11.4 | `caddy:2.11.4` | `sha256:af5fdcd76f2db5e4e974ee92f96ee8c0fc3edb55bd4ba5032547cbf3f65e486d` | Apache-2.0 | [Source](https://github.com/caddyserver/caddy/tree/v2.11.4) · [Lizenz](https://github.com/caddyserver/caddy/blob/v2.11.4/LICENSE) |
| Swagger UI | 5.32.8 | `swaggerapi/swagger-ui:v5.32.8` | `sha256:1ece6f19ca5709fb5fbab9bf43adee2916144fb21e82b7bafba568124e8c8930` | Apache-2.0 | [Source](https://github.com/swagger-api/swagger-ui/tree/v5.32.8) · [Lizenz](https://github.com/swagger-api/swagger-ui/blob/v5.32.8/LICENSE) |
| Dozzle | 10.6.7 | `amir20/dozzle:latest` | `sha256:43d933ebda116990c920e054d68a1aed286ab01fd31657983c53bbdf46cc0aa8` | MIT | [Source](https://github.com/amir20/dozzle/tree/v10.6.7) · [Lizenz](https://github.com/amir20/dozzle/blob/v10.6.7/LICENSE) |
| docker-mailserver | 15.1.0 | `mailserver/docker-mailserver:latest` | `sha256:af51b15dd3fc72153c0e90eb7692bb5e3a463212d87959a80fa7aa89b617d44a` | Integrationsprojekt: MIT; enthaltene Maildienste separat | [Source](https://github.com/docker-mailserver/docker-mailserver/tree/v15.1.0) · [Lizenz](https://github.com/docker-mailserver/docker-mailserver/blob/v15.1.0/LICENSE) |
| Paperless-ngx | 2.20.15 | `ghcr.io/paperless-ngx/paperless-ngx:latest` | `sha256:6c86cad803970ea782683a8e80e7403444c5bf3cf70de63b4d3c8e87500db92f` | GPL-3.0 | [Source](https://github.com/paperless-ngx/paperless-ngx/tree/v2.20.15) · [Lizenz](https://github.com/paperless-ngx/paperless-ngx/blob/v2.20.15/LICENSE) |
| openedai-speech-min / Piper | Image vom 02.02.2025; Piper TTS 1.2.0 | `ghcr.io/matatonic/openedai-speech-min:latest` | `sha256:e82d719252fb1b861967f4f9abb8513f028ab9c1139451245688dbf34992b060` | openedai-speech: AGPL-3.0; Piper-Linie: MIT; Stimme separat | [Source](https://github.com/matatonic/openedai-speech) · [Lizenz](https://github.com/matatonic/openedai-speech/blob/main/LICENSE) |
| Redis Community Edition | 7.4.9 | `redis:7` | `sha256:33d7c9a245edd95e6703a0addbeaa48fe40c3b3b4783627a72085155462ebfdb` | RSALv2 oder SSPLv1, nicht OSI-Open-Source | [Source](https://github.com/redis/redis/tree/7.4.9) · [Lizenzmatrix](https://redis.io/legal/licenses/) |
| PostgreSQL + pgvector | PostgreSQL 16.14; pgvector-Version durch Digest fixiert | `pgvector/pgvector:pg16` | `sha256:131dcf7ff6a900545df8e7e092c270aa8c6db2f2c818e408cb45ec21316b74e6` | PostgreSQL License | [PostgreSQL](https://www.postgresql.org/ftp/source/v16.14/) · [pgvector](https://github.com/pgvector/pgvector) |
| Whisper ASR Webservice | 1.9.1 | `onerahmet/openai-whisper-asr-webservice:v1.9.1` | `sha256:03b402335881cdab2e4939b24620809df8d6ceec3bf2712217d41c8761a0f5d4` | Webservice und Whisper-Modell: MIT | [Webservice](https://github.com/ahmetoner/whisper-asr-webservice/tree/v1.9.1) · [Whisper](https://github.com/openai/whisper) |
| SearXNG | 2026.6.10, Revision `de03f4eb1` | `searxng/searxng:2026.6.10-de03f4eb1` | `sha256:f604578255dc54ef6dd6f7945214c0b798af6734e7b7a423122042c77ffb92bb` | AGPL-3.0-or-later | [Source](https://github.com/searxng/searxng) · [Lizenz](https://github.com/searxng/searxng/blob/master/LICENSE) |
| Gotenberg | 8.34.0 | `gotenberg/gotenberg:8` | `sha256:67097317623a503ba2a6a7e9ae8db6929a1f7e1bbd88077bacf2d325fbdab923` | MIT; enthaltene Konverter separat | [Source](https://github.com/gotenberg/gotenberg/tree/v8.34.0) · [Lizenz](https://github.com/gotenberg/gotenberg/blob/v8.34.0/LICENSE) |
| Apache Tika | Anwendungsfassung nicht exponiert; OCI-Label `26.04` | `apache/tika:latest` | `sha256:90b7fa1dc018434075fce9e1d9b88b1e3d0ea6979d0cf86e116c79a8073ae973` | Apache-2.0 mit NOTICE-Pflichten | [Source](https://github.com/apache/tika) · [Lizenz/NOTICE](https://github.com/apache/tika/tree/main) |

## Modelle, Stimmen und externe Dienste

| Bestandteil | festgestellter Einsatz | Lizenz beziehungsweise Vertrag | Quelle |
|---|---|---|---|
| Qwen3-32B | lokales Modell oder Demo über DeepInfra | Apache-2.0 | [Modell und Lizenz](https://huggingface.co/Qwen/Qwen3-32B) |
| Whisper-Modell | im Whisper-Webservice | MIT | [Source und Lizenz](https://github.com/openai/whisper) |
| Thorsten Piper-Stimme | `de_DE-thorsten-high` / `de_DE-thorsten-medium` | Modell/Dataset nach geprüftem Upstream: CC0 | [Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice) |
| DeepInfra | API-Backend der öffentlichen Demo | DeepInfra Terms plus jeweilige Modelllizenz | [Terms](https://deepinfra.com/terms) · [Datenschutz](https://docs.deepinfra.com/account/data-privacy) |
| ARASAAC | Piktogrammsuche und Tagesplan | CC BY-NC-SA 4.0 | [Nutzungsbedingungen](https://aulaabierta.arasaac.org/en/terms-of-use) |

## FreiKI-Image: direkt installierte Systemprogramme

| Paket | festgestellte Version | Lizenz | Quelle |
|---|---|---|---|
| FFmpeg | 8.0.1-r1 | GPL-2.0-or-later und LGPL-2.1-or-later | [FFmpeg](https://ffmpeg.org/) · [Alpine-Paket](https://pkgs.alpinelinux.org/packages?name=ffmpeg) |
| Ghostscript | 10.06.0-r0 | AGPL-3.0-or-later oder kommerzielle Artifex-Lizenz | [Ghostscript](https://www.ghostscript.com/releases/gsdnld.html) · [Lizenzierung](https://artifex.com/licensing) |
| ImageMagick | 7.1.2.24-r0 | ImageMagick License | [Source](https://github.com/ImageMagick/ImageMagick) |
| Poppler Utils | 25.12.0-r0 | GPL-2.0-or-later | [Source](https://gitlab.freedesktop.org/poppler/poppler) |
| Tesseract OCR | 5.5.1-r0 | Apache-2.0 | [Source](https://github.com/tesseract-ocr/tesseract/tree/5.5.1) |

Das Image basiert zusätzlich auf `node:20-alpine` und enthält transitive Alpine-Pakete mit
MIT-, BSD-, ISC-, Apache-, MPL-, LGPL-, GPL- und weiteren Lizenzen. Deren exakter Binärstand
ist durch den FreiKI-Image-Digest fixiert. Die vollständigen Alpine-Quellen sind über
[Alpine Packages](https://pkgs.alpinelinux.org/) und
[Alpine aports](https://gitlab.alpinelinux.org/alpine/aports) verfügbar.
