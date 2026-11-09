extends SceneTree

const STARTING_STOCK := Vector2i(1500, 1500)

var sim: Node
var data: Node
var deployed: Array[String] = []
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	data = root.get_node("RTSData")
	sim.unit_production_finished.connect(_record_deployment)
	_test_power_cycle()
	_test_tech_and_workshop()
	_test_attachment_cycle(true)
	_test_attachment_cycle(false)
	print("Production queue consistency: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, label: String) -> bool:
	if not condition:
		failures.append(label)
	return condition

func _record_deployment(unit: Dictionary, _producer: Dictionary) -> void:
	deployed.append(unit.unit_type)

func _load(units: Array, skirmish_rules: bool = false) -> void:
	deployed.clear()
	sim.load_scenario_dict({
		"paused": true, "victory": "all_structures" if skirmish_rules else "",
		"map": {"width": 120, "height": 72},
		"players": {"1": {"crystal": STARTING_STOCK.x, "aether": STARTING_STOCK.y}},
		"units": units,
	})

func _unit(id: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.id == id:
			return unit
	return {}

func _stock() -> Vector2i:
	return Vector2i(sim.players[1].crystal, sim.players[1].aether)

func _cost(type: String) -> Vector2i:
	var definition: Dictionary = data.get_unit_def(type)
	return Vector2i(definition.crystal_cost, definition.aether_cost)

func _job_names(producer: Dictionary) -> Array:
	return producer.production_queue.map(func(job): return job.get("unit_type", job.get("upgrade", "")))

func _cancel(producer: Dictionary, index: int) -> bool:
	return sim.issue_command([producer.tag], "cancel_training", Vector2.ZERO, 0, str(index)).ok

func _start_build(worker: Dictionary, type: String, point: Vector2) -> Dictionary:
	if not _check(sim.issue_command([worker.tag], "build_" + type, point).ok, "Accept paid construction of " + type):
		return {}
	for _step in range(96):
		sim.step_ticks(4)
		for unit in sim.units.values():
			if unit.owner == worker.owner and unit.unit_type == type and unit.pos == point:
				return unit
	_check(false, "Begin construction of " + type)
	return {}

func _build_ticks(site: Dictionary) -> int:
	return ceili(float(site.build_total_time) * sim.build_time_scale() / sim.TICK_DT)

func _finish_front(producer: Dictionary) -> void:
	if not _check(not producer.production_queue.is_empty(), "There is a front job to finish"):
		return
	var job: Dictionary = producer.production_queue.front()
	sim.step_ticks(ceili((float(job.total_time) - float(job.progress)) / sim.TICK_DT))

func _test_power_cycle() -> void:
	_load([
		{"type": "heartstone", "x": 16, "y": 20},
		{"id": "waystone", "type": "waystone", "x": 30, "y": 29},
		{"id": "power", "type": "resonator", "x": 43, "y": 29, "hp": 1, "shields": 0},
		{"id": "mote", "type": "mote", "x": 35, "y": 42},
		{"id": "attacker", "type": "howitzer_emplaced", "owner": 2, "x": 70, "y": 29},
		{"type": "colony_hub", "owner": 2, "x": 104, "y": 48},
	], true)
	var producer := _unit("waystone")
	var power := _unit("power")
	var attacker := _unit("attacker")
	var player: Dictionary = sim.players[1]
	var queued := ["sunblade", "skirmisher", "spire_walker"]
	var cost := Vector2i.ZERO
	_check(not sim.issue_command([producer.tag], "research_weapons").ok, "Powered Waystones cannot start Workshop research")
	for type in queued:
		_check(sim.issue_command([producer.tag], "train_" + type).ok, "A powered Waystone accepts " + type)
		cost += _cost(type)
	if not _check(_job_names(producer) == queued and _stock() == STARTING_STOCK - cost, "Waystone pays once for each job in queue order"):
		return
	sim.issue_command([attacker.tag], "hold_fire")
	sim.step_ticks(32)
	sim.issue_command([attacker.tag], "attack_target", power.pos, power.tag)
	sim.step_ticks(32)
	var front: Dictionary = producer.production_queue[0]
	var last: Dictionary = producer.production_queue[2]
	var progress: float = front.progress
	_check(not sim.units.has(power.tag) and not sim.is_powered(1, producer.pos) and progress > 0.0,
		"The attacker removes power while the first job is active")
	_check(not sim.issue_command([producer.tag], "train_sunblade").ok and _stock() == STARTING_STOCK - cost,
		"An unpowered producer rejects new jobs without a charge")
	_check(_cancel(producer, 1), "Cancel the middle job while power is out")
	var remaining_cost := _cost("sunblade") + _cost("spire_walker")
	_check(_job_names(producer) == ["sunblade", "spire_walker"] and _stock() == STARTING_STOCK - remaining_cost,
		"Dark cancellation refunds the selected job and keeps its neighbors in order")
	sim.step_ticks(ceili(float(front.total_time) / sim.TICK_DT) + 1)
	_check(front.progress == progress and last.progress == 0.0 and deployed.is_empty() and _job_names(producer) == ["sunblade", "spire_walker"],
		"An outage longer than the active job freezes the entire queue")
	var replacement := _start_build(_unit("mote"), "resonator", Vector2(35, 38))
	if replacement.is_empty():
		return
	_check(front.progress == progress and not sim.is_powered(1, producer.pos), "A paid foundation supplies no power")
	for _step in range(_build_ticks(replacement)):
		sim.step_ticks(1)
		if replacement.build_progress >= 1.0:
			break
	sim.step_ticks(1)
	_check(sim.is_powered(1, producer.pos) and front.progress > progress and front.progress <= progress + sim.TICK_DT * 2.0,
		"The original front job resumes from its paid progress once coverage returns")
	_finish_front(producer)
	_finish_front(producer)
	_check(deployed == ["sunblade", "spire_walker"] and producer.production_queue.is_empty()
		and player.units_trained == 2 and _stock() == STARTING_STOCK - remaining_cost - _cost("resonator"),
		"Only surviving jobs deploy in order and restoration does not charge them again")

func _test_tech_and_workshop() -> void:
	_load([
		{"type": "colony_hub", "x": 16, "y": 18},
		{"id": "silo", "type": "silo", "x": 25, "y": 18},
		{"id": "pioneer", "type": "pioneer", "x": 30, "y": 35},
	])
	var worker := _unit("pioneer")
	var silo := _unit("silo")
	var workshop_site := Vector2(43, 37)
	_check(not sim.issue_command([worker.tag], "build_workshop", workshop_site).ok and _stock() == STARTING_STOCK,
		"A missing Muster Hall blocks Workshop construction without a charge")
	_check(sim.issue_command([silo.tag], "retract_silo").ok, "Retract the completed Silo")
	var hall := _start_build(worker, "muster_hall", Vector2(33, 35))
	if hall.is_empty():
		return
	_check(not sim.issue_command([worker.tag], "build_workshop", workshop_site).ok and _stock() == STARTING_STOCK - _cost("muster_hall"),
		"An unfinished Muster Hall does not satisfy the Workshop prerequisite")
	sim.step_ticks(_build_ticks(hall))
	var workshop := _start_build(worker, "workshop", workshop_site)
	if workshop.is_empty():
		return
	var paid_buildings := _stock()
	_check(paid_buildings == STARTING_STOCK - _cost("muster_hall") - _cost("workshop"), "Construction pays each building's listed cost once")
	_check(not sim.issue_command([workshop.tag], "train_howitzer").ok and not sim.issue_command([workshop.tag], "research_weapons").ok
		and _stock() == paid_buildings, "An unfinished Workshop accepts neither paid training nor research")
	sim.step_ticks(_build_ticks(workshop))
	_test_workshop_queue(workshop, paid_buildings)

func _test_workshop_queue(workshop: Dictionary, paid_buildings: Vector2i) -> void:
	var player: Dictionary = sim.players[1]
	var weapons_offer: Dictionary = sim.research_offer(1, "weapons")
	var armor_offer: Dictionary = sim.research_offer(1, "armor")
	var weapons := Vector2i(weapons_offer.crystal, weapons_offer.aether)
	var armor := Vector2i(armor_offer.crystal, armor_offer.aether)
	var troops := _cost("howitzer") + _cost("kestrel_interceptor")
	var starting_supply: int = player.supply_used
	var troop_supply: int = data.get_unit_def("howitzer").supply_cost + data.get_unit_def("kestrel_interceptor").supply_cost
	for command in ["train_howitzer", "research_weapons", "research_armor", "train_kestrel_interceptor"]:
		_check(sim.issue_command([workshop.tag], command).ok, "Accept Workshop job " + command)
	if not _check(_job_names(workshop) == ["howitzer", "weapons", "armor", "kestrel_interceptor"]
		and _stock() == paid_buildings - troops - weapons - armor and player.supply_used == starting_supply + troop_supply,
		"Training and research share one queue and only training reserves supply"):
		return
	sim.step_ticks(32)
	var front: Dictionary = workshop.production_queue[0]
	var progress: float = front.progress
	_check(_cancel(workshop, 2) and _job_names(workshop) == ["howitzer", "weapons", "kestrel_interceptor"]
		and front.progress == progress and _stock() == paid_buildings - troops - weapons,
		"Canceling waiting armor refunds its cost without resetting the active unit")
	_finish_front(workshop)
	sim.step_ticks(32)
	_check(deployed == ["howitzer"] and _job_names(workshop) == ["weapons", "kestrel_interceptor"]
		and workshop.production_queue[0].progress > 0.0 and player.upgrades.weapons == 0,
		"Only the front job progresses and unfinished research grants no upgrade")
	_check(_cancel(workshop, 0) and _stock() == paid_buildings - troops and player.upgrades.weapons == 0,
		"Canceling active research refunds its exact cost without granting the upgrade")
	_check(sim.issue_command([workshop.tag], "research_weapons").ok and _job_names(workshop) == ["kestrel_interceptor", "weapons"]
		and workshop.production_queue[1].progress == 0.0, "The refunded research can be queued again from zero behind the paid unit")
	_finish_front(workshop)
	_finish_front(workshop)
	_check(deployed == ["howitzer", "kestrel_interceptor"] and workshop.production_queue.is_empty()
		and player.upgrades.weapons == 1 and player.upgrades.armor == 0
		and _stock() == paid_buildings - troops - weapons and player.supply_used == starting_supply + troop_supply,
		"The final queue deploys two paid units and applies only the completed research")

func _attack_module(gun: Dictionary, module: Dictionary) -> void:
	module.hp = 1.0
	_check(sim.issue_command([gun.tag], "attack_target", module.pos, module.tag).ok, "Enemy artillery targets the Research Module")
	sim.step_ticks(32)
	_check(not sim.units.has(module.tag), "Combat removes the Research Module")

func _test_attachment_cycle(cancel_research: bool) -> void:
	_load([
		{"type": "colony_hub", "x": 16, "y": 18},
		{"id": "hall", "type": "muster_hall", "x": 30, "y": 29},
		{"id": "other_hall", "type": "muster_hall", "x": 51, "y": 52},
		{"id": "lab", "type": "workshop", "x": 20, "y": 56},
		{"id": "rifle", "type": "rifleman", "x": 22, "y": 41},
		{"id": "gun", "type": "howitzer_emplaced", "owner": 2, "x": 62, "y": 29},
	])
	var hall := _unit("hall")
	var other_hall := _unit("other_hall")
	var gun := _unit("gun")
	var rifle := _unit("rifle")
	var player: Dictionary = sim.players[1]
	var attach := "attach_research_module"
	var research := "research_surge_efficiency"
	var module_cost := _cost("research_module")
	var rifle_cost := _cost("rifleman")
	var offer: Dictionary = sim.research_offer(1, "surge_efficiency")
	var research_cost := Vector2i(offer.crystal, offer.aether)
	_check(not sim.issue_command([hall.tag, _unit("lab").tag], research).ok and _stock() == STARTING_STOCK,
		"Neither a bare Hall nor a Workshop can start attachment research")
	_check(sim.issue_command([rifle.tag], "surge").ok and rifle.hp == rifle.max_hp - 10.0 and rifle.surge_timer == 11.0,
		"Ordinary Surge still costs 10 HP for 11 seconds before research")
	rifle.hp = 8.0
	_check(not sim.issue_command([rifle.tag], "surge").ok, "Unresearched Surge still rejects a low-health Rifleman")
	sim.issue_command([gun.tag], "hold_fire")
	_check(sim.issue_command([hall.tag, other_hall.tag], attach).accepted == 2, "Both Halls can pay for their own Research Modules")
	var module: Dictionary = sim.production_attachment(hall, false)
	if not _check(not module.is_empty(), "The paid Research Module occupies its Hall's pad"):
		return
	_check(not sim.issue_command([hall.tag], "attach_fabrication_module").ok and not sim.issue_command([hall.tag], research).ok
		and _stock() == STARTING_STOCK - module_cost * 2, "The foundation occupies the common pad and has not unlocked research")
	sim.step_ticks(_build_ticks(module))
	_check(not sim.issue_command([hall.tag], "attach_fabrication_module").ok and not sim.issue_command([module.tag], research).ok,
		"A finished Research Module shares the pad and its Hall runs the research")
	_check(sim.issue_command([hall.tag], research).ok and not sim.issue_command([other_hall.tag], research).ok,
		"An attached Hall can pay once while another attached Hall is blocked from duplicating the job")
	for _job in range(2):
		_check(sim.issue_command([hall.tag], "train_rifleman").ok, "Queue paid infantry behind research")
	var cost_before_loss := module_cost * 2 + research_cost + rifle_cost * 2
	if not _check(_job_names(hall) == ["surge_efficiency", "rifleman", "rifleman"]
		and _stock() == STARTING_STOCK - cost_before_loss and player.supply_used == 3,
		"Research and infantry keep exact order, cost and supply"):
		return
	sim.step_ticks(32)
	_attack_module(gun, module)
	var queue: Array = hall.production_queue
	var job: Dictionary = queue[0]
	var paused_progress: float = job.progress
	sim.step_ticks(ceili(float(job.total_time) / sim.TICK_DT))
	if not _check(queue.size() == 3 and sim.active_production_slots(hall) == 0 and paused_progress > 0.0 and job.progress == paused_progress
		and queue[1].progress == 0.0 and queue[2].progress == 0.0 and not player.surge_efficiency,
		"Loss freezes the paid research and both waiting jobs for longer than the original duration"):
		return
	_check(not sim.issue_command([other_hall.tag], research).ok, "Paused research still reserves the unique upgrade")
	if cancel_research:
		_check(_cancel(hall, 0) and _stock() == STARTING_STOCK - cost_before_loss + research_cost
			and player.supply_used == 3 and not player.surge_efficiency,
			"Canceling paused research refunds its full cost without granting the upgrade")
		sim.step_ticks(1)
		_check(queue[0].progress == sim.TICK_DT and queue[1].progress == 0.0,
			"Canceling paused research lets the next paid unit advance normally")
		_check(sim.issue_command([other_hall.tag], research).ok, "A separate attached Hall can restart the canceled research")
		return
	_check(_cancel(hall, 1) and _stock() == STARTING_STOCK - cost_before_loss + rifle_cost and player.supply_used == 2,
		"Canceling a waiting unit during attachment loss refunds only that unit")
	_check(sim.issue_command([hall.tag], attach).ok, "Pay to rebuild the missing Research Module")
	var replacement: Dictionary = sim.production_attachment(hall, false)
	if replacement.is_empty():
		return
	for _tick in range(_build_ticks(replacement)):
		sim.step_ticks(1)
		if replacement.build_progress >= 1.0:
			break
	sim.step_ticks(1)
	_check(job.progress > paused_progress and job.progress <= paused_progress + sim.TICK_DT * 2.0
		and queue[1].progress == 0.0, "Rebuilding resumes the original research at its saved progress")
	_finish_front(hall)
	_check(player.surge_efficiency and not sim.issue_command([other_hall.tag], research).ok,
		"The recovered job grants one permanent research level")
	_finish_front(hall)
	_check(deployed == ["rifleman"] and queue.is_empty() and player.supply_used == 2
		and _stock() == STARTING_STOCK - module_cost * 3 - research_cost - rifle_cost,
		"Only the uncanceled unit deploys and no paid job is charged again")
	_attack_module(gun, replacement)
	_check(sim.issue_command([rifle.tag], "surge").ok and rifle.hp == 3.0 and rifle.surge_timer == 11.0,
		"Existing infantry use the unlocked 5-HP Surge even after the completed tech's module is lost")
