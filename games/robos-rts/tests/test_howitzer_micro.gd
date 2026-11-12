extends SceneTree

var sim: Node
var commander: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	commander = root.get_node("RTSCommanderAI")
	_test_unsupported_rush()
	_test_retreat()
	_test_cover()
	_test_splash_and_dead_zone()
	_test_hidden_threat()
	_test_skirmish_deployment()
	print("Howitzer micro: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _reset(mode: String = "emplace_defend") -> Dictionary:
	sim.reset_state(42, 96, 64)
	commander.configure_from_scenario([])
	commander.set_directive(1, mode)
	return sim.spawn_unit("howitzer_emplaced", 1, Vector2(30, 30))

func _test_unsupported_rush() -> void:
	var gun := _reset()
	var threat: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(41, 30))
	sim.issue_command([threat.tag], "attack_target", gun.pos, gun.tag)
	sim.step_ticks(8)
	_check(sim._edge_distance(gun, threat) >= 5.0, "The rushing enemy is still outside the dead zone")
	_check(gun.unit_type == "howitzer", "The unsupported gun mobilizes ahead of the breach")
	_check(gun.attack_state == "idle" or gun.attack_target_tag == threat.tag, "The new mode does not inherit a mortar windup")
	sim.step_ticks(30)
	_check(threat.hp < threat.max_hp, "The mobile gun answers the rush")
	_check(gun.unit_type == "howitzer", "The redeploy cooldown keeps the gun mobile after the rush")

func _test_cover() -> void:
	var gun := _reset()
	var threat: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(34, 30))
	for y in [27.5, 30.0, 32.5]:
		var guard: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(27, y))
		guard.weapon_cooldown = 0.18
	sim.step_ticks(8)
	_check(threat.hp == threat.max_hp, "The guards have not fired at the moment of the decision")
	_check(gun.unit_type == "howitzer_emplaced", "A covered Howitzer holds its emplacement")
	sim.step_ticks(65)
	_check(not sim.units.has(threat.tag), "The guards clear the dead zone")

	gun = _reset()
	for y in [28.5, 31.5]:
		var guard: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(27, y))
		guard.weapon_cooldown = 0.18
	for y in [28.5, 30.0, 31.5]:
		var attacker: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(34, y))
		sim.issue_command([attacker.tag], "attack_target", gun.pos, gun.tag)
	sim.step_ticks(8)
	_check(gun.unit_type == "howitzer", "Cover damage is shared across simultaneous breaches")

func _test_retreat() -> void:
	var gun := _reset()
	gun.hp = 20.0
	for y in [28.0, 30.0, 32.0]:
		var enemy: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(34, y))
		sim.issue_command([enemy.tag], "attack_target", gun.pos, gun.tag)
	sim.step_ticks(8)
	var order: Dictionary = gun.orders.front() if not gun.orders.is_empty() else {}
	_check(gun.unit_type == "howitzer" and order.get("type") == "move" and order.target_pos.x < 30.0,
		"A badly outmatched Howitzer mobilizes along a route away from the attackers")

func _test_splash_and_dead_zone() -> void:
	var gun := _reset()
	var foe: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(49, 30))
	var ally: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(49, 38))
	sim.issue_command([ally.tag, foe.tag], "hold_fire")
	sim.step_ticks(2)
	_check(gun.attack_state == "windup", "The gun starts aiming at a clear target")
	ally.pos = Vector2(49, 34.0)
	ally.prev_pos = ally.pos
	ally.home_pos = ally.pos
	sim.step_ticks(26)
	_check(foe.hp == foe.max_hp and ally.hp == ally.max_hp, "An allied footprint entering the blast cancels the shot")
	var clear: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(55, 25))
	sim.issue_command([clear.tag], "hold_fire")
	sim.step_ticks(32)
	_check(clear.hp < clear.max_hp and foe.hp == foe.max_hp, "The gun switches to the clear target")

	gun = _reset("idle")
	foe = sim.spawn_unit("rifleman", 2, Vector2(49, 30))
	sim.issue_command([foe.tag], "hold_fire")
	sim.step_ticks(2)
	foe.pos = Vector2(35, 30)
	foe.prev_pos = foe.pos
	sim.step_ticks(28)
	_check(foe.hp == foe.max_hp, "An enemy entering the dead zone cancels even a player's pending mortar shot")

func _test_hidden_threat() -> void:
	var gun := _reset()
	var threat: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(34, 30))
	sim.issue_command([threat.tag], "burrow")
	sim.step_ticks(24)
	_check(threat.burrowed and not sim.can_see_unit(1, threat), "The test threat is concealed")
	_check(gun.unit_type == "howitzer_emplaced", "The AI ignores a hidden threat")

func _test_skirmish_deployment() -> void:
	sim.reset_state(42, 96, 64)
	commander.configure_from_scenario([])
	commander.set_skirmish_directive(1, "hard", "siege")
	var gun: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(30, 30))
	var foe: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(54, 30))
	sim.issue_command([foe.tag], "hold_fire")
	sim.step_ticks(16)
	_check(gun.unit_type == "howitzer_emplaced", "Skirmish siege AI deploys when it sees a distant target")

func _check(ok: bool, description: String) -> void:
	if not ok:
		failures.append(description)
