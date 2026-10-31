#!/usr/bin/env python3
"""Cut Eddie's six Brave takes into the ~90s dream film. Captions, no voice.

  python3 scripts/build-dream-cut.py
"""
from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / ".py-tts" / "imageio_ffmpeg" / "binaries" / "ffmpeg-linux64-v4.2.2"
SRC = Path(
    "/srv/dev-disk-by-uuid-78a6915b-46d3-4693-a1f2-3761d2c95913"
    "/Eddie/Hackathon/2hero/screenshots"
)
WORK = ROOT / "files" / "demo-video" / "cut-work"
OUT = ROOT / "files" / "demo-video" / "granite-plan09-dream.mp4"
ASS = ROOT / "files" / "demo-video" / "dream-captions.ass"
COPY = SRC / "granite-plan09-dream.mp4"

# (file, start, duration) — useful action only
SEGS = [
    ("1-dream.mp4", 0.40, 10.00),   # ask: landing + A-40-1-1091
    ("2-dream.mp4", 0.30, 12.50),   # two doors
    ("3-dream.mp4", 1.00, 24.00),   # empty sheet, zoom
    ("4-dream.mp4", 13.50, 9.00),   # take the first-crack PDF
    ("5-dream.mp4", 8.00, 8.00),    # page 2, boxes
    ("5-dream.mp4", 22.00, 18.00),  # yellow comment
    ("6-dream.mp4", 106.50, 11.40), # Send → SENT
]

VF = (
    "scale=1920:1080:force_original_aspect_ratio=decrease,"
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,"
    "fps=30,format=yuv420p"
)


def run(cmd):
    print("+", " ".join(str(c) for c in cmd[-6:]))
    subprocess.check_call(cmd)


def main():
    if not FFMPEG.exists():
        raise SystemExit(f"missing ffmpeg: {FFMPEG}")
    WORK.mkdir(parents=True, exist_ok=True)
    parts = []
    for i, (name, start, dur) in enumerate(SEGS, 1):
        src = SRC / name
        if not src.exists():
            raise SystemExit(f"missing take: {src}")
        part = WORK / f"seg{i:02d}.mp4"
        run([
            str(FFMPEG), "-y", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}",
            "-i", str(src), "-an",
            "-vf", VF,
            "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            str(part),
        ])
        parts.append(part)

    listing = WORK / "concat.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in parts))
    raw = WORK / "concat.mp4"
    run([
        str(FFMPEG), "-y", "-f", "concat", "-safe", "0",
        "-i", str(listing), "-c", "copy", str(raw),
    ])
    # Burn captions in a second pass so ASS times stay on the concat clock.
    run([
        str(FFMPEG), "-y", "-i", str(raw),
        "-vf", f"subtitles={ASS}:fontsdir=/usr/share/fonts/truetype/dejavu",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-an", str(OUT),
    ])
    COPY.write_bytes(OUT.read_bytes())
    print(f"wrote {OUT}")
    print(f"copy {COPY}")


if __name__ == "__main__":
    main()
