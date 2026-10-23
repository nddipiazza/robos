"""
environment.py — Behave lifecycle hooks for RobOS RTS 
Starts an isolated Godot process with manual stepping or a live frame clock,
then connects the SDK to its own control port. LiveMatch handles optional recording.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

PROJECT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_DIR))

from robos_rts_bot_sdk import RTSClient


class LiveRTSClient(RTSClient):
    def step(self, ticks=16):
        raise AssertionError("Live match tests must never call /step")


def _find_godot() -> str:
    env_bin = os.environ.get("GODOT_BIN", "")
    if env_bin and os.access(env_bin, os.X_OK):
        return env_bin
    for name in ("godot4", "godot"):
        found = shutil.which(name)
        if found:
            return found
    raise RuntimeError("Godot 4 binary not found in PATH")


def before_all(context) -> None:
    context.rts_mode = os.environ.get("RTS_MODE", "backend").lower()
    context.realtime = context.rts_mode == "realtime"
    context.live_headless = os.environ.get("RTS_HEADLESS", "0") == "1"
    context.record_live = os.environ.get("RTS_RECORD", "0") == "1"
    if context.record_live and (not context.realtime or context.live_headless):
        raise RuntimeError("--record requires rendered --realtime matches")
    if context.record_live and not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required for --record")
    if os.environ.get("RTS_WEB_SERVICE_PORT"):
        context.port = int(os.environ["RTS_WEB_SERVICE_PORT"])
    else:
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            context.port = reservation.getsockname()[1]
    context.reports_dir = PROJECT_DIR / "tests" / "e2e" / "reports"
    context.videos_dir = context.reports_dir / "videos"
    context.reports_dir.mkdir(parents=True, exist_ok=True)
    context.videos_dir.mkdir(parents=True, exist_ok=True)

    godot_bin = _find_godot()
    if os.name == "nt" and godot_bin.endswith("_console.exe"):
        godot_bin = godot_bin.replace("_console.exe", ".exe")
    env = os.environ.copy()
    env["RTS_MODE"] = context.rts_mode
    env["RTS_WEB_SERVICE_PORT"] = str(context.port)

    cmd = [godot_bin, "--path", str(PROJECT_DIR)]
    if context.rts_mode == "backend" or context.live_headless:
        cmd.insert(1, "--headless")

    startupinfo = None
    if os.name == "nt" and os.environ.get("RTS_SHOW_WINDOW") != "1":
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = 0

    context.engine_log = (context.reports_dir / "engine.log").open("w", encoding="utf-8")
    context.godot_proc = subprocess.Popen(
        cmd,
        cwd=str(PROJECT_DIR),
        env=env,
        stdout=context.engine_log,
        stderr=subprocess.STDOUT,
        text=True,
        startupinfo=startupinfo,
    )

    client_class = LiveRTSClient if context.realtime else RTSClient
    context.client = client_class("127.0.0.1", context.port)
    deadline = time.time() + 15.0
    connected = False
    while time.time() < deadline:
        try:
            res = context.client.health()
            if res.get("ok") and (os.name != "nt" or res.get("process_id") == context.godot_proc.pid):
                connected = True
                break
        except Exception:
            time.sleep(0.15)

    if not connected:
        out = (context.reports_dir / "engine.log").read_text(encoding="utf-8", errors="replace")
        raise RuntimeError(f"Could not connect to RTS port {context.port}:\n{out}")


def before_scenario(context, scenario) -> None:
    context.live = None


def after_scenario(context, scenario) -> None:
    if context.realtime and getattr(context, "live", None):
        context.live.finish(str(scenario.status))
    try:
        obs = context.client.get_observation()
        raw_name = scenario.name.lower().replace(" ", "_").replace("-", "_")
        scenario_key = "".join([c for c in raw_name if c.isalnum() or c == "_"])
        state_path = context.reports_dir / f"gamestate_{scenario_key}.json"
        state_path.write_text(json.dumps(obs, indent=2), encoding="utf-8")
    except Exception:
        pass


def after_all(context) -> None:
    proc = getattr(context, "godot_proc", None)
    if proc and proc.poll() is None and os.environ.get("RTS_KEEP_OPEN") != "1":
        proc.terminate()
        try:
            proc.wait(timeout=3.0)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3.0)
    log_handle = getattr(context, "engine_log", None)
    if log_handle:
        log_handle.close()
        log = (context.reports_dir / "engine.log").read_text(encoding="utf-8", errors="replace")
        errors = [line for line in log.splitlines() if "SCRIPT ERROR:" in line or line.startswith("ERROR:")]
        if errors:
            raise RuntimeError("Godot runtime errors:\n" + "\n".join(errors[:10]))
