#!/usr/bin/env python3
"""Generate data/v1/milestones.json — the ordered objective list the in-engine
Player AI ("play the game" mode) seeks one after another.

Every treasure chest, every weapon / armor / shield purchase, every quest
item, every boss and the ending are milestones. Each entry tells the AI where
to stand (map + tile + facing), which command to use, how much gold / which
level it should have first, and how to detect completion from GameState.

Run from games/dragon-warrior:  python3 tools/gen_milestones.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "v1")
OUT = os.path.join(DATA, "milestones.json")


def load(name, sub=DATA):
    with open(os.path.join(sub, name), encoding="utf-8") as fh:
        return json.load(fh)


grids = load("map_grids.json")["maps"]
walkable_ids = set(load("tile_walkability.json")["walkable"])
chests = load("chest_registry.json")
shops = load("shops.json")
weapons = {w["id"]: w for w in load("weapons.json")}
armor = {a["id"]: a for a in load("armor.json")}
shields = {s["id"]: s for s in load("shields.json")}
items = {i["id"]: i for i in load("items.json")}
quest_items = {q["id"]: q for q in load("quest_items.json")}

DIRS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
OPPOSITE = {"up": "down", "down": "up", "left": "right", "right": "left"}


def tile_walkable(map_key, col, row):
    m = grids[map_key]
    grid = m["grid"]
    if row < 0 or row >= len(grid) or col < 0 or col >= len(grid[0]):
        return False
    if row == 0 or col == 0 or row == len(grid) - 1 or col == len(grid[0]) - 1:
        return False
    tid = grid[row][col]
    if tid == 32 and map_key in ("hauksness-1f", "kol-1f"):
        return True
    return tid in walkable_ids


def stand_facing(map_key, target, avoid=None, prefer=None):
    """Pick the tile the hero stands on to face `target`. Returns (tile, facing)."""
    cands = []
    for face, (dx, dy) in DIRS.items():
        col, row = target[0] - dx, target[1] - dy
        if avoid and (col, row) == tuple(avoid):
            continue
        if tile_walkable(map_key, col, row):
            cands.append(((col, row), face))
    if not cands:
        raise SystemExit(f"no walkable tile adjacent to {target} in {map_key}")
    if prefer:
        for c in cands:
            if c[1] == prefer:
                return c
    return cands[0]


milestones = []
_seq = [0]


def add(mid, name, phase, mtype, map_key, tile, done_when, face=None, **extra):
    _seq[0] += 1
    entry = {
        "seq": _seq[0],
        "id": mid,
        "name": name,
        "phase": phase,
        "type": mtype,
        "map": map_key,
        "tile": {"col": int(tile[0]), "row": int(tile[1])},
        "optional": bool(extra.pop("optional", False)),
        "min_level": int(extra.pop("min_level", 1)),
        "done_when": done_when,
    }
    if face:
        entry["face"] = face
    entry.update(extra)
    milestones.append(entry)


def chest_milestone(map_key, chest_id, phase, min_level=1, label=None):
    for ch in chests[map_key]:
        if ch["id"] == chest_id:
            item = ch.get("item", "")
            nm = label or (
                quest_items.get(item, items.get(item, weapons.get(item, {})))
                .get("name") or (item.replace("_", " ").title() if item else "treasure")
            )
            add(
                f"chest-{map_key}-{chest_id}",
                f"Open chest {chest_id} ({nm}) in {map_key}",
                phase, "chest", map_key, (ch["col"], ch["row"]),
                {"kind": "chest", "map": map_key, "col": ch["col"], "row": ch["row"]},
                min_level=min_level, item_id=item or None,
                requires=ch.get("requires"),
            )
            return
    raise SystemExit(f"chest {chest_id} missing in {map_key}")


def shop_by_id(shop_id):
    for s in shops:
        if s["id"] == shop_id and s.get("npc_tile"):
            return s
    raise SystemExit(f"shop {shop_id} missing")


def buy_milestone(shop_id, item_id, phase, min_level=1, optional=False):
    s = shop_by_id(shop_id)
    price = next(e["price"] for e in s["inventory"] if e["item_id"] == item_id)
    npc = tuple(s["npc_tile"])
    desk = tuple(s["desk_tile"])
    # Stand across the counter from the merchant when possible.
    prefer = None
    dx, dy = desk[0] - npc[0], desk[1] - npc[1]
    for f, d in DIRS.items():
        if d == (-dx, -dy):
            prefer = f
    tile, face = stand_facing(s["map_key"], desk, avoid=npc, prefer=prefer)
    if item_id in weapons:
        slot, value, nm = "weapon", weapons[item_id]["attack"], weapons[item_id]["name"]
    elif item_id in armor:
        slot, value, nm = "armor", armor[item_id]["defense"], armor[item_id]["name"]
    elif item_id in shields:
        slot, value, nm = "shield", shields[item_id]["defense"], shields[item_id]["name"]
    else:
        slot, value, nm = None, None, items[item_id]["name"]
    done = (
        {"kind": "equipped_at_least", "slot": slot, "value": value, "item_id": item_id}
        if slot else {"kind": "has_item", "item_id": item_id}
    )
    add(
        f"buy-{item_id}-{shop_id}", f"Buy {nm} at {s['location_name']} ({price}G)",
        phase, "buy", s["map_key"], tile, done, face=face,
        item_id=item_id, price=price, shop_id=shop_id, min_level=min_level,
        optional=optional, slot=slot,
    )


def inn_entry(map_key, npc_tile, cost):
    tile, face = stand_facing(map_key, npc_tile, prefer="up")
    return {"map": map_key, "tile": {"col": tile[0], "row": tile[1]}, "face": face, "cost": cost}


# ── Phase 1: Tantegel Castle ───────────────────────────────────────────────────
P = "tantegel"
add("talk-king-intro", "Hear King Lorik's quest", P, "talk", "tantegel-castle-2f", (4, 5),
    {"kind": "flag", "flag": "king_intro_done"}, face="up")
chest_milestone("tantegel-castle-2f", "ttrc1", P, label="120 Gold")
chest_milestone("tantegel-castle-2f", "ttrc2", P, label="Torch")
chest_milestone("tantegel-castle-2f", "ttrc3", P, label="Magic Key")
add("open-throne-door", "Unlock the throne room gate", P, "door", "tantegel-castle-2f", (5, 7),
    {"kind": "door", "key": "throne_room"}, face="down")
for cid in ("tanc1", "tanc2", "tanc3", "tanc4"):
    chest_milestone("tantegel-castle-1f", cid, P, label="Gold")
chest_milestone("tantegel-castle-b1", "tbac1", P)

# ── Phase 2: Brecconary & first gear ──────────────────────────────────────────
P = "brecconary"
buy_milestone("bre001", "bamboo_pole", P, optional=True)
buy_milestone("bre001", "club", P)
buy_milestone("bre001", "clothes", P)
buy_milestone("bre002", "herb", P)
add("level-3", "Reach level 3 (HEAL)", P, "level", "world-map", (45, 45),
    {"kind": "level", "value": 3}, min_level=1, grind_anchor="brecconary-1f")
buy_milestone("bre001", "leather_armor", P)
buy_milestone("bre001", "small_shield", P)
buy_milestone("bre001", "copper_sword", P)

# ── Phase 3: Erdrick's Cave ───────────────────────────────────────────────────
P = "erdricks-cave"
chest_milestone("erdricks-cave-b2", "er2c1", P, min_level=3)

# ── Phase 4: Garinham & Garin's Grave ─────────────────────────────────────────
P = "garinham"
for cid in ("garc1", "garc2", "garc3"):
    chest_milestone("garinham-1f", cid, P, min_level=4)
buy_milestone("gar002", "chain_mail", P, min_level=4)
add("level-7", "Reach level 7 (SLEEP)", P, "level", "world-map", (4, 4),
    {"kind": "level", "value": 7}, grind_anchor="garinham-1f")
buy_milestone("gar002", "hand_axe", P, min_level=7)
for cid in ("gh1c1", "gh1c2", "gh1c3"):
    chest_milestone("garinham-b1", cid, P, min_level=7)
chest_milestone("garinham-b3", "gh3c1", P, min_level=8)
chest_milestone("garinham-b3", "gh3c2", P, min_level=8)
buy_milestone("gar002", "large_shield", P, min_level=8)
buy_milestone("gar002", "half_plate", P, min_level=8)

# ── Phase 5: Kol ──────────────────────────────────────────────────────────────
P = "kol"
for cid in ("kolc1", "kolc2", "kolc3"):
    chest_milestone("kol-1f", cid, P, min_level=8)
add("search-fairy-flute", "Find the Fairy Flute in Kol", P, "search", "kol-1f", (10, 7),
    {"kind": "has_item", "item_id": "fairy_flute"}, min_level=8, item_id="fairy_flute")
buy_milestone("kol001", "full_plate", P, min_level=10, optional=True)

# ── Phase 6: Mountain Cave ────────────────────────────────────────────────────
P = "mountain-cave"
add("level-10", "Reach level 10 (STOPSPELL)", P, "level", "world-map", (45, 45),
    {"kind": "level", "value": 10}, grind_anchor="tantegel-castle-1f")
chest_milestone("mountain-cave-b1", "mt1c1", P, min_level=10)
for cid in ("mt2c1", "mt2c2", "mt2c3", "mt2c4"):
    chest_milestone("mountain-cave-b2", cid, P, min_level=10)

# ── Phase 7: Swamp Cave, Gwaelin & Rimuldar ───────────────────────────────────
P = "gwaelin"
add("rescue-gwaelin", "Rescue Princess Gwaelin in the Swamp Cave", P, "talk", "swamp-cave-b1", (6, 20),
    {"kind": "flag", "flag": "gwaelin_rescued"}, face="up", min_level=10)
chest_milestone("rimuldar-1f", "rimc1", P, min_level=10)
buy_milestone("rim001", "broad_sword", P, min_level=10)
buy_milestone("rim001", "magic_armor", P, min_level=12, optional=True)
add("return-gwaelin", "Return Gwaelin to King Lorik", P, "talk", "tantegel-castle-2f", (4, 5),
    {"kind": "flag", "flag": "gwaelin_returned"}, face="up", min_level=10)

# ── Phase 8: Hauksness & the shrines ──────────────────────────────────────────
P = "relics"
add("level-15", "Reach level 15 (REPEL)", P, "level", "world-map", (104, 74),
    {"kind": "level", "value": 15}, grind_anchor="rimuldar-1f")
chest_milestone("northern-cave-b1", "nc1c1", P, min_level=15)
# Cantlin gear before Hauksness: the ruined town's werewolves / starwyverns
# (strength 86) shred a level-15 hero in half plate.
# The southern swamp and Cantlin's road (starwyverns, green dragons, demon knights)
# kill a level-16 hero outright: wait for level 17 like the NES guides advise.
add("search-erdricks-token", "Dig up Erdrick's Token", P, "search", "world-map", (85, 114),
    {"kind": "has_item", "item_id": "erdricks_token"}, min_level=17, item_id="erdricks_token")
# The Golem guards Cantlin's gate: stepping on the town tile starts the fight and the
# Fairy Flute (dug up in Kol) puts it to sleep. Winning once opens the town for good.
add("defeat-golem", "Destroy the Golem at Cantlin's gate", P, "step", "world-map", (75, 104),
    {"kind": "flag", "flag": "golem_defeated"}, min_level=17)
for cid in ("ctnc1", "ctnc2", "ctnc3"):
    chest_milestone("cantlin-1f", cid, P, min_level=17)
buy_milestone("can002", "silver_shield", P, min_level=17)
buy_milestone("can002", "flame_sword", P, min_level=17, optional=True)
add("level-18", "Reach level 18", P, "level", "world-map", (73, 102),
    {"kind": "level", "value": 18}, grind_anchor="cantlin-1f")
add("erdricks-armor", "Claim Erdrick's Armor in Hauksness", P, "step", "hauksness-1f", (19, 13),
    {"kind": "equipped_at_least", "slot": "armor", "value": armor["erdricks_armor"]["defense"]},
    min_level=18, item_id="erdricks_armor")
chest_milestone("southern-cave-b1", "sc1c1", P, min_level=18)
add("rainbow-bridge", "Span the sea with the Rainbow Drop", P, "use_item", "world-map", (67, 51),
    {"kind": "flag", "flag": "bridge_built"}, face="left", min_level=18, item_id="rainbow_drop")

# ── Phase 9: Charlock Castle ──────────────────────────────────────────────────
P = "charlock"
# One Charlock expedition: Erdrick's Sword, the B7 chests and the Dragonlord in a single trip,
# at the level the final fight actually needs.
add("level-21", "Reach level 21", P, "level", "world-map", (45, 45),
    {"kind": "level", "value": 21}, grind_anchor="tantegel-castle-1f")
chest_milestone("charlock-castle-b2", "cb2c1", P, min_level=21)
for cid in ("cb7c1", "cb7c2", "cb7c3", "cb7c4", "cb7c5", "cb7c6"):
    chest_milestone("charlock-castle-b7", cid, P, min_level=21)
add("defeat-dragonlord", "Defeat the Dragonlord", P, "boss", "charlock-castle-b7", (15, 24),
    {"kind": "flag", "flag": "dragonlord_defeated"}, face="right", min_level=21)
add("ending", "Report victory to King Lorik", "ending", "talk", "tantegel-castle-2f", (4, 5),
    {"kind": "flag", "flag": "game_completed"}, face="up", min_level=18)

inns = {
    "brecconary-1f": inn_entry("brecconary-1f", (5, 5), 6),
    "garinham-1f": inn_entry("garinham-1f", (6, 3), 6),
    "kol-1f": inn_entry("kol-1f", (21, 6), 0),
    "rimuldar-1f": inn_entry("rimuldar-1f", (6, 6), 6),
    "cantlin-1f": inn_entry("cantlin-1f", (4, 25), 6),
}

# Every tool shop that stocks herbs: the AI restocks wherever it happens to be.
item_shops = {}
for s in shops:
    if s.get("type") != "item_shop":
        continue
    herb = next((e for e in s["inventory"] if e["item_id"] == "herb"), None)
    if herb is None or s["map_key"] in item_shops:
        continue
    npc = tuple(s["npc_tile"])
    desk = tuple(s["desk_tile"])
    prefer = None
    dx, dy = desk[0] - npc[0], desk[1] - npc[1]
    for f, d in DIRS.items():
        if d == (-dx, -dy):
            prefer = f
    tile, face = stand_facing(s["map_key"], desk, avoid=npc, prefer=prefer)
    item_shops[s["map_key"]] = {
        "shop_id": s["id"], "tile": {"col": tile[0], "row": tile[1]}, "face": face, "price": herb["price"],
    }

out = {
    "_comment": "Generated by tools/gen_milestones.py — ordered objectives for the Player AI play-the-game mode.",
    "version": 1,
    "milestones": milestones,
    "inns": inns,
    "item_shops": item_shops,
}
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=2)
    fh.write("\n")
print(f"wrote {len(milestones)} milestones -> {os.path.relpath(OUT, ROOT)}")
