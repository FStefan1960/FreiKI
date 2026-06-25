#!/usr/bin/env python3
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

FREIKI_TEAL  = colors.HexColor('#0d9488')
FREIKI_NAVY  = colors.HexColor('#0f172a')
FREIKI_LIGHT = colors.HexColor('#f0fdfa')
FREIKI_GRAY  = colors.HexColor('#64748b')
FREIKI_BORDER= colors.HexColor('#ccfbf1')
FREIKI_AMBER = colors.HexColor('#fffbeb')
FREIKI_AMBER_BORDER = colors.HexColor('#fde68a')
FREIKI_AMBER_TEXT   = colors.HexColor('#92400e')
WHITE = colors.white

OUTPUT = "/Users/frankstefan/ClaudePro/freiki-package/docs/FreiKI-Wissensbereich-anlegen.pdf"

def styles():
    s = {}
    s['cover_title'] = ParagraphStyle('ct', fontSize=30, leading=38, textColor=WHITE,
        fontName='Helvetica-Bold', alignment=TA_CENTER, spaceAfter=8)
    s['cover_sub'] = ParagraphStyle('cs', fontSize=13, leading=19,
        textColor=colors.HexColor('#99f6e4'), fontName='Helvetica', alignment=TA_CENTER)
    s['h1'] = ParagraphStyle('h1', fontSize=17, leading=22, textColor=FREIKI_TEAL,
        fontName='Helvetica-Bold', spaceBefore=16, spaceAfter=6)
    s['h2'] = ParagraphStyle('h2', fontSize=12, leading=16, textColor=FREIKI_NAVY,
        fontName='Helvetica-Bold', spaceBefore=10, spaceAfter=4)
    s['body'] = ParagraphStyle('body', fontSize=10, leading=15, textColor=FREIKI_NAVY,
        fontName='Helvetica', spaceAfter=5)
    s['bullet'] = ParagraphStyle('bullet', fontSize=10, leading=15, textColor=FREIKI_NAVY,
        fontName='Helvetica', leftIndent=14, spaceAfter=3)
    s['code'] = ParagraphStyle('code', fontSize=9, leading=14, textColor=FREIKI_NAVY,
        fontName='Courier', backColor=colors.HexColor('#f1f5f9'),
        borderPadding=(5, 8, 5, 8), spaceAfter=6, leftIndent=0)
    s['step_num'] = ParagraphStyle('sn', fontSize=22, leading=26, textColor=FREIKI_TEAL,
        fontName='Helvetica-Bold', alignment=TA_CENTER)
    s['hint'] = ParagraphStyle('hint', fontSize=9, leading=13,
        textColor=FREIKI_AMBER_TEXT, fontName='Helvetica',
        backColor=FREIKI_AMBER, borderPadding=(5,8,5,8), spaceAfter=6)
    s['footer'] = ParagraphStyle('foot', fontSize=8, textColor=FREIKI_GRAY,
        fontName='Helvetica', alignment=TA_CENTER)
    return s

def tstyle():
    return TableStyle([
        ('BACKGROUND', (0,0), (-1,0), FREIKI_TEAL),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 10),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 9),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, FREIKI_LIGHT]),
        ('TEXTCOLOR', (0,1), (-1,-1), FREIKI_NAVY),
        ('GRID', (0,0), (-1,-1), 0.5, FREIKI_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ])

def step_box(num, title, s):
    data = [[Paragraph(str(num), s['step_num']), Paragraph(f'<b>{title}</b>', s['h1'])]]
    t = Table(data, colWidths=[1.4*cm, 14.6*cm])
    t.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (1,0), (1,0), 8),
    ]))
    return t

def on_page(canvas, doc):
    W, H = A4
    if doc.page == 1:
        canvas.setFillColor(FREIKI_TEAL)
        canvas.rect(0, 0, W, H, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor('#0f766e'))
        canvas.circle(W-60, H-60, 110, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor('#115e59'))
        canvas.circle(50, 50, 70, fill=1, stroke=0)
    else:
        canvas.setFillColor(FREIKI_TEAL)
        canvas.rect(0, H-1.1*cm, W, 1.1*cm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont('Helvetica-Bold', 9)
        canvas.drawString(1.5*cm, H-0.75*cm, 'FreiKI – Wissensbereich anlegen')
        canvas.setFont('Helvetica', 9)
        canvas.drawRightString(W-1.5*cm, H-0.75*cm, f'Seite {doc.page - 1}')
        canvas.setStrokeColor(FREIKI_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(1.5*cm, 1.4*cm, W-1.5*cm, 1.4*cm)
        canvas.setFillColor(FREIKI_GRAY)
        canvas.setFont('Helvetica', 8)
        canvas.drawCentredString(W/2, 0.8*cm, 'Intern · FreiKI-Administration')

def build():
    s = styles()
    doc = SimpleDocTemplate(OUTPUT, pagesize=A4,
        leftMargin=1.8*cm, rightMargin=1.8*cm,
        topMargin=2.2*cm, bottomMargin=2.2*cm)
    W = 14*cm  # usable width approx

    story = []

    # ── COVER ──────────────────────────────────────────────────────
    story.append(Spacer(1, 4*cm))
    story.append(Paragraph('FreiKI', s['cover_title']))
    story.append(Paragraph('Neuen Wissensbereich anlegen', s['cover_title']))
    story.append(Spacer(1, 0.6*cm))
    story.append(Paragraph('Schritt-für-Schritt · Am Beispiel „Märchen"', s['cover_sub']))
    story.append(Spacer(1, 2.5*cm))
    story.append(Paragraph('Für Administratoren · Stand Juni 2026', s['cover_sub']))
    story.append(PageBreak())

    # ── ÜBERBLICK ──────────────────────────────────────────────────
    story.append(Paragraph('Überblick', s['h1']))
    story.append(HRFlowable(width='100%', thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph(
        'Ein neuer Wissensbereich besteht aus <b>sechs Schritten</b>, die in dieser Reihenfolge ausgeführt werden:', s['body']))
    data = [
        ['Schritt', 'Wo', 'Was'],
        ['1', 'areas.json', 'Bereich registrieren (Schlüssel, Tabelle, Label)'],
        ['2', 'Datenbank', 'Tabelle kb_[schlüssel] in PostgreSQL anlegen'],
        ['3', 'prompts/ + icons/', 'Prompt-Datei und SVG-Icon anlegen'],
        ['4', 'Paperless', 'Tags anlegen und Mailbox-Regel einrichten'],
        ['5', 'FreiKI-UI / n8n', 'Dokumente upserten (Wissen einspielen)'],
        ['6', 'Benutzerverwaltung', 'Benutzerrechte für den neuen Bereich vergeben'],
    ]
    t = Table(data, colWidths=[1.8*cm, 3.5*cm, 10.7*cm])
    t.setStyle(tstyle())
    story.append(t)
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        '<b>Unser Beispiel:</b> Wir legen den Bereich <b>„Märchen"</b> an – Schlüssel <b>maerchen</b>, '
        'Datenbanktabelle <b>kb_maerchen</b>.', s['body']))

    # ── SCHRITT 1 ──────────────────────────────────────────────────
    story.append(Spacer(1, 0.5*cm))
    story.append(step_box(1, 'areas.json – Bereich registrieren', s))
    story.append(HRFlowable(width='100%', thickness=1, color=FREIKI_BORDER, spaceAfter=6))
    story.append(Paragraph(
        'Die Datei <b>freiki-ui/areas.json</b> ist das zentrale Verzeichnis aller Wissensbereiche. '
        'Hier wird festgelegt, unter welchem Schlüssel der Bereich intern heißt, welche '
        'Datenbanktabelle er nutzt und wie er in der Oberfläche bezeichnet wird.', s['body']))
    story.append(Paragraph('Datei öffnen und folgenden Eintrag hinzufügen:', s['body']))
    story.append(Paragraph(
        '"maerchen": {<br/>'
        '&nbsp;&nbsp;"table": "kb_maerchen",<br/>'
        '&nbsp;&nbsp;"label": "Märchen"<br/>'
        '}', s['code']))
    story.append(Paragraph(
        'Der <b>Schlüssel</b> (hier: <b>maerchen</b>) wird intern überall verwendet – '
        'im Prompt-Dateinamen, beim Upsert-Aufruf und in den Benutzerrechten. '
        'Er darf nur Kleinbuchstaben und Unterstriche enthalten, keine Umlaute.', s['body']))
    story.append(Paragraph(
        'Anschließend den Container neu starten, damit server.js die neue areas.json einliest:', s['body']))
    story.append(Paragraph('docker restart FreiKI', s['code']))

    # ── SCHRITT 2: DATENBANK ───────────────────────────────────────
    story.append(Spacer(1, 0.4*cm))
    story.append(step_box(2, 'Datenbanktabelle anlegen', s))
    story.append(HRFlowable(width='100%', thickness=1, color=FREIKI_BORDER, spaceAfter=6))
    story.append(Paragraph(
        'FreiKI legt Datenbanktabellen nicht automatisch an – die Tabelle muss einmalig '
        'per SQL-Befehl erstellt werden. Sie speichert später die Textabschnitte (Chunks) '
        'und ihre Vektoren (Embeddings).', s['body']))
    story.append(Paragraph('Auf dem Server ausführen:', s['body']))
    story.append(Paragraph(
        'docker exec PostgreSQL psql -U [DB_USER] -d [DB_NAME] -c \'<br/>'
        'CREATE TABLE kb_maerchen (<br/>'
        '&nbsp;&nbsp;id uuid PRIMARY KEY DEFAULT gen_random_uuid(),<br/>'
        '&nbsp;&nbsp;"pageContent" text,<br/>'
        '&nbsp;&nbsp;metadata jsonb,<br/>'
        '&nbsp;&nbsp;embedding vector(1024)<br/>'
        ');<br/>'
        'CREATE INDEX ON kb_maerchen USING ivfflat (embedding vector_cosine_ops);\'',
        s['code']))
    story.append(Paragraph(
        '💡 [DB_USER] und [DB_NAME] stehen in der Datei <b>freiki-package/.env</b> '
        'als POSTGRES_USER und POSTGRES_DB. '
        'Die NOTICE über "little data" beim Index ist normal und kann ignoriert werden.', s['hint']))

    # ── SCHRITT 3: PROMPT + ICON ───────────────────────────────────
    story.append(Spacer(1, 0.4*cm))
    story.append(step_box(3, 'Prompt-Datei und Icon anlegen', s))
    story.append(HRFlowable(width='100%', thickness=1, color=FREIKI_BORDER, spaceAfter=6))
    story.append(Paragraph(
        'Jeder Wissensbereich braucht eine <b>Prompt-Datei</b> (steuert das KI-Verhalten) '
        'und ein <b>SVG-Icon</b> (erscheint in der Seitenleiste). '
        'Beide folgen Namenskonventionen mit dem Bereichsschlüssel.', s['body']))
    story.append(Paragraph('<b>Prompt-Datei:</b> freiki-ui/prompts/w_maerchen.md', s['body']))
    story.append(Paragraph(
        '---<br/>'
        'icon: 📖<br/>'
        'title: Märchen<br/>'
        'desc: Klassische Märchen der Gebrüder Grimm und anderer Sammlungen<br/>'
        'welcome: Stellen Sie Ihre Frage zu Märchen – FreiKI sucht in der Märchen-Wissensdatenbank.<br/>'
        'hint: 💡 z.B. „Wer sind die sieben Zwerge?" oder „Was ist die Moral von Rumpelstilzchen?"<br/>'
        'workspace: wissen<br/>'
        '---<br/><br/>'
        'Du bist FreiKI, ein KI-Assistent.<br/><br/>'
        '- Beantworte Fragen ausschließlich auf Basis der bereitgestellten Märchen-Dokumente.<br/>'
        '- Gib keine allgemeinen Antworten aus deinem Vorwissen – nur aus den Dokumenten.<br/>'
        '- Antworte immer auf Deutsch.<br/>'
        '- Wenn die Antwort nicht in den Dokumenten steht, sage das klar.<br/>'
        '- Zitiere wenn möglich den Märchentitel als Quelle.<br/>'
        '- Antworte kindgerecht und bildhaft, aber präzise.<br/><br/>'
        'Füge am Ende eine neue Zeile ein: **Mit freundlicher Unterstützung von FreiKI**',
        s['code']))

    story.append(Paragraph('Die wichtigsten Felder im Kopfbereich (Frontmatter):', s['h2']))
    data = [
        ['Feld', 'Bedeutung'],
        ['icon', 'Emoji, das in der Seitenleiste angezeigt wird'],
        ['title', 'Anzeigename des Bereichs in der UI'],
        ['desc', 'Kurzbeschreibung (erscheint unter dem Titel)'],
        ['welcome', 'Begrüßungstext wenn der Bereich geöffnet wird'],
        ['hint', 'Beispielfrage als Eingabe-Platzhalter'],
        ['workspace', 'Immer "wissen" für Wissensbereiche'],
    ]
    t = Table(data, colWidths=[3*cm, 13*cm])
    t.setStyle(tstyle())
    story.append(t)
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        'Der <b>Prompt-Text unterhalb der ---</b> steuert das Verhalten der KI: '
        'Wie antwortet sie? Wie streng hält sie sich an die Dokumente? Welchen Ton trifft sie? '
        'Passen Sie diesen Text an den Charakter des Bereichs an.', s['body']))
    story.append(Paragraph(
        'Nach dem Speichern der Datei reicht ein:', s['body']))
    story.append(Paragraph('docker restart FreiKI', s['code']))

    story.append(Paragraph('<b>SVG-Icon:</b> freiki-ui/public/icons/w_maerchen.svg', s['body']))
    story.append(Paragraph(
        'Das Icon erscheint in der Seitenleiste neben dem Bereichsnamen. Es folgt dem Stil der '
        'anderen Icons: <b>viewBox="0 0 20 20"</b>, Farbe über <b>currentColor</b> (passt sich '
        'automatisch an hell/dunkel an), Stroke-basiertes Outline-Design, kein fest kodiertes Colorset.', s['body']))
    story.append(Paragraph(
        'Beispiel Krone (w_maerchen.svg):', s['body']))
    story.append(Paragraph(
        '&lt;svg viewBox="0 0 20 20" fill="none" stroke="currentColor"<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;stroke-width="1.7" stroke-linecap="round"<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;stroke-linejoin="round"<br/>'
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;xmlns="http://www.w3.org/2000/svg"&gt;<br/>'
        '&nbsp;&nbsp;&lt;path d="M3 15 L3 9 L6.5 12 L10 4 L13.5 12 L17 9 L17 15 Z"/&gt;<br/>'
        '&nbsp;&nbsp;&lt;rect x="3" y="15" width="14" height="3" rx="1"/&gt;<br/>'
        '&nbsp;&nbsp;&lt;circle cx="3" cy="9" r="1" fill="currentColor" stroke="none"/&gt;<br/>'
        '&nbsp;&nbsp;&lt;circle cx="10" cy="4" r="1" fill="currentColor" stroke="none"/&gt;<br/>'
        '&nbsp;&nbsp;&lt;circle cx="17" cy="9" r="1" fill="currentColor" stroke="none"/&gt;<br/>'
        '&lt;/svg&gt;',
        s['code']))
    story.append(Paragraph(
        'Kein Container-Neustart nötig – Icons werden als statische Dateien direkt ausgeliefert.', s['body']))

    # ── SCHRITT 4 ──────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(step_box(4, 'Paperless – Tags und Mailbox-Regel', s))
    story.append(HRFlowable(width='100%', thickness=1, color=FREIKI_BORDER, spaceAfter=6))
    story.append(Paragraph(
        'Paperless nutzt Tags, um Dokumente automatisch dem richtigen Wissensbereich zuzuordnen. '
        'Für jeden Bereich werden zwei Tags benötigt:', s['body']))

    data = [
        ['Tag', 'Funktion'],
        ['bereich-maerchen', 'Kennzeichnet, zu welchem Wissensbereich ein Dokument gehört'],
        ['not-yet-tagged', 'Bereits vorhanden – markiert neue, noch nicht verarbeitete Dokumente'],
        ['ki-synced', 'Bereits vorhanden – wird gesetzt, nachdem n8n das Dokument eingespielt hat'],
        ['kein-wissen', 'Bereits vorhanden – schließt ein Dokument vom KB-Sync aus'],
    ]
    t = Table(data, colWidths=[4.5*cm, 11.5*cm])
    t.setStyle(tstyle())
    story.append(t)

    story.append(Paragraph('Tag anlegen in Paperless', s['h2']))
    for step in [
        'In Paperless anmelden → <b>Tags</b> in der linken Navigation öffnen',
        'Oben rechts auf <b>„+ Hinzufügen"</b> klicken',
        'Name eingeben: <b>bereich-maerchen</b> (exakt so, mit Bindestrich)',
        'Farbe wählen (optional) → Speichern',
    ]:
        story.append(Paragraph(f'• {step}', s['bullet']))

    story.append(Paragraph('Mailbox-Regel für Manager-Konten (optional)', s['h2']))
    story.append(Paragraph(
        'Wenn ein Manager-Konto Dokumente per E-Mail an <b>paperless@freiki.com</b> schickt, '
        'kann Paperless diese automatisch mit dem Bereichs-Tag versehen:', s['body']))
    for step in [
        'In Paperless → <b>Mail-Regeln</b> → <b>„+ Neue Regel"</b>',
        'Konto auswählen (das Manager-Postfach)',
        'Unter <b>„Aktionen"</b>: Tag <b>bereich-maerchen</b> zuweisen',
        'Zusätzlich Tag <b>not-yet-tagged</b> zuweisen (damit n8n das Dokument erkennt)',
        'Speichern',
    ]:
        story.append(Paragraph(f'• {step}', s['bullet']))

    story.append(Paragraph(
        '💡 Manager mit nur einem Bereich profitieren von der automatischen Tagvergabe. '
        'Manager mit mehreren Bereichen müssen Dokumente in Paperless manuell taggen.', s['hint']))

    story.append(Paragraph('Tag-Lebenszyklus eines Dokuments', s['h2']))
    data = [
        ['Phase', 'Tags am Dokument'],
        ['Dokument geht ein (Mail oder Upload)', 'not-yet-tagged + bereich-maerchen'],
        ['n8n verarbeitet das Dokument', 'bereich-maerchen (not-yet-tagged wird entfernt)'],
        ['Erfolgreich in KB eingespielt', 'bereich-maerchen + ki-synced'],
        ['Vom KB-Sync ausschließen', 'kein-wissen (statt not-yet-tagged setzen)'],
    ]
    t = Table(data, colWidths=[6*cm, 10*cm])
    t.setStyle(tstyle())
    story.append(t)

    # ── SCHRITT 5 ──────────────────────────────────────────────────
    story.append(Spacer(1, 0.5*cm))
    story.append(step_box(5, 'Dokumente upserten', s))
    story.append(HRFlowable(width='100%', thickness=1, color=FREIKI_BORDER, spaceAfter=6))
    story.append(Paragraph(
        'Unter „Upserten" versteht man das Einlesen von Dokumenten in die Wissensdatenbank – '
        'FreiKI zerlegt den Text in Abschnitte (Chunks), wandelt jeden Abschnitt in einen '
        'Zahlenvektor (Embedding) um und speichert beides in der Tabelle <b>kb_maerchen</b>. '
        'Bei einer späteren Suchanfrage findet FreiKI die passendsten Abschnitte per Vektorsuche.', s['body']))

    story.append(Paragraph('Weg 1 – Über die FreiKI-Oberfläche (empfohlen)', s['h2']))
    for step in [
        'Als <b>Admin oder Manager</b> in FreiKI einloggen',
        'Modus <b>„Wissen hinterlegen"</b> öffnen',
        'Wissensbereich <b>„Märchen"</b> auswählen',
        'Dateien per Drag & Drop hochladen (PDF, DOCX, TXT)',
        'Optional: <b>„Bereich vorher leeren"</b> aktivieren, um alten Inhalt zu ersetzen',
        'Auf <b>„Einlesen"</b> klicken – Fortschritt wird live angezeigt',
    ]:
        story.append(Paragraph(f'• {step}', s['bullet']))

    story.append(Paragraph('Weg 2 – Automatisch über n8n (Paperless-Sync)', s['h2']))
    story.append(Paragraph(
        'Der Paperless-Sync-Workflow in n8n läuft regelmäßig und verarbeitet alle Dokumente '
        'mit Tag <b>not-yet-tagged</b> automatisch:', s['body']))
    for step in [
        'n8n erkennt das Dokument an Tag <b>not-yet-tagged + bereich-maerchen</b>',
        'n8n lädt den Volltext aus Paperless herunter',
        'n8n ruft <b>POST /api/kb-ingest-text</b> auf FreiKI auf (mit X-API-Key)',
        'FreiKI chunked und embedded den Text in <b>kb_maerchen</b>',
        'n8n entfernt <b>not-yet-tagged</b>, setzt <b>ki-synced</b>',
    ]:
        story.append(Paragraph(f'• {step}', s['bullet']))

    story.append(Paragraph('Weg 3 – Direkter API-Aufruf (für Entwickler)', s['h2']))
    story.append(Paragraph(
        'POST https://app.freiki.com/api/kb-ingest-text', s['code']))
    data = [
        ['Parameter', 'Wert im Beispiel'],
        ['Header X-API-Key', 'KB_INGEST_API_KEY aus .env'],
        ['bereich', 'maerchen'],
        ['text', 'Der vollständige Dokumenttext'],
        ['source', 'Titel des Dokuments (erscheint als Quellenangabe)'],
        ['source_url', 'Optionaler Link zurück zum Dokument in Paperless'],
    ]
    t = Table(data, colWidths=[5*cm, 11*cm])
    t.setStyle(tstyle())
    story.append(t)

    # ── SCHRITT 6: BENUTZERRECHTE ──────────────────────────────────
    story.append(Spacer(1, 0.5*cm))
    story.append(step_box(6, 'Benutzerrechte vergeben', s))
    story.append(HRFlowable(width='100%', thickness=1, color=FREIKI_BORDER, spaceAfter=6))
    story.append(Paragraph(
        'Standardmäßig sieht kein Nutzer den neuen Bereich – er muss explizit freigeschaltet werden.', s['body']))
    story.append(Paragraph('In der FreiKI-Benutzerverwaltung (Admin → Benutzer):', s['body']))
    for step in [
        'Nutzer auswählen → <b>„Bearbeiten"</b>',
        'Im Feld <b>„Wissensbereiche (Lesen)"</b> den Eintrag <b>maerchen</b> hinzufügen',
        'Optional: Im Feld <b>„Wissensbereiche (Schreiben)"</b> für Manager eintragen',
        'Speichern – der Nutzer sieht den Bereich ab dem nächsten Login',
    ]:
        story.append(Paragraph(f'• {step}', s['bullet']))

    story.append(Paragraph(
        '💡 Der Schlüssel muss exakt so eingetragen werden wie in areas.json – also <b>maerchen</b> '
        '(ohne Umlaut, ohne Leerzeichen).', s['hint']))

    # ── ZUSAMMENFASSUNG ────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph('Zusammenfassung – Checkliste', s['h1']))
    story.append(HRFlowable(width='100%', thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    data = [
        ['✓', 'Was', 'Wo'],
        ['☐', 'Eintrag "maerchen" in areas.json ergänzt', 'freiki-ui/areas.json'],
        ['☐', 'Datenbanktabelle kb_maerchen angelegt (psql)', 'PostgreSQL'],
        ['☐', 'Prompt-Datei w_maerchen.md angelegt', 'freiki-ui/prompts/'],
        ['☐', 'SVG-Icon w_maerchen.svg angelegt', 'freiki-ui/public/icons/'],
        ['☐', 'docker restart FreiKI ausgeführt', 'Server'],
        ['☐', 'Tag bereich-maerchen in Paperless angelegt', 'Paperless → Tags'],
        ['☐', 'Mailbox-Regel für Manager eingerichtet (falls gewünscht)', 'Paperless → Mail-Regeln'],
        ['☐', 'Dokumente mit not-yet-tagged + bereich-maerchen versehen', 'Paperless'],
        ['☐', 'Erste Dokumente upserted (UI oder n8n-Sync abgewartet)', 'FreiKI oder n8n'],
        ['☐', 'Benutzerrechte vergeben', 'FreiKI → Benutzerverwaltung'],
        ['☐', 'Test: Frage im neuen Bereich stellen', 'FreiKI → Wissenssuche'],
    ]
    t = Table(data, colWidths=[0.7*cm, 10.3*cm, 5*cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), FREIKI_TEAL),
        ('TEXTCOLOR', (0,0), (-1,0), WHITE),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 10),
        ('FONTNAME', (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE', (0,1), (-1,-1), 9),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [WHITE, FREIKI_LIGHT]),
        ('TEXTCOLOR', (0,1), (-1,-1), FREIKI_NAVY),
        ('GRID', (0,0), (-1,-1), 0.5, FREIKI_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('FONTSIZE', (0,1), (0,-1), 13),
        ('TEXTCOLOR', (0,1), (0,-1), FREIKI_TEAL),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t)

    doc.build(story,
        onFirstPage=lambda c,d: on_page(c,d),
        onLaterPages=lambda c,d: on_page(c,d))
    print(f'PDF erstellt: {OUTPUT}')

build()
