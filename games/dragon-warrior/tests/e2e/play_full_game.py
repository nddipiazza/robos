#!/usr/bin/env python3
"""Full-game AI playthrough driver for Dragon Warrior.

Launches the game (headless, Xvfb or on the desktop), enables the in-engine
"play the game" mode of the robos-jrpg AI (``PlayGameBrain``) and watches the
AI play the entire game from the throne room to the ending, milestone by
milestone, using only real game inputs and the IPC web service to read state.

The driver is the *user*: it never cheats (no teleports, no stat edits); it
polls ``/api/v1/state`` and ``get_milestones`` to assert progress, invariants
(hero never standing on water/mountains, HP never negative, ...) and writes a
JSON report plus per-milestone screenshots under ``tests/e2e/reports/playthrough``.

Usage:
    python3 tests/e2e/play_full_game.py                 # whole game, headless
    python3 tests/e2e/play_full_game.py --until 18      # stop after milestone 18
    python3 tests/e2e/play_full_game.py --time-scale 8 --timeout 7200
    DW_HEADED=1 python3 tests/e2e/play_full_game.py     # watch it on your desktop
    python3 tests/e2e/play_full_game.py --record        # + playthrough.mp4 and a 12x time-lapse cut
    python3 tests/e2e/play_full_game.py --stepped       # one video + checkpoint per milestone
    python3 tests/e2e/play_full_game.py --stepped --from 45   # resume at milestone 45 from checkpoint 44
    python3 tests/e2e/play_full_game.py --stepped --only 45   # replay just milestone 45 and re-record it

Exit code is 0 only when every required milestone up to ``--until`` is done.
"""
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(HERE, "features", "steps"))
from game_steps import (  # noqa: E402
    GODOT_BIN,
    find_and_wait_for_web_service,
    get_web_service_state,
    send_web_service_command,
)

REPORTS_DIR = os.environ.get(
    "REPORTS_DIR", os.path.join(PROJECT_DIR, "tests", "e2e", "reports", "playthrough")
)
WORLD_BLOCKED_TERRAIN = {0, 6}  # water, mountain (mirrors WorldMap.BLOCKED_TERRAIN)
WIDTH, HEIGHT = "1024", "960"


# ── Helpers ─────────────────────────────────────────────────────────────────

def log(msg):
    print(time.strftime("[%H:%M:%S] ") + msg, flush=True)


def ensure_import_cache():
    """Godot resolves ``class_name`` scripts through ``.godot/``; a fresh
    checkout has none and every autoload silently fails to parse."""
    cache = os.path.join(PROJECT_DIR, ".godot", "global_script_class_cache.cfg")
    if os.path.exists(cache):
        return
    log("No .godot import cache — running `godot --headless --import` once")
    subprocess.run(
        [GODOT_BIN, "--headless", "--path", PROJECT_DIR, "--import"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600,
    )
    if not os.path.exists(cache):
        raise SystemExit("Godot import failed; cannot resolve class_name scripts")


def load_world_terrain():
    path = os.path.join(PROJECT_DIR, "assets", "maps", "worldmap_terrain.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)["terrain"]


def start_xvfb(display):
    xvfb = shutil.which("Xvfb") or os.path.expanduser("~/.local/xvfb/usr/bin/Xvfb")
    if not os.path.exists(xvfb):
        return None
    lock = f"/tmp/.X{display.lstrip(':')}-lock"
    if os.path.exists(lock):
        try:
            os.remove(lock)
        except OSError:
            pass
    proc = subprocess.Popen(
        [xvfb, display, "-screen", "0", f"{WIDTH}x{HEIGHT}x24", "-ac"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(1.0)
    return proc


def fetch_screenshot(port, path):
    """Ask the game to save a PNG of its viewport (needs a rendering driver, not --headless)."""
    if "--headless" in RUNTIME.get("cmd", []):
        return False
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/v1/command",
            data=json.dumps({"command": "capture_screenshot", "args": {"file_path": os.path.abspath(path)}}).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            res = json.loads(resp.read().decode("utf-8"))
        return bool(res.get("success")) and os.path.exists(path)
    except Exception:
        return False


RUNTIME = {"cmd": []}


class Playthrough:
    def __init__(self, args):
        self.args = args
        self.terrain = load_world_terrain()
        self.port = None
        self.godot = None
        self.xvfb = None
        self.ffmpeg = None
        self.display = None
        self.record_path = None
        self.base = max(0, args.from_milestone - 1)   # milestones already done before this run
        self.ids = []
        self.until = 0
        self.violations = []
        self.done_seen = []
        self.last_index = -1
        self.report = {
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "time_scale": args.time_scale,
            "milestones": [],
            "violations": self.violations,
        }
        os.makedirs(os.path.join(REPORTS_DIR, "screenshots"), exist_ok=True)

    # ── lifecycle ──────────────────────────────────────────────────────────
    def launch(self):
        ensure_import_cache()
        env = os.environ.copy()
        headed = env.get("DW_HEADED", "0") == "1"
        cmd = [GODOT_BIN, "--path", PROJECT_DIR]
        if not headed:
            if sys.platform != "win32":
                display = env.get("DW_XVFB_DISPLAY", ":97")
                self.xvfb = start_xvfb(display)
                if self.xvfb:
                    env["DISPLAY"] = display
                    # No window manager on Xvfb: pin the window to the origin so a screen capture sees all of it.
                    cmd.extend(["--rendering-driver", "opengl3", "--position", "0,0"])
                else:
                    cmd.append("--headless")
            if self.args.movie:
                cmd.extend(["--write-movie", self.args.movie, "--fixed-fps", "30"])
        cmd.extend([
            "res://scenes/DebugLaunch.tscn", "--",
            "--scene", "ThroneRoom",
            f"--web-service-port={self.args.port}",
        ])
        RUNTIME["cmd"] = list(cmd)
        log("Launching: " + " ".join(cmd))
        self.boot_log = open(os.path.join(REPORTS_DIR, "godot.log"), "w", encoding="utf-8")
        self.godot = subprocess.Popen(cmd, env=env, stdout=self.boot_log, stderr=subprocess.STDOUT)
        self.port = find_and_wait_for_web_service(self.args.port, timeout=60.0)
        if self.port is None:
            raise SystemExit("Game web service never came up")
        if (self.args.record or self.args.stepped) and self.xvfb and shutil.which("ffmpeg"):
            if self.args.stepped:
                os.makedirs(os.path.join(REPORTS_DIR, "videos"), exist_ok=True)
                self.start_recording(env["DISPLAY"], os.path.join(REPORTS_DIR, "videos", "_current.mp4"))
            else:
                self.start_recording(env["DISPLAY"])
        for _ in range(100):
            st = get_web_service_state(port=self.port)
            if st.get("scene_shown", {}).get("name", "") not in ("", "DebugLaunch"):
                break
            time.sleep(0.1)
        log(f"Game online on port {self.port}")

    def start_recording(self, display, path=None):
        """Capture the Xvfb screen with ffmpeg (h264, small) instead of Godot's giant MJPEG writer."""
        self.display = display
        self.record_path = path or os.path.join(REPORTS_DIR, "playthrough.mp4")
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "x11grab", "-framerate", str(self.args.record_fps),
               "-video_size", f"{WIDTH}x{HEIGHT}", "-i", display,
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", self.record_path]
        self.ffmpeg = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log(f"Recording screen to {self.record_path} at {self.args.record_fps} fps")

    def stop_recording(self, timelapse=True):
        if not self.ffmpeg:
            return
        try:
            self.ffmpeg.stdin.write(b"q")
            self.ffmpeg.stdin.flush()
            self.ffmpeg.wait(timeout=60)
        except Exception:
            self.ffmpeg.kill()
        self.ffmpeg = None
        # A watchable cut: every milestone is still visible, at a time-lapse pace.
        speed = max(1, int(self.args.timelapse_speed))
        if timelapse and speed > 1 and os.path.exists(self.record_path):
            out = os.path.join(REPORTS_DIR, "playthrough-timelapse.mp4")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", self.record_path,
                            "-vf", f"setpts=PTS/{speed},fps=30", "-an",
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p", out])
            log(f"Time-lapse ({speed}x) written to {out}")

    def shutdown(self):
        self.stop_recording()
        for proc in (self.godot, self.xvfb):
            if proc and proc.poll() is None:
                try:
                    proc.send_signal(signal.SIGTERM)
                    proc.wait(timeout=5)
                except Exception:
                    proc.kill()
        if getattr(self, "boot_log", None):
            self.boot_log.close()

    # ── observation ────────────────────────────────────────────────────────
    def check_invariants(self, state):
        gs = state.get("game_state", {})
        scene = state.get("scene_shown", {}).get("name", "")
        pos = state.get("hero_position", {}) or {}
        hp = int(gs.get("hp", 0))
        if hp < 0:
            self.violation("hp_negative", f"hp={hp}")
        if scene == "WorldMap" and pos:
            x, y = int(pos.get("x", -1)), int(pos.get("y", -1))
            if 0 <= y < len(self.terrain) and 0 <= x < len(self.terrain[0]):
                tid = int(self.terrain[y][x])
                bridge = bool(gs.get("bridge_built", False)) and (x, y) == (66, 51)
                if tid in WORLD_BLOCKED_TERRAIN and not bridge:
                    self.violation("hero_on_blocked_terrain", f"world ({x},{y}) terrain {tid}")
        if int(gs.get("gold", 0)) < 0:
            self.violation("gold_negative", f"gold={gs.get('gold')}")

    def violation(self, kind, detail):
        key = kind + ":" + detail
        if any(v["key"] == key for v in self.violations):
            return
        log(f"VIOLATION {kind}: {detail}")
        self.violations.append({"key": key, "kind": kind, "detail": detail, "at": time.time()})

    def segment_path(self, idx, mid):
        return os.path.join(REPORTS_DIR, "videos", f"{idx:02d}-{mid}.mp4")

    def checkpoint_path(self, idx, mid):
        return os.path.join(REPORTS_DIR, "checkpoints", f"{idx:02d}-{mid}.json")

    def save_checkpoint(self, idx, mid):
        path = self.checkpoint_path(idx, mid)
        try:
            res = send_web_service_command("export_save_state", {"file_path": os.path.abspath(path)}, port=self.port)
            return path if res.get("success") and os.path.exists(path) else None
        except Exception:
            return None

    def record_milestones(self, ms):
        seen = set(self.done_seen)
        new = [mid for mid in ms.get("done", []) if mid not in seen]
        for mid in new:
            self.done_seen.append(mid)
            idx = self.ids.index(mid) + 1 if mid in self.ids else len(self.done_seen)
            shot = os.path.join(REPORTS_DIR, "screenshots", f"{idx:02d}-{mid}.png")
            fetch_screenshot(self.port, shot)
            entry = {"index": idx, "id": mid, "elapsed_sec": ms.get("elapsed_sec"),
                     "battles": ms.get("battles"), "deaths": ms.get("deaths")}
            if self.args.stepped:
                # One video per milestone (a burst of milestones finished in the same
                # poll shares the segment) plus a checkpoint to replay from.
                entry["video"] = os.path.relpath(self.segment_path(idx, mid), REPORTS_DIR)
                entry["checkpoint"] = os.path.relpath(self.checkpoint_path(idx, mid), REPORTS_DIR)
            self.report["milestones"].append(entry)
            log(f"MILESTONE {idx}/{ms.get('total')} {mid} (battles={ms.get('battles')} deaths={ms.get('deaths')})")
        if new and self.args.stepped:
            last_mid = new[-1]
            last_idx = self.ids.index(last_mid) + 1 if last_mid in self.ids else len(self.done_seen)
            if self.ffmpeg:
                self.stop_recording(timelapse=False)
                os.makedirs(os.path.join(REPORTS_DIR, "videos"), exist_ok=True)
                os.replace(self.record_path, self.segment_path(last_idx, last_mid))
                for mid in new[:-1]:
                    # Hard-link the shared segment under every milestone finished in the burst.
                    link = self.segment_path(self.ids.index(mid) + 1 if mid in self.ids else 0, mid)
                    if not os.path.exists(link):
                        os.link(self.segment_path(last_idx, last_mid), link)
            os.makedirs(os.path.join(REPORTS_DIR, "checkpoints"), exist_ok=True)
            ckpt = self.save_checkpoint(last_idx, last_mid)
            for mid in new[:-1]:
                if ckpt:
                    shutil.copyfile(ckpt, self.checkpoint_path(self.ids.index(mid) + 1 if mid in self.ids else 0, mid))
            if self.display and len(self.done_seen) < self.until:
                self.start_recording(self.display, os.path.join(REPORTS_DIR, "videos", "_current.mp4"))

    # ── main loop ──────────────────────────────────────────────────────────
    def run(self):
        self.launch()
        with open(os.path.join(PROJECT_DIR, "data", "v1", "milestones.json"), encoding="utf-8") as f:
            ids = [m["id"] for m in json.load(f)["milestones"]]
        self.ids = ids
        total = len(ids)
        self.until = self.args.until if self.args.until > 0 else total
        if self.args.only:
            self.args.from_milestone = self.args.only
            self.until = self.args.only
            self.base = self.args.only - 1
        if self.base > 0:
            prev = ids[self.base - 1]
            ckpt = self.checkpoint_path(self.base, prev)
            if not os.path.exists(ckpt):
                raise SystemExit(f"no checkpoint for milestone {self.base} ({ckpt}); run the earlier milestones first")
            res = send_web_service_command("load_save_state", {"file_path": os.path.abspath(ckpt)}, port=self.port)
            if not res.get("success"):
                raise SystemExit(f"load_save_state failed: {res}")
            self.done_seen = ids[:self.base]
            self.report["resumed_from"] = os.path.relpath(ckpt, REPORTS_DIR)
            time.sleep(2.0)
            log(f"Resumed from checkpoint {self.base} ({prev})")
        res = send_web_service_command("start_play_game", {
            "time_scale": self.args.time_scale,
            "from_milestone": ids[self.base] if self.base > 0 else 1,
        }, port=self.port)
        if not res.get("success"):
            raise SystemExit(f"start_play_game failed: {res}")
        until = self.until
        log(f"Play mode started: {total} milestones, running #{self.base + 1}..#{until}")
        progress_sig, progress_t = None, time.time()

        t0 = time.time()
        last_log = 0
        status = "running"
        error = ""
        ms = {}
        try:
            while time.time() - t0 < self.args.timeout:
                if self.godot.poll() is not None:
                    status, error = "crashed", f"godot exited {self.godot.returncode}"
                    break
                try:
                    state = get_web_service_state(port=self.port)
                    ms = send_web_service_command("get_milestones", {}, port=self.port).get("milestones", {})
                except Exception as e:  # transient while scenes swap
                    time.sleep(0.5)
                    continue
                self.check_invariants(state)
                self.record_milestones(ms)
                status = ms.get("status", "running")
                error = ms.get("error", "")
                if len(self.done_seen) >= until or status in ("done", "failed", "stopped"):
                    break
                gs = state.get("game_state", {})
                sig = (len(self.done_seen), ms.get("battles"), gs.get("level"), gs.get("gold"), gs.get("exp"))
                if sig != progress_sig:
                    progress_sig, progress_t = sig, time.time()
                elif time.time() - progress_t > self.args.stall_timeout:
                    obj = (ms.get("objective") or {}).get("label", "")
                    status, error = "stalled", (f"no progress for {int(self.args.stall_timeout)}s "
                                                f"(objective: {obj}, scene={state.get('scene_shown', {}).get('name')})")
                    fetch_screenshot(self.port, os.path.join(REPORTS_DIR, "screenshots", "stall.png"))
                    self.violations.append({"kind": "stall", "detail": error, "ai_log_tail": (ms.get("log") or [])[-20:]})
                    break
                if time.time() - last_log > 30:
                    last_log = time.time()
                    gs = state.get("game_state", {})
                    obj = (ms.get("objective") or {}).get("label", "")
                    log(f"L{gs.get('level')} hp{gs.get('hp')}/{gs.get('hp_max')} {gs.get('gold')}G "
                        f"scene={state.get('scene_shown', {}).get('name')} "
                        f"done={len(self.done_seen)}/{total} battles={ms.get('battles')} "
                        f"deaths={ms.get('deaths')} -> {obj}")
                time.sleep(self.args.poll)
            else:
                status, error = "timeout", f"exceeded {self.args.timeout}s"
        finally:
            try:
                send_web_service_command("stop_play_game", {}, port=self.port)
            except Exception:
                pass
            fetch_screenshot(self.port, os.path.join(REPORTS_DIR, "screenshots", "final.png"))
            self.shutdown()

        if self.args.stepped and self.ffmpeg:
            self.stop_recording(timelapse=False)
            if os.path.exists(self.record_path):
                tail = os.path.join(REPORTS_DIR, "videos", f"{int(ms.get('index', len(self.done_seen))) + 1:02d}-{status}.mp4")
                os.replace(self.record_path, tail)
        required_until = until
        ok = status not in ("crashed", "stalled") and len(self.done_seen) >= required_until and not any(
            v["kind"] == "hero_on_blocked_terrain" for v in self.violations)
        self.report.update({
            "status": status, "error": error, "ok": ok,
            "done": self.done_seen, "skipped": ms.get("skipped", []),
            "battles": ms.get("battles"), "deaths": ms.get("deaths"),
            "elapsed_sec": round(time.time() - t0, 1), "ai_log": ms.get("log", []),
        })
        with open(os.path.join(REPORTS_DIR, "playthrough.json"), "w", encoding="utf-8") as f:
            json.dump(self.report, f, indent=2)
        log(f"RESULT ok={ok} status={status} done={len(self.done_seen)}/{total} "
            f"battles={ms.get('battles')} deaths={ms.get('deaths')} violations={len(self.violations)} {error}")
        return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=int(os.environ.get("DW_WEB_SERVICE_PORT", "19260")))
    ap.add_argument("--time-scale", type=float, default=float(os.environ.get("DW_TIME_SCALE", "6")))
    ap.add_argument("--until", type=int, default=int(os.environ.get("DW_UNTIL_MILESTONE", "0")),
                    help="stop (successfully) after this many milestones; 0 = whole game")
    ap.add_argument("--timeout", type=float, default=float(os.environ.get("DW_PLAY_TIMEOUT", "10800")))
    ap.add_argument("--poll", type=float, default=0.5)
    ap.add_argument("--movie", default=os.environ.get("DW_MOVIE", ""), help="write a Godot movie (.avi) of the run")
    ap.add_argument("--record", action="store_true", default=os.environ.get("DW_RECORD", "0") == "1",
                    help="record the Xvfb screen with ffmpeg to reports/playthrough/playthrough.mp4 "
                         "(plus a sped-up playthrough-timelapse.mp4)")
    ap.add_argument("--record-fps", type=int, default=15)
    ap.add_argument("--stepped", action="store_true", default=os.environ.get("DW_STEPPED", "0") == "1",
                    help="one video per milestone under reports/playthrough/videos/ and a checkpoint per "
                         "milestone under reports/playthrough/checkpoints/ (implies --record)")
    ap.add_argument("--from", dest="from_milestone", type=int, default=1,
                    help="resume from this milestone number using the checkpoint saved after the previous one")
    ap.add_argument("--only", type=int, default=0, help="replay exactly this milestone from its checkpoint")
    ap.add_argument("--stall-timeout", type=float, default=float(os.environ.get("DW_STALL_TIMEOUT", "600")),
                    help="fail when milestones, battles, level, gold and exp all stop changing for this long")
    ap.add_argument("--timelapse-speed", type=int, default=12, help="speed factor for the time-lapse cut (1 = none)")
    args = ap.parse_args()
    return Playthrough(args).run()


if __name__ == "__main__":
    sys.exit(main())
