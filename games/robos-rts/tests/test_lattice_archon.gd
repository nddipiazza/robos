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
		"map": {"width": 140, "height": 100},
		"players": {"1": {"faction": "aliens"}, "2": {"faction": "humans"}},
	})
	var scribe: Dictionary = sim.spawn_unit("storm_scribe", 1, Vector2(48, 53))
	var blade: Dictionary = sim.spawn_unit("duskblade", 1, Vector2(64, 53))
	var enemy: Dictionary = sim.spawn_unit("rifleman", 2, Vector2(99, 70))
	_check(not sim.issue_command([scribe.tag], "merge_archon").ok, "One caster cannot fuse alone")
	_check(not sim.issue_command([scribe.tag, enemy.tag], "merge_archon").ok, "Fusion requires two casters from one player")
	_check(sim.issue_command([scribe.tag, blade.tag], "merge_archon").ok and sim.units.has(scribe.tag),
		"A mixed pair receives orders to meet")
	_check(sim.issue_command([blade.tag], "stop").ok and sim.archon_approaches.is_empty()
		and not scribe.has("archon_partner") and scribe.orders.is_empty(), "Stopping either caster cancels the approach")
	_check(sim.issue_command([scribe.tag, blade.tag], "merge_archon").ok, "The pair can order fusion again")
	sim.step_ticks(2 * sim.TICK_RATE)
	var results: Array = sim.units.values().filter(func(unit): return unit.unit_type == "lattice_archon")
	if results.is_empty():
		_check(false, "The casters meet and begin fusing")
		_finish()
		return
	var archon: Dictionary = results.front()
	_check(not sim.units.has(scribe.tag) and not sim.units.has(blade.tag) and sim.players[1].supply_used == 4,
		"The warp consumes both casters and preserves their combined supply")
	_check(archon.hp == 10.0 and archon.shields == 350.0 and archon.is_immobile and archon.build_progress < 1.0,
		"The Archon is immobile with its own shields during the warp")
	var remaining: int = archon.archon_warp_finish - sim.tick
	_check(remaining > 0 and remaining < ceili(Rules.ARCHON_WARP_SECONDS * sim.TICK_RATE),
		"The warp has a remaining timer after both casters arrive")
	sim.step_ticks(remaining - 1)
	_check(not sim.issue_command([archon.tag], "move", archon.pos + Vector2(4, 0)).ok, "The Archon cannot move one tick before completion")
	sim._apply_damage_to_target(enemy, archon, 10.0, {}, 1.0)
	sim.step_ticks(1)
	_check(not archon.is_immobile and archon.build_progress == 1.0 and archon.shields == 340.0,
		"The completed Archon retains damage taken during the warp")
	_test_splash(archon)
	_finish()

func _test_splash(archon: Dictionary) -> void:
	var position: Vector2 = archon.pos + Vector2(5, 0)
	var primary: Dictionary = sim.spawn_unit("rifleman", 2, position)
	var ground: Dictionary = sim.spawn_unit("rifleman", 2, position + Vector2(0, 0.9))
	var air: Dictionary = sim.spawn_unit("rampart_transport", 2, position + Vector2(0.9, 0))
	var ally: Dictionary = sim.spawn_unit("sunblade", 1, position + Vector2(0, -0.9))
	sim._rebuild_spatial_grid()
	sim._refresh_vision()
	var weapon: Dictionary = sim._active_weapon(archon, primary)
	_check(sim._execute_weapon_hit(archon, primary, {}, weapon) and primary.hp == 10.0 and ground.hp == 10.0
		and air.hp == 150.0 and ally.shields == ally.max_shields, "Ground splash uses the biological bonus and leaves air and allies intact")
	_check(sim._execute_weapon_hit(archon, air, {}, weapon) and air.hp == 126.0 and ground.hp == 10.0,
		"The Archon can attack air without splashing the ground")

func _check(condition: bool, label: String) -> void:
	if not condition:
		failures.append(label)
		push_error(label)

func _finish() -> void:
	if failures.is_empty():
		print("PASS: cancellable paired approach, timed Archon warp, stable supply, and ground and air splash")
	quit(0 if failures.is_empty() else 1)
