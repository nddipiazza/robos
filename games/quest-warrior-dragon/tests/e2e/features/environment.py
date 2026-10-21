import os
import sys
import time
import subprocess

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
REPORTS_DIR = os.environ.get("REPORTS_DIR", os.path.join(PROJECT_DIR, "tests", "e2e", "reports"))
VIDEOS_DIR = os.path.join(REPORTS_DIR, "videos")
XVFB_BIN = os.path.expanduser("~/.local/xvfb/usr/bin/Xvfb")
DEFAULT_DISPLAY = os.environ.get("DISPLAY", ":99")
WIDTH = "1024"
HEIGHT = "960"

def is_xvfb_enabled():
    if sys.platform == "win32":
        return False
    val = os.environ.get("USE_XVFB", os.environ.get("HEADLESS", "1")).lower()
    return val not in ("0", "false", "no", "off")

def resolve_xvfb_bin():
    if "XVFB_BIN" in os.environ and os.path.exists(os.environ["XVFB_BIN"]):
        return os.environ["XVFB_BIN"]
    import shutil
    found = shutil.which("Xvfb") or shutil.which("Xvfb.exe")
    if found:
        return found
    candidates = [
        os.path.expanduser("~/.local/xvfb/usr/bin/Xvfb"),
        "/usr/bin/Xvfb",
        "/usr/local/bin/Xvfb",
        os.path.expanduser("~/.local/bin/Xvfb"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def resolve_default_display():
    return os.environ.get("HOST_DISPLAY", os.environ.get("DISPLAY", ":0"))

def before_all(context):
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    context.use_xvfb = is_xvfb_enabled()
    target_display = os.environ.get("DISPLAY", DEFAULT_DISPLAY)
    xvfb_bin = resolve_xvfb_bin()
    
    if context.use_xvfb and xvfb_bin:
        context.display_num = target_display
        lock_file = f"/tmp/.X{context.display_num.replace(':', '')}-lock"
        if os.path.exists(lock_file):
            try:
                os.remove(lock_file)
            except Exception:
                pass
        try:
            xvfb_cmd = [xvfb_bin, context.display_num, "-screen", "0", f"{WIDTH}x{HEIGHT}x24", "-ac"]
            context.xvfb_proc = subprocess.Popen(xvfb_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1.0)
            print(f" Xvfb Virtual Server ({context.display_num}) initialized using {xvfb_bin}.")
        except Exception:
            context.xvfb_proc = None
            context.display_num = resolve_default_display()
    else:
        context.display_num = resolve_default_display()
        context.xvfb_proc = None

def resolve_ffmpeg_bin():
    if "FFMPEG_BIN" in os.environ and os.path.exists(os.environ["FFMPEG_BIN"]):
        return os.environ["FFMPEG_BIN"]
    import shutil
    found = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
    if found:
        return found
    local_app = os.environ.get("LOCALAPPDATA", os.path.expanduser("~/AppData/Local"))
    candidates = [
        os.path.join(local_app, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
        os.path.expanduser("~/apps/ffmpeg.exe"),
        "/usr/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
    ]
    import glob
    winget_pkgs = glob.glob(os.path.join(local_app, "Microsoft", "WinGet", "Packages", "*FFmpeg*", "**", "ffmpeg.exe"), recursive=True)
    candidates.extend(winget_pkgs)
    for c in candidates:
        if os.path.exists(c):
            return c
    return "ffmpeg"

def start_ffmpeg_recording(context):
    if getattr(context, 'ffmpeg_proc', None) is not None:
        return
    ffmpeg_bin = resolve_ffmpeg_bin()
    if not os.path.exists(ffmpeg_bin):
        return
    ffmpeg_log = open(os.path.join(REPORTS_DIR, "ffmpeg.log"), "a", encoding="utf-8")
    env = os.environ.copy()

    if sys.platform == "win32":
        target_title = None
        for _ in range(25):
            try:
                ps = subprocess.run(
                    ["powershell", "-Command", "Get-Process | Where-Object MainWindowTitle | Select-Object -ExpandProperty MainWindowTitle"],
                    capture_output=True, text=True, timeout=2.0
                )
                titles = [t.strip() for t in ps.stdout.splitlines() if t.strip()]
                matched = [t for t in titles if "Quest: Warrior Dragon" in t]
                if matched:
                    target_title = matched[0]
                    break
            except Exception:
                pass
            time.sleep(0.2)

        if not target_title:
            target_title = "Quest: Warrior Dragon (DEBUG)"

        ffmpeg_cmd = [
            ffmpeg_bin, "-y",
            "-f", "gdigrab",
            "-framerate", "30",
            "-i", f"title={target_title}",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            "-pix_fmt", "yuv420p",
            context.mp4_path
        ]
        try:
            context.ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, env=env, stdin=subprocess.PIPE, stdout=ffmpeg_log, stderr=ffmpeg_log)
            print(f" FFmpeg video capture started on Windows for '{context.scenario_name}' targeting '{target_title}'.")
        except Exception as e:
            print(f" Could not start ffmpeg recording on Windows: {e}")
    elif getattr(context, 'use_xvfb', False) and sys.platform != "win32":
        ffmpeg_cmd = [
            ffmpeg_bin, "-y",
            "-f", "x11grab",
            "-framerate", "30",
            "-video_size", f"{WIDTH}x{HEIGHT}",
            "-i", f"{context.display_num}.0",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            "-pix_fmt", "yuv420p",
            context.mp4_path
        ]
        try:
            context.ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, env=env, stdin=subprocess.PIPE, stdout=ffmpeg_log, stderr=ffmpeg_log)
        except Exception as e:
            print(f" Could not start ffmpeg recording on Linux: {e}")

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

    if getattr(context, 'godot_proc', None) is not None:
        try:
            if context.godot_proc.poll() is None:
                context.godot_proc.terminate()
                context.godot_proc.wait(timeout=2)
        except Exception:
            try:
                context.godot_proc.kill()
            except Exception:
                pass
        context.godot_proc = None


    xvfb_bin = resolve_xvfb_bin()
    if getattr(context, 'use_xvfb', False) and sys.platform != "win32" and xvfb_bin:
        if not hasattr(context, 'xvfb_proc') or context.xvfb_proc is None or context.xvfb_proc.poll() is not None:
            context.display_num = os.environ.get("DISPLAY", DEFAULT_DISPLAY)
            lock_file = f"/tmp/.X{context.display_num.replace(':', '')}-lock"
            if os.path.exists(lock_file):
                try:
                    os.remove(lock_file)
                except Exception:
                    pass
            try:
                xvfb_cmd = [xvfb_bin, context.display_num, "-screen", "0", f"{WIDTH}x{HEIGHT}x24", "-ac"]
                context.xvfb_proc = subprocess.Popen(xvfb_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(1.0)
                print(f" Xvfb Virtual Server ({context.display_num}) re-initialized.")
            except Exception:
                context.xvfb_proc = None

    context.ffmpeg_proc = None

def after_scenario(context, scenario):
    # some small sleep really helps readability
    time.sleep(.75)
    port = getattr(context, 'web_port', None)
    if port:
        try:
            import urllib.request
            import json
            url = f"http://127.0.0.1:{port}/api/v1/state"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                state_data = json.loads(resp.read().decode('utf-8'))
                state_json_path = os.path.join(REPORTS_DIR, f"gamestate_{context.scenario_name}.json")
                with open(state_json_path, "w", encoding="utf-8") as f:
                    json.dump(state_data, f, indent=2)
                print(f" GameState JSON artifact captured: {state_json_path}")
        except Exception as e:
            print(f" Could not capture final GameState JSON: {e}")

    if hasattr(context, 'godot_proc') and context.godot_proc:
        try:
            if context.godot_proc.poll() is None:
                context.godot_proc.terminate()
                try:
                    context.godot_proc.wait(timeout=3)
                except Exception:
                    context.godot_proc.kill()
                    context.godot_proc.wait(timeout=1)
        except Exception:
            pass
        context.godot_proc = None

    if hasattr(context, 'ffmpeg_proc') and context.ffmpeg_proc:
        time.sleep(1.0)
        if context.ffmpeg_proc.poll() is None:
            try:
                context.ffmpeg_proc.communicate(input=b'q', timeout=3)
            except Exception:
                try:
                    context.ffmpeg_proc.terminate()
                    context.ffmpeg_proc.wait(timeout=2)
                except Exception:
                    context.ffmpeg_proc.kill()
        context.ffmpeg_proc = None

    avi_path = getattr(context, 'avi_path', None)
    mp4_path = getattr(context, 'mp4_path', None)

    if avi_path and os.path.exists(avi_path) and mp4_path:
        ffmpeg_bin = resolve_ffmpeg_bin()
        ffmpeg_log = open(os.path.join(REPORTS_DIR, "ffmpeg.log"), "a", encoding="utf-8")
        conv_cmd = [
            ffmpeg_bin, "-y",
            "-i", avi_path,
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "20",
            mp4_path
        ]
        try:
            subprocess.run(conv_cmd, stdout=ffmpeg_log, stderr=ffmpeg_log, check=True)
            try:
                os.remove(avi_path)
            except Exception:
                pass
        except Exception as e:
            print(f" FFmpeg failed to convert Godot AVI movie to MP4: {e}")

    if os.path.exists(context.mp4_path) and os.path.getsize(context.mp4_path) > 0:
        print(f" High-Quality Video artifact attached to Cucumber report: {context.mp4_path} ({os.path.getsize(context.mp4_path)} bytes)")

def after_all(context):
    if hasattr(context, 'xvfb_proc') and context.xvfb_proc:
        try:
            context.xvfb_proc.terminate()
            context.xvfb_proc.wait(timeout=2)
        except Exception:
            try:
                context.xvfb_proc.kill()
            except Exception:
                pass
        context.xvfb_proc = None

    try:
        report_script = os.path.join(PROJECT_DIR, "tests", "e2e", "generate_report.py")
        if os.path.exists(report_script):
            subprocess.run([sys.executable, report_script])
    except Exception as e:
        print(f" Could not generate HTML report in after_all: {e}")


