# Komponenten, Versionen, Digests und Quellen

Erfasst am 12.07.2026, zuletzt aktualisiert am 13.07.2026 auf der
FreiKI-Referenzinstanz. Der Digest ist gegenüber dem menschenlesbaren Tag maßgeblich.
Er identifiziert den tatsächlich geprüften Image-Inhalt.

## Produktivcontainer

| Komponente | Festgestellte Version | verwendeter Tag | OCI-Digest | Lizenz | Quellcode und Lizenz |
|---|---|---|---|---|---|
| FreiKI | 0.4.3, Build `c56ef96` | `freiki-ui:0.4.3` | `sha256:8d9c066824d83df31403403be199ed581d7df962c75d35ecc7177e5f7f431f2d` | AGPL-3.0-or-later | [Source](https://github.com/FStefan1960/FreiKI/tree/c56ef96) · [`LICENSE`](../LICENSE) |
| Mattermost Team Edition | 11.9.0 | `mattermost/mattermost-team-edition:11.9.0` | `sha256:1c538cf33c2144ba2c825571cd414aaaebf8d8c231d4b18081b811cd0ca0ef2a` | offizielles Team-Edition-Binary: MIT | [Source](https://github.com/mattermost/mattermost/tree/v11.9.0) · [Lizenz-FAQ](https://docs.mattermost.com/product-overview/faq-license.html) |
| n8n | 2.30.3 | `n8nio/n8n:2.30.3` | `sha256:4e9de05de2f87c34774d71a93dd9aca924adb930c4c7f2f7797b84fa93327be5` | Sustainable Use License; `.ee`-Teile separat | [Source](https://github.com/n8n-io/n8n) · [Lizenz](https://docs.n8n.io/sustainable-use-license/) |
| Uptime Kuma | 2.4.0 | `louislam/uptime-kuma:2.4.0` | `sha256:91e963bfda569ba115206e843febb446f473ab525add4e08b2b9e3beffa16985` | MIT | [Source](https://github.com/louislam/uptime-kuma/tree/2.4.0) · [Lizenz](https://github.com/louislam/uptime-kuma/blob/2.4.0/LICENSE) |
| Portainer CE | 2.43.0 | `portainer/portainer-ce:2.43.0` | `sha256:707366c811956fe077135a6633af67e698529612869711cdb24896c892b28feb` | Zlib | [Source](https://github.com/portainer/portainer) · [Lizenz](https://github.com/portainer/portainer/blob/develop/LICENSE) |
| Caddy | 2.11.4 | `caddy:2.11.4` | `sha256:af5fdcd76f2db5e4e974ee92f96ee8c0fc3edb55bd4ba5032547cbf3f65e486d` | Apache-2.0 | [Source](https://github.com/caddyserver/caddy/tree/v2.11.4) · [Lizenz](https://github.com/caddyserver/caddy/blob/v2.11.4/LICENSE) |
| Swagger UI | 5.32.8 | `swaggerapi/swagger-ui:v5.32.8` | `sha256:1ece6f19ca5709fb5fbab9bf43adee2916144fb21e82b7bafba568124e8c8930` | Apache-2.0 | [Source](https://github.com/swagger-api/swagger-ui/tree/v5.32.8) · [Lizenz](https://github.com/swagger-api/swagger-ui/blob/v5.32.8/LICENSE) |
| Dozzle | 10.6.9 | `amir20/dozzle:v10.6.9` | `sha256:6f4644814cce31e11fe80f2610515df6a5a2e40120b4087c298a72df8d65866b` | MIT | [Source](https://github.com/amir20/dozzle/tree/v10.6.9) · [Lizenz](https://github.com/amir20/dozzle/blob/v10.6.9/LICENSE) |
| docker-mailserver | 15.1.0 | `mailserver/docker-mailserver:latest` | `sha256:af51b15dd3fc72153c0e90eb7692bb5e3a463212d87959a80fa7aa89b617d44a` | Integrationsprojekt: MIT; enthaltene Maildienste separat | [Source](https://github.com/docker-mailserver/docker-mailserver/tree/v15.1.0) · [Lizenz](https://github.com/docker-mailserver/docker-mailserver/blob/v15.1.0/LICENSE) |
| Paperless-ngx | 2.20.15 | `ghcr.io/paperless-ngx/paperless-ngx:latest` | `sha256:6c86cad803970ea782683a8e80e7403444c5bf3cf70de63b4d3c8e87500db92f` | GPL-3.0 | [Source](https://github.com/paperless-ngx/paperless-ngx/tree/v2.20.15) · [Lizenz](https://github.com/paperless-ngx/paperless-ngx/blob/v2.20.15/LICENSE) |
| speaches (Piper-Backend) | `latest-cpu` | `ghcr.io/speaches-ai/speaches:latest-cpu` | `sha256:21e3df06d842fb7802ab470dd77c25f0e8c0d22950e8d8c6ae886e851af53ef8` | MIT; Piper-Linie: MIT; Stimmen separat | [Source](https://github.com/speaches-ai/speaches) · [Lizenz](https://github.com/speaches-ai/speaches/blob/master/LICENSE) |
| Redis Community Edition | 7.4.9 | `redis:7` | `sha256:33d7c9a245edd95e6703a0addbeaa48fe40c3b3b4783627a72085155462ebfdb` | RSALv2 oder SSPLv1, nicht OSI-Open-Source | [Source](https://github.com/redis/redis/tree/7.4.9) · [Lizenzmatrix](https://redis.io/legal/licenses/) |
| PostgreSQL + pgvector | PostgreSQL 16.14; pgvector-Version durch Digest fixiert | `pgvector/pgvector:pg16` | `sha256:131dcf7ff6a900545df8e7e092c270aa8c6db2f2c818e408cb45ec21316b74e6` | PostgreSQL License | [PostgreSQL](https://www.postgresql.org/ftp/source/v16.14/) · [pgvector](https://github.com/pgvector/pgvector) |
| Whisper ASR Webservice | 1.9.1 | `onerahmet/openai-whisper-asr-webservice:v1.9.1` | `sha256:03b402335881cdab2e4939b24620809df8d6ceec3bf2712217d41c8761a0f5d4` | Webservice und Whisper-Modell: MIT | [Webservice](https://github.com/ahmetoner/whisper-asr-webservice/tree/v1.9.1) · [Whisper](https://github.com/openai/whisper) |
| SearXNG | 2026.7.12, Revision `c19d86faa` | `searxng/searxng:latest` | `sha256:f433294b46a93564993c4371005341e013d94aa8ea4662d8ee521cd2cccb08e8` | AGPL-3.0-or-later | [Source](https://github.com/searxng/searxng) · [Lizenz](https://github.com/searxng/searxng/blob/master/LICENSE) |
| Gotenberg | 8.34.0 | `gotenberg/gotenberg:8` | `sha256:67097317623a503ba2a6a7e9ae8db6929a1f7e1bbd88077bacf2d325fbdab923` | MIT; enthaltene Konverter separat | [Source](https://github.com/gotenberg/gotenberg/tree/v8.34.0) · [Lizenz](https://github.com/gotenberg/gotenberg/blob/v8.34.0/LICENSE) |
| Apache Tika | Anwendungsfassung nicht exponiert; OCI-Label `26.04` | `apache/tika:latest` | `sha256:90b7fa1dc018434075fce9e1d9b88b1e3d0ea6979d0cf86e116c79a8073ae973` | Apache-2.0 mit NOTICE-Pflichten | [Source](https://github.com/apache/tika) · [Lizenz/NOTICE](https://github.com/apache/tika/tree/main) |

## Modelle, Stimmen und externe Dienste

| Bestandteil | festgestellter Einsatz | Lizenz beziehungsweise Vertrag | Quelle |
|---|---|---|---|
| Qwen3-32B | lokales Modell oder Demo über DeepInfra | Apache-2.0 | [Modell und Lizenz](https://huggingface.co/Qwen/Qwen3-32B) |
| Whisper-Modell | im Whisper-Webservice | MIT | [Source und Lizenz](https://github.com/openai/whisper) |
| Thorsten Piper-Stimme | `speaches-ai/piper-de_DE-thorsten-high` | Modell/Dataset nach geprüftem Upstream: CC0 | [Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice) |
| Kerstin Piper-Stimme | `speaches-ai/piper-de_DE-kerstin-low` | Modell/Dataset nach geprüftem Upstream: CC0 | [Piper Voices](https://github.com/rhasspy/piper/blob/master/VOICES.md) |
| DeepInfra | API-Backend der öffentlichen Demo | DeepInfra Terms plus jeweilige Modelllizenz | [Terms](https://deepinfra.com/terms) · [Datenschutz](https://docs.deepinfra.com/account/data-privacy) |
| ARASAAC | Piktogrammsuche und Tagesplan | CC BY-NC-SA 4.0 | [Nutzungsbedingungen](https://aulaabierta.arasaac.org/en/terms-of-use) |

## FreiKI-Image: direkt installierte Systemprogramme

| Paket | festgestellte Version | Lizenz | Quelle |
|---|---|---|---|
| FFmpeg | 8.0.1-r1 | GPL-2.0-or-later und LGPL-2.1-or-later | [FFmpeg](https://ffmpeg.org/) · [Alpine-Paket](https://pkgs.alpinelinux.org/packages?name=ffmpeg) |
| ImageMagick | 7.1.2.24-r0 | ImageMagick License | [Source](https://github.com/ImageMagick/ImageMagick) |
| Poppler Utils | 25.12.0-r0 | GPL-2.0-or-later | [Source](https://gitlab.freedesktop.org/poppler/poppler) |
| Tesseract OCR | 5.5.1-r0 | Apache-2.0 | [Source](https://github.com/tesseract-ocr/tesseract/tree/5.5.1) |

Das Image basiert zusätzlich auf `node:20-alpine` und enthält transitive Alpine-Pakete mit
MIT-, BSD-, ISC-, Apache-, MPL-, LGPL-, GPL- und weiteren Lizenzen. Deren exakter Binärstand
ist durch den FreiKI-Image-Digest fixiert. Die vollständigen Alpine-Quellen sind über
[Alpine Packages](https://pkgs.alpinelinux.org/) und
[Alpine aports](https://gitlab.alpinelinux.org/alpine/aports) verfügbar.
