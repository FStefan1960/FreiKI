# FreiKI / KorKI / FrankKI – Disaster Recovery & Restore

**Stand 2026-07-05**

---

## Übersicht

Alle drei Instanzen werden täglich vollständig gesichert, seit 2026-07-05 nach **IONOS HiDrive** (vorher Goneo — abgelöst, da Goneo Frank Stefans privates Konto war):

| System | Backup-Zeit | Ziel (HiDrive-Unterordner) | Aufbewahrung |
|---|---|---|---|
| FreiKI | 03:00 Uhr | `users/freiki-admin/backups/freiki/` | 7 Generationen |
| KorKI | 02:00 Uhr | `users/freiki-admin/backups/korki/` | 7 Generationen |
| FrankKI | — (Cron prüfen) | `users/freiki-admin/backups/frankki/` | 7 Generationen |

Ein gemeinsamer HiDrive-Account (`freiki-admin`), aber **eigener Unterordner je Instanz** und **eigener SSH-Key je Server** (`~/.ssh/hidrive_backup_key`, dediziert, nicht mit anderen Zwecken geteilt). Authentifizierung ist Key-basiert — kein Passwort im Skript oder in einer Secrets-Datei nötig.

Das Backup enthält:
- Alle Docker-Volumes (Datenbank, Paperless, Mattermost*, Mailserver, n8n, Caddy, Kuma, Portainer, Beszel, ggf. Hermes-Agent-Config*)
- PostgreSQL-Dump (logisch, `pg_dumpall`, alle Datenbanken: freiki/n8n/paperless/mattermost*)
- Stack-Konfiguration (`docker-compose.yml`, `.env`, Caddy, Prompts, `src/`-Code)

*Mattermost/Hermes nur auf FreiKI/KorKI, nicht FrankKI. KorKI schließt zusätzlich lokale LLM-Modell-Volumes (`vllm_cache`, `embedding_cache`) explizit aus — die werden nie gesichert (neu herunterladbar, keine Nutzerdaten, unnötig groß).

Format: `.tar.zst` (zstd-komprimiert, nicht `.tar.gz`/gzip). Transport: `rsync` für Up-/Download (deutlich schneller als SFTP, siehe Geschwindigkeitsvergleich unten), `sftp` fürs Auflisten/Löschen alter Backups (HiDrives SSH-Zugang erlaubt keine Shell-Befehle, nur die rsync/sftp-Subsysteme).

**Verschlüsselung (seit 2026-07-10, FreiKI + KorKI, noch nicht FrankKI):** Bevor das Backup zu HiDrive hochgeladen wird, verschlüsselt `backup.sh` es per GPG (Public-Key-Verfahren, Fingerprint `9B4AB2A2C197D9BC91D6DF20DDE18F512C53F91B`). Auf HiDrive liegen daher nur `.tar.zst.gpg`-Dateien, nie Klartext. Der private Schlüssel liegt NIE auf einem Server, sondern ausschließlich lokal bei Frank Stefan unter `~/Desktop/gpg-backup-key-PRIVAT-SICHERN/freiki-backup-PRIVATE-KEY.asc` — ohne diese Datei (per `gpg --import` in den Keyring einspielen) ist kein Restore möglich. **Diese Datei existiert nur an diesem einen Ort — unbedingt zusätzlich extern sichern (z. B. USB-Stick, Passwort-Manager), sonst sind bei Festplattenausfall alle Backups unwiederbringlich unentschlüsselbar.**

---

## Szenario 1: Einzelnen Dienst wiederherstellen

Wenn nur ein Dienst defekt ist (z. B. n8n-Daten weg):

```bash
# Backup von HiDrive holen (Beispiel FreiKI; HIDRIVE_DIR je Instanz anpassen)
rsync -e "ssh -i ~/.ssh/hidrive_backup_key -o IdentitiesOnly=yes" \
  freiki-admin@rsync.hidrive.ionos.com:users/freiki-admin/backups/freiki/freiki-backup-DATUM.tar.zst.gpg /tmp/

# Entschlüsseln (privaten Schlüssel vorher per "gpg --import" einspielen, siehe Übersicht)
gpg --batch --yes --output /tmp/freiki-backup-DATUM.tar.zst --decrypt /tmp/freiki-backup-DATUM.tar.zst.gpg

zstd -d /tmp/freiki-backup-DATUM.tar.zst -o /tmp/freiki-backup-DATUM.tar
tar xf /tmp/freiki-backup-DATUM.tar -C /tmp/
BACKUP_DIR=/tmp/freiki-DATUM

# Dienst stoppen
cd ~/freiki-package && docker compose stop n8n

# Volume zurückspielen (Volume-Datei ist ebenfalls .tar.zst, zuerst auf dem Host entpacken —
# der Alpine-Container hat kein zstd, siehe zstd-Pfad-Hinweis unten)
zstd -d "${BACKUP_DIR}/freiki-package_n8n_storage.tar.zst" -o "${BACKUP_DIR}/freiki-package_n8n_storage.tar"
docker run --rm \
  -v freiki-package_n8n_storage:/data \
  -v ${BACKUP_DIR}:/backup \
  alpine sh -c "cd /data && tar xf /backup/freiki-package_n8n_storage.tar"

# Dienst starten
docker compose start n8n
```

---

## Szenario 2: Vollständiger Restore (Server-Totalausfall)

### Voraussetzungen

- Neuer Server mit Ubuntu 22.04+, Docker + Docker Compose installiert
- SSH-Key `~/.ssh/hidrive_backup_key` vorhanden (bei komplettem Serververlust: neuen Key generieren und im HiDrive-Panel unter "SSH Schlüssel hinterlegen" nachtragen — der alte Key ist mit dem alten Server verloren)
- `zstd`, `rsync`, `sftp`, `python3`, `gpg` installiert (Standard bei Ubuntu, ggf. `apt install zstd gnupg`)
- Privater GPG-Schlüssel importiert (FreiKI/KorKI, nicht FrankKI): `gpg --import freiki-backup-PRIVATE-KEY.asc` — die Datei liegt nur lokal bei Frank Stefan (siehe Übersicht), muss also von dort mitgebracht werden

### Schritt 1: Restore-Script holen und ausführen

**Kein GitHub nötig.** Das Backup selbst enthält bereits eine vollständige Kopie des Stack-Verzeichnisses (`docker-compose.yml`, Dockerfiles, `.env`, `src/`, Prompts — alles außer `node_modules`/`.git`, siehe `backup.sh`). `restore.sh` erkennt einen leeren `~/freiki-package` und legt ihn direkt aus dem Backup an; Docker baut die Images beim ersten Start selbst neu. Das Script selbst braucht also nur eine Kopie von sich selbst auf dem neuen Server, z. B. per `scp` von einem anderen laufenden FreiKI/KorKI/FrankKI-Server oder von deinem Mac (`freiki-package/setup/restore.sh` bzw. `korki-repo/setup/restore.sh`) — GitHub-Zugriff ist für den Restore selbst nicht erforderlich.

```bash
bash ~/restore.sh
```

Das Script:
1. Listet verfügbare Backups auf HiDrive auf (per SFTP)
2. Lädt das gewählte Backup per `rsync` herunter, entschlüsselt es (`gpg`) und entpackt es (`zstd` + `tar`)
3. Legt `~/freiki-package` aus dem Backup an, falls es noch nicht existiert (frischer Server) — sonst wie gehabt: Stack stoppen, Configs zur Prüfung in `~/freiki-package-restore` legen, auf Bestätigung übernehmen
4. Spielt alle Volumes zurück (roher Volume-Restore, **nicht** der SQL-Dump — der liegt nur als manueller Fallback im Backup, siehe unten)
5. Baut die Images neu und startet den Stack (`docker compose up -d --build`)

### Schritt 3: Nach dem Restore prüfen

- [ ] App-UI erreichbar
- [ ] Mattermost erreichbar (FreiKI/KorKI)
- [ ] Paperless intern erreichbar (`http://localhost:3005`)
- [ ] n8n-Workflows aktiv (`http://localhost:5678`), Schedule-Trigger korrekt (nicht versehentlich auf Sekunden-Intervall stehen geblieben, falls kurz vorher getestet)
- [ ] Mailserver läuft: `docker logs Mailserver`
- [ ] `/api/health` liefert `"status":"healthy"` (FreiKI hat den Endpunkt, KorKI/FrankKI ggf. noch nicht portiert)
- [ ] Uptime Kuma zeigt alle Dienste grün
- [ ] Logos (`app-header.png`, `app-icon-192.png`) korrekt — müssen ggf. manuell kopiert werden, da nicht im Repo

### Schritt 4: DNS prüfen (bei neuer Server-IP)

Domain-Records je Instanz (siehe `README.md` → Instanz-Hierarchie) auf die neue Server-IP zeigen lassen. Bei FreiKI z. B. `app`, `n8n`, `chat`, `mail`, `paperless` unter `freiki.com`.

---

## PostgreSQL manuell wiederherstellen

Nur als Fallback, falls der rohe Volume-Restore nicht funktioniert (z. B. Postgres-Versionswechsel):

```bash
# Einzelne Datenbank aus dem Dump extrahieren (Beispiel: n8n-Datenbank)
zcat postgres-dumpall.sql.gz | grep -A 999999 '\\connect n8n' > n8n.sql

# Einspielen
docker exec -i PostgreSQL psql -U freiki_user -d postgres < n8n.sql
```

Andere Datenbanknamen je nach Instanz: `freiki` (App-Daten/RAG), `paperless`, `mattermost` (nur FreiKI/KorKI). Es gibt keine `flowise`-Datenbank mehr (deaktiviert).

---

## Backup manuell auslösen

```bash
bash ~/freiki-package/setup/backup.sh
```

Fehler werden über ein `FAILURES`-Array getrackt und per Mail gemeldet (`notify()`-Funktion im Skript) — ein Backup, das nur teilweise gelungen ist, meldet sich explizit als fehlgeschlagen, statt stillschweigend "erfolgreich" zu behaupten.

---

## Backup-Integrität prüfen

```bash
# Dateiliste und Größen auf HiDrive
sftp -i ~/.ssh/hidrive_backup_key -o IdentitiesOnly=yes freiki-admin@sftp.hidrive.ionos.com << 'EOF'
cd users/freiki-admin/backups/freiki
ls -la
EOF

# Prüfsumme verifizieren (liegt als .sha256 neben jedem Backup, bezieht sich auf die
# verschlüsselte .gpg-Datei, da die Prüfsumme nach der GPG-Verschlüsselung berechnet wird)
sha256sum -c freiki-backup-DATUM.tar.zst.gpg.sha256
```

---

## Geschwindigkeitsvergleich HiDrive-Protokolle (Stand 2026-07-05)

Getestet mit identischer Testdatei, gleicher Server:

| Protokoll | Geschwindigkeit |
|---|---|
| **rsync (SSH)** — genutzt von backup.sh/restore.sh | ~6–35 MB/s (skaliert mit Dateigröße nach oben) |
| WebDAV (HTTPS) | ~7 MB/s, vergleichbar mit rsync |
| FTPS | ~4 MB/s |
| SFTP | ~0,3 MB/s — mit Abstand am langsamsten, nur fürs Auflisten/Löschen genutzt |

Reale Backup-Läufe: FreiKI 210s (450 MB), KorKI 94s, FrankKI 311s (1,12 GB, davon nur ~35s für den eigentlichen Upload).

---

*Bei Fragen: frank@frank-stefan.de*
