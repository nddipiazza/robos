extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim: Node = root.get_node("SimEngine")
	_test_airframe(sim)
	_test_cargo(sim)
	print("Airframe and transport: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_airframe(sim: Node) -> void:
	sim.load_scenario_dict({"paused": true, "map": {"width": 104, "height": 64}, "players": {"1": {"aether": 300}}, "units": [
		{"type": "colony_hub", "owner": 1, "x": 12, "y": 24},
		{"type": "pioneer", "owner": 1, "x": 30, "y": 24},
		{"type": "workshop", "owner": 1, "x": 30, "y": 14, "build_progress": 0.9}
	]})
	var worker: Dictionary = sim.units.values()[1]
	var shop: Dictionary = sim.units.values()[2]
	var player: Dictionary = sim.players[1]
	var site := Vector2(34, 29)
	_check(not sim.issue_command([worker.tag], "build_airframe_hangar", site).ok and player.crystal == 400,
		"An incomplete Workshop cannot unlock construction")
	_check(sim.issue_command([worker.tag], "resume_construction", shop.pos, shop.tag).ok, "Finish the Workshop")
	sim.step_ticks(768)
	_check(shop.build_progress >= 1.0, "Workshop completes normally")
	_check(not sim.issue_command([worker.tag], "build_airframe_hangar", shop.pos).ok, "Reject blocked Hangar placement")
	_check(not sim.issue_command([shop.tag], "train_kestrel_interceptor").ok, "The Workshop no longer produces fighters")
	_check(sim.issue_command([worker.tag], "build_airframe_hangar", site).ok, "Accept paid Hangar construction")
	sim.step_ticks(500)
	var hangars: Array = sim.units.values().filter(func(unit): return unit.unit_type == "airframe_hangar")
	if not _check(hangars.size() == 1 and player.crystal == 250 and player.aether == 200, "One Hangar foundation pays its listed price"):
		return
	var hangar: Dictionary = hangars[0]
	_check(not sim.issue_command([hangar.tag], "train_rampart_transport").ok, "An unfinished Hangar cannot train")
	sim.step_ticks(2400)
	_check(hangar.build_progress >= 1.0, "Pioneer completes the Hangar")
	_check(sim.issue_command([hangar.tag], "train_rampart_transport").ok and player.crystal == 150 and player.aether == 100, "Hangar pays for a Rampart")
	sim.step_ticks(1900)
	_check(sim.units.values().any(func(unit): return unit.unit_type == "rampart_transport" and unit.flight_height > 0.0), "A completed paid transport takes flight")
	_check(sim.issue_command([hangar.tag], "train_kestrel_interceptor").ok, "Hangar pays for a Kestrel")
	sim.step_ticks(2500)
	_check(sim.units.values().any(func(unit): return unit.unit_type == "kestrel_interceptor"), "Hangar completes a paid fighter")

func _test_cargo(sim: Node) -> void:
	var initial: Array = [
		{"type": "colony_hub", "owner": 1, "x": 10, "y": 20},
		{"type": "silo", "owner": 1, "x": 19, "y": 12},
		{"type": "rampart_transport", "owner": 1, "x": 27, "y": 26},
		{"type": "pioneer", "owner": 1, "x": 27, "y": 30},
		{"type": "kestrel_interceptor", "owner": 1, "x": 29, "y": 28},
		{"type": "rifleman", "owner": 2, "x": 27, "y": 22},
	]
	for index in range(8):
		initial.append({"type": "rifleman", "owner": 1, "x": 23 + index, "y": 27 + index % 2})
	sim.load_scenario_dict({"paused": true, "map": {"width": 104, "height": 64,
		"obstacles": [{"x": 44, "y": 0, "w": 8, "h": 64}]}, "units": initial})
	var transport: Dictionary = sim.units.values()[2]
	var supply: int = sim.players[1].supply_used
	_check(not sim.issue_command([transport.tag], "unload_transport", Vector2(29, 30)).ok, "Empty transport rejects a drop")
	_check(sim.issue_command([transport.tag], "load_transport").ok, "Nearby friendly infantry board")
	var passengers: Array = transport.get("passengers", []).duplicate()
	if not _check(passengers.size() == 6, "Six slots fill from eligible units"):
		return
	_check(passengers.all(func(unit): return unit.unit_type == "rifleman" and unit.owner == 1 and not sim.units.has(unit.tag)), "Only our nearby ground troops are removed from the field")
	_check(not sim.issue_command([transport.tag], "load_transport").ok, "Full transport does not board more")
	_check(sim.issue_command([sim.units.values()[0].tag], "train_pioneer").ok and sim.players[1].supply_used == supply + 1, "Embarked units still reserve supply after recalculation")
	_check(not sim.issue_command([transport.tag], "unload_transport", Vector2(47, 26)).ok, "Impassable terrain rejects a drop")
	_check(sim.issue_command([transport.tag], "unload_transport", Vector2(65, 26)).ok, "Clear ground on the far side accepts a drop")
	sim.step_ticks(300)
	_check(transport.passengers.is_empty() and transport.pos.x > 60.0, "Aircraft crosses the wall and disembarks")
	for passenger in passengers:
		_check(sim.units.has(passenger.tag) and passenger.pos.x > 56.0 and passenger.hp == passenger.max_hp, "Passenger reappears beyond the wall with its original tag and health")
		for other in passengers:
			if other.tag != passenger.tag:
				_check(passenger.pos.distance_to(other.pos) + 0.01 >= passenger.radius + other.radius, "No two passengers share a drop position")
	_check(sim.issue_command([transport.tag], "load_transport").ok and transport.passengers.size() == 6, "Deployed infantry can board again")
	var enemy: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(66, 26))
	var lost: int = sim.players[1].units_lost
	_check(sim.issue_command([enemy.tag], "attack_target", transport.pos, transport.tag).ok, "Enemy anti-air can target the loaded transport")
	sim.step_ticks(600)
	_check(not sim.units.has(transport.tag) and sim.players[1].units_lost == lost + 7 and enemy.kills == 7,
		"Anti-air destroys the aircraft and all six embarked troops")
	_check(passengers.all(func(unit): return not sim.units.has(unit.tag)) and sim.players[1].supply_used == supply + 1 - 8, "Lost passengers release their supply and cannot reappear")

func _check(ok: bool, message: String) -> bool:
	if not ok:
		failures.append(message)
	return ok
