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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 215, "height": 165},
		"players": {"1": {"faction": "humans", "crystal": 1200, "aether": 1200}, "2": {"faction": "aliens"}},
	})
	sim.spawn_unit("colony_hub", 1, Vector2(18, 19))
	sim.spawn_unit("heartstone", 2, Vector2(197, 145))
	var hangar: Dictionary = sim.spawn_unit("airframe_hangar", 1, Vector2(31, 39))
	var core: Dictionary = sim.spawn_unit("ignition_core", 1, Vector2(33, 55))
	_check(sim.issue_command([hangar.tag], "train_rampart_transport").ok and sim.issue_command([hangar.tag], "train_kestrel_interceptor").ok,
		"Rampart and Kestrel train from an unmodified Hangar")
	_check(sim.issue_command([core.tag], "research_rampart_reactor").ok, "Ignition Core can research Rampart Reactor")
	_step(42.0)
	_check(sim.units.values().any(func(unit): return unit.unit_type == "rampart_transport" and unit.auto_heal),
		"Rampart trains in 42 seconds with Heal autocast enabled")
	_step(42.0)
	_check(sim.players[1].upgrades.get("rampart_reactor", 0) == 1, "The paid reactor completes at the Ignition Core")
	_test_rampart()
	_test_kestrel()
	_test_ground_strike(hangar, core)
	_test_movement_profiles()
	print("Meridian airframes: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_movement_profiles() -> void:
	var origin := Vector2(55, 145)
	var ship: Dictionary = sim.spawn_unit("rampart_transport", 1, origin)
	var tank: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(52, 126))
	_check(sim.issue_command([ship.tag], "move", origin + Vector2(35, 0)).ok, "Rampart can start a flight")
	_check(sim.issue_command([tank.tag], "move", Vector2(34, 126)).ok, "Howitzer can reverse course")
	sim.step_ticks(1)
	_check(ship.pos.x > origin.x and ship.vel.length() < 0.2, "Rampart accelerates from rest at the catalog rate")
	_check(tank.pos == Vector2(52, 126) and tank.facing != 0.0, "Howitzer turns before moving in the new direction")
	_step(0.5)
	_check(absf(ship.vel.length() - 2.25 * 1.4 * 1.4 * 2.5 * (0.5 + sim.TICK_DT)) < 0.03, "Rampart follows the same acceleration for consecutive ticks")
	_check(tank.pos.x < 51.0, "Howitzer moves once the hull aligns")
	_step(0.5)
	_check(is_equal_approx(ship.vel.length(), sim.effective_move_speed(ship)), "Rampart reaches its configured cruising speed")

func _test_rampart() -> void:
	var transport: Dictionary = sim.spawn_unit("rampart_transport", 1, Vector2(84, 88))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(90, 88))
	var pioneer: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(84, 94))
	var machine: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(90, 92))
	rifle.hp = 20.0
	machine.hp -= 40.0
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim.issue_command([transport.tag], "auto_heal").ok and not transport.auto_heal, "Heal autocast toggles off")
	_check(not sim.issue_command([transport.tag], "restore_vitals", machine.pos, machine.tag).ok, "Heal excludes purely Mechanical targets")
	_check(sim.issue_command([transport.tag], "restore_vitals", rifle.pos, rifle.tag).ok, "Heal can manually target an eligible unit")
	_step(1.0)
	_check(is_equal_approx(rifle.hp, 32.6) and is_equal_approx(transport.energy, 50.0 + 1.575 - 4.2),
		"Heal restores 12.6 HP/s at 3 HP per energy while the reactor doubles regeneration")
	sim.issue_command([transport.tag], "stop")
	_check(sim.issue_command([transport.tag], "rampart_boost").ok and is_equal_approx(sim.effective_move_speed(transport), Rules.RAMPART_BOOST_SPEED),
		"Afterburners change actual speed")
	_check(not sim.issue_command([transport.tag], "rampart_boost").ok, "Afterburners cannot immediately recast")
	_step(Rules.RAMPART_BOOST_SECONDS)
	_check(is_equal_approx(sim.effective_move_speed(transport), 8.75), "Afterburner speed expires independently of the cooldown")
	_check(sim.issue_command([rifle.tag, pioneer.tag], "enter_rampart", transport.pos, transport.tag).ok, "Passengers can approach a Rampart to board")
	_step(1.5)
	var boarded: bool = transport.get("passengers", []).size() == 2 and sim.transport_slots_used(transport) == 2
	_check(boarded, "Cargo accepts infantry and workers")
	if not boarded:
		return
	_check(sim.issue_command([transport.tag], "unload_transport", transport.pos).ok, "A clear site accepts a drop order")
	sim.step_ticks(1)
	_check(transport.passengers.size() == 1, "Drops one passenger on the first tick")
	_step(1.0 / 1.4 - 1.0 / sim.TICK_RATE)
	_check(transport.passengers.size() == 1, "The second passenger waits for the drop cadence")
	sim.step_ticks(1)
	_check(transport.passengers.is_empty() and sim.units.has(rifle.tag) and sim.units.has(pioneer.tag),
		"Both original passenger tags return to the field")

func _test_kestrel() -> void:
	var fighter: Dictionary = sim.spawn_unit("kestrel_interceptor", 1, Vector2(102, 48))
	var air: Dictionary = sim.spawn_unit("prism_ray", 2, Vector2(116, 48))
	var ground: Dictionary = sim.spawn_unit("howitzer", 2, Vector2(121, 55))
	sim.issue_command([air.tag, ground.tag], "hold_fire")
	sim.issue_command([fighter.tag], "hold_fire")
	sim._refresh_vision()
	_check(fighter.max_hp == 135.0 and sim.weapon_range_against(fighter, air) == 22.5
		and sim.can_attack(fighter, air) and not sim.can_attack(fighter, ground), "Interceptor has its long-range air-only weapon")
	_check(sim.issue_command([fighter.tag], "fighter_assault").ok, "Interceptor begins landing at a clear position")
	_step(Rules.KESTREL_MODE_SECONDS * 0.5)
	_check(fighter.flight_height > 0.0 and sim.unit_visual_elevation(fighter) < fighter.flight_height, "Landing animates while the fighter remains an air target")
	_step(Rules.KESTREL_MODE_SECONDS * 0.5)
	_check(fighter.unit_type == "kestrel_assault" and sim.can_attack(fighter, ground) and not sim.can_attack(fighter, air), "Assault mode arms the ground weapon")
	sim.players[1].upgrades["ship_weapons"] = 1
	_check(sim.unit_upgrade_level(fighter, "weapons") == 1, "Assault mode retains the ship upgrade group")
	sim.players[1].upgrades["smart_servos"] = 1
	_check(sim.issue_command([fighter.tag], "fighter_intercept").ok, "Assault mode accepts takeoff")
	_step(Rules.KESTREL_SERVOS_SECONDS)
	_check(fighter.unit_type == "kestrel_interceptor", "Smart Servos halves the takeoff time")

func _test_ground_strike(hangar: Dictionary, core: Dictionary) -> void:
	sim.spawn_unit("silo", 1, Vector2(24, 65))
	_check(not sim.issue_command([hangar.tag], "train_night_harrier").ok, "Night Harrier requires an attached Research Module")
	_check(sim.issue_command([hangar.tag], "attach_research_module").ok, "Hangar accepts a Research Module")
	_step(25.0)
	_check(sim.issue_command([hangar.tag], "research_harrier_cloaking").ok and sim.issue_command([hangar.tag], "train_night_harrier").ok,
		"Stealth research and Night Harrier training use the Hangar module")
	_check(sim.issue_command([core.tag], "research_sky_ballistics").ok, "Ignition Core unlocks longer Sky Sentry deployment")
	_step(110.0 / 1.4 + 0.1)
	var harrier: Dictionary = sim.spawn_unit("night_harrier", 1, Vector2(70, 125))
	var observer: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(78, 125))
	sim.issue_command([harrier.tag, observer.tag], "hold_fire")
	sim._refresh_vision()
	_check(sim.can_see_unit(2, harrier) and sim.issue_command([harrier.tag], "harrier_cloak").ok
		and harrier.energy == 25.0 and not sim.can_see_unit(2, harrier), "Harrier cloak hides from ordinary vision for 25 energy")
	_step(1.0)
	_check(is_equal_approx(harrier.energy, 25.0 + 0.7875 - 1.26), "Stealth drains energy while regeneration continues")
	_check(sim.issue_command([harrier.tag], "harrier_cloak").ok and sim.can_see_unit(2, harrier), "Toggling cloak off makes the aircraft visible")
	var gunship: Dictionary = sim.spawn_unit("sky_sentry", 1, Vector2(130, 96))
	var plane: Dictionary = sim.spawn_unit("dawn_interceptor", 2, Vector2(141, 88))
	var beside: Dictionary = sim.spawn_unit("dawn_interceptor", 2, Vector2(145, 88))
	var ground: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(158, 96))
	var outside: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(131, 110))
	var structure: Dictionary = sim.spawn_unit("muster_hall", 2, Vector2(155, 102))
	sim.issue_command([gunship.tag, plane.tag, beside.tag, ground.tag, outside.tag], "hold_fire")
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	var shield_after: float = plane.max_shields - 2 * (5 + sim.unit_upgrade_level(gunship, "weapons"))
	_check(sim._execute_weapon_hit(gunship, plane) and plane.shields == shield_after and beside.shields == shield_after,
		"Fighter mode launches two airburst rockets with same-plane splash")
	var zone := Vector2(147, 96)
	_check(not sim.can_see_position(1, ground.pos) and sim.sky_deploy_range(gunship) == 17.5
		and sim.issue_command([gunship.tag], "sky_defender_mode", zone).ok, "Advanced Ballistics grants a 17.5 world-unit deployment offset")
	_step(Rules.SKY_DEPLOY_SECONDS + 1.0 / sim.TICK_RATE)
	_check(gunship.unit_type == "sky_sentry_defender" and gunship.flight_height > 0.0 and gunship.is_immobile
		and sim.can_see_position(1, ground.pos), "Defender remains airborne and grants vision of its zone")
	_check(sim.can_attack(gunship, ground) and not sim.can_attack(gunship, outside)
		and not sim.can_attack(gunship, structure) and not sim.can_attack(gunship, plane),
		"Defender can hit only ground units inside the zone")
	_check(sim.issue_command([gunship.tag], "sky_fighter_mode").ok, "Defender can return to its mobile mode")
	_step(Rules.SKY_MOBILE_SECONDS)
	_check(gunship.unit_type == "sky_sentry" and not gunship.is_immobile and not sim.can_see_position(1, ground.pos),
		"Returning to fighter mode removes the remote vision")

func _step(seconds: float) -> void:
	sim.step_ticks(ceili(seconds * sim.TICK_RATE))

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
