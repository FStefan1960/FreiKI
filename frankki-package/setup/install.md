# Frank-KI auf fst60.de installieren

## Voraussetzungen

- Ubuntu-Server (Hostname: fst60) mit öffentlicher IP
- DNS-A-Records für alle Subdomains auf Server-IP zeigen (vor Docker-Start!)
- Docker + Docker Compose installiert
- Port 25 beim Hoster freigeschaltet (für ausgehenden Mailversand, oft standardmäßig gesperrt)

## 1. Server vorbereiten

```bash
# Docker installieren (falls noch nicht vorhanden)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Log-Verzeichnis für Caddy anlegen
sudo mkdir -p /var/log/caddy
```

## 2. Paket übertragen und konfigurieren

```bash
# Paket auf den Server kopieren (vom Mac)
rsync -avz --exclude '.env' /Users/frankstefan/ClaudePro/frankki-package/ root@fst60.de:/opt/frankki/

# Auf dem Server: .env anlegen
cd /opt/frankki
cp .env.example .env
nano .env   # alle BITTE_AENDERN-Werte ersetzen
```

## 3. DNS-Records setzen (beim Hoster, VOR dem ersten Start)

```
A       fst60.de           →  <Server-IP>
A       app.fst60.de       →  <Server-IP>
A       n8n.fst60.de       →  <Server-IP>
A       chat.fst60.de      →  <Server-IP>
A       mail.fst60.de      →  <Server-IP>
A       paperless.fst60.de →  <Server-IP>
MX      fst60.de           →  mail.fst60.de  (Prio 10)
TXT     fst60.de           →  "v=spf1 mx ~all"
```
DKIM + DMARC nach erstem Mailserver-Start ergänzen (siehe setup/mail-admin.md).

## 4. Container starten

```bash
cd /opt/frankki

# Image bauen und alles starten
docker compose up -d --build

# Logs beobachten
docker compose logs -f
```

## 5. Datenbank initialisieren

```bash
# Warten bis PostgreSQL gesund ist, dann Schema einspielen
docker exec -i PostgreSQL psql -U frankki_user -d frankki < setup/schema.sql
```

## 6. Ersten Admin-User anlegen

```bash
# Passwort-Hash erzeugen (bcrypt, Rounds 10)
docker exec -it PostgreSQL psql -U frankki_user -d frankki -c \
  "INSERT INTO korki_users (username, password_hash, role, first_name, last_name, email)
   VALUES ('frank@fst60.de', '\$2b\$10\$HASH_HIER_ERSETZEN', 'admin', 'Frank', 'Stefan', 'frank@fst60.de');"

# Oder Hash mit Node erzeugen:
node -e "const b=require('bcryptjs'); b.hash('PASSWORT',10).then(h=>console.log(h))"
# → Hash in obigen INSERT einsetzen
```

## 7. Mailserver einrichten

```bash
# Postfächer anlegen
docker exec Mailserver setup email add frank@fst60.de PASSWORT
docker exec Mailserver setup email add noreply@fst60.de PASSWORT
docker exec Mailserver setup email add postmaster@fst60.de PASSWORT

# DKIM-Key generieren
docker exec Mailserver setup config dkim

# DNS-Einträge für DKIM + DMARC auslesen und beim Hoster eintragen
docker exec Mailserver cat /tmp/docker-mailserver/opendkim/keys/fst60.de/mail.txt
```

## 8. Mattermost einrichten

Beim ersten Aufruf von https://chat.fst60.de:
- Admin-Account anlegen
- System Console → Authentication → GitLab (für OIDC-Login via Frank-KI App):
  - Enable: true
  - Application ID: `MATTERMOST_OIDC_CLIENT_ID` aus .env
  - Application Secret: `MATTERMOST_OIDC_CLIENT_SECRET` aus .env
  - GitLab Site URL: `APP_URL` aus .env (z.B. https://app.fst60.de)

## 9. n8n Workflows importieren

```bash
# n8n API-Key erzeugen: https://n8n.fst60.de → Settings → n8n API
# → N8N_API_KEY in .env eintragen
# → docker compose up -d (um .env-Änderung zu übernehmen)
```

Workflows importieren (angepasste Versionen aus freiki-package/setup/):
- `paperless-freiki-tag-sync-workflow.json` → URLs auf fst60.de anpassen
- `paperless-freiki-sync-workflow.json` → URLs auf fst60.de anpassen

## 10. Abschlusskontrolle

- [ ] https://app.fst60.de erreichbar, Login funktioniert
- [ ] https://chat.fst60.de erreichbar
- [ ] Willkommensmail nach User-Anlage kommt an
- [ ] Mailversand-Test: `docker exec Mailserver sendmail -v frank@fst60.de <<< "Test"`
- [ ] DKIM/SPF prüfen: https://mxtoolbox.com/emailhealth/fst60.de
- [ ] Uptime Kuma konfigurieren (intern, Port 3006)
