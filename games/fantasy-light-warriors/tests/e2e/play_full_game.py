#!/usr/bin/env python3
"""
Full-game autonomous playthrough driver for Fantasy: Light Warriors (WIP).
Modeled directly on games/quest-warrior-dragon/tests/e2e/play_full_game.py and compatible
with the RobOS Game Playthrough Electron viewer (packages/game-playthrough).

Supports two modes:
  1. Single-session run (default): boots Godot once and runs PlayGameBrain through all milestones.
  2. Stepped per-milestone run (--stepped): for each milestone in data/v1/milestones.json,
     boots Godot with --write-movie, loads the previous milestone's checkpoint JSON,
     runs PlayGameBrain until that milestone completes, saves:
       - tests/e2e/reports/playthrough/videos/NN-<id>.mp4
       - tests/e2e/reports/playthrough/checkpoints/NN-<id>.json
       - tests/e2e/reports/playthrough/screenshots/NN-<id>.png
     and updates tests/e2e/reports/playthrough/live.json + runs.json in real time.
"""
import argparse
import datetime
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
DEFAULT_REPORTS = os.path.join(SCRIPT_DIR, "reports", "playthrough")
MILESTONES_FILE = os.path.join(PROJECT_DIR, "data", "v1", "milestones.json")
GODOT_BIN = shutil.which("godot4") or os.path.expanduser("~/.local/bin/godot4") or "godot4"
FFMPEG_BIN = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
XVFB_BIN = shutil.which("Xvfb") or "/usr/bin/Xvfb"


def load_milestones_doc():
    with open(MILESTONES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def atomic_write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, path)


def http_get_json(url, timeout=2.0):
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post_cmd(port, command, args=None, timeout=4.0):
    url = f"http://127.0.0.1:{port}/api/v1/command"
    body = json.dumps({"command": command, "args": args or {}}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_for_server(base_port, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for p in range(base_port, base_port + 10):
            try:
                data = http_get_json(f"http://127.0.0.1:{p}/health", timeout=0.6)
                if data.get("status") == "ok":
                    return p
            except Exception:
                pass
        time.sleep(0.2)
    return None


def ensure_xvfb(display_str=":98"):
    lock_num = display_str.lstrip(":").split(".")[0]
    lock_file = f"/tmp/.X{lock_num}-lock"
    if os.path.exists(lock_file):
        # Check if Xvfb is already alive
        try:
            with open(lock_file, "r") as f:
                pid = int(f.read().strip())
            os.kill(pid, 0)
            return None
        except Exception:
            try:
                os.remove(lock_file)
            except Exception:
                pass
    if os.path.exists(XVFB_BIN):
        proc = subprocess.Popen(
            [XVFB_BIN, display_str, "-screen", "0", "1024x1136x24", "-ac"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(0.6)
        return proc
    return None


def transcode_avi_to_mp4(avi_path, mp4_path):
    if not os.path.exists(avi_path):
        return False
    os.makedirs(os.path.dirname(mp4_path), exist_ok=True)
    subprocess.run(
        [
            FFMPEG_BIN,
            "-y",
            "-i",
            avi_path,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "fast",
            "-crf",
            "20",
            "-movflags",
            "+faststart",
            mp4_path,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        os.remove(avi_path)
    except Exception:
        pass
    return os.path.exists(mp4_path) and os.path.getsize(mp4_path) > 0


def run_single_milestone_step(
    m,
    prev_ckpt_path,
    reports_dir,
    base_port,
    display_str,
    time_scale,
    record_video,
    run_started_ts,
    completed_list,
    total_milestones,
):
    idx = int(m["index"])
    mid = m["id"]
    stem = f"{idx:02d}-{mid}"
    videos_dir = os.path.join(reports_dir, "videos")
    ckpts_dir = os.path.join(reports_dir, "checkpoints")
    shots_dir = os.path.join(reports_dir, "screenshots")
    os.makedirs(videos_dir, exist_ok=True)
    os.makedirs(ckpts_dir, exist_ok=True)
    os.makedirs(shots_dir, exist_ok=True)

    avi_path = os.path.join(videos_dir, f"{stem}.avi")
    mp4_path = os.path.join(videos_dir, f"{stem}.mp4")
    ckpt_path = os.path.join(ckpts_dir, f"{stem}.json")
    shot_path = os.path.join(shots_dir, f"{stem}.png")

    for p in (avi_path, mp4_path):
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass

    env = os.environ.copy()
    env["DISPLAY"] = display_str
    env["DW_WEB_SERVICE_PORT"] = str(base_port)

    initial_scene = "TitleScreen" if not prev_ckpt_path else "Coneria"
    cmd = [
        GODOT_BIN,
        "--path",
        PROJECT_DIR,
        "--rendering-driver",
        "opengl3",
    ]
    if record_video:
        cmd.extend(["--write-movie", avi_path, "--fixed-fps", "30"])
    cmd.extend(
        [
            "res://scenes/DebugLaunch.tscn",
            "--",
            "--scene",
            initial_scene,
            f"--web-service-port={base_port}",
        ]
    )

    step_start = time.time()
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        port = wait_for_server(base_port, timeout=15.0)
        if not port:
            raise RuntimeError(f"Godot GameControlServer failed to start on port {base_port}")

        time.sleep(0.35)
        if prev_ckpt_path and os.path.exists(prev_ckpt_path):
            http_post_cmd(port, "load_save_state", {"path": prev_ckpt_path})
            time.sleep(0.45)

        http_post_cmd(
            port,
            "start_play_game",
            {
                "time_scale": time_scale,
                "until_milestone": idx,
                "start_at_milestone": idx,
            },
        )

        deadline = time.time() + 180.0
        last_state = {}
        shop_shot_captured = False
        while time.time() < deadline:
            try:
                last_state = http_get_json(f"http://127.0.0.1:{port}/api/v1/state", timeout=2.0)
            except Exception:
                time.sleep(0.2)
                continue

            if not shop_shot_captured and last_state.get("shop_window", {}).get("is_showing"):
                try:
                    http_post_cmd(port, "capture_screenshot", {"path": shot_path})
                    shop_shot_captured = True
                except Exception:
                    pass

            pg = last_state.get("play_game", {})
            live_doc = {
                "game": "Fantasy: Light Warriors (WIP)",
                "status": "running",
                "mode": "stepped",
                "started_at": run_started_ts,
                "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "elapsed_sec": round(time.time() - run_started_ts, 1),
                "time_scale": time_scale,
                "port": port,
                "current_milestone_index": idx,
                "total_milestones": total_milestones,
                "current_milestone": m,
                "current_action": pg.get("current_action", ""),
                "scene_shown": last_state.get("scene_shown", {}),
                "hero_position": last_state.get("hero_position", {}),
                "hero_stats": last_state.get("hero_stats", {}),
                "telemetry": last_state.get("telemetry", {}),
                "completed_milestones": completed_list,
            }
            atomic_write_json(os.path.join(reports_dir, "live.json"), live_doc)

            if pg.get("completed") or int(pg.get("current_milestone_index", idx)) > idx:
                break
            time.sleep(0.2)
        else:
            raise TimeoutError(f"Milestone {idx} ({mid}) timed out after 180s")

        # Hold final frame briefly so viewer & video clearly show milestone completion
        time.sleep(0.4)
        http_post_cmd(port, "export_save_state", {"path": ckpt_path})
        if not shop_shot_captured:
            http_post_cmd(port, "capture_screenshot", {"path": shot_path})
        time.sleep(0.2)
    finally:
        if proc.poll() is None:
            proc.send_signal(signal.SIGTERM)
            try:
                proc.wait(timeout=4.0)
            except Exception:
                proc.kill()

    if record_video:
        transcode_avi_to_mp4(avi_path, mp4_path)

    dur = round(time.time() - step_start, 2)
    entry = {
        "index": idx,
        "id": mid,
        "name": m["name"],
        "status": "passed",
        "duration_sec": dur,
        "video": f"videos/{stem}.mp4" if os.path.exists(mp4_path) else None,
        "checkpoint": f"checkpoints/{stem}.json" if os.path.exists(ckpt_path) else None,
        "screenshot": f"screenshots/{stem}.png" if os.path.exists(shot_path) else None,
        "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    print(
        f"[Playthrough] ✓ Milestone {idx:02d}/{total_milestones} {mid} ({dur:.1f}s) -> "
        f"video={bool(entry['video'])} ckpt={bool(entry['checkpoint'])} shot={bool(entry['screenshot'])}"
    )
    return entry, ckpt_path


def main():
    parser = argparse.ArgumentParser(description="Fantasy: Light Warriors (WIP) Autonomous Playthrough Runner")
    parser.add_argument("--reports", default=DEFAULT_REPORTS)
    parser.add_argument("--port", type=int, default=8090)
    parser.add_argument("--time-scale", type=float, default=2.0)
    parser.add_argument("--display", default=os.environ.get("DISPLAY", ":98"))
    parser.add_argument("--stepped", action="store_true", default=True)
    parser.add_argument("--video", action="store_true", default=True)
    parser.add_argument("--fresh", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--milestone", type=int, default=0)
    parser.add_argument("--start-at", type=int, default=1)
    parser.add_argument("--until", type=int, default=0)
    args = parser.parse_args()

    os.makedirs(args.reports, exist_ok=True)
    mdoc = load_milestones_doc()
    milestones = mdoc.get("milestones", [])
    total = len(milestones)

    xvfb_proc = None
    if not os.environ.get("DISPLAY") or args.display == ":98":
        xvfb_proc = ensure_xvfb(args.display)

    start_idx = max(1, args.start_at)
    end_idx = args.until if args.until > 0 else total
    if args.milestone > 0:
        start_idx = args.milestone
        end_idx = args.milestone

    if args.fresh and args.milestone == 0 and args.start_at == 1:
        for sub in ("videos", "checkpoints", "screenshots"):
            sdir = os.path.join(args.reports, sub)
            if os.path.isdir(sdir):
                for fn in os.listdir(sdir):
                    try:
                        os.remove(os.path.join(sdir, fn))
                    except Exception:
                        pass

    completed_list = []
    if args.resume:
        for m in milestones:
            idx = int(m["index"])
            stem = f"{idx:02d}-{m['id']}"
            cp = os.path.join(args.reports, "checkpoints", f"{stem}.json")
            if os.path.exists(cp):
                completed_list.append(
                    {
                        "index": idx,
                        "id": m["id"],
                        "name": m["name"],
                        "status": "passed",
                        "video": f"videos/{stem}.mp4",
                        "checkpoint": f"checkpoints/{stem}.json",
                        "screenshot": f"screenshots/{stem}.png",
                    }
                )
                start_idx = max(start_idx, idx + 1)

    run_started_ts = time.time()
    run_id = datetime.datetime.now(datetime.timezone.utc).strftime("run-%Y%m%d-%H%M%S")

    try:
        for m in milestones:
            idx = int(m["index"])
            if idx < start_idx or idx > end_idx:
                continue
            prev_ckpt = None
            if idx > 1:
                prev_m = milestones[idx - 2]
                prev_stem = f"{int(prev_m['index']):02d}-{prev_m['id']}"
                cand = os.path.join(args.reports, "checkpoints", f"{prev_stem}.json")
                if os.path.exists(cand):
                    prev_ckpt = cand
            entry, _ = run_single_milestone_step(
                m=m,
                prev_ckpt_path=prev_ckpt,
                reports_dir=args.reports,
                base_port=args.port,
                display_str=args.display,
                time_scale=args.time_scale,
                record_video=args.video,
                run_started_ts=run_started_ts,
                completed_list=completed_list,
                total_milestones=total,
            )
            completed_list.append(entry)

        final_live_path = os.path.join(args.reports, "live.json")
        live_data = {}
        if os.path.exists(final_live_path):
            with open(final_live_path, "r", encoding="utf-8") as f:
                live_data = json.load(f)
        live_data["status"] = "completed"
        live_data["completed_milestones"] = completed_list
        live_data["elapsed_sec"] = round(time.time() - run_started_ts, 1)
        atomic_write_json(final_live_path, live_data)

        runs_path = os.path.join(args.reports, "runs.json")
        runs_doc = {"runs": []}
        if os.path.exists(runs_path):
            try:
                with open(runs_path, "r", encoding="utf-8") as f:
                    runs_doc = json.load(f)
            except Exception:
                runs_doc = {"runs": []}
        runs_doc.setdefault("runs", []).insert(
            0,
            {
                "id": run_id,
                "game": "Fantasy: Light Warriors (WIP)",
                "status": "completed",
                "started_at": datetime.datetime.fromtimestamp(
                    run_started_ts, tz=datetime.timezone.utc
                ).isoformat(),
                "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "duration_sec": round(time.time() - run_started_ts, 1),
                "milestones_completed": len(completed_list),
                "total_milestones": total,
                "milestones": completed_list,
            },
        )
        atomic_write_json(runs_path, runs_doc)
        print(
            f"[Playthrough] Completed {len(completed_list)}/{total} milestones in {time.time() - run_started_ts:.1f}s"
        )
    finally:
        if xvfb_proc is not None:
            try:
                xvfb_proc.terminate()
            except Exception:
                pass


if __name__ == "__main__":
    main()
