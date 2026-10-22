extends Node

const _DUNGEON_MAP_SCRIPT = preload("res://scripts/DungeonMap.gd")

const KNOWN_ITEMS := {
	"Torch":          { "name": "Torch",          "type": "item",      "desc": "Lights dark dungeons." },
	"Magic Key":      { "name": "Magic Key",       "type": "key",       "desc": "Opens locked doors." },
	"key":            { "name": "Magic Key",       "type": "key",       "desc": "Opens locked doors." },
	"Herb":           { "name": "Herb",            "type": "herb",      "desc": "Restores ~23-30 HP." },
	"Fairy Water":    { "name": "Fairy Water",     "type": "item",      "desc": "Repels weak monsters." },
	"Wings":          { "name": "Wings",           "type": "item",      "desc": "Warp to Tantegel." },
	"Dragon's Scale": { "name": "Dragon's Scale",  "type": "armor_acc", "desc": "Raises defense by 2." },
	"Rainbow Drop":   { "id": "rainbow_drop",   "name": "Rainbow Drop",    "type": "quest",     "desc": "Spans the sea to Charlock." },
	"Fighter's Ring": { "name": "Fighter's Ring",  "type": "ring",      "desc": "Raises attack by 2." },
}

const SCENE_MAP := {
	"TitleScreen":           "res://scenes/TitleScreen.tscn",
	"SaveSelect":            "res://scenes/SaveSelect.tscn",
	"ThroneRoom":            "res://scenes/ThroneRoom.tscn",
	"Castle1F":              "res://scenes/Castle1F.tscn",
	"WorldMap":              "res://scenes/WorldMap.tscn",
	"BattleTest":            "res://scenes/BattleTest.tscn",
	"Brecconary":            "res://scenes/Brecconary.tscn",
	"Garinham":              "res://scenes/Garinham.tscn",
	"Kol":                   "res://scenes/Kol.tscn",
	"Rimuldar":              "res://scenes/Rimuldar.tscn",
	"Cantlin":               "res://scenes/Cantlin.tscn",
	"Hauksness":             "res://scenes/Hauksness.tscn",
	"TantegelBasement":      "res://scenes/TantegelBasement.tscn",
	"GarinhamB1":            "res://scenes/GarinhamB1.tscn",
	"GarinhamB2":            "res://scenes/GarinhamB2.tscn",
	"GarinhamB3":            "res://scenes/GarinhamB3.tscn",
	"GarinhamB4":            "res://scenes/GarinhamB4.tscn",
	"MountainCaveB1":        "res://scenes/MountainCaveB1.tscn",
	"MountainCaveB2":        "res://scenes/MountainCaveB2.tscn",
	"ErdricksCaveB1":        "res://scenes/ErdricksCaveB1.tscn",
	"ErdricksCaveB2":        "res://scenes/ErdricksCaveB2.tscn",
	"SwampCave":             "res://scenes/SwampCave.tscn",
	"CharlockCastle1F":      "res://scenes/CharlockCastle1F.tscn",
	"CharlockCastleB1":      "res://scenes/CharlockCastleB1.tscn",
	"CharlockCastleB2":      "res://scenes/CharlockCastleB2.tscn",
	"CharlockCastleB3":      "res://scenes/CharlockCastleB3.tscn",
	"CharlockCastleB4":      "res://scenes/CharlockCastleB4.tscn",
	"CharlockCastleB5":      "res://scenes/CharlockCastleB5.tscn",
	"CharlockCastleB6":      "res://scenes/CharlockCastleB6.tscn",
	"CharlockThroneRoom":    "res://scenes/CharlockThroneRoom.tscn",
	"StaffOfRainCave":       "res://scenes/StaffOfRainCave.tscn",
	"RainbowDropCave":       "res://scenes/RainbowDropCave.tscn",
}

const MAP_POSITIONS := [
	{ "label": "Throne Room — start", "scene": "ThroneRoom", "tile": Vector2i(4,5), "facing": "up", "come_from": "debug", "category": "Castle" },
	{ "label": "Throne Room — before King", "scene": "ThroneRoom", "tile": Vector2i(4,2), "facing": "up", "come_from": "debug", "category": "Castle" },
	{ "label": "Castle 1F — entrance", "scene": "Castle1F", "tile": Vector2i(12,31), "facing": "up", "come_from": "world_map", "category": "Castle" },
	{ "label": "Castle 1F — stairs to throne", "scene": "Castle1F", "tile": Vector2i(9,10), "facing": "up", "come_from": "debug", "category": "Castle" },
	{ "label": "Castle 1F — basement stairs", "scene": "Castle1F", "tile": Vector2i(7,2), "facing": "up", "come_from": "debug", "category": "Castle" },
	{ "label": "Tantegel Basement", "scene": "TantegelBasement", "tile": Vector2i(5,8), "facing": "down", "come_from": "castle_1f", "category": "Castle" },
	{ "label": "Brecconary — entrance", "scene": "Brecconary", "tile": Vector2i(16,28), "facing": "up", "come_from": "world_map", "category": "Towns" },
	{ "label": "Garinham — entrance", "scene": "Garinham", "tile": Vector2i(11,20), "facing": "up", "come_from": "world_map", "category": "Towns" },
	{ "label": "Kol — entrance", "scene": "Kol", "tile": Vector2i(13,24), "facing": "up", "come_from": "world_map", "category": "Towns" },
	{ "label": "Rimuldar — entrance", "scene": "Rimuldar", "tile": Vector2i(2,16), "facing": "right", "come_from": "world_map", "category": "Towns" },
	{ "label": "Cantlin — entrance", "scene": "Cantlin", "tile": Vector2i(16,2), "facing": "down", "come_from": "world_map", "category": "Towns" },
	{ "label": "Hauksness — entrance", "scene": "Hauksness", "tile": Vector2i(11,20), "facing": "up", "come_from": "world_map", "category": "Towns" },
	{ "label": "WorldMap — Tantegel area", "scene": "WorldMap", "tile": Vector2i(45,45), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Brecconary area", "scene": "WorldMap", "tile": Vector2i(50,41), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Garinham area", "scene": "WorldMap", "tile": Vector2i(20,16), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Kol area", "scene": "WorldMap", "tile": Vector2i(98,11), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Rimuldar area", "scene": "WorldMap", "tile": Vector2i(96,43), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Cantlin area", "scene": "WorldMap", "tile": Vector2i(83,106), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Charlock Island", "scene": "WorldMap", "tile": Vector2i(58,66), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Hauksness area", "scene": "WorldMap", "tile": Vector2i(9,89), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Erdrick's Cave", "scene": "WorldMap", "tile": Vector2i(42,30), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Mountain Cave", "scene": "WorldMap", "tile": Vector2i(31,59), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "WorldMap — Swamp Cave N", "scene": "WorldMap", "tile": Vector2i(94,28), "facing": "down", "come_from": "debug", "category": "Overworld" },
	{ "label": "Garin's Grave B1", "scene": "GarinhamB1", "tile": Vector2i(6,1), "facing": "down", "come_from": "garinham", "category": "Dungeons" },
	{ "label": "Garin's Grave B2", "scene": "GarinhamB2", "tile": Vector2i(1,1), "facing": "down", "come_from": "garinham_b1", "category": "Dungeons" },
	{ "label": "Garin's Grave B3", "scene": "GarinhamB3", "tile": Vector2i(1,1), "facing": "down", "come_from": "garinham_b2", "category": "Dungeons" },
	{ "label": "Garin's Grave B4 — Lyre", "scene": "GarinhamB4", "tile": Vector2i(1,1), "facing": "down", "come_from": "garinham_b3", "category": "Dungeons" },
	{ "label": "Mountain Cave B1", "scene": "MountainCaveB1", "tile": Vector2i(1,14), "facing": "right", "come_from": "world_map", "category": "Dungeons" },
	{ "label": "Mountain Cave B2 — Ring", "scene": "MountainCaveB2", "tile": Vector2i(1,1), "facing": "down", "come_from": "mountain_cave_b1", "category": "Dungeons" },
	{ "label": "Erdrick's Cave B1", "scene": "ErdricksCaveB1", "tile": Vector2i(6,1), "facing": "down", "come_from": "world_map", "category": "Dungeons" },
	{ "label": "Erdrick's Cave B2 — Tablet", "scene": "ErdricksCaveB2", "tile": Vector2i(1,1), "facing": "down", "come_from": "erdricks_cave_b1", "category": "Dungeons" },
	{ "label": "Swamp Cave — North entrance", "scene": "SwampCave", "tile": Vector2i(4,1), "facing": "down", "come_from": "world_map", "category": "Dungeons" },
	{ "label": "Swamp Cave — South entrance", "scene": "SwampCave", "tile": Vector2i(4,30), "facing": "up", "come_from": "world_map", "category": "Dungeons" },
	{ "label": "Charlock Castle 1F — entrance", "scene": "CharlockCastle1F", "tile": Vector2i(11,20), "facing": "up", "come_from": "world_map", "category": "Charlock" },
	{ "label": "Charlock Castle 1F — B1 stairs", "scene": "CharlockCastle1F", "tile": Vector2i(10,11), "facing": "up", "come_from": "debug", "category": "Charlock" },
	{ "label": "Charlock B1", "scene": "CharlockCastleB1", "tile": Vector2i(11,11), "facing": "down", "come_from": "charlock_castle_1f", "category": "Charlock" },
	{ "label": "Charlock B2", "scene": "CharlockCastleB2", "tile": Vector2i(1,1), "facing": "down", "come_from": "charlock_b1", "category": "Charlock" },
	{ "label": "Charlock B3", "scene": "CharlockCastleB3", "tile": Vector2i(1,1), "facing": "down", "come_from": "charlock_b2", "category": "Charlock" },
	{ "label": "Charlock B4", "scene": "CharlockCastleB4", "tile": Vector2i(1,1), "facing": "down", "come_from": "charlock_b3", "category": "Charlock" },
	{ "label": "Charlock B5", "scene": "CharlockCastleB5", "tile": Vector2i(1,1), "facing": "down", "come_from": "charlock_b4", "category": "Charlock" },
	{ "label": "Charlock B6", "scene": "CharlockCastleB6", "tile": Vector2i(1,1), "facing": "down", "come_from": "charlock_b5", "category": "Charlock" },
	{ "label": "Dragonlord Throne Room", "scene": "CharlockThroneRoom", "tile": Vector2i(14,28), "facing": "up", "come_from": "charlock_b6", "category": "Charlock" },
]

const BATTLE_PRESETS := [
	{ "label": "Slime", "key": "slime" },
	{ "label": "Red Slime", "key": "red_slime" },
	{ "label": "Drakee", "key": "drakee" },
	{ "label": "Ghost", "key": "ghost" },
	{ "label": "Magician", "key": "magician" },
	{ "label": "Scorpion", "key": "scorpion" },
	{ "label": "Druin", "key": "druin" },
	{ "label": "Wyvern", "key": "wyvern" },
	{ "label": "Goldman", "key": "goldman" },
	{ "label": "Knight", "key": "knight" },
	{ "label": "Axe Knight", "key": "axe_knight" },
	{ "label": "Blue Dragon", "key": "blue_dragon" },
	{ "label": "Green Dragon", "key": "green_dragon" },
	{ "label": "Golem", "key": "golem" },
	{ "label": "Dragonlord (1)", "key": "dragonlord_form1" },
	{ "label": "Dragonlord (2)", "key": "dragonlord_form2" },
]

var _gui_mode := false
var _map_all_rows: Array = []
var _map_visible_rows: Array = []
var _selected_map_idx := -1
var _map_item_labels: Array = []

const VW := 1024
const VH := 768
const BG_COLOR   := Color(0.05, 0.07, 0.12)
const PANEL_BG   := Color(0.08, 0.10, 0.18)
const ACCENT     := Color(0.0,  0.74, 0.83)
const TEXT_WHITE := Color(1.0,  1.0,  1.0)
const TEXT_DIM   := Color(0.6,  0.6,  0.7)
const CAT_COLORS := {
	"Castle":    Color(0.9, 0.8, 0.3),
	"Towns":     Color(0.4, 0.9, 0.5),
	"Overworld": Color(0.3, 0.7, 1.0),
	"Dungeons":  Color(0.9, 0.5, 0.2),
	"Charlock":  Color(1.0, 0.3, 0.3),
}

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_run_cli(args)
	else:
		_run_gui()

func _run_cli(args: Array) -> void:
	var scene           := "ThroneRoom"
	var tile            := Vector2i(-1, -1)
	var facing          := ""
	var gold            := 0
	var items           : Array = []
	var from            := ""
	var all_chests      := ""
	var unlocked_doors  := ""
	var bridge_built    := false
	var monster         := ""
	var hero_name       := ""
	var hero_level      := -1
	var hero_hp         := -1
	var hero_hp_max     := -1
	var hero_mp         := -1
	var hero_mp_max     := -1
	var hero_str        := -1
	var hero_atk        := -1
	var hero_def        := -1
	var hero_agl        := -1
	var hero_exp        := -1
	var hero_spells     := ""
	var hero_weapon     := ""
	var hero_armor      := ""
	var king_intro_done := false
	var tile_debug_enabled := false
	var i := 0
	while i < args.size():
		var key: String = args[i]
		var has_val := i + 1 < args.size()
		match key:
			"--scene": if has_val: scene = args[i + 1]; i += 2
			"--facing": if has_val: facing = args[i + 1]; i += 2
			"--from": if has_val: from = args[i + 1]; i += 2
			"--all-chests": if has_val: all_chests = args[i + 1]; i += 2
			"--unlocked-doors": if has_val: unlocked_doors = args[i + 1]; i += 2
			"--bridge-built": if has_val: bridge_built = int(args[i + 1]) != 0; i += 2
			"--monster": if has_val: monster = args[i + 1]; i += 2
			"--hero-name": if has_val: hero_name = args[i + 1]; i += 2
			"--hero-level": if has_val: hero_level = int(args[i + 1]); i += 2
			"--hero-hp": if has_val: hero_hp = int(args[i + 1]); i += 2
			"--hero-hp-max": if has_val: hero_hp_max = int(args[i + 1]); i += 2
			"--hero-mp": if has_val: hero_mp = int(args[i + 1]); i += 2
			"--hero-mp-max": if has_val: hero_mp_max = int(args[i + 1]); i += 2
			"--hero-str": if has_val: hero_str = int(args[i + 1]); i += 2
			"--hero-atk": if has_val: hero_atk = int(args[i + 1]); i += 2
			"--hero-def": if has_val: hero_def = int(args[i + 1]); i += 2
			"--hero-agl": if has_val: hero_agl = int(args[i + 1]); i += 2
			"--hero-exp": if has_val: hero_exp = int(args[i + 1]); i += 2
			"--hero-spells": if has_val: hero_spells = args[i + 1]; i += 2
			"--hero-weapon": if has_val: hero_weapon = args[i + 1]; i += 2
			"--hero-armor": if has_val: hero_armor = args[i + 1]; i += 2
			"--tile":
				if has_val:
					var parts: PackedStringArray = args[i + 1].split(",")
					tile = Vector2i(int(parts[0]), int(parts[1]))
				i += 2
			"--gold":
				if has_val: gold = int(args[i + 1])
				i += 2
			"--items":
				if has_val:
					for entry in args[i + 1].split(";"):
						var parts: PackedStringArray = entry.strip_edges().split(",")
						var iname: String = parts[0].strip_edges()
						var qty   := int(parts[1]) if parts.size() > 1 else 1
						if KNOWN_ITEMS.has(iname):
							for _q in range(qty):
								items.append(KNOWN_ITEMS[iname].duplicate())
				i += 2
			"--king-intro-done":
				king_intro_done = true
				i += 1
			"--tile-debug":
				tile_debug_enabled = true
				i += 1
			"--mute":
				# Headless / e2e runs: silence every bus (the recording uses -an anyway).
				AudioServer.set_bus_mute(AudioServer.get_bus_index("Master"), true)
				i += 1
			_: i += 1
	_apply_game_state(tile, facing, gold, items, from, all_chests, unlocked_doors,
		bridge_built, monster, hero_name, hero_level, hero_hp, hero_hp_max, hero_mp,
		hero_mp_max, hero_str, hero_atk, hero_def, hero_agl, hero_exp,
		hero_spells, hero_weapon, hero_armor, king_intro_done, tile_debug_enabled)
	var path: String = SCENE_MAP.get(scene, "res://scenes/" + scene + ".tscn")
	var gs := get_node_or_null("/root/GameState")
	print("[DebugLaunch] scene=%s tile=%s facing=%s gold=%d come_from=%s" % [
		path, str(gs.spawn_tile if gs else tile), facing, gold, from])
	_restore_game_viewport()
	var packed: PackedScene = load(path)
	if packed:
		get_tree().call_deferred("change_scene_to_packed", packed)
	else:
		get_tree().call_deferred("change_scene_to_file", path)

func _apply_game_state(tile: Vector2i, facing: String, gold: int, items: Array,
		from: String, all_chests: String, unlocked_doors: String,
		bridge_built: bool, monster: String, hero_name: String, hero_level: int,
		hero_hp: int, hero_hp_max: int, hero_mp: int, hero_mp_max: int,
		hero_str: int, hero_atk: int, hero_def: int, hero_agl: int, hero_exp: int,
		hero_spells: String, hero_weapon: String, hero_armor: String,
		king_intro_done: bool = false, tile_debug_enabled: bool = false) -> void:
	var gs := get_node_or_null("/root/GameState")
	if not gs:
		return
	gs.gold      = gold
	gs.inventory = items
	gs.come_from = from if from != "" else ("debug" if tile != Vector2i(-1, -1) else "")
	gs.bridge_built = bridge_built
	if king_intro_done:
		gs.king_intro_done = true
	if tile_debug_enabled:
		gs.tile_debug_enabled = true
	if tile != Vector2i(-1, -1):
		gs.spawn_tile   = tile
		if PlayerState:
			PlayerState.tile_position = tile
	if facing != "":
		gs.spawn_facing = facing
	if all_chests != "":
		for coord in all_chests.split(";"):
			gs.opened_chests[coord.strip_edges()] = true
	if unlocked_doors != "":
		for door_id in unlocked_doors.split(";"):
			gs.unlocked_doors[door_id.strip_edges()] = true
	if monster != "": gs.battle_monster = monster
	if hero_name != "": gs.hero_stats["name"] = hero_name
	if hero_level >= 0: gs.hero_stats["level"] = hero_level
	if hero_hp >= 0:
		gs.hero_stats["hp"] = hero_hp
		if hero_hp_max < 0:
			gs.hero_stats["hp_max"] = hero_hp
	if hero_hp_max >= 0: gs.hero_stats["hp_max"] = hero_hp_max
	if hero_mp >= 0:
		gs.hero_stats["mp"] = hero_mp
		if hero_mp_max < 0:
			gs.hero_stats["mp_max"] = hero_mp
	if hero_mp_max >= 0: gs.hero_stats["mp_max"] = hero_mp_max
	if hero_str >= 0: gs.hero_stats["str"] = hero_str
	if hero_atk >= 0:
		gs.hero_stats["atk"] = hero_atk
		if hero_str < 0:
			gs.hero_stats["str"] = hero_atk
	if hero_def >= 0: gs.hero_stats["def"] = hero_def
	if hero_agl >= 0: gs.hero_stats["agl"] = hero_agl
	if hero_exp >= 0: gs.hero_stats["exp"] = hero_exp
	if hero_spells != "":
		gs.spells = []
		for sp in hero_spells.split(";"):
			var s := sp.strip_edges()
			if s != "": gs.spells.append(s)
	if hero_weapon != "": gs.weapon = hero_weapon
	if hero_armor  != "": gs.armor  = hero_armor

func _run_gui() -> void:
	_gui_mode = true
	var win := get_window()
	win.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	win.content_scale_size = Vector2i(0, 0)
	win.size = Vector2i(VW, VH)
	var bg := ColorRect.new()
	bg.color = BG_COLOR
	bg.size  = Vector2(VW, VH)
	add_child(bg)
	var title_bar := ColorRect.new()
	title_bar.color    = Color(0.02, 0.04, 0.10)
	title_bar.size     = Vector2(VW, 48)
	add_child(title_bar)
	var title_lbl := Label.new()
	title_lbl.text     = "Dragon Warrior I  —  Debug Launcher"
	title_lbl.position = Vector2(16, 10)
	title_lbl.add_theme_color_override("font_color", ACCENT)
	title_lbl.add_theme_font_size_override("font_size", 22)
	add_child(title_lbl)
	var esc_lbl := Label.new()
	esc_lbl.text     = "ESC to quit"
	esc_lbl.position = Vector2(VW - 120, 15)
	esc_lbl.add_theme_color_override("font_color", TEXT_DIM)
	esc_lbl.add_theme_font_size_override("font_size", 13)
	add_child(esc_lbl)
	var TABS := ["Map Positions", "Scenes", "Battle"]
	var tab_bg := ColorRect.new()
	tab_bg.color    = Color(0.03, 0.05, 0.11)
	tab_bg.size     = Vector2(VW, 36)
	tab_bg.position = Vector2(0, 48)
	add_child(tab_bg)
	var tab_bar := HBoxContainer.new()
	tab_bar.position = Vector2(0, 48)
	tab_bar.size     = Vector2(VW, 36)
	add_child(tab_bar)
	var tab_buttons: Array = []
	for t in TABS:
		var btn := Button.new()
		btn.text = t
		btn.custom_minimum_size = Vector2(180, 36)
		_style_tab_btn(btn, false)
		tab_bar.add_child(btn)
		tab_buttons.append(btn)
	var panels: Array = []
	for _t in TABS:
		var panel := Control.new()
		panel.position = Vector2(0, 84)
		panel.size     = Vector2(VW, VH - 84)
		panel.visible  = false
		add_child(panel)
		panels.append(panel)
	for idx in tab_buttons.size():
		var btn : Button = tab_buttons[idx]
		btn.pressed.connect(func():
			for j in panels.size():
				panels[j].visible = (j == idx)
			for j in tab_buttons.size():
				_style_tab_btn(tab_buttons[j], j == idx)
		)
	_build_maps_tab(panels[0])
	_build_scenes_tab(panels[1])
	_build_battle_tab(panels[2])
	panels[0].visible = true
	_style_tab_btn(tab_buttons[0], true)

func _style_tab_btn(btn: Button, active: bool) -> void:
	var s := StyleBoxFlat.new()
	s.bg_color = ACCENT if active else Color(0.1, 0.13, 0.22)
	s.corner_radius_top_left    = 4
	s.corner_radius_top_right   = 4
	s.corner_radius_bottom_left = 0
	s.corner_radius_bottom_right = 0
	btn.add_theme_stylebox_override("normal",  s)
	btn.add_theme_stylebox_override("hover",   s)
	btn.add_theme_stylebox_override("pressed", s)
	btn.add_theme_color_override("font_color", BG_COLOR if active else TEXT_WHITE)
	btn.add_theme_font_size_override("font_size", 14)

func _build_maps_tab(parent: Control) -> void:
	var left := ColorRect.new()
	left.color    = PANEL_BG
	left.position = Vector2(8, 8)
	left.size     = Vector2(460, VH - 100)
	parent.add_child(left)
	var filter_lbl := Label.new()
	filter_lbl.text     = "Filter:"
	filter_lbl.position = Vector2(16, 16)
	filter_lbl.add_theme_color_override("font_color", TEXT_DIM)
	filter_lbl.add_theme_font_size_override("font_size", 13)
	left.add_child(filter_lbl)
	var filter_edit := LineEdit.new()
	filter_edit.position         = Vector2(62, 10)
	filter_edit.size             = Vector2(288, 28)
	filter_edit.placeholder_text = "type to filter..."
	_style_lineedit(filter_edit)
	left.add_child(filter_edit)
	var cat_row := HBoxContainer.new()
	cat_row.position = Vector2(8, 44)
	cat_row.size     = Vector2(450, 28)
	left.add_child(cat_row)
	var all_btn := Button.new()
	all_btn.text = "All"
	all_btn.custom_minimum_size = Vector2(40, 24)
	_style_small_btn(all_btn, ACCENT)
	cat_row.add_child(all_btn)
	var cat_btns: Dictionary = {}
	for cat in ["Castle", "Towns", "Overworld", "Dungeons", "Charlock"]:
		var cb := Button.new()
		cb.text = cat
		cb.custom_minimum_size = Vector2(72, 24)
		_style_small_btn(cb, CAT_COLORS.get(cat, ACCENT))
		cat_row.add_child(cb)
		cat_btns[cat] = cb
	var scroll := ScrollContainer.new()
	scroll.position              = Vector2(4, 76)
	scroll.size                  = Vector2(452, VH - 184)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	left.add_child(scroll)
	var list_vbox := VBoxContainer.new()
	list_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(list_vbox)
	var right := ColorRect.new()
	right.color    = PANEL_BG
	right.position = Vector2(480, 8)
	right.size     = Vector2(VW - 488, VH - 100)
	parent.add_child(right)
	var detail_title := Label.new()
	detail_title.text     = "Select a location"
	detail_title.position = Vector2(16, 16)
	detail_title.size     = Vector2(VW - 520, 30)
	detail_title.add_theme_color_override("font_color", ACCENT)
	detail_title.add_theme_font_size_override("font_size", 18)
	right.add_child(detail_title)
	var sep := ColorRect.new()
	sep.color    = ACCENT * 0.5
	sep.position = Vector2(16, 48)
	sep.size     = Vector2(VW - 520, 2)
	right.add_child(sep)
	var detail_body := RichTextLabel.new()
	detail_body.position       = Vector2(16, 56)
	detail_body.size           = Vector2(VW - 520, 240)
	detail_body.bbcode_enabled = true
	detail_body.text           = "[color=#99aacc]Select a location from the list.[/color]"
	detail_body.add_theme_font_size_override("normal_font_size", 14)
	right.add_child(detail_body)
	var launch_btn := Button.new()
	launch_btn.text     = "LAUNCH"
	launch_btn.position = Vector2(16, 310)
	launch_btn.size     = Vector2(VW - 520, 52)
	launch_btn.disabled = true
	_style_launch_btn(launch_btn)
	right.add_child(launch_btn)
	var equip_lbl := Label.new()
	equip_lbl.text     = "Equipment preset:"
	equip_lbl.position = Vector2(16, 374)
	equip_lbl.add_theme_color_override("font_color", TEXT_DIM)
	equip_lbl.add_theme_font_size_override("font_size", 13)
	right.add_child(equip_lbl)
	var equip_opts := OptionButton.new()
	equip_opts.position = Vector2(16, 394)
	equip_opts.size     = Vector2(VW - 520, 32)
	for opt in ["None (bare hands)", "Early game (Club + Leather Armor)",
		"Mid game (Broad Sword + Half Plate)", "Late game (Flame Sword + Magic Armor)",
		"Endgame (Erdrick's Sword + Erdrick's Armor)"]:
		equip_opts.add_item(opt)
	_style_option_btn(equip_opts)
	right.add_child(equip_opts)
	var gold_lbl := Label.new()
	gold_lbl.text     = "Starting gold:"
	gold_lbl.position = Vector2(16, 438)
	gold_lbl.add_theme_color_override("font_color", TEXT_DIM)
	gold_lbl.add_theme_font_size_override("font_size", 13)
	right.add_child(gold_lbl)
	var gold_spin := SpinBox.new()
	gold_spin.position  = Vector2(16, 458)
	gold_spin.size      = Vector2(160, 30)
	gold_spin.min_value = 0
	gold_spin.max_value = 65535
	gold_spin.step      = 100
	gold_spin.value     = 500
	right.add_child(gold_spin)
	var keys_lbl := Label.new()
	keys_lbl.text     = "Magic Keys:"
	keys_lbl.position = Vector2(200, 438)
	keys_lbl.add_theme_color_override("font_color", TEXT_DIM)
	keys_lbl.add_theme_font_size_override("font_size", 13)
	right.add_child(keys_lbl)
	var keys_spin := SpinBox.new()
	keys_spin.position  = Vector2(200, 458)
	keys_spin.size      = Vector2(100, 30)
	keys_spin.min_value = 0
	keys_spin.max_value = 6
	keys_spin.value     = 0
	right.add_child(keys_spin)
	_map_all_rows     = MAP_POSITIONS.duplicate()
	_map_visible_rows = _map_all_rows.duplicate()
	_map_item_labels  = []
	_rebuild_map_list(list_vbox, detail_title, detail_body, launch_btn, equip_opts, gold_spin, keys_spin)
	filter_edit.text_changed.connect(func(_t: String):
		_map_visible_rows = []
		var q := filter_edit.text.to_lower()
		for e in _map_all_rows:
			if q == "" or q in str(e.get("label","")).to_lower() or q in str(e.get("category","")).to_lower():
				_map_visible_rows.append(e)
		_selected_map_idx = -1
		_rebuild_map_list(list_vbox, detail_title, detail_body, launch_btn, equip_opts, gold_spin, keys_spin)
	)
	all_btn.pressed.connect(func():
		filter_edit.text  = ""
		_map_visible_rows = _map_all_rows.duplicate()
		_selected_map_idx = -1
		_rebuild_map_list(list_vbox, detail_title, detail_body, launch_btn, equip_opts, gold_spin, keys_spin)
	)
	for cat in cat_btns:
		var cc: String = cat
		cat_btns[cat].pressed.connect(func():
			filter_edit.text  = cc
			_map_visible_rows = []
			for e in _map_all_rows:
				if str(e.get("category","")).to_lower() == cc.to_lower():
					_map_visible_rows.append(e)
			_selected_map_idx = -1
			_rebuild_map_list(list_vbox, detail_title, detail_body, launch_btn, equip_opts, gold_spin, keys_spin)
		)

func _rebuild_map_list(list_vbox: VBoxContainer, detail_title: Label,
		detail_body: RichTextLabel, launch_btn: Button,
		equip_opts: OptionButton, gold_spin: SpinBox, keys_spin: SpinBox) -> void:
	for child in list_vbox.get_children():
		child.queue_free()
	_map_item_labels.clear()
	for idx in _map_visible_rows.size():
		var entry: Dictionary = _map_visible_rows[idx]
		var cat:   String     = entry.get("category", "")
		var cc:    Color      = CAT_COLORS.get(cat, TEXT_DIM)
		var row_btn := Button.new()
		row_btn.text                = "   " + str(entry.get("label",""))
		row_btn.flat                = true
		row_btn.custom_minimum_size = Vector2(440, 32)
		row_btn.alignment           = HORIZONTAL_ALIGNMENT_LEFT
		_style_list_row(row_btn, false, cc)
		list_vbox.add_child(row_btn)
		var ci := idx
		row_btn.pressed.connect(func():
			_selected_map_idx = ci
			_update_map_detail(detail_title, detail_body, launch_btn)
			for j in _map_item_labels.size():
				var e2: Dictionary = _map_visible_rows[j]
				_style_list_row(_map_item_labels[j], j == _selected_map_idx,
					CAT_COLORS.get(str(e2.get("category","")), TEXT_DIM))
		)
		_map_item_labels.append(row_btn)
	for c in launch_btn.pressed.get_connections():
		launch_btn.pressed.disconnect(c["callable"])
	launch_btn.pressed.connect(func():
		if _selected_map_idx < 0 or _selected_map_idx >= _map_visible_rows.size():
			return
		var entry: Dictionary = _map_visible_rows[_selected_map_idx]
		_launch_map_entry(entry, equip_opts.selected, int(gold_spin.value), int(keys_spin.value))
	)

func _update_map_detail(title_lbl: Label, body: RichTextLabel, launch_btn: Button) -> void:
	if _selected_map_idx < 0 or _selected_map_idx >= _map_visible_rows.size():
		launch_btn.disabled = true
		return
	var entry:     Dictionary = _map_visible_rows[_selected_map_idx]
	var cat:       String     = entry.get("category", "")
	var cat_color: Color      = CAT_COLORS.get(cat, ACCENT)
	var tile:      Vector2i   = entry.get("tile", Vector2i(0,0))
	title_lbl.text = str(entry.get("label",""))
	body.text = (
		"[color=#%s]%s[/color]\n\n" % [cat_color.to_html(false), cat] +
		"[color=#99aacc]Scene:[/color]      %s\n" % str(entry.get("scene","")) +
		"[color=#99aacc]Spawn Tile:[/color]  (%d, %d)\n" % [tile.x, tile.y] +
		"[color=#99aacc]Facing:[/color]     %s\n" % str(entry.get("facing","down")) +
		"[color=#99aacc]Come From:[/color]  %s\n" % str(entry.get("come_from","debug"))
	)
	launch_btn.disabled = false
	launch_btn.text = "LAUNCH  —  " + str(entry.get("label",""))

func _launch_map_entry(entry: Dictionary, equip_preset: int, gold: int, num_keys: int) -> void:
	var gs := get_node_or_null("/root/GameState")
	if gs:
		gs.come_from    = str(entry.get("come_from","debug"))
		gs.spawn_tile   = entry.get("tile", Vector2i(1,1))
		gs.spawn_facing = str(entry.get("facing","down"))
		gs.gold         = gold
		gs.inventory    = []
		for _k in range(num_keys):
			gs.inventory.append(KNOWN_ITEMS["Magic Key"].duplicate())
		match equip_preset:
			1:
				gs.weapon = "Club"; gs.armor = "Leather Armor"
				gs.hero_stats["atk"] = 14; gs.hero_stats["def"] = 15
				gs.hero_stats["hp"]  = 45; gs.hero_stats["hp_max"] = 45
			2:
				gs.weapon = "Broad Sword"; gs.armor = "Half Plate"
				gs.hero_stats["atk"] = 30; gs.hero_stats["def"] = 25
				gs.hero_stats["hp"]  = 80; gs.hero_stats["hp_max"] = 80
			3:
				gs.weapon = "Flame Sword"; gs.armor = "Magic Armor"
				gs.hero_stats["atk"] = 48; gs.hero_stats["def"] = 40
				gs.hero_stats["hp"]  = 120; gs.hero_stats["hp_max"] = 120
				gs.spells = ["HEAL","HEALMORE","SLEEP","HURT","HURTMORE"]
			4:
				gs.weapon = "Erdrick's Sword"; gs.armor = "Erdrick's Armor"
				gs.hero_stats["atk"] = 72; gs.hero_stats["def"] = 60
				gs.hero_stats["hp"]  = 155; gs.hero_stats["hp_max"] = 155
				gs.hero_stats["mp"]  = 40;  gs.hero_stats["mp_max"] = 40
				gs.spells = ["HEAL","HEALMORE","SLEEP","HURT","HURTMORE","STOPSPELL","OUTSIDE","REPEL"]
	var scene_name: String = str(entry.get("scene","ThroneRoom"))
	var path: String = SCENE_MAP.get(scene_name, "res://scenes/" + scene_name + ".tscn")
	print("[DebugLaunch] MAP -> %s tile=%s" % [path, str(entry.get("tile",""))])
	_restore_game_viewport()
	get_tree().change_scene_to_file.call_deferred(path)

func _build_scenes_tab(parent: Control) -> void:
	var scroll := ScrollContainer.new()
	scroll.position = Vector2(8, 8)
	scroll.size     = Vector2(VW - 16, VH - 100)
	parent.add_child(scroll)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 12)
	grid.add_theme_constant_override("v_separation", 12)
	scroll.add_child(grid)
	var all_scenes := [
		["ThroneRoom", "Throne Room", "King Lorik, game start"],
		["Castle1F", "Tantegel 1F", "Main castle floor"],
		["TantegelBasement", "Tantegel Basement", "Erdrick's Token"],
		["WorldMap", "World Map", "Overworld — Tantegel area"],
		["Brecconary", "Brecconary", "First town"],
		["Garinham", "Garinham", "Northwest town"],
		["Kol", "Kol", "Northern coast"],
		["Rimuldar", "Rimuldar", "Magic key town"],
		["Cantlin", "Cantlin", "Final town"],
		["Hauksness", "Hauksness", "Ruined town"],
		["GarinhamB1", "Garin's Grave B1", "Dungeon level 1"],
		["GarinhamB2", "Garin's Grave B2", "Dungeon level 2"],
		["GarinhamB3", "Garin's Grave B3", "Dungeon level 3"],
		["GarinhamB4", "Garin's Grave B4", "Lyre of Ire"],
		["MountainCaveB1", "Mountain Cave B1", "Fighter's Ring dungeon"],
		["MountainCaveB2", "Mountain Cave B2", "Fighter's Ring"],
		["ErdricksCaveB1", "Erdrick's Cave B1", "Tablet cave"],
		["ErdricksCaveB2", "Erdrick's Cave B2", "Erdrick's Tablet"],
		["SwampCave", "Swamp Cave", "Tunnel to Rimuldar"],
		["CharlockCastle1F", "Charlock 1F", "Dragonlord's castle"],
		["CharlockCastleB1", "Charlock B1", "Dungeon B1"],
		["CharlockCastleB2", "Charlock B2", "Dungeon B2"],
		["CharlockCastleB3", "Charlock B3", "Dungeon B3"],
		["CharlockCastleB4", "Charlock B4", "Dungeon B4"],
		["CharlockCastleB5", "Charlock B5", "Dungeon B5"],
		["CharlockCastleB6", "Charlock B6", "Dungeon B6"],
		["CharlockThroneRoom", "Dragonlord's Throne", "Final boss"],
		["BattleTest", "Battle Test", "Monster battle test"],
	]
	for scene_entry in all_scenes:
		var key:   String = scene_entry[0]
		var label: String = scene_entry[1]
		var desc:  String = scene_entry[2]
		var card := ColorRect.new()
		card.color               = PANEL_BG
		card.custom_minimum_size = Vector2(220, 90)
		var card_lbl := Label.new()
		card_lbl.text     = label
		card_lbl.position = Vector2(10, 8)
		card_lbl.size     = Vector2(200, 28)
		card_lbl.add_theme_color_override("font_color", ACCENT)
		card_lbl.add_theme_font_size_override("font_size", 14)
		card.add_child(card_lbl)
		var desc_lbl := Label.new()
		desc_lbl.text     = desc
		desc_lbl.position = Vector2(10, 34)
		desc_lbl.size     = Vector2(200, 24)
		desc_lbl.add_theme_color_override("font_color", TEXT_DIM)
		desc_lbl.add_theme_font_size_override("font_size", 12)
		card.add_child(desc_lbl)
		var btn := Button.new()
		btn.text     = "Launch"
		btn.position = Vector2(10, 58)
		btn.size     = Vector2(100, 26)
		_style_small_btn(btn, ACCENT)
		card.add_child(btn)
		var ck := key
		btn.pressed.connect(func():
			var gs := get_node_or_null("/root/GameState")
			if gs: gs.come_from = "debug"; gs.gold = 500
			var path: String = SCENE_MAP.get(ck, "res://scenes/" + ck + ".tscn")
			_restore_game_viewport()
			get_tree().change_scene_to_file.call_deferred(path)
		)
		grid.add_child(card)

func _build_battle_tab(parent: Control) -> void:
	var left := ColorRect.new()
	left.color    = PANEL_BG
	left.position = Vector2(8, 8)
	left.size     = Vector2(320, VH - 100)
	parent.add_child(left)
	var list_title := Label.new()
	list_title.text     = "Select Monster"
	list_title.position = Vector2(12, 12)
	list_title.add_theme_color_override("font_color", ACCENT)
	list_title.add_theme_font_size_override("font_size", 16)
	left.add_child(list_title)
	var right := ColorRect.new()
	right.color    = PANEL_BG
	right.position = Vector2(340, 8)
	right.size     = Vector2(VW - 348, VH - 100)
	parent.add_child(right)
	var detail_lbl := Label.new()
	detail_lbl.text          = "Select a monster to battle"
	detail_lbl.position      = Vector2(16, 16)
	detail_lbl.size          = Vector2(VW - 380, 200)
	detail_lbl.add_theme_color_override("font_color", TEXT_DIM)
	detail_lbl.add_theme_font_size_override("font_size", 14)
	detail_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right.add_child(detail_lbl)
	var launch_btn := Button.new()
	launch_btn.text     = "LAUNCH BATTLE"
	launch_btn.position = Vector2(16, 240)
	launch_btn.size     = Vector2(VW - 380, 52)
	launch_btn.disabled = true
	_style_launch_btn(launch_btn)
	right.add_child(launch_btn)
	var stats_lbl := Label.new()
	stats_lbl.text     = "Hero stats:"
	stats_lbl.position = Vector2(16, 310)
	stats_lbl.add_theme_color_override("font_color", TEXT_DIM)
	stats_lbl.add_theme_font_size_override("font_size", 13)
	right.add_child(stats_lbl)
	var field_nodes: Array = []
	var fx := 16
	var lbl_hp := Label.new()
	lbl_hp.text     = "HP:"
	lbl_hp.position = Vector2(fx, 334)
	lbl_hp.add_theme_color_override("font_color", TEXT_DIM)
	lbl_hp.add_theme_font_size_override("font_size", 12)
	right.add_child(lbl_hp)
	var sp_hp := SpinBox.new()
	sp_hp.position  = Vector2(fx, 352)
	sp_hp.size      = Vector2(90, 28)
	sp_hp.min_value = 1
	sp_hp.max_value = 999
	sp_hp.value     = 155
	right.add_child(sp_hp)
	field_nodes.append(sp_hp)
	fx += 110
	var lbl_atk := Label.new()
	lbl_atk.text     = "ATK:"
	lbl_atk.position = Vector2(fx, 334)
	lbl_atk.add_theme_color_override("font_color", TEXT_DIM)
	lbl_atk.add_theme_font_size_override("font_size", 12)
	right.add_child(lbl_atk)
	var sp_atk := SpinBox.new()
	sp_atk.position  = Vector2(fx, 352)
	sp_atk.size      = Vector2(90, 28)
	sp_atk.min_value = 1
	sp_atk.max_value = 999
	sp_atk.value     = 72
	right.add_child(sp_atk)
	field_nodes.append(sp_atk)
	fx += 110
	var lbl_def := Label.new()
	lbl_def.text     = "DEF:"
	lbl_def.position = Vector2(fx, 334)
	lbl_def.add_theme_color_override("font_color", TEXT_DIM)
	lbl_def.add_theme_font_size_override("font_size", 12)
	right.add_child(lbl_def)
	var sp_def := SpinBox.new()
	sp_def.position  = Vector2(fx, 352)
	sp_def.size      = Vector2(90, 28)
	sp_def.min_value = 1
	sp_def.max_value = 999
	sp_def.value     = 60
	right.add_child(sp_def)
	field_nodes.append(sp_def)
	fx += 110
	var lbl_agl := Label.new()
	lbl_agl.text     = "AGL:"
	lbl_agl.position = Vector2(fx, 334)
	lbl_agl.add_theme_color_override("font_color", TEXT_DIM)
	lbl_agl.add_theme_font_size_override("font_size", 12)
	right.add_child(lbl_agl)
	var sp_agl := SpinBox.new()
	sp_agl.position  = Vector2(fx, 352)
	sp_agl.size      = Vector2(90, 28)
	sp_agl.min_value = 1
	sp_agl.max_value = 999
	sp_agl.value     = 50
	right.add_child(sp_agl)
	field_nodes.append(sp_agl)
	fx += 110
	var armor_lbl := Label.new()
	armor_lbl.text     = "Armor:"
	armor_lbl.position = Vector2(16, 394)
	armor_lbl.add_theme_color_override("font_color", TEXT_DIM)
	armor_lbl.add_theme_font_size_override("font_size", 13)
	right.add_child(armor_lbl)
	var armor_opts := OptionButton.new()
	armor_opts.position = Vector2(16, 414)
	armor_opts.size     = Vector2(300, 30)
	for a in ["None","Clothes","Leather Armor","Chain Mail","Half Plate","Full Plate","Magic Armor","Erdrick's Armor"]:
		armor_opts.add_item(a)
	armor_opts.selected = 7
	_style_option_btn(armor_opts)
	right.add_child(armor_opts)
	var scroll := ScrollContainer.new()
	scroll.position               = Vector2(4, 44)
	scroll.size                   = Vector2(312, VH - 155)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	left.add_child(scroll)
	var vbox := VBoxContainer.new()
	scroll.add_child(vbox)
	var selected_key := [""]
	for preset in BATTLE_PRESETS:
		var btn := Button.new()
		btn.text                = "  " + str(preset.get("label",""))
		btn.custom_minimum_size = Vector2(304, 34)
		btn.alignment           = HORIZONTAL_ALIGNMENT_LEFT
		btn.flat                = true
		_style_list_row(btn, false, ACCENT)
		vbox.add_child(btn)
		var ck: String = str(preset.get("key",""))
		var cl: String = str(preset.get("label",""))
		btn.pressed.connect(func():
			selected_key[0]     = ck
			detail_lbl.text     = "Monster: " + cl + "\nKey: " + ck + "\n\nClick LAUNCH BATTLE to begin."
			launch_btn.disabled = false
			launch_btn.text     = "LAUNCH BATTLE  —  " + cl
		)
	launch_btn.pressed.connect(func():
		if selected_key[0] == "": return
		var gs := get_node_or_null("/root/GameState")
		if gs:
			gs.battle_monster       = selected_key[0]
			gs.come_from            = "debug"
			gs.hero_stats["hp"]     = int(field_nodes[0].value)
			gs.hero_stats["hp_max"] = int(field_nodes[0].value)
			gs.hero_stats["atk"]    = int(field_nodes[1].value)
			gs.hero_stats["str"]    = int(field_nodes[1].value)
			gs.hero_stats["def"]    = int(field_nodes[2].value)
			gs.hero_stats["agl"]    = int(field_nodes[3].value)
			var an := ["","Clothes","Leather Armor","Chain Mail","Half Plate","Full Plate","Magic Armor","Erdrick's Armor"]
			gs.armor = an[armor_opts.selected]
		_restore_game_viewport()
		get_tree().change_scene_to_file.call_deferred("res://scenes/BattleTest.tscn")
	)

func _style_list_row(btn: Button, selected: bool, cat_color: Color = ACCENT) -> void:
	var s := StyleBoxFlat.new()
	s.bg_color          = Color(0.15, 0.20, 0.35) if selected else Color(0,0,0,0)
	s.border_color      = cat_color
	s.border_width_left = 4 if selected else 0
	btn.add_theme_stylebox_override("normal",  s)
	btn.add_theme_stylebox_override("pressed", s)
	var sh := StyleBoxFlat.new()
	sh.bg_color = Color(0.10, 0.14, 0.26)
	btn.add_theme_stylebox_override("hover", sh)
	btn.add_theme_color_override("font_color", TEXT_WHITE)
	btn.add_theme_font_size_override("font_size", 13)

func _style_launch_btn(btn: Button) -> void:
	var s := StyleBoxFlat.new()
	s.bg_color                   = ACCENT
	s.corner_radius_top_left     = 6
	s.corner_radius_top_right    = 6
	s.corner_radius_bottom_left  = 6
	s.corner_radius_bottom_right = 6
	btn.add_theme_stylebox_override("normal", s)
	var sd := StyleBoxFlat.new()
	sd.bg_color                   = Color(0.18, 0.18, 0.22)
	sd.corner_radius_top_left     = 6
	sd.corner_radius_top_right    = 6
	sd.corner_radius_bottom_left  = 6
	sd.corner_radius_bottom_right = 6
	btn.add_theme_stylebox_override("disabled", sd)
	btn.add_theme_color_override("font_color",          BG_COLOR)
	btn.add_theme_color_override("font_disabled_color", TEXT_DIM)
	btn.add_theme_font_size_override("font_size", 18)

func _style_small_btn(btn: Button, color: Color) -> void:
	var s := StyleBoxFlat.new()
	s.bg_color                   = color * 0.65
	s.corner_radius_top_left     = 3
	s.corner_radius_top_right    = 3
	s.corner_radius_bottom_left  = 3
	s.corner_radius_bottom_right = 3
	btn.add_theme_stylebox_override("normal", s)
	btn.add_theme_stylebox_override("hover",  s)
	btn.add_theme_color_override("font_color", TEXT_WHITE)
	btn.add_theme_font_size_override("font_size", 12)

func _style_lineedit(edit: LineEdit) -> void:
	var s := StyleBoxFlat.new()
	s.bg_color            = Color(0.06, 0.08, 0.16)
	s.border_color        = ACCENT * 0.7
	s.border_width_left   = 1
	s.border_width_right  = 1
	s.border_width_top    = 1
	s.border_width_bottom = 1
	edit.add_theme_stylebox_override("normal", s)
	edit.add_theme_stylebox_override("focus",  s)
	edit.add_theme_color_override("font_color",             TEXT_WHITE)
	edit.add_theme_color_override("font_placeholder_color", TEXT_DIM)

func _style_option_btn(opt: OptionButton) -> void:
	var s := StyleBoxFlat.new()
	s.bg_color            = Color(0.06, 0.08, 0.16)
	s.border_color        = ACCENT * 0.7
	s.border_width_left   = 1
	s.border_width_right  = 1
	s.border_width_top    = 1
	s.border_width_bottom = 1
	opt.add_theme_stylebox_override("normal", s)
	opt.add_theme_color_override("font_color", TEXT_WHITE)

func _unhandled_input(event: InputEvent) -> void:
	if not _gui_mode: return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		get_tree().quit()

func _restore_game_viewport() -> void:
	var win := get_window()
	win.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	win.content_scale_size = Vector2i(512, 480)
	win.size = Vector2i(1024, 960)
