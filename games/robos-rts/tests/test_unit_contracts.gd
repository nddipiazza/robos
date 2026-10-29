extends SceneTree

# Reviewed balance contracts: these numbers are deliberate expectations, not
# assertions calculated from the registry under test. Dummy-only mechanical
# checks are separate from duels, which always use natural unit HP and stats.
const COVERED_UNITS = [
	"pioneer", "rifleman", "breacher", "howitzer", "howitzer_emplaced",
	"colony_hub", "silo", "silo_retracted", "aether_tap", "muster_hall", "workshop",
	"forager", "skitterling", "bile_crawler", "blight_hurler", "brood_nest",
	"mote", "sunblade", "skirmisher", "spire_walker", "heartstone", "resonator", "waystone"
]
# HP, shields, armor, one-second travel distance, supply cost/provided, structure.
const EXPECTED = {
	"pioneer": [45, 0, 0, 7.0, 1, false],
	"rifleman": [45, 0, 0, 7.2, 1, false],
	"breacher": [125, 0, 1, 7.0, 2, false],
	"howitzer": [175, 0, 1, 5.8, 3, false],
	"howitzer_emplaced": [175, 0, 1, 0.0, 3, false],
	"colony_hub": [1500, 0, 1, 0.0, 15, true],
	"silo": [400, 0, 1, 0.0, 8, true],
	"silo_retracted": [400, 0, 1, 0.0, 8, true],
	"aether_tap": [500, 0, 1, 0.0, 0, true],
	"muster_hall": [1000, 0, 1, 0.0, 0, true],
	"workshop": [1250, 0, 1, 0.0, 0, true],
	"forager": [40, 0, 0, 7.0, 1, false],
	"skitterling": [35, 0, 0, 9.8, 1, false],
	"bile_crawler": [145, 0, 1, 7.0, 2, false],
	"blight_hurler": [120, 0, 1, 7.2, 3, false],
	"brood_nest": [1500, 0, 1, 0.0, 15, true],
	"mote": [20, 20, 0, 7.2, 1, false],
	"sunblade": [100, 50, 1, 7.6, 2, false],
	"skirmisher": [80, 80, 1, 8.4, 2, false],
	"spire_walker": [200, 150, 1, 6.4, 6, false],
	"heartstone": [1000, 1000, 1, 0.0, 15, true],
	"resonator": [200, 200, 0, 0.0, 8, true],
	"waystone": [500, 500, 1, 0.0, 0, true]
}
# Range, minimum range, complete volley damage against a Light zero-armor dummy,
# number of independently armored strikes, shot-to-shot period (seconds).
const WEAPONS = {
	"pioneer": [1.6, 0.0, 5, 1, 1.07],
	"rifleman": [12.5, 0.0, 6, 1, 0.614857142857],
	"breacher": [14.5, 0.0, 10, 1, 1.07],
	"howitzer": [16.5, 0.0, 15, 1, 0.74],
	"howitzer_emplaced": [31.0, 5.0, 40, 1, 2.14],
	"forager": [1.6, 0.0, 5, 1, 1.07],
	"skitterling": [1.9, 0.0, 5, 1, 0.49],
	"bile_crawler": [10.5, 0.0, 16, 1, 1.43],
	"blight_hurler": [15.0, 0.0, 18, 1, 1.14],
	"mote": [1.8, 0.0, 5, 1, 1.07],
	"sunblade": [2.1, 0.0, 32, 2, 0.86],
	"skirmisher": [15.5, 0.0, 13, 1, 1.34],
	"spire_walker": [21.0, 0.0, 60, 2, 1.07]
}
# Unit under test, opponent, initial center separation, expected winner (1/2),
# winner HP+shields interval, and battle-duration interval. No HP overrides here.
const DUELS = [
	["pioneer", "forager", 8.0, 1, 1, 15, 6.0, 12.0],
	["rifleman", "pioneer", 18.0, 1, 20, 45, 3.0, 8.0],
	["breacher", "pioneer", 18.0, 1, 95, 125, 3.0, 8.0],
	["howitzer", "pioneer", 18.0, 1, 160, 175, 1.0, 4.0],
	["howitzer_emplaced", "rifleman", 28.0, 1, 150, 175, 2.0, 4.0],
	["forager", "pioneer", 8.0, 2, 1, 15, 6.0, 12.0],
	["skitterling", "pioneer", 8.0, 1, 5, 35, 3.0, 8.0],
	["bile_crawler", "pioneer", 18.0, 1, 110, 145, 2.0, 7.0],
	["blight_hurler", "pioneer", 18.0, 1, 100, 120, 1.5, 6.0],
	["mote", "pioneer", 8.0, 2, 1, 15, 6.0, 12.0],
	["sunblade", "pioneer", 8.0, 1, 130, 150, 0.5, 2.0],
	["skirmisher", "pioneer", 18.0, 1, 135, 160, 3.0, 7.0],
	["spire_walker", "pioneer", 18.0, 1, 345, 350, 0.05, 0.5]
]

var sim: Node
var failures: Array = []
var checks: Array = []

func _initialize() -> void:
	call_deferred("_run")

func _check(id: String, actual: Variant, minimum: Variant, maximum: Variant) -> void:
	var passed: bool = float(actual) >= float(minimum) and float(actual) <= float(maximum)
	var result = {"id": id, "actual": actual, "minimum": minimum, "maximum": maximum, "passed": passed}
	checks.append(result)
	if not passed:
		failures.append(result)

func _fresh() -> void:
	sim.reset_state(42, 192, 128)
	root.get_node("RTSCommanderAI").configure_from_scenario([])

func _spawn_contract(kind: String) -> void:
	_fresh()
	var u = sim.spawn_unit(kind, 1, Vector2(20, 64))
	var e: Array = EXPECTED[kind]
	_check(kind + "/initial_hp", u.hp, e[0], e[0])
	_check(kind + "/initial_shields", u.shields, e[1], e[1])
	_check(kind + "/armor", u.armor, e[2], e[2])
	_check(kind + "/structure_flag", int(u.is_structure), int(e[5]), int(e[5]))
	var def: Dictionary = root.get_node("RTSData").get_unit_def(kind)
	var supply = def.get("supply_provided", 0) if e[5] else def.get("supply_cost", 0)
	_check(kind + "/supply", supply, e[4], e[4])
	sim.issue_command([u.tag], "move", Vector2(150, 64))
	sim.step_ticks(64)
	_check(kind + "/travel_1_second", u.pos.distance_to(Vector2(20, 64)), maxf(0, e[3] - 0.04), e[3] + 0.04)
	_check(kind + "/travel_lateral_error", absf(u.pos.y-64), 0, 0.01)
	if e[5]:
		_check(kind + "/no_offensive_weapon", int(def.has("weapon")), 0, 0)
	# A common six-damage hit proves each unit's defensive pool, including
	# shield-first absorption and the structure armor values declared above.
	var attacker = sim.spawn_unit("rifleman", 2, Vector2(170, 64))
	sim._apply_damage_to_target(attacker, u, 6.0, {}, 1.0)
	var expected_hp = e[0] if e[1] > 0 else e[0] - (6-e[2])
	var expected_shields = maxf(0, e[1]-6)
	_check(kind + "/defensive_hp_after_hit", u.hp, expected_hp, expected_hp)
	_check(kind + "/defensive_shields_after_hit", u.shields, expected_shields, expected_shields)

func _dummy_fixture(kind: String, armor: float = 0, target_kind: String = "rifleman") -> Dictionary:
	_fresh()
	var shooter = sim.spawn_unit(kind, 1, Vector2(40, 64))
	var distance = 10.0 if kind == "howitzer_emplaced" else maxf(2.5, WEAPONS[kind][0] * 0.5)
	var dummy = sim.spawn_unit(target_kind, 2, Vector2(40 + distance, 64))
	# Explicit mechanical fixture, never used as a claimed combat win.
	dummy.hp = 10000.0
	dummy.max_hp = 10000.0
	dummy.armor = armor
	dummy.weapon_cooldown = 10000.0
	sim.issue_command([dummy.tag], "hold_position")
	sim.issue_command([shooter.tag], "attack_target", dummy.pos, dummy.tag)
	return {"shooter": shooter, "dummy": dummy}

func _weapon_contract(kind: String) -> void:
	var e: Array = WEAPONS[kind]
	var f = _dummy_fixture(kind)
	for _i in range(64):
		sim.step_ticks(1)
		if f.dummy.hp < 10000:
			break
	_check(kind + "/first_volley_damage", 10000-f.dummy.hp, e[2], e[2])
	# Armor must be applied once to each strike, not once to the combined volley.
	f = _dummy_fixture(kind, 2.0)
	for _i in range(64):
		sim.step_ticks(1)
		if f.dummy.hp < 10000:
			break
	_check(kind + "/armor_per_strike", 10000-f.dummy.hp, e[2]-2*e[3], e[2]-2*e[3])
	f = _dummy_fixture(kind)
	sim.step_ticks(512)
	var shots: Array = sim.recent_events.filter(func(event): return event.type == "weapon_fire" and event.attacker_tag == f.shooter.tag)
	_check(kind + "/sampled_volleys", shots.size(), 3, 30)
	if shots.size() > 1:
		var interval = float(shots.back().tick-shots.front().tick)/64.0/(shots.size()-1)
		_check(kind + "/shot_interval", interval, e[4]-0.018, e[4]+0.018)
	# Hold-position range checks isolate targeting, without chasing the dummy.
	f = _dummy_fixture(kind)
	f.dummy.pos = f.shooter.pos + Vector2(e[0]+f.shooter.radius+f.dummy.radius+0.4, 0)
	sim.issue_command([f.shooter.tag], "hold_position")
	sim.step_ticks(32)
	_check(kind + "/outside_range_damage", 10000-f.dummy.hp, 0, 0)
	f.dummy.pos.x -= 0.8
	sim.step_ticks(32)
	_check(kind + "/inside_range_damage", 10000-f.dummy.hp, e[2], e[2])
	if kind == "howitzer_emplaced":
		f = _dummy_fixture(kind)
		f.dummy.pos = f.shooter.pos + Vector2(6, 0)
		sim.issue_command([f.shooter.tag], "hold_position")
		sim.step_ticks(192)
		_check(kind + "/minimum_range_dead_zone", 10000-f.dummy.hp, 0, 0)
	# Attribute-specific damage and negative controls use fixed expected totals;
	# the target is durable only so its first volley is fully measurable.
	var armored_expected = {"breacher": 19, "howitzer": 24, "howitzer_emplaced": 69, "skirmisher": 17,
		"sunblade": 30, "spire_walker": 38}
	if armored_expected.has(kind):
		f = _dummy_fixture(kind, 1, "breacher")
		for _i in range(64):
			sim.step_ticks(1)
			if f.dummy.hp < 10000:
				break
		_check(kind + "/armored_target_volley", 10000-f.dummy.hp, armored_expected[kind], armored_expected[kind])
	if kind == "blight_hurler":
		f = _dummy_fixture(kind, 1, "silo")
		for _i in range(64):
			sim.step_ticks(1)
			if f.dummy.hp < 10000:
				break
		_check(kind + "/structure_bonus_volley", 10000-f.dummy.hp, 25, 25)

func _duel_contract(c: Array) -> void:
	var name: String = c[0] + "/duel_vs_" + c[1]
	var loaded = sim.load_scenario_dict({"mode": "unit_battle", "seed": 42, "decor": false,
		"map": {"width": 160, "height": 128}, "units": [
			{"type": c[0], "owner": 1, "x": 80-c[2]*0.5, "y": 64},
			{"type": c[1], "owner": 2, "x": 80+c[2]*0.5, "y": 64}]})
	_check(name + "/fixture_loaded", int(loaded.ok), 1, 1)
	sim.start_unit_battle()
	for _i in range(20):
		sim.step_ticks(64)
		if sim.match_state.status == "finished":
			break
	_check(name + "/terminal_result", int(sim.match_state.status == "finished"), 1, 1)
	_check(name + "/winner", sim.match_state.winner, c[3], c[3])
	_check(name + "/duration", sim.sim_time, c[6], c[7])
	_check(name + "/survivor_count", sim.units.size(), 1, 1)
	if sim.units.size() == 1:
		var survivor: Dictionary = sim.units.values()[0]
		_check(name + "/winner_remaining_hp_and_shields", survivor.hp+survivor.shields, c[4], c[5])

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var registry: Array = root.get_node("RTSData").units.keys()
	registry.sort()
	var declared = COVERED_UNITS.duplicate()
	declared.sort()
	_check("roster/exact_registry_coverage", int(registry == declared), 1, 1)
	for kind in COVERED_UNITS:
		_spawn_contract(kind)
		if WEAPONS.has(kind):
			_weapon_contract(kind)
	for duel in DUELS:
		_duel_contract(duel)
	var report = {"suite": "unit_contracts", "coverage": {"units": COVERED_UNITS}, "checks": checks, "failures": failures}
	var folder = ProjectSettings.globalize_path("res://tests/e2e/reports")
	DirAccess.make_dir_recursive_absolute(folder)
	var file = FileAccess.open(folder.path_join("unit-contracts.json"), FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "  "))
	print(JSON.stringify({"suite": "unit_contracts", "units": COVERED_UNITS.size(), "checks": checks.size(), "failures": failures}))
	quit(0 if failures.is_empty() else 1)
