extends Node2D

# RTSMain.gd — view shell: input, selection, commands and in-world overlays.
# The HUD (resource readout, minimap, selection panel, command card) lives in RTSHud.gd.

const RTSWorld3DScript = preload("res://scripts/RTSWorld3D.gd")
const RTSIconsScript = preload("res://scripts/RTSIcons.gd")
const RTSHudScript = preload("res://scripts/RTSHud.gd")

# Screen layout (1920x1080 virtual canvas)
const HUD_TOP := 844.0
const MINIMAP := Rect2(26.0, 876.0, 252.0, 189.0)
const SEL_PANEL := Rect2(304.0, 856.0, 1236.0, 212.0)
const CARD_ORIGIN := Vector2(1560.0, 862.0)
const CARD_BTN := 64.0
const CARD_GAP := 6.0
const IDLE_BTN := Rect2(26.0, 786.0, 96.0, 48.0)

var world_3d: Node3D
var icons: Node
var hud: Node2D
var match_menu: CanvasLayer
var battle_lab: CanvasLayer
var campaign: CanvasLayer

var local_player: int = 1
var selected_tags: Array[int] = []
var control_groups: Dictionary = {}
var active_type: String = ""

var is_box_selecting: bool = false
var box_start_screen: Vector2 = Vector2.ZERO
var box_end_screen: Vector2 = Vector2.ZERO
var mm_dragging: bool = false
var mid_dragging: bool = false

var pending_ability: String = ""
var messages: Array[Dictionary] = []
var alerts: Array[Dictionary] = []
var click_markers: Array[Dictionary] = []
var hover_override: Variant = null
var show_help: bool = false
var show_names: bool = false
var hud_hidden: bool = false
var banner_ttl: float = 0.0
var _attack_msg_cd: float = 0.0
var _last_group_press: Dictionary = {}

func _ready() -> void:
	SimEngine.scenario_loaded.connect(_on_scenario_loaded)
	SimEngine.notice.connect(_on_notice)
	SimEngine.unit_damaged.connect(_on_unit_damaged)
	# Headless runs (E2E tests) only need the sim and the control server, so skip rendering.
	if DisplayServer.get_name() == "headless":
		set_process(false)
		return
	world_3d = RTSWorld3DScript.new()
	world_3d.name = "RTSWorld3D"
	add_child(world_3d)

	icons = RTSIconsScript.new()
	icons.name = "RTSIcons"
	add_child(icons)

	hud = RTSHudScript.new()
	hud.name = "RTSHud"
	hud.main = self
	add_child(hud)
	match_menu = preload("res://scripts/RTSMatchMenu.gd").new()
	add_child(match_menu)
	battle_lab = preload("res://scripts/RTSBattleLab.gd").new()
	add_child(battle_lab)
	campaign = preload("res://scripts/RTSCampaign.gd").new()
	add_child(campaign)
	_on_scenario_loaded(SimEngine.scenario_name)

func _on_scenario_loaded(_name: String) -> void:
	if match_menu:
		match_menu.panel.hide()
	if not SimEngine.match_state.is_empty():
		local_player = 1
	selected_tags.clear()
	pending_ability = ""
	control_groups.clear()
	messages.clear()
	alerts.clear()
	click_markers.clear()
	active_type = ""
	banner_ttl = 4.5
	focus_on_base()

func _on_notice(owner_id: int, text: String, kind: String) -> void:
	if owner_id == local_player:
		push_message(text, kind)

func _on_unit_damaged(owner_id: int, pos: Vector2) -> void:
	if owner_id != local_player:
		return
	for a in alerts:
		if a["pos"].distance_to(pos) < 22.0 and a["ttl"] > 1.0:
			return
	alerts.append({"pos": pos, "ttl": 4.0, "max": 4.0})
	if _attack_msg_cd <= 0.0:
		push_message("Your forces are under attack!", "warn")
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
		world_3d.set_focus(Vector2(SimEngine.map_width * 0.5, SimEngine.map_height * 0.5), 56.0)
	else:
		world_3d.set_focus(best["pos"] + Vector2(9.0, -1.0), 40.0)

func _handle_camera_pan(delta: float) -> void:
	if not world_3d or not world_3d.camera_3d:
		return
	var v := Vector2.ZERO
	if Input.is_key_pressed(KEY_LEFT): v.x -= 1.0
	if Input.is_key_pressed(KEY_RIGHT): v.x += 1.0
	if Input.is_key_pressed(KEY_UP): v.y -= 1.0
	if Input.is_key_pressed(KEY_DOWN): v.y += 1.0
	if v != Vector2.ZERO:
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

	var alive: Array[int] = []
	for t in selected_tags:
		if SimEngine.units.has(t):
			alive.append(t)
	selected_tags = alive
	for g in control_groups.keys():
		var kept: Array = []
		for t in control_groups[g]:
			if SimEngine.units.has(t):
				kept.append(t)
		control_groups[g] = kept

	if world_3d:
		world_3d.sync_3d_entities(selected_tags, delta, local_player)
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
		var center := world_to_screen(u["pos"], unit_height(u) * 0.45)
		var edge := world_to_screen(u["pos"] + Vector2(float(u["radius"]), 0.0), unit_height(u) * 0.45)
		var rad_px := maxf(16.0, center.distance_to(edge) * 1.05)
		var d := center.distance_to(spos)
		if d <= rad_px and d < best_d:
			best_d = d
			best = u
	return best

func _select_tags(tags: Array, add: bool = false) -> void:
	if not add:
		selected_tags.clear()
	for t in tags:
		var ti := int(t)
		if not selected_tags.has(ti):
			selected_tags.append(ti)
	active_type = ""

func idle_workers() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u["owner"] == local_player and u["is_worker"] and u["orders"].is_empty() and int(u["cargo_amount"]) == 0:
			out.append(u)
	return out

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
	world_3d.set_focus(nxt["pos"])

# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------
func _unhandled_input(event: InputEvent) -> void:
	if match_menu and match_menu.panel.visible:
		if event is InputEventKey and event.pressed and event.keycode == KEY_F8:
			match_menu.toggle()
		return
	if event is InputEventMouseButton:
		_on_mouse_button(event as InputEventMouseButton)
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if is_box_selecting:
			box_end_screen = mm.position
		if mm_dragging and MINIMAP.grow(10.0).has_point(mm.position):
			world_3d.set_focus(minimap_to_world(mm.position))
		if mid_dragging:
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
		return

	if mb.button_index == MOUSE_BUTTON_LEFT and not mb.pressed:
		mm_dragging = false
		if is_box_selecting:
			is_box_selecting = false
			_complete_box_selection(box_start_screen, box_end_screen, Input.is_key_pressed(KEY_SHIFT), mb.double_click)
		return

	if mpos.y >= HUD_TOP - 40.0 and _hud_hit(mb, mpos):
		return
	if mpos.y >= HUD_TOP:
		return

	if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
		if pending_ability != "":
			_execute_pending_ability_at(screen_to_world(mpos), Input.is_key_pressed(KEY_SHIFT))
			return
		is_box_selecting = true
		box_start_screen = mpos
		box_end_screen = mpos
	elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
		if pending_ability != "":
			pending_ability = ""
			return
		_issue_smart_right_click(screen_to_world(mpos), Input.is_key_pressed(KEY_SHIFT))

# Returns true when the click landed on a HUD element.
func _hud_hit(mb: InputEventMouseButton, mpos: Vector2) -> bool:
	if not mb.pressed:
		return false
	var left := mb.button_index == MOUSE_BUTTON_LEFT
	var right := mb.button_index == MOUSE_BUTTON_RIGHT

	if MINIMAP.grow(6.0).has_point(mpos):
		if left:
			mm_dragging = true
			world_3d.set_focus(minimap_to_world(mpos))
		elif right:
			_issue_smart_right_click(minimap_to_world(mpos), Input.is_key_pressed(KEY_SHIFT))
		return true

	if left and idle_workers().size() > 0 and IDLE_BTN.has_point(mpos):
		_select_next_idle_worker()
		return true

	if left:
		for g in hud.group_tab_rects().keys():
			if hud.group_tab_rects()[g].has_point(mpos):
				_recall_group(int(g))
				return true
		var cells: Array = hud.selection_cells()
		for c in cells:
			if c["rect"].has_point(mpos):
				if Input.is_key_pressed(KEY_SHIFT):
					selected_tags.erase(c["tag"])
				elif Input.is_key_pressed(KEY_CTRL):
					active_type = str(SimEngine.units.get(c["tag"], {}).get("unit_type", ""))
				else:
					_select_tags([c["tag"]])
				return true
		for btn in get_card_buttons():
			if btn["rect"].has_point(mpos):
				_trigger_card_button(btn)
				return true

	return mpos.y >= HUD_TOP

func _complete_box_selection(p1: Vector2, p2: Vector2, add_shift: bool, is_double_click: bool) -> void:
	if not add_shift:
		selected_tags.clear()
	active_type = ""
	var rect := Rect2(Vector2(minf(p1.x, p2.x), minf(p1.y, p2.y)), Vector2(absf(p2.x - p1.x), absf(p2.y - p1.y)))

	if rect.size.length() < 10.0:
		var clicked := _unit_at_screen(p2)
		if clicked.is_empty():
			return
		if is_double_click and clicked["owner"] == local_player:
			for u in SimEngine.units.values():
				if u["owner"] == clicked["owner"] and u["unit_type"] == clicked["unit_type"]:
					var sp := world_to_screen(u["pos"])
					if sp.y < HUD_TOP and sp.y > 0.0 and sp.x > 0.0 and sp.x < 1920.0:
						if not selected_tags.has(u["tag"]):
							selected_tags.append(u["tag"])
		elif add_shift and selected_tags.has(clicked["tag"]):
			selected_tags.erase(clicked["tag"])
		elif not selected_tags.has(clicked["tag"]):
			selected_tags.append(clicked["tag"])
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

func _spawn_marker(pos: Vector2, kind: String) -> void:
	click_markers.append({"pos": pos, "kind": kind, "ttl": 0.7, "max": 0.7})

func _issue_smart_right_click(wpos: Vector2, queue: bool) -> void:
	var own := selected_owned()
	if own.is_empty():
		return
	var tags: Array = []
	for u in own:
		tags.append(u["tag"])

	var all_struct := own.all(func(u): return u["is_structure"])
	if all_struct:
		SimEngine.issue_command(tags, "rally", wpos)
		_spawn_marker(wpos, "rally")
		return

	for r in SimEngine.resources.values():
		if wpos.distance_to(r["pos"]) <= float(r["radius"]) + 1.6:
			var workers: Array = []
			for u in own:
				if u["is_worker"]:
					workers.append(u["tag"])
			if not workers.is_empty():
				SimEngine.issue_command(workers, "harvest", r["pos"], r["tag"], "", queue)
				_spawn_marker(r["pos"], "gather")
				return

	var target := _unit_at_screen(world_to_screen(wpos, 1.2))
	if target.is_empty():
		for u in SimEngine.units.values():
			if wpos.distance_to(u["pos"]) <= float(u["radius"]) + 1.0:
				target = u
				break
	if not target.is_empty():
		if target["owner"] != local_player:
			SimEngine.issue_command(tags, "attack_target", target["pos"], target["tag"], "", queue)
			_spawn_marker(target["pos"], "attack")
			return
		elif target["unit_type"] == "aether_tap":
			SimEngine.issue_command(tags, "harvest", target["pos"], target["tag"], "", queue)
			_spawn_marker(target["pos"], "gather")
			return

	SimEngine.issue_command(tags, "move", wpos, 0, "", queue)
	_spawn_marker(wpos, "move")

func _execute_pending_ability_at(wpos: Vector2, queue: bool) -> void:
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
		var tgt := _unit_at_screen(world_to_screen(wpos, 1.2))
		if not tgt.is_empty() and tgt["owner"] != local_player:
			SimEngine.issue_command(tags, "attack_target", tgt["pos"], tgt["tag"], "", queue)
			_spawn_marker(tgt["pos"], "attack")
		else:
			SimEngine.issue_command(tags, "attack_move", wpos, 0, "", queue)
			_spawn_marker(wpos, "attack")
	elif abil == "move" or abil == "phase_step":
		pending_ability = ""
		var ability_tags: Array = []
		for u in own:
			if RTSData.get_unit_def(u["unit_type"]).get("abilities", []).has(abil):
				ability_tags.append(u["tag"])
		SimEngine.issue_command(ability_tags, abil, wpos, 0, "", queue)
		_spawn_marker(wpos, "move")
	elif abil == "rally":
		pending_ability = ""
		SimEngine.issue_command(tags, "rally", wpos)
		_spawn_marker(wpos, "rally")
	elif abil == "harvest":
		pending_ability = ""
		for r in SimEngine.resources.values():
			if wpos.distance_to(r["pos"]) <= float(r["radius"]) + 1.6:
				SimEngine.issue_command(tags, "harvest", r["pos"], r["tag"], "", queue)
				_spawn_marker(r["pos"], "gather")
				return
		push_message("Select a crystal field or aether vent.", "warn")
	elif abil.begins_with("build_"):
		var sdef_id := str(RTSData.get_ability_def(abil).get("structure", abil.replace("build_", "")))
		var placement := placement_for(sdef_id, wpos)
		if not placement["ok"]:
			push_message(str(placement["reason"]), "error")
			return
		pending_ability = ""
		var best: Dictionary = {}
		var best_d := 1e9
		for u in own:
			if RTSData.get_unit_def(u["unit_type"]).get("abilities", []).has(abil):
				var d: float = u["pos"].distance_to(placement["pos"])
				if d < best_d:
					best_d = d
					best = u
		if not best.is_empty():
			SimEngine.issue_command([best["tag"]], abil, placement["pos"], 0, "", queue)
			_spawn_marker(placement["pos"], "move")

# Validates a structure placement for the local player and snaps aether taps to vents.
func placement_for(structure_id: String, wpos: Vector2) -> Dictionary:
	var def: Dictionary = RTSData.get_unit_def(structure_id)
	var r: float = float(def.get("radius", 2.0))
	var pos := wpos
	if structure_id == "aether_tap":
		var best_d := 7.0
		var found := false
		for res in SimEngine.resources.values():
			if res["resource_type"] == "aether_vent":
				var d: float = wpos.distance_to(res["pos"])
				if d < best_d:
					var taken := false
					for u in SimEngine.units.values():
						if u["unit_type"] == "aether_tap" and u["pos"].distance_to(res["pos"]) < 1.0:
							taken = true
					if not taken:
						best_d = d
						pos = res["pos"]
						found = true
		if not found:
			return {"ok": false, "pos": pos, "reason": "An Aether Tap must be built on a free aether vent."}
		return {"ok": true, "pos": pos, "reason": ""}
	if pos.x < r or pos.y < r or pos.x > SimEngine.map_width - r or pos.y > SimEngine.map_height - r:
		return {"ok": false, "pos": pos, "reason": "Cannot build outside the map."}
	for obs in SimEngine.terrain_obstacles:
		if obs.grow(r * 0.8).has_point(pos):
			return {"ok": false, "pos": pos, "reason": "Cannot build there."}
	for u in SimEngine.units.values():
		if u["is_structure"] and pos.distance_to(u["pos"]) < r + float(u["radius"]) - 0.4:
			return {"ok": false, "pos": pos, "reason": "Too close to another structure."}
	for res in SimEngine.resources.values():
		if pos.distance_to(res["pos"]) < r + float(res["radius"]):
			return {"ok": false, "pos": pos, "reason": "Too close to a resource."}
	return {"ok": true, "pos": pos, "reason": ""}

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
	if pu["is_structure"] and float(pu["build_progress"]) < 1.0:
		return "Under construction."
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
			return "Supply blocked. Build more Provision Silos."
	match str(adef.get("id", "")):
		"phase_step":
			if float(pu["phase_cooldown"]) > 0.0:
				return "Phase Step is recharging."
		"surge":
			if float(pu["hp"]) <= 10.0:
				return "Not enough health."
	return ""

func get_card_buttons() -> Array[Dictionary]:
	var buttons: Array[Dictionary] = []
	var pu := primary_unit()
	if pu.is_empty() or pu["owner"] != local_player:
		return buttons
	var abils: Array = RTSData.get_unit_def(pu["unit_type"]).get("abilities", [])
	for i in range(mini(15, abils.size())):
		var row := i / 5
		var col := i % 5
		var abil_id := str(abils[i])
		var adef := RTSData.get_ability_def(abil_id)
		buttons.append({
			"ability_id": abil_id,
			"def": adef,
			"rect": Rect2(CARD_ORIGIN + Vector2(col * (CARD_BTN + CARD_GAP), row * (CARD_BTN + CARD_GAP)), Vector2(CARD_BTN, CARD_BTN)),
			"blocked": _block_reason(adef, pu),
			"cost": ability_cost(adef)
		})
	return buttons

func _trigger_card_button(btn: Dictionary) -> void:
	var abil_id: String = btn["ability_id"]
	var adef: Dictionary = btn["def"]
	if str(btn["blocked"]) != "":
		push_message(str(btn["blocked"]), "error")
		return
	var target_mode := str(adef.get("target", "none"))
	if target_mode in ["point", "point_or_unit", "resource"]:
		pending_ability = abil_id
		return
	if abil_id.begins_with("train_"):
		_train_on_best(abil_id)
		return
	var tags: Array = []
	for u in selected_owned():
		if RTSData.get_unit_def(u["unit_type"]).get("abilities", []).has(abil_id):
			tags.append(u["tag"])
	SimEngine.issue_command(tags, abil_id)

func _train_on_best(abil_id: String) -> void:
	var best: Dictionary = {}
	var best_q := 99
	for u in selected_owned():
		if not RTSData.get_unit_def(u["unit_type"]).get("abilities", []).has(abil_id):
			continue
		if float(u["build_progress"]) < 1.0:
			continue
		var q: int = u["production_queue"].size()
		if q < best_q:
			best_q = q
			best = u
	if not best.is_empty():
		SimEngine.issue_command([best["tag"]], abil_id)

func _hotkey_char(ke: InputEventKey) -> String:
	var s := OS.get_keycode_string(ke.keycode)
	return s.to_upper() if s.length() == 1 else ""

func _recall_group(g: int) -> void:
	if not control_groups.has(g) or control_groups[g].is_empty():
		return
	var now := Time.get_ticks_msec()
	var last: int = int(_last_group_press.get(g, -10000))
	_select_tags(control_groups[g])
	if now - last < 400:
		var first: Dictionary = SimEngine.units.get(selected_tags[0], {})
		if not first.is_empty():
			world_3d.set_focus(first["pos"])
	_last_group_press[g] = now

func _handle_hotkey(ke: InputEventKey) -> void:
	if ke.alt_pressed and ke.keycode == KEY_ENTER:
		var window = get_window()
		if window.mode == Window.MODE_FULLSCREEN:
			window.mode = Window.MODE_WINDOWED
			var available = DisplayServer.screen_get_usable_rect(window.current_screen)
			var scale_factor = minf(1.0, minf((available.size.x - 80.0) / 1600.0, (available.size.y - 80.0) / 900.0))
			window.size = Vector2i(Vector2(1600, 900) * scale_factor)
			window.position = available.position + (available.size - window.size) / 2
		else:
			window.mode = Window.MODE_FULLSCREEN
		return
	if ke.keycode >= KEY_1 and ke.keycode <= KEY_9:
		var grp: int = ke.keycode - KEY_0
		if ke.ctrl_pressed:
			control_groups[grp] = selected_tags.duplicate()
			push_message("Control group %d set." % grp, "info")
		elif ke.shift_pressed and control_groups.has(grp):
			_select_tags(control_groups[grp], true)
		else:
			_recall_group(grp)
		return

	match ke.keycode:
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
				active_type = types[(i + 1) % types.size()]
			return
		KEY_F2:
			if not SimEngine.match_state.is_empty():
				return
			local_player = local_player % 3 + 1
			selected_tags.clear()
			pending_ability = ""
			focus_on_base()
			return
		KEY_SPACE:
			if alerts.size() > 0:
				world_3d.set_focus(alerts[alerts.size() - 1]["pos"])
			else:
				focus_on_base()
			return
		KEY_PERIOD:
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
		if str(btn["def"].get("hotkey", "")) == hk:
			_trigger_card_button(btn)
			return

# External state hook used by the control server (screenshots, scripted demos)
func apply_ui_state(d: Dictionary) -> Dictionary:
	if d.has("local_player"):
		local_player = int(d["local_player"])
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
		var tags: Array = cg.get("tags", [])
		var arr: Array = []
		for t in tags:
			arr.append(int(t))
		control_groups[int(cg.get("id", 1))] = arr
	if d.has("clear_messages") and bool(d["clear_messages"]):
		messages.clear()
	if d.has("message"):
		push_message(str(d["message"]), str(d.get("message_kind", "info")))
	if d.has("focus"):
		var f: Dictionary = d["focus"]
		world_3d.set_focus(Vector2(float(f.get("x", 64.0)), float(f.get("y", 48.0))), float(f.get("height", world_3d.cam_height)))
	var st := ui_state()
	if d.has("project"):
		var pts: Array = []
		for pt in d["project"]:
			var sp := world_to_screen(Vector2(float(pt[0]), float(pt[1])), float(pt[2]) if pt.size() > 2 else 0.0)
			pts.append([sp.x, sp.y])
		st["projected"] = pts
	return st

func ui_state() -> Dictionary:
	var msgs: Array = []
	for m in messages:
		msgs.append(m["text"])
	var tags: Array = []
	for t in selected_tags:
		tags.append(t)
	var f: Vector2 = world_3d.get_focus() if world_3d else Vector2.ZERO
	var window = get_window() if is_inside_tree() else null
	var canvas = get_viewport_rect().size if window else Vector2.ZERO
	return {
		"display_mode": window.mode if window else -1,
		"window_size": [window.size.x, window.size.y] if window else [0, 0],
		"canvas_size": [canvas.x, canvas.y],
		"battle_lab_visible": battle_lab != null and battle_lab.panel.visible,
		"battle_results_visible": battle_lab != null and battle_lab.results.is_open(),
		"battle_results": battle_lab.results.ui_state() if battle_lab else {},
		"campaign_briefing_visible": campaign != null and campaign.briefing.visible,
		"campaign_objectives": campaign.status_label.text if campaign else "",
		"campaign_results_visible": campaign != null and campaign.results.is_open(),
		"rifle_fx_warm": world_3d != null and world_3d.rifle_fx.warmup_complete,
		"match_menu_visible": match_menu != null and match_menu.panel.visible,
		"local_player": local_player,
		"selected": tags,
		"primary_type": primary_type(),
		"pending_ability": pending_ability,
		"messages": msgs,
		"camera_focus": [f.x, f.y],
		"camera_height": world_3d.cam_height if world_3d else 0.0,
		"control_groups": control_groups.keys().size()
	}

# Synthetic input for scripted demos and UI tests: goes through the same handlers as real input.
func inject_input(d: Dictionary) -> void:
	var kind := str(d.get("type", ""))
	var pos := Vector2(float(d.get("x", 0.0)), float(d.get("y", 0.0)))
	if kind == "mouse_button":
		var mb := InputEventMouseButton.new()
		mb.position = pos
		mb.global_position = pos
		mb.button_index = int(d.get("button", MOUSE_BUTTON_LEFT))
		mb.pressed = bool(d.get("pressed", true))
		mb.double_click = bool(d.get("double", false))
		mb.shift_pressed = bool(d.get("shift", false))
		mb.ctrl_pressed = bool(d.get("ctrl", false))
		if DisplayServer.get_name() == "headless":
			_unhandled_input(mb)
		else:
			# The bot API uses the same 1920x1080 canvas coordinates as /ui project.
			get_viewport().push_input(mb, true)
	elif kind == "mouse_motion":
		var mm := InputEventMouseMotion.new()
		mm.position = pos
		mm.global_position = pos
		mm.relative = Vector2(float(d.get("dx", 0.0)), float(d.get("dy", 0.0)))
		if DisplayServer.get_name() == "headless":
			_unhandled_input(mm)
		else:
			get_viewport().push_input(mm, true)
	elif kind == "key":
		var ke := InputEventKey.new()
		ke.keycode = OS.find_keycode_from_string(str(d.get("key", "")))
		ke.pressed = bool(d.get("pressed", true))
		ke.shift_pressed = bool(d.get("shift", false))
		ke.ctrl_pressed = bool(d.get("ctrl", false))
		ke.alt_pressed = bool(d.get("alt", false))
		if DisplayServer.get_name() == "headless":
			_unhandled_input(ke)
		else:
			get_viewport().push_input(ke)

# ---------------------------------------------------------------------------
# In-world 2D overlays (unit bars, orders, markers, build ghost, selection box)
# ---------------------------------------------------------------------------
func _draw() -> void:
	if world_3d == null or hud_hidden:
		return
	var font := ThemeDB.fallback_font
	_draw_rally_and_orders()
	for u in SimEngine.units.values():
		_draw_unit_bars(u, font)
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

# Optional labels under every unit (scripted roster screenshots); off by default.
func _draw_name_labels(font: Font) -> void:
	for u in SimEngine.units.values():
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
			if u["unit_type"] != "silo" and u["unit_type"] != "silo_retracted" and RTSData.get_unit_def(u["unit_type"]).has("trains"):
				var rp := world_to_screen(u["rally_pos"], 0.2)
				draw_dashed_line(sp, rp, Color(0.98, 0.8, 0.25, 0.8), 1.5, 6.0)
				draw_line(rp, rp + Vector2(0, -26), Color("#fbbf24"), 2.0)
				draw_colored_polygon(PackedVector2Array([rp + Vector2(0, -26), rp + Vector2(16, -21), rp + Vector2(0, -15)]), Color("#fbbf24"))
			continue
		if SimEngine.match_state.get("mode", "") == "unit_battle" and not Input.is_key_pressed(KEY_SHIFT):
			continue
		var prev := sp
		for ord in u["orders"]:
			var tp := Vector2.ZERO
			if ord.has("target_pos"):
				tp = world_to_screen(ord["target_pos"], 0.2)
			elif ord.has("target_tag") and SimEngine.units.has(ord["target_tag"]):
				tp = world_to_screen(SimEngine.units[ord["target_tag"]]["pos"], 0.2)
			elif ord.has("target_tag") and SimEngine.resources.has(ord["target_tag"]):
				tp = world_to_screen(SimEngine.resources[ord["target_tag"]]["pos"], 0.2)
			else:
				continue
			var col := Color(0.35, 0.9, 0.5, 0.75)
			var ot := str(ord["type"])
			if ot.begins_with("attack"):
				col = Color(0.97, 0.45, 0.45, 0.8)
			elif ot == "harvest":
				col = Color(0.37, 0.92, 0.83, 0.7)
			elif ot == "build":
				col = Color(0.98, 0.8, 0.25, 0.8)
			draw_line(prev, tp, col, 1.4)
			draw_circle(tp, 3.0, col)
			prev = tp

func _draw_unit_bars(u: Dictionary, _font: Font) -> void:
	var is_sel := selected_tags.has(u["tag"])
	var hurt: bool = u["hp"] < u["max_hp"] - 0.5 or (u["max_shields"] > 0.0 and u["shields"] < u["max_shields"] - 0.5)
	var building: bool = u["is_structure"] and u["build_progress"] < 1.0
	var producing: bool = u["is_structure"] and u["production_queue"].size() > 0 and is_sel
	if not (is_sel or hurt or building or producing or SimEngine.match_state.get("mode", "") == "unit_battle"):
		return
	var sp_head := world_to_screen(world_3d.display_position(u), unit_height(u) + 0.6)
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
