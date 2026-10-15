extends Node2D

# RTSMain.gd — StarCraft II & Stormgate (SnowPlay) Inspired View Shell & Tactical HUD
# Renders the 64Hz SimEngine state with smooth frame interpolation, box selection,
# control groups (1-9), 3x5 SC2 Command Card, Minimap with camera frustum, and BDD E2E overlay.

const WORLD_SCALE: float = 13.5 # World units (128x96) -> Screen space (1728x1296)

var camera_offset: Vector2 = Vector2(40.0, 20.0)
var camera_zoom: float = 1.0
var selected_tags: Array[int] = []
var control_groups: Dictionary = {} # 1..9 -> Array[int]

var is_box_selecting: bool = false
var box_start_screen: Vector2 = Vector2.ZERO
var box_end_screen: Vector2 = Vector2.ZERO

var pending_ability: String = "" # e.g., "attack", "move", "build_supply_depot", "build_barracks"
var active_lasers: Array[Dictionary] = [] # Visual weapon tracers & splash rings

func _ready() -> void:
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
	# Prune dead tags from selection
	var alive_sel: Array[int] = []
	for t in selected_tags:
		if SimEngine.units.has(t):
			alive_sel.append(t)
	selected_tags = alive_sel
	queue_redraw()

func _handle_camera_pan(delta: float) -> void:
	var pan_spd = 520.0 * delta
	if Input.is_key_pressed(KEY_LEFT):
		camera_offset.x = max(-100.0, camera_offset.x - pan_spd)
	if Input.is_key_pressed(KEY_RIGHT):
		camera_offset.x = min(400.0, camera_offset.x + pan_spd)
	if Input.is_key_pressed(KEY_UP):
		camera_offset.y = max(-80.0, camera_offset.y - pan_spd)
	if Input.is_key_pressed(KEY_DOWN):
		camera_offset.y = min(450.0, camera_offset.y + pan_spd)

func world_to_screen(wpos: Vector2) -> Vector2:
	return (wpos * WORLD_SCALE) - camera_offset

func screen_to_world(spos: Vector2) -> Vector2:
	return (spos + camera_offset) / WORLD_SCALE

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		var mpos: Vector2 = mb.position

		# Check if clicking inside bottom HUD (y >= 850)
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
		# Single click selection
		var wclick = screen_to_world(p2)
		var clicked_unit: Dictionary = {}
		var best_d: float = 999.0
		for u in SimEngine.units.values():
			var d = wclick.distance_to(u["pos"])
			if d <= u["radius"] + 1.1 and d < best_d:
				best_d = d
				clicked_unit = u
		if not clicked_unit.is_empty():
			if is_double_click:
				# SC2 Ctrl+Click / Double-Click: select all visible units of same type!
				for u in SimEngine.units.values():
					if u["owner"] == clicked_unit["owner"] and u["unit_type"] == clicked_unit["unit_type"]:
						if not selected_tags.has(u["tag"]):
							selected_tags.append(u["tag"])
			else:
				if not selected_tags.has(clicked_unit["tag"]):
					selected_tags.append(clicked_unit["tag"])
	else:
		# Box selection: prioritize Player 1 non-structure combat/worker units (just like StarCraft II!)
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

	# Check if right-clicked on a resource node
	for r in SimEngine.resources.values():
		if wpos.distance_to(r["pos"]) <= r["radius"] + 1.2:
			SimEngine.issue_command(selected_tags, "harvest", r["pos"], r["tag"], "", queue)
			return

	# Check if right-clicked on an enemy unit or friendly refinery
	for u in SimEngine.units.values():
		if wpos.distance_to(u["pos"]) <= u["radius"] + 1.0:
			if u["owner"] != 1:
				SimEngine.issue_command(selected_tags, "attack_target", u["pos"], u["tag"], "", queue)
				return
			elif u["unit_type"] == "refinery":
				SimEngine.issue_command(selected_tags, "harvest", u["pos"], u["tag"], "", queue)
				return

	# If structures are selected, set rally point; otherwise Move
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
		# Check if clicked directly on enemy target
		for u in SimEngine.units.values():
			if u["owner"] != 1 and wpos.distance_to(u["pos"]) <= u["radius"] + 1.2:
				SimEngine.issue_command(selected_tags, "attack_target", u["pos"], u["tag"], "", queue)
				return
		SimEngine.issue_command(selected_tags, "attack_move", wpos, 0, "", queue)
	elif abil == "move":
		SimEngine.issue_command(selected_tags, "move", wpos, 0, "", queue)
	elif abil.begins_with("build_"):
		SimEngine.issue_command([selected_tags[0]], abil, wpos, 0, "", queue)

func _handle_hotkey(ke: InputEventKey) -> void:
	# Control groups 1-9
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
			else:
				SimEngine.issue_command(selected_tags, "stop")
		KEY_H:
			SimEngine.issue_command(selected_tags, "hold_position")
		KEY_T:
			SimEngine.issue_command(selected_tags, "stimpack")
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
			if _selected_has_ability("build_supply_depot"):
				pending_ability = "build_supply_depot"
		KEY_X:
			if _selected_has_ability("build_barracks"):
				pending_ability = "build_barracks"
		KEY_F1:
			# Toggle Player 1 Stutter-Step AI Co-Pilot
			var cur = bool(RTSCommanderAI.player_directives[1].get("enabled", false))
			RTSCommanderAI.set_directive(1, "macro_build", not cur)
		KEY_F2:
			# Toggle Player 2 Swarm Rush AI
			var cur2 = bool(RTSCommanderAI.player_directives[2].get("enabled", false))
			RTSCommanderAI.set_directive(2, "swarm_rush", not cur2)

func _selected_has_ability(abil_id: String) -> bool:
	for t in selected_tags:
		var u = SimEngine.units.get(t, {})
		if not u.is_empty():
			var def = RTSData.get_unit_def(u["unit_type"])
			if def.get("abilities", []).has(abil_id):
				return true
	return false

func _handle_hud_click(mpos: Vector2) -> void:
	# Minimap click (bottom-left: Rect2(18, 862, 260, 200))
	var minimap_rect = Rect2(18.0, 862.0, 260.0, 200.0)
	if minimap_rect.has_point(mpos):
		var rel_x = (mpos.x - minimap_rect.position.x) / minimap_rect.size.x
		var rel_y = (mpos.y - minimap_rect.position.y) / minimap_rect.size.y
		var wpos = Vector2(rel_x * SimEngine.map_width, rel_y * SimEngine.map_height)
		camera_offset = (wpos * WORLD_SCALE) - Vector2(960.0, 425.0)
		return

	# Command Card buttons (bottom-right: 5 cols x 3 rows starting at x=1420, y=865)
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

# =============================================================================
# RENDERING: BATTLEFIELD, UNITS, SELECTION, FOG/TERRAIN, MINIMAP & SC2 HUD
# =============================================================================

func _draw() -> void:
	var font = ThemeDB.fallback_font

	# 1. Battlefield Tactical Floor & Grid
	draw_rect(Rect2(0, 0, 1920, 1080), Color("#090d16"))
	var map_screen_rect = Rect2(world_to_screen(Vector2.ZERO), Vector2(SimEngine.map_width, SimEngine.map_height) * WORLD_SCALE)
	draw_rect(map_screen_rect, Color("#0f172a"))

	# Tactical coordinate grid lines
	var grid_step = 8.0
	var gx = 0.0
	while gx <= SimEngine.map_width:
		var p1 = world_to_screen(Vector2(gx, 0))
		var p2 = world_to_screen(Vector2(gx, SimEngine.map_height))
		draw_line(p1, p2, Color(0.12, 0.20, 0.32, 0.45), 1.0)
		gx += grid_step
	var gy = 0.0
	while gy <= SimEngine.map_height:
		var p1 = world_to_screen(Vector2(0, gy))
		var p2 = world_to_screen(Vector2(SimEngine.map_width, gy))
		draw_line(p1, p2, Color(0.12, 0.20, 0.32, 0.45), 1.0)
		gy += grid_step

	# High-ground plateau tint & Ramps
	for hg in SimEngine.high_ground_zones:
		var sr = Rect2(world_to_screen(hg.position), hg.size * WORLD_SCALE)
		draw_rect(sr, Color(0.16, 0.24, 0.36, 0.25))
		draw_rect(sr, Color(0.22, 0.38, 0.56, 0.45), false, 2.0)

	for rmp in SimEngine.ramps:
		var sr = Rect2(world_to_screen(rmp.position), rmp.size * WORLD_SCALE)
		draw_rect(sr, Color(0.20, 0.32, 0.44, 0.35))

	# Terrain Cliffs / Obstacles
	for obs in SimEngine.terrain_obstacles:
		var sr = Rect2(world_to_screen(obs.position), obs.size * WORLD_SCALE)
		draw_rect(sr, Color("#1e293b"))
		draw_rect(sr, Color("#475569"), false, 2.5)
		draw_string(font, sr.position + Vector2(6, 20), "CLIFF", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("#94a3b8"))

	# 2. Resource Nodes (Blue Mineral Fields & Green Vespene Geysers)
	for r in SimEngine.resources.values():
		var sp = world_to_screen(r["pos"])
		var rad = r["radius"] * WORLD_SCALE
		if r["resource_type"] == "mineral_field":
			var pts = PackedVector2Array([
				sp + Vector2(0, -rad),
				sp + Vector2(rad * 0.9, -rad * 0.2),
				sp + Vector2(rad * 0.6, rad * 0.8),
				sp + Vector2(-rad * 0.6, rad * 0.8),
				sp + Vector2(-rad * 0.9, -rad * 0.2)
			])
			draw_colored_polygon(pts, Color("#38bdf8"))
			draw_polyline(pts, Color("#bae6fd"), 2.0)
			draw_string(font, sp + Vector2(-18, 4), "%d" % int(r["amount"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("#082f49"))
		else:
			draw_circle(sp, rad, Color("#10b981"))
			draw_arc(sp, rad, 0, TAU, 24, Color("#6ee7b7"), 2.5)
			draw_string(font, sp + Vector2(-24, -rad - 4), "VESPENE", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("#6ee7b7"))

	# 3. Units & Structures (Sorted by Y for 2.5D depth)
	var all_units = SimEngine.units.values()
	all_units.sort_custom(func(a, b):
		if a["is_walkable_structure"] != b["is_walkable_structure"]:
			return a["is_walkable_structure"] # Draw lowered supply depots underneath units walking over them!
		return a["pos"].y < b["pos"].y
	)

	for u in all_units:
		_draw_unit(u, font)

	# 4. Weapon Tracers & Siege Splash Rings
	for l in active_lasers:
		var alpha = clampf(l["ttl"] / l["max_ttl"], 0.0, 1.0)
		var p_from = world_to_screen(l["from"])
		var p_to = world_to_screen(l["to"])
		var col = Color(0.22, 0.88, 1.0, alpha) if l["owner"] == 1 else Color(0.75, 0.95, 0.25, alpha)
		if l["splash"]:
			draw_line(p_from, p_to, Color(1.0, 0.65, 0.15, alpha), 3.5)
			draw_arc(p_to, 3.5 * WORLD_SCALE * (1.15 - alpha * 0.4), 0, TAU, 32, Color(1.0, 0.45, 0.1, alpha), 3.0)
		else:
			draw_line(p_from, p_to, col, 2.2)
			draw_circle(p_to, 3.5, Color(1.0, 0.9, 0.4, alpha))

	# 5. Box Selection Rectangle
	if is_box_selecting:
		var sel_rect = Rect2(
			Vector2(min(box_start_screen.x, box_end_screen.x), min(box_start_screen.y, box_end_screen.y)),
			Vector2(abs(box_end_screen.x - box_start_screen.x), abs(box_end_screen.y - box_start_screen.y))
		)
		draw_rect(sel_rect, Color(0.0, 1.0, 0.45, 0.14))
		draw_rect(sel_rect, Color(0.1, 1.0, 0.55, 0.92), false, 2.0)

	# 6. Top Resource Bar & Bottom SC2 Command Card HUD
	_draw_top_bar(font)
	_draw_bottom_hud(font)
	_draw_bdd_overlay(font)

func _draw_unit(u: Dictionary, font: Font) -> void:
	var sp = world_to_screen(u["pos"])
	var rad = u["radius"] * WORLD_SCALE
	var is_sel = selected_tags.has(u["tag"])
	var is_p1 = (u["owner"] == 1)

	var primary_col = Color("#0ea5e9") if is_p1 else Color("#ef4444")
	var accent_col = Color("#7dd3fc") if is_p1 else Color("#fca5a5")
	if u["unit_type"] == "swarmling":
		primary_col = Color("#a855f7")
		accent_col = Color("#e9d5ff")
	elif u["unit_type"] == "roach":
		primary_col = Color("#84cc16")
		accent_col = Color("#d9f99d")

	# Draw Order Queue Lines for selected units
	if is_sel and u["orders"].size() > 0:
		var ord = u["orders"][0]
		if ord.has("target_pos"):
			var tp = world_to_screen(ord["target_pos"])
			var line_col = Color("#ef4444") if str(ord["type"]).begins_with("attack") else Color("#22c55e")
			draw_line(sp, tp, line_col, 1.5)
			draw_circle(tp, 4.0, line_col)

	# Selection Ring (StarCraft II Green/Red ground circle)
	if is_sel:
		var ring_col = Color("#22c55e") if is_p1 else Color("#f97316")
		draw_arc(sp, rad + 4.5, 0, TAU, 32, ring_col, 2.5)

	if u["is_structure"]:
		var srect = Rect2(sp - Vector2(rad, rad), Vector2(rad * 2.0, rad * 2.0))
		if u["is_walkable_structure"]:
			# Lowered Supply Depot (recessed into floor, walkable!)
			draw_rect(srect, Color(0.12, 0.26, 0.36, 0.45))
			draw_rect(srect, Color("#38bdf8"), false, 1.5)
			draw_string(font, sp + Vector2(-28, 4), "DEPOT (LOW)", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("#7dd3fc"))
		else:
			draw_rect(srect, primary_col.darkened(0.45))
			draw_rect(srect, accent_col, false, 2.5)
			draw_string(font, sp + Vector2(-rad + 4, 4), u["name"].to_upper().substr(0, 12), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color.WHITE)
			# Rally flag line if selected
			if is_sel and u["rally_pos"].distance_to(u["pos"]) > 1.0:
				var rp = world_to_screen(u["rally_pos"])
				draw_line(sp, rp, Color("#facc15"), 1.5)
				draw_circle(rp, 4.5, Color("#facc15"))
	else:
		# Mobile / Siege Unit Body
		draw_circle(sp, rad, primary_col)
		var ring_border = Color("#facc15") if u["stim_timer"] > 0.0 else accent_col
		draw_arc(sp, rad, 0, TAU, 24, ring_border, 2.0)

		# Turret / Facing barrel
		var dir = Vector2(cos(u["facing"]), sin(u["facing"]))
		draw_line(sp, sp + dir * (rad + 5.0), Color.WHITE, 2.5)

		# Siege Mode outriggers & range indicator
		if u["unit_type"] == "siege_tank_sieged":
			draw_arc(sp, rad + 3.0, 0, TAU, 8, Color("#f59e0b"), 2.5)
			if is_sel:
				var wpn_r = 31.0 * WORLD_SCALE
				draw_arc(sp, wpn_r, 0, TAU, 64, Color(1.0, 0.65, 0.1, 0.28), 1.5)

		# Worker cargo crystal / gas canister indicator
		if u["cargo_amount"] > 0:
			var c_col = Color("#38bdf8") if u["cargo_type"] == "minerals" else Color("#10b981")
			draw_circle(sp - dir * (rad * 0.6), 4.5, c_col)

	# HP Bar above unit
	var hp_ratio = clampf(u["hp"] / max(1.0, u["max_hp"]), 0.0, 1.0)
	var bar_w = max(24.0, rad * 2.1)
	var bar_pos = sp + Vector2(-bar_w * 0.5, -rad - 10.0)
	draw_rect(Rect2(bar_pos, Vector2(bar_w, 5.0)), Color(0.08, 0.08, 0.12, 0.85))
	var hp_col = Color("#22c55e") if hp_ratio > 0.5 else (Color("#f59e0b") if hp_ratio > 0.25 else Color("#ef4444"))
	draw_rect(Rect2(bar_pos, Vector2(bar_w * hp_ratio, 5.0)), hp_col)

	# Structure Construction or Production Progress Bar
	if u["is_structure"]:
		if u["build_progress"] < 1.0:
			var bp_pos = sp + Vector2(-bar_w * 0.5, -rad - 17.0)
			draw_rect(Rect2(bp_pos, Vector2(bar_w, 4.0)), Color("#1e293b"))
			draw_rect(Rect2(bp_pos, Vector2(bar_w * u["build_progress"], 4.0)), Color("#38bdf8"))
		elif u["production_queue"].size() > 0:
			var q0 = u["production_queue"][0]
			var q_ratio = clampf(float(q0["progress"]) / max(0.1, float(q0["total_time"])), 0.0, 1.0)
			var qp_pos = sp + Vector2(-bar_w * 0.5, -rad - 17.0)
			draw_rect(Rect2(qp_pos, Vector2(bar_w, 4.0)), Color("#1e293b"))
			draw_rect(Rect2(qp_pos, Vector2(bar_w * q_ratio, 4.0)), Color("#facc15"))

func _draw_top_bar(font: Font) -> void:
	draw_rect(Rect2(0, 0, 1920, 44), Color(0.04, 0.07, 0.13, 0.94))
	draw_line(Vector2(0, 44), Vector2(1920, 44), Color("#00bcd4"), 1.5)

	draw_string(font, Vector2(18, 28), "ROBOS-RTS // %s" % SimEngine.scenario_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("#00bcd4"))
	draw_string(font, Vector2(560, 28), "64Hz SnowPlay Tick: %d (%.1fs)" % [SimEngine.tick, SimEngine.sim_time], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#94a3b8"))

	var p1 = SimEngine.players[1]
	var p2 = SimEngine.players[2]
	draw_string(font, Vector2(960, 28), "P1 TERRAN  Minerals: %d   Vespene: %d   Supply: %d/%d   Stutter-Cancels: %d" % [
		p1["minerals"], p1["vespene"], p1["supply_used"], p1["supply_cap"], p1["stutter_step_cancels"]
	], HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#38bdf8"))

	draw_string(font, Vector2(1540, 28), "P2 SWARM  Supply: %d/%d  Kills: %d" % [
		p2["supply_used"], p2["supply_cap"], p2["units_killed"]
	], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#f87171"))

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
		var ucol = Color("#38bdf8") if u["owner"] == 1 else Color("#ef4444")
		var sz = 4.0 if u["is_structure"] else 2.5
		draw_rect(Rect2(ux - sz * 0.5, uy - sz * 0.5, sz, sz), ucol)

	# 2. Center Panel: Unit Wireframe Selection & Telemetry (x: 300 .. 1390)
	var center_rect = Rect2(300.0, 862.0, 1095.0, 200.0)
	draw_rect(center_rect, Color("#0b1324"))
	draw_rect(center_rect, Color("#1e293b"), false, 1.5)

	if selected_tags.is_empty():
		draw_string(font, Vector2(325, 900), "NO UNITS SELECTED — Drag-box or click units | Right-Click: Smart Move/Mine/Attack | [F1] Toggle Terran AI | [F2] Toggle Swarm AI", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#94a3b8"))
		draw_string(font, Vector2(325, 932), "SC2 Engine Specs Active: Constrained Funnel A* + RVO2 Crowd Steering + Allied PushPriority + DamagePoint/Backswing Stutter-Step Micro", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#00bcd4"))
	elif selected_tags.size() == 1:
		var u = SimEngine.units.get(selected_tags[0], {})
		if not u.is_empty():
			var def = RTSData.get_unit_def(u["unit_type"])
			var wpn = def.get("weapon", {})
			draw_string(font, Vector2(325, 898), "%s  [Tag #%d]" % [u["name"].to_upper(), u["tag"]], HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color("#38bdf8"))
			draw_string(font, Vector2(325, 928), "HP: %.0f / %.0f   |   Armor: %.0f   |   Speed: %.1f   |   PushPriority: %d   |   Kills: %d" % [
				u["hp"], u["max_hp"], u["armor"], u["speed"], u["push_priority"], u["kills"]
			], HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#e2e8f0"))
			if not wpn.is_empty():
				draw_string(font, Vector2(325, 958), "Weapon: %s   |   Damage: %.0f   |   Range: %.1f   |   Period: %.2fs   |   DamagePoint: %.2fs   |   Backswing: %.2fs" % [
					wpn.get("name", ""), float(wpn.get("damage", 0)), float(wpn.get("range", 0)), float(wpn.get("period", 0)), float(wpn.get("damage_point", 0)), float(wpn.get("backswing", 0))
				], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#6ee7b7"))
			if u["stim_timer"] > 0.0:
				draw_string(font, Vector2(325, 988), "ACTIVE BUFF: STIMPACK (+50%% Move & Attack Speed — %.1fs remaining)" % u["stim_timer"], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#facc15"))
			elif u["production_queue"].size() > 0:
				var q0 = u["production_queue"][0]
				draw_string(font, Vector2(325, 988), "PRODUCTION QUEUE (%d): Training %s (%.1fs / %.1fs)" % [
					u["production_queue"].size(), str(q0["unit_type"]).to_upper(), float(q0["progress"]), float(q0["total_time"])
				], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("#facc15"))
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

	# 3. Right Panel: SC2 3x5 Command Card (x: 1415 .. 1905)
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
