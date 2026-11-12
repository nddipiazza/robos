extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

var sim: Node
var data: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	data = root.get_node("RTSData")
	_test_hall_and_module()
	_test_workshop_queue()
	_test_landing_validation()
	_test_targeting_and_victory()
	_test_ladder_module_swap()
	print("Relocatable production checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok

func _stock() -> Vector2i:
	return Vector2i(sim.players[1].crystal, sim.players[1].aether)

func _unit(id: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.id == id:
			return unit
	return {}

func _load(units: Array, map: Dictionary = {}, match_enabled: bool = false) -> void:
	var size := {"width": 112, "height": 72}
	size.merge(map, true)
	sim.load_scenario_dict({
		"paused": true, "victory": "all_structures" if match_enabled else "",
		"map": size, "units": units,
		"players": {"1": {"crystal": 900, "aether": 900}},
	})

func _step_until_grounded(producer: Dictionary) -> void:
	for _step in range(4096):
		sim.step_ticks(1)
		if producer.flight_height <= 0.0 or producer.orders.is_empty():
			break

func _finish_module(producer: Dictionary) -> Dictionary:
	var attachment: Dictionary = sim.production_attachment(producer, false)
	if attachment.is_empty():
		return {}
	sim.step_ticks(ceili(float(attachment.build_total_time) / sim.TICK_DT))
	return sim.production_attachment(producer)

func _test_ladder_module_swap() -> void:
	sim.load_scenario_dict({"ruleset": Rules.ID, "paused": true, "map": {"width": 112, "height": 72},
		"players": {"1": {"faction": "humans", "crystal": 900, "aether": 900}, "2": {"faction": "humans"}}})
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(28, 29))
	var hangar: Dictionary = sim.spawn_unit("airframe_hangar", 2, Vector2(42, 29))
	sim._refresh_vision()
	_check(sim.issue_command([hall.tag], "attach_research_module").ok, "The ladder Hall builds a module")
	var module := _finish_module(hall)
	if not _check(not module.is_empty(), "The ladder module completes"):
		return
	_check(sim.research_module_abilities(module).has("research_combat_shields")
		and sim.issue_command([module.tag], "research_combat_shields").ok, "The Hall module offers infantry research")
	var paid := _stock()
	_check(not sim.issue_command([hall.tag], "lift").ok, "A researching module prevents lift")
	_check(sim.issue_command([module.tag], "cancel_training", Vector2.ZERO, 0, "0").ok
		and _stock() == paid + Vector2i(100, 100), "Cancel on the module refunds the waiting research")
	var original: Vector2 = hall.pos
	_check(sim.issue_command([hall.tag], "lift").ok and sim.issue_command([hangar.tag], "lift").ok, "Both production hulls lift")
	sim.step_ticks(64)
	_check(not module.has("attachment_parent_tag") and sim.research_module_abilities(module).is_empty(),
		"The abandoned module offers no research")
	_check(sim.issue_command([hangar.tag], "land", original + Vector2(0.7, 0.3)).ok, "A rival Hangar can land at the module")
	_step_until_grounded(hangar)
	_check(hangar.pos == original and module.owner == 2 and sim.production_attachment(hangar).get("tag") == module.tag
		and sim.research_module_abilities(module).has("research_harrier_cloaking")
		and not sim.research_module_abilities(module).has("research_combat_shields"), "The Hangar claims the module and changes its research options")

func _test_hall_and_module() -> void:
	_load([
		{"type": "colony_hub", "x": 16, "y": 18},
		{"id": "hall", "type": "muster_hall", "x": 30, "y": 29},
	])
	var hall := _unit("hall")
	var original: Vector2 = hall.pos
	var rally := Vector2(54, 37)
	_check(sim._is_point_blocked_by_static(original, 0.85) and not sim.issue_command([hall.tag], "move", Vector2(52, 29)).ok,
		"A grounded Hall blocks its footprint and cannot move")
	_check(sim.issue_command([hall.tag], "rally", rally).ok and sim.issue_command([hall.tag], "attach_fabrication_module").ok,
		"Set a ground rally and pay for the adjacent module")
	_check(not sim.issue_command([hall.tag], "lift").ok, "Lift does not abandon an unfinished paid attachment")
	var module := _finish_module(hall)
	if not _check(not module.is_empty(), "The Fabrication Module completes"):
		return
	for _slot in range(2):
		_check(sim.issue_command([hall.tag], "train_rifleman").ok, "Pay for both light infantry jobs")
	sim.step_ticks(48)
	var queue: Array = hall.production_queue
	var front: Dictionary = queue[0]
	var second: Dictionary = queue[1]
	var paid := _stock()
	var progress: float = front.progress
	_check(progress > 0.0 and second.progress == progress, "Both paid jobs are active before lift")
	_check(sim.issue_command([hall.tag], "lift").ok and hall.flight_height == 0.0 and hall.has("flight_transition"),
		"Liftoff begins while the Hall is still grounded")
	var lift_ticks := ceili(float(data.get_unit_def("muster_hall").lift_duration_ms) * sim.TICK_RATE / 1000.0)
	sim.step_ticks(lift_ticks - 1)
	_check(hall.flight_height == 0.0 and sim._is_point_blocked_by_static(original, 0.85) and front.progress == progress
		and not sim.issue_command([hall.tag], "move", Vector2(48, 29)).ok
		and sim.unit_visual_elevation(hall) > 0.0, "The ascending Hall retains its footprint and pauses movement and production")
	sim.step_ticks(1)
	_check(hall.flight_height > 0.0 and hall.is_structure
		and sim.units.has(module.tag) and not module.has("attachment_parent_tag"),
		"The same structure takes off and leaves its finished module on the ground")
	_check(sim.issue_command([hall.tag], "move", Vector2(48, 29)).ok, "The Hall moves only after takeoff")
	sim.step_ticks(512)
	_check(hall.pos.x > 44.0 and not sim._is_point_blocked_by_static(original, 0.85), "Moving airborne frees the original ground footprint")
	_check(front.progress == progress and second.progress == progress and hall.rally_route[0].pos == rally
		and _stock() == paid and sim.players[1].supply_used == 2,
		"Flight preserves paid progress, exact resources, supply, and rally")
	var near_pad := original + Vector2(0.9, 0.5)
	_check(sim.issue_command([hall.tag], "land", near_pad).ok and hall.flight_height > 0.0
		and hall.orders.front().target_pos == original, "Landing travels to the snapped site beside its compatible module")
	for _i in range(4096):
		if hall.has("flight_transition") or hall.orders.is_empty():
			break
		sim.step_ticks(1)
	_check(hall.has("flight_transition"), "The Hall starts descending once it reaches the site")
	var land_ticks := ceili(float(data.get_unit_def("muster_hall").land_duration_ms) * sim.TICK_RATE / 1000.0)
	sim.step_ticks(land_ticks - 1)
	_check(hall.flight_height > 0.0 and front.progress == progress and sim.unit_visual_elevation(hall) < hall.flight_height,
		"The descending Hall remains airborne and pauses production through the configured delay")
	_step_until_grounded(hall)
	_check(hall.pos == original and hall.flight_height == 0.0 and sim.production_attachment(hall).get("tag") == module.tag
		and sim._is_point_blocked_by_static(original, 0.85), "Touchdown restores the footprint and reconnects the existing module")
	sim.step_ticks(1)
	_check(front.progress > progress and second.progress > progress and _stock() == paid,
		"The same paid jobs resume in both lines after landing without another charge")

func _test_workshop_queue() -> void:
	_load([
		{"type": "colony_hub", "x": 16, "y": 18},
		{"id": "workshop", "type": "workshop", "x": 30, "y": 30},
	])
	var workshop := _unit("workshop")
	_check(sim.issue_command([workshop.tag], "research_weapons").ok and sim.issue_command([workshop.tag], "train_howitzer").ok,
		"The Workshop pays for research and a waiting unit")
	sim.step_ticks(96)
	var job: Dictionary = workshop.production_queue.front()
	var progress: float = job.progress
	var paid := _stock()
	var unit: Dictionary = data.get_unit_def("howitzer")
	_check(sim.issue_command([workshop.tag], "lift").ok, "The Workshop can lift")
	_check(not sim.issue_command([workshop.tag], "train_howitzer").ok and not sim.issue_command([workshop.tag], "research_armor").ok
		and _stock() == paid, "Airborne production rejects new payments")
	_check(sim.issue_command([workshop.tag], "cancel_training", Vector2.ZERO, 0, "1").ok
		and _stock() == paid + Vector2i(unit.crystal_cost, unit.aether_cost) and sim.players[1].supply_used == 0,
		"A waiting airborne job can be refunded at exact cost")
	sim.step_ticks(ceili(float(data.get_unit_def("workshop").lift_duration_ms) * sim.TICK_RATE / 1000.0))
	_check(sim.issue_command([workshop.tag], "land", Vector2(60, 33)).ok, "A clear landing point accepts the Workshop")
	_step_until_grounded(workshop)
	_check(workshop.flight_height == 0.0 and workshop.pos == Vector2(60, 33) and job.progress == progress,
		"Moving to the new site keeps the remaining research at its exact saved progress")
	sim.step_ticks(ceili((float(job.total_time) - progress) / sim.TICK_DT))
	_check(sim.players[1].upgrades.weapons == 1 and workshop.production_queue.is_empty(),
		"The original research completes from the new ground site")

func _test_landing_validation() -> void:
	_load([
		{"id": "hall", "type": "muster_hall", "x": 30, "y": 30},
		{"type": "silo", "x": 54, "y": 44},
		{"type": "pioneer", "x": 69, "y": 44},
	], {"water_channels": [{"width": 5, "points": [[46, 0], [46, 72]]}]})
	var hall := _unit("hall")
	_check(sim.issue_command([hall.tag], "lift").ok, "Lift before testing landing sites")
	sim.step_ticks(ceili(float(data.get_unit_def("muster_hall").lift_duration_ms) * sim.TICK_RATE / 1000.0))
	sim.spawn_resource("crystal_field", Vector2(58, 14))
	for point in [Vector2(46, 30), Vector2(1, 30), Vector2(54, 44), Vector2(69, 44), Vector2(58, 14)]:
		_check(not sim.issue_command([hall.tag], "land", point).ok and hall.orders.is_empty(),
			"Water, edge, structure, mobile, and deposit footprints reject landing at %s" % point)
	var destination := Vector2(60, 29)
	_check(sim.issue_command([hall.tag], "land", destination).ok, "Initially empty ground accepts a travel order")
	var blocker: Dictionary = sim.spawn_unit("pioneer", 1, destination)
	_step_until_grounded(hall)
	_check(hall.flight_height > 0.0 and hall.pos.distance_to(destination) < 1.0 and hall.orders.is_empty(),
		"A unit entering during travel prevents touchdown and leaves the Hall airborne")
	sim.issue_command([blocker.tag], "move", Vector2(69, 30))
	sim.step_ticks(128)
	_check(sim.issue_command([hall.tag], "land", destination).ok, "The site can be retried once the blocker leaves")
	sim.step_ticks(1)
	_check(hall.get("flight_transition", {}).get("kind") == "land", "Clear ground starts descent")
	var late_blocker: Dictionary = sim.spawn_unit("pioneer", 1, destination)
	_step_until_grounded(hall)
	_check(hall.flight_height > 0.0 and hall.get("flight_transition", {}).get("kind") == "abort",
		"A unit entering during descent makes the Hall climb away")
	sim.issue_command([late_blocker.tag], "move", Vector2(69, 25))
	sim.step_ticks(128)
	_check(sim.issue_command([hall.tag], "land", destination).ok, "An aborted landing can be retried")
	_step_until_grounded(hall)
	_check(hall.flight_height == 0.0 and hall.pos == destination, "The Hall crosses water in flight and lands on clear ground")
	var enemy_module: Dictionary = sim.spawn_unit("research_module", 2, destination + sim.ATTACHMENT_PAD_OFFSET)
	var beside_enemy := destination + Vector2(-0.5, 0.6)
	_check(sim.issue_command([hall.tag], "lift").ok, "The Hall can take off again")
	sim.step_ticks(ceili(float(data.get_unit_def("muster_hall").lift_duration_ms) * sim.TICK_RATE / 1000.0))
	_check(sim.issue_command([hall.tag], "land", beside_enemy).ok,
		"Clear land beside an enemy module remains usable")
	_step_until_grounded(hall)
	_check(hall.pos == beside_enemy and sim.production_attachment(hall).is_empty() and not enemy_module.has("attachment_parent_tag"),
		"Landing does not snap to or take ownership of an enemy module")

func _test_targeting_and_victory() -> void:
	_load([
		{"id": "hall", "type": "muster_hall", "x": 33, "y": 32, "hp": 1},
		{"type": "colony_hub", "owner": 2, "x": 92, "y": 53},
		{"id": "gun", "type": "howitzer_emplaced", "owner": 2, "x": 55, "y": 32},
		{"id": "interceptor", "type": "kestrel_interceptor", "owner": 2, "x": 45, "y": 35},
	], {}, true)
	var hall := _unit("hall")
	var gun := _unit("gun")
	var interceptor := _unit("interceptor")
	sim.issue_command([gun.tag, interceptor.tag], "hold_fire")
	_check(sim.issue_command([hall.tag], "lift").ok, "The Hall starts taking off")
	sim.step_ticks(ceili(float(data.get_unit_def("muster_hall").lift_duration_ms) * sim.TICK_RATE / 1000.0) - 2)
	_check(sim.issue_command([gun.tag], "attack_target", hall.pos, hall.tag).ok, "Ground artillery can still acquire a structure taking off")
	sim.step_ticks(1)
	_check(gun.attack_state == "windup" and hall.flight_height == 0.0, "The gun winds up before takeoff completes")
	sim.step_ticks(40)
	_check(sim.units.has(hall.tag) and hall.hp == 1.0 and gun.weapon_cooldown == 0.0
		and not sim.issue_command([gun.tag], "attack_target", hall.pos, hall.tag).ok,
		"The lifted hull is immune to ground-only attacks and a lost windup spends no cooldown")
	_check(sim.match_state.status == "playing", "The final owned structure still counts for annihilation while airborne")
	_check(sim.issue_command([interceptor.tag], "attack_target", hall.pos, hall.tag).ok, "The interceptor can acquire the airborne hull")
	sim.step_ticks(32)
	_check(not sim.units.has(hall.tag) and sim.match_state.status == "finished" and sim.match_state.winner == 2,
		"Actual anti-air damage destroys the final airborne structure and resolves the match")
