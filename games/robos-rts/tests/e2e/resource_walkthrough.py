"""Rendered economy proof: authored crescents, native gather input, paid gas and gold.

Uses paused mechanics fixtures and manual stepping, not a live-play performance
measurement. The captioned screenshot walkthrough is archived with its proof.
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
sys.path.insert(0,str(PROJECT))
from robos_rts_bot_sdk import RTSClient
from environment import _find_godot
from live_match import timestamp


def main():
    output=PROJECT/"tests/e2e/reports/resource-economy"
    output.mkdir(parents=True,exist_ok=True)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1",0))
        port=reservation.getsockname()[1]
    client=RTSClient(port=port)
    startup=None
    if os.name=="nt":
        startup=subprocess.STARTUPINFO()
        startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow=0
    events=[]

    def proof(name,title,detail):
        client.set_overlay(title,detail)
        time.sleep(.15)
        assert client.screenshot((output/(name+".png")).as_posix())["ok"]
        events.append({"file":name+".png","title":title,"detail":detail})
        print(title,flush=True)

    def open_mission():
        assert client.mission()["ok"]
        client.pause(True)
        client.focus_camera(25,61,height=64)
        time.sleep(.3)
        state=client.ui()["state"]
        if not state["campaign_objectives_collapsed"]:
            x,y,w,h=state["campaign_objective_toggle_rect"]
            client.mouse(x+w/2,y+h/2,pressed=True)
            client.mouse(x+w/2,y+h/2,pressed=False)

    def right_click(x,y):
        sx,sy=client.project((x,y,1.7))[0]
        client.mouse(sx,sy,button=2,pressed=True)
        client.mouse(sx,sy,button=2,pressed=False)

    with tempfile.TemporaryDirectory(prefix="rts-economy-") as profile,(output/"engine.log").open("w",encoding="utf-8") as log:
        proc=subprocess.Popen([_find_godot().replace("_console.exe",".exe"),"--path",str(PROJECT),"--windowed",
            "--audio-driver","Dummy","--max-fps","60","--","--scenario=campaign-first-strike"],
            env={**os.environ,"RTS_MODE":"backend","RTS_WEB_SERVICE_PORT":str(port),"RTS_CONTROL_SETTINGS_DIR":profile},
            stdout=log,stderr=subprocess.STDOUT,startupinfo=startup,
            creationflags=subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name=="nt" else 0)
        try:
            for _ in range(180):
                assert proc.poll() is None,"Engine exited; see engine.log"
                try:
                    if client.health().get("process_id")==proc.pid: break
                except OSError: pass
                time.sleep(.1)
            else: raise AssertionError("Engine did not start")
            open_mission()
            obs=client.get_observation()
            crystals=[r for r in obs["resources"] if r["resource_type"]=="crystal_field"]
            vents=[r for r in obs["resources"] if r["resource_type"]=="aether_vent"]
            workers=[u["tag"] for u in obs["units"] if u["owner"]==1 and u["is_worker"]]
            hub=next(u["tag"] for u in obs["units"] if u["owner"]==1 and u["unit_type"]=="colony_hub")
            assert len(crystals)==8 and len(vents)==2 and sorted(r["amount"] for r in crystals)==[900]*4+[1800]*4
            client.select(tags=[hub])
            proof("crescent","A proper resource crescent","Eight fields curve toward the Colony Hub, alternating close/far and 900/1800 crystal. Two vents flank the arc.")
            client.select(tags=workers[:3])
            right_click(crystals[0]["pos"]["x"],crystals[0]["pos"]["y"])
            assert client.ui()["state"]["command_feedback"]["accepted"]==3
            client.step(8*64)
            obs=client.get_observation()
            assert obs["players"]["1"]["crystal_collected"]>0
            assert all(r["assigned_workers"]<=2 for r in obs["resources"] if r["resource_type"]=="crystal_field")
            proof("mining","Workers balance the line","Native resource right-clicks distribute workers across available patches. Cargo returns to the hub before income is credited.")
            for tag,vent in zip(workers[-2:],vents):
                client.command("stop",tags=[tag])
                assert client.command("build_aether_tap",tags=[tag],x=vent["pos"]["x"],y=vent["pos"]["y"])["accepted"]==1
            client.step(32*64)
            obs=client.get_observation()
            taps=sorted([u for u in obs["units"] if u["unit_type"]=="aether_tap"],key=lambda u:u["tag"])
            assert len(taps)==2 and all(u["build_progress"]==1 for u in taps)
            p=obs["players"]["1"]
            assert 150+p["crystal_collected"]-p["crystal"]==150
            for i,tap in enumerate(taps):
                assert client.command("harvest",tags=workers[i*3:i*3+3],target_tag=tap["tag"])["accepted"]==3
            client.step(20*64)
            obs=client.get_observation()
            assert obs["players"]["1"]["aether_collected"]>0
            assert all(u["assigned_workers"]==3 for u in obs["units"] if u["unit_type"]=="aether_tap")
            client.select(tags=[taps[0]["tag"]])
            proof("gas-saturated","Three workers per gas vent","Both Aether Taps were paid for and built by Pioneers. Each now has three gas workers and delivers real aether income.")
            client.select(tags=[workers[6]])
            right_click(taps[0]["pos"]["x"],taps[0]["pos"]["y"])
            client.step(8*64)
            obs=client.get_observation()
            extra=next(u for u in obs["units"] if u["tag"]==workers[6])
            assert extra["harvest_state"]=="waiting" and extra["cargo_amount"]==0
            client.select(tags=[taps[0]["tag"]])
            proof("gas-overflow","A fourth worker waits","The tap displays 4 / 3 assigned. The extra worker waits behind the vent without taking another mining slot or blocking deliveries.")
            gold=json.loads((PROJECT/"scenarios/campaign-first-strike.jsonld").read_text(encoding="utf-8"))
            for r in gold["resources"]:
                if r["type"]=="crystal_field": r["rich"]=True
            client.load_scenario(gold)
            open_mission()
            client.step(6*64)
            obs=client.get_observation()
            assert all(r["rich"] and r["yield_per_trip"]==7 for r in obs["resources"] if r["resource_type"]=="crystal_field")
            assert any(u["cargo_amount"]==7 for u in obs["units"] if u["is_worker"])
            proof("gold-crescent","Gold keeps the same crescent","An explicit high-yield fixture uses the same positions, gold crystal meshes, and seven crystal per worker trip.")
        finally:
            proc.terminate()
            proc.wait(timeout=10)
    assert "ERROR:" not in (output/"engine.log").read_text(encoding="utf-8")
    (output/"proof.json").write_text(json.dumps({"passed":True,"manual_step_fixture":True,"crystal_fields":8,"vents":2,
        "paid_tap_cost":150,"gas_workers_per_tap":3,"overflow_waits":True,"gold_yield":7,"events":events},indent=2),encoding="utf-8")
    import imageio_ffmpeg
    ffmpeg=shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()
    listing=output/"frames.txt"
    listing.write_text("\n".join(f"file '{(output/e['file']).as_posix()}'\nduration 3" for e in events)+f"\nfile '{(output/events[-1]['file']).as_posix()}'",encoding="utf-8")
    subprocess.run([ffmpeg,"-y","-f","concat","-safe","0","-i",str(listing),"-vf","fps=10,scale=1280:-2",
        "-c:v","libx264","-preset","fast","-crf","24","-pix_fmt","yuv420p",str(output/"walkthrough.mp4")],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    captions=["WEBVTT",""]
    for i,e in enumerate(events): captions.extend([f"{timestamp(i*3)} --> {timestamp((i+1)*3)}",e["title"]+". "+e["detail"],""])
    (output/"walkthrough.vtt").write_text("\n".join(captions),encoding="utf-8")
    (output/"walkthrough.md").write_text("# Resource economy\n\nPaused rendered mechanics fixtures, normal paid commands and native gather input. Screenshot walkthrough; not a live-clock performance benchmark.\n\n"+"\n".join("- "+e["title"]+": "+e["detail"] for e in events),encoding="utf-8")
    archive=Path.home()/".robos/development/walkthroughs/rts-resource-economy"
    history=archive/"history"/time.strftime("%Y%m%dT%H%M%SZ",time.gmtime())
    history.mkdir(parents=True,exist_ok=True)
    for name in ["walkthrough.mp4","walkthrough.vtt","walkthrough.md","proof.json","crescent.png","gold-crescent.png"]:
        shutil.copy2(output/name,history/name)
        shutil.copy2(output/name,archive/name)
    print("PASS: rendered crescent, mining, paid gas saturation and gold. "+str(output),flush=True)


if __name__=="__main__": main()
