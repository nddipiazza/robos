extends SceneTree

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim: Node = root.get_node("SimEngine")
	_test_paid_transit(sim)
	_test_destroyed_exit(sim)
	print("Brood tunnels: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_paid_transit(sim: Node) -> void:
	var west := Vector2(29, 27)
	var east := Vector2(73, 27)
	sim.load_scenario_dict({"paused": true, "map": {"width": 104, "height": 64,
		"obstacles": [{"x": 46, "y": 0, "w": 8, "h": 64}]},
		"players": {"1": {"faction": "monsters", "crystal": 600, "aether": 350}}, "units": [
			{"type": "brood_nest", "owner": 1, "x": 15, "y": 28},
			{"type": "forager", "owner": 1, "x": 29, "y": 32},
			{"type": "forager", "owner": 1, "x": 73, "y": 32}
		]})
	var west_builder: Dictionary = sim.units.values()[1]
	var east_builder: Dictionary = sim.units.values()[2]
	_check(not sim.issue_command([west_builder.tag], "build_tunnel_mouth", west).ok, "Tunnel construction requires the late-tech Spire")
	sim.spawn_unit("blight_spire", 1, Vector2(19, 19))
	_check(not sim.issue_command([west_builder.tag], "build_tunnel_mouth", Vector2(49, 27)).ok, "Reject an impassable entrance site")
	_check(sim.issue_command([west_builder.tag], "build_tunnel_mouth", west).ok, "Pay for the west entrance")
	_check(sim.issue_command([east_builder.tag], "build_tunnel_mouth", east).ok, "Pay for the east entrance")
	sim.step_ticks(700)
	var pair: Array = sim.units.values().filter(func(unit): return unit.unit_type == "tunnel_mouth")
	var player: Dictionary = sim.players[1]
	if not _check(pair.size() == 2 and player.crystal == 350 and player.aether == 200, "Both entrances complete through the paid route"):
		return
	var source: Dictionary = pair[0]
	var exit: Dictionary = pair[1]
	_check(not sim.issue_command([source.tag], "send_tunnel_squad").ok, "An unlinked entrance cannot send")
	_check(not sim.issue_command([source.tag], "link_tunnel", source.pos, source.tag).ok, "No self-links")
	_check(sim.issue_command([source.tag], "link_tunnel", exit.pos, exit.tag).ok and sim.linked_tunnel(exit).tag == source.tag, "Link is symmetric")
	var soldiers: Array = []
	for i in range(8):
		soldiers.append(sim.spawn_unit("skitterling", 1, source.pos + Vector2.from_angle(TAU * i / 8.0) * 5.3))
	var reserve: int = player.supply_used
	var other: Dictionary = sim.spawn_unit("needlewing", 1, source.pos + Vector2(2, 3))
	_check(sim.issue_command([source.tag], "send_tunnel_squad").ok, "Send a nearby squad")
	var squad: Array = source.get("passengers", []).duplicate()
	if not _check(squad.size() == 6 and squad.all(func(unit): return unit.unit_type == "skitterling"), "Six ground troops depart and the flyer stays"):
		return
	_check(sim.units.has(other.tag) and not sim.issue_command([exit.tag], "send_tunnel_squad").ok, "Only one squad can use the link")
	_check(sim.issue_command([sim.units.values()[0].tag], "train_skitterling").ok and player.supply_used == reserve + 3, "Travelers reserve their supply")
	var blockers: Array = []
	for i in range(12):
		var point: Vector2 = exit.pos + Vector2.from_angle(TAU * i / 12.0) * 5.4
		blockers.append(sim.spawn_unit("howitzer_emplaced", 1, point))
	sim.step_ticks(sim.TUNNEL_TRAVEL_TICKS)
	_check(source.get("passengers", []).size() == 6 and squad.all(func(unit): return not sim.units.has(unit.tag)), "Blocked exit keeps the whole squad underground")
	var blocker_tags: Array = blockers.map(func(unit): return unit.tag)
	_check(sim.issue_command(blocker_tags, "mobilize").ok, "Movable blockers can clear the exit")
	_check(sim.issue_command(blocker_tags, "move", Vector2(91, 49)).ok, "Move the blockers away")
	sim.step_ticks(380)
	_check(not source.has("tunnel_arrival") and source.passengers.is_empty(), "The link releases the waiting squad once enough room opens")
	_check(squad.all(func(unit): return sim.units.has(unit.tag) and unit.pos.x > 61.0 and unit.hp == unit.max_hp), "All six original troops cross intact")

func _test_destroyed_exit(sim: Node) -> void:
	sim.load_scenario_dict({"paused": true, "map": {"width": 104, "height": 64}, "units": [
		{"type": "tunnel_mouth", "owner": 1, "x": 26, "y": 26},
		{"type": "tunnel_mouth", "owner": 1, "x": 72, "y": 26, "hp": 1},
		{"type": "skitterling", "owner": 1, "x": 31, "y": 26},
		{"type": "rifleman", "owner": 2, "x": 79, "y": 26},
	]})
	var all: Array = sim.units.values()
	var source: Dictionary = all[0]
	var exit: Dictionary = all[1]
	var soldier: Dictionary = all[2]
	_check(sim.issue_command([source.tag], "link_tunnel", exit.pos, exit.tag).ok, "Create a second link")
	_check(sim.issue_command([source.tag], "send_tunnel_squad").ok, "The soldier departs before the exit is attacked")
	_check(sim.issue_command([all[3].tag], "attack_target", exit.pos, exit.tag).ok, "The enemy attacks the far entrance")
	sim.step_ticks(sim.TUNNEL_TRAVEL_TICKS)
	_check(not sim.units.has(exit.tag) and sim.linked_tunnel(source).is_empty(), "Destroying the exit invalidates the link")
	_check(sim.units.has(soldier.tag) and soldier.pos.distance_to(source.pos) < 6.0, "Surviving source returns the same soldier to clear nearby ground")

func _check(ok: bool, message: String) -> bool:
	if not ok:
		failures.append(message)
	return ok
