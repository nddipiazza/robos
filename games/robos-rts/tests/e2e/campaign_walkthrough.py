"""First Strike: paid base building to victory, using player 1's normal commands.

python tests/e2e/campaign_walkthrough.py [--realtime] [--record]
Backend uses deterministic /step. Rendered proof uses the live clock exclusively.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT))
from robos_rts_bot_sdk import RTSClient
from environment import _find_godot
from frontier_bot import FrontierBuildBot
from live_match import timestamp


class CampaignBuildBot(FrontierBuildBot):
    """No cheats, opponent commands, injected units, extra workers or Surge micro."""
    def __init__(self, client):
        super().__init__(client, "rush")
        self.rallied = set()
        self.peak_army = 0
        self.attack_time = None
        self.attack_tags = []
        self.assembly_started = None

    def on_step(self, obs):
        self.busy_builders = set()
        mine = [u for u in obs["units"] if u["owner"] == 1]
        army = [u for u in mine if u["unit_type"] == "rifleman"]
        self.peak_army = max(self.peak_army, len(army))
        if self.attacking:
            assert army, "The paid 40-Rifleman army was defeated"
            idle = [u["tag"] for u in army if not u["orders"]]
            enemies = [u for u in obs["units"] if u["owner"] == 2]
            if idle and enemies:
                target = min(enemies, key=lambda u: self.distance(u["pos"], {"x":132,"y":56}))
                self.client.command("attack_move", tags=idle, x=target["pos"]["x"], y=target["pos"]["y"])
            return
        if len(army) == 40:
            # Finish rallying the last reinforcements before committing the army.
            # These are ordinary move orders, not formation/state injection.
            if self.assembly_started is None:
                assert self.client.command("move",tags=[u["tag"] for u in army],x=38,y=58)["accepted"]==40
                self.assembly_started = obs["sim_time"]
                return
            if obs["sim_time"]-self.assembly_started < 30 or any(self.distance(u["pos"],{"x":38,"y":58})>12 for u in army):
                return
            self.attack_tags = [u["tag"] for u in army]
            result = self.client.command("attack_move", tags=self.attack_tags, x=132, y=56)
            assert result["accepted"] == 40, result
            self.attacking = True
            self.attack_time = obs["sim_time"]
            return
        workers = [u for u in mine if u["is_worker"] and (not u["orders"] or u["orders"][0]["type"] != "build")]
        crystals = [r for r in obs["resources"] if r["resource_type"] == "crystal_field" and r["amount"] > 0]
        for w in workers:
            if not w["orders"]:
                resource = min(crystals, key=lambda r: self.distance(r["pos"], w["pos"]))
                self.client.command("harvest", tags=[w["tag"]], target_tag=resource["tag"])
        p = obs["players"]["1"]
        base = {"x":28,"y":56}
        halls = [u for u in mine if u["unit_type"] == "muster_hall"]
        silos = [u for u in mine if u["unit_type"] == "silo"]
        pending = [o["structure_type"] for u in mine for o in u["orders"]
                   if o["type"] == "build" and not o.get("structure_tag")]
        # Build supply ahead of production so the army can reach 40 + 12 workers.
        if p["supply_cap"] - p["supply_used"] <= 5 and p["supply_cap"] < 55:
            if not any(u["build_progress"] < 1 for u in silos) and "silo" not in pending:
                self.build_structure(obs, workers, "silo", base, 100)
        elif len(halls) + pending.count("muster_hall") < 4:
            self.build_structure(obs, workers, "muster_hall", base, 150)
        queued = sum(u["production_queue_len"] for u in halls)
        for hall in halls:
            if hall["build_progress"] < 1:
                continue
            if hall["tag"] not in self.rallied:
                assert self.client.command("rally", tags=[hall["tag"]], x=38, y=58)["accepted"] == 1
                self.rallied.add(hall["tag"])
            if not hall["production_queue_len"] and len(army) + queued < 40:
                result = self.client.command("train_rifleman", tags=[hall["tag"]])
                if result.get("accepted"):
                    queued += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--realtime", action="store_true")
    parser.add_argument("--record", action="store_true")
    args = parser.parse_args()
    if args.record:
        args.realtime = True
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = PROJECT / "tests/e2e/reports/campaign" / stamp
    output.mkdir(parents=True)
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    env = {**os.environ, "RTS_MODE": "realtime" if args.realtime else "backend", "RTS_WEB_SERVICE_PORT":str(port)}
    engine = _find_godot().replace("_console.exe", ".exe")
    command = [engine, "--path", str(PROJECT), "--audio-driver", "Dummy",
               "--windowed" if args.realtime else "--headless", "--", "--scenario=campaign-first-strike"]
    startup = None
    if os.name == "nt":
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
    client = RTSClient(port=port)
    events, captures, samples = [], [], []
    last_event = None
    started = time.monotonic()
    next_capture = 0

    def capture():
        if not args.record:
            return
        folder = output / "frames"
        folder.mkdir(exist_ok=True)
        path = folder / f"{len(captures):06}.jpg"
        assert client.screenshot(path.as_posix())["ok"]
        captures.append((path, time.monotonic()-started))

    def narrate(title, detail):
        nonlocal last_event
        if last_event == title:
            return
        last_event = title
        events.append({"at": time.monotonic()-started, "title":title, "detail":detail})
        print(title + ": " + detail, flush=True)
        if args.realtime:
            client.set_overlay(title, detail)
            capture()

    with (output / "engine.log").open("w", encoding="utf-8") as log:
        proc = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT, startupinfo=startup,
            creationflags=subprocess.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 0)
        try:
            for _ in range(150):
                if proc.poll() is not None:
                    raise RuntimeError("Engine exited; see " + str(output / "engine.log"))
                try:
                    if client.health().get("process_id") == proc.pid:
                        break
                except OSError:
                    pass
                time.sleep(.1)
            else:
                raise RuntimeError("Engine startup timed out")
            initial = client.get_observation()
            assert initial["match"]["status"] == "briefing" and initial["tick"] == 0
            assert sum(u["owner"]==1 and u["is_worker"] for u in initial["units"]) == 12
            assert initial["players"]["1"]["crystal"] == 150
            assert not any(u["owner"]==1 and u["unit_type"]=="rifleman" for u in initial["units"])
            narrate("First Strike: mission briefing", "Build a base, train about 40 Riflemen, then clear the eastern stronghold.")
            if args.realtime:
                deadline = time.monotonic()+30
                while not client.ui()["state"].get("rifle_fx_warm"):
                    assert time.monotonic()<deadline
                    time.sleep(.1)
                assert client.ui()["state"]["campaign_briefing_visible"]
                client.screenshot((output/"briefing.png").as_posix())
                # Real keyboard input exercises the briefing's Begin action.
                client.key("Enter", True)
                client.key("Enter", False)
                assert client.get_observation()["match"]["status"] == "playing"
                client.set_playback(speed=8)
                client.focus_camera(38, 56, height=72)
            else:
                assert client.mission()["ok"]
            bot = CampaignBuildBot(client)
            last_second = -1
            while time.monotonic()-started < 600:
                obs = client.get_observation()
                if obs["match"]["status"] == "finished":
                    break
                assert obs["sim_time"] < 900, "Mission exceeded 15 game minutes"
                second = int(obs["sim_time"])
                if second != last_second:
                    bot.on_step(obs)
                    last_second = second
                    rifles = sum(u["owner"]==1 and u["unit_type"]=="rifleman" for u in obs["units"])
                    if second % 15 == 0:
                        samples.append({"time":obs["sim_time"],"riflemen":rifles,"player":obs["players"]["1"]})
                    stage = "Assault the stronghold" if bot.attacking else ("Train the army" if rifles else "Build the base")
                    detail = ("40 paid Riflemen attack east. Defeat all defenders and destroy the Brood Nest." if bot.attacking else
                              "Pioneers gather crystal. Build Provision Silos and Muster Halls; train Riflemen up to 40 army supply.")
                    narrate(stage, detail)
                    if bot.attacking and args.realtime:
                        army = [u for u in obs["units"] if u["owner"]==1 and u["unit_type"]=="rifleman"]
                        if army:
                            client.focus_camera(sum(u["pos"]["x"] for u in army)/len(army),sum(u["pos"]["y"] for u in army)/len(army),height=66)
                if args.realtime:
                    if time.monotonic() >= next_capture:
                        capture()
                        next_capture = time.monotonic()+.25
                    time.sleep(.05)
                else:
                    client.step(64)
            else:
                raise AssertionError("Walkthrough exceeded wall-clock budget")
            assert obs["match"]["winner"] == 1 and obs["match"]["reason"] == "stronghold_cleared", obs["match"]
            assert not any(u["owner"]==2 for u in obs["units"])
            assert bot.peak_army == 40 and len(bot.attack_tags) == 40
            assert 180 <= bot.attack_time <= 800, bot.attack_time
            (output/"final-observation.json").write_text(json.dumps(obs,indent=2),encoding="utf-8")
            p = obs["players"]["1"]
            assert p["crystal_collected"] >= 2950 and p["supply_cap"] >= 55, p
            assert 150+p["crystal_collected"]-p["crystal"] == 3100, f"Must pay 2000 for Riflemen, 600 for halls and 500 for Silos: {p}"
            assert p["structures_built"] == 9
            produced = [u for u in obs["match"]["results"]["units"] if u["owner"]==1 and u["unit_type"]=="rifleman"]
            assert len(produced)==40 and all(0<u["alive_seconds"]<obs["sim_time"] for u in produced)
            survivors = sum(u["alive"] for u in produced)
            assert 1<=survivors<=24, survivors
            narrate("Mission complete", f"Built and paid for 40 Riflemen. Stronghold cleared; {survivors} Riflemen survived.")
            if args.realtime:
                time.sleep(.5)
                assert client.ui()["state"]["campaign_results_visible"]
                client.screenshot((output/"victory.png").as_posix())
                capture()
                # Reset returns to briefing, clears production/results and restores economy.
                client.key("F9", True)
                client.key("F9", False)
                reset = client.get_observation()
                assert reset["match"]["status"] == "briefing" and reset["tick"] == 0
                assert reset["players"]["1"]["crystal"]==150
            summary = {"passed":True,"realtime":args.realtime,"manual_steps":0 if args.realtime else last_second+1,
                       "attack_time":bot.attack_time,"game_seconds":obs["sim_time"],"survivors":survivors,
                       "initial":initial,"final":obs,"progression":samples,"events":events}
            (output/"proof.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
    engine_log = (output/"engine.log").read_text(encoding="utf-8")
    assert "SCRIPT ERROR:" not in engine_log and "ERROR:" not in engine_log, engine_log
    if args.record:
        # Duplicate captured images onto a fixed-rate wall-clock video timeline.
        import imageio_ffmpeg
        ffmpeg = shutil.which("ffmpeg") or imageio_ffmpeg.get_ffmpeg_exe()
        listing = output/"frames.txt"
        entries=[]
        for i,(path,at) in enumerate(captures):
            end=captures[i+1][1] if i+1<len(captures) else at+2
            entries.extend(["file '"+path.as_posix()+"'", f"duration {max(.01,end-at):.4f}"])
        entries.append("file '"+captures[-1][0].as_posix()+"'")
        listing.write_text("\n".join(entries),encoding="utf-8")
        subprocess.run([ffmpeg,"-y","-f","concat","-safe","0","-i",str(listing),"-vf","fps=10,scale=1280:-2",
                        "-c:v","libx264","-preset","fast","-crf","24","-pix_fmt","yuv420p",str(output/"walkthrough.mp4")],
                       check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        captions=["WEBVTT", ""]
        for i,e in enumerate(events):
            end=events[i+1]["at"] if i+1<len(events) else captures[-1][1]+2
            captions.extend([str(i+1),f'{timestamp(e["at"])} --> {timestamp(end)}',e["title"]+". "+e["detail"],""])
        (output/"walkthrough.vtt").write_text("\n".join(captions),encoding="utf-8")
        (output/"walkthrough.md").write_text("# First Strike paid mission walkthrough\n\n"+"\n".join(
            f'- {e["title"]}: {e["detail"]}' for e in events)+f'\n\n40 Riflemen; {survivors} survivors. Live clock at 8x; no manual stepping or free units.\n',encoding="utf-8")
        archive=Path.home()/".robos/development/walkthroughs/rts-first-strike"
        history=archive/"history"/stamp
        history.mkdir(parents=True,exist_ok=True)
        for name in ("walkthrough.mp4","walkthrough.vtt","walkthrough.md","proof.json","briefing.png","victory.png"):
            shutil.copy2(output/name,history/name)
            shutil.copy2(output/name,archive/name)
    print(f"PASS: 40 paid Riflemen, {survivors} survivors, attack at {bot.attack_time:.1f}s, victory at {obs['sim_time']:.1f}s. {output}")


if __name__ == "__main__":
    main()
