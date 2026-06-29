# Mailserver Administration – fst60.de

## Postfächer verwalten

```bash
# Alle Postfächer auflisten
docker exec Mailserver setup email list

# Postfach anlegen
docker exec Mailserver setup email add name@fst60.de PASSWORT

# Passwort ändern
docker exec Mailserver setup email update name@fst60.de NEUES_PASSWORT

# Postfach löschen
docker exec Mailserver setup email del name@fst60.de
```

Sinnvolle Postfächer für Frank-KI:
```bash
docker exec Mailserver setup email add frank@fst60.de PASSWORT
docker exec Mailserver setup email add noreply@fst60.de PASSWORT
docker exec Mailserver setup email add postmaster@fst60.de PASSWORT
```

## Aliase verwalten

```bash
# Alias anlegen
docker exec Mailserver setup alias add kontakt@fst60.de frank@fst60.de

# Alias löschen
docker exec Mailserver setup alias del kontakt@fst60.de

# Alle Aliase auflisten
docker exec Mailserver setup alias list
```

## DKIM einrichten

```bash
# DKIM-Key generieren (einmalig nach erstem Start)
docker exec Mailserver setup config dkim

# DNS-Eintrag auslesen → in Hoster-DNS eintragen
docker exec Mailserver cat /tmp/docker-mailserver/opendkim/keys/fst60.de/mail.txt
```

Erforderliche DNS-Einträge (zusätzlich zu A-Records für Caddy):
```
MX      fst60.de           →  mail.fst60.de  (Priorität 10)
A       mail.fst60.de      →  <Server-IP>
TXT     fst60.de           →  "v=spf1 mx ~all"
TXT     mail._domainkey.fst60.de  →  <Ausgabe von mail.txt>
TXT     _dmarc.fst60.de    →  "v=DMARC1; p=none; rua=mailto:postmaster@fst60.de"
```

## Mail-Queue

```bash
docker exec Mailserver postqueue -p       # Queue anzeigen
docker exec Mailserver postqueue -f       # sofort zustellen
docker exec Mailserver postsuper -d ALL   # Queue leeren
```

## Logs

```bash
docker logs Mailserver -f
docker logs Mailserver 2>&1 | grep -i "deferred\|reject\|bounce"
```
