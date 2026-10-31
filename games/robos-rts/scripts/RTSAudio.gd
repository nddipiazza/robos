extends Node

# RTSAudio.gd — Spatial & UI Sound Effects Manager for RobOS RTS: Starfall Command
# Loads 16-bit 22050Hz mono PCM .wav assets directly via FileAccess (no .import dependency)
# and connects to SimEngine combat, melee, ability, production, harvesting, and UI events.

signal sfx_triggered(sfx_key: String, world_pos: Vector2, is_ui: bool)

const DEFAULT_SAMPLE_RATE: int = 22050
const WORLD_PLAYER_POOL_SIZE: int = 16
const UI_PLAYER_POOL_SIZE: int = 4
const MAX_RECENT_SFX: int = 32

const SOUND_FILES: Dictionary = {
	# Ranged Gunfire, Beams & Artillery
	"rifle_fire": "res://assets/audio/sfx/rifle_fire.wav",
	"breach_charge": "res://assets/audio/sfx/breach_charge.wav",
	"autocannon_fire": "res://assets/audio/sfx/autocannon_fire.wav",
	"mortar_fire": "res://assets/audio/sfx/mortar_fire.wav",
	"acid_spit": "res://assets/audio/sfx/acid_spit.wav",
	"corrosive_lob": "res://assets/audio/sfx/corrosive_lob.wav",
	"needler_fire": "res://assets/audio/sfx/needler_fire.wav",
	"prism_beam": "res://assets/audio/sfx/prism_beam.wav",

	# Melee Attack Strikes & Workers
	"claw_slash": "res://assets/audio/sfx/claw_slash.wav",
	"mandible_bite": "res://assets/audio/sfx/mandible_bite.wav",
	"light_blade_strike": "res://assets/audio/sfx/light_blade_strike.wav",
	"arc_welder": "res://assets/audio/sfx/arc_welder.wav",
	"mote_spark": "res://assets/audio/sfx/mote_spark.wav",
	"melee_hit": "res://assets/audio/sfx/melee_hit.wav",

	# Combat Impacts & Shields
	"shield_hit": "res://assets/audio/sfx/shield_hit.wav",
	"explosion_splash": "res://assets/audio/sfx/explosion_splash.wav",

	# Unit Abilities & Transforms
	"surge_activate": "res://assets/audio/sfx/surge_activate.wav",
	"charge_activate": "res://assets/audio/sfx/charge_activate.wav",
	"phase_step": "res://assets/audio/sfx/phase_step.wav",
	"siege_transform": "res://assets/audio/sfx/siege_transform.wav",
	"silo_gate": "res://assets/audio/sfx/silo_gate.wav",

	# Destruction & Unit Deaths
	"unit_death_human": "res://assets/audio/sfx/unit_death_human.wav",
	"unit_death_monster": "res://assets/audio/sfx/unit_death_monster.wav",
	"unit_death_alien": "res://assets/audio/sfx/unit_death_alien.wav",
	"structure_destroyed": "res://assets/audio/sfx/structure_destroyed.wav",

	# Economy, Production & Tactical UI
	"harvest_hit": "res://assets/audio/sfx/harvest_hit.wav",
	"structure_complete": "res://assets/audio/sfx/structure_complete.wav",
	"unit_ready": "res://assets/audio/sfx/unit_ready.wav",
	"ui_select": "res://assets/audio/sfx/ui_select.wav",
	"ui_command_move": "res://assets/audio/sfx/ui_command_move.wav",
	"ui_command_attack": "res://assets/audio/sfx/ui_command_attack.wav",
	"ui_build_place": "res://assets/audio/sfx/ui_build_place.wav",
	"ui_error": "res://assets/audio/sfx/ui_error.wav",
	"alert_under_attack": "res://assets/audio/sfx/alert_under_attack.wav",
	"match_victory": "res://assets/audio/sfx/match_victory.wav",
	"match_defeat": "res://assets/audio/sfx/match_defeat.wav"
}

const SOUND_ALIASES: Dictionary = {
	"gunfire": "rifle_fire",
	"melee_attack": "claw_slash",
	"melee_strike": "melee_hit"
}

const WEAPON_NAME_TO_SFX: Dictionary = {
	"Arc Welder": "arc_welder",
	"Burst Rifle": "rifle_fire",
	"Breach Charge": "breach_charge",
	"Mobile Autocannon": "autocannon_fire",
	"155mm Siege Mortar": "mortar_fire",
	"Mandibles": "mandible_bite",
	"Razor Claws": "claw_slash",
	"Caustic Spit": "acid_spit",
	"Corrosive Lob": "corrosive_lob",
	"Mote Spark": "mote_spark",
	"Light Blades": "light_blade_strike",
	"Lattice Needlers": "needler_fire",
	"Prism Beams": "prism_beam"
}

const MELEE_WEAPONS: Dictionary = {
	"Arc Welder": true,
	"Mandibles": true,
	"Razor Claws": true,
	"Mote Spark": true,
	"Light Blades": true
}

const SOUND_VOLUME_OFFSET_DB: Dictionary = {
	"rifle_fire": -2.0,
	"breach_charge": -1.0,
	"autocannon_fire": -1.5,
	"mortar_fire": 1.0,
	"acid_spit": -2.0,
	"corrosive_lob": -1.0,
	"needler_fire": -2.0,
	"prism_beam": -0.5,
	"claw_slash": -1.5,
	"mandible_bite": -2.0,
	"light_blade_strike": -1.0,
	"arc_welder": -3.5,
	"mote_spark": -3.0,
	"melee_hit": -2.0,
	"shield_hit": -2.5,
	"explosion_splash": 1.0,
	"surge_activate": -1.0,
	"charge_activate": -1.0,
	"phase_step": -0.5,
	"siege_transform": -0.5,
	"silo_gate": -1.5,
	"unit_death_human": -1.0,
	"unit_death_monster": -1.0,
	"unit_death_alien": -1.0,
	"structure_destroyed": 2.0,
	"harvest_hit": -5.5,
	"structure_complete": -1.0,
	"unit_ready": -2.0,
	"ui_select": -4.0,
	"ui_command_move": -3.5,
	"ui_command_attack": -2.5,
	"ui_build_place": -2.0,
	"ui_error": -2.0,
	"alert_under_attack": 0.5,
	"match_victory": 1.0,
	"match_defeat": 0.5
}

const SOUND_MIN_INTERVAL_SEC: Dictionary = {
	"rifle_fire": 0.035,
	"breach_charge": 0.045,
	"autocannon_fire": 0.045,
	"mortar_fire": 0.06,
	"acid_spit": 0.045,
	"corrosive_lob": 0.055,
	"needler_fire": 0.04,
	"prism_beam": 0.055,
	"claw_slash": 0.035,
	"mandible_bite": 0.045,
	"light_blade_strike": 0.04,
	"arc_welder": 0.055,
	"mote_spark": 0.055,
	"melee_hit": 0.035,
	"shield_hit": 0.04,
	"explosion_splash": 0.055,
	"harvest_hit": 0.14,
	"ui_select": 0.04,
	"ui_command_move": 0.045,
	"ui_command_attack": 0.045
}

var sound_effects: Dictionary = {}
var sound_streams: Dictionary = {}

var _world_players: Array[AudioStreamPlayer] = []
var _ui_players: Array[AudioStreamPlayer] = []
var _world_player_cursor: int = 0
var _ui_player_cursor: int = 0

var world_3d: Node = null
var local_player_id: int = 1
var muted: bool = false
var volume_percent: int = 100
var master_volume_db: float = 0.0
var cooldown_enabled: bool = true
var force_headless_playback: bool = false

var _last_play_time_sec: Dictionary = {}
var _pitch_rng: RandomNumberGenerator = RandomNumberGenerator.new()
var _last_weapon_attack_tick: int = -1
var _last_weapon_attack_pos: Vector2 = Vector2.INF
var _last_match_outcome_tick: int = -1

var sfx_counts: Dictionary = {}
var last_played_sfx: String = ""
var recent_sfx: Array[Dictionary] = []

func _ready() -> void:
	_pitch_rng.seed = 9001
	_init_sound_catalog()
	_init_player_pools()
	_connect_sim_signals()

func _init_sound_catalog() -> void:
	sound_effects.clear()
	sound_streams.clear()
	for key in SOUND_FILES.keys():
		var path: String = str(SOUND_FILES[key])
		sound_effects[key] = path
		sound_streams[key] = _load_wav_stream(path, key)
	for alias_key in SOUND_ALIASES.keys():
		var target_key: String = str(SOUND_ALIASES[alias_key])
		sound_effects[alias_key] = sound_effects.get(target_key, "")
		if sound_streams.has(target_key):
			sound_streams[alias_key] = sound_streams[target_key]

func _init_player_pools() -> void:
	for p in _world_players:
		if is_instance_valid(p):
			p.queue_free()
	for p in _ui_players:
		if is_instance_valid(p):
			p.queue_free()
	_world_players.clear()
	_ui_players.clear()

	for i in range(WORLD_PLAYER_POOL_SIZE):
		var player := AudioStreamPlayer.new()
		player.name = "WorldSFXPlayer_%d" % i
		player.bus = "Master"
		add_child(player)
		_world_players.append(player)

	for i in range(UI_PLAYER_POOL_SIZE):
		var player := AudioStreamPlayer.new()
		player.name = "UISFXPlayer_%d" % i
		player.bus = "Master"
		add_child(player)
		_ui_players.append(player)

func _connect_sim_signals() -> void:
	if SimEngine == null:
		return
	if not SimEngine.weapon_attack.is_connected(_on_weapon_attack):
		SimEngine.weapon_attack.connect(_on_weapon_attack)
	if not SimEngine.projectile_fired.is_connected(_on_projectile_fired):
		SimEngine.projectile_fired.connect(_on_projectile_fired)
	if not SimEngine.ability_triggered.is_connected(_on_ability_triggered):
		SimEngine.ability_triggered.connect(_on_ability_triggered)
	if not SimEngine.unit_phased.is_connected(_on_unit_phased):
		SimEngine.unit_phased.connect(_on_unit_phased)
	if not SimEngine.unit_destroyed.is_connected(_on_unit_destroyed):
		SimEngine.unit_destroyed.connect(_on_unit_destroyed)
	if not SimEngine.resource_gathered.is_connected(_on_resource_gathered):
		SimEngine.resource_gathered.connect(_on_resource_gathered)
	if not SimEngine.unit_production_finished.is_connected(_on_unit_production_finished):
		SimEngine.unit_production_finished.connect(_on_unit_production_finished)
	if not SimEngine.structure_construction_finished.is_connected(_on_structure_construction_finished):
		SimEngine.structure_construction_finished.connect(_on_structure_construction_finished)
	if not SimEngine.unit_repaired.is_connected(_on_unit_repaired):
		SimEngine.unit_repaired.connect(_on_unit_repaired)
	if not SimEngine.notice.is_connected(_on_sim_notice):
		SimEngine.notice.connect(_on_sim_notice)
	if not SimEngine.scenario_loaded.is_connected(_on_scenario_loaded):
		SimEngine.scenario_loaded.connect(_on_scenario_loaded)

func _load_wav_stream(path: String, fallback_key: String = "") -> AudioStreamWAV:
	if FileAccess.file_exists(path):
		var raw: PackedByteArray = FileAccess.get_file_as_bytes(path)
		var parsed := _parse_riff_wav(raw)
		if parsed != null and parsed.data.size() > 0:
			return parsed
	# Exported packs can remap the original WAV into an imported AudioStreamWAV.
	if ResourceLoader.exists(path, "AudioStreamWAV"):
		var imported := load(path) as AudioStreamWAV
		if imported != null:
			return imported
	return _build_fallback_stream(fallback_key)

func _parse_riff_wav(raw: PackedByteArray) -> AudioStreamWAV:
	if raw.size() < 44:
		return null
	if raw.slice(0, 4).get_string_from_ascii() != "RIFF":
		return null
	if raw.slice(8, 12).get_string_from_ascii() != "WAVE":
		return null

	var mix_rate: int = DEFAULT_SAMPLE_RATE
	var channels: int = 1
	var bits_per_sample: int = 16
	var pcm_data: PackedByteArray = PackedByteArray()

	var offset: int = 12
	var total_len: int = raw.size()
	while offset + 8 <= total_len:
		var chunk_id: String = raw.slice(offset, offset + 4).get_string_from_ascii()
		var chunk_size: int = raw.decode_u32(offset + 4)
		var data_start: int = offset + 8
		var data_end: int = mini(total_len, data_start + chunk_size)
		if chunk_id == "fmt " and data_end - data_start >= 16:
			channels = max(1, raw.decode_u16(data_start + 2))
			mix_rate = max(8000, raw.decode_u32(data_start + 4))
			bits_per_sample = raw.decode_u16(data_start + 14)
		elif chunk_id == "data" and data_end > data_start:
			pcm_data = raw.slice(data_start, data_end)
			break
		offset = data_start + chunk_size + (chunk_size & 1)

	if pcm_data.is_empty():
		return null

	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS if bits_per_sample >= 16 else AudioStreamWAV.FORMAT_8_BITS
	stream.mix_rate = mix_rate
	stream.stereo = (channels >= 2)
	stream.loop_mode = AudioStreamWAV.LOOP_DISABLED
	stream.data = pcm_data
	return stream

func _build_fallback_stream(sfx_key: String) -> AudioStreamWAV:
	var sample_count: int = int(DEFAULT_SAMPLE_RATE * 0.12)
	var bytes := PackedByteArray()
	bytes.resize(sample_count * 2)
	var base_freq: float = 440.0 + float(abs(sfx_key.hash()) % 360)
	for i in range(sample_count):
		var t: float = float(i) / float(DEFAULT_SAMPLE_RATE)
		var env: float = exp(-t * 24.0)
		var sample_val: float = sin(TAU * base_freq * t) * env * 0.45
		var s16: int = clampi(int(round(sample_val * 32767.0)), -32768, 32767)
		bytes.encode_s16(i * 2, s16)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = DEFAULT_SAMPLE_RATE
	stream.stereo = false
	stream.loop_mode = AudioStreamWAV.LOOP_DISABLED
	stream.data = bytes
	return stream

func resolve_sfx_key(sfx_key: String) -> String:
	var key := sfx_key.strip_edges().to_lower()
	if SOUND_ALIASES.has(key):
		return str(SOUND_ALIASES[key])
	return key

func has_sfx(sfx_key: String) -> bool:
	var resolved := resolve_sfx_key(sfx_key)
	return sound_streams.has(resolved) and sound_streams[resolved] != null

func get_stream(sfx_key: String) -> AudioStreamWAV:
	var resolved := resolve_sfx_key(sfx_key)
	return sound_streams.get(resolved, null)

func set_volume_percent(pct: int) -> void:
	var previous_db := master_volume_db
	volume_percent = clampi(pct, 0, 100)
	if volume_percent <= 0:
		muted = true
		master_volume_db = -80.0
	else:
		muted = false
		master_volume_db = linear_to_db(float(volume_percent) / 100.0)
	_apply_voice_volume(previous_db)

func toggle_mute() -> bool:
	muted = not muted
	if not muted and volume_percent <= 0:
		volume_percent = 100
		master_volume_db = 0.0
	_apply_voice_volume(master_volume_db)
	return muted

func _apply_voice_volume(previous_db: float) -> void:
	for player in _world_players + _ui_players:
		if muted:
			player.stop()
		elif player.playing:
			player.volume_db = clampf(player.volume_db + master_volume_db - previous_db, -60.0, 6.0)

func reset_stats() -> void:
	sfx_counts.clear()
	last_played_sfx = ""
	recent_sfx.clear()
	_last_play_time_sec.clear()
	_last_weapon_attack_tick = -1
	_last_weapon_attack_pos = Vector2.INF

func play_ui(sfx_key: String, volume_offset_db: float = 0.0, pitch_scale: float = 1.0) -> bool:
	var resolved := resolve_sfx_key(sfx_key)
	if not sound_streams.has(resolved):
		return false
	if not _check_and_stamp_cooldown(resolved):
		return false

	_record_sfx_trigger(resolved, Vector2.ZERO, true)

	if not _should_output_audio():
		return true

	var stream: AudioStreamWAV = sound_streams[resolved]
	if stream == null or _ui_players.is_empty():
		return false

	var base_db: float = float(SOUND_VOLUME_OFFSET_DB.get(resolved, 0.0))
	var final_db: float = clampf(master_volume_db + base_db + volume_offset_db, -60.0, 6.0)
	var player := _acquire_ui_player()
	player.stream = stream
	player.volume_db = final_db
	player.pitch_scale = clampf(pitch_scale, 0.5, 2.0)
	player.play()
	return true

func play_at(sfx_key: String, world_pos: Vector2, volume_offset_db: float = 0.0, pitch_jitter: float = 0.05) -> bool:
	var resolved := resolve_sfx_key(sfx_key)
	if not sound_streams.has(resolved):
		return false

	var spatial_db: float = _compute_spatial_db(world_pos)
	if spatial_db <= -79.0:
		return false

	if not _check_and_stamp_cooldown(resolved):
		return false

	_record_sfx_trigger(resolved, world_pos, false)

	if not _should_output_audio():
		return true

	var stream: AudioStreamWAV = sound_streams[resolved]
	if stream == null or _world_players.is_empty():
		return false

	var base_db: float = float(SOUND_VOLUME_OFFSET_DB.get(resolved, 0.0))
	var final_db: float = clampf(master_volume_db + base_db + volume_offset_db + spatial_db, -60.0, 6.0)
	var pitch: float = 1.0
	if pitch_jitter > 0.0:
		pitch = _pitch_rng.randf_range(1.0 - pitch_jitter, 1.0 + pitch_jitter)

	var player := _acquire_world_player()
	player.stream = stream
	player.volume_db = final_db
	player.pitch_scale = clampf(pitch, 0.5, 2.0)
	player.play()
	return true

func _should_output_audio() -> bool:
	if muted or volume_percent <= 0:
		return false
	if SimEngine != null and SimEngine.rts_mode == "backend" and not force_headless_playback:
		return false
	if DisplayServer.get_name() == "headless" and not force_headless_playback:
		return false
	return true

func _check_and_stamp_cooldown(resolved_key: String) -> bool:
	if not cooldown_enabled:
		return true
	var min_interval: float = float(SOUND_MIN_INTERVAL_SEC.get(resolved_key, 0.025))
	var now_sec: float = float(Time.get_ticks_msec()) * 0.001
	var prev_sec: float = float(_last_play_time_sec.get(resolved_key, -999.0))
	if now_sec - prev_sec < min_interval:
		return false
	_last_play_time_sec[resolved_key] = now_sec
	return true

func _compute_spatial_db(world_pos: Vector2) -> float:
	if world_3d == null or not is_instance_valid(world_3d):
		return 0.0
	if not world_3d.has_method("get_focus"):
		return 0.0
	var focus: Vector2 = world_3d.get_focus()
	var cam_h: float = float(world_3d.get("cam_height")) if world_3d.get("cam_height") != null else 58.0
	var max_audible_dist: float = maxf(68.0, cam_h * 1.35)
	var dist: float = focus.distance_to(world_pos)
	if dist > max_audible_dist:
		return -80.0
	var dist_ratio: float = clampf(dist / max_audible_dist, 0.0, 1.0)
	var dist_atten_db: float = -18.0 * (dist_ratio * dist_ratio)
	var zoom_ratio: float = clampf((cam_h - 45.0) / 180.0, 0.0, 1.0)
	var zoom_atten_db: float = -6.0 * zoom_ratio
	return dist_atten_db + zoom_atten_db

func _record_sfx_trigger(resolved_key: String, world_pos: Vector2, is_ui: bool) -> void:
	sfx_counts[resolved_key] = int(sfx_counts.get(resolved_key, 0)) + 1
	last_played_sfx = resolved_key
	var tick_val: int = SimEngine.tick if SimEngine != null else 0
	recent_sfx.append({
		"sfx": resolved_key,
		"pos": world_pos,
		"ui": is_ui,
		"tick": tick_val
	})
	if recent_sfx.size() > MAX_RECENT_SFX:
		recent_sfx.pop_front()
	emit_signal("sfx_triggered", resolved_key, world_pos, is_ui)

func _acquire_world_player() -> AudioStreamPlayer:
	for i in range(_world_players.size()):
		var idx: int = (_world_player_cursor + i) % _world_players.size()
		var p: AudioStreamPlayer = _world_players[idx]
		if not p.playing:
			_world_player_cursor = (idx + 1) % _world_players.size()
			return p
	var fallback: AudioStreamPlayer = _world_players[_world_player_cursor]
	_world_player_cursor = (_world_player_cursor + 1) % _world_players.size()
	return fallback

func _acquire_ui_player() -> AudioStreamPlayer:
	for i in range(_ui_players.size()):
		var idx: int = (_ui_player_cursor + i) % _ui_players.size()
		var p: AudioStreamPlayer = _ui_players[idx]
		if not p.playing:
			_ui_player_cursor = (idx + 1) % _ui_players.size()
			return p
	var fallback: AudioStreamPlayer = _ui_players[_ui_player_cursor]
	_ui_player_cursor = (_ui_player_cursor + 1) % _ui_players.size()
	return fallback

func get_weapon_sfx(weapon: Dictionary, unit_type: String = "") -> String:
	var explicit_sfx: String = str(weapon.get("sfx", ""))
	if explicit_sfx != "" and has_sfx(explicit_sfx):
		return resolve_sfx_key(explicit_sfx)
	var wpn_name: String = str(weapon.get("name", ""))
	if WEAPON_NAME_TO_SFX.has(wpn_name):
		return str(WEAPON_NAME_TO_SFX[wpn_name])
	if unit_type != "":
		var u_def: Dictionary = RTSData.get_unit_def(unit_type)
		var def_wpn: Dictionary = u_def.get("weapon", {})
		var def_sfx: String = str(def_wpn.get("sfx", ""))
		if def_sfx != "" and has_sfx(def_sfx):
			return resolve_sfx_key(def_sfx)
	var wpn_range: float = float(weapon.get("range", 5.0))
	return "claw_slash" if wpn_range <= 2.5 else "rifle_fire"

func is_melee_weapon(weapon: Dictionary) -> bool:
	var attack_type: String = str(weapon.get("attack_type", ""))
	if attack_type != "":
		return attack_type == "melee"
	var wpn_name: String = str(weapon.get("name", ""))
	if MELEE_WEAPONS.has(wpn_name):
		return true
	return float(weapon.get("range", 5.0)) <= 2.5

# =============================================================================
# SimEngine Signal Handlers
# =============================================================================

func _on_weapon_attack(attacker: Dictionary, target: Dictionary, weapon: Dictionary, hit_shields: bool) -> void:
	var attacker_pos: Vector2 = attacker.get("pos", Vector2.ZERO)
	var target_pos: Vector2 = target.get("pos", attacker_pos)
	var unit_type: String = str(attacker.get("unit_type", ""))

	_last_weapon_attack_tick = SimEngine.tick if SimEngine != null else -1
	_last_weapon_attack_pos = attacker_pos

	var primary_sfx: String = get_weapon_sfx(weapon, unit_type)
	play_at(primary_sfx, attacker_pos, 0.0, 0.055)

	if is_melee_weapon(weapon):
		play_at("melee_hit", target_pos, -2.5, 0.06)

	var splash_rad: float = float(weapon.get("splash_radius", 0.0))
	var impact_sfx: String = str(weapon.get("impact_sfx", ""))
	if impact_sfx != "" and has_sfx(impact_sfx):
		play_at(impact_sfx, target_pos, -1.0, 0.05)
	elif splash_rad > 0.0:
		play_at("explosion_splash", target_pos, -1.5, 0.05)

	if hit_shields or float(target.get("shields", 0.0)) > 0.0:
		play_at("shield_hit", target_pos, -2.0, 0.05)

func _on_projectile_fired(from_pos: Vector2, to_pos: Vector2, weapon_name: String, is_splash: bool, _owner_id: int) -> void:
	if SimEngine != null and _last_weapon_attack_tick == SimEngine.tick and _last_weapon_attack_pos.distance_squared_to(from_pos) < 0.05:
		return
	var sfx_key: String = str(WEAPON_NAME_TO_SFX.get(weapon_name, "rifle_fire"))
	play_at(sfx_key, from_pos, 0.0, 0.055)
	if MELEE_WEAPONS.has(weapon_name):
		play_at("melee_hit", to_pos, -2.5, 0.06)
	if is_splash:
		play_at("explosion_splash", to_pos, -1.5, 0.05)

func _on_ability_triggered(unit: Dictionary, ability_id: String, pos: Vector2) -> void:
	var ab_id: String = ability_id.to_lower()
	var ab_def: Dictionary = RTSData.get_ability_def(ab_id)
	var sfx_key: String = str(ab_def.get("sfx", ""))
	if sfx_key == "":
		match ab_id:
			"surge":
				sfx_key = "surge_activate"
			"charge":
				sfx_key = "charge_activate"
			"phase_step":
				sfx_key = "phase_step"
			"emplace", "mobilize", "mobile_mode":
				sfx_key = "siege_transform"
			"retract_silo", "extend_silo":
				sfx_key = "silo_gate"
	if sfx_key != "":
		play_at(sfx_key, pos, 0.0, 0.035)

func _on_unit_phased(_from_pos: Vector2, to_pos: Vector2, _unit_tag: int) -> void:
	play_at("phase_step", to_pos, 0.0, 0.035)

func _on_unit_destroyed(dead: Dictionary) -> void:
	if bool(dead.get("cancelled", false)):
		return
	var pos: Vector2 = dead.get("pos", Vector2.ZERO)
	if bool(dead.get("is_structure", false)):
		play_at("structure_destroyed", pos, 0.0, 0.04)
		return
	var faction: String = str(dead.get("faction", RTSData.FACTION_HUMANS))
	match faction:
		RTSData.FACTION_MONSTERS:
			play_at("unit_death_monster", pos, 0.0, 0.05)
		RTSData.FACTION_ALIENS:
			play_at("unit_death_alien", pos, 0.0, 0.05)
		_:
			play_at("unit_death_human", pos, 0.0, 0.05)

func _on_resource_gathered(unit: Dictionary, _resource_type: String, pos: Vector2) -> void:
	if int(unit.get("owner", 0)) == local_player_id:
		play_at("harvest_hit", pos, -2.0, 0.06)

func _on_unit_production_finished(unit: Dictionary, _structure: Dictionary) -> void:
	if int(unit.get("owner", 0)) == local_player_id:
		play_at("unit_ready", unit.get("pos", Vector2.ZERO), -1.0, 0.03)

func _on_unit_repaired(worker: Dictionary, _target: Dictionary, _amount: float) -> void:
	play_at("arc_welder",worker.pos,-5.0,0.03)

func _on_structure_construction_finished(structure: Dictionary) -> void:
	if int(structure.get("owner", 0)) == local_player_id:
		play_at("structure_complete", structure.get("pos", Vector2.ZERO), 0.0, 0.02)

func _on_sim_notice(owner_id: int, text: String, kind: String) -> void:
	var lower_text: String = text.to_lower()
	var cur_tick: int = SimEngine.tick if SimEngine != null else 0
	if lower_text.find("wins by") != -1 or lower_text in ["victory", "defeat", "draw"]:
		if _last_match_outcome_tick == cur_tick:
			return
		_last_match_outcome_tick = cur_tick
		var winner_id: int = int(SimEngine.match_state.get("winner", 0)) if SimEngine != null else 0
		if winner_id == local_player_id:
			play_ui("match_victory")
		else:
			play_ui("match_defeat")
		return
	if owner_id == local_player_id and kind == "error":
		play_ui("ui_error")

func _on_scenario_loaded(_scenario_name: String) -> void:
	_last_weapon_attack_tick = -1
	_last_weapon_attack_pos = Vector2.INF
	_last_match_outcome_tick = -1
