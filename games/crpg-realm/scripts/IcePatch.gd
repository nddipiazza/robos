class_name IcePatch
extends Area2D

# IcePatch.gd — Tactical Slippery Ice Surface Component for Godot 4
# Created by Blizzard spell or environmental hazards.
# - Renders frosted ice polygon, sparkling rim, and frost shimmer
# - When characters (Hero, Companions, Enemies) walk onto or traverse the ice,
#   they slip on the slick surface, fall flat on the ground (Prone), and remain down for a turn.

signal actor_slipped(actor: Node2D)

@export var ice_name: String = "Slippery Ice Patch"
@export var radius: float = 140.0:
	set(val):
		radius = val
		_rebuild_visuals()
@export var duration_seconds: float = 40.0
@export var slip_dc: int = 13

var elapsed_time: float = 0.0
var slipped_cooldowns: Dictionary = {}

@onready var visual_poly: Polygon2D = get_node_or_null("HazardVisual")
@onready var outline_line: Line2D = get_node_or_null("Outline")
@onready var status_label: Label = get_node_or_null("StatusLabel")
@onready var collision_shape: CollisionShape2D = get_node_or_null("CollisionShape2D")
@onready var particles: CPUParticles2D = get_node_or_null("FrostParticles")

func _ready() -> void:
	collision_layer = 1
	collision_mask = 1
	body_entered.connect(_on_body_entered)
	_rebuild_visuals()
	_pulse_glow()

func _rebuild_visuals() -> void:
	var pts: PackedVector2Array = []
	var num_pts = 24
	for i in range(num_pts):
		var angle = i * (PI * 2.0 / num_pts)
		pts.append(Vector2(cos(angle), sin(angle)) * radius)

	if visual_poly:
		visual_poly.polygon = pts
		visual_poly.color = Color(0.60, 0.85, 1.0, 0.42)

	if outline_line:
		var outline_pts = pts.duplicate()
		outline_pts.append(pts[0])
		outline_line.points = outline_pts
		outline_line.width = 3.0
		outline_line.default_color = Color(0.85, 0.95, 1.0, 0.80)

	if collision_shape:
		var circle_s = CircleShape2D.new()
		circle_s.radius = radius
		collision_shape.shape = circle_s

	if status_label:
		status_label.text = "❄️ [ICE] " + ice_name
		status_label.position = Vector2(-120.0, -radius - 22.0)

	if particles:
		particles.emission_sphere_radius = radius * 0.85

func _pulse_glow() -> void:
	var tw = create_tween().set_loops()
	tw.tween_property(self, "modulate:a", 0.82, 1.4).from(1.0)
	tw.tween_property(self, "modulate:a", 1.0, 1.4).from(0.82)

func _physics_process(delta: float) -> void:
	elapsed_time += delta
	if duration_seconds > 0.0 and elapsed_time >= duration_seconds:
		var fade_tw = create_tween()
		fade_tw.tween_property(self, "modulate:a", 0.0, 1.0)
		fade_tw.tween_callback(queue_free)
		set_physics_process(false)
		return

	# Update cooldowns
	var to_erase: Array = []
	for k in slipped_cooldowns.keys():
		slipped_cooldowns[k] -= delta
		if slipped_cooldowns[k] <= 0.0:
			to_erase.append(k)
	for k in to_erase:
		slipped_cooldowns.erase(k)

	# Check overlapping bodies traversing the ice
	var bodies = get_overlapping_bodies()
	for b in bodies:
		_check_actor_slip(b)

func _on_body_entered(body: Node2D) -> void:
	_check_actor_slip(body)

func _check_actor_slip(actor: Node2D) -> void:
	if not is_instance_valid(actor):
		return
	if slipped_cooldowns.has(actor):
		return

	# Check if moving actor
	var is_moving = false
	if "is_moving" in actor and actor.is_moving:
		is_moving = true
	elif "velocity" in actor and actor.velocity.length() > 10.0:
		is_moving = true

	# Only slip if moving and not already down prone
	var is_already_down = false
	if "is_down_prone" in actor and actor.is_down_prone:
		is_already_down = true
	elif actor.has_method("is_prone") and actor.is_prone():
		is_already_down = true

	if is_moving and not is_already_down:
		trigger_slip(actor)

func trigger_slip(actor: Node2D) -> void:
	slipped_cooldowns[actor] = 4.5 # Prevent re-slip during prone turn
	actor_slipped.emit(actor)

	var actor_name = "Character"
	if "character_name" in actor and actor.character_name != "":
		actor_name = actor.character_name
	elif "enemy_name" in actor and actor.enemy_name != "":
		actor_name = actor.enemy_name
	elif "name" in actor:
		actor_name = actor.name

	# Floating Text
	if FloatingTextManager:
		FloatingTextManager.spawn_text(actor.global_position + Vector2(0, -35), "SLIPPED ON ICE!", Color(0.6, 0.9, 1.0))

	# Audio
	var am = null
	if Engine.get_main_loop() is SceneTree and (Engine.get_main_loop() as SceneTree).root.has_node("AudioManager"):
		am = (Engine.get_main_loop() as SceneTree).root.get_node("AudioManager")
	if am and am.has_method("play_sfx"):
		am.play_sfx("spell_impact")

	# Knock down prone
	if actor.has_method("knock_down_prone"):
		actor.knock_down_prone()

	# Apply prone condition to GameState
	var gs = null
	if Engine.get_main_loop() is SceneTree and (Engine.get_main_loop() as SceneTree).root.has_node("GameState"):
		gs = (Engine.get_main_loop() as SceneTree).root.get_node("GameState")
	if gs and gs.has_method("apply_status_effect"):
		gs.apply_status_effect(actor_name, "prone", 1)
		# Ensure 3.5s prone turn timeout
		gs.override_status_timeout(actor_name, "prone", 3.5)
		if actor == gs or actor_name == gs.hero_name:
			gs.override_status_timeout("hero", "prone", 3.5)

	if gs and gs.has_method("log_message"):
		gs.log_message("combat", "❄️ %s lost footing on the slippery ice and crashed flat on the ground! (Prone)" % actor_name)

func get_ice_patch_info() -> Dictionary:
	return {
		"name": ice_name,
		"position": [global_position.x, global_position.y],
		"radius": radius,
		"duration": duration_seconds,
		"time_remaining": max(0.0, duration_seconds - elapsed_time)
	}
