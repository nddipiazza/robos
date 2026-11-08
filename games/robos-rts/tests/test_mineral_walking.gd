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

	sim.load_scenario_file("frontier-hunters")
	for player in [1, 2]:
		var assignments := {}
		for worker in sim.units.values():
			if worker.owner == player and worker.is_worker:
				var target: int = worker.orders[0].target_tag
				assignments[target] = int(assignments.get(target, 0)) + 1
		check(assignments.size() == 8 and assignments.values().max() <= 2, "The 12 opening workers must spread across all eight local patches")

	print("Mineral walking checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
