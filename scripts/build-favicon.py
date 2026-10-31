#!/usr/bin/env python3
"""Build Granite tab icons locally. No image API. Rebuild: python3 scripts/build-favicon.py"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img"
FONT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
DARK = (4, 35, 38, 255)
TEAL = (30, 200, 200, 255)

# Path G — no <text>, no embedded PNG. Reads at 16px.
SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#042326"/>
  <path fill="#1ec8c8" d="M16.1 6.1c-5.5 0-9.9 4.4-9.9 9.9s4.4 9.9 9.9 9.9c3.9 0 7.3-2.2 8.9-5.5l-3.7-2c-1 1.9-2.9 3.2-5.2 3.2-3.2 0-5.8-2.6-5.8-5.6s2.6-5.6 5.8-5.6c2.1 0 4 1.1 5.1 2.7h-3.8v3.8h8.9V13.8C24.3 9.5 20.6 6.1 16.1 6.1z"/>
</svg>
"""


def tile(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = max(4, int(size * 0.22))
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=DARK)
    font = ImageFont.truetype(str(FONT), int(size * 0.60))
    bbox = d.textbbox((0, 0), "G", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] + size * 0.02
    d.text((x, y), "G", font=font, fill=TEAL)
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "favicon.svg").write_text(SVG)
    big = tile(180)
    big.save(OUT / "favicon-180.png")
    p32 = tile(32)
    p32.save(OUT / "favicon-32.png")
    p16 = tile(16)
    p16.save(OUT / "favicon-16.png")
    p32.save(OUT / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)])
    print(f"wrote {OUT / 'favicon.svg'} {OUT / 'favicon.ico'} {OUT / 'favicon-32.png'}")


if __name__ == "__main__":
    main()
