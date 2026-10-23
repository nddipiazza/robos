extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.reset_state(42, 256, 256)
	var rng = RandomNumberGenerator.new()
	rng.seed = 1024
	for tag in range(160):
		sim.units[tag] = {"tag": tag, "owner": tag % 3 + 1, "pos": Vector2(rng.randf_range(0, 256), rng.randf_range(0, 256)), "radius": rng.randf_range(0.5, 8.0)}
	sim._rebuild_spatial_grid()
	var failures: Array = []
	for i in range(250):
		var center = Vector2(rng.randf_range(-5, 261), rng.randf_range(-5, 261))
		var radius = rng.randf_range(0, 40)
		var actual: Array = []
		for unit in sim.query_units_in_radius(center, radius):
			actual.append(unit.tag)
		var expected: Array = []
		for unit in sim.units.values():
			if center.distance_to(unit.pos) <= radius + unit.radius:
				expected.append(unit.tag)
		actual.sort()
		expected.sort()
		if actual != expected:
			failures.append({"center": str(center), "radius": radius, "actual": actual, "expected": expected})
		var owner_id = i % 3 + 1
		var hostile: Array = []
		for unit in sim.query_units_in_radius(center, radius, owner_id):
			hostile.append(unit.tag)
		var expected_hostile = expected.filter(func(tag): return sim.units[tag].owner != owner_id)
		hostile.sort()
		if hostile != expected_hostile:
			failures.append("Hostile spatial query disagreed with brute force")
	print(JSON.stringify({"queries_checked": 250, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
