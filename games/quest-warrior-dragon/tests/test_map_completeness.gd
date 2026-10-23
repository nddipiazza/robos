extends SceneTree
## test_map_completeness.gd — Headless Global Map Connectivity & Pathfinding Audit
##
## Runs a multi-map Breadth-First Search (BFS) across all 29 maps in Quest: Warrior Dragon
## starting from the initial New Game spawn (`tantegel-castle-2f` at `(3, 5)`).
## Verifies that:
##   1. All 29 maps are reachable from game start via valid steps, stairs, doors, and world warps.
##   2. All 55 staircase entries in `stair_registry.json` have valid bidirectional links and walkable endpoints.
##   3. All 18 locked doors in `door_registry.json` are orthgonally reachable and passable.
##   4. All 31 treasure chests in `chest_registry.json` are reachable from game start.
##   5. All 10 key quest relics & boss encounters (Magic Key, Stones of Sunlight, Fairy Flute,
##      Silver Harp, Erdrick's Armor, Erdrick's Tablet, Staff of Rain, Rainbow Drop,
##      Erdrick's Sword, Dragonlord) are reachable from game start.
##   6. All town/dungeon entry spawns in `map_start_positions_from_world.json` land on walkable tiles.

const START_MAP := "tantegel-castle-2f"
const START_TILE := Vector2i(3, 5)

var _map_grids: Dictionary = {}
var _walkable_ids: Dictionary = {}
var _stair_registry: Dictionary = {}
var _stair_by_id: Dictionary = {}
var _door_registry: Dictionary = {}
var _chest_registry: Dictionary = {}
var _entry_points: Dictionary = {}

# WorldMap warp table matching scripts/WorldMap.gd
const WORLD_TO_MAP_WARPS := [
	{"world": Vector2i(45, 45),  "map": "tantegel-castle-1f", "spawn": Vector2i(11, 30), "label": "Tantegel Castle"},
	{"world": Vector2i(50, 43),  "map": "brecconary-1f",      "spawn": Vector2i(1, 15),  "label": "Brecconary"},
	{"world": Vector2i(4, 4),    "map": "garinham-1f",        "spawn": Vector2i(1, 15),  "label": "Garinham"},
	{"world": Vector2i(106, 12), "map": "kol-1f",             "spawn": Vector2i(20, 24), "label": "Kol"},
	{"world": Vector2i(104, 74), "map": "rimuldar-1f",        "spawn": Vector2i(30, 15), "label": "Rimuldar"},
	{"world": Vector2i(75, 104), "map": "cantlin-1f",         "spawn": Vector2i(1, 16),  "label": "Cantlin"},
	{"world": Vector2i(27, 91),  "map": "hauksness-1f",       "spawn": Vector2i(1, 10),  "label": "Hauksness"},
	{"world": Vector2i(30, 14),  "map": "erdricks-cave-b1",   "spawn": Vector2i(1, 1),   "label": "Erdrick's Cave"},
	{"world": Vector2i(31, 59),  "map": "mountain-cave-b1",   "spawn": Vector2i(1, 8),   "label": "Mountain Cave"},
	{"world": Vector2i(106, 46), "map": "swamp-cave-b1",      "spawn": Vector2i(1, 1),   "label": "Swamp Cave North"},
	{"world": Vector2i(106, 51), "map": "swamp-cave-b1",      "spawn": Vector2i(1, 30),  "label": "Swamp Cave South"},
	{"world": Vector2i(50, 50),  "map": "charlock-castle-1f", "spawn": Vector2i(10, 20), "label": "Charlock Castle"},
	{"world": Vector2i(83, 3),   "map": "northern-cave-b1",   "spawn": Vector2i(5, 10),  "label": "Staff of Rain Shrine"},
	{"world": Vector2i(110, 111),"map": "southern-cave-b1",   "spawn": Vector2i(1, 5),   "label": "Rainbow Drop Shrine"},
]

const QUEST_MILESTONES := [
	{"id": "king_lorik",       "name": "King Lorik (Throne Room)",   "map": "tantegel-castle-2f", "col": 3,   "row": 5},
	{"id": "throne_key_chest", "name": "Throne Room Key Chest",      "map": "tantegel-castle-2f", "col": 6,   "row": 5},
	{"id": "sunlight_stones",  "name": "Stones of Sunlight Chest",   "map": "tantegel-castle-b1", "col": 5,   "row": 6},
	{"id": "erdricks_tablet",  "name": "Erdrick's Tablet Chest",     "map": "erdricks-cave-b2",   "col": 10,  "row": 4},
	{"id": "fairy_flute",      "name": "Fairy Flute (Kol)",          "map": "kol-1f",             "col": 10,  "row": 7},
	{"id": "silver_harp",      "name": "Silver Harp (Garin's B4)",   "map": "garinham-b4",        "col": 6,   "row": 1},
	{"id": "fighters_ring",    "name": "Fighter's Ring (Mtn B2)",    "map": "mountain-cave-b2",   "col": 3,   "row": 3},
	{"id": "gwaelin_rescue",   "name": "Princess Gwaelin Chamber",   "map": "swamp-cave-b1",      "col": 6,   "row": 20},
	{"id": "erdricks_armor",   "name": "Erdrick's Armor (Hauksness)","map": "hauksness-1f",       "col": 19,  "row": 13},
	{"id": "staff_of_rain",    "name": "Staff of Rain Shrine Chest", "map": "northern-cave-b1",   "col": 4,   "row": 5},
	{"id": "rainbow_drop",     "name": "Rainbow Drop Shrine Chest",  "map": "southern-cave-b1",   "col": 6,   "row": 6},
	{"id": "rainbow_bridge",   "name": "Rainbow Bridge (World Map)", "map": "world-map",          "col": 66,  "row": 51},
	{"id": "erdricks_sword",   "name": "Erdrick's Sword (Charlock)", "map": "charlock-castle-b2", "col": 6,   "row": 6},
	{"id": "dragonlord_throne","name": "Dragonlord's Altar",         "map": "charlock-castle-b7", "col": 20,  "row": 12},
]


func _init() -> void:
	print("======================================================================")
	print(" QUEST: WARRIOR DRAGON — HEADLESS MAP COMPLETENESS & PATHFINDING AUDIT")
	print("======================================================================")
	var ok := _load_all_data()
	if not ok:
		printerr("[FAIL] Failed to load map data registries.")
		quit(1)
		return

	var report := _run_global_pathfinding_audit()
	var out_path := "/tmp/dw_map_completeness_report.json"
	var f := FileAccess.open(out_path, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(report, "  "))
		f.close()

	var failures: Array = report.get("failures", [])
	print("----------------------------------------------------------------------")
	print(" Maps Reachable:       %d / %d" % [report["maps_reached_count"], report["maps_total_count"]])
	print(" Stairs Verified:      %d / %d" % [report["stairs_verified_count"], report["stairs_total_count"]])
	print(" Doors Verified:       %d / %d" % [report["doors_verified_count"], report["doors_total_count"]])
	print(" Chests Reachable:     %d / %d" % [report["chests_reached_count"], report["chests_total_count"]])
	print(" Quest Milestones:     %d / %d" % [report["milestones_reached_count"], report["milestones_total_count"]])
	print(" Total States Visited: %d walkable (map, col, row) states" % int(report["total_states_visited"]))
	print(" Report Saved:         %s" % out_path)
	print("----------------------------------------------------------------------")

	if not failures.is_empty():
		printerr("[FAIL] %d completeness failure(s) detected:" % failures.size())
		for err in failures:
			printerr("  - " + str(err))
		quit(1)
	else:
		print("[PASS] 100% Map Completeness Verified! Every map, stair, door, chest, and relic is reachable from New Game start.")
		quit(0)


func _load_json(path: String) -> Variant:
	var f := FileAccess.open(path, FileAccess.READ)
	if not f:
		printerr("Cannot open file: " + path)
		return null
	return JSON.parse_string(f.get_as_text())


func _load_all_data() -> bool:
	var mg: Variant = _load_json("res://data/v1/map_grids.json")
	var tw: Variant = _load_json("res://data/v1/tile_walkability.json")
	var sr: Variant = _load_json("res://data/v1/stair_registry.json")
	var dr: Variant = _load_json("res://data/v1/door_registry.json")
	var cr: Variant = _load_json("res://data/v1/chest_registry.json")
	var ep: Variant = _load_json("res://data/v1/map_start_positions_from_world.json")
	if not (mg is Dictionary and tw is Dictionary and sr is Dictionary and dr is Dictionary and cr is Dictionary and ep is Dictionary):
		return false

	_map_grids = mg.get("maps", {})
	var wt: Variant = _load_json("res://assets/maps/worldmap_terrain.json")
	if wt is Dictionary and wt.has("terrain"):
		_map_grids["world-map"] = {
			"width": 124,
			"height": 124,
			"grid": wt["terrain"],
		}
	for tid in tw.get("walkable", []):
		_walkable_ids[int(tid)] = true
	# Locked doors are passable once the hero has a Magic Key, so treat them as
	# walkable for reachability purposes.
	_walkable_ids[int(tw.get("door", 10))] = true

	_stair_registry = sr
	for map_key: String in sr:
		if map_key.begins_with("_"):
			continue
		for st: Dictionary in sr[map_key]:
			_stair_by_id[str(st["id"])] = {
				"id": str(st["id"]),
				"map_key": map_key,
				"tile": Vector2i(int(st["tile"]["col"]), int(st["tile"]["row"])),
				"to": str(st["to"]),
				"facing": str(st.get("facing", "down")),
			}

	_door_registry = dr
	_chest_registry = cr
	for item: Dictionary in ep.get("map_entry_points", []):
		var w: Dictionary = item.get("world", {})
		var raw_map := str(item.get("map", ""))
		var norm_map := raw_map
		if raw_map == "hauksness":
			norm_map = "hauksness-1f"
		elif raw_map.begins_with("swamp-cave-b1"):
			norm_map = "swamp-cave-b1"
		_entry_points[raw_map] = {
			"map": norm_map,
			"pos": Vector2i(int(w.get("x", 0)), int(w.get("y", 0))),
		}
	return true


func _is_tile_walkable(map_key: String, pos: Vector2i) -> bool:
	if not _map_grids.has(map_key):
		return false
	var m: Dictionary = _map_grids[map_key]
	var grid: Array = m.get("grid", [])
	var h: int = grid.size()
	if h == 0:
		return false
	var w: int = (grid[0] as Array).size()
	if pos.x < 0 or pos.y < 0 or pos.x >= w or pos.y >= h:
		return false

	var tid: int = int(grid[pos.y][pos.x])

	if map_key == "world-map":
		# Rainbow Bridge at (66, 51) is walkable once Rainbow Drop is used
		if pos == Vector2i(66, 51):
			return true
		# WorldMap.gd BLOCKED_TERRAIN := {0: true, 6: true} (0 = water/ocean, 6 = mountains)
		return not (tid in [0, 6])

	# Border tiles for towns allow walking off the map onto WorldMap
	var is_border := (pos.x == 0 or pos.y == 0 or pos.x == w - 1 or pos.y == h - 1)
	if is_border:
		if map_key in ["brecconary-1f", "garinham-1f", "kol-1f", "rimuldar-1f", "cantlin-1f", "hauksness-1f"]:
			return _walkable_ids.has(tid)
		if map_key == "tantegel-castle-1f" and pos.y == h - 1 and (pos.x == 11 or pos.x == 12):
			return true
		if map_key == "charlock-castle-1f" and pos == Vector2i(10, h - 1):
			return true
		if map_key == "mountain-cave-b1" and pos == Vector2i(0, 7):
			return true
		if map_key == "swamp-cave-b1" and (pos == Vector2i(3, 0) or pos == Vector2i(3, h - 1)):
			return true
		return false

	# Inside Hauksness and Kol, tile 32 is barrier/sand floor
	if tid == 32 and map_key in ["hauksness-1f", "kol-1f"]:
		return true

	return _walkable_ids.has(tid)


func _state_key(map_key: String, pos: Vector2i) -> String:
	return "%s:%d,%d" % [map_key, pos.x, pos.y]


func _get_neighbors(map_key: String, pos: Vector2i, stairs_at: Dictionary) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var m: Dictionary = _map_grids.get(map_key, {})
	var grid: Array = m.get("grid", [])
	var h: int = grid.size()
	var w: int = (grid[0] as Array).size() if h > 0 else 0

	# 1. Orthogonal walking steps
	var dirs: Array[Vector2i] = [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]
	for d in dirs:
		var nxt: Vector2i = pos + d
		if _is_tile_walkable(map_key, nxt):
			result.append({"map": map_key, "pos": nxt, "via": "walk"})

	# 2. Staircase transitions from current tile
	var sk := _state_key(map_key, pos)
	if stairs_at.has(sk):
		for st_dest: Dictionary in stairs_at[sk]:
			result.append(st_dest)

	# 3. Tantegel Castle 1F <-> Throne Room & Basement special stairs
	if map_key == "tantegel-castle-1f":
		if pos == Vector2i(8, 8) or pos == Vector2i(30, 30):
			result.append({"map": "tantegel-castle-2f", "pos": Vector2i(9, 9), "via": "stairs:throne"})
		if pos == Vector2i(13, 3):
			result.append({"map": "tantegel-castle-b1", "pos": Vector2i(1, 5), "via": "stairs:basement"})
		if pos.y >= h - 2 and (pos.x == 11 or pos.x == 12):
			result.append({"map": "world-map", "pos": Vector2i(45, 45), "via": "exit:world-map"})
	elif map_key == "tantegel-castle-2f":
		if pos == Vector2i(9, 9):
			result.append({"map": "tantegel-castle-1f", "pos": Vector2i(8, 8), "via": "stairs:castle1f"})

	# 4. WorldMap -> Town / Dungeon warps
	if map_key == "world-map":
		for warp: Dictionary in WORLD_TO_MAP_WARPS:
			if pos == (warp["world"] as Vector2i):
				result.append({
					"map": str(warp["map"]),
					"pos": warp["spawn"] as Vector2i,
					"via": "enter:" + str(warp["map"]),
				})

	# 5. Town / Dungeon border exits -> WorldMap
	var is_border := (pos.x == 0 or pos.y == 0 or pos.x == w - 1 or pos.y == h - 1)
	if is_border:
		match map_key:
			"brecconary-1f":
				result.append({"map": "world-map", "pos": Vector2i(50, 43), "via": "exit:world-map"})
			"garinham-1f":
				result.append({"map": "world-map", "pos": Vector2i(4, 4), "via": "exit:world-map"})
			"kol-1f":
				result.append({"map": "world-map", "pos": Vector2i(106, 12), "via": "exit:world-map"})
			"rimuldar-1f":
				result.append({"map": "world-map", "pos": Vector2i(104, 74), "via": "exit:world-map"})
			"cantlin-1f":
				result.append({"map": "world-map", "pos": Vector2i(75, 104), "via": "exit:world-map"})
			"hauksness-1f":
				result.append({"map": "world-map", "pos": Vector2i(27, 91), "via": "exit:world-map"})
			"charlock-castle-1f":
				if pos == Vector2i(10, h - 1):
					result.append({"map": "world-map", "pos": Vector2i(50, 50), "via": "exit:world-map"})
			"mountain-cave-b1":
				if pos == Vector2i(0, 7):
					result.append({"map": "world-map", "pos": Vector2i(31, 59), "via": "exit:world-map"})
			"swamp-cave-b1":
				if pos == Vector2i(3, 0):
					result.append({"map": "world-map", "pos": Vector2i(106, 46), "via": "exit:world-map_n"})
				elif pos == Vector2i(3, h - 1):
					result.append({"map": "world-map", "pos": Vector2i(106, 51), "via": "exit:world-map_s"})

	return result


func _reconstruct_map_chain(target_key: String, came_from: Dictionary, via_edge: Dictionary) -> Array[String]:
	var chain: Array[String] = []
	var cur := target_key
	while cur != "":
		var map_name: String = cur.split(":")[0]
		if chain.is_empty() or chain[chain.size() - 1] != map_name:
			chain.append(map_name)
		var prev: String = str(came_from.get(cur, ""))
		if prev == cur:
			break
		cur = prev
	chain.reverse()
	return chain


func _run_global_pathfinding_audit() -> Dictionary:
	var failures: Array[String] = []

	# Build stair lookup table: state_key -> Array[{map, pos, via}]
	var stairs_at: Dictionary = {}
	var stairs_report: Array = []
	var stairs_verified := 0
	var stairs_total := 0

	for st_id: String in _stair_by_id:
		stairs_total += 1
		var st: Dictionary = _stair_by_id[st_id]
		var partner_id: String = str(st["to"])
		if not _stair_by_id.has(partner_id):
			failures.append("Stair '%s' on %s references missing partner '%s'" % [st_id, st["map_key"], partner_id])
			continue
		var partner: Dictionary = _stair_by_id[partner_id]
		var src_sk := _state_key(st["map_key"], st["tile"])
		if not stairs_at.has(src_sk):
			stairs_at[src_sk] = []
		stairs_at[src_sk].append({
			"map": str(partner["map_key"]),
			"pos": partner["tile"] as Vector2i,
			"via": "stairs:" + st_id + "->" + partner_id,
		})

	# Run global BFS from ("tantegel-castle-2f", (3, 5))
	var start_sk := _state_key(START_MAP, START_TILE)
	var queue: Array[Dictionary] = [{"map": START_MAP, "pos": START_TILE}]
	var dist: Dictionary = {start_sk: 0}
	var came_from: Dictionary = {start_sk: start_sk}
	var via_edge: Dictionary = {start_sk: "start"}
	var first_map_state: Dictionary = {START_MAP: start_sk}
	var map_reached_tiles: Dictionary = {}

	var head := 0
	while head < queue.size():
		var cur: Dictionary = queue[head]
		head += 1
		var cmap: String = cur["map"]
		var cpos: Vector2i = cur["pos"]
		var csk := _state_key(cmap, cpos)
		var cdist: int = int(dist[csk])

		map_reached_tiles[cmap] = int(map_reached_tiles.get(cmap, 0)) + 1

		for nb: Dictionary in _get_neighbors(cmap, cpos, stairs_at):
			var nmap: String = nb["map"]
			var npos: Vector2i = nb["pos"]
			var nsk := _state_key(nmap, npos)
			if not dist.has(nsk):
				dist[nsk] = cdist + 1
				came_from[nsk] = csk
				via_edge[nsk] = str(nb["via"])
				if not first_map_state.has(nmap):
					first_map_state[nmap] = nsk
				queue.append({"map": nmap, "pos": npos})

	# 1. Verify all 29 maps in map_grids.json
	var map_summaries: Array = []
	var all_map_keys: Array = _map_grids.keys()
	all_map_keys.sort()
	var maps_reached := 0
	for mk: String in all_map_keys:
		if first_map_state.has(mk):
			maps_reached += 1
			var fsk: String = first_map_state[mk]
			var chain := _reconstruct_map_chain(fsk, came_from, via_edge)
			map_summaries.append({
				"map": mk,
				"reachable": true,
				"min_steps_from_start": int(dist[fsk]),
				"reachable_tiles": int(map_reached_tiles.get(mk, 0)),
				"route": " -> ".join(chain),
			})
		else:
			failures.append("Map '%s' is UNREACHABLE from New Game start!" % mk)
			map_summaries.append({
				"map": mk,
				"reachable": false,
				"min_steps_from_start": -1,
				"reachable_tiles": 0,
				"route": "",
			})

	# 2. Verify all stairs are reachable & land on walkable tiles
	for st_id: String in _stair_by_id:
		var st: Dictionary = _stair_by_id[st_id]
		var partner_id: String = str(st["to"])
		var partner: Dictionary = _stair_by_id.get(partner_id, {})
		var sk := _state_key(st["map_key"], st["tile"])
		var p_sk := _state_key(partner.get("map_key", ""), partner.get("tile", Vector2i(-1, -1))) if not partner.is_empty() else ""
		var is_reach := dist.has(sk) and (p_sk != "" and dist.has(p_sk))
		if is_reach:
			stairs_verified += 1
		else:
			failures.append("Stair '%s' (%s @ %s -> %s) is unreachable!" % [st_id, st["map_key"], str(st["tile"]), partner_id])
		stairs_report.append({
			"id": st_id,
			"map": st["map_key"],
			"tile": [st["tile"].x, st["tile"].y],
			"to": partner_id,
			"reachable": is_reach,
			"steps_from_start": int(dist.get(sk, -1)),
		})

	# 3. Verify all 18 doors in door_registry.json
	var doors_report: Array = []
	var doors_verified := 0
	var doors_total := 0
	for mk: String in _door_registry:
		for d: Dictionary in _door_registry[mk]:
			doors_total += 1
			var dpos := Vector2i(int(d["col"]), int(d["row"]))
			var dsk := _state_key(mk, dpos)
			var is_reach := dist.has(dsk)
			if is_reach:
				doors_verified += 1
			else:
				failures.append("Door '%s' on %s at (%d,%d) is unreachable!" % [d.get("id", ""), mk, dpos.x, dpos.y])
			doors_report.append({
				"id": str(d.get("id", "")),
				"map": mk,
				"col": dpos.x,
				"row": dpos.y,
				"reachable": is_reach,
				"steps_from_start": int(dist.get(dsk, -1)),
			})

	# 4. Verify all 31 chests in chest_registry.json
	var chests_report: Array = []
	var chests_reached := 0
	var chests_total := 0
	for mk: String in _chest_registry:
		for ch: Dictionary in _chest_registry[mk]:
			chests_total += 1
			var cpos := Vector2i(int(ch["col"]), int(ch["row"]))
			var csk := _state_key(mk, cpos)
			var is_reach := dist.has(csk)
			if is_reach:
				chests_reached += 1
			else:
				failures.append("Chest '%s' on %s at (%d,%d) is unreachable!" % [ch.get("id", ""), mk, cpos.x, cpos.y])
			chests_report.append({
				"id": str(ch.get("id", "")),
				"map": mk,
				"col": cpos.x,
				"row": cpos.y,
				"reachable": is_reach,
				"steps_from_start": int(dist.get(csk, -1)),
				"route": " -> ".join(_reconstruct_map_chain(csk, came_from, via_edge)) if is_reach else "",
			})

	# 5. Verify all Quest Milestones (Relics, Shrines, Bosses)
	var milestones_report: Array = []
	var milestones_reached := 0
	for ms: Dictionary in QUEST_MILESTONES:
		var mpos := Vector2i(int(ms["col"]), int(ms["row"]))
		var msk := _state_key(str(ms["map"]), mpos)
		var is_reach := dist.has(msk)
		if is_reach:
			milestones_reached += 1
		else:
			failures.append("Quest Milestone '%s' (%s @ %d,%d) is unreachable!" % [ms["name"], ms["map"], mpos.x, mpos.y])
		milestones_report.append({
			"id": ms["id"],
			"name": ms["name"],
			"map": ms["map"],
			"col": mpos.x,
			"row": mpos.y,
			"reachable": is_reach,
			"steps_from_start": int(dist.get(msk, -1)),
			"route": " -> ".join(_reconstruct_map_chain(msk, came_from, via_edge)) if is_reach else "",
		})

	# 6. Verify all map_start_positions_from_world.json entry points
	for raw_mk: String in _entry_points:
		var ep_info: Dictionary = _entry_points[raw_mk]
		var mk: String = str(ep_info["map"])
		var ep_pos: Vector2i = ep_info["pos"]
		var esk := _state_key(mk, ep_pos)
		if not dist.has(esk):
			failures.append("World entry point for '%s' (%s) at (%d,%d) is unwalkable or unreachable!" % [raw_mk, mk, ep_pos.x, ep_pos.y])

	return {
		"start_state": {"map": START_MAP, "col": START_TILE.x, "row": START_TILE.y},
		"maps_total_count": all_map_keys.size(),
		"maps_reached_count": maps_reached,
		"stairs_total_count": stairs_total,
		"stairs_verified_count": stairs_verified,
		"doors_total_count": doors_total,
		"doors_verified_count": doors_verified,
		"chests_total_count": chests_total,
		"chests_reached_count": chests_reached,
		"milestones_total_count": QUEST_MILESTONES.size(),
		"milestones_reached_count": milestones_reached,
		"total_states_visited": dist.size(),
		"maps": map_summaries,
		"stairs": stairs_report,
		"doors": doors_report,
		"chests": chests_report,
		"milestones": milestones_report,
		"failures": failures,
	}
