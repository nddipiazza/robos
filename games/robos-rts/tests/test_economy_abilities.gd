extends SceneTree

# Reviewed expectations, independent of RTSData. Match-mode timing is deliberate:
# isolated fixtures without match_state use the older quarter-time demo rules.
const COVERED_ABILITIES = ["move", "stop", "hold_position", "attack", "harvest", "rally",
	"train_pioneer", "train_rifleman", "train_breacher", "train_howitzer", "train_forager", "train_skitterling", "train_bile_crawler", "train_blight_hurler", "train_mote", "train_sunblade", "train_skirmisher", "train_spire_walker",
	"build_colony_hub", "build_silo", "build_aether_tap", "build_muster_hall", "build_workshop", "build_heartstone", "build_resonator", "build_waystone"]
const TRAINING = [
	["pioneer", "colony_hub", "humans", 50, 0, 12, 1], ["rifleman", "muster_hall", "humans", 50, 0, 18, 1],
	["breacher", "muster_hall", "humans", 100, 25, 21, 2], ["howitzer", "workshop", "humans", 150, 125, 32, 3],
	["forager", "brood_nest", "monsters", 50, 0, 12, 1], ["skitterling", "brood_nest", "monsters", 25, 0, 17, 1],
	["bile_crawler", "brood_nest", "monsters", 75, 25, 19, 2], ["blight_hurler", "brood_nest", "monsters", 100, 100, 24, 3],
	["mote", "heartstone", "aliens", 50, 0, 12, 1], ["sunblade", "waystone", "aliens", 100, 0, 27, 2],
	["skirmisher", "waystone", "aliens", 125, 50, 30, 2], ["spire_walker", "waystone", "aliens", 300, 200, 54, 6]]
const BUILDING = [
	["colony_hub", "pioneer", 400, 0, 71, ""], ["silo", "pioneer", 100, 0, 21, ""],
	["aether_tap", "pioneer", 75, 0, 21, ""], ["muster_hall", "pioneer", 150, 0, 46, "silo"],
	["workshop", "pioneer", 150, 100, 43, "muster_hall"], ["heartstone", "mote", 400, 0, 71, ""],
	["resonator", "mote", 100, 0, 18, ""], ["waystone", "mote", 150, 0, 46, ""]]
const HALLS = {"humans": "colony_hub", "monsters": "brood_nest", "aliens": "heartstone"}
const WORKERS = {"humans": "pioneer", "monsters": "forager", "aliens": "mote"}
var sim: Node
var failures: Array = []
var cases: Array = []
var label := ""
var assertions := 0

func _initialize() -> void:
	call_deferred("_run")

func _fixture(faction: String = "humans") -> void:
	sim.reset_state(42, 128, 96)
	sim.match_state = {"mode": "economy_contract"}
	sim.players[1].faction = faction
	sim.players[1].crystal = 10000
	sim.players[1].aether = 10000
	root.get_node("RTSCommanderAI").configure_from_scenario([])

func _check(condition: bool, expectation: String, observed: Variant = null) -> void:
	assertions += 1
	if not condition:
		failures.append({"case": label, "expected": expectation, "observed": observed})

func _count(type: String) -> int:
	var count := 0
	for u in sim.units.values():
		if u.owner == 1 and u.unit_type == type:
			count += 1
	return count

func _producer(row: Array) -> Dictionary:
	_fixture(row[2])
	var producer = sim.spawn_unit(row[1], 1, Vector2(20, 20))
	if row[1] != HALLS[row[2]]:
		sim.spawn_unit(HALLS[row[2]], 1, Vector2(8, 8))
	return producer

func _training() -> void:
	for row in TRAINING:
		label = "train_" + row[0]
		var producer = _producer(row)
		var result = sim.issue_command([producer.tag], label)
		_check(result.accepted == 1, "producer accepts a legal paid training order", result)
		_check(sim.players[1].crystal == 10000-row[3] and sim.players[1].aether == 10000-row[4], "exact crystal/aether cost deducted at enqueue", sim.players[1])
		_check(sim.players[1].supply_used == row[6], "queued unit reserves its exact supply", sim.players[1].supply_used)
		sim.step_ticks(row[5]*64-2)
		_check(_count(row[0]) == 0, "no unit appears before advertised duration minus two ticks", sim.tick)
		sim.step_ticks(4)
		_check(_count(row[0]) == 1 and producer.production_queue.is_empty(), "one trained unit appears within two ticks after full advertised duration", sim.tick)
		_check(sim.players[1].supply_used == row[6], "completion transfers reserved supply without double counting", sim.players[1].supply_used)
		for u in sim.units.values():
			if u.unit_type == row[0]:
				_check(u.faction == row[2] and u.owner == 1, "trained unit has correct owner and faction", u.faction)
		cases.append({"ability": label, "duration_seconds": row[5], "cost": [row[3], row[4]], "supply": row[6]})
		producer = _producer(row)
		sim.players[1].crystal = row[3]-1
		result = sim.issue_command([producer.tag], label)
		_check(result.accepted == 0 and producer.production_queue.is_empty() and sim.players[1].crystal == row[3]-1, "insufficient crystal rejects without charging or queuing", result)
		if row[4] > 0:
			sim.players[1].crystal = 10000
			sim.players[1].aether = row[4]-1
			result = sim.issue_command([producer.tag], label)
			_check(result.accepted == 0 and producer.production_queue.is_empty() and sim.players[1].aether == row[4]-1, "insufficient aether rejects without charging or queuing", result)
		producer = _producer(row)
		producer.build_progress = 0.5
		result = sim.issue_command([producer.tag], label)
		_check(result.accepted == 0 and producer.production_queue.is_empty() and sim.players[1].crystal == 10000, "unfinished production building cannot queue a unit or spend resources", result)
		producer = _producer(row)
		for i in range(15):
			sim.spawn_unit(WORKERS[row[2]], 1, Vector2(70+i%5*3, 60+i/5*3))
		result = sim.issue_command([producer.tag], label)
		_check(result.accepted == 0 and producer.production_queue.is_empty() and sim.players[1].crystal == 10000, "supply block rejects without charge", result)
		_fixture(row[2])
		var wrong = sim.spawn_unit("silo", 1, Vector2(20,20))
		result = sim.issue_command([wrong.tag], label)
		_check(result.accepted == 0 and sim.players[1].crystal == 10000, "nonproducer cannot train this unit", result)
	label = "training_queue_capacity"
	var producer = _producer(TRAINING[1])
	for _i in range(5):
		_check(sim.issue_command([producer.tag], "train_rifleman").accepted == 1, "first five orders fit the queue")
	_check(sim.issue_command([producer.tag], "train_rifleman").accepted == 0 and producer.production_queue.size() == 5 and sim.players[1].crystal == 9750, "sixth order cannot exceed queue capacity or spend resources")

func _build_setup(row: Array, include_prerequisite: bool = true) -> Dictionary:
	_fixture("humans" if row[1] == "pioneer" else "aliens")
	var worker = sim.spawn_unit(row[1], 1, Vector2(35,40))
	if include_prerequisite and row[5] != "":
		sim.spawn_unit(row[5], 1, Vector2(12,12))
	if row[0] == "aether_tap":
		sim.spawn_resource("aether_vent", Vector2(40,40), 1000)
	return worker

func _construction() -> void:
	for row in BUILDING:
		label = "build_" + row[0]
		var worker = _build_setup(row)
		var result = sim.issue_command([worker.tag], label, Vector2(40,40))
		_check(result.accepted == 1, "legal worker/faction/prerequisite placement accepted", result)
		var structure: Dictionary = {}
		for _i in range(64):
			sim.step_ticks(1)
			for u in sim.units.values():
				if u.unit_type == row[0]:
					structure = u
			if not structure.is_empty():
				break
		_check(not structure.is_empty(), "worker reaches site and begins within one second")
		if structure.is_empty():
			continue
		_check(sim.players[1].crystal == 10000-row[2] and sim.players[1].aether == 10000-row[3], "exact cost charged once when construction begins", sim.players[1])
		var begin_tick: int = sim.tick
		var initial_cap: int = sim.players[1].supply_cap
		if row[1] == "mote":
			_check(worker.orders.is_empty() and structure.get("auto_summon", false), "Mote is immediately freed while its summon continues")
		sim.step_ticks(row[4]*64-2)
		_check(structure.build_progress < 1.0, "construction not complete two ticks before advertised duration", {"progress": structure.build_progress, "elapsed_ticks": sim.tick-begin_tick})
		_check(sim.players[1].supply_cap == initial_cap, "unfinished structure does not prematurely grant supply", sim.players[1].supply_cap)
		sim.step_ticks(4)
		_check(structure.build_progress == 1.0, "construction completes within two ticks after advertised duration", structure.build_progress)
		_check(sim.players[1].crystal == 10000-row[2] and sim.players[1].aether == 10000-row[3], "construction never charges twice", sim.players[1])
		var provided = 15 if row[0] in ["colony_hub", "heartstone"] else (8 if row[0] in ["silo", "resonator"] else 0)
		_check(sim.players[1].supply_cap == initial_cap+provided, "completed structure grants only its advertised supply", sim.players[1].supply_cap)
		cases.append({"ability": label, "duration_seconds": row[4], "cost": [row[2],row[3]], "automatic": row[1] == "mote"})
		worker = _build_setup(row)
		var wrong = sim.spawn_unit("rifleman", 1, Vector2(30,40))
		_check(sim.issue_command([wrong.tag], label, Vector2(40,40)).accepted == 0, "combat unit cannot construct")
		wrong = sim.spawn_unit("mote" if row[1] == "pioneer" else "pioneer", 1, Vector2(30,40))
		_check(sim.issue_command([wrong.tag], label, Vector2(40,40)).accepted == 0, "wrong-faction worker cannot construct")
		_check(sim.issue_command([worker.tag], label, Vector2(0,0)).accepted == 0, "out-of-bounds placement rejects")
		sim.spawn_unit("silo", 1, Vector2(40,40))
		_check(sim.issue_command([worker.tag], label, Vector2(40,40)).accepted == 0, "overlapping existing structure placement rejects")
		if row[5] != "":
			worker = _build_setup(row, false)
			_check(sim.issue_command([worker.tag], label, Vector2(40,40)).accepted == 0, "missing technology prerequisite rejects")
			var unfinished = sim.spawn_unit(row[5], 1, Vector2(12,12), "", 0.5)
			_check(sim.issue_command([worker.tag], label, Vector2(40,40)).accepted == 0 and unfinished.build_progress < 1, "unfinished technology prerequisite does not unlock construction")
		if row[0] == "aether_tap":
			worker = _build_setup(row)
			sim.resources.clear()
			_check(sim.issue_command([worker.tag], label, Vector2(40,40)).accepted == 0, "extractor placement requires a vent")
		worker = _build_setup(row)
		sim.players[1].crystal = row[2]-1
		sim.issue_command([worker.tag], label, Vector2(40,40))
		sim.step_ticks(64)
		_check(_count(row[0]) == 0 and sim.players[1].crystal == row[2]-1, "insufficient funds cannot create a structure or spend partial funds")
		if row[3] > 0:
			worker = _build_setup(row)
			sim.players[1].aether = row[3]-1
			sim.issue_command([worker.tag], label, Vector2(40,40))
			sim.step_ticks(64)
			_check(_count(row[0]) == 0 and sim.players[1].crystal == 10000 and sim.players[1].aether == row[3]-1, "insufficient aether cannot consume crystal or start construction")
	# Construction contrast: moving a Pioneer away pauses work; moving a Mote does not.
	for row in [BUILDING[1], BUILDING[6]]:
		label = "build_worker_dependency_" + row[0]
		var worker = _build_setup(row)
		sim.issue_command([worker.tag], "build_"+row[0], Vector2(40,40))
		sim.step_ticks(64)
		var structure: Dictionary = {}
		for u in sim.units.values():
			if u.unit_type == row[0]:
				structure = u
		var before: float = structure.build_progress
		var move_result = sim.issue_command([worker.tag], "move", Vector2(20,40))
		sim.step_ticks(64)
		_check(move_result.accepted == 1 if row[1] == "mote" else move_result.accepted == 0, "Motes are free after summoning; active builders require explicit Halt before replacement")
		_check(structure.build_progress > before+0.04, "Selecting or reassigning a builder does not silently stop construction", structure.build_progress-before)
		sim.issue_command([worker.tag], "halt")
		before = structure.build_progress
		sim.step_ticks(64)
		_check(structure.build_progress > before+0.04 if row[1] == "mote" else absf(structure.build_progress-before) < 0.0001, "Mote summons continue independently; Halt explicitly pauses Pioneer construction", structure.build_progress-before)

func _harvesting() -> void:
	for faction in ["humans", "monsters", "aliens"]:
		label = "harvest_crystal_" + WORKERS[faction]
		_fixture(faction)
		sim.players[1].crystal = 0
		sim.spawn_unit(HALLS[faction], 1, Vector2(10,20))
		var worker = sim.spawn_unit(WORKERS[faction], 1, Vector2(16,20))
		var resource = sim.spawn_resource("crystal_field", Vector2(21,20), 1000)
		_check(sim.issue_command([worker.tag], "harvest", resource.pos, resource.tag).accepted == 1, "worker accepts crystal gather")
		sim.step_ticks(384)
		var income: int = sim.players[1].crystal_collected
		_check(income >= 10 and income <= 15, "worker returns 10–15 crystal within six seconds", income)
		_check(1000-resource.amount == income+worker.cargo_amount and sim.players[1].crystal == income, "deposit depletion equals returned plus carried crystal")
		cases.append({"ability": "harvest", "worker": WORKERS[faction], "resource": "crystal", "income": income, "seconds": 6})
	label = "harvest_finite_deposit"
	_fixture()
	sim.players[1].crystal = 0
	sim.spawn_unit("colony_hub", 1, Vector2(10,20))
	var worker = sim.spawn_unit("pioneer", 1, Vector2(16,20))
	var resource = sim.spawn_resource("crystal_field", Vector2(21,20), 7)
	sim.issue_command([worker.tag], "harvest", resource.pos, resource.tag)
	sim.step_ticks(640)
	_check(resource.amount == 0 and sim.players[1].crystal_collected == 7 and worker.cargo_amount == 0, "seven-unit deposit pays exactly seven, never negative or infinite", sim.players[1].crystal_collected)
	for extractor_owner in [0, 1, 2]:
		label = "harvest_aether_extractor_owner_%d" % extractor_owner
		_fixture()
		sim.players[1].aether = 0
		sim.spawn_unit("colony_hub", 1, Vector2(10,20))
		worker = sim.spawn_unit("pioneer", 1, Vector2(16,20))
		resource = sim.spawn_resource("aether_vent", Vector2(21,20), 1000)
		if extractor_owner > 0:
			sim.spawn_unit("aether_tap", extractor_owner, resource.pos)
		sim.issue_command([worker.tag], "harvest", resource.pos, resource.tag)
		sim.step_ticks(384)
		var income: int = sim.players[1].aether_collected
		_check(income >= 8 and income <= 12 if extractor_owner == 1 else income == 0, "aether needs an owned completed extractor; valid worker returns 8–12 in six seconds", income)
		if extractor_owner == 1:
			_check(1000-resource.amount == income+worker.cargo_amount, "aether conservation includes carried cargo")
	label = "harvest_invalid_caster"
	_fixture()
	var rifle = sim.spawn_unit("rifleman", 1, Vector2(16,20))
	resource = sim.spawn_resource("crystal_field", Vector2(21,20), 1000)
	_check(sim.issue_command([rifle.tag], "harvest", resource.pos, resource.tag).accepted == 0, "nonworker gather rejects")

func _commands() -> void:
	label = "move"
	_fixture()
	var rifle = sim.spawn_unit("rifleman", 1, Vector2(20,20))
	var enemy = sim.spawn_unit("rifleman", 2, Vector2(30,24))
	sim.issue_command([enemy.tag], "hold_position")
	_check(sim.issue_command([rifle.tag], "move", Vector2(70,20)).accepted == 1, "mobile unit accepts move")
	sim.step_ticks(64)
	_check(rifle.pos.x >= 27.0 and rifle.pos.x <= 27.4 and absf(rifle.pos.y-20) < 0.1, "unbuffed movement covers 7.0–7.4 world units in one second", rifle.pos)
	_check(rifle.damage_dealt == 0, "move bypasses enemies rather than attacking")
	cases.append({"ability": "move", "one_second_position": [rifle.pos.x,rifle.pos.y]})
	label = "stop"
	_fixture()
	rifle = sim.spawn_unit("rifleman", 1, Vector2(20,20))
	sim.issue_command([rifle.tag], "move", Vector2(70,20))
	sim.step_ticks(32)
	sim.issue_command([rifle.tag], "stop")
	var stopped: Vector2 = rifle.pos
	sim.step_ticks(64)
	_check(rifle.pos.distance_to(stopped) <= 0.05 and rifle.orders.is_empty(), "Stop cancels movement within 0.05 units when no enemy is present", rifle.pos)
	cases.append({"ability": "stop", "post_stop_displacement": rifle.pos.distance_to(stopped)})
	label = "hold_position"
	_fixture()
	rifle = sim.spawn_unit("rifleman", 1, Vector2(30,20))
	enemy = sim.spawn_unit("pioneer", 2, Vector2(60,20))
	sim.issue_command([rifle.tag], "hold_position")
	sim.issue_command([enemy.tag], "hold_position")
	sim.step_ticks(64)
	_check(rifle.pos.distance_to(Vector2(30,20)) < 0.05 and rifle.damage_dealt == 0, "hold does not pursue or shoot out-of-range enemies")
	sim.issue_command([enemy.tag], "move", Vector2(42,20))
	sim.step_ticks(256)
	_check(rifle.pos.distance_to(Vector2(30,20)) < 0.05 and rifle.damage_dealt > 0, "hold fires when enemy enters range without advancing", rifle.pos)
	cases.append({"ability": "hold_position", "damage": rifle.damage_dealt})
	label = "attack"
	_fixture()
	rifle = sim.spawn_unit("rifleman", 1, Vector2(40,20))
	enemy = sim.spawn_unit("pioneer", 2, Vector2(50,20))
	sim.issue_command([rifle.tag], "attack", enemy.pos, enemy.tag)
	sim.issue_command([enemy.tag], "attack", rifle.pos, rifle.tag)
	for _i in range(320):
		sim.step_ticks(1)
		if not sim.units.has(enemy.tag) or not sim.units.has(rifle.tag):
			break
	_check(sim.units.has(rifle.tag) and not sim.units.has(enemy.tag) and rifle.hp >= 20 and sim.tick <= 320, "normal-health Rifleman defeats Pioneer within five seconds with at least 20 HP", {"hp": rifle.hp, "ticks": sim.tick})
	cases.append({"ability": "attack", "winner": 1 if sim.units.has(rifle.tag) else 2, "hp": rifle.hp, "ticks": sim.tick})
	label = "rally"
	var producer = _producer(TRAINING[1])
	_check(sim.issue_command([producer.tag], "rally", Vector2(60,20)).accepted == 1, "production building accepts rally")
	_check(sim.issue_command([producer.tag], "train_rifleman").accepted == 1, "rally fixture actually queues its soldier")
	sim.step_ticks(18*64+64)
	_check(_count("rifleman") == 1, "rally fixture actually produces one soldier")
	for u in sim.units.values():
		if u.unit_type == "rifleman":
			_check(u.pos.x >= 30 and u.pos.x <= 33 and not u.orders.is_empty() and u.orders[0].target_pos == Vector2(60,20), "trained soldier follows rally order and travels after spawning", u.pos)
	var silo = sim.spawn_unit("silo", 1, Vector2(60,60))
	_check(sim.issue_command([silo.tag], "rally", Vector2(70,60)).accepted == 0, "nonproducer rally rejects")
	label = "invalid_movement_caster"
	_check(sim.issue_command([silo.tag], "move", Vector2(70,60)).accepted == 0, "structure move rejects")
	var emplaced = sim.spawn_unit("howitzer_emplaced", 1, Vector2(60,75))
	_check(sim.issue_command([emplaced.tag], "move", Vector2(70,75)).accepted == 0, "emplaced artillery move rejects")
	cases.append({"ability": "rally", "destination": [60,20]})

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var data = root.get_node("RTSData")
	label = "economy_ability_coverage"
	for ability in COVERED_ABILITIES:
		_check(data.abilities.has(ability), "covered ability remains present in the registry", ability)
	for ability in data.abilities:
		if ability.begins_with("train_") or ability.begins_with("build_") or ability in ["move", "stop", "hold_position", "attack", "harvest", "rally"]:
			_check(ability in COVERED_ABILITIES, "every registered economy/basic ability has an explicit contract test", ability)
	_commands()
	_harvesting()
	_training()
	_construction()
	print(JSON.stringify({"suite": "economy_abilities", "covered_abilities": COVERED_ABILITIES, "assertions": assertions, "cases": cases, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
