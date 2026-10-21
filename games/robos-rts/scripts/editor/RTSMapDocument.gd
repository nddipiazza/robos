extends RefCounted
class_name RTSMapDocument

# RTSMapDocument.gd — Editable RTS map/scenario model for the Starfall Command Map Editor.
# Holds a scenario in exactly the shape `SimEngine.load_scenario_dict()` consumes (plus `ramps`),
# with snapshot-based undo/redo, hit-testing, validation, and JSON-LD (`scenarios/*.jsonld`) I/O.

signal changed

const SCENARIOS_DIR = "res://scenarios"
const RECT_LAYERS = ["obstacles", "high_ground", "ramps"]
const ITEM_LAYERS = ["units", "resources", "ramps", "high_ground", "obstacles"] # hit-test order (topmost first)
const RESOURCE_TYPES = ["mineral_field", "vespene_geyser"]
const RESOURCE_RADIUS = {"mineral_field": 1.8, "vespene_geyser": 2.6}
const RESOURCE_DEFAULT_AMOUNT = {"mineral_field": 1500, "vespene_geyser": 2250}
const FACTIONS = ["humans", "monsters", "aliens"]
const DIRECTIVE_MODES = ["idle", "swarm_rush", "stutter_step_kite", "blink_stalker_micro", "macro_build", "siege_defend"]
const MAX_UNDO = 200

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
	file_path = ""
	dirty = false
	_undo_stack.clear()
	_redo_stack.clear()
	emit_signal("changed")

func _default_players() -> Dictionary:
	return {
		"1": {"faction": "humans", "minerals": 400, "vespene": 150},
		"2": {"faction": "monsters", "minerals": 400, "vespene": 150},
		"3": {"faction": "aliens", "minerals": 400, "vespene": 150}
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
	for r in scn.get("resources", []):
		var rtype = str(r.get("type", "mineral_field"))
		data["resources"].append({
			"id": str(r.get("id", "")),
			"type": rtype,
			"x": float(r.get("x", 20.0)),
			"y": float(r.get("y", 20.0)),
			"amount": int(r.get("amount", RESOURCE_DEFAULT_AMOUNT.get(rtype, 1500)))
		})
	for u in scn.get("units", []):
		var entry = {
			"id": str(u.get("id", "")),
			"type": str(u.get("type", "marine")),
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
		data["units"].append(entry)
	var p_cfg: Dictionary = scn.get("players", {})
	for key in p_cfg.keys():
		var pid = str(int(key))
		if data["players"].has(pid):
			var pd: Dictionary = p_cfg[key]
			data["players"][pid] = {
				"faction": str(pd.get("faction", data["players"][pid]["faction"])),
				"minerals": int(pd.get("minerals", 400)),
				"vespene": int(pd.get("vespene", 150))
			}
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
	var f = FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return {"ok": false, "error": "Cannot write %s (error %d)" % [path, FileAccess.get_open_error()]}
	f.store_string(JSON.stringify(to_scenario(), "  ", false) + "\n")
	f.close()
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
		"obstacles": data["obstacles"].duplicate(true)
	}
	if not data["high_ground"].is_empty():
		map_cfg["high_ground"] = data["high_ground"].duplicate(true)
	if not data["ramps"].is_empty():
		map_cfg["ramps"] = data["ramps"].duplicate(true)

	var units_out: Array = []
	for u in data["units"]:
		var e: Dictionary = {}
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
		var e: Dictionary = {}
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
		"seed": data["seed"],
		"map": map_cfg,
		"players": data["players"].duplicate(true)
	}
	if not res_out.is_empty():
		scn["resources"] = res_out
	scn["units"] = units_out
	scn["directives"] = dir_out
	return scn

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
	assert(layer in RECT_LAYERS)
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
	for layer in ITEM_LAYERS:
		var arr: Array = data[layer]
		for i in range(arr.size() - 1, -1, -1):
			var item: Dictionary = arr[i]
			if layer == "units":
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
		var walks_cliffs = str(u["type"]) == "colossus"
		for p in unit_spawn_positions(u):
			if not bounds.grow(-rad).has_point(p):
				issues.append("%s spawns outside the map at (%.1f, %.1f)" % [label, p.x, p.y])
				break
			if not walks_cliffs and _point_in_any(p, obstacles):
				issues.append("%s spawns inside a cliff wall at (%.1f, %.1f)" % [label, p.x, p.y])
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
		if str(r["id"]) != "":
			if ids.has(r["id"]):
				issues.append("duplicate id '%s'" % r["id"])
			ids[r["id"]] = true

	for d in data["directives"]:
		var pid = int(d["player"])
		if bool(d["enabled"]) and not owners_with_units.has(pid):
			issues.append("player %d has an enabled '%s' directive but no units" % [pid, d["mode"]])

	if data["units"].is_empty():
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
		"directives": data["directives"].size()
	}
