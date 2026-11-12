extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_difficulty()
	_test_roster_rules()
	_test_research_pace()
	_test_hall_relocation()
	_test_bunker_garrison()
	_test_objective_visibility()
	_test_assault(true)
	_test_assault(false)
	_test_uprising_blast()
	_test_recovery()
	_test_defense()
	_test_evacuation()
	_test_stranded_rescue()
	_test_stranded_timeout()
	_test_terminal_states()
	_test_progress()
	print("Campaign: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _view() -> Dictionary:
	return sim.campaign.snapshot(sim)

func _army() -> Array:
	return sim.units.values().filter(func(u): return u.owner == 1 and not u.is_structure and not u.is_worker and not u.get("campaign_scripted", false)).map(func(u): return u.tag)

func _unit_named(id: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.id == id:
			return unit
	return {}

func _order(tags: Array, kind: String, point: Vector2) -> void:
	var result: Dictionary = sim.issue_command(tags, kind, point)
	_check(result.ok, "Accepted %s to %s" % [kind, point])

func _advance(seconds: int) -> void:
	sim.step_ticks(seconds * sim.TICK_RATE)

func _test_evacuation() -> void:
	var evac := Campaign.Evacuation
	_check(not Campaign.mission_available(Campaign.EVACUATION, [Campaign.MISSIONS[Campaign.RECOVERY].id]),
		"Mission 04 stays locked before Hold for Dawn")
	_check(Campaign.mission_available(Campaign.EVACUATION, [Campaign.MISSIONS[Campaign.DEFENSE].id]),
		"Hold for Dawn unlocks Mission 04")
	_check(sim.start_campaign(Campaign.EVACUATION, "hard").ok, "The Last Road loads")
	_check(sim.map_width == 152 and sim.map_height == 200, "The evacuation uses the original terrain dimensions")
	_check(sim.terrain_grid != null and sim.terrain_grid.bounds == Rect2(17, 24, 113, 160),
		"The original playable bounds are inset from the terrain edges")
	_check(sim._is_point_blocked_by_static(Vector2(12, 145), 0.6)
		and not sim.can_place_structure("silo", Vector2(12, 145)), "Movement and construction respect the playable boundary")
	var insertion_height: float = sim.get_elevation_at(evac.INSERTION_ROAD.front())
	var settlement_height: float = sim.get_elevation_at(evac.SETTLEMENT)
	var spaceport_height: float = sim.get_elevation_at(evac.SPACEPORT)
	_check(settlement_height > insertion_height + 1.5 and spaceport_height > settlement_height + 1.5,
		"The settlement and spaceport use distinct elevation tiers")
	_check(sim._has_clear_line_of_walk(Vector2(90, 50), Vector2(95, 45), 0.85)
		and not sim._has_clear_line_of_walk(Vector2(90, 54), Vector2(100, 46), 0.85),
		"Infantry can follow the dock ramps and are blocked by the adjacent cliff")
	_check(_army().size() == 4 and _unit_named("settlement_hub").owner == 0, "Opening escort has four troops and a neutral settlement")
	_check(not sim.can_see_position(1, evac.SPACEPORT), "The spaceport starts in fog")
	_check(sim.research_offer(1, "weapons").get("level") == 1
		and sim.research_offer(1, "armor").get("time") == 160.0, "The Field Armory offers campaign infantry +1/+1")
	var truck_radius: float = root.get_node("RTSData").get_unit_def("settlement_truck").radius
	for index in range(1, evac.ROUTE.size()):
		var from: Vector2 = evac.ROUTE[index - 1]
		var to: Vector2 = evac.ROUTE[index]
		var path: Array[Vector2] = sim.compute_smooth_path(from, to, truck_radius)
		var length := 0.0
		for step in path:
			length += from.distance_to(step)
			from = step
		_check(not path.is_empty() and path.back().distance_to(to) < 0.25
			and length < 1.5 * evac.ROUTE[index - 1].distance_to(to),
			"Truck route is traversable at waypoint %d" % index)
		var route_start: Vector2 = evac.ROUTE[index - 1]
		var bend: Vector2 = evac.ROAD_BENDS.get(index, to)
		_check(sim._has_clear_line_of_walk(route_start, bend, truck_radius)
			and sim._has_clear_line_of_walk(bend, to, truck_radius),
			"The truck's automatic route stays on walkable terrain at waypoint %d" % index)
	var squad := _army()
	for index in range(1, evac.INSERTION_ROAD.size()):
		sim.issue_command(squad, "attack_move", evac.INSERTION_ROAD[index], 0, "", index > 1)
	_advance(38)
	_check(sim.campaign.stage == 1 and _unit_named("settlement_hub").owner == 1, "Arrival transfers the settlement")
	if sim.campaign.stage != 1:
		return
	var hall := _unit_named("evac_muster")
	_check(sim.production_attachment(hall).get("unit_type") == "research_module", "Starting Research Module is docked")
	_check(sim.issue_command([hall.tag], "train_torchguard").ok, "Torchguards can train with an attached Research Module")
	_check(sim.campaign_allows_ability(1, "attach_fabrication_module"), "Mission 04 unlocks the Fabrication Module")
	_advance(26)
	var state := _view()
	_check(state.convoys_sent == 1 and state.convoy_tag > 0, "A truck leaves automatically")
	if not sim.units.has(state.convoy_tag):
		return
	var truck: Dictionary = sim.units[state.convoy_tag]
	_check(not sim.issue_command([truck.tag], "stop").ok and not sim.issue_command([truck.tag], "move", Vector2(40, 140)).ok,
		"Player commands cannot override the convoy")
	var before: Vector2 = truck.pos
	var next: Vector2 = evac.ROUTE[sim.campaign.evacuation._waypoint + 1]
	var obstruction: Dictionary = sim.spawn_unit("silo", 1, before.move_toward(next, 2.0))
	_advance(6)
	_check(truck.pos.distance_to(before) > 4.5,
		"The automatic truck follows the road through building footprints")
	sim._remove_destroyed_unit(obstruction)
	sim._remove_destroyed_unit(truck)
	sim.campaign.step(sim)
	_check(_view().colonists_lost == 5 and sim.campaign.evacuation._survivors.size() == 5,
		"A destroyed ten-seat truck records casualties and releases survivors")
	for tag in sim.campaign.evacuation._survivors:
		_check(sim.units[tag].unit_type == "evacuee" and not sim.units[tag].orders.is_empty(),
			"Survivors follow the road on foot")
	sim.campaign.evacuation.lost = evac.LOSS_LIMIT
	_advance(1)
	_check(_view().status == "defeat", "Hard fails when the colonist loss limit is reached")

func _test_difficulty() -> void:
	sim.start_campaign(Campaign.ASSAULT)
	var standard := _unit_named("checkpoint_1")
	var standard_count: int = sim.units.size()
	sim.start_campaign(Campaign.ASSAULT, "casual")
	var easy := _unit_named("checkpoint_1")
	_check(easy.hp == floorf(standard.hp * 0.5) and easy.max_hp == easy.hp, "Casual halves hostile starting HP")
	_check(_unit_named("captain_vale").hp == 245.0, "Casual enemy modifiers leave the player's squad intact")
	sim.start_campaign(Campaign.ASSAULT, "hard")
	var hard := _unit_named("checkpoint_1")
	_check(sim.units.size() > standard_count and sim.unit_upgrade_level(hard, "armor") == 0 and sim.unit_upgrade_level(hard, "weapons") == 0,
		"Hard adds guards without combat upgrades in Cut the Signal")
	sim.start_campaign(Campaign.RECOVERY, "hard")
	var directorate := sim.units.values().filter(func(unit): return unit.owner == 2 and unit.unit_type == "rifleman").front() as Dictionary
	var directorate_medic := sim.units.values().filter(func(unit): return unit.owner == 2 and unit.unit_type == "triage_specialist").front() as Dictionary
	_check(sim.unit_upgrade_level(directorate, "armor") == 1 and sim.unit_upgrade_level(directorate, "weapons") == 1,
		"Hard White Ridge gives Directorate combat units +1 weapons and armor")
	_check(directorate_medic.campaign_healing_multiplier == Campaign.DIRECTORATE_HEALING_MULTIPLIER, "Hard White Ridge improves Directorate healing")
	sim.start_campaign(Campaign.RECOVERY, "brutal")
	var enemy: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(90, 119))
	var medic: Dictionary = sim.spawn_unit("triage_specialist", 1, Vector2(94, 117))
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim._find_best_attack_target(enemy, true).get("tag") == medic.tag, "Brutal prioritizes medics in range")
	_check(sim.units.values().any(func(unit): return unit.owner == 2 and unit.unit_type == "howitzer_emplaced"), "Brutal White Ridge stations a siege gun at the dig site")
	sim.start_campaign(Campaign.DEFENSE, "casual")
	_check(not sim.campaign_allows_ability(1, "build_field_armory") and not sim.campaign_allows_ability(1, "build_sentry_turret"), "Casual defense locks out the armory and anti-air turret")
	_check(not sim.units.values().any(func(unit): return unit.owner == 1 and unit.unit_type in Campaign.CASUAL_DISABLED_STRUCTURES), "Casual defense starts without those buildings")
	_check(sim.campaign._wave_composition({"needlewing": 3}).is_empty(), "Casual defense skips flying waves")
	_check(not sim.campaign.snapshot(sim, 1).has("next_wave_in"), "Player views do not reveal the next wave's timing")
	_advance(_view().next_wave_in)
	_check(_view().last_wave_size == 3 and _view().waves_sent == 1, "Casual deploys a smaller first wave on its scripted schedule")
	sim.start_campaign(Campaign.DEFENSE, "brutal")
	var hub := _unit_named("evac_hub")
	sim.tick = Campaign.TUNNEL_AT * sim.TICK_RATE
	sim.campaign._step_defense_escalation(sim, hub.pos)
	_check(sim.units.values().filter(func(unit): return unit.owner == 2).all(func(unit):
		return sim.unit_upgrade_level(unit, "weapons") == 0 and sim.unit_upgrade_level(unit, "armor") == 0
	), "Late Brutal pressure uses reinforcements without Brood research tiers")
	var tunnel: Dictionary = sim.units.get(sim.campaign._tunnel_tag, {})
	_check(tunnel.get("unit_type") == "tunnel_mouth", "Brutal establishes a destructible reinforcement tunnel")
	var count: int = sim.units.size()
	sim.tick += 6 * sim.TICK_RATE
	sim.campaign._step_defense_escalation(sim, hub.pos)
	_check(sim.units.size() > count and sim.campaign._breaches > 0, "Brutal tunnels and perimeter incursions create real enemies")
	if not tunnel.is_empty():
		sim._apply_damage_to_target(hub, tunnel, tunnel.max_hp * 2.0, {}, 1.0)
		count = sim.units.size()
		sim.tick += 20 * sim.TICK_RATE
		sim.campaign._step_defense_escalation(sim, hub.pos)
		_check(sim.units.size() == count, "Destroying the tunnel stops its reinforcements")

func _test_roster_rules() -> void:
	sim.start_campaign(Campaign.ASSAULT)
	_check(_army().all(func(tag): return sim.units[tag].unit_type == "rifleman"), "Cut the Signal fields only Vale and Riflemen")
	_check(not sim.campaign_allows_ability(1, "train_rifleman") and not sim.issue_command(_army(), "surge").ok, "The fixed squad has no production or later infantry abilities")
	sim.start_campaign(Campaign.RECOVERY)
	var hall := _unit_named("recovery_hall")
	var workers: Array = sim.units.values().filter(func(unit): return unit.is_worker and unit.owner == 1)
	_check(not sim.issue_command([hall.tag], "train_breacher").ok and not sim.issue_command([hall.tag], "attach_fabrication_module").ok, "White Ridge rejects later units and attachments")
	_check(not sim.issue_command([workers[0].tag], "build", Vector2(99, 117), 0, "sentry_turret").ok, "The generic build order cannot bypass the White Ridge roster")
	sim.start_campaign(Campaign.DEFENSE)
	_check(sim.campaign_allows_ability(1, "build_field_bunker") and sim.campaign_allows_ability(1, "build_field_armory") and sim.campaign_allows_ability(1, "build_sentry_turret"), "Hold for Dawn adds the three defense structures")
	_check(not sim.campaign_allows_ability(1, "attach_fabrication_module") and not sim.campaign_allows_ability(1, "train_howitzer") and not sim.campaign_allows_ability(1, "build_airframe_hangar"), "Dual production, armor and air tech remain outside the prologue roster")
	var bunker := _unit_named("north_bunker")
	var enemy: Dictionary = sim.spawn_unit("skitterling", 2, bunker.pos + Vector2(4, 0))
	var air_enemy: Dictionary = sim.spawn_unit("needlewing", 2, bunker.pos + Vector2(4, 0))
	var turret := sim.units.values().filter(func(unit): return unit.owner == 1 and unit.unit_type == "sentry_turret").front() as Dictionary
	_check(sim.can_attack(turret, air_enemy) and not sim.can_attack(turret, enemy), "Hold for Dawn turrets only attack air targets")
	var armory := sim.units.values().filter(func(unit): return unit.owner == 1 and unit.unit_type == "field_armory").front() as Dictionary
	workers = sim.units.values().filter(func(unit): return unit.is_worker and unit.owner == 1)
	armory.build_progress = 0.9
	var site := Vector2(102, 138)
	_check(not sim.issue_command([workers[2].tag], "build_sentry_turret", site).ok, "Turret construction requires a completed Field Armory")
	armory.build_progress = 1.0
	_check(sim.issue_command([workers[2].tag], "build_sentry_turret", site).ok, "The completed Field Armory unlocks turret construction")
	for id in Campaign.DEFENSE_BUNKERS:
		var start_bunker := _unit_named(id)
		var garrison: Array = start_bunker.get("passengers", [])
		_check(garrison.size() == 4 and garrison.all(func(unit): return unit.unit_type == "rifleman"), "Each starting bunker holds four Riflemen")
	_check(sim.can_attack(bunker, enemy), "A staffed bunker can fire")
	_check(sim.issue_command([bunker.tag], "unload_bunker").ok and not sim.can_attack(bunker, enemy), "The bunker deploys its troops and stops firing when empty")
	_check(sim.issue_command([bunker.tag], "load_transport").ok and bunker.passengers.size() == 4, "Nearby Riflemen can return to the bunker")
	_check(sim.start_skirmish("iron-narrows").ok and sim.campaign_allows_ability(1, "train_breacher") and not sim.campaign_allows_ability(1, "build_field_bunker"), "Skirmish retains its own tech tree")

func _test_hall_relocation() -> void:
	sim.start_campaign(Campaign.RECOVERY)
	var hall := _unit_named("recovery_hall")
	var destination := Vector2(115, 123)
	_order([hall.tag], "lift", hall.pos)
	_advance(1)
	_check(hall.flight_height > 0.0, "The White Ridge Hall can take off")
	_order([hall.tag], "move", destination)
	_advance(4)
	_check(hall.pos.distance_to(destination) < 1.6, "The airborne Hall can relocate")
	_order([hall.tag], "land", destination)
	_advance(2)
	_check(hall.flight_height == 0.0 and hall.pos == destination, "The relocated Hall lands at its target")
	_check(sim.issue_command([hall.tag], "train_rifleman").ok, "The landed Hall can train Riflemen again")

func _test_research_pace() -> void:
	for mission in [Campaign.ASSAULT, Campaign.RECOVERY]:
		sim.start_campaign(mission)
		_check(sim.research_offer(1, "weapons").is_empty() and sim.research_offer(1, "armor").is_empty()
			and not sim.campaign_allows_ability(1, "research_surge_efficiency"), "The first two missions have no player research")
	sim.start_campaign(Campaign.DEFENSE, "casual")
	_check(sim.research_offer(1, "weapons").is_empty() and sim.research_offer(1, "armor").is_empty(), "Casual Hold for Dawn has no player research")
	for difficulty in ["normal", "hard", "brutal"]:
		sim.start_campaign(Campaign.DEFENSE, difficulty)
		var armory := sim.units.values().filter(func(unit): return unit.unit_type == "field_armory").front() as Dictionary
		var bridge_approaches := [Vector2(101, 92), Vector2(80, 108)]
		for i in Campaign.DEFENSE_CACHE_SITES.size():
			var point: Vector2 = Campaign.DEFENSE_CACHE_SITES[i].point
			var path: Array = sim.compute_smooth_path(bridge_approaches[i / 2], point)
			_check(path.back().is_equal_approx(point), "The supplies at %s can be reached across their bridge" % point)
		_check(sim.issue_command([armory.tag], "research_weapons").ok, "The completed starting armory accepts Weapons")
		_check(not sim.issue_command([armory.tag], "research_armor").ok, "Armor waits for aether after paying for Weapons")
		var cache: Dictionary = Campaign.DEFENSE_CACHE_SITES[1]
		sim.spawn_unit("rifleman", 1, cache.point)
		sim.step_ticks(8)
		_check(_view().caches_claimed == 1 and sim.players[1].aether == 125, "The Aether cache pays for the second upgrade")
		_check(sim.issue_command([armory.tag], "research_armor").ok and armory.production_queue.size() == 2, "Armor queues behind Weapons")
		var duration: float = Campaign.INFANTRY_RESEARCH_SECONDS
		_check(armory.production_queue.all(func(job): return job.total_time == duration), "Both queued jobs take 160 game seconds on %s" % difficulty)
		if difficulty == "normal":
			_advance(158)
			_check(sim.players[1].upgrades.weapons == 0, "Weapons has not finished before 160 seconds")
			_advance(1)
			sim.step_ticks(sim.TICK_RATE - 8)
			_check(sim.players[1].upgrades.weapons == 1 and sim.players[1].upgrades.armor == 0, "Weapons completes at 160 seconds and Armor starts next")
			_advance(159)
			_check(sim.players[1].upgrades.armor == 0, "Armor stays pending until its own 160 seconds elapse")
			_advance(1)
			_check(sim.players[1].upgrades.armor == 1 and sim.research_offer(1, "weapons").is_empty()
				and sim.research_offer(1, "armor").is_empty(), "At 320 seconds both upgrades are capped at +1")

func _test_bunker_garrison() -> void:
	sim.load_scenario_dict({"paused": true, "map": {"width": 96, "height": 64}, "units": [
		{"type": "field_bunker", "id": "bunker", "owner": 1, "x": 42, "y": 28},
		{"type": "breacher", "id": "breacher", "owner": 1, "x": 23, "y": 28, "hp": 90},
		{"type": "rifleman", "id": "rifle", "owner": 1, "x": 45, "y": 31},
		{"type": "triage_specialist", "id": "medic", "owner": 1, "x": 40, "y": 33},
		{"type": "pioneer", "id": "worker", "owner": 1, "x": 38, "y": 31},
		{"type": "howitzer", "id": "tank", "owner": 1, "x": 42, "y": 24},
	]})
	var bunker := _unit_named("bunker")
	var breacher := _unit_named("breacher")
	var rifle := _unit_named("rifle")
	var medic := _unit_named("medic")
	var worker := _unit_named("worker")
	var tank := _unit_named("tank")
	var supply: int = sim.players[1].supply_used
	_check(not sim.issue_command([worker.tag, tank.tag], "enter_bunker", bunker.pos, bunker.tag).ok, "Workers and vehicles cannot enter a bunker")
	_check(sim.issue_command([breacher.tag], "enter_bunker", bunker.pos, bunker.tag).ok, "Distant infantry receive a bunker boarding order")
	sim.step_ticks(300)
	if not sim.is_embarked(breacher.tag, 1):
		_check(false, "The Breacher walks to the bunker and boards")
		return
	var breacher_hp: float = breacher.hp
	var aircraft: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(50, 28))
	_check(not sim.can_attack(bunker, aircraft), "A Breacher-only bunker cannot hit aircraft")
	_check(sim.issue_command([bunker.tag], "load_transport").ok and bunker.passengers.size() == 3, "Load Nearby adds the Rifleman and Triage Specialist")
	_check(sim.is_embarked(rifle.tag, 1) and sim.is_embarked(medic.tag, 1) and sim.units.has(worker.tag) and sim.units.has(tank.tag), "Only eligible infantry are removed from the field")
	_check(sim.can_attack(bunker, aircraft) and sim.players[1].supply_used == supply, "The Rifleman adds anti-air fire and passengers keep their supply")
	var ground: Dictionary = sim.spawn_unit("howitzer", 2, Vector2(50, 31))
	ground.hold_fire = true
	_check(sim.issue_command([bunker.tag], "attack_target", ground.pos, ground.tag).ok, "A mixed garrison can focus a target")
	sim.step_ticks(16)
	var attacks: Array = sim.recent_events.filter(func(event): return event.get("attacker_tag") == bunker.tag and event.get("target_tag") == ground.tag)
	_check(attacks.any(func(event): return event.weapon == "R-9 Carbine") and attacks.any(func(event): return event.weapon == "Breach Charges") and ground.slow_timer > 0.0, "The garrison uses both weapons and Breach Charges slow the target")
	_check(sim.issue_command([bunker.tag], "unload_bunker").ok and bunker.passengers.is_empty(), "The bunker unloads its mixed garrison")
	_check(sim.units.has(rifle.tag) and sim.units.has(medic.tag) and sim.units.has(breacher.tag) and breacher.hp == breacher_hp, "All passengers return with their original identities and health")

func _test_objective_visibility() -> void:
	sim.start_campaign(Campaign.RECOVERY)
	var cache: Vector2 = Campaign.CACHE_SITES[2].point
	var dig: Vector2 = Campaign.DIG_SITE
	var tracked := [[cache.x, cache.y], [dig.x, dig.y]]
	var player_view: Dictionary = sim.get_observation(1).campaign
	_check(player_view.primary == "Destroy the Directorate dig base", "The objective text stays available through fog")
	_check(not player_view.markers.any(func(marker): return marker.point in tracked), "Unscouted caches and the dig objective stay hidden")
	_check(sim.get_observation().campaign.markers.filter(func(marker): return marker.point in tracked).size() == 2, "The full observer retains all objective locations")
	for point in [cache, dig]:
		sim.vision.add_sweep(1, point, 6.0, sim.tick + 24)
	sim.step_ticks(8)
	player_view = sim.get_observation(1).campaign
	_check(player_view.markers.filter(func(marker): return marker.point in tracked).size() == 2, "Current vision reveals both objective markers")
	sim.step_ticks(16)
	player_view = sim.get_observation(1).campaign
	_check(sim.vision.state_at(1, dig) == sim.Vision.EXPLORED and not player_view.markers.any(func(marker): return marker.point in tracked), "Previously scouted objectives disappear when vision is lost")

func _test_assault(take_detours: bool) -> void:
	_check(sim.start_campaign(0).ok, "Assault mission loads")
	_check(_view().cue.id == "arrival" and _army().size() == 11, "Assault opens with a briefing and a squad")
	var vale := _unit_named("captain_vale")
	_check(vale.pos.x > sim.map_width * 0.8 and vale.pos.y > sim.map_height * 0.7, "The squad starts at the southeast corner")
	_check(Campaign.CHECKPOINTS.back().point.y < 15 and sim.is_water_at(Vector2(100, 84)), "The headquarters is at the north and ground orders cannot cross the central cliffs")
	_check(sim.get_observation(1).campaign.mission == 1 and sim.get_observation(2).campaign.is_empty(), "Campaign objectives use the player perspective")
	var detours := [[0], [1, 2], [3], [4, 5], []]
	for index in Campaign.CHECKPOINTS.size():
		var point: Vector2 = Campaign.CHECKPOINTS[index].point
		_order(_army(), "attack_move", point)
		var time_limit := 75 if index == Campaign.CHECKPOINTS.size() - 1 else 45
		for _i in time_limit:
			_advance(1)
			if _view().stage > index or _view().status != "playing":
				break
		_check(_view().stage > index, "Squad secured checkpoint %d (status %s, remaining troops %d)" % [index + 1, _view().status, _army().size()])
		if _view().stage <= index:
			return
		if take_detours:
			for statue_index in detours[index]:
				var statue := _unit_named(Campaign.STATUES[statue_index])
				if not statue.is_empty():
					_order(_army(), "attack_move", statue.pos)
					for _second in 35:
						_advance(1)
						if sim.can_see_unit(1, statue):
							break
					var attack: Dictionary = sim.issue_command(_army(), "attack_target", statue.pos, statue.tag)
					_check(attack.ok, "The statue accepts a direct attack order")
					_advance(13)
				_check(_unit_named(Campaign.STATUES[statue_index]).is_empty(), "Army can destroy statue %d by fighting through the detour" % (statue_index + 1))
	_check(_view().status == "victory" and _unit_named("relay_hq").is_empty(), "Destroying the relay headquarters wins the assault")
	_check(not _unit_named("captain_vale").is_empty(), "Captain Vale survives the assault")
	_check(_view().troops_joined == 5, "Five survivors join as real units")
	_check(_view().cue_history == ["arrival", "road", "square", "convoy", "perimeter_low", "uprising", "signal_off"], "Each assault scene triggers once in sequence")
	var civilians: Array = sim.units.values().filter(func(unit): return unit.unit_type == "resistance_civilian")
	_check(civilians.size() == 6 and civilians.all(func(unit): return unit.has("uprising_throw_tick")), "All six civilians take part in the barrage")
	_check(_unit_named("resistance_gate").is_empty() and sim.units.values().all(func(unit): return not unit.id.begins_with("uprising_wave_")), "The side gate opens and the final wave is cleared before victory")
	if not take_detours:
		_check(_view().bonus_done < _view().bonus_total, "Bonus statues are optional")

func _test_uprising_blast() -> void:
	sim.reset_state(716, 96, 64)
	var center := Vector2(40, 30)
	var civilian: Dictionary = sim.spawn_unit("resistance_civilian", 1, Vector2(28, 30))
	var vehicle: Dictionary = sim.spawn_unit("howitzer", 2, center)
	var infantry: Dictionary = sim.spawn_unit("rifleman", 2, center + Vector2(0, 1.7))
	var friendly: Dictionary = sim.spawn_unit("rifleman", 1, center + Vector2(0, -1.7))
	sim._rebuild_spatial_grid()
	sim.apply_uprising_blast(civilian, vehicle, center, [vehicle.tag, infantry.tag])
	_check(vehicle.hp == vehicle.max_hp - 70.0 + vehicle.armor, "The civilian direct hit has Emplaced Mortar damage and armor bonus")
	_check(infantry.hp == infantry.max_hp - 20.0, "The civilian blast uses the Emplaced Mortar inner splash band")
	_check(friendly.hp == friendly.max_hp, "The scripted barrage leaves Vale's squad unharmed")

func _test_recovery() -> void:
	_check(sim.start_campaign(Campaign.RECOVERY).ok and _view().cue.id == "dig_brief", "The White Ridge economy mission loads second")
	var hall := _unit_named("recovery_hall")
	var camp := _unit_named("camp_hall")
	_check(not sim.issue_command([hall.tag], "train_triage_specialist").ok, "Triage training requires a Research Module")
	_check(not sim.issue_command([camp.tag], "train_rifleman").ok, "The militia's Hall is unavailable before rescue")
	sim.issue_command([hall.tag], "rally", Vector2(91, 99))
	sim.issue_command([hall.tag], "train_rifleman")
	_order(_army(), "attack_move", Campaign.CACHE_SITES[0].point)
	_advance(12)
	_order(_army(), "attack_move", Campaign.CACHE_SITES[1].point)
	_advance(8)
	_check(_view().caches_claimed >= 2 and sim.players[1].aether == 100, "Two road caches award crystal and aether")
	_check(sim.issue_command([hall.tag], "attach_research_module").ok, "Cache aether pays for the Research Module")
	_order(_army(), "attack_move", Vector2(58, 84))
	_advance(11)
	_order(_army(), "attack_move", Campaign.CAMP_BEACON)
	for second in 38:
		if second % 25 == 0:
			sim.issue_command([hall.tag], "train_rifleman")
		_advance(1)
	_check(_view().bonus_done == 1 and _view().troops_joined > 0, "Clearing the siege transfers surviving militia troops and buildings")
	_check(sim.issue_command([camp.tag], "train_rifleman").ok, "The rescued Hall can produce units")
	_check(sim.issue_command([hall.tag], "train_triage_specialist").ok, "A completed Research Module enables paid Triage production")
	_check(_view().waves_sent > 0, "The Directorate sends pressure from the ridge")
	var approach := Vector2(88, 105)
	sim.issue_command([hall.tag], "rally", approach)
	sim.issue_command([camp.tag], "rally", approach)
	_order(_army(), "attack_move", approach)
	# Rally both production lines to the approach so they intercept the raids
	# while the slower Normal-speed queues build up the expedition.
	for second in 390:
		if second % 25 == 0:
			sim.issue_command([camp.tag], "train_rifleman")
			sim.issue_command([hall.tag], "train_triage_specialist" if second % 75 == 50 else "train_rifleman")
		_advance(1)
		if _view().status != "playing" or (sim.sim_time >= 260.0 and _army().size() >= 24):
			break
	var muster := Vector2(39, 96)
	_order(_army(), "attack_move", muster)
	_advance(23)
	_order(_army(), "attack_move", Vector2(32, 74))
	_advance(22)
	_order(_army(), "attack_move", Campaign.DIG_SITE)
	_advance(35)
	if _view().stage == 0:
		for id in Campaign.DIG_TARGETS:
			var target := _unit_named(id)
			if not target.is_empty():
				_order(_army(), "attack_move", target.pos)
				_advance(20)
	if _view().status == "playing":
		_order(_army(), "attack_move", Campaign.DIG_SITE)
		_advance(16)
	_check(_view().status == "victory", "Destroy the dig production structures and physically recover its artifact (%s, stage %d, troops %d)" % [_view().status, _view().stage, _army().size()])

func _test_defense() -> void:
	_check(sim.start_campaign(Campaign.DEFENSE).ok and _view().cue.id == "siege", "Defense starts third with a fresh briefing")
	_check(sim.bridge_decks.size() == 2 and sim.is_water_at(Vector2(82, 92)), "The river separates the fronts except at the two bridges")
	_check(is_equal_approx(sim.get_elevation_at(Vector2(103, 105)), 0.0)
		and is_equal_approx(sim.get_elevation_at(Vector2(106, 105)), 1.1)
		and is_equal_approx(sim.get_elevation_at(Vector2(109, 105)), 2.2),
		"The base ramp connects the west approach to the east plateau without a step")
	_check(is_equal_approx(sim.unit_elevation(_unit_named("north_bunker")), 0.0), "The north bunker sits on level ground beside the ramp")
	var hub := _unit_named("evac_hub")
	var hall := sim.units.values().filter(func(u): return u.unit_type == "muster_hall").front() as Dictionary
	var armory := sim.units.values().filter(func(u): return u.unit_type == "field_armory").front() as Dictionary
	var workers: Array = sim.units.values().filter(func(u): return u.is_worker and u.owner == 1)
	_order([workers[2].tag], "build_sentry_turret", Vector2(102, 138))
	_order([workers[3].tag], "build_sentry_turret", Vector2(99, 113))
	_check(sim.issue_command([armory.tag], "research_weapons").ok, "The Field Armory offers paid infantry upgrades")
	var rifle_order: Dictionary = sim.issue_command([hall.tag], "train_rifleman")
	_check(rifle_order.ok, "The garrison can spend starting crystal on reinforcements")
	_advance(40)
	_check(sim.players[1].upgrades.weapons == 0 and armory.production_queue[0].progress == 40.0, "Research advances on the evacuation clock")
	var wave_sizes: Array[int] = []
	for index in Campaign.WAVES.size():
		sim.tick = int(Campaign.WAVES[index].at) * sim.TICK_RATE - 2
		sim.step_ticks(1)
		_check(_view().waves_sent == index, "Wave %d waits for its scheduled tick" % (index + 1))
		sim.step_ticks(1)
		wave_sizes.append(_view().last_wave_size)
	_check(wave_sizes == [5, 9, 12, 16, 21, 26, 33, 35, 38, 40, 42, 44, 44, 42, 41, 41, 46],
		"Seventeen waves ramp up and continue in closer intervals before evacuation: %s" % str(wave_sizes))
	# The live Brutal playthrough covers combat. Isolate the transport trigger and flight here.
	for unit in sim.units.values():
		if unit.owner == 2:
			sim._remove_destroyed_unit(unit)
	sim.tick = (Campaign.RESCUE_AT - 1) * sim.TICK_RATE
	_check(_view().rescue_in == 1 and _view().rescue_tag == 0, "The Rampart waits for the evacuation timer")
	_advance(15)
	_check(_view().status == "victory" and _view().rescue_tag > 0 and sim.units.has(hub.tag), "Base holds through extraction (%s at %ds, hub HP %.0f)" % [_view().status, sim.sim_time, hub.hp])
	if _view().rescue_tag > 0:
		var ship := _unit_named("rescue_rampart")
		_check(not ship.is_empty() and ship.pos.distance_to(Campaign.LANDING_ZONE) <= 2.0, "Rescue ship physically reaches the landing zone")
	_check(_view().extra_done == 0 and _view().bonus_done == 0, "Artifacts and stranded squads are optional for mission success")

func _test_stranded_rescue() -> void:
	var guard_counts := {"casual": [4, 4, 4], "normal": [4, 5, 6], "hard": [4, 8, 11], "brutal": [4, 9, 13]}
	var playback := {"casual": 1.0, "normal": 1.0, "hard": 1.2, "brutal": 1.4}
	for difficulty in Campaign.DIFFICULTIES:
		sim.start_campaign(Campaign.DEFENSE, difficulty)
		_check(_view().rescue_in == 1200 and sim.sim_speed == playback[difficulty], "The mission starts at 20:00 with the expected difficulty playback speed")
		var times := [150, 360, 660]
		for index in Campaign.STRANDED_SQUADS.size():
			var site: Dictionary = Campaign.STRANDED_SQUADS[index]
			var squad: Dictionary = sim.campaign.squads[index]
			var prepositioned: bool = difficulty == "brutal" and index == 2
			if prepositioned:
				sim.spawn_unit("rifleman", 1, site.point + Vector2(0, -2))
			sim.tick = times[index] * sim.TICK_RATE - 2
			sim.step_ticks(1)
			_check(squad.state == "waiting" and squad.tags.is_empty(), "Squad %d waits for its timestamp on %s" % [index + 1, difficulty])
			sim.step_ticks(1)
			_check(squad.state == "stranded" and squad.tags.size() == 4,
				"Squad %d spawns on time and waits for combat on %s" % [index + 1, difficulty])
			_check(squad.get("ambush", []).size() == guard_counts[difficulty][index], "Squad %d gets its local guards on %s" % [index + 1, difficulty])
			for tag in squad.tags + squad.get("ambush", []):
				var unit: Dictionary = sim.units[tag]
				_check(not sim._is_point_blocked_by_static(unit.pos, unit.radius), "The rescue encounter starts on walkable ground")

	sim.start_campaign(Campaign.DEFENSE)
	var site: Dictionary = Campaign.STRANDED_SQUADS[0]
	sim.tick = int(site.at) * sim.TICK_RATE - 1
	sim.step_ticks(1)
	var squad: Dictionary = sim.campaign.squads[0]
	_advance(30)
	_check(squad.state == "stranded" and squad.tags.all(func(tag): return sim.units.has(tag)),
		"The militia survives beyond the old ambush window")
	if squad.tags.is_empty() or squad.get("ambush", []).is_empty():
		return
	var militia: Dictionary = sim.units[squad.tags[0]]
	var guard: Dictionary = sim.units[squad.ambush[0]]
	_check(sim.recent_events.any(func(event): return event.get("attacker_tag") in squad.ambush and event.get("target_tag") in squad.tags),
		"The local guards are actively attacking the stranded squad")
	sim._apply_damage_to_target(guard, militia, 1000.0, {}, 1.0)
	sim._apply_damage_to_target(militia, guard, 1000.0, {}, 1.0)
	_check(militia.hp == militia.max_hp and guard.hp == guard.max_hp and not sim.issue_command([militia.tag], "stop").ok,
		"The staged fight does no damage and the militia remains outside player control")
	var rescuer: Dictionary = sim.spawn_unit("rifleman", 1, site.point + Vector2(0, -2))
	var other_enemy: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(170, 135))
	sim._apply_damage_to_target(rescuer, other_enemy, 1.0, {}, 1.0)
	_check(squad.state == "stranded", "An attack on a different enemy leaves this squad stranded")
	var audio := root.get_node("RTSAudio")
	var before: int = audio.sfx_counts.get("unit_ready", 0)
	sim._apply_damage_to_target(rescuer, guard, 1.0, {}, 1.0)
	_check(squad.state == "rescued" and _view().bonus_done == 1
		and squad.tags.all(func(tag): return sim.issue_command([tag], "stop").ok),
		"The first hit on a guard recruits the entire surviving squad immediately")
	_check(audio.sfx_counts.get("unit_ready", 0) == before + 1 and audio.recent_sfx.back().ui,
		"The handoff plays one reinforcement chime")
	var guard_hp: float = guard.hp
	sim._apply_damage_to_target(militia, guard, 1.0, {}, 1.0)
	_check(guard.hp < guard_hp and audio.sfx_counts.get("unit_ready", 0) == before + 1,
		"Recruited militia can fight and subsequent hits do not replay the chime")
	sim._apply_damage_to_target(guard, militia, 1000.0, {}, 1.0)
	_check(not sim.units.has(militia.tag), "Guards can kill a recruited soldier immediately")

func _test_stranded_timeout() -> void:
	sim.start_campaign(Campaign.DEFENSE)
	var site: Dictionary = Campaign.STRANDED_SQUADS[0]
	sim.tick = int(site.at) * sim.TICK_RATE - 1
	sim.step_ticks(1)
	var squad: Dictionary = sim.campaign.squads[0]
	var marker: Dictionary = _view().markers.filter(func(entry): return entry.label == "Rescue militia").front()
	_check(marker.cover_seconds == Campaign.MILITIA_RESCUE_WINDOW_SECONDS, "The distress marker shows the full cover window")
	sim.tick = squad.deadline - 2
	sim.step_ticks(1)
	_check(squad.tags.all(func(tag): return sim.units.has(tag)), "The militia still have cover just before the deadline")
	for _second in range(40):
		_advance(1)
		if squad.state == "lost":
			break
	_check(squad.state == "lost" and not squad.tags.any(func(tag): return sim.units.has(tag)),
		"Without a rescue, the Brood naturally kill the entire squad after cover expires")
	_check(not _view().markers.any(func(entry): return entry.label == "Rescue militia" and entry.point == marker.point),
		"The overrun squad's rescue marker disappears")
	var outpost := _unit_named("evac_hub")
	var surviving_guards: Array = squad.ambush.filter(func(tag): return sim.units.has(tag))
	_check(not surviving_guards.is_empty() and surviving_guards.all(func(tag):
		var orders: Array = sim.units[tag].orders
		return not orders.is_empty() and orders[0].type == "attack_move" and orders[0].target_pos == outpost.pos),
		"The surviving militia attackers become an attack wave heading for the outpost")
	sim.spawn_unit("rifleman", 1, site.point + Vector2(0, -2))
	sim.step_ticks(1)
	_check(_view().status == "playing" and _view().bonus_done == 0, "A wiped squad cannot be rescued and its loss does not fail the mission")

func _test_terminal_states() -> void:
	sim.start_campaign(Campaign.DEFENSE)
	var hub := _unit_named("evac_hub")
	var armory := sim.units.values().filter(func(u): return u.unit_type == "field_armory").front() as Dictionary
	var workers: Array = sim.units.values().filter(func(u): return u.is_worker and u.owner == 1)
	_order([workers[2].tag], "build_sentry_turret", Vector2(102, 138))
	_order([workers[3].tag], "build_sentry_turret", Vector2(99, 113))
	_check(sim.issue_command([armory.tag], "research_weapons").ok, "The expedition can buy an infantry upgrade")
	_order(_army(), "attack_move", Campaign.STRANDED_SQUADS[0].point)
	for _second in Campaign.STRANDED_SQUADS[0].at + 15:
		_advance(1)
		if _view().bonus_done == 1:
			break
	_check(_view().bonus_done == 1 and _view().troops_joined > 0, "A real expedition across the bridge rescues the first stranded squad")
	for index in Campaign.RELICS.size():
		_order(_army(), "attack_move", Campaign.RELICS[index])
		var artifact: Dictionary = sim.campaign.artifacts[index]
		for _second in 52:
			_advance(1)
			if artifact.carrier != 0:
				break
		var tag: int = artifact.carrier
		_check(tag != 0 and _view().extra_done == index, "An expedition can reach guarded artifact %d" % (index + 1))
		_order(_army(), "attack_move", hub.pos + Vector2(-3.0, -6.0))
		var returning_tag := 0
		for _second in 75:
			if artifact.carrier != 0 and artifact.carrier != returning_tag:
				returning_tag = artifact.carrier
				_order([returning_tag], "move", hub.pos + Vector2(-1.0, -6.0))
			_advance(1)
			if artifact.delivered:
				break
		_check(artifact.delivered, "Returning the carrier to the Colony Hub secures artifact %d (%s)" % [index + 1, str(artifact)])
	# Isolate the mission loss rule from the timing of weapon cooldowns.
	var enemy: Dictionary = sim.spawn_unit("skitterling", 2, hub.pos + Vector2(-6, 0))
	sim._apply_damage_to_target(enemy, hub, hub.max_hp * 2.0, {}, 1.0)
	_advance(1)
	_check(_view().status == "defeat", "Losing the original Colony Hub fails the defense mission")
	var end_tick: int = sim.tick
	_advance(2)
	_check(sim.tick == end_tick and not sim.issue_command(_army(), "move", Vector2(45, 63)).ok, "Completed campaign freezes and rejects commands")
	sim.start_campaign(0)
	_check(_view().status == "playing" and _view().stage == 0 and _view().bonus_done == 0 and sim.tick == 0, "A replay clears progress from the prior attempt")
	var vale := _unit_named("captain_vale")
	enemy = _unit_named("checkpoint_1")
	sim._apply_damage_to_target(enemy, vale, vale.max_hp * 2.0, {}, 1.0)
	_advance(1)
	_check(_view().status == "defeat" and not _army().is_empty(), "Losing Captain Vale fails the assault even with surviving troops")

func _test_progress() -> void:
	var old_path := OS.get_environment("RTS_CAMPAIGN_PROGRESS_PATH")
	var fixture := "user://campaign-test-%d.cfg" % OS.get_process_id()
	OS.set_environment("RTS_CAMPAIGN_PROGRESS_PATH", fixture)
	var legacy := ConfigFile.new()
	legacy.set_value("ashfall_signal", "completed", 2)
	_check(legacy.save(fixture) == OK, "Legacy progress fixture saves")
	var completed := Campaign.completed_missions()
	_check(completed == [Campaign.MISSIONS[0].id, Campaign.MISSIONS[2].id], "An old defense win stays attached to Hold for Dawn")
	_check(Campaign.mission_available(Campaign.RECOVERY, completed), "The newly inserted mission is playable for a returning player")
	_check(Campaign.save_completion(Campaign.RECOVERY) == OK and Campaign.completed_missions().size() == 3, "Finishing the new mission persists all wins")
	DirAccess.remove_absolute(fixture)
	OS.set_environment("RTS_CAMPAIGN_PROGRESS_PATH", old_path)
