extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim: Node = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_burst_pulses(sim)
	print("PASS test_lattice_burst")
	quit(0)

func _test_burst_pulses(sim: Node) -> void:
	sim.reset_state(42, 96, 64)
	var caster: Dictionary = sim.spawn_unit("aegis_warden", 1, Vector2(28, 32))
	var center := Vector2(42, 32)
	sim.step_ticks(1)
	var initial_energy: float = caster.energy
	assert(not sim.issue_command([caster.tag], "lattice_burst", center).ok, "Starting energy cannot fund the burst")
	assert(caster.energy == initial_energy and sim.visible_lattice_bursts(1).is_empty())
	sim.step_ticks(25 * 64 - 1)
	assert(caster.energy == 75.0, "The Warden earns the cost through normal regeneration")

	var ally: Dictionary = sim.spawn_unit("aegis_warden", 1, Vector2(39, 31))
	var enemy: Dictionary = sim.spawn_unit("breacher", 2, Vector2(42, 29))
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(44, 32))
	var runner: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(46, 33))
	var outside: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(48, 30))
	var structure: Dictionary = sim.spawn_unit("silo_retracted", 2, Vector2(43, 35))
	sim._start_vision(true)
	for unit in [enemy, air, runner, outside]:
		assert(sim.issue_command([unit.tag], "hold_fire").ok)

	assert(not sim.issue_command([runner.tag], "lattice_burst", center).ok, "The cast is Warden-only")
	assert(not sim.issue_command([caster.tag], "lattice_burst", Vector2(46, 22)).ok, "A visible point beyond cast range is rejected")
	assert(caster.energy == 75.0 and sim.visible_lattice_bursts(1).is_empty())
	assert(sim.issue_command([caster.tag], "lattice_burst", center).ok)
	assert(caster.energy == 0.0 and not sim.issue_command([caster.tag], "phase_barrier", Vector2(30, 25)).ok,
		"An accepted cast consumes the shared energy pool")
	var zones: Array = sim.visible_lattice_bursts(1)
	assert(zones.size() == 1 and zones[0].warning and zones[0].radius == 5.0 and zones[0].ticks == 64)
	assert(sim.visible_lattice_bursts(2).size() == 1 and sim.visible_lattice_bursts(3).is_empty(),
		"An opposing player can see the warning only where that player has vision")

	assert(sim.issue_command([runner.tag], "move", Vector2(54, 33)).ok)
	sim.step_ticks(63)
	assert(runner.pos.distance_to(center) > 5.0 and runner.hp == runner.max_hp)
	assert(ally.shields == 75.0 and enemy.hp == 125.0 and air.hp == 125.0, "The warning itself deals no damage")
	assert(sim.visible_lattice_bursts(1)[0].ticks == 1)

	sim.step_ticks(1)
	zones = sim.visible_lattice_bursts(1)
	assert(not zones[0].warning and zones[0].ticks == 128, "The first pulse starts exactly when the warning ends")
	assert(ally.shields == 57.0 and enemy.hp == 108.0 and air.hp == 108.0, "The pulse damages allied shields, enemy ground and enemy air")
	assert(runner.hp == runner.max_hp and outside.hp == outside.max_hp and structure.hp == structure.max_hp,
		"Units that left or started outside and structures inside stay unharmed")

	assert(sim.issue_command([air.tag], "move", Vector2(55, 32)).ok)
	sim.step_ticks(31)
	assert(ally.shields == 57.0 and enemy.hp == 108.0 and air.hp == 108.0)
	sim.step_ticks(1)
	assert(ally.shields == 39.0 and enemy.hp == 91.0 and air.hp == 108.0, "Aircraft can escape the active zone before its next pulse")
	sim.step_ticks(96)
	assert(sim.visible_lattice_bursts(1).is_empty(), "The zone disappears at the end of its active time")
	assert(ally.shields == 3.0 and enemy.hp == 57.0 and air.hp == 108.0, "Exactly four pulses can hit units that stay in the field")
	assert(runner.hp == runner.max_hp and outside.hp == outside.max_hp and structure.hp == structure.max_hp)
