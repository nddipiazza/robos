extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_boundary_crossing()
	_test_eligible_troops()
	print("Living ground speed checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _reset_ground() -> void:
	sim.reset_state(42, 112, 72)
	sim.spawn_unit("brood_nest", 2, Vector2(46, 34))
	sim.step_ticks(1600)

func _test_boundary_crossing() -> void:
	_reset_ground()
	var ling: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(18, 42))
	_check(sim.issue_command([ling.tag], "move", Vector2(98, 42)).ok, "An ordinary move crosses living ground")
	sim.step_ticks(20)
	_check(absf(ling.pos.x - 18.0 - 9.8 * 20.0 / 64.0) < 0.04 and is_equal_approx(sim.effective_move_speed(ling), 9.8), "Movement starts at the base speed off the layer")
	sim.step_ticks(40)
	var before: float = ling.pos.x
	_check(sim.active_living_ground_speed_bonus(ling) == 0.3 and ling.hp == ling.max_hp, "A healthy Skitterling activates its bonus on entry")
	sim.step_ticks(64)
	_check(absf(ling.pos.x - before - 12.74) < 0.04 and is_equal_approx(sim.effective_move_speed(ling), 12.74), "The simulation moves 12.74 units in one second inside the layer")
	sim.step_ticks(200)
	before = ling.pos.x
	_check(sim.active_living_ground_speed_bonus(ling) == 0.0, "The bonus switches off at the far edge")
	sim.step_ticks(32)
	_check(absf(ling.pos.x - before - 4.9) < 0.04, "The same move returns to baseline pace after leaving")
	sim.issue_command([ling.tag], "move", Vector2(17, 42))
	sim.step_ticks(128)
	_check(sim.active_living_ground_speed_bonus(ling) == 0.3, "Returning to the layer reapplies the bonus")

func _test_eligible_troops() -> void:
	for test in [
		["bile_crawler", 2, 9.1], ["blight_hurler", 2, 9.36],
		["forager", 2, 7.0], ["pioneer", 1, 7.0], ["kestrel_interceptor", 1, 12.0],
	]:
		_reset_ground()
		var unit: Dictionary = sim.spawn_unit(test[0], test[1], Vector2(34, 46))
		var before: float = unit.pos.x
		sim.issue_command([unit.tag], "move", Vector2(64, 46))
		sim.step_ticks(64)
		_check(sim.has_living_ground(unit.pos) and absf(unit.pos.x - before - float(test[2])) < 0.04, "%s travels at its expected speed on the layer" % test[0])
