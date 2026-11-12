extends SceneTree

const CLIP_FRAMES := 288
const LEAD_FRAMES := 35
const FIELD := Vector2(44, 31)
const SUPPORT_ROLES := {
	"triage_specialist": "Heal wounded infantry",
	"rampart_transport": "Board and unload infantry",
	"prospector": "Collect crystal under pressure",
	"drift_sac": "Scout ahead of the line",
	"farsight_wisp": "Fly ahead and reveal the enemy",
	"veilseeker": "Detect burrowed enemies",
	"lumen_carrier": "Deploy a power field",
	"aegis_warden": "Cast Lattice Burst",
	"ridge_scout": "Throw a delayed Ridge Charge and fire both pistols",
}

var sim: Node
var data: Node
var battle: Node
var subject_tags: Array = []
var shot_count := 0
var role_events := 0
var bursts := 0

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	data = root.get_node("RTSData")
	var args := OS.get_cmdline_user_args()
	if "--roster" in args:
		var roster := {}
		for id in data.units:
			var unit: Dictionary = data.units[id]
			if not unit.get("is_structure", false) and id != "sporeburst_cocoon":
				roster[id] = {
					"name": unit.name, "faction": unit.faction, "weapon": unit.get("weapon", {}),
					"flight": unit.get("flight_height", 0.0), "role": SUPPORT_ROLES.get(id, ""),
				}
		print(JSON.stringify(roster))
		quit()
		return
	if args.size() != 1 or DisplayServer.get_name() == "headless":
		printerr("Combat showcase requires a rendered window and a matchup JSON file.")
		quit(2)
		return
	var cases: Variant = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	if not cases is Array or cases.is_empty():
		printerr("Combat showcase has no matchups.")
		quit(2)
		return
	sim.rts_mode = "human"
	sim.weapon_attack.connect(_on_shot)
	sim.ability_triggered.connect(_on_role_action)
	battle = load("res://scenes/RTSMain.tscn").instantiate()
	root.add_child(battle)
	current_scene = battle
	var audio := root.get_node("RTSAudio")
	var music := root.get_node("RTSMusic")
	audio.set_volume_percent(100)
	audio.muted = false
	music.volume_percent = 100
	AudioServer.set_bus_volume_db(0, -14.0)
	await process_frame
	await process_frame
	# Start well into the gameplay mix and avoid fading in during a short clip.
	if not music.seek_for_capture(45.0):
		printerr("Combat showcase could not start the soundtrack.")
		quit(1)
		return
	var failed := false
	var start_frame := 0
	for encounter: Dictionary in cases:
		var outcome := await _record(encounter, audio)
		outcome.start_frame = start_frame
		outcome.frames = CLIP_FRAMES
		print("SHOWCASE " + JSON.stringify(outcome))
		start_frame += CLIP_FRAMES
		failed = failed or not bool(outcome.ok)
	quit(1 if failed else 0)

func _record(encounter: Dictionary, audio: Node) -> Dictionary:
	var kind := str(encounter.unit)
	var unit: Dictionary = data.units[kind]
	var foe: Dictionary = data.units[encounter.foe]
	var variant := int(encounter.variant)
	var count := int(encounter.count)
	var foe_count := int(encounter.foe_count)
	var formation := str(encounter.get("formation", ""))
	var role := str(SUPPORT_ROLES.get(kind, ""))
	var scout := kind in ["drift_sac", "farsight_wisp", "veilseeker"]
	var weapon: Dictionary = unit.get("weapon", {})
	var gap := clampf(float(weapon.get("range", 11.0)) * 0.85 + 3.0, 5.5, 23.0)
	if scout:
		gap = float(unit.sight_range) + 4.0
	var lineup: Array = []
	var deposits: Array = []
	var player_center := FIELD - Vector2(gap * 0.5, 0)
	var foe_center := FIELD + Vector2(gap * 0.5, 0)
	var spacing := 7.2 if kind == "rampart_transport" else maxf(2.5, float(unit.radius) * 2.3)
	if not formation.is_empty():
		spacing = 1.7 if formation == "clumped" else 5.3
	_add_lineup(lineup, kind, 1, count, player_center, spacing, "subject")
	_add_lineup(lineup, encounter.foe, 2, foe_count, foe_center, maxf(2.7, float(foe.radius) * 2.3), "foe")
	if kind in ["triage_specialist", "rampart_transport"]:
		for i in range(count):
			var at: Dictionary = lineup[i]
			var offset := 2.0 if kind == "triage_specialist" else 0.25
			lineup.append({"type": "rifleman", "owner": 1, "x": at.x + offset, "y": at.y, "hp": 13 if kind == "triage_specialist" else 45})
	elif kind == "prospector":
		lineup.append({"type": "colony_hub", "owner": 1, "x": player_center.x - 8.0, "y": FIELD.y})
		for i in range(count):
			var at: Dictionary = lineup[i]
			deposits.append({"type": "crystal_field", "x": at.x + 3.0, "y": at.y, "amount": 800})
	elif kind == "lumen_carrier":
		lineup.append({"type": "waystone", "owner": 1, "x": player_center.x + 3.0, "y": FIELD.y})

	audio._last_auto_attack_voice_sec = Time.get_ticks_msec() * 0.001
	sim.load_scenario_dict({
		"name": ("%d × %s vs %d × %s" % [count, unit.name, foe_count, foe.name]) + (" — " + formation.capitalize() if not formation.is_empty() else ""),
		"seed": 42 + variant, "paused": true, "fog_of_war": scout, "decor": false,
		"map": {"width": 88, "height": 62}, "units": lineup, "resources": deposits,
		"players": {"1": {"faction": unit.faction}, "2": {"faction": foe.faction}},
	})
	var camera_height := clampf(35.0 + float(count) * 2.5 + maxf(0, gap - 11) * 0.5, 38.0, 56.0)
	if not formation.is_empty():
		camera_height = 29.0 if formation == "clumped" else 36.0
	battle.world_3d.set_focus(FIELD + Vector2(-1, 2), camera_height)
	var subjects: Array = []
	var foes: Array = []
	for fighter in sim.units.values():
		if fighter.id.begins_with("subject"):
			fighter.facing = 0.0
			subjects.append(fighter)
		elif fighter.id.begins_with("foe"):
			fighter.facing = PI
			foes.append(fighter)
	subject_tags = subjects.map(func(fighter): return fighter.tag)
	var foe_tags := foes.map(func(fighter): return fighter.tag)
	shot_count = 0
	role_events = 0
	bursts = 0
	var commands_ok := true
	var boarded := false
	var visible_before := false
	var resource_start: int = sim.players[1].crystal
	if scout:
		visible_before = foes.any(func(enemy): return sim.can_see_unit(1, enemy))
	if kind == "veilseeker":
		sim.issue_command(foe_tags, "burrow")
	for frame in range(CLIP_FRAMES):
		if frame == LEAD_FRAMES:
			if formation.is_empty():
				commands_ok = _start_encounter(kind, subjects, foes, role)
			else:
				commands_ok = sim.issue_command(subject_tags, "hold_position").ok
				for enemy in foes:
					commands_ok = sim.issue_command([enemy.tag], "attack_move", Vector2(player_center.x - 6.0, enemy.pos.y)).ok and commands_ok
			if commands_ok:
				audio.play_ui("ui_command_attack" if role.is_empty() else "ui_command_move")
			sim.paused = false
		if frame == 115 and kind == "rampart_transport":
			boarded = subjects.all(func(fighter): return not fighter.passengers.is_empty())
			for fighter in subjects:
				sim.issue_command([fighter.tag], "unload_transport", fighter.pos + Vector2(3, 0))
		await process_frame
	sim.paused = true
	var demonstrated := shot_count > 0 if role.is_empty() else role_events > 0
	if not formation.is_empty():
		demonstrated = demonstrated and bursts > 0
	match kind:
		"rampart_transport":
			demonstrated = boarded and subjects.all(func(fighter): return fighter.passengers.is_empty())
		"prospector":
			demonstrated = sim.players[1].crystal > resource_start or subjects.any(func(fighter): return fighter.cargo_amount > 0)
		"drift_sac", "farsight_wisp", "veilseeker":
			demonstrated = not visible_before and foes.any(func(enemy): return sim.can_see_unit(1, enemy))
		"ridge_scout":
			demonstrated = role_events >= 2 and shot_count > 0
	return {
		"ok": commands_ok and demonstrated, "unit": kind, "variant": variant, "title": sim.scenario_name,
		"shots": shot_count, "role": role, "role_events": role_events,
		"bursts": bursts, "surviving_subjects": subjects.filter(func(fighter): return sim.units.has(fighter.tag)).size(),
	}

func _add_lineup(lineup: Array, kind: String, owner: int, count: int, center: Vector2, spacing: float, prefix: String) -> void:
	var columns := 2 if count > 4 else 1
	var rows := ceili(float(count) / columns)
	for i in range(count):
		var pos := center + Vector2((i / rows) * spacing * (-1 if owner == 1 else 1), (i % rows - (rows - 1) * 0.5) * spacing)
		lineup.append({"id": "%s%d" % [prefix, i], "type": kind, "owner": owner, "x": pos.x, "y": pos.y})

func _start_encounter(kind: String, subjects: Array, foes: Array, role: String) -> bool:
	var succeeded := true
	for i in range(subjects.size()):
		var fighter: Dictionary = subjects[i]
		var foe: Dictionary = foes[i % foes.size()]
		var tags := [fighter.tag]
		var result: Dictionary
		match kind:
			"triage_specialist":
				result = sim.issue_command(tags, "hold_position")
			"prospector":
				var patch: Dictionary = sim.resources.values()[i]
				result = sim.issue_command(tags, "harvest", patch.pos, patch.tag)
			"rampart_transport":
				result = sim.issue_command(tags, "load_transport")
			"lumen_carrier":
				result = sim.issue_command(tags, "deploy_power_field")
			"aegis_warden":
				fighter.energy = 75.0
				result = sim.issue_command(tags, "lattice_burst", FIELD + Vector2(2.0, fighter.pos.y - FIELD.y))
			"ridge_scout":
				result = sim.issue_command(tags, "ridge_charge", FIELD + Vector2(2.0, fighter.pos.y - FIELD.y))
				succeeded = succeeded and sim.issue_command(tags, "attack", foe.pos, foe.tag).ok
			_:
				if role.is_empty():
					result = sim.issue_command(tags, "attack", foe.pos, foe.tag)
				else:
					result = sim.issue_command(tags, "move", Vector2(FIELD.x + 4.0, fighter.pos.y))
		succeeded = succeeded and bool(result.ok)
	if kind in ["triage_specialist", "prospector", "aegis_warden", "ridge_scout"]:
		for enemy in foes:
			sim.issue_command([enemy.tag], "attack_move", FIELD - Vector2(6, 0))
	return succeeded

func _on_shot(attacker: Dictionary, _target: Dictionary, _weapon: Dictionary, _shield: bool) -> void:
	if attacker.tag in subject_tags:
		shot_count += 1

func _on_role_action(source: Dictionary, _ability: String, _pos: Vector2) -> void:
	if _ability == "detonate_sporeburst":
		bursts += 1
		if source.tag in subject_tags:
			shot_count += 1
	if source.tag in subject_tags:
		role_events += 1
