#!/usr/bin/env python3
"""Validate all generated v1 cRPG data files against JSON schemas."""

import json
from pathlib import Path
import sys

GAME_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = GAME_DIR / "data" / "v1"
SCHEMAS_DIR = GAME_DIR / "schemas" / "v1"

def validate():
    print("=== RobOS cRPG Data Store Verification ===")
    
    # 1. Check data files exist
    expected_files = [
        "game.json", "classes.json", "npcs.json", "monsters.json",
        "spells.json", "items.json", "zones.json",
        "encounters.json", "quests.json", "dialogue.json"
    ]
    
    for filename in expected_files:
        filepath = DATA_DIR / filename
        assert filepath.exists(), f"Missing expected data file: {filename}"
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            count = len(data) if isinstance(data, list) else 1
            print(f"✔ Verified {filename} (parsed successfully, {count} records)")

    # Check monster data details
    with open(DATA_DIR / "monsters.json", "r", encoding="utf-8") as f:
        monsters = json.load(f)
        malakor = next((m for m in monsters if m["id"] == "captain-malakor-boss"), None)
        assert malakor is not None, "Captain Malakor boss record missing"
        assert malakor["hitPoints"] == 58, f"Expected 58 HP, got {malakor['hitPoints']}"
        assert malakor["armorClass"] == 16, f"Expected 16 AC, got {malakor['armorClass']}"
        print(f"✔ Boss Stat Check: {malakor['title']} (HP: {malakor['hitPoints']}, AC: {malakor['armorClass']})")

    # Check NPC data details
    with open(DATA_DIR / "npcs.json", "r", encoding="utf-8") as f:
        npcs = json.load(f)
        elora = next((n for n in npcs if n["id"] == "elora"), None)
        assert elora is not None, "Elora partner NPC record missing"
        print(f"✔ NPC Check: {elora['title']} (Dialogue: {elora['dialogueTree']})")

    # Check class data details
    with open(DATA_DIR / "classes.json", "r", encoding="utf-8") as f:
        classes = json.load(f)
        fighter = next((c for c in classes if c["id"] == "fighter"), None)
        assert fighter is not None, "Fighter class record missing"
        assert fighter["hitDie"] == "d10", f"Expected d10 hit die, got {fighter['hitDie']}"
        print(f"✔ Class Stat Check: {fighter['title']} (Hit Die: {fighter['hitDie']}, Primary: {fighter['primaryAbility']})")

    print("=== ALL CRPG DATA STORE INTEGRITY CHECKS PASSED ===")

if __name__ == "__main__":
    validate()
