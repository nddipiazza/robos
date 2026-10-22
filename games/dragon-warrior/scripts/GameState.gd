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
var deaths: int = 0   # times the hero fell in battle (for playthrough telemetry)
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

# Dungeon light. A lit torch lasts until the hero leaves the dungeon and RADIANT
# fades over steps, so both survive stairs between floors (DungeonMap syncs them).
var torch_active: bool = false
var radiant_steps_left: int = 0

# Battle debug: set by DebugLaunch when launching BattleTest scene
var battle_monster: String = "slime"

# Hero equipment and known spells
var spells: Array  = []   # spell IDs: ["heal", "hurt", ...]
var weapon: String = ""   # e.g. "copper_sword"
var armor:  String = ""   # e.g. "chain_mail"
var shield: String = ""   # e.g. "small_shield"

# Quest progression flags
var gwaelin_rescued: bool = false     # Princess Gwaelin found in the Swamp Cave
var gwaelin_returned: bool = false    # Princess Gwaelin brought back to King Lorik
var dragonlord_defeated: bool = false # Final boss beaten — the game is won
var game_completed: bool = false      # Victory reported to King Lorik (credits)

# King Lorik dialogue state
var king_intro_done: bool = false
var tile_debug_enabled: bool = false
var initial_scene_override: String = ""
var demo_mode_enabled: bool = false

# Developer QoL hotkey toggles
var encounters_disabled: bool = false
var double_speed: bool = false

func _ready() -> void:
	var demo_env := OS.get_environment("DW_DEMO").to_lower()
	if demo_env in ["1", "true", "yes"]:
		demo_mode_enabled = true
	_apply_save_state_override_from_env()
	_parse_cmdline_args()
	if initial_scene_override != "":
		var target_path := "res://scenes/%s.tscn" % initial_scene_override
		if ResourceLoader.exists(target_path):
			call_deferred("_jump_to_override_scene", target_path)

func _jump_to_override_scene(target_path: String) -> void:
	var tree := get_tree()
	if tree and tree.current_scene and tree.current_scene.name == "TitleScreen":
		print("[GameState] Jumping directly to save-state scene: ", target_path)
		tree.change_scene_to_file(target_path)

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

func _parse_cmdline_args() -> void:
	var args := OS.get_cmdline_user_args() + OS.get_cmdline_args()
	for i in range(args.size()):
		var arg := str(args[i])
		if arg == "--king-intro-done":
			king_intro_done = true
		elif arg == "--demo" or arg == "-d":
			demo_mode_enabled = true
		elif arg == "--save-state-file" and i + 1 < args.size():
			_load_save_state_from_path(str(args[i + 1]))
		elif arg.begins_with("--save-state-file="):
			_load_save_state_from_path(arg.split("=")[1])
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
	_load_save_state_from_path(save_state_path)

func _load_save_state_from_path(save_state_path: String) -> void:
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
	if data.has("scene") and str(data.get("scene", "")) != "":
		initial_scene_override = str(data.get("scene", ""))
	if data.has("gold"):
		gold = int(data.get("gold", 0))
	if data.has("come_from"):
		come_from = str(data.get("come_from", ""))
	elif data.has("from"):
		come_from = str(data.get("from", ""))
	elif bool(data.get("kingIntroDone", data.get("king_intro_done", false))) or str(data.get("scene", "ThroneRoom")) != "ThroneRoom":
		come_from = "save"
	if data.has("facing"):
		spawn_facing = str(data.get("facing", spawn_facing))
	if data.has("tile"):
		var parsed_tile: Variant = _parse_tile(str(data.get("tile", "")))
		if parsed_tile != null:
			spawn_tile = parsed_tile
	if data.has("bridgeBuilt"):
		bridge_built = bool(data.get("bridgeBuilt", false))
	torch_active = bool(data.get("torchActive", false))
	radiant_steps_left = int(data.get("radiantStepsLeft", 0))
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
	if data.has("heroShield"):
		shield = str(data.get("heroShield", ""))
	if data.has("gwaelinRescued"):
		gwaelin_rescued = bool(data.get("gwaelinRescued", false))
	if data.has("gwaelinReturned"):
		gwaelin_returned = bool(data.get("gwaelinReturned", false))
	if data.has("dragonlordDefeated"):
		dragonlord_defeated = bool(data.get("dragonlordDefeated", false))
	# Explicit heroAtk/heroDef in a save state win over the equipment formula (debug fixtures rely on this).
	if not data.has("heroAtk") and not data.has("heroDef"):
		recompute_derived_stats()

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
	shield          = ""
	gwaelin_rescued = false
	gwaelin_returned = false
	dragonlord_defeated = false
	game_completed = false
	king_intro_done = false
	recompute_derived_stats()

# ── Equipment & progression ──────────────────────────────────────────────────

var _equip_db: Dictionary = {}   # item_id -> {"slot": "weapon"|"armor"|"shield", "attack"/"defense": int, "cost": int, "name": String}

func _load_equip_db() -> void:
	if not _equip_db.is_empty():
		return
	var sources := {
		"weapon": "res://data/v1/weapons.json",
		"armor": "res://data/v1/armor.json",
		"shield": "res://data/v1/shields.json",
	}
	for slot: String in sources:
		var f := FileAccess.open(sources[slot], FileAccess.READ)
		if not f:
			continue
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		var records: Array = []
		if parsed is Array:
			records = parsed
		elif parsed is Dictionary:
			for k in ["weapons", "armor", "shields", "items", "records"]:
				if parsed.get(k) is Array:
					records = parsed[k]
					break
		for rec in records:
			if rec is Dictionary and rec.has("id"):
				var entry: Dictionary = rec.duplicate(true)
				entry["slot"] = slot
				_equip_db[str(rec["id"])] = entry

## Normalises an inventory entry to an equipment id (e.g. "Erdrick's Armor" -> "erdricks_armor").
func equipment_id_for(item: Variant) -> String:
	_load_equip_db()
	var raw_id := ""
	var raw_name := ""
	if item is Dictionary:
		raw_id = str(item.get("id", "")).to_lower()
		raw_name = str(item.get("name", "")).to_lower()
	else:
		raw_name = str(item).to_lower()
	if raw_id != "" and _equip_db.has(raw_id):
		return raw_id
	var norm := raw_name.replace("'", "").replace(" ", "_")
	if _equip_db.has(norm):
		return norm
	norm = raw_id.replace("'", "").replace(" ", "_")
	if _equip_db.has(norm):
		return norm
	return ""

func equipment_slot(item_id: String) -> String:
	_load_equip_db()
	return str(_equip_db.get(item_id, {}).get("slot", ""))

func equipment_info(item_id: String) -> Dictionary:
	_load_equip_db()
	return _equip_db.get(item_id, {})

func get_equipped(slot: String) -> String:
	match slot:
		"weapon": return weapon
		"armor": return armor
		"shield": return shield
	return ""

## Equips `item_id` into its slot and returns the previously equipped id ("" if none).
func equip_item(item_id: String) -> String:
	var slot := equipment_slot(item_id)
	var previous := get_equipped(slot)
	match slot:
		"weapon": weapon = item_id
		"armor": armor = item_id
		"shield": shield = item_id
		_: return ""
	recompute_derived_stats()
	return previous

func unequip_slot(slot: String) -> void:
	match slot:
		"weapon": weapon = ""
		"armor": armor = ""
		"shield": shield = ""
	recompute_derived_stats()

## Erdrick's Armor restores 1 HP per step taken on any map (NES behaviour).
func apply_step_regen() -> void:
	# NES rule: Magic Armor and Erdrick's Armor both restore 1 HP per step.
	if armor != "erdricks_armor" and armor != "magic_armor":
		return
	var hp := int(hero_stats.get("hp", 0))
	var hp_max := int(hero_stats.get("hp_max", 0))
	if hp > 0 and hp < hp_max:
		hero_stats["hp"] = hp + 1

## Attack = Strength + weapon; Defense = Agility / 2 + armor + shield (NES Dragon Warrior formulas).
func recompute_derived_stats() -> void:
	_load_equip_db()
	var str_v := int(hero_stats.get("str", 4))
	var agl_v := int(hero_stats.get("agl", 4))
	var atk := str_v + int(_equip_db.get(weapon, {}).get("attack", 0))
	var def := int(agl_v / 2) + int(_equip_db.get(armor, {}).get("defense", 0)) + int(_equip_db.get(shield, {}).get("defense", 0))
	hero_stats["atk"] = maxi(1, atk)
	hero_stats["def"] = maxi(0, def)

func _level_table() -> Array:
	if DataManager and DataManager.is_loaded and not DataManager.levels.is_empty():
		return DataManager.levels
	var f := FileAccess.open("res://data/v1/levels.json", FileAccess.READ)
	if not f:
		return []
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if parsed is Array:
		return parsed
	if parsed is Dictionary and parsed.get("levels") is Array:
		return parsed["levels"]
	return []

func _level_entry(level: int) -> Dictionary:
	for entry in _level_table():
		var lv: int = 0
		var as_dict: Dictionary = {}
		if entry is Dictionary:
			as_dict = entry
			lv = int(entry.get("level", 0))
		elif entry is Object:
			lv = int(entry.get("level"))
			for k in ["level", "exp_required", "str_gain", "agi_gain", "hp_gain", "mp_gain", "spell"]:
				var v = entry.get(k)
				if v != null:
					as_dict[k] = v
		if lv == level:
			return as_dict
	return {}

func _roll_gain(v: Variant) -> int:
	if v is Array and v.size() >= 2:
		var lo := int(v[0])
		var hi := int(v[1])
		return lo if hi <= lo else lo + (randi() % (hi - lo + 1))
	if v is Array and v.size() == 1:
		return int(v[0])
	if v == null:
		return 0
	return int(v)

## Adds experience and applies every level-up the new total unlocks.
## Returns an Array of {level, str_gain, agi_gain, hp_gain, mp_gain, spell} dictionaries.
func add_exp(amount: int) -> Array:
	hero_stats["exp"] = int(hero_stats.get("exp", 0)) + maxi(0, amount)
	var gained: Array = []
	while true:
		var cur_level := int(hero_stats.get("level", 1))
		var next_entry := _level_entry(cur_level + 1)
		if next_entry.is_empty():
			break
		if int(hero_stats.get("exp", 0)) < int(next_entry.get("exp_required", 2147483647)):
			break
		var sg := _roll_gain(next_entry.get("str_gain", 0))
		var ag := _roll_gain(next_entry.get("agi_gain", 0))
		var hg := _roll_gain(next_entry.get("hp_gain", 0))
		var mg := _roll_gain(next_entry.get("mp_gain", 0))
		hero_stats["level"] = cur_level + 1
		hero_stats["str"] = int(hero_stats.get("str", 4)) + sg
		hero_stats["agl"] = int(hero_stats.get("agl", 4)) + ag
		hero_stats["hp_max"] = int(hero_stats.get("hp_max", 15)) + hg
		hero_stats["mp_max"] = int(hero_stats.get("mp_max", 0)) + mg
		hero_stats["hp"] = mini(int(hero_stats.get("hp_max", 15)), int(hero_stats.get("hp", 15)) + hg)
		hero_stats["mp"] = mini(int(hero_stats.get("mp_max", 0)), int(hero_stats.get("mp", 0)) + mg)
		var spell_id := ""
		if next_entry.get("spell") != null:
			spell_id = str(next_entry.get("spell"))
			if spell_id != "" and not spells.has(spell_id):
				spells.append(spell_id)
		gained.append({
			"level": cur_level + 1,
			"str_gain": sg,
			"agi_gain": ag,
			"hp_gain": hg,
			"mp_gain": mg,
			"spell": spell_id,
		})
	recompute_derived_stats()
	return gained

func has_spell(spell_id: String) -> bool:
	for s in spells:
		if str(s).to_lower() == spell_id.to_lower():
			return true
	return false

func is_game_won() -> bool:
	return dragonlord_defeated

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

func export_state_dict(scene_name: String = "ThroneRoom", current_tile: Vector2i = Vector2i(-1, -1), current_facing: String = "") -> Dictionary:
	var t := current_tile if current_tile != Vector2i(-1, -1) else spawn_tile
	var f := current_facing if current_facing != "" else spawn_facing
	return {
		"name": str(hero_stats.get("name", "ERDRICK")) + " - Lv." + str(hero_stats.get("level", 1)),
		"description": "Checkpoint at %s (%d,%d)" % [scene_name, t.x, t.y],
		"scene": scene_name,
		"tile": str(t.x) + "," + str(t.y),
		"facing": f,
		"come_from": come_from if come_from != "" else "save",
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
		"heroShield": shield,
		"gwaelinRescued": gwaelin_rescued,
		"gwaelinReturned": gwaelin_returned,
		"dragonlordDefeated": dragonlord_defeated,
		"heroSpells": spells.duplicate(true),
		"items": inventory.duplicate(true),
		"openedChests": opened_chests.duplicate(true),
		"unlockedDoors": unlocked_doors.duplicate(true),
		"bridgeBuilt": bridge_built,
		"kingIntroDone": king_intro_done,
		"torchActive": torch_active,
		"radiantStepsLeft": radiant_steps_left,
	}

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
		"heroShield": shield,
		"gwaelinRescued": gwaelin_rescued,
		"gwaelinReturned": gwaelin_returned,
		"dragonlordDefeated": dragonlord_defeated,
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
