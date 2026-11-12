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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 210, "height": 140},
		"players": {"1": {"faction": "monsters", "crystal": 600, "aether": 600}, "2": {"faction": "humans"}},
	})
	var network: Dictionary = sim.spawn_unit("tunnel_mouth", 1, Vector2(36, 45))
	var remote := Vector2(125, 75)
	var stock: Dictionary = sim.players[1]
	sim._refresh_vision()
	_check(not sim.issue_command([network.tag], "summon_brood_worm", remote).ok and stock.crystal == 600,
		"Network cannot summon a Worm in fog")
	sim.spawn_unit("drift_sac", 1, remote + Vector2(0, -12))
	sim._refresh_vision()
	_check(sim.issue_command([network.tag], "summon_brood_worm", remote).ok
		and stock.crystal == 525 and stock.aether == 525, "A visible clear Worm site costs 75/75")
	var worms: Array = sim.units.values().filter(func(unit): return unit.unit_type == "brood_tunnel_worm")
	if worms.is_empty():
		print("Brood Tunnel Network: ", failures)
		quit(1)
		return
	var worm: Dictionary = worms[0]
	_check(worm.build_progress < 1.0 and worm.armor == 3.0, "An emerging Worm has temporary armor")
	_check(not sim.issue_command([network.tag], "summon_brood_worm", remote + Vector2(6, -8)).ok,
		"A network cannot grow two simultaneous Worms")
	var ling: Dictionary = sim.spawn_unit("skitterling", 1, network.pos + Vector2(-5.3, 0))
	var worker: Dictionary = sim.spawn_unit("forager", 1, network.pos + Vector2(0, -5.3))
	var air: Dictionary = sim.spawn_unit("needlewing", 1, network.pos + Vector2(0, 6))
	var supply: float = stock.supply_used
	_check(not sim.can_enter_brood_tunnel(air, network) and not sim.can_enter_brood_tunnel(ling, worm), "Aircraft and incomplete entrances cannot load")
	_check(sim.issue_command([ling.tag], "enter_brood_tunnel", network.pos, network.tag).ok
		and sim.issue_command([network.tag], "load_brood_tunnel", worker.pos, worker.tag).ok,
		"Right-click and endpoint Load both order eligible ground units to enter")
	sim.step_ticks(ceili(Rules.BROOD_TUNNEL_WORM_SECONDS * sim.TICK_RATE))
	_check(worm.build_progress == 1.0 and worm.armor == 1.0, "A Worm emerges after 14.29 seconds")
	_check(sim.brood_tunnel_cargo_count(network) == 2 and sim.brood_tunnel_cargo_count(worm) == 2
		and not sim.units.has(ling.tag) and not sim.units.has(worker.tag) and stock.supply_used == supply,
		"All endpoints share cargo and preserve passenger supply")
	sim._remove_destroyed_unit(network)
	_check(sim.brood_tunnel_cargo_count(worm) == 2, "A surviving endpoint retains cargo after the network dies")
	_check(sim.issue_command([worm.tag], "unload_brood_tunnel").ok, "The remote endpoint starts unloading")
	var interval: int = ceili(Rules.BROOD_TUNNEL_UNLOAD_SECONDS * sim.TICK_RATE)
	sim.step_ticks(interval - 1)
	_check(sim.brood_tunnel_cargo_count(worm) == 2, "The first passenger waits for the unload delay")
	sim.step_ticks(1)
	_check(sim.units.has(ling.tag) and ling.pos.distance_to(remote) <= 10.8
		and sim.brood_tunnel_cargo_count(worm) == 1, "The first passenger exits near the remote Worm")
	sim.step_ticks(interval)
	_check(sim.units.has(worker.tag) and worker.pos.distance_to(remote) <= 10.8
		and sim.brood_tunnel_cargo_count(worm) == 0 and stock.supply_used == supply,
		"The second passenger exits on the next interval without changing supply")
	_check(sim.issue_command([worker.tag], "enter_brood_tunnel", worm.pos, worm.tag).ok, "An unloaded unit can enter again")
	sim.step_ticks(sim.TICK_RATE * 2)
	_check(sim.brood_tunnel_cargo_count(worm) == 1, "Passenger boards the last endpoint")
	sim._remove_destroyed_unit(worm)
	_check(not sim.units.has(worker.tag) and not sim.brood_tunnel_cargo.has(1) and stock.supply_used == supply - 1,
		"Destruction of the last endpoint destroys cargo and releases its supply")
	print("Brood Tunnel Network: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
