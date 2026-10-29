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
            assert client.load_scenario_slug("allied-crowd-flank")["ok"]
            crowd_opening = client.get_observation()
            rear = next(u for u in crowd_opening["units"] if u["id"] == "rear")
            enemy = next(u for u in crowd_opening["units"] if u["id"] == "enemy")
            holders = {u["tag"]: u["pos"] for u in crowd_opening["units"] if u["tag"] != rear["tag"]}
            assert client.command("hold_position", tags=list(holders))["accepted"] == 10
            client.select(tags=[u["tag"] for u in crowd_opening["units"] if u["owner"] == 1])
            client.focus_camera(45, 34, height=46)
            event("Blocked by allies", "Nine Riflemen hold position. A rear Rifleman must route around them to a durable target dummy.")
            time.sleep(.5)
            assert client.command("attack_target", tags=[rear["tag"]], target_tag=enemy["tag"])["accepted"] == 1
            client.set_playback(paused=False, speed=1)
            event("Find a route around allies", "Local navigation finds a clear firing position without shoving the holding line.")
            crowd_deadline = time.monotonic()+15
            crossing = None
            while time.monotonic() < crowd_deadline:
                capture()
                crowd_final = client.get_observation()
                moving = next(u for u in crowd_final["units"] if u["tag"] == rear["tag"])
                if crossing is None and moving["pos"]["x"] > 36:
                    crossing = moving["pos"]["y"]
                if any(e["type"] == "weapon_fire" and e["attacker_tag"] == rear["tag"] for e in crowd_final["recent_events"]):
                    break
                time.sleep(.05)
            else:
                raise AssertionError("The rear Rifleman never found a firing position")
            assert crossing is not None and abs(crossing-32) > 9.5, crossing
            for unit in crowd_final["units"]:
                if unit["tag"] in holders:
                    before = holders[unit["tag"]]
                    assert abs(unit["pos"]["x"]-before["x"]) < .05 and abs(unit["pos"]["y"]-before["y"]) < .05
            client.pause(True)
            event("Flanking route complete", "The rear Rifleman cleared the end of the allied line and fired. All holding units stayed in place.")
            client.screenshot((output / "allied-detour.png").as_posix())
            crowd_trial = {"opening": crowd_opening, "final": crowd_final, "crossing_y": crossing}
            time.sleep(.4)
            assert client.load_scenario_slug("riflemen-vs-riflemen")["ok"]
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
            results_ui = client.ui()["state"]["battle_results"]
            assert results_ui["visible"] and len(results_ui["tabs"]) == 4, results_ui
            for index, tab in enumerate(results_ui["tabs"]):
                x,y,w,h = tab["rect"]
                client.mouse(x+w/2, y+h/2, pressed=True)
                client.mouse(x+w/2, y+h/2, pressed=False)
                assert client.ui()["state"]["battle_results"]["current_tab"] == index
                client.screenshot((output / f"results-tab-{index}.png").as_posix())
            x,y,w,h = results_ui["save_rect"]
            client.mouse(x+w/2, y+h/2, pressed=True)
            client.mouse(x+w/2, y+h/2, pressed=False)
            saved = client.ui()["state"]["battle_results"]["saved"]
            assert saved.startswith("Saved: "), saved
            exported = json.loads(Path(saved.removeprefix("Saved: ")).read_text(encoding="utf-8"))
            assert exported["ticks"] == obs["tick"] and len(exported["units"]) == 20
            key("Escape")
            assert not client.ui()["state"]["battle_results_visible"]
            key("R")
            assert client.ui()["state"]["battle_results_visible"]
            key("F9")
            assert client.get_observation()["match"]["status"] == "ready"
            assert not client.ui()["state"]["battle_results_visible"]
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
                "crowd_navigation": crowd_trial,
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
