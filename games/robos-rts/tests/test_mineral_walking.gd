extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		printerr(message)

func _run() -> void:
	await process_frame
	var sim = root.get_node("SimEngine")
	sim.reset_state(42, 96, 64)
	sim.spawn_unit("colony_hub", 1, Vector2(16, 24))
	var patch: Dictionary = sim.spawn_resource("crystal_field", Vector2(42, 24), 43)
	var workers: Array = []
	for x in [25, 28, 31, 34]:
		var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(x, 24))
		workers.append(worker)
		sim.issue_command([worker.tag], "harvest", patch.pos, patch.tag)
	var overlapping_trips := false
	var most_simultaneous_miners := 0
	var collected := 0
	for tick in range(2000):
		sim.step_ticks(1)
		var drilling := 0
		for worker in workers:
			if worker.harvest_timer > 0.0:
				drilling += 1
		most_simultaneous_miners = maxi(most_simultaneous_miners, drilling)
		for i in range(workers.size()):
			var worker: Dictionary = workers[i]
			for j in range(i + 1, workers.size()):
				var other: Dictionary = workers[j]
				if (worker.cargo_amount > 0) != (other.cargo_amount > 0):
					if worker.pos.distance_to(other.pos) < (worker.radius + other.radius) * 0.4:
						overlapping_trips = true
		collected = sim.players[1].crystal_collected
		if collected == 43:
			break
	check(overlapping_trips, "Loaded and outbound workers must pass through each other")
	check(most_simultaneous_miners == 1, "A patch must serve one drilling worker at a time")
	check(collected == 43 and patch.amount == 0, "The whole patch, including its last partial load, must be delivered")

	# Stop restores normal body blocking even if two workers were stacked.
	var first: Dictionary = workers[0]
	var second: Dictionary = workers[1]
	sim.issue_command([first.tag, second.tag], "stop")
	first.pos = Vector2(30, 40)
	second.pos = first.pos
	sim.step_ticks(1)
	check(first.pos.distance_to(second.pos) >= (first.radius + second.radius) * 0.9, "Stopped workers must separate")

	sim.reset_state(42, 96, 64)
	patch = sim.spawn_resource("crystal_field", Vector2(42, 24), 50)
	first = sim.spawn_unit("pioneer", 1, Vector2(39, 24))
	second = sim.spawn_unit("pioneer", 1, Vector2(39, 24))
	sim.issue_command([first.tag, second.tag], "harvest", patch.pos, patch.tag)
	sim.step_ticks(64)
	check(patch.mining_worker == first.tag and first.harvest_timer > 0.0, "The first arriving worker must hold the mining slot")
	sim.issue_command([first.tag], "stop")
	sim.step_ticks(1)
	check(patch.mining_worker == second.tag and first.harvest_timer == 0.0, "Stopping mid-drill must free the slot for a waiting worker")

	sim.reset_state(42, 96, 64)
	sim.spawn_unit("colony_hub", 1, Vector2(16, 24))
	var neighbor: Dictionary = sim.spawn_resource("crystal_field", Vector2(32, 24), 50)
	patch = sim.spawn_resource("crystal_field", Vector2(35.6, 24), 50)
	var miner: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(25, 24))
	sim.issue_command([miner.tag], "harvest", patch.pos, patch.tag)
	var minimum_clearance := INF
	for i in range(600):
		sim.step_ticks(1)
		for deposit in [patch, neighbor]:
			minimum_clearance = minf(minimum_clearance, miner.pos.distance_to(deposit.pos) - miner.radius - deposit.radius)
	check(patch.amount < 50 and neighbor.amount == 50 and sim.players[1].crystal_collected > 0, "Workers must get around a neighboring field to reach their assigned patch")
	check(minimum_clearance >= -0.01, "Gathering workers must stay outside the deposits")

	var scenario: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://scenarios/frontier-hunters.jsonld"))
	var covered := {}
	var ai := root.get_node("RTSCommanderAI")
	for seed in [0, 2, 3, 4, 6]:
		scenario.seed = seed
		sim.load_scenario_dict(scenario)
		ai.set_directive(2, "idle", false)
		for player in [1, 2]:
			var slot: int = sim.match_state.assigned_starts[str(player)]
			covered[slot] = true
			var assignments := {}
			for worker in sim.units.values():
				if worker.owner == player and worker.is_worker:
					var target: int = worker.orders[0].target_tag
					var patch_id: String = sim.resources[target].id
					check(patch_id.begins_with("start_%d_crystal_" % slot), "Opening workers must stay in their own mineral line")
					assignments[target] = int(assignments.get(target, 0)) + 1
			check(assignments.size() == 8 and assignments.values().max() <= 2, "The 12 opening workers must spread across all eight local patches")
			var saturation: Dictionary = sim.worker_saturation(player).values().front()
			check(saturation.assigned == 12 and saturation.ideal == 16, "The starting base must show 12/16 workers")
		var miners_with_cargo := {}
		for _sample in range(96):
			sim.step_ticks(32)
			for worker in sim.units.values():
				if worker.is_worker and worker.cargo_amount > 0:
					miners_with_cargo[worker.tag] = true
			if miners_with_cargo.size() == 24:
				break
		check(miners_with_cargo.size() == 24, "All 24 opening workers must reach a patch for seed %d (got %d)" % [seed, miners_with_cargo.size()])
	check(covered.size() == 8, "The fixture must exercise all eight starts")

	print("Mineral walking checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
