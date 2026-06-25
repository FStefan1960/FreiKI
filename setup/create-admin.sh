#!/bin/bash
# Legt den ersten Admin-Benutzer an. Erst ausführen, nachdem docker compose up gelaufen ist
# (braucht den laufenden FreiKI-Container für bcryptjs und die laufende Postgres-Datenbank).
#
# Aufruf: ./setup/create-admin.sh <username> <passwort>

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Aufruf: $0 <username> <passwort>"
  exit 1
fi

USERNAME="$1"
PASSWORD="$2"

# .env für POSTGRES_USER/POSTGRES_DB einlesen
set -a
source .env
set +a

HASH=$(docker exec FreiKI node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" "$PASSWORD")

docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" PostgreSQL psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "INSERT INTO korki_users (username, password_hash, role) VALUES ('$USERNAME', '$HASH', 'admin') ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin';"

echo "Admin-Benutzer '$USERNAME' angelegt/aktualisiert."
