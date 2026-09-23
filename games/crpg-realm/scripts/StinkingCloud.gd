class_name StinkingCloud
extends Area2D

# StinkingCloud.gd — Volumetric Toxic Mist Hazard Component for Godot 4
# Created by Stinking Cloud spell (3rd Level Conjuration).
# - Uses soft, volumetric billowing mist puffs and gas particles (ZERO hard circles or outlines)
# - When characters (Hero, Companions, Enemies) enter or traverse the toxic vapors,
#   they fail a CON save against nausea, collapse flat on the ground retching (Prone),
#   and remain incapacitated for 1 turn before standing back upright.

signal actor_nauseated(actor: Node2D)

@export var cloud_name: String = "Stinking Cloud"
@export var radius: float = 140.0:
	set(val):
		radius = val
		_rebuild_mist()
@export var duration_seconds: float = 35.0
@export var save_dc: int = 14

var elapsed_time: float = 0.0
var cooldowns: Dictionary = {}
var puff_nodes: Array[Node2D] = []

@onready var status_label: Label = get_node_or_null("StatusLabel")
@onready var collision_shape: CollisionShape2D = get_node_or_null("CollisionShape2D")
@onready var particles: CPUParticles2D = get_node_or_null("MistParticles")

func _ready() -> void:
	collision_layer = 1
	collision_mask = 1
	body_entered.connect(_on_body_entered)
	_rebuild_mist()
	_start_mist_undulation()

func _rebuild_mist() -> void:
	# Clear old puffs
	for p in puff_nodes:
		if is_instance_valid(p):
			p.queue_free()
	puff_nodes.clear()

	# Organic cluster of 12 overlapping, soft-edged volumetric mist puffs (NO hard circle outline)
	var puff_colors = [
		Color(0.78, 0.88, 0.22, 0.32),
		Color(0.70, 0.84, 0.18, 0.36),
		Color(0.84, 0.92, 0.28, 0.28),
		Color(0.60, 0.78, 0.15, 0.35),
		Color(0.82, 0.89, 0.35, 0.25)
	]

	var puff_offsets = [
		Vector2(0, 0),
		Vector2(-45, -30), Vector2(40, -35), Vector2(-50, 25), Vector2(45, 20),
		Vector2(0, -50), Vector2(-75, -5), Vector2(70, 5), Vector2(0, 45),
		Vector2(-30, 40), Vector2(35, -45), Vector2(60, -20)
	]

	for idx in range(puff_offsets.size()):
		var base_offset = puff_offsets[idx]
		# scale offsets by radius
		var p_pos = base_offset * (radius / 140.0)
		var puff = Polygon2D.new()
		var p_pts: PackedVector2Array = []
		var p_rad = randf_range(48.0, 75.0) * (radius / 140.0)
		var lobes = 16
		for i in range(lobes):
			var a = i * (PI * 2.0 / lobes)
			var r = p_rad * randf_range(0.85, 1.18)
			# Isometric ground plane perspective (0.75 y-scale)
			p_pts.append(Vector2(cos(a) * r, sin(a) * r * 0.75))
		puff.polygon = p_pts
		puff.color = puff_colors[idx % puff_colors.size()]
		puff.position = p_pos
		add_child(puff)
		puff_nodes.append(puff)

	if collision_shape:
		var circle_s = CircleShape2D.new()
		circle_s.radius = radius
		collision_shape.shape = circle_s

	if status_label:
		status_label.text = "🤢 [MIST] " + cloud_name
		status_label.position = Vector2(-120.0, -radius * 0.75 - 24.0)

	if particles:
		particles.emission_sphere_radius = radius * 0.85

func _start_mist_undulation() -> void:
	# Subtle volumetric breathing and drifting for each mist puff
	for i in range(puff_nodes.size()):
		var p = puff_nodes[i]
		var orig_scale = p.scale
		var tw = create_tween().set_loops()
		var dur = randf_range(2.0, 3.5)
		tw.tween_property(p, "scale", orig_scale * randf_range(1.10, 1.25), dur).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		tw.tween_property(p, "scale", orig_scale, dur).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _physics_process(delta: float) -> void:
	elapsed_time += delta
	if duration_seconds > 0.0 and elapsed_time >= duration_seconds:
		var fade_tw = create_tween()
		fade_tw.tween_property(self, "modulate:a", 0.0, 1.2)
		fade_tw.tween_callback(queue_free)
		set_physics_process(false)
		return

	# Update cooldowns
	var to_erase: Array = []
	for k in cooldowns.keys():
		cooldowns[k] -= delta
		if cooldowns[k] <= 0.0:
			to_erase.append(k)
	for k in to_erase:
		cooldowns.erase(k)

	# Check overlapping bodies entering the volumetric mist
	var bodies = get_overlapping_bodies()
	for b in bodies:
		_check_actor_nausea(b)

func _on_body_entered(body: Node2D) -> void:
	_check_actor_nausea(body)

func _check_actor_nausea(actor: Node2D) -> void:
	if not is_instance_valid(actor):
		return
	if cooldowns.has(actor):
		return

	# Check if moving or inside the vapors
	var is_moving = false
	if "is_moving" in actor and actor.is_moving:
		is_moving = true
	elif "velocity" in actor and actor.velocity.length() > 8.0:
		is_moving = true

	# Check if already down prone
	var is_already_down = false
	if "is_down_prone" in actor and actor.is_down_prone:
		is_already_down = true
	elif actor.has_method("is_prone") and actor.is_prone():
		is_already_down = true

	if is_moving and not is_already_down:
		trigger_nausea(actor)

func trigger_nausea(actor: Node2D) -> void:
	cooldowns[actor] = 4.5 # Prevent re-trigger while down
	actor_nauseated.emit(actor)

	var actor_name = "Character"
	if "character_name" in actor and actor.character_name != "":
		actor_name = actor.character_name
	elif "enemy_name" in actor and actor.enemy_name != "":
		actor_name = actor.enemy_name
	elif "name" in actor:
		actor_name = actor.name

	# Floating Text
	if FloatingTextManager:
		FloatingTextManager.spawn_text(actor.global_position + Vector2(0, -40), "RETCHING & REELING!", Color(0.85, 0.95, 0.2))

	# Audio
	var am = null
	if Engine.get_main_loop() is SceneTree and (Engine.get_main_loop() as SceneTree).root.has_node("AudioManager"):
		am = (Engine.get_main_loop() as SceneTree).root.get_node("AudioManager")
	if am and am.has_method("play_sfx"):
		am.play_sfx("spell_impact")

	# Knock down prone flat on the ground
	if actor.has_method("knock_down_prone"):
		actor.knock_down_prone()

	# Apply prone & poisoned status conditions in GameState
	var gs = null
	if Engine.get_main_loop() is SceneTree and (Engine.get_main_loop() as SceneTree).root.has_node("GameState"):
		gs = (Engine.get_main_loop() as SceneTree).root.get_node("GameState")
	if gs and gs.has_method("apply_status_effect"):
		gs.apply_status_effect(actor_name, "prone", 1)
		gs.override_status_timeout(actor_name, "prone", 3.5)
		gs.apply_status_effect(actor_name, "poisoned", 2)
		if actor == gs or actor_name == gs.hero_name or actor_name.to_lower() == "hero" or actor is HeroPlayer:
			gs.apply_status_effect("hero", "prone", 1)
			gs.override_status_timeout("hero", "prone", 3.5)
			gs.apply_status_effect("hero", "poisoned", 2)

	if gs and gs.has_method("log_message"):
		gs.log_message("combat", "🤢 %s is overcome by the noxious stinking cloud and collapsed flat on the floor retching! (Prone - 1 turn)" % actor_name)

func get_stinking_cloud_info() -> Dictionary:
	return {
		"name": cloud_name,
		"position": [global_position.x, global_position.y],
		"radius": radius,
		"duration": duration_seconds,
		"time_remaining": max(0.0, duration_seconds - elapsed_time)
	}
