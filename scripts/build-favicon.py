#!/usr/bin/env python3
"""Build Granite tab icons locally. No image API. Rebuild: python3 scripts/build-favicon.py

Three-room floor plate + one first-crack mark. Not a letter.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img"
DARK = (4, 35, 38, 255)
TEAL = (30, 200, 200, 255)
AMBER = (232, 119, 34, 255)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#042326"/>
  <rect x="6.4" y="6.4" width="19.2" height="19.2" rx="1.2" fill="none" stroke="#1ec8c8" stroke-width="2.2"/>
  <path fill="none" stroke="#1ec8c8" stroke-width="2.2" d="M14.8 6.4 V25.6 M14.8 16 H25.6"/>
  <rect x="16.6" y="17.4" width="7.2" height="6.4" rx="0.5" fill="#e87722"/>
</svg>
"""


def xy(size, n):
    return n * size / 32


def tile(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = max(3, int(size * 0.22))
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=DARK)
    w = max(2, round(size * 2.2 / 32))
    inset = xy(size, 6.4)
    outer = [inset, inset, size - 1 - inset, size - 1 - inset]
    d.rounded_rectangle(outer, radius=max(1, size // 24), outline=TEAL, width=w)
    mid_x = xy(size, 14.8)
    mid_y = xy(size, 16)
    d.line([(mid_x, inset), (mid_x, size - 1 - inset)], fill=TEAL, width=w)
    d.line([(mid_x, mid_y), (size - 1 - inset, mid_y)], fill=TEAL, width=w)
    d.rounded_rectangle(
        [xy(size, 16.6), xy(size, 17.4), xy(size, 16.6 + 7.2), xy(size, 17.4 + 6.4)],
        radius=max(1, size // 32),
        fill=AMBER,
    )
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "favicon.svg").write_text(SVG)
    tile(180).save(OUT / "favicon-180.png")
    p32 = tile(32)
    p32.save(OUT / "favicon-32.png")
    tile(16).save(OUT / "favicon-16.png")
    p32.save(OUT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)])
    print(f"wrote {OUT / 'favicon.svg'} {OUT / 'favicon.ico'} {OUT / 'favicon-32.png'}")


if __name__ == "__main__":
    main()
