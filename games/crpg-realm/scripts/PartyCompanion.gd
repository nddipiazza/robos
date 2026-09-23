class_name PartyCompanion
extends CharacterBody2D

const Pathfinder = preload("res://scripts/Pathfinder.gd")

signal attack_finished(target_node: Node2D)

@export var companion_id: String = "elora"
@export var companion_name: String = "Elora"
@export var move_speed: float = 215.0

@onready var sprite: Sprite2D = $Sprite
@onready var name_label: Label = find_child("NameLabel", true, false)
@onready var hp_bar: ProgressBar = find_child("HPBar", true, false)
@onready var hp_text: Label = find_child("HPText", true, false)
@onready var selection_circle: Sprite2D = find_child("SelectionCircle", true, false)

var target_position: Vector2 = Vector2.ZERO
var is_moving: bool = false
var is_attacking: bool = false
var is_performing_action: bool = false
var stuck_timer: float = 0.0
var follow_target: Node2D = null
var formation_offset: Vector2 = Vector2(-48.0, 32.0)

var idle_textures: Array[Texture2D] = []
var walk_textures: Array[Texture2D] = []
var anim_timer: float = 0.0
var anim_frame: int = 0

# Queued action during pause
var queued_action: Dictionary = {}
var pending_interact_callback: Callable = Callable()

func _ready() -> void:
	_load_textures()
	_update_overhead_ui()
	GameState.party_changed.connect(_on_party_changed)
	GameState.party_selection_changed.connect(_on_selection_changed)
	GameState.status_effects_changed.connect(func(_tgt): _update_invisibility_visual())
	_update_invisibility_visual()
	_on_selection_changed(GameState.selected_party_indices)
	_find_follow_target()

func _find_follow_target() -> void:
	var cur_sc = get_tree().current_scene
	if cur_sc:
		follow_target = cur_sc.find_child("HeroPlayer", true, false)
		if follow_target and is_instance_valid(follow_target):
			add_collision_exception_with(follow_target)
			follow_target.add_collision_exception_with(self)
		for child in cur_sc.get_children():
			if child is PartyCompanion and child != self and is_instance_valid(child):
				add_collision_exception_with(child)
				child.add_collision_exception_with(self)

func _load_textures() -> void:
	for i in range(4):
		var p_idle = "res://assets/sprites/characters/elora_npc_%d.png" % i
		if ResourceLoader.exists(p_idle):
			idle_textures.append(load(p_idle))
		var p_walk = "res://assets/sprites/characters/elora_npc_walk_%d.png" % i
		if ResourceLoader.exists(p_walk):
			walk_textures.append(load(p_walk))
	if idle_textures.size() > 0:
		sprite.texture = idle_textures[0]

func _update_overhead_ui() -> void:
	var m = _get_member_data()
	if name_label:
		name_label.text = companion_name
	if hp_bar:
		hp_bar.max_value = m.get("max_hp", 10)
		hp_bar.value = m.get("hp", 10)
	if hp_text:
		hp_text.text = "%d/%d" % [m.get("hp", 10), m.get("max_hp", 10)]

func _get_member_data() -> Dictionary:
	for m in GameState.party_members:
		if m.get("id") == companion_id or m.get("name") == companion_name:
			return m
	return {"hp": 10, "max_hp": 10, "ac": 14}

func _on_party_changed() -> void:
	_update_overhead_ui()
	_update_invisibility_visual()

func _update_invisibility_visual() -> void:
	if not sprite:
		return
	if GameState.is_invisible(companion_name):
		sprite.modulate = Color(1.0, 1.0, 1.0, 0.35)
	else:
		if sprite.modulate.a < 0.9:
			sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)
	var m = _get_member_data()
	var cur_hp = int(m.get("hp", 10))
	if cur_hp <= 0 or GameState.has_status_effect(companion_name, "unconscious"):
		sprite.rotation_degrees = 90.0
		sprite.modulate = Color(0.7, 0.2, 0.2, 0.85)
	elif GameState.has_status_effect(companion_name, "prone"):
		sprite.rotation_degrees = 90.0
	else:
		sprite.rotation_degrees = 0.0
		if sprite.modulate.a >= 0.9:
			sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)

func play_hit_reaction() -> void:
	var tw = create_tween()
	tw.tween_property(sprite, "modulate", Color(2.0, 0.4, 0.4, 1.0), 0.08)
	tw.tween_property(sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.15)

func get_party_index() -> int:
	for i in range(GameState.party_members.size()):
		var m = GameState.party_members[i]
		if m.get("id") == companion_id or m.get("name") == companion_name:
			return i
	return 1

func _on_selection_changed(indices: Array) -> void:
	var is_selected = indices.has(get_party_index())
	if selection_circle:
		selection_circle.visible = is_selected

func is_party_leader() -> bool:
	return GameState.party_leader_index == get_party_index()

func get_formation_rank_slot() -> int:
	if is_party_leader():
		return 0
	var p_idx = get_party_index()
	var slot = 1
	for i in range(GameState.party_members.size()):
		if i == GameState.party_leader_index:
			continue
		if i == p_idx:
			return slot
		slot += 1
	return 1

func _physics_process(delta: float) -> void:
	if GameState.is_game_paused:
		return

	if GameState.is_incapacitated(companion_name) or GameState.has_status_effect(companion_name, "prone"):
		velocity = Vector2.ZERO
		return

	if is_performing_action or is_attacking:
		velocity = Vector2.ZERO
		return

	# If manually moving to a targeted position
	if is_moving:
		var dist = global_position.distance_to(target_position)
		var arrived = dist <= 24.0
		if not arrived:
			var dir = (target_position - global_position).normalized()
			velocity = dir * move_speed
			sprite.flip_h = (dir.x < 0)
			move_and_slide()
			_animate_walk(delta)
			if get_slide_collision_count() > 0:
				var col = get_slide_collision(0)
				var cur_vel = get_real_velocity()
				if cur_vel.length() < 25.0 and col:
					var norm = col.get_normal()
					var tangent = Vector2(-norm.y, norm.x)
					if tangent.dot(dir) < 0:
						tangent = -tangent
					velocity = (dir + tangent * 1.6).normalized() * move_speed
					move_and_slide()
					stuck_timer += delta
					if stuck_timer > 3.0 and dist <= 65.0:
						stuck_timer = 0.0
						arrived = true
				else:
					stuck_timer = 0.0
			else:
				stuck_timer = 0.0

		if arrived:
			is_moving = false
			velocity = Vector2.ZERO
			stuck_timer = 0.0
			_animate_idle(delta)
			if pending_interact_callback.is_valid():
				var cb = pending_interact_callback
				pending_interact_callback = Callable()
				cb.call()
	elif not is_party_leader() and not (get_tree().current_scene is TacticalBattle):
		var leader = GameState.get_leader_node()
		if leader and is_instance_valid(leader) and leader != self:
			var leader_dir = leader.velocity.normalized() if leader.get("velocity") != null and leader.velocity.length() > 5.0 else Vector2(0, -1)
			var offsets = GameState.get_formation_offsets(GameState.current_formation, GameState.party_members.size(), leader_dir)
			var slot = get_formation_rank_slot()
			var slot_off = offsets[slot] if slot < offsets.size() else formation_offset
			var desired_pos = leader.global_position + slot_off
			var dist = global_position.distance_to(desired_pos)
			if dist > 65.0:
				var dir = (desired_pos - global_position).normalized()
				velocity = dir * move_speed
				sprite.flip_h = (dir.x < 0)
				move_and_slide()
				_animate_walk(delta)
			else:
				velocity = Vector2.ZERO
				_animate_idle(delta)
		else:
			velocity = Vector2.ZERO
			_animate_idle(delta)
	else:
		velocity = Vector2.ZERO
		_animate_idle(delta)

func move_to(dest: Vector2) -> void:
	target_position = dest
	is_moving = true

func move_to_point(dest: Vector2, on_reached: Callable = Callable(), queue: bool = false) -> void:
	if queue:
		queue_move_point(dest, on_reached)
		return
	target_position = dest
	is_moving = true
	pending_interact_callback = on_reached

func queue_move_point(dest: Vector2, on_reached: Callable = Callable()) -> void:
	if not is_moving or target_position == Vector2.ZERO:
		move_to_point(dest, on_reached)
	else:
		var prev_cb = pending_interact_callback
		pending_interact_callback = func():
			if prev_cb.is_valid():
				prev_cb.call()
			move_to_point(dest, on_reached)

func _stop_movement() -> void:
	is_moving = false
	velocity = Vector2.ZERO
	target_position = Vector2.ZERO
	stuck_timer = 0.0
	pending_interact_callback = Callable()

func approach_and_interact(target_pos: Vector2, interact_range: float, on_reached: Callable) -> void:
	var dist = global_position.distance_to(target_pos)
	if dist <= interact_range:
		is_moving = false
		velocity = Vector2.ZERO
		sprite.flip_h = (target_pos.x < global_position.x)
		if on_reached.is_valid():
			on_reached.call()
	else:
		var dir = (global_position - target_pos).normalized()
		if dir == Vector2.ZERO: dir = Vector2(-1, 0)
		var dest = target_pos + dir * max(45.0, interact_range - 10.0)
		pending_interact_callback = func():
			sprite.flip_h = (target_pos.x < global_position.x)
			if on_reached.is_valid():
				on_reached.call()
		move_to(dest)

func _animate_walk(delta: float) -> void:
	if walk_textures.size() == 0:
		return
	anim_timer += delta
	if anim_timer >= 0.18:
		anim_timer = 0.0
		anim_frame = (anim_frame + 1) % walk_textures.size()
		sprite.texture = walk_textures[anim_frame]

func _animate_idle(delta: float) -> void:
	if idle_textures.size() == 0:
		return
	anim_timer += delta
	if anim_timer >= 0.40:
		anim_timer = 0.0
		anim_frame = (anim_frame + 1) % idle_textures.size()
		sprite.texture = idle_textures[anim_frame]

func attack_target(target_node: Node2D, on_hit_callback: Callable = Callable()) -> void:
	if not target_node or not is_instance_valid(target_node):
		return

	var m_data = _get_member_data()
	var weapon = str(m_data.get("weapon", "hunting-bow"))
	var is_melee = (weapon != "hunting-bow" and weapon != "shortbow" and weapon != "longbow" and weapon != "light-crossbow" and weapon != "heavy-crossbow")

	if is_melee:
		approach_and_interact(target_node.global_position, 60.0, func():
			_execute_melee_strike(target_node, on_hit_callback)
		)
	else:
		_execute_ranged_strike(target_node, on_hit_callback)

func _execute_melee_strike(target_node: Node2D, on_hit_callback: Callable = Callable()) -> void:
	if not target_node or not is_instance_valid(target_node):
		return
	is_attacking = true
	sprite.flip_h = (target_node.global_position.x < global_position.x)

	var orig_pos = sprite.position
	var lunge_dir = global_position.direction_to(target_node.global_position)
	var tw = create_tween()
	tw.tween_property(sprite, "position", orig_pos + lunge_dir * 16.0, 0.14)
	tw.tween_property(sprite, "position", orig_pos, 0.18)

	if AudioManager:
		AudioManager.play_sfx("melee_swing")

	await tw.finished

	if AudioManager:
		AudioManager.play_sfx("melee_hit")

	_spawn_slash_vfx(target_node.global_position)

	if on_hit_callback.is_valid():
		on_hit_callback.call()
	elif target_node.has_method("take_damage"):
		var dmg = randi_range(16, 24)
		target_node.take_damage(dmg, self)

	is_attacking = false
	attack_finished.emit(target_node)

func _execute_ranged_strike(target_node: Node2D, on_hit_callback: Callable = Callable()) -> void:
	is_attacking = true
	sprite.flip_h = (target_node.global_position.x < global_position.x)

	var arrow = Sprite2D.new()
	arrow.texture = load("res://assets/props/arrow.png") if ResourceLoader.exists("res://assets/props/arrow.png") else load("res://assets/props/selection_circle_blue.png")
	arrow.global_position = global_position + Vector2(0, -12)
	arrow.z_index = 85
	arrow.look_at(target_node.global_position)
	get_parent().add_child(arrow)

	var tw = arrow.create_tween()
	tw.tween_property(arrow, "global_position", target_node.global_position + Vector2(0, -10), 0.35).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func():
		arrow.queue_free()
		if on_hit_callback.is_valid():
			on_hit_callback.call()
		elif target_node.has_method("take_damage"):
			target_node.take_damage(randi_range(12, 16), self)
		is_attacking = false
		attack_finished.emit(target_node)
	)

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
	tw.parallel().tween_property(slash_node, "scale", Vector2(0.85, 0.85), 0.35)
	tw.parallel().tween_property(slash_node, "modulate:a", 0.0, 0.35)
	tw.tween_callback(slash_node.queue_free)
