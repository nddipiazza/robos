#!/usr/bin/env python3
"""
tabletop_snapshot_diff.py
Framework for diffing HeroQuest game & scene telemetry snapshots.
Enables the testing paradigm:
1. Set up map in some state with turn (whoever)
2. Baseline snapshot game (including scene) state
3. Perform (some action)
4. New snapshot game (including scene) state
5. Diff with baseline to come up with changes and make sure they agree with what you wanted
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple


class TabletopSnapshotDiff:
    def __init__(self, baseline: Dict[str, Any], current: Dict[str, Any]):
        self.baseline = baseline or {}
        self.current = current or {}

        # 1. Scalar state diffs
        self.scalars: Dict[str, Tuple[Any, Any]] = {}
        for key in [
            "round", "phase", "turnState", "activeHero", "activeHeroIndex",
            "movementRemaining", "movementRolled", "hasActed", "hasMoved",
            "movedBeforeAction", "movementClosed", "role",
            "discoveredEnemiesCount", "visibleEnemiesCount", "defeatedEnemiesCount",
            "exploredCount", "aiStepPending"
        ]:
            b_val = self.baseline.get(key)
            c_val = self.current.get(key)
            if b_val != c_val:
                self.scalars[key] = (b_val, c_val)

        # 2. Heroes diffs (keyed by id)
        self.heroes: Dict[str, Dict[str, Tuple[Any, Any]]] = {}
        b_heroes = {h.get("id"): h for h in self.baseline.get("heroes", []) if h.get("id")}
        c_heroes = {h.get("id"): h for h in self.current.get("heroes", []) if h.get("id")}
        b_cards = {c.get("id"): c for c in self.baseline.get("characterCards", []) if c.get("id")}
        c_cards = {c.get("id"): c for c in self.current.get("characterCards", []) if c.get("id")}

        all_hero_ids = set(b_heroes.keys()).union(c_heroes.keys())
        for hid in all_hero_ids:
            h_diffs = {}
            bh = b_heroes.get(hid, {})
            ch = c_heroes.get(hid, {})
            bc = b_cards.get(hid, {})
            cc = c_cards.get(hid, {})

            if bh.get("grid_pos") != ch.get("grid_pos"):
                h_diffs["grid_pos"] = (bh.get("grid_pos"), ch.get("grid_pos"))

            for stat in ["current_bp", "current_mp", "gold", "is_on_board", "equipped_weapon", "equipped_armor"]:
                if bh.get(stat) != ch.get(stat):
                    h_diffs[stat] = (bh.get(stat), ch.get(stat))

            for card_stat in ["attackDice", "defendDice", "isAlive", "statusEffects", "weapon", "armor"]:
                if bc.get(card_stat) != cc.get(card_stat):
                    h_diffs[card_stat] = (bc.get(card_stat), cc.get(card_stat))

            if h_diffs:
                self.heroes[hid] = h_diffs

        # 3. Monsters diffs (keyed by id)
        self.monsters: Dict[str, Dict[str, Tuple[Any, Any]]] = {}
        b_monsters = {m.get("id"): m for m in self.baseline.get("monsters", []) if m.get("id")}
        c_monsters = {m.get("id"): m for m in self.current.get("monsters", []) if m.get("id")}
        b_m_cards = {c.get("id"): c for c in self.baseline.get("enemyCards", []) if c.get("id")}
        c_m_cards = {c.get("id"): c for c in self.current.get("enemyCards", []) if c.get("id")}

        all_m_ids = set(b_monsters.keys()).union(c_monsters.keys())
        for mid in all_m_ids:
            m_diffs = {}
            bm = b_monsters.get(mid, {})
            cm = c_monsters.get(mid, {})
            bmc = b_m_cards.get(mid, {})
            cmc = c_m_cards.get(mid, {})

            for stat in ["current_bp", "is_alive", "grid_pos", "roomId"]:
                if bm.get(stat) != cm.get(stat):
                    m_diffs[stat] = (bm.get(stat), cm.get(stat))

            for card_stat in ["isVisible", "isAlive", "statusBadge", "statusEffects"]:
                if bmc.get(card_stat) != cmc.get(card_stat):
                    m_diffs[card_stat] = (bmc.get(card_stat), cmc.get(card_stat))

            if m_diffs:
                self.monsters[mid] = m_diffs

        # 4. Doors diffs (keyed by id or from-to)
        self.doors: Dict[str, Dict[str, Tuple[Any, Any]]] = {}
        b_doors = {d.get("id", f"{d.get('from')}-{d.get('to')}"): d for d in self.baseline.get("doors", [])}
        c_doors = {d.get("id", f"{d.get('from')}-{d.get('to')}"): d for d in self.current.get("doors", [])}
        for did in set(b_doors.keys()).union(c_doors.keys()):
            bd = b_doors.get(did, {})
            cd = c_doors.get(did, {})
            d_diffs = {}
            for stat in ["is_open", "is_revealed", "is_secret"]:
                if bd.get(stat) != cd.get(stat):
                    d_diffs[stat] = (bd.get(stat), cd.get(stat))
            if d_diffs:
                self.doors[did] = d_diffs

        # 5. Traps diffs (keyed by id)
        self.traps: Dict[str, Dict[str, Tuple[Any, Any]]] = {}
        b_traps = {t.get("id"): t for t in self.baseline.get("traps", []) if t.get("id")}
        c_traps = {t.get("id"): t for t in self.current.get("traps", []) if t.get("id")}
        for tid in set(b_traps.keys()).union(c_traps.keys()):
            bt = b_traps.get(tid, {})
            ct = c_traps.get(tid, {})
            t_diffs = {}
            for stat in ["detected", "disarmed"]:
                if bt.get(stat) != ct.get(stat):
                    t_diffs[stat] = (bt.get(stat), ct.get(stat))
            if t_diffs:
                self.traps[tid] = t_diffs

        # 6. Revealed rooms diffs
        b_rooms = set(self.baseline.get("revealedRooms", []))
        c_rooms = set(self.current.get("revealedRooms", []))
        self.rooms_revealed_added = sorted(list(c_rooms - b_rooms))
        self.rooms_revealed_removed = sorted(list(b_rooms - c_rooms))

        # 7. Scene diffs
        self.scene_tokens: Dict[str, Dict[str, Tuple[Any, Any]]] = {}
        b_tokens = self.baseline.get("scene", {}).get("tokens", {})
        c_tokens = self.current.get("scene", {}).get("tokens", {})
        for tok_id in set(b_tokens.keys()).union(c_tokens.keys()):
            btok = b_tokens.get(tok_id, {})
            ctok = c_tokens.get(tok_id, {})
            tok_diffs = {}
            if btok.get("grid_pos") != ctok.get("grid_pos"):
                tok_diffs["grid_pos"] = (btok.get("grid_pos"), ctok.get("grid_pos"))
            if btok.get("pixelPos") != ctok.get("pixelPos"):
                tok_diffs["pixelPos"] = (btok.get("pixelPos"), ctok.get("pixelPos"))
            if btok.get("visible") != ctok.get("visible"):
                tok_diffs["visible"] = (btok.get("visible"), ctok.get("visible"))
            if tok_diffs:
                self.scene_tokens[tok_id] = tok_diffs

        # UI diffs
        self.scene_ui: Dict[str, Tuple[Any, Any]] = {}
        b_ui = self.baseline.get("scene", {}).get("ui", {})
        c_ui = self.current.get("scene", {}).get("ui", {})
        b_modal = b_ui.get("modal", {})
        c_modal = c_ui.get("modal", {})
        for m_key in ["aiConfirmModalVisible", "commandText", "actionTitle", "stepBadge"]:
            if b_modal.get(m_key) != c_modal.get(m_key):
                self.scene_ui[f"modal.{m_key}"] = (b_modal.get(m_key), c_modal.get(m_key))

        b_btns = b_ui.get("buttons", {})
        c_btns = c_ui.get("buttons", {})
        for btn_name in ["roll", "attack", "search", "end_turn", "ai_step"]:
            bb = b_btns.get(btn_name, {})
            cb = c_btns.get(btn_name, {})
            if bb != cb:
                self.scene_ui[f"button.{btn_name}"] = (bb, cb)

        # 8. Combat Log Messages Added
        b_log = self.baseline.get("combatLog", [])
        c_log = self.current.get("combatLog", [])
        self.combat_log_added = [m for m in c_log if m not in b_log]

    @property
    def has_changes(self) -> bool:
        return bool(
            self.scalars or self.heroes or self.monsters or self.doors
            or self.traps or self.rooms_revealed_added or self.scene_tokens
            or self.scene_ui or self.combat_log_added
        )

    def format_diff(self) -> str:
        lines = []
        lines.append("📊 [SNAPSHOT DIFF REPORT]")
        if not self.has_changes:
            lines.append("  (No state changes detected between snapshots)")
            return "\n".join(lines)

        if self.scalars:
            lines.append("  🔄 Scalar State Transitions:")
            for k, (old_v, new_v) in self.scalars.items():
                lines.append(f"     • {k}: {old_v!r} ➔ {new_v!r}")

        if self.heroes:
            lines.append("  🦸 Hero Mutations:")
            for hid, diffs in self.heroes.items():
                lines.append(f"     [{hid}]")
                for prop, (old_v, new_v) in diffs.items():
                    lines.append(f"       • {prop}: {old_v!r} ➔ {new_v!r}")

        if self.monsters:
            lines.append("  👾 Monster Mutations:")
            for mid, diffs in self.monsters.items():
                lines.append(f"     [{mid}]")
                for prop, (old_v, new_v) in diffs.items():
                    lines.append(f"       • {prop}: {old_v!r} ➔ {new_v!r}")

        if self.doors:
            lines.append("  🚪 Door Transitions:")
            for did, diffs in self.doors.items():
                for prop, (old_v, new_v) in diffs.items():
                    lines.append(f"     • Door '{did}' {prop}: {old_v!r} ➔ {new_v!r}")

        if self.traps:
            lines.append("  💥 Trap Transitions:")
            for tid, diffs in self.traps.items():
                for prop, (old_v, new_v) in diffs.items():
                    lines.append(f"     • Trap '{tid}' {prop}: {old_v!r} ➔ {new_v!r}")

        if self.rooms_revealed_added:
            lines.append(f"  🏰 Revealed Rooms Added: {self.rooms_revealed_added}")

        if self.scene_tokens:
            lines.append("  🎭 Scene Token Visual Movements:")
            for tok_id, diffs in self.scene_tokens.items():
                lines.append(f"     [{tok_id}] {diffs}")

        if self.scene_ui:
            lines.append("  🎛️ Scene UI / Modal Transitions:")
            for ui_k, (old_v, new_v) in self.scene_ui.items():
                lines.append(f"     • {ui_k}: {old_v!r} ➔ {new_v!r}")

        if self.combat_log_added:
            lines.append(f"  📜 Added Combat Log ({len(self.combat_log_added)} entries):")
            for msg in self.combat_log_added[-3:]:
                lines.append(f"     > {msg}")

        return "\n".join(lines)

    # Fluent Assertion Helpers
    def assert_scalar(self, key: str, expected_old: Any, expected_new: Any, msg: str = ""):
        assert key in self.scalars, f"Expected scalar '{key}' to change, but it did not. {msg}\n{self.format_diff()}"
        old_v, new_v = self.scalars[key]
        assert old_v == expected_old, f"Scalar '{key}' old value was {old_v!r}, expected {expected_old!r}"
        assert new_v == expected_new, f"Scalar '{key}' new value was {new_v!r}, expected {expected_new!r}"

    def assert_hero_pos(self, hero_id: str, expected_old_pos: list, expected_new_pos: list):
        assert hero_id in self.heroes, f"Hero '{hero_id}' had no mutations.\n{self.format_diff()}"
        assert "grid_pos" in self.heroes[hero_id], f"Hero '{hero_id}' position did not change."
        old_p, new_p = self.heroes[hero_id]["grid_pos"]
        assert old_p == expected_old_pos, f"Hero '{hero_id}' old pos was {old_p}, expected {expected_old_pos}"
        assert new_p == expected_new_pos, f"Hero '{hero_id}' new pos was {new_p}, expected {expected_new_pos}"

    def assert_hero_bp(self, hero_id: str, expected_old_bp: int, expected_new_bp: int):
        assert hero_id in self.heroes, f"Hero '{hero_id}' had no mutations.\n{self.format_diff()}"
        assert "current_bp" in self.heroes[hero_id], f"Hero '{hero_id}' current_bp did not change."
        old_b, new_b = self.heroes[hero_id]["current_bp"]
        assert old_b == expected_old_bp, f"Hero '{hero_id}' old BP was {old_b}, expected {expected_old_bp}"
        assert new_b == expected_new_bp, f"Hero '{hero_id}' new BP was {new_b}, expected {expected_new_bp}"

    def assert_monster_bp(self, monster_id: str, expected_old_bp: int, expected_new_bp: int):
        assert monster_id in self.monsters, f"Monster '{monster_id}' had no mutations.\n{self.format_diff()}"
        assert "current_bp" in self.monsters[monster_id], f"Monster '{monster_id}' current_bp did not change."
        old_b, new_b = self.monsters[monster_id]["current_bp"]
        assert old_b == expected_old_bp, f"Monster '{monster_id}' old BP was {old_b}, expected {expected_old_bp}"
        assert new_b == expected_new_bp, f"Monster '{monster_id}' new BP was {new_b}, expected {expected_new_bp}"

    def assert_monster_defeated(self, monster_id: str):
        assert monster_id in self.monsters, f"Monster '{monster_id}' had no mutations.\n{self.format_diff()}"
        m_diff = self.monsters[monster_id]
        if "is_alive" in m_diff:
            assert m_diff["is_alive"][1] is False
        if "statusBadge" in m_diff:
            assert m_diff["statusBadge"][1] == "defeated"

    def assert_door_opened(self, door_id: Optional[str] = None):
        if door_id:
            assert door_id in self.doors, f"Door '{door_id}' did not change state.\n{self.format_diff()}"
            assert self.doors[door_id]["is_open"] == (False, True)
        else:
            opened = [did for did, d in self.doors.items() if d.get("is_open") == (False, True)]
            assert len(opened) > 0, f"No door was opened.\n{self.format_diff()}"

    def assert_secret_door_revealed(self, door_id: Optional[str] = None):
        if door_id:
            assert door_id in self.doors, f"Door '{door_id}' did not change state.\n{self.format_diff()}"
            assert self.doors[door_id].get("is_revealed") == (False, True), f"Door '{door_id}' was not revealed.\n{self.format_diff()}"
        else:
            revealed = [did for did, d in self.doors.items() if d.get("is_revealed") == (False, True)]
            assert len(revealed) > 0, f"No secret door was revealed.\n{self.format_diff()}"

    def assert_room_revealed(self, room_id: str):
        assert room_id in self.rooms_revealed_added, f"Room '{room_id}' was not revealed. Revealed: {self.rooms_revealed_added}"

    def assert_trap_detected(self, trap_id: str):
        assert trap_id in self.traps, f"Trap '{trap_id}' state did not change.\n{self.format_diff()}"
        assert self.traps[trap_id].get("detected") == (False, True)

    def assert_trap_disarmed(self, trap_id: str):
        assert trap_id in self.traps, f"Trap '{trap_id}' state did not change.\n{self.format_diff()}"
        assert self.traps[trap_id].get("disarmed") == (False, True)


def diff_snapshots(baseline: Dict[str, Any], current: Dict[str, Any]) -> TabletopSnapshotDiff:
    """Computes a structured diff between two game and scene snapshots."""
    return TabletopSnapshotDiff(baseline, current)
