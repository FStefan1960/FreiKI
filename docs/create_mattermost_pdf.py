#!/usr/bin/env python3
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# FreiKI Brand Colors
FREIKI_TEAL = colors.HexColor('#0d9488')
FREIKI_NAVY = colors.HexColor('#0f172a')
FREIKI_LIGHT = colors.HexColor('#f0fdfa')
FREIKI_GRAY = colors.HexColor('#64748b')
FREIKI_BORDER = colors.HexColor('#ccfbf1')
WHITE = colors.white

OUTPUT = "/Users/frankstefan/ClaudePro/freiki-package/docs/Mattermost-Benutzerhandbuch.pdf"

def build_styles():
    base = getSampleStyleSheet()
    styles = {}

    styles['cover_title'] = ParagraphStyle(
        'cover_title', fontSize=32, leading=40,
        textColor=WHITE, fontName='Helvetica-Bold',
        alignment=TA_CENTER, spaceAfter=8
    )
    styles['cover_sub'] = ParagraphStyle(
        'cover_sub', fontSize=14, leading=20,
        textColor=colors.HexColor('#99f6e4'),
        fontName='Helvetica', alignment=TA_CENTER
    )
    styles['h1'] = ParagraphStyle(
        'h1', fontSize=18, leading=24,
        textColor=FREIKI_TEAL, fontName='Helvetica-Bold',
        spaceBefore=18, spaceAfter=8
    )
    styles['h2'] = ParagraphStyle(
        'h2', fontSize=13, leading=18,
        textColor=FREIKI_NAVY, fontName='Helvetica-Bold',
        spaceBefore=12, spaceAfter=4
    )
    styles['body'] = ParagraphStyle(
        'body', fontSize=10, leading=15,
        textColor=FREIKI_NAVY, fontName='Helvetica',
        spaceAfter=6
    )
    styles['bullet'] = ParagraphStyle(
        'bullet', fontSize=10, leading=15,
        textColor=FREIKI_NAVY, fontName='Helvetica',
        leftIndent=14, spaceAfter=3,
        bulletIndent=4
    )
    styles['code'] = ParagraphStyle(
        'code', fontSize=9, leading=13,
        textColor=FREIKI_NAVY, fontName='Courier',
        backColor=colors.HexColor('#f8f8f8'),
        borderPadding=(4, 6, 4, 6),
        spaceAfter=6
    )
    styles['footer'] = ParagraphStyle(
        'footer', fontSize=8, leading=12,
        textColor=FREIKI_GRAY, fontName='Helvetica',
        alignment=TA_CENTER
    )
    return styles

def table_style(header_bg=FREIKI_TEAL):
    return TableStyle([
        ('BACKGROUND', (0,0), (-1,0), header_bg),
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

def on_page(canvas, doc, styles):
    W, H = A4
    if doc.page == 1:
        # Cover: teal background full page
        canvas.setFillColor(FREIKI_TEAL)
        canvas.rect(0, 0, W, H, fill=1, stroke=0)
        # decorative circle
        canvas.setFillColor(colors.HexColor('#0f766e'))
        canvas.circle(W - 60, H - 60, 120, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor('#115e59'))
        canvas.circle(60, 60, 80, fill=1, stroke=0)
    else:
        # Header bar
        canvas.setFillColor(FREIKI_TEAL)
        canvas.rect(0, H - 1.1*cm, W, 1.1*cm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont('Helvetica-Bold', 9)
        canvas.drawString(1.5*cm, H - 0.75*cm, "Mattermost – Benutzerhandbuch")
        canvas.setFont('Helvetica', 9)
        canvas.drawRightString(W - 1.5*cm, H - 0.75*cm, f"Seite {doc.page - 1}")
        # Footer line
        canvas.setStrokeColor(FREIKI_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(1.5*cm, 1.5*cm, W - 1.5*cm, 1.5*cm)
        canvas.setFillColor(FREIKI_GRAY)
        canvas.setFont('Helvetica', 8)
        canvas.drawCentredString(W/2, 0.9*cm, "Intern · Nur für Mitarbeitende")

def build_pdf():
    s = build_styles()
    W, H = A4
    margin = 1.8*cm
    top_m = 2.2*cm

    doc = SimpleDocTemplate(
        OUTPUT, pagesize=A4,
        leftMargin=margin, rightMargin=margin,
        topMargin=top_m, bottomMargin=2.2*cm
    )

    story = []

    # ── COVER PAGE ──────────────────────────────────────────────────
    story.append(Spacer(1, 4.5*cm))
    story.append(Paragraph("Mattermost", s['cover_title']))
    story.append(Paragraph("Benutzerhandbuch", s['cover_title']))
    story.append(Spacer(1, 0.6*cm))
    story.append(Paragraph("Ihr interner Team-Chat – vollständig erklärt", s['cover_sub']))
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("Für Mitarbeitende · Stand Juni 2026", s['cover_sub']))
    story.append(PageBreak())

    # ── VORWORT ─────────────────────────────────────────────────────
    story.append(Paragraph("Vorwort", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph(
        "Mattermost ist Teil der KorKI-Suite. Bitte nutzen Sie in Mattermost den Kanal "
        "<b>KorKI</b>, um Fehler zu melden, Features zu diskutieren und Ideen zu posten.",
        s['body']
    ))
    story.append(Paragraph(
        "Wir freuen uns außerdem über Usecases aus der Praxis und sind dankbar für "
        "Hinweise auf weitere geeignete Testnutzerinnen und Testnutzer.",
        s['body']
    ))
    story.append(Spacer(1, 0.5*cm))

    # ── CHAPTER 1 ───────────────────────────────────────────────────
    story.append(Paragraph("1. Was ist Mattermost?", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph(
        "Mattermost ist der interne Team-Chat Ihrer Organisation. Er läuft vollständig auf "
        "Ihrem eigenen Server – keine Daten gehen an Slack, Microsoft oder andere Dritte. "
        "Sie melden sich mit denselben Zugangsdaten wie bei FreiKI an.",
        s['body']
    ))

    # ── CHAPTER 2 ───────────────────────────────────────────────────
    story.append(Paragraph("2. Grundbegriffe", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    data = [
        ["Begriff", "Bedeutung"],
        ["Team", "Ihre gesamte Organisation – alle Mitglieder sind Teil desselben Teams"],
        ["Kanal", "Themenraum, in dem Nachrichten ausgetauscht werden"],
        ["Direktnachricht (DM)", "Private Nachricht an eine einzelne Person"],
        ["Gruppennachricht", "Private Nachricht an mehrere Personen gleichzeitig"],
        ["Thread", "Antwort-Kette unter einer bestimmten Nachricht"],
    ]
    t = Table(data, colWidths=[5*cm, 11*cm])
    t.setStyle(table_style())
    story.append(t)

    # ── CHAPTER 3 ───────────────────────────────────────────────────
    story.append(Paragraph("3. Kanäle", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph("Kanaltypen", s['h2']))
    story.append(Paragraph("<b>Öffentliche Kanäle</b>: Für alle Teammitglieder sichtbar und beitrittbar. Geeignet für abteilungsweite Themen.", s['bullet']))
    story.append(Paragraph("<b>Private Kanäle</b>: Nur für eingeladene Mitglieder sichtbar. Geeignet für vertrauliche Themen oder Projektgruppen.", s['bullet']))
    story.append(Paragraph("Kanäle finden und beitreten", s['h2']))
    story.append(Paragraph('Klicken Sie auf <b>„+"</b> neben „Kanäle" in der Seitenleiste → „Kanäle durchsuchen". Öffentliche Kanäle werden gelistet, private nur nach Einladung.', s['body']))
    story.append(Paragraph("Kanal anlegen", s['h2']))
    story.append(Paragraph('„+" → „Neuen Kanal erstellen". Name wählen, Typ (öffentlich/privat), Mitglieder hinzufügen.', s['body']))
    story.append(Paragraph("Kanal verlassen", s['h2']))
    story.append(Paragraph('Rechtsklick auf den Kanal in der Seitenleiste → „Kanal verlassen".', s['body']))

    # ── CHAPTER 4 ───────────────────────────────────────────────────
    story.append(Paragraph("4. Nachrichten schreiben", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph("Formatierung (Markdown)", s['h2']))
    story.append(Paragraph("Mattermost unterstützt Markdown direkt im Textfeld:", s['body']))
    md_data = [
        ["Eingabe", "Ergebnis"],
        ["**fett**", "fett"],
        ["*kursiv*", "kursiv"],
        ["`Code`", "Code (Inline)"],
        ["```codeblock```", "Mehrzeiliger Code"],
        ["# Überschrift", "Überschrift"],
        ["- Punkt", "Aufzählung"],
        ["> Zitat", "Eingerücktes Zitat"],
    ]
    t = Table(md_data, colWidths=[8*cm, 8*cm])
    t.setStyle(table_style())
    story.append(t)
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("Mentions", s['h2']))
    for line in [
        "<b>@Name</b> – benachrichtigt eine bestimmte Person",
        "<b>@all</b> – benachrichtigt alle Kanalmitglieder (sparsam verwenden)",
        "<b>@channel</b> – benachrichtigt alle aktiven Mitglieder des Kanals",
    ]:
        story.append(Paragraph(line, s['bullet']))
    story.append(Paragraph("Emojis", s['h2']))
    story.append(Paragraph(":emoji-name: eingeben oder auf das Smiley-Symbol klicken. Hover über Nachricht → Smiley-Symbol für Reaktionen.", s['body']))
    story.append(Paragraph("Dateien und Bilder hochladen", s['h2']))
    story.append(Paragraph("Büroklammer-Symbol klicken oder Datei per Drag & Drop ins Textfeld ziehen. Unterstützt PDF, DOCX, Bilder und weitere gängige Formate.", s['body']))
    story.append(Paragraph("Nachricht bearbeiten und löschen", s['h2']))
    story.append(Paragraph('Hover über eigene Nachricht → „..." → „Bearbeiten" oder „Löschen".', s['body']))

    # ── CHAPTER 5 ───────────────────────────────────────────────────
    story.append(Paragraph("5. Threads", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph(
        'Antworten Sie direkt unter einer Nachricht statt im Kanal-Hauptstrom: '
        'Hover über Nachricht → „Antworten". Der Thread öffnet sich rechts als eigene Ansicht. '
        'Threads halten Diskussionen übersichtlich und trennen Themen sauber.',
        s['body']
    ))

    # ── CHAPTER 6 ───────────────────────────────────────────────────
    story.append(Paragraph("6. Suche", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph("Das Lupen-Symbol oben öffnet die Suche. Mattermost durchsucht alle Nachrichten in Kanälen, denen Sie angehören.", s['body']))
    search_data = [
        ["Operator", "Funktion"],
        ["from:name", "Nachrichten von einer bestimmten Person"],
        ["in:kanal", "Suche nur in einem bestimmten Kanal"],
        ["before:2025-01-01", "Nachrichten vor einem Datum"],
        ["after:2025-01-01", "Nachrichten nach einem Datum"],
        ['"exakter Satz"', "Exakte Phrase suchen"],
    ]
    t = Table(search_data, colWidths=[5*cm, 11*cm])
    t.setStyle(table_style())
    story.append(t)

    # ── CHAPTER 7 ───────────────────────────────────────────────────
    story.append(Paragraph("7. Nachrichten speichern und anpinnen", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph("Gespeicherte Nachrichten (Lesezeichen)", s['h2']))
    story.append(Paragraph('Hover über Nachricht → Lesezeichen-Symbol. Gespeicherte Nachrichten finden Sie über das Lesezeichen-Symbol oben rechts. Persönliche Merkliste, nur für Sie sichtbar.', s['body']))
    story.append(Paragraph("Angepinnte Nachrichten", s['h2']))
    story.append(Paragraph('Hover über Nachricht → „..." → „An Kanal anpinnen". Angepinnte Nachrichten sind für alle Kanalmitglieder unter dem Pin-Symbol sichtbar. Geeignet für wichtige Infos, die immer auffindbar sein sollen.', s['body']))

    # ── CHAPTER 8 ───────────────────────────────────────────────────
    story.append(Paragraph("8. Benachrichtigungen", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph("Benachrichtigungseinstellungen", s['h2']))
    story.append(Paragraph('Profilbild oben rechts → „Profileinstellungen" → „Benachrichtigungen".', s['body']))
    for line in [
        "<b>Desktop-Benachrichtigungen</b>: Browser-Popup bei neuen Nachrichten",
        "<b>E-Mail-Benachrichtigungen</b>: Zusammenfassung per Mail, wenn Sie offline sind",
        "<b>Schlüsselwörter</b>: Bestimmte Begriffe lösen immer eine Benachrichtigung aus",
    ]:
        story.append(Paragraph(line, s['bullet']))
    story.append(Paragraph("Kanal-spezifische Benachrichtigungen", s['h2']))
    story.append(Paragraph('Klicken Sie auf den Kanalnamen oben → „Benachrichtigungseinstellungen". Hier können Sie einzelne Kanäle stummschalten oder alle Nachrichten notifizieren lassen.', s['body']))
    story.append(Paragraph("Stummschalten & Nicht stören", s['h2']))
    story.append(Paragraph('Rechtsklick auf Kanal → „Stummschalten" für einzelne Kanäle. Für generelles Nicht stören: Klick auf das Status-Symbol → „Nicht stören". Alle Benachrichtigungen werden unterdrückt – auch @Mentions.', s['body']))

    # ── CHAPTER 9 ───────────────────────────────────────────────────
    story.append(Paragraph("9. Status", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph("Klick auf das farbige Punkt-Symbol neben Ihrem Profilbild:", s['body']))
    status_data = [
        ["Symbol", "Status", "Bedeutung"],
        ["Grün", "Online", "Aktiv und erreichbar"],
        ["Gelb", "Gleich zurück", "Kurz abwesend"],
        ["Rot", "Nicht stören", "Keine Benachrichtigungen"],
        ["Grau", "Offline", "Nicht angemeldet"],
    ]
    t = Table(status_data, colWidths=[2.5*cm, 4.5*cm, 9*cm])
    t.setStyle(table_style())
    story.append(t)
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph('Sie können auch eine <b>benutzerdefinierte Status-Nachricht</b> setzen (z. B. „Im Urlaub bis 30.6.").', s['body']))

    # ── CHAPTER 10 ──────────────────────────────────────────────────
    story.append(Paragraph("10. Slash-Befehle", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph("Slash-Befehle werden direkt ins Textfeld eingegeben:", s['body']))
    slash_data = [
        ["Befehl", "Funktion"],
        ["/away", 'Status auf „Gleich zurück" setzen'],
        ["/dnd", '"Nicht stören" aktivieren'],
        ["/online", "Status auf Online setzen"],
        ["/msg @name Text", "Direktnachricht senden"],
        ["/join kanalname", "Kanal beitreten"],
        ["/leave", "Aktuellen Kanal verlassen"],
        ["/search Begriff", "Suche starten"],
        ["/shrug", r"¯\_(ツ)_/¯ in den Chat einfügen"],
    ]
    t = Table(slash_data, colWidths=[5*cm, 11*cm])
    t.setStyle(table_style())
    story.append(t)

    # ── CHAPTER 11 ──────────────────────────────────────────────────
    story.append(Paragraph("11. FreiKI-Bot", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph(
        "Im Team-Chat ist der FreiKI-Bot direkt erreichbar. Er durchsucht die freigegebenen "
        "Wissensbereiche und antwortet direkt im Kanal.",
        s['body']
    ))
    story.append(Paragraph("<b>Verwendung:</b> Schreiben Sie den Bot in einem Kanal an, in dem er Mitglied ist, oder öffnen Sie eine Direktnachricht mit ihm.", s['body']))
    story.append(Paragraph("@FreiKI Was regelt das Wunsch- und Wahlrecht nach SGB IX?", s['code']))
    story.append(Paragraph("Der Bot antwortet mit Quellenangabe aus der internen Wissensdatenbank. Kein Internetzugang – nur internes Wissen.", s['body']))

    # ── CHAPTER 12 ──────────────────────────────────────────────────
    story.append(Paragraph("12. Mobile App", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph("Mattermost gibt es als App für iOS und Android (kostenlos im App Store / Play Store).", s['body']))
    story.append(Paragraph('1. App öffnen → „Server hinzufügen"', s['bullet']))
    story.append(Paragraph('2. Server-URL eingeben: <b>https://chat.freiki.com</b> (bzw. KorKI-Adresse)', s['bullet']))
    story.append(Paragraph("3. Mit Ihren normalen Zugangsdaten anmelden", s['bullet']))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph("Push-Benachrichtigungen funktionieren auch wenn die App im Hintergrund ist.", s['body']))

    # ── CHAPTER 13 ──────────────────────────────────────────────────
    story.append(Paragraph("13. Tastaturkürzel (Desktop)", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    kb_data = [
        ["Kürzel", "Funktion"],
        ["Ctrl + K", "Kanal/Person schnell wechseln"],
        ["Ctrl + F", "Im aktuellen Kanal suchen"],
        ["Pfeil auf (leeres Feld)", "Letzte eigene Nachricht bearbeiten"],
        ["Ctrl + Shift + M", "Erwähnungen anzeigen"],
        ["Ctrl + Shift + L", "Gespeicherte Nachrichten anzeigen"],
        ["Alt + Pfeil auf/ab", "Zwischen Kanälen wechseln"],
        ["Escape", "Thread oder Suchleiste schließen"],
    ]
    t = Table(kb_data, colWidths=[6*cm, 10*cm])
    t.setStyle(table_style())
    story.append(t)

    # ── CHAPTER 14 ──────────────────────────────────────────────────
    story.append(Paragraph("14. Datenschutz", s['h1']))
    story.append(HRFlowable(width="100%", thickness=1.5, color=FREIKI_TEAL, spaceAfter=8))
    story.append(Paragraph(
        "Alle Nachrichten, Dateien und Kanäle verbleiben auf dem eigenen Server der Organisation. "
        "Kein Zugriff durch externe Anbieter. Nachrichten werden nicht automatisch gelöscht – "
        "Administratoren können Aufbewahrungszeiten konfigurieren.",
        s['body']
    ))

    doc.build(
        story,
        onFirstPage=lambda c, d: on_page(c, d, s),
        onLaterPages=lambda c, d: on_page(c, d, s),
    )
    print(f"PDF erstellt: {OUTPUT}")

build_pdf()
