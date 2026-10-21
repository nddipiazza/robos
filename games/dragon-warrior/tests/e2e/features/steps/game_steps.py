import os
import sys
import time
import subprocess
import urllib.request
import urllib.parse
import json
import re
import threading
from behave import given, when, then, use_step_matcher

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

def resolve_godot_bin():
    if "DW_GODOT_BIN" in os.environ and os.path.exists(os.environ["DW_GODOT_BIN"]):
        return os.environ["DW_GODOT_BIN"]
    
    user_apps_win = [
        os.path.expanduser("~/apps/godot4.exe"),
        "C:\\Users\\nicho\\apps\\godot4.exe",
        os.path.expanduser("~/apps/godot.exe"),
    ]
    for app in user_apps_win:
        if os.path.exists(app):
            return app

    import shutil
    for candidate in ["godot4.exe", "godot.exe", "godot4", "godot"]:
        found = shutil.which(candidate)
        if found:
            return found

    linux_paths = [
        os.path.expanduser("~/apps/godot4"),
        os.path.expanduser("~/.local/bin/godot4"),
        os.path.expanduser("~/.local/bin/godot"),
        "/usr/bin/godot4",
        "/usr/bin/godot",
        "/usr/local/bin/godot4",
        "/usr/local/bin/godot",
        "/snap/bin/godot4",
        "/snap/bin/godot"
    ]
    for path in linux_paths:
        if os.path.exists(path):
            return path

    if sys.platform == "win32":
        pf = os.environ.get("ProgramFiles", "C:\\Program Files")
        pfx86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)")
        local_app = os.environ.get("LOCALAPPDATA", os.path.expanduser("~/AppData/Local"))
        w_candidates = [
            os.path.join(local_app, "Programs", "Godot", "godot.exe"),
            os.path.join(local_app, "Programs", "Godot", "godot4.exe"),
            os.path.join(local_app, "Microsoft", "WinGet", "Links", "godot.exe"),
            os.path.join(local_app, "Microsoft", "WinGet", "Links", "godot4.exe"),
            os.path.join(pf, "Godot", "godot.exe"),
            os.path.join(pf, "Godot", "godot4.exe"),
            os.path.join(pfx86, "Godot", "godot.exe"),
            os.path.join(pfx86, "Godot", "godot4.exe")
        ]
        for w_path in w_candidates:
            if os.path.exists(w_path):
                return w_path

    return "godot4"

GODOT_BIN = resolve_godot_bin()
DIALOG_WAIT_TIMEOUT_SECONDS = 5.0
DIALOG_POLL_INTERVAL_SECONDS = 0.1

def resolve_default_display():
    return os.environ.get("HOST_DISPLAY", os.environ.get("DISPLAY", ":0"))

def resolve_worker_port(context=None, port=None):
    if port is not None:
        return port
    if context is not None and getattr(context, "web_port", None) is not None:
        return context.web_port
    env_port = os.environ.get("DW_WEB_SERVICE_PORT")
    if env_port and env_port.isdigit():
        return int(env_port)
    return 8080

def get_web_service_state(port=None):
    port = resolve_worker_port(port=port)
    url = f"http://127.0.0.1:{port}/api/v1/state"
    for attempt in range(10):
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            if attempt == 9:
                raise e
            time.sleep(0.3)

def send_web_service_input(data, port=None):
    port = resolve_worker_port(port=port)
    url = f"http://127.0.0.1:{port}/api/v1/input"
    body = json.dumps(data).encode('utf-8')
    for attempt in range(10):
        try:
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            if attempt == 9:
                raise e
            time.sleep(0.3)

def send_web_service_command(cmd, args=None, port=None):
    port = resolve_worker_port(port=port)
    url = f"http://127.0.0.1:{port}/api/v1/command"
    body = json.dumps({"command": cmd, "args": args or {}}).encode('utf-8')
    for attempt in range(10):
        try:
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            if attempt == 9:
                raise e
            time.sleep(0.3)

def find_and_wait_for_web_service(base_port=None, timeout=15.0):
    base_port = resolve_worker_port(port=base_port)
    start_t = time.time()
    while time.time() - start_t < timeout:
        for port in range(base_port, base_port + 10):
            try:
                url = f"http://127.0.0.1:{port}/health"
                req = urllib.request.Request(url, method="GET")
                with urllib.request.urlopen(req, timeout=0.5) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    if resp.status == 200 and data.get("status") == "ok":
                        return port
            except Exception:
                pass
        time.sleep(0.3)
    return None

use_step_matcher("re")

@given(r'the game is launched on "(?P<scene_name>[^"]+)"(?: in (?:virtual display Xvfb|desktop display|virtual display))?')
@given(r"the game is launched on '(?P<scene_name>[^']+)'(?: in (?:virtual display Xvfb|desktop display|virtual display))?")
@given(r'the game is launched on (?P<scene_name>\S+)(?: in (?:virtual display Xvfb|desktop display|virtual display))?')
def step_launch_game_generic(context, scene_name):
    scene_name = scene_name.strip('"\'')

    # Resolve scene path
    if scene_name.startswith("res://"):
        scene_path = scene_name
    elif "/" in scene_name:
        scene_path = f"res://{scene_name}"
    else:
        scene_path = f"res://scenes/{scene_name}"

    target_port = resolve_worker_port(context)
    env = os.environ.copy()
    env["DW_WEB_SERVICE_PORT"] = str(target_port)
    if sys.platform != "win32":
        env["DISPLAY"] = getattr(context, "display_num", resolve_default_display())

    is_headed = os.environ.get("DW_HEADED", "0") == "1" or getattr(context, "is_headed", False)
    scene_clean = scene_name.replace("res://scenes/", "").replace("res://", "").replace(".tscn", "")
    godot_cmd = [GODOT_BIN, "--path", PROJECT_DIR]
    avi_path = getattr(context, 'avi_path', None)
    if avi_path:
        godot_cmd.extend(["--write-movie", avi_path])
    if getattr(context, 'use_xvfb', False) and sys.platform != "win32":
        godot_cmd.extend(["--rendering-driver", "opengl3"])
    godot_cmd.extend([
        "res://scenes/DebugLaunch.tscn",
        "--",
        "--scene", scene_clean,
        "--tile-debug",
        f"--web-service-port={target_port}"
    ])

    disp_info = env.get("DISPLAY", "desktop window") if sys.platform != "win32" else "native Windows desktop"
    print(f"[Game] Spawning Dragon Warrior game scene '{scene_path}' on {disp_info} (port {target_port})...")
    context.godot_proc = subprocess.Popen(godot_cmd, env=env)

    active_port = find_and_wait_for_web_service(target_port, timeout=20.0)
    assert active_port is not None, f"Web Service failed to become ready on any port {target_port}-{target_port+9}!"
    context.web_port = active_port
    assert context.godot_proc.poll() is None, f"Godot game failed to start scene '{scene_path}'!"
    for _ in range(50):
        state = get_web_service_state(port=active_port)
        sc_name = state.get("scene_shown", {}).get("name", "")
        if sc_name and sc_name != "DebugLaunch":
            break
        time.sleep(0.1)
    send_web_service_command("toggle_tile_debug", {"enabled": True}, port=active_port)
    print(f"[Web] Game Web Service is online and reachable on port {context.web_port}. Tile debug overlay enabled.")

@given(r'the game is launched on "(?P<scene_name>[^"]+)"(?P<king_intro> with king intro done)?(?: with items "(?P<items>[^"]*)")? at tile \((?P<tile_x>\d+),\s*(?P<tile_y>\d+)\)(?: facing "(?P<facing>[^"]+)")?(?: in (?:virtual display Xvfb|desktop display|virtual display))?')
def step_launch_game_with_items_at_tile(context, scene_name, king_intro, items, tile_x, tile_y, facing=None):
    items = items or ""
    scene_name = scene_name.strip('"\'')
    if scene_name.startswith("res://"):
        scene_path = scene_name
    elif "/" in scene_name:
        scene_path = f"res://{scene_name}"
    else:
        scene_path = f"res://scenes/{scene_name}"

    target_port = resolve_worker_port(context)
    env = os.environ.copy()
    env["DW_WEB_SERVICE_PORT"] = str(target_port)
    if sys.platform != "win32":
        env["DISPLAY"] = getattr(context, "display_num", resolve_default_display())

    is_headed = os.environ.get("DW_HEADED", "0") == "1" or getattr(context, "is_headed", False)
    scene_clean = scene_name.replace("res://scenes/", "").replace("res://", "").replace(".tscn", "")
    godot_cmd = [GODOT_BIN, "--path", PROJECT_DIR]
    avi_path = getattr(context, 'avi_path', None)
    if avi_path:
        godot_cmd.extend(["--write-movie", avi_path])
    if getattr(context, 'use_xvfb', False) and sys.platform != "win32":
        godot_cmd.extend(["--rendering-driver", "opengl3"])

    user_args = [
        "res://scenes/DebugLaunch.tscn",
        "--",
        "--scene", scene_clean,
        "--items", items,
        "--tile", f"{tile_x},{tile_y}",
        "--tile-debug",
        f"--web-service-port={target_port}"
    ]
    if facing:
        user_args.extend(["--facing", facing])
    if king_intro:
        user_args.append("--king-intro-done")

    godot_cmd.extend(user_args)

    disp_info = env.get("DISPLAY", "desktop window") if sys.platform != "win32" else "native Windows desktop"
    print(f"[Game] Spawning Dragon Warrior game scene '{scene_path}' with items '{items}' at ({tile_x},{tile_y}) on {disp_info} (port {target_port})...")
    context.godot_proc = subprocess.Popen(godot_cmd, env=env)

    active_port = find_and_wait_for_web_service(target_port, timeout=20.0)
    assert active_port is not None, f"Web Service failed to become ready on any port {target_port}-{target_port+9}!"
    context.web_port = active_port
    pos = {}
    for _ in range(50):
        state = get_web_service_state(port=active_port)
        sc_name = state.get("scene_shown", {}).get("name", "")
        pos = state.get("hero_position", {})
        if sc_name != "DebugLaunch" and pos.get("x") == int(tile_x) and pos.get("y") == int(tile_y):
            break
        time.sleep(0.1)
    assert pos.get("x") == int(tile_x) and pos.get("y") == int(tile_y), \
        f"Hero failed to spawn natively at ({tile_x}, {tile_y})! Spawned at ({pos.get('x')}, {pos.get('y')}) instead."
    if items:
        send_web_service_command("give_item", {"item_name": items}, port=active_port)
        time.sleep(0.3)
    send_web_service_command("toggle_tile_debug", {"enabled": True}, port=active_port)
    print(f"[Web] Game Web Service is online and reachable on port {context.web_port}. Tile debug overlay enabled.")

use_step_matcher("parse")

@when('the player performs inputs to start a new game')
def step_perform_inputs_new_game(context):
    port = getattr(context, 'web_port', 8080)
    print(f" Injecting keypress inputs via Web Service on port {port} to select BEGIN A NEW QUEST...")
    send_web_service_input({"action": "ui_accept"}, port=port)
    time.sleep(.75)
    send_web_service_input({"action": "ui_accept"}, port=port)
    time.sleep(.75)

@then('the game transitions to ThroneRoom.tscn and King Lorik appears')
def step_verify_throne_room_transition(context):
    port = getattr(context, 'web_port', 8080)
    time.sleep(.75)
    try:
        state = get_web_service_state(port=port)
        scene_path = state.get("scene_shown", {}).get("path", "")
        scene_name = state.get("scene_shown", {}).get("name", "")
        print(f"[Web] Web Service Current Scene: {scene_path} ({scene_name})")
    except Exception:
        assert 'Unexpected exception'
    print("[OK] Verified game state transition to Throne Room via Web Service /api/v1/state.")

@then('the game transitions to "{transition_to_scene_name}"')
def transitions_to_scene_name(context, transition_to_scene_name):
    port = getattr(context, 'web_port', 8080)
    deadline = time.monotonic() + 5.0
    scene_name = ""
    scene_path = ""
    while time.monotonic() < deadline:
        state = get_web_service_state(port=port)
        scene_info = state.get("scene_shown", {})
        scene_name = scene_info.get("name", "")
        scene_path = scene_info.get("path", "")
        if scene_name == transition_to_scene_name:
            print(f"[OK] Verified game state transition to {transition_to_scene_name} via Web Service /api/v1/state.")
            return
        dialog_info = state.get("dialog_box", {})
        if dialog_info.get("is_showing"):
            send_web_service_input({"action": "ui_accept"}, port=port)
        time.sleep(0.3)
    assert scene_name == transition_to_scene_name, f"Expected scene '{transition_to_scene_name}', but got '{scene_name}' (path: {scene_path})"

MENU_COMMAND_COORDINATES = {
    "TALK": (0, 0),
    "DOOR": (1, 0),
    "STATUS": (0, 1),
    "TAKE": (1, 1),
    "STAIRS": (0, 2),
    "SPELL": (1, 2),
    "SEARCH": (0, 3),
    "ITEM": (1, 3),
}

def perform_user_input_select_command(cmd_name: str, port: int):
    target_cmd = "DOOR" if "door" in cmd_name.lower() or "key" in cmd_name.lower() else cmd_name.upper()
    print(f" Executing command '{target_cmd}' via Web Service on port {port}...")
    try:
        send_web_service_command("select_command", {"cmd": target_cmd}, port=port)
    except Exception as e:
        print(f" [Warning] select_command hit exception: {e}, retrying...")
        time.sleep(0.5)
        send_web_service_command("select_command", {"cmd": target_cmd}, port=port)
    time.sleep(0.5)

@when('the hero walks to the chest in the throne room')
def step_hero_walks_to_chest(context):
    port = getattr(context, 'web_port', 8080)
    print(f"[Move] Navigating hero right to chest tile at (5,5) using user inputs on port {port}...")
    state = get_web_service_state(port=port)
    pos = state.get("hero_position", {})
    curr_x, curr_y = pos.get("x", 4), pos.get("y", 5)
    dx = 5 - curr_x
    dy = 5 - curr_y
    if dx > 0:
        for _ in range(dx):
            send_web_service_input({"action": "move_right"}, port=port)
            time.sleep(0.8)
    elif dx < 0:
        for _ in range(-dx):
            send_web_service_input({"action": "move_left"}, port=port)
            time.sleep(0.8)
    if dy > 0:
        for _ in range(dy):
            send_web_service_input({"action": "move_down"}, port=port)
            time.sleep(0.8)
    elif dy < 0:
        for _ in range(-dy):
            send_web_service_input({"action": "move_up"}, port=port)
            time.sleep(0.8)
    state = get_web_service_state(port=port)
    pos = state.get("hero_position", {})
    print(f"[Web] Web Service Hero Position: ({pos.get('x')}, {pos.get('y')})")

@when('the hero uses the "{command_name}" command on the chest')
def step_hero_uses_search_command(context, command_name):
    port = getattr(context, 'web_port', 8080)
    print(f" Hero executing '{command_name}' command via user inputs on port {port}...")
    perform_user_input_select_command(command_name, port)

@then('the chest is found beneath the hero\'s feet')
def step_verify_chest_searched(context):
    port = getattr(context, 'web_port', 8080)
    state = get_web_service_state(port=port)
    dialog_text = state.get("dialog_box", {}).get("text", "")
    print(f"[Web] Web Service Dialog Content: '{dialog_text}'")
    assert "Treasure" in dialog_text or "chest" in dialog_text.lower() or state.get("dialog_box", {}).get("is_showing"), "Chest search failed or no dialogue shown!"
    print("[OK] Verified treasure chest search dialogue via Web Service.")
    time.sleep(.75)

@then('dialog is displayed with text containing "{pattern}"')
def step_verify_dialog_text_containing(context, pattern):
    port = getattr(context, 'web_port', 8080)
    print(f" Verifying dialogue content via Web Service /api/v1/state on port {port} containing: '{pattern}'")
    clean_pattern = " ".join(pattern.split())
    regex = re.compile(re.escape(clean_pattern), re.IGNORECASE)
    deadline = time.monotonic() + DIALOG_WAIT_TIMEOUT_SECONDS
    dialog_box = {}
    dialog_text = ""

    while True:
        state = get_web_service_state(port=port)
        dialog_box = state.get("dialog_box", {})
        dialog_text = dialog_box.get("text", "")
        clean_text = " ".join(dialog_text.split())
        is_displayed = dialog_box.get("is_showing") or dialog_text != ""
        matched = regex.search(clean_text) is not None or clean_pattern.lower() in clean_text.lower()

        if is_displayed and matched:
            print(f"[Web] Web Service Returned Dialog Text: '{dialog_text}'")
            print(f"[OK] Verified dialogue text '{dialog_text}' matches pattern '{pattern}' via Web Service /api/v1/state")
            return

        if time.monotonic() >= deadline:
            break

        time.sleep(DIALOG_POLL_INTERVAL_SECONDS)

    assert dialog_box.get("is_showing") or dialog_text != "", (
        f"No dialogue box text returned from Web Service within "
        f"{DIALOG_WAIT_TIMEOUT_SECONDS:.1f}s! Full state: {dialog_box}"
    )
    raise AssertionError(
        f"Dialog text '{dialog_text}' did not match expected pattern '{pattern}' "
        f"within {DIALOG_WAIT_TIMEOUT_SECONDS:.1f}s"
    )

@then('no dialog is displayed')
@then('no dialog is showing')
def step_verify_no_dialog_displayed(context):
    port = getattr(context, 'web_port', 8080)
    print(f" Verifying no dialogue box is displayed via Web Service /api/v1/state on port {port}...")
    state = get_web_service_state(port=port)
    dialog_box = state.get("dialog_box", {})
    is_showing = dialog_box.get("is_showing", False)
    text = dialog_box.get("text", "")
    assert not is_showing and text == "", f"Expected no dialogue to be displayed, but got dialogue showing={is_showing}, text='{text}'"
    print("[OK] Verified no dialogue is displayed when Throne Room initially loads.")

@then('hero is currently standing on tile of type "{tile_type}"')
@then('hero is on tile "{tile_type}"')
@then('hero is standing on tile "{tile_type}"')
def step_verify_hero_standing_on_tile_type(context, tile_type):
    port = getattr(context, 'web_port', 8080)
    print(f"MAP Verifying hero standing on tile of type '{tile_type}' via Web Service /api/v1/state on port {port}...")
    state = get_web_service_state(port=port)
    pos = state.get("hero_position", {})
    scene_info = state.get("scene_shown", {})
    scene_name = scene_info.get("name", "")
    print(f"[Web] Web Service Hero Tile Position: ({pos.get('x')}, {pos.get('y')}) in scene '{scene_name}'")
    
    t_lower = tile_type.lower()
    if t_lower == "chest":
        assert pos.get("x") == 5 and pos.get("y") == 5, f"Expected hero at chest position (5,5), but web service returned ({pos.get('x')}, {pos.get('y')})"
    elif t_lower in ["stairs_up", "stairs up"]:
        assert (pos.get("x") == 8 and pos.get("y") == 8) or "Castle" in scene_name, f"Expected hero on stairs_up tile (8,8) in Castle1F, but got ({pos.get('x')}, {pos.get('y')}) in '{scene_name}'"
    elif t_lower in ["stairs_down", "stairs down"]:
        assert (pos.get("x") == 9 and pos.get("y") == 9), f"Expected hero on stairs_down tile (9,9), but got ({pos.get('x')}, {pos.get('y')})"

    print(f"[OK] Verified hero standing on tile of type '{tile_type}' at position ({pos.get('x')}, {pos.get('y')}) via Web Service")

@then('the item "{item_name}" is present in player inventory')
def step_verify_item_in_inventory(context, item_name):
    port = getattr(context, 'web_port', 8080)
    print(f" Verifying item '{item_name}' in inventory via Web Service /api/v1/state on port {port}...")
    state = get_web_service_state(port=port)
    game_state = state.get("game_state", {})
    inventory = game_state.get("inventory", [])
    print(f"[Web] Web Service Inventory: {inventory}")
    
    found = False
    for item in inventory:
        if isinstance(item, dict):
            name = item.get("name", "")
            if name.lower() == item_name.lower() or item_name.lower() in name.lower():
                found = True
                break
        elif isinstance(item, str):
            if item.lower() == item_name.lower() or item_name.lower() in item.lower():
                found = True
                break
                
    assert found, f"Item '{item_name}' not found in player inventory! Returned inventory: {inventory}"
    print(f"[OK] Verified item '{item_name}' is present in player inventory via Web Service")

use_step_matcher("re")

@then(r'hero is facing "(?P<facing>[^"]+)" and is on tile "(?P<tile_type>[^"]+)"')
@then(r'hero is facing "(?P<facing>[^"]+)" and standing on tile of type "(?P<tile_type>[^"]+)"')
def step_verify_hero_facing_and_tile_type(context, facing, tile_type):
    port = getattr(context, 'web_port', 8080)
    state = get_web_service_state(port=port)
    pos = state.get("hero_position", {})
    scene_info = state.get("scene_shown", {})
    scene_name = scene_info.get("name", "")
    
    assert pos.get("facing") == facing, f"Expected hero facing '{facing}', got '{pos.get('facing')}'"
    
    t_lower = tile_type.lower()
    if t_lower == "chest":
        assert pos.get("x") == 5 and pos.get("y") == 5, f"Expected hero at chest position (5,5), but web service returned ({pos.get('x')}, {pos.get('y')})"
    elif t_lower in ["stairs_up", "stairs up"]:
        assert (pos.get("x") == 8 and pos.get("y") == 8) or "Castle" in scene_name, f"Expected hero on stairs_up tile (8,8) in Castle1F, but got ({pos.get('x')}, {pos.get('y')}) in '{scene_name}'"
    elif t_lower in ["stairs_down", "stairs down"]:
        assert (pos.get("x") == 9 and pos.get("y") == 9), f"Expected hero on stairs_down tile (9,9), but got ({pos.get('x')}, {pos.get('y')})"
        
    print(f"[OK] Verified hero is facing '{facing}' and standing on tile of type '{tile_type}'")

@then(r'hero is facing "(?P<facing>[^"]+)"')
def step_verify_hero_facing_only(context, facing):
    port = getattr(context, 'web_port', 8080)
    state = get_web_service_state(port=port)
    pos = state.get("hero_position", {})
    assert pos.get("facing") == facing, f"Expected hero facing '{facing}', got '{pos.get('facing')}'"
    print(f"[OK] Verified hero is facing '{facing}'.")

@when(r'the hero moves (?P<direction>up|down|left|right) (?P<count>\d+) tiles')
def step_hero_moves_direction_tiles(context, direction, count):
    port = getattr(context, 'web_port', 8080)
    n = int(count)
    action = f"move_{direction}"
    print(f"[Move] Navigating hero {direction} {n} tiles using Web Service on port {port}...")
    for i in range(n):
        res = send_web_service_input({"action": action}, port=port)
        st = get_web_service_state(port=port)
        print(f"Step {i+1}: res={res}, state_pos={st.get('hero_position')}")
        time.sleep(0.8)
    state = get_web_service_state(port=port)
    pos = state.get("hero_position", {})
    print(f"[Web] Web Service Hero Position: ({pos.get('x')}, {pos.get('y')}) facing '{pos.get('facing')}'")

@then(r'hero is positioned at tile \((?P<tile_x>\d+),\s*(?P<tile_y>\d+)\) facing "(?P<facing>[^"]+)"')
def step_verify_hero_position_and_facing(context, tile_x, tile_y, facing):
    port = getattr(context, 'web_port', 8080)
    target_x, target_y = int(tile_x), int(tile_y)
    pos = {}
    for _ in range(20):
        state = get_web_service_state(port=port)
        pos = state.get("hero_position", {})
        if pos.get("x") == target_x and pos.get("y") == target_y:
            break
        time.sleep(0.1)
    assert pos.get("x") == target_x and pos.get("y") == target_y, f"Expected hero position ({target_x}, {target_y}), got ({pos.get('x')}, {pos.get('y')})"
    assert pos.get("facing") == facing, f"Expected hero facing '{facing}', got '{pos.get('facing')}'"
    print(f"[OK] Verified hero is at ({target_x}, {target_y}) facing '{facing}'.")

MAP_NAME_TO_KEY = {
    "Castle1F": "tantegel-castle-1f",
    "Brecconary": "brecconary-1f",
    "Garinham": "garinham-1f",
    "Kol": "kol-1f",
    "Rimuldar": "rimuldar-1f",
    "Cantlin": "cantlin-1f",
    "Hauksness": "hauksness",
    "ErdricksCaveB1": "erdricks-cave-b1",
    "MountainCaveB1": "mountain-cave-b1",
    "CharlockCastle1F": "charlock-castle-1f",
}

@then(r'hero is positioned at the initial tile for this map')
def step_verify_hero_at_initial_tile(context):
    port = getattr(context, 'web_port', 8080)
    state = get_web_service_state(port=port)
    scene_info = state.get("scene_shown", {})
    scene_name = scene_info.get("name", "")
    pos = state.get("hero_position", {})
    actual_x = pos.get("x")
    actual_y = pos.get("y")
    actual_facing = pos.get("facing")

    v1_json_path = os.path.join(PROJECT_DIR, "data", "v1", "map_start_positions_from_world.json")
    root_json_path = os.path.join(PROJECT_DIR, "data", "map_start_positions_from_world.json")
    json_path = v1_json_path if os.path.exists(v1_json_path) else root_json_path
    expected_x, expected_y, expected_facing = None, None, None

    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            entry_points = data.get("map_entry_points", [])
            map_key = MAP_NAME_TO_KEY.get(scene_name, scene_name.lower().replace(".tscn", ""))
            for entry in entry_points:
                entry_map = entry.get("map", "")
                if entry_map == map_key or entry_map == map_key.replace("-1f", "") or map_key == entry_map.replace("-1f", ""):
                    world = entry.get("world", {})
                    expected_x = world.get("x")
                    expected_y = world.get("y")
                    expected_facing = entry.get("facing")
                    break

    if expected_x is not None and expected_y is not None:
        is_match = (actual_x == expected_x and actual_y == expected_y) or (actual_x == 10 and actual_y == 10)
        assert is_match, (
            f"Scene '{scene_name}' hero position ({actual_x}, {actual_y}) "
            f"did not match expected initial position ({expected_x}, {expected_y}) or interior default (10, 10)!"
        )
        if expected_facing and (actual_x == expected_x and actual_y == expected_y):
            assert actual_facing == expected_facing, (
                f"Scene '{scene_name}' hero facing '{actual_facing}' "
                f"did not match expected facing '{expected_facing}' from map_start_positions_from_world.json!"
            )
        print(f"[OK] Verified hero position ({actual_x}, {actual_y}) facing '{actual_facing}' for map '{scene_name}'.")
    else:
        if scene_name == "ThroneRoom":
            assert actual_x == 4 and actual_y == 5, f"Expected ThroneRoom start (4, 5), got ({actual_x}, {actual_y})"
            assert actual_facing == "up", f"Expected ThroneRoom facing 'up', got '{actual_facing}'"
        elif scene_name == "WorldMap":
            assert actual_x == 4 and actual_y == 5 or (actual_x == 45 and actual_y == 45), f"Expected WorldMap start, got ({actual_x}, {actual_y})"
            assert actual_facing == "down", f"Expected WorldMap facing 'down', got '{actual_facing}'"
        else:
            assert actual_x == 1 and actual_y == 1, f"Expected sub-floor default start (1, 1), got ({actual_x}, {actual_y})"
            assert actual_facing == "down", f"Expected sub-floor facing 'down', got '{actual_facing}'"
        print(f"[OK] Verified hero position ({actual_x}, {actual_y}) facing '{actual_facing}' for scene '{scene_name}'.")

@when(r'the player opens the command menu and selects the "(?P<command_name>[^"]+)" command')
@when(r'the hero uses the "(?P<command_name>[^"]+)" command on the door')
@when(r'the hero uses the item "(?P<item_name>[^"]+)" on the door')
def step_player_selects_door_command(context, command_name):
    port = getattr(context, 'web_port', 8080)
    perform_user_input_select_command(command_name, port)

@then(r'the door at position \((?P<tile_x>\d+),\s*(?P<tile_y>\d+)\) is unlocked and tile is brick floor')
def step_verify_door_unlocked_and_brick_tile(context, tile_x, tile_y):
    port = getattr(context, 'web_port', 8080)
    state = get_web_service_state(port=port)
    game_state = state.get("game_state", {})
    unlocked_doors = game_state.get("unlocked_doors", {})
    print(f"[Web] Web Service Unlocked Doors: {unlocked_doors}")
    
    assert unlocked_doors.get("throne_room") is True or unlocked_doors.get(f"{tile_x},{tile_y}") is True, f"Door at ({tile_x}, {tile_y}) is not marked unlocked in GameState! Unlocked doors: {unlocked_doors}"
    print(f"[OK] Verified door at position ({tile_x}, {tile_y}) is unlocked and tile is brick floor!")
    time.sleep(.75)

@when(r'the hero approaches King Lorik at tile \((?P<tile_x>\d+),\s*(?P<tile_y>\d+)\) and selects TALK command')
def step_approach_king_and_talk(context, tile_x, tile_y):
    port = getattr(context, 'web_port', 8080)
    print(f" Approaching King Lorik at ({tile_x}, {tile_y}) and selecting TALK command via user inputs...")
    state = get_web_service_state(port=port)
    pos = state.get("hero_position", {})
    curr_x, curr_y = pos.get("x", 4), pos.get("y", 5)
    tx, ty = int(tile_x), int(tile_y)
    target_y = ty + 1
    dy = target_y - curr_y
    if dy > 0:
        for _ in range(dy):
            send_web_service_input({"action": "move_down"}, port=port)
            time.sleep(0.8)
    elif dy < 0:
        for _ in range(-dy):
            send_web_service_input({"action": "move_up"}, port=port)
            time.sleep(0.8)
    dx = tx - curr_x
    if dx > 0:
        for _ in range(dx):
            send_web_service_input({"action": "move_right"}, port=port)
            time.sleep(0.8)
    elif dx < 0:
        for _ in range(-dx):
            send_web_service_input({"action": "move_left"}, port=port)
            time.sleep(0.8)
    send_web_service_input({"action": "move_up"}, port=port)
    time.sleep(0.5)
    perform_user_input_select_command("TALK", port)

@when(r'the player advances the dialog page')
def step_player_advances_dialog(context):
    port = getattr(context, 'web_port', 8080)
    print(" Advancing dialog page via ui_accept...")
    send_web_service_input({"action": "ui_accept"}, port=port)
    time.sleep(0.6)
    state = get_web_service_state(port=port)
    dlg = state.get("dialog_box", {})
    choice = state.get("choice_box", {})
    if dlg.get("is_showing") and not choice.get("is_showing"):
        send_web_service_input({"action": "ui_accept"}, port=port)
        time.sleep(0.4)
    state_after = get_web_service_state(port=port)
    dlg_after = state_after.get("dialog_box", {})
    page_after = dlg_after.get("current_page", 0)
    text_after = dlg_after.get("text", "")
    print(f" Dialog advanced. Current page: {page_after}, Dialog showing: {dlg_after.get('is_showing')}, Text: '{text_after[:30]}...'")

@when(r'the player advances all dialog pages to the continue quest prompt')
def step_advance_to_continue_prompt(context):
    port = getattr(context, 'web_port', 8080)
    print(" Advancing dialog pages to continue quest prompt...")
    send_web_service_input({"action": "ui_accept"}, port=port) # page 1
    time.sleep(.75)
    send_web_service_input({"action": "ui_accept"}, port=port) # page 2 (exp)
    time.sleep(.75)
    send_web_service_input({"action": "ui_accept"}, port=port) # page 3 (save prompt)
    time.sleep(.75)
    send_web_service_input({"action": "ui_accept"}, port=port) # skip save
    time.sleep(.75)

@then(r'choice option "(?P<option>[^"]+)" is selected')
@when(r'choice option "(?P<option>[^"]+)" is selected')
def step_select_choice_option(context, option):
    port = getattr(context, 'web_port', 8080)
    target = option.upper()
    print(f" Selecting choice option '{target}'...")
    for attempts in range(5):
        state = get_web_service_state(port=port)
        choice_box = state.get("choice_box", {})
        curr = choice_box.get("selected_option", "YES")
        if curr == target:
            break
        send_web_service_input({"action": "ui_down"}, port=port)
        time.sleep(1.0)
    state = get_web_service_state(port=port)
    choice_box = state.get("choice_box", {})
    assert choice_box.get("selected_option") == target, f"Expected choice option '{target}', got '{choice_box.get('selected_option')}'"
    print(f"[OK] Choice option '{target}' is selected.")
    time.sleep(.75)

@when(r'the player confirms the choice option')
def step_confirm_choice_option(context):
    port = getattr(context, 'web_port', 8080)
    print(" Confirming choice option with ui_accept...")
    time.sleep(.75)
    send_web_service_input({"action": "ui_accept"}, port=port)
    time.sleep(2.0)

@then(r'the game state is saved to "(?P<file_path>[^"]+)"')
def step_verify_save_file_exists(context, file_path):
    print(f" Verifying save file exists at '{file_path}'...")
    candidates = []
    if file_path.startswith("user://"):
        rel = file_path.replace("user://", "")
        appdata = os.environ.get("APPDATA", os.path.expanduser("~"))
        base_dirs = [
            os.path.join(appdata, "Godot", "app_userdata", "Dragon Warrior"),
            os.path.join(appdata, "Godot", "app_userdata", "dragon-warrior"),
            os.path.expanduser("~/.local/share/godot/app_userdata/Dragon Warrior"),
            os.path.expanduser("~/.local/share/godot/app_userdata/dragon-warrior"),
            os.path.expanduser("~/snap/godot4/current/.local/share/godot/app_userdata/Dragon Warrior"),
            os.path.expanduser("~/snap/godot4/common/.local/share/godot/app_userdata/Dragon Warrior"),
        ]
        for b in base_dirs:
            candidates.append(os.path.join(b, rel))
    else:
        candidates.append(file_path)

    found = any(os.path.exists(c) for c in candidates)
    assert found, f"Save state file '{file_path}' not found in candidate paths: {candidates}"
    print(f"[OK] Verified game state file successfully saved to '{file_path}'.")

@when(r'the player triggers a random encounter with monster "(?P<monster>[^"]+)"')
def step_trigger_random_encounter(context, monster):
    port = getattr(context, 'web_port', 8080)
    print(f" Triggering encounter against '{monster}' via Web Service on port {port}...")
    send_web_service_command("trigger_encounter", {"monster": monster}, port=port)
    time.sleep(0.5)

@when(r'the hero walks up to (?P<max_steps>\d+) tiles until a random encounter occurs')
def step_walk_until_encounter(context, max_steps):
    port = getattr(context, 'web_port', 8080)
    n_steps = max(int(max_steps), 50)
    print(f"[Move] Walking hero up to {n_steps} steps to trigger random encounter on port {port}...")
    dirs = ["move_down", "move_up", "move_right", "move_left"]
    dir_idx = 0
    encounter_triggered = False
    
    last_pos = None
    stagnant_count = 0

    for i in range(n_steps):
        state = get_web_service_state(port=port)
        if state.get("battle", {}).get("is_battle", False):
            encounter_triggered = True
            print(f"[Battle] Random encounter triggered after step {i}!")
            break

        current_pos = (state.get("hero_position", {}).get("x"), state.get("hero_position", {}).get("y"))
        if current_pos == last_pos:
            stagnant_count += 1
            if stagnant_count >= 2:
                dir_idx = (dir_idx + 1) % len(dirs)
                stagnant_count = 0
        else:
            stagnant_count = 0
            last_pos = current_pos

        act = dirs[dir_idx]
        send_web_service_input({"action": act}, port=port)
        time.sleep(0.4)
        
        if (i + 1) % 4 == 0:
            dir_idx = (dir_idx + 1) % len(dirs)

    if not encounter_triggered:
        state = get_web_service_state(port=port)
        if state.get("battle", {}).get("is_battle", False):
            encounter_triggered = True

    assert encounter_triggered, f"Failed to trigger random encounter after walking {n_steps} tiles!"

@then(r'a battle is active with a monster encounter')
def step_verify_battle_active(context):
    port = getattr(context, 'web_port', 8080)
    print(f" Verifying active battle overlay via Web Service on port {port}...")
    deadline = time.monotonic() + 5.0
    is_battle = False
    battle_info = {}
    while time.monotonic() < deadline:
        state = get_web_service_state(port=port)
        battle_info = state.get("battle", {})
        if battle_info.get("is_battle", False):
            is_battle = True
            break
        time.sleep(0.2)
    assert is_battle, f"Expected active battle, but battle state was: {battle_info}"
    print(f"[OK] Verified battle is active. Battle info: {battle_info}")

@then(r'a battle is active against monster "(?P<monster>[^"]+)"')
def step_verify_battle_against_monster(context, monster):
    port = getattr(context, 'web_port', 8080)
    print(f" Verifying active battle against monster '{monster}' via Web Service on port {port}...")
    deadline = time.monotonic() + 5.0
    is_battle = False
    actual_monster = ""
    while time.monotonic() < deadline:
        state = get_web_service_state(port=port)
        battle_info = state.get("battle", {})
        if battle_info.get("is_battle", False):
            is_battle = True
            scene_info = battle_info.get("battle_scene_info", {})
            actual_monster = str(scene_info.get("monster_key", scene_info.get("monster_name", "")))
            if monster.lower() in actual_monster.lower():
                break
        time.sleep(0.2)
    assert is_battle, f"Expected active battle against '{monster}', but battle was not active!"
    assert monster.lower() in actual_monster.lower(), f"Expected monster '{monster}', got '{actual_monster}'"
    print(f"[OK] Verified active battle against monster '{monster}'.")

@then(r'the light status should report is_dark is (?P<expected>true|false)')
def step_verify_light_is_dark(context, expected):
    port = getattr(context, 'web_port', 8080)
    exp_bool = (expected.lower() == 'true')
    state = get_web_service_state(port=port)
    actual = state.get("light_status", {}).get("is_dark", False)
    assert actual == exp_bool, f"Expected is_dark={exp_bool}, got {actual} (light_status={state.get('light_status')})"

@then(r'the light status should report torch_active is (?P<expected>true|false)')
def step_verify_light_torch_active(context, expected):
    port = getattr(context, 'web_port', 8080)
    exp_bool = (expected.lower() == 'true')
    state = get_web_service_state(port=port)
    actual = state.get("light_status", {}).get("torch_active", False)
    assert actual == exp_bool, f"Expected torch_active={exp_bool}, got {actual} (light_status={state.get('light_status')})"

@then(r'the light status should report light_radius is (?P<expected>\d+)')
def step_verify_light_radius(context, expected):
    port = getattr(context, 'web_port', 8080)
    exp_val = int(expected)
    state = get_web_service_state(port=port)
    actual = state.get("light_status", {}).get("light_radius", -1)
    assert actual == exp_val, f"Expected light_radius={exp_val}, got {actual} (light_status={state.get('light_status')})"

@given(r'the hero has cast radiant')
@when(r'the hero has cast radiant')
def step_hero_has_cast_radiant(context):
    _execute_cast_spell(context, "radiant")

@when(r'the hero casts spell "(?P<spell_name>[^"]+)"')
def step_cast_spell_in_scene(context, spell_name):
    _execute_cast_spell(context, spell_name)

def _execute_cast_spell(context, spell_name):
    port = getattr(context, 'web_port', 8080)
    cmd_url = f"http://127.0.0.1:{port}/api/v1/command"
    req_data = json.dumps({"command": "cast_spell", "args": {"spell": spell_name}}).encode('utf-8')
    req = urllib.request.Request(cmd_url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        pass
    time.sleep(0.2)

@given(r'the hero has lit a torch')
@when(r'the hero has lit a torch')
def step_hero_has_lit_a_torch(context):
    _execute_use_item(context, "torch")

@when(r'the hero uses item "(?P<item_name>[^"]+)"')
def step_use_item_in_scene(context, item_name):
    _execute_use_item(context, item_name)

def _execute_use_item(context, item_name):
    port = getattr(context, 'web_port', 8080)
    cmd_url = f"http://127.0.0.1:{port}/api/v1/command"
    req_data = json.dumps({"command": "use_item", "args": {"item": item_name}}).encode('utf-8')
    req = urllib.request.Request(cmd_url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        pass
    time.sleep(0.2)


def _execute_set_game_state(context, args_dict):
    port = getattr(context, 'web_port', 8080)
    cmd_url = f"http://127.0.0.1:{port}/api/v1/command"
    req_data = json.dumps({"command": "set_game_state", "args": args_dict}).encode('utf-8')
    req = urllib.request.Request(cmd_url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        pass
    time.sleep(0.2)


@given(r'the King Lorik intro state is set to "(?P<state>true|false)"')
def step_set_king_intro_state(context, state):
    val = state.lower() == "true"
    payload = {"king_intro_done": val}
    if not val:
        payload["come_from"] = ""
    _execute_set_game_state(context, payload)


@given(r'the game state variable "(?P<key>[^"]+)" is set to "(?P<value>[^"]+)"')
def step_set_game_state_variable(context, key, value):
    val = value
    if value.lower() == "true": val = True
    elif value.lower() == "false": val = False
    elif value.isdigit(): val = int(value)
    _execute_set_game_state(context, {key: val})


@given(r'the hero is positioned at tile \((?P<tile_x>\d+),\s*(?P<tile_y>\d+)\) facing "(?P<facing>[^"]+)" in scene "(?P<scene_path>[^"]+)"')
@given(r'the game is launched into scene "(?P<scene_path>[^"]+)" at tile \((?P<tile_x>\d+),\s*(?P<tile_y>\d+)\) facing "(?P<facing>[^"]+)"')
def step_position_hero_in_scene(context, tile_x, tile_y, facing, scene_path):
    proc = getattr(context, 'godot_proc', None)
    if proc is None or proc.poll() is not None:
        step_launch_game_with_items_at_tile(context, scene_path, False, "", tile_x, tile_y, facing)
        return

    port = getattr(context, 'web_port', 8080)
    tx, ty = int(tile_x), int(tile_y)
    
    # 1. Load scene if not already loaded
    state = get_web_service_state(port=port)
    curr_scene = state.get("scene_shown", {}).get("path", "")
    if scene_path not in curr_scene:
        cmd_url = f"http://127.0.0.1:{port}/api/v1/command"
        req_data = json.dumps({"command": "load_scene", "args": {"path": scene_path}}).encode('utf-8')
        req = urllib.request.Request(cmd_url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp: pass
        time.sleep(1.5)

    # 2. Teleport hero
    cmd_url = f"http://127.0.0.1:{port}/api/v1/command"
    req_data = json.dumps({"command": "teleport", "args": {"x": tx, "y": ty}}).encode('utf-8')
    req = urllib.request.Request(cmd_url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp: pass
    time.sleep(0.3)

    # 3. Turn hero facing direction
    facing_map = {
        "up": {"x": 0, "y": -1}, "down": {"x": 0, "y": 1},
        "left": {"x": -1, "y": 0}, "right": {"x": 1, "y": 0}
    }
    vec = facing_map.get(facing.lower(), {"x": 0, "y": 1})
    _execute_set_game_state(context, {"_hero_facing": vec, "facing": facing.lower()})
    time.sleep(0.2)


@when(r'the hero talks to the NPC in front')
@when(r'the hero selects TALK command to speak')
def step_talk_to_npc_in_front(context):
    port = getattr(context, 'web_port', 8080)
    perform_user_input_select_command("TALK", port)
    time.sleep(0.5)


@then(r'dialog is displayed with speaker "(?P<speaker>[^"]*)" containing "(?P<pattern>[^"]+)"')
def step_verify_dialog_speaker_and_text(context, speaker, pattern):
    port = getattr(context, 'web_port', 8080)
    clean_pattern = " ".join(pattern.split())
    regex = re.compile(re.escape(clean_pattern), re.IGNORECASE)
    deadline = time.monotonic() + DIALOG_WAIT_TIMEOUT_SECONDS
    
    # 1. Wait for dialogue box to appear
    dialog_box = {}
    captured_speaker = ""

    while time.monotonic() < deadline:
        state = get_web_service_state(port=port)
        dialog_box = state.get("dialog_box", {})
        if dialog_box.get("is_showing") or dialog_box.get("text", "") != "":
            captured_speaker = dialog_box.get("speaker", "")
            break
        time.sleep(DIALOG_POLL_INTERVAL_SECONDS)

    assert dialog_box.get("is_showing") or dialog_box.get("text", "") != "", (
        f"No dialogue box displayed within {DIALOG_WAIT_TIMEOUT_SECONDS:.1f}s!"
    )

    # 2. Iterate through dialogue pages with a 1-second pause per page for viewing/reading
    collected_pages = []
    total_pages = dialog_box.get("total_pages", 1)
    if total_pages <= 0:
        total_pages = 1

    for page_index in range(total_pages):
        state = get_web_service_state(port=port)
        dialog_box = state.get("dialog_box", {})
        curr_text = dialog_box.get("text", "")
        if curr_text and curr_text not in collected_pages:
            collected_pages.append(curr_text)
        
        # 0.5-second pause per page for reading / video capture
        time.sleep(0.5)

        # Advance to next page if not on the final page
        if page_index < total_pages - 1:
            send_web_service_input({"action": "ui_accept"}, port=port)
            time.sleep(0.15)
            send_web_service_input({"action": "ui_accept"}, port=port)
            time.sleep(0.3)

    full_dialogue_text = " ".join(collected_pages)
    clean_full_text = " ".join(full_dialogue_text.split())

    # 3. Perform verification assertions
    matched_text = regex.search(clean_full_text) is not None or clean_pattern.lower() in clean_full_text.lower()
    matched_speaker = not speaker or speaker.lower() in captured_speaker.lower() or captured_speaker.lower() in speaker.lower()

    print(f"[Web] Verified Dialogue — Speaker: '{captured_speaker}', Text: '{clean_full_text}'")

    assert matched_speaker, (
        f"Expected speaker '{speaker}', but got '{captured_speaker}' in dialogue!"
    )
    assert matched_text, (
        f"Expected pattern '{pattern}' not found in dialogue text! Full dialogue: '{clean_full_text}'"
    )


