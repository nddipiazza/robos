extends Node2D

@onready var action_log: ActionLog = $CanvasLayer/ActionLog
@onready var hud = $CanvasLayer/PartyHUD
@onready var combat_mgr = $CombatManager
@onready var msg_label = $CanvasLayer/NoticeLabel
@onready var malakor_npc = $MalakorBoss
@onready var malakor_sprite: Sprite2D = $MalakorBoss/Sprite
@onready var malakor_hp_bar: ProgressBar = $MalakorBoss/BossHPBar
@onready var malakor_hp_text: Label = get_node_or_null("MalakorBoss/BossHPText")
@onready var hero = $HeroPlayer

var boss_fight_active: bool = false
var malakor_hp: int = 48
var malakor_max_hp: int = 48
var malakor_attack_textures: Array[Texture2D] = []
var malakor_idle_texture: Texture2D = null

func _ready() -> void:
	print("Royal Garrison Keep loaded: Act 3 & 4 begins (2560x1440 Dungeon).")
	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 2560, 1440)
	hud.update_display("Active Quest: Cleanse barracks & confront Captain Malakor")
	if GameState.party_members.size() > 1 and not has_node("PartyCompanion"):
		var comp_scene = load("res://scenes/PartyCompanion.tscn")
		if comp_scene:
			var comp = comp_scene.instantiate()
			comp.global_position = hero.global_position + Vector2(-48, 24)
			add_child(comp)
			if has_node("FogOfWar"):
				$FogOfWar.register_actor(comp)
	malakor_npc.body_clicked.connect(confront_malakor)
	_load_malakor_textures()
	_update_health_bar_visibility()
	GameState.settings_changed.connect(_update_health_bar_visibility)

	if has_node("FogOfWar") and malakor_npc:
		$FogOfWar.register_actor(malakor_npc)

func get_nav_points() -> Array[Vector2]:
	return [
		# South entrance corridor
		Vector2(520, 1180),
		Vector2(1000, 1180),
		Vector2(1280, 1180),
		Vector2(1560, 1180),
		Vector2(1880, 1180),
		# Central nave (between pillars)
		Vector2(520, 720),
		Vector2(1000, 720),
		Vector2(1280, 720),
		Vector2(1560, 720),
		Vector2(1880, 720),
		Vector2(2100, 720),
		# North aisle / throne dais
		Vector2(520, 340),
		Vector2(1000, 340),
		Vector2(1280, 340),
		Vector2(1560, 340),
		Vector2(1880, 340),
		Vector2(1880, 420),
		Vector2(2100, 340)
	]

func _load_malakor_textures() -> void:
	for i in range(4):
		var p_atk = "res://assets/sprites/characters/captain_malakor_attack_%d.png" % i
		if ResourceLoader.exists(p_atk):
			malakor_attack_textures.append(load(p_atk))
	var p_idle = "res://assets/sprites/characters/captain_malakor_boss.png"
	if ResourceLoader.exists(p_idle):
		malakor_idle_texture = load(p_idle)

func _update_health_bar_visibility() -> void:
	if not malakor_hp_bar: return
	if malakor_hp_text:
		malakor_hp_text.text = "%d/%d" % [malakor_hp, malakor_max_hp]
	var mode = GameState.settings.get("health_bar_mode", "always")
	var is_visible = true
	match mode:
		"always":
			is_visible = true
		"injured_only":
			is_visible = (malakor_hp < malakor_max_hp)
		"none":
			is_visible = false
		_:
			is_visible = true
	malakor_hp_bar.visible = is_visible
	if malakor_hp_text:
		malakor_hp_text.visible = is_visible

func confront_malakor() -> void:
	if GameState.flags.get("malakor_slain", false): return
	
	# Turn Malakor to face hero
	if malakor_sprite and hero:
		malakor_sprite.flip_h = (hero.global_position.x < malakor_npc.global_position.x)

	var dial = DataStore.dialogue_trees.get("malakor-showdown", {})
	if action_log:
		action_log.start_dialogue(dial, "node_malakor_start")
		action_log.dialogue_ended.connect(start_boss_battle, CONNECT_ONE_SHOT)
	else:
		start_boss_battle()

func start_boss_battle() -> void:
	boss_fight_active = true
	GameState.log_message("combat", "⚔️ [b]BOSS BATTLE INITIATED:[/b] Captain Malakor (Corrupted Commander) draws his crimson blade! ⚔️")
	show_notice("⚔️ BOSS BATTLE: Captain Malakor (Corrupted Commander) ⚔️")
	execute_boss_round()

func execute_boss_round() -> void:
	if not boss_fight_active or not is_instance_valid(malakor_npc): return
	
	# 1. Hero attacks Malakor with animated sword swing
	hero.play_attack(malakor_npc.global_position, func():
		var res = combat_mgr.execute_attack(GameState.hero_name, 8, 18, 26, "Captain Malakor", 14)
		if res.hit:
			malakor_hp -= res.damage
			if malakor_hp_bar:
				malakor_hp_bar.value = malakor_hp
			_update_health_bar_visibility()
			_play_malakor_hit_flash()
			show_notice("Hero strikes Malakor for %d damage!" % res.damage)
		else:
			show_notice("Malakor parries the hero's strike!")
		return res
	)

	await get_tree().create_timer(0.6).timeout

	if malakor_hp <= 0:
		_on_malakor_vanquished()
		return

	# 2. Malakor retaliates with animated crimson strike against hero
	_play_malakor_attack(func():
		var boss_res = combat_mgr.execute_attack("Captain Malakor", 5, 2, 6, GameState.hero_name, GameState.hero_ac)
		if boss_res.hit:
			GameState.take_damage(boss_res.damage)
			show_notice("Malakor strikes hero for %d damage!" % boss_res.damage)
		else:
			show_notice("Hero dodges Malakor's strike!")
		return boss_res
	)

	await get_tree().create_timer(1.2).timeout

	if boss_fight_active and malakor_hp > 0:
		execute_boss_round()

func _play_malakor_attack(on_strike: Callable = Callable()) -> void:
	if malakor_attack_textures.size() == 0:
		if on_strike.is_valid(): on_strike.call()
		return

	var orig_pos = malakor_sprite.position
	var lunge_dir = (hero.global_position - malakor_npc.global_position).normalized()
	var lunge_tw = create_tween()
	lunge_tw.tween_property(malakor_sprite, "position", orig_pos + lunge_dir * 14.0, 0.12)

	for i in range(malakor_attack_textures.size()):
		malakor_sprite.texture = malakor_attack_textures[i]
		if i == 1:
			if AudioManager:
				AudioManager.play_sfx("melee_swing")
		elif i == 2 and on_strike.is_valid():
			on_strike.call()
		await get_tree().create_timer(0.08).timeout

	if malakor_idle_texture:
		malakor_sprite.texture = malakor_idle_texture

	var recov_tw = create_tween()
	recov_tw.tween_property(malakor_sprite, "position", orig_pos, 0.12)

func _play_malakor_hit_flash() -> void:
	var tw = create_tween()
	tw.tween_property(malakor_sprite, "modulate", Color(2.5, 0.4, 0.4, 1.0), 0.08)
	tw.tween_property(malakor_sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.15)

func _on_malakor_vanquished() -> void:
	boss_fight_active = false
	GameState.flags.malakor_slain = true
	GameState.add_kill()
	GameState.advance_quest(5)
	GameState.log_message("quest", "★ Captain Malakor is vanquished! The dark crypt breach is sealed! ★")
	show_notice("★ Captain Malakor is vanquished! The breach is sealed! ★")
	
	if malakor_hp_bar:
		malakor_hp_bar.visible = false
	if malakor_hp_text:
		malakor_hp_text.visible = false
	
	var sel = malakor_npc.find_child("SelectionCircle", true, false)
	if sel: sel.visible = false

	if malakor_npc.has_node("CollisionShape2D"):
		malakor_npc.get_node("CollisionShape2D").set_deferred("disabled", true)

	var tw = create_tween()
	tw.parallel().tween_property(malakor_sprite, "rotation_degrees", 75.0, 0.45)
	tw.parallel().tween_property(malakor_sprite, "modulate", Color(0.65, 0.5, 0.5, 0.9), 0.45)
	await tw.finished

	await get_tree().create_timer(1.8).timeout
	get_tree().change_scene_to_file("res://scenes/VictoryScreen.tscn")

func show_notice(text: String) -> void:
	msg_label.text = text
	msg_label.visible = true
	await get_tree().create_timer(2.5).timeout
	msg_label.visible = false
