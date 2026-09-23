class_name PartyCompanion
extends CharacterBody2D

const Pathfinder = preload("res://scripts/Pathfinder.gd")

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
	_on_selection_changed(GameState.selected_party_indices)
	_find_follow_target()

func _find_follow_target() -> void:
	var cur_sc = get_tree().current_scene
	if cur_sc:
		follow_target = cur_sc.find_child("HeroPlayer", true, false)

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
	var m = _get_member_data()
	var cur_hp = int(m.get("hp", 10))
	if cur_hp <= 0 or GameState.has_status_effect(companion_name, "unconscious"):
		sprite.rotation_degrees = 90.0
		sprite.modulate = Color(0.7, 0.2, 0.2, 0.85)
	else:
		sprite.rotation_degrees = 0.0
		sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)

func play_hit_reaction() -> void:
	var tw = create_tween()
	tw.tween_property(sprite, "modulate", Color(2.0, 0.4, 0.4, 1.0), 0.08)
	tw.tween_property(sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.15)

func _on_selection_changed(indices: Array) -> void:
	var is_selected = indices.has(1)
	if selection_circle:
		selection_circle.visible = is_selected

func is_companion_selected() -> bool:
	return GameState.selected_party_indices.has(1)

func _physics_process(delta: float) -> void:
	if GameState.is_game_paused:
		return

	if GameState.is_incapacitated(companion_name):
		return

	# If manually moving to a targeted position
	if is_moving:
		var dist = global_position.distance_to(target_position)
		if dist > 8.0:
			var dir = (target_position - global_position).normalized()
			velocity = dir * move_speed
			sprite.flip_h = (dir.x < 0)
			move_and_slide()
			_animate_walk(delta)
		else:
			is_moving = false
			velocity = Vector2.ZERO
			_animate_idle(delta)
			if pending_interact_callback.is_valid():
				var cb = pending_interact_callback
				pending_interact_callback = Callable()
				cb.call()
	elif follow_target and is_instance_valid(follow_target):
		# Follow Hero in formation if companion is part of the party
		var desired_pos = follow_target.global_position + formation_offset
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

func move_to(dest: Vector2) -> void:
	target_position = dest
	is_moving = true

func _stop_movement() -> void:
	is_moving = false
	velocity = Vector2.ZERO
	target_position = Vector2.ZERO
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
		if dir == Vector2.ZERO: dir = Vector2(0, 1)
		var dest = target_pos + dir * max(10.0, interact_range - 15.0)
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

func attack_target(target_node: Node2D) -> void:
	if not target_node or not is_instance_valid(target_node):
		return
	is_attacking = true
	# Face target
	sprite.flip_h = (target_node.global_position.x < global_position.x)
	
	# Fire arrow visual projectile towards target
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
		if target_node.has_method("take_damage"):
			target_node.take_damage(randi_range(12, 16), self)
		is_attacking = false
	)
