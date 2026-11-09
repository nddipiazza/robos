extends SceneTree

const OPENING_TICKS := 20 * 64

var sim: Node
var commander: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	commander = root.get_node("RTSCommanderAI")
	var results := {}
	for map_id in sim.SKIRMISH_MAPS:
		results[map_id] = _measure_map(map_id)
	print(JSON.stringify({"openings": results, "failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _measure_map(map_id: String) -> Dictionary:
	var openings := {}
	var starts: Array = sim.skirmish_map_config(map_id).map.starts
	for seed in range(1, 49):
		sim.start_skirmish(map_id, {"seed": seed, "unlimited_resources": false})
		commander.set_directive(2, "idle", false)
		var seats := {}
		for seat in [1, 2]:
			var start: int = sim.match_state.assigned_starts[str(seat)]
			if not openings.has(start):
				openings[start] = _check_line(map_id, seat, start)
				seats[seat] = start
		if seats.is_empty():
			continue
		for elapsed in range(8, OPENING_TICKS + 1, 8):
			sim.step_ticks(8)
			for seat in seats:
				var row: Dictionary = openings[seats[seat]]
				if row.first_delivery_tick == 0 and sim.players[seat].crystal_collected > 0:
					row.first_delivery_tick = elapsed
		for seat in seats:
			var row: Dictionary = openings[seats[seat]]
			row.crystal_at_20s = sim.players[seat].crystal_collected
			if row.first_delivery_tick == 0 or row.first_delivery_tick > 7 * 64 or row.crystal_at_20s < 80:
				failures.append("%s spawn %s cannot deliver a normal opening: %s" % [map_id, seats[seat], row])
		if openings.size() == starts.size():
			break
	if openings.size() != starts.size():
		failures.append("%s covered %s of %s starts" % [map_id, openings.size(), starts.size()])
	var income: Array = openings.values().map(func(row): return row.crystal_at_20s)
	var symmetry_limit := 1.2 if starts.size() == 2 else 1.4
	if not income.is_empty() and float(income.max()) > maxf(1.0, float(income.min())) * symmetry_limit:
		failures.append("%s opening income varies too much: %s" % [map_id, income])
	return openings

func _check_line(map_id: String, seat: int, start: int) -> Dictionary:
	var prefix := "start_%d_" % start
	var workers: Array = sim.units.values().filter(func(unit): return unit.owner == seat and unit.is_worker)
	var crystal := 0
	var aether := 0
	var longest_walk := 0.0
	for deposit in sim.resources.values():
		if not deposit.id.begins_with(prefix):
			continue
		if deposit.resource_type == "crystal_field":
			crystal += deposit.amount
		else:
			aether += deposit.amount
			if not sim.can_place_structure("aether_tap", deposit.pos):
				failures.append("%s spawn %d has an unbuildable gas vent %s" % [map_id, start, deposit.id])
		var nearest: Dictionary = workers[0]
		for worker in workers:
			if worker.pos.distance_squared_to(deposit.pos) < nearest.pos.distance_squared_to(deposit.pos):
				nearest = worker
		var reach: float = nearest.radius + deposit.radius + sim.HARVEST_REACH
		var path: Array[Vector2] = sim.compute_smooth_path(nearest.pos, deposit.pos, nearest.radius, false, reach)
		if path.is_empty() or path.back().distance_to(deposit.pos) > reach + 0.01:
			failures.append("%s spawn %d has an unreachable deposit %s" % [map_id, start, deposit.id])
			continue
		var distance := 0.0
		var previous: Vector2 = nearest.pos
		for point in path:
			distance += previous.distance_to(point)
			previous = point
		longest_walk = maxf(longest_walk, distance)
	if crystal != 8 * 1500 or aether != 2 * 2250:
		failures.append("%s spawn %d has unequal capacity %d/%d" % [map_id, start, crystal, aether])
	return {"crystal": crystal, "aether": aether, "longest_worker_walk": snappedf(longest_walk, 0.01), "first_delivery_tick": 0}
