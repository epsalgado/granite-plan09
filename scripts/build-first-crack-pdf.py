#!/usr/bin/env python3
"""Stamp the PLAN 09 BoM draft onto A-40-1-1091 as Revu markups.

Pages: 1 cover · 2 drawing (Revu work) · 3 glance table (open the PDF, no hover).
Author = Granite. Not a quote. Rebuild: python3 scripts/build-first-crack-pdf.py
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "A-40-1-1091.pdf"
JOB = ROOT / "data" / "job.json"
OUT = ROOT / "files" / "granite-plan09-FIRST-CRACK-for-Revu.pdf"

COLOUR = {
    "H2": (0.91, 0.47, 0.13),
    "TP3": (0.12, 0.78, 0.78),
    "TP2": (0.12, 0.78, 0.78),
    "S1": (0.95, 0.78, 0.22),
    "AK": (0.72, 0.45, 0.95),
    "NEED": (0.90, 0.22, 0.16),
    "CHECK": (0.91, 0.47, 0.13),
    "OTHER": (0.45, 0.50, 0.55),
    "DOOR": (0.45, 0.50, 0.55),
}
NOTE_FOCUS = {
    "h2match": "A0-026",
    "h2len": "A0-026",
    "kits": "A0-025",
    "il": None,
    "unknown": "A0-025",
    "quote": "A0-026",
    "nocode": "A0-004",
    "noroom": None,
}
PAD = 8.0
LEGEND_Y = 500.0
FLAG_ORDER = {"NEED": 0, "CHECK": 1, "On sheet": 2, "OTHER TRADE": 3, "OTHER": 4}


def line_flag(ln: dict):
    """Return (revu_subject, glance_flag, comment_prefix, rgb)."""
    code = str(ln.get("code") or "").strip()
    if code in ("—", "-", "–", "−"):
        code = ""
    kind = ln.get("kind") or ""
    floor = ln.get("floor") or ""
    need = ln.get("need") or ln.get("blocker") or ""
    other = floor != "PLAN 09"
    no_code = not code
    trade = kind in ("door", "window", "frame")
    ask = (
        no_code
        or "unknown" in (need + kind).lower()
        or "length" in need.lower()
        or "kit" in need.lower()
        or "type" in need.lower()
    )
    if other:
        return "OTHER", "OTHER", "OTHER · not this sheet", COLOUR["OTHER"]
    if no_code:
        return "NEED", "NEED", "NEED · no type code · fill this in", COLOUR["NEED"]
    if trade:
        return code, "OTHER TRADE", "OTHER TRADE · confirm if this is your job", COLOUR["DOOR"]
    if ask:
        return code or "NEED", "NEED", "NEED · missing spec · fill this in", COLOUR.get(code, COLOUR["NEED"])
    return code, "On sheet", "FIRST CRACK · confirm", COLOUR.get(code, (0.12, 0.78, 0.78))


def rooms_on_page(page: fitz.Page):
    found = []
    for w in page.get_text("words"):
        name = w[4]
        if name.startswith("A0-"):
            found.append((name, fitz.Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)))
    return found


def nearest_room(pt: fitz.Point, rooms) -> str:
    if not rooms:
        return ""
    best = min(rooms, key=lambda r: (r[1].x - pt.x) ** 2 + (r[1].y - pt.y) ** 2)
    return best[0]


def unique_hits(page: fitz.Page, code: str):
    raw = page.search_for(code)
    if code == "AK":
        raw = [r for r in raw if r.y0 > LEGEND_Y]
    if not code.startswith("IL"):
        return raw
    by_row = defaultdict(list)
    for r in raw:
        by_row[round(r.y0 / 6) * 6].append(r)
    return [min(group, key=lambda r: r.x0) for _, group in sorted(by_row.items())]


def glance_rows(job: dict):
    rows = []
    for ln in job.get("lines") or []:
        subject, flag, prefix, rgb = line_flag(ln)
        rows.append(
            {
                "subject": subject,
                "flag": flag,
                "qty": ln.get("qty") or 1,
                "room": ln.get("room") or "—",
                "text": ln.get("text") or "",
                "need": ln.get("need") or ln.get("blocker") or "",
                "rgb": rgb,
                "order": FLAG_ORDER.get(flag, 5),
            }
        )
    for note in job.get("checks") or []:
        rows.append(
            {
                "subject": "CHECK",
                "flag": "CHECK",
                "qty": "—",
                "room": "—",
                "text": note.get("text") or "",
                "need": "Verify before you sign." if not note.get("ok") else "Noted.",
                "rgb": COLOUR["CHECK"],
                "order": FLAG_ORDER["CHECK"],
            }
        )
    claimed = int((job.get("counts") or {}).get("linesClaimed") or 69)
    missing = max(0, claimed - len(job.get("lines") or []))
    if missing:
        rows.append(
            {
                "subject": "CHECK",
                "flag": "CHECK",
                "qty": missing,
                "room": "—",
                "text": f"API export was cut. {missing} of {claimed} lines were not recovered.",
                "need": "Do not treat them as empty.",
                "rgb": COLOUR["CHECK"],
                "order": FLAG_ORDER["CHECK"],
            }
        )
    rows.sort(key=lambda r: (r["order"], str(r["subject"]), str(r["room"]), str(r["text"])))
    return rows


def add_cover(doc: fitz.Document, n_marks: int) -> None:
    page = doc.new_page(width=842, height=595)
    page.draw_rect(page.rect, color=(0.02, 0.15, 0.16), fill=(0.02, 0.15, 0.16))
    page.draw_rect(fitz.Rect(28, 28, 814, 567), color=(0.12, 0.78, 0.78), width=3)

    def box(r, text, fontsize, color, font="helv", bold=False):
        page.insert_textbox(
            fitz.Rect(*r),
            text,
            fontsize=fontsize,
            fontname="hebo" if bold else font,
            color=color,
            align=fitz.TEXT_ALIGN_LEFT,
        )

    box((56, 48, 786, 88), "GRANITE  ·  FIRST CRACK", 14, (0.56, 0.91, 0.91), bold=True)
    box((56, 86, 786, 148), "Not a quote. Not signed.", 36, (1, 1, 1), bold=True)
    box(
        (56, 150, 786, 210),
        "This PDF is the BoM API draft as Revu markups.\nEvery recovered line is already in the Markups List.",
        16,
        (0.85, 1, 1),
    )
    box(
        (56, 220, 786, 360),
        "What to do in Revu\n"
        "1. Open page 2 only — that is the drawing. Alt+L is the first crack.\n"
        "2. Filter NEED and CHECK. Those need your input. Do not re-type them.\n"
        "3. Delete wrong. Fill missing. New marks show your author.\n"
        "4. Save. Drop that save back into Granite to compare.\n"
        "5. You still sign the quote. Granite does not.",
        13,
        (1, 1, 1),
    )
    box(
        (56, 370, 786, 470),
        f"A-40-1-1091  ·  PLAN 09  ·  {n_marks} markups in the list\n"
        "Page 3 is a glance of the same list if you open this PDF without Revu.\n"
        "NEED = missing info. CHECK = a note. OTHER = not this sheet.",
        12,
        (0.85, 1, 1),
    )
    box(
        (56, 500, 786, 548),
        "FIRST CRACK  ·  CHECK IN REVU  ·  STILL NOT AN ORDER",
        14,
        (1, 0.72, 0.27),
        bold=True,
    )


def add_glance(doc: fitz.Document, job: dict, n_marks: int) -> None:
    """Readable table of every draft line. Not the Revu work surface."""
    page = doc.new_page(width=1191, height=842)
    page.draw_rect(page.rect, color=(0.96, 0.97, 0.97), fill=(0.96, 0.97, 0.97))
    page.draw_rect(fitz.Rect(0, 0, 1191, 72), color=(0.02, 0.15, 0.16), fill=(0.02, 0.15, 0.16))

    def put(r, text, size=10, color=(0.08, 0.12, 0.14), bold=False, align=fitz.TEXT_ALIGN_LEFT):
        page.insert_textbox(
            fitz.Rect(*r),
            text,
            fontsize=size,
            fontname="hebo" if bold else "helv",
            color=color,
            align=align,
        )

    put((28, 12, 900, 40), "GLANCE  ·  full API draft  ·  not the work surface", 16, (1, 1, 1), True)
    put(
        (28, 40, 1160, 68),
        f"Revu work is page 2 (drawing + Markups List). This page is the same {n_marks} items as a table, "
        "so you can see what is there without hovering the drawing.",
        11,
        (0.75, 0.95, 0.95),
    )

    rows = glance_rows(job)
    counts = defaultdict(int)
    for r in rows:
        counts[r["flag"]] += 1
    put(
        (28, 80, 1160, 104),
        "  ·  ".join(f"{k} {counts.get(k, 0)}" for k in ("NEED", "CHECK", "On sheet", "OTHER TRADE", "OTHER")),
        11,
        (0.15, 0.22, 0.24),
        True,
    )

    headers = [
        (28, "Subject"),
        (118, "Flag"),
        (228, "Qty"),
        (268, "Room"),
        (348, "Comment"),
        (780, "What is missing / note"),
    ]
    y = 112
    page.draw_rect(fitz.Rect(22, y, 1169, y + 18), color=(0.02, 0.15, 0.16), fill=(0.02, 0.15, 0.16))
    for x, label in headers:
        page.insert_text((x, y + 13), label, fontsize=8, fontname="hebo", color=(1, 1, 1))
    y += 20

    def cell(x, baseline, text, size=7, color=(0.08, 0.12, 0.14), bold=False):
        page.insert_text(
            (x, baseline),
            str(text),
            fontsize=size,
            fontname="hebo" if bold else "helv",
            color=color,
        )

    row_h = 9.0
    for i, r in enumerate(rows):
        if y + row_h > 818:
            break
        bg = (1, 1, 1) if i % 2 == 0 else (0.93, 0.95, 0.95)
        page.draw_rect(fitz.Rect(22, y, 1169, y + row_h), color=bg, fill=bg)
        page.draw_rect(fitz.Rect(22, y, 26, y + row_h), color=r["rgb"], fill=r["rgb"])
        flag_col = (0.72, 0.12, 0.10) if r["flag"] == "NEED" else (
            (0.72, 0.35, 0.05) if r["flag"] == "CHECK" else (0.15, 0.22, 0.24)
        )
        base = y + 7
        cell(28, base, r["subject"], bold=True)
        cell(118, base, r["flag"], color=flag_col, bold=True)
        cell(228, base, r["qty"])
        cell(268, base, r["room"])
        cell(348, base, str(r["text"])[:92])
        cell(780, base, str(r["need"])[:88])
        y += row_h

    put(
        (28, 822, 1160, 838),
        "Work in Revu on page 2. Filter NEED and CHECK. Fill those in. You still sign.",
        9,
        (0.35, 0.22, 0.08),
        True,
    )


def add_banner(page: fitz.Page) -> None:
    bar = fitz.Rect(24, 18, page.rect.width - 24, 54)
    page.draw_rect(bar, color=(0.91, 0.47, 0.13), fill=(0.91, 0.47, 0.13))
    page.insert_textbox(
        bar + (10, 4, -10, -4),
        "GRANITE FIRST CRACK  ·  page 2 of 3  ·  Alt+L is the whole draft  ·  filter NEED and CHECK  ·  page 3 is the glance table",
        fontsize=11,
        fontname="hebo",
        color=(1, 1, 1),
        align=fitz.TEXT_ALIGN_LEFT,
    )


def hits_for(page: fitz.Page, code: str):
    return [fitz.Rect(r) for r in unique_hits(page, code)]


def room_point(rooms, name: str):
    name = (name or "").strip()
    for n, pt in rooms:
        if n.upper() == name.upper():
            return pt
    return None


def pick_hit(hits, rooms, room: str):
    if not hits:
        return None
    pt = room_point(rooms, room)
    if pt:
        hits.sort(key=lambda r: (r.x0 - pt.x) ** 2 + (r.y0 - pt.y) ** 2)
    return hits.pop(0)


def write_box(page: fitz.Page, rect: fitz.Rect, subject: str, content: str, rgb, name: str) -> None:
    annot = page.add_rect_annot(rect)
    annot.set_colors(stroke=rgb)
    annot.set_border(width=1.5)
    annot.set_opacity(0.95)
    annot.set_info(title="Granite", subject=subject, content=content)
    try:
        annot.set_name(name)
    except Exception:
        pass
    annot.update()


def stamp(page: fitz.Page, job: dict) -> int:
    rooms = rooms_on_page(page)
    pool = {}
    for ln in job.get("lines") or []:
        code = str(ln.get("code") or "").strip()
        if code and code not in ("—", "-", "–", "−") and code not in pool:
            pool[code] = hits_for(page, code)
    room_slots = defaultdict(int)
    strip = 0
    n = 0
    w, h = page.rect.width, page.rect.height

    def strip_rect():
        nonlocal strip
        col = strip // 22
        row = strip % 22
        strip += 1
        x = w - 210 - col * 36
        y = 70 + row * 22
        return fitz.Rect(x, y, x + 28, y + 16)

    def room_rect(room: str):
        pt = room_point(rooms, room)
        if not pt:
            return None
        slot = room_slots[room]
        room_slots[room] += 1
        return fitz.Rect(pt.x + 18, pt.y - 8 + slot * 14, pt.x + 46, pt.y + 6 + slot * 14)

    def place(rect, subject, content, rgb, name):
        nonlocal n
        if rect is None:
            rect = strip_rect()
        write_box(page, rect, subject, content, rgb, name)
        n += 1

    for ln in job.get("lines") or []:
        subject, _flag, prefix, rgb = line_flag(ln)
        code = str(ln.get("code") or "").strip()
        room = ln.get("room") or ""
        text = ln.get("text") or ""
        need = ln.get("need") or ln.get("blocker") or ""
        qty = ln.get("qty") or 1
        content = (
            f"{prefix}. {code or 'no code'} · qty {qty} · {room or 'no room'} · {text}. {need} "
            "Author Granite. Not signed. Edit this markup — do not re-type it."
        )
        rect = None
        if code and pool.get(code):
            rect = pick_hit(pool[code], rooms, room)
            if rect:
                rect = fitz.Rect(rect.x0 - PAD, rect.y0 - PAD, rect.x1 + PAD, rect.y1 + PAD)
        if rect is None and room:
            rect = room_rect(room)
        place(rect, subject, content, rgb, f"granite-{ln.get('id')}")

    for i, note in enumerate(job.get("checks") or [], start=1):
        prefix = "CHECK · verify before you sign" if not note.get("ok") else "CHECK · noted"
        content = f"{prefix}. {note.get('text') or ''} Author Granite. Not signed."
        room = NOTE_FOCUS.get(note.get("id"))
        rect = room_rect(room) if room else None
        place(rect, "CHECK", content, COLOUR["CHECK"], f"granite-check-{i}")

    claimed = int((job.get("counts") or {}).get("linesClaimed") or 69)
    missing = max(0, claimed - len(job.get("lines") or []))
    if missing:
        place(
            None,
            "CHECK",
            f"CHECK · API export was cut. {missing} of {claimed} lines were not recovered. Do not treat them as empty. Author Granite.",
            COLOUR["CHECK"],
            "granite-check-cut",
        )
    return n


def main() -> None:
    job = json.loads(JOB.read_text())
    src = fitz.open(SRC)
    page = src[0]
    add_banner(page)
    n = stamp(page, job)
    out = fitz.open()
    add_cover(out, n)
    out.insert_pdf(src)
    add_glance(out, job, n)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, deflate=True, garbage=4)
    check = fitz.open(OUT)
    drawing = check[1]
    annots = list(drawing.annots() or [])
    glance_text = check[2].get_text()
    print(f"wrote {OUT}")
    print(f"pages {check.page_count}  boxes {n}  annots_on_drawing {len(annots)}")
    print("glance_has_NEED", "NEED" in glance_text, "glance_rows_hint", glance_text.count("NEED"))
    for a in annots[:4]:
        info = a.info
        print(" ", info.get("subject"), info.get("title"), (info.get("content") or "")[:60])


if __name__ == "__main__":
    main()
