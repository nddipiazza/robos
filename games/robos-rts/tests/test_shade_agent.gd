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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 220, "height": 155},
		"players": {"1": {"faction": "humans", "crystal": 1100, "aether": 1100}, "2": {"faction": "aliens"}},
	})
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(29, 40))
	var academy: Dictionary = sim.spawn_unit("specter_academy", 1, Vector2(30, 62))
	var home: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(21, 29))
	sim._refresh_vision()
	_check(not sim.issue_command([hall.tag], "train_shade_agent").ok, "The operative requires a completed Research Module")
	_check(sim.issue_command([hall.tag], "attach_research_module").ok and sim.players[1].aether == 1075,
		"The ladder Research Module costs 50/25")
	sim.step_ticks(ceili(25.0 / 1.4 * sim.TICK_RATE))
	_check(sim.issue_command([hall.tag], "train_shade_agent").ok, "An attached Research Module and Academy unlock training")
	_check(sim.issue_command([academy.tag], "research_agent_cloak").ok
		and sim.issue_command([academy.tag], "train_tactical_charge").ok
		and not sim.issue_command([academy.tag], "train_tactical_charge").ok, "The Academy queues cloak research and one charge")
	sim.step_ticks(ceili(Rules.PERSONAL_CLOAK_RESEARCH.time * sim.TICK_RATE) + ceili(60.0 / 1.4 * sim.TICK_RATE))
	var trained: Array = sim.units.values().filter(func(unit): return unit.unit_type == "shade_agent")
	_check(trained.size() == 1 and trained[0].hp == 125.0 and academy.get("tactical_charge_ready", false), "The Shade Agent and charge complete")
	_test_spells(academy, home)
	print("Shade Agent: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_spells(academy: Dictionary, home: Dictionary) -> void:
	var agent: Dictionary = sim.spawn_unit("shade_agent", 1, Vector2(100, 71))
	var hostile: Dictionary = sim.spawn_unit("mireweaver", 2, Vector2(116, 71))
	var warden: Dictionary = sim.spawn_unit("aegis_warden", 2, Vector2(118, 78))
	var hidden: Dictionary = sim.spawn_unit("duskblade", 2, Vector2(120, 78))
	var wall: Dictionary = sim.spawn_unit("phase_barrier", 2, Vector2(118, 82))
	sim.issue_command([agent.tag, warden.tag, hidden.tag], "hold_fire")
	sim._refresh_vision()
	_check(sim.issue_command([agent.tag], "agent_cloak").ok and agent.energy == 50.0 and not sim.can_see_unit(2, agent),
		"Researched Personal Cloak spends 25 energy and hides the agent")
	_check(sim.issue_command([agent.tag], "agent_snipe", hostile.pos, hostile.tag).ok and agent.energy == 0.0,
		"Steady Targeting spends 50 energy and starts a channel")
	sim._apply_damage_to_target(hostile, agent, 1.0, {}, 1.0, true)
	_check(not agent.has("agent_snipe") and hostile.hp == hostile.max_hp, "Damage cancels the shot without a refund")
	agent.energy = 200.0
	_check(sim.issue_command([agent.tag], "agent_snipe", hostile.pos, hostile.tag).ok, "A fresh channel can start")
	sim.step_ticks(ceili(Rules.AGENT_SNIPE_SECONDS * sim.TICK_RATE))
	_check(not sim.units.has(hostile.tag), "The completed shot kills a Psionic biological target")
	agent.energy = 125.0
	warden.energy = 150.0
	var emp_site := Vector2(118, 78)
	_check(not sim.can_see_unit(1, hidden) and sim.issue_command([agent.tag], "agent_emp", emp_site).ok,
		"EMP can target a visible point while its cloaked occupant is hidden")
	sim.step_ticks(ceili(agent.pos.distance_to(emp_site) * sim.TICK_RATE / Rules.AGENT_EMP_PROJECTILE_SPEED))
	_check(warden.shields == 0.0 and warden.energy < 51.0 and sim.can_see_unit(1, hidden) and not sim.units.has(wall.tag),
		"EMP drains shields and energy, reveals cloak and breaks a barrier")
	var point := Vector2(125, 65)
	var target: Dictionary = sim.spawn_unit("muster_hall", 2, point)
	var friendly: Dictionary = sim.spawn_unit("rifleman", 1, point + Vector2(0, -7))
	sim.issue_command([friendly.tag], "hold_fire")
	sim._refresh_vision()
	_check(sim.issue_command([agent.tag], "agent_strike", point).ok and not academy.get("tactical_charge_ready", false),
		"Tactical Strike consumes the armed charge")
	sim.step_ticks(Rules.AGENT_STRIKE_SECONDS * sim.TICK_RATE - 1)
	_check(target.hp == target.max_hp and sim.units.has(friendly.tag), "The warning appears before damage")
	sim.step_ticks(1)
	_check(target.hp == target.max_hp - 500.0 and not sim.units.has(friendly.tag), "The impact damages structures and includes friendly fire")
	_check(home.hp == home.max_hp, "The strike leaves units outside its radius untouched")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
