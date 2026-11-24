extends Control

signal movie_finished(movie_id: String, skipped: bool)

const Models = preload("res://scripts/RTSModels.gd")
const PlanetShader = preload("res://scripts/campaign/rts_planet.gdshader")
const ConsoleTheme = preload("res://scripts/campaign/RTSConsoleTheme.gd")
const CutsceneData = preload("res://scripts/campaign/RTSCutsceneData.gd")

var play_internal_voice := true
var is_playing := false
var current_movie_id := ""
var voice_started := false
var last_voice_cue_id := ""

var _movie: Dictionary = {}
var _shots: Array = []
var _shot_index := 0
var _shot_elapsed := 0.0
var _active_shot_duration := 3.2
var _total_elapsed := 0.0
var _total_duration := 1.0
var _using_ogv := false

var _planet_bg: ColorRect
var _planet_mat: ShaderMaterial
var _plate_holder: Control
var _plate_rect: TextureRect
var _vp_container: SubViewportContainer
var _vp: SubViewport
var _cam: Camera3D
var _world_root: Node3D
var _env: Environment
var _actors: Array[Dictionary] = []
var _tracers: Array[Dictionary] = []
var _tracer_timer := 0.0
var _cam_from := Vector3(-8, 4.5, 8.5)
var _cam_to := Vector3(-4, 3.5, 5.8)
var _cam_look := Vector3.ZERO

var _frn_overlay: Control
var _frn_headline: Label
var _frn_ticker: Label
var _ogv_player: VideoStreamPlayer
var _flash_rect: ColorRect

var _top_title: Label
var _top_telemetry: Label
var _portrait_box: PanelContainer
var _portrait_tex: TextureRect
var _speaker_label: Label
var _subtitle_label: Label
var _progress_fill: ColorRect
var _skip_btn: Button
var _voice_player: AudioStreamPlayer
var _sfx_player: AudioStreamPlayer
var _tex_cache: Dictionary = {}

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	hide()

	var black := ColorRect.new()
	black.color = Color("#03060a")
	black.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	black.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(black)

	# Layer 1: Planet shader backdrop (used for orbital fleet shots)
	_planet_bg = ColorRect.new()
	_planet_bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_planet_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_planet_mat = ShaderMaterial.new()
	_planet_mat.shader = PlanetShader
	_planet_mat.set_shader_parameter("viewport_aspect", Vector2(1920.0 / 1080.0, 1.0))
	_planet_bg.material = _planet_mat
	add_child(_planet_bg)

	# Layer 2: Ken-Burns widescreen plate holder (Launch Bay / Bridge / Cantina / Lab / FRN Studio)
	_plate_holder = Control.new()
	_plate_holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_plate_holder.clip_contents = true
	_plate_holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_plate_holder)

	_plate_rect = TextureRect.new()
	_plate_rect.position = Vector2.ZERO
	_plate_rect.size = Vector2(1920, 1080)
	_plate_rect.pivot_offset = Vector2(960, 540)
	_plate_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_plate_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_plate_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_plate_holder.add_child(_plate_rect)

	# Layer 3: Real-time 3D Cinema SubViewport (full-screen or composited into FRN studio wall monitor!)
	_build_3d_stage()

	# Layer 4: FRN Interstellar Broadcast graphics overlay
	_build_frn_overlay()

	# Layer 5: Optional native .ogv VideoStreamPlayer
	_ogv_player = VideoStreamPlayer.new()
	_ogv_player.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_ogv_player.expand = true
	_ogv_player.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ogv_player.hide()
	_ogv_player.finished.connect(func(): finish_movie(false))
	add_child(_ogv_player)

	# Layer 6: Shot cut transition flash + Cinema letterbox bars & subtitles
	_flash_rect = ColorRect.new()
	_flash_rect.color = Color(0.85, 0.96, 1.0, 0.0)
	_flash_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_flash_rect)

	_build_letterbox_chrome()
	_build_audio()
	set_process(false)

func _build_3d_stage() -> void:
	if DisplayServer.get_name() == "headless":
		return
	_vp_container = SubViewportContainer.new()
	_vp_container.position = Vector2.ZERO
	_vp_container.size = Vector2(1920, 1080)
	_vp_container.stretch = true
	_vp_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_vp_container)

	_vp = SubViewport.new()
	_vp.size = Vector2i(1280, 720)
	_vp.own_world_3d = true
	_vp.msaa_3d = Viewport.MSAA_2X
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_vp_container.add_child(_vp)

	_env = Environment.new()
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#0b1522")
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = Color("#9db8cc")
	_env.ambient_light_energy = 0.78
	_env.fog_enabled = true
	_env.fog_light_color = Color("#152436")
	_env.fog_density = 0.015
	var we := WorldEnvironment.new()
	we.environment = _env
	_vp.add_child(we)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-42.0, -34.0, 0.0)
	key_light.light_color = Color("#fff0dc")
	key_light.light_energy = 1.4
	_vp.add_child(key_light)

	var rim_light := DirectionalLight3D.new()
	rim_light.rotation_degrees = Vector3(-18.0, 145.0, 0.0)
	rim_light.light_color = Color("#46e8ff")
	rim_light.light_energy = 0.85
	_vp.add_child(rim_light)

	_cam = Camera3D.new()
	_cam.fov = 35.0
	_cam.near = 0.1
	_cam.far = 200.0
	_vp.add_child(_cam)

	_world_root = Node3D.new()
	_vp.add_child(_world_root)

func _build_frn_overlay() -> void:
	_frn_overlay = Control.new()
	_frn_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_frn_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frn_overlay.hide()
	add_child(_frn_overlay)

	# Live badge at upper-left below top cinema bar
	var live_badge := PanelContainer.new()
	live_badge.position = Vector2(64, 126)
	live_badge.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.68, 0.08, 0.12, 0.94), Color("#ff6b78"), 2, 2, 14, 5))
	_frn_overlay.add_child(live_badge)
	var live_lbl := Label.new()
	live_lbl.text = "● LIVE  //  FRN INTERSTELLAR NEWS"
	live_lbl.add_theme_font_override("font", ConsoleTheme.title_font())
	live_lbl.add_theme_font_size_override("font_size", 15)
	live_lbl.add_theme_color_override("font_color", Color.WHITE)
	live_badge.add_child(live_lbl)

	# Frame border around the studio's right-hand monitor feed (Rect2(1176, 226, 636, 336))
	var feed_border := PanelContainer.new()
	feed_border.position = Vector2(1174, 224)
	feed_border.size = Vector2(640, 340)
	var fb_style := ConsoleTheme.style_box(Color.TRANSPARENT, Color("#4ad8ff"), 2, 4, 0, 0)
	fb_style.draw_center = false
	feed_border.add_theme_stylebox_override("panel", fb_style)
	_frn_overlay.add_child(feed_border)

	# Lower-third breaking news banner above the bottom cinema bar
	var chyron := PanelContainer.new()
	chyron.position = Vector2(64, 818)
	chyron.size = Vector2(1792, 74)
	chyron.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color(0.05, 0.09, 0.14, 0.94), Color("#e03848"), 2, 2, 18, 8))
	_frn_overlay.add_child(chyron)

	var cv := VBoxContainer.new()
	cv.add_theme_constant_override("separation", 2)
	chyron.add_child(cv)

	_frn_headline = Label.new()
	_frn_headline.add_theme_font_override("font", ConsoleTheme.title_font())
	_frn_headline.add_theme_font_size_override("font_size", 20)
	_frn_headline.add_theme_color_override("font_color", Color("#ff6e7a"))
	cv.add_child(_frn_headline)

	_frn_ticker = Label.new()
	_frn_ticker.add_theme_font_override("font", ConsoleTheme.body_font())
	_frn_ticker.add_theme_font_size_override("font_size", 15)
	_frn_ticker.add_theme_color_override("font_color", Color("#dcecf7"))
	_frn_ticker.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	cv.add_child(_frn_ticker)

func _build_letterbox_chrome() -> void:
	# Top anamorphic cinema bar
	var top_bar := ColorRect.new()
	top_bar.position = Vector2.ZERO
	top_bar.size = Vector2(1920, 104)
	top_bar.color = Color("#04080d")
	top_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(top_bar)

	var top_line := ColorRect.new()
	top_line.position = Vector2(0, 103)
	top_line.size = Vector2(1920, 2)
	top_line.color = Color(0.24, 0.62, 0.68, 0.55)
	top_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(top_line)

	_top_title = Label.new()
	_top_title.position = Vector2(56, 38)
	_top_title.add_theme_font_override("font", ConsoleTheme.title_font())
	_top_title.add_theme_font_size_override("font_size", 21)
	_top_title.add_theme_color_override("font_color", Color("#d8f3ff"))
	add_child(_top_title)

	_top_telemetry = Label.new()
	_top_telemetry.position = Vector2(960, 40)
	_top_telemetry.size = Vector2(904, 30)
	_top_telemetry.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_top_telemetry.add_theme_font_override("font", ConsoleTheme.title_font())
	_top_telemetry.add_theme_font_size_override("font_size", 15)
	_top_telemetry.add_theme_color_override("font_color", Color("#58e884"))
	add_child(_top_telemetry)

	# Bottom anamorphic cinema bar
	var bot_bar := ColorRect.new()
	bot_bar.position = Vector2(0, 912)
	bot_bar.size = Vector2(1920, 168)
	bot_bar.color = Color("#04080d")
	bot_bar.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(bot_bar)

	var bot_line := ColorRect.new()
	bot_line.position = Vector2(0, 911)
	bot_line.size = Vector2(1920, 2)
	bot_line.color = Color(0.24, 0.62, 0.68, 0.65)
	bot_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bot_line)

	var prog_track := ColorRect.new()
	prog_track.position = Vector2(56, 1056)
	prog_track.size = Vector2(1540, 4)
	prog_track.color = Color("#122833")
	add_child(prog_track)

	_progress_fill = ColorRect.new()
	_progress_fill.position = Vector2(56, 1056)
	_progress_fill.size = Vector2(0, 4)
	_progress_fill.color = Color("#46ff70")
	add_child(_progress_fill)

	_portrait_box = PanelContainer.new()
	_portrait_box.position = Vector2(56, 930)
	_portrait_box.size = Vector2(108, 108)
	_portrait_box.add_theme_stylebox_override("panel", ConsoleTheme.style_box(Color("#071319"), Color("#3e8494"), 2, 2, 3, 3))
	add_child(_portrait_box)

	_portrait_tex = TextureRect.new()
	_portrait_tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait_tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_portrait_box.add_child(_portrait_tex)

	_speaker_label = Label.new()
	_speaker_label.position = Vector2(184, 930)
	_speaker_label.add_theme_font_override("font", ConsoleTheme.title_font())
	_speaker_label.add_theme_font_size_override("font_size", 18)
	_speaker_label.add_theme_color_override("font_color", Color("#5ef090"))
	add_child(_speaker_label)

	_subtitle_label = Label.new()
	_subtitle_label.position = Vector2(184, 960)
	_subtitle_label.size = Vector2(1390, 82)
	_subtitle_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_subtitle_label.add_theme_font_override("font", ConsoleTheme.body_font())
	_subtitle_label.add_theme_font_size_override("font_size", 22)
	_subtitle_label.add_theme_color_override("font_color", Color("#edf7ff"))
	add_child(_subtitle_label)

	var skip_hint := Label.new()
	skip_hint.text = "Space or Esc to skip"
	skip_hint.position = Vector2(1624, 934)
	skip_hint.size = Vector2(240, 22)
	skip_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	skip_hint.add_theme_font_size_override("font_size", 14)
	skip_hint.add_theme_color_override("font_color", Color("#87a8b8"))
	add_child(skip_hint)

	_skip_btn = Button.new()
	_skip_btn.text = "SKIP MOVIE ▸"
	_skip_btn.position = Vector2(1636, 966)
	_skip_btn.size = Vector2(228, 48)
	ConsoleTheme.apply_emerald_button(_skip_btn, 18, false)
	_skip_btn.pressed.connect(func(): skip())
	add_child(_skip_btn)

func _build_audio() -> void:
	_voice_player = AudioStreamPlayer.new()
	_voice_player.bus = "SFX"
	add_child(_voice_player)
	RTSMusic.watch_campaign_voice(_voice_player)

	_sfx_player = AudioStreamPlayer.new()
	_sfx_player.bus = "SFX"
	_sfx_player.volume_db = -10.0
	add_child(_sfx_player)

func _make_cinema_boom_wav() -> AudioStreamWAV:
	# Synthesizes a warm low-frequency orbital thruster & warp-in cinema swell
	var rate := 22050
	var secs := 2.4
	var samples := int(rate * secs)
	var data := PackedByteArray()
	data.resize(samples * 2)
	for i in samples:
		var t := float(i) / float(rate)
		var env := sin(minf(1.0, t / 0.35) * PI * 0.5) * exp(-t * 0.85)
		var sub := sin(TAU * (52.0 - t * 8.0) * t) * 0.55
		var harm := sin(TAU * 104.0 * t + sin(TAU * 3.0 * t) * 1.4) * 0.25
		var hiss := (sin(t * 9437.0) * cos(t * 5113.0)) * 0.08
		var v := clampi(int((sub + harm + hiss) * env * 14000.0), -32767, 32767)
		data[i * 2] = v & 0xff
		data[i * 2 + 1] = (v >> 8) & 0xff
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	wav.stereo = false
	wav.data = data
	return wav

func _load_tex(res_path: String) -> Texture2D:
	if DisplayServer.get_name() == "headless" or res_path.is_empty():
		return null
	if _tex_cache.has(res_path):
		return _tex_cache[res_path]
	var out: Texture2D = null
	if ResourceLoader.exists(res_path, "Texture2D"):
		var loaded = load(res_path)
		if loaded is Texture2D:
			out = loaded
	if out == null and FileAccess.file_exists(res_path):
		var bytes := FileAccess.get_file_as_bytes(res_path)
		var img := Image.new()
		var ext := res_path.get_extension().to_lower()
		var err := img.load_webp_from_buffer(bytes) if ext == "webp" else (img.load_png_from_buffer(bytes) if ext == "png" else img.load_jpg_from_buffer(bytes))
		if err == OK and not img.is_empty():
			out = ImageTexture.create_from_image(img)
	if out != null:
		_tex_cache[res_path] = out
	return out

func _resolve_ogv_override(movie_id: String) -> String:
	var candidate := "res://assets/movies/%s.ogv" % movie_id
	if ResourceLoader.exists(candidate) or FileAccess.file_exists(candidate):
		return candidate
	return ""

func play_movie_spec(spec: Dictionary, mark_as_seen: bool = true) -> void:
	stop_all_media()
	_movie = spec
	current_movie_id = str(spec.get("id", "cutscene"))
	if mark_as_seen:
		CutsceneData.mark_seen(current_movie_id)

	is_playing = true
	voice_started = false
	last_voice_cue_id = ""
	_shots = spec.get("shots", [])
	_shot_index = 0
	_shot_elapsed = 0.0
	_total_elapsed = 0.0
	_total_duration = 0.1
	for s in _shots:
		var base_d := float(s.get("duration", 3.2))
		var scue := str(s.get("voice_cue", ""))
		if not scue.is_empty():
			var st := RTSAudio.load_campaign_voice(scue)
			if st != null:
				base_d = maxf(base_d, st.get_length() + 0.45)
		_total_duration += base_d

	_top_title.text = str(spec.get("title", "STARFALL COMMAND"))
	show()
	if is_visible_in_tree() and _skip_btn:
		_skip_btn.grab_focus()

	if DisplayServer.get_name() == "headless":
		var head_cue := str(_shots[0].get("voice_cue", spec.get("voice_cue", ""))) if not _shots.is_empty() else str(spec.get("voice_cue", ""))
		if not head_cue.is_empty() and RTSAudio.load_campaign_voice(head_cue) != null:
			last_voice_cue_id = head_cue
			voice_started = RTSAudio.can_play_campaign_voice()
		set_process(true)
		return

	if _vp:
		_vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS

	var p: Dictionary = spec.get("planet", {})
	if not p.is_empty() and _planet_mat:
		_planet_mat.set_shader_parameter("primary_color", p.primary)
		_planet_mat.set_shader_parameter("secondary_color", p.secondary)
		_planet_mat.set_shader_parameter("accent_color", p.accent)
		_planet_mat.set_shader_parameter("atmo_color", p.atmo)
		_planet_mat.set_shader_parameter("glow_color", p.glow)
		_planet_mat.set_shader_parameter("cloud_density", float(p.clouds))
		_planet_mat.set_shader_parameter("glow_strength", float(p.glow_strength))
		_planet_mat.set_shader_parameter("planet_seed", float(p.seed))

	if RTSAudio.can_play_campaign_voice():
		_sfx_player.stream = _make_cinema_boom_wav()
		_sfx_player.play()

	var ogv_path := _resolve_ogv_override(current_movie_id)
	_using_ogv = not ogv_path.is_empty()
	if _using_ogv:
		var stream := VideoStreamTheora.new()
		stream.set_file(ogv_path)
		_ogv_player.stream = stream
		_ogv_player.show()
		_ogv_player.play()
	else:
		_ogv_player.hide()
		_enter_shot(0)

	set_process(true)

func skip() -> void:
	if is_playing:
		finish_movie(true)

func finish_movie(skipped: bool) -> void:
	if not is_playing:
		return
	var finished_id := current_movie_id
	is_playing = false
	stop_all_media()
	hide()
	set_process(false)
	movie_finished.emit(finished_id, skipped)

func stop_all_media() -> void:
	if _voice_player and _voice_player.playing:
		_voice_player.stop()
	if _sfx_player and _sfx_player.playing:
		_sfx_player.stop()
	if _ogv_player and _ogv_player.is_playing():
		_ogv_player.stop()
	if _vp:
		_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_clear_3d_stage()

func _unhandled_key_input(event: InputEvent) -> void:
	if not is_playing or not visible:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode in [KEY_SPACE, KEY_ESCAPE, KEY_ENTER]:
			skip()
			get_viewport().set_input_as_handled()

func _process(delta: float) -> void:
	if not is_playing:
		return
	_total_elapsed += delta
	_progress_fill.size.x = 1540.0 * clampf(_total_elapsed / _total_duration, 0.0, 1.0)

	if _flash_rect.color.a > 0.0:
		_flash_rect.color.a = maxf(0.0, _flash_rect.color.a - delta * 2.8)

	if _using_ogv or _shots.is_empty():
		if _total_elapsed >= _total_duration and not _using_ogv:
			finish_movie(false)
		return

	_shot_elapsed += delta
	var shot: Dictionary = _shots[_shot_index]
	var dur := maxf(0.2, _active_shot_duration)
	var progress := clampf(_shot_elapsed / dur, 0.0, 1.0)
	_animate_active_shot(shot, delta, progress)

	if _shot_elapsed >= dur:
		if _shot_index + 1 < _shots.size():
			_enter_shot(_shot_index + 1)
		else:
			finish_movie(false)

func _enter_shot(idx: int) -> void:
	_shot_index = idx
	_shot_elapsed = 0.0
	_flash_rect.color.a = 0.28 if idx > 0 else 0.45

	var shot: Dictionary = _shots[idx]
	_active_shot_duration = maxf(0.2, float(shot.get("duration", 3.2)))
	if _voice_player and _voice_player.playing:
		_voice_player.stop()
	var shot_cue := str(shot.get("voice_cue", ""))
	if shot_cue.is_empty() and idx == 0:
		shot_cue = str(_movie.get("voice_cue", ""))
	if not shot_cue.is_empty():
		var v_stream := RTSAudio.load_campaign_voice(shot_cue)
		if v_stream != null:
			last_voice_cue_id = shot_cue
			_active_shot_duration = maxf(_active_shot_duration, v_stream.get_length() + 0.45)
			if play_internal_voice and RTSAudio.can_play_campaign_voice():
				_voice_player.stream = v_stream
				_voice_player.play()
				voice_started = true

	_top_telemetry.text = str(shot.get("telemetry", ""))
	_speaker_label.text = str(shot.get("speaker", ""))
	_subtitle_label.text = str(shot.get("line", ""))

	var portrait_id := str(shot.get("portrait", "")) if shot.has("portrait") else str(_movie.get("portrait", ""))
	if portrait_id.is_empty():
		_portrait_box.hide()
		_speaker_label.position.x = 56
		_subtitle_label.position.x = 56
	else:
		var ptex := _load_tex("res://assets/ui/campaign/portrait_%s.webp" % portrait_id)
		_portrait_tex.texture = ptex
		_portrait_box.visible = ptex != null
		_speaker_label.position.x = 184 if _portrait_box.visible else 56
		_subtitle_label.position.x = 184 if _portrait_box.visible else 56

	_planet_bg.hide()
	_plate_holder.hide()
	_frn_overlay.hide()
	if _vp_container:
		_vp_container.hide()
		_vp_container.position = Vector2.ZERO
		_vp_container.size = Vector2(1920, 1080)
		_vp.transparent_bg = false

	var kind := str(shot.get("kind", "plate"))
	match kind:
		"orbital_fleet":
			_planet_bg.show()
			if _vp_container:
				_vp.transparent_bg = true
				_vp_container.show()
				_stage_orbital_fleet()
		"plate":
			_plate_rect.texture = _load_tex(str(shot.get("plate", "")))
			_plate_holder.show()
		"frn_broadcast":
			_plate_rect.texture = _load_tex("res://assets/ui/campaign/frn_broadcast_studio.webp")
			_plate_rect.scale = Vector2.ONE
			_plate_rect.position = Vector2.ZERO
			_plate_holder.show()
			_frn_headline.text = "BREAKING NEWS  //  " + str(shot.get("headline", "SECTOR ALERT"))
			_frn_ticker.text = str(shot.get("ticker", ""))
			_frn_overlay.show()
			if _vp_container:
				_vp_container.position = Vector2(1176, 226)
				_vp_container.size = Vector2(636, 336)
				_vp_container.show()
				_stage_diorama(str(shot.get("diorama", "m0_vesper")))
		"diorama_3d":
			if _vp_container:
				_vp_container.show()
				_stage_diorama(str(shot.get("diorama", "m0_vesper")))
		"unit_trial_3d":
			if _vp_container:
				_vp_container.show()
				_stage_unit_trial(str(shot.get("unit_id", "rifleman")), bool(shot.get("dropship_entry", false)))

func _animate_active_shot(shot: Dictionary, delta: float, progress: float) -> void:
	var kind := str(shot.get("kind", "plate"))
	if kind == "plate":
		var z0 := float(shot.get("zoom_from", 1.0))
		var z1 := float(shot.get("zoom_to", 1.08))
		var z := lerpf(z0, z1, smoothstep(0.0, 1.0, progress))
		var pan: Vector2 = shot.get("pan", Vector2.ZERO)
		_plate_rect.scale = Vector2(z, z)
		_plate_rect.position = pan * progress
		return

	if DisplayServer.get_name() == "headless" or _cam == null:
		return

	_cam.position = _cam_from.lerp(_cam_to, smoothstep(0.0, 1.0, progress))
	_cam.look_at(_cam_look, Vector3.UP)

	for actor in _actors:
		var node: Node3D = actor.node
		if not is_instance_valid(node):
			continue
		node.position += (actor.vel as Vector3) * delta
		if actor.get("hover", false):
			node.position.y += sin(_total_elapsed * 3.4 + float(actor.seed)) * 0.008

	_tracer_timer -= delta
	if _tracer_timer <= 0.0:
		_tracer_timer = 0.24
		_spawn_tracer_bursts()

	for i in range(_tracers.size() - 1, -1, -1):
		var tr: Dictionary = _tracers[i]
		tr.life -= delta
		var mesh_i: MeshInstance3D = tr.node
		if tr.life <= 0.0 or not is_instance_valid(mesh_i):
			if is_instance_valid(mesh_i):
				mesh_i.queue_free()
			_tracers.remove_at(i)
		else:
			mesh_i.position = (tr.from as Vector3).lerp(tr.to as Vector3, 1.0 - tr.life / tr.max_life)

func _clear_3d_stage() -> void:
	_actors.clear()
	_tracers.clear()
	if _world_root == null:
		return
	for child in _world_root.get_children():
		child.queue_free()

func _stage_orbital_fleet() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_CLEAR_COLOR
	_env.fog_enabled = false

	var fleet := [
		{"unit": "dreadnought", "pos": Vector3(-5.2, 0.9, 0.6), "vel": Vector3(0.95, -0.04, -0.32), "scale": 0.56},
		{"unit": "rampart_transport", "pos": Vector3(-2.0, -0.8, 2.6), "vel": Vector3(1.25, -0.08, -0.42), "scale": 0.48},
		{"unit": "rampart_transport", "pos": Vector3(-6.4, -1.1, 2.8), "vel": Vector3(1.22, -0.08, -0.42), "scale": 0.48},
		{"unit": "kestrel_interceptor", "pos": Vector3(-1.4, 1.5, 1.8), "vel": Vector3(1.60, -0.06, -0.52), "scale": 0.46},
		{"unit": "kestrel_interceptor", "pos": Vector3(-3.4, 2.0, -0.6), "vel": Vector3(1.60, -0.06, -0.52), "scale": 0.46},
	]
	for idx in fleet.size():
		var f: Dictionary = fleet[idx]
		var uid: String = f.unit
		if not RTSData.units.has(uid):
			continue
		var m: Node3D = Models.build(uid, 1, false)
		m.position = f.pos
		m.rotation = Vector3(-0.08, -0.48, -0.06)
		var s := float(f.scale)
		m.scale = Vector3(s, s, s)
		_add_thruster_glow(m)
		_world_root.add_child(m)
		_actors.append({"node": m, "vel": f.vel, "hover": true, "seed": idx * 1.7, "fire_at": null})

	_cam_from = Vector3(-13.6, 2.1, 13.2)
	_cam_to = Vector3(-9.4, 1.4, 10.0)
	_cam_look = Vector3(-0.8, 0.1, -0.4)

func _add_thruster_glow(ship: Node3D) -> void:
	var cone := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.04
	cyl.bottom_radius = 0.34
	cyl.height = 1.4
	cone.mesh = cyl
	cone.rotation_degrees = Vector3(0.0, 0.0, 90.0)
	cone.position = Vector3(-1.3, 0.35, 0.0)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.32, 0.92, 1.0, 0.85)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cone.material_override = mat
	ship.add_child(cone)

func _stage_diorama(diorama_key: String) -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	var spec: Dictionary = CutsceneData.DIORAMA_SPECS.get(diorama_key, CutsceneData.DIORAMA_SPECS["m0_vesper"])
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = spec.sky
	_env.fog_enabled = true
	_env.fog_light_color = spec.fog
	_env.fog_density = 0.022

	# Ground terrain plane + ridge props
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(60.0, 60.0)
	ground.mesh = plane
	var gmat := StandardMaterial3D.new()
	var badlands := _load_tex("res://assets/terrain/badlands.webp")
	if badlands:
		gmat.albedo_texture = badlands
		gmat.uv1_scale = Vector3(7.0, 7.0, 1.0)
	gmat.albedo_color = (spec.ground as Color).lightened(0.22)
	gmat.roughness = 0.90
	if spec.get("lava_glow", false):
		gmat.emission_enabled = true
		gmat.emission = Color("#ff3b08")
		gmat.emission_energy_multiplier = 0.35
	ground.material_override = gmat
	_world_root.add_child(ground)

	# Layered distant mesa cliffs & tactical barricades for horizon depth
	var rmat := StandardMaterial3D.new()
	rmat.albedo_color = (spec.ground as Color).darkened(0.32)
	rmat.roughness = 0.95
	var cliffs := [
		{"size": Vector3(16.0, 3.6, 6.0), "pos": Vector3(-8.5, 1.6, -15.5), "yaw": 0.18},
		{"size": Vector3(14.0, 4.8, 5.5), "pos": Vector3(6.5, 2.1, -17.0), "yaw": -0.28},
		{"size": Vector3(9.5, 2.2, 4.5), "pos": Vector3(12.0, 1.0, -11.5), "yaw": -0.42},
	]
	for c in cliffs:
		var ridge := MeshInstance3D.new()
		var rbox := BoxMesh.new()
		rbox.size = c.size
		ridge.mesh = rbox
		ridge.position = c.pos
		ridge.rotation.y = float(c.yaw)
		ridge.material_override = rmat
		_world_root.add_child(ridge)

	var actor_list: Array = spec.actors
	for idx in actor_list.size():
		var a: Dictionary = actor_list[idx]
		var uid: String = str(a.unit)
		if not RTSData.units.has(uid):
			continue
		var m: Node3D = Models.build(uid, int(a.owner), uid == "rifleman" and idx == 1)
		m.position = a.pos
		m.rotation.y = float(a.get("yaw", 0.0))
		if a.get("flame", false):
			_attach_flame_plume(m)
		if a.has("beam_to"):
			_spawn_beam(a.pos + Vector3(0, 1.4, 0), a.beam_to)
		_world_root.add_child(m)
		_actors.append({
			"node": m, "vel": a.vel, "hover": (a.pos as Vector3).y > 1.5,
			"seed": idx * 1.3, "fire_at": a.get("fire_at", null), "owner": int(a.owner),
		})

	_cam_from = spec.cam_from
	_cam_to = spec.cam_to
	_cam_look = spec.look
	_tracer_timer = 0.05

func _stage_unit_trial(unit_id: String, dropship_entry: bool) -> void:
	_clear_3d_stage()
	if _world_root == null or not RTSData.units.has(unit_id):
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#08141c")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#122836")
	_env.fog_density = 0.02

	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(50.0, 50.0)
	ground.mesh = plane
	var gmat := StandardMaterial3D.new()
	var paving := _load_tex("res://assets/terrain/military-paving.webp")
	if paving:
		gmat.albedo_texture = paving
		gmat.uv1_scale = Vector3(8.0, 8.0, 1.0)
	gmat.albedo_color = Color("#5f7582")
	ground.material_override = gmat
	_world_root.add_child(ground)

	if dropship_entry and RTSData.units.has("rampart_transport"):
		var ship: Node3D = Models.build("rampart_transport", 1, false)
		ship.position = Vector3(-2.8, 3.8, -1.6)
		ship.rotation.y = -0.35
		_add_thruster_glow(ship)
		_world_root.add_child(ship)
		_actors.append({"node": ship, "vel": Vector3(0.4, -0.32, 0.15), "hover": true, "seed": 0.5, "fire_at": null})

	var def: Dictionary = RTSData.units[unit_id]
	var count := 1 if bool(def.get("is_structure", false)) or float(def.get("radius", 1.0)) > 1.25 else 3
	var offsets := [Vector3(0, 0, 0), Vector3(-1.8, 0, 1.1), Vector3(1.6, 0, -1.1)]
	for i in count:
		var u: Node3D = Models.build(unit_id, 1, false)
		u.position = offsets[i] + (Vector3(0, 2.2, 0) if unit_id in ["kestrel_interceptor", "rampart_transport", "sky_sentry", "night_harrier", "dreadnought"] else Vector3.ZERO)
		u.rotation.y = -0.45
		if unit_id in ["torchguard", "cinder_runner"]:
			_attach_flame_plume(u)
		_world_root.add_child(u)
		var vel := Vector3.ZERO if bool(def.get("is_structure", false)) else Vector3(0.65, 0.0, -0.32)
		_actors.append({"node": u, "vel": vel, "hover": false, "seed": i * 1.1, "fire_at": Vector3(5.5, 0.9, -2.6), "owner": 1})

	_cam_from = Vector3(-6.8, 3.8, 6.8)
	_cam_to = Vector3(-3.6, 2.8, 4.6)
	_cam_look = Vector3(0.6, 1.0, -0.4)
	_tracer_timer = 0.12

func _attach_flame_plume(parent_node: Node3D) -> void:
	var plume := MeshInstance3D.new()
	var cone := CylinderMesh.new()
	cone.top_radius = 0.08
	cone.bottom_radius = 0.72
	cone.height = 3.2
	plume.mesh = cone
	plume.rotation_degrees = Vector3(0.0, 0.0, -90.0)
	plume.position = Vector3(2.1, 0.75, 0.0)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.52, 0.12, 0.72)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	plume.material_override = mat
	parent_node.add_child(plume)

func _spawn_beam(from_pt: Vector3, to_pt: Vector3) -> void:
	var dir := to_pt - from_pt
	var length := dir.length()
	if length < 0.1:
		return
	var beam := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.18
	cyl.bottom_radius = 0.24
	cyl.height = length
	beam.mesh = cyl
	beam.position = (from_pt + to_pt) * 0.5
	beam.look_at_from_position(beam.position, to_pt, Vector3.UP)
	beam.rotate_object_local(Vector3.RIGHT, PI * 0.5)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.42, 0.96, 1.0, 0.92)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	beam.material_override = mat
	_world_root.add_child(beam)

func _spawn_tracer_bursts() -> void:
	if _world_root == null:
		return
	for actor in _actors:
		var tgt = actor.get("fire_at", null)
		var node: Node3D = actor.node
		if tgt == null or not is_instance_valid(node):
			continue
		var start_p := node.position + Vector3(0, 0.85, 0)
		var bolt := MeshInstance3D.new()
		var s := SphereMesh.new()
		s.radius = 0.11
		s.height = 0.22
		bolt.mesh = s
		bolt.position = start_p
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.albedo_color = Color("#7affb2") if int(actor.get("owner", 1)) == 1 else Color("#ff6852")
		bolt.material_override = mat
		_world_root.add_child(bolt)
		_tracers.append({"node": bolt, "from": start_p, "to": tgt, "life": 0.22, "max_life": 0.22})
