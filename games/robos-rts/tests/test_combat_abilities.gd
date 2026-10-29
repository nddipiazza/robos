extends SceneTree

# Numeric acceptance contracts, not snapshots of the registry implementation.
# Fixtures isolate mechanics; only the Surge duels use ordinary unmodified armies
# to assert an actual expected winner. Every loop has a simulation-time bound.
const COVERED_ABILITIES = ["surge", "phase_step", "charge", "emplace", "mobilize", "retract_silo", "extend_silo"]
const COVERED_PASSIVES = ["concussive_slow", "aegis_shields", "cliff_walk", "multi_hit", "armor"]
var sim: Node
var cases: Array = []
var failures: Array = []
var assertions := 0

func _initialize() -> void:
	call_deferred("_run")

func _case(name: String) -> void:
	cases.append({"name": name, "passed": true, "metrics": {}})

func _expect(ok: bool, description: String) -> void:
	assertions += 1
	if not ok:
		failures.append(cases.back().name + ": " + description)
		cases.back().passed = false

func _near(actual: float, expected: float, tolerance: float, description: String) -> void:
	_expect(absf(actual-expected) <= tolerance, "%s: expected %.5f ± %.5f, observed %.5f" % [description, expected, tolerance, actual])

func _reset() -> void:
	sim.reset_state(99, 256, 256)
	root.get_node("RTSCommanderAI").configure_from_scenario([])

func _travel(unit_type: String, ability: String = "", ticks: int = 64) -> Dictionary:
	_reset()
	var unit = sim.spawn_unit(unit_type, 1, Vector2(30, 40))
	var hp: float = unit.hp
	if not ability.is_empty():
		_expect(sim.issue_command([unit.tag], ability).accepted == 1, "Valid caster must accept " + ability)
	sim.issue_command([unit.tag], "move", Vector2(220,40))
	sim.step_ticks(ticks)
	return {"distance": unit.pos.x-30.0, "hp_cost": hp-unit.hp, "unit": unit}

func _cadence(unit_type: String, boosted: bool) -> float:
	_reset()
	var unit = sim.spawn_unit(unit_type, 1, Vector2(40,40))
	var target = sim.spawn_unit("colony_hub", 2, Vector2(50,40))
	if boosted:
		sim.issue_command([unit.tag], "surge")
	sim.issue_command([unit.tag], "attack_target", target.pos, target.tag)
	sim.step_ticks(512)
	var shots: Array = sim.recent_events.filter(func(e): return e.type == "weapon_fire" and e.attacker_tag == unit.tag)
	_expect(shots.size() >= 6, "Cadence fixture must produce several real weapon attacks")
	if shots.size() < 2:
		return -1.0
	return float(shots.back().tick-shots.front().tick)/64.0/float(shots.size()-1)

func _surge(unit_type: String, base_speed: float, base_period: float) -> void:
	_case("surge/%s: cost, speed, cadence, expiry and invalid use" % unit_type)
	var normal = _travel(unit_type)
	var boosted = _travel(unit_type, "surge")
	_near(boosted.hp_cost, 10.0, 0.001, "Surge HP cost")
	_near(normal.distance, base_speed, 0.12, "Unboosted one-second movement")
	_near(boosted.distance/normal.distance, 1.5, 0.025, "Surge movement multiplier")
	var base_cadence = _cadence(unit_type, false)
	var surge_cadence = _cadence(unit_type, true)
	_near(base_cadence, base_period, 1.0/64.0, "Unboosted shot interval")
	_near(surge_cadence, base_period/1.5, 1.0/64.0, "Boosted shot interval")
	_near(base_cadence/surge_cadence, 1.5, 0.04, "Attack rate improvement")
	var duration = _travel(unit_type, "surge", 703)
	_expect(duration.unit.surge_timer > 0 and duration.unit.surge_timer <= 1.0/64.0 + .0001, "Surge remains active until its final tick")
	sim.step_ticks(1)
	_near(duration.unit.surge_timer, 0.0, 0.0001, "Surge expires at eleven seconds")
	var at: Vector2 = duration.unit.pos
	sim.step_ticks(64)
	_near(duration.unit.pos.distance_to(at), base_speed, 0.12, "Movement returns to baseline after expiry")
	_reset()
	var low = sim.spawn_unit(unit_type, 1, Vector2(30,40))
	low.hp = 10.0
	_expect(sim.issue_command([low.tag], "surge").accepted == 0, "Cannot pay ten HP when only ten remain")
	_near(low.hp, 10.0, 0.0, "Rejected low-HP Surge costs nothing")
	var wrong = sim.spawn_unit("pioneer", 1, Vector2(60,40))
	_expect(sim.issue_command([wrong.tag], "surge").accepted == 0 and wrong.hp == 45.0, "Wrong caster cannot use Surge")
	cases.back().metrics = {"movement_ratio": boosted.distance/normal.distance, "normal_interval": base_cadence, "surge_interval": surge_cadence}

func _surge_win(unit_type: String, boosted_owner: int) -> void:
	_case("surge/%s: boosted side %d wins a normal-health mirror duel" % [unit_type, boosted_owner])
	_reset()
	var blue = sim.spawn_unit(unit_type, 1, Vector2(40,40))
	var red = sim.spawn_unit(unit_type, 2, Vector2(50,40))
	var boosted = blue if boosted_owner == 1 else red
	sim.issue_command([boosted.tag], "surge")
	sim.issue_command([blue.tag], "attack_target", red.pos, red.tag)
	sim.issue_command([red.tag], "attack_target", blue.pos, blue.tag)
	for _i in range(640):
		sim.step_ticks(1)
		if not sim.units.has(blue.tag) or not sim.units.has(red.tag):
			break
	_expect(sim.units.has(boosted.tag), "Boosted unit should survive despite its ten-HP cost")
	_expect(not sim.units.has(red.tag if boosted_owner == 1 else blue.tag), "Unboosted opponent must actually die")
	_expect(boosted.hp > 0 and boosted.hp <= (11.0 if unit_type == "rifleman" else 50.0), "Surviving HP must be inside the declared close-duel window")
	_expect(sim.sim_time <= (4.0 if unit_type == "rifleman" else 6.0), "Boost advantage must produce a timely win")
	cases.back().metrics = {"survivor_hp": boosted.hp, "time": sim.sim_time}

func _phase() -> void:
	_case("phase_step: maximum range, cooldown, collision history and rejection")
	_reset()
	var unit = sim.spawn_unit("skirmisher", 1, Vector2(30,40))
	unit.crowd_path = [Vector2(35,45)]
	unit.crowd_goal = Vector2(80,40)
	unit.crowd_until = 1000
	_expect(sim.issue_command([unit.tag], "phase_step", Vector2(100,40)).accepted == 1, "First Phase Step accepted")
	_near(unit.pos.distance_to(Vector2(30,40)), 18.0, 0.001, "Teleport range is capped at eighteen")
	_expect(unit.prev_pos == unit.pos and unit.home_pos == unit.pos, "Teleport resets interpolation and return-to-post history")
	_expect(unit.path.is_empty() and unit.crowd_path.is_empty() and unit.orders.is_empty(), "Teleport clears both terrain and crowd routes")
	_near(unit.phase_cooldown, 7.0, .0001, "Seven-second cooldown starts")
	var arrived: Vector2 = unit.pos
	unit.attack_state = "windup"
	unit.attack_state_timer = .25
	_expect(sim.issue_command([unit.tag], "phase_step", Vector2(60,40)).accepted == 0, "Immediate recast rejected")
	_expect(unit.attack_state == "windup" and unit.attack_state_timer == .25, "Rejected recast does not cancel an attack")
	unit.attack_state = "idle"
	sim.issue_command([unit.tag], "hold_position")
	sim.step_ticks(447)
	_expect(unit.phase_cooldown > 0 and sim.issue_command([unit.tag], "phase_step", Vector2(60,40)).accepted == 0, "Recast one tick early stays rejected")
	_expect(unit.pos == arrived, "Cooldown rejection cannot move the unit")
	sim.step_ticks(1)
	_expect(sim.issue_command([unit.tag], "phase_step", Vector2(58,40)).accepted == 1, "Recast accepted exactly after cooldown")
	_near(unit.pos.x, 58.0, 0.001, "A shorter teleport lands exactly at its requested point")
	var wrong = sim.spawn_unit("rifleman", 1, Vector2(80,40))
	wrong.attack_state = "windup"
	wrong.attack_state_timer = .25
	_expect(sim.issue_command([wrong.tag], "phase_step", Vector2(90,40)).accepted == 0 and wrong.pos == Vector2(80,40), "Invalid caster rejected without moving")
	_expect(wrong.attack_state == "windup", "Invalid caster rejection cannot cancel wind-up")

func _charge() -> void:
	_case("charge: eighty-percent speed increase, duration and invalid caster")
	var normal = _travel("sunblade")
	var boosted = _travel("sunblade", "charge")
	_near(normal.distance, 7.6, .12, "Sunblade base speed")
	_near(boosted.distance/normal.distance, 1.8, .025, "Rush movement multiplier")
	_near(boosted.hp_cost, 0.0, 0.0, "Rush costs no health")
	var expiry = _travel("sunblade", "charge", 223)
	_expect(expiry.unit.charge_timer > 0 and expiry.unit.charge_timer <= 1.0/64.0+.0001, "Rush lasts until the final duration tick")
	sim.step_ticks(1)
	_near(expiry.unit.charge_timer, 0.0, .0001, "Rush expires at 3.5 seconds")
	var at: Vector2 = expiry.unit.pos
	sim.step_ticks(64)
	_near(expiry.unit.pos.distance_to(at), 7.6, .12, "Rush expiry restores baseline speed")
	var wrong = sim.spawn_unit("rifleman", 1, Vector2(170,70))
	_expect(sim.issue_command([wrong.tag], "charge").accepted == 0, "Only Sunblade can Rush")
	cases.back().metrics = {"movement_ratio": boosted.distance/normal.distance}

func _first_hit(attacker: Dictionary, target: Dictionary, limit: int = 32) -> bool:
	var hp: float = target.hp
	var shields: float = target.shields
	sim.issue_command([attacker.tag], "attack_target", target.pos, target.tag)
	for _i in range(limit):
		sim.step_ticks(1)
		if target.hp < hp or target.shields < shields:
			return true
	return false

func _artillery() -> void:
	_case("emplace/mobilize: identity, HP, supply, radius and mobility")
	_reset()
	var unit = sim.spawn_unit("howitzer", 1, Vector2(30,40))
	unit.hp = 100.0
	unit.weapon_cooldown = .35
	var tag: int = unit.tag
	_expect(sim.issue_command([tag], "emplace").accepted == 1, "Mobile Howitzer can emplace")
	_expect(unit.unit_type == "howitzer_emplaced" and unit.is_immobile and unit.hp == 100.0 and unit.tag == tag, "Morph preserves identity and health")
	_near(unit.radius, 1.85, .0001, "Emplaced footprint radius")
	_near(unit.weapon_cooldown, .35, .0001, "Morph preserves weapon cooldown")
	_expect(sim.players[1].supply_used == 3, "Morph preserves supply usage")
	sim.issue_command([tag], "move", Vector2(70,40))
	sim.step_ticks(64)
	_near(unit.pos.distance_to(Vector2(30,40)), 0.0, .001, "Emplaced artillery cannot move")
	_expect(sim.issue_command([tag], "mobilize").accepted == 1, "Emplaced Howitzer can mobilize")
	_expect(unit.unit_type == "howitzer" and not unit.is_immobile and unit.hp == 100.0 and unit.tag == tag, "Mobilize restores mobile mode without healing")
	_near(unit.radius, 1.75, .0001, "Mobile footprint radius")
	sim.issue_command([tag], "move", Vector2(70,40))
	var start: Vector2 = unit.pos
	sim.step_ticks(64)
	_near(unit.pos.distance_to(start), 5.8, .12, "Mobilized artillery walks at baseline speed")
	var wrong = sim.spawn_unit("rifleman", 1, Vector2(90,40))
	_expect(sim.issue_command([wrong.tag], "emplace").accepted == 0 and sim.issue_command([wrong.tag], "mobilize").accepted == 0, "Wrong artillery morph casters rejected")
	_reset()
	unit = sim.spawn_unit("howitzer", 1, Vector2(30,40))
	var waiting_target = sim.spawn_unit("pioneer", 2, Vector2(40,40))
	sim.issue_command([waiting_target.tag], "hold_position")
	sim.issue_command([unit.tag], "attack_target", waiting_target.pos, waiting_target.tag)
	sim.step_ticks(3)
	_expect(unit.attack_state == "windup", "Mobile shot is still winding up before mode change")
	sim.issue_command([unit.tag], "emplace")
	_expect(unit.attack_state == "idle", "Mode change cancels the unfinished old-weapon wind-up")
	sim.step_ticks(6)
	_near(waiting_target.hp, 45.0, .001, "New weapon must wait for its own damage point")
	_case("emplace: long range, minimum range, splash falloff and friendly fire exclusion")
	for distance in [4.0, 25.0, 40.0]:
		_reset()
		unit = sim.spawn_unit("howitzer_emplaced", 1, Vector2(30,40))
		var target = sim.spawn_unit("rifleman", 2, Vector2(30+distance,40))
		target.weapon_cooldown = 10000.0
		sim.issue_command([unit.tag, target.tag], "hold_position")
		sim.step_ticks(64)
		_near(target.hp, 5.0 if distance == 25.0 else 45.0, .001, "Deployed firing envelope at distance %.1f" % distance)
	_reset()
	unit = sim.spawn_unit("howitzer", 1, Vector2(30,40))
	var far = sim.spawn_unit("rifleman", 2, Vector2(55,40))
	far.weapon_cooldown = 10000.0
	sim.issue_command([unit.tag, far.tag], "hold_position")
	sim.step_ticks(64)
	_near(far.hp, 45.0, .001, "Mobile gun cannot match deployed range")
	_reset()
	unit = sim.spawn_unit("howitzer_emplaced", 1, Vector2(30,40))
	var primary = sim.spawn_unit("silo", 2, Vector2(55,40))
	var inner = sim.spawn_unit("silo", 2, Vector2(55,41))
	var outer = sim.spawn_unit("silo", 2, Vector2(55,43))
	var outside = sim.spawn_unit("silo", 2, Vector2(55,44))
	var friendly = sim.spawn_unit("silo", 1, Vector2(55,41.5))
	_expect(_first_hit(unit, primary), "Deployed gun fires within its expected wind-up window")
	_near(primary.hp, 331.0, .001, "Primary armored hit is 40+30-1")
	_near(inner.hp, 366.0, .001, "Inner splash is half raw damage, then armor")
	_near(outer.hp, 383.5, .001, "Outer splash is quarter raw damage, then armor")
	_near(outside.hp, 400.0, .001, "Targets beyond splash radius are untouched")
	_near(friendly.hp, 400.0, .001, "Splash excludes friendly units")

func _silo() -> void:
	_case("retract_silo/extend_silo: walkability, supply and preservation")
	_reset()
	var silo = sim.spawn_unit("silo", 1, Vector2(50,40))
	silo.hp = 271.0
	var tag: int = silo.tag
	sim.step_ticks(1)
	_expect(not sim._has_clear_line_of_walk(Vector2(44,40),Vector2(56,40),.85), "Extended Silo blocks the lane")
	_expect(sim.issue_command([tag], "retract_silo").accepted == 1, "Silo can retract")
	sim.step_ticks(1)
	_expect(silo.is_walkable_structure and silo.unit_type == "silo_retracted", "Retracted silo is walkable")
	_expect(sim._has_clear_line_of_walk(Vector2(44,40),Vector2(56,40),.85), "Retracting clears the navigation lane")
	_expect(silo.hp == 271.0 and silo.tag == tag and sim.players[1].supply_cap == 8, "Retracting preserves damage, tag and eight supply")
	_expect(sim.issue_command([tag], "extend_silo").accepted == 1, "Retracted Silo can extend")
	sim.step_ticks(1)
	_expect(not silo.is_walkable_structure and not sim._has_clear_line_of_walk(Vector2(44,40),Vector2(56,40),.85), "Extending restores collision")
	_expect(silo.hp == 271.0 and silo.tag == tag and sim.players[1].supply_cap == 8, "Extending preserves damage, tag and supply")
	var wrong = sim.spawn_unit("pioneer", 1, Vector2(80,40))
	_expect(sim.issue_command([wrong.tag], "retract_silo").accepted == 0 and sim.issue_command([wrong.tag], "extend_silo").accepted == 0, "Only silo modes can toggle")

func _slow() -> void:
	_case("passive/concussive_slow: real hit applies half movement speed for two seconds")
	_reset()
	var breacher = sim.spawn_unit("breacher", 1, Vector2(40,40))
	var target = sim.spawn_unit("pioneer", 2, Vector2(50,40))
	sim.issue_command([target.tag], "hold_position")
	_expect(_first_hit(breacher,target), "Breach charge lands")
	_near(target.hp, 35.0, .001, "Light target receives ten damage without armored bonus")
	_near(target.slow_timer, 2.0, .02, "Concussive slow duration")
	sim.issue_command([breacher.tag], "move", Vector2(25,40))
	sim.issue_command([target.tag], "move", Vector2(150,40))
	var at: Vector2 = target.pos
	sim.step_ticks(64)
	_near(target.pos.distance_to(at), 3.5, .12, "Concussive slow halves Pioneer movement")
	sim.step_ticks(64)
	_near(target.slow_timer, 0.0, .0001, "Slow expires after two seconds")
	at = target.pos
	sim.step_ticks(64)
	_near(target.pos.distance_to(at), 7.0, .12, "Movement returns to baseline after slow")

func _shields() -> void:
	_case("passive/aegis_shields: damage absorption, delayed regeneration, reset and cap")
	_reset()
	var unit = sim.spawn_unit("skirmisher", 1, Vector2(30,40))
	unit.shields = 40.0
	unit.out_of_combat_timer = 0.0
	sim.issue_command([unit.tag], "hold_position")
	sim.step_ticks(223)
	_near(unit.shields, 40.0, .0001, "No regeneration before 3.5 seconds out of combat")
	sim.step_ticks(65)
	_near(unit.shields, 46.09375, .1, "Regeneration restores six shields per second after delay")
	var attacker = sim.spawn_unit("rifleman", 2, Vector2(200,200))
	var before: float = unit.shields
	# A direct, explicitly isolated damage fixture tests the reset of the regen clock.
	sim._apply_damage_to_target(attacker, unit, 6.0, {}, 1.0)
	_near(unit.shields, before-6.0, .0001, "Shields absorb incoming damage before HP")
	_near(unit.hp, 80.0, .0001, "Shield-only hit does not damage health")
	sim.step_ticks(223)
	_near(unit.shields, before-6.0, .0001, "New damage restarts the regeneration delay")
	sim.step_ticks(1000)
	_near(unit.shields, 80.0, .0001, "Regeneration caps at maximum shields")

func _cliff_walk() -> void:
	_case("passive/cliff_walk: Spire Walker crosses a cliff while normal infantry routes around")
	for unit_type in ["spire_walker", "rifleman"]:
		_reset()
		sim.terrain_obstacles.append(Rect2(44,20,4,40))
		sim.nav_dirty = true
		var unit = sim.spawn_unit(unit_type, 1, Vector2(30,40))
		sim.issue_command([unit.tag], "move", Vector2(65,40))
		var lateral = 0.0
		for _i in range(400):
			sim.step_ticks(1)
			lateral = maxf(lateral, absf(unit.pos.y-40.0))
		if unit_type == "spire_walker":
			_expect(unit.pos.x >= 63.0 and lateral < .05, "Cliff-walker crosses directly within 6.25 seconds")
		else:
			_expect(lateral > 19.0, "Ordinary Rifleman takes the outside terrain route")

func _multi_hit() -> void:
	_case("passive/multi_hit: each light blade hit pays armor separately; dead target earns only one kill")
	_reset()
	var unit = sim.spawn_unit("sunblade", 1, Vector2(40,40))
	var target = sim.spawn_unit("breacher", 2, Vector2(43,40))
	target.weapon_cooldown = 10000.0
	sim.issue_command([target.tag], "hold_position")
	_expect(_first_hit(unit,target), "Sunblade completes one real attack")
	_near(target.hp, 95.0, .001, "Twin blades apply two hits of sixteen minus one armor")
	_expect(sim.recent_events.filter(func(e): return e.type == "weapon_fire" and e.attacker_tag == unit.tag).size() == 1, "One volley emits one weapon-fire event")
	_reset()
	unit = sim.spawn_unit("sunblade",1,Vector2(40,40))
	target = sim.spawn_unit("breacher",2,Vector2(43,40))
	target.armor = 100.0
	target.weapon_cooldown = 10000.0
	sim.issue_command([target.tag], "hold_position")
	_first_hit(unit,target)
	_near(target.hp, 124.0, .001, "Minimum damage applies independently to each hit")
	_reset()
	unit = sim.spawn_unit("spire_walker",1,Vector2(40,40))
	target = sim.spawn_unit("rifleman",2,Vector2(50,40))
	target.hp = 300.0
	target.max_hp = 300.0
	target.weapon_cooldown = 10000.0
	sim.issue_command([target.tag], "hold_position")
	_first_hit(unit,target)
	_near(target.hp, 240.0, .001, "Prism volley applies two twenty-plus-ten light bonus hits")
	_reset()
	unit = sim.spawn_unit("sunblade",1,Vector2(40,40))
	target = sim.spawn_unit("breacher",2,Vector2(43,40))
	target.hp = 1.0
	target.weapon_cooldown = 10000.0
	sim.issue_command([target.tag], "hold_position")
	_first_hit(unit,target)
	_expect(not sim.units.has(target.tag) and unit.kills == 1 and sim.players[1].units_killed == 1, "Later hits cannot award another kill on the same corpse")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_surge("rifleman", 7.2, .614857142857)
	_surge("breacher", 7.0, 1.07)
	for unit_type in ["rifleman", "breacher"]:
		for owner in [1,2]:
			_surge_win(unit_type, owner)
	_phase()
	_charge()
	_artillery()
	_silo()
	_slow()
	_shields()
	_cliff_walk()
	_multi_hit()
	var report = {"suite": "combat_abilities", "assertions": assertions, "covered_abilities": COVERED_ABILITIES, "covered_passives": COVERED_PASSIVES, "cases": cases, "failures": failures}
	print(JSON.stringify(report))
	quit(0 if failures.is_empty() else 1)
