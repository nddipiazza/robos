#!/usr/bin/env python3
"""
record_site_background.py — records the looping gameplay clip used behind the rowbose.com games page.

Steps the paused simulation a few ticks per frame (so the clip is a true 24 fps rendering of the game),
with the HUD hidden and a slow camera move, then encodes an H.264 MP4 and a poster frame.

    ./record_site_background.py --out site/assets/games      # writes rts-bg.mp4 and rts-bg-poster.jpg
"""
from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import time

PROJECT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_DIR))
from capture_screenshots import Capture  # noqa: E402

FPS = 24
SECONDS = 14


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cap = Capture(args.out, as_png=True)
    frames = cap.tmp / "frames"
    frames.mkdir()
    cap.start()
    try:
        cap.load("default", (60, 50, 44), pause=True)
        cap.c.ui(hide_hud=True, banner=0)
        for d, mode, tx in ((1, "macro_build", 64.0), (2, "swarm_rush", 28.0), (3, "phase_skirmisher_micro", 40.0)):
            cap.c.set_directive(d, mode, True, tx, 48.0)
        cap.c.step(90)
        total = FPS * SECONDS
        for i in range(total):
            t = i / (total - 1)
            cap.c.focus_camera(58.0 + 10.0 * t, 48.0, 50.0 - 6.0 * t)
            cap.c.step(3 if i % 3 != 2 else 2)
            time.sleep(0.12)
            cap.c.screenshot(str(frames / f"f_{i:04d}.png"))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(frames / "f_%04d.png"),
                        "-vf", "scale=1280:720", "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart", "-an", str(args.out / "rts-bg.mp4")], check=True)
        shutil.copy(frames / f"f_{total // 3:04d}.png", cap.tmp / "poster.png")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(cap.tmp / "poster.png"), "-vf", "scale=1600:900", "-q:v", "4",
                        str(args.out / "rts-bg-poster.jpg")], check=True)
    finally:
        cap.stop()
    print("wrote", args.out / "rts-bg.mp4")
    return 0


if __name__ == "__main__":
    sys.exit(main())
