extends Control

var name_input: LineEdit
var desc_label: Label
var embark_btn: Button
var btn_reroll: Button
var total_label: Label
var portrait_preview: TextureRect = null

var race_buttons: Dictionary = {}
var class_buttons: Dictionary = {}
var spell_buttons: Dictionary = {}
var stat_labels: Dictionary = {}

var selected_race: String = "human"
var selected_class: String = "fighter"
var selected_spells: Array = []
var base_stats: Dictionary = {
	"STR": 16,
	"DEX": 14,
	"CON": 15,
	"INT": 10,
	"WIS": 12,
	"CHA": 11
}
var current_stats: Dictionary = {}

const ALL_RACES = ["human", "elf", "dwarf", "halfling", "dragonborn", "gnome", "half-elf", "half-orc", "tiefling"]
const ALL_CLASSES = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"]

func _ready() -> void:
	name_input = find_child("NameEdit", true, false)
	desc_label = find_child("DescLabel", true, false)
	embark_btn = find_child("EmbarkBtn", true, false)
	btn_reroll = find_child("BtnReroll", true, false)
	total_label = find_child("TotalScoreLabel", true, false)
	_setup_portrait_preview()

	for stat in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]:
		var lbl = find_child("Label" + stat, true, false)
		if lbl:
			stat_labels[stat] = lbl

	# Wire or create race buttons
	var race_grid = find_child("RaceGrid", true, false)
	for r in ALL_RACES:
		var btn_name = "BtnRace" + _pascal_case(r)
		var btn = find_child(btn_name, true, false)
		if not btn and race_grid:
			btn = Button.new()
			btn.name = btn_name
			btn.text = r.capitalize()
			btn.custom_minimum_size = Vector2(95, 32)
			btn.add_theme_font_size_override("font_size", 12)
			race_grid.add_child(btn)
		if btn:
			race_buttons[r] = btn
			var r_key = r
			btn.pressed.connect(func(): select_race(r_key))

	# Wire or create class buttons
	var class_grid = find_child("ClassGrid", true, false)
	for c in ALL_CLASSES:
		var btn_name = "Btn" + _pascal_case(c)
		var btn = find_child(btn_name, true, false)
		if not btn and class_grid:
			btn = Button.new()
			btn.name = btn_name
			btn.text = c.capitalize()
			btn.custom_minimum_size = Vector2(120, 36)
			btn.add_theme_font_size_override("font_size", 12)
			
			var portrait_file = "res://assets/portraits/portrait_%s.png" % c
			if not ResourceLoader.exists(portrait_file):
				match c:
					"barbarian", "paladin": portrait_file = "res://assets/portraits/portrait_fighter.png"
					"monk", "ranger": portrait_file = "res://assets/portraits/portrait_rogue.png"
					"sorcerer", "warlock": portrait_file = "res://assets/portraits/portrait_wizard.png"
					"druid", "bard": portrait_file = "res://assets/portraits/portrait_cleric.png"
			if ResourceLoader.exists(portrait_file):
				btn.icon = load(portrait_file)
				btn.expand_icon = true
			class_grid.add_child(btn)
		if btn:
			class_buttons[c] = btn
			var c_key = c
			btn.pressed.connect(func(): select_class(c_key))

	# Wire spell buttons
	var spell_grid = find_child("SpellGrid", true, false)
	for sp in ["magic-missile", "cure-wounds", "fireball"]:
		var sp_btn_name = "BtnSpell" + _pascal_case(sp.replace("-", "_"))
		var btn = find_child(sp_btn_name, true, false)
		if btn:
			spell_buttons[sp] = btn
			var sp_key = sp
			btn.pressed.connect(func(): toggle_spell(sp_key))

	if btn_reroll:
		btn_reroll.pressed.connect(reroll_stats)
	if embark_btn:
		embark_btn.pressed.connect(embark)

	select_race("human")
	select_class("fighter")
	update_stat_displays()

func _pascal_case(s: String) -> String:
	var parts = s.replace("-", "_").split("_")
	var res = ""
	for p in parts:
		res += p.capitalize()
	return res

func select_race(p_race: String) -> void:
	selected_race = p_race.to_lower()
	update_stat_displays()
	_update_button_highlights()

func select_class(p_class: String) -> void:
	selected_class = p_class.to_lower()
	# Default spells based on archetype
	match selected_class:
		"wizard":
			if not selected_spells.has("magic-missile"): selected_spells.append("magic-missile")
			if not selected_spells.has("fireball"): selected_spells.append("fireball")
		"cleric", "druid", "bard", "paladin":
			if not selected_spells.has("cure-wounds"): selected_spells.append("cure-wounds")
		"sorcerer":
			if not selected_spells.has("fireball"): selected_spells.append("fireball")
		"warlock":
			if not selected_spells.has("magic-missile"): selected_spells.append("magic-missile")
	update_stat_displays()
	_update_button_highlights()

func select_spell(p_spell: String) -> void:
	if not selected_spells.has(p_spell):
		selected_spells.append(p_spell)
	update_stat_displays()
	_update_button_highlights()

func toggle_spell(p_spell: String) -> void:
	if selected_spells.has(p_spell):
		selected_spells.erase(p_spell)
	else:
		selected_spells.append(p_spell)
	update_stat_displays()
	_update_button_highlights()

func reroll_stats() -> void:
	base_stats = GameState.roll_all_stats()
	update_stat_displays()
	if total_label:
		var tw = create_tween()
		tw.tween_property(total_label, "modulate", Color(2.0, 2.0, 1.0, 1.0), 0.1)
		tw.tween_property(total_label, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.2)

func update_stat_displays() -> void:
	var racial_bonuses = {}
	match selected_race:
		"human":
			racial_bonuses = {"STR": 1, "DEX": 1, "CON": 1, "INT": 1, "WIS": 1, "CHA": 1}
		"elf":
			racial_bonuses = {"DEX": 2, "INT": 1}
		"dwarf":
			racial_bonuses = {"CON": 2, "STR": 1}
		"halfling":
			racial_bonuses = {"DEX": 2, "CHA": 1}
		"dragonborn":
			racial_bonuses = {"STR": 2, "CHA": 1}
		"gnome":
			racial_bonuses = {"INT": 2, "DEX": 1}
		"half-elf":
			racial_bonuses = {"CHA": 2, "DEX": 1, "CON": 1}
		"half-orc":
			racial_bonuses = {"STR": 2, "CON": 1}
		"tiefling":
			racial_bonuses = {"CHA": 2, "INT": 1}

	var total = 0
	current_stats.clear()
	for stat in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]:
		var b_val = int(base_stats.get(stat, 10))
		var bonus = int(racial_bonuses.get(stat, 0))
		var total_val = b_val + bonus
		current_stats[stat] = total_val
		total += total_val
		var mod = GameState.get_stat_modifier(total_val)
		var sign_str = "+" if mod >= 0 else ""
		var bonus_str = " (+%d)" % bonus if bonus > 0 else ""
		if stat_labels.has(stat):
			stat_labels[stat].text = "%s: %d (%s%d)%s" % [stat, total_val, sign_str, mod, bonus_str]
	
	if total_label:
		total_label.text = "TOTAL ABILITY SCORE: %d" % total

	if desc_label:
		var race_desc = ""
		match selected_race:
			"human": race_desc = "HUMAN: Versatile (+1 all stats, extra proficiency)."
			"elf": race_desc = "HIGH ELF: Keen Senses, Fey Ancestry (Immune to sleep), Darkvision (+2 DEX, +1 INT)."
			"dwarf": race_desc = "MOUNTAIN DWARF: Dwarven Resilience (Poison resist), Stonecunning (+2 CON, +1 STR, +1 HP)."
			"halfling": race_desc = "LIGHTFOOT HALFLING: Lucky (Reroll 1s), Brave, Nimbleness (+2 DEX, +1 CHA, +1 AC)."
			"dragonborn": race_desc = "DRAGONBORN: Draconic Ancestry, Breath Weapon, Damage Resistance (+2 STR, +1 CHA)."
			"gnome": race_desc = "ROCK GNOME: Gnome Cunning (Adv vs magic), Darkvision (+2 INT, +1 CON)."
			"half-elf": race_desc = "HALF-ELF: Skill Versatility, Fey Ancestry, Darkvision (+2 CHA, +1 DEX, +1 CON)."
			"half-orc": race_desc = "HALF-ORC: Relentless Endurance (Survive at 1 HP), Savage Attacks (+2 STR, +1 CON)."
			"tiefling": race_desc = "TIEFLING: Hellish Resistance (Fire resist), Infernal Legacy (+2 CHA, +1 INT)."

		var class_desc = ""
		match selected_class:
			"barbarian": class_desc = "BARBARIAN: Primal Rage, d12 Hit Die, Unarmored Defense (HP: 14, AC: 14)"
			"bard": class_desc = "BARD: Bardic Inspiration, Full Caster, Jack of All Trades (HP: 9, AC: 13)"
			"cleric": class_desc = "CLERIC: Divine Domain, Turn Undead, Cure Wounds, d8 Hit Die (HP: 10, AC: 15)"
			"druid": class_desc = "DRUID: Wild Shape, Circle Magic, Nature Priest (HP: 9, AC: 13)"
			"fighter": class_desc = "FIGHTER: Second Wind, Action Surge, Martial Mastery, d10 Hit Die (HP: 12, AC: 16)"
			"monk": class_desc = "MONK: Martial Arts, Ki Points, Flurry of Blows, Unarmored (HP: 9, AC: 14)"
			"paladin": class_desc = "PALADIN: Divine Smite, Lay on Hands, Heavy Armor, d10 Hit Die (HP: 12, AC: 16)"
			"ranger": class_desc = "RANGER: Favored Enemy, Archery Style, Standoff Specialist (HP: 11, AC: 14)"
			"rogue": class_desc = "ROGUE: Sneak Attack (+1d6), Cunning Action, Stealth (HP: 9, AC: 14)"
			"sorcerer": class_desc = "SORCERER: Metamagic, Font of Magic, Innate Arcana (HP: 7, AC: 11)"
			"warlock": class_desc = "WARLOCK: Eldritch Blast, Pact Magic, Otherworldly Patron (HP: 8, AC: 12)"
			"wizard": class_desc = "WIZARD: Arcane Recovery, Spellbook, Magic Missile & Fireball (HP: 7, AC: 11)"

		var spells_str = ""
		if selected_spells.size() > 0:
			spells_str = " | Spells: " + ", ".join(selected_spells)

		desc_label.text = "%s | %s%s" % [race_desc, class_desc, spells_str]
	if portrait_preview:
		var p_path = "res://assets/portraits/portrait_%s.png" % selected_class
		if ResourceLoader.exists(p_path):
			portrait_preview.texture = load(p_path)

func _update_button_highlights() -> void:
	for r in race_buttons:
		var btn: Button = race_buttons[r]
		if btn:
			btn.modulate = Color(1.2, 1.2, 0.7, 1.0) if r == selected_race else Color(0.8, 0.8, 0.8, 1.0)

	for c in class_buttons:
		var btn: Button = class_buttons[c]
		if btn:
			btn.modulate = Color(1.2, 1.2, 0.7, 1.0) if c == selected_class else Color(0.8, 0.8, 0.8, 1.0)

	for s in spell_buttons:
		var btn: Button = spell_buttons[s]
		if btn:
			btn.modulate = Color(1.2, 1.2, 0.8, 1.0) if selected_spells.has(s) else Color(0.65, 0.65, 0.65, 1.0)

func embark() -> void:
	var h_name = name_input.text.strip_edges() if name_input else ""
	if h_name == "": h_name = "Lieutenant Vance"
	GameState.init_hero(h_name, selected_class, base_stats, selected_race, selected_spells)
	get_tree().change_scene_to_file("res://scenes/Homestead.tscn")


func _setup_portrait_preview() -> void:
	var right_col = find_child("RightColumn", true, false)
	if right_col:
		var center = CenterContainer.new()
		portrait_preview = TextureRect.new()
		portrait_preview.custom_minimum_size = Vector2(72, 72)
		portrait_preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait_preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		center.add_child(portrait_preview)
		right_col.add_child(center)
		right_col.move_child(center, 1)
