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
		"players": {"1": {"faction": "aliens"}, "2": {"faction": "humans"}},
	})
	var scout: Dictionary = sim.spawn_unit("sunseer", 1, Vector2(71, 63))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(84, 63))
	var hidden: Dictionary = sim.spawn_unit("duskblade", 2, Vector2(90, 68))
	var aircraft: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(83, 59))
	var immune: Dictionary = sim.spawn_unit("carapace_bulwark", 2, Vector2(88, 65))
	sim.issue_command([rifle.tag, hidden.tag, aircraft.tag, immune.tag], "hold_fire")
	scout.energy_profile = scout.energy_profile.duplicate()
	scout.energy_profile.regen = 0.0
	sim._refresh_vision()
	_check(not sim.can_attack(scout, rifle), "The inactive Pulsar Beam cannot fire")
	_check(sim.issue_command([scout.tag], "pulsar_beam").ok and scout.energy == 25.0
		and sim.can_attack(scout, rifle) and not sim.can_attack(scout, aircraft), "Activation costs 25 energy and grants a ground-only beam")
	sim.issue_command([scout.tag], "hold_fire")
	sim.step_ticks(sim.TICK_RATE)
	_check(is_equal_approx(scout.energy, 25.0 - Rules.ORACLE_BEAM_DRAIN)
		and sim.issue_command([scout.tag], "end_pulsar_beam").ok, "The beam drains energy until deactivated")
	_check(not sim.can_see_unit(1, hidden), "The enemy starts cloaked")
	scout.energy = 100.0
	_check(sim.issue_command([scout.tag], "revelation", Vector2(87, 64)).ok and scout.energy == 75.0
		and sim.can_see_unit(1, hidden), "Revelation exposes the cloaked enemy")
	hidden.pos = Vector2(139, 105)
	sim._refresh_vision()
	_check(not sim.can_see_position(1, hidden.pos) and sim.can_see_unit(1, hidden), "The tag follows its target without exposing surrounding terrain")
	_check(not sim.issue_command([scout.tag], "revelation", Vector2(87, 64)).ok, "Revelation has a cooldown")
	var ward_site := Vector2(77, 65)
	_check(sim.issue_command([scout.tag], "seed_stasis_ward", ward_site).ok and scout.energy == 50.0, "Seeding a ward costs 25 energy")
	var wards: Array = sim.units.values().filter(func(unit): return unit.unit_type == "stasis_ward")
	if not wards.is_empty():
		var ward: Dictionary = wards[0]
		sim.step_ticks(4 * sim.TICK_RATE)
		_check(ward.cloaked and not sim.can_see_unit(2, ward) and sim.units.has(ward.tag), "An armed ward hides from enemies")
		rifle.pos = ward_site + Vector2(2, 0)
		immune.pos = ward_site + Vector2(3, 3)
		sim.step_ticks(4)
		_check(not sim.units.has(ward.tag) and rifle.is_immobile and not immune.is_immobile and not aircraft.is_immobile,
			"The trap suspends nearby hostile ground units and respects Frenzied and air immunity")
		var health: float = rifle.hp
		sim._apply_damage_to_target(scout, rifle, 100.0, {}, 1.0, true)
		_check(rifle.hp == health and not sim.issue_command([rifle.tag], "move", Vector2(95, 76)).ok,
			"Stasis blocks damage and player orders")
		sim.step_ticks(ceili(Rules.STASIS_SECONDS * sim.TICK_RATE))
		_check(not rifle.is_immobile and not sim.can_see_unit(1, hidden), "Stasis and Revelation expire")
	print("Sunseer: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
