extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const Mutators = preload("res://scripts/engine/RTSCampaignMutators.gd")

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	sim = root.get_node("SimEngine")
	_test_combat()
	_test_death_effects()
	_test_scheduled_hazards()
	_test_mineral_shield()
	_test_combined_mission()
	for message in failures:
		push_error(message)
	print("Campaign mutators: %s" % ("passed" if failures.is_empty() else "failed"))
	quit(0 if failures.is_empty() else 1)

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _start(ids: Array) -> void:
	_check(sim.start_campaign(Campaign.RECOVERY, "normal", ids).ok, "Campaign launches with selected mutators")
	sim.paused = true

func _test_combat() -> void:
	_start([])
	var ordinary: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(50, 100))
	var speed: float = sim.effective_move_speed(ordinary)
	var reach: float = sim.weapon_range_against(ordinary)
	var sight: float = ordinary.sight_range
	_start(["barrier", "speed_freaks", "long_range", "concussive_attacks", "just_die", "life_leech", "shortsighted", "barrier"])
	_check(sim.campaign.selected_mutators().size() == 7, "Duplicate mutators are normalized")
	var player: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(48, 100))
	var enemy: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(50, 100))
	_check(player.sight_range < sight and enemy.sight_range == sight, "Shortsighted affects the player's new units")
	_check(is_equal_approx(sim.effective_move_speed(enemy), speed * 1.5), "Speed Freaks accelerates the enemy")
	_check(is_equal_approx(sim.weapon_range_against(enemy), reach + 4.0), "Long Range extends enemy rifles")
	sim._apply_damage_to_target(player, enemy, 10.0, {}, 1.0, true)
	_check(enemy.hp == enemy.max_hp - 10.0 and enemy.mutation_barrier_hp == 100.0, "Barrier activates on the first hit")
	sim._apply_damage_to_target(player, enemy, 25.0, {}, 1.0, true)
	_check(enemy.hp == enemy.max_hp - 10.0 and enemy.mutation_barrier_hp == 75.0, "Barrier absorbs following hits")
	sim._apply_damage_to_target(enemy, player, 12.0, {}, 1.0, true)
	_check(player.slow_timer == 2.0 and enemy.hp == enemy.max_hp - 4.0, "Enemy fire slows the player and heals the attacker")
	sim._apply_damage_to_target(player, enemy, 400.0, {}, 1.0, true)
	_check(enemy.hp == enemy.max_hp and sim.units.has(enemy.tag), "Just Die revives the same unit once")
	sim._apply_damage_to_target(player, enemy, 400.0, {}, 1.0, true)
	_check(not sim.units.has(enemy.tag), "A second lethal hit defeats a revived unit")
	var before = sim.campaign
	_check(not sim.start_campaign(Campaign.ASSAULT, "normal", ["polarity"]).ok and sim.campaign == before, "Unavailable choices are rejected before replacing a mission")
	_start([])
	_check(sim.campaign.mutators == null, "A regular mission clears all previous mutation state")

func _test_death_effects() -> void:
	_start(["black_death", "walking_infested", "self_destruction", "scorched_earth"])
	var mut: Mutators = sim.campaign.mutators
	var player: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(46, 110))
	var ally: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(49, 110))
	var enemy: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(44, 110))
	while enemy.tag % 3 != 0:
		enemy = sim.spawn_unit("rifleman", 2, Vector2(25, 100))
	enemy.pos = Vector2(44, 110)
	sim._rebuild_spatial_grid()
	sim._apply_damage_to_target(player, enemy, 300.0, {}, 1.0, true)
	mut.step(sim)
	_check(player.get("mutation_plagued", false) and ally.get("mutation_plagued", false), "Black Death spreads to nearby friendly units")
	_check(sim.units.values().any(func(unit): return unit.get("mutation_spawn", false)), "Walking Infested spawns a Broodling")
	_check(mut.zones.size() == 2, "Self Destruction and Scorched Earth leave distinct zones")
	ally.pos = Vector2(53, 110)
	sim._rebuild_spatial_grid()
	var ally_hp: float = ally.hp
	sim.tick = sim.TICK_RATE
	mut.step(sim)
	_check(is_equal_approx(ally.hp, ally_hp - ally.max_hp * 0.02), "Plague deals damage each second outside the fire")
	_check(player.hp < player.max_hp - 6.0, "Ground fire deals damage in its marked area")
	sim.tick = sim.TICK_RATE * 2
	mut.step(sim)
	_check(mut.zones.size() == 1 and not sim.units.has(player.tag), "The delayed death blast resolves and can kill a unit")

func _test_scheduled_hazards() -> void:
	_start(["time_warp", "going_nuclear"])
	var mut: Mutators = sim.campaign.mutators
	var player: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(45, 105))
	var base_speed: float = sim.effective_move_speed(player)
	mut._add_zone(sim, "time_warp", player.pos)
	mut._add_zone(sim, "going_nuclear", player.pos)
	sim._rebuild_spatial_grid()
	sim.tick = sim.TICK_RATE * 2
	mut.step(sim)
	_check(is_equal_approx(sim.effective_move_speed(player), base_speed * 0.6), "Time Warp slows movement after arming")
	_check(is_equal_approx(sim._attack_speed_multiplier(player), 0.6), "Time Warp also slows attacks")
	_check(player.hp == player.max_hp, "A nuke does not damage units during its warning")
	sim.tick = sim.TICK_RATE * 5
	mut.step(sim)
	_check(not sim.units.has(player.tag) and mut.zones.size() == 1, "A warned strike lands at its deadline")
	_start(["time_warp"])
	sim.tick = sim.TICK_RATE * 25
	sim.campaign.mutators.step(sim)
	_check(sim.campaign.mutators.zones.size() == 1, "Campaign time schedules a distortion field")

func _test_mineral_shield() -> void:
	_start(["mineral_shields"])
	var mut: Mutators = sim.campaign.mutators
	sim.tick = sim.TICK_RATE * 18
	mut.step(sim)
	_check(not mut._shielded_deposits.is_empty(), "Mineral Shields target visible mineral fields")
	if mut._shielded_deposits.is_empty():
		return
	var deposit_tag: int = mut._shielded_deposits.keys()[0]
	var deposit: Dictionary = sim.resources[deposit_tag]
	var shield: Dictionary = sim.units[mut._shielded_deposits[deposit_tag]]
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, deposit.pos + Vector2(2.1, 0))
	var order := {"type": "harvest", "target_tag": deposit_tag, "target_pos": deposit.pos}
	sim._process_worker_harvest_order(worker, order, 2.0)
	_check(worker.cargo_amount == 0 and worker.harvest_timer == 0.0, "A worker cannot mine through a shield")
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, worker.pos + Vector2(1, 0))
	_check(sim.can_attack(rifle, shield), "The shield is a valid direct attack target")
	sim._apply_damage_to_target(rifle, shield, 120.0, {}, 1.0, true)
	sim._process_worker_harvest_order(worker, order, 2.0)
	_check(worker.cargo_amount > 0 and not mut.mineral_shield_blocks(sim, deposit_tag), "Destroying the shield immediately restores mining")

func _test_combined_mission() -> void:
	_check(sim.start_campaign(Campaign.DEFENSE, "normal", Mutators.ACTIVE.keys()).ok, "Hold for Dawn accepts every available mutator")
	sim.step_ticks(26 * sim.TICK_RATE)
	var mut: Mutators = sim.campaign.mutators
	_check(sim.campaign.status == "playing", "The combined mutators preserve the defense objective")
	_check(not mut._shielded_deposits.is_empty(), "Mineral Shields run on the live mission clock")
	_check(mut.zones.any(func(zone): return zone.kind == "time_warp"), "Time Warp runs alongside the other modifiers")
