extends CharacterBody2D
class_name HeroPlayer

const Pathfinder = preload("res://scripts/Pathfinder.gd")

signal attack_finished(target_node: Node2D)

@export var move_speed: float = 220.0
@export var character_name: String = ""

@onready var sprite: Sprite2D = $Sprite
@onready var name_label: Label = $OverheadUI/NameLabel
@onready var hp_bar: ProgressBar = $OverheadUI/HPBar
@onready var hp_text: Label = get_node_or_null("OverheadUI/HPText")
@onready var reticle: Sprite2D = $Reticle
@onready var selection_circle: Sprite2D = find_child("SelectionCircle", true, false)
@onready var camera: Camera2D = get_node_or_null("Camera2D")
@onready var path_visualizer: Node2D = get_node_or_null("PathVisualizer")

var target_position: Vector2 = Vector2.ZERO
var pending_callback: Callable = Callable()
var is_moving: bool = false
var is_attacking: bool = false
var stuck_timer: float = 0.0

# Waypoint Queuing (Shift-click & queued multi-point routes)
var waypoint_queue: Array[Vector2] = []
var waypoint_callbacks: Array[Callable] = []


# Camera & Panning State (Infinity Engine Arrow Key Scrolling)
var camera_pan_speed: float = 850.0
var camera_target_offset: Vector2 = Vector2.ZERO
var camera_current_offset: Vector2 = Vector2.ZERO
var simulated_pan_dir: Vector2 = Vector2.ZERO
var camera_limit_left: int = 0
var camera_limit_top: int = 0
var camera_limit_right: int = 2560
var camera_limit_bottom: int = 1440

var idle_textures: Array[Texture2D] = []
var walk_textures: Array[Texture2D] = []
var attack_textures: Array[Texture2D] = []

var anim_timer: float = 0.0
var anim_frame: int = 0

func set_camera_limits(left: int, top: int, right: int, bottom: int) -> void:
	camera_limit_left = left
	camera_limit_top = top
	camera_limit_right = right
	camera_limit_bottom = bottom
	if not camera:
		camera = get_node_or_null("Camera2D")
	if camera:
		camera.limit_left = left
		camera.limit_top = top
		camera.limit_right = right
		camera.limit_bottom = bottom
		camera.position_smoothing_enabled = false
		camera.offset = camera_current_offset

var is_down_prone: bool = false
var orig_sprite_pos: Vector2 = Vector2.ZERO
var _was_prone: bool = false

func _ready() -> void:
	if GameState.spawn_position != Vector2.ZERO:
		global_position = GameState.spawn_position
		GameState.spawn_position = Vector2.ZERO
	if character_name == "":
		character_name = GameState.hero_name
	_load_textures()
	_update_overhead_ui()
	_update_invisibility_visual()
	GameState.hero_damaged.connect(_on_hero_damaged)
	GameState.settings_changed.connect(_update_overhead_ui)
	GameState.status_effects_changed.connect(_on_status_effects_changed)
	_update_prone_state()
	if reticle:
		reticle.visible = false
		reticle.top_level = true
	if camera:
		camera.top_level = false
		camera.position_smoothing_enabled = false
		camera.limit_left = camera_limit_left
		camera.limit_top = camera_limit_top
		camera.limit_right = camera_limit_right
		camera.limit_bottom = camera_limit_bottom
		camera.offset = Vector2.ZERO
		camera_target_offset = Vector2.ZERO
		camera_current_offset = Vector2.ZERO

func _load_textures() -> void:
	for i in range(4):
		var p_idle = "res://assets/sprites/characters/hero_knight_idle_%d.png" % i
		if ResourceLoader.exists(p_idle):
			idle_textures.append(load(p_idle))
		var p_walk = "res://assets/sprites/characters/hero_knight_walk_%d.png" % i
		if ResourceLoader.exists(p_walk):
			walk_textures.append(load(p_walk))
		var p_atk = "res://assets/sprites/characters/hero_knight_attack_%d.png" % i
		if ResourceLoader.exists(p_atk):
			attack_textures.append(load(p_atk))

	if idle_textures.size() > 0:
		sprite.texture = idle_textures[0]

func _update_overhead_ui() -> void:
	if name_label:
		name_label.text = GameState.hero_name
	if hp_bar:
		hp_bar.max_value = GameState.hero_max_hp
		hp_bar.value = GameState.hero_hp
		
		var pct = float(GameState.hero_hp) / max(1.0, float(GameState.hero_max_hp))
		var fill_col = Color(0.2, 0.88, 0.4, 1.0)
		if pct <= 0.25:
			fill_col = Color(0.95, 0.25, 0.25, 1.0)
		elif pct <= 0.5:
			fill_col = Color(1.0, 0.78, 0.2, 1.0)
		
		var fill_style = StyleBoxFlat.new()
		fill_style.bg_color = fill_col
		fill_style.corner_radius_top_left = 2
		fill_style.corner_radius_top_right = 2
		fill_style.corner_radius_bottom_left = 2
		fill_style.corner_radius_bottom_right = 2
		hp_bar.add_theme_stylebox_override("fill", fill_style)
		
		var bg_style = StyleBoxFlat.new()
		bg_style.bg_color = Color(0.1, 0.1, 0.12, 0.85)
		bg_style.corner_radius_top_left = 2
		bg_style.corner_radius_top_right = 2
		bg_style.corner_radius_bottom_left = 2
		bg_style.corner_radius_bottom_right = 2
		hp_bar.add_theme_stylebox_override("background", bg_style)
		
		if hp_text:
			hp_text.text = "%d/%d" % [GameState.hero_hp, GameState.hero_max_hp]
			hp_text.add_theme_color_override("font_color", fill_col if pct <= 0.5 else Color(0.95, 1.0, 0.9, 1.0))
		
		var mode = GameState.settings.get("health_bar_mode", "always")
		var is_bar_visible = true
		match mode:
			"always":
				is_bar_visible = true
			"injured_only":
				is_bar_visible = (GameState.hero_hp < GameState.hero_max_hp)
			"none":
				is_bar_visible = false
			_:
				is_bar_visible = true

		hp_bar.visible = is_bar_visible
		if hp_text:
			hp_text.visible = is_bar_visible

func _on_hero_damaged(current_hp: int, max_hp: int) -> void:
	_update_overhead_ui()
	play_hit_reaction()
	if current_hp <= 0:
		sprite.rotation_degrees = 90.0
		sprite.modulate = Color(0.7, 0.2, 0.2, 0.85)
	elif is_down_prone or is_prone():
		sprite.rotation_degrees = 90.0
	else:
		sprite.rotation_degrees = 0.0
		_update_invisibility_visual()

func _on_status_effects_changed(_target: String) -> void:
	_update_invisibility_visual()
	_update_prone_state()

func is_prone() -> bool:
	var h_name = character_name if character_name != "" else GameState.hero_name
	return GameState.has_status_effect(h_name, "prone") or GameState.has_status_effect("hero", "prone") or GameState.has_status_effect(GameState.hero_name, "prone")

func _update_prone_state() -> void:
	if GameState.hero_hp <= 0:
		return
	var should_be_prone = is_prone()
	if should_be_prone and not is_down_prone:
		knock_down_prone()
	elif not should_be_prone and is_down_prone:
		stand_up_from_prone()

func knock_down_prone() -> void:
	if is_down_prone or GameState.hero_hp <= 0:
		return
	is_down_prone = true
	_was_prone = true
	_stop_movement()
	if sprite:
		if orig_sprite_pos == Vector2.ZERO:
			orig_sprite_pos = sprite.position
		var tw = create_tween()
		tw.parallel().tween_property(sprite, "rotation_degrees", 90.0, 0.25)
		tw.parallel().tween_property(sprite, "position", orig_sprite_pos + Vector2(0, 8.0), 0.25)
	if FloatingTextManager:
		FloatingTextManager.spawn_text(global_position + Vector2(0, -30), "KNOCKED PRONE!", Color(1.0, 0.8, 0.2))
	var h_name = character_name if character_name != "" else GameState.hero_name
	GameState.log_message("combat", "💥 %s was knocked down flat on the ground! (Prone - unable to act or sprint for 1 turn)" % h_name)

func stand_up_from_prone() -> void:
	if not is_down_prone or GameState.hero_hp <= 0:
		return
	is_down_prone = false
	_was_prone = false
	if sprite:
		var tw = create_tween()
		tw.parallel().tween_property(sprite, "rotation_degrees", 0.0, 0.30)
		tw.parallel().tween_property(sprite, "position", orig_sprite_pos if orig_sprite_pos != Vector2.ZERO else Vector2.ZERO, 0.30)
	if FloatingTextManager:
		FloatingTextManager.spawn_text(global_position + Vector2(0, -30), "STANDS UP!", Color(0.4, 0.9, 1.0))
	var h_name = character_name if character_name != "" else GameState.hero_name
	GameState.log_message("combat", "🧍 %s spends effort and stands back up from prone." % h_name)

func _update_invisibility_visual() -> void:
	if not sprite:
		return
	var h_name = character_name if character_name != "" else GameState.hero_name
	if GameState.is_invisible(h_name) or GameState.is_invisible(GameState.hero_name):
		sprite.modulate = Color(1.0, 1.0, 1.0, 0.35)
	else:
		if sprite.modulate.a < 0.9 and GameState.hero_hp > 0:
			sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)

func play_hit_reaction() -> void:
	var tw = create_tween()
	tw.tween_property(sprite, "modulate", Color(2.0, 0.4, 0.4, 1.0), 0.08)
	tw.tween_property(sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.15)

func set_hero_visual_appearance(h_class: String) -> void:
	if h_class == "wizard" or h_class == "mage":
		var p_mage = "res://assets/sprites/characters/hero_mage.png"
		if ResourceLoader.exists(p_mage):
			var tex = load(p_mage)
			sprite.texture = tex
			idle_textures = [tex]
			walk_textures = [tex]
			attack_textures = [tex]

func play_attack(target_pos: Vector2, on_hit_callback: Callable = Callable(), target_node: Node2D = null) -> void:
	if is_attacking or is_down_prone or is_prone():
		if is_down_prone or is_prone():
			var h_name_p = character_name if character_name != "" else GameState.hero_name
			GameState.log_message("combat", "⚠️ %s is down prone on the ground and cannot attack until standing up!" % h_name_p)
		return

	# Invisibility breaks on physical attack action
	var h_name = character_name if character_name != "" else GameState.hero_name
	if GameState.is_invisible(h_name) or GameState.is_invisible(GameState.hero_name):
		GameState.remove_status_effect(h_name, "invisible")
		GameState.remove_status_effect(GameState.hero_name, "invisible")
		GameState.log_message("combat", "✨ Invisibility broke! %s performed a physical attack." % (GameState.hero_name if GameState.hero_name != "Vance" else h_name))
		_update_invisibility_visual()

	is_attacking = true
	_stop_movement()
	_update_facing(target_pos)
	
	# Attack swing sequence (4 frames)
	var count = attack_textures.size()
	if count == 0:
		is_attacking = false
		if on_hit_callback.is_valid():
			on_hit_callback.call()
		attack_finished.emit(target_node)
		return

	# Dynamic lunge toward target during swing (2x deliberate pacing)
	var lunge_dir = global_position.direction_to(target_pos)
	var orig_pos = sprite.position
	var tw = create_tween()
	tw.tween_property(sprite, "position", orig_pos + lunge_dir * 14.0, 0.32)
	tw.tween_property(sprite, "position", orig_pos, 0.32)
	
	for i in range(count):
		sprite.texture = attack_textures[i]
		if i == 1:
			# Swing frame: Play weapon swing whoosh through air
			if AudioManager:
				AudioManager.play_sfx("melee_swing")
		elif i == 2:
			# Strike frame: Execute strike callback (hit vs miss audio & damage)
			var res = null
			if on_hit_callback.is_valid():
				res = on_hit_callback.call()
			if res == null or not (res is Dictionary) or res.get("hit", true):
				_spawn_slash_vfx(target_pos)
		await get_tree().create_timer(0.20).timeout
	
	# Reset back to idle
	if idle_textures.size() > 0:
		sprite.texture = idle_textures[0]
	sprite.position = orig_pos
	is_attacking = false
	attack_finished.emit(target_node)

func _spawn_slash_vfx(hit_pos: Vector2) -> void:
	var slash_tex = load("res://assets/props/slash_effect.png")
	if not slash_tex:
		return
	var slash_node = Sprite2D.new()
	slash_node.texture = slash_tex
	slash_node.global_position = hit_pos
	slash_node.scale = Vector2(0.55, 0.55)
	slash_node.modulate = Color(1.4, 1.3, 0.8, 1.0)
	slash_node.top_level = true
	get_parent().add_child(slash_node)
	
	var tw = create_tween()
	tw.parallel().tween_property(slash_node, "scale", Vector2(0.85, 0.85), 0.38)
	tw.parallel().tween_property(slash_node, "modulate:a", 0.0, 0.38)
	tw.tween_callback(slash_node.queue_free)

func attack_target(target_node: Node2D, on_hit_callback: Callable = Callable()) -> void:
	if not target_node or not is_instance_valid(target_node):
		return
	var weapon = GameState.equipped_weapon
	var is_ranged = (weapon == "hunting-bow" or weapon == "shortbow" or weapon == "longbow" or weapon == "light-crossbow" or weapon == "heavy-crossbow")

	if is_ranged:
		play_ranged_attack(target_node.global_position, on_hit_callback, target_node)
	else:
		approach_and_interact(target_node.global_position, 65.0, func():
			play_attack(target_node.global_position, on_hit_callback, target_node)
		)

func play_ranged_attack(target_pos: Vector2, on_hit_callback: Callable = Callable(), target_node: Node2D = null) -> void:
	if is_attacking:
		return

	# Invisibility breaks on ranged attack action
	var h_name = character_name if character_name != "" else GameState.hero_name
	if GameState.is_invisible(h_name):
		GameState.remove_status_effect(h_name, "invisible")
		GameState.log_message("combat", "✨ Invisibility broke! %s performed an attack." % h_name)
		_update_invisibility_visual()

	is_attacking = true
	_stop_movement()
	_update_facing(target_pos)

	if attack_textures.size() > 1:
		sprite.texture = attack_textures[1]
	await get_tree().create_timer(0.24).timeout

	if AudioManager:
		AudioManager.play_sfx("ranged_shoot")

	var arrow = Node2D.new()
	arrow.top_level = true
	arrow.global_position = global_position + Vector2(0, -12)
	var dir = (target_pos - arrow.global_position).normalized()
	arrow.rotation = dir.angle()

	var shaft = Line2D.new()
	shaft.width = 3.0
	shaft.default_color = Color(0.9, 0.75, 0.45, 1.0)
	shaft.points = PackedVector2Array([Vector2(-16, 0), Vector2(6, 0)])
	arrow.add_child(shaft)

	var head = Polygon2D.new()
	head.polygon = PackedVector2Array([Vector2(12, 0), Vector2(5, -4), Vector2(5, 4)])
	head.color = Color(0.85, 0.9, 0.95, 1.0)
	arrow.add_child(head)

	get_parent().add_child(arrow)

	var flight_time = clamp(global_position.distance_to(target_pos) / 550.0, 0.30, 0.65)
	var tw = create_tween()
	tw.tween_property(arrow, "global_position", target_pos, flight_time)
	await tw.finished

	arrow.queue_free()
	_spawn_ranged_impact_vfx(target_pos)

	if on_hit_callback.is_valid():
		on_hit_callback.call()

	if idle_textures.size() > 0:
		sprite.texture = idle_textures[0]
	is_attacking = false
	attack_finished.emit(target_node)

func _spawn_ranged_impact_vfx(hit_pos: Vector2) -> void:
	var spark = Node2D.new()
	spark.top_level = true
	spark.global_position = hit_pos
	var circ = Polygon2D.new()
	var pts: PackedVector2Array = []
	for i in range(12):
		var a = i * (PI * 2.0 / 12.0)
		pts.append(Vector2(cos(a), sin(a)) * 14.0)
	circ.polygon = pts
	circ.color = Color(1.5, 1.2, 0.5, 0.9)
	spark.add_child(circ)
	get_parent().add_child(spark)

	var tw = create_tween()
	tw.parallel().tween_property(spark, "scale", Vector2(1.8, 1.8), 0.18)
	tw.parallel().tween_property(spark, "modulate:a", 0.0, 0.18)
	tw.tween_callback(spark.queue_free)

func play_cast_spell(spell_id: String, target_pos: Vector2, on_cast_callback: Callable = Callable()) -> void:
	if is_attacking or is_down_prone or is_prone():
		if is_down_prone or is_prone():
			var h_name_p = character_name if character_name != "" else GameState.hero_name
			GameState.log_message("combat", "⚠️ %s is down prone on the ground and cannot cast spells until standing up!" % h_name_p)
		return

	# Invisibility breaks on casting non-invisibility spells
	var h_name = character_name if character_name != "" else GameState.hero_name
	if spell_id != "invisibility" and GameState.is_invisible(h_name):
		GameState.remove_status_effect(h_name, "invisible")
		GameState.log_message("combat", "✨ Invisibility broke! %s cast spell '%s'." % [h_name, spell_id])
		_update_invisibility_visual()

	is_attacking = true
	_stop_movement()
	_update_facing(target_pos)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")

	if attack_textures.size() > 0:
		sprite.texture = attack_textures[0]

	var circle = Node2D.new()
	circle.top_level = true
	circle.global_position = global_position + Vector2(0, 16)
	var ring = Line2D.new()
	ring.width = 2.5
	var ring_col = Color(0.3, 0.8, 1.0, 0.9) if spell_id != "cure-wounds" else Color(0.4, 1.0, 0.6, 0.9)
	if spell_id == "fireball": ring_col = Color(1.0, 0.5, 0.2, 0.9)
	ring.default_color = ring_col
	var pts: PackedVector2Array = []
	for i in range(24):
		var a = i * (PI * 2.0 / 24.0)
		pts.append(Vector2(cos(a), sin(a)) * 26.0)
	pts.append(pts[0])
	ring.points = pts
	circle.add_child(ring)
	get_parent().add_child(circle)

	var circle_tw = create_tween()
	circle_tw.tween_property(circle, "scale", Vector2(1.4, 0.7), 0.50).from(Vector2(0.2, 0.1))
	circle_tw.parallel().tween_property(circle, "modulate:a", 0.0, 0.70).from(1.0)
	circle_tw.tween_callback(circle.queue_free)

	await get_tree().create_timer(0.40).timeout

	if spell_id == "cure-wounds":
		var heal_fx = Node2D.new()
		heal_fx.top_level = true
		heal_fx.global_position = global_position
		for k in range(5):
			var spark = Polygon2D.new()
			spark.polygon = PackedVector2Array([Vector2(-4, -4), Vector2(4, -4), Vector2(4, 4), Vector2(-4, 4)])
			spark.color = Color(0.5, 1.0, 0.7, 1.0)
			spark.position = Vector2(randf_range(-18, 18), randf_range(-10, 20))
			heal_fx.add_child(spark)
		get_parent().add_child(heal_fx)
		var h_tw = create_tween()
		h_tw.parallel().tween_property(heal_fx, "position:y", global_position.y - 45.0, 0.8)
		h_tw.parallel().tween_property(heal_fx, "modulate:a", 0.0, 0.8)
		h_tw.tween_callback(heal_fx.queue_free)

		if AudioManager:
			AudioManager.play_sfx("heal_cast")
		if on_cast_callback.is_valid():
			on_cast_callback.call()
	elif spell_id == "healing-word":
		await _spawn_healing_word_vfx(target_pos, on_cast_callback)
	elif spell_id == "shield":
		await _spawn_shield_vfx(global_position, on_cast_callback)
	elif spell_id == "mage-armor":
		await _spawn_mage_armor_vfx(target_pos, on_cast_callback)
	elif spell_id == "bless":
		await _spawn_bless_vfx(target_pos, on_cast_callback)
	elif spell_id == "sleep":
		await _spawn_sleep_vfx(target_pos, on_cast_callback)
	elif spell_id == "hold-person":
		await _spawn_hold_person_vfx(target_pos, on_cast_callback)
	elif spell_id == "spiritual-weapon":
		await _spawn_spiritual_weapon_vfx(target_pos, on_cast_callback)
	elif spell_id == "burning-hands":
		await _spawn_burning_hands_vfx(target_pos, on_cast_callback)
	elif spell_id == "thunderwave":
		await _spawn_thunderwave_vfx(target_pos, on_cast_callback)
	elif spell_id == "lightning-bolt":
		await _spawn_lightning_bolt_vfx(target_pos, on_cast_callback)
	elif spell_id == "haste":
		await _spawn_haste_vfx(target_pos, on_cast_callback)
	elif spell_id == "counterspell":
		await _spawn_counterspell_vfx(target_pos, on_cast_callback)
	elif spell_id in ["dispel", "dispel-magic", "dispel_magic"]:
		await _spawn_dispel_magic_vfx(target_pos, on_cast_callback)
	elif spell_id == "find-traps":
		await _spawn_find_traps_vfx(global_position, on_cast_callback)
	elif spell_id == "knock":
		await _spawn_knock_vfx(target_pos, on_cast_callback)
	elif spell_id == "invisibility":
		await _spawn_invisibility_vfx(global_position, on_cast_callback)
	elif spell_id == "tremor-stomp":
		await _spawn_tremor_stomp_vfx(target_pos, on_cast_callback)
	elif spell_id == "crushing-cleave":
		await _spawn_crushing_cleave_vfx(target_pos, on_cast_callback)
	elif spell_id == "rallying-stomp":
		await _spawn_rallying_stomp_vfx(global_position, on_cast_callback)
	elif spell_id == "blizzard":
		await _spawn_blizzard_vfx(target_pos, on_cast_callback)
	elif spell_id == "magic-missile":
		for dart_idx in range(3):
			_spawn_magic_missile_dart(target_pos, dart_idx, func():
				if dart_idx == 0 and on_cast_callback.is_valid():
					on_cast_callback.call()
			)
			await get_tree().create_timer(0.16).timeout
	else:
		var orb = Node2D.new()
		orb.top_level = true
		orb.global_position = global_position + Vector2(0, -10)
		var orb_col = Color(1.5, 0.6, 0.2, 1.0) if spell_id == "fireball" else Color(0.4, 0.8, 1.5, 1.0)
		var poly = Polygon2D.new()
		var p_pts: PackedVector2Array = []
		for i in range(16):
			var a = i * (PI * 2.0 / 16.0)
			p_pts.append(Vector2(cos(a), sin(a)) * 12.0)
		poly.polygon = p_pts
		poly.color = orb_col
		orb.add_child(poly)
		get_parent().add_child(orb)

		var tw = create_tween()
		tw.tween_property(orb, "global_position", target_pos, 0.52)
		await tw.finished
		orb.queue_free()
		if spell_id == "fireball":
			_spawn_fireball_explosion_vfx(target_pos, 180.0)
		else:
			_spawn_spell_blast_vfx(target_pos, orb_col)
		if AudioManager:
			AudioManager.play_sfx("spell_impact")
		if on_cast_callback.is_valid():
			on_cast_callback.call()

	if idle_textures.size() > 0:
		sprite.texture = idle_textures[0]
	is_attacking = false

func _spawn_magic_missile_dart(target_pos: Vector2, index: int, on_impact: Callable) -> void:
	var dart = Node2D.new()
	dart.top_level = true
	dart.global_position = global_position + Vector2(0, -14)
	
	var poly = Polygon2D.new()
	poly.polygon = PackedVector2Array([Vector2(-6, -3), Vector2(8, 0), Vector2(-6, 3)])
	poly.color = Color(0.4, 0.9, 1.8, 1.0)
	dart.add_child(poly)
	get_parent().add_child(dart)

	var offset_y = (index - 1) * 35.0
	var mid_point = (dart.global_position + target_pos) / 2.0 + Vector2(0, offset_y)
	
	var tw = create_tween()
	tw.tween_property(dart, "global_position", mid_point, 0.24)
	tw.tween_property(dart, "global_position", target_pos, 0.24)
	await tw.finished

	dart.queue_free()
	_spawn_spell_blast_vfx(target_pos, Color(0.4, 0.9, 1.8, 1.0))
	if AudioManager:
		AudioManager.play_sfx("spell_impact")
	if on_impact.is_valid():
		on_impact.call()

func _spawn_fireball_explosion_vfx(hit_pos: Vector2, radius: float = 180.0) -> void:
	var blast = Node2D.new()
	blast.top_level = true
	blast.global_position = hit_pos

	var ring = Line2D.new()
	ring.width = 6.0
	ring.default_color = Color(1.8, 0.6, 0.1, 0.95)
	var pts: PackedVector2Array = []
	for i in range(32):
		var a = i * (PI * 2.0 / 32.0)
		pts.append(Vector2(cos(a), sin(a)) * radius)
	pts.append(pts[0])
	ring.points = pts
	blast.add_child(ring)

	var core = Polygon2D.new()
	var c_pts: PackedVector2Array = []
	for i in range(24):
		var a = i * (PI * 2.0 / 24.0)
		var r = (radius * 0.7) * (0.85 + randf() * 0.3)
		c_pts.append(Vector2(cos(a), sin(a)) * r)
	core.polygon = c_pts
	core.color = Color(2.0, 0.75, 0.2, 0.75)
	blast.add_child(core)

	for k in range(12):
		var spark = Polygon2D.new()
		spark.polygon = PackedVector2Array([Vector2(-4, -4), Vector2(4, -4), Vector2(4, 4), Vector2(-4, 4)])
		spark.color = Color(2.2, 0.4, 0.1, 1.0)
		var angle = randf() * PI * 2.0
		var dist = randf_range(30.0, radius * 0.95)
		spark.position = Vector2(cos(angle), sin(angle)) * dist
		blast.add_child(spark)

	get_parent().add_child(blast)

	var tw = create_tween()
	tw.parallel().tween_property(blast, "scale", Vector2(1.0, 1.0), 0.35).from(Vector2(0.15, 0.15))
	tw.parallel().tween_property(blast, "modulate:a", 0.0, 0.55).from(1.0)
	tw.tween_callback(blast.queue_free)

func _spawn_spell_blast_vfx(hit_pos: Vector2, blast_color: Color) -> void:
	var blast = Node2D.new()
	blast.top_level = true
	blast.global_position = hit_pos
	var ring = Line2D.new()
	ring.width = 4.0
	ring.default_color = blast_color
	var pts: PackedVector2Array = []
	for i in range(20):
		var a = i * (PI * 2.0 / 20.0)
		pts.append(Vector2(cos(a), sin(a)) * 22.0)
	pts.append(pts[0])
	ring.points = pts
	blast.add_child(ring)
	get_parent().add_child(blast)

	var tw = create_tween()
	tw.parallel().tween_property(blast, "scale", Vector2(2.2, 2.2), 0.22)
	tw.parallel().tween_property(blast, "modulate:a", 0.0, 0.22)
	tw.tween_callback(blast.queue_free)

func _spawn_healing_word_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var ray = Line2D.new()
	ray.width = 3.5
	ray.default_color = Color(0.4, 1.2, 0.7, 0.9)
	ray.points = PackedVector2Array([global_position + Vector2(0, -10), target_pos])
	ray.top_level = true
	get_parent().add_child(ray)

	var ray_tw = create_tween()
	ray_tw.tween_property(ray, "modulate:a", 0.0, 0.35)
	ray_tw.tween_callback(ray.queue_free)

	var heal_fx = Node2D.new()
	heal_fx.top_level = true
	heal_fx.global_position = target_pos
	for k in range(6):
		var spark = Polygon2D.new()
		spark.polygon = PackedVector2Array([Vector2(-4, -4), Vector2(4, -4), Vector2(4, 4), Vector2(-4, 4)])
		spark.color = Color(0.6, 1.4, 0.8, 1.0)
		spark.position = Vector2(randf_range(-16, 16), randf_range(-12, 12))
		heal_fx.add_child(spark)
	get_parent().add_child(heal_fx)

	var h_tw = create_tween()
	h_tw.parallel().tween_property(heal_fx, "position:y", target_pos.y - 40.0, 0.6)
	h_tw.parallel().tween_property(heal_fx, "modulate:a", 0.0, 0.6)
	h_tw.tween_callback(heal_fx.queue_free)

	if AudioManager:
		AudioManager.play_sfx("heal_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_shield_vfx(center_pos: Vector2, on_impact: Callable) -> void:
	var shield_node = Node2D.new()
	shield_node.top_level = true
	shield_node.global_position = center_pos
	var hex = Line2D.new()
	hex.width = 4.0
	hex.default_color = Color(0.3, 0.9, 1.6, 0.95)
	var pts: PackedVector2Array = []
	for i in range(6):
		var a = i * (PI * 2.0 / 6.0)
		pts.append(Vector2(cos(a), sin(a)) * 38.0)
	pts.append(pts[0])
	hex.points = pts
	shield_node.add_child(hex)

	var fill = Polygon2D.new()
	fill.polygon = pts
	fill.color = Color(0.2, 0.7, 1.4, 0.25)
	shield_node.add_child(fill)
	get_parent().add_child(shield_node)

	var tw = create_tween()
	tw.parallel().tween_property(shield_node, "scale", Vector2(1.15, 1.15), 0.25).from(Vector2(0.5, 0.5))
	tw.parallel().tween_property(shield_node, "modulate:a", 0.0, 0.75).from(1.0)
	tw.tween_callback(shield_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_mage_armor_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var armor_node = Node2D.new()
	armor_node.top_level = true
	armor_node.global_position = target_pos
	var diamond = Line2D.new()
	diamond.width = 3.5
	diamond.default_color = Color(0.5, 1.2, 1.8, 0.95)
	diamond.points = PackedVector2Array([Vector2(0, -42), Vector2(30, 0), Vector2(0, 42), Vector2(-30, 0), Vector2(0, -42)])
	armor_node.add_child(diamond)

	var ring = Line2D.new()
	ring.width = 2.0
	ring.default_color = Color(0.8, 1.4, 2.0, 0.8)
	var pts: PackedVector2Array = []
	for i in range(16):
		var a = i * (PI * 2.0 / 16.0)
		pts.append(Vector2(cos(a), sin(a)) * 26.0)
	pts.append(pts[0])
	ring.points = pts
	armor_node.add_child(ring)
	get_parent().add_child(armor_node)

	var tw = create_tween()
	tw.parallel().tween_property(armor_node, "scale", Vector2(1.2, 1.2), 0.30).from(Vector2(0.3, 0.3))
	tw.parallel().tween_property(armor_node, "modulate:a", 0.0, 0.80).from(1.0)
	tw.tween_callback(armor_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_bless_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var bless_node = Node2D.new()
	bless_node.top_level = true
	bless_node.global_position = target_pos

	for k in range(3):
		var ray = Line2D.new()
		ray.width = 4.0
		ray.default_color = Color(1.8, 1.6, 0.4, 0.9)
		var x_off = (k - 1) * 35.0
		ray.points = PackedVector2Array([Vector2(x_off, -120), Vector2(x_off, 20)])
		bless_node.add_child(ray)

	for s in range(5):
		var star = Polygon2D.new()
		star.polygon = PackedVector2Array([Vector2(0, -8), Vector2(2, -2), Vector2(8, 0), Vector2(2, 2), Vector2(0, 8), Vector2(-2, 2), Vector2(-8, 0), Vector2(-2, -2)])
		star.color = Color(2.0, 1.8, 0.5, 1.0)
		star.position = Vector2(randf_range(-40, 40), randf_range(-30, 20))
		bless_node.add_child(star)

	get_parent().add_child(bless_node)

	var tw = create_tween()
	tw.parallel().tween_property(bless_node, "position:y", target_pos.y - 30.0, 0.70)
	tw.parallel().tween_property(bless_node, "modulate:a", 0.0, 0.70)
	tw.tween_callback(bless_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("heal_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_sleep_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var sleep_node = Node2D.new()
	sleep_node.top_level = true
	sleep_node.global_position = target_pos

	var ring = Line2D.new()
	ring.width = 3.0
	ring.default_color = Color(0.8, 0.5, 1.4, 0.85)
	var pts: PackedVector2Array = []
	for i in range(24):
		var a = i * (PI * 2.0 / 24.0)
		pts.append(Vector2(cos(a), sin(a)) * 140.0)
	pts.append(pts[0])
	sleep_node.add_child(ring)

	for k in range(12):
		var mote = Polygon2D.new()
		mote.polygon = PackedVector2Array([Vector2(-4, -4), Vector2(4, -4), Vector2(4, 4), Vector2(-4, 4)])
		mote.color = Color(0.9, 0.6, 1.8, 0.9)
		mote.position = Vector2(randf_range(-120, 120), randf_range(-60, 60))
		sleep_node.add_child(mote)

	get_parent().add_child(sleep_node)

	var tw = create_tween()
	tw.parallel().tween_property(sleep_node, "scale", Vector2(1.1, 1.1), 0.80).from(Vector2(0.4, 0.4))
	tw.parallel().tween_property(sleep_node, "modulate:a", 0.0, 0.85).from(1.0)
	tw.tween_callback(sleep_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.5).timeout

func _spawn_hold_person_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var chain_node = Node2D.new()
	chain_node.top_level = true
	chain_node.global_position = target_pos

	for k in range(3):
		var ring = Line2D.new()
		ring.width = 4.0
		ring.default_color = Color(1.8, 1.4, 0.2, 0.95)
		var pts: PackedVector2Array = []
		var r_y = -20.0 + k * 18.0
		for i in range(16):
			var a = i * (PI * 2.0 / 16.0)
			pts.append(Vector2(cos(a) * 22.0, sin(a) * 10.0 + r_y))
		pts.append(pts[0])
		ring.points = pts
		chain_node.add_child(ring)

	get_parent().add_child(chain_node)

	var tw = create_tween()
	tw.parallel().tween_property(chain_node, "scale", Vector2(1.0, 1.0), 0.30).from(Vector2(1.6, 1.6))
	tw.parallel().tween_property(chain_node, "modulate:a", 0.0, 0.85).from(1.0)
	tw.tween_callback(chain_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_spiritual_weapon_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var weapon_node = Node2D.new()
	weapon_node.top_level = true
	weapon_node.global_position = target_pos + Vector2(0, -65)

	var hammer = Polygon2D.new()
	hammer.polygon = PackedVector2Array([
		Vector2(-14, -10), Vector2(14, -10), Vector2(14, 10), Vector2(-14, 10),
		Vector2(-3, 10), Vector2(-3, 35), Vector2(3, 35), Vector2(3, 10)
	])
	hammer.color = Color(0.6, 1.4, 2.2, 0.95)
	weapon_node.add_child(hammer)
	get_parent().add_child(weapon_node)

	var tw = create_tween()
	tw.tween_property(weapon_node, "rotation_degrees", 45.0, 0.22).from(-30.0)
	tw.parallel().tween_property(weapon_node, "global_position", target_pos, 0.22)
	await tw.finished

	weapon_node.queue_free()
	_spawn_spell_blast_vfx(target_pos, Color(0.6, 1.4, 2.2, 1.0))
	if AudioManager:
		AudioManager.play_sfx("spell_impact")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.3).timeout

func _spawn_burning_hands_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var cone_node = Node2D.new()
	cone_node.top_level = true
	cone_node.global_position = global_position

	var dir = global_position.direction_to(target_pos)
	if dir == Vector2.ZERO: dir = Vector2.RIGHT
	var base_angle = dir.angle()

	var fan = Polygon2D.new()
	var fan_pts: PackedVector2Array = [Vector2.ZERO]
	var count = 12
	var half_fov = deg_to_rad(30.0)
	for i in range(count + 1):
		var a = base_angle - half_fov + (float(i) / count) * (half_fov * 2.0)
		fan_pts.append(Vector2(cos(a), sin(a)) * 150.0)
	fan.polygon = fan_pts
	fan.color = Color(2.0, 0.6, 0.1, 0.8)
	cone_node.add_child(fan)

	for k in range(8):
		var ember = Polygon2D.new()
		ember.polygon = PackedVector2Array([Vector2(-3, -3), Vector2(3, -3), Vector2(3, 3), Vector2(-3, 3)])
		ember.color = Color(2.2, 0.9, 0.2, 1.0)
		var rand_a = base_angle + randf_range(-half_fov, half_fov)
		var rand_d = randf_range(30.0, 140.0)
		ember.position = Vector2(cos(rand_a), sin(rand_d)) * rand_d
		cone_node.add_child(ember)

	get_parent().add_child(cone_node)

	var tw = create_tween()
	tw.parallel().tween_property(cone_node, "scale", Vector2(1.15, 1.15), 0.35).from(Vector2(0.2, 0.2))
	tw.parallel().tween_property(cone_node, "modulate:a", 0.0, 0.50).from(1.0)
	tw.tween_callback(cone_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")
		AudioManager.play_sfx("spell_impact")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_thunderwave_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var wave_node = Node2D.new()
	wave_node.top_level = true
	wave_node.global_position = global_position

	var cube = Line2D.new()
	cube.width = 6.0
	cube.default_color = Color(0.4, 1.2, 2.0, 0.95)
	cube.points = PackedVector2Array([
		Vector2(-75, -75), Vector2(75, -75), Vector2(75, 75), Vector2(-75, 75), Vector2(-75, -75)
	])
	wave_node.add_child(cube)
	get_parent().add_child(wave_node)

	var tw = create_tween()
	tw.parallel().tween_property(wave_node, "scale", Vector2(1.3, 1.3), 0.30).from(Vector2(0.2, 0.2))
	tw.parallel().tween_property(wave_node, "modulate:a", 0.0, 0.45).from(1.0)
	tw.tween_callback(wave_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_impact")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.35).timeout

func _spawn_lightning_bolt_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var bolt_node = Node2D.new()
	bolt_node.top_level = true
	bolt_node.global_position = Vector2.ZERO

	var bolt_line = Line2D.new()
	bolt_line.width = 7.0
	bolt_line.default_color = Color(1.5, 1.8, 3.0, 1.0)
	var p_start = global_position
	var p_end = target_pos
	var vec = p_end - p_start
	var segs = 14
	var pts: PackedVector2Array = [p_start]
	for i in range(1, segs):
		var frac = float(i) / segs
		var mid = p_start.lerp(p_end, frac)
		var perp = Vector2(-vec.y, vec.x).normalized() * randf_range(-18.0, 18.0)
		pts.append(mid + perp)
	pts.append(p_end)
	bolt_line.points = pts
	bolt_node.add_child(bolt_line)
	get_parent().add_child(bolt_node)

	var tw = create_tween()
	tw.tween_property(bolt_node, "modulate:a", 0.0, 0.38).from(1.0)
	tw.tween_callback(bolt_node.queue_free)

	_spawn_spell_blast_vfx(target_pos, Color(1.2, 1.6, 2.5, 1.0))
	if AudioManager:
		AudioManager.play_sfx("spell_impact")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_haste_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var haste_node = Node2D.new()
	haste_node.top_level = true
	haste_node.global_position = target_pos

	for k in range(3):
		var streak = Line2D.new()
		streak.width = 3.0
		streak.default_color = Color(1.8, 1.5, 0.2, 0.9)
		var pts: PackedVector2Array = []
		var base_r = 24.0 + k * 8.0
		for i in range(12):
			var a = i * (PI * 1.5 / 12.0)
			pts.append(Vector2(cos(a), sin(a)) * base_r)
		streak.points = pts
		haste_node.add_child(streak)

	get_parent().add_child(haste_node)

	var tw = create_tween()
	tw.parallel().tween_property(haste_node, "rotation_degrees", 360.0, 0.50).from(0.0)
	tw.parallel().tween_property(haste_node, "modulate:a", 0.0, 0.55).from(1.0)
	tw.tween_callback(haste_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.35).timeout

func _spawn_counterspell_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var cs_node = Node2D.new()
	cs_node.top_level = true
	cs_node.global_position = target_pos

	for k in range(8):
		var shard = Line2D.new()
		shard.width = 4.0
		shard.default_color = Color(0.2, 0.8, 2.2, 1.0)
		var a = k * (PI * 2.0 / 8.0)
		shard.points = PackedVector2Array([Vector2.ZERO, Vector2(cos(a), sin(a)) * randf_range(25.0, 50.0)])
		cs_node.add_child(shard)

	get_parent().add_child(cs_node)

	var tw = create_tween()
	tw.parallel().tween_property(cs_node, "scale", Vector2(1.5, 1.5), 0.25).from(Vector2(0.5, 0.5))
	tw.parallel().tween_property(cs_node, "modulate:a", 0.0, 0.35).from(1.0)
	tw.tween_callback(cs_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_impact")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.35).timeout

func _spawn_dispel_magic_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var dispel_node = Node2D.new()
	dispel_node.top_level = true
	dispel_node.global_position = target_pos

	var colors = [Color(0.3, 0.9, 1.5, 0.9), Color(1.5, 0.4, 1.2, 0.9), Color(1.5, 1.4, 0.3, 0.9)]
	for k in range(3):
		var ring = Line2D.new()
		ring.width = 3.5
		ring.default_color = colors[k]
		var pts: PackedVector2Array = []
		for i in range(16):
			var a = i * (PI * 2.0 / 16.0)
			pts.append(Vector2(cos(a), sin(a)) * (18.0 + k * 12.0))
		pts.append(pts[0])
		ring.points = pts
		dispel_node.add_child(ring)

	get_parent().add_child(dispel_node)

	var tw = create_tween()
	tw.parallel().tween_property(dispel_node, "scale", Vector2(1.8, 1.8), 0.45).from(Vector2(0.4, 0.4))
	tw.parallel().tween_property(dispel_node, "modulate:a", 0.0, 0.55).from(1.0)
	tw.tween_callback(dispel_node.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_find_traps_vfx(center_pos: Vector2, on_impact: Callable) -> void:
	var vfx = Node2D.new()
	vfx.top_level = true
	vfx.global_position = center_pos
	for r_idx in range(3):
		var ring = Line2D.new()
		ring.width = 3.0
		ring.default_color = Color(1.2, 0.9, 0.2, 0.85)
		var pts: PackedVector2Array = []
		for i in range(24):
			var a = i * (PI * 2.0 / 24.0)
			pts.append(Vector2(cos(a), sin(a)) * 25.0)
		pts.append(pts[0])
		ring.points = pts
		vfx.add_child(ring)
		var r_tw = create_tween()
		r_tw.tween_property(ring, "scale", Vector2(7.0 + r_idx * 3.0, 7.0 + r_idx * 3.0), 0.70).set_delay(r_idx * 0.15)
		r_tw.parallel().tween_property(ring, "modulate:a", 0.0, 0.70).set_delay(r_idx * 0.15)
	get_parent().add_child(vfx)
	var tw = create_tween()
	tw.tween_interval(0.9)
	tw.tween_callback(vfx.queue_free)
	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_knock_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var vfx = Node2D.new()
	vfx.top_level = true
	vfx.global_position = target_pos
	for i in range(2):
		var ring = Line2D.new()
		ring.width = 4.0
		ring.default_color = Color(0.4, 0.9, 1.4, 0.9)
		var pts: PackedVector2Array = []
		for k in range(20):
			var a = k * (PI * 2.0 / 20.0)
			pts.append(Vector2(cos(a), sin(a)) * 20.0)
		pts.append(pts[0])
		ring.points = pts
		vfx.add_child(ring)
		var r_tw = create_tween()
		r_tw.tween_property(ring, "scale", Vector2(3.5, 3.5), 0.45).set_delay(i * 0.12)
		r_tw.parallel().tween_property(ring, "modulate:a", 0.0, 0.45).set_delay(i * 0.12)
	get_parent().add_child(vfx)
	var tw = create_tween()
	tw.tween_interval(0.6)
	tw.tween_callback(vfx.queue_free)
	if AudioManager:
		AudioManager.play_sfx("spell_impact")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.3).timeout

func _spawn_invisibility_vfx(center_pos: Vector2, on_impact: Callable) -> void:
	var vfx = Node2D.new()
	vfx.top_level = true
	vfx.global_position = center_pos
	for k in range(12):
		var spark = Polygon2D.new()
		spark.polygon = PackedVector2Array([Vector2(0, -6), Vector2(4, 0), Vector2(0, 6), Vector2(-4, 0)])
		spark.color = Color(0.6, 0.8, 1.4, 0.8)
		spark.position = Vector2(randf_range(-20, 20), randf_range(-30, 20))
		vfx.add_child(spark)
		var s_tw = create_tween()
		s_tw.parallel().tween_property(spark, "position:y", spark.position.y - 35.0, 0.6)
		s_tw.parallel().tween_property(spark, "modulate:a", 0.0, 0.6)
	get_parent().add_child(vfx)
	var tw = create_tween()
	tw.tween_interval(0.7)
	tw.tween_callback(vfx.queue_free)
	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.3).timeout

func _spawn_tremor_stomp_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var vfx = Node2D.new()
	vfx.top_level = true
	vfx.global_position = target_pos
	var ring = Line2D.new()
	ring.width = 5.0
	ring.default_color = Color(1.2, 0.8, 0.3, 0.9)
	var pts: PackedVector2Array = []
	for i in range(18):
		var a = i * (PI * 2.0 / 18.0)
		pts.append(Vector2(cos(a), sin(a)) * 25.0)
	pts.append(pts[0])
	ring.points = pts
	vfx.add_child(ring)
	for d in range(8):
		var debris = Polygon2D.new()
		debris.polygon = PackedVector2Array([Vector2(-4, -4), Vector2(4, -4), Vector2(4, 4), Vector2(-4, 4)])
		debris.color = Color(0.8, 0.6, 0.3, 0.9)
		debris.position = Vector2(randf_range(-15, 15), randf_range(-15, 15))
		vfx.add_child(debris)
		var d_tw = create_tween()
		var out_dir = (debris.position).normalized() * randf_range(30, 60)
		d_tw.parallel().tween_property(debris, "position", debris.position + out_dir, 0.5)
		d_tw.parallel().tween_property(debris, "modulate:a", 0.0, 0.5)
	get_parent().add_child(vfx)
	var tw = create_tween()
	tw.parallel().tween_property(ring, "scale", Vector2(3.0, 2.0), 0.5)
	tw.parallel().tween_property(ring, "modulate:a", 0.0, 0.5)
	tw.tween_callback(vfx.queue_free)
	if AudioManager:
		AudioManager.play_sfx("melee_crit")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.3).timeout

func _spawn_crushing_cleave_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var vfx = Node2D.new()
	vfx.top_level = true
	vfx.global_position = target_pos
	var arc = Line2D.new()
	arc.width = 6.0
	arc.default_color = Color(1.5, 0.3, 0.3, 0.95)
	var pts: PackedVector2Array = []
	for i in range(12):
		var a = -PI * 0.5 + i * (PI * 1.0 / 11.0)
		pts.append(Vector2(cos(a), sin(a)) * 45.0)
	arc.points = pts
	vfx.add_child(arc)
	get_parent().add_child(vfx)
	var tw = create_tween()
	tw.parallel().tween_property(arc, "scale", Vector2(1.6, 1.6), 0.35)
	tw.parallel().tween_property(arc, "modulate:a", 0.0, 0.35)
	tw.tween_callback(vfx.queue_free)
	if AudioManager:
		AudioManager.play_sfx("melee_crit")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.3).timeout

func _spawn_rallying_stomp_vfx(center_pos: Vector2, on_impact: Callable) -> void:
	var vfx = Node2D.new()
	vfx.top_level = true
	vfx.global_position = center_pos
	var ring = Line2D.new()
	ring.width = 4.0
	ring.default_color = Color(1.4, 1.1, 0.3, 0.9)
	var pts: PackedVector2Array = []
	for i in range(24):
		var a = i * (PI * 2.0 / 24.0)
		pts.append(Vector2(cos(a), sin(a)) * 30.0)
	pts.append(pts[0])
	ring.points = pts
	vfx.add_child(ring)
	for k in range(6):
		var cross = Line2D.new()
		cross.width = 3.0
		cross.default_color = Color(1.5, 1.3, 0.4, 0.9)
		cross.points = PackedVector2Array([Vector2(-6, 0), Vector2(6, 0)])
		var v_line = Line2D.new()
		v_line.width = 3.0
		v_line.default_color = Color(1.5, 1.3, 0.4, 0.9)
		v_line.points = PackedVector2Array([Vector2(0, -6), Vector2(0, 6)])
		cross.add_child(v_line)
		cross.position = Vector2(randf_range(-30, 30), randf_range(-20, 20))
		vfx.add_child(cross)
		var c_tw = create_tween()
		c_tw.parallel().tween_property(cross, "position:y", cross.position.y - 40.0, 0.6)
		c_tw.parallel().tween_property(cross, "modulate:a", 0.0, 0.6)
	get_parent().add_child(vfx)
	var tw = create_tween()
	tw.parallel().tween_property(ring, "scale", Vector2(3.5, 2.2), 0.6)
	tw.parallel().tween_property(ring, "modulate:a", 0.0, 0.6)
	tw.tween_callback(vfx.queue_free)
	if AudioManager:
		AudioManager.play_sfx("heal_cast")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func _spawn_blizzard_vfx(target_pos: Vector2, on_impact: Callable) -> void:
	var vfx = Node2D.new()
	vfx.top_level = true
	vfx.global_position = target_pos

	var ring = Line2D.new()
	ring.width = 4.0
	ring.default_color = Color(0.65, 0.9, 1.4, 0.9)
	var pts: PackedVector2Array = []
	for i in range(24):
		var a = i * (PI * 2.0 / 24.0)
		pts.append(Vector2(cos(a), sin(a)) * 140.0)
	pts.append(pts[0])
	ring.points = pts
	vfx.add_child(ring)

	for k in range(12):
		var shard = Polygon2D.new()
		shard.color = Color(0.8, 0.95, 1.5, 0.9)
		shard.polygon = PackedVector2Array([Vector2(-4, -14), Vector2(4, -14), Vector2(0, 14)])
		var rand_offset = Vector2(randf_range(-120, 120), randf_range(-80, 80))
		shard.position = rand_offset + Vector2(0, -180)
		vfx.add_child(shard)
		var s_tw = create_tween()
		s_tw.tween_property(shard, "position", rand_offset, 0.35 + (k * 0.03)).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		s_tw.parallel().tween_property(shard, "rotation_degrees", randf_range(-180, 180), 0.4)
		s_tw.tween_property(shard, "modulate:a", 0.0, 0.25)

	get_parent().add_child(vfx)

	var tw = create_tween()
	tw.parallel().tween_property(ring, "scale", Vector2(1.15, 1.15), 0.7)
	tw.parallel().tween_property(ring, "rotation_degrees", 90.0, 0.7)
	tw.parallel().tween_property(ring, "modulate:a", 0.0, 0.7)
	tw.tween_callback(vfx.queue_free)

	if AudioManager:
		AudioManager.play_sfx("spell_cast")
	await get_tree().create_timer(0.35).timeout
	if AudioManager:
		AudioManager.play_sfx("spell_impact")
	if on_impact.is_valid():
		on_impact.call()
	await get_tree().create_timer(0.4).timeout

func move_to(target_pos: Vector2) -> void:
	move_to_point(target_pos)

func move_to_point(target_pos: Vector2, on_reached: Callable = Callable(), queue: bool = false) -> void:
	if is_attacking: return
	if queue:
		queue_move_point(target_pos, on_reached)
		return

	clear_waypoints()
	var cur_scene = get_tree().current_scene
	var path = Pathfinder.get_nav_path(get_world_2d(), global_position, target_pos, cur_scene, [get_rid()])
	if path.is_empty():
		path = PackedVector2Array([target_pos])

	target_position = path[0]
	is_moving = true
	for k in range(1, path.size()):
		waypoint_queue.append(path[k])
		waypoint_callbacks.append(Callable())

	if waypoint_callbacks.is_empty():
		pending_callback = on_reached
	else:
		pending_callback = Callable()
		waypoint_callbacks[waypoint_callbacks.size() - 1] = on_reached

	stuck_timer = 0.0
	if reticle:
		reticle.global_position = target_pos
		reticle.visible = true
		reticle.modulate = Color(1.0, 0.9, 0.3, 1.0)
		reticle.scale = Vector2(0.55, 0.55)
		var tw = create_tween()
		tw.tween_property(reticle, "scale", Vector2(0.5, 0.5), 0.15).from(Vector2(0.3, 0.3))
	if path_visualizer:
		path_visualizer.queue_redraw()

func queue_move_point(target_pos: Vector2, on_reached: Callable = Callable()) -> void:
	if is_attacking: return
	if target_position == Vector2.ZERO:
		move_to_point(target_pos, on_reached)
		return

	var start_anchor = waypoint_queue.back() if waypoint_queue.size() > 0 else target_position
	var cur_scene = get_tree().current_scene
	var path = Pathfinder.get_nav_path(get_world_2d(), start_anchor, target_pos, cur_scene, [get_rid()])
	if path.is_empty():
		path = PackedVector2Array([target_pos])

	for k in range(path.size()):
		waypoint_queue.append(path[k])
		if k == path.size() - 1:
			waypoint_callbacks.append(on_reached)
		else:
			waypoint_callbacks.append(Callable())

	stuck_timer = 0.0
	if reticle:
		reticle.global_position = waypoint_queue.back()
		reticle.visible = true
		reticle.modulate = Color(0.2, 1.0, 0.5, 1.0)
	if path_visualizer:
		path_visualizer.queue_redraw()

func clear_waypoints() -> void:
	waypoint_queue.clear()
	waypoint_callbacks.clear()
	if path_visualizer:
		path_visualizer.queue_redraw()

func approach_and_interact(target_pos: Vector2, interact_range: float, on_reached: Callable) -> void:
	var dist = global_position.distance_to(target_pos)
	if dist <= interact_range:
		_stop_movement()
		_update_facing(target_pos)
		if on_reached.is_valid():
			on_reached.call()
	else:
		var dir = (global_position - target_pos).normalized()
		if dir == Vector2.ZERO: dir = Vector2(-1, 0)
		var dest = target_pos + dir * max(45.0, interact_range - 10.0)
		move_to_point(dest, func():
			_update_facing(target_pos)
			if on_reached.is_valid():
				on_reached.call()
		)

func _stop_movement() -> void:
	velocity = Vector2.ZERO
	target_position = Vector2.ZERO
	clear_waypoints()
	stuck_timer = 0.0
	is_moving = false
	if reticle and reticle.visible:
		var tw = create_tween()
		tw.parallel().tween_property(reticle, "scale", Vector2(0.75, 0.75), 0.2)
		tw.parallel().tween_property(reticle, "modulate:a", 0.0, 0.2)
		tw.tween_callback(func():
			if reticle:
				reticle.visible = false
				reticle.scale = Vector2(0.5, 0.5)
				reticle.modulate.a = 1.0
		)
	if path_visualizer:
		path_visualizer.queue_redraw()

func _update_facing(target_pos: Vector2) -> void:
	if target_pos.x < global_position.x - 5.0:
		sprite.flip_h = true
	elif target_pos.x > global_position.x + 5.0:
		sprite.flip_h = false

func pan_camera_by(offset: Vector2) -> void:
	camera_target_offset += offset
	_clamp_camera_offset()

func center_camera_on_hero() -> void:
	camera_target_offset = Vector2.ZERO
	simulated_pan_dir = Vector2.ZERO

func _clamp_camera_offset() -> void:
	var half_w = 640.0
	var half_h = 360.0
	var min_off_x = float(camera_limit_left) + half_w - global_position.x
	var max_off_x = float(camera_limit_right) - half_w - global_position.x
	var min_off_y = float(camera_limit_top) + half_h - global_position.y
	var max_off_y = float(camera_limit_bottom) - half_h - global_position.y
	camera_target_offset.x = clamp(camera_target_offset.x, min(min_off_x, max_off_x), max(min_off_x, max_off_x))
	camera_target_offset.y = clamp(camera_target_offset.y, min(min_off_y, max_off_y), max(min_off_y, max_off_y))

func _handle_camera_pan(delta: float) -> void:
	if not camera:
		return

	var pan_dir = simulated_pan_dir
	if Input.is_key_pressed(KEY_LEFT) or Input.is_action_pressed("ui_left"):
		pan_dir.x -= 1.0
	if Input.is_key_pressed(KEY_RIGHT) or Input.is_action_pressed("ui_right"):
		pan_dir.x += 1.0
	if Input.is_key_pressed(KEY_UP) or Input.is_action_pressed("ui_up"):
		pan_dir.y -= 1.0
	if Input.is_key_pressed(KEY_DOWN) or Input.is_action_pressed("ui_down"):
		pan_dir.y += 1.0

	if pan_dir != Vector2.ZERO:
		camera_target_offset += pan_dir.normalized() * (camera_pan_speed * delta)
		_clamp_camera_offset()

	# Hotkey 'Home' to recenter camera on hero / active leader
	if Input.is_key_pressed(KEY_HOME):
		center_camera_on_hero()

	var leader = GameState.get_leader_node()
	var leader_rel = Vector2.ZERO
	if leader and is_instance_valid(leader) and leader != self:
		leader_rel = leader.global_position - global_position

	camera_current_offset = camera_current_offset.lerp(camera_target_offset + leader_rel, min(1.0, 10.0 * delta))
	camera.offset = camera_current_offset

func is_party_leader() -> bool:
	return GameState.party_leader_index == 0

func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey:
		match event.keycode:
			KEY_LEFT:
				simulated_pan_dir.x = -1.0 if event.pressed else 0.0
			KEY_RIGHT:
				simulated_pan_dir.x = 1.0 if event.pressed else 0.0
			KEY_UP:
				simulated_pan_dir.y = -1.0 if event.pressed else 0.0
			KEY_DOWN:
				simulated_pan_dir.y = 1.0 if event.pressed else 0.0
			KEY_C, KEY_R:
				if event.pressed and not event.echo:
					var cur_sc = get_tree().current_scene
					if cur_sc:
						var hud = cur_sc.find_child("PartyHUD", true, false)
						if hud and hud.has_method("toggle_character_status"):
							hud.toggle_character_status()
			KEY_HOME:
				if event.pressed:
					center_camera_on_hero()
			KEY_SPACE:
				if event.pressed and not event.echo:
					GameState.toggle_pause()
			KEY_1:
				if event.pressed:
					GameState.select_party_member(0)
			KEY_2:
				if event.pressed:
					GameState.select_party_member(1)
			KEY_3:
				if event.pressed:
					GameState.select_party_member(2)
			KEY_BACKSLASH, KEY_EQUAL:
				if event.pressed:
					GameState.select_all_party_members()

func _unhandled_input(event: InputEvent) -> void:
	if is_attacking: return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			var click_pos = get_global_mouse_position()
			var is_shift = event.shift_pressed or Input.is_key_pressed(KEY_SHIFT)
			GameState.move_party_formation(click_pos, is_shift)

func _physics_process(delta: float) -> void:
	_handle_camera_pan(delta)

	if GameState.is_game_paused:
		velocity = Vector2.ZERO
		is_moving = false
		return

	if is_down_prone or is_prone():
		if not is_down_prone:
			knock_down_prone()
		velocity = Vector2.ZERO
		is_moving = false
		return
	elif not is_prone() and is_down_prone:
		stand_up_from_prone()

	if is_attacking:
		velocity = Vector2.ZERO
		is_moving = false
		return

	is_moving = (target_position != Vector2.ZERO or waypoint_queue.size() > 0)

	# Direct character movement via WASD (Arrow keys are reserved for Infinity Engine camera panning)
	var move_input = Vector2.ZERO
	if Input.is_key_pressed(KEY_A):
		move_input.x -= 1.0
	if Input.is_key_pressed(KEY_D):
		move_input.x += 1.0
	if Input.is_key_pressed(KEY_W):
		move_input.y -= 1.0
	if Input.is_key_pressed(KEY_S):
		move_input.y += 1.0

	if move_input != Vector2.ZERO:
		_stop_movement()
		pending_callback = Callable()
		velocity = move_input.normalized() * move_speed
		move_and_slide()
	elif target_position != Vector2.ZERO:
		var dist = global_position.distance_to(target_position)
		if dist > 18.0:
			velocity = global_position.direction_to(target_position) * move_speed
			move_and_slide()

			if get_slide_collision_count() > 0:
				if get_real_velocity().length() < 15.0:
					stuck_timer += delta
					if stuck_timer > 0.3:
						if waypoint_queue.size() > 0:
							if path_visualizer and path_visualizer.has_method("spawn_arrival_burst"):
								path_visualizer.spawn_arrival_burst(target_position, Color(0.2, 0.9, 1.0, 0.9))
							target_position = waypoint_queue.pop_front()
							if waypoint_callbacks.size() > 0:
								var cb = waypoint_callbacks.pop_front()
								if cb.is_valid():
									cb.call()
							stuck_timer = 0.0
							if reticle:
								reticle.global_position = target_position if waypoint_queue.is_empty() else waypoint_queue.back()
						else:
							var cb = pending_callback
							_stop_movement()
							if cb.is_valid():
								cb.call()
				else:
					stuck_timer = 0.0
			else:
				stuck_timer = 0.0
		else:
			# Reached current waypoint
			if path_visualizer and path_visualizer.has_method("spawn_arrival_burst"):
				path_visualizer.spawn_arrival_burst(target_position, Color(0.2, 1.0, 0.5, 0.95))

			var cb = pending_callback
			pending_callback = Callable()
			if cb.is_valid():
				cb.call()

			if waypoint_queue.size() > 0:
				target_position = waypoint_queue.pop_front()
				if waypoint_callbacks.size() > 0:
					pending_callback = waypoint_callbacks.pop_front()
				stuck_timer = 0.0
				if reticle:
					reticle.global_position = target_position if waypoint_queue.is_empty() else waypoint_queue.back()
			else:
				_stop_movement()
	elif not is_party_leader() and not (get_tree().current_scene is TacticalBattle):
		var leader = GameState.get_leader_node()
		if leader and is_instance_valid(leader) and leader != self:
			var leader_dir = leader.velocity.normalized() if leader.get("velocity") != null and leader.velocity.length() > 5.0 else Vector2(0, -1)
			var offsets = GameState.get_formation_offsets(GameState.current_formation, GameState.party_members.size(), leader_dir)
			var slot = 1
			var desired_pos = leader.global_position + (offsets[slot] if slot < offsets.size() else Vector2(-48, 24))
			var dist = global_position.distance_to(desired_pos)
			if dist > 65.0:
				var dir = (desired_pos - global_position).normalized()
				velocity = dir * move_speed
				move_and_slide()
			else:
				velocity = Vector2.ZERO
		else:
			velocity = Vector2.ZERO
	else:
		velocity = Vector2.ZERO

	# Sprite facing based on velocity
	if velocity.x < -10.0:
		sprite.flip_h = true
	elif velocity.x > 10.0:
		sprite.flip_h = false

	# Step animations
	anim_timer += delta
	if velocity.length() > 10.0:
		if anim_timer >= 0.15:
			anim_timer = 0.0
			anim_frame = (anim_frame + 1) % max(1, walk_textures.size())
			if anim_frame < walk_textures.size():
				sprite.texture = walk_textures[anim_frame]
	else:
		if anim_timer >= 0.35:
			anim_timer = 0.0
			anim_frame = (anim_frame + 1) % max(1, idle_textures.size())
			if anim_frame < idle_textures.size():
				sprite.texture = idle_textures[anim_frame]

	# Reticle continuous pulse and rotation while target is active
	if reticle and reticle.visible and (target_position != Vector2.ZERO or waypoint_queue.size() > 0):
		reticle.rotation += delta * 2.2
		var pulse = sin(Time.get_ticks_msec() * 0.007) * 0.05
		reticle.scale = Vector2(0.5 + pulse, 0.5 + pulse)

