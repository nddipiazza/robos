extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
var _sim: Node
var _failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	_sim = root.get_node("SimEngine")
	for index in range(Campaign.REDSTONE, Campaign.SANCTUARY + 1):
		var completed: Array[String] = [Campaign.MISSIONS[index - 1].id]
		_check(Campaign.mission_available(index, completed), "Mission %d unlocks in order" % (index + 1))
		_check(_sim.start_campaign(index).ok, "Mission %d loads" % (index + 1))
		var first_crystal: int = _sim.players[1].crystal
		_sim.step_ticks(30 * _sim.TICK_RATE)
		_check(_sim.players[1].crystal > first_crystal, "Mission %d opening miners deliver crystal" % (index + 1))
		for unit in _sim.units.values():
			if unit.owner == 1 and unit.is_structure:
				_check(not _sim.terrain_grid.overlaps(unit.pos, unit.radius, false, true),
					"Mission %d starting structure %s fits the terrain" % [index + 1, unit.id])
		match index:
			Campaign.REDSTONE: _redstone()
			Campaign.SHRINE: _shrine()
			Campaign.SANCTUARY: _sanctuary()
		_check(_sim.campaign.status == "victory", "Mission %d has a reachable victory trigger" % (index + 1))
	print("Frontier campaign: ", "passed" if _failures.is_empty() else _failures)
	quit(int(not _failures.is_empty()))

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)

func _redstone() -> void:
	var campaign = _sim.campaign
	var mission = campaign.frontier
	var low: Dictionary = _sim.spawn_unit("pioneer", 1, Vector2(98, 119))
	var hub: Dictionary = campaign._named(_sim, "map_312")
	var high_hp: float = hub.hp
	_sim.tick = mission._lava_at - 1
	_sim.step_ticks(1)
	_check(mission.lava_active and low.hp < low.max_hp and hub.hp == high_hp, "Lava damages exposed workers and spares high ground")
	var rescued: Dictionary = campaign._named(_sim, "map_1")
	_sim.spawn_unit("ridge_scout", 1, rescued.pos + Vector2(4.7, 0))
	_sim._rebuild_spatial_grid()
	campaign.step(_sim)
	_check(rescued.owner == 1, "Scouts rescue the missing miners' hub")
	var hall: Dictionary = campaign._named(_sim, "map_19")
	_check(_sim.issue_command([hall.tag], "train_ridge_scout").ok, "Muster Hall can train Ridge Scouts")
	_sim.players[1].crystal = 8000
	campaign.step(_sim)

func _shrine() -> void:
	var campaign = _sim.campaign
	var mission = campaign.frontier
	var hall: Dictionary = campaign._named(_sim, "map_100")
	_check(_sim.production_attachment(hall).get("unit_type") == "research_module", "Shrine starts with a functional Research Module")
	_check(_sim._has_clear_line_of_walk(Vector2(147, 122), Vector2(184, 122), 0.6),
		"The southern light bridge connects both banks")
	_sim.spawn_unit("rifleman", 1, mission._artifact)
	_sim._rebuild_spatial_grid()
	_sim.tick = ceili(float(_sim.tick) / 8.0) * 8
	campaign.step(_sim)
	_check(mission._guardians_awake and campaign._any_named_alive(_sim, mission.SHRINE_GUARDIANS), "Approaching the artifact wakes the shrine guardians")
	for id in mission.SHRINE_GUARDIANS:
		var guardian: Dictionary = campaign._named(_sim, id)
		if not guardian.is_empty():
			_sim._remove_destroyed_unit(guardian)
	campaign.step(_sim)

func _sanctuary() -> void:
	var campaign = _sim.campaign
	var mission = campaign.frontier
	var boss: Dictionary = campaign._named(_sim, "map_765")
	var hp: float = boss.hp
	_sim._apply_mutation_damage(boss, 100.0)
	_check(boss.hp == hp, "The Purifier is protected while shield links stand")
	for id in mission.SHIELD_LINKS:
		var link: Dictionary = campaign._named(_sim, id)
		_check(not link.is_empty(), "All three shield links are present")
		if not link.is_empty():
			_sim._remove_destroyed_unit(link)
	_sim.tick = ceili(float(_sim.tick) / 8.0) * 8
	campaign.step(_sim)
	_sim._apply_mutation_damage(boss, hp)
	campaign.step(_sim)
	_check(mission._purifier_exposed, "Destroying the links exposes the Purifier")
