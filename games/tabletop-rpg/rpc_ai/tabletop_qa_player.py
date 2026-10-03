#!/usr/bin/env python3
"""
TabletopQAPlayer — Low-Level REST & Telemetry Client for Godot 4 Tabletop RPG
Communicates over HTTP REST with GameControlServer.gd on port 18092.
Provides atomic game actions: movement, door opening, combat, searching, turns.
"""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.error


class TabletopQAPlayer:
    def __init__(self, port: int = 18092, host: str = "127.0.0.1", human_delay: float = 0.35):
        self.port = port
        self.host = host
        self.base_url = f"http://{host}:{port}/api/v1"
        self.human_delay = human_delay

    def log(self, message: str) -> None:
        print(f"🎲 [Tabletop QA] {message}")

    def _get(self, endpoint: str) -> dict:
        url = f"{self.base_url}{endpoint}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10.0) as resp:
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
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def check_health(self) -> bool:
        try:
            res = self._get("/health")
            return res.get("status") == "ok"
        except Exception:
            return False

    def wait_for_ready(self, timeout: float = 12.0) -> bool:
        start = time.time()
        while time.time() - start < timeout:
            if self.check_health():
                return True
            time.sleep(0.3)
        return False

    def get_state(self) -> dict:
        return self._get("/state")

    def snapshot(self) -> dict:
        """Alias for get_state capturing complete game and scene snapshot."""
        return self.get_state()

    def set_state(self, **kwargs) -> dict:
        """Deterministically configure game/scene state (heroes, monsters, doors, traps, turn, etc.)."""
        self.log(f"Configuring game state: {list(kwargs.keys())}...")
        return self.execute_action("set_state", **kwargs)

    def reset_game(self) -> dict:
        """Reload pristine cartridge state."""
        self.log("Resetting game to pristine cartridge state...")
        return self.execute_action("reset_game")

    def execute_action(self, action, **kwargs) -> dict:
        if isinstance(action, dict):
            payload = {**action, **kwargs}
        else:
            payload = {"action": str(action), **kwargs}
        res = self._post("/action", payload)
        if self.human_delay > 0:
            time.sleep(self.human_delay)
        return res

    def roll_movement(self) -> dict:
        self.log("Rolling 2d6 movement dice...")
        res = self.execute_action("roll_movement")
        roll = res.get("roll", {})
        self.log(f"🎲 Rolled: [{roll.get('d1', 0)}, {roll.get('d2', 0)}] = {roll.get('total', 0)} squares")
        return res

    def move(self, x: int, y: int) -> dict:
        self.log(f"Advancing hero to grid square ({x}, {y})...")
        return self.execute_action("move", x=x, y=y)

    def open_door(self, from_x: int, from_y: int, to_x: int, to_y: int) -> dict:
        self.log(f"Kicking open door between ({from_x}, {from_y}) and ({to_x}, {to_y})...")
        return self.execute_action("open_door", from_x=from_x, from_y=from_y, to_x=to_x, to_y=to_y)

    def attack(self, monster_id: str = "", weapon: str = "") -> dict:
        self.log(f"Attacking with {weapon if weapon else 'equipped weapon'}{' against ' + monster_id if monster_id else ''}...")
        return self.execute_action("attack", monsterId=monster_id, weapon=weapon)

    def cast_spell(self, spell: str, target: str = "", tile_x: int = -1, tile_y: int = -1) -> dict:
        self.log(f"Casting spell '{spell}'{' on ' + target if target else ''}...")
        return self.execute_action("cast_spell", spell=spell, target=target, tile_x=tile_x, tile_y=tile_y)

    def equip(self, item_id: str, hero_id: str = "") -> dict:
        self.log(f"Equipping item '{item_id}'{' on ' + hero_id if hero_id else ''}...")
        return self.execute_action("equip", itemId=item_id, heroId=hero_id)

    def unequip(self, item_id: str, hero_id: str = "") -> dict:
        self.log(f"Unequipping item '{item_id}'{' from ' + hero_id if hero_id else ''}...")
        return self.execute_action("unequip", itemId=item_id, heroId=hero_id)

    def dm_attack(self, hero_id: str = "", monster_id: str = "") -> dict:
        self.log(f"Zargon monster{' ' + monster_id if monster_id else ''} strikes at hero{' ' + hero_id if hero_id else ''}...")
        kwargs = {"heroId": hero_id}
        if monster_id:
            kwargs["monsterId"] = monster_id
        return self.execute_action("dm_attack", **kwargs)

    def search(self) -> dict:
        self.log("Searching chamber for treasure...")
        return self.execute_action("search")

    def search_traps(self) -> dict:
        self.log("Searching area for hidden traps and secret doors...")
        return self.execute_action("search_traps")

    def disarm_trap(self, trap_id: str = "") -> dict:
        self.log(f"Disarming trap{' ' + trap_id if trap_id else ''}...")
        return self.execute_action("disarm_trap", trapId=trap_id)

    def end_turn(self) -> dict:
        self.log("Ending active turn...")
        return self.execute_action("end_turn")

    def ai_step(self, confirm: bool = False) -> dict:
        self.log(f"Triggering AI step (confirm={confirm})...")
        return self.execute_action("ai_step", confirm=confirm)

    def propose_ai_step(self) -> dict:
        self.log("Proposing AI step for user preview...")
        return self.execute_action("ai_step_propose")

    def confirm_ai_step(self) -> dict:
        self.log("Confirming and executing pending AI step...")
        return self.execute_action("ai_step_confirm")

    def cancel_ai_step(self) -> dict:
        self.log("Cancelling pending AI step...")
        return self.execute_action("ai_step_cancel")

    def monster_turn(self) -> dict:
        self.log("Triggering Zargon monster phase turn...")
        return self.execute_action("monster_turn")

    def toggle_role(self) -> dict:
        self.log("Toggling player / GM role...")
        return self.execute_action("toggle_role")

    def take_screenshot(self, out_path: str = "/tmp/tabletop_screenshot.png") -> dict:
        self.log(f"Capturing game viewport screenshot to {out_path}...")
        url = f"{self.base_url}/screenshot"
        req = urllib.request.Request(
            url,
            data=json.dumps({"path": out_path}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            return {"success": False, "error": str(e)}
