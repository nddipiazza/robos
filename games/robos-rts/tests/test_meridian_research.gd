extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	sim.load_scenario_dict({
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 230, "height": 180},
		"players": {"1": {"faction": "humans", "crystal": 2500, "aether": 2500}, "2": {"faction": "aliens"}},
	})
	sim.spawn_unit("colony_hub", 1, Vector2(18, 17))
	sim.spawn_unit("heartstone", 2, Vector2(207, 155))
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(26, 40))
	var engineering: Dictionary = sim.spawn_unit("field_armory", 1, Vector2(35, 18))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(42, 36))
	var breacher: Dictionary = sim.spawn_unit("breacher", 1, Vector2(45, 40))
	var tank: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(38, 54))
	var fighter: Dictionary = sim.spawn_unit("kestrel_interceptor", 1, Vector2(47, 54))
	sim._refresh_vision()
	_check(not sim.issue_command([rifle.tag], "surge").ok, "Surge begins locked")
	_check(not sim.issue_command([hall.tag], "research_stim_injectors").ok, "Infantry tech requires a module")
	_check(sim.issue_command([hall.tag], "attach_research_module").ok, "Muster Hall starts a Research Module")
	_step(25.0)
	_check(sim.issue_command([hall.tag], "research_stim_injectors").ok and sim.issue_command([hall.tag], "research_combat_shields").ok
		and sim.issue_command([hall.tag], "research_concussive_shells").ok, "Infantry tech can queue")
	_check(sim.issue_command([engineering.tag], "research_infantry_weapons").ok and sim.issue_command([engineering.tag], "research_infantry_armor").ok,
		"Field Armory can queue both infantry upgrades")
	_step(Rules.MERIDIAN_GROUP_TIMES[0])
	_check(sim.unit_upgrade_level(rifle, "weapons") == 1 and sim.unit_upgrade_level(rifle, "armor") == 0,
		"The second infantry upgrade waits for the first")
	_check(sim.unit_upgrade_level(tank, "weapons") == 0 and sim.unit_upgrade_level(fighter, "weapons") == 0,
		"Infantry weapons exclude vehicles and aircraft")
	_check(not sim.issue_command([engineering.tag], "research_infantry_weapons").ok, "Second infantry tier requires Vehicle Armory")
	_check(sim.issue_command([rifle.tag, breacher.tag], "surge").ok and rifle.hp == 35.0 and breacher.hp == 105.0,
		"Researched Surge costs Riflemen 10 HP and Breachers 20 HP")
	_check(not sim.issue_command([rifle.tag], "surge").ok, "Surge protects against accidental rapid recasts")
	_step(Rules.MERIDIAN_GROUP_TIMES[0])
	_check(sim.unit_upgrade_level(rifle, "armor") == 1 and rifle.hp == 45.0 and rifle.max_hp == 55.0,
		"Armor completes and Combat Shields adds current and maximum HP")
	_check(sim.spawn_unit("rifleman", 1, Vector2(40, 45)).hp == 55.0, "New Riflemen receive Combat Shields")
	_check_concussive(breacher)
	var armory: Dictionary = sim.spawn_unit("vehicle_armory", 1, Vector2(48, 24))
	_check(sim.issue_command([engineering.tag], "research_infantry_weapons").ok and engineering.production_queue[0].crystal_cost == 150,
		"Vehicle Armory opens level two at 150/150")
	_check(sim.issue_command([armory.tag], "research_vehicle_weapons").ok and sim.issue_command([armory.tag], "research_ship_weapons").ok
		and sim.issue_command([armory.tag], "research_vehicle_plating").ok, "Vehicle Armory queues three independent tracks")
	_step(Rules.MERIDIAN_GROUP_TIMES[0])
	_check(sim.unit_upgrade_level(tank, "weapons") == 1 and sim.unit_upgrade_level(fighter, "weapons") == 0,
		"Vehicle weapons complete without modifying aircraft")
	_step(Rules.MERIDIAN_GROUP_TIMES[0])
	_check(sim.unit_upgrade_level(fighter, "weapons") == 1 and sim.unit_upgrade_level(tank, "armor") == 0,
		"Ship weapons complete separately from shared plating")
	_step(Rules.MERIDIAN_GROUP_TIMES[0])
	_check(sim.unit_upgrade_level(tank, "armor") == 1 and sim.unit_upgrade_level(fighter, "armor") == 1
		and sim.unit_upgrade_level(rifle, "armor") == 1, "Shared plating reaches vehicles and aircraft")
	_check_defenses()
	_check_bunker_destruction()
	print("Meridian research: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _check_concussive(breacher: Dictionary) -> void:
	var light: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(61, 40))
	var massive: Dictionary = sim.spawn_unit("carapace_bulwark", 2, Vector2(60, 45))
	sim._refresh_vision()
	_check(sim._execute_weapon_hit(breacher, light) and is_equal_approx(light.slow_timer, Rules.CONCUSSIVE_SECONDS)
		and sim._execute_weapon_hit(breacher, massive) and massive.slow_timer == 0.0,
		"Concussive Shells slow ordinary ground units and skip Massive targets")
	sim._remove_destroyed_unit(light)
	sim._remove_destroyed_unit(massive)

func _check_defenses() -> void:
	var bunker: Dictionary = sim.spawn_unit("field_bunker", 1, Vector2(110, 87))
	var breacher: Dictionary = sim.spawn_unit("breacher", 1, Vector2(106, 83))
	var rifles: Array[int] = []
	for index in range(3):
		rifles.append(sim.spawn_unit("rifleman", 1, Vector2(104 + index * 3, 91)).tag)
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim.issue_command([breacher.tag], "enter_bunker", bunker.pos, bunker.tag).ok, "Breacher can board the bunker")
	_step(2.0)
	for tag in rifles:
		sim.issue_command([tag], "enter_bunker", bunker.pos, bunker.tag)
		_step(1.0)
	_check(bunker.passengers.size() == 3 and sim.transport_slots_used(bunker) == 4, "One Breacher and two Riflemen fill four slots")
	_check(sim.weapon_range_against(bunker) == 17.5, "The longest passenger weapon gains one reference unit of reach")
	var turret: Dictionary = sim.spawn_unit("sentry_turret", 1, Vector2(140, 100))
	var ground: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(153, 100))
	var air: Dictionary = sim.spawn_unit("dawn_interceptor", 2, Vector2(156, 100))
	_check(not sim.can_attack(turret, ground) and sim.can_attack(turret, air), "Ladder Sentry Turrets are air-only")
	turret.hp = 50.0
	_step(1.0)
	_check(is_equal_approx(turret.hp, 50.0 - Rules.TERRAN_BURN_DPS), "Critical structures lose 1.52 HP per second")
	_check(sim.issue_command([bunker.tag], "salvage").ok, "Ladder bunker can salvage")
	var balance: int = sim.players[1].crystal
	sim.step_ticks(sim.salvage_duration_ticks())
	_check(not sim.units.has(bunker.tag) and sim.units.has(breacher.tag) and sim.players[1].crystal == balance + 75,
		"Salvage ejects the garrison and returns 75 crystal")

func _check_bunker_destruction() -> void:
	var bunker: Dictionary = sim.spawn_unit("field_bunker", 1, Vector2(71, 144))
	var soldier: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(76, 144))
	var attacker: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(80, 144))
	sim.issue_command([attacker.tag], "hold_fire")
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim.issue_command([soldier.tag], "enter_bunker", bunker.pos, bunker.tag).ok, "Rifleman boards a second bunker")
	_step(1.0)
	var supply: float = sim.players[1].supply_used
	var losses: int = sim.players[1].units_lost
	var kills: int = sim.players[2].units_killed
	_check(not sim.units.has(soldier.tag) and bunker.passengers.size() == 1, "The rifle is protected inside the bunker")
	sim._apply_damage_to_target(attacker, bunker, 500.0, {}, 1.0)
	_check(not sim.units.has(bunker.tag) and sim.units.has(soldier.tag) and soldier.hp == soldier.max_hp,
		"Bunker destruction ejects the occupant alive")
	_check(sim.players[1].supply_used == supply and sim.players[1].units_lost == losses + 1
		and sim.players[2].units_killed == kills + 1, "Destruction scores the bunker and keeps the surviving passenger's supply")

func _step(seconds: float) -> void:
	sim.step_ticks(ceili(seconds * sim.TICK_RATE))

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
