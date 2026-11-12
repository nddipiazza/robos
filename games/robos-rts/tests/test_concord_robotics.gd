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
	sim._load_skirmish({"watch_ai": true, "online": true, "seed": 3, "player_faction": "aliens", "ai_faction": "humans",
		"unlimited_resources": false, "map": {"width": 256, "height": 128, "starts": [{"x": 50, "y": 45}, {"x": 205, "y": 45}]}})
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	for unit in sim.units.values():
		if unit.is_worker:
			sim.issue_command([unit.tag], "stop")
	var base: Vector2 = _find("heartstone").pos
	var mote := _find("mote")
	sim.spawn_unit("resonator", 1, base + Vector2(0, 10))
	var gate: Dictionary = sim.spawn_unit("waystone", 1, base + Vector2(9, 12))
	var site := base + Vector2(-8, 13)
	var bank: Dictionary = sim.players[1]
	bank.crystal = 600
	bank.aether = 300
	sim._refresh_vision()
	_check(not sim.issue_command([mote.tag], "build_robotics_foundry", site).ok, "Foundry requires a completed Concord Core")
	sim.spawn_unit("concord_core", 1, base + Vector2(5, 20))
	_check(sim.issue_command([mote.tag], "build_robotics_foundry", site).ok, "Mote starts a powered Foundry")
	sim.step_ticks(70 * sim.TICK_RATE)
	var foundry := _find("robotics_foundry")
	if foundry.is_empty() or foundry.build_progress < 1.0:
		_check(false, "The paid Foundry completes")
		_finish()
		return
	_check(not sim.issue_command([gate.tag], "train_farsight_wisp").ok
		and not sim.issue_command([gate.tag], "train_lumen_carrier").ok, "Ladder Waystone no longer offers robotics units")
	_check(sim.issue_command([foundry.tag], "train_farsight_wisp").ok and sim.issue_command([foundry.tag], "train_lumen_carrier").ok
		and bank.crystal == 175 and bank.aether == 125, "Foundry queues both units at their ladder costs")
	sim.step_ticks(75 * sim.TICK_RATE)
	var wisp := _find("farsight_wisp")
	var carrier := _find("lumen_carrier")
	if wisp.is_empty() or carrier.is_empty():
		_check(false, "Both robotics units finish training")
		_finish()
		return
	_check(wisp.flight_height > 0 and wisp.cloaked and not wisp.has("expires_tick"), "The mobile Wisp is an untimed cloaked detector")
	_check(sim.issue_command([wisp.tag], "surveillance_mode").ok and not wisp.cloaked
		and wisp.detection_radius == Rules.WISP_SURVEILLANCE_SIGHT, "Surveillance expands detection and reveals the Wisp")
	_check(not sim.issue_command([wisp.tag], "move", wisp.pos + Vector2(4, 0)).ok, "Surveillance prevents movement")
	_check(sim.issue_command([wisp.tag], "surveillance_mode").ok and wisp.cloaked and not wisp.is_immobile,
		"Leaving surveillance restores cloak and movement")
	_check(carrier.flight_height > 0.0, "Ladder Lumen Carrier flies")
	_check(sim.issue_command([carrier.tag], "deploy_power_field").ok and not sim.carrier_power_active(carrier),
		"Anchoring is timed and does not instantly power the area")
	var anchor_ticks := ceili(Rules.CARRIER_ANCHOR_SECONDS * float(sim.TICK_RATE))
	sim.step_ticks(anchor_ticks - 1)
	_check(not sim.carrier_power_active(carrier), "The phasing field remains off before the deadline")
	sim.step_ticks(1)
	_check(sim.carrier_power_active(carrier) and sim.power_source_radius(carrier) == Rules.CARRIER_FIELD_RADIUS
		and sim.transit_field_time(1, carrier.pos) == Rules.TRANSIT_FAST_SECONDS, "An anchored Lumen Carrier supplies a fast deployment field")
	sim.step_ticks(26 * sim.TICK_RATE)
	_check(sim.carrier_power_active(carrier), "The ladder field stays active beyond the legacy timeout")
	_check(sim.issue_command([carrier.tag], "retract_power_field").ok and sim.carrier_power_active(carrier),
		"The field stays active while folding")
	sim.step_ticks(ceili(Rules.CARRIER_FOLD_SECONDS * float(sim.TICK_RATE)))
	_check(not sim.carrier_power_active(carrier) and not carrier.is_immobile, "The Lumen Carrier can fly after folding")
	var passenger: Dictionary = sim.spawn_unit("mote", 1, carrier.pos + Vector2(1.7, 0))
	_check(sim.issue_command([carrier.tag], "load_transport").ok and sim.is_embarked(passenger.tag, 1),
		"A Lumen Carrier can pick up workers")
	var drop := Vector2.INF
	for offset in [Vector2(-7, 7), Vector2(0, 10), Vector2(9, 6), Vector2(-11, -5)]:
		var candidate: Vector2 = carrier.pos + offset
		if sim._valid_unload_order(carrier, candidate):
			drop = candidate
			break
	_check(drop.is_finite(), "The fixture has a clear drop site")
	_check(sim.issue_command([carrier.tag], "unload_transport", drop).ok, "A mobile Lumen Carrier takes an unload order")
	sim.step_ticks(4 * sim.TICK_RATE)
	_check(sim.units.has(passenger.tag) and not sim.is_embarked(passenger.tag, 1), "The unloaded worker returns to play")
	_test_annex(base, foundry, wisp, carrier)
	_test_bastion(base, foundry)
	_test_nova(foundry)
	_finish()

func _test_nova(foundry: Dictionary) -> void:
	var bank: Dictionary = sim.players[1]
	bank.crystal = 150
	bank.aether = 150
	_check(sim.issue_command([foundry.tag], "train_rift_engine").ok and bank.crystal == 0 and bank.aether == 0,
		"Foundry can train a Rift Engine after the Annex for 150 crystal and 150 aether")
	sim.step_ticks(50 * sim.TICK_RATE)
	_check(not _find("rift_engine").is_empty(), "Rift Engine training completes at the ladder duration")
	var origin := Vector2(102, 86)
	var engine: Dictionary = sim.spawn_unit("rift_engine", 1, origin)
	var goal := origin + Vector2(18, 6)
	var foe: Dictionary = sim.spawn_unit("spire_walker", 2, goal)
	var ally: Dictionary = sim.spawn_unit("spire_walker", 1, goal + Vector2(0, 3))
	var aircraft: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, goal + Vector2(0, -2))
	var building: Dictionary = sim.spawn_unit("silo", 2, goal + Vector2(6, 0))
	for unit in [foe, ally, aircraft]:
		unit["hold_fire"] = true
		unit["is_immobile"] = true
	foe.shields = 20.0
	foe.out_of_combat_timer = 0.0
	sim._refresh_vision()
	_check(not sim.issue_command([engine.tag], "rift_nova_cast", origin + Vector2(28, 0)).ok, "Nova rejects an out-of-range cast")
	var supply_before: float = sim.players[engine.owner].supply_used
	_check(sim.issue_command([engine.tag], "rift_nova_cast", origin + Vector2(18, 0)).ok, "Rift Engine launches a Nova")
	_check(sim.players[engine.owner].supply_used == supply_before, "The Nova consumes no supply")
	var nova := _find("rift_nova")
	if nova.is_empty():
		_check(false, "The launched Nova exists in the simulation")
		return
	_check(not sim.can_attack(aircraft, nova) and not sim.issue_command([engine.tag], "move", goal).ok,
		"The Nova is invulnerable and the caster remains stationary")
	sim.step_ticks(50)
	_check(nova.pos.distance_to(origin) > 5.0 and sim.issue_command([nova.tag], "move", goal).ok, "The Nova can be redirected in flight")
	sim.step_ticks(ceili(Rules.RIFT_NOVA_SECONDS * sim.TICK_RATE) - 50)
	_check(not sim.units.has(nova.tag) and not engine.is_immobile, "The fuse detonates and releases the caster")
	_check(foe.shields == 0.0 and foe.hp == foe.max_hp - 100.0, "Nova consumes shields and deals its base damage without armor")
	_check(ally.shields == 0.0 and ally.hp == ally.max_hp - 100.0, "Nova hits allied ground troops")
	_check(aircraft.hp == aircraft.max_hp and building.hp == building.max_hp, "Nova leaves aircraft and buildings intact")
	_check(not sim.issue_command([engine.tag], "rift_nova_cast", goal).ok, "Nova has a seventeen-second cooldown")

func _test_bastion(base: Vector2, foundry: Dictionary) -> void:
	var bank: Dictionary = sim.players[1]
	bank.crystal = 250
	bank.aether = 100
	sim.spawn_unit("resonator", 1, base + Vector2(22, 10))
	_check(sim.issue_command([foundry.tag], "train_bastion_walker").ok and bank.crystal == 0 and bank.aether == 0,
		"Foundry can train a Bastion for 250 crystal and 100 aether")
	sim.step_ticks(55 * sim.TICK_RATE)
	var walker := _find("bastion_walker")
	if walker.is_empty():
		_check(false, "Bastion training finishes at its ladder duration")
		return
	var enemy: Dictionary = sim.spawn_unit("howitzer", 2, base + Vector2(130, 60))
	sim._apply_damage_to_target(enemy, walker, 60.0, {}, 1.0)
	_check(walker.hp == 200.0 and walker.shields == 100.0 and walker.bastion_barrier_hp == 40.0,
		"Barrier absorbs the hit that triggers it")
	sim._apply_damage_to_target(enemy, walker, 50.0, {}, 1.0)
	_check(walker.shields == 90.0 and walker.bastion_barrier_hp == 0.0, "Damage beyond the remaining Barrier reaches shields")
	_check(not sim.issue_command([walker.tag], "bastion_barrier").ok, "Barrier shares the same cooldown for manual activation")
	sim.step_ticks(Rules.BASTION_BARRIER_COOLDOWN * sim.TICK_RATE)
	_check(sim.issue_command([walker.tag], "auto_bastion_barrier").ok and not walker.auto_bastion_barrier, "Barrier autocast can be disabled")
	sim._apply_damage_to_target(enemy, walker, 5.0, {}, 1.0)
	_check(walker.shields == 95.0 and sim.bastion_barrier_ticks(walker) == 0, "Disabled Barrier leaves shields to take damage")
	_check(sim.issue_command([walker.tag], "bastion_barrier").ok, "Manual Barrier remains available with autocast off")
	sim.step_ticks(Rules.BASTION_BARRIER_SECONDS * sim.TICK_RATE)
	sim._apply_damage_to_target(enemy, walker, 5.0, {}, 1.0)
	_check(walker.shields == 90.0, "Unused Barrier expires after two seconds")

func _test_annex(base: Vector2, foundry: Dictionary, wisp: Dictionary, carrier: Dictionary) -> void:
	var bank: Dictionary = sim.players[1]
	bank.crystal = 1000
	bank.aether = 900
	_check(not sim.issue_command([foundry.tag], "train_spire_walker").ok, "Spire Walkers require the Robotics Annex")
	var site := Vector2.INF
	for offset in [Vector2(-7, 22), Vector2(0, 23), Vector2(10, 18), Vector2(-13, 17)]:
		var candidate: Vector2 = base + offset
		if sim.is_powered(1, candidate) and sim.can_place_structure("robotics_annex", candidate):
			site = candidate
			break
	var mote := _find("mote")
	_check(site.is_finite() and sim.issue_command([mote.tag], "build_robotics_annex", site).ok, "Mote can build an Annex after the Foundry")
	sim.step_ticks(72 * sim.TICK_RATE)
	var annex := _find("robotics_annex")
	if annex.is_empty() or annex.build_progress < 1.0:
		_check(false, "The paid Annex completes")
		return
	_check(bank.crystal == 850 and bank.aether == 750, "Annex costs 150 crystal and 150 aether")
	_check(sim.issue_command([annex.tag], "research_wisp_thrusters").ok and sim.issue_command([annex.tag], "research_lumen_drive").ok
		and sim.issue_command([annex.tag], "research_extended_prism").ok, "Annex queues its three robotics upgrades")
	sim.step_ticks(ceili(57.143 * sim.TICK_RATE))
	_check(is_equal_approx(sim.effective_move_speed(wisp), Rules.WISP_UPGRADED_SPEED), "Wisp Thrusters changes flight speed")
	sim.step_ticks(ceili(57.143 * sim.TICK_RATE))
	_check(is_equal_approx(sim.effective_move_speed(carrier), Rules.LUMEN_UPGRADED_SPEED), "Lumen Drive changes transport speed")
	_check(sim.issue_command([foundry.tag], "train_spire_walker").ok, "The completed Annex unlocks Spire Walker production")
	sim.step_ticks(100 * sim.TICK_RATE)
	var walker := _find("spire_walker")
	_check(not walker.is_empty() and sim.weapon_range_against(walker) == 22.5, "Extended Prism increases weapon range to 22.5 world units")

func _test_spire_walker_cliff() -> void:
	sim.load_scenario_dict({"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 96, "height": 64,
		"high_ground": [{"x": 8, "y": 8, "w": 18, "h": 21}]}})
	var walker: Dictionary = sim.spawn_unit("spire_walker", 1, Vector2(35, 20))
	var plateau := Vector2(19, 20)
	sim._refresh_vision()
	_check(sim.can_see_position(1, plateau), "The Walker sees uphill before crossing the ledge")
	sim.issue_command([walker.tag], "move", plateau)
	sim.step_ticks(160)
	_check(walker.pos.distance_to(plateau) < 2.0 and sim.unit_elevation(walker) > 2.0 and walker.flight_height == 0.0,
		"Spire Walker crosses a ledge while staying on the ground")
	var turret: Dictionary = sim.spawn_unit("sentry_turret", 2, Vector2(24, 12))
	var rifleman: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(22, 25))
	var rover: Dictionary = sim.spawn_unit("cinder_runner", 2, Vector2(29, 20))
	_check(not sim.can_attack(turret, rifleman) and sim.can_attack(turret, walker) and sim.can_attack(rover, walker),
		"Both anti-air and ground-only weapons can target the tall Walker")

func _find(kind: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.owner == 1 and unit.unit_type == kind:
			return unit
	return {}

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _finish() -> void:
	_test_spire_walker_cliff()
	print("Concord Robotics checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
