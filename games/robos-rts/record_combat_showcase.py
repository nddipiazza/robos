#!/usr/bin/env python3
"""Record live 60 FPS Starfall Command combat fixtures with soundtrack and gameplay audio."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import html
import json
import os
from pathlib import Path
import random
import re
import subprocess
import tempfile


PROJECT = Path(__file__).resolve().parent
SCENE = "res://scripts/tools/RTSCombatShowcase.gd"
FPS = 60
FRAMES_PER_CLIP = 288
GROUND_FOES = ("skitterling", "breacher", "sunblade")
AIR_FOES = ("needlewing", "kestrel_interceptor", "crownspire")


def run(command: list[str], *, port: int | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    if port is not None:
        env.update(RTS_MODE="backend", RTS_WEB_SERVICE_PORT=str(port))
    options = {}
    if os.name == "nt":
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = subprocess.SW_HIDE
        options["startupinfo"] = startup
        options["creationflags"] = subprocess.CREATE_NO_WINDOW
    return subprocess.run(command, text=True, encoding="utf-8", errors="replace",
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
                          timeout=600, **options)


def plan(roster: dict, args: argparse.Namespace) -> list[dict]:
    if args.sporeburst_demo:
        return [
            {"unit": "rifleman", "foe": "sporeburst", "variant": variant, "count": 8,
             "foe_count": 7, "formation": formation}
            for variant, formation in enumerate(("clumped", "spread"), start=1)
        ]
    cases = []
    for unit_id in dict.fromkeys(args.unit or roster):
        if unit_id not in roster:
            raise ValueError(f"Unknown mobile unit: {unit_id}")
        unit = roster[unit_id]
        weapon = unit["weapon"]
        for variant, count, foes in ((1, 1, 1), (2, 3, 4), (3, 6, 7)):
            if args.foe and variant != 1:
                continue
            target_air = weapon and weapon.get("targets_air", False)
            air_only = target_air and not weapon.get("targets_ground", True)
            foe_pool = AIR_FOES if air_only or (target_air and variant == 3) else GROUND_FOES
            foe = args.foe or foe_pool[variant - 1]
            if not args.foe and roster[foe]["faction"] == unit["faction"]:
                foe = next(other for other in foe_pool if roster[other]["faction"] != unit["faction"])
            if unit_id == "veilseeker" and not args.foe:
                foe = "skitterling"
            if foe not in roster:
                raise ValueError(f"Unknown mobile foe: {foe}")
            if args.foe and weapon:
                target_flag = "targets_air" if roster[foe]["flight"] > 0 else "targets_ground"
                if not weapon.get(target_flag, target_flag == "targets_ground"):
                    raise ValueError(f"{unit['name']} cannot attack {roster[foe]['name']}")
            cases.append({"unit": unit_id, "variant": variant, "count": args.count or count,
                          "foe": foe, "foe_count": args.foe_count or foes})
    return cases


def capture(args: argparse.Namespace, batch: list[dict], port: int) -> tuple[list[dict], list[str]]:
    clips, errors = [], []
    with tempfile.TemporaryDirectory(prefix="starfall-combat-") as temp:
        work = Path(temp)
        cases = work / "matchups.json"
        cases.write_text(json.dumps(batch), encoding="utf-8")
        movie = work / "arena.avi"
        command = [args.godot, "--path", str(PROJECT), "--rendering-method", "gl_compatibility",
                   "--position", "-1600,-900", "--resolution", args.resolution, "--fixed-fps", str(FPS),
                   "--write-movie", str(movie), "--quit-after", str(len(batch) * FRAMES_PER_CLIP + 30),
                   "--script", SCENE, "--", str(cases)]
        recorded = run(command, port=port)
        outcomes = [json.loads(line.removeprefix("SHOWCASE ")) for line in recorded.stdout.splitlines()
                    if line.startswith("SHOWCASE ")]
        if len(outcomes) != len(batch) or "SCRIPT ERROR:" in recorded.stdout:
            return [], [recorded.stdout]
        for encounter, result in zip(batch, outcomes, strict=True):
            stem = f'{encounter["unit"]}-{encounter["variant"]}' if not args.foe else (
                f'{encounter["unit"]}-{encounter["count"]}-vs-{encounter["foe"]}-{encounter["foe_count"]}'
            )
            if args.sporeburst_demo:
                stem = f'riflemen-vs-sporebursts-{encounter["formation"]}'
            if not result["ok"]:
                errors.append(json.dumps(result))
                continue
            filename = f"{stem}.mp4"
            ffmpeg = run([args.ffmpeg, "-nostdin", "-v", "error", "-y", "-ss",
                          f'{(result["start_frame"] + 4) / FPS:.6f}', "-i", str(movie), "-t",
                          f'{(result["frames"] - 8) / FPS:.6f}', "-map", "0:v:0", "-map", "0:a:0",
                          "-c:v", "libx264", "-threads", "2",
                          "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac",
                          "-b:a", "160k", "-movflags", "+faststart", str(args.output / filename)])
            if ffmpeg.returncode:
                errors.append(ffmpeg.stdout)
                continue
            clips.append({**encounter, **result, "file": filename})
    return clips, errors


def write_library(output: Path, roster: dict, clips: list[dict]) -> None:
    manifest = output / "clips.json"
    previous = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else []
    by_file = {clip["file"]: clip for clip in previous + clips if (output / clip["file"]).is_file()}
    ordered = sorted(by_file.values(), key=lambda clip: (roster[clip["unit"]]["faction"], clip["unit"], clip["variant"]))
    manifest.write_text(json.dumps(ordered, indent=2), encoding="utf-8")
    grouped: dict[str, list[str]] = {}
    for clip in ordered:
        role = f' · {clip["role"]}' if clip["role"] else ""
        option = f'<option value="{html.escape(clip["file"])}">{html.escape(clip["title"] + role)}</option>'
        grouped.setdefault(clip["unit"], []).append(option)
    groups = "\n".join(
        f'<optgroup label="{html.escape(roster[unit]["name"])}">{"".join(options)}</optgroup>'
        for unit, options in grouped.items()
    )
    (output / "index.html").write_text(f"""<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Starfall Command Combat Showcase</title>
<style>
body{{margin:0;background:#10151b;color:#f2f5f8;font:16px system-ui}}
main{{max-width:1100px;margin:3rem auto;padding:0 1.5rem}}
select{{display:block;margin:.55rem 0 1.3rem;padding:.55rem;background:#242f3b;color:inherit;max-width:100%;font:inherit}}
video{{width:100%;aspect-ratio:16/9;background:#05090d;border:1px solid #354453}}
</style>
<main><h1>Starfall Command Combat Showcase</h1>
<label for="encounter">Choose an encounter</label>
<select id="encounter">{groups}</select>
<video controls playsinline preload="metadata" aria-label="Gameplay recording"></video>
</main><script>
const picker = document.querySelector("select");
const video = document.querySelector("video");
picker.addEventListener("change", () => {{video.src = picker.value; video.play();}});
if (picker.value) video.src = picker.value;
</script></html>
""", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN", "godot"))
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--output", type=Path, required=True, help="Folder for the MP4s and local gallery")
    parser.add_argument("--unit", action="append", help="Only record this unit ID. Can be repeated.")
    parser.add_argument("--foe", help="Record one custom encounter against this unit ID")
    parser.add_argument("--count", type=int, choices=range(1, 13))
    parser.add_argument("--foe-count", type=int, choices=range(1, 13))
    parser.add_argument("--sporeburst-demo", action="store_true", help="Compare a clumped rifle squad with a spread line")
    parser.add_argument("--jobs", type=int, choices=range(1, 5), default=2)
    parser.add_argument("--resolution", default="1280x720")
    args = parser.parse_args()
    if not re.fullmatch(r"[1-9][0-9]{2,3}x[1-9][0-9]{2,3}", args.resolution):
        parser.error("--resolution must have the form 1280x720")
    if args.foe and not args.unit:
        parser.error("--foe requires --unit")
    if args.sporeburst_demo and (args.unit or args.foe or args.count or args.foe_count):
        parser.error("--sporeburst-demo supplies its own matchup")
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    port = random.randrange(39000, 59000)
    listing = run([args.godot, "--headless", "--path", str(PROJECT), "--quit-after", "20",
                   "--script", SCENE, "--", "--roster"], port=port)
    if listing.returncode or "SCRIPT ERROR:" in listing.stdout:
        raise RuntimeError(listing.stdout)
    roster = json.loads(next(line for line in reversed(listing.stdout.splitlines()) if line.startswith("{")))
    try:
        cases = plan(roster, args)
    except ValueError as error:
        parser.error(str(error))
    batches = [cases[i:i + 6] for i in range(0, len(cases), 6)]
    failures = []
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        captures = [executor.submit(capture, args, batch, port + i + 1) for i, batch in enumerate(batches)]
        for future in captures:
            clips, errors = future.result()
            write_library(args.output, roster, clips)
            failures.extend(errors)
            print(f"Recorded {len(clips)} of {len(clips) + len(errors)} encounters in batch", flush=True)
    for error in failures:
        print(error, flush=True)
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
