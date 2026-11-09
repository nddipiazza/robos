extends SceneTree

var sim: Node
var weapon: Dictionary
var fire_ticks: Array[int] = []
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	weapon = root.get_node("RTSData").get_unit_def("rifleman").weapon
	sim.weapon_attack.connect(_record_fire)
	for command in ["move", "stop"]:
		_test_interrupt_before_impact(command)
		_test_interrupt_after_impact(command)
		_test_queued_command(command)
	_test_alternating_orders(false)
	_test_alternating_orders(true)
	print("Fire and movement timing: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _record_fire(_attacker: Dictionary, _target: Dictionary, _weapon: Dictionary, _hit_shields: bool) -> void:
	fire_ticks.append(sim.tick)

func _windup(surge: bool = false, hold_fire: bool = true) -> Dictionary:
	fire_ticks.clear()
	sim.reset_state(42, 96, 64)
	var shooter: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(25, 30))
	var target: Dictionary = sim.spawn_unit("colony_hub", 2, Vector2(38, 30))
	if hold_fire:
		sim.issue_command([shooter.tag], "hold_fire")
	if surge:
		sim.issue_command([shooter.tag], "surge")
	_check(sim.issue_command([shooter.tag], "attack_target", target.pos, target.tag).ok, "The rifleman receives a valid attack")
	sim.step_ticks(1)
	var windup_ticks := ceili(float(shooter.attack_windup_duration) / sim.TICK_DT)
	sim.step_ticks(windup_ticks - 1)
	_check(shooter.attack_state == "windup" and shooter.attack_state_timer > 0.0 and shooter.attack_state_timer <= sim.TICK_DT and fire_ticks.is_empty(),
		"The fixture is exactly one tick before the shot")
	return shooter

func _order(shooter: Dictionary, command: String, queued: bool = false) -> void:
	_check(sim.issue_command([shooter.tag], command, Vector2(10, 30), 0, "", queued).ok,
		"The %s command is accepted" % command)

func _test_interrupt_before_impact(command: String) -> void:
	var shooter := _windup()
	var origin: Vector2 = shooter.pos
	_order(shooter, command)
	sim.step_ticks(1)
	_check(fire_ticks.is_empty() and shooter.attack_state == "idle" and shooter.weapon_cooldown == 0.0,
		"%s on the last windup tick cancels the shot without spending a cooldown" % command)
	_check((shooter.pos != origin) == (command == "move"), "%s applies on the next simulation tick" % command)

func _test_interrupt_after_impact(command: String) -> void:
	var shooter := _windup()
	sim.step_ticks(1)
	var impact_tick: int = sim.tick
	var origin: Vector2 = shooter.pos
	_check(fire_ticks == [impact_tick] and is_equal_approx(shooter.weapon_cooldown, weapon.period), "Impact starts one full cooldown")
	_order(shooter, command)
	sim.step_ticks(1)
	_check(fire_ticks == [impact_tick] and is_equal_approx(shooter.weapon_cooldown, weapon.period - sim.TICK_DT),
		"%s after impact preserves the shot and its cooldown" % command)
	_check((shooter.pos != origin) == (command == "move"), "%s applies immediately after impact" % command)
	_check(sim.players[1].stutter_step_cancels == (1 if command == "move" else 0),
		"Only movement cuts the backswing")

func _test_queued_command(command: String) -> void:
	var shooter := _windup()
	var impact_tick: int = sim.tick + 1
	_order(shooter, command, true)
	sim.step_ticks(1)
	_check(fire_ticks == [impact_tick], "Queuing %s preserves the shot at its scheduled impact" % command)
	_order(shooter, command, true)
	_check(shooter.orders.size() == 3 and shooter.orders[0].type == "attack_target",
		"Queuing %s preserves the active target order and both queued commands" % command)
	_check(shooter.attack_state == "backswing" and sim.players[1].stutter_step_cancels == 0,
		"Queuing %s leaves the active backswing alone" % command)

func _test_alternating_orders(surge: bool) -> void:
	var shooter := _windup(surge, false)
	var windup_ticks := ceili(float(shooter.attack_windup_duration) / sim.TICK_DT)
	sim.step_ticks(1)
	var impact_tick: int = sim.tick
	var elapsed_per_tick: float = sim.TICK_DT * (1.5 if surge else 1.0)
	var cooldown_ticks := ceili(float(weapon.period) / elapsed_per_tick)
	var cooldown_preserved := true
	for elapsed in range(1, cooldown_ticks):
		_order(shooter, "move" if elapsed % 2 == 1 else "stop")
		sim.step_ticks(1)
		cooldown_preserved = cooldown_preserved and is_equal_approx(shooter.weapon_cooldown, weapon.period - elapsed * elapsed_per_tick)
	_check(cooldown_preserved and fire_ticks == [impact_tick],
		"Alternating move and stop retains the original cooldown until it expires (Surge %s)" % surge)
	_order(shooter, "stop")
	sim.step_ticks(1)
	_check(shooter.attack_state == "windup" and shooter.weapon_cooldown == 0.0,
		"The first ready tick begins a new windup (Surge %s)" % surge)
	sim.step_ticks(windup_ticks)
	_check(fire_ticks == [impact_tick, impact_tick + cooldown_ticks + windup_ticks],
		"The next shot fires on the first eligible impact tick (Surge %s)" % surge)
