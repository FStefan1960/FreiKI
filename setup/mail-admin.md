# Mailserver Administration

## Postfächer verwalten

```bash
# Alle Postfächer auflisten
docker exec Mailserver setup email list

# Postfach anlegen
docker exec Mailserver setup email add name@freiki.com PASSWORT

# Passwort ändern
docker exec Mailserver setup email update name@freiki.com NEUES_PASSWORT

# Postfach löschen
docker exec Mailserver setup email del name@freiki.com
```

## Aliase verwalten

```bash
# Alias anlegen (z.B. kontakt@ → info@)
docker exec Mailserver setup alias add kontakt@freiki.com info@freiki.com

# Alias löschen
docker exec Mailserver setup alias del kontakt@freiki.com

# Alle Aliase auflisten
docker exec Mailserver setup alias list
```

## Mail-Queue

```bash
# Queue anzeigen
docker exec Mailserver postqueue -p

# Queue sofort zustellen (z.B. nach Port-25-Freischaltung)
docker exec Mailserver postqueue -f

# Einzelne Mail aus Queue löschen (ID aus postqueue -p)
docker exec Mailserver postsuper -d QUEUE_ID

# Gesamte Queue leeren
docker exec Mailserver postsuper -d ALL
```

## DKIM

```bash
# DKIM-Key (neu) generieren
docker exec Mailserver setup config dkim

# Generierten DNS-Eintrag auslesen
docker exec Mailserver cat /tmp/docker-mailserver/opendkim/keys/freiki.com/mail.txt
```

## Logs

```bash
# Live-Log
docker logs Mailserver -f

# Nur Zustellfehler
docker logs Mailserver 2>&1 | grep -i "deferred\|reject\|bounce"
```

## Mailserver neu starten

```bash
docker restart Mailserver
```
