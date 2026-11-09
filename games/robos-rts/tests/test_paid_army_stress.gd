extends SceneTree

const SAMPLE_TICKS := 640
const WORKERS_PER_SIDE := 12
const HALLS_PER_SIDE := 18
const ARMY_PER_SIDE := 180

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var first := _run_battle()
	var repeated := _run_battle()
	for key in first.observation:
		var expected: Variant = first.observation[key]
		var actual: Variant = repeated.observation[key]
		if expected is Array and actual is Array and expected.size() == actual.size():
			for i in range(expected.size()):
				if expected[i] != actual[i]:
					print("First %s mismatch: %s versus %s" % [key, expected[i], actual[i]])
					break
		_check(expected == actual, "Identical seed and paid orders reproduce %s" % key)
	print(JSON.stringify({"baseline": first.baseline, "battle": first.battle, "repeated_battle": repeated.battle, "failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _run_battle() -> Dictionary:
	sim.load_scenario_dict({"seed": 27, "paused": true, "fog_of_war": true, "unlimited_resources": true,
		"map": {"width": 256, "height": 160}, "players": {"1": {"crystal": 12000}, "2": {"crystal": 12000}}})
	var halls := [_build_fixture_side(1), _build_fixture_side(2)]
	var baseline := _measure_ticks(128)
	for wave in range(2):
		for seat in range(2):
			for _slot in range(5):
				_check(sim.issue_command(halls[seat], "train_rifleman").accepted == HALLS_PER_SIDE, "Every queued job in wave %d is paid" % wave)
		sim.step_ticks(1680)

	var income: Array[int] = []
	for owner in [1, 2]:
		var player: Dictionary = sim.players[owner]
		var army: Array = sim.units.values().filter(func(unit): return unit.owner == owner and unit.unit_type == "rifleman")
		_check(army.size() == ARMY_PER_SIDE and player.units_trained == ARMY_PER_SIDE, "All paid troops deploy on side %d" % owner)
		_check(player.supply_used == WORKERS_PER_SIDE + ARMY_PER_SIDE and player.supply_cap == 200, "Side %d fights near the normal supply cap" % owner)
		_check(player.crystal == 12000 + player.crystal_collected - ARMY_PER_SIDE * 50, "Side %d pays for the entire army from its bank and deliveries" % owner)
		income.append(player.crystal_collected)
		var tags := army.map(func(unit): return unit.tag)
		sim.issue_command(tags, "attack", Vector2(175 if owner == 1 else 81, 79))
	var battle := _measure_ticks(SAMPLE_TICKS)
	for owner in [1, 2]:
		_check(sim.players[owner].units_lost > 0, "Both paid armies exchange fire")
		_check(sim.players[owner].crystal_collected > income[owner - 1], "Workers keep delivering during the battle")
	return {"baseline": baseline, "battle": battle, "observation": sim.get_observation()}

func _build_fixture_side(owner: int) -> Array[int]:
	var sign_x := 1.0 if owner == 1 else -1.0
	var base := Vector2(22 if owner == 1 else 234, 80)
	sim.spawn_unit("colony_hub", owner, base)
	var patches: Array[Dictionary] = []
	for i in range(8):
		patches.append(sim.spawn_resource("crystal_field", base + Vector2(-12 * sign_x, -14 + 4 * i), 1500))
	for i in range(WORKERS_PER_SIDE):
		var worker: Dictionary = sim.spawn_unit("pioneer", owner, base + Vector2(-7 * sign_x, -11 + 2 * i))
		sim.issue_command([worker.tag], "harvest", patches[i % patches.size()].pos, patches[i % patches.size()].tag)
	for column in range(3):
		for y in [8, 26, 44, 62, 98, 116, 134, 152]:
			sim.spawn_unit("silo", owner, Vector2(base.x + sign_x * (3 + 8 * column), y))
	var tags: Array[int] = []
	for column in range(3):
		for row in range(6):
			var hall: Dictionary = sim.spawn_unit("muster_hall", owner, Vector2(base.x + sign_x * (26 + 20 * column), 24 + 22 * row))
			tags.append(hall.tag)
			sim.issue_command([hall.tag], "rally", hall.pos + Vector2(9 * sign_x, 0))
	return tags

func _measure_ticks(count: int) -> Dictionary:
	var samples: Array[int] = []
	var total := 0
	var prior: Dictionary = sim.profile_usec.duplicate()
	for _i in range(count):
		var started := Time.get_ticks_usec()
		sim.step_ticks(1)
		var elapsed := Time.get_ticks_usec() - started
		samples.append(elapsed)
		total += elapsed
	samples.sort()
	var phases := {}
	for key in prior:
		phases[key] = float(sim.profile_usec[key] - prior[key]) / count
	return {"mean_usec": float(total) / count, "p95_usec": samples[ceili(0.95 * count) - 1], "phase_mean_usec": phases}

func _check(ok: bool, message: String) -> void:
	if not ok and not failures.has(message):
		failures.append(message)
