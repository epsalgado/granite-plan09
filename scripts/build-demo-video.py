#!/usr/bin/env python3
"""Build a 1080p walkthrough MP4: real plan/PDF frames + caption voice.

Rebuild:
  python3 scripts/build-demo-video.py
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / ".py-tts" / "imageio_ffmpeg" / "binaries" / "ffmpeg-linux64-v4.2.2"
VOICE = ROOT / "files" / "demo-voice"
FRAMES = ROOT / "files" / "demo-video" / "frames"
OUT = ROOT / "files" / "demo-video" / "granite-plan09-walkthrough.mp4"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT2 = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W, H = 1920, 1080
DARK = (4, 35, 38)
TEAL = (30, 200, 200)
AMBER = (232, 119, 34)
WHITE = (255, 255, 255)
MUTED = (180, 230, 230)

BEATS = [
    ("title", None, 3.4, "title", "GRANITE  ·  PLAN 09", "Customer request, then first crack in Revu. Still not an order."),
    ("c1", "c1.mp3", None, "card", "CUSTOMER", "Send a request. Still not an order."),
    ("c2", "c2.mp3", None, "plan", "CUSTOMER", "Open PLAN 09."),
    ("c3", "c3.mp3", None, "plan", "CUSTOMER", "This is what we found on your floor."),
    ("c4", "c4.mp3", None, "card", "CUSTOMER", "Answer a few questions. Missing spec stays a question."),
    ("c5", "c5.mp3", None, "card", "CUSTOMER", "Send. A specialist will check it."),
    ("spec", None, 2.6, "title", "SPECIALIST", "First crack in Revu. You still sign."),
    ("s1", "s1.mp3", None, "card", "SPECIALIST", "The API draft is already a Revu file."),
    ("s2", "s2.mp3", None, "pdf2", "SPECIALIST", "Download the PDF. Page 2. Alt+L."),
    ("s3", "s3.mp3", None, "pdf2", "SPECIALIST", "69 lines are already markups. Real codes stay."),
    ("s4", "s4.mp3", None, "card", "SPECIALIST", "Filter NEED and CHECK. Fill those in."),
    ("s5", "s5.mp3", None, "h3", "SPECIALIST", "H3 is not on this sheet. We said so."),
    ("s6", "s6.mp3", None, "card", "SPECIALIST", "Save. Compare. Sign."),
    ("end", None, 3.6, "title", "They fill. They sign.", "Granite does not."),
]


def font(size, bold=True):
    return ImageFont.truetype(FONT if bold else FONT2, size)


def fit(img: Image.Image, box, fill=DARK):
    bw, bh = box
    im = img.convert("RGB")
    scale = min(bw / im.width, bh / im.height)
    nw, nh = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (bw, bh), fill)
    canvas.paste(im, ((bw - nw) // 2, (bh - nh) // 2))
    return canvas


def frame(kind: str, kicker: str, caption: str) -> Image.Image:
    im = Image.new("RGB", (W, H), DARK)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W, 10), fill=AMBER)
    d.text((48, 28), "TEAM GRANITE  ·  AHLSELL HACKATHON", font=font(22), fill=TEAL)

    if kind == "title":
        d.text((80, 360), kicker, font=font(64), fill=WHITE)
        d.text((80, 470), caption, font=font(36, False), fill=MUTED)
        return im

    d.text((48, 72), kicker, font=font(22), fill=AMBER)

    pic = None
    if kind in ("plan",):
        pic = Image.open(ROOT / "img" / "plan-1091.png")
    elif kind == "pdf2":
        pic = Image.open(FRAMES / "pdf-page2.png")
    elif kind == "h3":
        pic = Image.open(FRAMES / "pdf-h3-panel.png")

    if pic:
        area = fit(pic, (W - 96, 720), DARK)
        im.paste(area, (48, 120))
    else:
        d.rounded_rectangle((80, 200, W - 80, 720), radius=18, outline=TEAL, width=3)
        # wrap caption in the card as the hero
        d.text((120, 360), caption, font=font(40), fill=WHITE)

    # caption bar
    d.rectangle((0, 900, W, H), fill=(8, 28, 30))
    d.rectangle((0, 900, 12, H), fill=AMBER)
    d.text((40, 940), caption, font=font(34), fill=WHITE)
    d.text((40, 1005), "Not an order. A specialist still signs.", font=font(20, False), fill=MUTED)
    return im


def mp3_seconds(path: Path) -> float:
    r = subprocess.run([str(FFMPEG), "-i", str(path)], capture_output=True, text=True)
    for line in (r.stderr or "").splitlines():
        if "Duration:" in line:
            hms = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = hms.split(":")
            return float(h) * 3600 + float(m) * 60 + float(s)
    return 4.0


def encode_seg(png: Path, audio: Path | None, seconds: float, dest: Path) -> None:
    cmd = [
        str(FFMPEG), "-y",
        "-loop", "1", "-framerate", "8", "-i", str(png),
    ]
    if audio:
        cmd += ["-i", str(audio)]
        cmd += [
            "-filter_complex", f"[1:a]apad=whole_dur={seconds:.2f}[a]",
            "-map", "0:v", "-map", "[a]",
        ]
    else:
        cmd += ["-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo", "-map", "0:v", "-map", "1:a"]
    cmd += [
        "-t", f"{seconds:.2f}",
        "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "44100", "-ac", "2",
        "-shortest",
        str(dest),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main() -> None:
    if not FFMPEG.exists():
        raise SystemExit(f"missing ffmpeg at {FFMPEG}")
    FRAMES.mkdir(parents=True, exist_ok=True)
    segs = []
    for i, (key, mp3, hold, kind, kicker, caption) in enumerate(BEATS):
        png = FRAMES / f"{i:02d}-{key}.png"
        frame(kind, kicker, caption).save(png)
        audio = VOICE / mp3 if mp3 else None
        seconds = hold if hold else mp3_seconds(audio) + 1.8
        mp4 = FRAMES / f"{i:02d}-{key}.mp4"
        print(f"seg {png.name} {seconds:.1f}s")
        encode_seg(png, audio, seconds, mp4)
        segs.append(mp4)
    lst = FRAMES / "concat.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in segs))
    subprocess.run(
        [str(FFMPEG), "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(OUT)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"wrote {OUT}  {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
