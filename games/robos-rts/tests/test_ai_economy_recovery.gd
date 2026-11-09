extends SceneTree

const CASES := [
	{"faction": "humans", "tech": "silo", "production": "muster_hall", "survivors": 0, "crystal": 450},
	{"faction": "aliens", "tech": "resonator", "production": "waystone", "survivors": 1, "crystal": 220},
	{"faction": "monsters", "tech": "brood_pod", "production": "", "survivors": 2, "crystal": 0},
]

var sim: Node
var ai: Node
var data: Node
var failures: Array[String] = []
var paid_units: Array[String] = []
var faction: String

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	ai = root.get_node("RTSCommanderAI")
	data = root.get_node("RTSData")
	sim.unit_production_finished.connect(_record_production)
	for setup in CASES:
		_test_raid(setup)
	print("AI economy recovery: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> bool:
	if not condition:
		failures.append("%s: %s" % [faction, label])
	return condition

func _record_production(unit: Dictionary, _producer: Dictionary) -> void:
	if unit.owner == 2:
		paid_units.append(unit.unit_type)

func _find(id: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.id == id:
			return unit
	return {}

func _fixture(setup: Dictionary, roster: Dictionary) -> void:
	var units := [
		{"type": "colony_hub", "owner": 1, "x": 110, "y": 62},
		{"id": "raider", "type": "howitzer_emplaced", "owner": 1, "x": 66, "y": 36},
		{"id": "base", "type": roster.town_hall, "owner": 2, "x": 30, "y": 36},
		{"id": "tech", "type": setup.tech, "owner": 2, "x": 41, "y": 20, "hp": 1, "shields": 0},
		{"id": "gas", "type": roster.extractor, "owner": 2, "x": 46, "y": 40, "hp": 1, "shields": 0},
		{"id": "worker", "type": roster.worker, "owner": 2, "x": 43, "y": 45, "hp": 1, "shields": 0},
	]
	if not setup.production.is_empty():
		units.append({"id": "production", "type": setup.production, "owner": 2, "x": 45, "y": 29, "hp": 1, "shields": 0})
	if setup.faction == "monsters":
		units.append({"type": roster.extractor, "owner": 2, "x": 32, "y": 53})
	for i in range(int(setup.survivors)):
		units.append({"type": roster.worker, "owner": 2, "x": 23, "y": 30 + 4 * i})
	var resources := [
		{"type": "aether_vent", "x": 46, "y": 40},
		{"type": "aether_vent", "x": 32, "y": 53},
	]
	for i in range(6):
		resources.append({"type": "crystal_field", "x": 16, "y": 25 + 4 * i})
	sim.load_scenario_dict({
		"paused": true, "victory": "all_structures", "map": {"width": 128, "height": 80},
		"players": {"2": {"faction": setup.faction, "crystal": setup.crystal, "aether": 0}},
		"units": units, "resources": resources,
	})

func _raid(raider: Dictionary, has_producer: bool) -> bool:
	sim.issue_command([raider.tag], "hold_fire")
	var victims := ["worker", "gas", "tech"]
	if has_producer:
		victims.append("production")
	for id in victims:
		var target := _find(id)
		if target.is_empty():
			continue
		if not _check(sim.issue_command([raider.tag], "attack_target", target.pos, target.tag).ok, "The raid targets " + id):
			return false
		for _second in range(5):
			sim.step_ticks(64)
			if not sim.units.has(target.tag):
				break
		if not _check(not sim.units.has(target.tag), "Enemy weapon fire destroys " + id):
			return false
	sim.issue_command([raider.tag], "mobilize")
	sim.issue_command([raider.tag], "move", Vector2(110, 54))
	return true

func _finished_building(type: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.owner == 2 and unit.unit_type == type and unit.build_progress >= 1.0:
			return unit
	return {}

func _test_raid(setup: Dictionary) -> void:
	faction = setup.faction
	var roster: Dictionary = data.faction_info[faction]
	paid_units.clear()
	_fixture(setup, roster)
	var base := _find("base")
	if not _raid(_find("raider"), not setup.production.is_empty()):
		return
	var player: Dictionary = sim.players[2]
	var workers_after_raid: int = sim.units.values().filter(func(u): return u.owner == 2 and u.is_worker).size()
	_check(sim.units.has(base.tag) and workers_after_raid == setup.survivors, "The raid leaves the base and exactly the intended workers")
	ai.set_skirmish_directive(2, "normal", "balanced")
	var replacement_producer: Dictionary = {}
	var replacement_gas: Dictionary = {}
	var recovery_seconds := 0
	# A single Brood Nest refills its worker force one recharge at a time.
	for second in range(1, 361):
		sim.step_ticks(64)
		recovery_seconds = second
		replacement_producer = base if setup.production.is_empty() else _finished_building(setup.production)
		replacement_gas = _finished_building(roster.extractor)
		if paid_units.count(roster.worker) >= 3 and paid_units.any(func(type): return type != roster.worker) and not replacement_producer.is_empty() and not replacement_gas.is_empty() and player.crystal_collected > 0 and player.aether_collected > 0:
			break
	var workers_trained := paid_units.count(roster.worker)
	var combat_trained := paid_units.size() - workers_trained
	print("%s after %ds: %d survivors, %d workers and %d combat units trained, %d crystal and %d aether mined" % [
		faction, recovery_seconds, workers_after_raid, workers_trained, combat_trained, player.crystal_collected, player.aether_collected])
	_check(sim.units.has(base.tag), "The original base survives recovery")
	_check(workers_trained >= 3 and player.crystal_collected > 0, "Paid replacement workers reestablish crystal income")
	_check(not replacement_gas.is_empty() and player.aether_collected > 0, "Gas harvesting resumes through a working extractor")
	var replacement_tech := _finished_building(setup.tech)
	if faction != "monsters":
		_check(replacement_tech.has("construction_cost") and replacement_producer.has("construction_cost")
			and replacement_gas.has("construction_cost"), "The AI pays for replacement tech, production and gas structures")
	_check(combat_trained > 0, "The AI resumes paid combat production")
	var paid := Vector2i.ZERO
	for type in paid_units:
		var definition: Dictionary = data.get_unit_def(type)
		paid += Vector2i(definition.crystal_cost, definition.aether_cost)
	for building in [replacement_tech, replacement_producer, replacement_gas]:
		paid += building.get("construction_cost", Vector2i.ZERO)
	_check(player.crystal + paid.x <= int(setup.crystal) + player.crystal_collected
		and player.aether + paid.y <= player.aether_collected,
		"Reconstruction and production use the starting stock and earned resources")
