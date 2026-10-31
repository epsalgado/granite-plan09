#!/usr/bin/env python3
"""Build female-voiced caption tracks for the two demo walks.

Uses Google TTS (gTTS) — a generated voice, not a real person.
Rebuild:
  PYTHONPATH=.py-tts python3 scripts/build-demo-voice.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".py-tts"))

from gtts import gTTS  # noqa: E402

OUT = ROOT / "files" / "demo-voice"

# Spoken captions — same order as Docs/granite-plan09-demo-script.md
CUSTOMER = [
    ("c1", "Customer. Send a request. Still not an order."),
    ("c2", "Open PLAN 09."),
    ("c3", "This is what we found on your floor."),
    ("c4", "Answer a few questions. Missing spec stays a question."),
    ("c5", "Send. A specialist will check it."),
]
SPECIALIST = [
    ("s1", "Specialist. First crack in Revu. You still sign."),
    ("s2", "Download the PDF. Page 2. Alt L."),
    ("s3", "69 lines are already markups. Real codes stay."),
    ("s4", "Filter NEED and CHECK. Fill those in."),
    ("s5", "H3 is not on this sheet. We said so."),
    ("s6", "Save. Compare. Sign."),
]


def speak(text: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # US English. This voice is usually heard as female. Not a cloned person.
    gTTS(text=text, lang="en", tld="us", slow=False).save(str(dest))
    print(f"  {dest.name}  {dest.stat().st_size} bytes")


def join_spoken(lines: list[str]) -> str:
    # Extra periods give gTTS a short pause between cards.
    return " ... ".join(lines)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print("clips")
    for key, text in CUSTOMER + SPECIALIST:
        speak(text, OUT / f"{key}.mp3")
    print("tracks")
    speak(join_spoken([t for _, t in CUSTOMER]), OUT / "customer.mp3")
    speak(join_spoken([t for _, t in SPECIALIST]), OUT / "specialist.mp3")
    both = (
        "Customer walk. "
        + join_spoken([t for _, t in CUSTOMER])
        + " ... Specialist walk. "
        + join_spoken([t for _, t in SPECIALIST])
    )
    speak(both, OUT / "both.mp3")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
