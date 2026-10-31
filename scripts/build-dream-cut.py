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
    # Cover the team name on screen, then burn captions.
    # Timeline: landing 0–22.5, empty PDF 22.5–46.5, specialist UI 46.5–55.5,
    # first-crack PDF 55.5–81.5, customer send 81.5–end.
    hide = (
        "drawbox=x=8:y=4:w=180:h=42:color=0x0F4373:t=fill:enable='between(t,0,22.5)',"
        "drawbox=x=1520:y=4:w=392:h=42:color=0x0D3058:t=fill:enable='between(t,0,22.5)',"
        "drawbox=x=8:y=4:w=160:h=44:color=0x153739:t=fill:enable='between(t,46.5,55.5)',"
        "drawbox=x=40:y=2:w=560:h=40:color=0x3D3D3D:t=fill:enable='between(t,55.5,81.5)',"
        "drawbox=x=470:y=168:w=1450:h=36:color=0xE87722:t=fill:enable='between(t,55.5,63.5)',"
        "drawbox=x=980:y=568:w=280:h=88:color=0xFFFF00:t=fill:enable='between(t,63.5,81.5)',"
        "drawbox=x=8:y=4:w=160:h=44:color=0x16518B:t=fill:enable='between(t,81.5,94)',"
        f"subtitles={ASS}:fontsdir=/usr/share/fonts/truetype/dejavu"
    )
    run([
        str(FFMPEG), "-y", "-i", str(raw),
        "-vf", hide,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-an", str(OUT),
    ])
    COPY.write_bytes(OUT.read_bytes())
    print(f"wrote {OUT}")
    print(f"copy {COPY}")


if __name__ == "__main__":
    main()
