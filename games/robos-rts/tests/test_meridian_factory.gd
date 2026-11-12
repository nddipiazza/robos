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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true, "map": {"width": 260, "height": 200},
		"players": {"1": {"faction": "humans", "crystal": 2400, "aether": 2400}, "2": {"faction": "aliens"}},
	})
	sim.spawn_unit("colony_hub", 1, Vector2(20, 23))
	sim.spawn_unit("heartstone", 2, Vector2(240, 180))
	var workshop: Dictionary = sim.spawn_unit("workshop", 1, Vector2(33, 44))
	var runner: Dictionary = sim.spawn_unit("cinder_runner", 1, Vector2(45, 24))
	sim._refresh_vision()
	_check(not sim.issue_command([runner.tag], "cinder_guard_mode").ok, "Guard mode requires the Armory")
	_check(not sim.issue_command([workshop.tag], "train_vortex_rover").ok, "Vortex production requires a Research Module")
	var attachment_reason: String = sim.attachment_block_reason(workshop, "research_module")
	_check(sim.issue_command([workshop.tag], "attach_research_module").ok, "Workshop constructs a Research Module (%s)" % attachment_reason)
	_step(25.0)
	_check(sim.issue_command([workshop.tag], "train_vortex_rover").ok, "Attached Workshop can train a Vortex Rover")
	_check(not sim.issue_command([workshop.tag], "train_atlas_walker").ok, "Atlas also requires the Armory")
	sim.spawn_unit("vehicle_armory", 1, Vector2(24, 58))
	_check(sim.issue_command([workshop.tag], "train_atlas_walker").ok, "Armory unlocks the Atlas Walker")
	var module: Dictionary = sim.production_attachment(workshop)
	if module.is_empty():
		failures.append("The Research Module completes")
		print("Meridian factory: ", failures)
		quit(1)
		return
	_check(sim.issue_command([module.tag], "research_infernal_catalyst").ok and module.production_queue.size() == 1
		and workshop.production_queue.size() == 2, "The Module queues Infernal Catalyst separately from vehicle production")
	_check(not sim.issue_command([workshop.tag], "lift").ok, "A Workshop cannot detach its active Research Module")
	_check(sim.issue_command([runner.tag], "cinder_guard_mode").ok, "Armory unlocks Guard conversion")
	_step(Rules.VEHICLE_MODE_SECONDS - 1.0 / sim.TICK_RATE)
	_check(not module.production_queue.is_empty() and module.production_queue[0].progress > 0.0
		and workshop.production_queue[0].progress > 0.0 and workshop.production_queue[1].progress == 0.0,
		"Research and the first vehicle advance on the same ticks")
	_check(runner.unit_type == "cinder_runner" and runner.is_immobile, "Conversion holds the vehicle in place until it finishes")
	sim.step_ticks(1)
	_check(runner.unit_type == "cinder_guard" and runner.hp == 135.0 and not runner.is_immobile, "Conversion preserves identity and changes vitals")
	_test_flame()
	_test_mine()
	_test_vortex()
	_test_atlas()
	print("Meridian factory: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)

func _test_flame() -> void:
	var runner: Dictionary = sim.spawn_unit("cinder_runner", 1, Vector2(50, 100))
	var front: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(56, 100))
	var behind: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(62, 100))
	var sideways: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(56, 106))
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim._execute_weapon_hit(runner, front) and front.shields == 36.0 and behind.shields == 36.0
		and sideways.shields == 50.0, "A Runner hits both units along its flame line")
	var guard: Dictionary = sim.spawn_unit("cinder_guard", 1, Vector2(70, 100))
	var close: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(75, 100))
	var cone: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(76, 102))
	sim.players[1].upgrades["infernal_catalyst"] = 1
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim._execute_weapon_hit(guard, close) and close.shields == 20.0 and cone.shields == 20.0, "Guard applies the upgrade once per unit in its flame cone")

func _test_mine() -> void:
	var mine: Dictionary = sim.spawn_unit("sentinel_mine", 1, Vector2(120, 55))
	var target: Dictionary = sim.spawn_unit("bastion_walker", 2, Vector2(129, 55))
	var friendly: Dictionary = sim.spawn_unit("breacher", 1, Vector2(129, 59))
	var nearby_mine: Dictionary = sim.spawn_unit("sentinel_mine", 1, Vector2(131, 55))
	var shed: Dictionary = sim.spawn_unit("silo", 2, Vector2(129, 49))
	target["auto_bastion_barrier"] = false
	sim.issue_command([target.tag, friendly.tag], "hold_fire")
	sim._refresh_vision()
	_check(sim.issue_command([mine.tag], "mine_burrow").ok, "A mobile mine can burrow")
	_step(3.0 / 1.4)
	_check(mine.unit_type == "sentinel_mine_armed" and not sim.can_see_unit(2, mine), "An armed mine is concealed")
	sim.issue_command([mine.tag], "auto_sentinel_missiles")
	_check(not sim.issue_command([mine.tag], "sentinel_missiles", shed.pos, shed.tag).ok, "Sentinel cannot lock onto a structure")
	_check(sim.issue_command([mine.tag], "sentinel_missiles", target.pos, target.tag).ok, "A burrowed mine accepts manual targeting")
	var before: float = target.hp + target.shields
	var friendly_hp: float = friendly.hp
	_step(Rules.MINE_LAUNCH_SECONDS - 1.0 / sim.TICK_RATE)
	_check(target.hp + target.shields == before, "Mine waits the full aim delay")
	sim.step_ticks(1)
	_check(not sim.sentinel_missiles.is_empty() and target.hp + target.shields == before, "The aim deadline launches the missile")
	_step(0.20)
	_check(target.hp + target.shields == before, "The target takes no damage during the launch rise")
	_step(0.65)
	_check(target.shields == 0.0 and target.hp == 140.0, "Mine direct damage includes the shield bonus and bypasses armor")
	_check(friendly.hp == friendly_hp - 40.0 and nearby_mine.hp == 90.0, "Mine splash harms allies and exempts allied mines")
	_check(sim.can_see_unit(2, mine) and not sim.issue_command([mine.tag], "sentinel_missiles", target.pos, target.tag).ok, "A spent mine is revealed during cooldown")
	sim.players[1].upgrades["drilling_claws"] = 1
	_check(not sim.can_see_unit(2, mine) and sim.issue_command([mine.tag], "mine_surface").ok, "Drilling Claws conceals a reloading mine")
	_step(1.0 / 1.4)
	_check(mine.unit_type == "sentinel_mine" and mine.mine_ready > sim.tick, "Faster emergence retains the cooldown")

func _test_vortex() -> void:
	var rover: Dictionary = sim.spawn_unit("vortex_rover", 1, Vector2(120, 110))
	var target: Dictionary = sim.spawn_unit("muster_hall", 2, Vector2(138, 110))
	sim._refresh_vision()
	sim.issue_command([rover.tag], "auto_vortex_lock")
	_check(sim.issue_command([rover.tag], "vortex_lock", target.pos, target.tag).ok, "Vortex can lock onto a visible building")
	_check(sim.issue_command([rover.tag], "move", Vector2(111, 110)).ok, "Vortex accepts movement while locked")
	_step(Rules.VORTEX_LOCK_SHOT_SECONDS)
	_check(rover.pos.x < 120.0 and target.hp == target.max_hp - 20.0, "Vortex fires one armor-ignoring missile on the move")
	sim.players[1].upgrades["mag_accelerator"] = 1
	_step(Rules.VORTEX_LOCK_SHOT_SECONDS)
	_check(target.hp == target.max_hp - 50.0, "Magnetic Accelerator increases the missile damage")
	sim.issue_command([rover.tag], "stop")
	_check(not rover.has("vortex_lock_state") and rover.vortex_lock_ready > sim.tick, "Stop ends Lock On and starts cooldown")

func _test_atlas() -> void:
	var walker: Dictionary = sim.spawn_unit("atlas_walker", 1, Vector2(170, 35))
	var front: Dictionary = sim.spawn_unit("dawn_interceptor", 2, Vector2(181, 35))
	var beside: Dictionary = sim.spawn_unit("dawn_interceptor", 2, Vector2(183, 35))
	var below: Dictionary = sim.spawn_unit("sunblade", 2, Vector2(181, 35))
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	_check(sim._execute_weapon_hit(walker, front) and front.shields == 12.0 and beside.shields == 12.0
		and below.shields == 50.0, "Four airburst hits apply uniformly to both aircraft and spare ground units")
	sim.players[1].upgrades["smart_servos"] = 1
	_check(sim.issue_command([walker.tag], "atlas_precision_mode").ok, "Atlas can switch to precision payload")
	_step(1.0 / 1.4)
	_check(walker.unit_type == "atlas_walker_precision" and sim.weapon_range_against(walker, front) == 27.5, "Smart Servos completes the longer-range conversion")

func _step(seconds: float) -> void:
	sim.step_ticks(ceili(seconds * sim.TICK_RATE))

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
