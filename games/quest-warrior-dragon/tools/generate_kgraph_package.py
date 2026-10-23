#!/usr/bin/env python3
"""
Generate the RobOS Knowledge Graph package (`.robos/kgraphs/jrpg/package.jsonld`)
from the validated Quest: Warrior Dragon v1 Data Store (`games/quest-warrior-dragon/data/v1/`).
"""

from __future__ import annotations

import json
from pathlib import Path

GAME_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = GAME_DIR.parent.parent
DATA_DIR = GAME_DIR / "data" / "v1"
KGRAPH_PKG_DIR = REPO_ROOT / ".robos" / "kgraphs" / "jrpg"


def build_package() -> dict:
    monsters = json.loads((DATA_DIR / "monsters.json").read_text(encoding="utf-8"))
    spells = json.loads((DATA_DIR / "spells.json").read_text(encoding="utf-8"))
    weapons = json.loads((DATA_DIR / "weapons.json").read_text(encoding="utf-8"))
    armor = json.loads((DATA_DIR / "armor.json").read_text(encoding="utf-8"))
    shields = json.loads((DATA_DIR / "shields.json").read_text(encoding="utf-8"))
    items = json.loads((DATA_DIR / "items.json").read_text(encoding="utf-8"))
    quest_items = json.loads((DATA_DIR / "quest_items.json").read_text(encoding="utf-8"))
    locations = json.loads((DATA_DIR / "locations.json").read_text(encoding="utf-8"))

    nodes: list[dict] = [
        {
            "@id": "urn:robos:jrpg:game:quest-warrior-dragon",
            "@type": [
                "oslc_am:Resource",
                "robos:PCGame",
                "robos:Game",
                "schema:VideoGame",
            ],
            "dcterms:title": "Quest: Warrior Dragon (RobOS 2D JRPG Engine)",
            "dcterms:description": "Classic 2D tile-based turn-based JRPG powered by the RobOS Dual-State Knowledge Graph, Godot 4, and 100% procedural copyright-free pixel art and chiptune audio.",
            "robos:repository": "github.com/nddipiazza/quest-warrior-dragon",
            "robos:technology": "Godot 4 / GDScript",
            "robos:gameEngine": "Godot 4",
            "robos:gameType": "jrpg",
            "robos:combatModel": "turn-based-menu",
            "robos:targetPlatform": "Linux, Windows, macOS",
            "robos:package": "jrpg",
            "robos:namespace": "robos.jrpg",
        },
        {
            "@id": "urn:robos:desktop-app:game-playthrough",
            "@type": ["oslc_am:Resource", "robos:DesktopApp"],
            "dcterms:title": "RobOS Game Playthrough",
            "dcterms:description": "Runs and watches the end-to-end AI playthrough of Quest: Warrior Dragon: start, resume or replay runs, live game state, per-milestone videos and checkpoints, run history.",
            "robos:repository": "packages/game-playthrough",
            "robos:technology": "Electron 30",
            "robos:playsGame": {"@id": "urn:robos:jrpg:game:quest-warrior-dragon"},
            "robos:package": "jrpg",
            "robos:namespace": "robos.jrpg",
        },
    ]

    # Monsters
    for m in monsters if isinstance(monsters, list) else monsters.get("monsters", []):
        key = m["key"].replace("_", "-")
        nodes.append({
            "@id": f"urn:robos:jrpg:monster:{key}",
            "@type": ["oslc_am:Resource", "robos:GameMonster", "schema:Person"],
            "dcterms:title": m["name"],
            "robos:monsterKey": m["key"],
            "robos:strength": m["strength"],
            "robos:agility": m["agility"],
            "robos:hpMin": m["hp_min"],
            "robos:hpMax": m["hp_max"],
            "robos:xpReward": m["xp"],
            "robos:goldMin": m["gp_min"],
            "robos:goldMax": m["gp_max"],
            "robos:spriteAssetRef": f"res://assets/sprites/bestiary/{m['key']}.png",
            "robos:package": "jrpg",
            "robos:namespace": "robos.jrpg",
        })

    # Spells
    spell_list = spells if isinstance(spells, list) else spells.get("spells", {}).get("hero", [])
    if isinstance(spells, dict) and not spell_list:
        spell_list = list(spells.values())
    for s in spell_list:
        if not isinstance(s, dict) or "name" not in s:
            continue
        sid = str(s.get("id", s["name"])).lower().replace("_", "-")
        nodes.append({
            "@id": f"urn:robos:jrpg:spell:{sid}",
            "@type": ["oslc_am:Resource", "robos:GameSpell", "schema:Action"],
            "dcterms:title": s["name"],
            "robos:mpCost": s.get("mp_cost", 0),
            "robos:levelLearned": s.get("level_learned", 1),
            "robos:targetScope": s.get("target", "self"),
            "robos:package": "jrpg",
            "robos:namespace": "robos.jrpg",
        })

    # Equipment & Items
    for cat_name, dataset in [
        ("weapon", weapons),
        ("armor", armor),
        ("shield", shields),
        ("item", items),
        ("quest-item", quest_items),
    ]:
        records = dataset if isinstance(dataset, list) else dataset.get("items", dataset.get("equipment", []))
        for item in records:
            if not isinstance(item, dict) or "name" not in item:
                continue
            iid = str(item.get("id", item["name"])).lower().replace("_", "-").replace(" ", "-").replace("'", "")
            nodes.append({
                "@id": f"urn:robos:jrpg:{cat_name}:{iid}",
                "@type": ["oslc_am:Resource", "robos:GameItem", "schema:Product"],
                "dcterms:title": item["name"],
                "robos:itemCategory": cat_name,
                "robos:cost": item.get("cost", 0),
                "robos:attackBonus": item.get("attack", 0),
                "robos:defenseBonus": item.get("defense", 0),
                "robos:package": "jrpg",
                "robos:namespace": "robos.jrpg",
            })

    # Locations
    loc_records = locations if isinstance(locations, list) else locations.get("locations", [])
    for loc in loc_records:
        if not isinstance(loc, dict) or "name" not in loc:
            continue
        lid = str(loc.get("id", loc["name"])).lower().replace("_", "-")
        nodes.append({
            "@id": f"urn:robos:jrpg:location:{lid}",
            "@type": ["oslc_am:Resource", "schema:Place"],
            "dcterms:title": loc["name"],
            "robos:locationType": loc.get("type", "town"),
            "robos:mapAsset": f"res://assets/maps/{lid}.png",
            "robos:package": "jrpg",
            "robos:namespace": "robos.jrpg",
        })

    return {
        "@context": {
            "oslc": "http://open-services.net/ns/core#",
            "oslc_am": "http://open-services.net/ns/am#",
            "robos": "https://robos.dev/ns/sdlc#",
            "game": "https://robos.dev/ns/game#",
            "jrpg": "https://robos.dev/ns/jrpg#",
            "dcterms": "http://purl.org/dc/terms/",
            "schema": "https://schema.org/",
            "xsd": "http://www.w3.org/2001/XMLSchema#",
        },
        "@id": "urn:robos:package:jrpg",
        "@type": ["oslc:ServiceProvider", "robos:Package"],
        "robos:package": "jrpg",
        "robos:namespace": "robos.jrpg",
        "robos:version": "1.0.0",
        "dcterms:title": "2D JRPG Engine & Quest: Warrior Dragon Package",
        "dcterms:description": "Complete 2D tile-based turn-based JRPG ontology, 40 monsters, spells, equipment, quest items, 29 overworld/town/dungeon locations, and procedural pixel-art asset bindings.",
        "robos:nodes": nodes,
    }


def main() -> None:
    KGRAPH_PKG_DIR.mkdir(parents=True, exist_ok=True)
    pkg = build_package()
    out_path = KGRAPH_PKG_DIR / "package.jsonld"
    out_path.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {out_path} with {len(pkg['robos:nodes'])} KGraph nodes.")


if __name__ == "__main__":
    main()
