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
var _key_light: DirectionalLight3D
var _rim_light: DirectionalLight3D
var _world_root: Node3D
var _env: Environment
var _actors: Array[Dictionary] = []
var _tracers: Array[Dictionary] = []
var _fx_items: Array[Dictionary] = []
var _pending_sfx: Array[Dictionary] = []
var _tracer_timer := 0.0
var _shell_timer := 0.0
var _cam_from := Vector3(-8, 4.5, 8.5)
var _cam_mid := Vector3(-6, 4.0, 7.1)
var _cam_to := Vector3(-4, 3.5, 5.8)
var _cam_look := Vector3.ZERO
var _cam_look_to := Vector3.ZERO
var _fov_from := 35.0
var _fov_to := 35.0
var _roll_from := 0.0
var _roll_to := 0.0
var _shake_amp := 0.0
var _use_bezier_cam := false

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
var _foley_player: AudioStreamPlayer
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
	_vp.size = Vector2i(1920, 1080)
	_vp.own_world_3d = true
	_vp.msaa_3d = Viewport.MSAA_4X
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_vp_container.add_child(_vp)

	_env = Environment.new()
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#0b1522")
	_env.tonemap_mode = Environment.TONE_MAPPER_ACES
	_env.tonemap_exposure = 0.98
	_env.tonemap_white = 4.8
	_env.glow_enabled = true
	_env.glow_hdr_threshold = 1.25
	_env.glow_intensity = 0.34
	_env.glow_bloom = 0.06
	_env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = Color("#9db8cc")
	_env.ambient_light_energy = 0.78
	_env.fog_enabled = true
	_env.fog_light_color = Color("#152436")
	_env.fog_density = 0.015
	var we := WorldEnvironment.new()
	we.environment = _env
	_vp.add_child(we)

	_key_light = DirectionalLight3D.new()
	_key_light.rotation_degrees = Vector3(-42.0, -34.0, 0.0)
	_key_light.light_color = Color("#fff0dc")
	_key_light.light_energy = 1.4
	_key_light.shadow_enabled = true
	_vp.add_child(_key_light)

	_rim_light = DirectionalLight3D.new()
	_rim_light.rotation_degrees = Vector3(-18.0, 145.0, 0.0)
	_rim_light.light_color = Color("#46e8ff")
	_rim_light.light_energy = 0.85
	_vp.add_child(_rim_light)

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
	_skip_btn.position = Vector2(1620, 966)
	_skip_btn.size = Vector2(244, 48)
	ConsoleTheme.apply_emerald_button(_skip_btn, 18, false)
	_skip_btn.pressed.connect(func(): skip())
	add_child(_skip_btn)

func set_skip_label(label_text: String) -> void:
	if _skip_btn:
		_skip_btn.text = label_text

func _build_audio() -> void:
	_voice_player = AudioStreamPlayer.new()
	_voice_player.bus = "SFX"
	add_child(_voice_player)
	RTSMusic.watch_campaign_voice(_voice_player)

	_sfx_player = AudioStreamPlayer.new()
	_sfx_player.bus = "SFX"
	_sfx_player.volume_db = -10.0
	add_child(_sfx_player)

	_foley_player = AudioStreamPlayer.new()
	_foley_player.bus = "SFX"
	_foley_player.volume_db = -7.5
	add_child(_foley_player)

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
	if _skip_btn:
		_skip_btn.text = "SKIP MOVIE ▸"
	hide()
	set_process(false)
	movie_finished.emit(finished_id, skipped)

func stop_all_media() -> void:
	if _voice_player and _voice_player.playing:
		_voice_player.stop()
	if _sfx_player and _sfx_player.playing:
		_sfx_player.stop()
	if _foley_player and _foley_player.playing:
		_foley_player.stop()
	if _ogv_player and _ogv_player.is_playing():
		_ogv_player.stop()
	_pending_sfx.clear()
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

	_pending_sfx.clear()
	for sfx_pair in shot.get("sfx_cues", []):
		if sfx_pair is Array and sfx_pair.size() >= 2:
			_pending_sfx.append({"at": float(sfx_pair[0]), "sfx": str(sfx_pair[1]), "played": false})

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
		"vesper_flyover":
			if _vp_container:
				_vp_container.show()
				_stage_vesper_flyover(int(shot.get("mission_index", 0)))
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
		"intro_occupation":
			if _vp_container:
				_vp_container.show()
				_stage_intro_occupation()
		"intro_briefing":
			if _vp_container:
				_vp_container.show()
				_stage_intro_briefing()
		"intro_suitup":
			if _vp_container:
				_vp_container.show()
				_stage_intro_suitup()
		"intro_boarding":
			if _vp_container:
				_vp_container.show()
				_stage_intro_boarding()
		"intro_touchdown":
			if _vp_container:
				_vp_container.show()
				_stage_intro_touchdown()
		"intro_gantry":
			if _vp_container:
				_vp_container.show()
				_stage_intro_gantry()
		"intro_visor":
			if _vp_container:
				_vp_container.show()
				_stage_intro_visor()
		"intro_rollout":
			_planet_bg.show()
			if _vp_container:
				_vp.transparent_bg = true
				_vp_container.show()
				_stage_intro_rollout()
		"intro_warp":
			_planet_bg.show()
			if _vp_container:
				_vp.transparent_bg = true
				_vp_container.show()
				_stage_intro_warp()
		"intro_swarm":
			if _vp_container:
				_vp_container.show()
				_stage_intro_swarm()
		"intro_concord":
			if _vp_container:
				_vp_container.show()
				_stage_intro_concord()
		"intro_clash":
			if _vp_container:
				_vp_container.show()
				_stage_intro_clash()

func _animate_active_shot(shot: Dictionary, delta: float, progress: float) -> void:
	for sc in _pending_sfx:
		if not bool(sc.played) and _shot_elapsed >= float(sc.at):
			sc.played = true
			if play_internal_voice and RTSAudio.can_play_campaign_voice() and _foley_player:
				var fstream: AudioStreamWAV = RTSAudio.get_stream(str(sc.sfx))
				if fstream != null:
					_foley_player.stream = fstream
					_foley_player.play()

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

	var u := smoothstep(0.0, 1.0, progress)
	var cam_pos: Vector3
	var look_pt: Vector3
	if _use_bezier_cam:
		var q0 := _cam_from.lerp(_cam_mid, u)
		var q1 := _cam_mid.lerp(_cam_to, u)
		cam_pos = q0.lerp(q1, u)
		look_pt = _cam_look.lerp(_cam_look_to, u)
	else:
		cam_pos = _cam_from.lerp(_cam_to, u)
		look_pt = _cam_look

	# Subtle handheld breath + battle impact camera shake
	var sway := Vector3(
		sin(_total_elapsed * 1.9) * 0.035,
		cos(_total_elapsed * 2.3) * 0.025,
		sin(_total_elapsed * 1.5) * 0.025
	)
	if _shake_amp > 0.001:
		sway += Vector3(
			sin(_total_elapsed * 37.0) * _shake_amp,
			cos(_total_elapsed * 43.0) * _shake_amp * 0.8,
			sin(_total_elapsed * 29.0) * _shake_amp * 0.5
		)
		_shake_amp = maxf(0.0, _shake_amp - delta * 0.55)

	_cam.fov = lerpf(_fov_from, _fov_to, u)
	_cam.position = cam_pos + sway
	if _cam.position.distance_squared_to(look_pt) > 0.01:
		_cam.look_at(look_pt, Vector3.UP)
	var roll_deg := lerpf(_roll_from, _roll_to, u)
	if absf(roll_deg) > 0.01:
		_cam.rotate_object_local(Vector3.FORWARD, deg_to_rad(roll_deg))

	for actor in _actors:
		var node: Node3D = actor.node
		if not is_instance_valid(node):
			continue
		if actor.has("warp_at"):
			var w_at := float(actor.warp_at)
			var base_s := float(actor.get("base_scale", 1.0))
			if _shot_elapsed < w_at:
				node.visible = false
				continue
			if not node.visible:
				node.visible = true
				_spawn_warp_ring(node.position, base_s * 3.2)
				_shake_amp = maxf(_shake_amp, 0.14)
			var wt := clampf((_shot_elapsed - w_at) / 0.20, 0.0, 1.0)
			var stretch := lerpf(4.6, 1.0, smoothstep(0.0, 1.0, wt))
			node.scale = Vector3(base_s * stretch, base_s, base_s)
		node.position += (actor.vel as Vector3) * delta
		if actor.get("hover", false):
			node.position.y += sin(_total_elapsed * 3.4 + float(actor.seed)) * 0.008
		if actor.get("stride", false):
			node.position.y = absf(sin(_total_elapsed * 5.2 + float(actor.seed))) * 0.06

	_animate_fx_items(delta, u)

	if _shell_timer > 0.0:
		_shell_timer -= delta
		if _shell_timer <= 0.0:
			_shell_timer = 0.72
			_spawn_artillery_blast()

	_tracer_timer -= delta
	if _tracer_timer <= 0.0:
		_tracer_timer = 0.22
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
	_fx_items.clear()
	_shell_timer = 0.0
	_fov_from = 35.0
	_fov_to = 35.0
	_roll_from = 0.0
	_roll_to = 0.0
	_shake_amp = 0.0
	_use_bezier_cam = false
	if _key_light:
		_key_light.rotation_degrees = Vector3(-42.0, -34.0, 0.0)
		_key_light.light_color = Color("#fff0dc")
		_key_light.light_energy = 1.18
	if _rim_light:
		_rim_light.rotation_degrees = Vector3(-18.0, 145.0, 0.0)
		_rim_light.light_color = Color("#46e8ff")
		_rim_light.light_energy = 0.68
	if _env:
		_env.ambient_light_color = Color("#9db8cc")
		_env.ambient_light_energy = 0.68
		_env.glow_intensity = 0.34
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
		var m: Node3D = Models.build(uid, 1)
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
		var m: Node3D = Models.build(uid, int(a.owner))
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
		var ship: Node3D = Models.build("rampart_transport", 1)
		ship.position = Vector3(-2.8, 3.8, -1.6)
		ship.rotation.y = -0.35
		_add_thruster_glow(ship)
		_world_root.add_child(ship)
		_actors.append({"node": ship, "vel": Vector3(0.4, -0.32, 0.15), "hover": true, "seed": 0.5, "fire_at": null})

	var def: Dictionary = RTSData.units[unit_id]
	var count := 1 if bool(def.get("is_structure", false)) or float(def.get("radius", 1.0)) > 1.25 else 3
	var offsets := [Vector3(0, 0, 0), Vector3(-1.8, 0, 1.1), Vector3(1.6, 0, -1.1)]
	for i in count:
		var u: Node3D = Models.build(unit_id, 1)
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

# =============================================================================
# Real-Time Godot 4 3D Intro Cinematic Stage Builders & VFX
# =============================================================================

static func _yaw_toward(from_pos: Vector3, to_pos: Vector3) -> float:
	var d := to_pos - from_pos
	if Vector2(d.x, d.z).length_squared() < 0.0001:
		return 0.0
	return atan2(-d.z, d.x)

func _spawn_model(
	uid: String, owner_id: int, pos: Vector3, face_target: Vector3,
	scl: float = 1.0, is_vale: bool = false
) -> Node3D:
	if _world_root == null:
		return null
	if not RTSData.units.has(uid) and uid not in Models.BAKED_MODELS:
		return null
	var m: Node3D = Models.build("captain_vale" if is_vale else uid, owner_id)
	if m == null:
		return null
	m.position = pos
	m.rotation.y = _yaw_toward(pos, face_target)
	m.scale = Vector3(scl, scl, scl)
	_world_root.add_child(m)
	return m

func _add_omni(pos: Vector3, col: Color, energy: float, rng: float, pulse_speed: float = 0.0) -> OmniLight3D:
	var l := OmniLight3D.new()
	l.position = pos
	l.light_color = col
	l.light_energy = energy
	l.omni_range = rng
	_world_root.add_child(l)
	if pulse_speed > 0.0:
		_fx_items.append({"kind": "pulse_light", "node": l, "base": energy, "speed": pulse_speed})
	return l

func _make_ground_plane(tex_path: String, tint: Color, roughness_val: float = 0.85, uv_tile: float = 18.0, sz: float = 220.0) -> MeshInstance3D:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(sz, sz)
	ground.mesh = plane
	var gmat := StandardMaterial3D.new()
	var tex := _load_tex(tex_path)
	if tex:
		gmat.albedo_texture = tex
		gmat.uv1_scale = Vector3(uv_tile, uv_tile, 1.0)
	gmat.albedo_color = tint
	gmat.roughness = roughness_val
	gmat.metallic = 0.22 if roughness_val < 0.6 else 0.05
	ground.material_override = gmat
	_world_root.add_child(ground)

	# Distant horizon canyon silhouettes so terrain never shows a hard square edge
	var rmat := StandardMaterial3D.new()
	rmat.albedo_color = tint.darkened(0.45)
	rmat.roughness = 0.96
	for h_spec in [
		[Vector3(38.0, 7.5, 9.0), Vector3(-24.0, 3.2, -36.0), 0.22],
		[Vector3(42.0, 9.5, 10.0), Vector3(16.0, 4.2, -39.0), -0.18],
		[Vector3(32.0, 6.5, 8.0), Vector3(36.0, 2.8, -24.0), -0.55],
		[Vector3(32.0, 6.0, 8.0), Vector3(-36.0, 2.6, -22.0), 0.52],
	]:
		var ridge := MeshInstance3D.new()
		var rb := BoxMesh.new()
		rb.size = h_spec[0]
		ridge.mesh = rb
		ridge.position = h_spec[1]
		ridge.rotation.y = float(h_spec[2])
		ridge.material_override = rmat
		_world_root.add_child(ridge)
	return ground

func _spawn_warp_ring(at_pos: Vector3, max_scale: float = 3.2) -> void:
	if _world_root == null:
		return
	var ring_mi := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.65
	torus.outer_radius = 0.92
	ring_mi.mesh = torus
	ring_mi.position = at_pos
	ring_mi.rotation_degrees = Vector3(78.0, 22.0, 0.0)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.45, 0.96, 1.0, 0.92)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mi.material_override = mat
	_world_root.add_child(ring_mi)
	_fx_items.append({"kind": "expand_ring", "node": ring_mi, "mat": mat, "life": 0.65, "max_life": 0.65, "max_scale": max_scale})

func _spawn_artillery_blast() -> void:
	if _world_root == null:
		return
	var idx := int(_total_elapsed * 10.0) % 4
	var blast_pts := [
		Vector3(3.4, 0.35, -1.2),
		Vector3(5.2, 0.35, 1.4),
		Vector3(2.2, 0.35, -3.4),
		Vector3(6.4, 0.35, -2.6),
	]
	var pt: Vector3 = blast_pts[idx]
	var sphere_mi := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.55
	sm.height = 1.1
	sphere_mi.mesh = sm
	sphere_mi.position = pt
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.62, 0.18, 0.92)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sphere_mi.material_override = mat
	_world_root.add_child(sphere_mi)
	_fx_items.append({"kind": "expand_ring", "node": sphere_mi, "mat": mat, "life": 0.52, "max_life": 0.52, "max_scale": 3.8})
	_shake_amp = maxf(_shake_amp, 0.11)

func _animate_fx_items(delta: float, shot_u: float) -> void:
	for i in range(_fx_items.size() - 1, -1, -1):
		var fx: Dictionary = _fx_items[i]
		var kind := str(fx.kind)
		var node = fx.get("node", null)
		if node == null or not is_instance_valid(node):
			_fx_items.remove_at(i)
			continue
		match kind:
			"pulse_light":
				var l: OmniLight3D = node
				var spd := float(fx.speed)
				l.light_energy = float(fx.base) * (0.55 + 0.65 * absf(sin(_total_elapsed * spd)))
			"gantry_arm":
				var arm: Node3D = node
				var retract := smoothstep(0.18, 0.88, shot_u)
				arm.position = (fx.from_pos as Vector3).lerp(fx.to_pos as Vector3, retract)
				arm.rotation_degrees.z = lerpf(float(fx.rot0), float(fx.rot1), retract)
			"spark":
				var sp: Node3D = node
				fx.age = float(fx.age) + delta
				var age := float(fx.age)
				var period := float(fx.period)
				var local_t := fmod(age, period) / period
				var origin: Vector3 = fx.origin
				var vel: Vector3 = fx.vel
				sp.position = origin + vel * local_t + Vector3(0.0, -2.4 * local_t * local_t, 0.0)
				var sc := maxf(0.05, 1.0 - local_t)
				sp.scale = Vector3(sc, sc, sc)
			"visor_glow":
				var vg: MeshInstance3D = node
				var vmat: StandardMaterial3D = fx.mat
				var ign := smoothstep(0.08, 0.45, shot_u)
				vmat.albedo_color.a = lerpf(0.15, 0.96, ign)
				vg.scale = Vector3.ONE * lerpf(0.75, 1.12, ign)
			"steam":
				var st: Node3D = node
				st.position += Vector3(0.08, 0.55, 0.04) * delta
				if st.position.y > 3.2:
					st.position.y = 0.15
			"blast_door":
				var door: Node3D = node
				var open_u := smoothstep(0.02, 0.68, shot_u)
				door.position = (fx.closed as Vector3).lerp(fx.opened as Vector3, open_u)
			"spin_holo":
				(node as Node3D).rotation.y += delta * float(fx.get("speed", 0.65))
			"jammer_wave":
				fx.age = float(fx.age) + delta
				var j_frac := fmod(float(fx.age), 1.6) / 1.6
				var j_s := lerpf(0.5, 6.5, j_frac)
				(node as Node3D).scale = Vector3(j_s, j_s, j_s)
				var jmat: StandardMaterial3D = fx.mat
				jmat.albedo_color.a = (1.0 - j_frac) * 0.68
			"expand_ring":
				fx.life = float(fx.life) - delta
				var life := float(fx.life)
				if life <= 0.0:
					(node as Node).queue_free()
					_fx_items.remove_at(i)
				else:
					var frac := 1.0 - life / float(fx.max_life)
					var s := lerpf(0.35, float(fx.max_scale), smoothstep(0.0, 1.0, frac))
					(node as Node3D).scale = Vector3(s, s, s)
					var rmat: StandardMaterial3D = fx.mat
					rmat.albedo_color.a = (1.0 - frac) * 0.88

func _build_highway_strip(center: Vector3, length: float, width: float, yaw_rad: float = 0.0) -> Node3D:
	var road_root := Node3D.new()
	road_root.position = center
	road_root.rotation.y = yaw_rad
	var asphalt := Models.mat("cine_asphalt", Color("#252a30"), Color.BLACK, 1.0, 0.08, 0.88)
	var curb_mat := Models.mat("cine_curb", Color("#56606b"), Color.BLACK, 1.0, 0.12, 0.78)
	var stripe_mat := Models.mat("cine_road_stripe", Color("#e0b24c"), Color("#b88628"), 0.6, 0.0, 0.65)
	Models.box(road_root, Vector3(width, 0.06, length), asphalt, Vector3(0.0, 0.03, 0.0))
	Models.box(road_root, Vector3(0.36, 0.16, length), curb_mat, Vector3(-width * 0.5 - 0.18, 0.08, 0.0))
	Models.box(road_root, Vector3(0.36, 0.16, length), curb_mat, Vector3(width * 0.5 + 0.18, 0.08, 0.0))
	var dashes := int(length / 2.8)
	for d_i in dashes:
		var dz := -length * 0.5 + 1.4 + float(d_i) * 2.8
		Models.box(road_root, Vector3(0.16, 0.07, 1.25), stripe_mat, Vector3(0.0, 0.04, dz))
	_world_root.add_child(road_root)
	return road_root

func _add_jammer_ring(origin: Vector3, age_offset: float) -> void:
	var ring_mi := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.72
	torus.outer_radius = 0.88
	ring_mi.mesh = torus
	ring_mi.position = origin
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(1.0, 0.24, 0.20, 0.65)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mi.material_override = mat
	_world_root.add_child(ring_mi)
	_fx_items.append({"kind": "jammer_wave", "node": ring_mi, "mat": mat, "age": age_offset})

func _stage_vesper_flyover(mission_idx: int) -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#121d2b")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#243648")
	_env.fog_density = 0.016
	_make_ground_plane("res://assets/terrain/badlands.webp", Color("#6a5646"), 0.90, 18.0, 220.0)
	_build_highway_strip(Vector3(0.0, 0.0, -4.0), 64.0, 5.8, 0.35)
	if mission_idx == 1:
		_spawn_model("colony_hub", 1, Vector3(-5.5, 0.0, -8.5), Vector3(4, 0, 2), 0.95)
		_spawn_model("silo", 1, Vector3(-9.5, 0.0, -6.5), Vector3(4, 0, 2), 0.95)
	elif mission_idx == 2:
		_spawn_model("field_bunker", 1, Vector3(-3.5, 0.0, -6.5), Vector3(6, 0, -2), 0.95)
		_spawn_model("sentry_turret", 1, Vector3(3.2, 0.0, -8.5), Vector3(8, 0, -2), 0.95)
	else:
		_spawn_model("propaganda_statue", 2, Vector3(5.8, 0.0, -8.2), Vector3(-4, 0, 6), 0.95)
		_spawn_model("sentry_turret", 2, Vector3(-4.6, 0.0, -9.4), Vector3(-2, 0, 6), 0.95)

	for idx in 2:
		var p := Vector3(-6.2 - float(idx) * 3.4, 3.8 + float(idx) * 0.7, 4.8 + float(idx) * 2.4)
		var v := Vector3(2.2, -0.14, -1.55)
		var ship := _spawn_model("rampart_transport", 1, p, p + v * 8.0, 0.92)
		if ship:
			_add_thruster_glow(ship)
			_actors.append({"node": ship, "vel": v, "hover": true, "seed": float(idx) * 1.4, "fire_at": null})

	_use_bezier_cam = true
	_cam_from = Vector3(-11.8, 5.2, 12.6)
	_cam_mid = Vector3(-7.4, 4.6, 9.8)
	_cam_to = Vector3(-3.2, 4.2, 7.2)
	_cam_look = Vector3(-2.5, 2.6, 1.2)
	_cam_look_to = Vector3(2.4, 1.8, -5.2)
	_fov_from = 40.0
	_fov_to = 35.0

# -----------------------------------------------------------------------------
# Cohesive 5-Shot Opening Cinematic: "Operation: Cut the Signal" (Vesper Gate)
# -----------------------------------------------------------------------------

func _stage_intro_occupation() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#131a26")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#262230")
	_env.fog_density = 0.017
	_env.ambient_light_color = Color("#8fa0b8")
	_env.ambient_light_energy = 0.62
	_key_light.light_color = Color("#ffd5b0")
	_key_light.light_energy = 1.12
	_key_light.rotation_degrees = Vector3(-34.0, -38.0, 0.0)
	_rim_light.light_color = Color("#ff5648")
	_rim_light.light_energy = 0.62

	_make_ground_plane("res://assets/terrain/badlands.webp", Color("#594c44"), 0.90, 20.0, 220.0)
	_build_highway_strip(Vector3(0.0, 0.0, -6.0), 58.0, 6.4, 0.0)

	# Streetlamps & jersey barricades lining the occupied Vesper Gate avenue
	var pole_mat := Models.mat("cine_pole_steel", Color("#2d3640"), Color.BLACK, 1.0, 0.55, 0.45)
	var lamp_mat := Models.mat("cine_street_lamp", Color("#ffcf86"), Color("#ffaa44"), 1.6, 0.0, 0.3)
	for z_lamp in [-14.0, -6.0, 2.0]:
		for side in [-1.0, 1.0]:
			Models.box(_world_root, Vector3(0.16, 3.8, 0.16), pole_mat, Vector3(side * 4.1, 1.9, z_lamp))
			Models.box(_world_root, Vector3(0.75, 0.12, 0.22), pole_mat, Vector3(side * 3.75, 3.75, z_lamp))
			Models.box(_world_root, Vector3(0.32, 0.10, 0.18), lamp_mat, Vector3(side * 3.55, 3.68, z_lamp))

	# Occupied colony buildings behind Directorate roadblocks
	_spawn_model("colony_hub", 1, Vector3(-10.2, 0.0, -7.5), Vector3(4, 0, -4), 0.92)
	_spawn_model("silo", 1, Vector3(-9.4, 0.0, -1.2), Vector3(4, 0, -1), 0.95)
	_spawn_model("silo", 1, Vector3(9.6, 0.0, -4.4), Vector3(-4, 0, -4), 0.95)
	_spawn_model("field_bunker", 2, Vector3(-5.8, 0.0, -11.8), Vector3(0, 0, 6), 0.95)
	_spawn_model("sentry_turret", 2, Vector3(5.6, 0.0, -11.8), Vector3(0, 0, 6), 0.95)

	# Towering Directorate Propaganda Statues flanking the boulevard
	_spawn_model("propaganda_statue", 2, Vector3(-5.2, 0.0, -3.2), Vector3(3, 0, 6), 1.05)
	_spawn_model("propaganda_statue", 2, Vector3(5.2, 0.0, -8.4), Vector3(-3, 0, 6), 1.05)

	# Directorate Subspace Relay HQ at the head of the avenue pulsing red jamming waves!
	_spawn_model("muster_hall", 2, Vector3(0.0, 0.0, -20.5), Vector3(0, 0, 8), 1.08)
	_spawn_model("radar_beacon", 2, Vector3(0.0, 0.0, -16.2), Vector3(0, 0, 8), 1.12)
	_add_omni(Vector3(0.0, 3.8, -16.2), Color("#ff3b30"), 1.6, 14.0, 4.2)
	_add_jammer_ring(Vector3(0.0, 3.4, -16.2), 0.0)
	_add_jammer_ring(Vector3(0.0, 3.4, -16.2), 0.8)

	# Detainee column: captured Vesper colonists marched down the road by crimson Directorate guards!
	var marchers := [
		{"u": "breacher", "o": 2, "p": Vector3(-1.1, 0.0, 2.2), "s": 0.98},
		{"u": "breacher", "o": 2, "p": Vector3(1.1, 0.0, 2.2), "s": 0.98},
		{"u": "pioneer", "o": 1, "p": Vector3(-0.75, 0.0, 4.2), "s": 0.92},
		{"u": "pioneer", "o": 1, "p": Vector3(0.75, 0.0, 4.2), "s": 0.92},
		{"u": "pioneer", "o": 1, "p": Vector3(-0.75, 0.0, 5.9), "s": 0.92},
		{"u": "pioneer", "o": 1, "p": Vector3(0.75, 0.0, 5.9), "s": 0.92},
		{"u": "rifleman", "o": 2, "p": Vector3(-1.45, 0.0, 7.6), "s": 0.98},
		{"u": "rifleman", "o": 2, "p": Vector3(1.45, 0.0, 7.6), "s": 0.98},
	]
	for idx in marchers.size():
		var mc: Dictionary = marchers[idx]
		var mm := _spawn_model(str(mc.u), int(mc.o), mc.p, (mc.p as Vector3) + Vector3(0, 0, -10.0), float(mc.s))
		if mm:
			_actors.append({"node": mm, "vel": Vector3(0.0, 0.0, -0.82), "stride": true, "seed": float(idx) * 0.7, "fire_at": null})

	# Camera: High-to-medium crane dolly descending past the Propaganda Statue along the occupied boulevard toward the Relay HQ
	_use_bezier_cam = true
	_cam_from = Vector3(-6.8, 6.4, 12.6)
	_cam_mid = Vector3(-4.2, 4.2, 9.4)
	_cam_to = Vector3(2.8, 3.1, 7.2)
	_cam_look = Vector3(0.0, 1.6, -6.5)
	_cam_look_to = Vector3(0.0, 2.1, -14.5)
	_fov_from = 38.0
	_fov_to = 34.0

func _stage_intro_briefing() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#09111a")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#10202e")
	_env.fog_density = 0.020
	_env.ambient_light_color = Color("#7da2be")
	_env.ambient_light_energy = 0.58
	_key_light.light_color = Color("#ffe2be")
	_key_light.light_energy = 1.05
	_key_light.rotation_degrees = Vector3(-38.0, -28.0, 0.0)
	_rim_light.light_color = Color("#3ad8ff")
	_rim_light.light_energy = 0.72

	_make_ground_plane("res://assets/terrain/military-paving.webp", Color("#28333e"), 0.55, 18.0, 220.0)

	# Outskirts safehouse command room walls, beams, and background gear
	var wall_steel := Models.mat("cine_brief_steel", Color("#1e2730"), Color.BLACK, 1.0, 0.55, 0.45)
	var holo_cyan := Models.mat("cine_holo_cyan", Color("#3cf0ff"), Color("#1cb8e8"), 1.6, 0.0, 0.25)
	var holo_red := Models.mat("cine_holo_red", Color("#ff5248"), Color("#d92b2b"), 1.6, 0.0, 0.25)
	var warm_strip := Models.mat("cine_brief_amber", Color("#ffb44c"), Color("#e08820"), 1.4, 0.0, 0.3)

	Models.box(_world_root, Vector3(22.0, 6.5, 0.6), wall_steel, Vector3(0.0, 3.25, -9.8))
	for x_col in [-7.5, -2.5, 2.5, 7.5]:
		Models.box(_world_root, Vector3(0.48, 6.5, 0.65), wall_steel, Vector3(x_col, 3.25, -9.4))
		Models.box(_world_root, Vector3(0.24, 0.16, 0.16), warm_strip, Vector3(x_col, 4.6, -9.0))
	_spawn_model("research_module", 1, Vector3(-6.4, 0.0, -6.8), Vector3(0, 0, 4), 0.92)
	_spawn_model("field_armory", 1, Vector3(6.8, 0.0, -6.8), Vector3(0, 0, 4), 0.90)

	# Central Tactical Holo-Table projecting the Directorate Relay HQ & Vesper Gate road!
	Models.cyl(_world_root, 1.65, 1.95, 0.86, wall_steel, Vector3(0.0, 0.43, 0.0), Vector3.ZERO, 20)
	Models.ring(_world_root, 1.38, 1.56, holo_cyan, Vector3(0.0, 0.88, 0.0))
	_add_omni(Vector3(0.0, 1.65, 0.0), Color("#3ce8ff"), 1.15, 6.0, 3.2)

	var holo_proj := Node3D.new()
	holo_proj.position = Vector3(0.0, 0.92, 0.0)
	Models.box(holo_proj, Vector3(0.32, 0.04, 2.1), holo_cyan, Vector3(0.0, 0.05, 0.0))
	Models.box(holo_proj, Vector3(0.52, 0.48, 0.52), holo_red, Vector3(0.0, 0.28, -0.58))
	Models.cyl(holo_proj, 0.06, 0.14, 0.72, holo_red, Vector3(0.0, 0.66, -0.58), Vector3.ZERO, 10)
	Models.ring(holo_proj, 0.36, 0.44, holo_red, Vector3(0.0, 0.92, -0.58))
	_world_root.add_child(holo_proj)
	_fx_items.append({"kind": "spin_holo", "node": holo_proj, "speed": 0.45})

	# Captain Vale & Corporal Rook across the holo-table + background Riflemen prepping weapons
	_spawn_model("rifleman", 1, Vector3(-2.15, 0.0, 0.25), Vector3(1.5, 0.0, -0.1), 1.08, true)
	_spawn_model("breacher", 1, Vector3(2.15, 0.0, 0.35), Vector3(-1.5, 0.0, -0.1), 1.02)
	_spawn_model("pioneer", 1, Vector3(-3.8, 0.0, -3.2), Vector3(0.0, 0.0, 0.0), 0.95)
	_spawn_model("rifleman", 1, Vector3(3.6, 0.0, -3.0), Vector3(-1.0, 0.0, 0.0), 0.96)

	# Camera: Smooth 100-degree orbital dolly gliding around the glowing holo-table from Rook to Captain Vale
	_use_bezier_cam = true
	_cam_from = Vector3(4.2, 2.75, 5.8)
	_cam_mid = Vector3(0.2, 2.55, 6.4)
	_cam_to = Vector3(-3.8, 2.45, 5.4)
	_cam_look = Vector3(0.15, 1.35, -0.2)
	_cam_look_to = Vector3(-0.65, 1.45, -0.1)
	_fov_from = 36.0
	_fov_to = 33.0

func _stage_intro_suitup() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#0a121c")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#132232")
	_env.fog_density = 0.018
	_env.ambient_light_color = Color("#89a6bf")
	_env.ambient_light_energy = 0.62
	_key_light.light_color = Color("#ffe4c4")
	_key_light.light_energy = 1.02
	_key_light.rotation_degrees = Vector3(-36.0, -35.0, 0.0)
	_rim_light.light_color = Color("#42dcff")
	_rim_light.light_energy = 0.68

	_make_ground_plane("res://assets/terrain/military-paving.webp", Color("#2d3844"), 0.50, 18.0, 220.0)

	# Raised circular Armor Forge Gantry with Pilot Sable's Rampart Dropship waiting directly behind!
	var dark_steel := Models.mat("cine_suit_steel", Color("#242e38"), Color.BLACK, 1.0, 0.58, 0.42)
	var cyan_emit := Models.mat("cine_suit_cyan", Color("#42ecff"), Color("#24b8e0"), 1.5, 0.0, 0.25)
	var amber_emit := Models.mat("cine_suit_amber", Color("#ffae38"), Color("#d87c14"), 1.4, 0.0, 0.3)
	Models.cyl(_world_root, 2.3, 2.7, 0.24, dark_steel, Vector3(0, 0.12, 0), Vector3.ZERO, 24)
	Models.ring(_world_root, 1.88, 2.08, cyan_emit, Vector3(0, 0.25, 0))

	for angle_deg in [44.0, 136.0, 224.0, 316.0]:
		var rad := deg_to_rad(angle_deg)
		var px := cos(rad) * 3.5
		var pz := sin(rad) * 3.5
		Models.box(_world_root, Vector3(0.38, 4.6, 0.38), dark_steel, Vector3(px, 2.3, pz))
		Models.box(_world_root, Vector3(0.14, 0.28, 0.14), amber_emit, Vector3(px * 0.90, 3.5, pz * 0.90))

	# Waiting Rampart Dropship & hangar bays clearly visible behind the gantry!
	_spawn_model("rampart_transport", 1, Vector3(0.0, 0.55, -9.2), Vector3(4.0, 0.55, -5.0), 1.18)
	_spawn_model("airframe_hangar", 1, Vector3(-9.2, 0.0, -10.2), Vector3(0, 0, 2), 0.98)
	_spawn_model("workshop", 1, Vector3(9.2, 0.0, -10.2), Vector3(0, 0, 2), 0.98)

	# Captain Vale on the forge pedestal + 2 Pioneer riggers finishing chestplate seals
	_spawn_model("rifleman", 1, Vector3(0.0, 0.24, 0.0), Vector3(0.0, 0.24, 8.0), 1.08, true)
	_spawn_model("pioneer", 1, Vector3(-2.15, 0.0, 0.55), Vector3(0.0, 0.24, 0.0), 0.94)
	_spawn_model("pioneer", 1, Vector3(2.15, 0.0, 0.55), Vector3(0.0, 0.24, 0.0), 0.94)

	# Hydraulic clamp arms retracting outward as seals lock
	for side in [-1.0, 1.0]:
		var arm_root := Node3D.new()
		var p0 := Vector3(side * 1.05, 1.42, 0.0)
		var p1 := Vector3(side * 2.75, 2.25, -0.35)
		arm_root.position = p0
		Models.box(arm_root, Vector3(1.20, 0.16, 0.24), dark_steel, Vector3(side * 0.52, 0.0, 0.0))
		Models.box(arm_root, Vector3(0.18, 0.36, 0.30), cyan_emit, Vector3(0.0, -0.04, 0.0))
		_world_root.add_child(arm_root)
		_fx_items.append({"kind": "gantry_arm", "node": arm_root, "from_pos": p0, "to_pos": p1, "rot0": 0.0, "rot1": side * 24.0})

	var spark_mat := StandardMaterial3D.new()
	spark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spark_mat.albedo_color = Color("#ffd978")
	for s_i in 14:
		var sp := MeshInstance3D.new()
		var sb := SphereMesh.new()
		sb.radius = 0.035
		sb.height = 0.07
		sp.mesh = sb
		sp.material_override = spark_mat
		var side_s := -1.0 if (s_i % 2 == 0) else 1.0
		var origin := Vector3(side_s * 0.62, 1.32, 0.32)
		var vel := Vector3(side_s * (0.75 + float(s_i % 5) * 0.28), 1.1 + float(s_i % 3) * 0.38, 0.65 + float(s_i % 4) * 0.24)
		_world_root.add_child(sp)
		_fx_items.append({"kind": "spark", "node": sp, "origin": origin, "vel": vel, "age": float(s_i) * 0.08, "period": 0.64})

	# Camera: Crisp medium-wide orbital rise framing Captain Vale cleanly with Sable's Rampart Dropship behind him
	_use_bezier_cam = true
	_cam_from = Vector3(-4.6, 2.15, 6.4)
	_cam_mid = Vector3(0.0, 2.45, 7.2)
	_cam_to = Vector3(4.2, 2.85, 6.0)
	_cam_look = Vector3(0.0, 1.45, -1.2)
	_cam_look_to = Vector3(0.0, 1.65, -2.6)
	_fov_from = 38.0
	_fov_to = 34.0

func _stage_intro_boarding() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#0b1522")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#16283a")
	_env.fog_density = 0.016
	_env.ambient_light_color = Color("#8aa8c4")
	_env.ambient_light_energy = 0.65
	_key_light.light_color = Color("#ffe6c8")
	_key_light.light_energy = 1.12
	_rim_light.light_color = Color("#46e4ff")
	_rim_light.light_energy = 0.72

	_make_ground_plane("res://assets/terrain/military-paving.webp", Color("#323e4a"), 0.52, 18.0, 220.0)

	# Lit staging pad markings & perimeter buildings
	var pad_green := Models.mat("cine_pad_green", Color("#46f28a"), Color("#26c468"), 1.6, 0.0, 0.25)
	for i in 7:
		var xx := -7.5 + float(i) * 2.5
		Models.box(_world_root, Vector3(0.95, 0.05, 0.18), pad_green, Vector3(xx, 0.03, -3.2))
		Models.box(_world_root, Vector3(0.95, 0.05, 0.18), pad_green, Vector3(xx, 0.03, 3.6))
	_spawn_model("airframe_hangar", 1, Vector3(-10.5, 0.0, -7.2), Vector3(4, 0, 0), 1.0)
	_spawn_model("silo", 1, Vector3(-12.2, 0.0, -1.8), Vector3(4, 0, 0), 0.95)

	# Primary Rampart Dropship spooling thrusters on the pad + escort Rampart lifting off behind!
	var main_ship := _spawn_model("rampart_transport", 1, Vector3(6.2, 0.85, 0.2), Vector3(14.0, 1.2, -1.5), 1.22)
	if main_ship:
		_actors.append({"node": main_ship, "vel": Vector3(0.0, 0.06, 0.0), "hover": true, "seed": 0.4, "fire_at": null})
	var wing_ship := _spawn_model("rampart_transport", 1, Vector3(1.8, 3.2, -6.8), Vector3(14.0, 4.8, -8.0), 1.02)
	if wing_ship:
		_actors.append({"node": wing_ship, "vel": Vector3(1.45, 0.35, -0.45), "hover": true, "seed": 1.7, "fire_at": null})

	# Captain Vale + his exact 6 Meridian Guard Riflemen double-timing in 2 crisp columns toward the Rampart!
	var vale := _spawn_model("rifleman", 1, Vector3(-4.2, 0.0, 0.2), Vector3(6.2, 0.0, 0.2), 1.08, true)
	if vale:
		_actors.append({"node": vale, "vel": Vector3(0.82, 0.0, 0.0), "stride": true, "seed": 0.0, "fire_at": null})
	for idx in 6:
		var row := idx / 2
		var side := -1.0 if (idx % 2 == 0) else 1.0
		var rp := Vector3(-5.9 - float(row) * 1.75, 0.0, 0.2 + side * 1.05)
		var rf := _spawn_model("rifleman", 1, rp, Vector3(6.2, 0.0, 0.2 + side * 0.4), 0.98)
		if rf:
			_actors.append({"node": rf, "vel": Vector3(0.84, 0.0, 0.0), "stride": true, "seed": float(idx) * 0.8, "fire_at": null})

	# Camera: Tracking dolly beside Vale's 6-man squad, lifting into a crane sweep as the Ramparts spool for takeoff
	_use_bezier_cam = true
	_cam_from = Vector3(-6.8, 2.65, 7.6)
	_cam_mid = Vector3(-2.2, 3.35, 8.6)
	_cam_to = Vector3(2.4, 4.45, 9.2)
	_cam_look = Vector3(-1.2, 1.25, 0.0)
	_cam_look_to = Vector3(3.6, 1.65, -1.2)
	_fov_from = 37.0
	_fov_to = 39.0

func _stage_intro_touchdown() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#121c28")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#24303e")
	_env.fog_density = 0.015
	_env.ambient_light_color = Color("#9bb0c4")
	_env.ambient_light_energy = 0.68
	_key_light.light_color = Color("#ffdcb8")
	_key_light.light_energy = 1.18
	_rim_light.light_color = Color("#46e4ff")
	_rim_light.light_energy = 0.65

	# Exact 3D match to Mission 01 ("Cut the Signal") Vesper Gate outskirts highway & roadblock!
	_make_ground_plane("res://assets/terrain/badlands.webp", Color("#685648"), 0.90, 18.0, 220.0)
	_build_highway_strip(Vector3(0.0, 0.0, 0.0), 64.0, 6.2, -1.05)

	# Directorate Checkpoint 01 ahead on the highway (+X, -Z): Propaganda Statue, barricades, 2 Riflemen & 1 Breacher!
	var bar_steel := Models.mat("cine_chk_bar", Color("#3b282c"), Color.BLACK, 1.0, 0.45, 0.55)
	Models.box(_world_root, Vector3(0.45, 0.85, 2.4), bar_steel, Vector3(5.6, 0.42, -1.4), Vector3(0, 0.52, 0))
	Models.box(_world_root, Vector3(0.45, 0.85, 2.4), bar_steel, Vector3(6.8, 0.42, -4.2), Vector3(0, 0.52, 0))
	_spawn_model("propaganda_statue", 2, Vector3(8.2, 0.0, -5.8), Vector3(-4, 0, 4), 1.05)

	var chk_guards := [
		{"u": "rifleman", "p": Vector3(6.8, 0.0, -1.8), "f": Vector3(-3.2, 0.8, 2.2)},
		{"u": "rifleman", "p": Vector3(8.1, 0.0, -3.6), "f": Vector3(-4.4, 0.8, 3.4)},
		{"u": "breacher", "p": Vector3(7.4, 0.0, -0.2), "f": Vector3(-2.6, 0.8, 1.4)},
	]
	for idx in chk_guards.size():
		var cg: Dictionary = chk_guards[idx]
		var gm := _spawn_model(str(cg.u), 2, cg.p, Vector3(-5.0, 0.0, 3.0), 0.98)
		if gm:
			_actors.append({"node": gm, "vel": Vector3.ZERO, "hover": false, "seed": float(idx), "fire_at": cg.f, "owner": 2})

	# Pilot Sable's Rampart Dropship flaring onto the highway behind Captain Vale + his 6 Riflemen!
	var dropship := _spawn_model("rampart_transport", 1, Vector3(-8.2, 3.6, 5.2), Vector3(4.0, 1.2, -2.0), 1.12)
	if dropship:
		_actors.append({"node": dropship, "vel": Vector3(0.75, -0.36, -0.42), "hover": true, "seed": 0.3, "fire_at": null})
	_spawn_warp_ring(Vector3(-6.2, 0.12, 3.8), 4.2)

	var vale := _spawn_model("rifleman", 1, Vector3(-2.6, 0.0, 1.6), Vector3(7.2, 0.0, -2.2), 1.08, true)
	if vale:
		_actors.append({"node": vale, "vel": Vector3(0.68, 0.0, -0.38), "stride": true, "seed": 0.2, "fire_at": Vector3(6.8, 0.8, -1.8), "owner": 1})
	var squad_offsets := [
		Vector3(-4.2, 0.0, 1.0), Vector3(-3.6, 0.0, 3.0),
		Vector3(-5.5, 0.0, 1.8), Vector3(-4.9, 0.0, 3.8),
		Vector3(-6.8, 0.0, 2.6), Vector3(-6.1, 0.0, 4.5),
	]
	for s_i in squad_offsets.size():
		var rf := _spawn_model("rifleman", 1, squad_offsets[s_i], Vector3(7.2, 0.0, -2.2), 0.98)
		if rf:
			_actors.append({"node": rf, "vel": Vector3(0.72, 0.0, -0.40), "stride": true, "seed": float(s_i) * 0.9, "fire_at": Vector3(7.4, 0.8, -2.0), "owner": 1})

	_tracer_timer = 0.08

	# Camera: Swoops behind Sable's landing Rampart, then rises & pulls back into the RTS tactical camera angle for seamless Mission 01 handoff!
	_use_bezier_cam = true
	_cam_from = Vector3(-11.8, 4.2, 11.4)
	_cam_mid = Vector3(-8.2, 6.8, 13.6)
	_cam_to = Vector3(-4.6, 9.8, 15.6)
	_cam_look = Vector3(-1.8, 1.6, 1.0)
	_cam_look_to = Vector3(2.2, 1.8, -1.6)
	_fov_from = 40.0
	_fov_to = 36.0

func _stage_intro_gantry() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#060b12")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#101d2b")
	_env.fog_density = 0.028
	_env.ambient_light_energy = 0.48
	_env.glow_intensity = 0.82
	_key_light.light_color = Color("#ffbe78")
	_key_light.light_energy = 1.55
	_key_light.rotation_degrees = Vector3(-35.0, -48.0, 0.0)
	_rim_light.light_color = Color("#38e8ff")
	_rim_light.light_energy = 1.35

	_make_ground_plane("res://assets/terrain/military-paving.webp", Color("#2a3540"), 0.45, 18.0, 220.0)

	# Raised circular Forge Gantry Pedestal + glowing power ring
	var dark_steel := Models.mat("cine_gantry_steel", Color("#232c36"), Color.BLACK, 1.0, 0.65, 0.35)
	var cyan_emit := Models.mat("cine_gantry_cyan", Color("#4af0ff"), Color("#38e8ff"), 2.2, 0.1, 0.2)
	var amber_emit := Models.mat("cine_gantry_amber", Color("#ffae38"), Color("#ff9418"), 2.0, 0.1, 0.2)
	Models.cyl(_world_root, 2.5, 2.9, 0.28, dark_steel, Vector3(0, 0.14, 0), Vector3.ZERO, 24)
	Models.ring(_world_root, 2.05, 2.30, cyan_emit, Vector3(0, 0.29, 0))
	Models.ring(_world_root, 2.85, 3.15, dark_steel, Vector3(0, 4.45, 0))

	# 4 heavy gantry pillars around the suit-up bay
	for angle_deg in [42.0, 138.0, 222.0, 318.0]:
		var rad := deg_to_rad(angle_deg)
		var px := cos(rad) * 3.8
		var pz := sin(rad) * 3.8
		Models.box(_world_root, Vector3(0.42, 4.8, 0.42), dark_steel, Vector3(px, 2.4, pz))
		Models.box(_world_root, Vector3(0.14, 0.32, 0.14), amber_emit, Vector3(px * 0.90, 3.6, pz * 0.90))

	# Background Bay 07 machinery constructed from real Godot 4 game structures
	_spawn_model("vehicle_armory", 1, Vector3(-9.2, 0.0, -10.8), Vector3(0, 0, 2), 1.0)
	_spawn_model("workshop", 1, Vector3(9.4, 0.0, -10.6), Vector3(0, 0, 2), 1.0)
	_spawn_model("fabrication_module", 1, Vector3(0.0, 0.0, -13.5), Vector3(0, 0, 4), 1.1)
	_spawn_model("atlas_walker", 1, Vector3(-6.4, 0.0, -6.2), Vector3(0, 0, 4), 0.85)
	_spawn_model("warden_walker", 1, Vector3(6.6, 0.0, -6.0), Vector3(0, 0, 4), 0.90)

	# Hero on pedestal: Captain Vale's gold-trimmed power armor + 2 Pioneer welders
	_spawn_model("rifleman", 1, Vector3(0.0, 0.28, 0.0), Vector3(0.0, 0.28, 6.0), 1.08, true)
	_spawn_model("pioneer", 1, Vector3(-2.35, 0.28, 0.65), Vector3(0.0, 0.28, 0.0), 0.92)
	_spawn_model("pioneer", 1, Vector3(2.35, 0.28, 0.65), Vector3(0.0, 0.28, 0.0), 0.92)

	# Articulated mechanical clamp arms that retract outward as armor seals lock
	for side in [-1.0, 1.0]:
		var arm_root := Node3D.new()
		var p0 := Vector3(side * 1.15, 1.45, 0.0)
		var p1 := Vector3(side * 2.85, 2.25, -0.35)
		arm_root.position = p0
		Models.box(arm_root, Vector3(1.25, 0.18, 0.28), dark_steel, Vector3(side * 0.55, 0.0, 0.0))
		Models.box(arm_root, Vector3(0.20, 0.42, 0.36), cyan_emit, Vector3(0.0, -0.05, 0.0))
		_world_root.add_child(arm_root)
		_fx_items.append({"kind": "gantry_arm", "node": arm_root, "from_pos": p0, "to_pos": p1, "rot0": 0.0, "rot1": side * 24.0})

	# Pulsing arc-welder lights + flying welding sparks
	_add_omni(Vector3(-0.95, 1.45, 0.55), Color("#62f4ff"), 2.4, 6.5, 21.0)
	_add_omni(Vector3(0.95, 1.45, 0.55), Color("#ffba52"), 2.1, 6.5, 17.0)
	var spark_mat := StandardMaterial3D.new()
	spark_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spark_mat.albedo_color = Color("#ffe082")
	for s_i in 18:
		var sp := MeshInstance3D.new()
		var sb := SphereMesh.new()
		sb.radius = 0.04
		sb.height = 0.08
		sp.mesh = sb
		sp.material_override = spark_mat
		var side_s := -1.0 if (s_i % 2 == 0) else 1.0
		var origin := Vector3(side_s * 0.65, 1.35, 0.35)
		var vel := Vector3(side_s * (0.8 + float(s_i % 5) * 0.32), 1.2 + float(s_i % 3) * 0.45, 0.7 + float(s_i % 4) * 0.28)
		_world_root.add_child(sp)
		_fx_items.append({"kind": "spark", "node": sp, "origin": origin, "vel": vel, "age": float(s_i) * 0.07, "period": 0.62})

	# Fancy Camera: Wide-to-medium 150-degree sweeping orbital crane around the entire suit-up gantry!
	_use_bezier_cam = true
	_cam_from = Vector3(-5.2, 1.45, 5.2)
	_cam_mid = Vector3(0.25, 2.35, 7.2)
	_cam_to = Vector3(5.2, 3.35, 5.0)
	_cam_look = Vector3(0.0, 1.35, -0.4)
	_cam_look_to = Vector3(0.0, 1.75, -1.2)
	_fov_from = 36.0
	_fov_to = 40.0
	_roll_from = -4.5
	_roll_to = 2.5

func _stage_intro_visor() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#050a12")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#0e2030")
	_env.fog_density = 0.024
	_env.ambient_light_energy = 0.48
	_env.glow_intensity = 0.78
	_key_light.light_color = Color("#cceeff")
	_key_light.light_energy = 1.35
	_key_light.rotation_degrees = Vector3(-28.0, 26.0, 0.0)
	_rim_light.light_color = Color("#ffb84d")
	_rim_light.light_energy = 1.35

	_make_ground_plane("res://assets/terrain/military-paving.webp", Color("#222c36"), 0.42, 18.0, 220.0)

	# Hero squad V-formation: Captain Vale in front, Breachers & striding Atlas Walker looming behind!
	var vale := _spawn_model("rifleman", 1, Vector3(0.0, 0.0, 1.2), Vector3(0.35, 0.0, 8.0), 1.15, true)
	var b_left := _spawn_model("breacher", 1, Vector3(-2.6, 0.0, -1.4), Vector3(-2.0, 0.0, 8.0), 1.02)
	var b_right := _spawn_model("breacher", 1, Vector3(2.6, 0.0, -1.6), Vector3(2.0, 0.0, 8.0), 1.02)
	var atlas := _spawn_model("atlas_walker", 1, Vector3(-0.6, 0.0, -8.2), Vector3(-0.2, 0.0, 8.0), 0.92)
	_spawn_model("torchguard", 1, Vector3(4.4, 0.0, -3.8), Vector3(3.6, 0.0, 8.0), 1.02)
	_spawn_model("warden_walker", 1, Vector3(-5.2, 0.0, -5.6), Vector3(-3.8, 0.0, 8.0), 0.95)

	if b_left:
		_actors.append({"node": b_left, "vel": Vector3(0.0, 0.0, 0.28), "stride": true, "seed": 0.4, "fire_at": null})
	if b_right:
		_actors.append({"node": b_right, "vel": Vector3(0.0, 0.0, 0.28), "stride": true, "seed": 1.9, "fire_at": null})
	if atlas:
		_actors.append({"node": atlas, "vel": Vector3(0.0, 0.0, 0.52), "stride": true, "seed": 0.0, "fire_at": null})

	# Glowing HUD visor ignition strip on Captain Vale's helmet
	if vale:
		var v_mi := MeshInstance3D.new()
		var vbox := BoxMesh.new()
		vbox.size = Vector3(0.18, 0.09, 0.28)
		v_mi.mesh = vbox
		v_mi.position = Vector3(0.16, 1.48, 0.0)
		var vmat := StandardMaterial3D.new()
		vmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		vmat.albedo_color = Color(0.38, 0.95, 1.0, 0.2)
		vmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		v_mi.material_override = vmat
		vale.add_child(v_mi)
		_fx_items.append({"kind": "visor_glow", "node": v_mi, "mat": vmat})
		_add_omni(Vector3(0.15, 2.25, 2.25), Color("#46eeff"), 1.8, 5.5, 6.0)

	# Flagship hangar architecture & glowing deck guide-strips framing the squad
	var arch_steel := Models.mat("cine_visor_steel", Color("#1e2730"), Color.BLACK, 1.0, 0.62, 0.38)
	var strip_cyan := Models.mat("cine_visor_cyan", Color("#38e8ff"), Color("#2ad8ff"), 2.1, 0.0, 0.2)
	_spawn_model("airframe_hangar", 1, Vector3(-8.4, 0.0, -13.5), Vector3(0, 0, 8), 1.05)
	_spawn_model("vehicle_armory", 1, Vector3(8.6, 0.0, -13.5), Vector3(0, 0, 8), 1.05)
	for z_rib in [-2.0, -6.5, -11.0]:
		Models.box(_world_root, Vector3(0.45, 6.2, 0.45), arch_steel, Vector3(-7.2, 3.1, z_rib))
		Models.box(_world_root, Vector3(0.45, 6.2, 0.45), arch_steel, Vector3(7.2, 3.1, z_rib))
		Models.box(_world_root, Vector3(15.2, 0.38, 0.48), arch_steel, Vector3(0.0, 6.1, z_rib))
	for z_strip in range(-6, 5, 2):
		Models.box(_world_root, Vector3(0.14, 0.04, 0.95), strip_cyan, Vector3(-1.55, 0.02, float(z_strip)))
		Models.box(_world_root, Vector3(0.14, 0.04, 0.95), strip_cyan, Vector3(1.55, 0.02, float(z_strip)))

	# Fancy Camera: Heroic low push-in + telephoto FOV rack framing Vale's visor in front of Breachers & Atlas Walker!
	_use_bezier_cam = true
	_cam_from = Vector3(3.85, 1.65, 8.2)
	_cam_mid = Vector3(1.25, 1.95, 6.4)
	_cam_to = Vector3(-0.65, 2.10, 5.1)
	_cam_look = Vector3(-0.15, 1.65, -1.2)
	_cam_look_to = Vector3(0.0, 1.75, 0.2)
	_fov_from = 40.0
	_fov_to = 29.0
	_roll_from = 3.5
	_roll_to = -1.5

func _stage_intro_rollout() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	# Planet background shows through open blast doors in -Z!
	_env.background_mode = Environment.BG_CLEAR_COLOR
	_env.fog_enabled = false
	_env.glow_intensity = 0.72
	_key_light.light_color = Color("#ffe8c8")
	_key_light.light_energy = 1.5
	_rim_light.light_color = Color("#48f0ff")
	_rim_light.light_energy = 1.15

	# Flight deck runway slab stopping at z = -9.5 so open space + planet appear beyond!
	var deck_steel := Models.mat("cine_deck_floor", Color("#26303a"), Color.BLACK, 1.0, 0.55, 0.42)
	var strip_green := Models.mat("cine_deck_green", Color("#44ff88"), Color("#38ff7a"), 2.4, 0.0, 0.2)
	Models.box(_world_root, Vector3(22.0, 0.4, 22.0), deck_steel, Vector3(0.0, -0.2, 1.5))
	Models.box(_world_root, Vector3(24.0, 0.6, 16.0), deck_steel, Vector3(0.0, 6.4, 0.5))
	for z_i in 8:
		var zz := 7.0 - float(z_i) * 2.1
		Models.box(_world_root, Vector3(0.18, 0.06, 0.9), strip_green, Vector3(-2.8, 0.04, zz))
		Models.box(_world_root, Vector3(0.18, 0.06, 0.9), strip_green, Vector3(2.8, 0.04, zz))

	# Hangar side walls & Airframe Hangar structures
	_spawn_model("airframe_hangar", 1, Vector3(-6.8, 0.0, 1.2), Vector3(0, 0, 1.2), 1.1)
	_spawn_model("airframe_hangar", 1, Vector3(6.8, 0.0, 1.2), Vector3(0, 0, 1.2), 1.1)

	# Twin sliding armored blast doors parting to reveal planet in space!
	var door_mat := Models.mat("cine_blast_door", Color("#323e4a"), Color.BLACK, 1.0, 0.65, 0.38)
	var warn_mat := Models.mat("cine_door_warn", Color("#ff9d2e"), Color("#ff8811"), 2.0, 0.1, 0.3)
	for side in [-1.0, 1.0]:
		var door := Node3D.new()
		var closed_p := Vector3(side * 3.1, 3.0, -8.8)
		var opened_p := Vector3(side * 9.6, 3.0, -8.8)
		door.position = closed_p
		Models.box(door, Vector3(6.2, 6.2, 0.55), door_mat)
		Models.box(door, Vector3(0.28, 5.6, 0.62), warn_mat, Vector3(-side * 2.85, 0.0, 0.0))
		_world_root.add_child(door)
		_fx_items.append({"kind": "blast_door", "node": door, "closed": closed_p, "opened": opened_p})

	# Speeding ground column rolling toward the open launch bay (-Z)
	var ground_col := [
		{"u": "cinder_runner", "p": Vector3(-1.1, 0.0, 4.2), "v": Vector3(0, 0, -3.5), "s": 1.1},
		{"u": "cinder_runner", "p": Vector3(1.3, 0.0, 5.6), "v": Vector3(0, 0, -3.6), "s": 1.1},
		{"u": "vortex_rover", "p": Vector3(-1.5, 0.0, 7.6), "v": Vector3(0, 0, -3.3), "s": 1.05},
		{"u": "warden_walker", "p": Vector3(1.6, 0.0, 2.2), "v": Vector3(0, 0, -2.1), "s": 1.05},
	]
	for g in ground_col:
		var gm := _spawn_model(str(g.u), 1, g.p, (g.p as Vector3) + Vector3(0, 0, -10.0), float(g.s))
		if gm:
			_actors.append({"node": gm, "vel": g.v, "hover": false, "seed": 0.0, "fire_at": null})

	# Screaming Kestrel & Night Harrier strike wing launching overhead out into space!
	var air_wing := [
		{"u": "kestrel_interceptor", "p": Vector3(0.0, 2.8, 7.5), "v": Vector3(0.0, 0.28, -7.6), "s": 0.95},
		{"u": "kestrel_interceptor", "p": Vector3(-1.9, 3.2, 9.2), "v": Vector3(-0.15, 0.30, -7.6), "s": 0.92},
		{"u": "kestrel_interceptor", "p": Vector3(1.9, 3.2, 9.2), "v": Vector3(0.15, 0.30, -7.6), "s": 0.92},
		{"u": "night_harrier", "p": Vector3(-0.9, 3.9, 11.8), "v": Vector3(-0.1, 0.25, -7.2), "s": 0.95},
		{"u": "night_harrier", "p": Vector3(0.9, 3.9, 11.8), "v": Vector3(0.1, 0.25, -7.2), "s": 0.95},
	]
	for a in air_wing:
		var am := _spawn_model(str(a.u), 1, a.p, (a.p as Vector3) + Vector3(0, 0.4, -12.0), float(a.s))
		if am:
			_add_thruster_glow(am)
			_actors.append({"node": am, "vel": a.v, "hover": true, "seed": 1.2, "fire_at": null})

	# Fancy Camera: Low-slung Dutch-tilted chase cam skimming beside Cinder Runners, tilting up as Kestrels roar out!
	_use_bezier_cam = true
	_cam_from = Vector3(-3.6, 2.05, 8.6)
	_cam_mid = Vector3(-2.1, 2.55, 4.4)
	_cam_to = Vector3(-0.8, 3.05, 0.2)
	_cam_look = Vector3(0.2, 1.45, -4.5)
	_cam_look_to = Vector3(0.2, 2.65, -14.0)
	_fov_from = 46.0
	_fov_to = 38.0
	_roll_from = -6.0
	_roll_to = 3.0

func _stage_intro_warp() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_CLEAR_COLOR
	_env.fog_enabled = false
	_env.glow_intensity = 0.85
	_key_light.light_color = Color("#fff4e4")
	_key_light.light_energy = 1.6
	_rim_light.light_color = Color("#4cf2ff")
	_rim_light.light_energy = 1.3

	# Staggered hyperspace warp-in armada snapping into Vesper high orbit!
	var armada := [
		{"u": "dreadnought", "p": Vector3(-5.8, 0.7, 2.2), "v": Vector3(1.35, -0.05, -0.55), "s": 0.68, "w": 0.08},
		{"u": "dreadnought", "p": Vector3(-9.2, 2.4, -1.6), "v": Vector3(1.25, -0.04, -0.50), "s": 0.48, "w": 0.34},
		{"u": "watchkeeper", "p": Vector3(-3.4, 2.1, 3.6), "v": Vector3(1.45, -0.06, -0.58), "s": 0.55, "w": 0.48},
		{"u": "rampart_transport", "p": Vector3(-2.6, -0.9, 3.4), "v": Vector3(1.75, -0.22, -0.72), "s": 0.52, "w": 0.62},
		{"u": "rampart_transport", "p": Vector3(-5.0, -1.4, 4.2), "v": Vector3(1.72, -0.22, -0.72), "s": 0.52, "w": 0.74},
		{"u": "sky_sentry", "p": Vector3(-1.6, 0.4, 4.6), "v": Vector3(1.85, -0.14, -0.75), "s": 0.50, "w": 0.86},
		{"u": "kestrel_interceptor", "p": Vector3(-1.2, 1.5, 2.6), "v": Vector3(2.25, -0.12, -0.88), "s": 0.48, "w": 0.95},
		{"u": "kestrel_interceptor", "p": Vector3(-2.4, 1.9, 1.2), "v": Vector3(2.25, -0.12, -0.88), "s": 0.48, "w": 1.02},
	]
	for idx in armada.size():
		var a: Dictionary = armada[idx]
		var target_dir := (a.p as Vector3) + (a.v as Vector3) * 10.0
		var sm := _spawn_model(str(a.u), 1, a.p, target_dir, float(a.s))
		if sm:
			sm.visible = false
			_add_thruster_glow(sm)
			_actors.append({
				"node": sm, "vel": a.v, "hover": true, "seed": idx * 1.3,
				"warp_at": float(a.w), "base_scale": float(a.s), "fire_at": null,
			})

	# Fancy Camera: Floating orbital whip-pan as MSV Starfall snaps out of warp right past the lens!
	_use_bezier_cam = true
	_cam_from = Vector3(-12.2, 0.8, 9.8)
	_cam_mid = Vector3(-9.8, 1.6, 10.6)
	_cam_to = Vector3(-7.2, 2.3, 9.4)
	_cam_look = Vector3(-4.4, 0.7, 1.8)
	_cam_look_to = Vector3(1.4, -0.3, -1.6)
	_fov_from = 45.0
	_fov_to = 35.0
	_roll_from = 6.0
	_roll_to = -3.0

func _stage_intro_swarm() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#180710")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#34101e")
	_env.fog_density = 0.030
	_env.ambient_light_color = Color("#9e5c78")
	_env.ambient_light_energy = 0.55
	_env.glow_intensity = 0.78
	_key_light.light_color = Color("#ff7b54")
	_key_light.light_energy = 1.45
	_rim_light.light_color = Color("#b4ff38")
	_rim_light.light_energy = 1.15

	_make_ground_plane("res://assets/terrain/badlands.webp", Color("#4a2630"), 0.92, 18.0, 220.0)
	_add_omni(Vector3(0.0, 3.2, -9.0), Color("#a8ff2e"), 2.0, 16.0, 4.5)

	# Living Gnarl Brood hive structures in the background canyon
	_spawn_model("brood_hive", 2, Vector3(0.0, 0.0, -16.5), Vector3(0, 0, 8), 1.0)
	_spawn_model("greater_blight_spire", 2, Vector3(-9.4, 0.0, -14.5), Vector3(0, 0, 8), 0.95)
	_spawn_model("bile_warren", 2, Vector3(9.2, 0.0, -14.0), Vector3(0, 0, 8), 0.95)
	_spawn_model("tunnel_mouth", 2, Vector3(-4.8, 0.0, -9.5), Vector3(0, 0, 8), 0.95)

	# Surging ground & aerial Gnarl Brood swarm charging toward +Z!
	var brood_tide := [
		{"u": "carapace_bulwark", "p": Vector3(0.0, 0.0, -6.2), "v": Vector3(0.0, 0.0, 1.45), "s": 0.95, "air": false},
		{"u": "rupture_crawler", "p": Vector3(-4.6, 0.0, -7.2), "v": Vector3(0.15, 0.0, 1.55), "s": 0.90, "air": false},
		{"u": "spine_ambusher", "p": Vector3(4.6, 0.0, -6.8), "v": Vector3(-0.15, 0.0, 1.65), "s": 0.90, "air": false},
		{"u": "blight_hurler", "p": Vector3(-7.2, 0.0, -9.2), "v": Vector3(0.1, 0.0, 1.45), "s": 0.92, "air": false},
		{"u": "skitterling", "p": Vector3(-2.2, 0.0, -2.8), "v": Vector3(-0.1, 0.0, 2.25), "s": 0.95, "air": false},
		{"u": "skitterling", "p": Vector3(2.1, 0.0, -2.6), "v": Vector3(0.1, 0.0, 2.35), "s": 0.95, "air": false},
		{"u": "skitterling", "p": Vector3(0.1, 0.0, -1.4), "v": Vector3(0.0, 0.0, 2.45), "s": 0.95, "air": false},
		{"u": "skitterling", "p": Vector3(-4.3, 0.0, -3.2), "v": Vector3(-0.2, 0.0, 2.30), "s": 0.95, "air": false},
		{"u": "skitterling", "p": Vector3(4.2, 0.0, -3.1), "v": Vector3(0.2, 0.0, 2.30), "s": 0.95, "air": false},
		{"u": "brood_siege_flyer", "p": Vector3(-3.4, 3.8, -9.8), "v": Vector3(0.1, -0.04, 1.9), "s": 0.88, "air": true},
		{"u": "corrosion_flyer", "p": Vector3(3.8, 3.5, -8.2), "v": Vector3(-0.1, -0.04, 2.1), "s": 0.88, "air": true},
		{"u": "needlewing", "p": Vector3(0.4, 3.1, -5.2), "v": Vector3(0.0, -0.03, 2.6), "s": 0.92, "air": true},
		{"u": "needlewing", "p": Vector3(-4.8, 3.3, -5.8), "v": Vector3(0.2, -0.03, 2.6), "s": 0.92, "air": true},
	]
	for idx in brood_tide.size():
		var b: Dictionary = brood_tide[idx]
		var bm := _spawn_model(str(b.u), 2, b.p, (b.p as Vector3) + (b.v as Vector3) * 8.0, float(b.s))
		if bm:
			_actors.append({
				"node": bm, "vel": b.v, "hover": bool(b.air), "stride": not bool(b.air),
				"seed": idx * 0.9, "fire_at": null,
			})

	# Fancy Camera: High crane dive plummeting to a Dutch-tilted tracking shot ahead of the charging Swarm!
	_use_bezier_cam = true
	_cam_from = Vector3(8.5, 9.8, 10.5)
	_cam_mid = Vector3(2.8, 4.2, 13.5)
	_cam_to = Vector3(-3.2, 2.4, 15.8)
	_cam_look = Vector3(0.0, 1.8, -7.5)
	_cam_look_to = Vector3(0.0, 1.8, -0.5)
	_fov_from = 44.0
	_fov_to = 36.0
	_roll_from = -7.5
	_roll_to = 5.5

func _stage_intro_concord() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#061322")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#0f2a46")
	_env.fog_density = 0.020
	_env.ambient_light_color = Color("#6cb8e6")
	_env.ambient_light_energy = 0.62
	_env.glow_intensity = 0.72
	_key_light.light_color = Color("#ffe596")
	_key_light.light_energy = 1.45
	_rim_light.light_color = Color("#52f2ff")
	_rim_light.light_energy = 1.25

	_make_ground_plane("res://assets/terrain/military-paving.webp", Color("#1d3348"), 0.38, 18.0, 220.0)
	_add_omni(Vector3(0.0, 2.2, -3.5), Color("#58f6ff"), 2.2, 16.0, 5.0)

	# Ancient Aurelian Concord architecture
	_spawn_model("concord_core", 3, Vector3(0.0, 0.0, -17.5), Vector3(0, 0, 8), 1.0)
	_spawn_model("fleet_spire", 3, Vector3(-10.5, 0.0, -14.0), Vector3(0, 0, 8), 0.95)
	_spawn_model("star_assembly", 3, Vector3(10.5, 0.0, -14.0), Vector3(0, 0, 8), 0.95)
	_spawn_model("aether_prism", 3, Vector3(-6.2, 0.2, -5.5), Vector3(0, 0, 8), 0.95)
	_spawn_model("aether_prism", 3, Vector3(6.2, 0.2, -5.5), Vector3(0, 0, 8), 0.95)

	# Towering Spire Walkers, Lattice Archon, Bastion Walker & Sunblade phalanx + Crownspire orbital beam!
	var crown := _spawn_model("crownspire", 3, Vector3(0.0, 5.6, -5.5), Vector3(0.0, 5.2, 8.0), 0.88)
	var carrier := _spawn_model("fleet_carrier", 3, Vector3(-6.4, 5.2, -8.2), Vector3(-2.8, 4.8, 8.0), 0.85)
	if crown:
		_actors.append({"node": crown, "vel": Vector3(0.0, 0.0, 0.35), "hover": true, "seed": 0.3, "fire_at": null})
	if carrier:
		_actors.append({"node": carrier, "vel": Vector3(0.1, 0.0, 0.35), "hover": true, "seed": 1.7, "fire_at": null})

	# Searing vertical orbital purification lance from Crownspire to sanctuary floor!
	_spawn_beam(Vector3(0.0, 5.4, -5.0), Vector3(0.0, 0.0, -3.5))
	_spawn_warp_ring(Vector3(0.0, 0.15, -3.5), 5.2)

	var phalanx := [
		{"u": "lattice_archon", "p": Vector3(0.0, 0.0, -1.8), "v": Vector3(0, 0, 0.45), "s": 0.78},
		{"u": "spire_walker", "p": Vector3(-5.2, 0.0, -4.2), "v": Vector3(0, 0, 0.55), "s": 0.92},
		{"u": "bastion_walker", "p": Vector3(5.2, 0.0, -4.0), "v": Vector3(0, 0, 0.55), "s": 0.95},
		{"u": "sunblade", "p": Vector3(-2.6, 0.0, 1.4), "v": Vector3(0, 0, 0.75), "s": 0.98},
		{"u": "sunblade", "p": Vector3(2.6, 0.0, 1.4), "v": Vector3(0, 0, 0.75), "s": 0.98},
	]
	for idx in phalanx.size():
		var c: Dictionary = phalanx[idx]
		var cm := _spawn_model(str(c.u), 3, c.p, (c.p as Vector3) + Vector3(0, 0, 10.0), float(c.s))
		if cm:
			_actors.append({"node": cm, "vel": c.v, "hover": false, "stride": true, "seed": idx * 1.1, "fire_at": null})

	# Fancy Camera: Wide sweeping pedestal behind the Sunblades tilting up along the Spire Walkers to the Crownspire!
	_use_bezier_cam = true
	_cam_from = Vector3(-7.6, 2.15, 12.8)
	_cam_mid = Vector3(0.4, 3.65, 14.4)
	_cam_to = Vector3(7.6, 5.45, 12.4)
	_cam_look = Vector3(0.0, 1.95, -2.2)
	_cam_look_to = Vector3(0.0, 4.85, -4.8)
	_fov_from = 38.0
	_fov_to = 43.0
	_roll_from = 4.0
	_roll_to = -3.5

func _stage_intro_clash() -> void:
	_clear_3d_stage()
	if _world_root == null:
		return
	_env.background_mode = Environment.BG_COLOR
	_env.background_color = Color("#0c1420")
	_env.fog_enabled = true
	_env.fog_light_color = Color("#1e2836")
	_env.fog_density = 0.018
	_env.ambient_light_color = Color("#9ab4cc")
	_env.ambient_light_energy = 0.68
	_env.glow_intensity = 0.78
	_key_light.light_color = Color("#ffcf96")
	_key_light.light_energy = 1.55
	_rim_light.light_color = Color("#46ebff")
	_rim_light.light_energy = 1.25

	_make_ground_plane("res://assets/terrain/badlands.webp", Color("#4e423a"), 0.88, 18.0, 220.0)

	# Meridian Guard fortified battle-line on the left (-X) engaging combined threats across a wide killzone (+X)!
	_spawn_model("fortified_hub", 1, Vector3(-14.5, 0.0, -4.8), Vector3(8, 0, -1), 0.95)
	var b1 := _spawn_model("field_bunker", 1, Vector3(-8.4, 0.0, 2.8), Vector3(8, 0, 0), 0.98)
	var b2 := _spawn_model("bastion_turret", 1, Vector3(-9.6, 0.0, -3.4), Vector3(8, 0, -1), 0.98)
	_spawn_model("howitzer_emplaced", 1, Vector3(-12.2, 0.0, 3.8), Vector3(8, 0, 0), 1.0)
	var atlas := _spawn_model("atlas_walker", 1, Vector3(-6.2, 0.0, -1.6), Vector3(8, 0, -0.5), 0.92)
	var vale := _spawn_model("rifleman", 1, Vector3(-3.8, 0.0, 3.4), Vector3(8, 0, 0.5), 1.08, true)
	var tg := _spawn_model("torchguard", 1, Vector3(-3.2, 0.0, 0.8), Vector3(8, 0, 0.2), 1.05)
	if tg:
		_attach_flame_plume(tg)

	# MSV Starfall Dreadnought descending overhead & firing its axial siege beam across no-man's-land!
	var dread := _spawn_model("dreadnought", 1, Vector3(-6.4, 4.7, -3.0), Vector3(7.5, 1.0, -1.6), 0.72)
	if dread:
		_add_thruster_glow(dread)
		_actors.append({"node": dread, "vel": Vector3(0.45, -0.03, 0.04), "hover": true, "seed": 0.5, "fire_at": Vector3(7.4, 1.2, -1.6), "owner": 1})
	_spawn_beam(Vector3(-4.0, 4.3, -2.8), Vector3(7.4, 0.6, -1.6))

	if b1:
		_actors.append({"node": b1, "vel": Vector3.ZERO, "hover": false, "seed": 0.1, "fire_at": Vector3(6.8, 0.8, 1.6), "owner": 1})
	if b2:
		_actors.append({"node": b2, "vel": Vector3.ZERO, "hover": false, "seed": 0.6, "fire_at": Vector3(7.6, 0.9, -2.2), "owner": 1})
	if atlas:
		_actors.append({"node": atlas, "vel": Vector3(0.32, 0.0, 0.0), "stride": true, "seed": 0.8, "fire_at": Vector3(8.2, 1.1, -0.8), "owner": 1})
	if vale:
		_actors.append({"node": vale, "vel": Vector3(0.42, 0.0, -0.05), "stride": true, "seed": 1.4, "fire_at": Vector3(6.2, 0.8, 2.2), "owner": 1})

	for r_i in 3:
		var rf := _spawn_model("rifleman", 1, Vector3(-4.8 - float(r_i) * 1.1, 0.0, 4.4 - float(r_i) * 0.9), Vector3(8, 0, 1), 1.0)
		if rf:
			_actors.append({"node": rf, "vel": Vector3(0.45, 0.0, -0.05), "stride": true, "seed": float(r_i), "fire_at": Vector3(6.8, 0.8, 1.2), "owner": 1})

	# Hostile Directorate, Brood & Concord forces converging from +X across no-man's-land
	_spawn_model("propaganda_statue", 2, Vector3(13.5, 0.0, -5.2), Vector3(-8, 0, 0), 1.0)
	var foes := [
		{"u": "carapace_bulwark", "o": 2, "p": Vector3(7.8, 0.0, -1.8), "v": Vector3(-0.55, 0, 0.08), "f": Vector3(-6.2, 0.9, -1.6)},
		{"u": "spire_walker", "o": 3, "p": Vector3(10.4, 0.0, 1.8), "v": Vector3(-0.48, 0, -0.05), "f": Vector3(-8.4, 0.9, 2.8)},
		{"u": "skitterling", "o": 2, "p": Vector3(4.6, 0.0, 2.2), "v": Vector3(-1.25, 0, 0.12), "f": null},
		{"u": "skitterling", "o": 2, "p": Vector3(5.6, 0.0, 0.4), "v": Vector3(-1.25, 0, 0.05), "f": null},
		{"u": "breacher", "o": 2, "p": Vector3(7.2, 0.0, 3.6), "v": Vector3(-0.48, 0, 0.0), "f": Vector3(-3.8, 0.8, 3.4)},
	]
	for idx in foes.size():
		var foe: Dictionary = foes[idx]
		var fm := _spawn_model(str(foe.u), int(foe.o), foe.p, Vector3(-8, 0, 0), 0.95)
		if fm:
			_actors.append({"node": fm, "vel": foe.v, "stride": true, "seed": idx * 1.2, "fire_at": foe.f, "owner": int(foe.o)})

	_tracer_timer = 0.05
	_shell_timer = 0.25
	_spawn_artillery_blast()

	# Fancy Camera: Wide sweeping helicopter crane from behind Meridian lines out over the entire raging battlefield!
	_use_bezier_cam = true
	_cam_from = Vector3(-9.2, 2.85, 11.8)
	_cam_mid = Vector3(-3.2, 6.45, 16.2)
	_cam_to = Vector3(3.2, 9.45, 17.4)
	_cam_look = Vector3(0.8, 1.65, 0.4)
	_cam_look_to = Vector3(0.5, 2.35, -1.2)
	_fov_from = 36.0
	_fov_to = 43.0
	_roll_from = -3.0
	_roll_to = 1.5
