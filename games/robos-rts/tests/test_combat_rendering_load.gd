extends SceneTree

const SAMPLE_TICKS := 320
const BURST_SIZE := 64

var sim: Node
var battle: Node
var failures: Array[String] = []
var shots := 0
var splash_shots := 0
var shield_hits := 0
var smoke_seen := false
var proof_started := false
var proof_finished := false
var readback_frame := false

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		printerr("Combat rendering load test requires a rendered Godot window")
		quit(1)
		return
	await process_frame
	sim = root.get_node("SimEngine")
	var audio := root.get_node("RTSAudio")
	audio.muted = true
	sim.rts_mode = "realtime"
	sim.load_scenario_dict({
		"name": "Combat rendering load", "paused": true, "decor": false, "fog_of_war": true,
		"map": {"width": 140, "height": 100},
		"units": [
			{"id": "demolition", "type": "rifleman", "owner": 1, "x": 46, "y": 40},
			{"id": "silo", "type": "silo", "owner": 2, "x": 55, "y": 40, "hp": 1},
			{"id": "probe", "type": "rifleman", "owner": 1, "x": 40, "y": 20, "hp": 34},
			{"id": "target", "type": "howitzer_emplaced", "owner": 2, "x": 50, "y": 21},
			{"type": "rifleman", "owner": 1, "x": 58, "y": 36, "count": 48, "spread": 2.5},
			{"type": "howitzer_emplaced", "owner": 1, "x": 51, "y": 44, "count": 12, "spread": 3.5},
			{"type": "blight_hurler", "owner": 1, "x": 55, "y": 29, "count": 10, "spread": 3.0},
			{"type": "skirmisher", "owner": 2, "x": 75, "y": 33, "count": 56, "spread": 2.8},
			{"type": "spire_walker", "owner": 2, "x": 86, "y": 43, "count": 8, "spread": 4.2}
		]
	})
	var by_id := {}
	for unit in sim.units.values():
		by_id[unit.id] = unit
	var starting_units: int = sim.units.size()
	sim.issue_command([by_id.probe.tag, by_id.target.tag], "hold_fire")
	sim.issue_command([by_id.demolition.tag], "attack_target", by_id.silo.pos, by_id.silo.tag)
	battle = load("res://scenes/RTSMain.tscn").instantiate()
	root.add_child(battle)
	current_scene = battle
	battle.world_3d.set_focus(Vector2(66, 34), 58.0)
	battle.hover_override = Vector2(900, 600)
	battle.banner_ttl = 0.0
	await process_frame
	if not battle.icons.is_ready:
		await battle.icons.icons_ready
	await RenderingServer.frame_post_draw
	sim.weapon_attack.connect(_on_shot)
	sim.paused = false

	var frames: Array[float] = []
	var burst_frames: Array[float] = []
	var sim_frames: Array[float] = []
	var sync: Array[float] = []
	var hud: Array[float] = []
	var draw_calls: Array[float] = []
	var peak_fx := 0
	var started := Time.get_ticks_usec()
	var last_frame := started
	while sim.tick < SAMPLE_TICKS and Time.get_ticks_usec() - started < 30000000:
		await RenderingServer.frame_post_draw
		var now := Time.get_ticks_usec()
		var effects: Array = battle.world_3d.active_fx
		var count := effects.size()
		peak_fx = maxi(peak_fx, count)
		var smoke_in_frame := effects.any(func(fx): return fx.col == battle.world_3d.DESTRUCTION_SMOKE)
		smoke_seen = smoke_seen or smoke_in_frame
		if not readback_frame:
			var frame_ms := (now - last_frame) / 1000.0
			frames.append(frame_ms)
			if count >= BURST_SIZE:
				burst_frames.append(frame_ms)
			sim_frames.append(sim.frame_sim_usec / 1000.0)
			sync.append(battle.world_3d.sync_ms)
			hud.append(battle.hud.draw_ms)
			draw_calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		readback_frame = false
		last_frame = now
		if not proof_started and count >= BURST_SIZE and smoke_in_frame and shield_hits > 0:
			proof_started = true
			_verify_controls(by_id.probe, by_id.target)
	sim.paused = true

	_check(sim.tick >= SAMPLE_TICKS and sim.sim_speed == 1.0 and sim.manual_step_requests == 0,
		"Combat runs on the live clock at normal speed")
	_check(shots >= 160 and splash_shots > 20 and shield_hits > 20, "The battle produces sustained mixed attacks")
	_check(smoke_seen and not sim.units.has(by_id.silo.tag), "A destroyed structure contributes visible smoke")
	_check(peak_fx <= battle.world_3d.MAX_ACTIVE_FX and burst_frames.size() >= 10, "Busy frames exercise the bounded FX budget")
	_check(proof_finished, "Selection, health and commands are verified during the burst")
	var service := root.get_node("GameControlServer")
	print(JSON.stringify({
		"units": starting_units, "tick": sim.tick, "wall_seconds": (Time.get_ticks_usec() - started) / 1000000.0,
		"shots": shots, "splash_shots": splash_shots, "shield_hits": shield_hits, "smoke": smoke_seen,
		"peak_fx": peak_fx, "frame": service._sample_stats(frames), "burst_frame": service._sample_stats(burst_frames),
		"sim_frame": service._sample_stats(sim_frames), "world_sync": service._sample_stats(sync), "hud_draw": service._sample_stats(hud),
		"draw_calls_p95": service._sample_stats(draw_calls).get("p95_ms", 0.0), "failures": failures
	}))
	audio.world_3d = null
	battle.queue_free()
	await process_frame
	await RenderingServer.frame_post_draw
	quit.call_deferred(0 if failures.is_empty() else 1)

func _verify_controls(probe: Dictionary, target: Dictionary) -> void:
	_click(battle.world_to_screen(probe.pos, 1.15))
	_check(battle.selected_tags == [probe.tag], "The visible body can be selected during the burst")
	await RenderingServer.frame_post_draw
	var effects: Array = battle.world_3d.active_fx
	_check(effects.size() >= BURST_SIZE and effects.any(func(fx): return fx.kind == "beam")
		and effects.any(func(fx): return fx.col == battle.world_3d.DESTRUCTION_SMOKE),
		"The readability check captures a busy frame with projectile traces and smoke")
	var body: Node3D = battle.world_3d.unit_nodes[probe.tag]
	_check(body.get_node("SelectionRing").visible, "The selected body draws its selection ring")
	var shield_visible := false
	for node in battle.world_3d.unit_nodes.values():
		var shield: Node3D = node.get_node_or_null("ShieldBubble")
		if shield != null and shield.is_visible_in_tree():
			shield_visible = true
			break
	_check(shield_visible, "Shield flashes are visible in the busy frame")

	var image := root.get_texture().get_image()
	readback_frame = true
	var head: Vector2 = battle.world_to_screen(probe.pos, battle.unit_height(probe) + 0.6)
	var scale := Vector2(image.get_size()) / Vector2(1920, 1080)
	var color := image.get_pixelv(Vector2i((head + Vector2(-8, -4)) * scale))
	_check(color.g > 0.65 and color.g > color.r + 0.25 and color.g > color.b + 0.15,
		"The rendered overhead health bar remains readable (%s)" % color)
	_check_battle_warnings(image, scale)
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture="):
			_check(image.save_png(arg.trim_prefix("--capture=")) == OK, "The busy frame can be captured")

	var origin: Vector2 = probe.pos
	var issued := _issue("move", battle.world_to_screen(Vector2(44, 23)))
	await sim.simulation_ticked
	_check(sim.tick == issued + 1 and probe.pos.distance_to(origin) > 0.01, "Move takes effect on the next live tick")
	issued = _issue("attack", battle.world_to_screen(target.pos, 1.25))
	await sim.simulation_ticked
	_check(sim.tick == issued + 1 and probe.attack_target_tag == target.tag and probe.attack_state == "windup",
		"Attack winds up on the next live tick")
	issued = _issue("stop")
	await sim.simulation_ticked
	_check(sim.tick == issued + 1 and probe.orders.is_empty() and probe.vel.is_zero_approx(), "Stop takes effect on the next live tick")
	proof_finished = true

func _check_battle_warnings(image: Image, scale: Vector2) -> void:
	var earliest := {}
	var warned_units := {}
	var total := 0
	for attacker in sim.units.values():
		var warning: Dictionary = battle._area_attack_warning(attacker)
		if warning.is_empty():
			continue
		var key := Vector3(warning.position[0], warning.position[1], warning.radius)
		earliest[key] = minf(float(earliest.get(key, INF)), warning.remaining)
		total += 1
		var target: Dictionary = sim.units[attacker.attack_target_tag]
		if target.owner != 1 and target.max_shields > 0.0 and target.shields < target.max_shields - 0.5 and target.hp > target.max_hp * 0.4:
			warned_units[target.tag] = target
	var shown: Array = battle.ui_state().area_warnings
	_check(total > earliest.size() and shown.size() == earliest.size(), "Overlapping identical warnings share a single footprint")
	for warning in shown:
		var key := Vector3(warning.position[0], warning.position[1], warning.radius)
		_check(is_equal_approx(warning.remaining, earliest[key]), "The shared warning counts down to the earliest hit")

	var expected := Color("#ef6b5c")
	var sampled := 0
	for unit in warned_units.values():
		var head: Vector2 = battle.world_to_screen(unit.pos, battle.unit_height(unit) + 0.6)
		if not Rect2(40, 40, 1840, 710).has_point(head):
			continue
		var color := image.get_pixelv(Vector2i((head + Vector2(-8, -9)) * scale))
		var error := absf(color.r - expected.r) + absf(color.g - expected.g) + absf(color.b - expected.b)
		_check(error < 0.05, "A threatened enemy health bar draws above its splash warning (%s)" % color)
		sampled += 1
	_check(sampled > 0, "The busy frame includes a wounded target inside a warning")

func _issue(ability: String, position: Vector2 = Vector2.INF) -> int:
	var before: int = sim.command_history.size()
	for button in battle.get_card_buttons():
		if button.ability_id != ability:
			continue
		_check(button.blocked.is_empty(), "%s remains enabled on the command card" % ability)
		_click(button.rect.get_center())
		if position.is_finite():
			_check(battle.pending_ability == ability, "%s enters targeting from the command card" % ability)
			_click(position)
		break
	_check(sim.command_history.size() == before + 1, "%s is registered exactly once" % ability)
	return sim.tick

func _click(position: Vector2) -> void:
	battle.inject_input({"type": "mouse_button", "x": position.x, "y": position.y})
	battle.inject_input({"type": "mouse_button", "x": position.x, "y": position.y, "pressed": false})

func _on_shot(_attacker: Dictionary, _target: Dictionary, weapon: Dictionary, hit_shields: bool) -> void:
	shots += 1
	splash_shots += int(float(weapon.get("splash_radius", 0.0)) > 0.0)
	shield_hits += int(hit_shields)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)
