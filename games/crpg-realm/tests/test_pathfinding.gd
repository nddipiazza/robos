extends SceneTree

# Test script for AStarGrid2D + String-Pulling in RobOS cRPG
const Pathfinder = preload("res://scripts/Pathfinder.gd")

func _init() -> void:
	print("🧪 Testing Pathfinder with AStarGrid2D and String-Pulling...")
	
	# Load Homestead scene
	var hs_scene = load("res://scenes/Homestead.tscn")
	if not hs_scene:
		printerr("❌ Failed to load Homestead.tscn")
		quit(1)
		return
	
	var hs_instance = hs_scene.instantiate()
	root.add_child(hs_instance)
	
	# Let physics step once to register collision shapes in space
	process_frame.connect(_on_first_frame.bind(hs_instance), CONNECT_ONE_SHOT)

func _on_first_frame(scene: Node2D) -> void:
	print("🔍 Homestead loaded. Testing space state and collision...")
	var world_2d = scene.get_world_2d()
	
	# Direct ray across divider wall (Hall to Barracks)
	var start = Vector2(1280, 750)
	var target = Vector2(520, 850)
	var is_clear = Pathfinder.is_line_clear(world_2d, start, target, 12.0)
	print("Direct ray from %s to %s is_clear: %s (expected false)" % [start, target, is_clear])
	
	# Scenario 1: Hall to Barracks around divider wall
	_test_scenario(world_2d, scene, "Hall to Barracks (around divider)", Vector2(1280, 750), Vector2(520, 850))
	
	# Scenario 2: Barracks to North Gallery around gallery divider
	_test_scenario(world_2d, scene, "Barracks to Gallery (around gallery divider)", Vector2(450, 680), Vector2(1280, 300))
	
	# Scenario 3: Clicking on solid fireplace (1280, 465)
	_test_scenario(world_2d, scene, "Clicking ON solid fireplace", Vector2(1280, 750), Vector2(1280, 465))
	
	# Scenario 4: Direct line in same room
	_test_scenario(world_2d, scene, "Direct line across same room", Vector2(1280, 750), Vector2(1400, 750))
	
	# Scenario 5: Benchmark 100 queries
	var t_bench_start = Time.get_ticks_usec()
	for i in range(100):
		var p = Pathfinder.get_nav_path(world_2d, Vector2(1280, 750), Vector2(520, 850), scene)
	var t_bench_end = Time.get_ticks_usec()
	print("\n⚡ Benchmark: 100 A* queries + string-pulling took %.2f ms total (%.3f ms per query)" % [
		(t_bench_end - t_bench_start) / 1000.0,
		(t_bench_end - t_bench_start) / 100000.0
	])
	
	quit(0)

func _test_scenario(world_2d: World2D, scene: Node, name: String, from: Vector2, to: Vector2) -> void:
	print("\n--- %s ---" % name)
	print("From: %s -> To: %s" % [from, to])
	var path = Pathfinder.get_nav_path(world_2d, from, to, scene)
	print("Resulting waypoints: %d" % path.size())
	for i in range(path.size()):
		print("  #%d: %s" % [i, path[i]])
