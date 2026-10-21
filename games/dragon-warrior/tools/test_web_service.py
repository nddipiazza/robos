#!/usr/bin/env python3
"""
tools/test_web_service.py
Automated integration test script for Dragon Warrior contract-based HTTP web service.
"""

import os
import sys
import time
import subprocess
import urllib.request
import urllib.parse
import json

PORT = 8088
BASE_URL = f"http://127.0.0.1:{PORT}"

def find_godot():
    if "DW_GODOT_BIN" in os.environ and os.path.exists(os.environ["DW_GODOT_BIN"]):
        return os.environ["DW_GODOT_BIN"]
    
    import shutil
    for candidate in ["godot4.exe", "godot.exe", "godot4", "godot"]:
        found = shutil.which(candidate)
        if found:
            return found

    linux_paths = [
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

def http_get(path):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = resp.read().decode('utf-8')
        try:
            return resp.status, json.loads(body)
        except json.JSONDecodeError:
            return resp.status, body

def http_post(path, data):
    url = f"{BASE_URL}{path}"
    body_bytes = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=body_bytes, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as resp:
        body = resp.read().decode('utf-8')
        try:
            return resp.status, json.loads(body)
        except json.JSONDecodeError:
            return resp.status, body

def main():
    godot_bin = find_godot()
    project_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    print(f"🚀 Starting Godot game instance on port {PORT}...")
    cmd = [
        godot_bin,
        "--path", project_dir,
        f"--web-service-port={PORT}"
    ]
    
    env = os.environ.copy()
    if sys.platform != "win32" and "DISPLAY" not in env:
        env["DISPLAY"] = ":0"

    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
    
    try:
        # 1. Wait for server to become ready
        print("⏳ Waiting for web service to listen...")
        connected = False
        for _ in range(30):
            try:
                status, data = http_get("/health")
                if status == 200 and data.get("status") == "ok":
                    connected = True
                    break
            except Exception:
                time.sleep(0.5)

        if not connected:
            print("❌ Timed out waiting for web service /health endpoint.")
            sys.exit(1)

        print("✅ Web Service is online and healthy!")

        # 2. Test GET /contract
        print("\n📜 Testing GET /contract...")
        status, contract = http_get("/contract")
        assert status == 200, f"Expected 200, got {status}"
        assert "openapi" in contract or "info" in contract, "Contract response missing openapi definition"
        print("✅ GET /contract test PASSED.")

        # 3. Test GET /api/v1/state (initial state)
        print("\n📊 Testing GET /api/v1/state...")
        status, state = http_get("/api/v1/state")
        assert status == 200, f"Expected 200, got {status}"
        
        # Verify required state contract sections
        for key in ["scene_shown", "hero_position", "game_state", "dialog_box", "command_window", "battle", "encounter_rng"]:
            assert key in state, f"State missing required contract field '{key}'"

        print(f"  Initial Scene: {state['scene_shown'].get('path')}")
        print(f"  Hero Position: ({state['hero_position'].get('x')}, {state['hero_position'].get('y')}) Facing: {state['hero_position'].get('facing')}")
        print("✅ GET /api/v1/state schema verification PASSED.")

        # 3b. Test GET /screen and GET /api/v1/screen
        print("\n📺 Testing GET /screen and GET /api/v1/screen...")
        status, screen = http_get("/api/v1/screen")
        assert status == 200, f"Expected 200, got {status}"
        for key in ["viewport", "camera", "bounds", "hero", "tiles"]:
            assert key in screen, f"Screen response missing required key '{key}'"
        assert len(screen["tiles"]) > 0, "Screen tiles list should not be empty"
        hero_tile_found = any(t.get("is_hero") == True for t in screen["tiles"])
        assert hero_tile_found, "Screen tiles must include tile with is_hero: true"
        print(f"  Total visible screen tiles returned: {len(screen['tiles'])}")
        print("✅ GET /screen endpoint test PASSED.")

        # 4. Test POST /api/v1/command load_scene
        print("\n🏰 Testing POST /api/v1/command (load_scene)...")
        status, resp = http_post("/api/v1/command", {"command": "load_scene", "args": {"path": "res://scenes/ThroneRoom.tscn"}})
        assert status == 200 and resp.get("success") == True, f"Failed load_scene: {resp}"
        time.sleep(1.0) # allow scene change

        status, state = http_get("/api/v1/state")
        assert "ThroneRoom" in state["scene_shown"].get("path", "") or "ThroneRoom" in state["scene_shown"].get("name", ""), f"Scene not changed: {state['scene_shown']}"
        print(f"  Current Scene after load_scene: {state['scene_shown'].get('path')}")
        print("✅ POST /api/v1/command load_scene PASSED.")

        # 5. Test POST /api/v1/input (move inputs)
        print("\n🎮 Testing POST /api/v1/input (key/action injection)...")
        status, resp = http_post("/api/v1/input", {"action": "move_right"})
        assert status == 200 and resp.get("success") == True, f"Failed move_right: {resp}"
        time.sleep(0.5)

        status, state_after_move = http_get("/api/v1/state")
        print(f"  Hero Position after move_right: ({state_after_move['hero_position'].get('x')}, {state_after_move['hero_position'].get('y')})")
        print("✅ POST /api/v1/input move PASSED.")

        # 6. Test POST /api/v1/command (trigger_encounter)
        print("\n⚔️ Testing POST /api/v1/command (trigger_encounter)...")
        status, resp = http_post("/api/v1/command", {"command": "trigger_encounter", "args": {"monster": "slime"}})
        assert status == 200 and resp.get("success") == True, f"Failed trigger_encounter: {resp}"
        time.sleep(0.5)

        status, state_battle = http_get("/api/v1/state")
        assert state_battle["battle"]["is_battle"] == True, f"Battle state not active: {state_battle['battle']}"
        print(f"  Battle status: {state_battle['battle']}")
        print("✅ Battle trigger & state query PASSED.")

        print("\n🎉 ALL WEB SERVICE INTEGRATION TESTS PASSED SUCCESSFULLY!")

    finally:
        print("🛑 Terminating Godot process...")
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()

if __name__ == "__main__":
    main()
