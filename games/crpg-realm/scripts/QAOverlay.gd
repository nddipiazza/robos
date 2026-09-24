extends CanvasLayer

var step_panel: Panel
var step_hbox: HBoxContainer
var step_badge: Label
var step_label: Label
var status_label: Label
var desc_label: Label

var event_panel: Panel
var event_list: VBoxContainer
var recent_events: Array[String] = []

var virtual_cursor: VirtualCursor = null
var current_cursor_pos: Vector2 = Vector2(960, 540)

# Scenario Splash Components
var splash_layer: Control = null
var splash_panel: Panel = null
var splash_title: Label = null
var splash_desc: Label = null
var splash_scene_pill: Label = null
var splash_state_pill: Label = null
var splash_bar: ProgressBar = null
var splash_timer_tween: Tween = null

func _init() -> void:
	layer = 125
	process_mode = PROCESS_MODE_ALWAYS

func _ready() -> void:
	Input.set_mouse_mode(Input.MOUSE_MODE_HIDDEN)
	_create_step_toolbar()
	_create_event_viewer()
	_create_proof_panel()
	_create_virtual_cursor()
	_create_scenario_splash()

func _create_step_toolbar() -> void:
	step_panel = Panel.new()
	step_panel.custom_minimum_size = Vector2(1920, 38)
	step_panel.position = Vector2(0, 0)
	step_panel.size = Vector2(1920, 38)
	
	# Transparent dark glass style (~28% opacity) with subtle cyan bottom border
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.03, 0.05, 0.09, 0.28)
	style.border_width_bottom = 1
	style.border_color = Color(0.0, 0.85, 0.75, 0.35)
	step_panel.add_theme_stylebox_override("panel", style)
	add_child(step_panel)

	step_hbox = HBoxContainer.new()
	step_hbox.position = Vector2(16, 2)
	step_hbox.size = Vector2(1888, 34)
	step_hbox.add_theme_constant_override("separation", 12)
	step_panel.add_child(step_hbox)

	step_badge = Label.new()
	step_badge.text = "🥒 BDD STEP"
	step_badge.add_theme_color_override("font_color", Color(0.25, 1.0, 0.55, 1.0))
	step_badge.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.95))
	step_badge.add_theme_constant_override("shadow_offset_x", 1)
	step_badge.add_theme_constant_override("shadow_offset_y", 1)
	step_badge.add_theme_font_size_override("font_size", 14)
	step_hbox.add_child(step_badge)

	var vcol = VBoxContainer.new()
	vcol.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vcol.add_theme_constant_override("separation", 1)
	step_hbox.add_child(vcol)

	step_label = Label.new()
	step_label.text = "Initializing QA Player User Simulation..."
	step_label.add_theme_color_override("font_color", Color(1.0, 0.95, 0.8, 1.0))
	step_label.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.95))
	step_label.add_theme_constant_override("shadow_offset_x", 1)
	step_label.add_theme_constant_override("shadow_offset_y", 1)
	step_label.add_theme_font_size_override("font_size", 13)
	vcol.add_child(step_label)

	status_label = Label.new()
	status_label.text = "Zero Backend Cheats Enforced | Paced Playthrough"
	status_label.add_theme_color_override("font_color", Color(0.7, 0.85, 0.95, 0.85))
	status_label.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.95))
	status_label.add_theme_constant_override("shadow_offset_x", 1)
	status_label.add_theme_constant_override("shadow_offset_y", 1)
	status_label.add_theme_font_size_override("font_size", 11)
	vcol.add_child(status_label)

	desc_label = Label.new()
	desc_label.text = ""
	desc_label.visible = false
	desc_label.add_theme_color_override("font_color", Color(0.35, 0.92, 1.0, 0.95))
	desc_label.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.95))
	desc_label.add_theme_constant_override("shadow_offset_x", 1)
	desc_label.add_theme_constant_override("shadow_offset_y", 1)
	desc_label.add_theme_font_size_override("font_size", 11)
	vcol.add_child(desc_label)

func _create_event_viewer() -> void:
	event_panel = Panel.new()
	event_panel.position = Vector2(1610, 44)
	event_panel.size = Vector2(294, 130)

	# Transparent dark glass style (~28% opacity) with subtle blue/cyan border
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.03, 0.05, 0.09, 0.28)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.border_color = Color(0.1, 0.6, 0.9, 0.35)
	style.corner_radius_top_left = 4
	style.corner_radius_top_right = 4
	style.corner_radius_bottom_left = 4
	style.corner_radius_bottom_right = 4
	event_panel.add_theme_stylebox_override("panel", style)
	add_child(event_panel)

	var vbox = VBoxContainer.new()
	vbox.position = Vector2(10, 8)
	vbox.size = Vector2(274, 114)
	vbox.add_theme_constant_override("separation", 3)
	event_panel.add_child(vbox)

	var hdr = Label.new()
	hdr.text = "INPUT EVENT STREAM"
	hdr.add_theme_color_override("font_color", Color(0.0, 0.88, 1.0, 1.0))
	hdr.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.95))
	hdr.add_theme_constant_override("shadow_offset_x", 1)
	hdr.add_theme_constant_override("shadow_offset_y", 1)
	hdr.add_theme_font_size_override("font_size", 11)
	vbox.add_child(hdr)

	event_list = VBoxContainer.new()
	event_list.add_theme_constant_override("separation", 2)
	vbox.add_child(event_list)

func _create_virtual_cursor() -> void:
	virtual_cursor = VirtualCursor.new()
	virtual_cursor.name = "VirtualCursor"
	virtual_cursor.position = current_cursor_pos
	add_child(virtual_cursor)

func set_cursor_position(pos: Vector2) -> void:
	current_cursor_pos = pos
	if virtual_cursor:
		virtual_cursor.position = pos

func human_move_and_click(target_pos: Vector2, ping_color: Color = Color(0.1, 0.95, 0.4, 0.95), tag_text: String = "", on_click_callback: Callable = Callable()) -> void:
	var start_pos = current_cursor_pos
	var dist = start_pos.distance_to(target_pos)
	
	if dist > 4.0:
		var duration = clamp(dist / 2400.0 + 0.12, 0.16, 0.34)
		var mid = (start_pos + target_pos) * 0.5
		var dir = (target_pos - start_pos).normalized()
		var perp = Vector2(-dir.y, dir.x)
		var arc_sign = 1.0 if int(start_pos.x + target_pos.y) % 2 == 0 else -1.0
		var arc_offset = perp * (clamp(dist * 0.08, 10.0, 32.0) * arc_sign)
		var ctrl_pt = mid + arc_offset
		
		var tw = create_tween()
		tw.set_trans(Tween.TRANS_CUBIC)
		tw.set_ease(Tween.EASE_OUT)
		
		tw.tween_method(func(t: float):
			var inv_t = 1.0 - t
			var p = inv_t * inv_t * start_pos + 2.0 * inv_t * t * ctrl_pt + t * t * target_pos
			current_cursor_pos = p
			if virtual_cursor:
				virtual_cursor.position = p
		, 0.0, 1.0, duration)
		
		await tw.finished
	else:
		current_cursor_pos = target_pos
		if virtual_cursor:
			virtual_cursor.position = target_pos
	
	await get_tree().create_timer(0.04).timeout
	
	if virtual_cursor:
		virtual_cursor.play_click_anim()
	
	spawn_click_ping(target_pos, ping_color, tag_text)
	
	await get_tree().create_timer(0.04).timeout
	
	if on_click_callback.is_valid():
		on_click_callback.call()

func set_step(step_text: String, subtitle: String = "", description: String = "") -> void:
	if step_label:
		step_label.text = step_text
	if status_label and subtitle != "":
		status_label.text = subtitle
	
	if desc_label:
		if description != "":
			desc_label.text = "📝 " + description
			desc_label.visible = true
			if step_panel:
				step_panel.custom_minimum_size = Vector2(1920, 56)
				step_panel.size = Vector2(1920, 56)
			if step_hbox:
				step_hbox.size = Vector2(1888, 52)
		else:
			desc_label.text = ""
			desc_label.visible = false
			if step_panel:
				step_panel.custom_minimum_size = Vector2(1920, 38)
				step_panel.size = Vector2(1920, 38)
			if step_hbox:
				step_hbox.size = Vector2(1888, 34)

	var tw = create_tween()
	tw.tween_property(step_badge, "modulate", Color(1.5, 1.5, 1.5, 1), 0.15)
	tw.tween_property(step_badge, "modulate", Color(1, 1, 1, 1), 0.25)

# ── State-API proof panel ─────────────────────────────────────────────────────
# Every Then-step posts what it verified *and the live values it read back from the
# GameState API / engine event journal*, so the recorded video carries its own evidence.
var proof_panel: PanelContainer = null
var proof_title: Label = null
var proof_round: Label = null
var proof_list: VBoxContainer = null
const PROOF_MAX_LINES := 9

func _create_proof_panel() -> void:
	proof_panel = PanelContainer.new()
	proof_panel.position = Vector2(14, 64)
	proof_panel.custom_minimum_size = Vector2(700, 0)
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.02, 0.06, 0.05, 0.72)
	style.set_border_width_all(1)
	style.border_color = Color(0.2, 0.95, 0.55, 0.55)
	style.set_corner_radius_all(4)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	proof_panel.add_theme_stylebox_override("panel", style)
	proof_panel.visible = false
	add_child(proof_panel)
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	proof_panel.add_child(v)
	var hdr = HBoxContainer.new()
	v.add_child(hdr)
	proof_title = Label.new()
	proof_title.text = "✅ VERIFIED VIA GAME STATE API"
	proof_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	proof_title.add_theme_color_override("font_color", Color(0.35, 1.0, 0.6))
	proof_title.add_theme_font_size_override("font_size", 12)
	hdr.add_child(proof_title)
	proof_round = Label.new()
	proof_round.add_theme_color_override("font_color", Color(0.75, 0.9, 1.0))
	proof_round.add_theme_font_size_override("font_size", 12)
	hdr.add_child(proof_round)
	proof_list = VBoxContainer.new()
	proof_list.add_theme_constant_override("separation", 1)
	v.add_child(proof_list)

func _process(_delta: float) -> void:
	if proof_round and proof_panel and proof_panel.visible and has_node("/root/GameState"):
		var gs = get_node("/root/GameState")
		proof_round.text = "⏱ IE ROUND %d  ·  %.1fs / %.0fs" % [gs.ie_round, gs.ie_round_elapsed, gs.IE_ROUND_SECONDS]

func clear_proofs(title: String = "") -> void:
	if not proof_list:
		return
	for c in proof_list.get_children():
		c.queue_free()
	var short = title if title.length() <= 64 else title.substr(0, 61) + "…"
	proof_title.text = "✅ VERIFIED VIA GAME STATE API" + ((" — " + short) if short != "" else "")
	proof_panel.visible = false

func add_proof(check: String, evidence: String = "", passed: bool = true) -> void:
	if not proof_list:
		return
	proof_panel.visible = true
	var box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 0)
	var l1 = Label.new()
	l1.text = ("✔ " if passed else "✘ ") + check
	l1.add_theme_color_override("font_color", Color(0.55, 1.0, 0.65) if passed else Color(1.0, 0.4, 0.4))
	l1.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.95))
	l1.add_theme_constant_override("shadow_offset_y", 1)
	l1.add_theme_font_size_override("font_size", 12)
	l1.custom_minimum_size = Vector2(680, 0)
	l1.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(l1)
	if evidence != "":
		var l2 = Label.new()
		l2.text = "    ↳ " + evidence
		l2.add_theme_color_override("font_color", Color(0.85, 0.92, 1.0, 0.95))
		l2.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.95))
		l2.add_theme_constant_override("shadow_offset_y", 1)
		l2.add_theme_font_size_override("font_size", 11)
		l2.custom_minimum_size = Vector2(680, 0)
		l2.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(l2)
	proof_list.add_child(box)
	while proof_list.get_child_count() > PROOF_MAX_LINES:
		var old = proof_list.get_child(0)
		proof_list.remove_child(old)
		old.queue_free()
	var tw = create_tween()
	box.modulate = Color(2.0, 2.0, 2.0, 0.0)
	tw.tween_property(box, "modulate", Color(1, 1, 1, 1), 0.35)

func log_event(event_text: String) -> void:
	recent_events.append(event_text)
	if recent_events.size() > 4:
		recent_events.pop_front()
	
	for c in event_list.get_children():
		c.queue_free()
	
	for ev in recent_events:
		var lbl = Label.new()
		lbl.text = ev
		lbl.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0, 0.95))
		lbl.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.95))
		lbl.add_theme_constant_override("shadow_offset_x", 1)
		lbl.add_theme_constant_override("shadow_offset_y", 1)
		lbl.add_theme_font_size_override("font_size", 11)
		event_list.add_child(lbl)

func spawn_click_ping(screen_pos: Vector2, ping_color: Color = Color(0.1, 0.95, 0.4, 0.95), tag_text: String = "") -> void:
	current_cursor_pos = screen_pos
	if virtual_cursor:
		virtual_cursor.position = screen_pos
		virtual_cursor.play_click_anim()

	var ping = Node2D.new()
	ping.position = screen_pos
	add_child(ping)

	var ring1 = PingRing.new(ping_color, tag_text)
	ping.add_child(ring1)

	var tw = create_tween()
	tw.set_parallel(true)
	tw.tween_property(ring1, "scale", Vector2(3.2, 3.2), 0.55).from(Vector2(0.3, 0.3))
	tw.tween_property(ring1, "modulate:a", 0.0, 0.55).from(1.0)
	tw.set_parallel(false)
	tw.tween_callback(ping.queue_free)

func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		set_cursor_position(event.position)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var is_shift = event.shift_pressed or Input.is_key_pressed(KEY_SHIFT)
		if is_shift:
			spawn_click_ping(event.position, Color(0.0, 0.9, 1.0, 0.95), "+")
			log_event("[SHIFT+CLICK] (x=%d, y=%d)" % [int(event.position.x), int(event.position.y)])
func _create_scenario_splash() -> void:
	splash_layer = Control.new()
	splash_layer.name = "ScenarioSplashLayer"
	splash_layer.custom_minimum_size = Vector2(1920, 1080)
	splash_layer.size = Vector2(1920, 1080)
	splash_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	splash_layer.visible = false
	add_child(splash_layer)

	# Full-screen subtle backdrop dim
	var dim = ColorRect.new()
	dim.color = Color(0.0, 0.0, 0.0, 0.65)
	dim.size = Vector2(1920, 1080)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	splash_layer.add_child(dim)

	# Centered Glass Slate Card (1160 x 480)
	splash_panel = Panel.new()
	splash_panel.custom_minimum_size = Vector2(1160, 480)
	splash_panel.size = Vector2(1160, 480)
	splash_panel.position = Vector2((1920 - 1160) / 2.0, (1080 - 480) / 2.0)
	splash_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var panel_style = StyleBoxFlat.new()
	panel_style.bg_color = Color(0.04, 0.07, 0.12, 0.96)
	panel_style.border_width_left = 2
	panel_style.border_width_top = 2
	panel_style.border_width_right = 2
	panel_style.border_width_bottom = 2
	panel_style.border_color = Color(0.96, 0.82, 0.28, 0.85) # Radiant Gold
	panel_style.corner_radius_top_left = 10
	panel_style.corner_radius_top_right = 10
	panel_style.corner_radius_bottom_left = 10
	panel_style.corner_radius_bottom_right = 10
	panel_style.shadow_color = Color(0.0, 0.0, 0.0, 0.8)
	panel_style.shadow_size = 24
	splash_panel.add_theme_stylebox_override("panel", panel_style)
	splash_layer.add_child(splash_panel)

	var margin = MarginContainer.new()
	margin.position = Vector2(0, 0)
	margin.size = Vector2(1160, 480)
	margin.add_theme_constant_override("margin_left", 36)
	margin.add_theme_constant_override("margin_top", 26)
	margin.add_theme_constant_override("margin_right", 36)
	margin.add_theme_constant_override("margin_bottom", 26)
	splash_panel.add_child(margin)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	margin.add_child(vbox)

	# Category Header
	var top_hdr = Label.new()
	top_hdr.text = "⚔️ ROBOS TACTICAL cRPG — BDD E2E WALKTHROUGH"
	top_hdr.add_theme_color_override("font_color", Color(0.0, 0.9, 0.75, 1.0))
	top_hdr.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.95))
	top_hdr.add_theme_constant_override("shadow_offset_x", 1)
	top_hdr.add_theme_constant_override("shadow_offset_y", 1)
	top_hdr.add_theme_font_size_override("font_size", 13)
	vbox.add_child(top_hdr)

	# Scenario Title
	splash_title = Label.new()
	splash_title.text = "Scenario Title"
	splash_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	splash_title.add_theme_color_override("font_color", Color(1.0, 0.88, 0.35, 1.0))
	splash_title.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.95))
	splash_title.add_theme_constant_override("shadow_offset_x", 2)
	splash_title.add_theme_constant_override("shadow_offset_y", 2)
	splash_title.add_theme_font_size_override("font_size", 24)
	vbox.add_child(splash_title)

	# Divider line
	var div = ColorRect.new()
	div.custom_minimum_size = Vector2(1088, 2)
	div.color = Color(0.2, 0.35, 0.45, 0.6)
	vbox.add_child(div)

	# Multi-line Description Label (wrapped)
	splash_desc = Label.new()
	splash_desc.text = "Scenario Description goes here..."
	splash_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	splash_desc.custom_minimum_size = Vector2(1088, 140)
	splash_desc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	splash_desc.add_theme_color_override("font_color", Color(0.92, 0.94, 0.96, 0.95))
	splash_desc.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.9))
	splash_desc.add_theme_constant_override("shadow_offset_x", 1)
	splash_desc.add_theme_constant_override("shadow_offset_y", 1)
	splash_desc.add_theme_font_size_override("font_size", 15)
	vbox.add_child(splash_desc)

	# Metadata Pills (Starting Scene + Party State)
	var pills_box = HBoxContainer.new()
	pills_box.add_theme_constant_override("separation", 16)
	vbox.add_child(pills_box)

	# Scene Pill
	splash_scene_pill = Label.new()
	splash_scene_pill.text = "📍 Starting Map: TacticalBattle"
	splash_scene_pill.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0, 1.0))
	splash_scene_pill.add_theme_font_size_override("font_size", 13)
	var sc_style = StyleBoxFlat.new()
	sc_style.bg_color = Color(0.05, 0.25, 0.4, 0.45)
	sc_style.border_width_left = 1
	sc_style.border_width_top = 1
	sc_style.border_width_right = 1
	sc_style.border_width_bottom = 1
	sc_style.border_color = Color(0.1, 0.6, 0.8, 0.6)
	sc_style.corner_radius_top_left = 6
	sc_style.corner_radius_top_right = 6
	sc_style.corner_radius_bottom_left = 6
	sc_style.corner_radius_bottom_right = 6
	sc_style.content_margin_left = 12
	sc_style.content_margin_right = 12
	sc_style.content_margin_top = 6
	sc_style.content_margin_bottom = 6
	splash_scene_pill.add_theme_stylebox_override("panel", sc_style)
	pills_box.add_child(splash_scene_pill)

	# Party State Pill
	splash_state_pill = Label.new()
	splash_state_pill.text = "🛡️ Party: Lieutenant Vance (Lvl 1 Fighter)"
	splash_state_pill.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	splash_state_pill.add_theme_color_override("font_color", Color(0.5, 1.0, 0.6, 1.0))
	splash_state_pill.add_theme_font_size_override("font_size", 13)
	var st_style = StyleBoxFlat.new()
	st_style.bg_color = Color(0.08, 0.3, 0.18, 0.45)
	st_style.border_width_left = 1
	st_style.border_width_top = 1
	st_style.border_width_right = 1
	st_style.border_width_bottom = 1
	st_style.border_color = Color(0.2, 0.8, 0.4, 0.6)
	st_style.corner_radius_top_left = 6
	st_style.corner_radius_top_right = 6
	st_style.corner_radius_bottom_left = 6
	st_style.corner_radius_bottom_right = 6
	st_style.content_margin_left = 12
	st_style.content_margin_right = 12
	st_style.content_margin_top = 6
	st_style.content_margin_bottom = 6
	splash_state_pill.add_theme_stylebox_override("panel", st_style)
	pills_box.add_child(splash_state_pill)

	# Footer / Progress Indicator
	var ftr_box = VBoxContainer.new()
	ftr_box.add_theme_constant_override("separation", 4)
	vbox.add_child(ftr_box)

	var ftr_lbl = Label.new()
	ftr_lbl.text = "▶ SCENARIO PLAYTHROUGH COMMENCING..."
	ftr_lbl.add_theme_color_override("font_color", Color(0.7, 0.8, 0.85, 0.75))
	ftr_lbl.add_theme_font_size_override("font_size", 11)
	ftr_box.add_child(ftr_lbl)

	splash_bar = ProgressBar.new()
	splash_bar.custom_minimum_size = Vector2(1088, 6)
	splash_bar.max_value = 1.0
	splash_bar.value = 0.0
	splash_bar.show_percentage = false
	var bar_bg = StyleBoxFlat.new()
	bar_bg.bg_color = Color(0.1, 0.15, 0.2, 0.8)
	var bar_fill = StyleBoxFlat.new()
	bar_fill.bg_color = Color(0.96, 0.82, 0.28, 1.0) # Gold
	splash_bar.add_theme_stylebox_override("background", bar_bg)
	splash_bar.add_theme_stylebox_override("fill", bar_fill)
	ftr_box.add_child(splash_bar)

func show_scenario_splash(scenario_name: String, description: String, starting_scene: String, game_state_summary: String, duration: float = 3.0) -> void:
	if not splash_layer:
		return
	
	if splash_timer_tween and splash_timer_tween.is_valid():
		splash_timer_tween.kill()

	if splash_title:
		splash_title.text = scenario_name
	if splash_desc:
		splash_desc.text = description if description != "" else "Tactical E2E scenario execution validating party mechanics and world rules."
	if splash_scene_pill:
		splash_scene_pill.text = "Map: " + (starting_scene if starting_scene != "" else "Homestead")
	if splash_state_pill:
		splash_state_pill.text = game_state_summary if game_state_summary != "" else "Hero: Lieutenant Vance | Level 1 Fighter"
	
	if splash_bar:
		splash_bar.value = 0.0
	splash_layer.modulate = Color(1, 1, 1, 0)
	splash_layer.visible = true

	# Sequential exact 3.0s timing: 0.2s fade in -> 2.5s progress bar fill -> 0.3s fade out
	var hold_dur = max(0.5, duration - 0.5)
	splash_timer_tween = create_tween()
	splash_timer_tween.tween_property(splash_layer, "modulate:a", 1.0, 0.2)
	splash_timer_tween.tween_property(splash_bar, "value", 1.0, hold_dur)
	splash_timer_tween.tween_property(splash_layer, "modulate:a", 0.0, 0.3)
	splash_timer_tween.tween_callback(func():
		if splash_layer:
			splash_layer.visible = false
	)

class VirtualCursor extends Node2D:
	var click_tween: Tween = null
	
	func _ready() -> void:
		z_index = 100
		queue_redraw()
	
	func play_click_anim() -> void:
		if click_tween and click_tween.is_valid():
			click_tween.kill()
		scale = Vector2(0.84, 0.84)
		modulate = Color(1.3, 1.3, 1.2, 1.0)
		click_tween = create_tween()
		click_tween.parallel().tween_property(self, "scale", Vector2(1.0, 1.0), 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		click_tween.parallel().tween_property(self, "modulate", Color(1.0, 1.0, 1.0, 1.0), 0.12)
	
	func _draw() -> void:
		# Classic RPG Pointer Arrow with tip at Vector2.ZERO
		var arrow_poly = PackedVector2Array([
			Vector2(0, 0),       # Tip
			Vector2(0, 23),      # Left edge
			Vector2(5.5, 17.5),  # Inner crook
			Vector2(10.5, 28),   # Stem left bottom
			Vector2(15.5, 26),   # Stem right bottom
			Vector2(10.5, 15.5), # Stem right top
			Vector2(18.5, 15.5)  # Right wing
		])
		
		# 1. Soft drop shadow
		var shadow_poly = PackedVector2Array()
		for pt in arrow_poly:
			shadow_poly.append(pt + Vector2(2.5, 2.5))
		draw_colored_polygon(shadow_poly, Color(0.0, 0.0, 0.0, 0.50))
		
		# 2. Dark charcoal outline
		var outline = PackedVector2Array(arrow_poly)
		outline.append(arrow_poly[0])
		draw_polyline(outline, Color(0.08, 0.08, 0.10, 1.0), 2.5, true)
		
		# 3. Metallic Gold fill
		draw_colored_polygon(arrow_poly, Color(0.96, 0.82, 0.28, 1.0))
		
		# 4. Highlight line on left spine for 3D metallic feel
		draw_line(Vector2(1.2, 2.0), Vector2(1.2, 21.0), Color(1.0, 0.98, 0.75, 0.95), 1.5, true)
		
		# 5. Accent jewel
		draw_circle(Vector2(5.0, 7.5), 1.8, Color(0.2, 0.9, 1.0, 1.0))

class PingRing extends Node2D:
	var color: Color
	var tag: String
	func _init(p_color: Color, p_tag: String = "") -> void:
		color = p_color
		tag = p_tag
	func _draw() -> void:
		# Draw outer expanding ring
		draw_arc(Vector2.ZERO, 16.0, 0, TAU, 32, color, 3.0, true)
		# Draw secondary inner ring
		draw_arc(Vector2.ZERO, 8.0, 0, TAU, 24, Color(1.0, 1.0, 1.0, color.a * 0.8), 2.0, true)
		# Draw center dot
		draw_circle(Vector2.ZERO, 4.0, Color(1.0, 1.0, 1.0, color.a))
		if tag != "":
			draw_string(ThemeDB.fallback_font, Vector2(18, -10), tag, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, color)

