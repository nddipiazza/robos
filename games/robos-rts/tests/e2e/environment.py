"""
environment.py — Behave lifecycle hooks for RobOS RTS 
Starts Godot 4.3 headless (in `RTS_MODE=backend`) or inside Xvfb with ffmpeg recording (in `RTS_MODE=human`),
and connects `context.client` (RTSClient) to the GameControlServer (:18095).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

PROJECT_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_DIR))

from robos_rts_bot_sdk import RTSClient


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
    context.port = int(os.environ.get("RTS_WEB_SERVICE_PORT", "18095"))
    context.reports_dir = PROJECT_DIR / "tests" / "e2e" / "reports"
    context.videos_dir = context.reports_dir / "videos"
    context.reports_dir.mkdir(parents=True, exist_ok=True)
    context.videos_dir.mkdir(parents=True, exist_ok=True)

    godot_bin = _find_godot()
    env = os.environ.copy()
    env["RTS_MODE"] = context.rts_mode
    env["RTS_WEB_SERVICE_PORT"] = str(context.port)

    cmd = [godot_bin, "--path", str(PROJECT_DIR)]
    if context.rts_mode == "backend":
        cmd.insert(1, "--headless")

    context.engine_log = (context.reports_dir / "engine.log").open("w", encoding="utf-8")
    context.godot_proc = subprocess.Popen(
        cmd,
        cwd=str(PROJECT_DIR),
        env=env,
        stdout=context.engine_log,
        stderr=subprocess.STDOUT,
        text=True,
    )

    context.client = RTSClient("127.0.0.1", context.port)
    deadline = time.time() + 15.0
    connected = False
    while time.time() < deadline:
        try:
            res = context.client.health()
            if res.get("ok"):
                connected = True
                break
        except Exception:
            time.sleep(0.15)

    if not connected:
        out = (context.reports_dir / "engine.log").read_text(encoding="utf-8", errors="replace")
        raise RuntimeError(f"Could not connect to RTS port {context.port}:\n{out}")


def after_scenario(context, scenario) -> None:
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
    if proc and proc.poll() is None:
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
