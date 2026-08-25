#!/usr/bin/env python3
"""Erzeugt die Benutzerhandbuch-PDFs aus den Markdown-Quellen (reportlab)."""
import re
import shutil
import sys
from pathlib import Path

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )
except ImportError:
    sys.exit("reportlab fehlt. Beispiel: /opt/anaconda3/bin/python docs/create_benutzerhandbuch_pdf.py")

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
WHITE = colors.white

JOBS = [
    {
        "src": ROOT / "Benutzerhandbuch.md",
        "out": ROOT / "FreiKI-Benutzerhandbuch.pdf",
        "brand": "FreiKI",
        "color": colors.HexColor("#1f54c0"),
        "navy": colors.HexColor("#14306b"),
        "light": colors.HexColor("#eef3fb"),
        "runtime": REPO / "freiki-ui" / "FreiKI_Benutzerhandbuch.pdf",
        "alias": ROOT / "Benutzerhandbuch.pdf",
        "subtitle": "Benutzerhandbuch",
        "cover_note": "Stand Version 0.8.1 · August 2026",
    },
    {
        "src": ROOT / "KorKI-Benutzerhandbuch.md",
        "out": ROOT / "KorKI-Benutzerhandbuch.pdf",
        "brand": "KorKI",
        "color": colors.HexColor("#0d9488"),
        "navy": colors.HexColor("#0f172a"),
        "light": colors.HexColor("#f0fdfa"),
        "runtime": REPO / "freiki-ui" / "KorKI_Benutzerhandbuch.pdf",
        "alias": None,
        "subtitle": "Benutzerhandbuch",
        "cover_note": "Stand Version 0.8.1 · August 2026 · Diakonie Kork",
    },
]


def styles(brand_color, navy):
    gray = colors.HexColor("#64748b")
    return {
        "h1": ParagraphStyle("h1", fontSize=16, leading=20, textColor=brand_color,
                             fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=6),
        "h2": ParagraphStyle("h2", fontSize=12, leading=16, textColor=navy,
                             fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("body", fontSize=10, leading=14.5, textColor=navy,
                               fontName="Helvetica", spaceAfter=5, alignment=TA_LEFT),
        "bullet": ParagraphStyle("bullet", fontSize=10, leading=14.5, textColor=navy,
                                 fontName="Helvetica", leftIndent=14, spaceAfter=2.5,
                                 bulletIndent=4),
        "quote": ParagraphStyle("quote", fontSize=10, leading=14.5, textColor=navy,
                                fontName="Helvetica", leftIndent=10, spaceAfter=6,
                                backColor=colors.HexColor("#f8fafc")),
        "cover_title": ParagraphStyle("ct", fontSize=30, leading=36, textColor=WHITE,
                                      fontName="Helvetica-Bold", alignment=TA_CENTER, spaceAfter=8),
        "cover_sub": ParagraphStyle("cs", fontSize=13, leading=18,
                                    textColor=WHITE, fontName="Helvetica", alignment=TA_CENTER),
        "footer": ParagraphStyle("foot", fontSize=8, textColor=gray,
                                 fontName="Helvetica", alignment=TA_CENTER),
        "th": ParagraphStyle("th", fontSize=8.5, leading=11, textColor=WHITE,
                             fontName="Helvetica-Bold"),
        "td": ParagraphStyle("td", fontSize=8.5, leading=11, textColor=navy,
                             fontName="Helvetica"),
    }


def inline(text):
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = text.replace("⚠️", "<b>Achtung:</b>")
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`([^`]+)`", r'<font face="Courier" size="9">\1</font>', text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    return text


def parse_table(lines, s, brand_color, light, navy):
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells and set(cells[0]) <= set("-: "):
            continue
        rows.append(cells)
    if not rows:
        return None
    ncols = max(len(r) for r in rows)
    for r in rows:
        while len(r) < ncols:
            r.append("")
    styled = []
    for i, r in enumerate(rows):
        st = s["th"] if i == 0 else s["td"]
        styled.append([Paragraph(inline(c), st) for c in r])
    usable = 16.4 * cm
    col_w = usable / ncols
    t = Table(styled, colWidths=[col_w] * ncols, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), brand_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, light]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def md_to_story(md, s, brand_color, light, navy):
    story = []
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped == "---":
            story.append(HRFlowable(width="100%", thickness=1, color=brand_color, spaceAfter=8, spaceBefore=4))
            i += 1
            continue

        if stripped.startswith("# ") and not stripped.startswith("## "):
            # Titelseite kommt separat; H1 im Fließtext überspringen, wenn es der Dateititel ist
            i += 1
            continue

        if stripped.startswith("## "):
            story.append(Paragraph(inline(stripped[3:]), s["h1"]))
            i += 1
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(inline(stripped[4:]), s["h2"]))
            i += 1
            continue

        if stripped.startswith("|"):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            tbl = parse_table(block, s, brand_color, light, navy)
            if tbl:
                story.append(Spacer(1, 0.15 * cm))
                story.append(tbl)
                story.append(Spacer(1, 0.2 * cm))
            continue

        if stripped.startswith("> "):
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip().lstrip(">").strip())
                i += 1
            story.append(Paragraph(inline(" ".join(quote)), s["quote"]))
            continue

        if stripped.startswith("- "):
            while i < len(lines) and lines[i].strip().startswith("- "):
                item = lines[i].strip()[2:]
                story.append(Paragraph("• " + inline(item), s["bullet"]))
                i += 1
            story.append(Spacer(1, 0.08 * cm))
            continue

        para = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (not nxt or nxt.startswith("#") or nxt.startswith("|")
                    or nxt.startswith("- ") or nxt.startswith("> ") or nxt == "---"):
                break
            para.append(nxt)
            i += 1
        story.append(Paragraph(inline(" ".join(para)), s["body"]))
    return story


def on_page_factory(job):
    def on_page(canvas, doc):
        W, H = A4
        if doc.page == 1:
            canvas.setFillColor(job["color"])
            canvas.rect(0, 0, W, H, fill=1, stroke=0)
            canvas.setFillColor(job["navy"])
            canvas.circle(-20, H + 40, 160, fill=1, stroke=0)
            canvas.circle(W + 40, 40, 140, fill=1, stroke=0)
            return
        canvas.setFillColor(job["color"])
        canvas.rect(0, H - 1.05 * cm, W, 1.05 * cm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(1.5 * cm, H - 0.7 * cm, f"{job['brand']} – Benutzerhandbuch")
        canvas.setFont("Helvetica", 9)
        canvas.drawRightString(W - 1.5 * cm, H - 0.7 * cm, f"Seite {doc.page - 1}")
        canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
        canvas.setLineWidth(0.4)
        canvas.line(1.5 * cm, 1.35 * cm, W - 1.5 * cm, 1.35 * cm)
        canvas.setFillColor(colors.HexColor("#64748b"))
        canvas.setFont("Helvetica", 8)
        canvas.drawCentredString(W / 2, 0.75 * cm, job["cover_note"])
    return on_page


def build(job):
    md = job["src"].read_text(encoding="utf-8")
    s = styles(job["color"], job["navy"])
    doc = SimpleDocTemplate(
        str(job["out"]), pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=2.1 * cm, bottomMargin=2.0 * cm,
        title=f"{job['brand']} – Benutzerhandbuch",
        author=job["brand"],
    )
    story = [
        Spacer(1, 5.5 * cm),
        Paragraph(job["brand"], s["cover_title"]),
        Paragraph(job["subtitle"], s["cover_title"]),
        Spacer(1, 1.2 * cm),
        Paragraph(job["cover_note"], s["cover_sub"]),
        PageBreak(),
    ]
    story.extend(md_to_story(md, s, job["color"], job["light"], job["navy"]))
    doc.build(story, onFirstPage=on_page_factory(job), onLaterPages=on_page_factory(job))
    print(f"OK  {job['out']}")
    if job.get("runtime"):
        shutil.copy2(job["out"], job["runtime"])
        print(f"->  {job['runtime']}")
    if job.get("alias"):
        shutil.copy2(job["out"], job["alias"])
        print(f"->  {job['alias']}")


if __name__ == "__main__":
    for job in JOBS:
        build(job)
    sys.exit(0)
