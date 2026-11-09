extends Node

var classes_data: Array = []
var xp_table: Array = []
var enemies_data: Array = []
var spells_data: Array = []

var gold: int = 400
var inventory: Array = []
var opened_chests: Dictionary = {}
var unlocked_doors: Dictionary = {}

# Story & Milestone Flags
var party_created: bool = false
var talked_coneria_guard: bool = false
var bought_weapon_coneria: bool = false
var bought_armor_coneria: bool = false
var bought_white_magic_coneria: bool = false
var bought_black_magic_coneria: bool = false
var used_inn_coneria: bool = false
var king_intro_done: bool = false
var first_encounter_won: bool = false
var garland_defeated: bool = false
var princess_rescued: bool = false
var bridge_built: bool = false
var lute_obtained: bool = false
var tile_debug_enabled: bool = false

# Telemetry counters
var battles_won: int = 0
var deaths: int = 0
var overworld_steps: int = 0

var spawn_tile: Vector2i = Vector2i(-1, -1)
var spawn_facing: String = "up"
var come_from: String = ""

var party: Array = []

const DEFAULT_NAMES := ["ZEST", "SAIL", "ROBO", "MAGE"]
const DEFAULT_CLASSES := ["Fighter", "Thief", "White Mage", "Black Mage"]
const CLASS_SLUGS := {
	"Fighter": "fighter",
	"Thief": "thief",
	"Black Belt": "black_belt",
	"Red Mage": "red_mage",
	"White Mage": "white_mage",
	"Black Mage": "black_mage",
	"Knight": "knight",
	"Ninja": "ninja",
	"Master": "master",
	"Red Wizard": "red_wizard",
	"White Wizard": "white_wizard",
	"Black Wizard": "black_wizard"
}

func _ready() -> void:
	_load_nes_tables()
	reset_to_new_game()

func _load_nes_tables() -> void:
	if FileAccess.file_exists("res://data/classes_and_xp.json"):
		var f := FileAccess.open("res://data/classes_and_xp.json", FileAccess.READ)
		if f:
			var parsed = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				classes_data = parsed.get("classes", [])
				xp_table = parsed.get("xpTable", [])
	if FileAccess.file_exists("res://data/enemies.json"):
		var f := FileAccess.open("res://data/enemies.json", FileAccess.READ)
		if f:
			var parsed = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				enemies_data = parsed.get("enemies", [])
	if FileAccess.file_exists("res://data/spells.json"):
		var f := FileAccess.open("res://data/spells.json", FileAccess.READ)
		if f:
			var parsed = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				spells_data = parsed.get("spells", [])

func get_class_template(class_name_str: String) -> Dictionary:
	for c in classes_data:
		if str(c.get("name", "")).to_lower() == class_name_str.to_lower():
			return c
	return {
		"name": class_name_str,
		"startingStats": {"hp": 35, "str": 20, "agi": 5, "int": 1, "vit": 10, "luck": 5, "damage": 10, "hit": 10, "evade": 53, "magicDefense": 15, "mpLv1": 0}
	}

func make_party_member(char_name: String, class_name_str: String) -> Dictionary:
	var tpl := get_class_template(class_name_str)
	var st: Dictionary = tpl.get("startingStats", {})
	var hp_val := int(st.get("hp", 30))
	var str_val := int(st.get("str", 10))
	var agi_val := int(st.get("agi", 10))
	var int_val := int(st.get("int", 10))
	var vit_val := int(st.get("vit", 10))
	var lck_val := int(st.get("luck", 10))
	var mp_val := int(st.get("mpLv1", 0))
	var hit_val := int(st.get("hit", 10))
	var md_val := int(st.get("magicDefense", 15))
	return {
		"name": char_name.substr(0, 4).to_upper(),
		"class": str(tpl.get("name", class_name_str)),
		"sprite_slug": CLASS_SLUGS.get(str(tpl.get("name", class_name_str)), "fighter"),
		"level": 1,
		"exp": 0,
		"hp": hp_val,
		"hp_max": hp_val,
		"mp": mp_val,
		"mp_max": mp_val,
		"str": str_val,
		"agi": agi_val,
		"int": int_val,
		"vit": vit_val,
		"luck": lck_val,
		"attack": int(str_val / 2) + (4 if class_name_str == "Fighter" else 1),
		"accuracy": hit_val,
		"defense": 2,
		"evade": 48 + agi_val,
		"magic_defense": md_val,
		"weapon": "Short Sword" if class_name_str == "Fighter" else ("Knife" if class_name_str == "Thief" else "Staff"),
		"armor": "Cloth",
		"spells": []
	}

func reset_to_new_game() -> void:
	gold = 400
	inventory = []
	opened_chests = {}
	unlocked_doors = {}
	party_created = false
	talked_coneria_guard = false
	bought_weapon_coneria = false
	bought_armor_coneria = false
	bought_white_magic_coneria = false
	bought_black_magic_coneria = false
	used_inn_coneria = false
	king_intro_done = false
	first_encounter_won = false
	garland_defeated = false
	princess_rescued = false
	bridge_built = false
	lute_obtained = false
	battles_won = 0
	deaths = 0
	overworld_steps = 0
	party = []
	for i in range(4):
		party.append(make_party_member(DEFAULT_NAMES[i], DEFAULT_CLASSES[i]))

func get_flag(flag_name: String) -> bool:
	match flag_name:
		"party_created": return party_created
		"talked_coneria_guard": return talked_coneria_guard
		"bought_weapon_coneria": return bought_weapon_coneria
		"bought_armor_coneria": return bought_armor_coneria
		"bought_white_magic_coneria": return bought_white_magic_coneria
		"bought_black_magic_coneria": return bought_black_magic_coneria
		"used_inn_coneria": return used_inn_coneria
		"king_intro_done": return king_intro_done
		"first_encounter_won": return first_encounter_won
		"garland_defeated": return garland_defeated
		"princess_rescued": return princess_rescued
		"bridge_built": return bridge_built
		"lute_obtained": return lute_obtained
	return false

func get_enemy_by_name(enemy_name: String) -> Dictionary:
	var q := enemy_name.strip_edges().to_lower()
	for e in enemies_data:
		var n := str(e.get("name", "")).to_lower()
		var r := str(e.get("romName", "")).to_lower()
		if n == q or r == q or q in n:
			return e
	return {
		"name": enemy_name.to_upper(),
		"hp": 8,
		"attack": 4,
		"accuracy": 2,
		"hits": 1,
		"critRate": 1,
		"defense": 4,
		"evade": 6,
		"magicDefense": 16,
		"xp": 6,
		"gold": 6
	}

func hero_stats_summary() -> Dictionary:
	if party.is_empty():
		reset_to_new_game()
	var leader: Dictionary = party[0]
	var spells_all: Array = []
	for m in party:
		if m is Dictionary:
			for sp in m.get("spells", []):
				if not (sp in spells_all):
					spells_all.append(sp)
	return {
		"name": leader.get("name", "ZEST"),
		"class": leader.get("class", "Fighter"),
		"level": leader.get("level", 1),
		"hp": leader.get("hp", 35),
		"hp_max": leader.get("hp_max", 35),
		"mp": party[2].get("mp", 2) if party.size() > 2 else 0,
		"mp_max": party[2].get("mp_max", 2) if party.size() > 2 else 0,
		"str": leader.get("str", 20),
		"agi": leader.get("agi", 5),
		"int": leader.get("int", 1),
		"vit": leader.get("vit", 10),
		"luck": leader.get("luck", 5),
		"attack": leader.get("attack", 14),
		"defense": leader.get("defense", 2),
		"exp": leader.get("exp", 0),
		"gold": gold,
		"weapon": leader.get("weapon", "Short Sword"),
		"armor": leader.get("armor", "Cloth"),
		"spells": spells_all
	}

func export_checkpoint_dict(scene_name: String, hero_pos: Vector2i, facing_str: String) -> Dictionary:
	return {
		"version": 1,
		"game": "Fantasy: Light Warriors (WIP)",
		"scene": scene_name,
		"x": hero_pos.x,
		"y": hero_pos.y,
		"facing": facing_str,
		"gold": gold,
		"party": party.duplicate(true),
		"inventory": inventory.duplicate(true),
		"opened_chests": opened_chests.duplicate(true),
		"unlocked_doors": unlocked_doors.duplicate(true),
		"flags": {
			"party_created": party_created,
			"talked_coneria_guard": talked_coneria_guard,
			"bought_weapon_coneria": bought_weapon_coneria,
			"bought_armor_coneria": bought_armor_coneria,
			"bought_white_magic_coneria": bought_white_magic_coneria,
			"bought_black_magic_coneria": bought_black_magic_coneria,
			"used_inn_coneria": used_inn_coneria,
			"king_intro_done": king_intro_done,
			"first_encounter_won": first_encounter_won,
			"garland_defeated": garland_defeated,
			"princess_rescued": princess_rescued,
			"bridge_built": bridge_built,
			"lute_obtained": lute_obtained
		},
		"telemetry": {
			"battles_won": battles_won,
			"deaths": deaths,
			"overworld_steps": overworld_steps
		}
	}

func apply_checkpoint_dict(data: Dictionary) -> void:
	gold = int(data.get("gold", 400))
	if data.has("party") and data["party"] is Array and not (data["party"] as Array).is_empty():
		party = (data["party"] as Array).duplicate(true)
	if data.has("inventory") and data["inventory"] is Array:
		inventory = (data["inventory"] as Array).duplicate(true)
	if data.has("opened_chests") and data["opened_chests"] is Dictionary:
		opened_chests = (data["opened_chests"] as Dictionary).duplicate(true)
	if data.has("unlocked_doors") and data["unlocked_doors"] is Dictionary:
		unlocked_doors = (data["unlocked_doors"] as Dictionary).duplicate(true)
	var fl: Dictionary = data.get("flags", {}) if data.get("flags") is Dictionary else {}
	party_created = bool(fl.get("party_created", true))
	talked_coneria_guard = bool(fl.get("talked_coneria_guard", false))
	bought_weapon_coneria = bool(fl.get("bought_weapon_coneria", false))
	bought_armor_coneria = bool(fl.get("bought_armor_coneria", false))
	bought_white_magic_coneria = bool(fl.get("bought_white_magic_coneria", false))
	bought_black_magic_coneria = bool(fl.get("bought_black_magic_coneria", false))
	used_inn_coneria = bool(fl.get("used_inn_coneria", false))
	king_intro_done = bool(fl.get("king_intro_done", false))
	first_encounter_won = bool(fl.get("first_encounter_won", false))
	garland_defeated = bool(fl.get("garland_defeated", false))
	princess_rescued = bool(fl.get("princess_rescued", false))
	bridge_built = bool(fl.get("bridge_built", false))
	lute_obtained = bool(fl.get("lute_obtained", false))
	var tel: Dictionary = data.get("telemetry", {}) if data.get("telemetry") is Dictionary else {}
	battles_won = int(tel.get("battles_won", 0))
	deaths = int(tel.get("deaths", 0))
	overworld_steps = int(tel.get("overworld_steps", 0))
