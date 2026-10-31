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

# Codes we can place on this sheet (text is in the PDF). Skip doors / other trade.
PLACE = ["H2", "TP3", "TP2", "S1", "IL.4", "IL.5", "IL.6", "IL.7", "AK"]
COLOUR = {
    "H2": (0.91, 0.47, 0.13),
    "TP3": (0.12, 0.78, 0.78),
    "TP2": (0.12, 0.78, 0.78),
    "S1": (0.95, 0.78, 0.22),
    "AK": (0.72, 0.45, 0.95),
    "IL.4": (0.55, 0.58, 0.62),
    "IL.5": (0.55, 0.58, 0.62),
    "IL.6": (0.55, 0.58, 0.62),
    "IL.7": (0.55, 0.58, 0.62),
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
        "This PDF is the BoM API draft stamped on PLAN 09\nso a specialist can open it in Bluebeam Revu.",
        16,
        (0.85, 1, 1),
    )
    box(
        (56, 220, 786, 360),
        "What to do\n"
        "1. Open page 2 in Revu. The Markups List is the first crack.\n"
        "2. Filter by Subject (H2, TP3, IL.5…). Delete what is wrong.\n"
        "3. Add what is missing. Those marks will show your author.\n"
        "4. Save the PDF. Drop that save back into Granite to compare.\n"
        "5. You still sign the quote. Granite does not.",
        13,
        (1, 1, 1),
    )
    box(
        (56, 370, 786, 470),
        f"A-40-1-1091  ·  PLAN 09  ·  {n_marks} draft boxes on the drawing\n"
        "Author of every draft box: Granite\n"
        "Doors and other trades stay off this first crack.\n"
        "Lengths and kit contents are still questions — check those first.",
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
        "GRANITE FIRST CRACK  ·  not a quote  ·  not signed  ·  open Markups List in Revu  ·  delete / add / save  ·  then drop the save back into Granite",
        fontsize=11,
        fontname="hebo",
        color=(1, 1, 1),
        align=fitz.TEXT_ALIGN_LEFT,
    )


def stamp(page: fitz.Page, job: dict) -> int:
    rooms = rooms_on_page(page)
    n = 0
    for code in PLACE:
        note = line_note(job, code)
        rgb = COLOUR.get(code, (0.12, 0.78, 0.78))
        for i, hit in enumerate(unique_hits(page, code), start=1):
            rect = fitz.Rect(hit.x0 - PAD, hit.y0 - PAD, hit.x1 + PAD, hit.y1 + PAD)
            room = nearest_room(rect.tl, rooms) if not code.startswith("IL") else ""
            space = f" Space {room}." if room else ""
            content = (
                f"{code} · {note}{space} "
                "FIRST CRACK — not signed. Check in Revu. Delete if wrong. Add if missing."
            )
            annot = page.add_rect_annot(rect)
            annot.set_colors(stroke=rgb)
            annot.set_border(width=1.6)
            annot.set_opacity(0.95)
            annot.set_info(
                title="Granite",
                subject=code,
                content=content,
            )
            try:
                annot.set_name(f"granite-{code}-{i}")
            except Exception:
                pass
            annot.update()
            n += 1
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
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, deflate=True, garbage=4)
    # Verify markups survived
    check = fitz.open(OUT)
    drawing = check[1]
    annots = list(drawing.annots() or [])
    print(f"wrote {OUT}")
    print(f"pages {check.page_count}  boxes {n}  annots_on_drawing {len(annots)}")
    for a in annots[:5]:
        info = a.info
        print(" ", info.get("subject"), info.get("title"), (info.get("content") or "")[:60])


if __name__ == "__main__":
    main()
