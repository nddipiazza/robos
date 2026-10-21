extends Node

const DATA_DIR := "res://data/v1/"

const MONSTERS_MODEL := preload("res://src/generated/v1/monsters_data_store_v1.gd")
const SPELLS_MODEL := preload("res://src/generated/v1/spells_data_store_v1.gd")
const LEVELS_MODEL := preload("res://src/generated/v1/levels_data_store_v1.gd")
const EQUIPMENT_MODEL := preload("res://src/generated/v1/equipment_data_store_v1.gd")
const ITEMS_MODEL := preload("res://src/generated/v1/items_data_store_v1.gd")
const LOCATIONS_MODEL := preload("res://src/generated/v1/locations_data_store_v1.gd")
const ENCOUNTER_ZONES_MODEL := preload("res://src/generated/v1/encounter_zones_data_store_v1.gd")
const MAP_GRIDS_MODEL := preload("res://src/generated/v1/map_grids_data_store_v1.gd")
const TILES_META_MODEL := preload("res://src/generated/v1/tiles_meta_data_store_v1.gd")
const NPCS_MODEL := preload("res://src/generated/v1/npc_data_store_v1.gd")
const DIALOGUE_MODEL := preload("res://src/generated/v1/dialogue_data_store_v1.gd")
const COMBAT_FORMULAS_MODEL := preload("res://src/generated/v1/combat_formulas_data_store_v1.gd")
const NAME_SYSTEM_MODEL := preload("res://src/generated/v1/name_system_data_store_v1.gd")
const SPRITE_FRAMES_MODEL := preload("res://src/generated/v1/sprite_frames_data_store_v1.gd")

var monsters: Dictionary = {}
var spells: Dictionary = {}
var weapons: Dictionary = {}
var armor: Dictionary = {}
var shields: Dictionary = {}
var items: Dictionary = {}
var quest_items: Dictionary = {}
var levels: Array = []
var name_system: Dictionary = {}
var combat_formulas: Dictionary = {}

var locations: Dictionary = {}
var dungeons: Dictionary = {}
var dialogue: Dictionary = {}
var npc_registry: Dictionary = {}

var encounter_zones: Variant = {}
var worldmap_zones: Variant = {}
var map_grids: Dictionary = {}
var tiles_meta: Dictionary = {}
var sprite_frames: Dictionary = {}

var models: Dictionary = {}
var is_loaded: bool = false


func _ready() -> void:
	print("[DataManager] Loading typed v1 data...")
	if not load_all_data():
		push_error("[DataManager] Typed v1 data loading failed.")


func load_all_data() -> bool:
	is_loaded = false
	models.clear()

	var loaded := _load_all_models()
	if loaded.is_empty():
		return false

	monsters = _index_records(loaded["monsters"], "key")
	spells = _index_records(loaded["spells"], "id")
	weapons = _index_records(loaded["weapons"], "id")
	armor = _index_records(loaded["armor"], "id")
	shields = _index_records(loaded["shields"], "id")
	items = _index_records(loaded["items"], "id")
	quest_items = _index_records(loaded["quest_items"], "id")
	levels = loaded["levels"]
	name_system = loaded["name_system"]
	combat_formulas = loaded["combat_formulas"]

	locations = _index_records(loaded["locations"], "id")
	dungeons = _index_records(loaded["dungeons"], "id")
	dialogue = loaded["dialogue"]
	npc_registry = loaded["npcs"]

	encounter_zones = loaded["encounter_zones"]
	worldmap_zones = loaded["worldmap_zones"]
	map_grids = loaded["map_grids"]
	tiles_meta = loaded["tiles_meta"]
	sprite_frames = loaded["sprite_frames"]

	is_loaded = true
	print(
		"[DataManager] Loaded and round-tripped %d v1 datasets (%d monsters, %d spells, %d locations)."
		% [models.size(), monsters.size(), spells.size(), locations.size()]
	)
	EventBus.data_loaded.emit()
	return true


func _load_all_models() -> Dictionary:
	var datasets: Array[Dictionary] = [
		{"name": "monsters", "file": "monsters.json", "schema": MONSTERS_MODEL},
		{"name": "spells", "file": "spells.json", "schema": SPELLS_MODEL},
		{"name": "levels", "file": "levels.json", "schema": LEVELS_MODEL},
		{"name": "weapons", "file": "weapons.json", "schema": EQUIPMENT_MODEL},
		{"name": "armor", "file": "armor.json", "schema": EQUIPMENT_MODEL},
		{"name": "shields", "file": "shields.json", "schema": EQUIPMENT_MODEL},
		{"name": "items", "file": "items.json", "schema": ITEMS_MODEL},
		{"name": "quest_items", "file": "quest_items.json", "schema": ITEMS_MODEL},
		{"name": "locations", "file": "locations.json", "schema": LOCATIONS_MODEL},
		{"name": "dungeons", "file": "dungeons.json", "schema": LOCATIONS_MODEL},
		{
			"name": "encounter_zones",
			"file": "encounter_zones.json",
			"schema": ENCOUNTER_ZONES_MODEL,
		},
		{
			"name": "worldmap_zones",
			"file": "worldmap_zones.json",
			"schema": ENCOUNTER_ZONES_MODEL,
		},
		{"name": "map_grids", "file": "map_grids.json", "schema": MAP_GRIDS_MODEL},
		{"name": "tiles_meta", "file": "tiles_meta.json", "schema": TILES_META_MODEL},
		{"name": "npcs", "file": "npcs.json", "schema": NPCS_MODEL},
		{"name": "dialogue", "file": "dialogue.json", "schema": DIALOGUE_MODEL},
		{
			"name": "combat_formulas",
			"file": "combat_formulas.json",
			"schema": COMBAT_FORMULAS_MODEL,
		},
		{"name": "name_system", "file": "name_system.json", "schema": NAME_SYSTEM_MODEL},
		{
			"name": "sprite_frames",
			"file": "sprite_frames.json",
			"schema": SPRITE_FRAMES_MODEL,
		},
	]
	var loaded: Dictionary = {}
	for dataset: Dictionary in datasets:
		var result := _load_typed_json(dataset["file"], dataset["schema"])
		if not result["ok"]:
			return {}
		var dataset_name: String = dataset["name"]
		models[dataset_name] = result["model"]
		loaded[dataset_name] = result["value"]
	return loaded


func _load_typed_json(filename: String, model_script: Script) -> Dictionary:
	var path := DATA_DIR + filename
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("[DataManager] Cannot open %s (error %s)." % [path, FileAccess.get_open_error()])
		return {"ok": false}

	var json := JSON.new()
	var parse_error := json.parse(file.get_as_text())
	if parse_error != OK:
		push_error(
			"[DataManager] Invalid JSON in %s at line %d: %s"
			% [path, json.get_error_line(), json.get_error_message()]
		)
		return {"ok": false}

	var source_value: Variant = json.data
	var model: Variant = model_script.call("from_value", source_value)
	if model == null:
		push_error("[DataManager] %s does not satisfy its generated v1 model." % path)
		return {"ok": false}

	var marshalled_value: Variant = model.call("to_value")
	var marshalled_json := JSON.stringify(marshalled_value)
	var round_trip: Variant = JSON.parse_string(marshalled_json)
	if round_trip != source_value:
		push_error("[DataManager] Generated model round trip changed data from %s." % path)
		return {"ok": false}

	return {"ok": true, "model": model, "value": marshalled_value}


func _index_records(records: Array, key_name: String) -> Dictionary:
	var indexed: Dictionary = {}
	for record: Variant in records:
		if record is not Dictionary or not record.has(key_name):
			continue
		indexed[str(record[key_name])] = record
	return indexed


func get_monster(monster_id: String) -> Dictionary:
	return monsters.get(monster_id, {})


func get_spell(spell_id: String) -> Dictionary:
	return spells.get(spell_id, {})


func get_location(location_id: String) -> Dictionary:
	return locations.get(location_id, {})


func get_level_data(level: int) -> Dictionary:
	for level_data: Variant in levels:
		if level_data is Dictionary and int(level_data.get("level", 0)) == level:
			return level_data
	return {}
