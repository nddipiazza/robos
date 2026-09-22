extends CharacterBody2D
class_name ShadowHound

signal hound_slain
signal body_clicked

@export var max_hp: int = 24
@export var armor_class: int = 12
@export var move_speed: float = 140.0

@onready var sprite: Sprite2D = $Sprite
@onready var hp_bar: ProgressBar = $OverheadUI/HPBar
@onready var hp_text: Label = get_node_or_null("OverheadUI/HPText")
@onready var selection_circle: Sprite2D = find_child("SelectionCircle", true, false)

enum State { PATROL, CHASE, ATTACK, DEAD }
var current_state: State = State.PATROL

var current_hp: int = 24
@export var waypoints: Array[Vector2] = [Vector2(1780, 830), Vector2(1920, 800)]
var current_wp_idx: int = 0
var wait_timer: float = 0.0

var walk_textures: Array[Texture2D] = []
var attack_textures: Array[Texture2D] = []
var anim_timer: float = 0.0
var anim_frame: int = 0
var attack_cooldown: float = 0.0

var hero_target: Node2D = null

func _ready() -> void:
	current_hp = max_hp
	if hp_bar:
		hp_bar.max_value = max_hp
		hp_bar.value = current_hp
	
	_load_textures()
	_update_health_bar_visibility()
	GameState.settings_changed.connect(_update_health_bar_visibility)

func _load_textures() -> void:
	for i in range(4):
		var p_walk = "res://assets/sprites/characters/shadow_hound_walk_%d.png" % i
		if ResourceLoader.exists(p_walk):
			walk_textures.append(load(p_walk))
		var p_atk = "res://assets/sprites/characters/shadow_hound_attack_%d.png" % i
		if ResourceLoader.exists(p_atk):
			attack_textures.append(load(p_atk))

func _update_health_bar_visibility() -> void:
	if not hp_bar: return
	if hp_text:
		hp_text.text = "%d/%d" % [current_hp, max_hp]
	var mode = GameState.settings.get("health_bar_mode", "always")
	var is_visible = true
	match mode:
		"always":
			is_visible = true
		"injured_only":
			is_visible = (current_hp < max_hp)
		"none":
			is_visible = false
		_:
			is_visible = true
	hp_bar.visible = is_visible
	if hp_text:
		hp_text.visible = is_visible

func _physics_process(delta: float) -> void:
	if current_state == State.DEAD or GameState.is_game_paused:
		velocity = Vector2.ZERO
		return
	
	if not hero_target:
		hero_target = get_tree().get_first_node_in_group("player")
		if not hero_target:
			hero_target = get_parent().find_child("HeroPlayer", true, false)

	# Proximity Aggro Check (180px awareness radius)
	if hero_target and current_state == State.PATROL:
		var dist = global_position.distance_to(hero_target.global_position)
		if dist < 190.0:
			current_state = State.CHASE
			GameState.log_message("combat", "Corrupted Shadow Hound snarls and leaps forward to attack!")

	match current_state:
		State.PATROL:
			_process_patrol(delta)
		State.CHASE:
			_process_chase(delta)
		State.ATTACK:
			_process_attack(delta)

	if velocity.x < -5.0:
		sprite.flip_h = false
	elif velocity.x > 5.0:
		sprite.flip_h = true

	# Step animations
	anim_timer += delta
	if velocity.length() > 5.0 and walk_textures.size() > 0:
		if anim_timer >= 0.16:
			anim_timer = 0.0
			anim_frame = (anim_frame + 1) % walk_textures.size()
			sprite.texture = walk_textures[anim_frame]

func _process_patrol(delta: float) -> void:
	if waypoints.size() == 0: return
	if wait_timer > 0.0:
		wait_timer -= delta
		velocity = Vector2.ZERO
		return

	var dest = waypoints[current_wp_idx]
	var dist = global_position.distance_to(dest)
	if dist > 10.0:
		velocity = global_position.direction_to(dest) * (move_speed * 0.6)
		move_and_slide()
	else:
		velocity = Vector2.ZERO
		wait_timer = randf_range(1.5, 3.0)
		current_wp_idx = (current_wp_idx + 1) % waypoints.size()

func _process_chase(_delta: float) -> void:
	if not hero_target: return
	var dist = global_position.distance_to(hero_target.global_position)
	if dist <= 50.0:
		velocity = Vector2.ZERO
		current_state = State.ATTACK
		attack_cooldown = 0.5
	else:
		velocity = global_position.direction_to(hero_target.global_position) * move_speed
		move_and_slide()

func _process_attack(delta: float) -> void:
	velocity = Vector2.ZERO
	attack_cooldown -= delta
	if attack_cooldown <= 0.0:
		attack_cooldown = 3.6
		_perform_attack_strike()

func _perform_attack_strike() -> void:
	if current_state == State.DEAD or not hero_target or GameState.is_game_paused: return
	
	# Play attack frames with deliberate 2x pacing
	for i in range(attack_textures.size()):
		if GameState.is_game_paused: break
		sprite.texture = attack_textures[i]
		if i == 1 and hero_target.has_method("play_hit_reaction"):
			hero_target.play_hit_reaction()
		await get_tree().create_timer(0.18).timeout
	
	if walk_textures.size() > 0:
		sprite.texture = walk_textures[0]

func take_damage(amount: int) -> void:
	if current_state == State.DEAD: return
	current_hp = max(0, current_hp - amount)
	if hp_bar:
		hp_bar.value = current_hp
	_update_health_bar_visibility()
	
	FloatingTextManager.spawn_damage(global_position, amount)
	
	# Hit flash
	var tw = create_tween()
	tw.tween_property(sprite, "modulate", Color(2.0, 0.3, 0.3, 1.0), 0.12)
	tw.tween_property(sprite, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.22)
	
	if current_hp <= 0:
		die()

func die() -> void:
	current_state = State.DEAD
	velocity = Vector2.ZERO
	GameState.log_message("damage", "Corrupted Shadow Hound collapses in defeat!")
	if hp_bar:
		hp_bar.visible = false
	if hp_text:
		hp_text.visible = false
	if selection_circle:
		selection_circle.visible = false
	hound_slain.emit()
	
	var tw = create_tween()
	tw.parallel().tween_property(sprite, "rotation_degrees", 85.0, 0.35)
	tw.parallel().tween_property(sprite, "modulate", Color(0.55, 0.45, 0.45, 0.85), 0.35)
	if has_node("CollisionShape2D"):
		get_node("CollisionShape2D").set_deferred("disabled", true)

func _input_event(_viewport: Node, event: InputEvent, _shape_idx: int) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		body_clicked.emit()
