extends Node2D

# RobOS cRPG House Porch & Elevation Demonstration Map
# Demonstrates multi-tier 2.5D elevation, stair transitions, porch deck Y-sorting, and house door entrance.

const StairTransitionZone = preload("res://scripts/StairTransitionZone.gd")
const PorchDeckZone = preload("res://scripts/PorchDeckZone.gd")

@export var is_town_or_interior: bool = true
@export var default_fog_of_war: bool = false

@onready var hero: HeroPlayer = $HeroPlayer
@onready var stairs: Area2D = $StaircaseZone
@onready var porch: Area2D = $PorchDeckZone
@onready var door: DoorPortal = $FrontPorchDoor
@onready var elevation_badge: Label = $CanvasLayer/ElevationBadge
@onready var status_label: Label = $CanvasLayer/StatusLabel
@onready var combat_log: RichTextLabel = $CanvasLayer/CombatLog

var showcase_timer: float = 0.0
var showcase_step: int = 0

func _ready() -> void:
	print("🏡 [HousePorchElevationMap] Loaded: Ground Yard (Z=0), Stairs, Porch (Z=1), and Front Door.")
	if hero and hero.has_method("set_camera_limits"):
		hero.set_camera_limits(0, 0, 1920, 1080)
	
	if door:
		door.door_entered.connect(_on_door_entered)
	if stairs:
		stairs.actor_ascended.connect(_on_actor_ascended)
		stairs.actor_descended.connect(_on_actor_descended)
	if porch:
		porch.actor_entered_deck.connect(_on_actor_entered_deck)
		porch.actor_exited_deck.connect(_on_actor_exited_deck)

	_log_message("🌿 Hero Vance arrives at the countryside cottage yard (Elevation Tier 0).")
	_log_message("💡 Click anywhere to walk. Ascend the wooden stairs to reach the elevated porch.")

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var click_pos = get_global_mouse_position()
		if hero:
			hero.target_position = click_pos
			hero.is_moving = true

func _process(delta: float) -> void:
	_handle_showcase(delta)

	if not hero or not elevation_badge:
		return

	var tier = hero.get_elevation_tier()
	var offset = hero.visual_elevation_offset

	if stairs and hero in stairs.tracked_actors:
		elevation_badge.text = "🪜 STAIRS TRANSITION: Elevating... (Offset: %.1f px)" % offset
		elevation_badge.modulate = Color(1.0, 0.85, 0.3)
	elif tier >= 1:
		elevation_badge.text = "🏰 ELEVATED PORCH (Tier 1, Offset: %.1f px) — ⚔️ HIGH GROUND ADVANTAGE ACTIVE (+2 Attack)" % offset
		elevation_badge.modulate = Color(0.3, 0.9, 1.0)
	else:
		elevation_badge.text = "🏔️ GROUND YARD (Tier 0, Offset: 0.0 px)"
		elevation_badge.modulate = Color(0.6, 0.9, 0.6)

func _handle_showcase(delta: float) -> void:
	if not OS.has_environment("CRPG_SHOWCASE_MODE"):
		return
	
	showcase_timer += delta

	if showcase_step == 0 and showcase_timer >= 0.8:
		showcase_step = 1
		print("🚶 [Showcase] Commanding hero to walk up the wooden stairs toward the porch...")
		if hero:
			hero.target_position = Vector2(960, 540)
			hero.is_moving = true

	elif showcase_step == 1 and showcase_timer >= 3.0:
		showcase_step = 2
		print("🏰 [Showcase] Hero reached elevated porch! Visual elevation offset: ", hero.visual_elevation_offset if hero else 0.0)
		print("🚶 [Showcase] Moving hero toward front door...")
		if hero:
			hero.target_position = Vector2(960, 480)
			hero.is_moving = true

	elif showcase_step == 2 and showcase_timer >= 4.5:
		showcase_step = 3
		print("🚪 [Showcase] Opening front porch door...")
		if door:
			door.try_enter()

	elif showcase_step == 3 and showcase_timer >= 5.5:
		showcase_step = 4
		print("📸 [Showcase] Capturing 1920x1080 high-res screenshot...")
		var vp = get_viewport()
		if vp:
			var img = vp.get_texture().get_image()
			if img:
				var shot_path = "/home/ndipiazza/source/robos/games/crpg-realm/assets/porch_elevation_showcase.png"
				img.save_png(shot_path)
				print("✨ Successfully saved Porch Elevation Showcase to: ", shot_path)

	elif showcase_step == 4 and showcase_timer >= 6.5:
		print("✔ [Showcase] Demonstration complete.")
		get_tree().quit(0)

func _on_actor_ascended(_actor: Node2D, tier: int) -> void:
	_log_message("🪜 Climbed the wooden stairs to Elevation Tier %d." % tier)

func _on_actor_descended(_actor: Node2D, tier: int) -> void:
	_log_message("🏔️ Stepped down to Ground Yard Tier %d." % tier)

func _on_actor_entered_deck(_actor: Node2D) -> void:
	_log_message("🏰 Stepped onto the wooden porch deck. Tactical High Ground Advantage gained!")

func _on_actor_exited_deck(_actor: Node2D) -> void:
	pass

func _on_door_entered() -> void:
	_log_message("🚪 Opened the cottage front door. Entering interior...")
	if status_label:
		status_label.text = "🚪 Entered the House Interior!"
		status_label.modulate = Color(0.4, 1.0, 0.5)

func _log_message(msg: String) -> void:
	print("🏡 ", msg)
	if combat_log:
		combat_log.append_text(msg + "\n")
