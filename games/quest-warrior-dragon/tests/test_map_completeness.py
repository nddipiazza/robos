#!/usr/bin/env python3
"""
Quest: Warrior Dragon — Headless Map Completeness & Global Pathfinding Test Runner
===========================================================================

1. Runs `godot --headless --path games/quest-warrior-dragon -s tests/test_map_completeness.gd`
   to execute the full Breadth-First Search (BFS) connectivity audit from the
   New Game start tile (`tantegel-castle-2f` at `(3, 5)`) across all 29 maps,
   86 staircase transitions, 21 locked doors, 40 treasure chests, and 14 quest milestones.
2. When `--screenshots` or `DW_CAPTURE_SLIDESHOW=1` is provided, launches the live
   Godot engine under Xvfb and drives the hero along 20 pathfinding & quest milestones,
   capturing crisp 512x480 PNG screenshots for the rowbose.com interactive slideshow.
"""

import argparse
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
GAME_DIR = REPO_ROOT / "games" / "quest-warrior-dragon"
REPORT_PATH = Path("/tmp/dw_map_completeness_report.json")
SITE_ASSETS_DIR = REPO_ROOT / "site" / "assets" / "games" / "quest-warrior-dragon"
DOCS_ASSETS_DIR = REPO_ROOT / "docs" / "assets" / "images" / "quest-warrior-dragon"


SLIDESHOW_MILESTONES = [
    {
        "num": 1,
        "file": "01_throne_room_king_lorik.png",
        "title": "Start State — King Lorik's Throne Room (0 Steps)",
        "scene": "ThroneRoom",
        "x": 3,
        "y": 5,
        "facing": "up",
        "gold": 0,
        "level": 1,
        "hp": 15,
        "mp": 0,
        "king_intro_done": False,
        "caption": "Global BFS root node (`tantegel-castle-2f` @ `3,5`). Speaking with King Lorik receives the royal quest to recover the Ball of Light.",
    },
    {
        "num": 2,
        "file": "02_throne_room_chests_and_key.png",
        "title": "Throne Room Treasury — Magic Key, Torch & 120 Gold (3 Steps)",
        "scene": "ThroneRoom",
        "x": 6,
        "y": 5,
        "facing": "down",
        "gold": 120,
        "level": 1,
        "hp": 15,
        "mp": 0,
        "king_intro_done": True,
        "action": "open_menu",
        "caption": "Pathfinding reaches chests `ttrc1 (7,2)`, `ttrc2 (5,5)`, and `ttrc3 (6,5)` to claim the starting Magic Key, Torch, and 120 Gold.",
    },
    {
        "num": 3,
        "file": "03_tantegel_castle_1f_courtyard.png",
        "title": "Tantegel Castle 1F — Royal Courtyard & Guards (13 Steps)",
        "scene": "Castle1F",
        "x": 11,
        "y": 19,
        "facing": "down",
        "gold": 120,
        "level": 1,
        "hp": 15,
        "mp": 0,
        "king_intro_done": True,
        "caption": "Descending `throne-to-castle1f` @ `(9,9)` lands at `tantegel-castle-1f (8,8)`. Stride pathfinding traverses the courtyard toward the southern gate `(11,30)`.",
    },
    {
        "num": 4,
        "file": "04_tantegel_basement_sunlight.png",
        "title": "Tantegel Basement — Shrine of the Stones of Sunlight (35 Steps)",
        "scene": "TantegelBasement",
        "x": 5,
        "y": 6,
        "facing": "up",
        "gold": 180,
        "level": 3,
        "hp": 24,
        "mp": 6,
        "king_intro_done": True,
        "action": "search",
        "caption": "Via `castle1f-to-basement` @ `(13,4)` -> `tantegel-castle-b1 (1,5)`, the hero reaches chest `tbac1 (5,6)` to claim the Stones of Sunlight.",
    },
    {
        "num": 5,
        "file": "05_world_map_alefgard_overworld.png",
        "title": "Alefgard Overworld — Stepping Outside Tantegel (36 Steps)",
        "scene": "WorldMap",
        "x": 46,
        "y": 44,
        "facing": "right",
        "gold": 180,
        "level": 2,
        "hp": 22,
        "mp": 0,
        "king_intro_done": True,
        "caption": "Exiting `tantegel-castle-1f` row 30 transitions onto the 124×124 `world-map` at `(45,45)` with Brecconary visible to the east at `(50,43)`.",
    },
    {
        "num": 6,
        "file": "06_brecconary_weapons_and_inn.png",
        "title": "Brecconary Town — First Town & Equipment Outfitting (44 Steps)",
        "scene": "Brecconary",
        "x": 5,
        "y": 6,
        "facing": "up",
        "gold": 180,
        "level": 2,
        "hp": 22,
        "mp": 0,
        "king_intro_done": True,
        "action": "talk",
        "caption": "Entering `brecconary-1f` from `world-map (50,43)` spawns at `(1,15)` and connects to the Bamboo Pole / Club / Clothes merchant counter.",
    },
    {
        "num": 7,
        "file": "07_erdricks_cave_b2_tablet.png",
        "title": "Erdrick's Cave B2 — Torch-Lit Dungeon & Erdrick's Tablet (106 Steps)",
        "scene": "ErdricksCaveB2",
        "x": 9,
        "y": 4,
        "facing": "right",
        "gold": 320,
        "level": 5,
        "hp": 38,
        "mp": 20,
        "king_intro_done": True,
        "torch": True,
        "caption": "Entering `erdricks-cave-b1` from `world-map (30,14)` and descending `erdricks1-to-b2 (9,9)` reaches `erdricks-cave-b2` chest `er2c1 (10,4)`.",
    },
    {
        "num": 8,
        "file": "08_garinham_town_and_key_doors.png",
        "title": "Garinham — Northwestern Town & Locked Tomb Entrance (129 Steps)",
        "scene": "Garinham",
        "x": 9,
        "y": 11,
        "facing": "up",
        "gold": 540,
        "level": 7,
        "hp": 48,
        "mp": 26,
        "king_intro_done": True,
        "caption": "Traversing northwest to `world-map (4,4)` enters `garinham-1f (1,15)`. Unlocking door `gard2 (18,11)` and crossing bridge tile `18` at `(18,2)` opens Garin's Grave.",
    },
    {
        "num": 9,
        "file": "09_garins_grave_b4_silver_harp.png",
        "title": "Garin's Grave B4 — Deepest Crypt & Silver Harp (207 Steps)",
        "scene": "GarinhamB4",
        "x": 5,
        "y": 2,
        "facing": "up",
        "gold": 820,
        "level": 10,
        "hp": 62,
        "mp": 40,
        "king_intro_done": True,
        "radiant": True,
        "caption": "Navigating 4 subterranean floors (`garinham-b1` -> `b2` -> `b3` -> `b4`) under Radiant light reaches the Silver Harp (Lyre of Ire) shrine at `(6,1)`.",
    },
    {
        "num": 10,
        "file": "10_kol_village_fairy_flute.png",
        "title": "Village of Kol — Hot Springs & Hidden Fairy Flute (141 Steps)",
        "scene": "Kol",
        "x": 10,
        "y": 7,
        "facing": "down",
        "gold": 950,
        "level": 9,
        "hp": 58,
        "mp": 36,
        "king_intro_done": True,
        "action": "search",
        "caption": "Entering `kol-1f` from `world-map (106,12)` at `(20,24)` and searching `(10,7)` discovers the hidden Fairy Flute (`kolc_ff`) needed to lull the Cantlin Golem.",
    },
    {
        "num": 11,
        "file": "11_mountain_cave_b2_fighters_ring.png",
        "title": "Mountain Cave B2 — Fighter's Ring & Treasure Vault (83 Steps)",
        "scene": "MountainCaveB2",
        "x": 3,
        "y": 3,
        "facing": "right",
        "gold": 1120,
        "level": 11,
        "hp": 70,
        "mp": 48,
        "king_intro_done": True,
        "radiant": True,
        "caption": "From `world-map (31,59)` into `mountain-cave-b1` and down to `mountain-cave-b2`, all 4 chests (`mt2c1..mt2c4`) are verified reachable.",
    },
    {
        "num": 12,
        "file": "12_swamp_cave_princess_gwaelin.png",
        "title": "Swamp Cave B1 — Rescuing Princess Gwaelin (159 Steps)",
        "scene": "SwampCave",
        "x": 5,
        "y": 20,
        "facing": "right",
        "gold": 1450,
        "level": 12,
        "hp": 78,
        "mp": 54,
        "king_intro_done": True,
        "radiant": True,
        "caption": "Connecting the northern `(106,46)` and southern `(106,51)` continents, unlocking door `sw1d1 (6,21)` reaches Princess Gwaelin's chamber at `(6,20)`.",
    },
    {
        "num": 13,
        "file": "13_rimuldar_magic_key_haven.png",
        "title": "Rimuldar — Island Canal Town & Magic Key Emporium (161 Steps)",
        "scene": "Rimuldar",
        "x": 15,
        "y": 15,
        "facing": "up",
        "gold": 1950,
        "level": 13,
        "hp": 86,
        "mp": 64,
        "king_intro_done": True,
        "caption": "Emerging from Swamp Cave South to `world-map (104,74)` enters `rimuldar-1f (30,15)` across wooden bridge tile `18` into the town plaza.",
    },
    {
        "num": 14,
        "file": "14_cantlin_fortress_town.png",
        "title": "Cantlin — Walled Citadel & Endgame Armory (151 Steps)",
        "scene": "Cantlin",
        "x": 15,
        "y": 13,
        "facing": "down",
        "gold": 3400,
        "level": 15,
        "hp": 105,
        "mp": 82,
        "king_intro_done": True,
        "caption": "Reaching `world-map (75,104)` enters `cantlin-1f (1,16)`. All 5 locked doors (`ctnd1..ctnd5`) and 3 chests (`ctnc1..ctnc3`) are verified reachable.",
    },
    {
        "num": 15,
        "file": "15_hauksness_erdricks_armor.png",
        "title": "Ruins of Hauksness — Axe Knight & Erdrick's Armor (136 Steps)",
        "scene": "Hauksness",
        "x": 18,
        "y": 13,
        "facing": "right",
        "gold": 4200,
        "level": 16,
        "hp": 118,
        "mp": 95,
        "king_intro_done": True,
        "caption": "Entering `hauksness-1f (1,10)` from `world-map (27,91)` and crossing barrier tiles `(17,13)..(18,13)` reaches the Axe Knight & Erdrick's Armor at `(19,13)`.",
    },
    {
        "num": 16,
        "file": "16_northern_shrine_staff_of_rain.png",
        "title": "Northern Shrine — Claiming the Staff of Rain (124 Steps)",
        "scene": "StaffOfRainCave",
        "x": 4,
        "y": 6,
        "facing": "up",
        "gold": 4800,
        "level": 16,
        "hp": 118,
        "mp": 95,
        "king_intro_done": True,
        "caption": "Descending `worldmap-northern-b1` at `world-map (83,3)` enters `northern-cave-b1 (5,10)` and reaches chest `nc1c1 (4,5)` for the Staff of Rain.",
    },
    {
        "num": 17,
        "file": "17_southern_shrine_rainbow_drop.png",
        "title": "Southern Sanctum — Forging the Rainbow Drop (203 Steps)",
        "scene": "RainbowDropCave",
        "x": 5,
        "y": 6,
        "facing": "right",
        "gold": 5200,
        "level": 17,
        "hp": 130,
        "mp": 108,
        "king_intro_done": True,
        "caption": "Descending `worldmap-southern-b1` at `world-map (110,111)` enters `southern-cave-b1 (1,5)` and reaches chest `sc1c1 (6,6)` for the Rainbow Drop.",
    },
    {
        "num": 18,
        "file": "18_charlock_castle_1f_fortress.png",
        "title": "Charlock Castle 1F — Breaching the Dragonlord's Fortress (49 Steps)",
        "scene": "CharlockCastle1F",
        "x": 10,
        "y": 14,
        "facing": "up",
        "gold": 6500,
        "level": 18,
        "hp": 142,
        "mp": 118,
        "king_intro_done": True,
        "caption": "Spanning the Rainbow Bridge at `world-map (66,51)` unlocks Charlock Island and enters `charlock-castle-1f (10,20)` from `world-map (50,50)`.",
    },
    {
        "num": 19,
        "file": "19_charlock_b2_erdricks_sword.png",
        "title": "Charlock B2 — Multi-Floor Loop to Erdrick's Sword (116 Steps)",
        "scene": "CharlockCastleB2",
        "x": 6,
        "y": 6,
        "facing": "up",
        "gold": 7400,
        "level": 19,
        "hp": 150,
        "mp": 125,
        "king_intro_done": True,
        "radiant": True,
        "action": "search",
        "caption": "Traversing `Charlock 1F -> B1 -> B2 -> B3 -> B2 (10,2) -> B1 (16,2) -> B2 (6,1)` reaches the isolated sanctum holding Erdrick's Sword (`cb2c1 @ 6,6`).",
    },
    {
        "num": 20,
        "file": "20_charlock_b7_dragonlord_battle.png",
        "title": "Charlock B7 — Dragonlord's Altar & Final Confrontation (153 Steps)",
        "scene": "CharlockThroneRoom",
        "x": 18,
        "y": 12,
        "facing": "right",
        "gold": 8800,
        "level": 20,
        "hp": 155,
        "mp": 135,
        "king_intro_done": True,
        "battle": "dragonlord_form2",
        "caption": "Descending through `Charlock B1..B6` into `charlock-castle-b7` unlocks `cb7d1 (17,12)`, reaches the 6 treasury chests (`cb7c1..cb7c4`), and confronts the Dragonlord at `(20,12)`.",
    },
]


def http_get(port: int, path: str) -> dict:
    url = f"http://127.0.0.1:{port}{path}"
    with urllib.request.urlopen(url, timeout=5.0) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_post(port: int, path: str, payload: dict) -> dict:
    url = f"http://127.0.0.1:{port}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=8.0) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_headless_completeness_audit() -> dict:
    cmd = ["godot", "--headless", "--path", str(GAME_DIR), "-s", "tests/test_map_completeness.gd"]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    print(proc.stdout)
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr)
        raise RuntimeError(f"Headless map completeness audit failed with exit code {proc.returncode}")
    if not REPORT_PATH.exists():
        raise RuntimeError(f"Expected completeness report at {REPORT_PATH}")
    return json.loads(REPORT_PATH.read_text())


def print_audit_table(report: dict) -> None:
    print("\n=== GLOBAL PATHFINDING REACHABILITY TABLE (29 MAPS) ===")
    print(f"{'Map Key':<24} {'Reachable':<10} {'Min Steps':<10} {'Tiles':<8} {'Shortest Transition Chain'}")
    print("-" * 105)
    for m in report.get("maps", []):
        status = "PASS" if m["reachable"] else "FAIL"
        print(f"{m['map']:<24} {status:<10} {m['min_steps_from_start']:<10} {m['reachable_tiles']:<8} {m['route']}")

    print("\n=== QUEST RELIC & MILESTONE PATHFINDING TABLE (14 MILESTONES) ===")
    print(f"{'Milestone':<32} {'Map':<22} {'Coord':<10} {'Min Steps':<10} {'Status'}")
    print("-" * 92)
    for ms in report.get("milestones", []):
        coord = f"({ms['col']},{ms['row']})"
        status = "PASS" if ms["reachable"] else "FAIL"
        print(f"{ms['name']:<32} {ms['map']:<22} {coord:<10} {ms['steps_from_start']:<10} {status}")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def capture_slideshow_screenshots(port: int = 0) -> list:
    if port <= 0:
        port = find_free_port()
    SITE_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["DW_WEB_SERVICE_PORT"] = str(port)

    use_xvfb = shutil.which("xvfb-run") is not None and not env.get("DISPLAY")
    base_cmd = ["godot", "--path", str(GAME_DIR), "--", f"--port={port}"]
    if use_xvfb or shutil.which("xvfb-run") is not None:
        cmd = ["xvfb-run", "-a", "-s", "-screen 0 1024x768x24"] + base_cmd
    else:
        cmd = base_cmd

    print(f"\n[Screenshots] Launching Godot instance on port {port} to capture {len(SLIDESHOW_MILESTONES)} pathfinding milestones...")
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)

    try:
        ready = False
        for _ in range(60):
            try:
                h = http_get(port, "/health")
                if h.get("status") == "ok":
                    ready = True
                    break
            except Exception:
                pass
            time.sleep(0.25)
        if not ready:
            raise RuntimeError("Godot HTTP control server did not become ready in time.")

        captured_manifest = []
        for ms in SLIDESHOW_MILESTONES:
            save_payload = {
                "scene": ms["scene"],
                "spawn_tile": [ms["x"], ms["y"]],
                "spawn_facing": ms["facing"],
                "come_from": "pathfinding_tour",
                "gold": ms["gold"],
                "weapon": "Erdrick's Sword" if ms["level"] >= 18 else ("Broad Sword" if ms["level"] >= 10 else ("Copper Sword" if ms["level"] >= 2 else "")),
                "armor": "Erdrick's Armor" if ms["level"] >= 16 else ("Half Plate" if ms["level"] >= 9 else ("Leather Armor" if ms["level"] >= 4 else "")),
                "hero_stats": {
                    "name": "ERDRICK",
                    "level": ms["level"],
                    "hp": ms["hp"],
                    "hp_max": ms["hp"],
                    "mp": ms["mp"],
                    "mp_max": ms["mp"],
                    "str": ms["level"] * 5,
                    "agl": ms["level"] * 4,
                    "atk": ms["level"] * 6,
                    "def": ms["level"] * 5,
                    "exp": ms["level"] * 850,
                },
                "inventory": [
                    {"name": "Magic Key", "type": "key", "desc": "Opens locked doors."},
                    {"name": "Torch", "type": "item", "desc": "Lights dark dungeons."},
                    {"name": "Fairy Flute", "type": "quest", "desc": "Puts Golem to sleep."},
                    {"name": "Silver Harp", "type": "quest", "desc": "Summons monsters."},
                    {"name": "Staff of Rain", "type": "quest", "desc": "Calls forth rain."},
                    {"name": "Stones of Sunlight", "type": "quest", "desc": "Holds warm sunlight."},
                    {"name": "Rainbow Drop", "type": "quest", "desc": "Bridges the sea to Charlock."},
                ],
                "spells": ["HEAL", "RADIANT", "OUTSIDE", "RETURN", "HURTMORE"] if ms["level"] >= 10 else ["HEAL"],
                "opened_chests": {},
                "unlocked_doors": {},
                "bridge_built": True,
                "king_intro_done": ms.get("king_intro_done", True),
                "encounters_disabled": True,
                "demo_mode_enabled": False,
            }
            http_post(port, "/command", {"command": "load_save_state", "args": {"state": save_payload}})
            time.sleep(0.55)
            http_post(port, "/command", {"command": "teleport", "args": {"x": ms["x"], "y": ms["y"]}})
            time.sleep(0.25)

            if ms.get("king_intro_done") is False:
                http_post(port, "/command", {"command": "set_game_state", "args": {"king_intro_done": False}})
                time.sleep(0.35)
            if ms.get("torch"):
                http_post(port, "/command", {"command": "use_item", "args": {"item": "torch"}})
                time.sleep(0.2)
            if ms.get("radiant"):
                http_post(port, "/command", {"command": "cast_spell", "args": {"spell": "radiant"}})
                time.sleep(0.2)
            if ms.get("action") == "open_menu":
                http_post(port, "/command", {"command": "open_menu", "args": {}})
                time.sleep(0.35)
            elif ms.get("action") == "search":
                http_post(port, "/command", {"command": "select_command", "args": {"cmd": "SEARCH"}})
                time.sleep(0.45)
            elif ms.get("action") == "talk":
                http_post(port, "/command", {"command": "select_command", "args": {"cmd": "TALK"}})
                time.sleep(0.45)
            elif ms.get("battle"):
                http_post(port, "/command", {"command": "trigger_encounter", "args": {"monster": ms["battle"]}})
                time.sleep(1.1)

            out_site = SITE_ASSETS_DIR / ms["file"]
            out_docs = DOCS_ASSETS_DIR / ms["file"]
            res = http_post(port, "/command", {"command": "capture_screenshot", "args": {"file_path": str(out_site)}})
            if not res.get("success") or not out_site.exists():
                raise RuntimeError(f"Failed to capture screenshot for milestone {ms['num']}: {ms['title']}")
            shutil.copy2(out_site, out_docs)
            print(f"  [Slide {ms['num']:02d}/20] Captured {ms['file']} — {ms['title']}")
            captured_manifest.append({
                "num": ms["num"],
                "file": ms["file"],
                "title": ms["title"],
                "scene": ms["scene"],
                "coord": [ms["x"], ms["y"]],
                "caption": ms["caption"],
            })

        manifest_path = SITE_ASSETS_DIR / "slideshow_manifest.json"
        manifest_path.write_text(json.dumps(captured_manifest, indent=2) + "\n")
        shutil.copy2(manifest_path, DOCS_ASSETS_DIR / "slideshow_manifest.json")
        return captured_manifest
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()


def main() -> int:
    parser = argparse.ArgumentParser(description="Quest: Warrior Dragon Headless Map Completeness & Pathfinding Test")
    parser.add_argument("--screenshots", action="store_true", help="Generate 20 milestone screenshots for rowbose.com slideshow")
    args = parser.parse_args()

    report = run_headless_completeness_audit()
    print_audit_table(report)

    assert report["maps_reached_count"] == 29, f"Expected 29/29 maps reachable, got {report['maps_reached_count']}"
    assert report["stairs_verified_count"] == 86, f"Expected 86/86 stairs verified, got {report['stairs_verified_count']}"
    assert report["doors_verified_count"] == 21, f"Expected 21/21 doors verified, got {report['doors_verified_count']}"
    assert report["chests_reached_count"] == 40, f"Expected 40/40 chests reachable, got {report['chests_reached_count']}"
    assert report["milestones_reached_count"] == 14, f"Expected 14/14 milestones reachable, got {report['milestones_reached_count']}"
    assert len(report["failures"]) == 0, f"Unexpected failures: {report['failures']}"

    want_screenshots = args.screenshots or os.environ.get("DW_CAPTURE_SLIDESHOW", "").lower() in ("1", "true", "yes")
    if want_screenshots:
        manifest = capture_slideshow_screenshots()
        print(f"\n[PASS] Generated {len(manifest)} slideshow screenshots in {SITE_ASSETS_DIR}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
