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
	_check_random_factions()
	_check(sim.start_online_match("frontier-hunters", 3, ["random", "random"], true).ok, "Ladder match loads")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_check(sim.match_state.factions == {"1": "humans", "2": "monsters"}, "Both random factions resolve from the fixed seed")
	_check(sim.match_state.ruleset == Rules.ID, "Ladder ruleset is advertised")
	_check(sim.players[1].supply_used == 12 and sim.players[1].supply_cap == 15, "Meridian opening supply")
	_check(sim.players[2].supply_used == 12 and sim.players[2].supply_cap == 14, "Gnarl opening supply includes a Drift Sac")
	_check(sim.players[2].crystal == 50 and sim.players[2].aether == 0, "Opening stock")
	var start: int = sim.match_state.assigned_starts["2"]
	var crystal: Array = []
	var gas: Array = []
	for deposit in sim.resources.values():
		if str(deposit.id).begins_with("start_%d_" % start):
			if deposit.resource_type == "crystal_field":
				crystal.append(deposit.amount)
			else:
				gas.append(deposit.amount)
	crystal.sort()
	_check(crystal == [900, 900, 900, 900, 1800, 1800, 1800, 1800] and gas == [2250, 2250], "Starting deposit stock")
	var nest: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "brood_nest").front()
	_check(nest.brood_slots == 3, "Starting Nest has three larvae")
	var expansion: Dictionary = sim.spawn_unit("brood_nest", 2, nest.pos + Vector2(15, 12))
	_check(expansion.brood_slots == 1, "Completed expansion has one larva")
	sim.players[2].crystal = 900
	_check(not sim.issue_command([nest.tag], "train_brood_keeper").ok and not sim.issue_command([nest.tag], "train_skitterling").ok,
		"The starting Nest requires a Hatchling Pool for Keepers and Skitterlings")
	sim.spawn_unit("hatchling_pool", 2, nest.pos + Vector2(-13, 12))
	_check(sim.issue_command([nest.tag], "train_brood_keeper").ok and nest.brood_slots == 3, "Keeper trains directly")
	_check(sim.issue_command([nest.tag], "train_forager").ok and nest.brood_slots == 2, "Forager consumes one larva")
	_check(sim.issue_command([nest.tag], "cancel_training", Vector2.ZERO, 0, "1").ok and nest.brood_slots == 2,
		"Canceling an egg keeps the larva spent")
	_check(sim.players[2].crystal == 725, "Canceling an egg refunds its full cost")
	var natural_ticks := ceili(Rules.NATURAL_LARVA_SECONDS * sim.TICK_RATE)
	sim.step_ticks(natural_ticks - 1)
	_check(nest.brood_slots == 2, "The next larva takes the full natural interval")
	sim.step_ticks(1)
	_check(nest.brood_slots == 3, "Natural larvae stop at three")
	var keeper: Dictionary = sim.spawn_unit("brood_keeper", 2, nest.pos + Vector2(5, 0))
	keeper.energy = 50.0
	for count in range(2):
		_check(sim.issue_command([keeper.tag], "inject_brood", nest.pos, nest.tag).ok, "The Nest accepts inject %d" % (count + 1))
		sim.step_ticks(1)
	_check(nest.brood_inject_queued == 1, "The second inject queues")
	var first: int = nest.brood_inject_finish
	sim.step_ticks(first - sim.tick)
	_check(nest.brood_slots == 4 and nest.brood_inject_finish > first, "The first inject releases its first larva and starts the second countdown")
	var release_ticks := ceili(Rules.INJECT_RELEASE_SECONDS * sim.TICK_RATE) * 2
	sim.step_ticks(release_ticks)
	_check(nest.brood_slots == 6, "The other two larvae emerge in sequence")
	sim.step_ticks(nest.brood_inject_finish - sim.tick)
	sim.step_ticks(release_ticks)
	_check(nest.brood_slots == 9 and sim.brood_inject_remaining(nest) == 0.0, "Queued injects finish sequentially")
	_check_skitterling_pair(nest)
	_check_targetable_eggs(nest, expansion)
	_check_ladder_combat()
	_check_stalemate()
	_check_headquarters_reveal()
	_check_stalemate_progress_events()
	_check_ladder_weapon_timing()
	_check_gnarl_tech_buildings()
	_check_concord_opening_and_supply_limit()
	_check(sim.start_skirmish("frontier-hunters", {"seed": 3, "ai_faction": "monsters"}).ok and not sim.ladder_rules,
		"Local skirmish returns to its original rules")
	print("Ladder opening checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _check_concord_opening_and_supply_limit() -> void:
	sim.start_online_match("frontier-hunters", 3, ["aliens", "monsters"], true)
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	var motes: Array = sim.units.values().filter(func(unit): return unit.owner == 1 and unit.unit_type == "mote")
	var concord: Dictionary = sim.players[1]
	_check(motes.size() == 12 and concord.supply_used == 12 and concord.supply_cap == 15
		and concord.crystal == 50 and concord.aether == 0, "Concord starts with 12 Motes, 15 supply, 50 crystal and zero aether")
	for i in range(25):
		sim.spawn_unit("resonator", 1, Vector2(5 + 5 * (i % 10), 5 + 5 * floori(float(i) / 10.0)))
	_check(concord.supply_cap == 200, "Additional supply stops raising the ladder cap at 200")

func _check_ladder_combat() -> void:
	var center := Vector2(128, 128)
	var sunblade: Dictionary = sim.spawn_unit("sunblade", 1, center)
	var tank: Dictionary = sim.spawn_unit("howitzer", 2, center + Vector2(2, 0))
	_check(sim._execute_weapon_hit(sunblade, tank) and tank.hp == 161.0, "Twin blades each apply tank armor")
	var needlewing: Dictionary = sim.spawn_unit("needlewing", 2, center + Vector2(0, 3))
	var target: Dictionary = sim.spawn_unit("needlewing", 1, center + Vector2(0, 5))
	var second: Dictionary = sim.spawn_unit("rifleman", 1, center + Vector2(0, 7))
	var third: Dictionary = sim.spawn_unit("rifleman", 1, center + Vector2(0, 9))
	var fourth: Dictionary = sim.spawn_unit("rifleman", 1, center + Vector2(0, 11))
	needlewing.facing = needlewing.pos.direction_to(target.pos).angle()
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim._execute_weapon_hit(needlewing, target) and target.hp == 111.0, "Needlewing can attack an airborne unit")
	_check(second.hp == 42.0 and third.hp == 44.0 and fourth.hp == 45.0, "Needlewing bounces deal 3 and 1 damage without a fourth hit")
	var keeper: Dictionary = sim.spawn_unit("brood_keeper", 1, center + Vector2(8, 0))
	_check(sim.weapon_range_against(keeper, tank) == 12.5 and sim.weapon_range_against(keeper, needlewing) == 17.5,
		"Brood Keeper selects different weapon ranges for ground and air")
	_check(sim._execute_weapon_hit(keeper, tank) and tank.hp == 155.0, "Ground talons deal two four-damage hits through one armor")
	_check(sim._execute_weapon_hit(keeper, needlewing) and needlewing.hp == 111.0, "Air spines deal a single nine-damage hit")
	var crawler: Dictionary = sim.spawn_unit("bile_crawler", 1, center + Vector2(10, 0))
	_check(sim.can_attack(crawler, tank) and not sim.can_attack(crawler, needlewing), "Ladder Bile Crawler attacks ground only")
	var mote: Dictionary = sim.spawn_unit("mote", 1, center + Vector2(0, 4))
	mote.shields = 0.0
	mote.out_of_combat_timer = 0.0
	sim._update_unit_timers(mote, 7.0)
	_check(mote.shields == 0.0, "Ladder shields wait past seven seconds")
	sim._update_unit_timers(mote, 1.0 / sim.TICK_RATE)
	mote.out_of_combat_timer = Rules.SHIELD_REGEN_DELAY_SECONDS
	for step in sim.TICK_RATE:
		sim._update_unit_timers(mote, 1.0 / sim.TICK_RATE)
	_check(is_equal_approx(mote.shields, 2.8), "Ladder shields restore 2.8 per second")
	var data := root.get_node("RTSData")
	_check(data.get_unit_def("mote").build_time == 17.0, "Ladder workers use Normal production timing")

func _check_ladder_weapon_timing() -> void:
	var first := _run_ladder_weapon_timing(231)
	_check(first == _run_ladder_weapon_timing(231) and first != _run_ladder_weapon_timing(232),
		"The seed reproduces weapon timing and another seed changes it")

func _run_ladder_weapon_timing(seed_value: int) -> Array:
	sim.load_scenario_dict({"ruleset": Rules.ID, "seed": seed_value, "paused": true, "map": {"width": 92, "height": 65}})
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(25, 25))
	var target: Dictionary = sim.spawn_unit("muster_hall", 2, Vector2(41, 25))
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim.issue_command([rifle.tag], "attack_target", target.pos, target.tag).ok, "Rifleman begins a visible attack")
	sim.step_ticks(1)
	_check(rifle.attack_state == "windup", "The first shot starts a windup")
	var before: float = target.hp
	target.pos.x += 9.0
	sim.step_ticks(4)
	_check(target.hp == before and rifle.weapon_cooldown == 0.0, "Leaving weapon range plus slop cancels the committed shot")
	target.pos.x -= 7.8
	sim.step_ticks(6 * sim.TICK_RATE)
	var shots: Array = sim.recent_events.filter(func(event): return event.type == "weapon_fire" and event.attacker_tag == rifle.tag)
	var intervals := []
	for i in range(1, shots.size()):
		var elapsed: float = (shots[i].tick - shots[i - 1].tick) * sim.TICK_DT
		intervals.append(elapsed)
		_check(elapsed >= 0.615 + Rules.WEAPON_JITTER_MIN and elapsed <= 0.615 + Rules.WEAPON_JITTER_MAX + 2.0 * sim.TICK_DT,
			"Every Rifleman shot stays within the ladder jitter range after tick rounding")
	_check(intervals.size() >= 7 and intervals.any(func(value): return value != intervals[0]),
		"A live Rifleman fires with varying intervals")
	var cruiser: Dictionary = sim.spawn_unit("dreadnought", 1, Vector2(52, 45))
	var weapon: Dictionary = sim._active_weapon(cruiser)
	_check(sim._weapon_period(cruiser, weapon) == weapon.period, "Dreadnought batteries retain their fixed period")
	return intervals

func _check_random_factions() -> void:
	var random_choices := {"1": "random", "2": "random"}
	var seen := {}
	for seed_value in range(128):
		var rolled: Dictionary = sim.resolve_factions(seed_value, random_choices)
		seen[rolled["1"] + "/" + rolled["2"]] = true
		_check(sim.resolve_factions(seed_value, random_choices) == rolled, "Same seed reproduces both factions")
		var first_fixed: Dictionary = sim.resolve_factions(seed_value, {"1": "aliens", "2": "random"})
		var second_fixed: Dictionary = sim.resolve_factions(seed_value, {"1": "random", "2": "humans"})
		_check(first_fixed == {"1": "aliens", "2": rolled["2"]} and second_fixed == {"1": rolled["1"], "2": "humans"},
			"Fixing either faction leaves the other seat's roll unchanged")
	_check(seen.size() == 9, "All nine faction pairs are reachable through Random")

func _check_stalemate() -> void:
	for unit in sim.units.values():
		if unit.is_worker:
			sim.issue_command([unit.tag], "stop")
	var warning_ticks: int = Rules.STALEMATE_WARNING_SECONDS * sim.TICK_RATE
	sim._ladder_last_progress_tick = sim.tick - warning_ticks + 1
	_check(sim.stalemate_seconds_remaining() == 0, "The draw countdown starts at the warning threshold")
	sim.step_ticks(1)
	_check(sim.stalemate_seconds_remaining() == 129, "The ladder announces the draw countdown")
	sim._ladder_last_progress_tick = sim.tick - Rules.STALEMATE_DRAW_SECONDS * sim.TICK_RATE + 1
	sim.step_ticks(1)
	_check(sim.match_state.reason == "stalemate" and sim.match_state.winner == 0, "Inactivity ends the match as a draw")

func _check_headquarters_reveal() -> void:
	sim.start_online_match("frontier-hunters", 3, ["humans", "monsters"], true)
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	var hub: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "colony_hub").front()
	var nest: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "brood_nest").front()
	for unit in sim.units.values():
		if unit.is_worker:
			sim.issue_command([unit.tag], "stop")
	var remaining: Dictionary = sim.spawn_unit("spore_watch", 2, nest.pos + Vector2(0, 8))
	var worker: Dictionary = sim.spawn_unit("forager", 2, remaining.pos + Vector2(0, 3))
	_check(sim.issue_command([hub.tag], "lift").ok, "The ladder Colony Hub can lift")
	sim._remove_destroyed_unit(nest)
	sim.step_ticks(1)
	sim.step_ticks(Rules.HEADQUARTERS_REVEAL_SECONDS * sim.TICK_RATE - 1)
	_check(not sim.can_see_unit(1, remaining), "The remaining enemy structure is hidden during the rebuild window")
	sim.step_ticks(1)
	_check(sim.can_see_unit(1, remaining) and not sim.can_see_unit(1, worker) and not sim.can_see_position(1, remaining.pos),
		"Headquarters loss reveals enemy structures without lifting the fog around them")
	_check(hub.flight_height > 0.0 and not sim.is_dropoff(hub, 1) and sim.match_state.status == "playing",
		"An airborne headquarters counts for elimination and cannot take resource deliveries")
	var rebuilding: Dictionary = sim.spawn_unit("brood_nest", 2, nest.pos, "", 0.15)
	sim.step_ticks(1)
	_check(not sim.can_see_unit(1, remaining), "Starting a new Nest ends the structure reveal")
	sim.spawn_unit("brood_growth_node", 2, nest.pos + Vector2(0, 15))
	for structure in [hub, remaining, rebuilding]:
		sim._remove_destroyed_unit(structure)
	sim.step_ticks(1)
	_check(sim.match_state.reason == "all_structures_destroyed" and sim.match_state.winner == 0,
		"Simultaneous loss is a draw and a growth node does not prevent elimination")

func _check_stalemate_progress_events() -> void:
	sim.load_scenario_dict({"ruleset": Rules.ID, "victory": "all_structures", "paused": true,
		"map": {"width": 105, "height": 90}, "players": {"1": {"crystal": 1100, "aether": 500}}})
	var hub: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(25, 25))
	sim.spawn_unit("brood_nest", 2, Vector2(88, 67))
	var depot: Dictionary = sim.spawn_unit("silo", 2, Vector2(82, 69))
	var ward: Dictionary = sim.spawn_unit("stasis_ward", 2, Vector2(78, 75))
	var pioneer: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(35, 23))
	var patch: Dictionary = sim.spawn_resource("crystal_field", Vector2(39, 23), 5)
	var armory: Dictionary = sim.spawn_unit("field_armory", 1, Vector2(22, 37))
	var warning_ticks: int = Rules.STALEMATE_WARNING_SECONDS * sim.TICK_RATE
	sim.step_ticks(1)
	sim._ladder_last_progress_tick = sim.tick - warning_ticks
	var original_progress: int = sim._ladder_last_progress_tick
	sim._apply_damage_to_target(pioneer, ward, 500.0, {}, 1.0)
	sim._apply_damage_to_target(pioneer, depot, 5.0, {}, 1.0)
	_check(sim._ladder_last_progress_tick == original_progress, "Ward kills and partial building damage preserve the warning")
	sim._apply_damage_to_target(pioneer, depot, 500.0, {}, 1.0)
	_check(sim._ladder_last_progress_tick == sim.tick, "An enemy building kill resets the warning")
	sim._ladder_last_progress_tick = sim.tick - warning_ticks
	_check(sim.issue_command([pioneer.tag], "harvest", patch.pos, patch.tag).ok, "Worker can mine the remaining crystal")
	sim.step_ticks(6 * sim.TICK_RATE)
	_check(sim.players[1].crystal_collected == 5 and sim.stalemate_seconds_remaining() == 0, "A resource delivery resets the warning")
	sim._ladder_last_progress_tick = sim.tick - warning_ticks
	_check(sim.issue_command([hub.tag], "train_pioneer").ok and sim.stalemate_seconds_remaining() > 0, "Training payment preserves the warning")
	sim.step_ticks(20 * sim.TICK_RATE)
	_check(sim.players[1].units_trained == 1 and sim.stalemate_seconds_remaining() == 0, "Unit completion resets the warning")
	sim._ladder_last_progress_tick = sim.tick - warning_ticks
	_check(sim.issue_command([pioneer.tag], "build_silo", Vector2(30, 17)).ok, "Pioneer can start a Silo during the warning")
	sim.step_ticks(35 * sim.TICK_RATE)
	_check(sim.players[1].structures_built == 1 and sim.stalemate_seconds_remaining() == 0, "Building completion resets the warning")
	sim._ladder_last_progress_tick = sim.tick - warning_ticks
	_check(sim.issue_command([armory.tag], "research_infantry_weapons").ok, "Field Armory can research during the warning")
	sim.step_ticks(ceili(Rules.MERIDIAN_GROUP_TIMES[0] * sim.TICK_RATE))
	_check(sim.players[1].upgrades.get("infantry_weapons") == 1 and sim.stalemate_seconds_remaining() == 0,
		"Research completion resets the warning")

func _check_gnarl_tech_buildings() -> void:
	sim.start_online_match("frontier-hunters", 3, ["humans", "monsters"], true)
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	var nest: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "brood_nest").front()
	for unit in sim.units.values():
		if unit.is_worker:
			sim.issue_command([unit.tag], "stop")
	sim.players[2].crystal = 1000
	sim.players[2].aether = 100
	_check(not sim.issue_command([nest.tag], "train_bile_crawler").ok, "Bile Crawler requires a Bile Warren")
	sim.step_ticks(12 * sim.TICK_RATE)
	_build_gnarl_tech("hatchling_pool", nest.pos, 200, 65.0)
	_check(sim.has_tech_structure(2, "hatchling_pool"), "The Hatchling Pool unlocks early Gnarl tech")
	_build_gnarl_tech("bile_warren", nest.pos, 150, 55.0)
	_check(sim.issue_command([nest.tag], "train_bile_crawler").ok, "The completed Warren unlocks Bile Crawlers")

func _build_gnarl_tech(type: String, base: Vector2, cost: int, duration: float) -> void:
	var workers: Array = sim.units.values().filter(func(unit): return unit.unit_type == "forager")
	var site := Vector2.INF
	for distance in [11.0, 13.0, 15.0]:
		for index in range(16):
			var candidate: Vector2 = base + Vector2.from_angle(float(index) * TAU / 16.0) * distance
			if sim._can_build(workers[0], type, candidate):
				site = candidate
				break
		if site.is_finite():
			break
	if not site.is_finite():
		failures.append("No usable living-ground construction site for %s" % type)
		return
	workers.sort_custom(func(a, b): return a.pos.distance_squared_to(site) < b.pos.distance_squared_to(site))
	var builder: Dictionary = workers[0]
	var before: int = sim.players[2].crystal
	_check(sim.issue_command([builder.tag], "build_" + type, site).ok, "Forager receives %s construction order" % type)
	for step in range(640):
		if not sim.units.has(builder.tag):
			break
		sim.step_ticks(1)
	if sim.units.has(builder.tag):
		failures.append("Forager never starts %s construction" % type)
		return
	_check(sim.players[2].crystal == before - cost, "%s charges its crystal cost and consumes the Forager" % type)
	var ticks := ceili(duration * sim.TICK_RATE)
	sim.step_ticks(ticks - 1)
	_check(not sim.has_tech_structure(2, type), "%s remains under construction before its full ladder build time" % type)
	sim.step_ticks(1)
	_check(sim.has_tech_structure(2, type), "%s completes at its ladder build time" % type)

func _check_skitterling_pair(nest: Dictionary) -> void:
	var crystal_before: int = sim.players[2].crystal
	var supply_before: float = sim.players[2].supply_used
	_check(sim.issue_command([nest.tag], "train_skitterling").ok, "A Skitterling pair can be ordered")
	_check(nest.brood_slots == 8 and sim.players[2].crystal == crystal_before - 50 and sim.players[2].supply_used == supply_before + 1,
		"One larva reserves both Skitterlings for 50 crystal and one supply")
	sim.step_ticks(24 * sim.TICK_RATE)
	var hatched: Array = sim.units.values().filter(func(unit): return unit.unit_type == "skitterling")
	_check(hatched.size() == 2 and sim.players[2].supply_used == supply_before + 1, "The pair hatches without double-counting supply")
	if hatched.size() == 2:
		sim._remove_destroyed_unit(hatched[0])
		_check(sim.players[2].supply_used == supply_before + 0.5, "One Skitterling uses half a supply")

func _check_targetable_eggs(nest: Dictionary, expansion: Dictionary) -> void:
	var attacker: Dictionary = sim.units.values().filter(func(unit): return unit.owner == 1 and unit.is_worker).front()
	var larva: Dictionary = sim.units[nest.brood_larvae.front()]
	var location: Vector2 = larva.pos
	var crystal_before: int = sim.players[2].crystal
	var supply_before: float = sim.players[2].supply_used
	_check(not sim.issue_command([larva.tag], "larva_morph_unit", Vector2.ZERO, 0, "rifleman").ok,
		"A larva cannot morph into another faction's unit")
	_check(sim.issue_command([larva.tag], "larva_morph_unit", Vector2.ZERO, 0, "forager").ok and larva.unit_type == "brood_egg",
		"The selected larva becomes an egg")
	var job: Dictionary = nest.production_queue.back()
	var egg: Dictionary = sim.units[job.egg_tag]
	_check(egg.pos == location and egg.hp == 200.0 and egg.nonblocking, "An egg is targetable at the larva's location and does not block movement")
	sim._apply_damage_to_target(attacker, egg, 250.0, {}, 1.0)
	_check(not sim.units.has(egg.tag) and nest.production_queue.is_empty(), "Destroying the egg removes its job")
	_check(sim.players[2].crystal == crystal_before - 50 and sim.players[2].supply_used == supply_before,
		"A destroyed egg costs its resources and releases its reserved supply")
	_check(sim.issue_command([nest.tag], "train_forager").ok, "Queue an egg to cancel")
	egg = sim.units[nest.production_queue.back().egg_tag]
	_check(sim.issue_command([egg.tag], "cancel_brood_egg").ok and not sim.units.has(egg.tag) and sim.players[2].crystal == crystal_before - 50,
		"The egg's own cancel command refunds the new job")
	_check(sim.issue_command([expansion.tag], "train_forager").ok, "Queue at the expansion")
	egg = sim.units[expansion.production_queue.back().egg_tag]
	var trained: int = sim.players[2].units_trained
	sim._remove_destroyed_unit(expansion)
	_check(sim.units.has(egg.tag), "An egg survives destruction of its Nest")
	sim.step_ticks(17 * sim.TICK_RATE)
	_check(not sim.units.has(egg.tag) and sim.players[2].units_trained == trained + 1, "An orphan egg finishes its hatch independently")
