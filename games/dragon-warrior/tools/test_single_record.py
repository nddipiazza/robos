#!/usr/bin/env python3
"""
Offscreen Virtual Display (Xvfb :99) Video Recording Script for AI Dragon Warrior v2.
Launches Xvfb on display :99, runs Godot on :99 (100% invisible offscreen), 
records the virtual framebuffer with ffmpeg, and outputs MP4 to report server.
Zero desktop window popups, zero Slack interference regardless of user activity.
"""

import os
import sys
import time
import subprocess
import shutil

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORTS_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "reports")
VIDEOS_DIR = os.path.join(REPORTS_DIR, "videos")
GODOT_BIN = os.environ.get("DW_GODOT_BIN", "/snap/bin/godot4")
XVFB_BIN = os.path.expanduser("~/.local/xvfb/usr/bin/Xvfb")

os.makedirs(VIDEOS_DIR, exist_ok=True)
output_mp4 = os.path.join(VIDEOS_DIR, "single_test.mp4")

if os.path.exists(output_mp4):
    os.remove(output_mp4)

DISPLAY_NUM = ":99"

print(f"🖥️ 1. Spawning virtual X server (Xvfb {DISPLAY_NUM})...")
xvfb_cmd = [XVFB_BIN, DISPLAY_NUM, "-screen", "0", "512x480x24"]
xvfb_proc = subprocess.Popen(xvfb_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)

env = os.environ.copy()
env["DISPLAY"] = DISPLAY_NUM

print(f"🎮 2. Spawning Godot (100% offscreen on {DISPLAY_NUM})...")
godot_cmd = [
    GODOT_BIN,
    "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--position", "0,0",
    "--resolution", "512x480",
    "--path", PROJECT_DIR,
    "--e2e-scenario", "full_boot_to_throne_room"
]
godot_proc = subprocess.Popen(godot_cmd, env=env)
time.sleep(1.5)

print(f"🎥 3. Recording virtual display {DISPLAY_NUM}.0 framebuffer with ffmpeg...")
ffmpeg_cmd = [
    "/usr/bin/ffmpeg", "-y",
    "-f", "x11grab",
    "-video_size", "512x480",
    "-i", f"{DISPLAY_NUM}.0",
    "-framerate", "30",
    "-t", "4",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    output_mp4
]
subprocess.run(ffmpeg_cmd, env=env)

if godot_proc and godot_proc.poll() is None:
    godot_proc.terminate()

if xvfb_proc and xvfb_proc.poll() is None:
    xvfb_proc.terminate()

if os.path.exists(output_mp4) and os.path.getsize(output_mp4) > 0:
    print(f"\n✅ SUCCESS: Recorded 100% virtual offscreen video to: {output_mp4} ({os.path.getsize(output_mp4)} bytes)")
else:
    print("\n❌ Recording failed.")
