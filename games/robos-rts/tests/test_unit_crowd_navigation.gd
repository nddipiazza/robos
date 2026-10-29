extends SceneTree

var sim: Node

func _initialize() -> void:
	call_deferred("_run")

func _wall_fixture(mirror: bool = false) -> Dictionary:
	var spawns: Array = [{"id": "rear", "type": "rifleman", "owner": 1, "x": 66 if mirror else 30, "y": 32},
		{"id": "enemy", "type": "rifleman", "owner": 2, "x": 36 if mirror else 60, "y": 32, "hp": 10000}]
	for row in range(9):
		spawns.append({"type": "rifleman", "owner": 1, "x": 60 if mirror else 36, "y": 24 + row * 2})
	sim.load_scenario_dict({"map": {"width": 96, "height": 64}, "units": spawns, "decor": false})
	var rear = sim.units[1001]
	var enemy = sim.units[1002]
	var holding: Array[int] = []
	var initial: Dictionary = {}
	for u in sim.units.values():
		if u.tag == rear.tag:
			continue
		holding.append(u.tag)
		initial[u.tag] = u.pos
	sim.issue_command(holding, "hold_position")
	sim.issue_command([rear.tag], "attack_target", enemy.pos, enemy.tag)
	var max_lateral = 0.0
	var crossing_y = 32.0
	var crossed = false
	var fired = false
	for i in range(640):
		sim.step_ticks(1)
		max_lateral = maxf(max_lateral, absf(rear.pos.y - 32.0))
		if not crossed and (rear.pos.x < 60 if mirror else rear.pos.x > 36):
			crossing_y = rear.pos.y
			crossed = true
		if rear.damage_dealt > 0:
			fired = true
			break
		if not sim.units.has(rear.tag):
			break
	var moved_holders = false
	for tag in initial:
		if sim.units.has(tag) and sim.units[tag].pos.distance_to(initial[tag]) > 0.05:
			moved_holders = true
	return {"fired": fired, "max_lateral": max_lateral, "crossing_y": crossing_y, "moved_holders": moved_holders, "position": [rear.pos.x, rear.pos.y], "ticks": sim.tick}

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var failures: Array = []
	var trials: Array = []
	for mirror in [false, true]:
		var trial = _wall_fixture(mirror)
		trials.append(trial)
		if not trial.fired or trial.max_lateral < 8.5 or absf(trial.crossing_y-32.0) < 9.5:
			failures.append("Rear Rifleman did not find a route around the allied line: " + str(trial))
		if trial.moved_holders:
			failures.append("Detouring unit displaced hold-position allies")
	var repeat = _wall_fixture(false)
	if repeat != trials[0]:
		failures.append("Crowd routing was not deterministic")
	# Dry-map pursuit must use terrain routes rather than walking into a cliff.
	sim.load_scenario_dict({"map": {"width": 96, "height": 64, "obstacles": [{"x": 40, "y": 20, "w": 2, "h": 24}]},
		"units": [{"type": "rifleman", "owner": 1, "x": 30, "y": 32}, {"type": "rifleman", "owner": 2, "x": 58, "y": 32, "hp": 10000}]})
	var shooter = sim.units[1001]
	var target = sim.units[1002]
	sim.issue_command([target.tag], "hold_position")
	sim.issue_command([shooter.tag], "attack_target", target.pos, target.tag)
	var lateral = 0.0
	for _i in range(640):
		sim.step_ticks(1)
		lateral = maxf(lateral, absf(shooter.pos.y-32.0))
		if shooter.damage_dealt > 0:
			break
	if shooter.damage_dealt <= 0 or lateral < 12.0:
		failures.append("Pursuit did not route around dry-map terrain")
	print(JSON.stringify({"trials": trials, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
