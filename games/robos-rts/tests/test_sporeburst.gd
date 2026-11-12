extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_morph()
	_test_burst()
	_test_orders()
	_test_research_and_cargo()
	_check(root.get_node("RTSAudio").has_sfx("volatile_burst"), "Volatile Burst audio loads")
	_check(sim.load_scenario_file("riflemen-vs-sporebursts").ok, "The playable scenario loads by slug")
	sim.step_ticks(380)
	_check(sim.recent_events.any(func(event): return event.type == "sporeburst"), "The opposing AI sends its pack into combat")
	print("Sporeburst: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _reset() -> void:
	sim.reset_state(49, 100, 80)
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	sim.players[2].crystal = 500
	sim.players[2].aether = 500

func _test_morph() -> void:
	_reset()
	var ling: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(30, 30))
	var tag: int = ling.tag
	_check(not sim.issue_command([tag], "morph_sporeburst").ok, "A completed Nursery is required")
	sim.spawn_unit("spore_nursery", 2, Vector2(20, 20))
	var supply: int = sim.players[2].supply_used
	_check(sim.issue_command([tag], "morph_sporeburst").ok, "A Skitterling can start a paid evolution")
	_check(ling.unit_type == "sporeburst_cocoon" and ling.is_immobile, "Evolution creates an immobile cocoon in place")
	_check(sim.players[2].crystal == 475 and sim.players[2].aether == 475 and sim.players[2].supply_used == supply, "Morph costs 25/25 and inherits supply")
	_check(sim.issue_command([tag], "cancel_sporeburst_morph").ok and ling.unit_type == "skitterling", "Cancel restores the same Skitterling")
	_check(sim.players[2].crystal == 500 and sim.players[2].aether == 500, "Cancel refunds the paid cost")
	sim.issue_command([tag], "morph_sporeburst")
	sim.step_ticks(20 * sim.TICK_RATE - 1)
	_check(ling.unit_type == "sporeburst_cocoon", "Cocoon is still vulnerable just before 20 seconds")
	sim.step_ticks(1)
	_check(ling.unit_type == "sporeburst" and ling.hp == 30.0 and ling.tag == tag, "Cocoon hatches at 20 seconds with 30 HP")
	ling.hp = 27.0
	sim.step_ticks(64)
	_check(is_equal_approx(ling.hp, 27.2734), "A hatched Sporeburst regenerates health")
	var fragile: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(45, 40))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(48, 40))
	sim.issue_command([fragile.tag], "morph_sporeburst")
	sim._apply_damage_to_target(rifle, fragile, 100.0, {}, 1.0)
	_check(not sim.units.has(fragile.tag) and rifle.hp == rifle.max_hp, "Destroying an unfinished cocoon causes no splash")

func _test_burst() -> void:
	_reset()
	var origin := Vector2(40, 40)
	var burst: Dictionary = sim.spawn_unit("sporeburst", 2, origin)
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, origin + Vector2(0, 1.1))
	var edge: Dictionary = sim.spawn_unit("rifleman", 1, origin + Vector2(0, -2.15))
	var outside: Dictionary = sim.spawn_unit("rifleman", 1, origin + Vector2(0, -4.0))
	var breacher: Dictionary = sim.spawn_unit("breacher", 1, origin + Vector2(1.3, 0.0))
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 1, origin)
	var ally: Dictionary = sim.spawn_unit("skitterling", 2, origin - Vector2(1.3, 0.0))
	var depot: Dictionary = sim.spawn_unit("silo", 1, origin + Vector2(3.25, 0.0))
	depot.armor = 12.0
	rifle.hp = 35.0
	sim._rebuild_spatial_grid()
	_check(sim.issue_command([burst.tag], "detonate_sporeburst").ok, "Manual detonation accepts a surfaced unit")
	_check(not sim.units.has(burst.tag) and burst.kills == 1, "The burst records its kill and removes its source once")
	_check(edge.max_hp - edge.hp == 35.0 and outside.hp == outside.max_hp, "Light damage has no falloff and respects the radius")
	_check(breacher.max_hp - breacher.hp == 16.0 - breacher.armor, "Non-light targets take base damage")
	_check(depot.max_hp - depot.hp == 80.0, "Structure splash bypasses armor")
	_check(air.hp == air.max_hp and ally.hp == ally.max_hp, "The blast skips flyers and friendly units")

func _test_orders() -> void:
	_reset()
	var origin := Vector2(40, 40)
	var burst: Dictionary = sim.spawn_unit("sporeburst", 2, origin)
	var depot: Dictionary = sim.spawn_unit("silo", 1, origin + Vector2(2.1, 0))
	sim._rebuild_spatial_grid()
	_check(sim._find_best_attack_target(burst, false).is_empty(), "Automatic targeting initially skips structures")
	_check(sim.issue_command([burst.tag], "sporeburst_structures").ok and sim._find_best_attack_target(burst, false) == depot, "The structure toggle enables automatic acquisition")
	sim.issue_command([burst.tag], "sporeburst_structures")
	_check(sim.issue_command([burst.tag], "attack", depot.pos, depot.tag).ok, "Direct structure attack is valid with the toggle off")
	sim.step_ticks(22)
	_check(not sim.units.has(burst.tag) and depot.hp < depot.max_hp, "Contact detonates against an explicitly targeted structure")
	burst = sim.spawn_unit("sporeburst", 2, origin + Vector2(-3, 0))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, burst.pos + Vector2(-1.2, 0))
	sim._rebuild_spatial_grid()
	_check(not sim.issue_command([burst.tag], "burrow").ok, "Burrow requires research")
	sim.players[2].upgrades.spore_burrow = 1
	_check(sim.issue_command([burst.tag], "burrow").ok, "A researched Sporeburst can burrow")
	sim.step_ticks(2)
	_check(sim.units.has(burst.tag), "Burrowed Sporeburst waits even with a target nearby")
	_check(sim.issue_command([burst.tag], "detonate_sporeburst").ok and rifle.hp < rifle.max_hp, "Manual detonation works underground")
	burst = sim.spawn_unit("sporeburst", 2, origin + Vector2(-5, 0))
	rifle = sim.spawn_unit("rifleman", 1, burst.pos - Vector2(0, 1.4))
	sim._rebuild_spatial_grid()
	sim._apply_damage_to_target(rifle, burst, 100.0, {}, 1.0)
	_check(not sim.units.has(burst.tag) and rifle.hp < rifle.max_hp, "A lethal hit triggers the same ground burst")

func _test_research_and_cargo() -> void:
	_reset()
	var nursery: Dictionary = sim.spawn_unit("spore_nursery", 2, Vector2(20, 20))
	_check(not sim.issue_command([nursery.tag], "research_rolling_spores").ok, "Rolling Spores requires the Blight Spire")
	sim.spawn_unit("blight_spire", 2, Vector2(20, 27))
	var carrier: Dictionary = sim.spawn_unit("drift_sac", 2, Vector2(40, 40))
	for i in range(5):
		sim.spawn_unit("sporeburst", 2, Vector2(38 + i, 42))
	_check(sim.issue_command([carrier.tag], "load_transport").ok, "A Drift Sac boards Sporebursts")
	_check(carrier.passengers.size() == 4 and sim.transport_slots_used(carrier) == 8, "Four Sporebursts occupy all eight cargo slots")
	_check(sim.issue_command([nursery.tag], "research_rolling_spores").ok, "Rolling Spores can be researched after the Spire")
	nursery.production_queue[0].progress = nursery.production_queue[0].total_time
	sim.step_ticks(1)
	var passenger: Dictionary = carrier.passengers[0]
	_check(passenger.max_hp == 35.0 and passenger.speed > 7.0, "Rolling research upgrades embarked units")
	_check(sim.issue_command([carrier.tag], "unload_transport", Vector2(41, 40)).ok, "The Drift Sac can unload its pack")
	sim.step_ticks(64)
	_check(carrier.passengers.is_empty() and sim.units.has(passenger.tag), "Unloading returns the same ground units")

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
