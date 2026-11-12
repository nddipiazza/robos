extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _vertex_count(node: Node) -> int:
	var count = 0
	if node is MeshInstance3D and node.mesh:
		for surface in range(node.mesh.get_surface_count()):
			count += node.mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX].size()
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
	var rifleman: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(120, 120))
	world.set_focus(Vector2(120, 120), 50)
	var selected: Array[int] = []
	world.sync_3d_entities(selected, 0.016)
	var batch_key: String = world.unit_nodes[rifleman.tag].get_meta("mesh_batch", "")
	var single_draws: int = world._unit_batches.get(batch_key, []).size()
	for i in range(79):
		sim.spawn_unit("rifleman", 1, Vector2(112 + i % 10, 112 + i / 10))
	world.sync_3d_entities(selected, 0.016)
	var army_batches: Array = world._unit_batches.get(batch_key, [])
	var army_draws := army_batches.size()
	if army_draws != single_draws or single_draws <= 0:
		failures.append("Army geometry did not retain a constant batch count")
	for batch in army_batches:
		if batch.multimesh.visible_instance_count != 80:
			failures.append("Missing army instances")
	_test_production_dock(sim, world, failures)
	_test_campaign_pickups(sim, world, failures)
	_test_sunblade_swings(sim, world, failures)
	print(JSON.stringify({"map_vertices": baseline, "same_frame_reloads": 3, "army_units": 80, "body_batches": army_draws, "failures": failures}))
	world.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)

func _test_production_dock(sim: Node, world: Node3D, failures: Array) -> void:
	sim.load_scenario_dict({"paused": true, "map": {"width": 72, "height": 64},
		"players": {"1": {"crystal": 200, "aether": 200}}})
	var site := Vector2(32, 32)
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, site)
	sim._refresh_vision()
	if not sim.issue_command([hall.tag], "attach_research_module").ok:
		failures.append("Could not build a Research Module for the dock check")
		return
	var module: Dictionary = sim.production_attachment(hall, false)
	var selected: Array[int] = []
	world.set_focus(site, 50)
	world.sync_3d_entities(selected, 0.016)
	var dock: Node3D = world.unit_nodes[module.tag].get_node_or_null("ProductionDock")
	if dock == null or not dock.visible:
		failures.append("An attached Research Module has no visible dock")
		return
	sim.step_ticks(ceili(module.build_total_time / sim.TICK_DT) + 1)
	sim.issue_command([hall.tag], "lift")
	world.sync_3d_entities(selected, 0.016)
	if dock.visible:
		failures.append("The dock remains visible after liftoff starts")
	sim.step_ticks(128)
	sim.issue_command([hall.tag], "land", site)
	sim.step_ticks(256)
	world.sync_3d_entities(selected, 0.016)
	if not dock.visible:
		failures.append("The dock remains hidden after the Hall reconnects")

func _test_campaign_pickups(sim: Node, world: Node3D, failures: Array) -> void:
	var campaign = sim.Campaign
	sim.start_campaign(campaign.DEFENSE)
	sim.paused = true
	var mineral: Vector2 = campaign.DEFENSE_CACHE_SITES[0].point
	var aether: Vector2 = campaign.DEFENSE_CACHE_SITES[1].point
	var artifact: Vector2 = campaign.RELICS[0]
	world.sync_campaign_pickups(sim.campaign.snapshot(sim, 1).markers)
	if not world._campaign_pickups.is_empty():
		failures.append("Unscouted pickups were rendered through fog")
	for point in [mineral, aether, artifact]:
		sim.vision.add_sweep(1, point, 5.0, sim.tick + 24)
	sim.step_ticks(8)
	world.sync_campaign_pickups(sim.campaign.snapshot(sim, 1).markers)
	var keys := [Vector3(mineral.x, 0, mineral.y), Vector3(aether.x, 1, aether.y), Vector3(artifact.x, 2, artifact.y)]
	for key in keys:
		var model: Node3D = world._campaign_pickups.get(key)
		if model == null or _vertex_count(model) == 0:
			failures.append("Missing 3D pickup mesh at %s" % key)
		elif not is_equal_approx(model.position.y, sim.get_elevation_at(Vector2(key.x, key.z))):
			failures.append("Pickup mesh is not grounded at %s" % key)
	var collector: Dictionary = sim.spawn_unit("rifleman", 1, mineral)
	sim.spawn_unit("rifleman", 1, artifact)
	sim.step_ticks(8)
	world.sync_campaign_pickups(sim.campaign.snapshot(sim, 1).markers)
	if world._campaign_pickups.has(keys[0]) or world._campaign_pickups.has(keys[2]):
		failures.append("A collected pickup still has a ground model")
	sim._remove_destroyed_unit(collector)
	sim.step_ticks(8)
	world.sync_campaign_pickups(sim.campaign.snapshot(sim, 1).markers)
	if world._campaign_pickups.has(keys[1]):
		failures.append("A pickup model remained after vision was lost")

func _test_sunblade_swings(sim: Node, world: Node3D, failures: Array) -> void:
	sim.load_scenario_dict({"paused": true, "decor": false, "map": {"width": 72, "height": 64}})
	var blade: Dictionary = sim.spawn_unit("sunblade", 1, Vector2(30, 30))
	var target: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, Vector2(33, 30))
	sim.issue_command([target.tag], "hold_fire")
	world.set_focus(blade.pos, 50)
	var selected: Array[int] = []
	world.sync_3d_entities(selected, sim.TICK_DT)
	var node: Node3D = world.unit_nodes[blade.tag]
	var rig: Dictionary = node.get_meta("sunblade_rig", {})
	if rig.is_empty():
		failures.append("Sunblade model has no articulated sword rig")
		return
	var rest_tip: Vector3 = rig.arms[1].tip.global_position
	var hit_hands: Array[int] = []
	var last_hit: float = rig.strike_at
	var trail_visible := false
	var tip_travel := 0.0
	sim.issue_command([blade.tag], "attack_target", target.pos, target.tag)
	for _tick in range(120):
		sim.step_ticks(1)
		world.sync_3d_entities(selected, sim.TICK_DT)
		if rig.strike_at > last_hit:
			last_hit = rig.strike_at
			hit_hands.append(rig.last_hand)
		tip_travel = maxf(tip_travel, rest_tip.distance_to(rig.arms[1].tip.global_position))
		var trail: MeshInstance3D = rig.get("trail")
		trail_visible = trail_visible or (trail != null and trail.visible and trail.mesh.get_surface_count() == 1)
		if hit_hands.size() >= 2:
			break
	if hit_hands != [1, 0] or tip_travel < 1.0 or not trail_visible:
		failures.append("Live Sunblade hits did not alternate hands, swing through an arc, and leave a trail")
	sim.issue_command([blade.tag], "hold_fire")
	for _tick in range(20):
		world.sync_3d_entities(selected, sim.TICK_DT)
	if not rig.samples.is_empty() or (rig.has("trail") and rig.trail.visible):
		failures.append("Sunblade trail did not fade after the swing")
