extends Node2D

@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr = $CombatManager
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var blacksmith = $BlacksmithBrand
@onready var blacksmith_sprite: Sprite2D = $BlacksmithBrand/Sprite
@onready var garrison_gate = $GarrisonGate
@onready var hound = $ShadowHound
@onready var hero = $HeroPlayer

var brand_waypoints: Array[Vector2] = [Vector2(1140, 880), Vector2(1220, 850)]
var brand_wp_idx: int = 0
var brand_wait_timer: float = 3.0
var brand_anim_timer: float = 0.0
var brand_frame: int = 0
var brand_walk_textures: Array[Texture2D] = []
var brand_idle_texture: Texture2D = null

func _ready() -> void:
	print("Oakhaven Village Square loaded: Act 2 begins (2560x1440 Open World).")
	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 2560, 1440)
	hud.update_display("Active Quest: Investigate disturbance & speak to Blacksmith Brand")
	if GameState.party_members.size() > 1 and not has_node("PartyCompanion"):
		var comp_scene = load("res://scenes/PartyCompanion.tscn")
		if comp_scene:
			var comp = comp_scene.instantiate()
			comp.global_position = hero.global_position + Vector2(-48, 24)
			add_child(comp)
			if has_node("FogOfWar"):
				$FogOfWar.register_actor(comp)
	blacksmith.body_clicked.connect(talk_to_blacksmith)
	garrison_gate.door_entered.connect(try_enter_garrison)
	if has_node("ForestGate"):
		$ForestGate.door_entered.connect(func():
			GameState.spawn_position = Vector2(180, 720)
			get_tree().change_scene_to_file("res://scenes/WhisperingForest.tscn")
		)
	
	_load_brand_textures()

	if hound:
		var hw: Array[Vector2] = [Vector2(1780, 830), Vector2(1920, 800)]
		hound.waypoints = hw
		hound.hound_slain.connect(_on_hound_slain)
		hound.body_clicked.connect(func(): trigger_hound_combat())

	if has_node("FogOfWar"):
		var fow = $FogOfWar
		if hound:
			fow.register_actor(hound)
		if blacksmith:
			fow.register_actor(blacksmith)
		for child in get_children():
			if child is CharacterBody2D and child != hero and child != hound:
				fow.register_actor(child)

func get_nav_points() -> Array[Vector2]:
	return [
		# South Avenue & Spawn
		Vector2(460, 1180),
		Vector2(600, 1180),
		Vector2(780, 1180),
		Vector2(1050, 1180),
		Vector2(1280, 1180),
		Vector2(1750, 1180),
		Vector2(2150, 1180),
		# South-Central corridor (south of blacksmith, north of cottage)
		Vector2(450, 1080),
		Vector2(1050, 1020),
		Vector2(1050, 920),
		Vector2(1180, 920),
		Vector2(1280, 920),
		# West-East main thoroughfare
		Vector2(200, 750),
		Vector2(200, 850),
		Vector2(450, 750),
		Vector2(450, 850),
		Vector2(700, 750),
		Vector2(960, 850),
		Vector2(1080, 850),
		Vector2(1180, 850),
		Vector2(1280, 850),
		Vector2(1420, 850),
		Vector2(1600, 850),
		Vector2(1750, 850),
		Vector2(1950, 820),
		Vector2(2150, 800),
		Vector2(2380, 800),
		# West alley (west of Inn, north of Apothecary)
		Vector2(200, 400),
		Vector2(400, 360),
		Vector2(550, 360),
		Vector2(550, 680),
		Vector2(700, 650),
		# North avenue (Garrison gate approach & walls)
		Vector2(700, 320),
		Vector2(960, 340),
		Vector2(1150, 320),
		Vector2(1280, 320),
		Vector2(1280, 240),
		Vector2(1400, 320),
		Vector2(1650, 320),
		Vector2(1900, 320),
		# Inter-building lanes
		Vector2(960, 550),
		Vector2(960, 720),
		Vector2(1420, 550),
		Vector2(1420, 720),
		# East forest gate approach
		Vector2(1950, 720),
		Vector2(2150, 720),
		Vector2(2300, 780),
		Vector2(2380, 780)
	]

func _load_brand_textures() -> void:
	for i in range(4):
		var p_walk = "res://assets/sprites/characters/blacksmith_brand_walk_%d.png" % i
		if ResourceLoader.exists(p_walk):
			brand_walk_textures.append(load(p_walk))
	var p_idle = "res://assets/sprites/characters/blacksmith_brand_0.png"
	if ResourceLoader.exists(p_idle):
		brand_idle_texture = load(p_idle)

func _process(delta: float) -> void:
	if action_log and action_log.is_dialogue_active:
		# Face hero during dialogue
		if blacksmith_sprite and hero:
			blacksmith_sprite.flip_h = (hero.global_position.x > blacksmith.global_position.x)
		return

	if brand_wait_timer > 0.0:
		brand_wait_timer -= delta
		if brand_idle_texture and blacksmith_sprite:
			blacksmith_sprite.texture = brand_idle_texture
		return

	var dest = brand_waypoints[brand_wp_idx]
	var dist = blacksmith.global_position.distance_to(dest)
	if dist > 4.0:
		var dir = blacksmith.global_position.direction_to(dest)
		blacksmith.global_position += dir * (65.0 * delta)
		blacksmith_sprite.flip_h = (dir.x > 0)

		# Walk animation
		brand_anim_timer += delta
		if brand_anim_timer >= 0.2 and brand_walk_textures.size() > 0:
			brand_anim_timer = 0.0
			brand_frame = (brand_frame + 1) % brand_walk_textures.size()
			blacksmith_sprite.texture = brand_walk_textures[brand_frame]
	else:
		brand_wait_timer = randf_range(4.0, 7.0)
		brand_wp_idx = (brand_wp_idx + 1) % brand_waypoints.size()
		if brand_idle_texture and blacksmith_sprite:
			blacksmith_sprite.texture = brand_idle_texture

func talk_to_blacksmith() -> void:
	if hero and blacksmith_sprite:
		blacksmith_sprite.flip_h = (hero.global_position.x > blacksmith.global_position.x)
	var dial = DataStore.dialogue_trees.get("blacksmith-inquiry", {})
	if action_log:
		action_log.start_dialogue(dial, "node_blacksmith_start")
	GameState.flags.blacksmith_conversed = true
	GameState.add_item("garrison-key")
	GameState.advance_quest(3)
	show_notice("Received Garrison Side-Gate Key from Blacksmith Brand!")
	hud.update_display("Active Quest: Unlock and enter Royal Garrison Keep")

func open_shop_window() -> void:
	var shop = find_child("ShopWindow", true, false)
	if not shop:
		var canvas = find_child("CanvasLayer", true, false)
		if canvas:
			var sw_scene = load("res://scenes/components/ShopWindow.tscn")
			if sw_scene:
				shop = sw_scene.instantiate()
				canvas.add_child(shop)
	if shop:
		shop.open("Blacksmith Brand's Armory")

func trigger_hound_combat() -> void:
	if GameState.flags.get("village_hounds_slain", false) or not is_instance_valid(hound):
		return
	
	if GameState.equipped_weapon in ["hunting-bow", "light-crossbow"]:
		execute_ranged_attack_on_hound()
	elif GameState.hero_class == "wizard" and not GameState.selected_spells.is_empty():
		execute_spell_on_hound(GameState.selected_spells[0])
	else:
		# Hero approaches hound or strikes directly if already in melee proximity
		if hero.global_position.distance_to(hound.global_position) <= 240.0:
			_execute_hero_strike_on_hound()
		else:
			hero.approach_and_interact(hound.global_position, 60.0, func():
				_execute_hero_strike_on_hound()
			)

func _execute_hero_strike_on_hound() -> void:
	if not is_instance_valid(hound) or hound.get("current_state") == 3:
		return
	
	show_notice("⚔️ Engaging Corrupted Shadow Hound in RTwP melee combat!")
	
	# Execute hero weapon swing animation
	hero.play_attack(hound.global_position, func():
		var ac = hound.armor_class if is_instance_valid(hound) else 12
		var res = combat_mgr.execute_attack(GameState.hero_name, 8, 24, 30, "Corrupted Hound", ac)
		if is_instance_valid(hound):
			var comp = find_child("PartyCompanion", true, false)
			if comp and comp.has_method("attack_target"):
				comp.attack_target(hound)
			hound.take_damage(99)
		_on_hound_slain()
		show_notice("Hero strike vanquished the Corrupted Hound!")
		return res
	)

func execute_ranged_attack_on_hound() -> void:
	if not is_instance_valid(hound) or hound.get("current_state") == 3:
		return
	var hound_pos = hound.global_position
	if hero.global_position.distance_to(hound_pos) > 420.0:
		var stand_pos = hound_pos + (hero.global_position - hound_pos).normalized() * 340.0
		hero.move_to_point(stand_pos, func():
			_fire_ranged_at_hound()
		)
	else:
		_fire_ranged_at_hound()

func _fire_ranged_at_hound() -> void:
	var hound_pos = hound.global_position if is_instance_valid(hound) else Vector2(1780, 830)
	show_notice("🏹 Aiming Hunting Bow at Corrupted Shadow Hound from standoff range!")
	hero.play_ranged_attack(hound_pos, func():
		var ac = hound.armor_class if is_instance_valid(hound) else 12
		var dex_mod = GameState.get_stat_modifier(int(GameState.ability_scores.get("DEX", 14)))
		var res = combat_mgr.execute_ranged_attack(GameState.hero_name, 6 + dex_mod, 24, 30, "Corrupted Hound", ac)
		if is_instance_valid(hound):
			var comp = find_child("PartyCompanion", true, false)
			if comp and comp.has_method("attack_target"):
				comp.attack_target(hound)
			hound.take_damage(99)
		_on_hound_slain()
		show_notice("🏹 Arrow struck Corrupted Hound for lethal damage!")
		return res
	)

func execute_spell_on_hound(spell_id: String = "magic-missile") -> void:
	if not is_instance_valid(hound) or hound.get("current_state") == 3:
		return
	var hound_pos = hound.global_position
	if hero.global_position.distance_to(hound_pos) > 420.0:
		var stand_pos = hound_pos + (hero.global_position - hound_pos).normalized() * 340.0
		hero.move_to_point(stand_pos, func():
			_cast_spell_at_hound(spell_id)
		)
	else:
		_cast_spell_at_hound(spell_id)

func _cast_spell_at_hound(spell_id: String) -> void:
	var hound_pos = hound.global_position if is_instance_valid(hound) else Vector2(1780, 830)
	show_notice("✨ Invoking arcane spell [%s] against Corrupted Shadow Hound!" % spell_id)
	hero.play_cast_spell(spell_id, hound_pos, func():
		var res = combat_mgr.execute_cast_spell(GameState.hero_name, spell_id, "Corrupted Hound", hound)
		if is_instance_valid(hound):
			var comp = find_child("PartyCompanion", true, false)
			if comp and comp.has_method("attack_target"):
				comp.attack_target(hound)
			hound.take_damage(99)
		_on_hound_slain()
		show_notice("✨ [%s] destroyed Corrupted Shadow Hound!" % spell_id)
		return res
	)

func execute_heal_spell(spell_id: String = "cure-wounds") -> void:
	# If healthy, take light graze damage first so heal is demonstrated
	if GameState.hero_hp >= GameState.hero_max_hp:
		GameState.take_damage(4)

	show_notice("✨ Chanting divine restorative prayer [%s]!" % spell_id)
	hero.play_cast_spell(spell_id, hero.global_position, func():
		var res = combat_mgr.execute_cast_spell(GameState.hero_name, spell_id, GameState.hero_name, hero)
		show_notice("✨ Vitality restored via [%s]!" % spell_id)
		return res
	)

func _on_hound_slain() -> void:
	GameState.flags.village_hounds_slain = true
	if GameState.stats.kills == 0:
		GameState.add_kill()
	show_notice("★ Corrupted Shadow Hound vanquished! The street is clear. ★")

func try_enter_garrison() -> void:
	if not GameState.has_item("garrison-key"):
		show_notice("The massive iron portcullis is locked! Speak to Blacksmith Brand.")
		return
	GameState.advance_quest(4)
	get_tree().change_scene_to_file("res://scenes/GarrisonKeep.tscn")

func show_notice(text: String) -> void:
	msg_label.text = text
	msg_label.visible = true
	await get_tree().create_timer(3.0).timeout
	msg_label.visible = false
