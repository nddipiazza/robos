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
		"ruleset": Rules.ID, "paused": true, "fog_of_war": true,
		"map": {"width": 256, "height": 128},
		"players": {"1": {"faction": "aliens", "crystal": 550, "aether": 500}, "2": {"faction": "humans"}},
	})
	var base := Vector2(50, 45)
	sim.spawn_unit("heartstone", 1, base)
	sim.spawn_unit("resonator", 1, base + Vector2(0, 10))
	var mote: Dictionary = sim.spawn_unit("mote", 1, base + Vector2(-4, 8))
	var gate: Dictionary = sim.spawn_unit("waystone", 1, base + Vector2(7, 11))
	var sanctum_site := base + Vector2(-8, 13)
	sim._refresh_vision()
	_check(not sim.issue_command([gate.tag], "train_duskblade").ok, "The Waystone requires a Veil Sanctum")
	_check(not sim.issue_command([mote.tag], "build_veil_sanctum", sanctum_site).ok, "The Sanctum requires a Twilight Array")
	sim.spawn_unit("twilight_array", 1, base + Vector2(5, 18))
	_check(sim.issue_command([mote.tag], "build_veil_sanctum", sanctum_site).ok, "The Mote starts a powered Sanctum")
	sim.step_ticks(72 * sim.TICK_RATE)
	var sanctums: Array = sim.units.values().filter(func(unit): return unit.unit_type == "veil_sanctum" and unit.build_progress >= 1.0)
	if sanctums.is_empty():
		_check(false, "The Sanctum finishes construction")
		_finish()
		return
	var bank: Dictionary = sim.players[1]
	_check(sim.issue_command([gate.tag], "train_duskblade").ok and gate.production_queue.front().total_time == 40.0
		and bank.crystal == 275 and bank.aether == 225, "Duskblades train for 125/125 in 40 seconds")
	sim.step_ticks(40 * sim.TICK_RATE)
	var duskblades: Array = sim.units.values().filter(func(unit): return unit.unit_type == "duskblade")
	if duskblades.is_empty():
		_check(false, "The paid Duskblade finishes training")
		_finish()
		return
	var blade: Dictionary = duskblades.front()
	_check(blade.cloaked and blade.energy == 0.0, "The trained Duskblade cloaks without consuming energy")
	var destination: Vector2 = blade.pos + Vector2(10, 0)
	sim._refresh_vision()
	_check(not sim.issue_command([blade.tag], "shadow_stride", destination).ok, "Shadow Stride requires research")
	var sanctum: Dictionary = sanctums.front()
	_check(sim.issue_command([sanctum.tag], "research_shadow_stride").ok and bank.crystal == 175 and bank.aether == 125,
		"Shadow Stride costs 100/100 at the Sanctum")
	sim.step_ticks(100 * sim.TICK_RATE + 1)
	_check(blade.cloaked and blade.energy == 0.0, "The cloak persists indefinitely with zero energy")
	destination = blade.pos + Vector2(9, 0)
	sim._refresh_vision()
	_check(sim.issue_command([blade.tag], "shadow_stride", destination).ok and blade.pos == destination
		and blade.cloaked and blade.phase_cooldown == 14.0 and blade.weapon_cooldown >= 0.25,
		"Shadow Stride preserves cloak, adds a 0.25-second attack delay, and starts a 14-second cooldown")
	_check(not sim.issue_command([blade.tag], "shadow_stride", blade.pos + Vector2(5, 0)).ok, "Shadow Stride cannot recast during cooldown")
	var scout_position: Vector2 = blade.pos + Vector2(0, 12)
	sim.spawn_unit("pioneer", 2, scout_position)
	sim._refresh_vision()
	_check(sim.can_see_position(2, blade.pos) and not sim.can_see_unit(2, blade), "The enemy has sight of the ground while the Duskblade stays hidden")
	sim.spawn_unit("sentry_turret", 2, scout_position + Vector2(1, -4))
	sim._refresh_vision()
	_check(sim.can_see_unit(2, blade), "A nearby detector reveals the cloaked Duskblade")
	_finish()

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		push_error(label)

func _finish() -> void:
	if failures.is_empty():
		print("PASS: powered Veil Sanctum, paid Duskblade and Shadow Stride, permanent cloak, detection, and attack delay")
	quit(0 if failures.is_empty() else 1)
