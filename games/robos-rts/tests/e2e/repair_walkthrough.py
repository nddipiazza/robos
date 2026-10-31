"""Rendered Pioneer repair proof through native mouse/key input.

Paused, manually stepped mechanics fixtures; the captioned screenshot sequence
documents outcomes and is not a live-clock performance or audibility test.
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT))
from robos_rts_bot_sdk import RTSClient
from environment import _find_godot
from live_match import timestamp


def main():
    output = PROJECT / "tests/e2e/reports/pioneer-repair"
    output.mkdir(parents=True, exist_ok=True)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    client = RTSClient(port=port)
    startup = None
    if os.name == "nt":
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
    events = []

    def unit(kind):
        return next(u for u in client.get_observation()["units"] if u["owner"] == 1 and u["unit_type"] == kind)

    def click(kind, button=2, **mods):
        u = unit(kind)
        height = max(2.4, u["radius"] * 1.5) if u["is_structure"] else 1.9 + u["radius"] * .5
        x, y = client.project((u["pos"]["x"], u["pos"]["y"], height * .45))[0]
        client.mouse(x, y, button=button, pressed=True, **mods)
        client.mouse(x, y, button=button, pressed=False, **mods)

    def fresh(data=None):
        assert (client.load_scenario(data) if data else client.load_scenario_slug("pioneer-repair"))["ok"]
        client.pause(True)
        client.focus_camera(43, 43, height=44)
        client.select(tags=[unit("pioneer")["tag"]])
        time.sleep(.15)

    def proof(name, title, detail):
        client.set_overlay(title, detail)
        time.sleep(.15)
        assert client.screenshot((output / (name + ".png")).as_posix())["ok"]
        events.append({"file": name + ".png", "title": title, "detail": detail})
        print(title, flush=True)

    with tempfile.TemporaryDirectory(prefix="rts-repair-") as profile, (output / "engine.log").open("w", encoding="utf-8") as log:
        proc = subprocess.Popen([_find_godot().replace("_console.exe", ".exe"), "--path", str(PROJECT), "--windowed",
            "--audio-driver", "Dummy", "--max-fps", "60", "--", "--scenario=pioneer-repair"],
            env={**os.environ, "RTS_MODE": "backend", "RTS_WEB_SERVICE_PORT": str(port), "RTS_CONTROL_SETTINGS_DIR": profile},
            stdout=log, stderr=subprocess.STDOUT, startupinfo=startup,
            creationflags=subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 0)
        try:
            for _ in range(150):
                try:
                    if client.health().get("ok"):
                        break
                except Exception:
                    pass
                time.sleep(.1)
            else:
                raise AssertionError("Repair proof engine did not start")
            fresh()
            click("howitzer")
            assert unit("pioneer")["orders"][0]["type"] == "repair"
            feedback = client.ui()["state"]["command_feedback"]
            assert feedback["kind"] == "repair" and feedback["accepted"] == 1
            proof("right-click", "Right-click to repair", "The Pioneer accepts the damaged friendly Howitzer. Repair (E) is also available on its command card.")
            obs = client.step(64)
            assert abs(unit("howitzer")["repair_hp_total"] - 5.46875) < .00001
            assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (98, 99)
            proof("paid-work", "Healing and costs advance together", "One second restores 5.46875 HP. Exactly 2 crystal and 1 aether have been paid; accepting the order was free.")
            client.key("S", True)
            client.key("S", False)
            client.step(5 * 64)
            assert abs(unit("howitzer")["repair_hp_total"] - 5.46875) < .00001
            click("howitzer")
            obs = client.step(25 * 64)
            assert unit("howitzer")["hp"] == 175
            assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (70, 75)
            client.select(tags=[unit("howitzer")["tag"]])
            proof("completed", "140 HP restored for 30 crystal and 25 aether", "Halt stopped both work and spending. Right-click resumed the same accounting, then stopped automatically at full health.")
            fresh()
            client.focus_camera(43, 43, height=64)
            client.key("E", True)
            client.key("E", False)
            click("silo", button=1)
            x, y = client.project((60, 56, 0))[0]
            client.mouse(x, y, button=2, pressed=True, shift=True)
            client.mouse(x, y, button=2, pressed=False, shift=True)
            assert [o["type"] for o in unit("pioneer")["orders"]] == ["repair", "move"], {"click": [x,y], "worker": unit("pioneer"), "ui": client.ui()["state"]}
            obs = client.step(30 * 64)
            assert unit("silo")["hp"] == 400
            assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (87, 100)
            pos = unit("pioneer")["pos"]
            assert (pos["x"] - 60) ** 2 + (pos["y"] - 56) ** 2 < 9
            client.select(tags=[unit("silo")["tag"]])
            proof("structure", "Repair a building, then follow the queued move", "E plus a click repairs the Silo from 200 to 400 HP for 13 crystal and no aether. Shift-right-click moves the Pioneer afterward.")
            fresh()
            click("aether_tap")
            assert unit("pioneer")["orders"][0]["type"] == "repair"
            obs = client.step(25 * 64)
            assert unit("aether_tap")["hp"] == 500
            assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (90, 100)
            click("aether_tap")
            assert unit("pioneer")["orders"][0]["type"] == "harvest"
            proof("tap", "Damaged gas buildings repair before gathering", "Right-click repairs the Tap from 250 to 500 HP for 10 crystal. Right-clicking it at full health switches back to gas gathering.")
            empty = json.loads((PROJECT / "scenarios/pioneer-repair.jsonld").read_text(encoding="utf-8"))
            empty["players"]["1"].update(crystal=0, aether=0)
            fresh(empty)
            click("howitzer")
            obs = client.step(5 * 64)
            assert unit("howitzer")["hp"] == 35 and unit("howitzer")["repair_hp_total"] == 0
            assert unit("pioneer")["repair_state"] == "resources"
            assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (0, 0)
            proof("no-funds", "Repair pauses when resources run out", "With zero resources, the Howitzer remains at 35 HP and the Pioneer keeps its paused repair order. No free healing or negative balances.")
            fresh()
            client.key("T", True)
            client.key("T", False)
            button = next(b for b in client.ui()["state"]["command_card"] if b["ability"] == "auto_repair")
            assert button["toggle_state"] == "On"
            obs = client.step(64)
            assert unit("pioneer")["orders"][0]["automatic"]
            assert abs(unit("howitzer")["repair_hp_total"] - 5.46875) < .00001
            assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (98, 99)
            proof("auto-on", "Auto Repair: On", "Pressing T enables idle repair. The Pioneer acquires the nearby Howitzer itself and restores 5.46875 HP in one second for 2 crystal and 1 aether.")
            x, y, w, h = button["rect"]
            client.mouse(x + w / 2, y + h / 2, pressed=True)
            client.mouse(x + w / 2, y + h / 2, pressed=False)
            obs = client.step(5 * 64)
            assert not unit("pioneer")["auto_repair_enabled"] and not unit("pioneer")["orders"]
            assert abs(unit("howitzer")["repair_hp_total"] - 5.46875) < .00001
            assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (98, 99)
            proof("auto-off", "Toggle off stops automatic work", "Clicking the toggle turns it Off and clears only the automatic repair order. Five seconds pass with no further healing or spending.")
            client.key("T", True)
            client.key("T", False)
            client.step(1)
            assert unit("pioneer")["orders"][0]["automatic"]
            hp_before_move = unit("howitzer")["repair_hp_total"]
            balance_before_move = client.get_observation()["players"]["1"]
            client.focus_camera(40, 43, height=64)
            x, y = client.project((25, 50, 0))[0]
            client.mouse(x, y, button=2, pressed=True, shift=True)
            client.mouse(x, y, button=2, pressed=False, shift=True)
            assert [o["type"] for o in unit("pioneer")["orders"]] == ["move"]
            obs = client.step(64)
            assert unit("pioneer")["auto_repair_enabled"] and unit("pioneer")["pos"]["x"] < 33
            assert unit("howitzer")["repair_hp_total"] == hp_before_move
            assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (balance_before_move["crystal"], balance_before_move["aether"])
            proof("auto-move", "Player orders take priority", "Shift-right-click interrupts automatic work immediately. The Pioneer moves with Auto Repair still On, ready for its next idle position; travel costs nothing.")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
    log_text = (output / "engine.log").read_text(encoding="utf-8")
    assert "ERROR:" not in log_text, log_text[-4000:]
    (output / "proof.json").write_text(json.dumps({"passed": True, "manual_step_fixture": True,
        "howitzer_hp_restored": 140, "howitzer_cost": [30, 25], "silo_hp_restored": 200, "silo_cost": [13, 0],
        "native_input": True, "halt_resume": True, "shift_followup": True, "tap_priority": True, "no_free_healing": True,
        "auto_repair_hotkey": True, "auto_repair_button_off": True, "manual_override": True,
        "events": events}, indent=2), encoding="utf-8")
    import imageio_ffmpeg
    ffmpeg = shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()
    listing = output / "frames.txt"
    listing.write_text("\n".join(f"file '{(output / e['file']).as_posix()}'\nduration 4" for e in events)
        + f"\nfile '{(output / events[-1]['file']).as_posix()}'", encoding="utf-8")
    subprocess.run([ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-vf", "fps=10,scale=1280:-2",
        "-c:v", "libx264", "-preset", "fast", "-crf", "24", "-pix_fmt", "yuv420p", str(output / "walkthrough.mp4")],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    captions = ["WEBVTT", ""]
    for i, e in enumerate(events):
        captions.extend([f"{timestamp(i * 4)} --> {timestamp((i + 1) * 4)}", e["title"] + ". " + e["detail"], ""])
    (output / "walkthrough.vtt").write_text("\n".join(captions), encoding="utf-8")
    (output / "walkthrough.md").write_text("# Pioneer repair\n\nPaused rendered mechanics fixtures using native input and paid repair work. "
        "Captioned screenshot sequence, not a live-clock performance or audibility test.\n\n"
        + "\n".join("- " + e["title"] + ": " + e["detail"] for e in events), encoding="utf-8")
    archive = Path.home() / ".robos/development/walkthroughs/rts-pioneer-repair"
    history = archive / "history" / time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    history.mkdir(parents=True, exist_ok=True)
    for name in ["walkthrough.mp4", "walkthrough.vtt", "walkthrough.md", "proof.json", *[e["file"] for e in events]]:
        shutil.copy2(output / name, history / name)
        shutil.copy2(output / name, archive / name)
    print("PASS: native repair, exact costs, Halt, Shift, Tap priority, zero funds and Auto Repair toggle/override. " + str(output), flush=True)


if __name__ == "__main__":
    main()
