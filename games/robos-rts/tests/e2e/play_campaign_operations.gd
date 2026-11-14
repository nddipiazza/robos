extends SceneTree

# Runs a normal mission from its authored start using paid player orders.
# Pass mission number 9, 10 or 11 after the Godot command-line separator.
const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const BUDGET := [1000, 1100, 600]
var sim: Node
var index: int
var mission
var hub: Dictionary
var gas_slot := 0
var last_state := ""
var peak_supply := 0
var rail_defenders: Array[int] = []
var freight_lane := -1
var freight_spotted_at := -100000

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or args[0] not in ["9", "10", "11"]:
		printerr("Choose mission 9, 10 or 11 after --")
		quit(2)
		return
	index = int(args[0]) - 1
	if not sim.start_campaign(index, "normal").ok:
		quit(1)
		return
	sim.paused = true
	mission = sim.campaign.operation
	sim.notice.connect(_on_notice)
	hub = sim.campaign._named(sim, "operation_hub")
	for second in range(0, BUDGET[index - Campaign.RAIL], 2):
		if sim.campaign.status != "playing":
			break
		match index:
			Campaign.RAIL: _rail(second)
			Campaign.GAS: _gas(second)
			Campaign.DRILL: _drill()
		if sim.units.has(hub.tag):
			_macro(second)
		sim.step_ticks(2 * sim.TICK_RATE)
		var view: Dictionary = sim.campaign.snapshot(sim, 1)
		var state: String = view.primary + " | " + view.mission_note
		peak_supply = maxi(peak_supply, sim.players[1].supply_used)
		if state != last_state and (index != Campaign.DRILL or second % 20 == 0) or second % 60 == 0:
			print("%03d s %s | supply %d/%d | crystal %d aether %d" % [second+2, state, sim.players[1].supply_used, sim.players[1].supply_cap, sim.players[1].crystal, sim.players[1].aether])
		last_state = state
	var stats: Dictionary = sim.players[1]
	print(JSON.stringify({"mission": Campaign.MISSIONS[index].title, "difficulty": sim.campaign.difficulty,
		"status": sim.campaign.status, "reason": sim.campaign.reason, "seconds": float(sim.tick) / sim.TICK_RATE,
		"peak_supply": peak_supply, "units_trained": stats.units_trained, "structures_built": stats.structures_built,
		"crystal_collected": stats.crystal_collected, "aether_collected": stats.aether_collected,
		"trains": mission._intercepted, "escaped": mission._escaped, "canisters": mission._delivered, "sealed": mission._sealed}))
	quit(int(sim.campaign.status != "victory"))

func _own() -> Array:
	return sim.units.values().filter(func(unit): return unit.owner == 1 and unit.hp > 0.0)

func _order(units: Array, ability: String, point: Vector2, target: int = 0) -> void:
	if not units.is_empty():
		sim.issue_command(units.map(func(unit): return unit.tag), ability, point, target)

func _construction(workers: Array, kind: String, point: Vector2) -> bool:
	if not sim.can_place_structure(kind, point) or not sim.can_see_position(1, point):
		return false
	var builders := workers.filter(func(unit): return not unit.orders.any(func(order): return order.type in ["build", "extract_canister", "deliver_canister"]))
	builders.sort_custom(func(a,b): return a.pos.distance_squared_to(point) < b.pos.distance_squared_to(point))
	if builders.is_empty():
		return false
	return sim.issue_command([builders[0].tag], "build_" + kind, point).ok

func _macro(second: int) -> void:
	var own := _own()
	var workers := own.filter(func(unit): return unit.is_worker)
	var stats: Dictionary = sim.players[1]
	var taps := own.filter(func(unit): return unit.unit_type == "aether_tap" and unit.build_progress >= 1.0)
	var building := workers.any(func(unit): return unit.orders.any(func(order): return order.type == "build"))
	if not building and taps.is_empty() and second >= 10 and stats.crystal >= 75:
		_construction(workers, "aether_tap", hub.pos + Vector2(-16,3))
	if not building and stats.supply_cap - stats.supply_used < 12 and stats.crystal >= 100:
		for offset in [Vector2(0,9),Vector2(-6,9),Vector2(6,9),Vector2(-16,9),Vector2(16,9),Vector2(16,15),Vector2(-18,15),Vector2(-21,4),Vector2(21,4),Vector2(-9,22),Vector2(9,22),Vector2(0,25)]:
			if _construction(workers,"silo",hub.pos+offset):
				break
	if not building and second >= 50 and stats.crystal >= 195:
		var halls := own.filter(func(unit): return unit.unit_type == "muster_hall").size()
		if halls < 3:
			for offset in [Vector2(-22, 13),Vector2(-17,24),Vector2(18,22),Vector2(2,29),Vector2(-7,-23),Vector2(12,-22)]:
				if _construction(workers, "muster_hall",hub.pos+offset):
					break
	if workers.size() < 18 and hub.production_queue.is_empty() and second >= 4:
		sim.issue_command([hub.tag], "train_pioneer")
	if not taps.is_empty():
		var available := workers.filter(func(worker): return not worker.orders.any(func(order):
			return order.type in ["extract_canister", "deliver_canister", "build"]))
		sim.issue_command(available.map(func(worker):return worker.tag),"fill_gas",taps[0].pos,taps[0].tag)
	for unit in workers:
		if unit.orders.is_empty() and not unit.has("campaign_canister"):
			sim.issue_SmartHarvest(unit.tag)
	for unit in own:
		if not unit.is_structure or not unit.production_queue.is_empty() or unit.build_progress < 1.0:
			continue
		if unit.unit_type == "muster_hall" and stats.crystal >= 50:
			var trained := false
			if (own.filter(func(candidate): return candidate.unit_type == "triage_specialist").size() < 5 and stats.aether >= 25):
				trained = sim.issue_command([unit.tag],"train_triage_specialist").ok
			if not trained:
				sim.issue_command([unit.tag],"train_rifleman")
		elif unit.unit_type == "workshop":
			var key: String = {Campaign.RAIL:"rail_skimmer",Campaign.GAS:"warden_walker",Campaign.DRILL:"howitzer"}[index]
			sim.issue_command([unit.tag],"train_"+key)

func _army() -> Array:
	return _own().filter(func(unit):return not unit.is_worker and not unit.is_structure and not unit.get("campaign_scripted",false))

func _on_notice(owner: int, message: String, _kind: String) -> void:
	const PREFIX := "Freight has entered rail line "
	if owner == 1 and message.begins_with(PREFIX):
		freight_lane = int(message.trim_prefix(PREFIX).trim_suffix(".")) - 1
		freight_spotted_at = sim.tick

func _rail(second: int) -> void:
	var army := _army()
	rail_defenders.assign(rail_defenders.filter(func(tag): return sim.units.has(tag)))
	if second >= 80:
		for unit in army:
			if rail_defenders.size() >= 9:
				break
			if unit.unit_type == "rifleman" and not rail_defenders.has(unit.tag):
				rail_defenders.append(unit.tag)
				_order([unit], "attack_move", hub.pos + Vector2(6, -13))
		if second % 14 == 0:
			_order(army.filter(func(unit): return rail_defenders.has(unit.tag)), "attack_move", hub.pos + Vector2(6, -13))
		for bunker in _own().filter(func(unit): return unit.unit_type == "field_bunker"):
			var available := army.filter(func(unit): return rail_defenders.has(unit.tag) and unit.orders.all(func(order): return order.type != "enter_bunker"))
			var open_slots: int = 4 - bunker.get("passengers", []).size()
			if open_slots > 0:
				_order(available.slice(0, open_slots), "enter_bunker", bunker.pos, bunker.tag)
		army = army.filter(func(unit): return not rail_defenders.has(unit.tag))
	var trains: Array = sim.units.values().filter(func(unit):
		return unit.unit_type == "rail_freight" and sim.can_see_unit(1, unit))
	if not trains.is_empty():
		trains.sort_custom(func(a,b):return a.pos.x > b.pos.x)
		var target: Dictionary = trains.front()
		for unit in army:
			var current: Dictionary = unit.orders.front() if not unit.orders.is_empty() else {}
			if current.get("target_tag") == target.tag:
				continue
			if not unit.get("weapon", {}).is_empty():
				sim.issue_command([unit.tag],"attack_target",target.pos,target.tag)
		if second % 8 == 0:
			_order(army.filter(func(u):return u.unit_type == "triage_specialist"),"move",target.pos + Vector2(4,5))
		return
	if freight_lane >= 0 and sim.tick - freight_spotted_at < 42 * sim.TICK_RATE:
		var posts := [Vector2(128, 48), Vector2(107, 82), Vector2(94, 151)]
		if second % 6 == 0:
			_order(army, "attack_move", posts[freight_lane])
		return
	var survey := [Vector2(71,109), Vector2(92,75), Vector2(137,107), Vector2(150,117), Vector2(51,130), Vector2(185,158)]
	if second < 35 and second % 8 == 0:
		_order(army,"attack_move",survey[mini(int(second/8), survey.size()-1)])
		return
	if second % 10 == 0:
		var posts := [Vector2(126,51),Vector2(127,83),Vector2(127,145)]
		for lane in posts.size():
			var group := []
			for n in range(lane, army.size(), posts.size()):
				group.append(army[n])
			_order(group,"attack_move",posts[lane])

func _gas(second: int) -> void:
	var army := _army()
	var vents: Array = sim.units.values().filter(func(unit):return unit.unit_type == "gas_altar" and not unit.has("campaign_vent_sealed"))
	var workers := _own().filter(func(unit):
		return unit.is_worker and not unit.has("campaign_canister") and not unit.orders.any(func(o):
			return o.type in ["extract_canister","deliver_canister","build"] or (o.type=="harvest" and sim.units.get(o.target_tag,{}).get("is_extractor",false))))
	for vent in vents:
		if not sim.can_see_unit(1, vent):
			continue
		if _own().any(func(unit):return unit.orders.any(func(order):return order.type == "extract_canister" and order.target_tag == vent.tag)):
			continue
		workers.sort_custom(func(a,b):return a.pos.distance_squared_to(vent.pos)<b.pos.distance_squared_to(vent.pos))
		if not workers.is_empty() and sim.issue_command([workers[0].tag],"extract_canister",vent.pos,vent.tag).ok:
			workers.pop_front()
	var mote: Array = sim.units.values().filter(func(unit):return unit.owner == 2 and unit.unit_type == "mote" and sim.can_see_unit(1,unit))
	if not mote.is_empty():
		var sealer: Dictionary = mote.front()
		for unit in army:
			if not unit.get("weapon", {}).is_empty():
				sim.issue_command([unit.tag],"attack_target",sealer.pos,sealer.tag)
		return
	if second % 10 == 0:
		var scout_marks := [Vector2(174,145),Vector2(202,155),Vector2(205,109),Vector2(174,106),Vector2(138,118),Vector2(111,115),Vector2(91,97),Vector2(59,144),Vector2(105,59),Vector2(53,54),Vector2(150,44),Vector2(202,37)]
		var mark: Vector2 = scout_marks[gas_slot % scout_marks.size()]
		if army.any(func(unit):return unit.pos.distance_to(mark)<13.0):
			gas_slot += 1
		_order(army,"attack_move",scout_marks[gas_slot % scout_marks.size()])

func _drill() -> void:
	var drill: Dictionary = sim.campaign._named(sim,"helix_drill")
	if drill.is_empty():
		return
	var threats: Array = sim.units.values().filter(func(unit):
		return unit.owner == 2 and not unit.is_structure and sim.can_see_unit(1,unit) and unit.pos.distance_to(drill.pos)<30.0)
	threats.sort_custom(func(a,b):return a.pos.distance_squared_to(drill.pos)<b.pos.distance_squared_to(drill.pos))
	if drill.owner == 1 and not threats.is_empty():
		var target: Dictionary = threats.front()
		sim.issue_command([drill.tag],"attack_target",target.pos,target.tag)
	var army := _army()
	var bunkers := _own().filter(func(unit):return unit.unit_type == "field_bunker")
	for bunker in bunkers:
		var rifles := army.filter(func(unit):return unit.unit_type == "rifleman" and unit.orders.is_empty() and not unit.has("defense_origin"))
		var occupied: int = bunker.get("passengers", []).size()
		if occupied < 4 and rifles.size() > 0:
			_order(rifles.slice(0,4-occupied),"enter_bunker",bunker.pos,bunker.tag)
	var tanks := army.filter(func(unit):return unit.unit_type=="howitzer")
	for tank in tanks:
		var post: Vector2 = drill.pos+Vector2(-8,5) if tank.tag%2==0 else drill.pos+Vector2(9,2)
		if tank.pos.distance_to(post)<3.0:
			sim.issue_command([tank.tag],"emplace")
		elif tank.orders.is_empty():
			sim.issue_command([tank.tag],"move",post)
	var foot := army.filter(func(unit):return unit.unit_type not in ["howitzer","howitzer_emplaced"] and unit.orders.is_empty())
	_order(foot,"attack_move",drill.pos+Vector2(-3,-3))
