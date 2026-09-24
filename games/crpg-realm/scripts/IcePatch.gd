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

var ground_layer: Node2D = null

func _ready() -> void:
	collision_layer = 1
	collision_mask = 1
	body_entered.connect(_on_body_entered)
	_setup_ground_layer()
	_rebuild_visuals()
	_pulse_glow()
	_announce_spawn.call_deferred()

func _announce_spawn() -> void:
	var info = get_ice_patch_info()
	info["kind"] = "ice_patch"
	GameState.record_event("hazard_spawned", info)

func _visual_extent() -> float:
	var m = 0.0
	if visual_poly:
		for p in visual_poly.polygon:
			m = max(m, p.length())
	return m

## Floor decals must never draw over the creatures standing on them. The parent scene
## Y-sorts its children, so the ice sheet is re-parented under a pivot placed at the
## patch's BACK edge: anyone whose feet are on the ice has a larger Y and renders on top.
func _setup_ground_layer() -> void:
	y_sort_enabled = true
	ground_layer = Node2D.new()
	ground_layer.name = "GroundLayer"
	add_child(ground_layer)
	move_child(ground_layer, 0)
	for n in [visual_poly, outline_line, particles]:
		if n:
			n.reparent(ground_layer, false)
	_position_ground_layer()

func _position_ground_layer() -> void:
	if not ground_layer:
		return
	var back_edge = radius + 6.0
	ground_layer.position = Vector2(0, -back_edge)
	for n in ground_layer.get_children():
		if n is Node2D:
			n.position = Vector2(0, back_edge)

func _rebuild_visuals() -> void:
	var pts: PackedVector2Array = []
	var num_pts = 40
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

	_rebuild_frost_detail(pts)

	if collision_shape:
		var circle_s = CircleShape2D.new()
		circle_s.radius = radius
		collision_shape.shape = circle_s

	if status_label:
		status_label.text = "❄️ [ICE] " + ice_name
		status_label.position = Vector2(-120.0, -radius - 22.0)

	if particles:
		particles.emission_sphere_radius = radius * 0.85
		particles.amount = int(clamp(radius / 6.0, 16, 48))
	_position_ground_layer()

var frost_detail: Node2D = null

func _rebuild_frost_detail(rim_pts: PackedVector2Array) -> void:
	# Glassy sheen + hairline fractures so the sheet reads as ice rather than a flat disc
	if not visual_poly:
		return
	if frost_detail and is_instance_valid(frost_detail):
		frost_detail.queue_free()
	frost_detail = Node2D.new()
	frost_detail.name = "FrostDetail"
	visual_poly.add_child(frost_detail)
	var sheen = Polygon2D.new()
	var sh_pts: PackedVector2Array = []
	for p in rim_pts:
		sh_pts.append(p * 0.72 + Vector2(-radius * 0.12, -radius * 0.14))
	sheen.polygon = sh_pts
	sheen.color = Color(0.9, 0.97, 1.0, 0.16)
	frost_detail.add_child(sheen)
	var rng = RandomNumberGenerator.new()
	rng.seed = int(radius * 1000.0) + 7
	for k in range(9):
		var crack = Line2D.new()
		crack.width = 1.4
		crack.default_color = Color(0.92, 0.98, 1.0, 0.55)
		var ang = (float(k) + rng.randf() * 0.6) * TAU / 9.0
		var p0 = Vector2(cos(ang), sin(ang)) * radius * sqrt(rng.randf_range(0.02, 0.55))
		var cpts: PackedVector2Array = [p0]
		var dir = ang + rng.randf_range(-1.2, 1.2)
		var cur = p0
		for seg in range(4):
			dir += rng.randf_range(-0.5, 0.5)
			cur += Vector2(cos(dir), sin(dir)) * radius * rng.randf_range(0.07, 0.14)
			if cur.length() > radius * 0.95:
				break
			cpts.append(cur)
		crack.points = cpts
		frost_detail.add_child(crack)

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

	# IE rule: a creature is "in" an area effect when its footprint centre (feet) is inside
	# the radius — merely brushing the edge with its collision capsule does not count.
	var feet_inside = actor.global_position.distance_to(global_position) <= radius
	if is_moving and not is_already_down and feet_inside:
		trigger_slip(actor)

func trigger_slip(actor: Node2D) -> void:
	slipped_cooldowns[actor] = 4.5 # Prevent re-slip during prone turn
	actor_slipped.emit(actor)
	GameState.record_event("hazard_contact", {
		"kind": "ice_patch", "effect": "slipped",
		"actor": str(actor.get("character_name") if "character_name" in actor and str(actor.get("character_name")) != "" else (actor.get("enemy_name") if "enemy_name" in actor else actor.name)),
		"actor_is_hero": actor is HeroPlayer,
		"actor_pos": [actor.global_position.x, actor.global_position.y],
		"distance_from_center": actor.global_position.distance_to(global_position),
		"radius": radius,
		"floor_sort_y": ground_layer.global_position.y if ground_layer else global_position.y,
		"actor_drawn_above_floor": GameState.is_drawn_above(actor, ground_layer)})

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
		"time_remaining": max(0.0, duration_seconds - elapsed_time),
		"collision_radius": (collision_shape.shape.radius if (collision_shape and collision_shape.shape is CircleShape2D) else -1.0),
		"feet": GameState.px_to_feet(radius),
		"floor_sort_y": (ground_layer.global_position.y if ground_layer else global_position.y),
		"floor_z": (GameState.effective_z(ground_layer) if ground_layer else 0),
		"y_sort_enabled": y_sort_enabled,
		"visual_radius": _visual_extent()
	}
