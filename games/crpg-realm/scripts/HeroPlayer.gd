extends CharacterBody2D
class_name HeroPlayer

const Pathfinder = preload("res://scripts/Pathfinder.gd")

signal attack_finished(target_node: Node2D)

@export var move_speed: float = 220.0

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

func _ready() -> void:
	if GameState.spawn_position != Vector2.ZERO:
		global_position = GameState.spawn_position
		GameState.spawn_position = Vector2.ZERO
	_load_textures()
	_update_overhead_ui()
	GameState.hero_damaged.connect(_on_hero_damaged)
	GameState.settings_changed.connect(_update_overhead_ui)
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
	else:
		sprite.rotation_degrees = 0.0
		sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)

func play_hit_reaction() -> void:
	var tw = create_tween()
	tw.tween_property(sprite, "modulate", Color(2.0, 0.4, 0.4, 1.0), 0.08)
	tw.tween_property(sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.15)

func play_attack(target_pos: Vector2, on_hit_callback: Callable = Callable(), target_node: Node2D = null) -> void:
	if is_attacking:
		return
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
	if is_attacking:
		return
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

func move_to(target_pos: Vector2) -> void:
	move_to_point(target_pos)

func move_to_point(target_pos: Vector2, on_reached: Callable = Callable(), queue: bool = false) -> void:
	if is_attacking: return
	if queue:
		queue_move_point(target_pos, on_reached)
		return

	if GameState.selected_party_indices.size() == 1 and GameState.selected_party_indices[0] == 1:
		var cur_sc = get_tree().current_scene
		if cur_sc:
			var comp = cur_sc.find_child("PartyCompanion", true, false)
			if comp and comp.has_method("move_to"):
				comp.move_to(target_pos)
				return

	if GameState.selected_party_indices.has(1):
		var cur_sc = get_tree().current_scene
		if cur_sc:
			var comp = cur_sc.find_child("PartyCompanion", true, false)
			if comp and comp.has_method("move_to"):
				comp.move_to(target_pos + Vector2(-48, 24))

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

	# Hotkey 'Home' to recenter camera on hero
	if Input.is_key_pressed(KEY_HOME):
		center_camera_on_hero()

	camera_current_offset = camera_current_offset.lerp(camera_target_offset, min(1.0, 10.0 * delta))
	camera.offset = camera_current_offset

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
			if is_shift:
				queue_move_point(click_pos)
			else:
				move_to_point(click_pos)

func _physics_process(delta: float) -> void:
	_handle_camera_pan(delta)

	if GameState.is_game_paused:
		velocity = Vector2.ZERO
		is_moving = false
		return

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

