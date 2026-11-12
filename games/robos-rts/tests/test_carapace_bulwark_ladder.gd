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
	sim.start_online_match("frontier-hunters", 3, ["monsters", "humans"], true)
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	var nest: Dictionary = sim.units.values().filter(func(unit): return unit.unit_type == "brood_nest").front()
	var bank: Dictionary = sim.players[1]
	bank.crystal = 900
	bank.aether = 900
	sim.spawn_unit("drift_sac", 1, nest.pos + Vector2(-7, 4))
	_check(not sim.issue_command([nest.tag], "train_carapace_bulwark").ok, "The Bulwark requires a Cavern")
	var cavern: Dictionary = sim.spawn_unit("carapace_cavern", 1, nest.pos + Vector2(-12, 11))
	var supply: float = bank.supply_used
	var larva: Dictionary = sim.units[nest.brood_larvae.front()]
	_check(sim.issue_command([larva.tag], "train_carapace_bulwark").ok and larva.unit_type == "brood_egg"
		and bank.crystal == 625 and bank.aether == 700 and bank.supply_used == supply + 6,
		"Larva production costs 275/200 and reserves six supply")
	var ticks: int = 55 * sim.TICK_RATE
	sim.step_ticks(ticks - 1)
	_check(sim.units.has(larva.tag) and larva.unit_type == "brood_egg", "The egg waits for the full hatch time")
	sim.step_ticks(1)
	var bulwarks: Array = sim.units.values().filter(func(unit): return unit.unit_type == "carapace_bulwark")
	_check(bulwarks.size() == 1 and bulwarks[0].hp == 500.0 and bulwarks[0].attributes.has("Massive"),
		"The Bulwark hatches at 500 HP with the Massive attribute")
	_check(sim.issue_command([cavern.tag], "research_chitinous_plating").ok
		and sim.issue_command([cavern.tag], "research_anabolic_synthesis").ok, "The Cavern queues its two upgrades")
	sim.step_ticks(ceili(Rules.CHITINOUS_PLATING_RESEARCH.time * sim.TICK_RATE) +		+ ceili(Rules.ANABOLIC_SYNTHESIS_RESEARCH.time * sim.TICK_RATE))
	if not bulwarks.is_empty():
		_test_combat(bulwarks[0])
	print("Ladder Carapace Bulwark: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_combat(bulwark: Dictionary) -> void:
	bulwark.pos = Vector2(120, 120)
	_check(is_equal_approx(sim.effective_move_speed(bulwark), Rules.BULWARK_UPGRADED_SPEED)
		and sim.unit_upgrade_level(bulwark, "armor") == 2, "The upgrades grant speed and two additional armor")
	var first: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(123, 120))
	var flank: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(123, 124))
	var behind: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(119, 120))
	var friendly: Dictionary = sim.spawn_unit("skitterling", 1, Vector2(125, 120))
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, Vector2(123, 120))
	var breacher: Dictionary = sim.spawn_unit("breacher", 2, Vector2(132, 120))
	sim._rebuild_spatial_grid()
	_check(sim._execute_weapon_hit(bulwark, first) and first.hp == first.max_hp - 35.0
		and is_equal_approx(flank.hp, flank.max_hp - 35.0 * 0.33), "The strike deals full damage and a fractional frontal cleave")
	_check(behind.hp == behind.max_hp and air.hp == air.max_hp and friendly.hp == friendly.max_hp,
		"The cleave skips the rear arc, air, and allies")
	_check(sim._execute_weapon_hit(breacher, bulwark) and bulwark.hp < 500.0 and bulwark.slow_timer == 0.0,
		"Frenzied blocks Concussive Shells slow while the damage still applies")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
