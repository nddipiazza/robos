# RobOS cRPG Player Cartridge Manager
# Autoload singleton: manages discovering, inserting, reading, and playing self-contained cartridges.
class_name CartridgeManagerClass
extends Node

signal cartridge_inserted(cartridge: Dictionary)
signal cartridge_ejected()
signal cartridge_map_transitioned(from_map: String, to_map: String, spawn: Vector2)
signal cartridge_objective_completed(objective_id: String)
signal cartridge_event(event_name: String, event_data: Dictionary)

var active_cartridge: Dictionary = {}
var is_cartridge_active: bool = false
var current_map_slug: String = ""
var current_spawn_coord: Vector2 = Vector2(25, 20)

var maps_cache: Dictionary = {}
var characters_cache: Dictionary = {}
var items_cache: Dictionary = {}

func _ready() -> void:
	print("📼 [CartridgeManager] Initialized. Ready for Player Cartridges.")
	# Auto-check command line arguments for --cartridge
	call_deferred("_check_cli_cartridge")

func _check_cli_cartridge() -> void:
	var cmd_args = OS.get_cmdline_user_args() + OS.get_cmdline_args()
	var cart_arg: String = OS.get_environment("CRPG_CARTRIDGE")
	if cart_arg == "":
		cart_arg = OS.get_environment("CRPG_CAMPAIGN")

	for i in range(cmd_args.size()):
		var a = cmd_args[i]
		if (a == "--cartridge" or a == "--campaign") and i + 1 < cmd_args.size():
			cart_arg = cmd_args[i + 1]
		elif a.begins_with("--cartridge="):
			cart_arg = a.split("=")[1]
		elif a.begins_with("--campaign="):
			cart_arg = a.split("=")[1]
	
	if cart_arg != "":
		print("📼 [CartridgeManager] Auto-plugging cartridge from CLI: ", cart_arg)
		if insert_cartridge(cart_arg):
			embark_cartridge()

func discover_cartridges() -> Array[Dictionary]:
	var list: Array[Dictionary] = []
	var dirs_to_search = ["res://cartridges/", "user://cartridges/"]
	
	for dir_path in dirs_to_search:
		if not DirAccess.dir_exists_absolute(dir_path):
			continue
		var dir = DirAccess.open(dir_path)
		if not dir:
			continue
		dir.list_dir_begin()
		var file_name = dir.get_next()
		while file_name != "":
			if not dir.current_is_dir() and (file_name.ends_with(".cartridge.json") or file_name.ends_with(".crpgcart")):
				var full_path = dir_path + file_name
				var cart_dict = _load_json_file(full_path)
				if cart_dict.size() > 0:
					var h = cart_dict.get("header", {})
					list.append({
						"id": str(cart_dict.get("cartridgeId", file_name.get_basename())),
						"file": file_name,
						"path": full_path,
						"title": str(h.get("title", file_name)),
						"author": str(h.get("author", "RobOS AI Studio")),
						"ruleset": str(h.get("ruleset", "D&D 5e SRD")),
						"difficulty": str(h.get("difficulty", "Normal")),
						"setting": str(h.get("setting", "Eldoria")),
						"description": str(h.get("description", "")),
						"icon": str(h.get("icon", "📼")),
						"coverColor": str(h.get("coverColor", "#1e3a8a")),
						"mapCount": int(h.get("mapCount", 0)),
						"characterCount": int(h.get("characterCount", 0)),
						"questCount": int(h.get("questCount", 0)),
						"raw": cart_dict
					})
			file_name = dir.get_next()

	# Also fallback to res://campaigns/ if cartridges/ is empty
	if list.is_empty() and DirAccess.dir_exists_absolute("res://campaigns/"):
		var cdir = DirAccess.open("res://campaigns/")
		if cdir:
			cdir.list_dir_begin()
			var fn = cdir.get_next()
			while fn != "":
				if fn.ends_with(".jsonld") or fn.ends_with(".json"):
					var cpath = "res://campaigns/" + fn
					var cdata = _load_json_file(cpath)
					if cdata.size() > 0:
						var slug = fn.replace(".jsonld", "").replace(".json", "")
						list.append({
							"id": slug,
							"file": fn,
							"path": cpath,
							"title": str(cdata.get("dcterms:title", cdata.get("title", slug))),
							"author": "RobOS AI Studio",
							"ruleset": str(cdata.get("robos:ruleSet", "D&D 5e SRD")),
							"difficulty": str(cdata.get("robos:difficulty", "Normal")),
							"setting": str(cdata.get("robos:setting", "RobOS Realm")),
							"description": str(cdata.get("dcterms:description", "")),
							"icon": "📜",
							"coverColor": "#1e3a8a",
							"mapCount": 1,
							"characterCount": 1,
							"questCount": 1,
							"raw": {}
						})
				fn = cdir.get_next()
				
	return list

func _load_json_file(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f = FileAccess.open(path, FileAccess.READ)
	if not f:
		return {}
	var text = f.get_as_text()
	var parsed = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed
	return {}

func insert_cartridge(cart_data_or_slug: Variant) -> bool:
	var cart: Dictionary = {}
	if cart_data_or_slug is Dictionary:
		cart = cart_data_or_slug
	elif cart_data_or_slug is String:
		var slug_or_path = str(cart_data_or_slug).strip_edges()
		if slug_or_path.ends_with(".json") or slug_or_path.begins_with("res://") or slug_or_path.begins_with("user://"):
			cart = _load_json_file(slug_or_path)
		else:
			# Check cartridges directory
			var cand = "res://cartridges/%s.cartridge.json" % slug_or_path
			if FileAccess.file_exists(cand):
				cart = _load_json_file(cand)
			else:
				# Check campaigns
				var c_cand = "res://campaigns/%s.jsonld" % slug_or_path
				if FileAccess.file_exists(c_cand):
					var c_data = _load_json_file(c_cand)
					# Construct cartridge on the fly
					cart = {
						"cartridgeId": slug_or_path,
						"header": {
							"title": str(c_data.get("dcterms:title", slug_or_path)),
							"slug": slug_or_path,
							"startingMap": str(c_data.get("robos:startingMap", "throne-room")),
							"startingPosition": {"x": 25, "y": 20}
						},
						"campaign": c_data,
						"maps": {},
						"characters": {},
						"items": {},
						"quests": []
					}

	if cart.is_empty():
		push_error("[CartridgeManager] Failed to insert cartridge: empty or invalid payload: " + str(cart_data_or_slug))
		return false

	active_cartridge = cart
	is_cartridge_active = true

	maps_cache = cart.get("maps", {})
	characters_cache = cart.get("characters", {})
	items_cache = cart.get("items", {})

	# 1. Register Items into DataStore
	if items_cache.size() > 0 and has_node("/root/DataStore"):
		var ds = get_node("/root/DataStore")
		for it_slug in items_cache:
			var it_dict = items_cache[it_slug]
			if it_dict is Dictionary:
				ds.items[it_slug] = ItemData.from_dict(it_dict)

	# 2. Register NPCs and Monsters into DataStore
	if characters_cache.size() > 0 and has_node("/root/DataStore"):
		var ds = get_node("/root/DataStore")
		for ch_slug in characters_cache:
			var ch = characters_cache[ch_slug]
			if ch is Dictionary:
				var ctype = str(ch.get("characterType", ch.get("robos:characterType", ""))).to_lower()
				var is_boss = "boss" in ch_slug or ctype == "boss"
				var is_enemy = "enemy" in ctype or "creature" in ch_slug or is_boss
				if is_enemy:
					ds.monsters[ch_slug] = MonsterData.from_dict(ch)
				else:
					ds.npcs[ch_slug] = NPCData.from_dict(ch)

	# 3. Setup GameState
	var camp_dict = cart.get("campaign", {})
	if camp_dict.size() > 0 and has_node("/root/GameState"):
		GameState.load_campaign_state(camp_dict)

	# 4. Resolve Starting Map & Spawn Position
	var header = cart.get("header", {})
	current_map_slug = str(header.get("startingMap", camp_dict.get("robos:startingMap", "throne-room")))
	
	var pos = header.get("startingPosition", {})
	if pos is Dictionary and pos.has("x") and pos.has("y"):
		current_spawn_coord = Vector2(float(pos["x"]), float(pos["y"]))
	else:
		current_spawn_coord = Vector2(25, 20)

	var c_title = str(header.get("title", active_cartridge.get("cartridgeId", "Untitled Cartridge")))
	print("📼 [CartridgeManager] Successfully inserted cartridge '%s' (%d maps, %d characters, %d quests)" % [
		c_title, maps_cache.size(), characters_cache.size(), cart.get("quests", []).size()
	])
	
	cartridge_inserted.emit(active_cartridge)
	return true

func eject_cartridge() -> void:
	if not is_cartridge_active:
		return
	var old_title = str(active_cartridge.get("header", {}).get("title", "Cartridge"))
	active_cartridge.clear()
	is_cartridge_active = false
	maps_cache.clear()
	characters_cache.clear()
	items_cache.clear()
	print("📼 [CartridgeManager] Ejected cartridge: ", old_title)
	cartridge_ejected.emit()

func embark_cartridge() -> void:
	if not is_cartridge_active:
		push_error("[CartridgeManager] Cannot embark: no active cartridge inserted!")
		return

	print("🎮 [CartridgeManager] Embarking into cartridge world: starting map '%s' at %s" % [current_map_slug, current_spawn_coord])
	
	# Check if starting map has a dedicated scene (like Homestead or VillageSquare)
	var scene_candidates = [
		"res://scenes/%s.tscn" % current_map_slug.capitalize().replace("-", ""),
		"res://scenes/%s.tscn" % current_map_slug,
		"res://scenes/Homestead.tscn" if ("homestead" in current_map_slug or "candlekeep" in current_map_slug) else "",
		"res://scenes/VillageSquare.tscn" if "village" in current_map_slug else "",
		"res://scenes/AncientCatacombs.tscn" if "catacomb" in current_map_slug else ""
	]
	
	var target_scene = "res://scenes/CartridgeWorld.tscn"
	for sc in scene_candidates:
		if sc != "" and ResourceLoader.exists(sc) and sc != "res://scenes/CartridgeWorld.tscn":
			# If user specifically wants the generic cartridge runner or hard-coded scene
			# For new cartridge maps like throne-room, main-castle, world-overworld, dark-lord-lair -> CartridgeWorld
			if not (current_map_slug in ["throne-room", "main-castle", "world-overworld", "dark-lord-lair", "tantegel-throne-room"]):
				target_scene = sc
				break
				
	get_tree().change_scene_to_file(target_scene)

func get_current_map() -> Dictionary:
	if maps_cache.has(current_map_slug):
		return maps_cache[current_map_slug]
	return {}

func transition_to_map(to_map_slug: String, target_spawn: Vector2 = Vector2.ZERO) -> bool:
	if not maps_cache.has(to_map_slug):
		push_warning("[CartridgeManager] Target map '%s' not found in active cartridge maps!" % to_map_slug)
	
	var from_map = current_map_slug
	current_map_slug = to_map_slug
	if target_spawn != Vector2.ZERO:
		current_spawn_coord = target_spawn
	
	print("🗺️ [CartridgeManager] Transitioning map: %s -> %s (spawn at %s)" % [from_map, to_map_slug, current_spawn_coord])
	cartridge_map_transitioned.emit(from_map, to_map_slug, current_spawn_coord)
	return true
