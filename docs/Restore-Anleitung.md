# FreiKI / KorKI – Disaster Recovery & Restore

**Stand Juni 2026**

---

## Übersicht

Beide Systeme werden täglich vollständig gesichert:

| System | Backup-Zeit | Zielort | Aufbewahrung |
|---|---|---|---|
| KorKI | 02:00 Uhr | `fst60-de:/home/frank/korki-backups/` | 14 Tage |
| FreiKI | 03:00 Uhr | `fst60-de:/home/frank/freiki-backups/` | 14 Tage |

Das Backup enthält:
- Alle Docker-Volumes (Datenbank, Paperless, Mattermost, Mailserver, n8n, Caddy, Kuma, Portainer)
- PostgreSQL-Dump (logisch, alle Datenbanken)
- Stack-Konfiguration (docker-compose.yml, .env, Caddy, Prompts)
- Gebautes Docker-Image

---

## Szenario 1: Einzelnen Dienst wiederherstellen

Wenn nur ein Dienst defekt ist (z. B. n8n-Daten weg):

```bash
# Backup holen
scp -i ~/.ssh/backup_key frank@fst60-de:/home/frank/korki-backups/korki-backup-DATUM.tar.gz /tmp/
tar xzf /tmp/korki-backup-DATUM.tar.gz -C /tmp/
BACKUP_DIR=/tmp/korki-backup-DATUM

# Dienst stoppen
cd ~/freiki-package && docker compose stop n8n

# Volume zurückspielen
docker run --rm \
  -v freiki-package_n8n_storage:/data \
  -v ${BACKUP_DIR}:/backup \
  alpine sh -c "cd /data && tar xzf /backup/n8n_storage.tar.gz"

# Dienst starten
docker compose start n8n
```

---

## Szenario 2: Vollständiger Restore (Server-Totalausfall)

### Voraussetzungen

- Neuer Server mit Ubuntu 22.04+
- Docker + Docker Compose installiert
- SSH-Key `backup_key` vorhanden (`~/.ssh/backup_key`)
- Zugang zu `fst60-de`

### Schritt 1: Repo klonen

```bash
git clone git@github.com:FStefan1960/FreiKI.git ~/freiki-package
```

### Schritt 2: Restore-Script ausführen

```bash
# KorKI:
bash ~/freiki-package/setup/restore.sh

# FreiKI:
bash ~/freiki-package/setup/restore.sh
```

Das Script:
1. Listet verfügbare Backups auf
2. Lädt das gewählte Backup herunter
3. Stoppt den Stack
4. Fragt ob Configs übernommen werden sollen
5. Stellt PostgreSQL wieder her
6. Spielt alle Volumes zurück
7. Startet den Stack

### Schritt 3: Nach dem Restore prüfen

- [ ] App-UI erreichbar
- [ ] Mattermost erreichbar
- [ ] Paperless intern erreichbar (`http://localhost:3005`)
- [ ] n8n-Workflows aktiv (`http://localhost:5678`)
- [ ] Mailserver läuft: `docker logs Mailserver`
- [ ] Uptime Kuma zeigt alle Dienste grün
- [ ] Logos (`app-header.png`, `app-icon-192.png`) korrekt — müssen ggf. manuell kopiert werden, da nicht im Repo

### Schritt 4: DNS prüfen (bei neuer Server-IP)

| Name | Typ | Wert |
|---|---|---|
| `assi` | A | neue Server-IP |
| `chat` | A | neue Server-IP |
| `mail` | A | neue Server-IP |

---

## PostgreSQL manuell wiederherstellen

```bash
# Einzelne Datenbank aus Dump extrahieren
zcat postgres-dumpall.sql.gz | grep -A 9999 "\\\\connect flowise" > flowise.sql

# Einspielen
docker exec -i PostgreSQL psql -U n8n_user -d flowise < flowise.sql
```

---

## Backup manuell auslösen

```bash
bash ~/freiki-package/setup/backup.sh
```

---

## Backup-Integrität prüfen

```bash
# Dateiliste und Größen
ssh frank@fst60-de "ls -lh ~/korki-backups/ ~/freiki-backups/"

# Archiv-Integrität testen (ohne Entpacken)
tar tzf /tmp/korki-backup-DATUM.tar.gz | head -20
```

---

*Bei Fragen: frank@frank-stefan.de*
