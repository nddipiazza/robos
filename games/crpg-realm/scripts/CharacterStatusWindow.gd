class_name CharacterStatusWindow
extends Panel

signal status_window_closed

@onready var title_label: Label = find_child("TitleLabel", true, false)
@onready var btn_close: Button = find_child("BtnClose", true, false)
@onready var btn_prev: Button = find_child("BtnPrev", true, false)
@onready var btn_next: Button = find_child("BtnNext", true, false)
@onready var tabs_container: HBoxContainer = find_child("TabsContainer", true, false)

# Column 1: Identity & Defenses
@onready var portrait_rect: TextureRect = find_child("PortraitRect", true, false)
@onready var name_label: Label = find_child("CharNameLabel", true, false)
@onready var race_class_label: Label = find_child("RaceClassLabel", true, false)
@onready var xp_label: Label = find_child("XPLabel", true, false)
@onready var hp_label: Label = find_child("HPValLabel", true, false)
@onready var ac_label: Label = find_child("ACValLabel", true, false)
@onready var prof_label: Label = find_child("ProfValLabel", true, false)
@onready var init_label: Label = find_child("InitValLabel", true, false)
@onready var speed_label: Label = find_child("SpeedValLabel", true, false)
@onready var saves_container: VBoxContainer = find_child("SavesContainer", true, false)

# Column 2: Ability Scores & Offense
@onready var stats_grid: GridContainer = find_child("StatsGrid", true, false)
@onready var weapon_title_label: Label = find_child("WeaponTitleLabel", true, false)
@onready var weapon_stats_label: Label = find_child("WeaponStatsLabel", true, false)
@onready var armor_stats_label: Label = find_child("ArmorStatsLabel", true, false)
@onready var spellcasting_container: VBoxContainer = find_child("SpellcastingContainer", true, false)

# Column 3: Conditions & Features
@onready var conditions_container: VBoxContainer = find_child("ConditionsContainer", true, false)
@onready var skills_label: Label = find_child("SkillsLabel", true, false)
@onready var features_label: Label = find_child("FeaturesLabel", true, false)

var current_member_index: int = 0
var portrait_cache: Dictionary = {}

func _ready() -> void:
	anchors_preset = Control.PRESET_CENTER
	anchor_left = 0.5
	anchor_top = 0.5
	anchor_right = 0.5
	anchor_bottom = 0.5
	offset_left = -480.0
	offset_right = 480.0
	offset_top = -320.0
	offset_bottom = 320.0
	grow_horizontal = Control.GROW_DIRECTION_BOTH
	grow_vertical = Control.GROW_DIRECTION_BOTH
	z_index = 100

	if btn_close:
		btn_close.pressed.connect(close)
	if btn_prev:
		btn_prev.pressed.connect(_on_prev_member)
	if btn_next:
		btn_next.pressed.connect(_on_next_member)

	GameState.party_changed.connect(refresh)
	GameState.status_effects_changed.connect(func(_target): refresh())

func open(member_idx: int = 0) -> void:
	current_member_index = clampi(member_idx, 0, max(0, GameState.party_members.size() - 1))
	visible = true
	refresh()

func close() -> void:
	visible = false
	status_window_closed.emit()

func toggle(member_idx: int = -1) -> void:
	if visible:
		close()
	else:
		if member_idx >= 0:
			open(member_idx)
		else:
			var active_idx = GameState.selected_party_indices[0] if GameState.selected_party_indices.size() > 0 else 0
			open(active_idx)

func _on_prev_member() -> void:
	var count = GameState.party_members.size()
	if count > 0:
		current_member_index = (current_member_index - 1 + count) % count
		refresh()

func _on_next_member() -> void:
	var count = GameState.party_members.size()
	if count > 0:
		current_member_index = (current_member_index + 1) % count
		refresh()

func set_character(member_idx: int) -> void:
	current_member_index = clampi(member_idx, 0, max(0, GameState.party_members.size() - 1))
	refresh()

func refresh() -> void:
	if not visible:
		return
	var members = GameState.party_members
	if members.is_empty():
		return
	if current_member_index >= members.size():
		current_member_index = 0

	var member = members[current_member_index]
	_update_tabs()
	_populate_identity_and_defenses(member)
	_populate_ability_scores_and_offense(member)
	_populate_conditions_and_features(member)

func _update_tabs() -> void:
	if not tabs_container:
		return
	for child in tabs_container.get_children():
		child.queue_free()

	var members = GameState.party_members
	for i in range(members.size()):
		var m = members[i]
		var btn = Button.new()
		btn.text = "[%d] %s" % [i + 1, m.get("name", "Hero")]
		btn.custom_minimum_size = Vector2(130, 32)
		btn.add_theme_font_size_override("font_size", 12)
		if i == current_member_index:
			btn.modulate = Color(1.2, 1.15, 0.5, 1.0)
		else:
			btn.modulate = Color(0.8, 0.8, 0.8, 1.0)
		var idx_key = i
		btn.pressed.connect(func(): set_character(idx_key))
		tabs_container.add_child(btn)

func _populate_identity_and_defenses(member: Dictionary) -> void:
	var c_name = member.get("name", "Hero")
	var c_race = member.get("race", "human").capitalize()
	var c_class = member.get("class", "fighter").capitalize()
	var c_lvl = member.get("level", 1)

	if name_label:
		name_label.text = c_name
	if race_class_label:
		race_class_label.text = "%s %s (Level %d)" % [c_race, c_class, c_lvl]
	if xp_label:
		xp_label.text = "XP: 0 / 300 (Next Level: 2) | Alignment: Lawful Good"

	# Portrait
	if portrait_rect:
		var p_path = member.get("portrait", "")
		if p_path != "" and ResourceLoader.exists(p_path):
			if not portrait_cache.has(p_path):
				portrait_cache[p_path] = load(p_path)
			portrait_rect.texture = portrait_cache[p_path]
		else:
			var fb = "res://assets/portraits/portrait_%s.png" % member.get("class", "fighter")
			if ResourceLoader.exists(fb):
				portrait_rect.texture = load(fb)

	# Defenses
	var cur_hp = member.get("hp", GameState.hero_hp if current_member_index == 0 else 10)
	var max_hp = member.get("max_hp", GameState.hero_max_hp if current_member_index == 0 else 10)
	var cur_ac = member.get("ac", GameState.hero_ac if current_member_index == 0 else 14)
	var dex_val = int(GameState.ability_scores.get("DEX", 14)) if current_member_index == 0 else 16
	var dex_mod = GameState.get_stat_modifier(dex_val)

	if hp_label:
		hp_label.text = "HP: %d / %d" % [cur_hp, max_hp]
	if ac_label:
		ac_label.text = "AC: %d" % cur_ac
	if prof_label:
		prof_label.text = "Proficiency: +2"
	if init_label:
		init_label.text = "Initiative: %+d" % dex_mod
	if speed_label:
		speed_label.text = "Speed: 30 ft (Tactical)"

	# Saving Throws
	if saves_container:
		for child in saves_container.get_children():
			child.queue_free()

		var prof_saves = ["STR", "CON"] if member.get("class") == "fighter" else (["DEX", "INT"] if member.get("class") == "rogue" else ["WIS", "CHA"])
		for stat in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]:
			var s_val = int(GameState.ability_scores.get(stat, 10)) if current_member_index == 0 else (16 if stat == "DEX" else (14 if stat == "CON" else 12))
			var s_mod = GameState.get_stat_modifier(s_val)
			var is_prof = prof_saves.has(stat)
			var total_save = s_mod + (2 if is_prof else 0)

			var row = HBoxContainer.new()
			var dot = Label.new()
			dot.text = "● " if is_prof else "○ "
			dot.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1.0) if is_prof else Color(0.5, 0.5, 0.5, 1.0))
			row.add_child(dot)

			var s_name = Label.new()
			s_name.text = stat + " Save:"
			s_name.custom_minimum_size = Vector2(80, 0)
			row.add_child(s_name)

			var s_val_lbl = Label.new()
			s_val_lbl.text = "%+d" % total_save
			s_val_lbl.add_theme_color_override("font_color", Color(0.3, 0.95, 0.6, 1.0) if is_prof else Color(0.85, 0.85, 0.85, 1.0))
			row.add_child(s_val_lbl)

			saves_container.add_child(row)

func _populate_ability_scores_and_offense(member: Dictionary) -> void:
	if stats_grid:
		for child in stats_grid.get_children():
			child.queue_free()

		for stat in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]:
			var s_val = int(GameState.ability_scores.get(stat, 10)) if current_member_index == 0 else (12 if stat == "STR" else (16 if stat == "DEX" else (14 if stat == "CON" else 12)))
			var s_mod = GameState.get_stat_modifier(s_val)
			
			var p = PanelContainer.new()
			p.custom_minimum_size = Vector2(95, 48)
			var sb = StyleBoxFlat.new()
			sb.bg_color = Color(0.12, 0.14, 0.18, 0.85)
			sb.border_width_left = 1
			sb.border_width_top = 1
			sb.border_width_right = 1
			sb.border_width_bottom = 1
			sb.border_color = Color(0.3, 0.4, 0.5, 0.7)
			sb.corner_radius_top_left = 4
			sb.corner_radius_top_right = 4
			sb.corner_radius_bottom_left = 4
			sb.corner_radius_bottom_right = 4
			p.add_theme_stylebox_override("panel", sb)

			var vb = VBoxContainer.new()
			vb.alignment = BoxContainer.ALIGNMENT_CENTER
			p.add_child(vb)

			var lbl_title = Label.new()
			lbl_title.text = stat
			lbl_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			lbl_title.add_theme_font_size_override("font_size", 11)
			lbl_title.add_theme_color_override("font_color", Color(0.8, 0.85, 0.9, 1.0))
			vb.add_child(lbl_title)

			var lbl_num = Label.new()
			lbl_num.text = "%d (%+d)" % [s_val, s_mod]
			lbl_num.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			lbl_num.add_theme_font_size_override("font_size", 13)
			lbl_num.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35, 1.0))
			vb.add_child(lbl_num)

			stats_grid.add_child(p)

	# Offense
	var w_id = member.get("weapon", GameState.equipped_weapon if current_member_index == 0 else "hunting-bow")
	var a_id = member.get("armor", GameState.equipped_armor if current_member_index == 0 else "leather-armor")
	var w_data = GameState.get_item_data(w_id)
	var a_data = GameState.get_item_data(a_id)

	if weapon_title_label:
		weapon_title_label.text = "Primary Weapon: %s" % (w_data.title if w_data else w_id.capitalize())
	if weapon_stats_label:
		var dmg = w_data.damage_dice if (w_data and w_data.damage_dice != "") else "1d8"
		var is_ranged = (w_id.find("bow") >= 0 or w_id.find("crossbow") >= 0)
		var dtype = "piercing" if (is_ranged or w_id.find("dagger") >= 0) else "slashing"
		var stat_mod = GameState.get_stat_modifier(int(GameState.ability_scores.get("STR", 10))) if current_member_index == 0 else 3
		var atk_bon = stat_mod + 2
		var props = "Ammunition (Range 80/320), Two-Handed" if is_ranged else "Versatile"
		weapon_stats_label.text = "Attack Bonus: %+d  |  Damage: %s%+d %s  |  Properties: %s" % [atk_bon, dmg, stat_mod, dtype, props]

	if armor_stats_label:
		var a_title = a_data.title if a_data else a_id.capitalize()
		var ac_val = a_data.ac_bonus if a_data and a_data.ac_bonus > 0 else 16
		armor_stats_label.text = "Equipped Armor: %s (Base AC %d)" % [a_title, ac_val]

	# Spellcasting
	if spellcasting_container:
		for child in spellcasting_container.get_children():
			child.queue_free()
		var spells = member.get("spells", GameState.selected_spells if current_member_index == 0 else [])
		if spells.size() > 0:
			var sp_hdr = Label.new()
			sp_hdr.text = "SPELLCASTING (Save DC: 13 | Spell Attack: +5)"
			sp_hdr.add_theme_font_size_override("font_size", 12)
			sp_hdr.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0, 1.0))
			spellcasting_container.add_child(sp_hdr)

			var sp_list = Label.new()
			sp_list.text = "Prepared Spells: " + ", ".join(spells)
			sp_list.add_theme_font_size_override("font_size", 11)
			sp_list.add_theme_color_override("font_color", Color(0.85, 0.9, 0.95, 1.0))
			spellcasting_container.add_child(sp_list)

func _populate_conditions_and_features(member: Dictionary) -> void:
	# Conditions
	if conditions_container:
		for child in conditions_container.get_children():
			child.queue_free()

		var effs = member.get("status_effects", [])
		if current_member_index == 0 and GameState.status_effects.has(member.get("name", "")):
			effs = GameState.status_effects[member.get("name", "")]

		if effs.is_empty():
			var healthy_lbl = Label.new()
			healthy_lbl.text = "Status: Healthy (No adverse afflictions)"
			healthy_lbl.add_theme_font_size_override("font_size", 12)
			healthy_lbl.add_theme_color_override("font_color", Color(0.3, 0.95, 0.5, 1.0))
			conditions_container.add_child(healthy_lbl)
		else:
			for eff in effs:
				var eff_row = HBoxContainer.new()
				eff_row.add_theme_constant_override("separation", 6)

				var icon_rect = TextureRect.new()
				icon_rect.custom_minimum_size = Vector2(20, 20)
				icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
				var ipath = "res://assets/icons/status_effects/%s.png" % eff
				if ResourceLoader.exists(ipath):
					icon_rect.texture = load(ipath)
				eff_row.add_child(icon_rect)

				var eff_desc = Label.new()
				eff_desc.text = "[%s]: Disadvantage on attack rolls & ability checks" % eff.to_upper()
				eff_desc.add_theme_font_size_override("font_size", 11)
				eff_desc.add_theme_color_override("font_color", Color(1.0, 0.45, 0.45, 1.0))
				eff_row.add_child(eff_desc)

				conditions_container.add_child(eff_row)

	# Skills & Features
	if skills_label:
		if current_member_index == 0:
			skills_label.text = """Proficiencies: All Armor, Shields, Martial Weapons, Simple Weapons
Skills: Athletics (+5), Perception (+3), Survival (+3), History (+2)"""
		else:
			skills_label.text = """Proficiencies: Light Armor, Simple Weapons, Hand Crossbows, Shortswords
Skills: Stealth (+5), Acrobatics (+5), Sleight of Hand (+5), Perception (+4)"""

	if features_label:
		if current_member_index == 0:
			features_label.text = """Class Features: Second Wind (1d10+1 Heal), Fighting Style: Dueling, Action Surge
Racial Traits: Versatile (+1 to All Ability Scores), Extra Feat"""
		else:
			features_label.text = """Class Features: Sneak Attack (+1d6), Cunning Action (Dash/Disengage), Thieves Cant
Racial Traits: Keen Senses, Fey Ancestry (Adv vs Charm, Immune to Sleep), Darkvision"""
