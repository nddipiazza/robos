extends SceneTree

var sim: Node
var battle: Node
var failures: Array[String] = []
var tested_ticks: Array[int] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		printerr("Input load test requires a rendered Godot window")
		quit(1)
		return
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "human"
	var scenario: Dictionary = {
		"name": "Live input under load", "paused": true, "decor": false,
		"map": {"width": 104, "height": 72},
		"units": [
			{"type": "rifleman", "owner": 1, "x": 26, "y": 23, "count": 8},
			{"id": "target", "type": "howitzer_emplaced", "owner": 2, "x": 40, "y": 25},
			{"type": "rifleman", "owner": 1, "x": 56, "y": 31, "count": 32},
			{"type": "skirmisher", "owner": 2, "x": 74, "y": 31, "count": 32}
		]
	}
	sim.load_scenario_dict(scenario)
	battle = load("res://scenes/RTSMain.tscn").instantiate()
	root.add_child(battle)
	battle.world_3d.set_focus(Vector2(49, 29), 57.0)
	var squad: Array[Dictionary] = []
	var tags: Array[int] = []
	var target: Dictionary = {}
	for unit in sim.units.values():
		if unit.owner == 1 and unit.pos.x < 40.0:
			unit.hold_fire = true
			squad.append(unit)
			tags.append(unit.tag)
		elif unit.id == "target":
			target = unit
	battle._select_tags(tags)
	await process_frame
	if not battle.icons.is_ready:
		await battle.icons.icons_ready
	sim.paused = false
	for _i in range(24):
		await sim.simulation_ticked
	_check(sim.recent_events.size() >= 12, "The stress fixture has an active battle")

	var before: Array = squad.map(func(unit): return unit.pos)
	var registered := _dispatch("M", "move", Vector2(38, 24), 0.0, tags)
	await sim.simulation_ticked
	_check_next_tick(registered)
	for i in range(squad.size()):
		_check(squad[i].pos.x > before[i].x and squad[i].orders[0].type == "move", "The next step moves squad member %s" % squad[i].tag)

	registered = _dispatch("A", "attack_target", target.pos, 1.25, tags)
	await sim.simulation_ticked
	_check_next_tick(registered)
	for unit in squad:
		_check(unit.attack_state == "windup" and unit.attack_target_tag == target.tag, "The next step winds up the explicit attack for %s" % unit.tag)

	registered = _dispatch("S", "stop", Vector2.INF, 0.0, tags)
	await sim.simulation_ticked
	_check_next_tick(registered)
	for unit in squad:
		_check(unit.orders.is_empty() and unit.vel.is_zero_approx() and unit.attack_state == "idle", "The next step stops squad member %s" % unit.tag)
	_check(sim.sim_speed == 1.0 and sim.manual_step_requests == 0, "The fixture ran at normal speed on the frame clock")
	print(JSON.stringify({"input_ticks": tested_ticks, "battle_units": sim.units.size(), "failures": failures}))
	sim.paused = true
	battle.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)

func _dispatch(key: String, command: String, point: Vector2, height: float, tags: Array[int]) -> int:
	var count: int = sim.command_history.size()
	battle.inject_input({"type": "key", "key": key})
	battle.inject_input({"type": "key", "key": key, "pressed": false})
	if point.is_finite():
		var screen: Vector2 = battle.world_to_screen(point, height)
		battle.inject_input({"type": "mouse_button", "x": screen.x, "y": screen.y})
		battle.inject_input({"type": "mouse_button", "x": screen.x, "y": screen.y, "pressed": false})
	_check(sim.command_history.size() == count + 1, "%s registers exactly once" % command)
	if sim.command_history.size() > count:
		var accepted: Dictionary = sim.command_history.back()
		_check(accepted.cmd == command and accepted.tags == tags and accepted.tick == sim.tick, "%s registers for the selected squad at the input tick" % command)
	return sim.tick

func _check_next_tick(registered: int) -> void:
	tested_ticks.append(sim.tick - registered)
	_check(sim.tick == registered + 1, "Command is visible in the first simulation step after input")

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)
