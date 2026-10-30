#!/usr/bin/env python3
"""Build data/articles.json from the hackathon pack.

Sources (real Ahlsell article numbers only):
- project-2 packing protocol, sheet ARTIKELLISTA
- reference-quote.csv from all four projects
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

import openpyxl

PACK = Path(
    "/srv/dev-disk-by-uuid-78a6915b-46d3-4693-a1f2-3761d2c95913/Eddie/Hackathon/2hero/ahl-team-granite"
)
OUT = Path(__file__).resolve().parents[1] / "data" / "articles.json"

TAG_RULES = [
    ("HYLLA", "shelf"),
    ("KROK", "hook"),
    ("DISPENS", "hygiene"),
    ("TORK", "hygiene"),
    ("PAPPER", "hygiene"),
    ("KORG", "hygiene"),
    ("TVÅL", "hygiene"),
    ("HANDDUK", "hygiene"),
    ("TOALETT", "wc"),
    ("WC-", "wc"),
    ("WC ", "wc"),
    ("ARMSTÖD", "wc"),
    ("TVÄTT", "sanitary"),
    ("BADKAR", "sanitary"),
    ("DUSCH", "sanitary"),
    ("SPEGEL", "mirror"),
    ("LUCKA", "hatch"),
    ("HILA", "hatch"),
    ("GÅNGJÄRN", "door"),
    ("DÖRR", "door"),
    ("LÅS", "door"),
    ("HANDTAG", "door"),
    ("CYLINDER", "door"),
    ("SKÅP", "storage"),
    ("GARDIN", "other"),
    ("WHITEBOARD", "other"),
    ("WB-TAVLA", "other"),
]


def tags_for(*parts: str) -> list[str]:
    blob = " ".join(p or "" for p in parts).upper()
    found = []
    for needle, tag in TAG_RULES:
        if needle in blob and tag not in found:
            found.append(tag)
    return found or ["other"]


def add_item(store: dict, article: str, name: str, name2: str, unit: str, quoted: str | None):
    article = str(article or "").strip()
    if not article:
        return
    rec = store.get(article)
    if rec is None:
        rec = {
            "a": article,
            "n": (name or "").strip(),
            "n2": (name2 or "").strip(),
            "u": (unit or "ST").strip() or "ST",
            "t": tags_for(name, name2),
            "q": [],
        }
        store[article] = rec
    else:
        if name and not rec["n"]:
            rec["n"] = name.strip()
        if name2 and not rec["n2"]:
            rec["n2"] = name2.strip()
        rec["t"] = tags_for(rec["n"], rec["n2"])
    if quoted and quoted not in rec["q"]:
        rec["q"].append(quoted)


def main() -> None:
    store: dict[str, dict] = {}
    xlsx = PACK / "project-2-school/packing-protocol-example.xlsx"
    wb = openpyxl.load_workbook(xlsx, data_only=True, read_only=True)
    ws = wb["ARTIKELLISTA"]
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        add_item(store, row[0], row[1], row[2], row[3], None)
    wb.close()

    project_map = {
        "project-1-residential": "residential",
        "project-2-school": "school",
        "project-3-hospital": "hospital",
        "project-4-health-centre": "health-centre",
    }
    for csv_path in sorted(PACK.glob("project-*/reference-quote.csv")):
        src = project_map.get(csv_path.parent.name, csv_path.parent.name)
        with csv_path.open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                add_item(
                    store,
                    row.get("article_no"),
                    row.get("description"),
                    "",
                    row.get("unit"),
                    src,
                )

    items = list(store.values())
    items.sort(key=lambda r: (0 if r["q"] else 1, r["a"]))
    payload = {
        "note": "Hackathon article list, not a live Ahlsell.se download. ARTIKELLISTA from the school packing protocol plus the four reference quotes. Names are the official Swedish article text. No prices.",
        "count": len(items),
        "items": items,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    quoted = sum(1 for r in items if r["q"])
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(items)} articles, {quoted} also in a quote)")


if __name__ == "__main__":
    main()
