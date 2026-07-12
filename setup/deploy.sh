#!/usr/bin/env bash
# Auf dem Server ausführen: bash ~/freiki-package/setup/deploy.sh [Git-SHA]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PACKAGE_DIR"

APP_VERSION="$(node -p "require('./freiki-ui/package.json').version")"
GIT_SHA="${1:-${GIT_SHA:-}}"

if [[ -z "$GIT_SHA" ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_SHA="$(git rev-parse --short HEAD)"
fi

if [[ ! "$APP_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Fehler: Ungültige Version in freiki-ui/package.json: $APP_VERSION" >&2
  exit 1
fi

if [[ ! "$GIT_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Fehler: Git-SHA als Argument übergeben, z. B. bash setup/deploy.sh a1aefd5" >&2
  exit 1
fi

BASE_VERSION="${APP_VERSION%%[-+]*}"
IFS='.' read -r VERSION_MAJOR VERSION_MINOR _ <<< "$BASE_VERSION"
MINOR_VERSION="${VERSION_MAJOR}.${VERSION_MINOR}"

export FREIKI_VERSION="$APP_VERSION"
export FREIKI_GIT_SHA="$GIT_SHA"

RELEASE_IMAGE="freiki-ui:${APP_VERSION}"
CONFIGURED_IMAGE="$(
  docker compose config --format json |
    node -e 'let d=""; process.stdin.on("data", c => d += c); process.stdin.on("end", () => console.log(JSON.parse(d).services["freiki-ui"].image));'
)"

if [[ "$CONFIGURED_IMAGE" != "$RELEASE_IMAGE" ]]; then
  echo "Fehler: docker-compose.yml löst freiki-ui als ${CONFIGURED_IMAGE} statt ${RELEASE_IMAGE} auf." >&2
  echo "Bitte FREIKI_VERSION und FREIKI_GIT_SHA wie in der README beschrieben verwenden." >&2
  exit 1
fi

echo "-> Baue FreiKI ${APP_VERSION} (${GIT_SHA})..."
printf '%s+%s\n' "$APP_VERSION" "$GIT_SHA" > freiki-ui/public/VERSION
docker compose build freiki-ui

docker image inspect "$RELEASE_IMAGE" >/dev/null

echo "-> Setze Image-Aliase..."
docker tag "$RELEASE_IMAGE" "freiki-ui:${MINOR_VERSION}"
docker tag "$RELEASE_IMAGE" "freiki-ui:${GIT_SHA}"
docker tag "$RELEASE_IMAGE" "freiki-ui:latest"

echo "-> Deploye ${RELEASE_IMAGE}..."
docker compose up -d --no-deps --force-recreate freiki-ui

CONTAINER_ID="$(docker compose ps -q freiki-ui)"
if [[ -z "$CONTAINER_ID" ]] || [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_ID")" != "true" ]]; then
  echo "Fehler: FreiKI-Container läuft nach dem Deployment nicht." >&2
  exit 1
fi

echo "-> Prüfe Erreichbarkeit..."
APP_READY=false
for _ in {1..30}; do
  if docker exec "$CONTAINER_ID" node -e \
    'fetch("http://127.0.0.1:3000/").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
  then
    APP_READY=true
    break
  fi
  sleep 1
done

if [[ "$APP_READY" != "true" ]]; then
  echo "Fehler: FreiKI antwortet nach 30 Sekunden nicht." >&2
  exit 1
fi

RUNNING_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CONTAINER_ID")"
RUNNING_VERSION="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$CONTAINER_ID")"
RUNNING_REVISION="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$CONTAINER_ID")"

if [[ "$RUNNING_IMAGE" != "$RELEASE_IMAGE" || "$RUNNING_VERSION" != "$APP_VERSION" || "$RUNNING_REVISION" != "$GIT_SHA" ]]; then
  echo "Fehler: Laufendes Image oder OCI-Metadaten stimmen nicht mit dem Release überein." >&2
  exit 1
fi

echo "-> Deployed: ${RUNNING_IMAGE} (${RUNNING_REVISION})"
