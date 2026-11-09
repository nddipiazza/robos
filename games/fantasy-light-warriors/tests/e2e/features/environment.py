import os
import sys
import time
import json
import shutil
import subprocess
import urllib.request

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
REPORTS_DIR = os.path.join(PROJECT_DIR, "tests", "e2e", "reports")
VIDEOS_DIR = os.path.join(REPORTS_DIR, "videos")
DEFAULT_DISPLAY = os.environ.get("DISPLAY", ":98")
WIDTH = "512"
HEIGHT = "480"

def before_all(context):
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    context.display_num = ":98"
    xvfb_bin = shutil.which("Xvfb") or "/usr/bin/Xvfb"
    context.xvfb_proc = None
    if os.path.exists(xvfb_bin):
        lock_file = "/tmp/.X98-lock"
        if os.path.exists(lock_file):
            try:
                os.remove(lock_file)
            except Exception:
                pass
        try:
            context.xvfb_proc = subprocess.Popen(
                [xvfb_bin, context.display_num, "-screen", "0", f"{WIDTH}x{HEIGHT}x24", "-ac"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            time.sleep(0.8)
            print(f"[Xvfb] Virtual display {context.display_num} started.")
        except Exception as e:
            print(f"[Xvfb] Could not start Xvfb: {e}")

def before_scenario(context, scenario):
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    raw_name = scenario.name.lower().replace(" ", "_").replace("-", "_")
    context.scenario_name = "".join([c for c in raw_name if c.isalnum() or c == "_"])
    context.avi_path = os.path.join(VIDEOS_DIR, f"{context.scenario_name}.avi")
    context.mp4_path = os.path.join(VIDEOS_DIR, f"{context.scenario_name}.mp4")
    for p in [context.avi_path, context.mp4_path]:
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass
    context.godot_proc = None

def after_scenario(context, scenario):
    time.sleep(0.5)
    port = getattr(context, "web_port", None)
    if port:
        try:
            url = f"http://127.0.0.1:{port}/api/v1/state"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                state_data = json.loads(resp.read().decode("utf-8"))
                state_json_path = os.path.join(REPORTS_DIR, f"gamestate_{context.scenario_name}.json")
                with open(state_json_path, "w", encoding="utf-8") as f:
                    json.dump(state_data, f, indent=2)
                print(f"[State] Saved {state_json_path}")
        except Exception as e:
            print(f"[State] Could not capture final state: {e}")

    if getattr(context, "godot_proc", None) is not None:
        try:
            if context.godot_proc.poll() is None:
                context.godot_proc.terminate()
                context.godot_proc.wait(timeout=3)
        except Exception:
            try:
                context.godot_proc.kill()
            except Exception:
                pass
        context.godot_proc = None

    if os.path.exists(context.avi_path):
        ffmpeg_bin = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
        if os.path.exists(ffmpeg_bin):
            subprocess.run(
                [ffmpeg_bin, "-y", "-i", context.avi_path, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "20", context.mp4_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            try:
                os.remove(context.avi_path)
            except Exception:
                pass
            if os.path.exists(context.mp4_path):
                print(f"[Video] Recorded {context.mp4_path} ({os.path.getsize(context.mp4_path)} bytes)")

def after_all(context):
    if getattr(context, "xvfb_proc", None) is not None:
        try:
            context.xvfb_proc.terminate()
            context.xvfb_proc.wait(timeout=2)
        except Exception:
            pass
