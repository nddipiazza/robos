extends Node
## DemoController.gd — Autoload coordinator for RobOS cRPG Demo Mode.
## Provides the persistent bottom control bar and test-pyramid drawer (layer 124)
## that survives Godot scene transitions during Real Mode playthroughs, while
## allowing instant toggling between Demo Arena mode and Real cRPG Mode.

const DemoRunner := preload("res://scripts/demo/DemoRunner.gd")

enum Mode { DEMO, REAL }

const STATUS_ICON := {
	"pending": "·", "running": "▶", "passed": "✓", "failed": "✗", "skipped": "⤼", "desktop": "🖥", "cancelled": "·"
}
const STATUS_COLOR := {
	"passed": Color(0.35, 0.9, 0.5), "failed": Color(1, 0.4, 0.4), "running": Color(1, 0.85, 0.3),
	"skipped": Color(0.6, 0.7, 0.9), "desktop": Color(0.55, 0.6, 0.7)
}
const SPEEDS := [0.25, 0.5, 1.0, 2.0, 4.0]

var mode: int = Mode.DEMO
var is_active: bool = false
var runner: Node = null

var canvas_layer: CanvasLayer = null
var bar: Panel = null
var drawer: Panel = null
var tree: Tree = null
var now_label: Label = null
var counts_label: Label = null
var mode_btn: Button = null
var play_btn: Button = null
var speed_btn: Button = null
var speed_i := 2
var combat_slider: HSlider = null
var combat_time_label: Label = null
var items := {}  # scenario index -> TreeItem

func _ready() -> void:
	process_mode = PROCESS_MODE_ALWAYS
	runner = DemoRunner.new()
	add_child(runner)
	runner.scenario_started.connect(_on_started)
	runner.scenario_finished.connect(_on_finished)
	runner.cycle_finished.connect(func(p, f, s): _update_counts())
	runner.load_catalog()

	_build_ui()
	canvas_layer.visible = false

# ── UI Construction ──────────────────────────────────────────────────────────

func _panel_style(alpha: float = 0.94) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.03, 0.04, 0.07, alpha)
	sb.border_color = Color(0.2, 0.4, 0.6)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(6)
	return sb

func _build_ui() -> void:
	canvas_layer = CanvasLayer.new()
	canvas_layer.layer = 124  # under QAOverlay (125) so virtual cursor stays on top
	add_child(canvas_layer)

	# Control bar along the bottom
	bar = Panel.new()
	bar.position = Vector2(0, 1044)
	bar.size = Vector2(1920, 36)
	bar.add_theme_stylebox_override("panel", _panel_style())
	canvas_layer.add_child(bar)

	var row := HBoxContainer.new()
	row.position = Vector2(10, 3)
	row.size = Vector2(1900, 30)
	row.add_theme_constant_override("separation", 8)
	bar.add_child(row)

	mode_btn = _button("🎭 Mode: Demo Arena", _toggle_mode)
	mode_btn.tooltip_text = "Switch between Demo Arena and Real cRPG Mode (Hot key: M)"
	mode_btn.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0))
	row.add_child(mode_btn)

	var list_btn := _button("☰ Test pyramid", func(): drawer.visible = not drawer.visible)
	list_btn.tooltip_text = "Toggle test pyramid drawer (Hot key: T)"
	row.add_child(list_btn)

	var prev_btn := _button("⏮ Prev", _prev)
	prev_btn.tooltip_text = "Previous test (Hot key: Left)"
	row.add_child(prev_btn)

	play_btn = _button("⏸ Pause", _toggle_pause)
	play_btn.tooltip_text = "Pause or resume scenario playback (Hot key: Space)"
	row.add_child(play_btn)

	var next_btn := _button("Next ⏭", _next)
	next_btn.tooltip_text = "Next test (Hot key: Right)"
	row.add_child(next_btn)

	speed_btn = _button("Speed 1x", _cycle_speed)
	speed_btn.tooltip_text = "Cycle playback speed multiplier (Hot keys: 1-5)"
	row.add_child(speed_btn)

	var sep1 := VSeparator.new()
	row.add_child(sep1)

	var round_lbl := Label.new()
	round_lbl.text = "Round pace:"
	round_lbl.add_theme_font_size_override("font_size", 14)
	round_lbl.add_theme_color_override("font_color", Color(0.65, 0.8, 1.0))
	row.add_child(round_lbl)

	var slower_btn := _button("🐢 Slower", _combat_slower)
	slower_btn.tooltip_text = "Slow down round/combat timer (Hot keys: [ or -)"
	row.add_child(slower_btn)

	combat_slider = HSlider.new()
	combat_slider.custom_minimum_size = Vector2(90, 24)
	combat_slider.min_value = 0.4
	combat_slider.max_value = 6.0
	combat_slider.step = 0.2
	combat_slider.value = runner.turn_pause
	combat_slider.focus_mode = Control.FOCUS_NONE
	combat_slider.tooltip_text = "Turn/action pause duration in seconds"
	combat_slider.value_changed.connect(_on_combat_slider_changed)
	row.add_child(combat_slider)

	var faster_btn := _button("Faster 🐇", _combat_faster)
	faster_btn.tooltip_text = "Speed up round/combat timer (Hot keys: ] or +)"
	row.add_child(faster_btn)

	combat_time_label = Label.new()
	combat_time_label.custom_minimum_size = Vector2(70, 0)
	combat_time_label.text = "%.1fs/turn" % runner.turn_pause
	combat_time_label.add_theme_font_size_override("font_size", 14)
	combat_time_label.add_theme_color_override("font_color", Color(0.4, 0.85, 1.0))
	row.add_child(combat_time_label)

	var sep2 := VSeparator.new()
	row.add_child(sep2)

	now_label = Label.new()
	now_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	now_label.clip_text = true
	now_label.add_theme_font_size_override("font_size", 14)
	now_label.add_theme_color_override("font_color", Color(0.85, 0.93, 1.0))
	row.add_child(now_label)

	counts_label = Label.new()
	counts_label.add_theme_font_size_override("font_size", 14)
	row.add_child(counts_label)

	var exit_btn := _button("✕ Exit demo", _exit)
	exit_btn.tooltip_text = "Exit demo mode (Hot key: Esc)"
	row.add_child(exit_btn)

	# Test-pyramid navigator drawer (right side)
	drawer = Panel.new()
	drawer.position = Vector2(1180, 186)
	drawer.size = Vector2(730, 852)
	drawer.add_theme_stylebox_override("panel", _panel_style(0.97))
	drawer.visible = false
	canvas_layer.add_child(drawer)

	var title := Label.new()
	title.text = "Test pyramid: click a test to jump to it"
	title.position = Vector2(14, 8)
	title.add_theme_font_size_override("font_size", 17)
	title.add_theme_color_override("font_color", Color(0.4, 0.85, 1.0))
	drawer.add_child(title)

	tree = Tree.new()
	tree.position = Vector2(8, 38)
	tree.size = Vector2(714, 806)
	tree.columns = 2
	tree.set_column_expand(1, false)
	tree.set_column_custom_minimum_width(1, 40)
	tree.hide_root = true
	tree.add_theme_font_size_override("font_size", 14)
	tree.item_activated.connect(_on_tree_activated)
	tree.item_selected.connect(_on_tree_activated)
	drawer.add_child(tree)

func _button(text: String, fn: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", 14)
	b.pressed.connect(fn)
	return b

func _fill_tree() -> void:
	tree.clear()
	items.clear()
	var root := tree.create_item()
	# Show pyramid top-down: playthroughs, scene tests, then the engine base
	var layers: Array = runner.LAYERS.duplicate()
	layers.reverse()
	for layer in layers:
		var n := 0
		for sc in runner.scenarios:
			if sc["layer"] == layer["id"]:
				n += 1
		var li := tree.create_item(root)
		var is_layer_active: bool = (mode == Mode.REAL and layer["id"] in ["playthroughs", "scenes", "scenarios"]) or (mode == Mode.DEMO and layer["id"] == "engine")
		var mode_hint: String = "active" if is_layer_active else ("click to switch to " + ("Real Mode" if layer["id"] != "engine" else "Demo Arena"))
		li.set_text(0, "%s — %d tests [%s]" % [layer["title"], n, mode_hint])
		li.set_custom_color(0, Color(0.4, 0.85, 1.0) if is_layer_active else Color(0.6, 0.65, 0.75))
		li.set_selectable(0, false)
		li.set_selectable(1, false)
		li.collapsed = not is_layer_active
		for feat in runner.features:
			if feat["layer"] != layer["id"]:
				continue
			var fi := tree.create_item(li)
			fi.set_text(0, "%s  (%s)" % [feat["name"], feat["file"]])
			fi.set_selectable(0, false)
			fi.set_selectable(1, false)
			fi.collapsed = true
			for idx in range(int(feat["first"]), int(feat["last"]) + 1):
				var si := tree.create_item(fi)
				si.set_text(0, str(runner.scenarios[idx]["name"]))
				si.set_metadata(0, idx)
				items[idx] = si
				_paint(idx)

func _paint(idx: int) -> void:
	if not items.has(idx):
		return
	var sc: Dictionary = runner.scenarios[idx]
	var st: String = sc["status"] if sc["runnable"] else "desktop"
	var it: TreeItem = items[idx]
	it.set_text(1, STATUS_ICON.get(st, "·"))
	it.set_custom_color(1, STATUS_COLOR.get(st, Color(0.7, 0.7, 0.7)))
	it.set_tooltip_text(0, str(sc["message"]) if str(sc["message"]) != "" else str(sc["description"]))

func _update_counts() -> void:
	var t: Dictionary = runner.tally()
	counts_label.text = "✓ %d   ✗ %d   ⤼ %d   · %d" % [int(t["passed"]), int(t["failed"]), int(t["skipped"]), int(t["pending"])]

# ── Lifecycle & Modes ────────────────────────────────────────────────────────

func start_demo(initial_mode: int = Mode.DEMO, target_scenario_index: int = -1) -> void:
	is_active = true
	canvas_layer.visible = true
	if has_node("/root/QAOverlay"):
		get_node("/root/QAOverlay").set_hud_visible(true)
	await set_mode(initial_mode, false)
	_fill_tree()
	_update_counts()

	if mode == Mode.DEMO:
		var cur = get_tree().current_scene
		if cur == null or cur.name != "DemoMode":
			get_tree().change_scene_to_file("res://scenes/DemoMode.tscn")
			await _wait_scene("DemoMode", 5.0)
	else:
		var cur = get_tree().current_scene
		if cur == null or cur.name == "DemoMode":
			get_tree().change_scene_to_file("res://scenes/CharacterSelect.tscn")
			await _wait_scene("CharacterSelect", 5.0)

	if target_scenario_index >= 0:
		runner.play_from(target_scenario_index)
	else:
		var order: Array = runner.runnable_indices()
		if not order.is_empty():
			runner.play_from(order[0])

func set_mode(new_mode: int, switch_scene: bool = true) -> void:
	mode = new_mode
	runner.set_mode(mode)
	if mode_btn:
		mode_btn.text = "🎭 Mode: Demo Arena" if mode == Mode.DEMO else "🎮 Mode: Real cRPG"
		mode_btn.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0) if mode == Mode.DEMO else Color(0.35, 0.9, 0.5))
	_fill_tree()
	_update_counts()

	if switch_scene:
		runner.stop()
		if mode == Mode.DEMO:
			get_tree().change_scene_to_file("res://scenes/DemoMode.tscn")
			await _wait_scene("DemoMode", 5.0)
		else:
			get_tree().change_scene_to_file("res://scenes/CharacterSelect.tscn")
			await _wait_scene("CharacterSelect", 5.0)
		var order: Array = runner.runnable_indices()
		if not order.is_empty():
			runner.play_from(order[0])

func _toggle_mode() -> void:
	await set_mode(Mode.REAL if mode == Mode.DEMO else Mode.DEMO, true)

func _wait_scene(scene_name: String, timeout: float = 5.0) -> bool:
	var elapsed := 0.0
	while elapsed < timeout:
		if get_tree() and get_tree().current_scene and get_tree().current_scene.name == scene_name:
			return true
		await get_tree().process_frame
		elapsed += get_process_delta_time()
	return false

func _exit() -> void:
	is_active = false
	runner.stop()
	canvas_layer.visible = false
	drawer.visible = false
	if has_node("/root/QAOverlay"):
		get_node("/root/QAOverlay").set_hud_visible(false)
	get_tree().change_scene_to_file("res://scenes/CharacterSelect.tscn")

# ── Events and Controls ──────────────────────────────────────────────────────

func _layer_title(id: String) -> String:
	for l in runner.LAYERS:
		if l["id"] == id:
			return str(l["title"]).get_slice(" ·", 0)
	return id

func _on_started(idx: int) -> void:
	var sc: Dictionary = runner.scenarios[idx]
	var order: Array = runner.runnable_indices()
	var pos := order.find(idx)
	var mode_name := "Demo Arena" if mode == Mode.DEMO else "Real cRPG"
	now_label.text = "[%s] %s · %s › %s%s" % [
		mode_name, _layer_title(sc["layer"]), sc["feature"], sc["name"],
		"   (%d of %d)" % [pos + 1, order.size()] if pos >= 0 else "   (switch mode to run)"
	]
	_paint(idx)
	if items.has(idx):
		var it: TreeItem = items[idx]
		it.get_parent().collapsed = false
		tree.scroll_to_item(it)

func _on_finished(idx: int, status: String, message: String) -> void:
	_paint(idx)
	_update_counts()

func _on_tree_activated() -> void:
	var it := tree.get_selected()
	if it == null or it.get_metadata(0) == null:
		return
	var idx: int = it.get_metadata(0)
	var sc: Dictionary = runner.scenarios[idx]
	runner.paused = false
	play_btn.text = "⏸ Pause"

	# If the clicked test belongs to the other mode, switch mode automatically!
	var is_engine: bool = sc["layer"] == "engine"
	if is_engine and mode != Mode.DEMO:
		mode = Mode.DEMO
		runner.set_mode(mode)
		if mode_btn:
			mode_btn.text = "🎭 Mode: Demo Arena"
			mode_btn.add_theme_color_override("font_color", Color(0.4, 0.9, 1.0))
		_fill_tree()
		runner.stop()
		get_tree().change_scene_to_file("res://scenes/DemoMode.tscn")
		await _wait_scene("DemoMode", 5.0)
		runner.play_from(idx)
		return
	elif not is_engine and mode != Mode.REAL:
		mode = Mode.REAL
		runner.set_mode(mode)
		if mode_btn:
			mode_btn.text = "🎮 Mode: Real cRPG"
			mode_btn.add_theme_color_override("font_color", Color(0.35, 0.9, 0.5))
		_fill_tree()
		runner.stop()
		get_tree().change_scene_to_file("res://scenes/CharacterSelect.tscn")
		await _wait_scene("CharacterSelect", 5.0)
		runner.play_from(idx)
		return

	if runner.scenarios[idx]["runnable"]:
		runner.play_from(idx)
	else:
		runner.stop()
		runner.run_scenario(idx)

func _toggle_pause() -> void:
	runner.paused = not runner.paused
	play_btn.text = "▶ Play" if runner.paused else "⏸ Pause"

func _step(dir: int) -> void:
	var order: Array = runner.runnable_indices()
	if order.is_empty():
		return
	var pos := order.find(runner.current)
	if pos < 0:
		pos = 0
		for k in range(order.size()):
			if order[k] > runner.current:
				pos = k - 1 if dir > 0 else k
				break
	var nxt: int = order[posmod(pos + dir, order.size())]
	runner.paused = false
	play_btn.text = "⏸ Pause"
	runner.play_from(nxt)

func _prev() -> void:
	_step(-1)

func _next() -> void:
	_step(1)

func _cycle_speed() -> void:
	speed_i = (speed_i + 1) % SPEEDS.size()
	_set_speed(speed_i)

func _set_speed(i: int) -> void:
	speed_i = i
	runner.speed = SPEEDS[i]
	speed_btn.text = "Speed %sx" % str(SPEEDS[i]).trim_suffix(".0")

func _combat_slower() -> void:
	_set_turn_pause(runner.turn_pause + 0.4)

func _combat_faster() -> void:
	_set_turn_pause(runner.turn_pause - 0.4)

func _on_combat_slider_changed(val: float) -> void:
	_set_turn_pause(val)

func _set_turn_pause(val: float) -> void:
	val = clampf(val, 0.4, 6.0)
	runner.set_turn_pause(val)
	if combat_slider and not is_equal_approx(combat_slider.value, val):
		combat_slider.set_value_no_signal(val)
	if combat_time_label:
		combat_time_label.text = "%.1fs/turn" % val

func _unhandled_input(event: InputEvent) -> void:
	if not is_active:
		return
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_M:
			_toggle_mode()
		KEY_SPACE:
			_toggle_pause()
		KEY_RIGHT:
			_next()
		KEY_LEFT:
			_prev()
		KEY_T:
			drawer.visible = not drawer.visible
		KEY_1, KEY_2, KEY_3, KEY_4, KEY_5:
			var idx: int = event.keycode - KEY_1
			if idx < SPEEDS.size():
				_set_speed(idx)
		KEY_BRACKETLEFT, KEY_MINUS:
			_combat_slower()
		KEY_BRACKETRIGHT, KEY_EQUAL:
			_combat_faster()
		KEY_ESCAPE:
			_exit()
