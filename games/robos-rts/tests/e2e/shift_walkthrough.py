"""Native Shift placement / gather / cancel proof on the live clock, without /step.

The rich, explicit mechanics fixture isolates input and real construction timing.
Every foundation is paid for. The recorded MP4 contains live gameplay frames.
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
    output = PROJECT / "tests/e2e/reports/shift-workers"
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
    events, frames = [], []
    started = time.monotonic()

    def capture():
        path = output / f"frame-{len(frames):05}.jpg"
        assert client.screenshot(path.as_posix())["ok"]
        frames.append((path, time.monotonic()-started))

    def narrate(title, detail):
        client.set_overlay(title, detail)
        events.append({"at":time.monotonic()-started,"title":title,"detail":detail})
        print(title+": "+detail, flush=True)
        time.sleep(.1)
        capture()

    def click(x, y, button=1, **mods):
        client.mouse(x,y,button=button,pressed=True,**mods)
        client.mouse(x,y,button=button,pressed=False,**mods)

    def at(x, y, button=1, height=0, **mods):
        sx,sy = client.project((x,y,height))[0]
        assert 0<sx<1920 and 0<sy<800, (sx,sy)
        click(sx,sy,button,**mods)

    def key(name, **mods):
        client.key(name,True,**mods)
        client.key(name,False,**mods)

    def wait_for(predicate, game_budget):
        initial = client.get_observation()["sim_time"]
        deadline = time.monotonic()+70
        while True:
            obs = client.get_observation()
            if predicate(obs):
                capture()
                return obs
            assert obs["sim_time"]-initial<=game_budget and time.monotonic()<deadline, obs
            capture()
            time.sleep(.25)

    with tempfile.TemporaryDirectory(prefix="rts-shift-") as profile, (output/"engine.log").open("w",encoding="utf-8") as log:
        engine = _find_godot().replace("_console.exe",".exe")
        proc = subprocess.Popen([engine,"--path",str(PROJECT),"--windowed","--audio-driver","Dummy","--","--scenario=shift-workers"],
            env={**os.environ,"RTS_MODE":"realtime","RTS_WEB_SERVICE_PORT":str(port),"RTS_CONTROL_SETTINGS_DIR":profile},
            stdout=log,stderr=subprocess.STDOUT,startupinfo=startup,
            creationflags=subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name=="nt" else 0)
        try:
            for _ in range(180):
                assert proc.poll() is None, "Engine exited; see engine.log"
                try:
                    if client.health().get("process_id")==proc.pid: break
                except OSError: pass
                time.sleep(.1)
            else: raise AssertionError("Engine startup timed out")
            client.focus_camera(40,43,height=74)
            time.sleep(.5)
            # Drag-select the three workers, using their actual projected centers.
            points = client.project((15,40,1),(17,40,1),(15,42,1))
            xs,ys = zip(*points)
            client.drag_select(min(xs)-20,min(ys)-20,max(xs)+20,max(ys)+20)
            assert set(client.ui()["state"]["selected"])=={1004,1005,1006}
            narrate("Three workers, three queued buildings", "Drag-select the Pioneers. Shift-click three Muster Halls, then Shift-right-click crystal.")
            card = next(b for b in client.ui()["state"]["command_card"] if b["ability"]=="build_muster_hall")
            key(card["hotkey"])
            for x,y in [(40,35),(52,35),(64,35)]:
                at(x,y,shift=True)
                assert client.ui()["state"]["pending_ability"]=="build_muster_hall"
            at(12,40,button=2,height=1.7,shift=True)
            ui = client.ui()["state"]
            assert ui["pending_ability"]=="" and ui["command_feedback"]["accepted"]==3 and ui["command_feedback"]["queued"]
            workers = [u for u in client.get_observation()["units"] if u["tag"] in (1004,1005,1006)]
            assert all([o["type"] for o in w["orders"]]==["harvest","build","harvest"] for w in workers), workers
            client.screenshot((output/"gather-acknowledgement.png").as_posix())
            narrate("Gather order accepted", "The cyan pulse and GATHER QUEUED confirm all three workers accepted the resource click.")
            client.set_playback(speed=8)
            client.pause(False)
            obs = wait_for(lambda o:o["players"]["1"]["structures_built"]==3,110)
            halls = [u for u in obs["units"] if u["unit_type"]=="muster_hall"]
            assert len(halls)==3 and all(u["build_progress"]==1 for u in halls)
            p = obs["players"]["1"]
            assert 1500+p["crystal_collected"]-p["crystal"]==450, p
            income = p["crystal_collected"]
            narrate("All three halls completed", "Each foundation cost 150 crystal and took its normal build time. No job was stranded behind gathering.")
            obs = wait_for(lambda o:o["players"]["1"]["crystal_collected"]>=income+15,25)
            assert all(u["orders"] and u["orders"][0]["type"]=="harvest" for u in obs["units"] if u["tag"] in (1004,1005,1006))
            returned_income = obs["players"]["1"]["crystal_collected"]-income
            narrate("Builders return to crystal", "All three queued gather orders run after construction and deliver new income to the Colony Hub.")
            # A fresh fixture isolates cancellation arithmetic from ongoing income.
            client.load_scenario({"paused":True,"decor":False,"victory":"all_structures",
                "players":{"1":{"crystal":500,"aether":0}},"units":[
                {"type":"colony_hub","owner":1,"x":20,"y":48},{"type":"silo","owner":1,"x":25,"y":62},
                {"type":"pioneer","owner":1,"x":35,"y":35},{"type":"brood_nest","owner":2,"x":110,"y":80}]})
            client.focus_camera(40,40,height=60)
            client.select(tags=[1003])
            card = next(b for b in client.ui()["state"]["command_card"] if b["ability"]=="build_muster_hall")
            key(card["hotkey"])
            at(45,35)
            client.pause(False)
            obs = wait_for(lambda o:any(u["unit_type"]=="muster_hall" for u in o["units"]),15)
            client.pause(True)
            worker = next(u for u in obs["units"] if u["tag"]==1003)
            at(worker["pos"]["x"],worker["pos"]["y"],height=1.05)
            assert client.ui()["state"]["selected"]==[1003]
            assert any(b["ability"]=="cancel_build" and not b["blocked"] for b in client.ui()["state"]["command_card"])
            narrate("Select the active builder", "Selection preserves construction. The worker exposes Cancel Construction separately from Halt.")
            key("N")
            obs = client.get_observation()
            assert not any(u["unit_type"]=="muster_hall" for u in obs["units"])
            assert obs["players"]["1"]["crystal"]==462 and obs["players"]["1"]["units_lost"]==0
            key("N")
            assert client.get_observation()["players"]["1"]["crystal"]==462
            narrate("Construction cancelled; refund delivered", "N removes the unfinished hall and refunds 112 crystal: 75% of its 150 cost, rounded down. Repeating cannot refund twice.")
            proof = {"passed":True,"live_clock":True,"manual_steps":0,"completed_halls":3,"construction_spent":450,
                "returned_workers":3,"new_income":returned_income,"refund":112,"events":events}
        finally:
            proc.terminate()
            proc.wait(timeout=10)
    engine_log = (output/"engine.log").read_text(encoding="utf-8")
    assert "ERROR:" not in engine_log, engine_log
    (output/"proof.json").write_text(json.dumps(proof,indent=2))
    import imageio_ffmpeg
    ffmpeg = shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()
    listing = output/"frames.txt"
    listing.write_text("\n".join(f"file '{path.as_posix()}'\nduration {max(.04,frames[i+1][1]-at) if i+1<len(frames) else 2:.4f}" for i,(path,at) in enumerate(frames))+f"\nfile '{frames[-1][0].as_posix()}'")
    subprocess.run([ffmpeg,"-y","-f","concat","-safe","0","-i",str(listing),"-vf","fps=10,scale=1280:-2",
        "-c:v","libx264","-preset","fast","-crf","24","-pix_fmt","yuv420p",str(output/"walkthrough.mp4")],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    offset = frames[0][1]
    captions = ["WEBVTT",""]
    for i,event in enumerate(events):
        end = events[i+1]["at"] if i+1<len(events) else frames[-1][1]+2
        captions.extend([f"{timestamp(event['at']-offset)} --> {timestamp(end-offset)}",event["title"]+". "+event["detail"],""])
    (output/"walkthrough.vtt").write_text("\n".join(captions))
    (output/"walkthrough.md").write_text("# Shift worker commands\n\nLive clock, native mouse and keyboard; explicit paid mechanics fixture.\n\n"+"\n".join("- "+e["title"]+": "+e["detail"] for e in events))
    archive = Path.home()/".robos/development/walkthroughs/rts-shift-workers"
    history = archive/"history"/time.strftime("%Y%m%dT%H%M%SZ",time.gmtime())
    history.mkdir(parents=True,exist_ok=True)
    for name in ["walkthrough.mp4","walkthrough.vtt","walkthrough.md","proof.json"]:
        shutil.copy2(output/name,history/name)
        shutil.copy2(output/name,archive/name)
    print("PASS: live Shift build/gather and builder cancellation. "+str(output),flush=True)


if __name__=="__main__":
    main()
