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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 230, "height": 180},
		"players": {"1": {"faction": "humans", "crystal": 1500, "aether": 900}, "2": {"faction": "aliens"}},
		"resources": [{"type": "crystal_field", "x": 42, "y": 35, "amount": 900}],
	})
	var orbital: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(30, 35))
	sim.spawn_unit("heartstone", 2, Vector2(210, 163))
	_check(orbital.energy == 0.0 and not sim.issue_command([orbital.tag], "recon_sweep", Vector2(100, 75)).ok,
		"Ordinary Colony Hubs start without orbital abilities")
	_check(not sim.issue_command([orbital.tag], "upgrade_hub").ok, "Operations requires a completed Muster Hall")
	sim.spawn_unit("muster_hall", 1, Vector2(26, 52))
	_check(sim.issue_command([orbital.tag], "upgrade_hub").ok and sim.players[1].crystal == 1350 and sim.players[1].aether == 900,
		"Operations conversion costs 150 crystal and no aether")
	_check(not sim.issue_command([orbital.tag], "lift").ok, "A Hub cannot lift during conversion")
	_step(35.0)
	_check(orbital.get("hub_operations", false) and orbital.energy == 50.0, "Operations finishes with 50 energy")
	_test_prospector(orbital)
	_test_radar_and_reinforcement(orbital)
	_test_fortification()
	_test_repair()
	_test_rich_extractors()
	print("Meridian operations: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_prospector(orbital: Dictionary) -> void:
	sim._refresh_vision()
	var deposits: Array = sim.resources.values()
	_check(deposits.size() == 1, "The fixture has a crystal deposit")
	if deposits.size() != 1:
		return
	var deposit: Dictionary = deposits[0]
	_check(sim.issue_command([orbital.tag], "deploy_prospector", deposit.pos, deposit.tag).ok and orbital.energy == 0.0,
		"Operations spends 50 energy on a Prospector")
	var prospectors: Array = sim.units.values().filter(func(unit): return unit.unit_type == "prospector")
	_check(prospectors.size() == 1, "The deployment creates one Prospector")
	if prospectors.is_empty():
		return
	var helper: Dictionary = prospectors[0]
	_check(helper.hp == 60.0 and helper.expires_tick == sim.tick + Rules.PROSPECTOR_LADDER_SECONDS * sim.TICK_RATE
		and helper.orders[0].target_tag == deposit.tag, "The mining machine starts harvesting and expires after 63 seconds")
	_step(9.0)
	_check(sim.players[1].crystal_collected >= 25 and sim.players[1].crystal_collected % 25 == 0,
		"The Prospector returns 25 crystal per delivery")

func _test_radar_and_reinforcement(orbital: Dictionary) -> void:
	var beacon: Dictionary = sim.spawn_unit("radar_beacon", 1, Vector2(95, 68))
	var intruder: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(135, 68))
	var cloaked: Dictionary = sim.spawn_unit("duskblade", 2, Vector2(135, 73))
	sim.issue_command([intruder.tag, cloaked.tag], "hold_fire")
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim.radar_contacts(1) == PackedVector2Array([intruder.pos]) and not sim.can_see_unit(1, intruder),
		"Radar pings the ordinary intruder without targetable vision or cloak detection")
	orbital.energy = 100.0
	_check(sim.issue_command([orbital.tag], "recon_sweep", intruder.pos).ok and sim.can_see_unit(1, intruder)
		and sim.can_see_unit(1, cloaked) and sim.radar_contacts(1).is_empty(), "Recon Sweep provides vision and cloak detection")
	_check(sim.vision.sweeps_for(1)[0].radius == Rules.LADDER_SWEEP_RADIUS, "Sweep uses the ladder radius")
	var silo: Dictionary = sim.spawn_unit("silo", 1, Vector2(32, 66))
	silo.hp = 197.0
	_check(sim.issue_command([orbital.tag], "reinforce_supply", silo.pos, silo.tag).ok and silo.hp == 500.0
		and silo.max_hp == 500.0 and sim.supply_from(silo) == 16, "Supply reinforcement heals to 500 HP and adds eight supply")
	_step(Rules.LADDER_SWEEP_SECONDS)
	sim._refresh_vision()
	_check(not sim.can_see_unit(1, intruder) and sim.radar_contacts(1).has(intruder.pos), "Sweep expiry restores fog and the radar blip")
	_check(sim.issue_command([beacon.tag], "salvage").ok, "Radar Beacon can salvage")
	var crystal: int = sim.players[1].crystal
	var aether: int = sim.players[1].aether
	var gathered: int = sim.players[1].crystal_collected
	sim.step_ticks(sim.salvage_duration_ticks())
	_check(not sim.units.has(beacon.tag) and sim.players[1].crystal == crystal + 75 + (sim.players[1].crystal_collected - gathered)
		and sim.players[1].aether == aether + 37, "Beacon refunds 75% of both resources")

func _test_fortification() -> void:
	var hub: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(55, 115))
	_check(not sim.issue_command([hub.tag], "fortify_hub").ok, "Fortification requires a Field Armory")
	sim.spawn_unit("field_armory", 1, Vector2(39, 126))
	for offset in [Vector2(5.8, 0), Vector2(-5.8, 0), Vector2(0, 5.8), Vector2(0, -5.8), Vector2(5, 5), Vector2(-5, -5)]:
		sim.spawn_unit("pioneer", 1, hub.pos + offset)
	sim._rebuild_spatial_grid()
	_check(sim.issue_command([hub.tag], "load_hub_workers").ok and sim.transport_slots_used(hub) == 5,
		"The grounded Hub shelters at most five Pioneers")
	_check(sim.issue_command([hub.tag], "fortify_hub").ok and not sim.issue_command([hub.tag], "upgrade_hub").ok,
		"Fortification and Operations are mutually exclusive")
	_step(Rules.FORTIFICATION_OFFER.time)
	_check(hub.unit_type == "fortified_hub" and hub.armor == 2.0 and not sim.issue_command([hub.tag], "lift").ok,
		"Fortification arms the structure and removes flight")
	_check(sim.is_dropoff(hub, 1) and sim.issue_command([hub.tag], "train_pioneer").ok and sim.supply_from(hub) == 15,
		"Fortification retains deposit, Pioneer production and supply")
	_check(sim.issue_command([hub.tag], "unload_hub_workers").ok and hub.passengers.is_empty(), "The fortification can release sheltered workers")
	var ground: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(68, 115))
	var flyer: Dictionary = sim.spawn_unit("dawn_interceptor", 2, Vector2(69, 115))
	_check(sim.can_attack(hub, ground) and not sim.can_attack(hub, flyer), "Fortification's defense cannon targets ground only")

func _test_repair() -> void:
	var armory: Dictionary = sim.spawn_unit("vehicle_armory", 1, Vector2(88, 136))
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(93, 136))
	armory.hp -= 100.0
	var initial: float = armory.hp
	var balance: int = sim.players[1].aether
	_check(sim.issue_command([worker.tag], "repair", armory.pos, armory.tag).ok, "Pioneer accepts a repair order")
	_step(1.0)
	_check(is_equal_approx(armory.hp, initial + 750.0 / 65.0) and sim.players[1].aether == balance - 1,
		"Repair rate follows the target's build time and consumes aether")

func _test_rich_extractors() -> void:
	var balance: int = sim.players[1].aether_collected
	sim.spawn_unit("colony_hub", 1, Vector2(142, 121))
	var vent: Dictionary = sim.spawn_resource("aether_vent", Vector2(153, 121), 600, "", true)
	var refinery: Dictionary = sim.spawn_unit("aether_tap", 1, vent.pos)
	var forager_vent: Dictionary = sim.spawn_resource("aether_vent", Vector2(153, 140), 600, "", true)
	var concord_vent: Dictionary = sim.spawn_resource("aether_vent", Vector2(153, 159), 600, "", true)
	var extractor: Dictionary = sim.spawn_unit("spore_tap", 2, forager_vent.pos)
	var prism: Dictionary = sim.spawn_unit("aether_prism", 2, concord_vent.pos)
	for unit in [refinery, extractor, prism]:
		_check(sim.unit_upgrade_detail(unit) == "rich_extractor" and unit.name.begins_with("Rich "),
			"Each faction identifies its extractor on a rich vent")
	var pioneer: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(151, 118))
	var waiting: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(151, 124))
	var raider: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(156, 121))
	sim.issue_command([raider.tag], "hold_fire")
	_check(sim.issue_command([pioneer.tag], "harvest", vent.pos, refinery.tag).ok, "A Pioneer can gather from a rich extractor")
	_check(sim.issue_command([waiting.tag], "harvest", vent.pos, refinery.tag).ok, "A second Pioneer queues for the same vent")
	var entered := false
	for i in range(160):
		sim.step_ticks(1)
		var miners := [pioneer, waiting].filter(func(worker): return worker.get("gas_extracting", false))
		_check(miners.size() <= 1, "Only one worker occupies the extractor at a time")
		if not entered and not miners.is_empty():
			var inside: Dictionary = miners[0]
			var hp: float = inside.hp
			sim._apply_damage_to_target(raider, inside, 20.0, {}, 1.0)
			_check(not sim.can_see_unit(2, inside) and inside.hp == hp, "An extracting worker is hidden and protected")
			entered = true
		if sim.players[1].aether_collected > balance:
			break
	_check(entered and sim.players[1].aether_collected == balance + 6 and vent.amount == 594, "One rich gas trip delivers and deducts six aether")

func _step(seconds: float) -> void:
	sim.step_ticks(ceili(seconds * sim.TICK_RATE))

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
