extends Node

const SAVE_STATE_ENV := "DW_SAVE_STATE_FILE"

# ── Persistent game state between scenes ─────────────────────────────────────

var hero_stats := {
	"name":   "ERDRICK",
	"level":  1,
	"hp":     15,
	"hp_max": 15,
	"mp":     0,
	"mp_max": 0,
	"str":    4,
	"agl":    4,
	"atk":    4,
	"def":    2,
	"exp":    0,
}

var gold:      int   = 0
var inventory: Array = []   # Array of { name, type, desc, ... }

# Where to spawn the hero on the next scene load
var spawn_tile   := Vector2i(4, 5)   # default: ThroneRoom start
var spawn_facing := "down"           # "down" | "up" | "left" | "right"
var come_from    := ""               # "throne_room" | "castle_1f" | ...

# Opened chests persist across scene changes
var opened_chests: Dictionary = {}

# Unlocked doors per map: { "map_id": true }
var unlocked_doors: Dictionary = {}

# Rainbow bridge — set when Rainbow Drop is used at the correct overworld tile
var bridge_built: bool = false

# Battle debug: set by DebugLaunch when launching BattleTest scene
var battle_monster: String = "slime"

# Hero equipment and known spells
var spells: Array  = []   # spell IDs: ["heal", "hurt", ...]
var weapon: String = ""   # e.g. "copper_sword"
var armor:  String = ""   # e.g. "chain_mail"

# King Lorik dialogue state
var king_intro_done: bool = false
var tile_debug_enabled: bool = false

# Developer QoL hotkey toggles
var encounters_disabled: bool = false
var double_speed: bool = false

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.ctrl_pressed and event.keycode == KEY_E:
			encounters_disabled = not encounters_disabled
			print("[GameState] Encounters Disabled: ", encounters_disabled)
			_show_hotkey_toast("Random Encounters: " + ("DISABLED" if encounters_disabled else "ENABLED"))
			get_viewport().set_input_as_handled()
		elif event.ctrl_pressed and event.keycode == KEY_T:
			double_speed = not double_speed
			print("[GameState] Double Speed: ", double_speed)
			_show_hotkey_toast("Hero Speed: " + ("2x DOUBLE" if double_speed else "1x NORMAL"))
			get_viewport().set_input_as_handled()

func _show_hotkey_toast(msg: String) -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 100
	var label := Label.new()
	label.text = " [HOTKEY] " + msg + " "
	label.position = Vector2(16, 16)
	label.add_theme_color_override("font_color", Color(1, 0.9, 0.2))
	label.add_theme_color_override("font_outline_color", Color.BLACK)
	label.add_theme_constant_override("outline_size", 4)
	canvas.add_child(label)
	get_tree().root.add_child(canvas)
	var tween := get_tree().create_tween()
	tween.tween_interval(1.5)
	tween.tween_property(label, "modulate:a", 0.0, 0.5)
	tween.tween_callback(canvas.queue_free)

	_apply_save_state_override_from_env()
	_parse_cmdline_args()

func _parse_cmdline_args() -> void:
	var args := OS.get_cmdline_user_args() + OS.get_cmdline_args()
	for i in range(args.size()):
		var arg := str(args[i])
		if arg == "--king-intro-done":
			king_intro_done = true
		elif arg == "--tile-debug" or arg == "--debug-tiles":
			tile_debug_enabled = true
		elif arg == "--tile" and i + 1 < args.size():
			var parsed_t: Variant = _parse_tile(str(args[i + 1]))
			if parsed_t != null:
				spawn_tile = parsed_t
				come_from = "debug"
		elif arg.begins_with("--tile="):
			var parsed_t: Variant = _parse_tile(arg.split("=")[1])
			if parsed_t != null:
				spawn_tile = parsed_t
				come_from = "debug"
		elif arg == "--facing" and i + 1 < args.size():
			spawn_facing = str(args[i + 1])
		elif arg.begins_with("--facing="):
			spawn_facing = arg.split("=")[1]

func _apply_save_state_override_from_env() -> void:
	var save_state_path := OS.get_environment(SAVE_STATE_ENV)
	if save_state_path == "":
		return
	if not FileAccess.file_exists(save_state_path):
		push_warning("Save state override file missing: %s" % save_state_path)
		return
	var file := FileAccess.open(save_state_path, FileAccess.READ)
	if file == null:
		push_warning("Could not open save state override: %s" % save_state_path)
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_warning("Save state override is not a dictionary: %s" % save_state_path)
		return
	_apply_save_state_override(parsed)
	print("[GameState] loaded save state override: %s" % save_state_path)

func _apply_save_state_override(data: Dictionary) -> void:
	if data.has("gold"):
		gold = int(data.get("gold", 0))
	if data.has("come_from"):
		come_from = str(data.get("come_from", ""))
	elif data.has("from"):
		come_from = str(data.get("from", ""))
	if data.has("facing"):
		spawn_facing = str(data.get("facing", spawn_facing))
	if data.has("tile"):
		var parsed_tile: Variant = _parse_tile(str(data.get("tile", "")))
		if parsed_tile != null:
			spawn_tile = parsed_tile
	if data.has("bridgeBuilt"):
		bridge_built = bool(data.get("bridgeBuilt", false))
	if data.has("kingIntroDone"):
		king_intro_done = bool(data.get("kingIntroDone", false))
	elif data.has("king_intro_done"):
		king_intro_done = bool(data.get("king_intro_done", false))
	if data.has("heroName"):
		hero_stats["name"] = str(data.get("heroName", hero_stats["name"]))
	if data.has("heroLevel"):
		hero_stats["level"] = int(data.get("heroLevel", hero_stats["level"]))
	if data.has("heroHp"):
		hero_stats["hp"] = int(data.get("heroHp", hero_stats["hp"]))
	if data.has("heroHpMax"):
		hero_stats["hp_max"] = int(data.get("heroHpMax", hero_stats["hp_max"]))
	if data.has("heroMp"):
		hero_stats["mp"] = int(data.get("heroMp", hero_stats["mp"]))
	if data.has("heroMpMax"):
		hero_stats["mp_max"] = int(data.get("heroMpMax", hero_stats["mp_max"]))
	if data.has("heroStr"):
		hero_stats["str"] = int(data.get("heroStr", hero_stats["str"]))
	if data.has("heroAgl"):
		hero_stats["agl"] = int(data.get("heroAgl", hero_stats["agl"]))
	if data.has("heroAtk"):
		hero_stats["atk"] = int(data.get("heroAtk", hero_stats["atk"]))
	if data.has("heroDef"):
		hero_stats["def"] = int(data.get("heroDef", hero_stats["def"]))
	if data.has("heroExp"):
		hero_stats["exp"] = int(data.get("heroExp", hero_stats["exp"]))
	if data.has("items") and data.get("items") is Array:
		inventory = _duplicate_array_of_dicts(data.get("items", []))
	elif data.has("inventory") and data.get("inventory") is Array:
		inventory = _duplicate_array_of_dicts(data.get("inventory", []))
	if data.has("openedChests"):
		opened_chests = _dictionary_of_true(data.get("openedChests", {}))
	if data.has("unlockedDoors"):
		unlocked_doors = _dictionary_of_true(data.get("unlockedDoors", {}))
	if data.has("heroSpells") and data.get("heroSpells") is Array:
		spells = data.get("heroSpells", []).duplicate(true)
	elif data.has("spells") and data.get("spells") is Array:
		spells = data.get("spells", []).duplicate(true)
	if data.has("heroWeapon"):
		weapon = str(data.get("heroWeapon", ""))
	if data.has("heroArmor"):
		armor = str(data.get("heroArmor", ""))

func _parse_tile(tile_text: String) -> Variant:
	var parts := tile_text.split(",")
	if parts.size() != 2:
		return null
	return Vector2i(int(parts[0].strip_edges()), int(parts[1].strip_edges()))

func _duplicate_array_of_dicts(values: Array) -> Array:
	var result: Array = []
	for value in values:
		if value is Dictionary:
			result.append(value.duplicate(true))
		elif typeof(value) == TYPE_STRING:
			result.append({"name": str(value), "id": str(value), "desc": ""})
	return result

func _dictionary_of_true(value) -> Dictionary:
	var result: Dictionary = {}
	if value is Dictionary:
		for key in value.keys():
			if value[key]:
				result[key] = true
	elif value is Array:
		for key in value:
			result[str(key)] = true
	return result

func save_from_throne_room(inv: Array, g: int, stats: Dictionary, chests: Dictionary) -> void:
	inventory     = inv.duplicate(true)
	gold          = g
	hero_stats    = stats.duplicate(true)
	opened_chests = chests.duplicate(true)

## Public entry point for SaveSelect (or any future save/load UI) to apply a parsed
## save-state dictionary (same schema as data/v1/save-states/*.json and
## the --save-state-file debug.sh flag).
func load_state_dict(data: Dictionary) -> void:
	_apply_save_state_override(data)

## Resets all persistent state back to a brand-new game, matching the default values
## declared above. Used when the player picks "Begin a New Quest" from SaveSelect so
## leftover state from a previously-loaded save (or a prior debug run) doesn't leak in.
func reset_to_new_game() -> void:
	hero_stats = {
		"name":   "ERDRICK",
		"level":  1,
		"hp":     15,
		"hp_max": 15,
		"mp":     0,
		"mp_max": 0,
		"str":    4,
		"agl":    4,
		"atk":    4,
		"def":    2,
		"exp":    0,
	}
	gold            = 0
	inventory       = []
	spawn_tile      = Vector2i(4, 5)
	spawn_facing    = "down"
	come_from       = ""
	opened_chests   = {}
	unlocked_doors  = {}
	bridge_built    = false
	spells          = []
	weapon          = ""
	armor           = ""
	king_intro_done = false

func get_exp_to_next_level() -> int:
	var current_level: int = int(hero_stats.get("level", 1))
	var current_exp: int   = int(hero_stats.get("exp", 0))
	var next_level := current_level + 1

	var lvl_data: Dictionary = {}
	if DataManager and DataManager.is_loaded:
		lvl_data = DataManager.get_level_data(next_level)

	if lvl_data.is_empty():
		var path := "res://data/v1/levels.json"
		if FileAccess.file_exists(path):
			var f := FileAccess.open(path, FileAccess.READ)
			if f:
				var parsed: Variant = JSON.parse_string(f.get_as_text())
				var store := LevelsDataStoreV1.from_value(parsed)
				if store:
					for entry in store.value:
						if entry.level == next_level:
							lvl_data = entry.to_value()
							break

	if not lvl_data.is_empty():
		var req_exp: int = int(lvl_data.get("exp_required", 0))
		return max(0, req_exp - current_exp)

	return -1

func save_to_disk(filename: String = "adventure_log.json") -> bool:
	var dir_path := "user://saves"
	var err := DirAccess.make_dir_recursive_absolute(dir_path)
	if err != OK and err != ERR_ALREADY_EXISTS:
		push_warning("Could not create saves directory: %s" % dir_path)
	var full_path := dir_path.path_join(filename)
	var data := {
		"name": str(hero_stats.get("name", "ERDRICK")) + " - Lv." + str(hero_stats.get("level", 1)),
		"description": "Saved by King Lorik at Tantegel Castle.",
		"scene": "ThroneRoom",
		"tile": str(spawn_tile.x) + "," + str(spawn_tile.y),
		"facing": spawn_facing,
		"come_from": "save",
		"gold": gold,
		"heroName": str(hero_stats.get("name", "ERDRICK")),
		"heroLevel": int(hero_stats.get("level", 1)),
		"heroHp": int(hero_stats.get("hp", 15)),
		"heroHpMax": int(hero_stats.get("hp_max", 15)),
		"heroMp": int(hero_stats.get("mp", 0)),
		"heroMpMax": int(hero_stats.get("mp_max", 0)),
		"heroStr": int(hero_stats.get("str", 4)),
		"heroAgl": int(hero_stats.get("agl", 4)),
		"heroAtk": int(hero_stats.get("atk", 4)),
		"heroDef": int(hero_stats.get("def", 2)),
		"heroExp": int(hero_stats.get("exp", 0)),
		"heroWeapon": weapon,
		"heroArmor": armor,
		"heroSpells": spells.duplicate(true),
		"items": inventory.duplicate(true),
		"openedChests": opened_chests.duplicate(true),
		"unlockedDoors": unlocked_doors.duplicate(true),
		"bridgeBuilt": bridge_built,
		"kingIntroDone": king_intro_done,
	}
	var f := FileAccess.open(full_path, FileAccess.WRITE)
	if f == null:
		push_warning("Failed to open save file for writing: %s" % full_path)
		return false
	f.store_string(JSON.stringify(data, "  "))
	f.close()
	print("[GameState] Successfully saved game state to ", full_path)
	return true
