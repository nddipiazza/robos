extends RefCounted
class_name RTSMapDocument

# RTSMapDocument.gd — Editable RTS map/scenario model for the Starfall Command Map Editor.
# Holds a scenario in exactly the shape `SimEngine.load_scenario_dict()` consumes (plus `ramps`),
# with snapshot-based undo/redo, hit-testing, validation, and JSON-LD (`scenarios/*.jsonld`) I/O.

signal changed

const SCENARIOS_DIR = "res://scenarios"
const RECT_LAYERS = ["obstacles", "high_ground", "ramps"]
const ITEM_LAYERS = ["units", "resources", "ramps", "high_ground", "obstacles"] # hit-test order (topmost first)
const RESOURCE_TYPES = ["crystal_field", "aether_vent"]
const RESOURCE_RADIUS = {"crystal_field": 1.8, "aether_vent": 2.6}
const RESOURCE_DEFAULT_AMOUNT = {"crystal_field": 1500, "aether_vent": 2250}
const FACTIONS = ["humans", "monsters", "aliens"]
const DIRECTIVE_MODES = ["idle", "swarm_rush", "stutter_step_kite", "phase_skirmisher_micro", "macro_build", "emplace_defend"]
const MAX_UNDO = 200
const TERRAIN_CELL_SIZE = 4.0
const TERRAIN_TYPES = ["land", "water", "cliff", "plateau"]
const Brush = preload("res://third_party/crusade/brush_core.gd")
const Fill = preload("res://third_party/crusade/flood_fill.gd")
var _water_cache: Array[PackedVector2Array] = []
var _water_hash: int = 0

var data: Dictionary = {}
var file_path: String = ""
var dirty: bool = false

var _undo_stack: Array[Dictionary] = []
var _redo_stack: Array[Dictionary] = []

func _init() -> void:
	new_blank()

# -------------------------------------------------------------------------
# Lifecycle & I/O
# -------------------------------------------------------------------------

func new_blank(width: float = 128.0, height: float = 96.0) -> void:
	data = {
		"id": "untitled-map",
		"label": "Untitled Map",
		"seed": 42,
		"width": width,
		"height": height,
		"obstacles": [],
		"high_ground": [],
		"ramps": [],
		"resources": [],
		"units": [],
		"players": _default_players(),
		"directives": []
	}
	_init_map_extensions({}, {})
	file_path = ""
	dirty = false
	_undo_stack.clear()
	_redo_stack.clear()
	emit_signal("changed")

func _default_players() -> Dictionary:
	return {
		"1": {"faction": "humans", "crystal": 400, "aether": 150},
		"2": {"faction": "monsters", "crystal": 400, "aether": 150},
		"3": {"faction": "aliens", "crystal": 400, "aether": 150}
	}

func load_scenario(scn: Dictionary, path: String = "") -> void:
	var map_cfg: Dictionary = scn.get("map", {})
	var slug = str(scn.get("@id", "")).get_slice(":", str(scn.get("@id", "")).get_slice_count(":") - 1)
	if slug == "" and path != "":
		slug = path.get_file().get_basename()
	data = {
		"id": slug if slug != "" else "untitled-map",
		"label": str(scn.get("rdfs:label", scn.get("name", "Untitled Map"))),
		"seed": int(scn.get("seed", 42)),
		"width": float(map_cfg.get("width", 128.0)),
		"height": float(map_cfg.get("height", 96.0)),
		"obstacles": _read_rects(map_cfg.get("obstacles", []), 4.0),
		"high_ground": _read_rects(map_cfg.get("high_ground", []), 20.0),
		"ramps": _read_rects(map_cfg.get("ramps", []), 10.0),
		"resources": [],
		"units": [],
		"players": _default_players(),
		"directives": []
	}
	_init_map_extensions(scn, map_cfg)
	for r in scn.get("resources", []):
		var rtype = str(r.get("type", "crystal_field"))
		var resource_entry: Dictionary = r.duplicate(true)
		resource_entry.merge({
			"id": str(r.get("id", "")),
			"type": rtype,
			"x": float(r.get("x", 20.0)),
			"y": float(r.get("y", 20.0)),
			"amount": int(r.get("amount", RESOURCE_DEFAULT_AMOUNT.get(rtype, 1500)))
		}, true)
		data["resources"].append(resource_entry)
	if data.mode == "skirmish" and not scn.has("resources"):
		_generate_site_resources()
	for u in scn.get("units", []):
		var entry = {
			"id": str(u.get("id", "")),
			"type": str(u.get("type", "rifleman")),
			"owner": int(u.get("owner", u.get("player", 1))),
			"count": int(u.get("count", 1)),
			"x": float(u.get("x", 30.0)),
			"y": float(u.get("y", 30.0)),
			"spread": float(u.get("spread", 2.1)),
			"auto_harvest": bool(u.get("auto_harvest", false))
		}
		if u.has("hp"):
			entry["hp"] = float(u["hp"])
		if u.has("shields"):
			entry["shields"] = float(u["shields"])
		var preserved_unit: Dictionary = u.duplicate(true)
		preserved_unit.merge(entry, true)
		data["units"].append(preserved_unit)
	var p_cfg: Dictionary = scn.get("players", {})
	for key in p_cfg.keys():
		var pid = str(int(key))
		if data["players"].has(pid):
			var pd: Dictionary = p_cfg[key]
			var player_data: Dictionary = pd.duplicate(true)
			player_data.merge({
				"faction": str(pd.get("faction", data["players"][pid]["faction"])),
				"crystal": int(pd.get("crystal", 400)),
				"aether": int(pd.get("aether", 150))
			}, true)
			data["players"][pid] = player_data
	for d in scn.get("directives", []):
		var pid = int(d.get("player", d.get("owner", 2)))
		set_directive(pid, {
			"mode": str(d.get("mode", d.get("strategy", "swarm_rush"))).to_lower(),
			"enabled": bool(d.get("enabled", true)),
			"target_x": float(d.get("target_x", 64.0 if pid != 2 else 36.0)),
			"target_y": float(d.get("target_y", 48.0))
		}, false)
	file_path = path
	dirty = false
	_undo_stack.clear()
	_redo_stack.clear()
	emit_signal("changed")

func _init_map_extensions(scenario: Dictionary, map_cfg: Dictionary) -> void:
	data["source"] = scenario.duplicate(true)
	data["mode"] = scenario.get("mode", "scenario")
	data["difficulty"] = scenario.get("difficulty", "normal")
	data["strategy"] = scenario.get("strategy", "balanced")
	data["unlimited_resources"] = scenario.get("unlimited_resources", false)
	data["starts"] = map_cfg.get("starts", []).duplicate(true)
	data["expansions"] = map_cfg.get("expansions", []).duplicate(true)
	data["water_channels"] = map_cfg.get("water_channels", []).duplicate(true)
	data["bridges"] = map_cfg.get("bridges", []).duplicate(true)
	data["terrain_tiles"] = {}
	for tile in map_cfg.get("terrain_tiles", []):
		var cell = Vector2i(int(float(tile.x) / TERRAIN_CELL_SIZE), int(float(tile.y) / TERRAIN_CELL_SIZE))
		data.terrain_tiles[_cell_key(cell)] = str(tile.terrain)
	_water_hash = 0

func _cell_key(cell: Vector2i) -> String:
	return "%d,%d" % [cell.x, cell.y]

func _generate_site_resources() -> void:
	var map := {"width":data.width,"height":data.height,"starts":data.starts,"expansions":data.expansions,
		"water_channels":data.water_channels,"bridges":data.bridges,"obstacles":data.obstacles,"terrain_tiles":[]}
	for key in data.terrain_tiles:
		var cell := str(key).split(",")
		map.terrain_tiles.append({"x":int(cell[0])*4,"y":int(cell[1])*4,"terrain":data.terrain_tiles[key]})
	data.resources.append_array(preload("res://scripts/engine/RTSResourceLayout.gd").for_map(map))

func terrain_at(cell: Vector2i) -> String:
	var key = _cell_key(cell)
	if data.terrain_tiles.has(key):
		return data.terrain_tiles[key]
	var pos = (Vector2(cell) + Vector2(0.5, 0.5)) * TERRAIN_CELL_SIZE
	for bridge in data.bridges:
		if item_rect(bridge).has_point(pos):
			return "land"
	for rect in data.obstacles:
		if item_rect(rect).has_point(pos):
			return "cliff"
	for polygon in water_polygons():
		if Geometry2D.is_point_in_polygon(pos, polygon):
			return "water"
	for rect in data.high_ground:
		if item_rect(rect).has_point(pos):
			return "plateau"
	return "land"

func water_polygons() -> Array[PackedVector2Array]:
	var signature = hash(data.water_channels)
	if signature != _water_hash:
		_water_hash = signature
		_water_cache.clear()
		for channel in data.water_channels:
			var points = PackedVector2Array()
			for point in channel.points:
				points.append(Vector2(float(point[0]), float(point[1])))
			if points.size() >= 2:
				for polygon in Geometry2D.offset_polyline(points, float(channel.width) * 0.5, Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
					_water_cache.append(polygon)
	return _water_cache

func paint_terrain(pos: Vector2, terrain: String, brush_size: int = 1, record_undo: bool = true) -> bool:
	if not terrain in TERRAIN_TYPES:
		return false
	var center = Vector2i(int(floor(pos.x / TERRAIN_CELL_SIZE)), int(floor(pos.y / TERRAIN_CELL_SIZE)))
	var changed = false
	var half = int(brush_size / 2)
	for x in range(center.x - half, center.x - half + brush_size):
		for y in range(center.y - half, center.y - half + brush_size):
			var cell = Vector2i(x, y)
			if not _terrain_bounds().has_point(cell):
				continue
			var current = TERRAIN_TYPES.find(terrain_at(cell))
			var decision = Brush.resolve(Brush.Mode.PAINT, current, Vector2i.ZERO, TERRAIN_TYPES.find(terrain), Vector2i.ZERO)
			if decision.action == Brush.Action.WRITE:
				if not changed and record_undo:
					checkpoint()
				data.terrain_tiles[_cell_key(cell)] = terrain
				changed = true
	if changed:
		emit_signal("changed")
	return changed

func _terrain_bounds() -> Rect2i:
	return Rect2i(0, 0, int(ceil(float(data.width) / TERRAIN_CELL_SIZE)), int(ceil(float(data.height) / TERRAIN_CELL_SIZE)))

func _read_terrain(cell: Vector2i) -> Dictionary:
	return {"src": TERRAIN_TYPES.find(terrain_at(cell)), "atlas": Vector2i.ZERO}

func _terrain_neighbors(cell: Vector2i) -> Array[Vector2i]:
	return [cell + Vector2i.LEFT, cell + Vector2i.RIGHT, cell + Vector2i.UP, cell + Vector2i.DOWN]

func fill_terrain(pos: Vector2, terrain: String) -> int:
	if not terrain in TERRAIN_TYPES:
		return 0
	var seed = Vector2i(int(floor(pos.x / TERRAIN_CELL_SIZE)), int(floor(pos.y / TERRAIN_CELL_SIZE)))
	if not _terrain_bounds().has_point(seed) or terrain_at(seed) == terrain:
		return 0
	var cells = Fill.compute(seed, TERRAIN_TYPES.find(terrain_at(seed)), Vector2i.ZERO, _terrain_bounds(), _read_terrain, _terrain_neighbors, _terrain_bounds().get_area())
	if not cells.is_empty():
		checkpoint()
		for cell in cells:
			data.terrain_tiles[_cell_key(cell)] = terrain
		emit_signal("changed")
	return cells.size()

func add_marker(layer: String, pos: Vector2) -> Dictionary:
	if not layer in ["starts", "expansions"]:
		return {}
	checkpoint()
	data[layer].append({"x": pos.x, "y": pos.y})
	emit_signal("changed")
	return {"layer": layer, "index": data[layer].size() - 1}

func _read_rects(arr: Array, default_size: float) -> Array:
	var out: Array = []
	for r in arr:
		out.append({
			"x": float(r.get("x", 0.0)),
			"y": float(r.get("y", 0.0)),
			"w": float(r.get("w", r.get("width", default_size))),
			"h": float(r.get("h", r.get("height", default_size)))
		})
	return out

func load_file(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"ok": false, "error": "File not found: " + path}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": false, "error": "Not a JSON scenario object: " + path}
	load_scenario(parsed, path)
	return {"ok": true, "path": path}

func default_save_path() -> String:
	return "%s/%s.jsonld" % [SCENARIOS_DIR, slugify(str(data["id"]))]

func save_file(path: String = "") -> Dictionary:
	if path == "":
		path = default_save_path()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(path.get_base_dir()))
	var temporary = path + ".tmp"
	var f = FileAccess.open(temporary, FileAccess.WRITE)
	if f == null:
		return {"ok": false, "error": "Cannot write %s (error %d)" % [path, FileAccess.get_open_error()]}
	f.store_string(JSON.stringify(to_scenario(), "  ", false) + "\n")
	f.flush()
	f.close()
	var save_error = DirAccess.rename_absolute(ProjectSettings.globalize_path(temporary), ProjectSettings.globalize_path(path))
	if save_error != OK:
		return {"ok": false, "error": "Could not replace map file (error %d); saved data remains in %s" % [save_error, temporary]}
	file_path = path
	dirty = false
	emit_signal("changed")
	return {"ok": true, "path": path}

# Serializes into the scenario JSON-LD consumed by SimEngine / GameControlServer `/scenario`.
func to_scenario() -> Dictionary:
	var slug = slugify(str(data["id"]))
	var map_cfg = {
		"width": data["width"],
		"height": data["height"],
		"obstacles": data["obstacles"].duplicate(true),
		"high_ground": data["high_ground"].duplicate(true),
		"ramps": data["ramps"].duplicate(true)
	}
	if not data["high_ground"].is_empty():
		map_cfg["high_ground"] = data["high_ground"].duplicate(true)
	if not data["ramps"].is_empty():
		map_cfg["ramps"] = data["ramps"].duplicate(true)
	for field in ["starts", "expansions", "water_channels", "bridges"]:
		map_cfg[field] = data[field].duplicate(true)
	map_cfg["terrain_tiles"] = []
	for key in data.terrain_tiles:
		var coords = str(key).split(",")
		map_cfg.terrain_tiles.append({"x": int(coords[0]) * TERRAIN_CELL_SIZE, "y": int(coords[1]) * TERRAIN_CELL_SIZE, "terrain": data.terrain_tiles[key]})
	var preserved_map: Dictionary = data.source.get("map", {}).duplicate(true)
	preserved_map.merge(map_cfg, true)
	map_cfg = preserved_map

	var units_out: Array = []
	for u in data["units"]:
		var e: Dictionary = u.duplicate(true)
		if str(u["id"]) != "":
			e["id"] = u["id"]
		e["type"] = u["type"]
		e["owner"] = u["owner"]
		e["count"] = u["count"]
		e["x"] = u["x"]
		e["y"] = u["y"]
		if int(u["count"]) > 1:
			e["spread"] = u["spread"]
		if bool(u.get("auto_harvest", false)):
			e["auto_harvest"] = true
		for opt in ["hp", "shields"]:
			if u.has(opt):
				e[opt] = u[opt]
		units_out.append(e)

	var res_out: Array = []
	for r in data["resources"]:
		var e: Dictionary = r.duplicate(true)
		if str(r["id"]) != "":
			e["id"] = r["id"]
		e["type"] = r["type"]
		e["x"] = r["x"]
		e["y"] = r["y"]
		e["amount"] = r["amount"]
		res_out.append(e)

	var dir_out: Array = []
	for d in data["directives"]:
		dir_out.append(d.duplicate(true))

	var scn = {
		"@context": {
			"robos": "https://robos.dev/ns/kgraph#",
			"rdfs": "http://www.w3.org/2000/01/rdf-schema#"
		},
		"@id": "urn:robos:rts:scenario:%s" % slug,
		"@type": "robos:RTSTestScenario",
		"rdfs:label": data["label"],
		"name": data["label"],
		"seed": data["seed"],
		"map": map_cfg,
		"players": data["players"].duplicate(true)
	}
	scn["resources"] = res_out
	scn["units"] = units_out
	scn["directives"] = dir_out
	var preserved: Dictionary = data.source.duplicate(true)
	preserved.merge(scn, true)
	preserved["mode"] = data.mode
	preserved["difficulty"] = data.difficulty
	preserved["strategy"] = data.strategy
	preserved["unlimited_resources"] = data.unlimited_resources
	var saved_players: Dictionary = data.source.get("players", {}).duplicate(true)
	saved_players.merge(data.players.duplicate(true), true)
	preserved["players"] = saved_players
	preserved["format_version"] = int(data.source.get("format_version", 1))
	return preserved

static func slugify(text: String) -> String:
	var out = ""
	var last_dash = false
	for ch in text.to_lower():
		var ok = (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9")
		if ok:
			out += ch
			last_dash = false
		elif not last_dash and out != "":
			out += "-"
			last_dash = true
	out = out.trim_suffix("-")
	return out if out != "" else "untitled-map"

static func list_scenarios() -> Array[String]:
	var out: Array[String] = []
	var dir = DirAccess.open(SCENARIOS_DIR)
	if dir == null:
		return out
	for f in dir.get_files():
		if f.ends_with(".jsonld") or f.ends_with(".json"):
			out.append("%s/%s" % [SCENARIOS_DIR, f])
	out.sort()
	return out

# -------------------------------------------------------------------------
# Undo / Redo (whole-document snapshots; maps are small)
# -------------------------------------------------------------------------

func checkpoint() -> void:
	_undo_stack.append(data.duplicate(true))
	if _undo_stack.size() > MAX_UNDO:
		_undo_stack.pop_front()
	_redo_stack.clear()
	dirty = true

# Pushes a snapshot captured earlier (e.g. at drag start) once the edit is known to have happened.
func commit_snapshot(snapshot: Dictionary) -> void:
	_undo_stack.append(snapshot)
	if _undo_stack.size() > MAX_UNDO:
		_undo_stack.pop_front()
	_redo_stack.clear()
	dirty = true
	emit_signal("changed")

func can_undo() -> bool:
	return not _undo_stack.is_empty()

func can_redo() -> bool:
	return not _redo_stack.is_empty()

func undo() -> bool:
	if _undo_stack.is_empty():
		return false
	_redo_stack.append(data)
	data = _undo_stack.pop_back()
	dirty = true
	emit_signal("changed")
	return true

func redo() -> bool:
	if _redo_stack.is_empty():
		return false
	_undo_stack.append(data)
	data = _redo_stack.pop_back()
	dirty = true
	emit_signal("changed")
	return true

# -------------------------------------------------------------------------
# Editing. Items are addressed by refs: {"layer": String, "index": int}
# -------------------------------------------------------------------------

func set_map_property(key: String, value) -> void:
	if data.get(key) == value:
		return
	checkpoint()
	data[key] = value
	emit_signal("changed")

func set_player_property(pid: int, key: String, value) -> void:
	var p: Dictionary = data["players"][str(pid)]
	if p.get(key) == value:
		return
	checkpoint()
	p[key] = value
	emit_signal("changed")

func get_directive(pid: int) -> Dictionary:
	for d in data["directives"]:
		if int(d["player"]) == pid:
			return d
	return {"player": pid, "mode": "idle", "enabled": false, "target_x": data["width"] * 0.5, "target_y": data["height"] * 0.5}

# Merges `fields` into the player's directive. A disabled idle directive is dropped from the file.
func set_directive(pid: int, fields: Dictionary, record_undo: bool = true) -> void:
	var d = get_directive(pid).duplicate(true)
	d.merge(fields, true)
	d["player"] = pid
	if record_undo:
		checkpoint()
	var kept: Array = []
	for existing in data["directives"]:
		if int(existing["player"]) != pid:
			kept.append(existing)
	if bool(d["enabled"]) or str(d["mode"]) != "idle":
		kept.append(d)
	kept.sort_custom(func(a, b): return int(a["player"]) < int(b["player"]))
	data["directives"] = kept
	if record_undo:
		emit_signal("changed")

func add_rect(layer: String, rect: Rect2) -> Dictionary:
	assert(layer in RECT_LAYERS or layer == "bridges")
	checkpoint()
	var r = rect.abs()
	data[layer].append({"x": r.position.x, "y": r.position.y, "w": r.size.x, "h": r.size.y})
	emit_signal("changed")
	return {"layer": layer, "index": data[layer].size() - 1}

func add_resource(res_type: String, pos: Vector2, amount: int = -1) -> Dictionary:
	checkpoint()
	data["resources"].append({
		"id": "",
		"type": res_type,
		"x": pos.x,
		"y": pos.y,
		"amount": amount if amount >= 0 else int(RESOURCE_DEFAULT_AMOUNT.get(res_type, 1500))
	})
	emit_signal("changed")
	return {"layer": "resources", "index": data["resources"].size() - 1}

func add_unit(unit_type: String, owner_id: int, pos: Vector2, count: int = 1, spread: float = 2.1, auto_harvest: bool = false) -> Dictionary:
	checkpoint()
	data["units"].append({
		"id": "",
		"type": unit_type,
		"owner": owner_id,
		"count": max(1, count),
		"x": pos.x,
		"y": pos.y,
		"spread": spread,
		"auto_harvest": auto_harvest
	})
	emit_signal("changed")
	return {"layer": "units", "index": data["units"].size() - 1}

func is_valid_ref(ref: Dictionary) -> bool:
	if ref.is_empty() or not data.has(ref.get("layer", "")):
		return false
	var idx = int(ref.get("index", -1))
	return idx >= 0 and idx < data[ref["layer"]].size()

func get_item(ref: Dictionary) -> Dictionary:
	return data[ref["layer"]][int(ref["index"])] if is_valid_ref(ref) else {}

func set_item_field(ref: Dictionary, key: String, value) -> void:
	var item = get_item(ref)
	if item.is_empty() or item.get(key) == value:
		return
	checkpoint()
	item[key] = value
	emit_signal("changed")

func clear_item_field(ref: Dictionary, key: String) -> void:
	var item = get_item(ref)
	if item.is_empty() or not item.has(key):
		return
	checkpoint()
	item.erase(key)
	emit_signal("changed")

# Moves without recording undo; callers record a snapshot at drag start (see commit_snapshot).
func move_item_to(ref: Dictionary, pos: Vector2) -> void:
	var item = get_item(ref)
	if item.is_empty():
		return
	item["x"] = pos.x
	item["y"] = pos.y
	emit_signal("changed")

func resize_rect_to(ref: Dictionary, corner: Vector2) -> void:
	var item = get_item(ref)
	if item.is_empty() or not item.has("w"):
		return
	item["w"] = max(1.0, corner.x - float(item["x"]))
	item["h"] = max(1.0, corner.y - float(item["y"]))
	emit_signal("changed")

func remove_item(ref: Dictionary) -> void:
	if not is_valid_ref(ref):
		return
	checkpoint()
	data[ref["layer"]].remove_at(int(ref["index"]))
	emit_signal("changed")

func duplicate_item(ref: Dictionary, offset: Vector2 = Vector2(4.0, 4.0)) -> Dictionary:
	if not is_valid_ref(ref):
		return {}
	checkpoint()
	var copy: Dictionary = get_item(ref).duplicate(true)
	copy["x"] = float(copy["x"]) + offset.x
	copy["y"] = float(copy["y"]) + offset.y
	if copy.has("id"):
		copy["id"] = ""
	data[ref["layer"]].append(copy)
	emit_signal("changed")
	return {"layer": ref["layer"], "index": data[ref["layer"]].size() - 1}

# -------------------------------------------------------------------------
# Geometry helpers
# -------------------------------------------------------------------------

static func item_rect(item: Dictionary) -> Rect2:
	return Rect2(float(item["x"]), float(item["y"]), float(item["w"]), float(item["h"]))

static func unit_radius(unit_type: String) -> float:
	return float(RTSData.get_unit_def(unit_type).get("radius", 0.85))

# Mirrors the grid layout SimEngine.load_scenario_dict uses to spawn `count` copies of a unit entry.
static func unit_spawn_positions(u: Dictionary) -> Array[Vector2]:
	var out: Array[Vector2] = []
	var count = int(u.get("count", 1))
	var base = Vector2(float(u["x"]), float(u["y"]))
	if count <= 1:
		out.append(base)
		return out
	var spread = float(u.get("spread", 2.1))
	var cols = max(1, int(ceil(sqrt(float(count)))))
	for idx in range(count):
		out.append(base + Vector2((idx % cols) * spread, (idx / cols) * spread))
	return out

func hit_test(pos: Vector2) -> Dictionary:
	for layer in ["starts", "expansions", "bridges"] + ITEM_LAYERS:
		var arr: Array = data[layer]
		for i in range(arr.size() - 1, -1, -1):
			var item: Dictionary = arr[i]
			if layer in ["starts", "expansions"]:
				if pos.distance_to(Vector2(float(item.x), float(item.y))) <= 4:
					return {"layer": layer, "index": i}
			elif layer == "units":
				var rad = unit_radius(str(item["type"])) + 0.4
				for p in unit_spawn_positions(item):
					if p.distance_to(pos) <= rad:
						return {"layer": layer, "index": i}
			elif layer == "resources":
				if Vector2(float(item["x"]), float(item["y"])).distance_to(pos) <= float(RESOURCE_RADIUS.get(item["type"], 2.0)) + 0.4:
					return {"layer": layer, "index": i}
			elif item_rect(item).has_point(pos):
				return {"layer": layer, "index": i}
	return {}

# -------------------------------------------------------------------------
# Validation
# -------------------------------------------------------------------------

func validate() -> Array[String]:
	var issues: Array[String] = []
	var bounds = Rect2(0.0, 0.0, float(data["width"]), float(data["height"]))
	var obstacles: Array[Rect2] = []
	for o in data["obstacles"]:
		obstacles.append(item_rect(o))

	for layer in RECT_LAYERS:
		for i in range(data[layer].size()):
			var r = item_rect(data[layer][i])
			if not bounds.encloses(r):
				issues.append("%s #%d extends outside the %dx%d map" % [layer, i + 1, int(data["width"]), int(data["height"])])

	var ids: Dictionary = {}
	var owners_with_units: Dictionary = {}
	for i in range(data["units"].size()):
		var u: Dictionary = data["units"][i]
		var label = "unit '%s'" % (u["id"] if str(u["id"]) != "" else "%s #%d" % [u["type"], i + 1])
		var def = RTSData.get_unit_def(str(u["type"]))
		if def.is_empty():
			issues.append("%s has unknown type '%s'" % [label, u["type"]])
			continue
		owners_with_units[int(u["owner"])] = true
		var faction = str(data["players"].get(str(u["owner"]), {}).get("faction", ""))
		if str(def.get("faction", "")) != faction:
			issues.append("%s is a %s unit but player %d is %s" % [label, def.get("faction", "?"), int(u["owner"]), faction])
		var rad = float(def.get("radius", 0.85))
		var walks_cliffs = str(u["type"]) == "spire_walker"
		for p in unit_spawn_positions(u):
			if not bounds.grow(-rad).has_point(p):
				issues.append("%s spawns outside the map at (%.1f, %.1f)" % [label, p.x, p.y])
				break
			if not walks_cliffs and _point_in_any(p, obstacles):
				issues.append("%s spawns inside a cliff wall at (%.1f, %.1f)" % [label, p.x, p.y])
				break
			var terrain = terrain_at(Vector2i(int(p.x / TERRAIN_CELL_SIZE), int(p.y / TERRAIN_CELL_SIZE)))
			if terrain == "water" or (terrain == "cliff" and not walks_cliffs):
				issues.append("%s spawns in impassable terrain at (%.1f, %.1f)" % [label, p.x, p.y])
				break
		if str(u["id"]) != "":
			if ids.has(u["id"]):
				issues.append("duplicate id '%s'" % u["id"])
			ids[u["id"]] = true
		if bool(u.get("auto_harvest", false)) and not bool(def.get("is_worker", false)):
			issues.append("%s has auto_harvest but is not a worker" % label)

	for i in range(data["resources"].size()):
		var r: Dictionary = data["resources"][i]
		var p = Vector2(float(r["x"]), float(r["y"]))
		if not bounds.has_point(p):
			issues.append("%s #%d is outside the map" % [r["type"], i + 1])
		elif _point_in_any(p, obstacles):
			issues.append("%s #%d sits inside a cliff wall" % [r["type"], i + 1])
		elif terrain_at(Vector2i(int(p.x / TERRAIN_CELL_SIZE), int(p.y / TERRAIN_CELL_SIZE))) in ["water", "cliff"]:
			issues.append("%s #%d needs clear land" % [r["type"], i + 1])
		if str(r["id"]) != "":
			if ids.has(r["id"]):
				issues.append("duplicate id '%s'" % r["id"])
			ids[r["id"]] = true

	for d in data["directives"]:
		var pid = int(d["player"])
		if bool(d["enabled"]) and not owners_with_units.has(pid):
			issues.append("player %d has an enabled '%s' directive but no units" % [pid, d["mode"]])

	if data.mode == "skirmish":
		if data.starts.size() < 2 or data.starts.size() > 8:
			issues.append("skirmish maps need between 2 and 8 starting locations")
		for i in range(data.starts.size()):
			var start: Dictionary = data.starts[i]
			var pos = Vector2(float(start.x), float(start.y))
			var terrain = terrain_at(Vector2i(int(pos.x / TERRAIN_CELL_SIZE), int(pos.y / TERRAIN_CELL_SIZE)))
			if not bounds.grow(-8).has_point(pos) or terrain in ["water", "cliff"]:
				issues.append("start #%d needs clear land for a base and workers" % [i + 1])
			for j in range(i):
				var other: Dictionary = data.starts[j]
				if pos.distance_to(Vector2(float(other.x), float(other.y))) < 24:
					issues.append("starting locations #%d and #%d are too close" % [j + 1, i + 1])
	for layer in ["starts", "expansions"]:
		for marker in data[layer]:
			if not bounds.has_point(Vector2(float(marker.x), float(marker.y))):
				issues.append("%s marker is outside the map" % layer)
	if data.mode != "skirmish" and data["units"].is_empty():
		issues.append("map has no units")
	return issues

func _point_in_any(p: Vector2, rects: Array[Rect2]) -> bool:
	for r in rects:
		if r.has_point(p):
			return true
	return false

func summary() -> Dictionary:
	var unit_total = 0
	for u in data["units"]:
		unit_total += int(u["count"])
	return {
		"id": slugify(str(data["id"])),
		"label": data["label"],
		"path": file_path,
		"dirty": dirty,
		"width": data["width"],
		"height": data["height"],
		"obstacles": data["obstacles"].size(),
		"high_ground": data["high_ground"].size(),
		"ramps": data["ramps"].size(),
		"resources": data["resources"].size(),
		"unit_entries": data["units"].size(),
		"unit_total": unit_total,
		"directives": data["directives"].size(),
		"starts": data.starts.size(), "expansions": data.expansions.size(), "terrain_tiles": data.terrain_tiles.size(), "mode": data.mode
	}
