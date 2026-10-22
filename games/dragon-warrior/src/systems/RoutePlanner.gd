extends RefCounted
## RoutePlanner.gd — Cross-map route planning for the in-engine Player AI.
##
## Runs a breadth-first search over (map_key, tile) states using the same
## static data the game itself loads (`map_grids.json`, `worldmap_terrain.json`,
## `tile_walkability.json`, `stair_registry.json`,
## `map_start_positions_from_world.json`). The resulting plan is a list of
## LEGS. Each leg is confined to a single map and ends either at the final
## destination or on a tile where a map transition happens:
##
##   via = "arrive"  — destination tile reached, nothing else to do
##   via = "auto"    — stepping onto the tile transitions by itself
##                     (world warp tile, town border tile, cave mouth)
##   via = "stairs"  — the STAIRS command must be used on the tile
##   via = "step:<dir>" — press the direction once more to leave the map
##                     (Tantegel Castle 1F south gate)
##
## The planner never teleports: the AI walks every leg with real inputs and
## the live scene `_is_walkable()` is consulted while walking.

const WORLD_KEY := "world-map"
const BRIDGE_TILE := Vector2i(66, 51)
const BLOCKED_WORLD_TERRAIN := [0, 6, 9]  # water, mountain, wall
## Cost of one scene transition (stairs / warp) relative to walking one tile.
const TRANSITION_COST := 12
const TOWN_MAPS := ["brecconary-1f", "garinham-1f", "kol-1f", "rimuldar-1f", "cantlin-1f", "hauksness-1f"]

# World warp tile -> {map, spawn}. Entering is automatic on step except shrines.
const WORLD_WARPS := {
	Vector2i(45, 45): {"map": "tantegel-castle-1f", "kind": "auto"},
	Vector2i(50, 43): {"map": "brecconary-1f", "kind": "auto"},
	Vector2i(4, 4): {"map": "garinham-1f", "kind": "auto"},
	Vector2i(106, 12): {"map": "kol-1f", "kind": "auto"},
	Vector2i(104, 74): {"map": "rimuldar-1f", "kind": "auto"},
	Vector2i(75, 104): {"map": "cantlin-1f", "kind": "auto"},
	Vector2i(27, 91): {"map": "hauksness-1f", "kind": "auto"},
	Vector2i(30, 14): {"map": "erdricks-cave-b1", "kind": "auto"},
	Vector2i(31, 59): {"map": "mountain-cave-b1", "kind": "auto"},
	Vector2i(106, 46): {"map": "swamp-cave-b1", "kind": "auto", "entry": "swamp-cave-b1-entry-1"},
	Vector2i(106, 51): {"map": "swamp-cave-b1", "kind": "auto", "entry": "swamp-cave-b1-entry-2"},
	Vector2i(50, 50): {"map": "charlock-castle-1f", "kind": "auto"},
	Vector2i(83, 3): {"map": "northern-cave-b1", "kind": "stairs"},
	Vector2i(110, 111): {"map": "southern-cave-b1", "kind": "stairs"},
}

var _grids: Dictionary = {}          # map_key -> {w, h, grid}
var _walkable_ids: Dictionary = {}
var _stairs_at: Dictionary = {}      # "map:x,y" -> Array[{map,pos,via}]
var _entry_points: Dictionary = {}   # entry id -> {map, pos}
var _loaded: bool = false


func load_data() -> bool:
	if _loaded:
		return true
	var mg: Variant = _read_json("res://data/v1/map_grids.json")
	var wt: Variant = _read_json("res://assets/maps/worldmap_terrain.json")
	var tw: Variant = _read_json("res://data/v1/tile_walkability.json")
	var sr: Variant = _read_json("res://data/v1/stair_registry.json")
	var ep: Variant = _read_json("res://data/v1/map_start_positions_from_world.json")
	if not (mg is Dictionary and wt is Dictionary and tw is Dictionary and sr is Dictionary and ep is Dictionary):
		push_error("[RoutePlanner] missing map data files")
		return false
	for key: String in mg.get("maps", {}):
		var m: Dictionary = mg["maps"][key]
		var grid: Array = m.get("grid", [])
		_grids[key] = {"w": int(m.get("cols", (grid[0] as Array).size() if grid.size() > 0 else 0)), "h": int(m.get("rows", grid.size())), "grid": grid}
	var terrain: Array = wt.get("terrain", [])
	_grids[WORLD_KEY] = {"w": (terrain[0] as Array).size() if terrain.size() > 0 else 0, "h": terrain.size(), "grid": terrain}
	for tid in tw.get("walkable", []):
		_walkable_ids[int(tid)] = true

	var by_id: Dictionary = {}
	for map_key: String in sr:
		if map_key.begins_with("_"):
			continue
		for st: Dictionary in sr[map_key]:
			by_id[str(st["id"])] = {"map": map_key, "pos": Vector2i(int(st["tile"]["col"]), int(st["tile"]["row"]))}
	for map_key: String in sr:
		if map_key.begins_with("_") or map_key == WORLD_KEY:
			continue
		for st: Dictionary in sr[map_key]:
			var partner: Variant = by_id.get(str(st["to"]))
			if partner == null:
				continue
			var sk := _skey(map_key, Vector2i(int(st["tile"]["col"]), int(st["tile"]["row"])))
			if not _stairs_at.has(sk):
				_stairs_at[sk] = []
			(_stairs_at[sk] as Array).append({"map": str(partner["map"]), "pos": partner["pos"], "via": "stairs"})

	for item: Dictionary in ep.get("map_entry_points", []):
		var raw := str(item.get("map", ""))
		var norm := raw
		if raw == "hauksness":
			norm = "hauksness-1f"
		elif raw.begins_with("swamp-cave-b1"):
			norm = "swamp-cave-b1"
		var w: Dictionary = item.get("world", {})
		_entry_points[raw] = {"map": norm, "pos": Vector2i(int(w.get("x", 0)), int(w.get("y", 0)))}
	_loaded = true
	return true


func has_map(map_key: String) -> bool:
	return _grids.has(map_key)


func tile_id(map_key: String, pos: Vector2i) -> int:
	var m: Dictionary = _grids.get(map_key, {})
	var grid: Array = m.get("grid", [])
	if pos.y < 0 or pos.y >= grid.size():
		return -1
	var row: Array = grid[pos.y]
	if pos.x < 0 or pos.x >= row.size():
		return -1
	return int(row[pos.x])


func is_world_blocked(pos: Vector2i, bridge_built: bool) -> bool:
	if bridge_built and pos == BRIDGE_TILE:
		return false
	return tile_id(WORLD_KEY, pos) in BLOCKED_WORLD_TERRAIN


## Static walkability used for planning (mirrors tests/test_map_completeness.gd).
func is_tile_walkable(map_key: String, pos: Vector2i, bridge_built: bool) -> bool:
	if not _grids.has(map_key):
		return false
	var m: Dictionary = _grids[map_key]
	var w: int = int(m["w"])
	var h: int = int(m["h"])
	if pos.x < 0 or pos.y < 0 or pos.x >= w or pos.y >= h:
		return false
	var tid := tile_id(map_key, pos)
	if map_key == WORLD_KEY:
		return not is_world_blocked(pos, bridge_built)
	var is_border := (pos.x == 0 or pos.y == 0 or pos.x == w - 1 or pos.y == h - 1)
	if is_border:
		if map_key in TOWN_MAPS:
			return _walkable_ids.has(tid)
		if map_key == "charlock-castle-1f" and pos == Vector2i(10, h - 1):
			return true
		# Cave edge "exits" (erdricks (4,0), mountain (0,7), swamp (3,0)/(3,h-1)) are wall
		# tiles the live scenes never let the hero step onto; caves are left via stairs.
		return false
	if tid == 32 and map_key in ["hauksness-1f", "kol-1f"]:
		return true
	return _walkable_ids.has(tid)


func _skey(map_key: String, pos: Vector2i) -> String:
	return "%s:%d,%d" % [map_key, pos.x, pos.y]


func _entry_for(warp: Dictionary) -> Dictionary:
	var eid := str(warp.get("entry", warp.get("map", "")))
	if eid == "hauksness-1f":
		eid = "hauksness"
	var e: Variant = _entry_points.get(eid)
	if e == null:
		return {"map": str(warp["map"]), "pos": Vector2i(1, 1)}
	return e


## Transition edges leaving (map_key, pos). Each: {map, pos, via}
func _transitions(map_key: String, pos: Vector2i) -> Array:
	var out: Array = []
	var sk := _skey(map_key, pos)
	if _stairs_at.has(sk):
		for t in _stairs_at[sk]:
			out.append(t)
	var m: Dictionary = _grids.get(map_key, {})
	var w: int = int(m.get("w", 0))
	var h: int = int(m.get("h", 0))
	match map_key:
		WORLD_KEY:
			if WORLD_WARPS.has(pos):
				var warp: Dictionary = WORLD_WARPS[pos]
				var e := _entry_for(warp)
				out.append({"map": e["map"], "pos": e["pos"], "via": str(warp["kind"])})
		"tantegel-castle-1f":
			if pos == Vector2i(8, 8) or pos == Vector2i(30, 30):
				out.append({"map": "tantegel-castle-2f", "pos": Vector2i(9, 9), "via": "stairs"})
			if pos == Vector2i(13, 4):
				out.append({"map": "tantegel-castle-b1", "pos": Vector2i(1, 5), "via": "stairs"})
			if pos.y >= h - 2 and (pos.x == 11 or pos.x == 12):
				out.append({"map": WORLD_KEY, "pos": Vector2i(45, 45), "via": "step:down"})
		"tantegel-castle-2f":
			if pos == Vector2i(9, 9):
				out.append({"map": "tantegel-castle-1f", "pos": Vector2i(8, 8), "via": "stairs"})
		"tantegel-castle-b1":
			if pos == Vector2i(1, 5):
				out.append({"map": "tantegel-castle-1f", "pos": Vector2i(13, 4), "via": "stairs"})
		"brecconary-1f", "garinham-1f", "kol-1f", "rimuldar-1f", "cantlin-1f", "hauksness-1f":
			if pos.x == 0 or pos.y == 0 or pos.x == w - 1 or pos.y == h - 1:
				var world_tile := _world_tile_for_map(map_key)
				out.append({"map": WORLD_KEY, "pos": world_tile, "via": "auto"})
		"charlock-castle-1f":
			if pos == Vector2i(10, h - 1):
				out.append({"map": WORLD_KEY, "pos": Vector2i(50, 50), "via": "auto"})
	return out


func world_tile_for_map(map_key: String) -> Vector2i:
	return _world_tile_for_map(map_key)


func world_warp_tiles() -> Array:
	return WORLD_WARPS.keys()


func is_world_warp(pos: Vector2i) -> bool:
	return WORLD_WARPS.has(pos)


func grid_size(map_key: String) -> Vector2i:
	if not load_data() or not _grids.has(map_key):
		return Vector2i(0, 0)
	return Vector2i(int(_grids[map_key]["w"]), int(_grids[map_key]["h"]))


func _world_tile_for_map(map_key: String) -> Vector2i:
	for wpos: Vector2i in WORLD_WARPS:
		if str(WORLD_WARPS[wpos]["map"]) == map_key:
			return wpos
	return Vector2i(-1, -1)


## Plan a multi-map route. Returns [] when unreachable. Each leg:
## {map, start, target, via, next_map, next_pos, path: Array[Vector2i]}
func plan(from_map: String, from_pos: Vector2i, to_map: String, to_pos: Vector2i, bridge_built: bool) -> Array:
	if not load_data():
		return []
	if not _grids.has(from_map) or not _grids.has(to_map):
		return []
	var start := _skey(from_map, from_pos)
	var goal := _skey(to_map, to_pos)
	var came_from: Dictionary = {start: ""}
	var state_of: Dictionary = {start: {"map": from_map, "pos": from_pos}}
	var edge_via: Dictionary = {start: ""}
	var dist: Dictionary = {start: 0}
	# Dial's algorithm: walking costs 1 per tile, a scene transition costs
	# TRANSITION_COST so the planner never prefers "leave town and re-enter"
	# over simply walking across it.
	var buckets: Array = [[start]]
	var dirs: Array[Vector2i] = [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]
	var found := false
	var bi := 0
	while bi < buckets.size():
		if buckets[bi].is_empty():
			bi += 1
			continue
		var cur: String = buckets[bi].pop_front()
		if int(dist[cur]) != bi:
			continue
		if cur == goal:
			found = true
			break
		var st: Dictionary = state_of[cur]
		var cmap: String = st["map"]
		var cpos: Vector2i = st["pos"]
		# Tiles that warp automatically on step (town borders, cave mouths, world
		# warp tiles) are terminal for walking: the hero leaves the map the moment
		# he steps there, so they can only be the last tile of a leg.
		var trs: Array = _transitions(cmap, cpos)
		# A tile we were *warped onto* (e.g. the world tile outside a castle
		# door) is a fresh start, not a terminal: only tiles walked onto count.
		var terminal := false
		if cur != start and str(edge_via[cur]) == "walk":
			for tr in trs:
				if str(tr["via"]) != "stairs":
					terminal = true
		for d in dirs:
			if terminal:
				break
			var nxt: Vector2i = cpos + d
			if not is_tile_walkable(cmap, nxt, bridge_built):
				continue
			var nk := _skey(cmap, nxt)
			var nd := bi + 1
			if dist.has(nk) and int(dist[nk]) <= nd:
				continue
			dist[nk] = nd
			came_from[nk] = cur
			edge_via[nk] = "walk"
			state_of[nk] = {"map": cmap, "pos": nxt}
			_bucket_push(buckets, nd, nk)
		for tr in trs:
			var nk := _skey(str(tr["map"]), tr["pos"])
			var nd := bi + TRANSITION_COST
			if dist.has(nk) and int(dist[nk]) <= nd:
				continue
			dist[nk] = nd
			came_from[nk] = cur
			edge_via[nk] = str(tr["via"])
			state_of[nk] = {"map": str(tr["map"]), "pos": tr["pos"]}
			_bucket_push(buckets, nd, nk)
	if not found:
		return []

	# Reconstruct state chain
	var chain: Array = []
	var node := goal
	while node != "":
		chain.append({"key": node, "state": state_of[node], "via_in": edge_via[node]})
		node = came_from[node]
	chain.reverse()

	# Split into legs by transition edges
	var legs: Array = []
	var leg_path: Array = [from_pos]
	var leg_map := from_map
	var leg_start := from_pos
	for i in range(1, chain.size()):
		var entry: Dictionary = chain[i]
		var via: String = entry["via_in"]
		var s: Dictionary = entry["state"]
		if via == "walk":
			leg_path.append(s["pos"])
			continue
		legs.append({
			"map": leg_map,
			"start": leg_start,
			"target": leg_path[leg_path.size() - 1],
			"via": via,
			"next_map": s["map"],
			"next_pos": s["pos"],
			"path": leg_path,
		})
		leg_map = s["map"]
		leg_start = s["pos"]
		leg_path = [leg_start]
	legs.append({
		"map": leg_map,
		"start": leg_start,
		"target": leg_path[leg_path.size() - 1],
		"via": "arrive",
		"next_map": "",
		"next_pos": Vector2i(-1, -1),
		"path": leg_path,
	})
	return legs


func _bucket_push(buckets: Array, d: int, key: String) -> void:
	while buckets.size() <= d:
		buckets.append([])
	buckets[d].append(key)


## Full-map BFS inside one scene using a live walkability callable
## (`Callable(scene, "_is_walkable")`). Returns the path [start..goal] or [].
## `extra_passable` lists tiles treated as walkable even if the scene says no
## (e.g. the goal tile itself when it is an NPC / warp tile).
func bfs_live(start: Vector2i, goal: Vector2i, w: int, h: int, is_walkable: Callable, extra_passable: Array = [], blocked: Array = []) -> Array:
	if start == goal:
		return [start]
	var dirs: Array[Vector2i] = [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]
	var came_from: Dictionary = {start: start}
	var queue: Array[Vector2i] = [start]
	while not queue.is_empty():
		var cur: Vector2i = queue.pop_front()
		if cur == goal:
			break
		for d in dirs:
			var nxt: Vector2i = cur + d
			if nxt.x < 0 or nxt.y < 0 or nxt.x >= w or nxt.y >= h:
				continue
			if came_from.has(nxt):
				continue
			if nxt != goal and blocked.has(nxt):
				continue
			if not extra_passable.has(nxt) and not bool(is_walkable.call(nxt)):
				continue
			came_from[nxt] = cur
			queue.append(nxt)
	if not came_from.has(goal):
		return []
	var path: Array = []
	var n: Vector2i = goal
	while n != start:
		path.append(n)
		n = came_from[n]
	path.append(start)
	path.reverse()
	return path


func _read_json(path: String) -> Variant:
	var f := FileAccess.open(path, FileAccess.READ)
	if not f:
		return null
	return JSON.parse_string(f.get_as_text())
