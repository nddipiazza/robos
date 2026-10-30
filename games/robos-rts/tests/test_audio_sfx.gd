extends SceneTree

var sim: Node
var audio: Node
var data: Node

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
	_test_human_unit_dialogues_and_voices()
	print("PASS test_audio_sfx (all 36 SFX + 71 human voice dialogue WAV streams verified)")
	quit(0)

func _test_all_wav_files_loaded() -> void:
	assert(audio != null, "RTSAudio autoload must be registered")
	assert(audio.SOUND_FILES.size() == 36, "Expected 36 sound files in catalog")
	for key in audio.SOUND_FILES.keys():
		var path: String = str(audio.SOUND_FILES[key])
		assert(FileAccess.file_exists(path), "Missing WAV file on disk: %s" % path)
		assert(audio.has_sfx(key), "RTSAudio missing stream for key: %s" % key)
		var stream: AudioStreamWAV = audio.get_stream(key)
		assert(stream != null, "Null AudioStreamWAV for key: %s" % key)
		assert(stream.format == AudioStreamWAV.FORMAT_16_BITS, "Expected 16-bit PCM for %s" % key)
		assert(stream.mix_rate == 22050, "Expected 22050Hz mix rate for %s" % key)
		assert(stream.data.size() > 1000, "Unexpectedly small PCM buffer for %s (%d bytes)" % [key, stream.data.size()])

	assert(audio.has_sfx("gunfire"), "Alias 'gunfire' should resolve")
	assert(audio.has_sfx("melee_attack"), "Alias 'melee_attack' should resolve")
	assert(audio.has_sfx("melee_strike"), "Alias 'melee_strike' should resolve")

func _test_unit_weapon_metadata() -> void:
	var armed_units := [
		"pioneer", "rifleman", "breacher", "howitzer", "howitzer_emplaced",
		"forager", "skitterling", "bile_crawler", "blight_hurler",
		"mote", "sunblade", "skirmisher", "spire_walker"
	]
	for utype in armed_units:
		var u_def: Dictionary = data.get_unit_def(utype)
		var wpn: Dictionary = u_def.get("weapon", {})
		assert(not wpn.is_empty(), "Expected weapon on %s" % utype)
		var sfx_key: String = str(wpn.get("sfx", ""))
		var atk_type: String = str(wpn.get("attack_type", ""))
		assert(sfx_key != "", "Missing weapon 'sfx' on %s" % utype)
		assert(atk_type in ["ranged", "melee"], "Invalid weapon 'attack_type' on %s: %s" % [utype, atk_type])
		assert(audio.has_sfx(sfx_key), "Weapon sfx '%s' on %s not found in RTSAudio" % [sfx_key, utype])

func _assert_combat_sfx(attacker_type: String, target_type: String, expected_sfx: Array) -> void:
	sim.reset_state(101, 64.0, 64.0)
	audio.reset_stats()
	var attacker: Dictionary = sim.spawn_unit(attacker_type, 1, Vector2(20.0, 32.0))
	var dist := 8.0 if attacker_type == "howitzer_emplaced" else 1.5
	var target: Dictionary = sim.spawn_unit(target_type, 2, Vector2(20.0 + dist, 32.0))
	sim.issue_command([attacker["tag"]], "attack_target", target["pos"], target["tag"])
	sim.step_ticks(24)
	for key in expected_sfx:
		assert(int(audio.sfx_counts.get(key, 0)) > 0, "Expected '%s' to play when %s attacks %s (played: %s)" % [
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

	assert(int(audio.sfx_counts.get("surge_activate", 0)) > 0, "Expected surge_activate")
	assert(int(audio.sfx_counts.get("charge_activate", 0)) > 0, "Expected charge_activate")
	assert(int(audio.sfx_counts.get("phase_step", 0)) > 0, "Expected phase_step")
	assert(int(audio.sfx_counts.get("siege_transform", 0)) > 0, "Expected siege_transform")
	assert(int(audio.sfx_counts.get("silo_gate", 0)) > 0, "Expected silo_gate")

	# Verify unit & structure death sounds across all 3 factions
	audio.reset_stats()
	var walker: Dictionary = sim.spawn_unit("spire_walker", 3, Vector2(24.0, 40.0))
	var victim_human: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(28.0, 40.0))
	victim_human["hp"] = 5.0
	sim.issue_command([walker["tag"]], "attack_target", victim_human["pos"], victim_human["tag"])
	sim.step_ticks(20)
	assert(int(audio.sfx_counts.get("unit_death_human", 0)) > 0, "Expected unit_death_human")

	var victim_monster: Dictionary = sim.spawn_unit("skitterling", 2, Vector2(28.0, 40.0))
	victim_monster["hp"] = 5.0
	walker["weapon_cooldown"] = 0.0
	sim.issue_command([walker["tag"]], "attack_target", victim_monster["pos"], victim_monster["tag"])
	sim.step_ticks(20)
	assert(int(audio.sfx_counts.get("unit_death_monster", 0)) > 0, "Expected unit_death_monster")

	var victim_alien: Dictionary = sim.spawn_unit("mote", 1, Vector2(28.0, 40.0))
	victim_alien["shields"] = 0.0
	victim_alien["hp"] = 5.0
	walker["weapon_cooldown"] = 0.0
	sim.issue_command([walker["tag"]], "attack_target", victim_alien["pos"], victim_alien["tag"])
	sim.step_ticks(20)
	assert(int(audio.sfx_counts.get("unit_death_alien", 0)) > 0, "Expected unit_death_alien")

	var victim_struct: Dictionary = sim.spawn_unit("silo", 1, Vector2(30.0, 40.0))
	victim_struct["hp"] = 5.0
	walker["weapon_cooldown"] = 0.0
	sim.issue_command([walker["tag"]], "attack_target", victim_struct["pos"], victim_struct["tag"])
	sim.step_ticks(20)
	assert(int(audio.sfx_counts.get("structure_destroyed", 0)) > 0, "Expected structure_destroyed")

func _test_economy_and_ui_sfx() -> void:
	audio.reset_stats()
	audio.local_player_id = 1
	for ui_key in ["ui_select", "ui_command_move", "ui_command_attack", "ui_build_place", "ui_error", "alert_under_attack", "match_victory", "match_defeat"]:
		assert(audio.play_ui(ui_key), "Expected play_ui('%s') to succeed" % ui_key)
		assert(int(audio.sfx_counts.get(ui_key, 0)) == 1, "Expected count 1 for %s" % ui_key)

	# Verify quiet crystal drill sizzle on contact, and NO sound when returning minerals/gas
	sim.reset_state(303, 64.0, 64.0)
	audio.reset_stats()
	var _hub: Dictionary = sim.spawn_unit("colony_hub", 1, Vector2(12.0, 20.0))
	var crystal: Dictionary = sim.spawn_resource("crystal_field", Vector2(30.0, 20.0), 1500)
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(27.8, 20.0))
	sim.issue_command([worker["tag"]], "harvest", crystal["pos"], crystal["tag"])
	# Step a few ticks so the worker's drill contacts the crystal
	sim.step_ticks(8)
	assert(int(audio.sfx_counts.get("harvest_hit", 0)) == 1, "Expected harvest_hit when drill first hits crystal")
	# Step until the worker finishes drilling and walks back to return the crystal to hub
	audio.reset_stats()
	for _i in range(240):
		sim.step_ticks(1)
		if int(sim.players[1]["crystal_collected"]) >= 5:
			break
	assert(int(sim.players[1]["crystal_collected"]) >= 5, "Expected worker to have returned crystal to hub")
	assert(audio.sfx_counts.is_empty(), "Expected NO sound when finishing & returning minerals/gas (got: %s)" % str(audio.sfx_counts))

func _test_human_unit_dialogues_and_voices() -> void:
	# Verify all 71 voice dialogue WAVs exist on disk and are loaded into RTSAudio.voice_streams
	assert(audio.voice_streams.size() == 71, "Expected 71 voice dialogue streams loaded, got %d" % audio.voice_streams.size())
	for line_id in audio.voice_streams.keys():
		var wav_path := "res://assets/audio/voice/%s.wav" % line_id
		assert(FileAccess.file_exists(wav_path), "Missing voice WAV file: %s" % wav_path)
		var stream: AudioStreamWAV = audio.voice_streams[line_id]
		assert(stream != null and stream.data.size() > 2000, "Invalid voice stream for %s" % line_id)
		assert(str(audio.voice_texts.get(line_id, "")) != "", "Missing subtitle text for %s" % line_id)

	# Verify Pioneer worker has >= 5 varieties for select, move, job_done, and attack, and cycles through all of them
	var pioneer_select: Array = data.get_unit_dialogues("pioneer", "select")
	var pioneer_job_done: Array = data.get_unit_dialogues("pioneer", "job_done")
	var pioneer_attack: Array = data.get_unit_dialogues("pioneer", "attack")
	assert(pioneer_select.size() >= 5, "Expected >= 5 pioneer select lines")
	assert(pioneer_job_done.size() >= 5, "Expected >= 5 pioneer job_done lines")
	assert(pioneer_attack.size() >= 5, "Expected >= 5 pioneer attack lines")

	audio.reset_stats()
	var seen_select: Dictionary = {}
	for _i in range(pioneer_select.size()):
		var res: Dictionary = audio.play_unit_dialogue("pioneer", "select", true)
		assert(not res.is_empty(), "Expected pioneer select dialogue to play")
		seen_select[res["id"]] = true
	assert(seen_select.size() == pioneer_select.size(), "Expected all %d pioneer select varieties to cycle" % pioneer_select.size())

	# Verify Rifleman, Breacher, and Howitzer each have >= 5 select and >= 5 witty attack dialogues
	for utype in ["rifleman", "breacher", "howitzer"]:
		var sel_lines: Array = data.get_unit_dialogues(utype, "select")
		var atk_lines: Array = data.get_unit_dialogues(utype, "attack")
		assert(sel_lines.size() >= 5, "Expected >= 5 select lines for %s" % utype)
		assert(atk_lines.size() >= 5, "Expected >= 5 witty attack lines for %s" % utype)
		var seen_atk: Dictionary = {}
		for _i in range(atk_lines.size()):
			var res_atk: Dictionary = audio.play_unit_dialogue(utype, "attack", true)
			seen_atk[res_atk["id"]] = true
		assert(seen_atk.size() == atk_lines.size(), "Expected all %d %s attack varieties to cycle" % [atk_lines.size(), utype])

	# Verify completing construction triggers pioneer job_done dialogue with 5+ varieties
	sim.reset_state(404, 64.0, 64.0)
	audio.reset_stats()
	var seen_jobs: Dictionary = {}
	for i in range(5):
		var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(16.0 + i * 8.0, 20.0))
		var silo: Dictionary = sim.spawn_unit("silo", 1, Vector2(16.0 + i * 8.0, 22.2), "", 0.99)
		worker["orders"] = [{
			"type": "build",
			"structure_type": "silo",
			"target_pos": silo["pos"],
			"structure_tag": silo["tag"]
		}]
		sim.step_ticks(4)
		seen_jobs[audio.last_spoken_line_id] = true
	assert(seen_jobs.size() == 5, "Expected 5 distinct pioneer job_done lines across 5 completed builds, got %s" % str(seen_jobs))
