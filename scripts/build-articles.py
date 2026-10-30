#!/usr/bin/env python3
"""Build data/articles.json from the hackathon pack.

Sources (real Ahlsell article numbers only):
- project-2 packing protocol, sheet ARTIKELLISTA
- reference-quote.csv from all four projects

English names (ne) are a demo gloss of the official Swedish text.
They are not Ahlsell’s official English catalogue.
"""
from __future__ import annotations

import csv
import json
import re
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

# Longest match first. Official Swedish stays in `n`; this is display English only.
PHRASES = [
    ("TOALETTPAPPERSHÅLLARE", "toilet paper holder"),
    ("RESERVPAPPERSHÅLLARE", "spare paper holder"),
    ("SANITETSPÅSHÅLLARE", "sanitary bag holder"),
    ("NÖDUTRYMNINGSBEHÖR", "emergency exit hardware"),
    ("ABSORBERINGSARK", "absorbent sheet"),
    ("ABSORBERINGSRULLE", "absorbent roll"),
    ("FÖNSTERBÄNKSKONSOL", "window-sill bracket"),
    ("HANDDUKSHÄNGARE", "towel hanger"),
    ("HANDDUKSHÅLLARE", "towel holder"),
    ("TOALETTPAPPER", "toilet paper"),
    ("TOALETTARMSTÖD", "toilet support arm"),
    ("TOALETTBORSTSTÄLL", "toilet brush holder"),
    ("INSPEKTIONSLUCKA", "inspection hatch"),
    ("SÄKERHETSSLUTBLECK", "safety strike plate"),
    ("SÄKERHETSHANDTAG", "safety handle"),
    ("CYLINDERRING", "cylinder ring"),
    ("CYLINDERBEHÖR", "cylinder accessory"),
    ("CYLINDERSKYLT", "cylinder plate"),
    ("CYLINDERSKRUV", "cylinder screw"),
    ("DÖRRSTÄNGARHUS", "door closer body"),
    ("DUSCHDRAPERISTÅNG", "shower curtain rod"),
    ("DUSCHDRAPERISKENA", "shower curtain track"),
    ("DUSCHDRAPERI", "shower curtain"),
    ("FÖNSTERHANDTAG", "window handle"),
    ("HANDRENGÖRING", "hand cleaner"),
    ("HANDDESINFEKTION", "hand disinfectant"),
    ("TVÅLAUTOMAT", "soap dispenser"),
    ("BÄGARDISPENSER", "cup dispenser"),
    ("PAPPERSKORG", "waste bin"),
    ("PAPPERSHÅLLARFÄSTE", "paper-holder bracket"),
    ("BADKARSHANDTAG", "bath grab rail"),
    ("BADRUMSHYLLA", "bathroom shelf"),
    ("BADRUMSSKÅP", "bathroom cabinet"),
    ("HANDDUKSKROK", "towel hook"),
    ("HANDDUKSSKÅP", "towel cabinet"),
    ("SKOLKROK", "coat hook"),
    ("KLÄDKROK", "coat hook"),
    ("KROKLIST", "hook rail"),
    ("HATTHYLLA", "hat shelf"),
    ("SKOHYLLA", "shoe shelf"),
    ("PLÅTHYLLA", "metal shelf"),
    ("TRÅDHYLLA", "wire shelf"),
    ("HYLLPLAN", "shelf board"),
    ("SLANGHYLLA", "hose shelf"),
    ("REDSKAPSHÅLLARE", "tool holder"),
    ("VINKELHÅLLARE", "angle bracket"),
    ("VÄGGHANDTAG", "wall grab rail"),
    ("VÄGGFÄSTE", "wall bracket"),
    ("VÄGGSKENA", "wall track"),
    ("VÄGGSPEGEL", "wall mirror"),
    ("STÖDHANDTAG", "support handle"),
    ("DRAGHANDTAG", "pull handle"),
    ("LÅDHANDTAG", "drawer handle"),
    ("NYCKELHÅLLARE", "key holder"),
    ("NYCKELSKYLT", "key plate"),
    ("NYCKELBRICKA", "key fob"),
    ("NYCKELRING", "key ring"),
    ("TRYCKESSKRUV", "handle screw"),
    ("FASTIGHETSBOX", "letter box unit"),
    ("PIANOGÅNGJÄRN", "piano hinge"),
    ("SVETSGÅNGJÄRN", "welded hinge"),
    ("HAKGÅNGJÄRN", "hook-and-band hinge"),
    ("LYFTGÅNGJÄRN", "lift-off hinge"),
    ("FJÄDERGÅNGJÄRN", "spring hinge"),
    ("KOPPELGÅNGJÄRN", "butt hinge"),
    ("GÅNGJÄRN", "hinge"),
    ("ELSLUTBLECK", "electric strike"),
    ("SLUTBLECK", "strike plate"),
    ("FÖNSTERLÅS", "window lock"),
    ("MAGNETLÅS", "magnetic lock"),
    ("EXCENTERLÅS", "cam lock"),
    ("HÄNGLÅS", "padlock"),
    ("LÅSHUS", "lock case"),
    ("LÅSSTOLPE", "lock post"),
    ("LÅSBOM", "lock bar"),
    ("SKJUTREGEL", "barrel bolt"),
    ("PANIKREGEL", "panic bolt"),
    ("DÖRRSTOPP", "door stop"),
    ("DÖRRBROMS", "door hold-open"),
    ("BREVINKAST", "letter plate"),
    ("POSTLÅDA", "mailbox"),
    ("TORKMATTA", "entrance mat"),
    ("SKRAPMATTA", "scraper mat"),
    ("SKRAPGALLER", "scraper grate"),
    ("TORKRULLE", "wipe roll"),
    ("TORKSTÄLLNING", "drying rack"),
    ("RENGÖRINGSDUK", "cleaning cloth"),
    ("PUTSTRASOR", "cleaning rags"),
    ("SPEGELKLAMMER", "mirror clip"),
    ("SÄKERHETSFOLIE", "safety film"),
    ("SÄKERHETSANORDNING", "safety device"),
    ("VENTILGALLER", "vent grille"),
    ("TALLRIKSVENTIL", "disc valve"),
    ("NIVÅLIST", "threshold strip"),
    ("TRÖSKELLIST", "threshold"),
    ("SKARVLIST", "joint strip"),
    ("BÄRLIST", "support rail"),
    ("KONSOLTÄCKLIST", "bracket cover strip"),
    ("TÄCKSKYLT", "cover plate"),
    ("VREDSKYLT", "thumbturn plate"),
    ("WC-BEHÖR", "WC accessory"),
    ("BEHÖRSSATS", "accessory kit"),
    ("MONTERINGSSTOLPE", "mounting post"),
    ("HÄNGSKENA", "hanging rail"),
    ("DRAPERISKENA", "curtain track"),
    ("GARDINBESLAG", "curtain fitting"),
    ("GARDINSKENA", "curtain track"),
    ("DUSCHSITS", "shower seat"),
    ("SKÖTBORD", "changing table"),
    ("KOMMOD", "vanity unit"),
    ("MESHBACK", "mesh basket"),
    ("TRÅDBACK", "wire basket"),
    ("UTSLAGSBACK", "slop sink"),
    ("TVÄTTSTÄLL", "washbasin"),
    ("HANDKRÄM", "hand cream"),
    ("HUSSIFFRA", "house number"),
    ("BOKSTÄVER", "letters"),
    ("RÖRMÄRKNING", "pipe marking"),
    ("PLATTSTÅNG", "flat bar"),
    ("RUNDRÖR", "round tube"),
    ("LEDHASP", "hasp"),
    ("RODDARPINNE", "dowel pin"),
    ("TRYCKE", "lever handle"),
    ("KONSOL", "bracket"),
    ("SKYLT", "sign / plate"),
    ("DISPENSER", "dispenser"),
    ("INSPEKTION", "inspection"),
    ("LUCKA", "hatch"),
    ("HYLLA", "shelf"),
    ("KROK", "hook"),
    ("SPEGEL", "mirror"),
    ("HANDTAG", "handle"),
    ("HANDDUK", "towel"),
    ("TVÅL", "soap"),
    ("LÅS", "lock"),
    ("NYCKEL", "key"),
    ("DÖRR", "door"),
    ("FÖNSTER", "window"),
    ("CYLINDER", "cylinder"),
    ("STÅL", "steel"),
    ("ROSTFRITT", "stainless"),
    ("ROSTFRI", "stainless"),
    ("POLERAT", "polished"),
    ("POLERAD", "polished"),
    ("SJÄLVHÄFTANDE", "self-adhesive"),
    ("MELAMINBELAGD", "melamine-coated"),
    ("UPPFÄLLBAR", "fold-up"),
    ("UPPFÄLLB", "fold-up"),
    ("CENTRUMMATAD", "centre-feed"),
    ("KOMPLETT", "complete"),
    ("BLANKPOLERAD", "polished"),
    ("ARMREGLAGE", "arm control"),
    ("SÄKERHET", "safety"),
    ("BELYSNING", "lighting"),
    ("SKÅP", "cabinet"),
    ("KORG", "bin"),
    ("HÅLLARE", "holder"),
    ("FÄSTE", "bracket"),
    ("SKENA", "track"),
    ("MATTA", "mat"),
    ("GALLER", "grille"),
    ("VENTIL", "valve"),
    ("RAM", "frame"),
    ("LIST", "strip"),
    ("PACK", "pack"),
    ("HÖGER", "right"),
    ("VÄNSTER", "left"),
    ("SVART", "black"),
    ("GRÅ", "grey"),
    ("BLÅ", "blue"),
    ("VIT", "white"),
    ("SILVER", "silver"),
    ("KROM", "chrome"),
    ("BJÖRK", "birch"),
    ("FURU", "pine"),
    ("PLAST", "plastic"),
    ("ALU", "aluminium"),
    ("ALUM", "aluminium"),
    ("ALUMINIUM", "aluminium"),
    ("INKL", "incl."),
    ("PASSAR", "fits"),
    ("FÖR", "for"),
    ("TILL", "for"),
    ("MED", "with"),
    ("OCH", "and"),
    ("UTAN", "without"),
    ("RFR", "stainless"),
    ("FRP", "pack"),
]

PHRASES.sort(key=lambda pair: len(pair[0]), reverse=True)
_KEEP = re.compile(r"^[0-9A-ZÅÄÖ]+[0-9].*$|^[A-Z]{1,3}\d")


def tags_for(*parts: str) -> list[str]:
    blob = " ".join(p or "" for p in parts).upper()
    found = []
    for needle, tag in TAG_RULES:
        if needle in blob and tag not in found:
            found.append(tag)
    return found or ["other"]


def translate_text(text: str) -> str:
    if not text:
        return ""
    s = text.upper()
    held: list[str] = []

    def park(en: str) -> str:
        held.append(en)
        return f"§{len(held) - 1}§"

    for sv, en in PHRASES:
        if sv in s:
            s = s.replace(sv, park(en))
    for i, en in enumerate(held):
        s = s.replace(f"§{i}§", f" {en} ")
    parts = []
    for tok in s.split():
        if _KEEP.match(tok) or any(ch.isdigit() for ch in tok):
            parts.append(tok)
        else:
            parts.append(tok.lower())
    out = " ".join(parts)
    out = re.sub(r"\s+", " ", out).strip()
    if out:
        out = out[0].upper() + out[1:]
    return out


def english_name(name: str, name2: str) -> str:
    a = translate_text(name)
    b = translate_text(name2)
    return " · ".join(x for x in (a, b) if x)


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
    for rec in items:
        rec["ne"] = english_name(rec["n"], rec["n2"])
    items.sort(key=lambda r: (0 if r["q"] else 1, r["a"]))
    payload = {
        "note": "Hackathon article list, not a live Ahlsell.se download. n/n2 = official Swedish. ne = English gloss for the demo. No prices.",
        "count": len(items),
        "items": items,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    quoted = sum(1 for r in items if r["q"])
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(items)} articles, {quoted} also in a quote)")
    for a in ("309452", "102906", "4029743301", "114130"):
        hit = next((x for x in items if x["a"] == a), None)
        if hit:
            print(f"  {a}: {hit['n']} | {hit.get('n2','')} -> {hit['ne']}")


if __name__ == "__main__":
    main()
