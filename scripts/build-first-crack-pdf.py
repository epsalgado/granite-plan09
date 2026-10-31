#!/usr/bin/env python3
"""Stamp the PLAN 09 BoM draft onto A-40-1-1091 as Revu markups.

Output is a first-crack PDF: cover page + the drawing with Square annotations.
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


def line_note(job: dict, code: str) -> str:
    bits = []
    for ln in job.get("lines") or []:
        if (ln.get("floor") or "") != "PLAN 09":
            continue
        if str(ln.get("code") or "").upper() != code.upper():
            continue
        text = ln.get("text") or ln.get("need") or ""
        if text and text not in bits:
            bits.append(text)
        need = ln.get("need") or ln.get("blocker") or ""
        if need and need not in bits:
            bits.append(need)
    return " · ".join(bits[:2]) if bits else "Granite first crack — check in Revu"


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
    # Hatch table prints the code twice on one row. Plan marks stay one box each.
    if not code.startswith("IL"):
        return raw
    by_row = defaultdict(list)
    for r in raw:
        by_row[round(r.y0 / 6) * 6].append(r)
    return [min(group, key=lambda r: r.x0) for _, group in sorted(by_row.items())]


def plan09_lines(job: dict):
    return [ln for ln in job.get("lines") or [] if (ln.get("floor") or "") == "PLAN 09"]


def other_lines(job: dict):
    return [ln for ln in job.get("lines") or [] if (ln.get("floor") or "") != "PLAN 09"]


def add_inventory(doc: fitz.Document, job: dict, n_marks: int) -> None:
    page = doc.new_page(width=842, height=595)
    page.draw_rect(page.rect, color=(0.02, 0.15, 0.16), fill=(0.02, 0.15, 0.16))
    page.draw_rect(fitz.Rect(22, 22, 820, 573), color=(0.12, 0.78, 0.78), width=2)

    def put(r, text, size=10, color=(1, 1, 1), bold=False):
        page.insert_textbox(
            fitz.Rect(*r),
            text,
            fontsize=size,
            fontname="hebo" if bold else "helv",
            color=color,
            align=fitz.TEXT_ALIGN_LEFT,
        )

    put((40, 32, 800, 70), "MARKUPS LIST  ·  how to read the first crack", 16, (1, 1, 1), True)
    put(
        (40, 72, 800, 120),
        f"All {n_marks} draft items are already in Revu’s Markups List. "
        "You do not copy them in. Filter by Subject. Fill in NEED and CHECK. You still sign.",
        12,
        (0.85, 1, 1),
    )
    put(
        (40, 128, 800, 280),
        "Subject  ·  what it means\n"
        "H2 / TP3 / IL.5 / AK …  a counted mark on this sheet. Confirm qty and spec.\n"
        "NEED                     no type code or missing length/kit. You fill this in.\n"
        "CHECK                    a draft note. Verify before you sign.\n"
        "OTHER                    on another floor. Keep on the list, not this sheet.\n"
        "DT / PDT / FÖ / IMP      door, window, frame. Other trade — confirm if yours.\n"
        "\n"
        "Author of every first-crack box: Granite. Your adds will show your name.",
        12,
        (1, 1, 1),
    )
    put(
        (40, 300, 800, 430),
        "Work the list, not page 1.\n"
        "1. Open page 3. Alt+L (Markups List).\n"
        "2. Filter Subject = NEED, then CHECK.\n"
        "3. Edit Comment / add a product. Delete what is wrong.\n"
        "4. Save. Drop the save back into Granite.\n"
        "5. Still not an order until you sign.",
        12,
        (0.85, 1, 1),
    )
    put(
        (40, 480, 800, 548),
        "FIRST CRACK  ·  FILL NEED AND CHECK  ·  STILL NOT AN ORDER",
        14,
        (1, 0.72, 0.27),
        True,
    )


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
        "What to do\n"
        "1. Open page 3 in Revu. Alt+L — that list is the first crack.\n"
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
        "Author Granite. Page 2 is only a legend for the Subjects.\n"
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


def add_banner(page: fitz.Page) -> None:
    bar = fitz.Rect(24, 18, page.rect.width - 24, 54)
    page.draw_rect(bar, color=(0.91, 0.47, 0.13), fill=(0.91, 0.47, 0.13))
    page.insert_textbox(
        bar + (10, 4, -10, -4),
        "GRANITE FIRST CRACK  ·  whole draft is in the Markups List  ·  filter NEED and CHECK  ·  fill those in  ·  you still sign",
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
        if code and code not in pool:
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
        code = str(ln.get("code") or "").strip()
        room = ln.get("room") or ""
        kind = ln.get("kind") or ""
        floor = ln.get("floor") or ""
        text = ln.get("text") or ""
        need = ln.get("need") or ln.get("blocker") or ""
        qty = ln.get("qty") or 1
        other = floor != "PLAN 09"
        no_code = not code
        trade = kind in ("door", "window", "frame")
        ask = no_code or "unknown" in (need + kind).lower() or "length" in need.lower() or "kit" in need.lower() or "type" in need.lower()

        if other:
            subject, flag, rgb = "OTHER", "OTHER · not this sheet", COLOUR["OTHER"]
        elif no_code:
            subject, flag, rgb = "NEED", "NEED · no type code · fill this in", COLOUR["NEED"]
        elif trade:
            subject, flag, rgb = code, "OTHER TRADE · confirm if this is your job", COLOUR["DOOR"]
        elif ask:
            subject, flag, rgb = code or "NEED", "NEED · missing spec · fill this in", COLOUR.get(code, COLOUR["NEED"])
        else:
            subject, flag, rgb = code, "FIRST CRACK · confirm", COLOUR.get(code, (0.12, 0.78, 0.78))

        content = (
            f"{flag}. {code or 'no code'} · qty {qty} · {room or 'no room'} · {text}. {need} "
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
        flag = "CHECK · verify before you sign" if not note.get("ok") else "CHECK · noted"
        content = f"{flag}. {note.get('text') or ''} Author Granite. Not signed."
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
    add_inventory(out, job, n)
    out.insert_pdf(src)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, deflate=True, garbage=4)
    # Verify markups survived
    check = fitz.open(OUT)
    drawing = check[2]
    annots = list(drawing.annots() or [])
    print(f"wrote {OUT}")
    print(f"pages {check.page_count}  boxes {n}  annots_on_drawing {len(annots)}")
    for a in annots[:5]:
        info = a.info
        print(" ", info.get("subject"), info.get("title"), (info.get("content") or "")[:60])


if __name__ == "__main__":
    main()
