#!/usr/bin/env python3
"""
RobOS Video Game QA Player Runner
Orchestrates an Xvfb virtual display, Godot 4 runtime, and FFmpeg high-definition
video proof-of-work capture while executing an autonomous user-simulation scenario.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from qa_player.qa_player import VideoGameQAPlayer
from qa_player.scenarios.character_creation_and_first_scene import CharacterCreationAndFirstSceneScenario
from qa_player.scenarios.full_playthrough_start_to_finish import FullPlaythroughStartToFinishScenario

SCENARIOS = {
    "full_playthrough": FullPlaythroughStartToFinishScenario,
    "start_to_finish": FullPlaythroughStartToFinishScenario,
    "default": FullPlaythroughStartToFinishScenario,
    "character_creation_and_first_scene": CharacterCreationAndFirstSceneScenario,
    "first_scene": CharacterCreationAndFirstSceneScenario
}

def resolve_godot_bin() -> str:
    if "GODOT_BIN" in os.environ and os.path.exists(os.environ["GODOT_BIN"]):
        return os.environ["GODOT_BIN"]
    for c in [
        os.path.expanduser("~/apps/godot4"),
        os.path.expanduser("~/.local/bin/godot4"),
        "/usr/bin/godot4",
        "/usr/bin/godot",
    ]:
        if os.path.exists(c):
            return c
    found = shutil.which("godot4") or shutil.which("godot")
    return found or "godot4"

def resolve_xvfb_bin() -> str:
    return shutil.which("Xvfb") or "/usr/bin/Xvfb"

def resolve_ffmpeg_bin() -> str:
    return shutil.which("ffmpeg") or "/usr/bin/ffmpeg"

def main() -> int:
    parser = argparse.ArgumentParser(description="RobOS Video Game QA Player Runner")
    parser.add_argument("--scenario", default="full_playthrough", help="Scenario to execute")
    parser.add_argument("--display", default=os.environ.get("CRPG_DISPLAY", ":99"), help="X11 display")
    parser.add_argument("--port", type=int, default=18095, help="HTTP web service port")
    parser.add_argument("--video-out", default=None, help="Target path for evidence MP4 video")
    args = parser.parse_args()

    reports_dir = PROJECT_DIR / "tests" / "e2e" / "reports"
    videos_dir = reports_dir / "videos"
    reports_dir.mkdir(parents=True, exist_ok=True)
    videos_dir.mkdir(parents=True, exist_ok=True)

    default_video_name = f"qa_evidence_{args.scenario}.mp4"
    video_path = Path(args.video_out) if args.video_out else (videos_dir / default_video_name)
    if video_path.exists():
        try:
            video_path.unlink()
        except Exception:
            pass

    print("==================================================================")
    print("   RobOS Video Game QA Player — Autonomous User Simulation        ")
    print("==================================================================")
    print(f"  Scenario:    {args.scenario}")
    print(f"  Virtual Disp:{args.display}")
    print(f"  Port:        {args.port}")
    print(f"  Evidence MP4:{video_path}")
    print("==================================================================")

    # 1. Start Xvfb Virtual Framebuffer
    xvfb_bin = resolve_xvfb_bin()
    lock_file = Path(f"/tmp/.X{args.display.replace(':', '')}-lock")
    if lock_file.exists():
        try:
            lock_file.unlink()
        except Exception:
            pass

    xvfb_cmd = [xvfb_bin, args.display, "-screen", "0", "1280x720x24", "-ac"]
    print(f"🎬 [Xvfb] Starting display {args.display}...")
    xvfb_proc = subprocess.Popen(xvfb_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)

    # 2. Start Godot 4 Process
    godot_bin = resolve_godot_bin()
    env = os.environ.copy()
    env["DISPLAY"] = args.display
    env["CRPG_WEB_SERVICE_PORT"] = str(args.port)

    godot_log = open(reports_dir / "qa_player_godot.log", "w", encoding="utf-8")
    godot_cmd = [
        godot_bin,
        "--path", str(PROJECT_DIR),
        "--",
        "--port", str(args.port)
    ]
    print(f"🎮 [Godot] Starting game on {args.display} with HTTP port {args.port}...")
    godot_proc = subprocess.Popen(godot_cmd, env=env, stdout=godot_log, stderr=godot_log)

    # 3. Wait for game to be ready
    player = VideoGameQAPlayer(port=args.port, human_delay=0.6)
    ready = False
    for attempt in range(25):
        if player.check_health():
            ready = True
            break
        time.sleep(0.3)

    if not ready:
        print("❌ [Error] Godot game control server did not become healthy!")
        godot_proc.kill()
        xvfb_proc.kill()
        return 1

    print("✔ [Godot] Game Control Server is healthy. Beginning user simulation.")

    # 4. Start FFmpeg Recording
    ffmpeg_bin = resolve_ffmpeg_bin()
    ffmpeg_log = open(reports_dir / "qa_player_ffmpeg.log", "w", encoding="utf-8")
    ffmpeg_cmd = [
        ffmpeg_bin, "-y",
        "-f", "x11grab",
        "-framerate", "30",
        "-video_size", "1280x720",
        "-i", f"{args.display}.0",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        str(video_path)
    ]
    print("📹 [FFmpeg] Starting video proof-of-work capture...")
    ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stdout=ffmpeg_log, stderr=ffmpeg_log)
    time.sleep(1.0)

    # 5. Execute Scenario
    scenario_cls = SCENARIOS.get(args.scenario, CharacterCreationAndFirstSceneScenario)
    scenario = scenario_cls()

    scenario_success = False
    scenario_result = {}
    try:
        scenario_result = scenario.execute(player)
        scenario_success = scenario_result.get("success", False)
    except Exception as e:
        print(f"❌ [QA Scenario Error] {e}")
        import traceback
        traceback.print_exc()

    # Small cooldown for video capture
    time.sleep(1.0)

    # 6. Stop FFmpeg
    if ffmpeg_proc and ffmpeg_proc.poll() is None:
        try:
            ffmpeg_proc.communicate(input=b'q', timeout=3)
        except Exception:
            ffmpeg_proc.terminate()
            ffmpeg_proc.wait(timeout=2)

    # 7. Stop Godot and Xvfb
    if godot_proc and godot_proc.poll() is None:
        godot_proc.terminate()
        godot_proc.wait(timeout=2)

    if xvfb_proc and xvfb_proc.poll() is None:
        xvfb_proc.terminate()
        xvfb_proc.wait(timeout=2)

    # 8. Report Results
    print("\n==================================================================")
    if scenario_success:
        print("🎉 QA PLAYER SCENARIO PASSED 100% VIA PURE USER INPUT!")
    else:
        print("⚠️ QA PLAYER SCENARIO FAILED!")

    if video_path.exists() and video_path.stat().st_size > 0:
        print(f"🎬 Evidence Video Saved: {video_path} ({video_path.stat().st_size} bytes)")
    else:
        print("⚠️ No video artifact produced.")
    print("==================================================================\n")

    return 0 if scenario_success else 1

if __name__ == "__main__":
    raise SystemExit(main())
