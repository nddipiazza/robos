extends SceneTree

const MAP_SIZE := 512
const WARMUP_TICKS := 32
const SAMPLE_TICKS := 384
const FRONTS := [Vector2(144, 172), Vector2(256, 248), Vector2(364, 340)]

var sim: Node
var battle: Node
var audio: Node
var failures: Array[String] = []
var units_by_id := {}
var shots_by_front := {}
var vision_ms: Array[float] = []
var minimap_input_ms: Array[float] = []
var last_vision_revision := 0
var last_vision_tick := 0
var last_vision_usec := 0
var longest_vision_gap := 0
var detector_lost_tick := 0
var sweep_tick := 0
var next_minimap_front := 0

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		printerr("Fog load test requires a rendered Godot window")
		quit(1)
		return
	await process_frame
	sim = root.get_node("SimEngine")
	audio = root.get_node("RTSAudio")
	audio.muted = true
	sim.rts_mode = "realtime"
	_load_battle()
	var explored: int = sim.vision.cells_for(1).count(sim.Vision.EXPLORED)
	_check(explored >= 14000, "The maximum-sized map starts substantially explored")

	battle = load("res://scenes/RTSMain.tscn").instantiate()
	root.add_child(battle)
	current_scene = battle
	battle.world_3d.set_focus(FRONTS[1], 58.0)
	battle.hover_override = Vector2(900, 600)
	await process_frame
	if not battle.icons.is_ready:
		await battle.icons.icons_ready
	await RenderingServer.frame_post_draw
	var map_texture: SubViewport = battle.hud._minimap_viewport
	var population: int = sim.units.size()
	_check(sim.issue_command([units_by_id.cloak.tag], "phase_cloak").ok, "The target activates cloak")
	_check(sim.can_see_unit(1, units_by_id.cloak), "The detector initially reveals the cloaked unit")
	sim.issue_command([units_by_id.detector.tag, units_by_id.killer.tag, units_by_id.cloak.tag], "hold_fire")
	sim.weapon_attack.connect(_count_shot)
	sim.simulation_ticked.connect(_on_tick)
	last_vision_revision = sim.vision.revision
	last_vision_tick = sim.tick
	last_vision_usec = sim.profile_usec.vision
	sim.paused = false

	var started := Time.get_ticks_usec()
	var last_frame := started
	var stale_frames := 0
	var frames: Array[float] = []
	var fog: Array[float] = []
	var fog_uploads: Array[float] = []
	var minimap: Array[float] = []
	var draw_calls: Array[float] = []
	var last_mask: PackedByteArray = battle.world_3d._fog_cells
	while sim.tick < WARMUP_TICKS + SAMPLE_TICKS and Time.get_ticks_usec() - started < 30000000:
		await RenderingServer.frame_post_draw
		var now := Time.get_ticks_usec()
		if sim.tick >= WARMUP_TICKS:
			frames.append((now - last_frame) / 1000.0)
			fog.append(battle.world_3d.fog_sync_ms)
			minimap.append(battle.hud.minimap_draw_ms)
			draw_calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
			var mask: PackedByteArray = battle.world_3d._fog_cells
			if mask != last_mask:
				fog_uploads.append(battle.world_3d.fog_sync_ms)
				last_mask = mask
			if battle.world_3d._fog_revision != sim.vision.revision:
				stale_frames += 1
		last_frame = now
	sim.paused = true
	_check(sim.tick >= WARMUP_TICKS + SAMPLE_TICKS and sim.manual_step_requests == 0,
		"The workload advances on the live simulation clock")
	_check(vision_ms.size() >= SAMPLE_TICKS / sim.VISION_UPDATE_TICKS and longest_vision_gap == sim.VISION_UPDATE_TICKS,
		"Vision advances within its eight-tick cadence")
	_check(stale_frames == 0 and fog_uploads.size() >= 4, "The rendered fog tracks the changing vision revision")
	_check(detector_lost_tick > 0 and sweep_tick > detector_lost_tick, "Detector loss and sweep happen during the fight")
	_check(shots_by_front.size() == FRONTS.size() and shots_by_front.values().min() > 10,
		"All three fronts generate live weapon hits")
	_check(minimap_input_ms.size() == FRONTS.size() and map_texture != null and map_texture == battle.hud._minimap_viewport,
		"Minimap clicks work and retain the cached terrain")

	var service := root.get_node("GameControlServer")
	print(JSON.stringify({
		"map_size": MAP_SIZE, "explored_cells": explored, "starting_units": population,
		"tick": sim.tick, "vision_max_gap_ticks": longest_vision_gap, "stale_fog_frames": stale_frames,
		"detector_lost_tick": detector_lost_tick, "sweep_tick": sweep_tick,
		"shots_by_front": shots_by_front, "wall_seconds": (Time.get_ticks_usec() - started) / 1000000.0,
		"frame": service._sample_stats(frames), "vision_update": service._sample_stats(vision_ms),
		"fog_sync": service._sample_stats(fog), "fog_upload": service._sample_stats(fog_uploads),
		"minimap_draw": service._sample_stats(minimap), "minimap_input": service._sample_stats(minimap_input_ms),
		"draw_calls_p95": service._sample_stats(draw_calls).get("p95_ms", 0.0), "failures": failures
	}))
	audio.world_3d = null
	battle.queue_free()
	await process_frame
	await RenderingServer.frame_post_draw
	quit.call_deferred(0 if failures.is_empty() else 1)

func _load_battle() -> void:
	var entries := [
		{"id": "hub", "type": "colony_hub", "owner": 1, "x": 222, "y": 282},
		{"id": "spotter", "type": "triage_specialist", "owner": 1, "x": 243, "y": 282},
		{"id": "detector", "type": "sentry_turret", "owner": 1, "x": 252, "y": 282, "hp": 1},
		{"id": "cloak", "type": "skirmisher", "owner": 2, "x": 263, "y": 282},
		{"id": "killer", "type": "howitzer_emplaced", "owner": 2, "x": 263, "y": 296}
	]
	for front in FRONTS:
		entries.append({"type": "rifleman", "owner": 1, "x": front.x - 14, "y": front.y - 6, "count": 16, "spread": 2.6})
		entries.append({"type": "skirmisher", "owner": 2, "x": front.x + 5, "y": front.y - 6, "count": 16, "spread": 2.6})
		entries.append({"type": "blight_hurler", "owner": 2, "x": front.x + 14, "y": front.y - 3, "count": 4, "spread": 2.8})
	for y in range(16, MAP_SIZE, 32):
		for x in range(16, MAP_SIZE, 32):
			entries.append({"id": "survey", "type": "kestrel_interceptor", "owner": 1, "x": x, "y": y})
	sim.load_scenario_dict({
		"name": "Fog and minimap load", "paused": true, "decor": false, "fog_of_war": true,
		"map": {"width": MAP_SIZE, "height": MAP_SIZE, "high_ground": [{"x": 12, "y": 12, "w": 96, "h": 80}]},
		"units": entries
	})
	# Survey units seed genuine explored cells before the live measurement.
	for unit in sim.units.values():
		if unit.id == "survey":
			sim.units.erase(unit.tag)
		elif unit.id != "":
			units_by_id[unit.id] = unit
	sim._rebuild_spatial_grid()
	sim._recompute_supplies()
	sim._refresh_vision()

func _on_tick(tick: int) -> void:
	if sim.vision.revision != last_vision_revision:
		longest_vision_gap = maxi(longest_vision_gap, tick - last_vision_tick)
		if tick >= WARMUP_TICKS:
			vision_ms.append((sim.profile_usec.vision - last_vision_usec) / 1000.0)
		last_vision_revision = sim.vision.revision
		last_vision_tick = tick
		last_vision_usec = sim.profile_usec.vision
	if tick == WARMUP_TICKS + 8:
		var detector: Dictionary = units_by_id.detector
		_check(sim.issue_command([units_by_id.killer.tag], "attack_target", detector.pos, detector.tag).ok,
			"The enemy fires on the detector while battles are active")
	if detector_lost_tick == 0 and not sim.units.has(units_by_id.detector.tag):
		detector_lost_tick = tick
		_check(not sim.can_see_unit(1, units_by_id.cloak), "A lost detector hides the cloaked unit")
	if detector_lost_tick > 0 and tick == detector_lost_tick + 24:
		sweep_tick = tick
		_check(sim.issue_command([units_by_id.hub.tag], "recon_sweep", units_by_id.cloak.pos).ok,
			"The commander sweeps the contested area")
		_check(sim.can_see_unit(1, units_by_id.cloak), "The sweep reveals the cloaked unit immediately")
	if next_minimap_front < FRONTS.size() and tick == WARMUP_TICKS + (next_minimap_front + 1) * 64:
		if next_minimap_front == 1 and not battle.attack_history.is_empty():
			_click_minimap(battle.attack_history.front())
		else:
			# Click beside the front to avoid hitting an attack pin by accident.
			_click_minimap(FRONTS[next_minimap_front] + Vector2(30, 0))
		next_minimap_front += 1

func _click_minimap(position: Vector2) -> void:
	var point: Vector2 = battle.world_to_minimap(position)
	var started := Time.get_ticks_usec()
	battle.inject_input({"type": "mouse_button", "x": point.x, "y": point.y})
	battle.inject_input({"type": "mouse_button", "x": point.x, "y": point.y, "pressed": false})
	minimap_input_ms.append((Time.get_ticks_usec() - started) / 1000.0)
	var focus: Vector2 = battle.world_3d.get_focus()
	_check(focus.distance_to(position) < 0.5, "A minimap click focuses %s in the input frame (got %s)" % [position, focus])

func _count_shot(attacker: Dictionary, _target: Dictionary, _weapon: Dictionary, _shields: bool) -> void:
	for i in range(FRONTS.size()):
		if attacker.pos.distance_squared_to(FRONTS[i]) < 30.0 * 30.0:
			shots_by_front[i] = shots_by_front.get(i, 0) + 1
			return

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)
