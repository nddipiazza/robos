extends Node2D

# RTSMain.gd — view shell: input, selection, commands and in-world overlays.
# The HUD (resource readout, minimap, selection panel, command card) lives in RTSHud.gd.

const RTSWorld3DScript = preload("res://scripts/RTSWorld3D.gd")
const RTSIconsScript = preload("res://scripts/RTSIcons.gd")
const RTSHudScript = preload("res://scripts/RTSHud.gd")
const GameInput = preload("res://scripts/RTSGameInput.gd")

# Screen layout (1920x1080 virtual canvas)
const HUD_TOP := 844.0
const MINIMAP := Rect2(26.0, 876.0, 252.0, 189.0)
const SEL_PANEL := Rect2(304.0, 856.0, 1236.0, 212.0)
const CARD_ORIGIN := Vector2(1560.0, 862.0)
const CARD_BTN := 64.0
const CARD_GAP := 6.0
const IDLE_BTN := Rect2(26.0, 786.0, 96.0, 48.0)
const CONTROL_GROUP_KEYS := [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
const CAMERA_KEYS := [KEY_F3, KEY_F4, KEY_F9, KEY_F11]
const GRID_KEYS := "QWERTASDFGZXCVB"
const EDGE_SCROLL_MARGIN := 14.0

var world_3d: Node3D
var icons: Node
var hud: Node2D
var match_menu: CanvasLayer

var local_player: int = 1
var observer_player := -1
var health_bar_mode := 0
var reveal_health_bars := false
var selected_tags: Array[int] = []
var _inspected_deposit_tag := 0
var control_groups: Dictionary = {}
var active_type: String = ""

var is_box_selecting: bool = false
var box_start_screen: Vector2 = Vector2.ZERO
var box_end_screen: Vector2 = Vector2.ZERO
var _box_pick_type := false
var mm_dragging: bool = false
var mid_dragging: bool = false

var pending_ability: String = ""
var messages: Array[Dictionary] = []
var alerts: Array[Dictionary] = []
var attack_history: Array[Vector2] = []
var _attack_cursor := -1
var _tracked_tag := 0
var click_markers: Array[Dictionary] = []
var hover_override: Variant = null
var show_help: bool = false
var show_names: bool = false
var hud_hidden: bool = false
var banner_ttl: float = 0.0
var _attack_msg_cd: float = 0.0
var _last_group_press: Dictionary = {}
var _camera_bookmarks: Dictionary = {}
var _last_base_tag := 0
var _saturation := {}
var _saturation_refresh := 0.0

func _ready() -> void:
	SimEngine.scenario_loaded.connect(_on_scenario_loaded)
	SimEngine.notice.connect(_on_notice)
	SimEngine.unit_damaged.connect(_on_unit_damaged)
	# Headless runs (E2E tests) only need the sim and the control server, so skip rendering.
	if DisplayServer.get_name() == "headless":
		set_process(false)
		return
	SimEngine.resource_depleted.connect(_on_resource_depleted)
	get_window().focus_exited.connect(func(): reveal_health_bars = false)
	world_3d = RTSWorld3DScript.new()
	world_3d.name = "RTSWorld3D"
	add_child(world_3d)
	if RTSAudio:
		RTSAudio.world_3d = world_3d
		RTSAudio.local_player_id = local_player
		if not RTSAudio.dialogue_spoken.is_connected(_on_dialogue_spoken):
			RTSAudio.dialogue_spoken.connect(_on_dialogue_spoken)

	icons = RTSIconsScript.new()
	icons.name = "RTSIcons"
	add_child(icons)

	hud = RTSHudScript.new()
	hud.name = "RTSHud"
	hud.main = self
	add_child(hud)
	match_menu = preload("res://scripts/RTSMatchMenu.gd").new()
	add_child(match_menu)
	match_menu.observe_requested.connect(_enter_observer)
	match_menu.health_mode_changed.connect(func(mode): health_bar_mode = mode)
	health_bar_mode = match_menu.health_bars.selected
	_on_scenario_loaded(SimEngine.scenario_name)
	_restore_title_view()

func save_title_view() -> void:
	SimEngine.title_battle_view = {
		"local_player": local_player,
		"selected": selected_tags.duplicate(),
		"active_type": active_type,
		"groups": control_groups.duplicate(true),
		"bookmarks": _camera_bookmarks.duplicate(true),
		"focus": world_3d.get_focus(),
		"height": world_3d.cam_height,
	}

func _restore_title_view() -> void:
	var saved := SimEngine.title_battle_view
	if saved.is_empty():
		return
	_set_local_player(saved.local_player)
	selected_tags.assign(saved.selected)
	active_type = saved.active_type
	control_groups = saved.groups
	_camera_bookmarks = saved.bookmarks
	_focus_camera(saved.focus, saved.height)
	_prune_control_groups()
	SimEngine.title_battle_view = {}

func _on_scenario_loaded(_name: String) -> void:
	if match_menu:
		match_menu.reset_views()
	if not SimEngine.match_state.is_empty():
		local_player = 1
	if RTSAudio:
		RTSAudio.local_player_id = local_player
	selected_tags.clear()
	_inspected_deposit_tag = 0
	pending_ability = ""
	control_groups.clear()
	_last_group_press.clear()
	_camera_bookmarks.clear()
	_last_base_tag = 0
	_saturation_refresh = 0.0
	messages.clear()
	alerts.clear()
	attack_history.clear()
	_attack_cursor = -1
	_attack_msg_cd = 0.0
	_tracked_tag = 0
	observer_player = -1
	click_markers.clear()
	active_type = ""
	banner_ttl = 4.5
	focus_on_base()

func _on_notice(owner_id: int, text: String, kind: String) -> void:
	if owner_id == local_player:
		push_message(text, kind)

func _on_resource_depleted(owner_id: int, resource_type: String) -> void:
	if owner_id == local_player:
		push_message("Aether vent depleted." if resource_type == "aether_vent" else "Crystal field depleted.", "warn")

func _on_dialogue_spoken(unit_type: String, _category: String, _line_id: String, text: String) -> void:
	if text == "":
		return
	var u_def: Dictionary = RTSData.get_unit_def(unit_type)
	var u_name: String = str(u_def.get("name", unit_type.capitalize()))
	push_message("%s: \"%s\"" % [u_name, text], "info")

func _on_unit_damaged(owner_id: int, pos: Vector2) -> void:
	if owner_id != local_player:
		return
	for a in alerts:
		if a["pos"].distance_to(pos) < 22.0 and a["ttl"] > 1.0:
			return
	alerts.append({"pos": pos, "ttl": 4.0, "max": 4.0})
	for i in range(attack_history.size() - 1, -1, -1):
		if attack_history[i].distance_to(pos) < 22.0:
			attack_history.remove_at(i)
	attack_history.push_front(pos)
	if attack_history.size() > 6:
		attack_history.pop_back()
	_attack_cursor = -1
	if _attack_msg_cd <= 0.0:
		push_message("Your forces are under attack!", "warn")
		if RTSAudio:
			RTSAudio.play_ui("alert_under_attack")
		_attack_msg_cd = 10.0

func push_message(text: String, kind: String = "info") -> void:
	for m in messages:
		if m["text"] == text and m["ttl"] > 3.0:
			return
	messages.append({"text": text, "kind": kind, "ttl": 5.0})
	if messages.size() > 5:
		messages.pop_front()

# ---------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------
func focus_on_base() -> void:
	if not world_3d:
		return
	var best: Dictionary = {}
	for u in SimEngine.units.values():
		if u["owner"] != local_player:
			continue
		var def: Dictionary = RTSData.get_unit_def(u["unit_type"])
		if bool(def.get("is_town_hall", false)):
			best = u
			break
		if best.is_empty():
			best = u
	if best.is_empty():
		_focus_camera(Vector2(SimEngine.map_width * 0.5, SimEngine.map_height * 0.5), 56.0)
	else:
		_focus_camera(best["pos"] + Vector2(9.0, -1.0), 40.0)

func _focus_camera(position: Vector2, height: float = -1.0) -> void:
	_tracked_tag = 0
	if world_3d:
		world_3d.set_focus(position, height)

func _toggle_camera_tracking() -> void:
	if _tracked_tag > 0:
		_tracked_tag = 0
		return
	for unit in selected_owned():
		if not unit.is_structure:
			_tracked_tag = unit.tag
			_update_camera_tracking()
			return

func _update_camera_tracking() -> void:
	if _tracked_tag == 0 or not world_3d:
		return
	var unit: Dictionary = SimEngine.units.get(_tracked_tag, {})
	if unit.is_empty() or unit.owner != local_player:
		_tracked_tag = 0
	elif world_3d.get_focus().distance_squared_to(unit.pos) > 0.001:
		world_3d.set_focus(unit.pos)

func _jump_to_attack() -> void:
	if attack_history.is_empty():
		focus_on_base()
		return
	_attack_cursor = (_attack_cursor + 1) % attack_history.size()
	_focus_camera(attack_history[_attack_cursor])

func _jump_to_attack_pin(screen_position: Vector2) -> bool:
	for i in range(attack_history.size()):
		if screen_position.distance_squared_to(world_to_minimap(attack_history[i])) <= 49.0:
			_attack_cursor = i
			_focus_camera(attack_history[i])
			return true
	return false

func _camera_bookmark(key: int, save: bool) -> void:
	if not world_3d:
		return
	var label := OS.get_keycode_string(key)
	if save:
		_camera_bookmarks[key] = {"focus": world_3d.get_focus(), "height": world_3d.cam_height}
		push_message("Camera location saved to %s." % label)
	elif _camera_bookmarks.has(key):
		var bookmark: Dictionary = _camera_bookmarks[key]
		_focus_camera(bookmark.focus, bookmark.height)
	else:
		push_message("Save a camera location with Ctrl+%s." % label)

func _cycle_base() -> void:
	if not world_3d:
		return
	var bases: Array[int] = []
	for unit in SimEngine.units.values():
		if unit.owner == local_player and unit.hp > 0.0 and unit.build_progress >= 1.0:
			if RTSData.get_unit_def(unit.unit_type).get("is_town_hall", false):
				bases.append(unit.tag)
	if bases.is_empty():
		return
	bases.sort()
	_last_base_tag = bases[(bases.find(_last_base_tag) + 1) % bases.size()]
	_focus_camera(SimEngine.units[_last_base_tag].pos)

func _handle_camera_pan(delta: float) -> void:
	if not world_3d or not world_3d.camera_3d or match_menu.panel.visible or match_menu.result_panel.visible or show_help:
		return
	var v := Vector2.ZERO
	if Input.is_key_pressed(KEY_LEFT): v.x -= 1.0
	if Input.is_key_pressed(KEY_RIGHT): v.x += 1.0
	if Input.is_key_pressed(KEY_UP): v.y -= 1.0
	if Input.is_key_pressed(KEY_DOWN): v.y += 1.0
	if v == Vector2.ZERO and match_menu.edge_scroll and not (mm_dragging or mid_dragging):
		if get_window().has_focus() or hover_override is Vector2:
			var bounds := get_viewport_rect()
			var cursor := hover_pos()
			if bounds.has_point(cursor):
				v.x = float(cursor.x >= bounds.end.x - EDGE_SCROLL_MARGIN) - float(cursor.x < bounds.position.x + EDGE_SCROLL_MARGIN)
				v.y = float(cursor.y >= bounds.end.y - EDGE_SCROLL_MARGIN) - float(cursor.y < bounds.position.y + EDGE_SCROLL_MARGIN)
	if v != Vector2.ZERO:
		_tracked_tag = 0
		world_3d.pan(v.normalized() * 46.0 * (world_3d.cam_height / 50.0) * delta)

func world_to_screen(wpos: Vector2, y_offset: float = 0.0) -> Vector2:
	if world_3d and world_3d.camera_3d:
		return world_3d.world_to_screen(wpos, y_offset)
	return wpos * 13.5

func screen_to_world(spos: Vector2) -> Vector2:
	if world_3d and world_3d.camera_3d:
		return world_3d.screen_to_world(spos)
	return spos / 13.5

func minimap_to_world(mpos: Vector2) -> Vector2:
	var rel := Vector2((mpos.x - MINIMAP.position.x) / MINIMAP.size.x, (mpos.y - MINIMAP.position.y) / MINIMAP.size.y)
	return Vector2(clampf(rel.x, 0.0, 1.0) * SimEngine.map_width, clampf(rel.y, 0.0, 1.0) * SimEngine.map_height)

func world_to_minimap(wpos: Vector2) -> Vector2:
	return MINIMAP.position + Vector2(wpos.x / SimEngine.map_width * MINIMAP.size.x, wpos.y / SimEngine.map_height * MINIMAP.size.y)

func hover_pos() -> Vector2:
	if hover_override is Vector2:
		return hover_override
	return get_viewport().get_mouse_position()

# ---------------------------------------------------------------------------
# Frame loop
# ---------------------------------------------------------------------------
func _process(delta: float) -> void:
	_handle_camera_pan(delta)
	_update_camera_tracking()
	_saturation_refresh -= delta
	if _saturation_refresh <= 0.0 and not hud_hidden:
		_saturation = SimEngine.worker_saturation(local_player)
		_saturation_refresh = 0.25
	_attack_msg_cd = maxf(0.0, _attack_msg_cd - delta)
	banner_ttl = maxf(0.0, banner_ttl - delta)
	for i in range(messages.size() - 1, -1, -1):
		messages[i]["ttl"] -= delta
		if messages[i]["ttl"] <= 0.0:
			messages.remove_at(i)
	for i in range(alerts.size() - 1, -1, -1):
		alerts[i]["ttl"] -= delta
		if alerts[i]["ttl"] <= 0.0:
			alerts.remove_at(i)
	for i in range(click_markers.size() - 1, -1, -1):
		click_markers[i]["ttl"] -= delta
		if click_markers[i]["ttl"] <= 0.0:
			click_markers.remove_at(i)

	_prune_control_groups()

	if world_3d:
		world_3d.sync_3d_entities(selected_tags, delta, viewing_player())
	queue_redraw()
	if hud:
		hud.queue_redraw()

# ---------------------------------------------------------------------------
# Selection helpers
# ---------------------------------------------------------------------------
func unit_height(u: Dictionary) -> float:
	var r: float = u["radius"]
	if u["is_structure"]:
		return maxf(2.4, r * 1.5)
	if u["unit_type"] == "spire_walker":
		return 5.4
	return 1.9 + r * 0.5

func primary_type() -> String:
	var types: Array[String] = []
	for t in selected_tags:
		var u: Dictionary = SimEngine.units.get(t, {})
		if not u.is_empty() and not types.has(u["unit_type"]):
			types.append(u["unit_type"])
	if types.is_empty():
		return ""
	if active_type != "" and types.has(active_type):
		return active_type
	return types[0]

func primary_unit() -> Dictionary:
	var pt := primary_type()
	for t in selected_tags:
		var u: Dictionary = SimEngine.units.get(t, {})
		if not u.is_empty() and u["unit_type"] == pt:
			return u
	return {}

func selected_owned() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for t in selected_tags:
		var u: Dictionary = SimEngine.units.get(t, {})
		if not u.is_empty() and u["owner"] == local_player:
			out.append(u)
	return out

func _unit_at_screen(spos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d := 1e9
	for u in SimEngine.units.values():
		if not SimEngine.can_see_unit(viewing_player(), u):
			continue
		var center := world_to_screen(u["pos"], unit_height(u) * 0.45)
		var edge := world_to_screen(u["pos"] + Vector2(float(u["radius"]), 0.0), unit_height(u) * 0.45)
		var rad_px := maxf(16.0, center.distance_to(edge) * 1.05)
		var d := center.distance_to(spos)
		if d <= rad_px and d < best_d:
			best_d = d
			best = u
	return best

func _select_tags(tags: Array, add: bool = false) -> void:
	_last_group_press.clear()
	_inspected_deposit_tag = 0
	if not add:
		selected_tags.clear()
	for t in tags:
		var ti := int(t)
		if not selected_tags.has(ti):
			selected_tags.append(ti)
	active_type = ""
	if not selected_tags.is_empty() and RTSAudio:
		RTSAudio.play_ui("ui_select")
		var pu := primary_unit()
		if not pu.is_empty() and int(pu.get("owner", 0)) == local_player:
			RTSAudio.play_unit_dialogue(str(pu.get("unit_type", "")), "select")

func inspected_deposit() -> Dictionary:
	var deposit: Dictionary = SimEngine.resources.get(_inspected_deposit_tag, {})
	if not deposit.is_empty() and SimEngine.can_see_position(viewing_player(), deposit.pos):
		return deposit
	return {}

func _inspect_deposit(position: Vector2) -> void:
	var best_distance := INF
	for deposit in SimEngine.resources.values():
		var distance: float = position.distance_to(deposit.pos)
		if distance < best_distance and distance <= deposit.radius + 0.6 and SimEngine.can_see_position(viewing_player(), deposit.pos):
			_inspected_deposit_tag = deposit.tag
			best_distance = distance

func idle_workers() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u.owner == local_player and u.hp > 0.0 and u.is_worker and u.orders.is_empty() and int(u.cargo_amount) == 0:
			out.append(u)
	return out

func _select_all_army(ungrouped_only: bool = false) -> void:
	var assigned := {}
	if ungrouped_only:
		for members in control_groups.values():
			for tag in members:
				assigned[tag] = true
	var tags: Array[int] = []
	for unit in SimEngine.units.values():
		if unit.owner == local_player and unit.hp > 0.0 and not unit.is_worker and not unit.is_structure and not assigned.has(unit.tag):
			tags.append(unit.tag)
	if not tags.is_empty():
		pending_ability = ""
		_select_tags(tags)
	elif ungrouped_only:
		push_message("No ungrouped army units.", "info")

func _select_all_idle_workers() -> void:
	var idle := idle_workers()
	if not idle.is_empty():
		pending_ability = ""
		_select_tags(idle.map(func(worker): return worker.tag))

func _select_next_idle_worker() -> void:
	var idle := idle_workers()
	if idle.is_empty():
		return
	var cur := -1
	if selected_tags.size() == 1:
		for i in range(idle.size()):
			if idle[i]["tag"] == selected_tags[0]:
				cur = i
	var nxt: Dictionary = idle[(cur + 1) % idle.size()]
	_select_tags([nxt["tag"]])
	pending_ability = ""
	if world_3d:
		world_3d.set_focus(nxt["pos"])

# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------
func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.keycode == KEY_ALT:
		reveal_health_bars = event.pressed

func _unhandled_input(event: InputEvent) -> void:
	if match_menu and (match_menu.panel.visible or match_menu.result_panel.visible):
		if event is InputEventKey and event.pressed and not event.echo:
			if event.keycode == KEY_F8:
				match_menu.toggle()
			elif match_menu.result_panel.visible and event.keycode == KEY_ENTER and (event.ctrl_pressed or event.meta_pressed):
				match_menu.restart()
			elif match_menu.result_panel.visible and event.keycode == KEY_O:
				_enter_observer()
		return
	if event is InputEventMouseButton:
		_on_mouse_button(event as InputEventMouseButton)
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if is_box_selecting:
			box_end_screen = mm.position
		if mm_dragging and MINIMAP.grow(10.0).has_point(mm.position):
			_focus_camera(minimap_to_world(mm.position))
		if mid_dragging:
			_tracked_tag = 0
			var scale_px: float = world_3d.cam_height / 700.0
			world_3d.pan(Vector2(-mm.relative.x, -mm.relative.y * 1.5) * scale_px)
	elif event is InputEventKey and event.pressed and not event.echo:
		_handle_hotkey(event as InputEventKey)

func _on_mouse_button(mb: InputEventMouseButton) -> void:
	var mpos: Vector2 = mb.position

	if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
		world_3d.zoom_by(-4.0)
		return
	if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
		world_3d.zoom_by(4.0)
		return
	if mb.button_index == MOUSE_BUTTON_MIDDLE:
		mid_dragging = mb.pressed
		if mb.pressed:
			_tracked_tag = 0
		return

	if mb.button_index == MOUSE_BUTTON_LEFT and not mb.pressed:
		mm_dragging = false
		if is_box_selecting:
			is_box_selecting = false
			_complete_box_selection(box_start_screen, box_end_screen, mb.shift_pressed, _box_pick_type or mb.double_click or mb.ctrl_pressed or mb.meta_pressed)
		return

	if mpos.y >= HUD_TOP - 40.0 and _hud_hit(mb, mpos):
		return
	if mpos.y >= HUD_TOP:
		return

	if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
		if pending_ability != "":
			_execute_pending_ability_at(screen_to_world(mpos), mb.shift_pressed, false, mb.alt_pressed)
			return
		is_box_selecting = true
		_box_pick_type = mb.ctrl_pressed or mb.meta_pressed
		box_start_screen = mpos
		box_end_screen = mpos
	elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
		if pending_ability != "":
			pending_ability = ""
			return
		_issue_smart_right_click(screen_to_world(mpos), mb.shift_pressed)

# Returns true when the click landed on a HUD element.
func _hud_hit(mb: InputEventMouseButton, mpos: Vector2) -> bool:
	if not mb.pressed:
		return false
	var left := mb.button_index == MOUSE_BUTTON_LEFT
	var right := mb.button_index == MOUSE_BUTTON_RIGHT

	if MINIMAP.grow(6.0).has_point(mpos):
		_last_group_press.clear()
		if left:
			if pending_ability in ["attack", "move", "patrol", "rally", "rally_worker", "recon_sweep"]:
				_execute_pending_ability_at(minimap_to_world(mpos), mb.shift_pressed, true)
			elif world_3d and not _jump_to_attack_pin(mpos):
				mm_dragging = true
				_focus_camera(minimap_to_world(mpos))
		elif right:
			_issue_smart_right_click(minimap_to_world(mpos), mb.shift_pressed)
		return true

	if left and idle_workers().size() > 0 and IDLE_BTN.has_point(mpos):
		if mb.ctrl_pressed or mb.meta_pressed:
			_select_all_idle_workers()
		else:
			_select_next_idle_worker()
		return true

	if right and hud and selected_tags.size() == 1:
		var unit := primary_unit()
		if not unit.is_empty() and unit.owner == local_player and unit.is_structure:
			var slot: int = hud.production_slot_at(mpos, unit.production_queue.size())
			if slot >= 0:
				SimEngine.issue_command([unit.tag], "cancel_training", Vector2.ZERO, 0, str(slot))
				return true

	if left:
		for g in hud.group_tab_rects().keys():
			if hud.group_tab_rects()[g].has_point(mpos):
				_handle_group_input(int(g), mb.ctrl_pressed or mb.meta_pressed, mb.shift_pressed, mb.alt_pressed)
				return true
		_last_group_press.clear()
		var cells: Array = hud.selection_cells()
		for c in cells:
			if c["rect"].has_point(mpos):
				if mb.shift_pressed:
					selected_tags.erase(c["tag"])
				elif mb.ctrl_pressed or mb.meta_pressed:
					var unit_type: String = SimEngine.units[c.tag].unit_type
					var subgroup := selected_tags.filter(func(tag): return SimEngine.units.get(tag, {}).get("unit_type") == unit_type)
					_select_tags(subgroup)
				else:
					_select_tags([c["tag"]])
				return true
		for btn in get_card_buttons():
			if btn["rect"].has_point(mpos):
				_trigger_card_button(btn, mb.shift_pressed)
				return true

	return mpos.y >= HUD_TOP

func _complete_box_selection(p1: Vector2, p2: Vector2, add_shift: bool, pick_type: bool) -> void:
	_last_group_press.clear()
	_inspected_deposit_tag = 0
	if not add_shift:
		selected_tags.clear()
	active_type = ""
	var rect := Rect2(Vector2(minf(p1.x, p2.x), minf(p1.y, p2.y)), Vector2(absf(p2.x - p1.x), absf(p2.y - p1.y)))

	if rect.size.length() < 10.0:
		var clicked := _unit_at_screen(p2)
		if clicked.is_empty():
			if not add_shift:
				_inspect_deposit(screen_to_world(p2))
			return
		if pick_type and clicked["owner"] == local_player:
			for u in SimEngine.units.values():
				if u.hp > 0.0 and u["owner"] == clicked["owner"] and u["unit_type"] == clicked["unit_type"]:
					var sp := world_to_screen(u["pos"])
					if sp.y < HUD_TOP and sp.y > 0.0 and sp.x > 0.0 and sp.x < 1920.0:
						if not selected_tags.has(u["tag"]):
							selected_tags.append(u["tag"])
		elif add_shift and selected_tags.has(clicked["tag"]):
			selected_tags.erase(clicked["tag"])
		elif not selected_tags.has(clicked["tag"]):
			selected_tags.append(clicked["tag"])
		if not selected_tags.is_empty() and RTSAudio:
			RTSAudio.play_ui("ui_select")
			var pu := primary_unit()
			if not pu.is_empty() and int(pu.get("owner", 0)) == local_player:
				RTSAudio.play_unit_dialogue(str(pu.get("unit_type", "")), "select")
		return

	var box_units: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u["owner"] != local_player:
			continue
		var sp2 := world_to_screen(u["pos"], unit_height(u) * 0.4)
		if rect.has_point(sp2):
			box_units.append(u)
	var has_mobile := box_units.any(func(u): return not u["is_structure"])
	for u in box_units:
		if has_mobile and u["is_structure"]:
			continue
		if not selected_tags.has(u["tag"]):
			selected_tags.append(u["tag"])
	if not selected_tags.is_empty() and RTSAudio:
		RTSAudio.play_ui("ui_select")
		var pu2 := primary_unit()
		if not pu2.is_empty() and int(pu2.get("owner", 0)) == local_player:
			RTSAudio.play_unit_dialogue(str(pu2.get("unit_type", "")), "select")

func _spawn_marker(pos: Vector2, kind: String) -> void:
	click_markers.append({"pos": pos, "kind": kind, "ttl": 0.7, "max": 0.7})
	if RTSAudio:
		var pu := primary_unit()
		var utype := str(pu.get("unit_type", "")) if not pu.is_empty() and int(pu.get("owner", 0)) == local_player else ""
		if kind == "attack":
			RTSAudio.play_ui("ui_command_attack")
			if utype != "":
				RTSAudio.play_unit_dialogue(utype, "attack")
		elif kind in ["move", "gather", "rally", "patrol"]:
			RTSAudio.play_ui("ui_command_move")
			if utype != "" and kind in ["move", "gather"]:
				RTSAudio.play_unit_dialogue(utype, "move")

func _issue_rally_at(tags: Array, position: Vector2, queue: bool, allow_unit: bool = true, command: String = "rally") -> void:
	var best_distance := INF
	var target_tag := 0
	# A worker rally can bind to a visible deposit or a finished friendly tap.
	var candidates: Array = SimEngine.resources.values()
	for unit in SimEngine.units.values():
		if unit.is_extractor and unit.owner == local_player:
			candidates.append(unit)
	for candidate in candidates:
		var distance: float = position.distance_to(candidate.pos)
		if distance >= best_distance or distance > float(candidate.radius) + 1.6:
			continue
		if SimEngine.can_see_position(local_player, candidate.pos) and not SimEngine.worker_rally_resource(local_player, candidate.tag).is_empty():
			target_tag = candidate.tag
			best_distance = distance
	if target_tag > 0:
		position = SimEngine.worker_rally_resource(local_player, target_tag).pos
	elif allow_unit:
		var unit := _order_target_at(position)
		if not unit.is_empty() and unit.owner == local_player and not unit.is_structure:
			target_tag = unit.tag
			position = unit.pos
	if SimEngine.issue_command(tags, command, position, target_tag, "", queue).ok:
		_spawn_marker(position, "rally")

func _order_target_at(position: Vector2) -> Dictionary:
	var target := _unit_at_screen(world_to_screen(position, 1.2))
	if not target.is_empty():
		return target
	var best_distance := INF
	for unit in SimEngine.units.values():
		var distance: float = position.distance_to(unit.pos)
		if distance < best_distance and distance <= float(unit.radius) + 1.0 and SimEngine.can_see_unit(local_player, unit):
			target = unit
			best_distance = distance
	return target

func _issue_smart_right_click(wpos: Vector2, queue: bool) -> void:
	var own := selected_owned()
	if own.is_empty():
		return
	var tags: Array = []
	for u in own:
		tags.append(u["tag"])

	var all_struct := own.all(func(u): return u["is_structure"])
	if all_struct:
		var target := _order_target_at(wpos)
		if not target.is_empty() and target.owner != local_player and own.any(func(unit): return unit.armed_structure):
			var turrets := tags.filter(func(tag): return SimEngine.units[tag].armed_structure)
			SimEngine.issue_command(turrets, "attack_target", target.pos, target.tag, "", queue)
			_spawn_marker(target.pos, "attack")
		else:
			_issue_rally_at(tags, wpos, queue)
		return

	var target := _order_target_at(wpos)
	if not target.is_empty() and target.owner == local_player:
		var builder := {}
		var repairers: Array = []
		for unit in own:
			if SimEngine.can_resume_construction(unit, target) and (builder.is_empty() or unit.pos.distance_squared_to(wpos) < builder.pos.distance_squared_to(wpos)):
				builder = unit
			elif SimEngine.can_repair(unit, target):
				repairers.append(unit.tag)
		if not builder.is_empty():
			SimEngine.issue_command([builder.tag], "resume_construction", target.pos, target.tag, "", queue)
			_spawn_marker(target.pos, "move")
			return
		if not repairers.is_empty():
			SimEngine.issue_command(repairers, "repair", target.pos, target.tag, "", queue)
			_spawn_marker(target.pos, "move")
			return

	for r in SimEngine.resources.values():
		if SimEngine.can_see_position(local_player, r.pos) and wpos.distance_to(r["pos"]) <= float(r["radius"]) + 1.6:
			var workers: Array = []
			for u in own:
				if u["is_worker"]:
					workers.append(u["tag"])
			if not workers.is_empty():
				SimEngine.issue_command(workers, "harvest", r["pos"], r["tag"], "", queue)
				_spawn_marker(r["pos"], "gather")
				return

	if not target.is_empty():
		if target["owner"] != local_player:
			SimEngine.issue_command(tags, "attack_target", target["pos"], target["tag"], "", queue)
			_spawn_marker(target["pos"], "attack")
			return
		elif target.is_extractor and own.any(func(unit): return unit.is_worker):
			SimEngine.issue_command(tags, "harvest", target["pos"], target["tag"], "", queue)
			_spawn_marker(target["pos"], "gather")
			return
		elif SimEngine.is_dropoff(target, local_player):
			var carrying: Array = []
			for unit in own:
				if unit.is_worker and unit.cargo_amount > 0:
					carrying.append(unit.tag)
			if not carrying.is_empty():
				SimEngine.issue_command(carrying, "return_cargo", target.pos, target.tag, "", queue)
				for tag in carrying:
					tags.erase(tag)
				if tags.is_empty():
					_spawn_marker(target.pos, "gather")
					return
		elif not target.is_structure and SimEngine.issue_command(tags, "follow", target.pos, target.tag, "", queue).ok:
			_spawn_marker(target.pos, "move")
			return

	SimEngine.issue_command(tags, "move", wpos, 0, "", queue)
	_spawn_marker(wpos, "move")

func _execute_pending_ability_at(wpos: Vector2, queue: bool, minimap: bool = false, force: bool = false) -> void:
	var own := selected_owned()
	if own.is_empty():
		pending_ability = ""
		return
	var abil := pending_ability
	var tags: Array = []
	for u in own:
		tags.append(u["tag"])
	if abil == "attack":
		pending_ability = ""
		var tgt := {} if minimap else _order_target_at(wpos)
		if not tgt.is_empty() and tgt["owner"] != local_player:
			SimEngine.issue_command(tags, "attack_target", tgt["pos"], tgt["tag"], "", queue)
			_spawn_marker(tgt["pos"], "attack")
		elif force and not tgt.is_empty():
			if SimEngine.issue_command(tags, "force_attack", tgt.pos, tgt.tag, "", queue).ok:
				_spawn_marker(tgt.pos, "attack")
		else:
			SimEngine.issue_command(tags, "attack_move", wpos, 0, "", queue)
			_spawn_marker(wpos, "attack")
	elif abil in ["move", "phase_step", "patrol"]:
		pending_ability = ""
		var ability_tags: Array = []
		for u in own:
			var unit_abilities: Array = RTSData.get_unit_def(u.unit_type).get("abilities", [])
			if unit_abilities.has(abil) or (abil == "patrol" and unit_abilities.has("move")):
				ability_tags.append(u["tag"])
		SimEngine.issue_command(ability_tags, abil, wpos, 0, "", queue)
		_spawn_marker(wpos, "patrol" if abil == "patrol" else "move")
	elif abil in ["rally", "rally_worker"]:
		pending_ability = ""
		_issue_rally_at(tags, wpos, queue, not minimap, abil)
	elif abil == "harvest":
		pending_ability = ""
		for r in SimEngine.resources.values():
			if SimEngine.can_see_position(local_player, r.pos) and wpos.distance_to(r["pos"]) <= float(r["radius"]) + 1.6:
				SimEngine.issue_command(tags, "harvest", r["pos"], r["tag"], "", queue)
				_spawn_marker(r["pos"], "gather")
				return
		push_message("Select a crystal field or aether vent.", "warn")
	elif abil == "repair":
		var target := _order_target_at(wpos)
		if target.is_empty() or not SimEngine.issue_command(tags, abil, target.pos, target.tag, "", queue).ok:
			push_message("Select a damaged friendly mechanical unit or building.", "warn")
			return
		pending_ability = ""
		_spawn_marker(target.pos, "move")
	elif abil == "recon_sweep":
		if SimEngine.issue_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose a map location for the sweep.", "warn")
	elif abil == "reinforce_supply":
		var target := _order_target_at(wpos)
		if target.is_empty() or not SimEngine.issue_command(tags, abil, target.pos, target.tag).ok:
			push_message("Select a completed, unreinforced friendly Provision Silo.", "warn")
			return
		pending_ability = ""
		_spawn_marker(target.pos, "move")
	elif abil.begins_with("build_"):
		var sdef_id := str(RTSData.get_ability_def(abil).get("structure", abil.replace("build_", "")))
		var placement := placement_for(sdef_id, wpos)
		if not placement["ok"]:
			push_message(str(placement["reason"]), "error")
			if RTSAudio:
				RTSAudio.play_ui("ui_error")
			return
		var best: Dictionary = {}
		var best_d := 1e9
		for u in own:
			if RTSData.get_unit_def(u["unit_type"]).get("abilities", []).has(abil):
				var d: float = u["pos"].distance_to(placement["pos"])
				if d < best_d:
					best_d = d
					best = u
		if not best.is_empty() and SimEngine.issue_command([best["tag"]], abil, placement["pos"], 0, "", queue).ok:
			if not queue or best.unit_type == "forager":
				pending_ability = ""
			if RTSAudio:
				RTSAudio.play_ui("ui_build_place")
			_spawn_marker(placement["pos"], "move")

# Validates a structure placement for the local player and snaps aether taps to vents.
func placement_for(structure_id: String, wpos: Vector2) -> Dictionary:
	var def: Dictionary = RTSData.get_unit_def(structure_id)
	var r: float = float(def.get("radius", 2.0))
	var pos := wpos
	if not SimEngine.can_see_position(local_player, pos):
		return {"ok": false, "pos": pos, "reason": "Scout this location before building."}
	if def.get("is_extractor", false):
		var best_d := 7.0
		var found := false
		for res in SimEngine.resources.values():
			if res["resource_type"] == "aether_vent" and SimEngine.can_see_position(local_player, res.pos):
				var d: float = wpos.distance_to(res["pos"])
				if d < best_d:
					var taken := false
					for u in SimEngine.units.values():
						if u.is_extractor and u["pos"].distance_to(res["pos"]) < 1.0:
							taken = true
					if not taken:
						best_d = d
						pos = res["pos"]
						found = true
		if not found:
			return {"ok": false, "pos": pos, "reason": "%s must be placed on a free aether vent." % def.name}
		return _check_planned_placement(structure_id, pos, r)
	if SimEngine.requires_power(structure_id) and not SimEngine.is_powered(local_player, pos):
		return {"ok": false, "pos": pos, "reason": "Place this Waystone inside a Resonator's power field."}
	if pos.x < r or pos.y < r or pos.x > SimEngine.map_width - r or pos.y > SimEngine.map_height - r:
		return {"ok": false, "pos": pos, "reason": "Cannot build outside the map."}
	for obs in SimEngine.terrain_obstacles:
		if obs.grow(r * 0.8).has_point(pos):
			return {"ok": false, "pos": pos, "reason": "Cannot build there."}
	for u in SimEngine.units.values():
		if u["is_structure"] and SimEngine.can_see_unit(local_player, u) and pos.distance_to(u["pos"]) < r + float(u["radius"]) - 0.4:
			return {"ok": false, "pos": pos, "reason": "Too close to another structure."}
	for res in SimEngine.resources.values():
		if pos.distance_to(res["pos"]) < r + float(res["radius"]):
			return {"ok": false, "pos": pos, "reason": "Too close to a resource."}
	return _check_planned_placement(structure_id, pos, r)

func _check_planned_placement(structure_id: String, position: Vector2, radius: float) -> Dictionary:
	if not SimEngine.can_place_structure(structure_id, position):
		return {"ok": false, "pos": position, "reason": "Cannot build there."}
	for worker in SimEngine.units.values():
		if not worker.is_worker or worker.owner != local_player:
			continue
		for order in worker.orders:
			if order.type != "build" or int(order.structure_tag) > 0:
				continue
			var other_radius: float = RTSData.get_unit_def(order.structure_type).get("radius", 2.0)
			if position.distance_to(order.target_pos) < radius + other_radius + 1.0:
				return {"ok": false, "pos": position, "reason": "Too close to a queued building."}
	return {"ok": true, "pos": position, "reason": ""}

# ---------------------------------------------------------------------------
# Command card
# ---------------------------------------------------------------------------
func _has_structure(owner_id: int, type_id: String) -> bool:
	for u in SimEngine.units.values():
		if u["owner"] != owner_id or not u["is_structure"] or u["build_progress"] < 1.0:
			continue
		var t: String = u["unit_type"]
		if t == type_id or t == type_id + "_retracted":
			return true
	return false

func ability_cost(adef: Dictionary) -> Dictionary:
	if adef.has("upgrade"):
		return SimEngine.research_offer(local_player, adef.upgrade)
	var def_id := str(adef.get("unit", adef.get("structure", "")))
	if def_id == "":
		return {}
	var d: Dictionary = RTSData.get_unit_def(def_id)
	return {
		"crystal": int(d.get("crystal_cost", 0)),
		"aether": int(d.get("aether_cost", 0)),
		"supply": int(d.get("supply_cost", 0)),
		"time": float(d.get("build_time", 0.0)),
		"requires": d.get("requires", []),
		"def_id": def_id
	}

func _block_reason(adef: Dictionary, pu: Dictionary) -> String:
	if adef.id == "cancel_construction":
		return ""
	if pu["is_structure"] and float(pu["build_progress"]) < 1.0:
		return "Under construction."
	if adef.has("unit"):
		var producers := selected_owned()
		if SimEngine.uses_brood_slots(pu) and not producers.any(func(u): return SimEngine.uses_brood_slots(u) and u.build_progress >= 1.0 and u.brood_slots > 0):
			return "No brood slots ready."
		if SimEngine.requires_power(pu.unit_type) and not producers.any(func(u): return u.unit_type == pu.unit_type and u.build_progress >= 1.0 and SimEngine.is_powered(u.owner, u.pos)):
			return "Waystone needs a Resonator's power field."
	if adef.has("upgrade"):
		var reason := SimEngine.research_block_reason(local_player, adef.upgrade)
		if not reason.is_empty():
			return reason
		if not selected_owned().any(func(unit): return unit.unit_type == "workshop" and unit.build_progress >= 1.0 and unit.production_queue.size() < 5):
			return "Workshop queue is full."
	var p: Dictionary = SimEngine.players.get(local_player, {})
	var cost := ability_cost(adef)
	if not cost.is_empty():
		for req in cost["requires"]:
			if not _has_structure(local_player, str(req)):
				return "Requires %s." % str(RTSData.get_unit_def(str(req)).get("name", req))
		if int(p.get("crystal", 0)) < int(cost["crystal"]):
			return "Not enough crystal."
		if int(p.get("aether", 0)) < int(cost["aether"]):
			return "Not enough aether."
		if adef.has("unit") and int(p.get("supply_used", 0)) + int(cost["supply"]) > int(p.get("supply_cap", 0)):
			return "Supply blocked. Build more supply structures."
	match str(adef.get("id", "")):
		"recon_sweep", "reinforce_supply":
			if adef.id == "recon_sweep" and SimEngine.vision == null:
				return "Fog of war is disabled."
			if not selected_owned().any(SimEngine.can_use_hub_power):
				return "Requires 50 Hub energy."
		"return_cargo":
			if not selected_owned().any(func(unit): return unit.is_worker and unit.cargo_amount > 0):
				return "No worker is carrying resources."
		"phase_step":
			if float(pu["phase_cooldown"]) > 0.0:
				return "Phase Step is recharging."
		"phase_cloak":
			if not pu.get("cloaked", false) and pu.energy < SimEngine.CLOAK_START_ENERGY:
				return "Requires 25 energy."
		"surge":
			if float(pu["hp"]) <= 10.0:
				return "Not enough health."
	return ""

func get_card_buttons() -> Array[Dictionary]:
	var buttons: Array[Dictionary] = []
	var pu := primary_unit()
	if pu.is_empty() or pu["owner"] != local_player or observer_player >= 0:
		return buttons
	var abils: Array = RTSData.get_unit_def(pu["unit_type"]).get("abilities", [])
	if pu.is_structure and pu.build_progress < 1.0:
		abils = ["cancel_construction"]
	elif not pu.is_worker and RTSData.get_unit_def(pu.unit_type).has("weapon"):
		abils = abils + ["hold_fire"]
	if abils.has("move"):
		abils = abils + ["patrol"]
	if pu.is_worker:
		abils = abils + ["return_cargo"]
		if pu.unit_type == "pioneer":
			abils = abils + ["repair", "auto_repair"]
	for i in range(mini(15, abils.size())):
		var row := i / 5
		var col := i % 5
		var abil_id := str(abils[i])
		var adef := RTSData.get_ability_def(abil_id)
		buttons.append({
			"ability_id": abil_id,
			"def": adef,
			"hotkey": GRID_KEYS[i] if match_menu and match_menu.grid_hotkeys else str(adef.get("hotkey", "")),
			"rect": Rect2(CARD_ORIGIN + Vector2(col * (CARD_BTN + CARD_GAP), row * (CARD_BTN + CARD_GAP)), Vector2(CARD_BTN, CARD_BTN)),
			"blocked": _block_reason(adef, pu),
			"cost": ability_cost(adef)
		})
	return buttons

func _trigger_card_button(btn: Dictionary, shift: bool = false) -> void:
	var abil_id: String = btn["ability_id"]
	var adef: Dictionary = btn["def"]
	if str(btn["blocked"]) != "":
		push_message(str(btn["blocked"]), "error")
		if RTSAudio:
			RTSAudio.play_ui("ui_error")
		return
	var target_mode := str(adef.get("target", "none"))
	if target_mode in ["point", "point_or_unit", "resource", "unit"]:
		pending_ability = abil_id
		if RTSAudio:
			RTSAudio.play_ui("ui_select")
		return
	if abil_id.begins_with("train_") or adef.has("upgrade"):
		_train_on_best(abil_id, 5 if shift and abil_id.begins_with("train_") else 1)
		if RTSAudio:
			RTSAudio.play_ui("ui_select")
		return
	var tags: Array = []
	for u in selected_owned():
		var def: Dictionary = RTSData.get_unit_def(u.unit_type)
		if def.get("abilities", []).has(abil_id) or (abil_id == "hold_fire" and not u.is_worker and def.has("weapon")) or (abil_id == "return_cargo" and u.is_worker) or (abil_id == "auto_repair" and u.unit_type == "pioneer") or (abil_id == "cancel_construction" and u.unit_type == primary_type()):
			tags.append(u["tag"])
	SimEngine.issue_command(tags, abil_id, Vector2.ZERO, 0, "", shift and abil_id in ["stop", "hold_position"])

func _train_on_best(abil_id: String, count: int) -> void:
	var producers: Array[Dictionary] = []
	for u in selected_owned():
		if not RTSData.get_unit_def(u["unit_type"]).get("abilities", []).has(abil_id):
			continue
		if float(u["build_progress"]) < 1.0:
			continue
		producers.append(u)
	for i in range(count):
		var best: Dictionary = {}
		for producer in producers:
			if SimEngine.uses_brood_slots(producer) and producer.brood_slots <= 0:
				continue
			if SimEngine.requires_power(producer.unit_type) and not SimEngine.is_powered(producer.owner, producer.pos):
				continue
			if best.is_empty() or producer.production_queue.size() < best.production_queue.size():
				best = producer
		if best.is_empty() or not SimEngine.issue_command([best.tag], abil_id).ok:
			break

func _hotkey_char(ke: InputEventKey) -> String:
	var s := OS.get_keycode_string(ke.keycode)
	return s.to_upper() if s.length() == 1 else ""

func _living_tags(tags: Array, owned_only: bool = false) -> Array[int]:
	var out: Array[int] = []
	var seen := {}
	for tag in tags:
		var t := int(tag)
		var u: Dictionary = SimEngine.units.get(t, {})
		if u.is_empty() or float(u.get("hp", 0.0)) <= 0.0:
			continue
		if owned_only and int(u["owner"]) != local_player:
			continue
		if not SimEngine.can_see_unit(viewing_player(), u):
			continue
		if not seen.has(t):
			out.append(t)
			seen[t] = true
	return out

func _prune_control_groups() -> void:
	selected_tags = _living_tags(selected_tags)
	for g in control_groups.keys():
		var kept := _living_tags(control_groups[g], true)
		if kept.is_empty():
			control_groups.erase(g)
		else:
			control_groups[g] = kept

func _set_control_group(g: int, tags: Array, append: bool = false, exclusive: bool = false) -> void:
	if not CONTROL_GROUP_KEYS.has(g):
		return
	var members := _living_tags(tags, true)
	if exclusive:
		_last_group_press.clear()
		# An empty or enemy-only selection must never erase a saved squad.
		if members.is_empty():
			return
		var incoming := {}
		for t in members:
			incoming[t] = true
		# Only the incoming selection moves. Existing destination members keep
		# their intentional memberships elsewhere when appending.
		for other in control_groups.keys():
			if other == g:
				continue
			var kept: Array[int] = []
			for t in _living_tags(control_groups[other], true):
				if not incoming.has(t):
					kept.append(t)
			if kept.is_empty():
				control_groups.erase(other)
			else:
				control_groups[other] = kept
	if append:
		var existing := _living_tags(control_groups.get(g, []), true)
		for t in members:
			if not existing.has(t):
				existing.append(t)
		members = existing
	if members.is_empty():
		control_groups.erase(g)
	else:
		control_groups[g] = members
	_last_group_press.clear()
	var suffix := " Moved selection from other groups." if exclusive else ""
	push_message("Control group %d: %d units.%s" % [g, members.size(), suffix], "info")

func _handle_group_input(g: int, assign: bool, add: bool, exclusive: bool = false) -> void:
	if assign or exclusive:
		_set_control_group(g, selected_tags, add, exclusive)
	else:
		_recall_group(g, add)

func _recall_group(g: int, add: bool = false) -> void:
	_prune_control_groups()
	if not control_groups.has(g) or control_groups[g].is_empty():
		_last_group_press.clear()
		return
	var now := Time.get_ticks_msec()
	var last: int = int(_last_group_press.get(g, -10000))
	_select_tags(control_groups[g], add)
	pending_ability = ""
	if not add and now - last < 400 and world_3d:
		var first: Dictionary = SimEngine.units[control_groups[g][0]]
		_focus_camera(first["pos"])
	_last_group_press.clear()
	if not add:
		_last_group_press[g] = now

func _set_local_player(player: int) -> void:
	if player == local_player:
		return
	local_player = player
	if RTSAudio:
		RTSAudio.local_player_id = local_player
	selected_tags.clear()
	_inspected_deposit_tag = 0
	control_groups.clear()
	_last_group_press.clear()
	_camera_bookmarks.clear()
	_last_base_tag = 0
	_tracked_tag = 0
	alerts.clear()
	attack_history.clear()
	_attack_cursor = -1
	_attack_msg_cd = 0.0
	active_type = ""
	pending_ability = ""

func _handle_hotkey(ke: InputEventKey) -> void:
	if ke.keycode == KEY_F and (ke.ctrl_pressed or ke.meta_pressed):
		_toggle_camera_tracking()
		return
	if ke.ctrl_pressed and ke.keycode == KEY_M:
		if RTSAudio:
			var is_muted: bool = RTSAudio.toggle_mute()
			push_message("Audio %s." % ("muted" if is_muted else "unmuted"), "info")
		return

	if ke.keycode >= KEY_0 and ke.keycode <= KEY_9:
		var grp: int = ke.keycode - KEY_0
		_handle_group_input(grp, ke.ctrl_pressed or ke.meta_pressed, ke.shift_pressed, ke.alt_pressed)
		return
	_last_group_press.clear()
	if CAMERA_KEYS.has(ke.keycode):
		if not ke.alt_pressed:
			_camera_bookmark(ke.keycode, ke.ctrl_pressed or ke.meta_pressed)
		return

	match ke.keycode:
		KEY_PAUSE, KEY_F12:
			if SimEngine.match_state.get("status") != "finished":
				SimEngine.paused = not SimEngine.paused
			return
		KEY_BACKSPACE:
			_cycle_base()
			return
		KEY_F8:
			if match_menu:
				match_menu.toggle()
			return
		KEY_ESCAPE:
			if show_help:
				show_help = false
			else:
				pending_ability = ""
			return
		KEY_F1, KEY_QUESTION:
			show_help = not show_help
			return
		KEY_SLASH:
			if ke.shift_pressed:
				show_help = not show_help
				return
		KEY_TAB:
			var types: Array[String] = []
			for t in selected_tags:
				var u: Dictionary = SimEngine.units.get(t, {})
				if not u.is_empty() and not types.has(u["unit_type"]):
					types.append(u["unit_type"])
			if types.size() > 1:
				var i := types.find(primary_type())
				var direction := -1 if ke.shift_pressed else 1
				active_type = types[posmod(i + direction, types.size())]
			return
		KEY_F2:
			if ke.ctrl_pressed or ke.meta_pressed:
				if SimEngine.match_state.is_empty():
					_set_local_player(local_player % 3 + 1)
					focus_on_base()
			else:
				_select_all_army(ke.shift_pressed)
			return
		KEY_O:
			if observer_player >= 0:
				observer_player = (observer_player + 1) % 3
				_prune_control_groups()
			return
		KEY_SPACE:
			_jump_to_attack()
			return
		KEY_PERIOD:
			if ke.ctrl_pressed or ke.meta_pressed:
				_select_all_idle_workers()
			else:
				_select_next_idle_worker()
			return
		KEY_F5:
			if not SimEngine.match_state.is_empty():
				return
			var cur := bool(RTSCommanderAI.player_directives[1].get("enabled", false))
			RTSCommanderAI.set_directive(1, "macro_build", not cur)
			push_message("Meridian Guard AI %s." % ("enabled" if not cur else "disabled"), "info")
			return
		KEY_F6:
			if not SimEngine.match_state.is_empty():
				return
			var cur2 := bool(RTSCommanderAI.player_directives[2].get("enabled", false))
			RTSCommanderAI.set_directive(2, "swarm_rush", not cur2)
			push_message("Gnarl Brood AI %s." % ("enabled" if not cur2 else "disabled"), "info")
			return
		KEY_F7:
			if not SimEngine.match_state.is_empty():
				return
			var cur3 := bool(RTSCommanderAI.player_directives[3].get("enabled", false))
			RTSCommanderAI.set_directive(3, "phase_skirmisher_micro", not cur3)
			push_message("Aurelian Concord AI %s." % ("enabled" if not cur3 else "disabled"), "info")
			return
		KEY_F10:
			if SimEngine.editor_session.has("doc"):
				SimEngine.paused = true
				get_tree().change_scene_to_file("res://scenes/MapEditor.tscn")
			return

	if ke.ctrl_pressed or ke.alt_pressed:
		return
	var hk := _hotkey_char(ke)
	if hk == "":
		return
	for btn in get_card_buttons():
		if btn.hotkey == hk:
			_trigger_card_button(btn, ke.shift_pressed)
			return

# External state hook used by the control server (screenshots, scripted demos)
func apply_ui_state(d: Dictionary) -> Dictionary:
	if d.has("local_player"):
		_set_local_player(int(d["local_player"]))
	if d.has("hover"):
		var h = d["hover"]
		if typeof(h) == TYPE_ARRAY and h.size() >= 2:
			hover_override = Vector2(float(h[0]), float(h[1]))
		else:
			hover_override = null
	if d.has("help"):
		show_help = bool(d["help"])
	if d.has("hide_hud"):
		hud_hidden = bool(d["hide_hud"])
		if hud:
			hud.visible = not hud_hidden
	if d.has("show_names"):
		show_names = bool(d["show_names"])
	if d.has("pending_ability"):
		pending_ability = str(d["pending_ability"])
	if d.has("banner"):
		banner_ttl = float(d["banner"])
	if d.has("active_type"):
		active_type = str(d["active_type"])
	if d.has("control_group"):
		var cg: Dictionary = d["control_group"]
		_set_control_group(int(cg.get("id", 1)), cg.get("tags", []))
	if d.has("clear_messages") and bool(d["clear_messages"]):
		messages.clear()
	if d.has("message"):
		push_message(str(d["message"]), str(d.get("message_kind", "info")))
	if d.has("focus"):
		var f: Dictionary = d["focus"]
		_focus_camera(Vector2(float(f.get("x", 64.0)), float(f.get("y", 48.0))), float(f.get("height", world_3d.cam_height)))
	var st := ui_state()
	if d.has("project"):
		var pts: Array = []
		for pt in d["project"]:
			var sp := world_to_screen(Vector2(float(pt[0]), float(pt[1])), float(pt[2]) if pt.size() > 2 else 0.0)
			pts.append([sp.x, sp.y])
		st["projected"] = pts
	return st

func ui_state() -> Dictionary:
	_prune_control_groups()
	var msgs: Array = []
	for m in messages:
		msgs.append(m["text"])
	var tags: Array = []
	for t in selected_tags:
		tags.append(t)
	var f: Vector2 = world_3d.get_focus() if world_3d else Vector2.ZERO
	return {
		"match_menu_visible": match_menu != null and match_menu.panel.visible,
		"scorecard_visible": match_menu != null and match_menu.result_panel.visible,
		"setup_map": SimEngine.SKIRMISH_MAPS.keys()[match_menu.map_picker.selected] if match_menu != null else "",
		"setup_unlimited_resources": match_menu != null and match_menu.deposit_rules.selected == 0,
		"observer_player": observer_player,
		"health_bar_mode": health_bar_mode,
		"health_bars_revealed": reveal_health_bars,
		"inspected_deposit": inspected_deposit().get("tag", 0),
		"local_player": local_player,
		"selected": tags,
		"primary_type": primary_type(),
		"pending_ability": pending_ability,
		"messages": msgs,
		"camera_focus": [f.x, f.y],
		"camera_height": world_3d.cam_height if world_3d else 0.0,
		"camera_follow_tag": _tracked_tag,
		"attack_history": attack_history.map(func(pos): return [pos.x, pos.y]),
		"worker_saturation": SimEngine.worker_saturation(local_player),
		"control_groups": control_groups.keys().size(),
		"control_group_members": control_groups.duplicate(true)
	}

# Synthetic input for scripted demos and UI tests: goes through the same handlers as real input.
func inject_input(d: Dictionary) -> void:
	var event := GameInput.from_request(d)
	if not event:
		return
	if DisplayServer.get_name() == "headless":
		_unhandled_input(event)
	else:
		get_viewport().push_input(event)

# ---------------------------------------------------------------------------
# In-world 2D overlays (unit bars, orders, markers, build ghost, selection box)
# ---------------------------------------------------------------------------
func _draw() -> void:
	if world_3d == null or hud_hidden:
		return
	var font := ThemeDB.fallback_font
	_draw_rally_and_orders()
	if pending_ability == "build_waystone" and SimEngine.requires_power("waystone"):
		for unit in SimEngine.units.values():
			if unit.owner == local_player and unit.unit_type == "resonator" and unit.build_progress >= 1.0 and not selected_tags.has(unit.tag):
				_draw_range_ring(unit.pos, SimEngine.POWER_RADIUS, Color("#7a9bff"))
	_draw_building_memory(font)
	_draw_recon_sweeps()
	var deposit := inspected_deposit()
	if not deposit.is_empty():
		_draw_range_ring(deposit.pos, deposit.radius + 0.2, Color("#fbbf24"))
	for u in SimEngine.units.values():
		if SimEngine.can_see_unit(viewing_player(), u):
			_draw_unit_bars(u, font)
			if u.get("cloaked", false):
				_ellipse(world_to_screen(u.pos, 0.3), 12.0, Color(0.58, 0.83, 1.0, 0.7), 1.5)
			if u.owner == local_player and _saturation.has(u.tag):
				var site: Dictionary = _saturation[u.tag]
				if site.ideal > 0:
					_draw_saturation(u, site, font)
	_draw_build_ghost()
	_draw_click_markers()
	if show_names:
		_draw_name_labels(font)
	if is_box_selecting:
		var sel_rect := Rect2(
			Vector2(minf(box_start_screen.x, box_end_screen.x), minf(box_start_screen.y, box_end_screen.y)),
			Vector2(absf(box_end_screen.x - box_start_screen.x), absf(box_end_screen.y - box_start_screen.y))
		)
		draw_rect(sel_rect, Color(0.45, 1.0, 0.55, 0.08))
		draw_rect(sel_rect, Color(0.55, 1.0, 0.65, 0.9), false, 1.5)

func _draw_recon_sweeps() -> void:
	if SimEngine.vision == null:
		return
	for sweep in SimEngine.vision.sweeps_for(viewing_player()):
		_draw_range_ring(sweep.pos, sweep.radius, Color("#6fb6ff"))

func _draw_range_ring(position: Vector2, radius: float, color: Color) -> void:
	var outline := PackedVector2Array()
	for i in range(33):
		var offset := Vector2.from_angle(TAU * i / 32.0) * radius
		outline.append(world_to_screen(position + offset, 0.2))
	draw_polyline(outline, color, 1.5, true)

func _draw_saturation(unit: Dictionary, site: Dictionary, font: Font) -> void:
	var label := "%d/%d" % [site.assigned, site.ideal]
	var center := world_to_screen(unit.pos, unit_height(unit) + 1.8)
	var width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x + 20.0
	var badge := Rect2(center - Vector2(width * 0.5, 11.0), Vector2(width, 22.0))
	var color := Color("#52e08a") if site.type == "aether" else Color("#5eead4")
	if site.assigned > site.ideal:
		color = Color("#fbbf24")
	draw_rect(badge, Color(0.03, 0.06, 0.09, 0.92))
	draw_string(font, badge.position + Vector2(0.0, 16.0), label, HORIZONTAL_ALIGNMENT_CENTER, width, 16, color)

func viewing_player() -> int:
	return observer_player if observer_player >= 0 else local_player

func _enter_observer() -> void:
	if SimEngine.match_state.get("status") != "finished" or not match_menu:
		return
	match_menu.result_panel.hide()
	pending_ability = ""
	observer_player = 0

func _draw_building_memory(font: Font) -> void:
	for building in SimEngine.remembered_buildings(viewing_player()):
		var center := world_to_screen(building.pos)
		if not Rect2(0.0, 46.0, 1920.0, HUD_TOP - 46.0).has_point(center):
			continue
		var corners := PackedVector2Array()
		for corner in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1), Vector2(-1, -1)]:
			corners.append(world_to_screen(building.pos + corner * building.radius))
		draw_polyline(corners, Color("#84939f"), 2.0, true)
		draw_string(font, center + Vector2(12, -10), "Last seen · " + building.name, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("#b5c4d0"))

# Optional labels under visible units (scripted roster screenshots); off by default.
func _draw_name_labels(font: Font) -> void:
	for u in SimEngine.units.values():
		if not SimEngine.can_see_unit(viewing_player(), u):
			continue
		var sp := world_to_screen(u["pos"], -0.2)
		if sp.y > HUD_TOP - 10.0 or sp.y < 50.0:
			continue
		var label := str(u["name"])
		var w := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
		var pos := Vector2(sp.x - w * 0.5, sp.y + 30.0)
		draw_string(font, pos + Vector2(1, 1), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(0, 0, 0, 0.85))
		draw_string(font, pos, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color("#f3f6fa"))

func _ellipse(center: Vector2, radius: float, col: Color, width: float = 2.0) -> void:
	draw_set_transform(center, 0.0, Vector2(1.0, 0.58))
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 40, col, width, true)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_click_markers() -> void:
	for m in click_markers:
		var t: float = 1.0 - float(m["ttl"]) / float(m["max"])
		var sp := world_to_screen(m["pos"], 0.1)
		var col := Color("#4ade80")
		match str(m["kind"]):
			"attack": col = Color("#f87171")
			"gather": col = Color("#5eead4")
			"patrol": col = Color("#b9a3ef")
			"rally": col = Color("#fbbf24")
		col.a = 1.0 - t
		_ellipse(sp, lerpf(26.0, 8.0, t), col, 2.5)

func _draw_rally_and_orders() -> void:
	for t in selected_tags:
		var u: Dictionary = SimEngine.units.get(t, {})
		if u.is_empty() or u["owner"] != local_player:
			continue
		var sp := world_to_screen(u["pos"], 0.2)
		if u["is_structure"]:
			if u.build_progress >= 1.0 and u.unit_type == "resonator" and SimEngine.requires_power("waystone"):
				_draw_range_ring(u.pos, SimEngine.POWER_RADIUS, Color("#7a9bff"))
			if u.build_progress >= 1.0 and u.detection_radius > 0.0:
				_draw_range_ring(u.pos, u.detection_radius, Color(0.35, 0.87, 1.0, 0.7))
			if u.build_progress >= 1.0 and RTSData.get_unit_def(u.unit_type).has("trains"):
				var route: Array = u.rally_route
				if route.is_empty():
					route = [{"kind": "move", "pos": SimEngine.default_rally_position(u)}]
				_draw_rally_route(route, sp, Color("#fbbf24"))
				if u.unit_type == "brood_nest":
					_draw_rally_route(u.worker_rally_route, sp, Color("#5eead4"))
			continue
		var prev := sp
		for ord in u["orders"]:
			var tp := Vector2.ZERO
			if ord.has("target_pos"):
				var destination: Vector2 = ord.target_pos
				if ord == u.orders.front() and ord.type in ["move", "attack_move", "patrol"] and not u.path.is_empty() and u.get("nav_goal") == destination:
					destination = u.path.back()
				tp = world_to_screen(destination, 0.2)
			elif ord.has("target_tag") and SimEngine.units.has(ord["target_tag"]):
				tp = world_to_screen(SimEngine.units[ord["target_tag"]]["pos"], 0.2)
			elif ord.has("target_tag") and SimEngine.resources.has(ord["target_tag"]):
				tp = world_to_screen(SimEngine.resources[ord["target_tag"]]["pos"], 0.2)
			else:
				continue
			var col := Color(0.35, 0.9, 0.5, 0.75)
			var ot := str(ord["type"])
			if ot.begins_with("attack") or ot == "force_attack":
				col = Color(0.97, 0.45, 0.45, 0.8)
			elif ot == "harvest":
				col = Color(0.37, 0.92, 0.83, 0.7)
			elif ot == "build":
				col = Color(0.98, 0.8, 0.25, 0.8)
			elif ot == "patrol":
				col = Color("#b9a3ef")
			elif ot == "follow":
				col = Color("#9eb5ff")
			draw_line(prev, tp, col, 1.4)
			draw_circle(tp, 3.0, col)
			prev = tp

func _draw_rally_route(route: Array, start: Vector2, base_color: Color) -> void:
	var last := start
	for waypoint in route:
		var end := world_to_screen(SimEngine.rally_waypoint_position(waypoint), 0.2)
		var color := base_color
		if waypoint.kind == "harvest":
			color = Color("#5eead4")
		elif waypoint.kind == "follow":
			color = Color("#9eb5ff")
		draw_dashed_line(last, end, color, 1.5, 6.0)
		draw_line(end, end + Vector2(0, -26), color, 2.0)
		draw_colored_polygon(PackedVector2Array([end + Vector2(0, -26), end + Vector2(16, -21), end + Vector2(0, -15)]), color)
		last = end

func _draw_unit_bars(u: Dictionary, _font: Font) -> void:
	var is_sel := selected_tags.has(u["tag"])
	var hurt: bool = u["hp"] < u["max_hp"] - 0.5 or (u["max_shields"] > 0.0 and u["shields"] < u["max_shields"] - 0.5)
	var health := reveal_health_bars or health_bar_mode == 1 or (health_bar_mode == 0 and (is_sel or hurt))
	var building: bool = u["is_structure"] and u["build_progress"] < 1.0
	var producing: bool = u["is_structure"] and u["production_queue"].size() > 0 and is_sel
	var salvage: int = maxi(0, int(u.get("salvage_finish", 0)) - SimEngine.tick)
	if not (health or building or producing or salvage > 0):
		return
	var sp_head := world_to_screen(u["pos"], unit_height(u) + 0.6)
	if sp_head.y > HUD_TOP - 6.0 or sp_head.y < 10.0 or sp_head.x < -40.0 or sp_head.x > 1960.0:
		return
	var is_own: bool = u["owner"] == local_player
	var bar_w := clampf(float(u["radius"]) * 26.0, 30.0, 104.0)
	var bar_h := 4.0
	var x0 := sp_head.x - bar_w * 0.5
	var y := sp_head.y - 6.0

	if building:
		_bar(Rect2(x0, y, bar_w, bar_h), float(u["build_progress"]), Color("#fbbf24"))
		y -= bar_h + 2.0
	elif salvage > 0:
		_bar(Rect2(x0, y, bar_w, bar_h), 1.0 - float(salvage) / SimEngine.SALVAGE_TICKS, Color("#fbbf24"))
		y -= bar_h + 2.0
	if health:
		if u["max_shields"] > 0.0:
			_bar(Rect2(x0, y, bar_w, bar_h), clampf(u["shields"] / u["max_shields"], 0.0, 1.0), Color("#5ab8f5"))
			y -= bar_h + 1.0
		var ratio := clampf(u["hp"] / maxf(1.0, u["max_hp"]), 0.0, 1.0)
		var hp_col := Color("#4ade80") if is_own else Color("#ef6b5c")
		if is_own and ratio <= 0.25:
			hp_col = Color("#ef4444")
		elif is_own and ratio <= 0.5:
			hp_col = Color("#f5b941")
		_bar(Rect2(x0, y, bar_w, bar_h), ratio, hp_col)

	if producing:
		var q: Dictionary = u["production_queue"][0]
		var prog := clampf(float(q["progress"]) / maxf(0.1, float(q["total_time"])), 0.0, 1.0)
		var sp_base := world_to_screen(u["pos"], 0.0) + Vector2(0, 10)
		_bar(Rect2(sp_base.x - bar_w * 0.5, sp_base.y, bar_w, 4.0), prog, Color("#e5e7eb"))

func _bar(r: Rect2, frac: float, col: Color) -> void:
	draw_rect(Rect2(r.position - Vector2(1, 1), r.size + Vector2(2, 2)), Color(0, 0, 0, 0.8))
	draw_rect(r, Color(0.12, 0.13, 0.15, 0.95))
	draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(frac, 0.0, 1.0), r.size.y)), col)

func _draw_build_ghost() -> void:
	if not pending_ability.begins_with("build_"):
		return
	var sid := str(RTSData.get_ability_def(pending_ability).get("structure", ""))
	if sid == "":
		return
	var mpos := hover_pos()
	if mpos.y >= HUD_TOP:
		return
	var wpos := screen_to_world(mpos)
	var placement := placement_for(sid, wpos)
	var r: float = float(RTSData.get_unit_def(sid).get("radius", 2.0))
	var c: Vector2 = placement["pos"]
	var col := Color(0.35, 0.95, 0.5, 0.9) if placement["ok"] else Color(0.95, 0.35, 0.3, 0.9)
	var pts := PackedVector2Array([
		world_to_screen(c + Vector2(-r, -r), 0.1), world_to_screen(c + Vector2(r, -r), 0.1),
		world_to_screen(c + Vector2(r, r), 0.1), world_to_screen(c + Vector2(-r, r), 0.1)
	])
	draw_colored_polygon(pts, Color(col.r, col.g, col.b, 0.22))
	var closed := pts.duplicate()
	closed.append(pts[0])
	draw_polyline(closed, col, 2.0)
