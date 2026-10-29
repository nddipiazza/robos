"""Rendered battle proof: real input and live clock, no /step requests.

GODOT_BIN=... python tests/e2e/battle_walkthrough.py
Requires ffmpeg on PATH (or the imageio-ffmpeg Python package).
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT))
from robos_rts_bot_sdk import RTSClient
from environment import _find_godot
from live_match import timestamp


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = PROJECT / "tests/e2e/reports/battle" / stamp
    frames = output / "frames"
    frames.mkdir(parents=True)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    env = {**os.environ, "RTS_MODE": "realtime", "RTS_WEB_SERVICE_PORT": str(port)}
    engine = _find_godot().replace("_console.exe", ".exe")
    startup = None
    if os.name == "nt":
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
    captures, events = [], []
    started = time.monotonic()
    client = RTSClient(port=port)

    def capture():
        path = frames / f"{len(captures):06}.jpg"
        at = time.monotonic()-started
        assert client.screenshot(path.as_posix())["ok"]
        captures.append((path, at))

    def event(title, detail):
        events.append({"at": time.monotonic()-started, "title": title, "detail": detail})
        assert client.set_overlay(title, detail)["ok"]
        capture()

    def key(name, **mods):
        client.key(name, True, **mods)
        client.key(name, False, **mods)

    with (output / "engine.log").open("w", encoding="utf-8") as log:
        proc = subprocess.Popen([engine, "--path", str(PROJECT), "--windowed", "--",
                                 "--scenario=riflemen-vs-riflemen"], env=env,
                                stdout=log, stderr=subprocess.STDOUT, startupinfo=startup)
        try:
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError("Engine exited during startup")
                try:
                    if client.health().get("process_id") == proc.pid:
                        break
                except OSError:
                    pass
                time.sleep(.1)
            else:
                raise RuntimeError("Engine startup timed out")
            time.sleep(.5)
            warm_deadline = time.monotonic()+30
            while not client.ui()["state"].get("rifle_fx_warm"):
                assert time.monotonic() < warm_deadline, "Effect warm-up timed out"
                time.sleep(.05)
            ui = client.ui()["state"]
            assert ui["battle_lab_visible"] and len(ui["selected"]) == 10, ui
            assert ui["display_mode"] == 0 and ui["canvas_size"] == [1920, 1080], ui
            # Measure a complete live fight without screenshot readback or encoding.
            # Recording cost must not be confused with normal play performance.
            client._request("POST", "/performance", {"reset": True})
            profile_start = time.monotonic()
            assert client.battle("start")["ok"]
            samples = []
            while time.monotonic()-profile_start < 45:
                time.sleep(.5)
                observed = client.get_observation()
                samples.append(client._request("POST", "/performance", {"reset": True}))
                if observed["match"]["status"] == "finished":
                    break
            assert observed["match"]["status"] == "finished"
            profile_wall = time.monotonic()-profile_start
            clean_performance = {"wall_seconds": profile_wall, "game_seconds": observed["sim_time"],
                "game_seconds_per_wall_second": observed["sim_time"]/profile_wall,
                "max_frame_ms": max(s["frame"]["max_ms"] for s in samples),
                "max_window_p95_ms": max(s["frame"]["p95_ms"] for s in samples), "samples": samples}
            (output / "performance.json").write_text(json.dumps(clean_performance, indent=2), encoding="utf-8")
            assert clean_performance["max_frame_ms"] < 100, clean_performance
            assert clean_performance["max_window_p95_ms"] < 33.34, clean_performance
            assert clean_performance["game_seconds_per_wall_second"] > .9, clean_performance
            assert client.battle("reset")["ok"]
            started = time.monotonic()
            event("10 Riflemen versus 10 Riflemen", "Mirrored squads, 45 HP each. Press Fight or Enter to engage.")
            time.sleep(.6)
            # The Fight button is visible at this canvas position; exercise its GUI signal.
            client.mouse(620, 126, pressed=True)
            client.mouse(620, 126, pressed=False)
            time.sleep(.2)
            assert client.get_observation()["match"]["status"] == "playing"
            key("P")
            paused_tick = client.get_observation()["tick"]
            time.sleep(.25)
            assert client.get_observation()["tick"] == paused_tick
            event("Pause and command the blue squad", "P pauses the fight. Right-click issues ordinary move commands.")
            point = client.project((36, 39))[0]
            client.mouse(*point, button=2, pressed=True)
            client.mouse(*point, button=2, pressed=False)
            assert all(u["orders"][0]["type"] == "move" for u in client.get_observation()["units"] if u["owner"] == 1)
            key("F9")
            assert client.get_observation()["tick"] == 0
            event("Reset restores both squads", "F9 restores the identical starting formation and health.")
            key("Enter")
            event("Fight!", "Both squads attack-move. The live 64 Hz clock and ordinary weapons resolve combat.")
            deadline = time.monotonic()+60
            while time.monotonic() < deadline:
                capture()
                obs = client.get_observation()
                if obs["match"]["status"] == "finished":
                    break
                time.sleep(.07)
            else:
                raise AssertionError("Live battle did not finish")
            assert obs["match"]["reason"] == "army_eliminated"
            event("Army eliminated", f"Winner: player {obs['match']['winner']}. Survivors: {len(obs['units'])}. F9 to try again.")
            time.sleep(.6)
            capture()
            frozen = obs["tick"]
            assert client.get_observation()["tick"] == frozen
            client.screenshot((output / "result.png").as_posix())
            key("F9")
            assert client.get_observation()["match"]["status"] == "ready"
            key("Enter", alt=True)
            time.sleep(.4)
            assert client.ui()["state"]["display_mode"] == 3
            key("Enter", alt=True)
            time.sleep(.4)
            assert client.ui()["state"]["display_mode"] == 0
            health = client.health()
            assert health["manual_step_requests"] == 0
            (output / "proof.json").write_text(json.dumps({"status": "passed", "events": events,
                "display": ui, "performance_without_capture": clean_performance,
                "final_battle": obs, "health": health}, indent=2), encoding="utf-8")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
    engine_log = (output / "engine.log").read_text(encoding="utf-8")
    assert "SCRIPT ERROR:" not in engine_log and "ERROR:" not in engine_log, engine_log
    captions = ["WEBVTT\n"]
    rows = []
    video_start = captures[0][1]
    for i, e in enumerate(events):
        end = events[i+1]["at"] if i+1 < len(events) else captures[-1][1]+.2
        captions.append(f"{timestamp(e['at']-video_start)} --> {timestamp(end-video_start)}\n{e['title']}\n{e['detail']}\n")
        rows.append(f"| {timestamp(e['at']-video_start)} | {e['title']} | {e['detail']} |")
    (output / "walkthrough.vtt").write_text("\n".join(captions), encoding="utf-8")
    (output / "walkthrough.md").write_text("# Rifleman battle proof\n\nLive frame clock; zero manual steps.\n\n| Time | Step | Proof |\n|---|---|---|\n"+"\n".join(rows)+"\n", encoding="utf-8")
    concat = output / "frames.ffconcat"
    lines = ["ffconcat version 1.0"]
    for i, (path, at) in enumerate(captures):
        end = captures[i+1][1] if i+1 < len(captures) else at+.5
        lines.extend([f"file 'frames/{path.name}'", f"duration {max(.05,end-at):.4f}"])
    lines.append(f"file 'frames/{captures[-1][0].name}'")
    concat.write_text("\n".join(lines), encoding="utf-8")
    encoder = shutil.which("ffmpeg")
    if not encoder:
        import imageio_ffmpeg
        encoder = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([encoder, "-y", "-loglevel", "error", "-safe", "0", "-f", "concat", "-i", str(concat),
                    "-vf", "fps=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    str(output / "walkthrough.mp4")], check=True, timeout=90)
    archive = Path.home() / ".robos/development/walkthroughs/rts-riflemen-vs-riflemen"
    for dest in (archive, archive / "history" / stamp):
        dest.mkdir(parents=True, exist_ok=True)
        for artifact in output.iterdir():
            if artifact.is_file() and artifact != concat:
                shutil.copy2(artifact, dest / artifact.name)
    print(f"Passed rendered battle proof: {output}")


if __name__ == "__main__":
    main()
