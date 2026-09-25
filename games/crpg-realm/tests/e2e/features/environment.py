import os
import sys
import time
import subprocess
import urllib.request
import json
import shutil

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
REPORTS_DIR = os.environ.get("REPORTS_DIR", os.path.join(PROJECT_DIR, "tests", "e2e", "reports"))
VIDEOS_DIR = os.path.join(REPORTS_DIR, "videos")
DEFAULT_DISPLAY = os.environ.get("CRPG_DISPLAY", os.environ.get("XVFB_DISPLAY", ":99"))
WIDTH = "1920"
HEIGHT = "1080"
WEB_SERVICE_PORT = int(os.environ.get("CRPG_WEB_SERVICE_PORT", "18090"))
# CRPG_MODE=human   (default) "prove it to a human": Xvfb, video, splash, BDD overlays and pauses.
# CRPG_MODE=backend fastest possible: headless Godot, no video, no overlays, no pauses.
MODE = os.environ.get("CRPG_MODE", "human").strip().lower()

def is_backend():
    return MODE == "backend"

def is_engine_scenario(scenario):
    feature_path = scenario.feature.filename if getattr(scenario, "feature", None) else ""
    tags = set(scenario.tags).union(set(scenario.feature.tags if getattr(scenario, "feature", None) else []))
    return "/engine/" in feature_path.replace("\\", "/") or "engine" in tags

def resolve_godot_bin():
    if "GODOT_BIN" in os.environ and os.path.exists(os.environ["GODOT_BIN"]):
        return os.environ["GODOT_BIN"]
    candidates = [
        os.path.expanduser("~/apps/godot4"),
        os.path.expanduser("~/.local/bin/godot4"),
        os.path.expanduser("~/.local/bin/godot"),
        "/usr/bin/godot4",
        "/usr/bin/godot",
        "/usr/local/bin/godot4",
        "/usr/local/bin/godot",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    found = shutil.which("godot4") or shutil.which("godot")
    return found or "godot4"

def resolve_xvfb_bin():
    if "XVFB_BIN" in os.environ and os.path.exists(os.environ["XVFB_BIN"]):
        return os.environ["XVFB_BIN"]
    found = shutil.which("Xvfb")
    if found:
        return found
    for c in ["/usr/bin/Xvfb", "/usr/local/bin/Xvfb", os.path.expanduser("~/.local/bin/Xvfb")]:
        if os.path.exists(c):
            return c
    return None

def resolve_ffmpeg_bin():
    if "FFMPEG_BIN" in os.environ and os.path.exists(os.environ["FFMPEG_BIN"]):
        return os.environ["FFMPEG_BIN"]
    found = shutil.which("ffmpeg")
    return found or "/usr/bin/ffmpeg"

def wait_for_game_service(port, timeout=12.0):
    start = time.time()
    url = f"http://127.0.0.1:{port}/api/v1/health"
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False

def before_all(context):
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    context.web_port = WEB_SERVICE_PORT
    context.mode = MODE
    context.use_xvfb = os.environ.get("USE_XVFB", "1").lower() not in ("0", "false", "no") and not is_backend()
    print(f"⚙️ [Mode] CRPG_MODE={MODE}")
    context.display_num = DEFAULT_DISPLAY

    xvfb_bin = resolve_xvfb_bin()
    if context.use_xvfb and xvfb_bin:
        lock_file = f"/tmp/.X{context.display_num.replace(':', '')}-lock"
        if os.path.exists(lock_file):
            try:
                os.remove(lock_file)
            except Exception:
                pass
        xvfb_cmd = [xvfb_bin, context.display_num, "-screen", "0", f"{WIDTH}x{HEIGHT}x24", "-ac"]
        try:
            context.xvfb_proc = subprocess.Popen(xvfb_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(1.0)
            print(f"🎬 [Xvfb] Initialized virtual display {context.display_num} with resolution {WIDTH}x{HEIGHT}.")
        except Exception as e:
            print(f"⚠️ [Xvfb] Could not launch Xvfb: {e}")
            context.xvfb_proc = None
    else:
        context.xvfb_proc = None

    # Launch Godot 4 process in headed mode on Xvfb display
    godot_bin = resolve_godot_bin()
    env = os.environ.copy()
    env["DISPLAY"] = context.display_num
    env["CRPG_WEB_SERVICE_PORT"] = str(context.web_port)

    godot_cmd = [
        godot_bin,
        "--path", PROJECT_DIR,
        "--port", str(context.web_port)
    ]
    if is_backend():
        godot_cmd.insert(1, "--headless")
    context.godot_log = open(os.path.join(REPORTS_DIR, "godot_output.log"), "w")
    context.godot_proc = subprocess.Popen(godot_cmd, env=env, stdout=context.godot_log, stderr=subprocess.STDOUT)

    if not wait_for_game_service(context.web_port):
        print(f"⚠️ [Godot] Web service did not respond on port {context.web_port} in time!")
    else:
        print(f"✔ [Godot] Game Control Server healthy on port {context.web_port}!")

def before_scenario(context, scenario):
    raw_name = scenario.name.lower().replace(" ", "_").replace("-", "_")
    context.scenario_name = "".join([c for c in raw_name if c.isalnum() or c == "_"])
    context.mp4_path = os.path.join(VIDEOS_DIR, f"{context.scenario_name}.mp4")

    if os.path.exists(context.mp4_path):
        try:
            os.remove(context.mp4_path)
        except Exception:
            pass

    context.engine_scenario = is_engine_scenario(scenario)
    context.ffmpeg_proc = None
    if is_backend():
        return

    # 1. Determine whether this scenario is a full start-to-finish playthrough or an isolated scene test
    feature_path = scenario.feature.filename if getattr(scenario, "feature", None) else ""
    feature_file = os.path.basename(feature_path)
    tags = set(scenario.tags).union(set(scenario.feature.tags if getattr(scenario, "feature", None) else []))

    all_step_names = []
    if hasattr(scenario, "background") and scenario.background:
        all_step_names.extend([s.name for s in scenario.background.steps])
    if hasattr(scenario, "steps") and scenario.steps:
        all_step_names.extend([s.name for s in scenario.steps])

    is_full_playthrough = (
        "full_playthroughs" in feature_path or
        any(t in tags for t in ["full_journey", "full_playthrough", "journey", "playthrough"])
    )

    needs_character_creation = (
        is_full_playthrough or
        any("types hero name" in s or "selects race" in s or "clicks the Fighter archetype button" in s for s in all_step_names) or
        any(t in tags for t in ["character_creation", "character_select"])
    )

    if context.engine_scenario:
        # Engine scenarios load their own map, state and directives in their Given steps
        pass
    elif needs_character_creation:
        # Full playthrough or onboarding test: start at Character Creation
        try:
            url = f"http://127.0.0.1:{context.web_port}/api/v1/reset"
            req = urllib.request.Request(url, data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=3) as resp:
                pass
        except Exception as e:
            print(f"⚠️ [Reset] Failed to reset to CharacterSelect: {e}")
        time.sleep(0.4)
    else:
        # Isolated scene test: determine target scene and initialize directly
        target_scene = "Homestead"
        target_hero_name = "Lieutenant Vance"
        target_hero_class = "fighter"
        target_companions = []
        target_gold = 150
        target_inventory = ["potion-healing"]
        target_quest_stage = 1
        target_flags = {}

        # Detect target scene from tags, feature filename, or step names
        for t in tags:
            if t.startswith("scene:"):
                target_scene = t.split(":", 1)[1]

        if target_scene == "Homestead":
            if any(p in feature_file for p in ["05_multi_party", "06_infinity_aggro", "07_post_battle", "08_party_defeat", "12_tactical", "13_arena"]) or \
               any("tactical battle" in s.lower() or "tacticalbattle" in s.lower() or "arena" in s.lower() for s in all_step_names):
                target_scene = "TacticalBattle"
            elif any(p in feature_file for p in ["04_shopkeeper", "09_", "10_", "11_"]) or \
                 any("villagesquare" in s.lower() or "village square" in s.lower() or "blacksmith brand" in s.lower() or "trading window" in s.lower() for s in all_step_names):
                target_scene = "VillageSquare"
            elif any(p in feature_file for p in ["01_fog_of_war", "02_party_rtwp", "03_character_status", "06_", "07_", "08_"]) or \
                 any("homestead" in s.lower() for s in all_step_names):
                target_scene = "Homestead"
            elif any("catacomb" in s.lower() or "crypt" in s.lower() or "ancientcatacombs" in s.lower() for s in all_step_names):
                target_scene = "AncientCatacombs"

        if target_scene == "TacticalBattle":
            target_companions = ["elora", "thrumbar"]
            target_inventory = ["service-sword", "chain-mail", "potion-healing"]
        elif target_scene == "AncientCatacombs":
            target_companions = ["elora"]
            target_inventory = ["service-sword", "potion-healing", "thieves-tools"]
            target_quest_stage = 4
        elif target_scene == "VillageSquare":
            target_companions = ["elora"]
            target_inventory = ["service-sword", "potion-healing", "potion-healing"]
            target_quest_stage = 2
            target_flags = {"partner_conversed": True, "footlocker_looted": True}
        elif target_scene == "Homestead":
            target_inventory = ["potion-healing"]

        # Call setup_state to initialize the target scene and state directly
        try:
            url_setup = f"http://127.0.0.1:{context.web_port}/api/v1/setup_state"
            payload = json.dumps({
                "name": target_hero_name,
                "class": target_hero_class,
                "scene": target_scene,
                "companions": target_companions,
                "gold": target_gold,
                "inventory": target_inventory,
                "quest_stage": target_quest_stage,
                "flags": target_flags
            }).encode("utf-8")
            req = urllib.request.Request(url_setup, data=payload, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=4) as resp:
                pass
        except Exception as e:
            print(f"⚠️ [SetupState] Failed to initialize {target_scene}: {e}")
        time.sleep(0.5)

    # 1b. Reset the on-screen proof panel and remember where this scenario's engine events begin
    try:
        from tests.e2e.proof_helpers import clear_proofs, mark
        clear_proofs(context.web_port, scenario.name)
        context.scenario_event_mark = mark(context)
    except Exception as e:
        context.scenario_event_mark = 0
        print(f"⚠️ [Proof] Could not reset proof panel: {e}")

    # 2. Start FFmpeg recording now that the game is in the exact initial scene!
    ffmpeg_bin = resolve_ffmpeg_bin()
    ffmpeg_log = open(os.path.join(REPORTS_DIR, "ffmpeg.log"), "a", encoding="utf-8")
    env = os.environ.copy()

    ffmpeg_cmd = [
        ffmpeg_bin, "-y",
        "-f", "x11grab",
        "-framerate", "30",
        "-video_size", f"{WIDTH}x{HEIGHT}",
        "-draw_mouse", "0",
        "-i", f"{context.display_num}.0",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        context.mp4_path
    ]
    try:
        context.ffmpeg_proc = subprocess.Popen(ffmpeg_cmd, env=env, stdin=subprocess.PIPE, stdout=ffmpeg_log, stderr=ffmpeg_log)
        print(f"📹 [FFmpeg] Started video recording for scenario: {context.scenario_name}")
    except Exception as e:
        print(f"⚠️ [FFmpeg] Could not start recording: {e}")
        context.ffmpeg_proc = None

    # Wait 0.3s for FFmpeg capture stream initialization
    time.sleep(0.3)

    # 3. Trigger 3-second introductory scenario splash card over the loaded starting scene
    #    (engine scenarios show their own splash once the scenario is loaded)
    if context.engine_scenario:
        return
    try:
        desc_lines = getattr(scenario, "description", [])
        if isinstance(desc_lines, list):
            scenario_desc = " ".join([l.strip() for l in desc_lines if l.strip()])
        else:
            scenario_desc = str(desc_lines).strip()
        
        if not scenario_desc:
            scenario_desc = f"Tactical E2E scenario execution validating party mechanics, rules, and game state for {scenario.name}."

        starting_scene = "Unknown"
        game_state_summary = "Hero: Lieutenant Vance | Level 1 Fighter"
        try:
            url_state = f"http://127.0.0.1:{context.web_port}/api/v1/state"
            req_state = urllib.request.Request(url_state, method="GET")
            with urllib.request.urlopen(req_state, timeout=2.0) as resp:
                st = json.loads(resp.read().decode('utf-8'))
                raw_sc = st.get("scene", "Homestead")
                if isinstance(raw_sc, dict):
                    starting_scene = raw_sc.get("name", "Homestead")
                else:
                    starting_scene = str(raw_sc)
                hero = st.get("hero", {})
                h_name = hero.get("name", "Hero")
                h_lvl = hero.get("level", 1)
                h_cls = hero.get("class", "").capitalize()
                h_gold = hero.get("gold", 150)
                
                p_members = st.get("party_members", [])
                comp_strs = []
                for pm in p_members:
                    if pm.get("name") != h_name:
                        comp_strs.append(f"{pm.get('name', 'Companion')} (Lvl {pm.get('level', 1)} {pm.get('class', '').capitalize()})")
                
                if comp_strs:
                    game_state_summary = f"Party: {h_name} (Lvl {h_lvl} {h_cls}) | {' | '.join(comp_strs)} • Gold: {h_gold} GP"
                else:
                    game_state_summary = f"Hero: {h_name} (Lvl {h_lvl} {h_cls}) • Gold: {h_gold} GP"
        except Exception:
            pass

        splash_payload = json.dumps({
            "scenario_name": scenario.name,
            "description": scenario_desc,
            "starting_scene": starting_scene,
            "game_state_summary": game_state_summary,
            "duration": 3.0
        }).encode("utf-8")
        splash_url = f"http://127.0.0.1:{context.web_port}/api/v1/qa/scenario_splash"
        req_splash = urllib.request.Request(splash_url, data=splash_payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req_splash, timeout=2.0) as resp:
            pass
        # Display splash screen for 3.0 seconds at the start of the video recording
        time.sleep(3.0)
    except Exception as e:
        print(f"⚠️ [Splash] Could not display scenario splash: {e}")

def before_step(context, step):
    context.step_proofs = []
    if is_backend():
        return
    try:
        from tests.e2e.step_descriptions import get_step_description
        url = f"http://127.0.0.1:{context.web_port}/api/v1/qa/set_step"
        step_text = f"{step.step_type.upper()} {step.name}"
        sub_text = f"Scenario: {getattr(context, 'scenario_name', '')}"
        
        step_doc = getattr(step, "text", None)
        desc = get_step_description(step.step_type, step.name, step_doc)

        payload = json.dumps({"step": step_text, "subtitle": sub_text, "description": desc}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            pass
    except Exception:
        pass

def after_step(context, step):
    """Post every verification (and the live values it read back) onto the recorded video."""
    if is_backend():
        return
    try:
        from tests.e2e.proof_helpers import post_proof
        proofs = getattr(context, "step_proofs", []) or []
        passed = step.status.name == "passed"
        if step.step_type == "then" or proofs or not passed:
            evidence = "  |  ".join(proofs)
            if not passed:
                err = str(getattr(step, "error_message", "") or "").strip().splitlines()
                evidence = (err[0][:220] if err else "assertion failed") + (("  |  " + evidence) if evidence else "")
            post_proof(context.web_port, step.name, evidence, passed)
            time.sleep(0.45 if proofs else 0.2)
    except Exception as e:
        print(f"⚠️ [Proof] Could not post step proof: {e}")


def after_scenario(context, scenario):
    if is_backend():
        return
    # Automatic, scenario-wide proof: no visible label renders a "tofu" box
    try:
        from tests.e2e.proof_helpers import _get, post_proof
        g = _get(context.web_port, "/api/v1/ui/glyphs")
        miss = g.get("missing", [])
        uniq = sorted({m.get("codepoint") for m in miss})
        covered = g.get("covered", {})
        ordered = sorted(covered.items(), key=lambda kv: -int(kv[0][2:], 16))
        sample = ", ".join(f"{v['char']} {k}→{v['font'].split('-')[0]}" for k, v in ordered[:5])
        post_proof(context.web_port, f"UI glyph audit: {g.get('labels_scanned', 0)} visible labels, {len(uniq)} missing glyphs",
                   ("MISSING " + ", ".join(uniq)) if uniq else (sample or "all ASCII"), not uniq)
    except Exception as e:
        print(f"⚠️ [Proof] Glyph audit failed: {e}")
    time.sleep(1.2)

    # Capture GameState JSON telemetry
    try:
        url = f"http://127.0.0.1:{context.web_port}/api/v1/state"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            state_data = json.loads(resp.read().decode('utf-8'))
            state_json_path = os.path.join(REPORTS_DIR, f"gamestate_{context.scenario_name}.json")
            with open(state_json_path, "w", encoding="utf-8") as f:
                json.dump(state_data, f, indent=2)
            print(f"📄 [Telemetry] GameState JSON captured: {state_json_path}")
    except Exception as e:
        print(f"⚠️ [Telemetry] Could not capture GameState JSON: {e}")

    # Stop FFmpeg recording
    if getattr(context, 'ffmpeg_proc', None) is not None:
        try:
            context.ffmpeg_proc.communicate(input=b'q', timeout=3)
        except Exception:
            try:
                context.ffmpeg_proc.terminate()
                context.ffmpeg_proc.wait(timeout=2)
            except Exception:
                context.ffmpeg_proc.kill()
        context.ffmpeg_proc = None

    if os.path.exists(context.mp4_path) and os.path.getsize(context.mp4_path) > 0:
        print(f"🎬 [Video] High-Quality MP4 video saved: {context.mp4_path} ({os.path.getsize(context.mp4_path)} bytes)")

def after_all(context):
    if getattr(context, 'godot_proc', None) is not None:
        try:
            context.godot_proc.terminate()
            context.godot_proc.wait(timeout=2)
        except Exception:
            context.godot_proc.kill()
        context.godot_proc = None

    if getattr(context, 'xvfb_proc', None) is not None:
        try:
            context.xvfb_proc.terminate()
            context.xvfb_proc.wait(timeout=2)
        except Exception:
            context.xvfb_proc.kill()
        context.xvfb_proc = None

    print("🏁 [E2E] Cucumber test session completed.")
