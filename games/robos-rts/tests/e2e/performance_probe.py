"""Measure rendered, wall-clock gameplay, optionally including viewport captures.

This uses the same paid player build as the live E2E; it never calls /step.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from robos_rts_bot_sdk import RTSClient
from frontier_bot import FrontierBuildBot


def main():
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--duration", type=float, default=30)
    parser.add_argument("--speed", type=float, default=8)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--record", action="store_true")
    parser.add_argument("--label", default="probe")
    parser.add_argument("--warmup", type=float, default=0, help="Build to this game time at 8x before measuring")
    parser.add_argument("--p95-ms", type=float, help="Fail if the measured 95th-percentile frame exceeds this budget")
    parser.add_argument("--max-frame-ms", type=float, help="Fail if any measured frame exceeds this budget")
    args = parser.parse_args()
    output = ROOT / "tests/e2e/reports/performance" / args.label
    output.mkdir(parents=True, exist_ok=True)
    binary = os.environ["GODOT_BIN"]
    # The Windows console wrapper spawns another process. Launch the engine itself
    # so teardown owns exactly the process that renders the game.
    if os.name == "nt" and binary.endswith("_console.exe"):
        binary = binary.replace("_console.exe", ".exe")
    startup = None
    if os.name == "nt":
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
    env = dict(os.environ, RTS_MODE="realtime", RTS_WEB_SERVICE_PORT="18096")
    cmd = [binary, "--path", str(ROOT)]
    if args.headless:
        cmd.append("--headless")
    cmd.extend(["--", "--scenario=frontier-hunters"])
    with (output / "engine.log").open("w") as log:
        proc = subprocess.Popen(cmd, env=env, stdout=log, stderr=log, startupinfo=startup)
        try:
            client = RTSClient(port=18096)
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError((output / "engine.log").read_text())
                try:
                    client.health()
                    break
                except Exception:
                    time.sleep(.1)
            client.new_match("hard", "balanced", 42)
            opening = client.get_observation()
            base = next(u for u in opening["units"] if u["owner"] == 1 and u["unit_type"] == "colony_hub")
            client.focus_camera(base["pos"]["x"], base["pos"]["y"], 64)
            time.sleep(2)  # Exclude map construction and initial resource uploads.
            bot = FrontierBuildBot(client, "rush")
            client.set_playback(False, 8)
            warmup_deadline = time.monotonic() + 300
            last_order = -4
            while args.warmup and time.monotonic() < warmup_deadline:
                obs = client.get_observation()
                if obs["sim_time"] >= args.warmup or obs["match"]["status"] == "finished":
                    break
                if obs["sim_time"] - last_order >= 4:
                    bot.on_step(obs)
                    last_order = obs["sim_time"]
                time.sleep(.05)
            obs = client.get_observation()
            army = [u for u in obs["units"] if u["owner"] == 1 and not u["is_structure"] and not u["is_worker"]]
            focus = army[0] if army else base
            client.focus_camera(focus["pos"]["x"], focus["pos"]["y"], 64)
            client.select(tags=[u["tag"] for u in army[:28]])
            client._request("POST", "/performance", {"reset": True})
            client.set_playback(False, args.speed)
            started = time.monotonic()
            initial_game_time = client.get_observation()["sim_time"]
            last_order = last_shot = last_sample = -10
            samples = []
            captures = []
            while time.monotonic() - started < args.duration:
                obs = client.get_observation()
                elapsed = time.monotonic() - started
                if obs["sim_time"] - last_order >= 4:
                    bot.on_step(obs)
                    last_order = obs["sim_time"]
                if elapsed - last_sample >= 5:
                    sample = client._request("GET", "/performance")
                    sample.update(wall_time=elapsed, sim_time=obs["sim_time"])
                    samples.append(sample)
                    print(json.dumps(sample), flush=True)
                    last_sample = elapsed
                if args.record and elapsed - last_shot >= .5:
                    result = client.screenshot(str(output / "frame.jpg"), asynchronous=True)
                    captures.append(client._request("GET", "/performance")["readback_ms"])
                    last_shot = elapsed
                time.sleep(.05)
            result = client._request("GET", "/performance")
            result.update(samples=samples, captures_ms=captures, wall_time=time.monotonic()-started,
                          initial_game_time=initial_game_time, sim_time=client.get_observation()["sim_time"])
            (output / "metrics.json").write_text(json.dumps(result, indent=2))
            print(json.dumps({k:v for k,v in result.items() if k != "samples"}), flush=True)
            if not args.headless:
                client.pause(True)
                time.sleep(.1)
                client.screenshot(str(output / "result.png"))
            if args.p95_ms is not None:
                assert result["frame"]["p95_ms"] <= args.p95_ms, result["frame"]
            if args.max_frame_ms is not None:
                assert result["frame"]["max_ms"] <= args.max_frame_ms, result["frame"]
        finally:
            proc.terminate()
            proc.wait(timeout=10)


if __name__ == "__main__":
    main()
