class_name ActionToolbar
extends PanelContainer

signal action_triggered(action_id: String)

@onready var btn_attack: Button = find_child("BtnAttack", true, false)
@onready var btn_move: Button = find_child("BtnMove", true, false)
@onready var btn_guard: Button = find_child("BtnGuard", true, false)
@onready var btn_spell: Button = find_child("BtnSpell", true, false)
@onready var btn_special: Button = find_child("BtnSpecial", true, false)
@onready var btn_potion: Button = find_child("BtnPotion", true, false)
@onready var btn_antidote: Button = find_child("BtnAntidote", true, false)
@onready var btn_pause: Button = find_child("BtnPause", true, false)
@onready var btn_form_rank: Button = find_child("BtnFormRank", true, false)
@onready var btn_form_wedge: Button = find_child("BtnFormWedge", true, false)
@onready var btn_form_line: Button = find_child("BtnFormLine", true, false)
@onready var btn_form_column: Button = find_child("BtnFormColumn", true, false)
@onready var btn_form_square: Button = find_child("BtnFormSquare", true, false)
@onready var btn_form_scatter: Button = find_child("BtnFormScatter", true, false)
@onready var pause_banner: PanelContainer = null

var current_action_mode: String = "move"

func _ready() -> void:
	if get_parent() is PartyHUD:
		anchors_preset = Control.PRESET_TOP_LEFT
		anchor_left = 0.0
		anchor_right = 0.0
		anchor_top = 0.0
		anchor_bottom = 0.0
		offset_left = 20.0
		offset_top = 24.0
		offset_right = 900.0
		offset_bottom = 58.0
		grow_horizontal = Control.GROW_DIRECTION_END
		grow_vertical = Control.GROW_DIRECTION_END
	else:
		anchors_preset = Control.PRESET_BOTTOM_WIDE
		anchor_top = 1.0
		anchor_bottom = 1.0
		anchor_left = 0.5
		anchor_right = 0.5
		offset_left = -440.0
		offset_right = 440.0
		offset_top = -62.0
		offset_bottom = -12.0
		grow_horizontal = Control.GROW_DIRECTION_BOTH
		grow_vertical = Control.GROW_DIRECTION_BEGIN

	if btn_attack:
		btn_attack.pressed.connect(func(): _on_action_clicked("attack"))
	if btn_move:
		btn_move.pressed.connect(func(): _on_action_clicked("move"))
	if btn_guard:
		btn_guard.pressed.connect(func(): _on_action_clicked("guard"))
	if btn_spell:
		btn_spell.pressed.connect(func(): _on_action_clicked("spell"))
	if btn_special:
		btn_special.pressed.connect(func(): _on_action_clicked("special"))
	if btn_potion:
		btn_potion.pressed.connect(func(): _on_action_clicked("heal"))
	if btn_antidote:
		btn_antidote.pressed.connect(func(): _on_action_clicked("antidote"))
	if btn_pause:
		btn_pause.pressed.connect(_on_pause_clicked)

	if btn_form_rank:
		btn_form_rank.pressed.connect(func(): GameState.set_party_formation("rank"))
	if btn_form_wedge:
		btn_form_wedge.pressed.connect(func(): GameState.set_party_formation("wedge"))
	if btn_form_line:
		btn_form_line.pressed.connect(func(): GameState.set_party_formation("line"))
	if btn_form_column:
		btn_form_column.pressed.connect(func(): GameState.set_party_formation("column"))
	if btn_form_square:
		btn_form_square.pressed.connect(func(): GameState.set_party_formation("square"))
	if btn_form_scatter:
		btn_form_scatter.pressed.connect(func(): GameState.set_party_formation("scatter"))

	GameState.pause_toggled.connect(_on_pause_toggled)
	GameState.inventory_changed.connect(_update_item_slots)
	GameState.party_formation_changed.connect(_update_formation_buttons)
	_update_pause_button(GameState.is_game_paused)
	_update_item_slots()
	_update_formation_buttons(GameState.current_formation)

func _on_action_clicked(action_id: String) -> void:
	current_action_mode = action_id
	action_triggered.emit(action_id)
	var cur_scene = get_tree().current_scene
	var hero = cur_scene.find_child("HeroPlayer", true, false) if cur_scene else null

	match action_id:
		"attack":
			GameState.log_message("combat", "Order: Attack! Select target to strike.")
			if cur_scene and cur_scene.has_method("execute_melee_attack_on_hound"):
				var hound = cur_scene.find_child("BlightHound", true, false)
				if hound and hound.visible and hound.get("current_state") != 3:
					cur_scene.execute_melee_attack_on_hound()
			elif hero and cur_scene:
				var hound = cur_scene.find_child("BlightHound", true, false)
				if hound and hound.visible:
					hero.play_attack(hound.global_position)
		"move":
			GameState.log_message("system", "Order: Move waypoint route.")
		"guard":
			GameState.log_message("combat", "Order: Defensive stance. AC +2 until next round.")
			if hero and FloatingTextManager:
				FloatingTextManager.spawn_status(hero.global_position, "GUARD (+2 AC)")
		"spell":
			if GameState.selected_spells.size() > 0:
				var sp = GameState.selected_spells[0]
				var sp_name = sp.replace("-", " ").capitalize()
				GameState.log_message("magic", "Order: Prepared spell [%s]." % sp_name)
				if sp == "cure-wounds":
					if cur_scene and cur_scene.has_method("execute_heal_spell"):
						cur_scene.execute_heal_spell("cure-wounds")
					else:
						var heal_amount = randi_range(1, 8) + 3
						GameState.heal(heal_amount)
						GameState.log_message("magic", "%s casts Cure Wounds! Restored %d HP." % [GameState.hero_name, heal_amount])
						if hero and FloatingTextManager:
							FloatingTextManager.spawn_heal(hero.global_position, heal_amount)
				elif sp == "find-traps":
					var cm = cur_scene.find_child("CombatManager", true, false) if cur_scene else null
					if cm:
						cm.cast_spell("find-traps", GameState.hero_name)
					else:
						GameState.log_message("magic", "%s casts Find Traps! Divine divination illuminates all concealed hazards." % GameState.hero_name)
						var fow = cur_scene.find_child("FogOfWar", true, false) if cur_scene else null
						for child in cur_scene.get_children():
							if child.has_method("reveal_trap") and not child.get("is_disarmed") and not child.get("is_triggered"):
								var is_fow_revealed = true
								if fow and fow.has_method("is_point_explored") and fow.has_method("_is_fog_enabled"):
									if fow._is_fog_enabled():
										is_fow_revealed = fow.is_point_explored(child.global_position) or fow.is_point_in_vision(child.global_position)
								if is_fow_revealed:
									child.reveal_trap(GameState.hero_name)
				else:
					if cur_scene and cur_scene.has_method("execute_spell_on_hound"):
						var hound = cur_scene.find_child("BlightHound", true, false)
						if hound and hound.visible and hound.get("current_state") != 3:
							cur_scene.execute_spell_on_hound(sp)
					elif hero and cur_scene:
						var hound = cur_scene.find_child("BlightHound", true, false)
						if hound and hound.visible:
							hero.play_cast_spell(sp, hound.global_position)
			else:
				GameState.log_message("system", "No spells memorized in spellbook.")
		"special":
			_trigger_class_special()
		"heal", "potion":
			_on_quick_item("potion-healing")
		"antidote":
			_on_quick_item("antidote")

func _trigger_class_special() -> void:
	var cur_scene = get_tree().current_scene
	var hero = cur_scene.find_child("HeroPlayer", true, false) if cur_scene else null

	match GameState.hero_class:
		"fighter":
			var healed = randi_range(6, 10)
			GameState.heal(healed)
			GameState.log_message("combat", "%s used Second Wind! Recovered %d HP." % [GameState.hero_name, healed])
			if hero and FloatingTextManager:
				FloatingTextManager.spawn_heal(hero.global_position, healed)
		"rogue":
			GameState.set_detect_traps_mode(not GameState.is_detecting_traps)
			_update_item_slots()
			if GameState.is_detecting_traps:
				if hero and FloatingTextManager:
					FloatingTextManager.spawn_status(hero.global_position, "FIND TRAPS (ON)")
			else:
				if hero and FloatingTextManager:
					FloatingTextManager.spawn_status(hero.global_position, "FIND TRAPS (OFF)")
		"cleric":
			GameState.log_message("magic", "%s channels divine power: Turn Undead!" % GameState.hero_name)
			if hero and FloatingTextManager:
				FloatingTextManager.spawn_status(hero.global_position, "TURN UNDEAD")
		"wizard":
			GameState.log_message("magic", "%s invokes Arcane Recovery, refreshing spell slots." % GameState.hero_name)
			if hero and FloatingTextManager:
				FloatingTextManager.spawn_status(hero.global_position, "ARCANE RECOVERY")
		_:
			GameState.log_message("combat", "%s enters a tactical combat stance." % GameState.hero_name)

func _on_quick_item(item_id: String) -> void:
	var cur_scene = get_tree().current_scene
	var hero = cur_scene.find_child("HeroPlayer", true, false) if cur_scene else null

	if item_id == "potion-healing":
		var target_item = "potion-healing"
		if not GameState.inventory.has("potion-healing") and GameState.inventory.has("potion-greater-healing"):
			target_item = "potion-greater-healing"

		var res = GameState.use_item(target_item)
		if res.get("success", false):
			var amount = res.get("hp_restored", 8)
			if hero and FloatingTextManager:
				FloatingTextManager.spawn_heal(hero.global_position, amount)
		else:
			# Fallback emergency vitality draught
			var healed = randi_range(6, 10)
			GameState.heal(healed)
			GameState.log_message("item", "%s drank emergency Elixir of Vitality! (+%d HP)" % [GameState.hero_name, healed])
			if hero and FloatingTextManager:
				FloatingTextManager.spawn_heal(hero.global_position, healed)
	elif item_id == "antidote" or item_id == "potion-antidote":
		var res = GameState.use_item("antidote")
		if not res.get("success", false):
			res = GameState.use_item("potion-antidote")
		if not res.get("success", false):
			GameState.remove_status_effect(GameState.hero_name, "poisoned")
			GameState.log_message("item", "%s drank Antidote! Cured poison condition." % GameState.hero_name)
		if hero and FloatingTextManager:
			FloatingTextManager.spawn_status(hero.global_position, "CURED")

func _on_pause_clicked() -> void:
	GameState.toggle_pause()

func _on_pause_toggled(paused: bool) -> void:
	_update_pause_button(paused)

func _update_pause_button(paused: bool) -> void:
	if btn_pause:
		if paused:
			btn_pause.text = "▶️ [SPACE] RESUME"
			btn_pause.modulate = Color(1.3, 0.6, 0.4, 1.0)
		else:
			btn_pause.text = "⏸️ [SPACE] PAUSE"
			btn_pause.modulate = Color(1.0, 1.0, 1.0, 1.0)

func _update_item_slots() -> void:
	if btn_potion:
		var pot_count = 0
		for item in GameState.inventory:
			if item == "potion-healing" or item == "potion-greater-healing":
				pot_count += 1
		btn_potion.text = "🧪 Heal (%d)" % pot_count
	if btn_antidote:
		var anti_count = 0
		for item in GameState.inventory:
			if item == "antidote" or item == "potion-antidote":
				anti_count += 1
		btn_antidote.text = "🧪 Anti (%d)" % anti_count
	if btn_spell:
		if GameState.selected_spells.size() > 0:
			var sp_name = GameState.selected_spells[0].replace("-", " ").capitalize()
			btn_spell.text = "✨ %s" % sp_name
		else:
			btn_spell.text = "✨ Spell"
	if btn_special:
		match GameState.hero_class:
			"fighter":
				btn_special.text = "⚡ 2nd Wind"
			"rogue":
				btn_special.text = "👁️ Find Traps" if not GameState.is_detecting_traps else "👁️ Traps (ON)"
			"cleric":
				btn_special.text = "⚡ Turn"
			"wizard":
				btn_special.text = "⚡ Recovery"
			_:
				btn_special.text = "⚡ Special"

func _update_formation_buttons(active_id: String) -> void:
	var buttons = {
		"rank": btn_form_rank,
		"wedge": btn_form_wedge,
		"line": btn_form_line,
		"column": btn_form_column,
		"square": btn_form_square,
		"scatter": btn_form_scatter
	}
	for id in buttons:
		var btn: Button = buttons[id]
		if btn:
			if id == active_id:
				btn.add_theme_color_override("font_color", Color(1.0, 0.88, 0.25, 1.0))
				var sb = StyleBoxFlat.new()
				sb.bg_color = Color(0.18, 0.28, 0.38, 0.95)
				sb.border_color = Color(0.2, 0.9, 1.0, 1.0)
				sb.border_width_left = 2
				sb.border_width_top = 2
				sb.border_width_right = 2
				sb.border_width_bottom = 2
				sb.corner_radius_top_left = 3
				sb.corner_radius_top_right = 3
				sb.corner_radius_bottom_left = 3
				sb.corner_radius_bottom_right = 3
				btn.add_theme_stylebox_override("normal", sb)
			else:
				btn.remove_theme_color_override("font_color")
				btn.remove_theme_stylebox_override("normal")
