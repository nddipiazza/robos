from contextlib import ExitStack
import json
import math
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "games/robos-rts"))
from robos_rts_bot_sdk import RTSClient

godot, output = sys.argv[1:3]
godot = str(Path(godot).resolve())
output = Path(output).resolve()
output.mkdir(parents=True, exist_ok=True)


def wait(read, predicate, seconds=16):
    end = time.monotonic() + seconds
    result = None
    while time.monotonic() < end:
        try:
            result = read()
            if predicate(result):
                return result
        except (OSError, RuntimeError):
            pass
        time.sleep(0.04)
    raise AssertionError(result)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def spawn(stack, name, args, env):
    log = stack.enter_context((output / (name + ".log")).open("w", encoding="utf-8"))
    process = subprocess.Popen(args, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)

    def stop():
        if process.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
            else:
                process.terminate()
            process.wait(timeout=10)

    stack.callback(stop)
    return process


def click(client, x, y, button=1, **mods):
    client.mouse(x, y, button, **mods)
    client.mouse(x, y, button, pressed=False, **mods)


def key(client, name, **mods):
    client.key(name, **mods)
    client.key(name, pressed=False, **mods)


def ui(client):
    return client.ui().get("state", {})


def unit(client, tag):
    return next(u for u in client.get_observation()["units"] if u["tag"] == tag)


def workers(observation, seat):
    return {u["tag"] for u in observation["units"] if u["owner"] == seat and u["is_worker"]}


def open_online_menu(stack, name, audio_path=None):
    port = free_port()
    env = dict(os.environ, RTS_MODE="human", RTS_WEB_SERVICE_PORT=str(port),
               RTS_DISPLAY_PREFS=str(output / f"{name}.cfg"))
    position = "-1600,-900"
    args = ["--no-music"]
    if audio_path:
        from window_capture import offscreen_position
        position = offscreen_position()
        env["RTS_RECORD_AUDIO_PATH"] = str(audio_path)
        args = []
    process = spawn(stack, name, [godot, "--path", "games/robos-rts", "--position", position,
                    "--rendering-method", "gl_compatibility", "--", *args], env)
    client = RTSClient(port=port)
    wait(lambda: ui(client), lambda state: state.get("page") == "main")
    click(client, 810, 471)
    wait(lambda: ui(client), lambda state: state.get("page") == "online")
    client.screenshot(str(output / f"{name}-online-menu.png"))
    return client, process


def join_match(stack, label):
    clients = []
    processes = []
    for seat in (1, 2):
        client, process = open_online_menu(stack, f"{label}-{seat}")
        click(client, 350, 635)
        wait(lambda: ui(client), lambda state: state.get("online_seat") == seat)
        clients.append(client)
        processes.append(process)
        print(f"{label}: Client {seat} joined through the title menu", flush=True)
    for seat, client in enumerate(clients, 1):
        wait(lambda: ui(client), lambda state: state.get("online_status") == "playing" and state.get("local_player") == seat, 30)
        assert client.get_observation()["match"]["mode"] == "online_1v1"
        assert client.health()["manual_step_requests"] == 0
    return clients, processes


def test_human_match():
    with ExitStack() as stack:
        env = dict(os.environ, RTS_ROOM_CODE="")
        spawn(stack, "server", ["node", "packages/robos-game-server/server.mjs", "--godot", godot], env)
        wait(lambda: (output / "server.log").read_text(encoding="utf-8", errors="replace"), lambda log: '"listening"' in log)
        clients, _ = join_match(stack, "first")

        p1, p2 = clients
        initial = p1.get_observation()
        for seat, client in enumerate(clients, 1):
            hub = next(u for u in initial["units"] if u["owner"] == seat and u["unit_type"] == "colony_hub")
            assert client.select(tags=[hub["tag"]])["ok"]
            key(client, "S")
            for replica in clients:
                wait(lambda: unit(replica, hub["tag"]), lambda u: u["production_queue_len"] == 1)
            print(f"Player {seat} queued a Pioneer, replicated to both clients", flush=True)

        worker = next(u for u in initial["units"] if u["owner"] == 1 and u["is_worker"])
        x, y = worker["pos"]["x"], worker["pos"]["y"]
        center = next(u["pos"] for u in initial["units"] if u["owner"] == 1 and u["is_structure"])
        heading = (1 if center["x"] < 80 else -1)
        p1.focus_camera(x, y, 45)
        assert p1.select(tags=[worker["tag"]])["ok"]
        first, second = p1.project((x + heading * 6, y + 7), (x + heading * 9, y + 10))
        started = time.monotonic()
        click(p1, *first, button=2)
        click(p1, *second, button=2, shift=True)
        for replica in clients:
            wait(lambda: unit(replica, worker["tag"]), lambda u: len(u["orders"]) == 2)
        latency_ms = round((time.monotonic() - started) * 1000)
        wait(lambda: unit(p2, worker["tag"])["pos"], lambda p: math.hypot(p["x"] - x, p["y"] - y) > 2)
        print(f"Move plus queued move replicated ({latency_ms} ms including HTTP/UI checks)", flush=True)

        trained = {}
        for replica in clients:
            observation = wait(replica.get_observation, lambda o: all(
                len(workers(o, seat) - workers(initial, seat)) == 1 for seat in (1, 2)), 30)
            for seat in (1, 2):
                new_tags = workers(observation, seat) - workers(initial, seat)
                assert trained.setdefault(seat, new_tags) == new_tags
        print("Both clients saw the same newly trained workers.", flush=True)

        key(p2, "F8")
        wait(lambda: ui(p2), lambda state: state.get("match_menu_visible"))
        first_tick = p2.health()["tick"]
        wait(p2.health, lambda state: state["tick"] > first_tick + 12)
        p2.screenshot(str(output / "online-match-menu.png"))
        key(p2, "Tab")
        key(p2, "Enter")
        for client in clients:
            match = wait(lambda: client.get_observation()["match"], lambda state: state.get("status") == "finished")
            assert match["winner"] == 1 and match["reason"] == "surrender", match
        p1.screenshot(str(output / "online-victory.png"))
        p2.screenshot(str(output / "online-defeat.png"))
        print("Two-player online match passed through surrender and both scorecards.", flush=True)

        # The same server should release the old seats and start a second match.
        replacement, processes = join_match(stack, "second")
        processes[1].kill()
        match = wait(lambda: replacement[0].get_observation()["match"],
                     lambda state: state.get("status") == "finished", 15)
        assert match["winner"] == 1 and match["reason"] == "disconnect", match
        print("The same server hosted a second match and awarded a disconnect forfeit.", flush=True)


def join_ai_lobby(host, viewer):
    click(host, 960, 493)
    wait(lambda: ui(host), lambda state: state.get("online_status") == "waiting")
    click(viewer, 960, 593)
    wait(lambda: ui(viewer), lambda state: state.get("online_status") == "waiting")
    click(host, 960, 493)
    for client in (host, viewer):
        wait(lambda: ui(client), lambda state: state.get("online_status") == "playing", 30)


def server_results(server_log):
    log = server_log.read_text(encoding="utf-8", errors="replace")
    return [json.loads(line.partition(" ")[2]) for line in log.splitlines()
            if line.startswith("ROBOS_GAME_EVENT ") and '"finished"' in line]


def test_ai_match(record=False, viewer_lifecycle=False, concord=False):
    with ExitStack() as stack:
        env = dict(os.environ, RTS_ROOM_CODE="", RTS_MODE="backend")
        speed = "1" if record else os.environ.get("RTS_TEST_SERVER_SPEED", "3")
        timeout = max(420, 1800 / float(speed) + 90)
        spawn(stack, "server", [godot, "--headless", "--time-scale", speed, "--path", "games/robos-rts",
              "--script", "res://scripts/network/RTSService.gd", "--", "--dedicated-rts", "--rts-seed=3"], env)
        server_log = output / "server.log"
        wait(lambda: server_log.read_text(encoding="utf-8", errors="replace"), lambda log: '"listening"' in log)
        audio_path = output / "game-audio.wav" if record else None
        host, host_process = open_online_menu(stack, "ai-host", audio_path)
        if record:
            from window_capture import WindowCapture
            ffmpeg = shutil.which("ffmpeg")
            if not ffmpeg:
                raise RuntimeError("FFmpeg is required for a match recording")
            capture = WindowCapture(ffmpeg, host_process.pid, output)
            capture.start()
            stack.callback(capture.stop)
            before = time.monotonic()
            assert host._request("POST", "/capture/audio", {"action": "start"})["ok"]
            audio_start = (before + time.monotonic()) / 2
        viewer, _ = open_online_menu(stack, "ai-viewer")
        if concord:
            for y, up_presses in ((362, 2), (454, 3)):
                click(host, 960, y)
                for _ in range(up_presses):
                    key(host, "Up")
                key(host, "Enter")
        join_ai_lobby(host, viewer)
        choices = {"1": "aliens", "2": "monsters"} if concord else {"1": "random", "2": "random"}
        factions = choices if concord else {"1": "humans", "2": "monsters"}
        for client in (host, viewer):
            match = client.get_observation()["match"]
            assert match["mode"] == "online_ai_1v1" and match["map_id"] == "frontier-hunters", match
            assert match["faction_choices"] == choices, match
            assert match["factions"] == factions, match
            assert ui(client)["observer_player"] == 0
        print(f"Both viewers joined Frontier Hunters with faction choices {choices}", flush=True)
        key(viewer, "O")
        wait(lambda: ui(viewer), lambda state: state.get("observer_player") == 1)
        wait(lambda: ui(viewer), lambda state: state.get("commander_camera", [[]])[0]
             and math.dist(state["camera_focus"], state["commander_camera"][0]) < 16)
        key(viewer, "O")
        wait(lambda: ui(viewer), lambda state: state.get("observer_player") == 2)
        wait(lambda: ui(viewer), lambda state: state.get("commander_camera", [[], []])[1]
             and math.dist(state["camera_focus"], state["commander_camera"][1]) < 16)
        key(viewer, "O")
        wait(lambda: ui(viewer), lambda state: state.get("observer_player") == 0)
        def brood_production():
            state = host.get_observation()
            return {
                "tick": state["tick"],
                "hatch_in_progress": any(unit["unit_type"] == "brood_egg" for unit in state["units"]),
                "units_trained": state["players"]["2"]["units_trained"],
                "nest": next((unit["pos"] for unit in state["units"] if unit["unit_type"] == "brood_nest"), None),
            }

        brood = wait(brood_production, lambda state: state["nest"] and (state["hatch_in_progress"] or state["units_trained"]), 65)
        host.focus_camera(brood["nest"]["x"], brood["nest"]["y"], 50)
        host.screenshot(str(output / "brood-production.png"))
        def capture_transit(deployment):
            projection = next((unit for unit in deployment["units"]
                               if unit["unit_type"] in ("sunblade", "skirmisher", "aegis_warden", "mirage_adept")
                               and unit["build_progress"] < 1), None)
            if projection is None:
                return False
            observed = wait(viewer.get_observation, lambda state: any(
                unit["tag"] == projection["tag"] and unit["pos"] == projection["pos"] for unit in state["units"]))
            assert any(unit["unit_type"] == "transit_waystone" for unit in observed["units"]), observed
            host.focus_camera(projection["pos"]["x"], projection["pos"]["y"], 48)
            host.screenshot(str(output / "concord-transit.png"))
            print("Both viewers observed the Concord commander deploying infantry through a Transit Waystone.", flush=True)
            return True

        first = watch_until_finished(host, record, timeout, capture_transit if concord else None)
        second = wait(lambda: viewer.get_observation()["match"], lambda state: state.get("status") == "finished", 30)
        assert first["reason"] == "all_structures_destroyed" and first["winner"] in (1, 2), first
        assert first == second, (first, second)
        server_result = wait(lambda: server_results(server_log), bool)[0]
        assert server_result["winner"] == first["winner"] and server_result["reason"] == first["reason"]
        assert all(first["scorecard"][seat]["units_trained"] > 0 for seat in ("1", "2")), first
        assert all(client.health()["manual_step_requests"] == 0 for client in (host, viewer))
        host.screenshot(str(output / "ai-scorecard.png"))
        if record:
            time.sleep(2)
            assert host._request("POST", "/capture/audio", {"action": "stop"})["ok"]
            capture.stop()
            mux_recording(ffmpeg, capture, audio_path, audio_start)
        print("Both viewers and the dedicated server agreed on the elimination result", flush=True)
        if viewer_lifecycle:
            replacement, replacement_process = open_online_menu(stack, "ai-replacement")
            departing, departing_process = open_online_menu(stack, "ai-departing")
            join_ai_lobby(replacement, departing)
            key(replacement, "F8")
            wait(lambda: ui(replacement), lambda state: state.get("match_menu_visible"))
            tick = replacement.health()["tick"]
            departing_process.kill()
            wait(replacement.health, lambda health: health["tick"] > tick + 64)
            assert replacement.get_observation()["match"]["status"] == "playing"
            replacement_process.kill()
            results = wait(lambda: server_results(server_log), lambda events: len(events) == 2, timeout)
            assert results[1]["reason"] == "all_structures_destroyed" and results[1]["winner"] == server_result["winner"], results
            assert results[1]["tick"] == server_result["tick"], results
            print("The same server hosted another AI match, kept its clock running through the menu, and finished with no viewers.", flush=True)


def watch_until_finished(host, record, timeout, capture_transit=None):
    last_camera_update = 0
    last_combat_tick = 0
    transit_captured = False

    def observe():
        nonlocal last_camera_update, last_combat_tick, transit_captured
        observation = host.get_observation()
        if capture_transit and not transit_captured and capture_transit(observation):
            transit_captured = True
            last_camera_update = time.monotonic()
        if record and observation["match"]["status"] == "playing" and time.monotonic() - last_camera_update >= 2.5:
            shots = [event for event in observation["recent_events"]
                     if event["type"] == "weapon_fire" and event["tick"] > last_combat_tick]
            if shots:
                x, y = ((shots[-1]["from"][i] + shots[-1]["to"][i]) / 2 for i in range(2))
                host.focus_camera(x, y, 50)
                last_camera_update = time.monotonic()
                last_combat_tick = shots[-1]["tick"]
        return observation["match"]

    match = wait(observe, lambda state: state.get("status") == "finished", timeout)
    assert capture_transit is None or transit_captured, "The Concord commander never deployed infantry."
    return match


def mux_recording(ffmpeg, capture, audio_path, audio_start):
    offset = capture.started - audio_start
    delay = round(max(0, -offset) * 1000)
    movie = output / "frontier-hunters-online-ai.mp4"
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(capture.video),
                    "-ss", f"{max(0, offset):.6f}", "-i", str(audio_path), "-map", "0:v", "-map", "1:a",
                    "-c:v", "copy", "-af", f"adelay={delay}:all=1,apad", "-c:a", "aac", "-b:a", "160k",
                    "-shortest", "-movflags", "+faststart", str(movie)], check=True, timeout=120)
    print(f"Recorded {movie}", flush=True)


if "--ai" in sys.argv[3:]:
    sys.path.insert(0, str(ROOT / "games/robos-rts/tests/e2e"))
    test_ai_match(record="--record" in sys.argv[3:], viewer_lifecycle="--viewer-lifecycle" in sys.argv[3:],
                  concord="--concord" in sys.argv[3:])
else:
    test_human_match()
