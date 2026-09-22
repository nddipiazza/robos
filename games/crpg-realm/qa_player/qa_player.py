#!/usr/bin/env python3
"""
VideoGameQAPlayer — Autonomous User-Simulation QA Testing Agent
Interacts with the Godot cRPG engine strictly through simulated user inputs:
button presses, text input, mouse clicks, and dialog choice selections.
Zero backend direct state modifications are permitted.
"""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.error

class VideoGameQAPlayer:
    def __init__(self, port: int = 18090, host: str = "127.0.0.1", human_delay: float = 0.4):
        self.port = port
        self.host = host
        self.base_url = f"http://{host}:{port}/api/v1"
        self.human_delay = human_delay
        self.action_history: list[dict] = []

    def log(self, message: str) -> None:
        print(f"🕹️  [QA Player] {message}")

    def _get(self, endpoint: str) -> dict:
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15.0) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _post(self, endpoint: str, payload: dict) -> dict:
        url = f"{self.base_url}{endpoint}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=15.0) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def check_health(self) -> bool:
        try:
            res = self._get("/health")
            return res.get("status") == "ok"
        except Exception:
            return False

    def inspect_screen(self) -> dict:
        return self._get("/screen_state")

    def inspect_game_state(self) -> dict:
        return self._get("/state")

    def set_cucumber_step(self, step_text: str, subtitle: str = "") -> dict:
        self.log(f"🥒 [BDD Step] {step_text} ({subtitle})")
        try:
            return self._post("/qa/set_step", {"step": step_text, "subtitle": subtitle})
        except Exception as e:
            self.log(f"Warning: Failed to set QA overlay step: {e}")
            return {"success": False, "error": str(e)}

    def setup_initial_save_state(self, name: str = "Lieutenant Vance", hero_class: str = "fighter", scene: str = "") -> dict:
        """
        Permitted setup phase: allows configuring the launch state or loading a save state
        before gameplay begins. From this point on, no direct state modifications are allowed.
        """
        self.log(f"Configuring launch parameters: Hero='{name}', Class='{hero_class}', Scene='{scene or 'Default'}'")
        res = self._post("/setup_state", {
            "name": name,
            "class": hero_class,
            "scene": scene
        })
        time.sleep(self.human_delay)
        return res

    def click_button(self, text_or_target: str) -> dict:
        self.log(f"Simulating user clicking button: '{text_or_target}'")
        res = self._post("/user_input/click_button", {
            "text": text_or_target,
            "target": text_or_target
        })
        self.action_history.append({"action": "click_button", "target": text_or_target, "result": res})
        time.sleep(self.human_delay)
        return res

    def type_text(self, text: str, target: str = "") -> dict:
        self.log(f"Simulating user typing '{text}' into input field '{target or 'first-editable'}'")
        res = self._post("/user_input/type_text", {
            "text": text,
            "target": target
        })
        self.action_history.append({"action": "type_text", "target": target, "text": text, "result": res})
        time.sleep(self.human_delay)
        return res

    def move_player_to(self, x: float, y: float, queue: bool = False) -> dict:
        action_name = "queue_move_to" if queue else "move_to"
        self.log(f"Simulating player {'queued ' if queue else 'click-to-'}move to coordinates: ({x}, {y})")
        res = self._post("/user_input/move_to", {"x": x, "y": y, "queue": queue})
        self.action_history.append({"action": action_name, "coords": [x, y], "queue": queue, "result": res})
        time.sleep(self.human_delay)
        return res

    def queue_player_move(self, x: float, y: float) -> dict:
        return self.move_player_to(x, y, queue=True)

    def toggle_inventory(self) -> dict:
        self.log("Simulating player toggling inventory screen [Hotkey 'I' / '🎒 ITEMS']")
        res = self._post("/user_input/inventory/toggle", {})
        self.action_history.append({"action": "toggle_inventory", "result": res})
        time.sleep(self.human_delay)
        return res

    def use_inventory_item(self, item_id: str) -> dict:
        self.log(f"Simulating player consuming/using inventory item: '{item_id}'")
        res = self._post("/user_input/inventory/use_item", {"item_id": item_id})
        self.action_history.append({"action": "use_item", "item_id": item_id, "result": res})
        time.sleep(self.human_delay)
        return res

    def equip_inventory_item(self, item_id: str) -> dict:
        self.log(f"Simulating player equipping item: '{item_id}'")
        res = self._post("/user_input/inventory/equip_item", {"item_id": item_id})
        self.action_history.append({"action": "equip_item", "item_id": item_id, "result": res})
        time.sleep(self.human_delay)
        return res

    def select_option(self, target: str, index: int) -> dict:
        self.log(f"Simulating user choosing option index [{index}] on '{target}'")
        res = self._post("/user_input/select_option", {"target": target, "index": index})
        self.action_history.append({"action": "select_option", "target": target, "index": index, "result": res})
        time.sleep(self.human_delay)
        return res

    def click_world_object(self, name: str) -> dict:
        self.log(f"Simulating user clicking interactive world object: '{name}'")
        res = self._post("/user_input/click_object", {"name": name})
        self.action_history.append({"action": "click_object", "name": name, "result": res})
        time.sleep(self.human_delay)
        return res
    def pan_camera(self, direction: str = "right", duration: float = 0.8) -> dict:
        self.log(f"Simulating player panning camera via arrow key [{direction.upper()}] for {duration}s")
        res = self._post("/user_input/pan_camera", {"direction": direction, "duration": duration})
        self.action_history.append({"action": "pan_camera", "direction": direction, "duration": duration, "result": res})
        time.sleep(duration + 0.1)
        return res

    def center_camera(self) -> dict:
        self.log("Simulating player centering camera on party/hero [Hotkey 'C']")
        res = self._post("/user_input/center_camera", {})
        self.action_history.append({"action": "center_camera", "result": res})
        time.sleep(self.human_delay)
        return res

    def click_dialogue_choice(self, choice_index_or_text: int | str = 0) -> dict:
        if isinstance(choice_index_or_text, int):
            self.log(f"Simulating user selecting dialogue option at index [{choice_index_or_text}]")
            res = self._post("/user_input/click_dialog_choice", {"index": choice_index_or_text})
        else:
            self.log(f"Simulating user selecting dialogue option matching text '{choice_index_or_text}'")
            res = self._post("/user_input/click_dialog_choice", {"text": choice_index_or_text})
        self.action_history.append({"action": "click_dialogue_choice", "target": choice_index_or_text, "result": res})
        time.sleep(self.human_delay)
        return res

    def wait_for_scene(self, expected_scene_name: str, timeout: float = 6.0) -> bool:
        start = time.time()
        self.log(f"Waiting for scene to become '{expected_scene_name}'...")
        while time.time() - start < timeout:
            state = self.inspect_game_state()
            current = state.get("scene", {}).get("name", "")
            if current == expected_scene_name:
                self.log(f"✔ Scene confirmed: '{current}'")
                return True
            time.sleep(0.2)
        raise TimeoutError(f"Timed out waiting for scene '{expected_scene_name}'. Current scene is '{current}'")

    def wait_for_dialogue(self, timeout: float = 5.0) -> dict:
        start = time.time()
        self.log("Waiting for dialogue prompt to appear on screen...")
        while time.time() - start < timeout:
            screen = self.inspect_screen()
            dialog = screen.get("dialogue", {})
            if dialog.get("active"):
                self.log(f"✔ Dialogue active from '{dialog.get('speaker')}': \"{dialog.get('text')}\"")
                return dialog
            time.sleep(0.2)
        raise TimeoutError("Timed out waiting for dialogue box to open")

    def wait_for_dialogue_closed(self, timeout: float = 5.0) -> bool:
        start = time.time()
        self.log("Waiting for dialogue box to close...")
        while time.time() - start < timeout:
            screen = self.inspect_screen()
            dialog = screen.get("dialogue", {})
            if not dialog.get("active"):
                self.log("✔ Dialogue box closed.")
                return True
            time.sleep(0.2)
        raise TimeoutError("Timed out waiting for dialogue box to close")

    def set_action_log_size(self, mode: str = "medium") -> dict:
        self.log(f"Simulating user changing Activity Log size to: '{mode}'")
        res = self._post("/user_input/action_log/set_size", {"mode": mode})
        self.action_history.append({"action": "set_action_log_size", "mode": mode, "result": res})
        time.sleep(self.human_delay)
        return res

    def cycle_action_log_size(self) -> dict:
        self.log("Simulating user cycling Activity Log size mode [Hotkey 'L' / 'SIZE' button]")
        res = self._post("/user_input/action_log/set_size", {"mode": "cycle"})
        self.action_history.append({"action": "cycle_action_log_size", "result": res})
        time.sleep(self.human_delay)
        return res
