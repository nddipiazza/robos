extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 180, "height": 140},
		"players": {"1": {"faction": "aliens", "crystal": 1100, "aether": 1100}, "2": {"faction": "humans"}},
	})
	var home: Dictionary = sim.spawn_unit("heartstone", 1, Vector2(32, 32))
	var other: Dictionary = sim.spawn_unit("heartstone", 1, Vector2(53, 29))
	_check(not sim.issue_command([home.tag], "train_crownspire").ok, "The flagship requires Fleet Spire tech")
	sim.spawn_unit("fleet_spire", 1, Vector2(46, 42))
	_check(sim.issue_command([home.tag], "train_crownspire").ok
		and sim.players[1].crystal == 700 and sim.players[1].aether == 700,
		"The flagship costs 400/400 at a Heartstone")
	_check(not sim.issue_command([other.tag], "train_crownspire").ok, "Other Heartstones cannot queue another flagship")
	sim.step_ticks(125 * sim.TICK_RATE)
	var ships: Array = sim.units.values().filter(func(unit): return unit.unit_type == "crownspire")
	_check(ships.size() == 1 and ships[0].hp == 350.0 and ships[0].shields == 350.0 and ships[0].attributes.has("Heroic"),
		"The flagship deploys at the 5.0.17 durability")
	if not ships.is_empty():
		_test_spells(ships[0])
	print("Ladder Crownspire: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_spells(ship: Dictionary) -> void:
	ship.pos = Vector2(93, 71)
	var ally: Dictionary = sim.spawn_unit("sunblade", 1, Vector2(101, 71))
	var traveler: Dictionary = sim.spawn_unit("mote", 1, Vector2(117, 71))
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(110, 70))
	var enemies: Array[Dictionary] = [air]
	for index in range(4):
		enemies.append(sim.spawn_unit("rifleman", 2, Vector2(105, 64 + index * 3)))
	sim.issue_command(enemies.map(func(unit): return unit.tag), "hold_fire")
	sim.issue_command([ship.tag, ally.tag], "hold_fire")
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	var health: Array = enemies.map(func(unit): return unit.hp)
	_check(sim._execute_weapon_hit(ship, air), "The Purifier Beam can acquire air")
	var hit := 0
	for index in range(enemies.size()):
		if enemies[index].hp < health[index]:
			hit += 1
	_check(hit == 4 and air.hp < health[0], "One volley attacks up to four different targets")
	_check(sim.can_see_unit(2, ally) and sim.issue_command([ship.tag], "flagship_cloak").ok
		and not sim.can_see_unit(2, ally) and sim.can_see_unit(2, ship),
		"The cloak conceals nearby allies while the flagship stays visible")
	var speed: float = sim.effective_move_speed(air)
	_check(sim.issue_command([ship.tag], "time_warp", air.pos).ok
		and sim.effective_move_speed(air) == speed, "Time Warp has an arming delay")
	sim.step_ticks(ceili(Rules.TIME_WARP_ARMING * sim.TICK_RATE))
	_check(is_equal_approx(sim.effective_move_speed(air), speed * 0.6) and sim._attack_speed_multiplier(air) == 0.6,
		"An armed Time Warp slows air movement and attacks")
	_check(sim.issue_command([ship.tag], "flagship_recall", traveler.pos).ok and traveler.is_immobile,
		"Flagship Recall freezes an allied unit during the channel")
	sim.step_ticks(4 * sim.TICK_RATE)
	_check(traveler.pos.distance_to(ship.pos) < 10.0 and not traveler.is_immobile,
		"The recalled unit appears near the flagship and can move again")
	_check(not sim.issue_command([ship.tag], "flagship_recall", traveler.pos).ok, "The flagship has its own recall cooldown")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
