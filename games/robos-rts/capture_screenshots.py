#!/usr/bin/env python3
"""
capture_screenshots.py — regenerates the RobOS RTS documentation screenshots from the running game.

Launches the game inside Xvfb (1920x1080), then drives it only through its public control surface
(scenario loading, the /input endpoint that feeds the real mouse/keyboard handlers, /ui, /step) and
saves JPEGs. Nothing is mocked: every frame is the game rendering its own sim state.

    ./capture_screenshots.py                       # all shots into docs/assets/images/robos-rts
    ./capture_screenshots.py --only 05,06          # shots whose name starts with these prefixes
    ./capture_screenshots.py --out /tmp/shots --png

Needs: Godot 4.3 (GODOT_BIN or on PATH), xvfb-run, and Pillow for JPEG output (PNG is kept without it).
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

PROJECT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_DIR))

from robos_rts_bot_sdk import RTSClient  # noqa: E402

DEFAULT_OUT = PROJECT_DIR.parent.parent / "docs" / "assets" / "images" / "robos-rts"
PORT = 18099

# Screen positions of command card slots (see RTSMain: CARD_ORIGIN, CARD_BTN, CARD_GAP)
def card_slot(index: int) -> Tuple[float, float]:
    col, row = index % 5, index // 5
    return 1560.0 + col * 70.0 + 32.0, 862.0 + row * 70.0 + 32.0


class Capture:
    def __init__(self, out_dir: Path, as_png: bool) -> None:
        self.out_dir = out_dir
        self.as_png = as_png
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.tmp = Path(tempfile.mkdtemp(prefix="robos_rts_shots_"))
        self.proc: Optional[subprocess.Popen] = None
        self.c = RTSClient("127.0.0.1", PORT)
        self.saved: List[str] = []

    # --- lifecycle -----------------------------------------------------------------------------
    def start(self) -> None:
        env = os.environ.copy()
        env["RTS_WEB_SERVICE_PORT"] = str(PORT)
        self.proc = subprocess.Popen(
            ["xvfb-run", "--auto-servernum", "-s", "-screen 0 1920x1080x24", str(PROJECT_DIR / "play.sh"), "--rendering-driver", "opengl3"],
            cwd=str(PROJECT_DIR), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
        )
        deadline = time.time() + 40.0
        while time.time() < deadline:
            try:
                if self.c.health().get("ok"):
                    time.sleep(4.0)  # let terrain noise textures and portraits finish rendering
                    return
            except Exception:
                time.sleep(0.4)
        raise RuntimeError("RobOS RTS did not start under Xvfb")

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            os.killpg(os.getpgid(self.proc.pid), signal.SIGTERM)
            try:
                self.proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                os.killpg(os.getpgid(self.proc.pid), signal.SIGKILL)

    # --- helpers -------------------------------------------------------------------------------
    def snap(self, name: str, settle: float = 1.5) -> None:
        time.sleep(settle)
        png = self.tmp / f"{name}.png"
        self.c.screenshot(str(png))
        if self.as_png:
            dest = self.out_dir / f"{name}.png"
            dest.write_bytes(png.read_bytes())
        else:
            try:
                from PIL import Image
                Image.open(png).convert("RGB").save(self.out_dir / f"{name}.jpg", quality=88, optimize=True)
            except ImportError:
                (self.out_dir / f"{name}.png").write_bytes(png.read_bytes())
        self.saved.append(name)
        print(f"  saved {name}")

    def load(self, slug: str, focus: Optional[Tuple[float, float, float]] = None, player: int = 1, banner: float = 0.0, pause: bool = True) -> None:
        self.c.load_scenario_slug(slug)
        self.c.ui(local_player=player, banner=banner, hover=None, help=False, pending_ability="", clear_messages=True)
        self.c.pause(pause)
        if focus:
            self.c.focus_camera(*focus)

    def obs(self) -> Dict[str, Any]:
        return self.c.get_observation()

    def tags(self, unit_type: str, owner: int) -> List[int]:
        return [u["tag"] for u in self.obs()["units"] if u["unit_type"] == unit_type and u["owner"] == owner]

    def select(self, *tags: int) -> None:
        self.c.select(tags=list(tags))

    def step(self, n: int) -> Dict[str, Any]:
        return self.c.step(n)

    def hover_world(self, x: float, y: float) -> Tuple[float, float]:
        sx, sy = self.c.project((x, y))[0]
        self.c.mouse_move(sx, sy)
        self.c.ui(hover=[sx, sy])
        return sx, sy

    def step_until(self, predicate: Callable[[Dict[str, Any]], bool], max_ticks: int, chunk: int) -> bool:
        spent = 0
        while spent < max_ticks:
            o = self.step(chunk)
            spent += chunk
            if predicate(o):
                return True
        return False

    def fresh_fire(self, o: Dict[str, Any], splash: Optional[bool] = None) -> bool:
        for e in o.get("recent_events", []):
            if e.get("type") == "weapon_fire" and o["tick"] - e["tick"] <= 6:
                if splash is None or bool(e.get("splash")) == splash:
                    return True
        return False


# ---------------------------------------------------------------------------------------------
# Shots
# ---------------------------------------------------------------------------------------------
def s01_start(cap: Capture) -> None:
    cap.load("default", (31, 47, 44), banner=4.0)
    cap.snap("01-starfall-canyon-start", settle=0.9)


def s02_economy(cap: Capture) -> None:
    cap.load("default", (16, 46, 30))
    cap.step(330)
    cap.select(cap.tags("pioneer", 1)[1])
    cap.snap("02-gathering-crystal")


def s03_overview(cap: Capture) -> None:
    cap.load("default", (64, 48, 84))
    cap.step(120)
    cap.snap("03-canyon-overview")


def s04_ramp(cap: Capture) -> None:
    cap.load("default", (60, 48, 40))
    squad = cap.tags("rifleman", 1) + cap.tags("breacher", 1) + cap.tags("howitzer", 1)
    cap.c.command("move", tags=squad, x=76.0, y=48.0)
    cap.step(150)
    cap.select(*squad)
    cap.snap("04-ramp-descent")


def s05_single_unit(cap: Capture) -> None:
    cap.load("default", (45, 46, 30))
    cap.select(cap.tags("rifleman", 1)[0])
    cap.snap("05-unit-panel-rifleman")


def s06_squad_selection(cap: Capture) -> None:
    cap.load("default", (45, 46, 32))
    x0, y0 = cap.c.project((39.5, 40.0))[0]
    x1, y1 = cap.c.project((52.0, 54.0))[0]
    cap.c.drag_select(x0, y0, x1, y1)
    cap.snap("06-squad-selection")


def s07_production(cap: Capture) -> None:
    cap.load("default", (36, 47, 30))
    cap.select(cap.tags("muster_hall", 1)[0])
    for k in ("A", "A", "D", "A"):
        cap.c.key(k)
    cap.step(70)
    cap.snap("07-production-queue")


def s08_tooltip(cap: Capture) -> None:
    cap.load("default", (36, 47, 30))
    cap.select(cap.tags("muster_hall", 1)[0])
    sx, sy = card_slot(1)
    cap.c.ui(hover=[sx, sy])
    cap.snap("08-command-card-tooltip")


def s09_placement(cap: Capture) -> None:
    cap.load("default", (30, 50, 34))
    cap.select(cap.tags("pioneer", 1)[0])
    cap.c.key("B")
    cap.hover_world(30.0, 57.0)
    cap.snap("09-build-placement")


def s10_placement_blocked(cap: Capture) -> None:
    cap.load("default", (22, 44, 34))
    cap.select(cap.tags("pioneer", 1)[0])
    cap.c.key("B")
    sx, sy = cap.hover_world(10.0, 44.0)
    cap.c.mouse(sx, sy, 1, True)
    cap.c.mouse(sx, sy, 1, False)
    cap.snap("10-build-placement-blocked")


def s11_construction(cap: Capture) -> None:
    cap.load("default", (26, 40, 34))
    pio = cap.tags("pioneer", 1)[0]
    cap.select(pio)
    cap.c.key("B")
    sx, sy = cap.hover_world(28.0, 34.0)
    cap.c.mouse(sx, sy, 1, True)
    cap.c.mouse(sx, sy, 1, False)
    cap.step(250)
    building = [u for u in cap.obs()["units"] if u["unit_type"] == "silo" and u["build_progress"] < 1.0]
    if building:
        cap.select(building[0]["tag"])
    cap.snap("11-construction-in-progress")


def s12_groups_idle(cap: Capture) -> None:
    cap.load("default", (44, 46, 34))
    pioneers = cap.tags("pioneer", 1)
    cap.c.command("stop", tags=pioneers[:2])
    cap.select(*cap.tags("rifleman", 1))
    cap.c.key("1", ctrl=True)
    cap.select(*(cap.tags("breacher", 1) + cap.tags("howitzer", 1)))
    cap.c.key("2", ctrl=True)
    cap.step(40)
    cap.select(*cap.tags("rifleman", 1))
    cap.c.ui(clear_messages=True)
    cap.snap("12-control-groups-idle-workers")


def s13_help(cap: Capture) -> None:
    cap.load("default", (32, 47, 40))
    cap.select(cap.tags("pioneer", 1)[0])
    cap.c.key("F1")
    cap.snap("13-controls-overlay")


def s14_supply_blocked(cap: Capture) -> None:
    cap.c.load_scenario({
        "name": "Supply Cap", "seed": 5, "map": {"width": 96, "height": 64},
        "players": {"1": {"crystal": 900, "aether": 100}},
        "resources": [{"type": "crystal_field", "x": 10.0, "y": 24.0 + i * 5.5, "amount": 1500} for i in range(4)],
        "units": [
            {"id": "hub", "type": "colony_hub", "owner": 1, "x": 24.0, "y": 32.0},
            {"id": "hall", "type": "muster_hall", "owner": 1, "x": 42.0, "y": 32.0},
            {"type": "pioneer", "owner": 1, "count": 6, "x": 14.0, "y": 24.0, "spread": 2.0, "auto_harvest": True},
            {"type": "rifleman", "owner": 1, "count": 9, "x": 50.0, "y": 24.0, "spread": 2.2},
        ],
        "directives": [], "decor": True,
    })
    cap.c.ui(local_player=1, banner=0, clear_messages=True, help=False, hover=None)
    cap.c.pause(True)
    cap.c.focus_camera(34, 34, 34)
    cap.step(20)
    cap.select(cap.tags("muster_hall", 1)[0])
    cap.c.key("A")
    cap.snap("14-supply-blocked")


def _roster(cap: Capture, slug: str, focus: Tuple[float, float, float], player: int, hero: str, hero_owner: int, name: str) -> None:
    cap.load(slug, focus, player=player)
    cap.c.ui(show_names=True)
    cap.step(2)
    cap.select(cap.tags(hero, hero_owner)[0])
    cap.snap(name)
    cap.c.ui(show_names=False)


def s15_roster_humans(cap: Capture) -> None:
    _roster(cap, "unit-roster", (39, 16, 27), 1, "howitzer", 1, "15-roster-meridian-guard")


def s16_roster_monsters(cap: Capture) -> None:
    _roster(cap, "unit-roster", (35, 33, 24), 2, "blight_hurler", 2, "16-roster-gnarl-brood")


def s17_roster_aliens(cap: Capture) -> None:
    _roster(cap, "unit-roster", (35, 51, 24), 3, "skirmisher", 3, "17-roster-aurelian-concord")


def s18_structures_meridian(cap: Capture) -> None:
    _roster(cap, "structure-roster", (33, 19, 36), 1, "colony_hub", 1, "18-structures-meridian-guard")


def s19_structures_utility(cap: Capture) -> None:
    _roster(cap, "structure-roster", (25, 38, 22), 1, "silo_retracted", 1, "19-structures-silo-and-aether-tap")


def s19b_structures_other(cap: Capture) -> None:
    _roster(cap, "structure-roster", (39, 58, 40), 3, "heartstone", 3, "19b-structures-brood-and-concord")


def s20_brood_base(cap: Capture) -> None:
    cap.load("default", (102, 64, 32), player=2)
    cap.step(120)
    cap.select(cap.tags("brood_nest", 2)[0])
    cap.snap("20-brood-base")


def s21_concord_base(cap: Capture) -> None:
    cap.load("default", (98, 25, 32), player=3)
    cap.step(120)
    cap.select(cap.tags("heartstone", 3)[0])
    cap.snap("21-concord-base")


def s22_aether_tap(cap: Capture) -> None:
    cap.load("default", (17, 63, 26))
    cap.step(120)
    cap.select(cap.tags("aether_tap", 1)[0])
    cap.snap("22-aether-tap")


def s23_howitzer_defense(cap: Capture) -> None:
    cap.load("howitzer-canyon-defense", (54, 45, 38))
    cap.select(*cap.tags("howitzer_emplaced", 1) or cap.tags("howitzer", 1))
    cap.step(60)
    cap.select(*(cap.tags("howitzer_emplaced", 1) or cap.tags("howitzer", 1)))
    cap.snap("23-howitzer-line-emplaced")
    cap.step_until(lambda o: cap.fresh_fire(o, splash=True), 600, 3)
    cap.select(*(cap.tags("howitzer_emplaced", 1) or cap.tags("howitzer", 1)))
    cap.snap("24-howitzer-splash-volley", settle=0.6)
    cap.step(200)
    cap.select(*(cap.tags("howitzer_emplaced", 1) or cap.tags("howitzer", 1)))
    cap.snap("25-howitzer-aftermath")


def s26_kiting(cap: Capture) -> None:
    cap.load("stutter-step-micro", (46, 40, 36))
    cap.step(40)
    cap.select(*cap.tags("rifleman", 1))
    cap.snap("26-kiting-approach")
    cap.step_until(lambda o: cap.fresh_fire(o), 300, 3)
    cap.select(*cap.tags("rifleman", 1))
    cap.snap("27-kiting-volley", settle=0.6)


def s28_phase_step(cap: Capture) -> None:
    cap.load("phase-step-spire-walker-vs-monsters", (54, 40, 36), player=3)
    cap.step(30)
    cap.select(*cap.tags("skirmisher", 3))
    cap.snap("28-concord-advance")
    start = cap.obs()["players"]["3"]["phase_steps_executed"]
    ok = cap.step_until(lambda o: o["players"]["3"]["phase_steps_executed"] > start, 700, 4)
    if ok:
        o = cap.obs()
        hit = [u for u in o["units"] if u["unit_type"] == "skirmisher" and u["owner"] == 3 and u["phase_cooldown"] > 0.0]
        if hit:
            cap.c.focus_camera(hit[0]["pos"]["x"] - 2.0, hit[0]["pos"]["y"], 28)
        cap.select(*cap.tags("skirmisher", 3))
        cap.snap("29-phase-step-burst", settle=0.5)


def s30_cliff_walk(cap: Capture) -> None:
    cap.load("phase-step-spire-walker-vs-monsters", (53, 40, 30), player=3)
    walkers = cap.tags("spire_walker", 3)
    cap.c.command("move", tags=walkers, x=76.0, y=40.0)

    def on_wall(o: Dict[str, Any]) -> bool:
        w = [u for u in o["units"] if u["unit_type"] == "spire_walker"]
        return bool(w) and 52.6 <= w[0]["pos"]["x"] <= 54.0

    cap.step_until(on_wall, 400, 6)
    cap.select(*walkers)
    cap.snap("30-spire-walker-cliff-walk")


def s31_gate_closed(cap: Capture) -> None:
    cap.load("crowd-push-priority", (50, 40, 32))
    cap.step(4)
    cap.select(*cap.tags("silo", 1))
    cap.snap("31-silo-gate-extended")


def s32_gate_open(cap: Capture) -> None:
    cap.load("crowd-push-priority", (54, 40, 32))
    cap.c.command("retract_silo", unit_type="silo", owner=1)
    howitzers = cap.tags("howitzer", 1)
    cap.c.command("move", tags=howitzers, x=72.0, y=40.0)
    cap.step(150)
    cap.select(*cap.tags("silo_retracted", 1))
    cap.snap("32-silo-gate-retracted")


def s33_wide_fight(cap: Capture) -> None:
    cap.load("default", (62, 48, 56))
    cap.c.set_directive(1, "macro_build", True)
    cap.c.set_directive(2, "swarm_rush", True, 28.0, 48.0)
    cap.c.set_directive(3, "phase_skirmisher_micro", True, 40.0, 48.0)
    for _ in range(9):
        cap.step(100)
    cap.snap("33-three-way-battle")


SHOTS: Sequence[Tuple[str, Callable[[Capture], None]]] = [
    ("01", s01_start), ("02", s02_economy), ("03", s03_overview), ("04", s04_ramp),
    ("05", s05_single_unit), ("06", s06_squad_selection), ("07", s07_production), ("08", s08_tooltip),
    ("09", s09_placement), ("10", s10_placement_blocked), ("11", s11_construction), ("12", s12_groups_idle),
    ("13", s13_help), ("14", s14_supply_blocked),
    ("15", s15_roster_humans), ("16", s16_roster_monsters), ("17", s17_roster_aliens),
    ("18", s18_structures_meridian), ("19", s19_structures_utility), ("19b", s19b_structures_other),
    ("20", s20_brood_base), ("21", s21_concord_base), ("22", s22_aether_tap),
    ("23", s23_howitzer_defense), ("26", s26_kiting), ("28", s28_phase_step), ("30", s30_cliff_walk),
    ("31", s31_gate_closed), ("32", s32_gate_open), ("33", s33_wide_fight),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    ap.add_argument("--only", default="", help="comma separated shot-number prefixes, e.g. 05,06,23")
    ap.add_argument("--png", action="store_true", help="keep lossless PNGs instead of JPEG")
    args = ap.parse_args()
    wanted = [w.strip() for w in args.only.split(",") if w.strip()]

    cap = Capture(args.out, args.png)
    print("Starting RobOS RTS under Xvfb...")
    cap.start()
    failures = 0
    try:
        for key, fn in SHOTS:
            if wanted and not any(key.startswith(w) for w in wanted):
                continue
            print(f"[{key}] {fn.__name__}")
            try:
                fn(cap)
            except Exception as exc:  # keep going so one bad scene does not lose the rest
                failures += 1
                print(f"  FAILED: {exc!r}")
    finally:
        cap.stop()
    print(f"Saved {len(cap.saved)} screenshots to {args.out}" + (f" ({failures} failed)" if failures else ""))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
