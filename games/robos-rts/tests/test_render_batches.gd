extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _vertex_count(node: Node) -> int:
	var count = 0
	if node is MeshInstance3D and node.mesh:
		for surface in range(node.mesh.get_surface_count()):
			count += node.mesh.surface_get_array_len(surface)
	for child in node.get_children():
		count += _vertex_count(child)
	return count

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.load_scenario_file("frontier-hunters")
	sim.units.clear()
	var world = load("res://scripts/RTSWorld3D.gd").new()
	root.add_child(world)
	var baseline = _vertex_count(world)
	var failures: Array = []
	# No frame is allowed to flush queue_free between these loads. Retaining the
	# previous mesh used to duplicate geometry and preserve obsolete map borders.
	for i in range(3):
		world._rebuild_static_3d_map()
		if _vertex_count(world) != baseline:
			failures.append("Map geometry accumulated on reload %s" % i)
	sim.spawn_unit("rifleman", 1, Vector2(120, 120))
	world.set_focus(Vector2(120, 120), 50)
	var selected: Array[int] = []
	world.sync_3d_entities(selected, 0.016)
	var single_draws = world._unit_batches["rifleman:1"].size()
	for i in range(79):
		sim.spawn_unit("rifleman", 1, Vector2(112 + i % 10, 112 + i / 10))
	world.sync_3d_entities(selected, 0.016)
	var army_draws = world._unit_batches["rifleman:1"].size()
	if army_draws != single_draws or single_draws <= 0:
		failures.append("Army geometry did not retain a constant batch count")
	for batch in world._unit_batches["rifleman:1"]:
		if batch.multimesh.visible_instance_count != 80:
			failures.append("Missing army instances")
	print(JSON.stringify({"map_vertices": baseline, "same_frame_reloads": 3, "army_units": 80, "body_batches": army_draws, "failures": failures}))
	world.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
