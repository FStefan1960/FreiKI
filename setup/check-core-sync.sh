#!/bin/bash
# Prüft, ob die Kern-Dateien dieser Instanz mit origin/main übereinstimmen.
# Kern = muss auf allen Instanzen (FreiKI, KorKI, FrankKI, ...) identisch sein:
# server.js, index.html, style.css, sw.js. Alles andere (docker-compose.yml,
# prompts/, extras/, Branding-Assets, ...) ist laut .gitignore instanzspezifisch
# und wird hier bewusst nicht geprüft.
#
# Aufruf: ./setup/check-core-sync.sh   (im Root des freiki-package-Checkouts)

set -e
cd "$(dirname "$0")/.."

CORE_FILES=(
  "freiki-ui/server.js"
  "freiki-ui/public/index.html"
  "freiki-ui/public/style.css"
  "freiki-ui/public/sw.js"
)

git fetch origin main --quiet

BEHIND=0
for f in "${CORE_FILES[@]}"; do
  if git diff --quiet origin/main -- "$f" 2>/dev/null; then
    echo "OK       $f"
  else
    echo "ABWEICHUNG  $f"
    BEHIND=1
  fi
done

echo
if [ "$BEHIND" -eq 0 ]; then
  echo "Alle Kern-Dateien sind identisch mit origin/main."
else
  echo "Mindestens eine Kern-Datei weicht von origin/main ab."
  echo "Details:  git diff origin/main -- <Datei>"
  exit 1
fi
