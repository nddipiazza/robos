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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 160, "height": 130},
		"players": {"1": {"faction": "monsters", "crystal": 500, "aether": 500}, "2": {"faction": "humans", "crystal": 200}},
	})
	var nest: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(30, 35))
	var first: Dictionary = sim.spawn_unit("drift_sac", 1, Vector2(50, 60))
	var second: Dictionary = sim.spawn_unit("drift_sac", 1, Vector2(72, 55))
	var worker: Dictionary = sim.spawn_unit("forager", 1, Vector2(49, 64))
	var bank: Dictionary = sim.players[1]
	var supply: float = bank.supply_cap
	_check(is_equal_approx(sim.effective_move_speed(first), 2.25) and first.max_hp == 200.0,
		"The unupgraded Drift Sac has the 5.0.17 speed and health")
	_check(not sim.issue_command([first.tag], "load_transport").ok and not sim.issue_command([first.tag], "morph_spore_seer").ok,
		"Ordinary Drift Sacs need Lair tech to gain another role")
	_check(sim.issue_command([nest.tag], "research_pneumatized_carapace").ok, "Scout speed research is available at the Nest")
	nest["structure_form"] = "brood_lair"
	_check(sim.issue_command([first.tag], "morph_drift_hauler").ok and sim.issue_command([second.tag], "morph_spore_seer").ok
		and first.unit_type == "hauler_cocoon" and second.unit_type == "seer_cocoon" and bank.supply_cap == supply
		and bank.crystal == 325 and bank.aether == 325, "Both paid airborne cocoons retain their eight supply")
	_check(not sim.issue_command([first.tag], "move", Vector2(51, 59)).ok, "An airborne cocoon cannot move")
	sim.step_ticks(17 * sim.TICK_RATE)
	_check(second.unit_type == "spore_seer" and first.unit_type == "hauler_cocoon", "The Seer finishes before the Hauler")
	sim.step_ticks(4 * sim.TICK_RATE)
	_check(first.unit_type == "drift_hauler" and bank.supply_cap == supply, "The Hauler finishes after 21 seconds")
	_check(sim.issue_command([first.tag], "load_transport").ok and not sim.units.has(worker.tag)
		and sim.transport_slots_used(first) == 1, "The Hauler can board a Forager")
	_check(not sim.issue_command([first.tag], "morph_spore_seer").ok, "The Hauler must unload its passengers before evolving")
	_test_airborne_creep(first)
	_test_oversight(second)
	_test_contamination(second)
	_test_disguise(second)
	_check(is_equal_approx(sim.effective_move_speed(first), Rules.DRIFT_UPGRADED_SPEED.drift_hauler)
		and is_equal_approx(sim.effective_move_speed(second), Rules.DRIFT_UPGRADED_SPEED.spore_seer), "Pneumatized Carapace speeds up both evolved scouts")
	print("Gnarl scout morphs: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_oversight(seer: Dictionary) -> void:
	var contact: Dictionary = sim.spawn_unit("duskblade", 2, Vector2(102, 55))
	sim.issue_command([contact.tag], "hold_fire")
	sim._refresh_vision()
	_check(not sim.can_see_unit(1, contact), "The cloaked contact starts beyond the mobile Seer's range")
	_check(sim.issue_command([seer.tag], "seer_oversight").ok and sim.can_see_unit(1, contact)
		and not sim.issue_command([seer.tag], "move", Vector2(76, 55)).ok, "Oversight expands detection and prevents movement")
	_check(sim.issue_command([seer.tag], "seer_mobile").ok and not sim.can_see_unit(1, contact), "Mobile mode restores the original range")

func _test_airborne_creep(hauler: Dictionary) -> void:
	var location: Vector2 = hauler.pos
	_check(sim.issue_command([hauler.tag], "generate_drift_creep").ok, "A Lair permits the Hauler to generate living ground")
	sim.step_ticks(3 * sim.TICK_RATE)
	_check(sim.has_active_living_ground(location, 1), "Stationary air support generates living ground under itself")
	_check(sim.issue_command([hauler.tag], "move", Vector2(55, 74)).ok, "The Hauler can move with generation toggled on")
	sim.step_ticks(sim.TICK_RATE)
	_check(not sim.has_active_living_ground(location, 1), "Flying retires the previous active creep source")
	sim.issue_command([hauler.tag], "generate_drift_creep")

func _test_contamination(seer: Dictionary) -> void:
	sim.spawn_unit("colony_hub", 2, Vector2(118, 46))
	var muster: Dictionary = sim.spawn_unit("muster_hall", 2, Vector2(90, 55))
	var silo: Dictionary = sim.spawn_unit("silo", 2, Vector2(87, 45))
	_check(sim.issue_command([muster.tag], "train_rifleman").ok, "The enemy has an active training queue")
	sim._refresh_vision()
	seer.energy = 130.0
	_check(not sim.issue_command([seer.tag], "contaminate_production", silo.pos, silo.tag).ok, "Contaminate requires a production target")
	_check(sim.issue_command([seer.tag], "contaminate_production", muster.pos, muster.tag).ok and seer.energy == 5.0,
		"Contaminate spends 125 energy on a visible enemy producer")
	sim.step_ticks(ceili(Rules.CONTAMINATE_SECONDS * sim.TICK_RATE) - 1)
	_check(muster.production_queue[0].progress == 0.0, "Training pauses for the full contamination interval")
	sim.step_ticks(1)
	_check(muster.production_queue[0].progress > 0.0, "Training resumes without losing the queued unit")
	sim.step_ticks(8 * sim.TICK_RATE)

func _test_disguise(seer: Dictionary) -> void:
	var supply: float = sim.players[1].supply_used
	sim.players[2].upgrades["combat_shields"] = 1
	seer.energy = 50.0
	if not sim.issue_command([seer.tag], "spawn_brood_mimic").ok:
		failures.append("A Seer can spend 50 energy to hatch a Brood Mimic")
		return
	var mimic: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "brood_mimic").front()
	_check(seer.energy == 0.0 and mimic.hp == 5.0 and sim.players[1].supply_used == supply,
		"The scout costs 50 energy and no supply")
	sim.step_ticks(16)
	_check(mimic.get("disguise_type") == "rifleman" and mimic.get("disguise_owner") == 2
		and not sim.is_hostile_contact(2, mimic), "The nearby enemy sees a friendly Rifleman appearance")
	_check(sim.unit_upgrade_detail(mimic) == "combat_shield", "A Mimic copies the enemy Rifleman's shield")
	var observer: Array = sim.get_observation(2).units.filter(func(unit): return unit.tag == mimic.tag)
	_check(observer.size() == 1 and observer[0].owner == 2 and observer[0].unit_type == "rifleman"
		and not observer[0].has("lifetime_ticks"), "The enemy observation omits the disguise's internal identity")
	var lifetime: int = mimic.expires_tick - sim.tick
	sim.step_ticks(lifetime)
	_check(not sim.units.has(mimic.tag), "The disguised scout expires at the original hatch deadline")
	sim.players[2].faction = "monsters"
	sim.players[2].upgrades["metabolic_boost"] = 1
	var gnarl_scout: Dictionary = sim.spawn_unit("spore_seer", 1, Vector2(112, 95))
	sim.spawn_unit("forager", 2, Vector2(124, 95))
	gnarl_scout.energy = 50.0
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim.issue_command([gnarl_scout.tag], "spawn_brood_mimic").ok, "A Seer can launch a Mimic near a Gnarl opponent")
	var scouts: Array = sim.units.values().filter(func(unit): return unit.unit_type == "brood_mimic")
	if scouts.is_empty():
		return
	sim.step_ticks(16)
	_check(scouts[0].get("disguise_type") == "skitterling" and sim.unit_upgrade_detail(scouts[0]) == "wings"
		and is_equal_approx(scouts[0].speed, 6.58 * 2.5), "A Mimic copies an upgraded Skitterling's wings and base movement speed")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
