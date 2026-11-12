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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 240, "height": 190},
		"players": {"1": {"faction": "humans", "crystal": 1600, "aether": 1600}, "2": {"faction": "aliens"}},
	})
	sim.spawn_unit("colony_hub", 1, Vector2(16, 20))
	sim.spawn_unit("heartstone", 2, Vector2(219, 170))
	var hangar: Dictionary = sim.spawn_unit("airframe_hangar", 1, Vector2(24, 41))
	sim._refresh_vision()
	_check(not sim.issue_command([hangar.tag], "train_watchkeeper").ok, "Watchkeeper requires a Research Module")
	_check(sim.issue_command([hangar.tag], "attach_research_module").ok, "Hangar attaches its module")
	_step(25.0)
	_check(not sim.issue_command([hangar.tag], "train_dreadnought").ok, "Dreadnought also requires an Ignition Core")
	var core: Dictionary = sim.spawn_unit("ignition_core", 1, Vector2(25, 56))
	_check(sim.issue_command([hangar.tag], "train_dreadnought").ok and sim.issue_command([hangar.tag], "research_systems_jamming").ok,
		"Hangar queues the capital ship and the jamming research")
	_check(sim.issue_command([core.tag], "research_dreadnought_refit").ok, "Ignition Core researches Weapon Refit")
	_step(90.0 + 80.0 / 1.4 + 0.1)
	_check(sim.players[1].upgrades.get("systems_jamming", 0) == 1 and sim.players[1].upgrades.get("dreadnought_refit", 0) == 1,
		"Both paid upgrades complete")
	_test_watchkeeper()
	_test_dreadnought()
	print("Meridian capital ships: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_watchkeeper() -> void:
	var support: Dictionary = sim.spawn_unit("watchkeeper", 1, Vector2(75, 84))
	var rival: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(91, 84))
	var ally: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(90, 88))
	var shielded: Dictionary = sim.spawn_unit("skirmisher", 2, Vector2(94, 85))
	sim.issue_command([rival.tag, ally.tag, shielded.tag], "hold_fire")
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	var site := Vector2(73, 88)
	_check(sim.issue_command([support.tag], "deploy_bastion_turret", site).ok and support.energy == 0.0,
		"Watchkeeper places a 50-energy turret")
	var turrets: Array = sim.units.values().filter(func(unit): return unit.unit_type == "bastion_turret")
	_check(turrets.size() == 1, "One temporary turret is deployed")
	if turrets.is_empty():
		return
	var turret: Dictionary = turrets[0]
	_check(sim.can_attack(turret, rival) and sim.can_attack(turret, shielded) and not sim._qualifies_for_elimination(turret),
		"Turret fires on both planes and cannot prolong a match")
	sim.issue_command([turret.tag], "hold_fire")
	support.energy = 200.0
	_check(sim.issue_command([support.tag], "systems_jammer", rival.pos, rival.tag).ok
		and not sim.issue_command([support.tag], "systems_jammer", rival.pos, rival.tag).ok, "Jamming rejects a duplicate projectile")
	_step(0.25)
	_check(not sim.systems_jammed(rival) and not sim.watchkeeper_missiles.is_empty(), "Jam waits for the missile to reach its target")
	sim.issue_command([rival.tag], "move", Vector2(94, 84))
	_step(0.65)
	_check(sim.systems_jammed(rival) and not sim.can_attack(rival, support)
		and not sim.issue_command([rival.tag], "fighter_assault").ok and sim.issue_command([rival.tag], "move", Vector2(92, 84)).ok,
		"Jamming disables weapons and abilities while allowing movement")
	_check(sim.issue_command([support.tag], "armor_breaker", shielded.pos, shielded.tag).ok, "Watchkeeper can fire an armor-reducing missile")
	_step(1.6)
	_check(int(shielded.get("armor_breaker_until", 0)) > sim.tick and int(ally.get("armor_breaker_until", 0)) > sim.tick,
		"Armor reduction affects allies inside the impact radius")
	var shield_before: float = shielded.shields
	sim._apply_damage_to_target(ally, shielded, 10.0, {}, 1.0)
	_check(shielded.shields == shield_before - 12.0, "Negative shield armor increases each weapon hit by two")
	_step(Rules.SYSTEMS_JAM_SECONDS)
	_check(not sim.systems_jammed(rival) and not sim.units.has(turret.tag), "Jamming expires and the temporary turret is removed")

func _test_dreadnought() -> void:
	var ship: Dictionary = sim.spawn_unit("dreadnought", 1, Vector2(117, 36))
	var ground: Dictionary = sim.spawn_unit("muster_hall", 2, Vector2(132, 37))
	var air: Dictionary = sim.spawn_unit("dawn_interceptor", 2, Vector2(117, 45))
	sim.issue_command([air.tag], "hold_fire")
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim.issue_command([ship.tag], "move", Vector2(115, 32)).ok, "Dreadnought can move into an engagement")
	_step(0.5)
	_check(ship.pos != Vector2(117, 36) and air.shields < air.max_shields, "Moving cruiser fires the anti-air battery")
	var nearer: Dictionary = sim.spawn_unit("dawn_interceptor", 2, ship.pos + Vector2(4, 0))
	sim.issue_command([nearer.tag], "hold_fire")
	_step(0.5)
	_check(ship.attack_target_tag == air.tag and nearer.shields == nearer.max_shields,
		"Moving cruiser keeps firing at its current target when a closer one appears")
	_check(sim.issue_command([ship.tag], "attack_target", ground.pos, ground.tag).ok, "A player can switch the cruiser's target")
	_step(0.5)
	_check(ship.attack_target_tag == ground.tag and ground.hp < ground.max_hp, "The explicit order switches to the surface battery")
	sim.issue_command([ship.tag], "hold_fire")
	_check(sim.issue_command([ship.tag], "dreadnought_beam", ground.pos, ground.tag).ok, "Siege Beam starts on a visible structure")
	var initial: float = ground.hp
	_step(Rules.DREADNOUGHT_BEAM_SECONDS - 1.0 / sim.TICK_RATE)
	_check(ground.hp == initial, "The siege beam charges before damage")
	sim.step_ticks(1)
	_check(ground.hp == initial - 240.0, "The siege beam deals 240 armor-ignoring damage")
	var destination := Vector2(183, 132)
	_check(not sim.can_see_position(1, destination) and sim.issue_command([ship.tag], "dreadnought_jump", destination).ok,
		"Human Tactical Jump accepts a destination under fog")
	_check(not sim.issue_command([ship.tag], "stop").ok, "Tactical Jump cannot be canceled by Stop")
	var before: float = ship.hp
	sim._apply_damage_to_target(air, ship, 10.0, {}, 1.0, true)
	_check(ship.hp == before - 10.0, "The jump windup is vulnerable")
	_step(Rules.DREADNOUGHT_JUMP_WINDUP)
	before = ship.hp
	sim._apply_damage_to_target(air, ship, 10.0, {}, 1.0, true)
	_check(ship.hp == before and not sim.can_see_unit(2, ship), "The cruiser is hidden and invulnerable in transit")
	_step(Rules.DREADNOUGHT_JUMP_TRANSIT)
	_check(ship.pos == destination and not ship.is_immobile and sim.can_see_position(1, destination),
		"Tactical Jump arrives and restores normal vision")
	_check(not sim.issue_command([ship.tag], "dreadnought_jump", Vector2(170, 130)).ok, "Tactical Jump retains its independent cooldown")

func _step(seconds: float) -> void:
	sim.step_ticks(ceili(seconds * sim.TICK_RATE))

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
