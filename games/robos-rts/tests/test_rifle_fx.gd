extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.load_scenario_file("riflemen-vs-riflemen")
	var world = load("res://scripts/RTSWorld3D.gd").new()
	root.add_child(world)
	var fx = world.rifle_fx
	while not fx.warmup_complete:
		await process_frame
	var nodes = fx.get_child_count()
	var failures: Array = []
	for i in range(1000):
		fx.fire(Vector3(32, 0, 32), Vector3(48, 0, 32), i % 2 + 1)
	fx._process(0.0)
	if fx.shots.size() != fx.CAPACITY or fx.get_child_count() != nodes or fx.batches.size() != 4 or fx.lights.size() != 3:
		failures.append("Rifle effects exceeded the fixed pool or allocated scene nodes per shot")
	for batch in fx.batches.values():
		if batch.visible_instance_count > batch.instance_count:
			failures.append("Effect batch overflow")
	# Normal movement interpolates; pause and teleport stay exact.
	var unit = {"prev_pos": Vector2(20, 20), "pos": Vector2(22, 20)}
	sim.rts_mode = "human"
	sim.paused = false
	sim._accum_time = sim.TICK_DT * 0.5
	if world.display_position(unit) != Vector2(21, 20):
		failures.append("Movement did not interpolate the fractional simulation tick")
	fx._process(0.2)
	if not fx.shots.is_empty():
		failures.append("Transient rifle effects did not expire")
	sim.paused = true
	if world.display_position(unit) != unit.pos:
		failures.append("Paused position was interpolated")
	fx.fire(Vector3(32, 0, 32), Vector3(48, 0, 32), 1)
	sim.load_scenario_file("riflemen-vs-riflemen")
	if not fx.shots.is_empty():
		failures.append("Scenario reset retained rifle flashes")
	print(JSON.stringify({"pooled_nodes": nodes, "capacity": fx.CAPACITY, "shots_requested": 1000, "failures": failures}))
	world.queue_free()
	quit(0 if failures.is_empty() else 1)
