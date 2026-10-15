extends Node2D

# RTSMain.gd — 2.5D Angled 3D Perspective View Shell & StarCraft II Tactical HUD
# Combines `RTSWorld3D` (3D angled perspective Camera3D + 3D terrain plateaus/ramps/meshes for Humans,
# Monsters, and Aliens) with crisp 2D screen-space HP/Shield bars, box selection, 3x5 Command Card,
# Minimap, and BDD E2E overlay.

const RTSWorld3DScript = preload("res://scripts/RTSWorld3D.gd")

var world_3d: Node3D
var selected_tags: Array[int] = []
var control_groups: Dictionary = {}

var is_box_selecting: bool = false
var box_start_screen: Vector2 = Vector2.ZERO
var box_end_screen: Vector2 = Vector2.ZERO

var pending_ability: String = ""
var active_lasers: Array[Dictionary] = []

func _ready() -> void:
	world_3d = RTSWorld3DScript.new()
	world_3d.name = "RTSWorld3D"
	add_child(world_3d)

	SimEngine.projectile_fired.connect(_on_projectile_fired)
	SimEngine.scenario_loaded.connect(_on_scenario_loaded)

func _on_scenario_loaded(_name: String) -> void:
	selected_tags.clear()
	active_lasers.clear()

func _on_projectile_fired(from_pos: Vector2, to_pos: Vector2, weapon_name: String, is_splash: bool, owner_id: int) -> void:
	active_lasers.append({
		"from": from_pos,
		"to": to_pos,
		"weapon": weapon_name,
		"splash": is_splash,
		"owner": owner_id,
		"ttl": 0.22,
		"max_ttl": 0.22
	})

func _process(delta: float) -> void:
	_handle_camera_pan(delta)
	for i in range(active_lasers.size() - 1, -1, -1):
		active_lasers[i]["ttl"] -= delta
		if active_lasers[i]["ttl"] <= 0.0:
			active_lasers.remove_at(i)
	var alive_sel: Array[int] = []
	for t in selected_tags:
		if SimEngine.units.has(t):
			alive_sel.append(t)
	selected_tags = alive_sel
	if world_3d:
		world_3d.sync_3d_entities(selected_tags, delta)
	queue_redraw()

func _handle_camera_pan(delta: float) -> void:
	if not world_3d or not world_3d.camera_3d:
		return
	var pan_spd = 38.0 * delta
	var cam = world_3d.camera_3d
	if Input.is_key_pressed(KEY_LEFT):
		cam.position.x = clampf(cam.position.x - pan_spd, 16.0, 112.0)
	if Input.is_key_pressed(KEY_RIGHT):
		cam.position.x = clampf(cam.position.x + pan_spd, 16.0, 112.0)
	if Input.is_key_pressed(KEY_UP):
		cam.position.z = clampf(cam.position.z - pan_spd, 40.0, 130.0)
	if Input.is_key_pressed(KEY_DOWN):
		cam.position.z = clampf(cam.position.z + pan_spd, 40.0, 130.0)

func world_to_screen(wpos: Vector2, y_offset: float = 0.0) -> Vector2:
	if world_3d and world_3d.camera_3d:
		return world_3d.world_to_screen(wpos, y_offset)
	return wpos * 13.5

func screen_to_world(spos: Vector2) -> Vector2:
	if world_3d and world_3d.camera_3d:
		return world_3d.screen_to_world(spos)
	return spos / 13.5

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		var mpos: Vector2 = mb.position

		if mpos.y >= 850.0:
			if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
				_handle_hud_click(mpos)
			return

		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				if pending_ability != "":
					_execute_pending_ability_at(screen_to_world(mpos), Input.is_key_pressed(KEY_SHIFT))
					return
				is_box_selecting = true
				box_start_screen = mpos
				box_end_screen = mpos
			else:
				if is_box_selecting:
					is_box_selecting = false
					_complete_box_selection(box_start_screen, box_end_screen, Input.is_key_pressed(KEY_SHIFT), mb.double_click)

		elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			if pending_ability != "":
				pending_ability = ""
				return
			_issue_smart_right_click(screen_to_world(mpos), Input.is_key_pressed(KEY_SHIFT))

	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if is_box_selecting:
			box_end_screen = mm.position

	elif event is InputEventKey and event.pressed and not event.echo:
		var ke := event as InputEventKey
		_handle_hotkey(ke)

func _complete_box_selection(p1: Vector2, p2: Vector2, add_shift: bool, is_double_click: bool) -> void:
	if not add_shift:
		selected_tags.clear()

	var rect = Rect2(
		Vector2(min(p1.x, p2.x), min(p1.y, p2.y)),
		Vector2(abs(p2.x - p1.x), abs(p2.y - p1.y))
	)

	if rect.size.length() < 10.0:
		var wclick = screen_to_world(p2)
		var clicked_unit: Dictionary = {}
		var best_d: float = 999.0
		for u in SimEngine.units.values():
			var d = wclick.distance_to(u["pos"])
			if d <= u["radius"] + 1.5 and d < best_d:
				best_d = d
				clicked_unit = u
		if not clicked_unit.is_empty():
			if is_double_click:
				for u in SimEngine.units.values():
					if u["owner"] == clicked_unit["owner"] and u["unit_type"] == clicked_unit["unit_type"]:
						if not selected_tags.has(u["tag"]):
							selected_tags.append(u["tag"])
			else:
				if not selected_tags.has(clicked_unit["tag"]):
					selected_tags.append(clicked_unit["tag"])
	else:
		var box_units: Array[Dictionary] = []
		for u in SimEngine.units.values():
			var sp = world_to_screen(u["pos"])
			if rect.has_point(sp) and u["owner"] == 1:
				box_units.append(u)
		var has_mobile = box_units.any(func(u): return not u["is_structure"])
		for u in box_units:
			if has_mobile and u["is_structure"]:
				continue
			if not selected_tags.has(u["tag"]):
				selected_tags.append(u["tag"])

func _issue_smart_right_click(wpos: Vector2, queue: bool) -> void:
	if selected_tags.is_empty():
		return

	for r in SimEngine.resources.values():
		if wpos.distance_to(r["pos"]) <= r["radius"] + 1.4:
			SimEngine.issue_command(selected_tags, "harvest", r["pos"], r["tag"], "", queue)
			return

	for u in SimEngine.units.values():
		if wpos.distance_to(u["pos"]) <= u["radius"] + 1.2:
			if u["owner"] != 1:
				SimEngine.issue_command(selected_tags, "attack_target", u["pos"], u["tag"], "", queue)
				return
			elif u["unit_type"] == "refinery":
				SimEngine.issue_command(selected_tags, "harvest", u["pos"], u["tag"], "", queue)
				return

	var all_struct = selected_tags.all(func(t): return SimEngine.units.get(t, {}).get("is_structure", false))
	if all_struct:
		SimEngine.issue_command(selected_tags, "rally", wpos)
	else:
		SimEngine.issue_command(selected_tags, "move", wpos, 0, "", queue)

func _execute_pending_ability_at(wpos: Vector2, queue: bool) -> void:
	if selected_tags.is_empty():
		pending_ability = ""
		return
	var abil = pending_ability
	pending_ability = ""
	if abil == "attack":
		for u in SimEngine.units.values():
			if u["owner"] != 1 and wpos.distance_to(u["pos"]) <= u["radius"] + 1.4:
				SimEngine.issue_command(selected_tags, "attack_target", u["pos"], u["tag"], "", queue)
				return
		SimEngine.issue_command(selected_tags, "attack_move", wpos, 0, "", queue)
	elif abil in ["move", "blink"]:
		SimEngine.issue_command(selected_tags, abil, wpos, 0, "", queue)
	elif abil.begins_with("build_"):
		SimEngine.issue_command([selected_tags[0]], abil, wpos, 0, "", queue)

func _handle_hotkey(ke: InputEventKey) -> void:
	if ke.keycode >= KEY_1 and ke.keycode <= KEY_9:
		var grp = ke.keycode - KEY_0
		if ke.ctrl_pressed:
			control_groups[grp] = selected_tags.duplicate()
		else:
			if control_groups.has(grp):
				selected_tags = control_groups[grp].duplicate()
		return

	match ke.keycode:
		KEY_A:
			if _selected_has_ability("train_marine"):
				SimEngine.issue_command(selected_tags, "train_marine")
			else:
				pending_ability = "attack"
		KEY_S:
			if _selected_has_ability("train_scv"):
				SimEngine.issue_command(selected_tags, "train_scv")
			elif _selected_has_ability("train_siege_tank"):
				SimEngine.issue_command(selected_tags, "train_siege_tank")
			elif _selected_has_ability("train_stalker"):
				SimEngine.issue_command(selected_tags, "train_stalker")
			else:
				SimEngine.issue_command(selected_tags, "stop")
		KEY_H:
			SimEngine.issue_command(selected_tags, "hold_position")
		KEY_T:
			SimEngine.issue_command(selected_tags, "stimpack")
		KEY_C:
			if _selected_has_ability("charge"):
				SimEngine.issue_command(selected_tags, "charge")
		KEY_E:
			SimEngine.issue_command(selected_tags, "morph_siege_mode")
		KEY_D:
			if _selected_has_ability("train_marauder"):
				SimEngine.issue_command(selected_tags, "train_marauder")
			else:
				SimEngine.issue_command(selected_tags, "morph_tank_mode")
		KEY_R:
			if _selected_has_ability("lower_depot"):
				SimEngine.issue_command(selected_tags, "lower_depot")
			elif _selected_has_ability("raise_depot"):
				SimEngine.issue_command(selected_tags, "raise_depot")
		KEY_B:
			if _selected_has_ability("blink"):
				pending_ability = "blink"
			elif _selected_has_ability("build_supply_depot"):
				pending_ability = "build_supply_depot"
		KEY_X:
			if _selected_has_ability("build_barracks"):
				pending_ability = "build_barracks"
		KEY_F1:
			var cur = bool(RTSCommanderAI.player_directives[1].get("enabled", false))
			RTSCommanderAI.set_directive(1, "macro_build", not cur)
		KEY_F2:
			var cur2 = bool(RTSCommanderAI.player_directives[2].get("enabled", false))
			RTSCommanderAI.set_directive(2, "swarm_rush", not cur2)
		KEY_F3:
			var cur3 = bool(RTSCommanderAI.player_directives[3].get("enabled", false))
			RTSCommanderAI.set_directive(3, "blink_stalker_micro", not cur3)

func _selected_has_ability(abil_id: String) -> bool:
	for t in selected_tags:
		var u = SimEngine.units.get(t, {})
		if not u.is_empty():
			var def = RTSData.get_unit_def(u["unit_type"])
			if def.get("abilities", []).has(abil_id):
				return true
	return false

func _handle_hud_click(mpos: Vector2) -> void:
	var minimap_rect = Rect2(18.0, 862.0, 260.0, 200.0)
	if minimap_rect.has_point(mpos) and world_3d and world_3d.camera_3d:
		var rel_x = (mpos.x - minimap_rect.position.x) / minimap_rect.size.x
		var rel_y = (mpos.y - minimap_rect.position.y) / minimap_rect.size.y
		world_3d.camera_3d.position.x = clampf(rel_x * SimEngine.map_width, 16.0, 112.0)
		world_3d.camera_3d.position.z = clampf(rel_y * SimEngine.map_height + 44.0, 40.0, 130.0)
		return

	var card_buttons = _get_active_command_card_buttons()
	for btn in card_buttons:
		if btn["rect"].has_point(mpos):
			_trigger_command_card_button(btn["ability_id"])
			return

func _trigger_command_card_button(abil_id: String) -> void:
	var def = RTSData.get_ability_def(abil_id)
	var target_mode = str(def.get("target", "none"))
	if target_mode in ["point", "point_or_unit", "resource"]:
		pending_ability = abil_id
	else:
		SimEngine.issue_command(selected_tags, abil_id)

func _get_active_command_card_buttons() -> Array[Dictionary]:
	var buttons: Array[Dictionary] = []
	if selected_tags.is_empty():
		return buttons
	var first_u = SimEngine.units.get(selected_tags[0], {})
	if first_u.is_empty():
		return buttons
	var u_def = RTSData.get_unit_def(first_u["unit_type"])
	var abils: Array = u_def.get("abilities", [])
	var start_x = 1420.0
	var start_y = 866.0
	var bw = 90.0
	var bh = 62.0
	var gap = 6.0
	for i in range(min(15, abils.size())):
		var row = i / 5
		var col = i % 5
		var r = Rect2(start_x + col * (bw + gap), start_y + row * (bh + gap), bw, bh)
		buttons.append({
			"ability_id": str(abils[i]),
			"rect": r
		})
	return buttons

func _draw() -> void:
	var font = ThemeDB.fallback_font

	# Project 3D unit positions into crisp screen-space HP/Shield bars & order lines
	for u in SimEngine.units.values():
		_draw_unit_overlay(u, font)

	# Box Selection Rectangle
	if is_box_selecting:
		var sel_rect = Rect2(
			Vector2(min(box_start_screen.x, box_end_screen.x), min(box_start_screen.y, box_end_screen.y)),
			Vector2(abs(box_end_screen.x - box_start_screen.x), abs(box_end_screen.y - box_start_screen.y))
		)
		draw_rect(sel_rect, Color(0.0, 1.0, 0.45, 0.14))
		draw_rect(sel_rect, Color(0.1, 1.0, 0.55, 0.92), false, 2.0)

	_draw_top_bar(font)
	_draw_bottom_hud(font)
	_draw_bdd_overlay(font)

func _draw_unit_overlay(u: Dictionary, font: Font) -> void:
	var sp_ground = world_to_screen(u["pos"], 0.0)
	var sp_head = world_to_screen(u["pos"], 2.8 if not u["is_structure"] else 3.8)
	if sp_ground.y > 848.0 or sp_ground.y < 44.0:
		return

	var is_sel = selected_tags.has(u["tag"])
	if is_sel and u["orders"].size() > 0:
		var ord = u["orders"][0]
		if ord.has("target_pos"):
			var tp = world_to_screen(ord["target_pos"], 0.2)
			var line_col = Color("#ef4444") if str(ord["type"]).begins_with("attack") else Color("#22c55e")
			draw_line(sp_ground, tp, line_col, 1.5)
			draw_circle(tp, 4.0, line_col)

	var bar_w = max(28.0, float(u["radius"]) * 24.0)
	var bar_pos = sp_head + Vector2(-bar_w * 0.5, -8.0)

	# Plasma Shield Bar (Aliens) above HP bar!
	if u["max_shields"] > 0.0:
		var sh_ratio = clampf(u["shields"] / max(1.0, u["max_shields"]), 0.0, 1.0)
		var sh_pos = bar_pos + Vector2(0, -6.0)
		draw_rect(Rect2(sh_pos, Vector2(bar_w, 4.5)), Color(0.05, 0.12, 0.25, 0.88))
		draw_rect(Rect2(sh_pos, Vector2(bar_w * sh_ratio, 4.5)), Color("#38bdf8"))

	# HP Bar
	var hp_ratio = clampf(u["hp"] / max(1.0, u["max_hp"]), 0.0, 1.0)
	draw_rect(Rect2(bar_pos, Vector2(bar_w, 5.0)), Color(0.08, 0.08, 0.12, 0.88))
	var hp_col = Color("#22c55e") if hp_ratio > 0.5 else (Color("#f59e0b") if hp_ratio > 0.25 else Color("#ef4444"))
	draw_rect(Rect2(bar_pos, Vector2(bar_w * hp_ratio, 5.0)), hp_col)

	if u["is_structure"] and is_sel:
		draw_string(font, bar_pos + Vector2(0, -8), u["name"].to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color.WHITE)

func _draw_top_bar(font: Font) -> void:
	draw_rect(Rect2(0, 0, 1920, 44), Color(0.04, 0.07, 0.13, 0.94))
	draw_line(Vector2(0, 44), Vector2(1920, 44), Color("#00bcd4"), 1.5)

	draw_string(font, Vector2(18, 28), "ROBOS-RTS 2.5D // %s" % SimEngine.scenario_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#00bcd4"))
	draw_string(font, Vector2(540, 28), "64Hz Tick: %d (%.1fs)" % [SimEngine.tick, SimEngine.sim_time], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#94a3b8"))

	var p1 = SimEngine.players.get(1, {})
	var p2 = SimEngine.players.get(2, {})
	var p3 = SimEngine.players.get(3, {})
	draw_string(font, Vector2(790, 28), "P1 HUMANS  M:%d G:%d Sup:%d/%d" % [
		int(p1.get("minerals", 0)), int(p1.get("vespene", 0)), int(p1.get("supply_used", 0)), int(p1.get("supply_cap", 0))
	], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#38bdf8"))

	draw_string(font, Vector2(1180, 28), "P2 MONSTERS  Sup:%d/%d Kills:%d" % [
		int(p2.get("supply_used", 0)), int(p2.get("supply_cap", 0)), int(p2.get("units_killed", 0))
	], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#c084fc"))

	draw_string(font, Vector2(1540, 28), "P3 ALIENS  Sup:%d/%d Blinks:%d" % [
		int(p3.get("supply_used", 0)), int(p3.get("supply_cap", 0)), int(p3.get("blinks_executed", 0))
	], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#facc15"))

func _draw_bottom_hud(font: Font) -> void:
	var hud_rect = Rect2(0, 850, 1920, 230)
	draw_rect(hud_rect, Color(0.04, 0.07, 0.13, 0.96))
	draw_line(Vector2(0, 850), Vector2(1920, 850), Color("#00bcd4"), 2.0)

	# 1. Left Panel: Tactical Minimap (Rect2(18, 862, 260, 200))
	var mm_rect = Rect2(18.0, 862.0, 260.0, 200.0)
	draw_rect(mm_rect, Color("#0f172a"))
	draw_rect(mm_rect, Color("#00bcd4"), false, 1.5)

	for obs in SimEngine.terrain_obstacles:
		var ox = mm_rect.position.x + (obs.position.x / SimEngine.map_width) * mm_rect.size.x
		var oy = mm_rect.position.y + (obs.position.y / SimEngine.map_height) * mm_rect.size.y
		var ow = (obs.size.x / SimEngine.map_width) * mm_rect.size.x
		var oh = (obs.size.y / SimEngine.map_height) * mm_rect.size.y
		draw_rect(Rect2(ox, oy, ow, oh), Color("#475569"))

	for r in SimEngine.resources.values():
		var rx = mm_rect.position.x + (r["pos"].x / SimEngine.map_width) * mm_rect.size.x
		var ry = mm_rect.position.y + (r["pos"].y / SimEngine.map_height) * mm_rect.size.y
		draw_circle(Vector2(rx, ry), 2.5, Color("#38bdf8") if r["resource_type"] == "mineral_field" else Color("#10b981"))

	for u in SimEngine.units.values():
		var ux = mm_rect.position.x + (u["pos"].x / SimEngine.map_width) * mm_rect.size.x
		var uy = mm_rect.position.y + (u["pos"].y / SimEngine.map_height) * mm_rect.size.y
		var ucol = Color("#38bdf8") if u["owner"] == 1 else (Color("#c084fc") if u["owner"] == 2 else Color("#facc15"))
		var sz = 4.0 if u["is_structure"] else 2.5
		draw_rect(Rect2(ux - sz * 0.5, uy - sz * 0.5, sz, sz), ucol)

	# 2. Center Panel: Unit Selection & 3-Faction Telemetry
	var center_rect = Rect2(300.0, 862.0, 1095.0, 200.0)
	draw_rect(center_rect, Color("#0b1324"))
	draw_rect(center_rect, Color("#1e293b"), false, 1.5)

	if selected_tags.is_empty():
		draw_string(font, Vector2(325, 900), "2.5D ANGLED 3D PERSPECTIVE — Drag-box or click units | [F1] Humans AI | [F2] Monsters AI | [F3] Aliens Blink AI", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#94a3b8"))
		draw_string(font, Vector2(325, 932), "Factions: HUMANS (Terran Vanguard) vs MONSTERS (Xenomorph Swarm) vs ALIENS (Celestial Armada w/ Plasma Shields & Blink)", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#00bcd4"))
	elif selected_tags.size() == 1:
		var u = SimEngine.units.get(selected_tags[0], {})
		if not u.is_empty():
			var def = RTSData.get_unit_def(u["unit_type"])
			var wpn = def.get("weapon", {})
			draw_string(font, Vector2(325, 898), "%s  [%s — Tag #%d]" % [u["name"].to_upper(), u["faction"].to_upper(), u["tag"]], HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("#38bdf8"))
			draw_string(font, Vector2(325, 928), "HP: %.0f/%.0f   |   Shields: %.0f/%.0f   |   Armor: %.0f   |   Speed: %.1f   |   PushPriority: %d" % [
				u["hp"], u["max_hp"], u["shields"], u["max_shields"], u["armor"], u["speed"], u["push_priority"]
			], HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#e2e8f0"))
			if not wpn.is_empty():
				draw_string(font, Vector2(325, 958), "Weapon: %s   |   Damage: %.0f   |   Range: %.1f   |   Period: %.2fs   |   DamagePoint: %.2fs   |   Backswing: %.2fs" % [
					wpn.get("name", ""), float(wpn.get("damage", 0)), float(wpn.get("range", 0)), float(wpn.get("period", 0)), float(wpn.get("damage_point", 0)), float(wpn.get("backswing", 0))
				], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#6ee7b7"))
	else:
		draw_string(font, Vector2(325, 892), "SQUAD SELECTION (%d Units)" % selected_tags.size(), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("#38bdf8"))
		for idx in range(min(24, selected_tags.size())):
			var u = SimEngine.units.get(selected_tags[idx], {})
			if u.is_empty():
				continue
			var r = idx / 8
			var c = idx % 8
			var bx = 325.0 + c * 130.0
			var by = 905.0 + r * 48.0
			var hp_pct = clampf(u["hp"] / max(1.0, u["max_hp"]), 0.0, 1.0)
			var wcol = Color("#22c55e") if hp_pct > 0.5 else (Color("#f59e0b") if hp_pct > 0.25 else Color("#ef4444"))
			draw_rect(Rect2(bx, by, 122.0, 40.0), Color("#162032"))
			draw_rect(Rect2(bx, by, 122.0, 40.0), wcol, false, 1.5)
			draw_string(font, Vector2(bx + 6, by + 18), u["name"].substr(0, 11), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color.WHITE)
			draw_string(font, Vector2(bx + 6, by + 34), "%.0f/%.0f HP" % [u["hp"], u["max_hp"]], HORIZONTAL_ALIGNMENT_LEFT, -1, 11, wcol)

	# 3. Right Panel: SC2 3x5 Command Card
	var card_rect = Rect2(1412.0, 860.0, 492.0, 204.0)
	draw_rect(card_rect, Color("#0b1324"))
	draw_rect(card_rect, Color("#00bcd4"), false, 1.5)

	var buttons = _get_active_command_card_buttons()
	for btn in buttons:
		var r: Rect2 = btn["rect"]
		var abil_id: String = btn["ability_id"]
		var adef = RTSData.get_ability_def(abil_id)
		var is_active = (pending_ability == abil_id)
		draw_rect(r, Color("#0284c7") if is_active else Color("#1e293b"))
		draw_rect(r, Color("#38bdf8") if is_active else Color("#475569"), false, 1.5)
		var hk = str(adef.get("hotkey", ""))
		var title = str(adef.get("name", abil_id)).split("(")[0].strip_edges()
		draw_string(font, r.position + Vector2(6, 18), "[%s]" % hk, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("#facc15"))
		draw_string(font, r.position + Vector2(6, 40), title.substr(0, 11), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color.WHITE)

func _draw_bdd_overlay(font: Font) -> void:
	if GameControlServer.bdd_step_text == "" and GameControlServer.bdd_proof_text == "":
		return
	var banner = Rect2(320, 54, 1280, 64)
	draw_rect(banner, Color(0.04, 0.09, 0.18, 0.92))
	draw_rect(banner, Color("#00bcd4"), false, 2.0)
	draw_string(font, Vector2(338, 80), "BDD STEP: " + GameControlServer.bdd_step_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#00bcd4"))
	draw_string(font, Vector2(338, 104), "PROOF: " + GameControlServer.bdd_proof_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#4ade80"))
