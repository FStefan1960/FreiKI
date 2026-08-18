#!/usr/bin/env bash
# Interaktiver Wizard für eine neue FreiKI/KorKI/FrankKI-Instanz.
# Automatisiert die mechanischen Teile aus docs/Neue-Instanz-Setup.md (Schritte 2, 4, 5, 7-9).
# Voraussetzung: Repo bereits geklont (Schritt 1), im Repo-Root ausführen.
#
# Was dieses Script NICHT automatisiert (Entscheidungen, die ein Mensch treffen muss):
#   - docker-compose.yml: welche optionalen Dienste (GPU/vLLM, Mattermost, Portainer/Dozzle/
#     Beszel) wirklich gebraucht werden - Datei wird nur aus der Vorlage kopiert.
#   - Inhalt von welcome.md/tips.md, Logos, Wissensbereichs-Prompts.
#   - Branding in der Admin-UI (braucht einen Login).
#   - DNS/DKIM/Caddy-Zertifikate.
#
# Aufruf: bash setup/provision.sh

set -euo pipefail

if [[ ! -f "freiki-ui/package.json" ]]; then
  echo "Fehler: Bitte im Repo-Root ausführen (dort, wo freiki-ui/ liegt)." >&2
  exit 1
fi

echo "═══════════════════════════════════════════════════════"
echo "  Neue Instanz einrichten"
echo "═══════════════════════════════════════════════════════"
echo ""

ask() {
  local prompt="$1" default="${2:-}" var
  if [[ -n "$default" ]]; then
    read -rp "$prompt [$default]: " var
    echo "${var:-$default}"
  else
    read -rp "$prompt: " var
    echo "$var"
  fi
}

ask_yn() {
  local prompt="$1" default="${2:-n}" var
  read -rp "$prompt [j/N]: " var
  var="${var:-$default}"
  [[ "$var" =~ ^[jJyY] ]]
}

# ── Schritt 2: .env ──────────────────────────────────────────────────────
if [[ -f ".env" ]]; then
  echo "-> .env existiert bereits, wird nicht überschrieben. Weiter mit Schritt 4."
else
  echo "── Schritt 2: .env ──"
  APP_NAME=$(ask "App-Name" "NeueInstanz")
  APP_NAME_LOWER=$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]')
  APP_URL=$(ask "Öffentliche URL" "https://${APP_NAME_LOWER}.example.com")
  APP_TAGLINE=$(ask "Tagline" "Ihr souveräner KI-Assistent")
  APP_COLOR=$(ask "Hauptfarbe (Hex)" "#1F54C0")

  echo ""
  echo "LLM-Backend:"
  echo "  1) Externer API-Anbieter (DeepInfra/Mistral/OpenAI-kompatibel) - kein eigenes GPU nötig"
  echo "  2) Lokales vLLM (eigener GPU-Server)"
  LLM_CHOICE=$(ask "Wahl" "1")
  if [[ "$LLM_CHOICE" == "2" ]]; then
    VLLM_URL=$(ask "vLLM-URL" "http://vllm:8000/v1")
    VLLM_MODEL=$(ask "Modellname" "")
    echo "Hinweis: docker-compose.yml muss die vllm/vllm_embedding-Dienste enthalten (siehe unten)."
  else
    VLLM_URL=$(ask "API-URL" "https://api.deepinfra.com/v1/openai")
    VLLM_MODEL=$(ask "Modellname" "Qwen/Qwen3-32B")
  fi
  VLLM_API_KEY=$(ask "VLLM_API_KEY" "")

  PG_USER_KB=$(ask "Postgres-Benutzer (App)" "freiki_user")
  PG_PASS_KB=$(openssl rand -hex 20)
  echo "PG_PASS_KB automatisch generiert."

  JWT_SECRET=$(openssl rand -hex 32)
  KB_INGEST_API_KEY=$(openssl rand -hex 20)
  BOT_API_KEY=$(openssl rand -hex 20)
  echo "JWT_SECRET, KB_INGEST_API_KEY, BOT_API_KEY automatisch generiert."

  cp .env.example .env
  # Nur bekannte Platzhalter-Keys ersetzen, Rest bleibt leer für manuelle Nachbearbeitung.
  cat >> .env <<EOF

# ── Von setup/provision.sh gesetzt ($(date +%Y-%m-%d)) ──
APP_NAME=$APP_NAME
APP_URL=$APP_URL
APP_TAGLINE=$APP_TAGLINE
APP_COLOR=$APP_COLOR
VLLM_URL=$VLLM_URL
VLLM_MODEL=$VLLM_MODEL
VLLM_API_KEY=$VLLM_API_KEY
PG_HOST=PostgreSQL
PG_DB=freiki
PG_USER_KB=$PG_USER_KB
PG_PASS_KB=$PG_PASS_KB
POSTGRES_USER=$PG_USER_KB
POSTGRES_PASSWORD=$PG_PASS_KB
POSTGRES_DB=freiki
JWT_SECRET=$JWT_SECRET
KB_INGEST_API_KEY=$KB_INGEST_API_KEY
BOT_API_KEY=$BOT_API_KEY
EOF
  echo "-> .env geschrieben. SMTP/Mattermost/Paperless/n8n-Werte bitte manuell ergänzen (siehe .env.example)."
fi
echo ""

# ── Schritt 3: docker-compose.yml ───────────────────────────────────────
echo "── Schritt 3: docker-compose.yml ──"
if [[ -f "docker-compose.yml" ]]; then
  echo "-> docker-compose.yml existiert bereits, wird nicht überschrieben."
else
  cp docker-compose.example.yml docker-compose.yml
  echo "-> Aus Vorlage kopiert. MANUELL PRÜFEN:"
  echo "   - vllm/vllm_embedding: nur behalten, wenn eigener GPU-Server"
  echo "   - mattermost: nur behalten, wenn Team-Chat gewünscht"
  echo "   - portainer/dozzle/beszel/beszel-agent: optional"
  echo "   - Ports bei Bedarf anpassen"
fi
echo ""

# ── Schritt 4: Branding ─────────────────────────────────────────────────
echo "── Schritt 4: Logos ──"
if ask_yn "Logos jetzt einspielen?"; then
  HEADER_SRC=$(ask "Pfad zu Header-Logo (800×200px)" "")
  ICON_SRC=$(ask "Pfad zu Icon (192×192px, quadratisch)" "")
  [[ -n "$HEADER_SRC" && -f "$HEADER_SRC" ]] && cp "$HEADER_SRC" freiki-ui/public/app-header.png && echo "-> app-header.png gesetzt."
  if [[ -n "$ICON_SRC" && -f "$ICON_SRC" ]]; then
    cp "$ICON_SRC" freiki-ui/public/app-icon-192.png
    cp "$ICON_SRC" freiki-ui/public/apple-touch-icon.png
    echo "-> app-icon-192.png + apple-touch-icon.png gesetzt."
  fi
else
  echo "-> Übersprungen, später per scp nachholen (siehe docs/Neue-Instanz-Setup.md Schritt 4)."
fi
echo ""

# ── Schritt 5: Textdateien ───────────────────────────────────────────────
echo "── Schritt 5: welcome.md / tips.md / Benutzerhandbuch ──"
[[ -f "freiki-ui/welcome.md" ]] || { cp instance-template/welcome.md freiki-ui/welcome.md; echo "-> welcome.md angelegt - Inhalt manuell anpassen."; }
[[ -f "freiki-ui/tips.md" ]] || { cp instance-template/tips.md freiki-ui/tips.md; echo "-> tips.md angelegt - Inhalt manuell anpassen."; }
if [[ -z "${APP_NAME:-}" && -f .env ]]; then
  APP_NAME=$(grep -E '^APP_NAME=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)
fi
if [[ -n "${APP_NAME:-}" && -f "docs/${APP_NAME}-Benutzerhandbuch.pdf" ]]; then
  cp "docs/${APP_NAME}-Benutzerhandbuch.pdf" "freiki-ui/${APP_NAME}_Benutzerhandbuch.pdf"
  echo "-> Mail-Anhang: freiki-ui/${APP_NAME}_Benutzerhandbuch.pdf (Willkommensmail)."
else
  echo "-> Kein passendes Handbuch kopiert (erwartet docs/<APP_NAME>-Benutzerhandbuch.pdf → freiki-ui/<APP_NAME>_Benutzerhandbuch.pdf)."
fi
echo ""

# ── Schritt 6: Wissensbereiche ──────────────────────────────────────────
echo "── Schritt 6: Wissensbereiche ──"
if ask_yn "Wissensbereiche jetzt anlegen?"; then
  [[ -f "freiki-ui/areas.json" ]] || cp instance-template/areas.json freiki-ui/areas.json
  mkdir -p freiki-ui/prompts freiki-ui/public/icons
  while ask_yn "Weiteren Bereich anlegen?"; do
    AREA_KEY=$(ask "Bereichs-Schlüssel (z.B. 'hr', nur a-z0-9_)" "")
    [[ -z "$AREA_KEY" ]] && continue
    cp instance-template/prompts/w_stvo.md "freiki-ui/prompts/w_${AREA_KEY}.md"
    echo "-> freiki-ui/prompts/w_${AREA_KEY}.md angelegt - Frontmatter (title/welcome/hint/examples) und workspace:wissen manuell setzen."
    echo "   KB-Tabelle nach dem ersten Stack-Start anlegen:"
    echo "   CREATE TABLE kb_${AREA_KEY} (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, \"pageContent\" TEXT NOT NULL, metadata JSONB DEFAULT '{}', embedding vector(1024));"
    echo "-> areas.json manuell um den Bereich '$AREA_KEY' ergänzen."
  done
else
  echo "-> Übersprungen."
fi
echo ""

# ── Schritt 7: Caddyfile ─────────────────────────────────────────────────
echo "── Schritt 7: Caddyfile ──"
if [[ -f "caddy/Caddyfile" ]]; then
  echo "-> Caddyfile existiert bereits, wird nicht überschrieben."
else
  DOMAIN=$(ask "Basis-Domain (ersetzt 'freiki.com' überall, z.B. in app.freiki.com -> app.<Domain>)" "")
  cp caddy/Caddyfile.example caddy/Caddyfile
  if [[ -n "$DOMAIN" ]]; then
    sed -i.bak "s/freiki\.com/$DOMAIN/g" caddy/Caddyfile && rm -f caddy/Caddyfile.bak
    echo "-> Caddyfile: 'freiki.com' überall durch '$DOMAIN' ersetzt (app./n8n./paperless./chat./mail.-Subdomains erhalten) - bitte prüfen, falls eine andere Domain-Struktur gebraucht wird."
  else
    echo "-> Caddyfile aus Vorlage kopiert - Domain manuell eintragen."
  fi
fi
echo ""

# ── Schritt 8: Stack starten ────────────────────────────────────────────
echo "── Schritt 8: Stack starten ──"
# Als Einzeldateien gemountete Laufzeit-JSONs müssen vor dem ersten Start existieren -
# sonst legt Docker dort ein Verzeichnis statt einer Datei an (siehe docker-compose.yml).
for f in losung.json medienspiegel.json gesellschaftstrends.json sicherheitslage.json; do
  [[ -f "freiki-ui/$f" ]] || echo '{}' > "freiki-ui/$f"
done
[[ -f "freiki-ui/docker-update-state.json" ]] || echo '{"digests":{}}' > "freiki-ui/docker-update-state.json"
[[ -f "freiki-ui/feedback-state.json" ]] || echo '{"feedbacks":[]}' > "freiki-ui/feedback-state.json"
[[ -f "freiki-ui/usage-state.json" ]] || echo '{"chats":[],"chatsGesamt":[]}' > "freiki-ui/usage-state.json"
if ask_yn "Stack jetzt starten (docker compose up -d)?"; then
  docker compose up -d
  echo "-> Warte auf freiki-ui..."
  for _ in $(seq 1 30); do
    if docker exec FreiKI node -e 'fetch("http://127.0.0.1:3000/").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' 2>/dev/null; then
      echo "-> App erreichbar."
      break
    fi
    sleep 2
  done
else
  echo "-> Übersprungen. Später: docker compose up -d && bash setup/deploy.sh <git-sha>"
fi
echo ""

# ── Schritt 9: Admin-User ───────────────────────────────────────────────
echo "── Schritt 9: Ersten Admin-User anlegen ──"
if ask_yn "Jetzt anlegen?"; then
  ADMIN_USER=$(ask "Admin-Benutzername" "admin")
  ADMIN_PASS=$(openssl rand -hex 12)
  bash setup/create-admin.sh "$ADMIN_USER" "$ADMIN_PASS"
  echo "-> Admin '$ADMIN_USER' angelegt. Passwort: $ADMIN_PASS (jetzt notieren, wird nicht erneut angezeigt)."
else
  echo "-> Übersprungen. Später: bash setup/create-admin.sh <user> <passwort>"
fi
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  Verbleibende manuelle Schritte"
echo "═══════════════════════════════════════════════════════"
echo "  [ ] docker-compose.yml final geprüft (GPU/Mattermost/optionale Dienste)"
echo "  [ ] Branding in Admin-UI gesetzt (/admin/config: Name, Farben, Cache-Version)"
echo "  [ ] Wissensbereichs-Inhalte (Frontmatter, areas.json, Icons) fertiggestellt"
echo "  [ ] Native Berichts-Module: gewünschte Feature-Flags in .env gesetzt (siehe docs/Neue-Instanz-Setup.md Schritt 8a)"
echo "  [ ] Paperless-Tags + n8n-Workflows (falls gebraucht)"
echo "  [ ] Mailserver: DNS/DKIM"
echo "  [ ] Backup-Script eingerichtet (setup/backup.sh)"
echo "  [ ] Uptime Kuma konfiguriert"
echo ""
echo "Vollständige Checkliste: docs/Neue-Instanz-Setup.md"
