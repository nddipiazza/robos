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
		"players": {"1": {"faction": "aliens", "crystal": 600, "aether": 600}, "2": {"faction": "humans"}},
	})
	var carrier: Dictionary = sim.spawn_unit("fleet_carrier", 1, Vector2(55, 53))
	var target: Dictionary = sim.spawn_unit("colony_hub", 2, Vector2(75, 53))
	var stock: Dictionary = sim.players[1]
	_check(carrier.auto_build_fighters and sim.carrier_fighter_count(carrier) == 4, "Four free fighters start in an automatic hangar")
	_check(sim.issue_command([carrier.tag], "auto_build_fighters").ok and not carrier.auto_build_fighters,
		"The player can disable automatic fighter builds")
	for index in range(4):
		_check(sim.issue_command([carrier.tag], "build_pursuit_fighter").ok, "A fighter slot can be queued")
	_check(stock.crystal == 540 and not sim.issue_command([carrier.tag], "build_pursuit_fighter").ok,
		"Four builds cost 60 crystal and the hangar prevents a ninth fighter")
	sim.issue_command([carrier.tag], "hold_fire")
	sim.step_ticks(12 * sim.TICK_RATE - 1)
	_check(sim.carrier_fighter_count(carrier) == 4, "The first fighter waits the full twelve seconds")
	sim.step_ticks(1)
	_check(sim.carrier_fighter_count(carrier) == 5, "The first fighter finishes before the other queued builds")
	sim.step_ticks(36 * sim.TICK_RATE)
	_check(sim.carrier_fighter_count(carrier) == 8, "The hangar builds the remaining three sequentially")
	sim._refresh_vision()
	var health: float = target.hp
	_check(sim.issue_command([carrier.tag], "attack_target", target.pos, target.tag).ok, "The Carrier can engage an enemy structure")
	sim.step_ticks(sim.TICK_RATE * 4)
	_check(carrier.active_fighters.size() == 8 and target.hp < health and sim.carrier_fighter_count(carrier) == 8,
		"Eight autonomous fighters launch and deal real weapon damage")
	if not carrier.active_fighters.is_empty():
		var fighter: Dictionary = sim.units[carrier.active_fighters[0]]
		_check(not sim.issue_command([fighter.tag], "move", Vector2(90, 72)).ok, "Fighters cannot be controlled individually")
		sim._remove_destroyed_unit(fighter)
		_check(sim.carrier_fighter_count(carrier) == 7, "A destroyed fighter is removed from the hangar count")
	_check(sim.issue_command([carrier.tag], "stop").ok, "Stop recalls active fighters while holding fire")
	sim.step_ticks(sim.TICK_RATE * 3)
	_check(carrier.active_fighters.is_empty() and carrier.fighter_reserve == 7,
		"Survivors return to the hangar (%d active, %d reserved, target %d)" % [
			carrier.active_fighters.size(), carrier.fighter_reserve, carrier.get("fighter_target", 0)])
	_check(sim.issue_command([carrier.tag], "auto_build_fighters").ok, "Automatic replacement can be re-enabled")
	sim.step_ticks(12 * sim.TICK_RATE + 1)
	_check(sim.carrier_fighter_count(carrier) == 8 and stock.crystal == 525, "The destroyed fighter is automatically replaced at full cost")
	print("Fleet Carrier: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
