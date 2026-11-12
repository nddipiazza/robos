extends SceneTree

const FACTIONS := [
	{"id": "humans", "base": "colony_hub", "producer": "workshop", "provider": "silo", "worker": "pioneer", "trainee": "howitzer"},
	{"id": "monsters", "base": "brood_nest", "producer": "brood_nest", "provider": "brood_pod", "worker": "forager", "trainee": "blight_hurler"},
	{"id": "aliens", "base": "heartstone", "producer": "waystone", "provider": "resonator", "worker": "mote", "trainee": "skirmisher"},
]
const STARTING_STOCK := Vector2i(900, 900)
const BUILD_SITE := Vector2(45, 40)

var sim: Node
var data: Node
var faction: String
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	data = root.get_node("RTSData")
	for setup in FACTIONS:
		_test_reservations(setup)
	_test_waiting_for_supply()
	print("Supply reservation checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> bool:
	if not condition:
		failures.append("%s: %s" % [faction, label])
	return condition

func _unit(id: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.id == id:
			return unit
	return {}

func _stock(player: Dictionary) -> Vector2i:
	return Vector2i(player.crystal, player.aether)

func _cost(definition: Dictionary) -> Vector2i:
	return Vector2i(definition.crystal_cost, definition.aether_cost)

func _load(setup: Dictionary, brood: bool) -> void:
	var units := [
		{"id": "base", "type": setup.base, "x": 35 if brood else 20, "y": 30 if brood else 20},
		{"id": "builder", "type": setup.worker, "x": 45, "y": 44},
		{"type": setup.worker, "count": 13, "spread": 2.6, "x": 9, "y": 44},
		{"id": "provider", "type": setup.provider, "x": 48, "y": 30, "hp": 1, "shields": 0},
		{"id": "attacker", "type": "howitzer_emplaced", "owner": 2, "x": 75, "y": 30},
		{"type": "colony_hub", "owner": 2, "x": 105, "y": 50},
	]
	if not brood:
		units.append({"id": "producer", "type": setup.producer, "x": 35, "y": 30})
	sim.load_scenario_dict({
		"paused": true, "victory": "all_structures", "map": {"width": 120, "height": 64},
		"players": {"1": {"faction": setup.id, "crystal": STARTING_STOCK.x, "aether": STARTING_STOCK.y}},
		"units": units,
	})

func _test_reservations(setup: Dictionary) -> void:
	faction = setup.id
	var brood := faction == "monsters"
	var needs_power := faction == "aliens"
	_load(setup, brood)
	var player: Dictionary = sim.players[1]
	var base := _unit("base")
	var producer := base if brood else _unit("producer")
	var provider := _unit("provider")
	var attacker := _unit("attacker")
	var builder := _unit("builder")
	var trainee: Dictionary = data.get_unit_def(setup.trainee)
	var supply: int = trainee.supply_cost
	var cost := _cost(trainee)
	var train := "train_" + str(setup.trainee)
	var queue: Array = producer.production_queue
	var deployed: int = player.supply_used
	var original_cap: int = player.supply_cap
	_check(deployed == 14 and original_cap == 23, "The fixture starts with 14 deployed and 23 capacity")
	for _job in range(2):
		_check(sim.issue_command([producer.tag], train).ok, "A paid unit can reserve a slot")
	if not _check(queue.size() == 2 and _stock(player) == STARTING_STOCK - cost * 2 and player.supply_used == deployed,
		"Two queued units pay their resource costs before reserving supply"):
		return
	sim.issue_command([attacker.tag], "hold_fire")
	sim.step_ticks(32)
	var reserved := supply * (2 if brood else 1)
	_check(queue[0].progress > 0.0 and player.supply_used == deployed + reserved, "Only jobs that start reserve supply")
	_check(sim.issue_command([attacker.tag], "attack_target", provider.pos, provider.tag).ok, "An enemy attacks the weakened provider")
	sim.step_ticks(32)
	if not _check(not sim.units.has(provider.tag) and player.supply_cap == original_cap - 8 and player.supply_used == deployed + reserved and queue.size() == 2,
		"Destroying the provider removes capacity and retains supply for jobs that started"):
		return
	var surviving_job: Dictionary = queue[0]
	var paid_progress: float = surviving_job.progress
	var brood_slots: int = int(producer.get("brood_slots", 0))
	_check(sim.issue_command([producer.tag], "cancel_training", Vector2.ZERO, 0, "1").ok, "The second paid slot cancels while supply is blocked")
	_check(queue.size() == 1 and queue[0] == surviving_job and surviving_job.progress == paid_progress
		and _stock(player) == STARTING_STOCK - cost and player.supply_used == deployed + supply,
		"Cancel refunds exactly one job and preserves the other reservation and progress")
	if brood:
		_check(producer.brood_slots == brood_slots + 1, "Cancel also returns exactly one brood slot")
	_check(not sim.issue_command([producer.tag], "cancel_training", Vector2.ZERO, 0, "1").ok and _stock(player) == STARTING_STOCK - cost,
		"Canceling the same slot again gives no extra refund")
	var train_ticks := ceili(float(surviving_job.total_time) / sim.TICK_DT)
	if needs_power:
		sim.step_ticks(32)
		_check(not sim.is_powered(1, producer.pos) and surviving_job.progress == paid_progress and player.units_trained == 0,
			"The unpowered producer holds its paid job at the same progress")
	else:
		sim.step_ticks(train_ticks)
		_check(queue.is_empty() and player.units_trained == 1 and player.supply_used == deployed + supply and _stock(player) == STARTING_STOCK - cost,
			"Finishing while over capacity transfers the existing reservation without charging again")
	_test_restoration(setup, builder, producer, player, train, deployed + supply, train_ticks)

func _test_restoration(setup: Dictionary, builder: Dictionary, producer: Dictionary, player: Dictionary, train: String, used: int, train_ticks: int) -> void:
	var replacement: Dictionary = data.get_unit_def(setup.provider)
	var trainee: Dictionary = data.get_unit_def(setup.trainee)
	var paid := STARTING_STOCK - _cost(trainee) - _cost(replacement)
	_check(sim.issue_command([builder.tag], "build_" + str(setup.provider), BUILD_SITE).ok,
		"The worker orders a paid replacement while still supply blocked")
	sim.step_ticks(2)
	var sites: Array = sim.units.values().filter(func(unit): return unit.owner == 1 and unit.unit_type == setup.provider)
	var expected_used := used - (1 if faction == "monsters" else 0)
	if not _check(sites.size() == 1 and sites[0].build_progress < 1.0 and player.supply_cap == 15 and player.supply_used == expected_used and _stock(player) == paid,
		"An unfinished replacement grants no supply and accounts for the cost and any consumed builder"):
		return
	sim.step_ticks(ceili(float(replacement.build_time) / sim.TICK_DT) + train_ticks)
	_check(sites[0].build_progress == 1.0 and player.supply_cap == 23, "Completing the replacement restores its eight supply")
	_check(producer.production_queue.is_empty() and player.units_trained == 1 and player.supply_used == expected_used and _stock(player) == paid,
		"The original job deploys exactly once with no extra reservation or resource charge")
	_check(sim.issue_command([producer.tag], train).ok and player.supply_used == expected_used and _stock(player) == paid - _cost(trainee),
		"A new paid slot leaves supply unchanged until it starts")
	sim.step_ticks(1)
	_check(player.supply_used == expected_used + trainee.supply_cost, "The new job reserves supply on its first production tick")

func _test_waiting_for_supply() -> void:
	faction = "humans"
	var setup: Dictionary = FACTIONS[0]
	_load(setup, false)
	var producer := _unit("producer")
	var player: Dictionary = sim.players[1]
	var audio := root.get_node("RTSAudio")
	audio.reset_stats()
	sim.issue_command([_unit("attacker").tag], "hold_fire")
	var supply: int = data.get_unit_def("howitzer").supply_cost
	_check(sim.issue_command([producer.tag], "train_howitzer").ok, "First howitzer is ordered")
	sim.step_ticks(1)
	sim._remove_destroyed_unit(_unit("provider"))
	_check(sim.issue_command([producer.tag], "train_howitzer").ok, "The queue accepts another paid job over capacity")
	var waiting: Dictionary = producer.production_queue[1]
	sim.step_ticks(ceili(float(waiting.total_time) / sim.TICK_DT) + sim.TICK_RATE)
	var bank := _stock(player)
	_check(player.units_trained == 1 and player.supply_used == 14 + supply and waiting.progress == 0.0,
		"The started job finishes over capacity and the next job waits without supply")
	_check(audio.sfx_counts.get("alert_supply_required", 0) == 1, "Waiting plays the supply warning once")
	sim.spawn_unit("silo", 1, BUILD_SITE)
	sim.step_ticks(1)
	_check(waiting.progress > 0.0 and player.supply_used == 14 + supply * 2 and _stock(player) == bank,
		"Restoring capacity starts the waiting job without charging its resources again")
