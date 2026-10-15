#!/usr/bin/env python3
"""
record_rts_demo.py — Narrated 1080p Demo Recorder & Proof-of-Work Generator for RobOS RTS
Launches RobOS RTS inside Xvfb (:98) with a 2.5D Angled 3D Perspective Camera,
drives a 4-Act showcase across all 3 Factions (Humans, Monsters, Aliens) using `RobOSSC2Client`,
captures high-res PNG keyframes at 25 FPS, and encodes an H.264 MP4 video walkthrough + key screenshots.
"""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

PROJECT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_DIR))

from robos_sc2_bot_sdk import RobOSSC2Client

BRAIN_DIR = Path("/home/ndipiazza/.gemini/antigravity/brain/30d3b69f-969d-497a-96f9-427b9cb6ced1")
REPORTS_DIR = PROJECT_DIR / "tests" / "e2e" / "reports"
VIDEOS_DIR = REPORTS_DIR / "videos"
FRAMES_DIR = Path("/tmp/robos_rts_demo_frames")
PORT = 18099


def main() -> int:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    if FRAMES_DIR.exists():
        shutil.rmtree(FRAMES_DIR)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["RTS_MODE"] = "backend"  # Deterministic stepped frames for rock-solid 25fps capture
    env["RTS_WEB_SERVICE_PORT"] = str(PORT)

    play_sh = str(PROJECT_DIR / "play.sh")
    cmd = [
        "xvfb-run",
        "--auto-servernum",
        "-s",
        "-screen 0 1920x1080x24",
        play_sh,
    ]

    print("🎬 Starting RobOS RTS in Xvfb 1920x1080 (2.5D Angled 3D Perspective)...")
    proc = subprocess.Popen(
        cmd,
        cwd=str(PROJECT_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    client = RobOSSC2Client("127.0.0.1", PORT)
    ready = False
    deadline = time.time() + 18.0
    while time.time() < deadline:
        try:
            if client.health().get("ok"):
                ready = True
                break
        except Exception:
            time.sleep(0.2)

    if not ready:
        proc.terminate()
        raise RuntimeError("RobOS RTS failed to start inside Xvfb")

    frame_idx = 0

    def capture_ticks(total_ticks: int, ticks_per_frame: int = 4, hold_frames: int = 0) -> None:
        nonlocal frame_idx
        steps = max(1, total_ticks // ticks_per_frame)
        for _ in range(steps):
            client.step(ticks_per_frame)
            time.sleep(0.025)
            frame_idx += 1
            client.screenshot(str(FRAMES_DIR / f"frame_{frame_idx:04d}.png"))
        for _ in range(hold_frames):
            time.sleep(0.02)
            frame_idx += 1
            client.screenshot(str(FRAMES_DIR / f"frame_{frame_idx:04d}.png"))

    try:
        # =====================================================================
        # ACT 1: 3-Faction Canyon Overview & Humans Macro Economy (2.5D 3D View)
        # =====================================================================
        print("📸 Act 1: 3-Faction Starfall Canyon Overview & Humans Base Macro...")
        client.set_camera(x=34.0, y=52.0, z=84.0)
        client.select(unit_type="marine", owner=1)
        client.set_overlay(
            "ACT 1: 2.5D Angled 3D Perspective — Humans (Terran Vanguard) High-Ground Base",
            "SCVs harvesting 3D Mineral Crystals & Vespene | Barracks queuing Marines | Command Card active"
        )
        client.command("train_marine", unit_type="barracks", owner=1)
        client.command("train_marine", unit_type="barracks", owner=1)
        capture_ticks(80, ticks_per_frame=4, hold_frames=8)
        shutil.copy(FRAMES_DIR / f"frame_{frame_idx:04d}.png", BRAIN_DIR / "demo_act1_humans_base_3d.png")

        # =====================================================================
        # ACT 2: SC2 Allied PushPriority & Lowering Supply Depot Choke Gate
        # =====================================================================
        print("📸 Act 2: SC2 Allied PushPriority & Lowered Supply Depot Choke Traversal...")
        client.load_scenario_slug("crowd-push-priority")
        client.set_camera(x=55.0, y=46.0, z=74.0)
        client.select(unit_type="siege_tank", owner=1)
        client.set_overlay(
            "ACT 2: SC2 Allied PushPriority & Supply Depot Lowering",
            "Supply Depot lowers into floor (walkable) | Marching Siege Tank pushes idle SCV aside & SCV returns to post"
        )
        client.command("lower_depot", unit_type="supply_depot", owner=1)
        client.command("move", unit_type="siege_tank", owner=1, x=72.0, y=40.0)
        capture_ticks(160, ticks_per_frame=4, hold_frames=6)
        shutil.copy(FRAMES_DIR / f"frame_{frame_idx:04d}.png", BRAIN_DIR / "demo_act2_push_priority_3d.png")

        # =====================================================================
        # ACT 3: Humans Marines Stutter-Step Kiting & Siege Tank Splash vs Monsters
        # =====================================================================
        print("📸 Act 3: Humans Marines Stutter-Step Micro & Siege Tank Splash vs Monsters...")
        client.load_scenario_slug("stutter-step-micro")
        client.set_camera(x=54.0, y=46.0, z=72.0)
        client.select(unit_type="marine", owner=1)
        client.set_overlay(
            "ACT 3: Humans Marines Stimpack + DamagePoint/Backswing Stutter-Step Kiting vs Monsters",
            "Marines fire (0.05s DamagePoint) and immediately cancel 0.30s Backswing to kite Swarmling pack"
        )
        capture_ticks(200, ticks_per_frame=4, hold_frames=8)
        shutil.copy(FRAMES_DIR / f"frame_{frame_idx:04d}.png", BRAIN_DIR / "demo_act3_stutter_step_3d.png")

        # =====================================================================
        # ACT 4: Aliens Blink Stalkers, Plasma Shields & Cliff-Walking Colossus vs Monsters
        # =====================================================================
        print("📸 Act 4: Aliens Blink Stalkers, Plasma Shields & Cliff-Walking Colossus vs Monsters...")
        client.load_scenario_slug("alien-blink-colossus-vs-monsters")
        client.set_camera(x=58.0, y=48.0, z=74.0)
        client.select(unit_type="stalker", owner=3)
        client.set_overlay(
            "ACT 4: Aliens Blink Stalker Micro, Regenerating Plasma Shields & Cliff-Walking Colossus",
            "Depleted-shield Stalkers Blink backward while towering Colossus walks over 3D cliff to splash Monsters"
        )
        client.command("attack_move", unit_type="colossus", owner=3, x=68.0, y=40.0)
        capture_ticks(200, ticks_per_frame=4, hold_frames=10)
        shutil.copy(FRAMES_DIR / f"frame_{frame_idx:04d}.png", BRAIN_DIR / "demo_act4_aliens_blink_colossus_3d.png")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3.0)
        except Exception:
            proc.kill()

    # Encode MP4 video via ffmpeg
    mp4_out = VIDEOS_DIR / "robos_rts_3faction_demo.mp4"
    brain_mp4 = BRAIN_DIR / "robos_rts_3faction_demo.mp4"
    webp_out = BRAIN_DIR / "robos_rts_3faction_demo.webp"

    print(f"🎞️ Encoding {frame_idx} frames into 1080p MP4 & animated WebP...")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            "20",
            "-i",
            str(FRAMES_DIR / "frame_%04d.png"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "21",
            str(mp4_out),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    shutil.copy(mp4_out, brain_mp4)

    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-framerate",
            "20",
            "-i",
            str(FRAMES_DIR / "frame_%04d.png"),
            "-vf",
            "scale=960:-1:flags=lanczos",
            "-loop",
            "0",
            "-quality",
            "80",
            str(webp_out),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    print(f"✔ Demo recorded to:\n  - {mp4_out}\n  - {brain_mp4}\n  - {webp_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
