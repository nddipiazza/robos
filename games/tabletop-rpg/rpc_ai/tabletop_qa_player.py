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

    def click_turn_overlay(self) -> dict:
        self.log("Clicking turn overlay banner on screen...")
        return self.execute_action("click_turn_overlay")

    def click_trap_overlay(self) -> dict:
        self.log("Clicking trap sprung overlay banner to roll hazard dice...")
        return self.execute_action("click_trap_overlay")

    def confirm_trap_roll(self) -> dict:
        self.log("Confirming trap roll and triggering hazard dice...")
        return self.execute_action("confirm_trap_roll")

    def skip_trap_overlay(self) -> dict:
        self.log("Skipping trap overlay and instantly settling hazard...")
        return self.execute_action("skip_trap_overlay")

    def move(self, x: int, y: int, interactive: bool = False) -> dict:
        self.log(f"Advancing hero to grid square ({x}, {y}) (interactive={interactive})...")
        return self.execute_action("move", x=x, y=y, interactive=interactive)

    def move_hero(self, pos: list, interactive: bool = False) -> dict:
        return self.move(pos[0], pos[1], interactive=interactive)

    def click_tile(self, x: int, y: int) -> dict:
        self.log(f"Clicking tabletop tile at ({x}, {y})...")
        return self.execute_action("click_tile", x=x, y=y)

    def open_door(self, from_x: int, from_y: int, to_x: int, to_y: int) -> dict:
        self.log(f"Kicking open door between ({from_x}, {from_y}) and ({to_x}, {to_y})...")
        return self.execute_action("open_door", from_x=from_x, from_y=from_y, to_x=to_x, to_y=to_y)

    def attack(self, monster_id: str = "", weapon: str = "") -> dict:
        self.log(f"Attacking with {weapon if weapon else 'equipped weapon'}{' against ' + monster_id if monster_id else ''}...")
        return self.execute_action("attack", monsterId=monster_id, weapon=weapon)

    def cast_spell(self, spell: str, target: str = "", tile_x: int = -1, tile_y: int = -1) -> dict:
        self.log(f"Casting spell '{spell}'{' on ' + target if target else ''}...")
        return self.execute_action("cast_spell", spell=spell, target=target, tile_x=tile_x, tile_y=tile_y)

    def open_spell_panel(self) -> dict:
        self.log("Opening HUD spell casting modal...")
        return self.execute_action("open_spell_panel")

    def close_spell_panel(self) -> dict:
        self.log("Closing HUD spell casting modal...")
        return self.execute_action("close_spell_panel")

    def use_item(self, item_id: str, hero_id: str = "", target_id: str = "") -> dict:
        self.log(f"Using item '{item_id}'{' by ' + hero_id if hero_id else ''}{' on ' + target_id if target_id else ''}...")
        return self.execute_action("use_item", itemId=item_id, heroId=hero_id, targetId=target_id)

    def open_item_panel(self) -> dict:
        self.log("Opening HUD backpack / item modal...")
        return self.execute_action("open_item_panel")

    def close_item_panel(self) -> dict:
        self.log("Closing HUD backpack / item modal...")
        return self.execute_action("close_item_panel")

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

    def toggle_log_view(self) -> dict:
        self.log("Toggling log panel display mode between damage report and combat history...")
        return self.execute_action("toggle_log_view")

    def set_log_display_mode(self, mode: str) -> dict:
        self.log(f"Setting log display mode to '{mode}'...")
        return self.execute_action("set_log_display_mode", mode=mode)

    def get_turn_damage_summary(self) -> dict:
        st = self.get_state()
        return st.get("turnDamageSummary", {})

    def get_displayed_log_text(self) -> str:
        st = self.get_state()
        return st.get("displayedLogText", "")

    def get_parsed_log_text(self) -> str:
        st = self.get_state()
        return st.get("parsedLogText", "")

    def search(self, interactive: bool = False) -> dict:
        self.log(f"Searching chamber for treasure (interactive={interactive})...")
        return self.execute_action("search", interactive=interactive)

    def resolve_treasure_overlay(self) -> dict:
        self.log("Dismissing / collecting active treasure card overlay...")
        return self.execute_action("click_treasure_overlay")

    def get_flash_item(self) -> dict:
        return self.get_state().get("flashItem", {})

    def get_pending_flash_item(self) -> dict:
        return self.get_state().get("pendingFlashItem", {})

    def search_traps(self) -> dict:
        self.log("Searching area for hidden traps and secret doors...")
        return self.execute_action("search_traps")

    def disarm_trap(self, trap_id: str = "") -> dict:
        self.log(f"Disarming trap{' ' + trap_id if trap_id else ''}...")
        return self.execute_action("disarm_trap", trapId=trap_id)

    def open_disarm_modal(self) -> dict:
        self.log("Opening HUD trap disarm modal...")
        return self.execute_action("open_disarm_modal")

    def close_disarm_modal(self) -> dict:
        self.log("Closing HUD trap disarm modal...")
        return self.execute_action("close_disarm_modal")

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

    def monster_turn(self, async_mode: bool = False) -> dict:
        self.log(f"Triggering Zargon monster phase turn (async={async_mode})...")
        return self.execute_action("monster_turn", **({"async": True} if async_mode else {}))

    def start_enemy_turn(self) -> dict:
        self.log("Triggering interactive Zargon monster turn sequence with 1.5s timeout...")
        return self.execute_action("start_enemy_turn")

    def skip_enemy_turn_timeout(self) -> dict:
        self.log("Skipping active enemy turn 1.5s timeout...")
        return self.execute_action("skip_enemy_timeout")

    def toggle_role(self) -> dict:
        self.log("Toggling player / GM role...")
        return self.execute_action("toggle_role")

    def take_screenshot(self, out_path: str = "/tmp/tabletop_screenshot.png") -> dict:
        self.log(f"Capturing game viewport screenshot to {out_path}...")
        res = self.execute_action("take_screenshot", path=out_path)
        if not res.get("success"):
            # Fallback to direct HTTP endpoint
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
        return res

    def get_furniture_at(self, x: int, y: int) -> dict:
        st = self.get_state()
        for f in st.get("furniture", []):
            fx = f.get("x", 0)
            fy = f.get("y", 0)
            fw = f.get("width", 1)
            fh = f.get("height", 1)
            if fx <= x < fx + fw and fy <= y < fy + fh:
                return f
        return {}

    def is_tile_occupied_by_furniture(self, x: int, y: int) -> bool:
        return bool(self.get_furniture_at(x, y))

    def open_hero_detail(self, hero_id: str = "") -> dict:
        self.log(f"Opening full Character Sheet dialog for hero '{hero_id}'...")
        return self.execute_action("open_hero_detail", heroId=hero_id)

    def close_hero_detail(self) -> dict:
        self.log("Closing full Character Sheet dialog...")
        return self.execute_action("close_hero_detail")

    def get_hero_detail_modal(self) -> dict:
        return self.get_state().get("heroDetailModal", {})

    def get_unavailable_notice(self) -> dict:
        return self.get_state().get("unavailableNotice", {})

    def trigger_unavailable_notice(self, text: str, tile_x: int = -1, tile_y: int = -1) -> dict:
        self.log(f"Triggering unavailable notice '{text}' at tile ({tile_x}, {tile_y})...")
        return self.execute_action("trigger_unavailable_notice", text=text, tile_x=tile_x, tile_y=tile_y)

    def click_action_button(self, button_name: str) -> dict:
        self.log(f"Clicking hotbar action button '{button_name}'...")
        return self.execute_action("click_action_button", button=button_name)

    def hover_tile(self, x: int, y: int) -> dict:
        self.log(f"Hovering mouse over tile ({x}, {y})...")
        return self.execute_action("hover_tile", x=x, y=y)

    def unhover_tile(self) -> dict:
        self.log("Unhovering mouse from map board...")
        return self.execute_action("unhover_tile")

    def get_reachable_walk_tiles(self) -> list:
        st = self.get_state()
        return st.get("reachableWalkTiles", [])

    def is_showing_reachable_indicators(self) -> bool:
        st = self.get_state()
        return bool(st.get("isShowingReachableIndicators", False))

    def get_hovered_tile(self) -> list:
        st = self.get_state()
        return st.get("hoveredTile", [-1, -1])

    def get_story_triggers(self) -> list:
        st = self.get_state()
        return st.get("storyTriggers", [])

    def get_active_story_trigger(self) -> dict:
        st = self.get_state()
        return st.get("activeStoryTrigger", {})

    def dismiss_story_trigger(self) -> dict:
        self.log("Dismissing Quest Note story trigger overlay card...")
        return self.execute_action("dismiss_story_trigger")

    def trigger_story_event(self, marker_or_id: str) -> dict:
        self.log(f"Manually triggering story event '{marker_or_id}'...")
        return self.execute_action("trigger_story_event", id=marker_or_id)

    # --- Armory & Equipment Shop ---
    def open_armory(self, hero_id: str = "") -> dict:
        self.log(f"Opening Armory Equipment Shop{' for hero ' + hero_id if hero_id else ''}...")
        return self.execute_action("open_armory", heroId=hero_id)

    def close_armory(self) -> dict:
        self.log("Closing Armory Equipment Shop...")
        return self.execute_action("close_armory")

    def toggle_armory(self) -> dict:
        self.log("Toggling Armory Equipment Shop...")
        return self.execute_action("toggle_armory")

    def select_armory_hero(self, hero_id: str) -> dict:
        self.log(f"Selecting hero '{hero_id}' in Armory Equipment Shop...")
        return self.execute_action("select_armory_hero", heroId=hero_id)

    def buy_armory_item(self, hero_id: str, item_id: str) -> dict:
        self.log(f"Hero '{hero_id}' purchasing Armory item '{item_id}'...")
        return self.execute_action("buy_armory_item", heroId=hero_id, itemId=item_id)

    def is_armory_open(self) -> bool:
        st = self.get_state()
        return bool(st.get("armoryOpen", False) or st.get("armoryModalVisible", False))

    def get_armory_catalog(self) -> list:
        st = self.get_state()
        return st.get("armoryCatalog", [])

    def get_party_total_gold(self) -> int:
        st = self.get_state()
        return int(st.get("partyTotalGold", 0))

    # --- Elf Spell Draft ---
    def select_elf_element(self, element: str, confirm: bool = True) -> dict:
        self.log(f"Selecting Elf spell element '{element}' (confirm={confirm})...")
        return self.execute_action("select_elf_element", element=element, confirm=confirm)

    def open_elf_spell_modal(self) -> dict:
        self.log("Opening Elf spell draft modal...")
        return self.execute_action("open_elf_spell_modal")

    def close_elf_spell_modal(self) -> dict:
        self.log("Closing Elf spell draft modal...")
        return self.execute_action("close_elf_spell_modal")

    def click_map_end_turn(self) -> dict:
        self.log("Clicking top-right map convenience 'End Turn' button...")
        return self.execute_action("click_map_end_turn")

    def end_turn(self) -> dict:
        self.log("Ending active turn...")
        return self.execute_action("end_turn")

    def click_end_turn(self) -> dict:
        return self.click_action_button("end_turn")

    def get_map_end_turn_button(self) -> dict:
        st = self.get_state()
        return st.get("mapEndTurnButton", st.get("scene", {}).get("ui", {}).get("buttons", {}).get("map_end_turn", {}))

    # --- Edge Tiles & Starting Stair ---
    def get_starting_stair(self) -> list:
        st = self.get_state()
        return st.get("startingStair", [0, 1])

    def is_edge_tile(self, pos: list) -> bool:
        if not pos or len(pos) < 2:
            return False
        x, y = int(pos[0]), int(pos[1])
        # Grid bounds in HeroQuest are typically 28 cols x 21 rows
        st = self.get_state()
        cols = 28
        rows = 21
        return x <= 0 or x >= cols - 1 or y <= 0 or y >= rows - 1

    def has_hero_departed_start(self, hero_id: str) -> bool:
        st = self.get_state()
        for h in st.get("heroes", []):
            if str(h.get("id")) == hero_id:
                return bool(h.get("hasDepartedStart", False) or h.get("has_departed_start", False))
        return False



