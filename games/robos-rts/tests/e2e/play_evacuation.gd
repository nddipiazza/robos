extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const Mission = preload("res://scripts/engine/RTSEvacuation.gd")
const Pilot = preload("res://tests/e2e/EvacuationPilot.gd")

func _initialize() -> void:
	call_deferred("_play")

func _play() -> void:
	var engine := root.get_node("SimEngine")
	var result: Dictionary = engine.start_campaign(Campaign.EVACUATION, "normal")
	if not result.ok:
		push_error("The Last Road failed to load")
		quit(1)
		return
	var campaign = engine.campaign
	var evacuation = campaign.evacuation
	var pilot := Pilot.new()
	var opening: Array = engine.units.values().filter(func(unit): return unit.owner == 1)
	var tags := opening.map(func(unit): return unit.tag)
	for index in range(1, Mission.INSERTION_ROAD.size()):
		engine.issue_command(tags, "attack_move", Mission.INSERTION_ROAD[index], 0, "", index > 1)
	var last_rescued := 0
	var last_convoy := 0
	var max_garrisons := {}
	var garrison_rosters := {}
	var attacks_by_convoy := {}
	var latest_total := 0
	var peak_supply := 0
	var peak_workers := 0
	var peak_escort := 0
	var peak_halls := 0
	for seconds in range(0, 2100, 2):
		if campaign.status != "playing":
			break
		if campaign.stage == 1 and seconds % 4 == 0:
			pilot.play(engine)
		engine.step_ticks(2 * engine.TICK_RATE)
		var worker_count := 0
		var escort_count := 0
		var hall_count := 0
		for unit in engine.units.values():
			if unit.owner != 1:
				continue
			if unit.is_worker:
				worker_count += 1
			elif unit.unit_type in Pilot.INFANTRY and not pilot._reserved(unit.tag):
				escort_count += 1
			elif unit.unit_type == "muster_hall" and unit.build_progress >= 1.0:
				hall_count += 1
		peak_supply = maxi(peak_supply, engine.players[1].supply_cap)
		peak_workers = maxi(peak_workers, worker_count)
		peak_escort = maxi(peak_escort, escort_count)
		peak_halls = maxi(peak_halls, hall_count)
		var started: int = evacuation.convoys_sent
		if started != last_convoy or last_rescued != evacuation.safe:
			print("t=%d convoy=%d rescued=%d lost=%d attacks=%d" % [
				seconds + 2, started, evacuation.safe, evacuation.lost, evacuation.attacks_sent])
			last_rescued = evacuation.safe
			last_convoy = started
		if latest_total != evacuation.attacks_sent:
			attacks_by_convoy[started] = int(attacks_by_convoy.get(started, 0)) + evacuation.attacks_sent - latest_total
			latest_total = evacuation.attacks_sent
		for id in Pilot.BUNKERS:
			var bunker: Dictionary = campaign._named(engine, id)
			var passengers: Array = bunker.get("passengers", [])
			if passengers.size() > int(max_garrisons.get(id, 0)):
				max_garrisons[id] = passengers.size()
				garrison_rosters[id] = passengers.map(func(unit): return unit.unit_type)
	var stats: Dictionary = engine.players[1]
	var passed: bool = (campaign.status == "victory" and evacuation.safe >= Mission.SAFE_QUOTA
		and attacks_by_convoy.get(2, 0) > 0 and max_garrisons.size() == Pilot.BUNKERS.size())
	print(JSON.stringify({
		"status": campaign.status, "colonists_rescued": evacuation.safe, "colonists_lost": evacuation.lost,
		"attacks_by_convoy": attacks_by_convoy, "largest_garrisons": max_garrisons,
		"garrison_rosters": garrison_rosters,
		"crystal_collected": stats.crystal_collected, "aether_collected": stats.aether_collected,
		"crystal_remaining": stats.crystal, "aether_remaining": stats.aether,
		"peak_supply_cap": peak_supply, "peak_workers": peak_workers,
		"peak_escort": peak_escort, "peak_muster_halls": peak_halls,
		"supply_cap": stats.supply_cap, "infantry_upgrades": stats.upgrades,
		"units_trained": stats.units_trained, "structures_built": stats.structures_built,
		"research_samples": evacuation.samples_collected.size(),
	}))
	quit(0 if passed else 1)
