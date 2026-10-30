"""Rendered input proof in an isolated window/profile; never touches a running game.

Uses explicit paused mechanics fixtures, normal paid commands and native input.
The deterministic controls suite separately verifies edge speed and held-key timing.
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


def main():
    output = PROJECT / "tests/e2e/reports/player-controls"
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

    def key(name):
        client.key(name, True)
        client.key(name, False)

    def click(rect, portion=.5):
        x,y,w,h = rect
        client.mouse(x+w*portion, y+h*.5, pressed=True)
        client.mouse(x+w*portion, y+h*.5, pressed=False)

    def proof(name, title, detail):
        client.set_overlay(title, detail)
        time.sleep(.1)
        assert client.screenshot((output/(name+".png")).as_posix())["ok"]
        events.append({"file":name+".png", "title":title, "detail":detail})

    with tempfile.TemporaryDirectory(prefix="rts-controls-profile-") as profile, (output/"engine.log").open("w", encoding="utf-8") as log:
        settings = Path(profile)/"controls.cfg"
        settings.write_text("[camera]\nmouse_scroll_speed=80.0\n")
        engine = _find_godot().replace("_console.exe", ".exe")
        proc = subprocess.Popen([engine,"--path",str(PROJECT),"--audio-driver","Dummy","--windowed","--","--scenario=campaign-first-strike"],
            env={**os.environ,"RTS_MODE":"backend","RTS_WEB_SERVICE_PORT":str(port),"RTS_CONTROL_SETTINGS_DIR":profile},
            stdout=log,stderr=subprocess.STDOUT,startupinfo=startup,
            creationflags=subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 0)
        try:
            for _ in range(150):
                if proc.poll() is not None:
                    raise RuntimeError("Engine exited; see " + str(output/"engine.log"))
                try:
                    if client.health().get("process_id") == proc.pid:
                        break
                except OSError:
                    pass
                time.sleep(.1)
            else:
                raise RuntimeError("Engine startup timed out")
            assert client.ui()["state"]["mouse_scroll_speed"] == 80
            client.mission()
            client.pause(True)
            assert "backlog" not in client.ui()["state"]
            time.sleep(.2)
            click(client.ui()["state"]["campaign_objective_toggle_rect"])
            time.sleep(.2)
            assert client.ui()["state"]["campaign_objectives_collapsed"]
            proof("objectives-hidden","Hide the mission objectives","One click collapses the panel to Show objectives. Click again to restore it.")
            click(client.ui()["state"]["campaign_objective_toggle_rect"])
            time.sleep(.2)
            assert client.ui()["state"]["campaign_objectives_visible"]
            key("F8")
            click(client.ui()["state"]["mouse_scroll_speed_rect"],.4)
            speed = client.ui()["state"]["mouse_scroll_speed"]
            assert 30 <= speed <= 50 and str(int(speed)) in settings.read_text()
            proof("scroll-speed","Independent mouse scroll speed","The F8 slider saves the edge-scroll speed. Arrow-key speed stays unchanged; 0 disables mouse scrolling.")
            key("F8")
            units = [{"type":"colony_hub","owner":1,"x":20,"y":20}]+[
                {"type":"muster_hall","owner":1,"x":35+i*10,"y":20} for i in range(4)]+[
                {"type":"workshop","owner":1,"x":75,"y":20},
                {"type":"brood_nest","owner":2,"x":110,"y":70},
                {"type":"silo","owner":1,"x":20,"y":40,"count":5,"spread":5}]
            client.load_scenario({"victory":"all_structures","paused":True,"decor":False,
                "players":{"1":{"crystal":10000,"aether":2000}},"units":units})
            client.focus_camera(50,25,height=58)
            client.select(tags=list(range(1001,1007)))
            buttons = {b["ability"]:b for b in client.ui()["state"]["command_card"]}
            assert len({b["hotkey"] for b in buttons.values()}) == len(buttons)
            for _ in range(6):
                key(buttons["train_rifleman"]["hotkey"])
            for ability in ["train_pioneer","train_breacher","train_howitzer"]:
                key(buttons[ability]["hotkey"])
            click(buttons["train_rifleman"]["rect"])
            client.step(512)
            time.sleep(.2)
            state = client.ui()["state"]
            assert len(state["production"]) == 6 and sum(len(u["queue"]) for u in state["production"]) == 10
            assert all(u["queue"][0]["progress"] > 0 for u in state["production"])
            proof("production-top","Mixed production buildings","A paid input fixture queues ten units across six selected producers. Every train type has its own button and hotkey.")
            x,y,w,h = state["production_scroll_rect"]
            for _ in range(6):
                client.mouse(x+w*.6,y+h*.6,button=5,pressed=True)
                client.mouse(x+w*.6,y+h*.6,button=5,pressed=False)
            time.sleep(.2)
            assert client.ui()["state"]["production_scroll_vertical"] > 0
            proof("production-scrolled","See every production queue","Scroll the combined list to inspect the remaining buildings, active progress and queued unit types.")
            # Cancel through the multi-building list, including a waiting entry.
            for _ in range(8):
                client.mouse(x+w*.6,y+h*.6,button=4,pressed=True)
                client.mouse(x+w*.6,y+h*.6,button=4,pressed=False)
            time.sleep(.2)
            before = client.get_observation()["players"]["1"]
            for px,py in [(x+303,y+26),(x+417,y+98)]:
                client.mouse(px,py,button=2,pressed=True)
                client.mouse(px,py,button=2,pressed=False)
            after = client.get_observation()["players"]["1"]
            assert after["crystal"] == before["crystal"]+100 and after["supply_used"] == before["supply_used"]-2
            client.select(tags=[1002])
            before = after["crystal"]
            client.mouse(937,931,button=2,pressed=True)
            client.mouse(937,931,button=2,pressed=False)
            assert client.get_observation()["players"]["1"]["crystal"] == before+50
            proof("cancel-refund","Cancel production with a refund","Right-clicking active or waiting icons cancels only that unit, refunds its paid cost and releases supply, in both queue views.")
            client.load_scenario({"paused":True,"decor":False,"map":{"width":256,"height":256},"units":[
                {"type":"muster_hall","owner":1,"x":50,"y":50},
                {"type":"muster_hall","owner":1,"x":60,"y":50},
                {"type":"muster_hall","owner":1,"x":220,"y":160},
                {"type":"rifleman","owner":1,"x":50,"y":65},
                {"type":"rifleman","owner":1,"x":220,"y":180},
                {"type":"pioneer","owner":1,"x":40,"y":70},
                {"type":"rifleman","owner":2,"x":70,"y":65}]})
            client.focus_camera(60,55,height=50)
            sx,sy = client.project((50,50,1.89))[0]
            client.mouse(sx,sy,pressed=True)
            client.mouse(sx,sy,pressed=False)
            client.mouse(sx,sy,pressed=True,double=True)
            client.mouse(sx,sy,pressed=False)
            assert set(client.ui()["state"]["selected"]) == {1001,1002,1003}
            proof("structures-selected","Double-click selects the matching class","All three owned Muster Halls are selected, including the one outside the current view.")
            key("F3")
            assert set(client.ui()["state"]["selected"]) == {1004,1005}
            client.select(tags=[1006])
            click(client.ui()["state"]["army_rect"])
            assert set(client.ui()["state"]["selected"]) == {1004,1005}
            proof("army-selected","Select your army with F3","Both owned Riflemen are selected across the map. The worker, structures and opponent stay out of the selection.")
            client.load_scenario({"victory":"all_structures","paused":True,"decor":False,
                "players":{"1":{"crystal":1000,"aether":0}},"units":[
                {"type":"pioneer","owner":1,"x":35,"y":40},{"type":"pioneer","owner":1,"x":35,"y":45},
                {"type":"colony_hub","owner":1,"x":20,"y":40},{"type":"brood_nest","owner":2,"x":110,"y":70},
                {"type":"silo","owner":1,"x":20,"y":55}]})
            client.command("build_muster_hall",tags=[1001],x=40,y=40)
            client.step(128)
            client.focus_camera(40,40,height=40)
            obs = client.get_observation()
            worker = next(u for u in obs["units"] if u["tag"] == 1001)
            site = next(u for u in obs["units"] if u["unit_type"] == "muster_hall")
            sx,sy = client.project((worker["pos"]["x"],worker["pos"]["y"],1.05))[0]
            client.mouse(sx,sy,pressed=True)
            client.mouse(sx,sy,pressed=False)
            assert client.ui()["state"]["selected"] == [1001]
            client.step(64)
            assert next(u for u in client.get_observation()["units"] if u["tag"] == site["tag"])["build_progress"] > site["build_progress"]
            key("S")
            assert not next(u for u in client.get_observation()["units"] if u["tag"] == 1001)["orders"]
            client.select(tags=[1002])
            sx,sy = client.project((40,40,1.89))[0]
            client.mouse(sx,sy,button=2,pressed=True)
            client.mouse(sx,sy,button=2,pressed=False)
            assert next(u for u in client.get_observation()["units"] if u["tag"] == 1002)["orders"][0]["structure_tag"] == site["tag"]
            client.step(128)
            assert client.get_observation()["players"]["1"]["crystal"] == 850
            proof("construction-resumed","Halt, then resume construction","Selecting the builder preserved construction. S explicitly halted it; right-clicking assigned a replacement to the same paid foundation.")
            client.load_scenario({"victory":"all_structures","paused":True,"decor":False,
                "players":{"1":{"crystal":500,"aether":0}},"resources":[{"type":"crystal_field","x":20,"y":40,"amount":1500}],
                "units":[{"type":"colony_hub","owner":1,"x":40,"y":40},{"type":"brood_nest","owner":2,"x":110,"y":70}]})
            client.focus_camera(35,40,height=40)
            client.select(tags=[1002])
            sx,sy = client.project((20,40,.5))[0]
            client.mouse(sx,sy,button=2,pressed=True)
            client.mouse(sx,sy,button=2,pressed=False)
            key("S")
            client.step(12*64)
            worker = next(u for u in client.get_observation()["units"] if u["owner"]==1 and u["is_worker"])
            assert worker["orders"][0]["type"]=="harvest" and worker["orders"][0]["target_tag"]==1001
            client.step(20*64)
            assert client.get_observation()["players"]["1"]["crystal_collected"]>=5
            client.select(tags=[worker["tag"]])
            proof("resource-rally","Rally new workers straight to crystal","A normal producer right-click stores the resource rally; the paid new worker gathers and delivers real income.")
            client.load_scenario({"paused":True,"decor":False,"units":[
                {"type":"rifleman","owner":1,"x":20,"y":20,"count":200,"spread":1.8}]})
            client.focus_camera(32,32,height=64)
            key("F3")
            time.sleep(.4)
            state = client.ui()["state"]
            assert len(state["selected"])==200
            layouts = state["selection_layout_builds"]
            time.sleep(.4)
            assert client.ui()["state"]["selection_layout_builds"]==layouts
            proof("large-selection","Keep large selections responsive","A 200-unit rendering fixture reuses the same portrait layout across frames instead of sorting it each frame.")
        finally:
            proc.terminate()
            proc.wait(timeout=10)
    engine_log = (output/"engine.log").read_text(encoding="utf-8")
    assert "ERROR:" not in engine_log, engine_log
    (output/"proof.json").write_text(json.dumps({"passed":True,"events":events,"queued_units":10,"producers":6,
        "army_selection":True,"queue_refunds_both_views":True,"resource_rally_income":True},indent=2))
    import imageio_ffmpeg
    ffmpeg = shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()
    listing = output/"frames.txt"
    listing.write_text("\n".join("file '"+(output/e["file"]).as_posix()+"'\nduration 3" for e in events)+
        "\nfile '"+(output/events[-1]["file"]).as_posix()+"'")
    subprocess.run([ffmpeg,"-y","-f","concat","-safe","0","-i",str(listing),"-vf","fps=10,scale=1280:-2",
        "-c:v","libx264","-preset","fast","-crf","24","-pix_fmt","yuv420p",str(output/"walkthrough.mp4")],
        check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    from live_match import timestamp
    captions = ["WEBVTT", ""]
    for i,event in enumerate(events):
        captions.extend([f"{timestamp(i*3)} --> {timestamp((i+1)*3)}",event["title"]+". "+event["detail"],""])
    (output/"walkthrough.vtt").write_text("\n".join(captions))
    (output/"walkthrough.md").write_text("# Player controls\n\nPaused mechanics fixtures; normal paid commands and native input.\n\n"+
        "\n".join("- "+e["title"]+": "+e["detail"] for e in events))
    archive = Path.home()/".robos/development/walkthroughs/rts-player-controls"
    history = archive/"history"/time.strftime("%Y%m%dT%H%M%SZ",time.gmtime())
    history.mkdir(parents=True,exist_ok=True)
    for name in ["walkthrough.mp4","walkthrough.vtt","walkthrough.md","proof.json"]:
        shutil.copy2(output/name,history/name)
        shutil.copy2(output/name,archive/name)
    print("PASS: rendered army selection, queue refunds, worker rallies and player controls. " + str(output))


if __name__ == "__main__":
    main()
