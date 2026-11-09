import os
import time
import json
import shutil
import subprocess
import urllib.request
from behave import given, when, then, use_step_matcher

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
GODOT_BIN = shutil.which("godot4") or os.path.expanduser("~/.local/bin/godot4") or "godot4"

def get_state(port):
    url = f"http://127.0.0.1:{port}/api/v1/state"
    for attempt in range(10):
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=3) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            if attempt == 9:
                raise
            time.sleep(0.2)

def post_input(action, port):
    url = f"http://127.0.0.1:{port}/api/v1/input"
    body = json.dumps({"action": action}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=3) as resp:
        return json.loads(resp.read().decode("utf-8"))

def post_command(cmd, args, port):
    url = f"http://127.0.0.1:{port}/api/v1/command"
    body = json.dumps({"command": cmd, "args": args or {}}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=4) as resp:
        return json.loads(resp.read().decode("utf-8"))

def wait_for_service(base_port=8090, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        for p in range(base_port, base_port + 10):
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{p}/health", method="GET")
                with urllib.request.urlopen(req, timeout=0.5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if data.get("status") == "ok":
                        return p
            except Exception:
                pass
        time.sleep(0.2)
    return None

def spawn_game(context, scene_name, tile=None, facing=None):
    if getattr(context, "godot_proc", None) is not None:
        try:
            if context.godot_proc.poll() is None:
                context.godot_proc.terminate()
                context.godot_proc.wait(timeout=2)
        except Exception:
            pass
        context.godot_proc = None

    scene_clean = scene_name.replace("res://scenes/", "").replace(".tscn", "")
    base_port = 8090
    env = os.environ.copy()
    env["DISPLAY"] = getattr(context, "display_num", ":98")
    env["DW_WEB_SERVICE_PORT"] = str(base_port)

    cmd = [
        GODOT_BIN,
        "--path", PROJECT_DIR,
        "--rendering-driver", "opengl3",
    ]
    if getattr(context, "avi_path", None):
        cmd.extend(["--write-movie", context.avi_path])

    cmd.extend([
        "res://scenes/DebugLaunch.tscn",
        "--",
        "--scene", scene_clean,
        "--tile-debug",
        f"--web-service-port={base_port}"
    ])
    if tile:
        cmd.extend(["--tile", f"{tile[0]},{tile[1]}"])
    if facing:
        cmd.extend(["--facing", facing])

    context.godot_proc = subprocess.Popen(cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    port = wait_for_service(base_port=base_port, timeout=15.0)
    assert port is not None, "Failed to connect to FF1 GameControlServer!"
    context.web_port = port

    for _ in range(40):
        st = get_state(port)
        sname = st.get("scene_shown", {}).get("name", "")
        if sname and sname != "DebugLaunch":
            break
        time.sleep(0.1)
    time.sleep(0.25)

use_step_matcher("re")

@given(r'the game is launched on "(?P<scene_name>[^"]+)" in virtual display Xvfb')
def step_launch_scene(context, scene_name):
    spawn_game(context, scene_name)

@given(r'the game is launched on "(?P<scene_name>[^"]+)" at tile \((?P<tx>\d+),\s*(?P<ty>\d+)\) facing "(?P<facing>[^"]+)" in virtual display Xvfb')
def step_launch_scene_at_tile(context, scene_name, tx, ty, facing):
    spawn_game(context, scene_name, tile=(int(tx), int(ty)), facing=facing)

@when(r'the player selects NEW GAME on the title screen')
def step_select_new_game(context):
    post_input("ui_accept", context.web_port)
    time.sleep(0.4)

@then(r'the game transitions to "(?P<target_scene>[^"]+)"')
def step_verify_scene_transition(context, target_scene):
    target_clean = target_scene.replace(".tscn", "")
    deadline = time.time() + 5.0
    cur_name = ""
    while time.time() < deadline:
        st = get_state(context.web_port)
        cur_name = st.get("scene_shown", {}).get("name", "")
        if cur_name == target_clean:
            return
        time.sleep(0.15)
    assert cur_name == target_clean, f"Expected scene '{target_clean}', got '{cur_name}'"

@then(r'the hero is at tile \((?P<tx>\d+),\s*(?P<ty>\d+)\)')
def step_verify_hero_tile(context, tx, ty):
    st = get_state(context.web_port)
    pos = st.get("hero_position", {})
    assert (int(pos.get("x", -1)), int(pos.get("y", -1))) == (int(tx), int(ty)), (
        f"Expected hero at ({tx}, {ty}), got ({pos.get('x')}, {pos.get('y')})"
    )

@when(r'the player creates the 4 Light Warriors and begins the quest')
def step_create_four_light_warriors(context):
    port = context.web_port
    post_input("move_right", port)
    time.sleep(0.15)
    post_input("move_left", port)
    time.sleep(0.15)
    for _ in range(8):
        post_input("ui_accept", port)
        time.sleep(0.2)
    st = get_state(port)
    pc = st.get("party_create", {})
    assert pc.get("step_mode") == "ready", f"Expected PartyCreate step_mode='ready', got {pc}"
    post_input("ui_accept", port)
    time.sleep(0.4)

@then(r'the party has 4 Light Warriors and (?P<gold>\d+) Gold')
def step_verify_party_and_gold(context, gold):
    st = get_state(context.web_port)
    gs = st.get("game_state", {})
    party = gs.get("party", [])
    assert len(party) == 4, f"Expected 4 Light Warriors, got {len(party)}"
    assert int(gs.get("gold", 0)) == int(gold), f"Expected {gold} Gold, got {gs.get('gold')}"
    classes = [m.get("class") for m in party]
    assert "Fighter" in classes and "White Mage" in classes and "Black Mage" in classes, f"Unexpected party classes: {classes}"

@when(r'the player talks to the NPC in front of the hero')
def step_talk_to_npc(context):
    post_input("ui_accept", context.web_port)
    time.sleep(0.3)

@then(r'dialog is displayed with text containing "(?P<pattern>[^"]+)"')
def step_verify_dialog_contains(context, pattern):
    deadline = time.time() + 4.0
    last_text = ""
    norm_pat = " ".join(pattern.split()).lower()
    while time.time() < deadline:
        st = get_state(context.web_port)
        dlg = st.get("dialog_box", {})
        last_text = f"{dlg.get('speaker', '')}: {dlg.get('text', '')}".strip()
        norm_text = " ".join(last_text.split()).lower()
        if dlg.get("is_showing") and norm_pat in norm_text:
            return
        time.sleep(0.15)
    raise AssertionError(f"Expected dialog containing '{pattern}', but got '{last_text}'")

@when(r'the player advances the dialog page')
def step_advance_dialog_page(context):
    post_input("ui_accept", context.web_port)
    time.sleep(0.3)

@then(r'the NES shop screen "(?P<shop_type>[^"]+)" is displayed with cursor on "(?P<cursor_opt>[^"]+)"')
def step_verify_nes_shop_screen(context, shop_type, cursor_opt):
    st = get_state(context.web_port)
    sw = st.get("shop_window", {})
    assert sw.get("is_showing") is True, f"Expected shop_window.is_showing=True, got {sw}"
    assert sw.get("shop_type") == shop_type, f"Expected shop_type='{shop_type}', got '{sw.get('shop_type')}'"
    assert sw.get("cursor_option") == cursor_opt, f"Expected cursor_option='{cursor_opt}', got '{sw.get('cursor_option')}'"
    if shop_type == "WEAPON":
        shot_dir = os.path.join(PROJECT_DIR, "tests", "e2e", "reports", "screenshots")
        os.makedirs(shot_dir, exist_ok=True)
        post_command("capture_screenshot", {"path": os.path.join(shot_dir, "weapon_shop_welcome.png")}, context.web_port)

@when(r'the player buys the merchandise and exits the shop')
def step_buy_and_exit_shop(context):
    # Press 1: Buy merchandise -> cursor moves to Exit
    post_input("ui_accept", context.web_port)
    time.sleep(0.25)
    st = get_state(context.web_port)
    sw = st.get("shop_window", {})
    assert sw.get("is_showing") is True, f"Expected shop still showing after Buy, got {sw}"
    assert sw.get("bought_this_visit") is True, f"Expected bought_this_visit=True after Buy, got {sw}"
    assert sw.get("cursor_option") == "Exit", f"Expected cursor on 'Exit' after Buy, got '{sw.get('cursor_option')}'"
    if sw.get("shop_type") == "WEAPON":
        shot_dir = os.path.join(PROJECT_DIR, "tests", "e2e", "reports", "screenshots")
        os.makedirs(shot_dir, exist_ok=True)
        post_command("capture_screenshot", {"path": os.path.join(shot_dir, "weapon_shop_bought.png")}, context.web_port)
    # Press 2: Exit shop -> returns to street
    post_input("ui_accept", context.web_port)
    time.sleep(0.25)
    st2 = get_state(context.web_port)
    assert st2.get("shop_window", {}).get("is_showing") is False, "Expected shop closed after Exit"

@when(r'the party enters "(?P<scene_name>[^"]+)" at tile \((?P<tx>\d+),\s*(?P<ty>\d+)\) facing "(?P<facing>[^"]+)"')
def step_enter_scene_at_tile(context, scene_name, tx, ty, facing):
    post_command("load_scene", {"path": scene_name, "x": int(tx), "y": int(ty), "facing": facing}, context.web_port)
    time.sleep(0.4)

@when(r'the hero moves (?P<direction>up|down|left|right) (?P<count>\d+) tiles')
def step_move_hero_tiles(context, direction, count):
    for _ in range(int(count)):
        post_input(f"move_{direction}", context.web_port)
        time.sleep(0.2)

@when(r'the hero uses the "(?P<cmd_name>[^"]+)" command on the chest')
def step_use_command_on_chest(context, cmd_name):
    post_command("select_command", {"cmd": cmd_name}, context.web_port)
    time.sleep(0.3)

@then(r'the item "(?P<item_name>[^"]+)" is present in player inventory')
def step_verify_item_in_inventory(context, item_name):
    st = get_state(context.web_port)
    inv = st.get("game_state", {}).get("inventory", [])
    found = any(item_name.lower() in str(it.get("name", "")).lower() for it in inv if isinstance(it, dict))
    assert found, f"Expected '{item_name}' in inventory, got {inv}"

@then(r'the leader weapon is "(?P<weapon_name>[^"]+)" and attack is (?P<atk>\d+)')
def step_verify_leader_weapon(context, weapon_name, atk):
    st = get_state(context.web_port)
    hs = st.get("hero_stats", {})
    assert hs.get("weapon") == weapon_name, f"Expected leader weapon '{weapon_name}', got '{hs.get('weapon')}'"
    assert int(hs.get("attack", 0)) == int(atk), f"Expected attack {atk}, got {hs.get('attack')}"

@then(r'the leader armor is "(?P<armor_name>[^"]+)" and defense is (?P<dfn>\d+)')
def step_verify_leader_armor(context, armor_name, dfn):
    st = get_state(context.web_port)
    hs = st.get("hero_stats", {})
    assert hs.get("armor") == armor_name, f"Expected leader armor '{armor_name}', got '{hs.get('armor')}'"
    assert int(hs.get("defense", 0)) == int(dfn), f"Expected defense {dfn}, got {hs.get('defense')}"

@then(r'the party knows spell "(?P<spell_name>[^"]+)"')
def step_verify_party_spell(context, spell_name):
    st = get_state(context.web_port)
    spells = st.get("hero_stats", {}).get("spells", [])
    assert spell_name in spells, f"Expected spell '{spell_name}' in {spells}"

@then(r'the game flag "(?P<flag_name>[^"]+)" is true')
def step_verify_game_flag(context, flag_name):
    st = get_state(context.web_port)
    gs = st.get("game_state", {})
    assert gs.get(flag_name) is True, f"Expected game_state['{flag_name}']==True, got {gs.get(flag_name)}"

@when(r'the party teleports to tile \((?P<tx>\d+),\s*(?P<ty>\d+)\) facing "(?P<facing>[^"]+)"')
def step_teleport_party(context, tx, ty, facing):
    post_command("teleport", {"x": int(tx), "y": int(ty), "facing": facing}, context.web_port)
    time.sleep(0.25)

@when(r'a random encounter with "(?P<enemy_name>[^"]+)" is triggered')
def step_trigger_encounter(context, enemy_name):
    post_command("trigger_encounter", {"monster": enemy_name}, context.web_port)
    time.sleep(0.3)

@then(r'a battle begins against "(?P<enemy_name>[^"]+)"')
def step_verify_battle_begins(context, enemy_name):
    deadline = time.time() + 4.0
    btl = {}
    while time.time() < deadline:
        st = get_state(context.web_port)
        btl = st.get("battle", {})
        if btl.get("is_battle") and enemy_name.lower() in str(btl.get("enemy_name", "")).lower():
            return
        time.sleep(0.15)
    raise AssertionError(f"Expected battle against '{enemy_name}', got {btl}")

@when(r'the party fights until the battle is won')
def step_fight_until_won(context):
    port = context.web_port
    for _ in range(30):
        st = get_state(port)
        btl = st.get("battle", {})
        if not btl.get("is_battle"):
            break
        post_input("ui_accept", port)
        time.sleep(0.22)

@then(r'Garland is defeated and Princess Sara is rescued')
def step_verify_garland_defeated(context):
    st = get_state(context.web_port)
    gs = st.get("game_state", {})
    assert gs.get("garland_defeated") is True, f"Expected garland_defeated=True, got {gs}"
    assert gs.get("princess_rescued") is True, f"Expected princess_rescued=True, got {gs}"

# ── Checkpoint Playthrough Steps (Dragon Warrior PlayGameBrain style) ─────────
@given(r'create fresh game')
def step_create_fresh_game(context):
    spawn_game(context, "TitleScreen")

@given(r'the game state is loaded from checkpoint "(?P<ckpt_name>[^"]+)"')
def step_load_from_checkpoint(context, ckpt_name):
    ckpt_dir = os.path.join(PROJECT_DIR, "tests", "e2e", "reports", "playthrough", "checkpoints")
    ckpt_path = os.path.join(ckpt_dir, f"{ckpt_name}.json")
    assert os.path.exists(ckpt_path), f"Checkpoint file not found: {ckpt_path}"
    spawn_game(context, "Coneria")
    post_command("load_save_state", {"path": ckpt_path}, context.web_port)
    time.sleep(0.45)

@when(r'the in-engine AI plays until milestone (?P<m_idx>\d+) "(?P<m_id>[^"]+)"')
def step_ai_plays_until_milestone(context, m_idx, m_id):
    idx = int(m_idx)
    post_command(
        "start_play_game",
        {"time_scale": 4.0, "until_milestone": idx, "start_at_milestone": 0},
        context.web_port
    )
    deadline = time.time() + 120.0
    while time.time() < deadline:
        st = get_state(context.web_port)
        pg = st.get("play_game", {})
        if pg.get("completed") or int(pg.get("current_milestone_index", 1)) > idx:
            time.sleep(0.3)
            return
        time.sleep(0.2)
    raise AssertionError(f"Timed out waiting for PlayGameBrain to finish milestone {idx} ({m_id})")

@then(r'save game state to checkpoint "(?P<ckpt_name>[^"]+)"')
def step_save_to_checkpoint(context, ckpt_name):
    ckpt_dir = os.path.join(PROJECT_DIR, "tests", "e2e", "reports", "playthrough", "checkpoints")
    os.makedirs(ckpt_dir, exist_ok=True)
    ckpt_path = os.path.join(ckpt_dir, f"{ckpt_name}.json")
    post_command("export_save_state", {"path": ckpt_path}, context.web_port)
    assert os.path.exists(ckpt_path), f"Expected checkpoint saved at {ckpt_path}"
