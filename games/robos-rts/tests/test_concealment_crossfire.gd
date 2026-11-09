extends SceneTree

var sim: Node
var battle: Node
var audio: Node
var data: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	if DisplayServer.get_name() == "headless":
		printerr("Concealment crossfire test requires a rendered Godot window")
		quit(1)
		return
	await process_frame
	sim = root.get_node("SimEngine")
	audio = root.get_node("RTSAudio")
	data = root.get_node("RTSData")
	audio.muted = true
	audio.cooldown_enabled = false
	sim.load_scenario_dict({
		"name": "Concealment under crossfire", "paused": true, "decor": false, "fog_of_war": true,
		"map": {"width": 96, "height": 64, "terrain_tiles": [{"x": 48, "y": 24, "terrain": "brush"}]},
		"units": [
			{"id": "hub", "type": "colony_hub", "owner": 1, "x": 21, "y": 39},
			{"id": "gun", "type": "howitzer_emplaced", "owner": 1, "x": 26, "y": 24},
			{"id": "bait", "type": "triage_specialist", "owner": 1, "x": 38, "y": 24},
			{"id": "detector", "type": "sentry_turret", "owner": 1, "x": 40, "y": 31, "hp": 1},
			{"id": "rifle", "type": "rifleman", "owner": 2, "x": 48, "y": 24, "hp": 8},
			{"id": "cloak", "type": "skirmisher", "owner": 2, "x": 50, "y": 31},
			{"id": "decoy", "type": "silo_retracted", "owner": 2, "x": 45.5, "y": 25}
		]
	})
	battle = load("res://scenes/RTSMain.tscn").instantiate()
	root.add_child(battle)
	battle.world_3d.set_focus(Vector2(40, 26), 44.0)
	await process_frame
	if not battle.icons.is_ready:
		await battle.icons.icons_ready

	var units := {}
	for unit in sim.units.values():
		units[unit.id] = unit
	var gun: Dictionary = units.gun
	var rifle: Dictionary = units.rifle
	var cloak: Dictionary = units.cloak
	var detector: Dictionary = units.detector
	var bait: Dictionary = units.bait
	sim.issue_command([gun.tag, rifle.tag, cloak.tag, detector.tag], "hold_fire")
	_check(sim.issue_command([cloak.tag], "phase_cloak").ok, "The Skirmisher activates cloak")
	_check(_attack(rifle, detector), "The concealed-side rifle can target the detector")
	_attack_click(gun, cloak)
	_check(_targets(gun, cloak), "Detection lets the commander target the cloaked unit")
	sim.step_ticks(2)
	_check(battle.ui_state().area_warnings.size() == 1, "The detected target shows a mortar warning")
	await _check_visibility(rifle, cloak, true, "Detector active")

	for _tick in range(16):
		sim.step_ticks(1)
		if not sim.units.has(detector.tag):
			break
	_check(not sim.units.has(detector.tag), "The rifle shot destroys the detector")
	_check(gun.attack_state == "windup" and battle.ui_state().area_warnings.is_empty(),
		"The warning disappears as detection is lost, even before the gun updates")
	sim.issue_command([gun.tag], "stop")
	await _check_visibility(rifle, cloak, false, "Detector destroyed")
	_attack_click(gun, cloak)
	_check(not _targets(gun, cloak), "A click cannot target the concealed unit")
	sim.issue_command([gun.tag], "stop")
	_check(not _attack(gun, rifle), "The command API also rejects targeting the hidden brush unit")

	_fire_and_check(rifle, bait, "rifle_fire", false)
	_fire_and_check(cloak, bait, "needler_fire", false)
	audio.reset_stats()
	sim.step_ticks(1)
	_check(sim.issue_command([cloak.tag], "phase_step", Vector2(52, 31)).ok, "The cloaked unit can phase")
	var phase_burst: bool = battle.world_3d.active_fx.any(func(fx): return fx.kind == "burst")
	_check(not phase_burst and not audio.sfx_counts.has("phase_step"),
		"A concealed phase reveals neither endpoint through effects or sound")

	var sweep_start: int = sim.tick
	_check(sim.issue_command([units.hub.tag], "recon_sweep", Vector2(50, 27)).ok, "The commander uses a recon sweep")
	await _check_visibility(rifle, cloak, true, "Sweep active")
	_attack_click(gun, cloak)
	_check(_targets(gun, cloak), "A sweep restores explicit targeting")
	sim.step_ticks(2)
	_check(battle.ui_state().area_warnings.size() == 1, "A sweep restores the mortar warning")
	sim.issue_command([gun.tag], "stop")
	_fire_and_check(cloak, bait, "needler_fire", true)

	sim.step_ticks(sweep_start + sim.SWEEP_TICKS + sim.VISION_UPDATE_TICKS - sim.tick)
	_check(cloak.cloaked and sim.vision.sweeps_for(1).is_empty(), "The sweep expires before cloak energy runs out")
	await _check_visibility(rifle, cloak, false, "Sweep expired")
	_fire_and_check(gun, units.decoy, "mortar_fire", true)
	_check(not sim.units.has(rifle.tag), "The visible ground impact can still splash a concealed unit")
	var death_burst: bool = battle.world_3d.active_fx.any(func(fx):
		var point: Vector3 = fx.node.position
		return fx.kind == "burst" and Vector2(point.x, point.z).distance_to(rifle.pos) < 0.1
	)
	_check(not death_burst and not audio.sfx_counts.has("unit_death_human"),
		"Collateral damage does not reveal a concealed casualty through a death cue")

	print("Concealment crossfire: ", "passed" if failures.is_empty() else str(failures))
	audio.world_3d = null
	battle.queue_free()
	await process_frame
	await RenderingServer.frame_post_draw
	quit.call_deferred(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _attack(attacker: Dictionary, target: Dictionary) -> bool:
	return sim.issue_command([attacker.tag], "attack_target", target.pos, target.tag).ok

func _attack_click(gun: Dictionary, target: Dictionary) -> void:
	battle._select_tags([gun.tag])
	battle.inject_input({"type": "key", "key": "A"})
	battle.inject_input({"type": "key", "key": "A", "pressed": false})
	var screen: Vector2 = battle.world_to_screen(target.pos, 1.15)
	battle.inject_input({"type": "mouse_button", "x": screen.x, "y": screen.y})
	battle.inject_input({"type": "mouse_button", "x": screen.x, "y": screen.y, "pressed": false})

func _targets(gun: Dictionary, target: Dictionary) -> bool:
	return not gun.orders.is_empty() and gun.orders.front().get("target_tag") == target.tag

func _check_visibility(rifle: Dictionary, cloak: Dictionary, shown: bool, stage: String) -> void:
	await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var scale := Vector2(image.get_size()) / Vector2(1920, 1080)
	for unit in [rifle, cloak]:
		_check(sim.can_see_position(1, unit.pos), "%s leaves the terrain in sight" % stage)
		_check(sim.can_see_unit(1, unit) == shown, "%s changes %s visibility" % [stage, unit.id])
		var mark := Vector2i(battle.world_to_minimap(unit.pos) * scale)
		var expected: Color = data.get_player_color(unit.owner)
		var actual := image.get_pixelv(mark)
		var player_color := absf(actual.r - expected.r) + absf(actual.g - expected.g) + absf(actual.b - expected.b) < 0.08
		_check(player_color == shown, "%s changes the minimap mark for %s (%s)" % [stage, unit.id, actual])

func _fire_and_check(attacker: Dictionary, target: Dictionary, cue: String, shown: bool) -> void:
	audio.reset_stats()
	_check(_attack(attacker, target), "%s can fire at the visible target" % attacker.id)
	var fired := false
	for _tick in range(160):
		sim.step_ticks(1)
		if not sim.recent_events.is_empty():
			var shot: Dictionary = sim.recent_events.back()
			if shot.tick == sim.tick and shot.attacker_tag == attacker.tag:
				fired = true
				break
	_check(fired, "%s fires a real shot" % attacker.id)
	var beam: bool = battle.world_3d.active_fx.any(func(fx): return fx.kind == "beam")
	_check(beam == shown and audio.sfx_counts.has(cue) == shown,
		"%s fires with position cues only while visible" % attacker.id)
	sim.issue_command([attacker.tag], "stop")
