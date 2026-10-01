extends SceneTree

# RobOS cRPG Multi-Tier Elevation, Stairs & Porch Showcase
# Automates hero navigation from ground yard -> wooden stairs -> elevated porch -> house door

var frame_count: int = 0
var map_instance: Node2D = null
var hero: HeroPlayer = null
var door: DoorPortal = null

func _init() -> void:
	print("✨ Launching Multi-Tier Elevation, Stairs & Porch Showcase...")
	var scene_res = load("res://scenes/HousePorchElevationMap.tscn")
	if not scene_res:
		print("❌ Could not load HousePorchElevationMap.tscn!")
		quit(1)
		return

	map_instance = scene_res.instantiate()
	root.add_child(map_instance)

	hero = map_instance.get_node_or_null("HeroPlayer") as HeroPlayer
	door = map_instance.get_node_or_null("FrontPorchDoor") as DoorPortal

	# Free any legacy QA overlays that might block view
	for child in root.get_children():
		if "QAOverlay" in child.name or "QA" in child.name:
			child.queue_free()

	process_frame.connect(_on_process_frame)

func _on_process_frame() -> void:
	frame_count += 1

	if frame_count == 25:
		print("🚶 [Showcase] Commanding hero to walk up the wooden stairs toward the porch...")
		if hero:
			hero.target_position = Vector2(960, 540)
			hero.is_moving = true

	if frame_count == 85:
		print("🏰 [Showcase] Hero is climbing stairs! Visual elevation offset: ", hero.visual_elevation_offset if hero else 0.0)

	if frame_count == 130:
		print("🛡️ [Showcase] Hero reached elevated porch! Elevation tier: ", hero.get_elevation_tier() if hero else 0)
		print("🛡️ [Showcase] Commanding hero toward front door...")
		if hero:
			hero.target_position = Vector2(960, 480)
			hero.is_moving = true

	if frame_count == 160:
		print("🚪 [Showcase] Interacting with front porch door...")
		if door:
			door.try_enter()

	if frame_count == 180:
		print("📸 [Showcase] Capturing 1920x1080 High-Resolution Elevation & Porch Showcase...")
		var vp = root.get_viewport()
		if vp:
			var img = vp.get_texture().get_image()
			if img:
				var shot_path = "/home/ndipiazza/source/robos/games/crpg-realm/assets/porch_elevation_showcase.png"
				img.save_png(shot_path)
				print("✨ Successfully saved Porch Elevation Showcase to: ", shot_path)

	var max_frames = 210
	if OS.has_environment("SHOWCASE_MAX_FRAMES"):
		max_frames = int(OS.get_environment("SHOWCASE_MAX_FRAMES"))
	if frame_count >= max_frames:
		print("✔ Showcase demonstration complete.")
		quit(0)
