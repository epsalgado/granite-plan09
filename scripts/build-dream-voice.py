#!/usr/bin/env python3
"""Neural English voice on the dream cut (Microsoft Ava, not gTTS).

  /srv/CursorProjects/granite-plan09/.venv-edge/bin/python scripts/build-dream-voice.py
"""
from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / ".py-tts" / "imageio_ffmpeg" / "binaries" / "ffmpeg-linux64-v4.2.2"
FFPROBE = FFMPEG  # same binary understands -i
VIDEO = ROOT / "files" / "demo-video" / "granite-plan09-dream-silent.mp4"
OUT = ROOT / "files" / "demo-video" / "granite-plan09-dream.mp4"
COPY = Path(
    "/srv/dev-disk-by-uuid-78a6915b-46d3-4693-a1f2-3761d2c95913"
    "/Eddie/Hackathon/2hero/screenshots/granite-plan09-dream.mp4"
)
WORK = ROOT / "files" / "demo-video" / "cut-work" / "voice"
VOICE = "en-US-AvaNeural"
RATE = "-3%"

# Six flowing beats — full sentences, not caption fragments.
# start_sec, window_sec, spoken line
LINES = [
    (
        0.00,
        10.20,
        "A contractor sends Ahlsell a pack of drawings and asks what the fittings will cost. They need that answer early, because the quote is how Ahlsell wins the job.",
    ),
    (
        10.40,
        12.20,
        "The customer wants a clear request: you saw my rooms, you did not invent a shopping list. The specialist is the one who must sign off on the take-off.",
    ),
    (
        22.90,
        23.70,
        "Today that answer is still done by hand. They open drawing after drawing and start from a blank page. It takes hours, and if they miss a single room, the quote is wrong.",
    ),
    (
        46.90,
        16.80,
        "What if the first pass was not a blank page? The AI reads the plans and drafts the markup, so the specialist does not have to start from zero.",
    ),
    (
        63.90,
        17.80,
        "They check that draft, they verify it, and they add or remove whatever is needed. Then they sign off. The draft does not.",
    ),
    (
        81.90,
        11.00,
        "The work is faster, and they can be more confident. A person is still accountable.",
    ),
]


def run(cmd):
    subprocess.check_call(cmd)


def duration(path: Path) -> float:
    proc = subprocess.run(
        [str(FFMPEG), "-i", str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    out = proc.stdout.decode("utf-8", "replace")
    for line in out.splitlines():
        if "Duration:" in line:
            hms = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = hms.split(":")
            return int(h) * 3600 + int(m) * 60 + float(s)
    raise RuntimeError(f"no duration in {path}")


async def speak(text: str, dest: Path) -> None:
    import edge_tts

    comm = edge_tts.Communicate(text, VOICE, rate=RATE)
    await comm.save(str(dest))


def main() -> None:
    if not VIDEO.exists():
        raise SystemExit(f"missing silent cut: {VIDEO}")
    WORK.mkdir(parents=True, exist_ok=True)
    clips = []
    for i, (start, window, text) in enumerate(LINES, 1):
        raw = WORK / f"line{i:02d}.mp3"
        print(f"speak {i:02d}  {text}")
        asyncio.run(speak(text, raw))
        dur = duration(raw)
        fitted = WORK / f"line{i:02d}.wav"
        if dur > window - 0.12:
            tempo = max(0.85, min(1.25, dur / (window - 0.15)))
            af = f"atempo={tempo:.4f},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
        else:
            af = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
        run([str(FFMPEG), "-y", "-i", str(raw), "-af", af, str(fitted)])
        clips.append((start, fitted))
        print(f"  {dur:.2f}s -> window {window:.2f}s")

    bed = WORK / "bed.wav"
    run([
        str(FFMPEG), "-y", "-f", "lavfi",
        "-i", "anullsrc=r=48000:cl=stereo", "-t", "93.13", str(bed),
    ])
    mix = bed
    for i, (start, path) in enumerate(clips, 1):
        ms = int(round(start * 1000))
        nxt = WORK / f"mix{i:02d}.wav"
        run([
            str(FFMPEG), "-y", "-i", str(mix), "-i", str(path),
            "-filter_complex",
            f"[1:a]adelay={ms}|{ms}[a];[0:a][a]amix=inputs=2:duration=first:dropout_transition=0,volume=2",
            str(nxt),
        ])
        mix = nxt
    run([
        str(FFMPEG), "-y", "-i", str(VIDEO), "-i", str(mix),
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        str(OUT),
    ])
    COPY.write_bytes(OUT.read_bytes())
    print(f"wrote {OUT}")
    print(f"copy {COPY}")


if __name__ == "__main__":
    main()
