"""Editor-authored live matches: player commands only; never advances ticks."""
import json
import os
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from frontier_bot import FrontierBuildBot


def timestamp(seconds):
    millis = max(0, int(seconds * 1000))
    return f"{millis//3600000:02}:{millis//60000%60:02}:{millis//1000%60:02}.{millis%1000:03}"


class PlayerActions:
    """The player bot receives only this paid-command interface, never the opponent controls."""
    def __init__(self, client):
        self.client = client
        self.owned = set()
        self.commands = []

    def observe(self, obs):
        self.owned = {u["tag"] for u in obs["units"] if u["owner"] == 1}

    def command(self, command, **args):
        assert args.get("owner", 1) == 1, "Player bot attempted to command the AI"
        assert set(args.get("tags", [])) <= self.owned, "Player bot selected opponent units"
        result = self.client.command(command, **args)
        self.commands.append({"owner": 1, "command": command, "args": args, "accepted": result.get("accepted", 0)})
        return result


class LiveMatch:
    def __init__(self, context, slug, build):
        self.client = context.client
        self.build = build
        self.slug = slug
        self.purpose = "frame_responsiveness" if slug.endswith("-responsiveness") else "full_match"
        self.rendered = not context.live_headless
        self.record = context.record_live
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        self.output = (context.reports_dir / "realtime" / f"{slug}-{stamp}").resolve()
        self.output.mkdir(parents=True)
        self.frames_dir = self.output / "frames"
        if self.record:
            self.frames_dir.mkdir()
        self.created = time.monotonic()
        self.actions = PlayerActions(self.client)
        self.bot = None if build == "idle" else FrontierBuildBot(self.actions, build)
        self.opening = None
        self.final = None
        self.events = []
        self.frames = []
        self.pending_frame = None
        self.samples = []
        self.performance = []
        self.autonomous_ticks = 0
        self.wall_seconds = 0
        self.error = None
        self.speed = 1

    def capture_editor(self):
        if self.rendered:
            self.client.screenshot((self.output / "editor.png").as_posix())
        self.capture()

    def drain_capture(self, wait=False):
        while self.pending_frame:
            result = self.client.capture_status()
            if result.get("pending"):
                if not wait:
                    return False
                time.sleep(.01)
                continue
            assert result.get("ok"), result
            self.frames.append(self.pending_frame)
            self.pending_frame = None
        return True

    def capture(self):
        if self.record:
            if not self.drain_capture():
                return
            path = self.frames_dir / f"{len(self.frames):06}.jpg"
            captured = time.monotonic() - self.created
            result = self.client.screenshot(path.as_posix(), asynchronous=True)
            assert result.get("ok"), result
            self.pending_frame = (path, captured)

    def event(self, name, obs, proof=""):
        if any(e["stage"] == name for e in self.events):
            return
        entry = {"stage": name, "wall_seconds": time.monotonic()-self.created,
                 "game_seconds": obs["sim_time"], "proof": proof}
        self.events.append(entry)
        if self.rendered:
            self.follow_camera(obs)
            self.client.set_overlay(name, proof)
        self.capture()

    def follow_camera(self, obs):
        if not self.rendered:
            return
        army = [u for u in obs["units"] if u["owner"] == 1 and not u["is_worker"] and not u["is_structure"]]
        if army:
            enemies = [u for u in obs["units"] if u["owner"] == 2]
            leader = min(army, key=lambda u: min((FrontierBuildBot.distance(u["pos"], e["pos"]) for e in enemies), default=0))
            self.client.select(tags=[u["tag"] for u in army[:28]])
        else:
            workers = [u for u in obs["units"] if u["owner"] == 1 and u["is_worker"]]
            leader = workers[0] if workers else obs["units"][0]
            self.client.select(tags=[leader["tag"]])
        self.client.focus_camera(leader["pos"]["x"], leader["pos"]["y"], height=64)

    def milestones(self, obs):
        p = obs["players"]
        counts = {pid: {} for pid in (1, 2)}
        for u in obs["units"]:
            counts[u["owner"]][u["unit_type"]] = counts[u["owner"]].get(u["unit_type"], 0)+1
        proof = f"{self.speed}x live clock | Player: {self.build} | AI: {obs['match']['difficulty']} {obs['match']['strategy']}"
        if all(p[str(pid)]["crystal_collected"] >= 100 for pid in (1, 2)):
            self.event("Workers gather crystal", obs, proof)
        if all(counts[pid].get("muster_hall", 0) for pid in (1, 2)):
            self.event("Production buildings under construction", obs, proof)
        if self.bot and self.bot.produced:
            self.event("The player assembles an army", obs, proof)
        if sum(player["units_killed"] for player in p.values()) > 0:
            self.event("The armies engage", obs, proof)
        return counts

    def run(self, speed):
        self.speed = speed
        started = time.monotonic()
        deadline = started + float(os.environ.get("RTS_WALL_TIMEOUT", max(180, 900/speed*3)))
        last_decision = -4
        last_sample = -8
        next_frame = next_camera = started
        self.event("Standard opening: 12 workers per side", self.opening, f"{speed}x live playback; all buildings and units are paid for")
        try:
            self.client._request("POST", "/performance", {"reset": True})
            assert self.client.set_playback(paused=False, speed=speed)["ok"]
            # Observe progression with no actions, proving the frame loop owns the clock.
            before = self.client.get_observation()["tick"]
            time.sleep(0.25)
            self.autonomous_ticks = self.client.get_observation()["tick"] - before
            assert self.autonomous_ticks > 0, "The live frame clock did not advance"
            while time.monotonic() < deadline:
                obs = self.client.get_observation()
                self.final = obs
                if obs["match"]["status"] == "finished":
                    self.event("Victory" if obs["match"]["winner"] == 1 else "Defeat", obs, "Every defeated structure was destroyed through normal combat")
                    break
                assert obs["sim_time"] < 900, "No match result within 900 game seconds"
                if self.bot and obs["sim_time"]-last_decision >= 4:
                    self.actions.observe(obs)
                    self.bot.on_step(obs)
                    last_decision = obs["sim_time"]
                counts = self.milestones(obs)
                if obs["sim_time"]-last_sample >= 8:
                    self.samples.append({"wall_seconds": time.monotonic()-started, "game_seconds": obs["sim_time"],
                                         "tick": obs["tick"], "players": obs["players"], "units": counts})
                    last_sample = obs["sim_time"]
                    self.performance.append(self.client._request("POST", "/performance", {"reset": True}))
                now = time.monotonic()
                if now >= next_frame:
                    self.capture()
                    next_frame = now+0.1
                if self.rendered and now >= next_camera:
                    self.follow_camera(obs)
                    next_camera = now+2
                time.sleep(0.05)
            else:
                raise AssertionError("Live match exceeded its wall-clock deadline")
        except Exception as error:
            self.error = str(error)
            raise
        finally:
            self.wall_seconds = time.monotonic()-started
            self.final = self.client.get_observation()
            self.capture()
            self.drain_capture(wait=True)
            if self.rendered:
                self.client.screenshot((self.output / "result.png").as_posix())

    def finish(self, status):
        self.drain_capture(wait=True)
        self.final = self.final or self.client.get_observation()
        health = self.client.health()
        report = {"status": status, "purpose": self.purpose, "build": self.build, "speed": self.speed, "wall_seconds": self.wall_seconds,
                  "autonomous_ticks": self.autonomous_ticks, "manual_step_requests": health.get("manual_step_requests"),
                  "error": self.error, "match": self.final.get("match"), "events": self.events,
                  "performance": self.performance, "actual_game_seconds_per_wall_second": self.final["sim_time"]/max(.001, self.wall_seconds),
                  "samples": self.samples, "player_commands": self.actions.commands, "final_observation": self.final}
        (self.output / "proof.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        captions = ["WEBVTT\n"]
        rows = []
        for i, event in enumerate(self.events):
            start = event["wall_seconds"]
            end = self.events[i+1]["wall_seconds"] if i+1 < len(self.events) else time.monotonic()-self.created+0.1
            captions.append(f"{timestamp(start)} --> {timestamp(end)}\n{event['stage']}\n{event['proof']}\n")
            rows.append(f"| {timestamp(start)} | {event['game_seconds']:.1f}s | {event['stage']} |")
        (self.output / "walkthrough.vtt").write_text("\n".join(captions), encoding="utf-8")
        (self.output / "walkthrough.md").write_text(
            f"# Live RTS: {self.slug}\n\nResult: {status}. Speed: {self.speed}x. Manual step requests: {health.get('manual_step_requests')}.\n\n"
            "The editor saved and reloaded scenario.jsonld. Player 1 used paid commands; the built-in opponent ran independently.\n\n"
            "| Wall time | Game time | Visible step |\n|---|---|---|\n"+"\n".join(rows)+"\n", encoding="utf-8")
        if self.record and self.frames:
            self.encode_video()
        archive = Path.home()/".robos"/"development"/"walkthroughs"/f"rts-live-{self.slug}"
        history = archive/"history"/self.output.name
        history.mkdir(parents=True, exist_ok=True)
        for artifact in self.output.iterdir():
            if artifact.is_file():
                shutil.copy2(artifact, history/artifact.name)
                shutil.copy2(artifact, archive/artifact.name)
        print(f"Live match proof: {self.output}", flush=True)

    def encode_video(self):
        concat = self.output/"frames.ffconcat"
        lines = ["ffconcat version 1.0"]
        for i, (path, captured) in enumerate(self.frames):
            # Paths are relative and generated, so quoting never embeds a user path.
            lines.append(f"file 'frames/{path.name}'")
            following = self.frames[i+1][1] if i+1 < len(self.frames) else captured+0.5
            lines.append(f"duration {max(0.05, following-captured):.4f}")
        lines.append(f"file 'frames/{self.frames[-1][0].name}'")
        concat.write_text("\n".join(lines)+"\n", encoding="utf-8")
        video = self.output/"walkthrough.mp4"
        command = [shutil.which("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", "-safe", "0", "-f", "concat", "-i", str(concat),
                   "-vf", "fps=10", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(video)]
        with (self.output/"encoding.log").open("w", encoding="utf-8") as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=120)
        assert video.stat().st_size > 0
        assert self.frames_dir.resolve().parent == self.output.resolve(), "Frame cleanup escaped the run directory"
        shutil.rmtree(self.frames_dir)
        concat.unlink()
