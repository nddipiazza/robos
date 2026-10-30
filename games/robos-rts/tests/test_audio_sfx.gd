extends SceneTree

var sim: Node
var audio: Node
var data: Node
var checks := 0
var failures: Array = []

func check(condition: bool, message: String) -> void:
	checks += 1
	if not condition:
		failures.append(message)

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	audio = root.get_node("RTSAudio")
	data = root.get_node("RTSData")
	audio.cooldown_enabled = false

	_test_all_wav_files_loaded()
	_test_unit_weapon_metadata()
	_test_ranged_gunfire_and_splash_sfx()
	_test_melee_attack_strike_sfx()
	_test_abilities_and_deaths_sfx()
	_test_economy_and_ui_sfx()
	_test_paid_economy_events()
	print(JSON.stringify({"suite":"audio_sfx", "checks":checks, "failures":failures}))
	quit(0 if failures.is_empty() else 1)

func _test_all_wav_files_loaded() -> void:
	check(audio != null, "RTSAudio autoload must be registered")
	check(audio.SOUND_FILES.size() == 36, "Expected 36 sound files in catalog")
	for key in audio.SOUND_FILES.keys():
		var path: String = str(audio.SOUND_FILES[key])
		check(FileAccess.file_exists(path), "Missing WAV file on disk: %s" % path)
		check(audio.has_sfx(key), "RTSAudio missing stream for key: %s" % key)
		var stream: AudioStreamWAV = audio.get_stream(key)
		check(stream != null, "Null AudioStreamWAV for key: %s" % key)
		check(stream.format == AudioStreamWAV.FORMAT_16_BITS, "Expected 16-bit PCM for %s" % key)
		check(stream.mix_rate == 22050, "Expected 22050Hz mix rate for %s" % key)
		check(stream.data.size() > 1000, "Unexpectedly small PCM buffer for %s (%d bytes)" % [key, stream.data.size()])

	check(audio.has_sfx("gunfire"), "Alias 'gunfire' should resolve")
	check(audio.has_sfx("melee_attack"), "Alias 'melee_attack' should resolve")
	check(audio.has_sfx("melee_strike"), "Alias 'melee_strike' should resolve")

func _test_unit_weapon_metadata() -> void:
	var armed_units := [
		"pioneer", "rifleman", "breacher", "howitzer", "howitzer_emplaced",
		"forager", "skitterling", "bile_crawler", "blight_hurler",
		"mote", "sunblade", "skirmisher", "spire_walker"
	]
	for utype in armed_units:
		var u_def: Dictionary = data.get_unit_def(utype)
		var wpn: Dictionary = u_def.get("weapon", {})
		check(not wpn.is_empty(), "Expected weapon on %s" % utype)
		var sfx_key: String = str(wpn.get("sfx", ""))
		var atk_type: String = str(wpn.get("attack_type", ""))
		check(sfx_key != "", "Missing weapon 'sfx' on %s" % utype)
		check(atk_type in ["ranged", "melee"], "Invalid weapon 'attack_type' on %s: %s" % [utype, atk_type])
		check(audio.has_sfx(sfx_key), "Weapon sfx '%s' on %s not found in RTSAudio" % [sfx_key, utype])

func _assert_combat_sfx(attacker_type: String, target_type: String, expected_sfx: Array) -> void:
	sim.reset_state(101, 64.0, 64.0)
	audio.reset_stats()
	var attacker: Dictionary = sim.spawn_unit(attacker_type, 1, Vector2(20.0, 32.0))
	var dist := 8.0 if attacker_type == "howitzer_emplaced" else 1.5
	var target: Dictionary = sim.spawn_unit(target_type, 2, Vector2(20.0 + dist, 32.0))
	sim.issue_command([attacker["tag"]], "attack_target", target["pos"], target["tag"])
	sim.step_ticks(24)
	for key in expected_sfx:
		check(int(audio.sfx_counts.get(key, 0)) > 0, "Expected '%s' to play when %s attacks %s (played: %s)" % [
			key, attacker_type, target_type, str(audio.sfx_counts)
		])

func _test_ranged_gunfire_and_splash_sfx() -> void:
	_assert_combat_sfx("rifleman", "bile_crawler", ["rifle_fire"])
	_assert_combat_sfx("breacher", "bile_crawler", ["breach_charge"])
	_assert_combat_sfx("howitzer", "bile_crawler", ["autocannon_fire"])
	_assert_combat_sfx("howitzer_emplaced", "bile_crawler", ["mortar_fire", "explosion_splash"])
	_assert_combat_sfx("bile_crawler", "rifleman", ["acid_spit"])
	_assert_combat_sfx("blight_hurler", "rifleman", ["corrosive_lob", "explosion_splash"])
	_assert_combat_sfx("skirmisher", "rifleman", ["needler_fire"])
	_assert_combat_sfx("spire_walker", "skirmisher", ["prism_beam", "explosion_splash", "shield_hit"])

func _test_melee_attack_strike_sfx() -> void:
	_assert_combat_sfx("skitterling", "rifleman", ["claw_slash", "melee_hit"])
	_assert_combat_sfx("sunblade", "rifleman", ["light_blade_strike", "melee_hit"])
	_assert_combat_sfx("forager", "rifleman", ["mandible_bite", "melee_hit"])
	_assert_combat_sfx("pioneer", "skitterling", ["arc_welder", "melee_hit"])
	_assert_combat_sfx("mote", "skitterling", ["mote_spark", "melee_hit"])

func _test_abilities_and_deaths_sfx() -> void:
	sim.reset_state(202, 64.0, 64.0)
	audio.reset_stats()

	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(14.0, 14.0))
	var sunblade: Dictionary = sim.spawn_unit("sunblade", 3, Vector2(20.0, 14.0))
	var skirm: Dictionary = sim.spawn_unit("skirmisher", 3, Vector2(26.0, 14.0))
	var howitzer: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(32.0, 14.0))
	var silo: Dictionary = sim.spawn_unit("silo", 1, Vector2(40.0, 14.0))

	sim.issue_command([rifle["tag"]], "surge")
	sim.issue_command([sunblade["tag"]], "charge")
	sim.issue_command([skirm["tag"]], "phase_step", Vector2(26.0, 24.0))
	sim.issue_command([howitzer["tag"]], "emplace")
	sim.issue_command([silo["tag"]], "retract_silo")

	check(int(audio.sfx_counts.get("surge_activate", 0)) > 0, "Expected surge_activate")
	check(int(audio.sfx_counts.get("charge_activate", 0)) > 0, "Expected charge_activate")
	check(int(audio.sfx_counts.get("phase_step", 0)) > 0, "Expected phase_step")
	check(int(audio.sfx_counts.get("siege_transform", 0)) > 0, "Expected siege_transform")
	check(int(audio.sfx_counts.get("silo_gate", 0)) > 0, "Expected silo_gate")

	# Verify unit & structure death sounds across all 3 factions
	audio.reset_stats()
	var walker: Dictionary = sim.spawn_unit("spire_walker", 3, Vector2(24.0, 40.0))
	var victim_human: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(28.0, 40.0))
	victim_human["hp"] = 5.0
	sim.issue_command([walker["tag"]], "attack_target", victim_human["pos"], victim_human["tag"])
	sim.step_ticks(20)
	check(int(audio.sfx_counts.get("unit_death_human", 0)) > 0, "Expected unit_death_human")

	var victim_monster: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(28.0, 40.0))
	victim_monster["hp"] = 5.0
	walker["weapon_cooldown"] = 0.0
	sim.issue_command([walker["tag"]], "attack_target", victim_monster["pos"], victim_monster["tag"])
	sim.step_ticks(20)
	check(int(audio.sfx_counts.get("unit_death_monster", 0)) > 0, "Expected unit_death_monster")

	var victim_alien: Dictionary = sim.spawn_unit("mote", 1, Vector2(28.0, 40.0))
	victim_alien["shields"] = 0.0
	victim_alien["hp"] = 5.0
	walker["weapon_cooldown"] = 0.0
	sim.issue_command([walker["tag"]], "attack_target", victim_alien["pos"], victim_alien["tag"])
	sim.step_ticks(20)
	check(int(audio.sfx_counts.get("unit_death_alien", 0)) > 0, "Expected unit_death_alien")

	var victim_struct: Dictionary = sim.spawn_unit("silo", 1, Vector2(30.0, 40.0))
	victim_struct["hp"] = 5.0
	walker["weapon_cooldown"] = 0.0
	sim.issue_command([walker["tag"]], "attack_target", victim_struct["pos"], victim_struct["tag"])
	sim.step_ticks(20)
	check(int(audio.sfx_counts.get("structure_destroyed", 0)) > 0, "Expected structure_destroyed")

func _test_economy_and_ui_sfx() -> void:
	audio.reset_stats()
	audio.local_player_id = 1
	for ui_key in ["ui_select", "ui_command_move", "ui_command_attack", "ui_build_place", "ui_error", "alert_under_attack", "match_victory", "match_defeat"]:
		check(audio.play_ui(ui_key), "Expected play_ui('%s') to succeed" % ui_key)
		check(int(audio.sfx_counts.get(ui_key, 0)) == 1, "Expected count 1 for %s" % ui_key)

func _test_paid_economy_events() -> void:
	sim.load_scenario_dict({"paused":true,"victory":"all_structures","players":{"1":{"crystal":500,"aether":0}},
		"resources":[{"type":"crystal_field","x":12,"y":40,"amount":5000}],"units":[
		{"type":"colony_hub","owner":1,"x":20,"y":48}, {"type":"silo","owner":1,"x":25,"y":62},
		{"type":"pioneer","owner":1,"x":35,"y":35}, {"type":"brood_nest","owner":2,"x":110,"y":80}]})
	audio.reset_stats()
	sim.issue_command([1004],"build_muster_hall",Vector2(40,35))
	sim.step_ticks(52*64)
	check(int(audio.sfx_counts.get("structure_complete",0))==1,"Paid foundation completion emits one sound")
	var hall: Dictionary = {}
	for u in sim.units.values():
		if u.unit_type=="muster_hall": hall=u
	check(not hall.is_empty(),"Paid hall exists")
	if hall.is_empty(): return
	sim.issue_command([hall.tag],"train_rifleman")
	sim.issue_command([1004],"harvest",Vector2.ZERO,1001)
	sim.step_ticks(25*64)
	check(int(audio.sfx_counts.get("unit_ready",0))==1,"Paid production emits unit ready once")
	check(int(audio.sfx_counts.get("harvest_hit",0))>0 and sim.players[1].crystal_collected>0,"Real gathering emits harvest cues and income")
	audio.reset_stats()
	sim._finish_match(1,"victory")
	check(int(audio.sfx_counts.get("match_victory",0))==1,"Current match result notice emits victory sound")
	audio.force_headless_playback=true
	audio.set_volume_percent(70)
	audio.play_ui("ui_select")
	check(audio._ui_players.any(func(p):return p.playing),"Audio cue reaches a pooled playback voice")
	audio.toggle_mute()
	check(audio._ui_players.all(func(p):return not p.playing),"Mute stops currently playing voices")
	audio.set_volume_percent(100)
	audio.force_headless_playback=false
