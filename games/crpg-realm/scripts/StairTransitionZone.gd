class_name StairTransitionZone
extends Area2D

# RobOS cRPG Stair Transition Zone
# Monitors actors ascending or descending stairs, calculating continuous vertical lift
# and synchronizing 2.5D visual elevation offset between elevation tiers (e.g. Yard Z=0 -> Porch Z=1).

signal actor_ascended(actor, tier: int)
signal actor_descended(actor, tier: int)

@export var start_tier: int = 0
@export var end_tier: int = 1
@export var stair_bottom_y: float = 720.0
@export var stair_top_y: float = 620.0
@export var step_height_px: float = 48.0

var tracked_actors: Array[Node2D] = []

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _on_body_entered(body: Node2D) -> void:
	if body not in tracked_actors:
		tracked_actors.append(body)
		if body.has_method("set_elevation_offset_direct"):
			print("🪜 [StairTransitionZone] Actor '%s' entered stairs." % body.name)

func _on_body_exited(body: Node2D) -> void:
	if body in tracked_actors:
		tracked_actors.erase(body)
		if body.has_method("set_elevation"):
			if body.global_position.y <= (stair_top_y + 10.0):
				body.set_elevation(end_tier, -step_height_px)
				actor_ascended.emit(body, end_tier)
				print("🏰 [StairTransitionZone] Actor '%s' reached elevated tier %d." % [body.name, end_tier])
			else:
				body.set_elevation(start_tier, 0.0)
				actor_descended.emit(body, start_tier)
				print("🏔️ [StairTransitionZone] Actor '%s' stepped down to ground tier %d." % [body.name, start_tier])

func _process(_delta: float) -> void:
	var span = stair_bottom_y - stair_top_y
	if span <= 0.0:
		return

	for actor in tracked_actors:
		if not is_instance_valid(actor):
			continue
		if actor.has_method("set_elevation_offset_direct"):
			var progress = clampf((stair_bottom_y - actor.global_position.y) / span, 0.0, 1.0)
			var offset = -progress * step_height_px
			actor.set_elevation_offset_direct(offset)
			if progress >= 0.8:
				actor.current_elevation_tier = end_tier
			elif progress <= 0.2:
				actor.current_elevation_tier = start_tier
