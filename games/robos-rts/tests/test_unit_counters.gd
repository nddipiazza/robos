extends SceneTree

var sim: Node
var ai: Node
var data: Node
var failures: Array[String] = []
var hit_counts: Dictionary = {}
var max_damage: Dictionary = {}
var damage_so_far: Dictionary = {}

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	ai = root.get_node("RTSCommanderAI")
	data = root.get_node("RTSData")
	sim.weapon_attack.connect(_record_hit)
	_test_ground_counters()
	_test_air_counter()
	_test_artillery_position()
	_test_upgrade_tiers()
	_test_impact_counts()
	print("Unit counter and upgrade checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _record_hit(attacker: Dictionary, target: Dictionary, _weapon: Dictionary, _shields: bool) -> void:
	var pair := "%s->%s" % [attacker.unit_type, target.unit_type]
	var damage: float = attacker.damage_dealt - float(damage_so_far.get(attacker.tag, 0.0))
	damage_so_far[attacker.tag] = attacker.damage_dealt
	hit_counts[pair] = int(hit_counts.get(pair, 0)) + 1
	max_damage[pair] = maxf(damage, float(max_damage.get(pair, 0.0)))

func _clear_hits() -> void:
	hit_counts.clear()
	max_damage.clear()
	damage_so_far.clear()

func _budget(types: Array) -> Vector2i:
	var total := Vector2i.ZERO
	for type in types:
		var definition: Dictionary = data.get_unit_def(type)
		total += Vector2i(definition.crystal_cost, definition.aether_cost)
	return total

func _formation(types: Array, owner: int, front: Vector2, facing: float) -> Array[int]:
	var tags: Array[int] = []
	var columns := mini(types.size(), 4)
	for i in range(types.size()):
		var row := floorf(float(i) / columns)
		var offset := Vector2(-facing * row * 2.9, (float(i % columns) - float(columns - 1) * 0.5) * 2.6)
		tags.append(sim.spawn_unit(types[i], owner, front + offset).tag)
	return tags

func _encounter(label: String, first: Array, second: Array, gap: float, kite: bool = false) -> Vector2i:
	_clear_hits()
	sim.reset_state(42, 128, 80)
	ai.configure_from_scenario([])
	ai.set_directive(1, "stutter_step_kite", kite)
	var budget := _budget(first)
	_check(budget == _budget(second), label + " uses equal crystal and aether")
	var west := Vector2(50.0 - gap * 0.5, 40)
	var east := Vector2(50.0 + gap * 0.5, 40)
	var defenders := _formation(first, 1, west, 1.0)
	var attackers := _formation(second, 2, east, -1.0)
	sim.issue_command(defenders, "hold_position")
	sim.issue_command(attackers, "attack_move", west)
	var survivors := Vector2i(defenders.size(), attackers.size())
	for _second in range(36):
		sim.step_ticks(64)
		survivors.x = defenders.filter(func(tag): return sim.units.has(tag)).size()
		survivors.y = attackers.filter(func(tag): return sim.units.has(tag)).size()
		if survivors.x == 0 or survivors.y == 0:
			break
	print("%s with %d crystal/%d aether per side: %d vs %d survivors" % [label, budget.x, budget.y, survivors.x, survivors.y])
	return survivors

func _test_ground_counters() -> void:
	var rifles := ["rifleman", "rifleman", "rifleman", "rifleman"]
	var swarm: Array = []
	swarm.resize(8)
	swarm.fill("skitterling")
	var kiting := _encounter("Riflemen kiting a swarm", rifles, swarm, 20.0, true)
	_check(kiting.x > 0 and kiting.y == 0 and sim.players[1].stutter_step_cancels > 0, "Riflemen trade movement and cooldowns to beat equal-cost melee")
	var stationary := _encounter("Riflemen holding against the same swarm", rifles, swarm, 20.0)
	_check(stationary.x == 0 and stationary.y > 0, "The melee surround reverses the result against stationary ranged troops")
	var armor := _encounter("Breachers against armored Crawlers and a melee screen",
		["breacher", "breacher"], ["bile_crawler", "bile_crawler", "skitterling", "skitterling"], 20.0, true)
	_check(armor.x > 0 and armor.y == 0, "Breachers can defeat an equal-budget armored force with a screen")
	_check(float(max_damage.get("breacher->bile_crawler", 0.0)) > float(max_damage.get("breacher->skitterling", 0.0))
		and hit_counts.has("breacher->skitterling"), "The anti-armor bonus produces more damage per hit despite the Crawler's armor")

func _test_air_counter() -> void:
	var ground := ["bile_crawler", "bile_crawler", "bile_crawler", "bile_crawler"]
	var mixed: Array = []
	mixed.resize(8)
	mixed.fill("skitterling")
	mixed[0] = "kestrel_interceptor"
	var survivors := _encounter("Anti-air Crawlers against an interceptor and its screen", ground, mixed, 20.0)
	_check(survivors.x > 0 and survivors.y == 0 and hit_counts.has("bile_crawler->kestrel_interceptor"),
		"Ground anti-air kills the equal-budget attack's flyer and its screen")
	_check(not hit_counts.has("kestrel_interceptor->bile_crawler"), "An air-superiority interceptor cannot fire on the ground")

func _test_artillery_position() -> void:
	var deployed := ["howitzer_emplaced"]
	var mobile := ["howitzer"]
	var far := _encounter("Artillery with an open approach", deployed, mobile, 30.0)
	_check(far == Vector2i(1, 0) and hit_counts.has("howitzer->howitzer_emplaced"), "Emplaced range wins even after the attacker closes and returns fire")
	var close := _encounter("Artillery caught inside minimum range", deployed, mobile, 6.0)
	_check(close == Vector2i(0, 1) and not hit_counts.has("howitzer_emplaced->howitzer"),
		"The same budgets and orders reverse when the attacker starts inside the dead zone")

func _test_upgrade_tiers() -> void:
	_clear_hits()
	ai.configure_from_scenario([])
	sim.load_scenario_dict({
		"paused": true, "map": {"width": 112, "height": 128},
		"players": {"1": {"crystal": 1500, "aether": 1500}},
	})
	var workshop: Dictionary = sim.spawn_unit("workshop", 1, Vector2(18, 62))
	var player: Dictionary = sim.players[1]
	for level in range(4):
		if level > 0:
			var duration := 0.0
			var cost := Vector2i.ZERO
			var stock := Vector2i(player.crystal, player.aether)
			for upgrade in ["weapons", "armor"]:
				var offer: Dictionary = sim.research_offer(1, upgrade)
				duration += float(offer.time) * sim.build_time_scale()
				cost += Vector2i(offer.crystal, offer.aether)
				_check(sim.issue_command([workshop.tag], "research_" + upgrade).ok, "Pay for level %d %s" % [level, upgrade])
			_check(Vector2i(player.crystal, player.aether) == stock - cost, "Weapon and armor tiers charge their listed costs")
			sim.step_ticks(ceili(duration / sim.TICK_DT))
			_check(player.upgrades.weapons == level and player.upgrades.armor == level, "The paid weapon and armor tiers complete")
		var lane := 14 + level * 30
		var first: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(58, lane))
		var second: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(68, lane))
		sim.issue_command([first.tag, second.tag], "hold_position")
		sim.step_ticks(32)
		_check(first.max_hp - first.hp == 6.0 - level and second.max_hp - second.hp == 6.0 + level,
			"Equal-cost Riflemen deal and absorb one point per researched tier (level %d)" % level)
		sim.issue_command([first.tag, second.tag], "hold_fire")

func _test_impact_counts() -> void:
	for type in ["sunblade", "spire_walker"]:
		_clear_hits()
		sim.reset_state(42, 96, 64)
		var attacker: Dictionary = sim.spawn_unit(type, 1, Vector2(32, 32))
		var target: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(35.5 if type == "sunblade" else 44, 32))
		var weapon: Dictionary = data.get_unit_def(type).weapon
		sim.issue_command([target.tag], "hold_fire")
		sim.issue_command([attacker.tag], "attack_target", target.pos, target.tag)
		sim.step_ticks(32)
		var impacts := int(hit_counts.get(type + "->rifleman", 0))
		_check(impacts > 0 and impacts == int(weapon.attacks) and target.max_hp - target.hp == float(weapon.damage) + float(weapon.bonus.get("Light", 0)),
			"The %s card describes the real impact count and damage" % type)
