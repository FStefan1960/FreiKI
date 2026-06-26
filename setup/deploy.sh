#!/bin/bash
# Auf dem Server ausführen: bash ~/freiki-package/setup/deploy.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PACKAGE_DIR"

echo "-> Git pull..."
git pull origin main

echo "-> Version schreiben..."
git rev-parse --short HEAD > freiki-ui/public/VERSION

echo "-> Container neu starten..."
docker compose restart freiki-ui

echo "-> Deployed: $(git log --oneline -1)"
