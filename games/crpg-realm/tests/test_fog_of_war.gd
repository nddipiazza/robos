extends SceneTree

func _init() -> void:
	print("=== Running Fog of War System Automated Verification ===")
	var fow_script = load("res://scripts/FogOfWar.gd")
	assert(fow_script != null, "Failed to load FogOfWar script")
	
	var fow = fow_script.new()
	assert(fow.grid_w == 320, "Expected grid_w 320")
	assert(fow.grid_h == 180, "Expected grid_h 180")
	print("✔ FogOfWar initialized with grid dimensions: ", fow.grid_w, "x", fow.grid_h)

	# Simulate hero at position (1280, 720) [grid center: (160, 90)]
	fow._precompute_brush()
	fow.fog_image = Image.create(fow.grid_w, fow.grid_h, false, Image.FORMAT_RGBA8)
	fow.fog_image.fill(Color(0, 0, 0, 1))
	fow.fog_texture = ImageTexture.create_from_image(fow.fog_image)

	var hero_start = Vector2(1280, 720)
	fow.update_fog_at_position(hero_start, true)

	# Test vision at hero location
	assert(fow.is_point_in_vision(hero_start), "Hero center must be in vision")
	assert(fow.is_point_explored(hero_start), "Hero center must be explored")
	print("✔ Hero center vision verified: in_vision=true, explored=true")

	# Test point 100px away (within 340px vision radius)
	var nearby_pt = Vector2(1380, 720)
	assert(fow.is_point_in_vision(nearby_pt), "Point within vision radius must be in vision")
	assert(fow.is_point_explored(nearby_pt), "Point within vision radius must be explored")
	print("✔ Nearby point (100px) verified: in_vision=true, explored=true")

	# Test distant point (100, 100) (unexplored)
	var far_pt = Vector2(100, 100)
	assert(not fow.is_point_in_vision(far_pt), "Distant point must NOT be in vision")
	assert(not fow.is_point_explored(far_pt), "Distant point must NOT be explored")
	print("✔ Distant point (100, 100) verified: in_vision=false, explored=false")

	# Simulate hero moving far away to (2000, 1000)
	var new_hero_pos = Vector2(2000, 1000)
	fow.update_fog_at_position(new_hero_pos, true)

	# The old hero position should now be EXPLORED (memory fog), but NOT in active vision!
	assert(not fow.is_point_in_vision(hero_start), "Old hero position must NOT be in active vision")
	assert(fow.is_point_explored(hero_start), "Old hero position must REMAIN explored in memory fog")
	print("✔ Memory fog verified: old position is explored=true but in_vision=false")

	# Test vision radius scaling (1.25x of 340 = 425)
	assert(abs(fow.vision_radius - 425.0) < 0.1, "Expected default vision_radius 425.0 (340 * 1.25)")
	print("✔ FogOfWar vision radius verified at 425px (1.25x scaling)")

	# Test dynamic radius adjustment
	fow.set_vision_radius(510.0)
	assert(abs(fow.vision_radius - 510.0) < 0.1, "Expected updated vision_radius 510.0")
	print("✔ set_vision_radius(510.0) dynamically updated brush geometry")

	# Test map fog toggle
	assert(fow.is_map_fog_active(), "Fog should be active initially")
	fow.set_map_fog_enabled(false)
	assert(not fow.is_map_fog_active(), "Map fog should be disabled after set_map_fog_enabled(false)")
	fow.toggle_map_fog()
	assert(fow.is_map_fog_active(), "Map fog should be enabled after toggle_map_fog()")
	print("✔ Map fog toggle and state query verified")

	# Test reveal_all()
	fow.reveal_all()
	assert(fow.is_point_explored(far_pt), "reveal_all must explore all points")
	print("✔ reveal_all() verified across entire map expanse")

	print("=== ALL FOG OF WAR AUTOMATED CHECKS PASSED SUCCESSFULLY ===")
	quit(0)
