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
RATE = "-5%"

# start_sec, window_sec, spoken line
LINES = [
    (0.00, 6.20, "A contractor sends drawings. What will the fittings cost?"),
    (6.20, 4.20, "They need that answer early. The quote is how Ahlsell wins the job."),
    (10.40, 6.00, "The customer wants a clear request."),
    (16.40, 6.50, "The specialist must sign off on the take-off."),
    (22.90, 8.00, "Today that answer is hand work."),
    (30.90, 9.00, "Drawing after drawing. They start from a blank page."),
    (39.90, 7.00, "Hours. Miss a room, the quote is wrong."),
    (46.90, 8.00, "What if the first pass was not blank?"),
    (54.90, 9.00, "AI drafts the markup. The specialist does not start from zero."),
    (63.90, 9.00, "They check. They verify. They add or remove what is needed."),
    (72.90, 9.00, "They sign off on the take-off. The draft does not."),
    (81.90, 11.50, "Faster. More confident. Still a person accountable."),
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

    n = len(clips)
    inputs = ["-i", str(VIDEO)]
    for _, path in clips:
        inputs += ["-i", str(path)]
    filters = []
    labels = []
    for i, (start, _) in enumerate(clips, 1):
        ms = int(round(start * 1000))
        filters.append(f"[{i}:a]adelay={ms}|{ms},volume=1.0[a{i}]")
        labels.append(f"[a{i}]")
    filters.append(
        "".join(labels)
        + f"amix=inputs={n}:dropout_transition=0[a]"
    )
    cmd = [
        str(FFMPEG), "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "0:v", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
        "-shortest",
        str(OUT),
    ]
    run(cmd)
    COPY.write_bytes(OUT.read_bytes())
    print(f"wrote {OUT}")
    print(f"copy {COPY}")


if __name__ == "__main__":
    main()
