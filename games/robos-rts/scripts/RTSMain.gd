extends Node2D

# RTSMain.gd — view shell: input, selection, commands and in-world overlays.
# The HUD (resource readout, minimap, selection panel, command card) lives in RTSHud.gd.

const RTSWorld3DScript = preload("res://scripts/RTSWorld3D.gd")
const CampaignHud = preload("res://scripts/RTSCampaignHud.gd")
const NO_SELECTION: Array[int] = []
const RTSIconsScript = preload("res://scripts/RTSIcons.gd")
const RTSHudScript = preload("res://scripts/RTSHud.gd")
const GameInput = preload("res://scripts/RTSGameInput.gd")
const MatchMenu = preload("res://scripts/RTSMatchMenu.gd")
const LadderRules = preload("res://scripts/engine/RTSLadderRules.gd")

# Screen layout (1920x1080 virtual canvas)
const HUD_TOP := 844.0
const MINIMAP := Rect2(26.0, 876.0, 252.0, 189.0)
const SEL_PANEL := Rect2(304.0, 856.0, 1236.0, 212.0)
const CARD_ORIGIN := Vector2(1560.0, 862.0)
const CARD_BTN := 64.0
const CARD_GAP := 6.0
const IDLE_BTN := Rect2(26.0, 786.0, 96.0, 48.0)
const IDLE_PRODUCTION_BTN := Rect2(130.0, 786.0, 148.0, 48.0)
const CONTROL_GROUP_KEYS := [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]
const CAMERA_KEYS := [KEY_F3, KEY_F4, KEY_F9, KEY_F11]
const GRID_KEYS := "QWERTASDFGZXCVBUHJKL"
const AUTOCAST_COMMANDS := {"repair": "auto_repair", "restore_vitals": "auto_heal",
	"restore_aegis": "auto_aegis", "charge": "auto_charge", "bastion_barrier": "auto_bastion_barrier",
	"locust_swoop": "auto_locust_swoop", "build_pursuit_fighter": "auto_build_fighters", "vortex_lock": "auto_vortex_lock",
	"sentinel_missiles": "auto_sentinel_missiles"}
const TRAIN_REPEAT_DELAY := 0.35
const TRAIN_REPEAT_INTERVAL := 0.075
const WORKER_CARD_ROOT := ["move", "stop", "hold_position", "patrol", "attack", "harvest", "return_cargo", "", "", "", "worker_basic", "worker_advanced", "", "", ""]
const WORKER_BUILD_PAGES := {
	"pioneer": {
		"verb": "Build", "tech": "muster_hall",
		"basic": {0: "build_colony_hub", 1: "build_aether_tap", 2: "build_silo",
			5: "build_muster_hall", 6: "build_field_armory", 10: "build_field_bunker", 11: "build_sentry_turret", 12: "build_radar_beacon"},
		"advanced": {5: "build_workshop", 6: "build_specter_academy", 7: "build_vehicle_armory",
			10: "build_airframe_hangar", 11: "build_ignition_core"},
	},
	"forager": {
		"verb": "Grow", "tech": "brood_nest",
		"basic": {0: "build_brood_nest", 1: "build_spore_tap", 2: "build_hatchling_pool", 3: "build_brood_pod",
			4: "build_brood_growth_node", 5: "build_bile_warren", 6: "build_adaptation_chamber",
			10: "build_thorn_watch", 11: "build_spore_watch"},
		"advanced": {2: "build_blight_spire", 3: "build_ambusher_den", 5: "build_tunnel_mouth", 6: "build_spine_den",
			7: "build_spore_nursery", 8: "build_infestation_pit", 9: "build_carapace_cavern"},
	},
	"mote": {
		"verb": "Summon", "tech": "concord_core",
		"basic": {0: "build_heartstone", 1: "build_aether_prism", 2: "build_resonator", 5: "build_waystone",
			6: "build_concord_core", 7: "build_prism_forge", 12: "build_aegis_relay", 13: "build_aegis_capacitor"},
		"advanced": {2: "build_twilight_array", 5: "build_robotics_foundry", 6: "build_robotics_annex",
			7: "build_canticle_archive", 8: "build_veil_sanctum", 9: "build_star_assembly", 10: "build_fleet_spire"},
	},
}
const EDGE_SCROLL_MARGIN := 14.0
const FACTION_CARD := Rect2(8.0, 6.0, 238.0, 31.0)
const PATH_FEEDBACK_FADE := 1.5
const SPLASH_RING_SEGMENTS := 32

var world_3d: Node3D
var icons: Node
var hud: Node2D
var campaign_hud: CampaignHud
var match_menu: CanvasLayer

var local_player: int = 1
var observer_player := -1
var health_bar_mode := 0
var reveal_health_bars := false
var _shift_held := false
var _repeating_target := false
var _training_repeat := {}
var _training_repeat_timer := Timer.new()
var _show_weapon_ranges := false
var selected_tags: Array[int] = []
var _selected_blueprint: Node3D
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
var _worker_build_page := ""
var _hallucination_open := false
var messages: Array[Dictionary] = []
var alerts: Array[Dictionary] = []
var attack_history: Array[Vector2] = []
var _attack_cursor := -1
var _tracked_tag := 0
var click_markers: Array[Dictionary] = []
var _path_feedback: Dictionary = {}
var hover_override: Variant = null
var show_help: bool = false
var technology_open := false
var show_names: bool = false
var hud_hidden: bool = false
var banner_ttl: float = 0.0
var _attack_msg_cd: float = 0.0
var _last_group_press: Dictionary = {}
var _camera_bookmarks: Dictionary = {}
var _last_base_tag := 0
var _saturation := {}
var _saturation_refresh := 0.0
var _worker_rally_previews := {}

func _ready() -> void:
	SimEngine.scenario_loaded.connect(_on_scenario_loaded)
	SimEngine.notice.connect(_on_notice)
	SimEngine.unit_damaged.connect(_on_unit_damaged)
	SimEngine.archon_merged.connect(_on_archon_merged)
	SimEngine.ability_triggered.connect(_inherit_growth_node_groups)
	_training_repeat_timer.one_shot = true
	_training_repeat_timer.timeout.connect(_repeat_training_hotkey)
	add_child(_training_repeat_timer)
	# Headless runs (E2E tests) only need the sim and the control server, so skip rendering.
	if DisplayServer.get_name() == "headless":
		set_process(false)
		RTSNetwork.ready_for_match()
		return
	SimEngine.resource_depleted.connect(_on_resource_depleted)
	SimEngine.order_path_resolved.connect(_on_order_path_resolved)
	get_window().focus_exited.connect(_clear_held_keys)
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
	campaign_hud = CampaignHud.new()
	campaign_hud.battle = self
	add_child(campaign_hud)
	match_menu = MatchMenu.new()
	add_child(match_menu)
	match_menu.observe_requested.connect(_enter_observer)
	match_menu.health_mode_changed.connect(func(mode): health_bar_mode = mode)
	match_menu.campaign_restart_requested.connect(campaign_hud.open_restart_picker)
	health_bar_mode = match_menu.health_bars.selected
	_on_scenario_loaded(SimEngine.scenario_name)
	_restore_title_view()
	RTSNetwork.ready_for_match()

func _issue_player_command(tags: Array, command: String, point := Vector2.ZERO, target := 0, extra := "", queue := false) -> Dictionary:
	if RTSNetwork.match_active:
		return RTSNetwork.issue_order(tags, command, point, target, extra, queue)
	return SimEngine.issue_command(tags, command, point, target, extra, queue)

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
	if RTSNetwork.match_active:
		local_player = RTSNetwork.seat
	elif SimEngine.campaign != null or not SimEngine.match_state.is_empty():
		local_player = 1
	if RTSAudio:
		RTSAudio.local_player_id = local_player
	selected_tags.clear()
	_selected_blueprint = null
	is_box_selecting = false
	mm_dragging = false
	mid_dragging = false
	_clear_held_keys()
	_inspected_deposit_tag = 0
	technology_open = false
	pending_ability = ""
	_repeating_target = false
	_worker_build_page = ""
	_hallucination_open = false
	control_groups.clear()
	_last_group_press.clear()
	_camera_bookmarks.clear()
	_last_base_tag = 0
	_saturation_refresh = 0.0
	_worker_rally_previews.clear()
	messages.clear()
	alerts.clear()
	attack_history.clear()
	_attack_cursor = -1
	_attack_msg_cd = 0.0
	_tracked_tag = 0
	observer_player = 0 if RTSNetwork.watching_ai else -1
	if RTSAudio and observer_player >= 0:
		RTSAudio.local_player_id = observer_player
	click_markers.clear()
	_path_feedback.clear()
	active_type = ""
	banner_ttl = 4.5
	focus_on_base()
	if campaign_hud:
		campaign_hud.reset()
		if SimEngine.campaign != null and SimEngine.campaign.mission_index in [SimEngine.Campaign.ASSAULT, SimEngine.Campaign.EVACUATION]:
			_select_all_army()

func _on_notice(owner_id: int, text: String, kind: String) -> void:
	if owner_id == local_player:
		push_message(text, kind)

func _on_resource_depleted(owner_id: int, resource_type: String) -> void:
	if owner_id == local_player:
		push_message("Aether vent depleted." if resource_type == "aether_vent" else "Crystal field depleted.", "warn")

func _on_dialogue_spoken(unit_type: String, _category: String, _line_id: String, text: String) -> void:
	if text == "":
		return
	var profile: Dictionary = RTSData.named_voice_profiles.get(unit_type, {})
	var u_name: String = str(profile.get("unit_name", RTSData.get_unit_def(unit_type).get("name", unit_type.capitalize())))
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

func _center_selection() -> void:
	var live := _living_tags(selected_tags)
	if live.is_empty():
		return
	var center := Vector2.ZERO
	for tag in live:
		center += SimEngine.units[tag].pos
	_focus_camera(center / float(live.size()))

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
		world_3d.pan(v.normalized() * match_menu.pan_speed * (world_3d.cam_height / 50.0) * delta)

func world_to_screen(wpos: Vector2, y_offset: float = 0.0) -> Vector2:
	if world_3d and world_3d.camera_3d:
		return world_3d.world_to_screen(wpos, y_offset)
	return wpos * 13.5

func _unit_screen(unit: Dictionary, local_height: float, x_offset: float = 0.0) -> Vector2:
	var position: Vector2 = unit.pos + Vector2(x_offset, 0.0)
	if (unit.flight_height > 0.0 or unit.has("flight_transition")) and world_3d and world_3d.camera_3d:
		return world_3d.camera_3d.unproject_position(Vector3(position.x, SimEngine.unit_visual_elevation(unit) + local_height, position.y))
	return world_to_screen(position, local_height)

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
	var viewport := get_viewport()
	return viewport.get_mouse_position() if viewport else Vector2(-1.0, -1.0)

# ---------------------------------------------------------------------------
# Frame loop
# ---------------------------------------------------------------------------
func _process(delta: float) -> void:
	if RTSNetwork.watching_ai and observer_player > 0 and world_3d:
		var commander_camera: Vector2 = RTSNetwork.commander_cameras[observer_player - 1]
		if commander_camera.is_finite():
			var pan: Vector2 = world_3d.get_focus().lerp(commander_camera, minf(1.0, delta * 12.0))
			_focus_camera(pan, 50.0)
	elif not campaign_hud or not campaign_hud.blocks_battle_input():
		_handle_camera_pan(delta)
		_update_camera_tracking()
	_saturation_refresh -= delta
	if _saturation_refresh <= 0.0 and not hud_hidden:
		_saturation = SimEngine.worker_saturation(local_player)
		_worker_rally_previews.clear()
		for unit in selected_owned():
			var deposit := SimEngine.default_worker_deposit(unit)
			if not deposit.is_empty():
				_worker_rally_previews[unit.tag] = deposit
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
	_expire_path_feedback(delta)

	_prune_control_groups()

	if world_3d:
		var visible_selection := NO_SELECTION if campaign_hud and campaign_hud.cinematic() else selected_tags
		world_3d.sync_3d_entities(visible_selection, delta, viewing_player())
	queue_redraw()
	if hud:
		hud.queue_redraw()

# ---------------------------------------------------------------------------
# Selection helpers
# ---------------------------------------------------------------------------
func unit_height(u: Dictionary) -> float:
	var r: float = u["radius"]
	if u.get("burrowed", false):
		return 0.42
	if u["is_structure"]:
		return maxf(2.4, r * 1.5)
	if u["unit_type"] == "spire_walker":
		return 5.4
	if u.unit_type == "farsight_wisp":
		return 0.95
	if u.unit_type == "lumen_carrier":
		return 3.9 if u.is_immobile else 2.35
	if u.unit_type == "prospector":
		return 1.2
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
		if not u.is_empty() and u["owner"] == local_player and not u.get("campaign_scripted", false) and u.unit_type != "pursuit_fighter":
			out.append(u)
	return out

func _unit_at_screen(spos: Vector2) -> Dictionary:
	var camera: Camera3D = world_3d.camera_3d if world_3d else null
	var ray_origin := camera.project_ray_origin(spos) if camera else Vector3.ZERO
	var ray_direction := camera.project_ray_normal(spos) if camera else Vector3.ZERO
	var best: Dictionary = {}
	var best_depth := INF
	var best_d := INF
	var viewer := viewing_player()
	for u in SimEngine.units.values():
		if u.unit_type == "phase_barrier" or not SimEngine.can_see_unit(viewer, u):
			continue
		if camera:
			var depth: float = world_3d.unit_pick_distance(u, ray_origin, ray_direction)
			if depth < best_depth or (depth < INF and is_equal_approx(depth, best_depth) and int(u.tag) < int(best.tag)):
				best_depth = depth
				best = u
		if best_depth < INF:
			continue
		# Keep a small click tolerance for distant units and synthetic headless input.
		var center := _unit_screen(u, unit_height(u) * 0.45)
		var edge := _unit_screen(u, unit_height(u) * 0.45, u.radius)
		var rad_px := maxf(16.0, center.distance_to(edge) * 1.05)
		var d := center.distance_to(spos)
		if d <= rad_px and d < best_d:
			best_d = d
			best = u
	return best

func _select_tags(tags: Array, add: bool = false) -> void:
	_cancel_training_repeat()
	_close_worker_build_page()
	_last_group_press.clear()
	_inspected_deposit_tag = 0
	_selected_blueprint = null
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
			RTSAudio.play_character_dialogue(pu, "select")

func _on_archon_merged(first_tag: int, second_tag: int, archon_tag: int) -> void:
	if not selected_tags.has(first_tag) and not selected_tags.has(second_tag):
		return
	if SimEngine.units[archon_tag].owner != local_player:
		return
	selected_tags.erase(first_tag)
	selected_tags.erase(second_tag)
	selected_tags.append(archon_tag)
	active_type = ""

func inspected_deposit() -> Dictionary:
	var deposit: Dictionary = SimEngine.resources.get(_inspected_deposit_tag, {})
	if not deposit.is_empty() and SimEngine.can_see_position(viewing_player(), deposit.pos):
		return deposit
	return {}

func _inspect_deposit(position: Vector2) -> void:
	var best_distance := INF
	for deposit in SimEngine.resources.values():
		if not SimEngine.deposit_present(deposit):
			continue
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

func idle_producers() -> Array[Dictionary]:
	var idle: Array[Dictionary] = []
	if observer_player >= 0:
		return idle
	for unit in SimEngine.units.values():
		if unit.owner != local_player or not unit.is_structure or unit.flight_height > 0.0 or unit.build_progress < 1.0 or not unit.production_queue.is_empty():
			continue
		var def: Dictionary = RTSData.get_unit_def(unit.unit_type)
		if not def.has("trains") or (def.get("is_town_hall", false) and unit.unit_type != "brood_nest"):
			continue
		if SimEngine.uses_brood_slots(unit) and unit.brood_slots == 0:
			continue
		if SimEngine.requires_power(unit.unit_type) and not SimEngine.is_powered(local_player, unit.pos):
			continue
		if SimEngine.attachment_under_construction(unit):
			continue
		idle.append(unit)
	return idle

func _select_idle_production(all: bool) -> void:
	var idle := idle_producers()
	if idle.is_empty():
		return
	var tags := idle.map(func(unit): return unit.tag)
	pending_ability = ""
	if all:
		_select_tags(tags)
		return
	var current := tags.find(selected_tags[0]) if selected_tags.size() == 1 else -1
	var next := (current + 1) % tags.size()
	_select_tags([tags[next]])
	_focus_camera(idle[next].pos)

func _select_all_army(ungrouped_only: bool = false) -> void:
	var assigned := {}
	if ungrouped_only:
		for members in control_groups.values():
			for tag in members:
				assigned[tag] = true
	var tags: Array[int] = []
	for unit in SimEngine.units.values():
		if (unit.owner == local_player and unit.hp > 0.0 and not unit.is_worker and not unit.is_structure
				and not unit.get("campaign_scripted", false) and not assigned.has(unit.tag) and unit.unit_type != "pursuit_fighter"):
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
	if event is InputEventKey:
		if not _training_repeat.is_empty() and not event.pressed and event.keycode == _training_repeat.keycode:
			_cancel_training_repeat()
		if event.keycode == KEY_ALT:
			reveal_health_bars = event.pressed
		elif event.keycode == KEY_SHIFT:
			_shift_held = event.pressed
			if not _shift_held:
				_clear_repeated_target()

func _clear_held_keys() -> void:
	reveal_health_bars = false
	_shift_held = false
	_cancel_training_repeat()
	_clear_repeated_target()

func _clear_repeated_target() -> void:
	if _repeating_target:
		_close_worker_build_page()
		pending_ability = ""
		_repeating_target = false

func _close_worker_build_page() -> void:
	_worker_build_page = ""
	_hallucination_open = false
	if pending_ability.begins_with("build_"):
		pending_ability = ""
		_repeating_target = false

func _context_click(wpos: Vector2, shift: bool, screen: Vector2 = Vector2.INF) -> void:
	if not pending_ability.is_empty():
		var queue_after_build := shift and _repeating_target and pending_ability.begins_with("build_")
		pending_ability = ""
		_repeating_target = false
		if not queue_after_build:
			return
	_close_worker_build_page()
	_issue_smart_right_click(wpos, shift, screen)

func _unhandled_input(event: InputEvent) -> void:
	if match_menu and not match_menu.confirmation_title().is_empty():
		return
	if match_menu and (match_menu.panel.visible or match_menu.result_panel.visible):
		if event is InputEventKey and event.pressed and not event.echo:
			if event.keycode == KEY_F8:
				match_menu.toggle()
			elif match_menu.result_panel.visible and event.keycode == KEY_ENTER and (event.ctrl_pressed or event.meta_pressed):
				match_menu.restart()
			elif match_menu.result_panel.visible and event.keycode == KEY_O:
				_enter_observer()
		return
	if campaign_hud and campaign_hud.blocks_battle_input():
		if event is InputEventKey and event.pressed and not event.echo:
			if event.keycode == KEY_ESCAPE and campaign_hud.restart_picker_visible():
				campaign_hud.cancel_restart()
			elif event.keycode in [KEY_SPACE, KEY_ESCAPE]:
				campaign_hud.skip_cinematic()
			elif event.keycode == KEY_F8 and campaign_hud.cinematic():
				match_menu.toggle()
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

	if mb.pressed and hud and not hud_hidden:
		if FACTION_CARD.has_point(mpos):
			if mb.button_index == MOUSE_BUTTON_LEFT:
				technology_open = not technology_open
			return
		if technology_open and hud.technology_bounds.has_point(mpos):
			return

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
			_complete_box_selection(box_start_screen, box_end_screen, mb.shift_pressed, _box_pick_type or mb.ctrl_pressed or mb.meta_pressed)
		return

	if mpos.y >= IDLE_BTN.position.y and _hud_hit(mb, mpos):
		return
	if mpos.y >= HUD_TOP:
		return

	if mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
		if pending_ability != "":
			_execute_pending_ability_at(screen_to_world(mpos), mb.shift_pressed, false, mb.alt_pressed, mpos)
			return
		is_box_selecting = true
		# Godot marks the second press as a double-click. Selection commits on release.
		_box_pick_type = mb.double_click or mb.ctrl_pressed or mb.meta_pressed
		box_start_screen = mpos
		box_end_screen = mpos
	elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
		_context_click(screen_to_world(mpos), mb.shift_pressed, mpos)

# Returns true when the click landed on a HUD element.
func _hud_hit(mb: InputEventMouseButton, mpos: Vector2) -> bool:
	if not mb.pressed:
		return false
	var left := mb.button_index == MOUSE_BUTTON_LEFT
	var right := mb.button_index == MOUSE_BUTTON_RIGHT

	if MINIMAP.grow(6.0).has_point(mpos):
		_last_group_press.clear()
		if left:
			if pending_ability in ["attack", "move", "patrol", "rally", "rally_worker", "recon_sweep", "defensive_recall", "ping"]:
				_execute_pending_ability_at(minimap_to_world(mpos), mb.shift_pressed, true)
			elif world_3d and not _jump_to_attack_pin(mpos):
				mm_dragging = true
				_focus_camera(minimap_to_world(mpos))
		elif right:
			if not _worker_build_page.is_empty():
				_context_click(minimap_to_world(mpos), mb.shift_pressed)
			else:
				_issue_smart_right_click(minimap_to_world(mpos), mb.shift_pressed)
		return true

	if left and idle_workers().size() > 0 and IDLE_BTN.has_point(mpos):
		if mb.ctrl_pressed or mb.meta_pressed:
			_select_all_idle_workers()
		else:
			_select_next_idle_worker()
		return true
	if left and IDLE_PRODUCTION_BTN.has_point(mpos) and not idle_producers().is_empty():
		_select_idle_production(mb.ctrl_pressed or mb.meta_pressed)
		return true

	if right and hud and selected_tags.size() == 1:
		var unit := primary_unit()
		if not unit.is_empty() and unit.owner == local_player and unit.is_structure:
			var slot: int = hud.production_slot_at(mpos, unit.production_queue.size())
			if slot >= 0:
				_issue_player_command([unit.tag], "cancel_training", Vector2.ZERO, 0, str(slot))
				return true

	if right and primary_type() in ["pioneer", "triage_specialist", "aegis_capacitor", "sunblade", "bastion_walker"]:
		var primary := primary_unit()
		for btn in get_card_buttons():
			var command: String = AUTOCAST_COMMANDS.get(btn.ability_id, "")
			if not command.is_empty() and btn.rect.has_point(mpos):
				var enabled := bool(primary.get(command, false))
				var tags := selected_owned().filter(func(unit): return unit.unit_type == primary.unit_type and unit.get(command, false) == enabled).map(func(unit): return unit.tag)
				_issue_player_command(tags, command)
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
					_close_worker_build_page()
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
	_cancel_training_repeat()
	_close_worker_build_page()
	_last_group_press.clear()
	_inspected_deposit_tag = 0
	_selected_blueprint = null
	if not add_shift:
		selected_tags.clear()
	active_type = ""
	var rect := Rect2(Vector2(minf(p1.x, p2.x), minf(p1.y, p2.y)), Vector2(absf(p2.x - p1.x), absf(p2.y - p1.y)))

	if rect.size.length() < 10.0:
		var clicked := _unit_at_screen(p2)
		if world_3d and not add_shift and not pick_type and observer_player < 0:
			_selected_blueprint = world_3d.build_blueprint_at_screen(p2, clicked)
			if _selected_blueprint:
				RTSAudio.play_ui("ui_select")
				return
		if clicked.is_empty():
			if not add_shift:
				_inspect_deposit(screen_to_world(p2))
			return
		if clicked.unit_type == "pursuit_fighter" and clicked.owner == local_player:
			return
		if pick_type and clicked["owner"] == local_player:
			var battlefield := Rect2(0.0, 0.0, 1920.0, HUD_TOP)
			var camera: Camera3D = world_3d.camera_3d if world_3d else null
			var viewer := viewing_player()
			for u in SimEngine.units.values():
				if u.owner != local_player or u.unit_type != clicked.unit_type or u.hp <= 0.0 or not SimEngine.can_see_unit(viewer, u):
					continue
				var center_height := unit_height(u) * 0.4
				if camera and camera.is_position_behind(Vector3(u.pos.x, SimEngine.unit_visual_elevation(u) + center_height, u.pos.y)):
					continue
				if battlefield.has_point(_unit_screen(u, center_height)) and not selected_tags.has(u.tag):
					selected_tags.append(u.tag)
		elif add_shift and selected_tags.has(clicked["tag"]):
			selected_tags.erase(clicked["tag"])
		elif not selected_tags.has(clicked["tag"]):
			selected_tags.append(clicked["tag"])
		if not selected_tags.is_empty() and RTSAudio:
			RTSAudio.play_ui("ui_select")
			var pu := primary_unit()
			if not pu.is_empty() and int(pu.get("owner", 0)) == local_player:
				RTSAudio.play_character_dialogue(pu, "select")
		return

	var box_units: Array[Dictionary] = []
	for u in SimEngine.units.values():
		if u["owner"] != local_player or u.unit_type == "pursuit_fighter":
			continue
		var sp2 := _unit_screen(u, unit_height(u) * 0.4)
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
			RTSAudio.play_character_dialogue(pu2, "select")

func _spawn_marker(pos: Vector2, kind: String, height: float = 0.1) -> void:
	var duration := 5.0 if kind == "ping" else 0.7
	click_markers.append({"pos": pos, "kind": kind, "ttl": duration, "max": duration, "height": height})
	if RTSAudio:
		var pu := primary_unit()
		var own_unit := not pu.is_empty() and int(pu.get("owner", 0)) == local_player
		if kind == "attack":
			RTSAudio.play_ui("ui_command_attack")
			if own_unit:
				RTSAudio.play_character_dialogue(pu, "attack")
		elif kind in ["move", "gather", "rally", "patrol"]:
			RTSAudio.play_ui("ui_command_move")
			if own_unit and kind in ["move", "gather"]:
				RTSAudio.play_character_dialogue(pu, "move")

func _spawn_attack_marker(target: Dictionary) -> void:
	var height := 0.1
	if target.flight_height > 0.0 or target.has("flight_transition"):
		height = SimEngine.unit_visual_elevation(target) - SimEngine.get_elevation_at(target.pos) + 0.35
	_spawn_marker(target.pos, "attack", height)

func _on_order_path_resolved(unit: Dictionary, order: Dictionary, requested: Vector2, endpoint: Vector2, status: String) -> void:
	if unit.owner != local_player:
		return
	if status.is_empty():
		_path_feedback.erase(unit.tag)
		return
	_path_feedback[unit.tag] = {"order": order, "requested": requested, "endpoint": endpoint, "status": status, "ttl": PATH_FEEDBACK_FADE}

func _expire_path_feedback(delta: float) -> void:
	for tag in _path_feedback.keys():
		var feedback: Dictionary = _path_feedback[tag]
		var unit: Dictionary = SimEngine.units.get(tag, {})
		if unit.is_empty() or unit.owner != local_player:
			_path_feedback.erase(tag)
		elif not unit.orders.is_empty():
			var active: Dictionary = unit.orders.front()
			if not is_same(active, feedback.order) or active.get("target_pos") != feedback.requested:
				_path_feedback.erase(tag)
		else:
			feedback.ttl -= delta
			var arrival := float(feedback.order.get("arrival_radius", 1.5))
			if feedback.ttl <= 0.0 or unit.pos.distance_squared_to(feedback.endpoint) > pow(arrival * 2.8, 2.0):
				_path_feedback.erase(tag)

func _selected_path_feedback() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for tag in selected_tags:
		if _path_feedback.has(tag) and SimEngine.units.has(tag) and SimEngine.units[tag].owner == local_player:
			var feedback: Dictionary = _path_feedback[tag]
			result.append({"tag": tag, "status": feedback.status, "endpoint": feedback.endpoint, "alpha": feedback.ttl / PATH_FEEDBACK_FADE})
	return result

func _issue_rally_at(tags: Array, position: Vector2, queue: bool, allow_unit: bool = true, command: String = "rally", screen: Vector2 = Vector2.INF) -> void:
	var target_tag: int = world_3d.crystal_at_screen(screen, local_player) if world_3d and screen.is_finite() else 0
	if target_tag == 0:
		var best_distance := INF
		# Ground and minimap clicks can snap to a nearby deposit or finished tap.
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
		var unit := _order_target_at(position, screen)
		if not unit.is_empty() and unit.owner == local_player and not unit.is_structure:
			target_tag = unit.tag
			position = unit.pos
	if _issue_player_command(tags, command, position, target_tag, "", queue).ok:
		var crystal_height: float = world_3d.crystal_center_height(target_tag) if world_3d else 0.0
		_spawn_marker(position, "rally", maxf(0.1, crystal_height))

func _order_target_at(position: Vector2, screen: Vector2 = Vector2.INF) -> Dictionary:
	if screen.is_finite():
		return _unit_at_screen(screen)
	var target: Dictionary = {}
	var best_distance := INF
	for unit in SimEngine.units.values():
		if unit.unit_type == "phase_barrier":
			continue
		var distance: float = position.distance_to(unit.pos)
		if unit.flight_height <= 0.0 and distance < best_distance and distance <= float(unit.radius) + 1.0 and SimEngine.can_see_unit(local_player, unit):
			target = unit
			best_distance = distance
	return target

func _issue_context_escorts(own: Array[Dictionary], position: Vector2, queue: bool, follow_tag: int = 0, assigned: Array = []) -> void:
	var escorts: Array[int] = []
	for unit in own:
		if not unit.is_worker and not unit.is_structure and not unit.is_immobile and unit.tag != follow_tag and not assigned.has(unit.tag):
			escorts.append(unit.tag)
	if not escorts.is_empty():
		var command := "follow" if follow_tag > 0 else "move"
		_issue_player_command(escorts, command, position, follow_tag, "", queue)

func _issue_smart_right_click(wpos: Vector2, queue: bool, screen: Vector2 = Vector2.INF) -> void:
	var own := selected_owned()
	if own.is_empty():
		return
	var mobile_structures := own.filter(func(unit): return unit.is_structure and (unit.flight_height > 0.0 or unit.get("crawler_uprooted", false)))
	if not mobile_structures.is_empty():
		var result := _issue_player_command(mobile_structures.map(func(unit): return unit.tag), "move", wpos, 0, "", queue)
		own = own.filter(func(unit): return not mobile_structures.has(unit))
		if own.is_empty():
			if result.ok:
				_spawn_marker(wpos, "move")
			return
	var tags: Array = []
	for u in own:
		tags.append(u["tag"])

	var target := _order_target_at(wpos, screen)
	var all_struct := own.all(func(u): return u["is_structure"])
	if all_struct:
		if not target.is_empty() and target.owner != local_player and own.any(func(unit): return unit.armed_structure):
			var turrets := tags.filter(func(tag): return SimEngine.units[tag].armed_structure)
			if _issue_player_command(turrets, "attack_target", target.pos, target.tag, "", queue).ok:
				_spawn_attack_marker(target)
		else:
			_issue_rally_at(tags, wpos, queue, true, "rally", screen)
		return

	var workers := own.filter(func(unit): return unit.is_worker and not unit.is_immobile).map(func(unit): return unit.tag)
	if not target.is_empty() and target.owner == local_player:
		var tunnel_units := own.filter(func(unit): return SimEngine.can_enter_brood_tunnel(unit, target))
		if not tunnel_units.is_empty():
			if _issue_player_command(tunnel_units.map(func(unit): return unit.tag), "enter_brood_tunnel", target.pos, target.tag, "", queue).ok:
				_spawn_marker(target.pos, "move")
			return
		if target.unit_type == "field_bunker":
			var infantry := own.filter(SimEngine.is_bunker_infantry)
			if not infantry.is_empty() and target.build_progress >= 1.0:
				if not infantry.any(func(unit): return SimEngine.can_enter_bunker(unit, target)):
					push_message("Bunker is full. Select it and use Unload Bunker.", "warn")
				elif _issue_player_command(infantry.map(func(unit): return unit.tag), "enter_bunker", target.pos, target.tag, "", queue).ok:
					_spawn_marker(target.pos, "move")
				return
		if SimEngine.ladder_rules and target.unit_type == "rampart_transport":
			var passengers := own.filter(func(unit): return SimEngine.can_enter_rampart(unit, target))
			if not passengers.is_empty():
				_issue_player_command(passengers.map(func(unit): return unit.tag), "enter_rampart", target.pos, target.tag, "", queue)
				_spawn_marker(target.pos, "move")
				return
		var builder := {}
		var repairers: Array = []
		for unit in own:
			if SimEngine.can_resume_construction(unit, target) and (builder.is_empty() or unit.pos.distance_squared_to(wpos) < builder.pos.distance_squared_to(wpos)):
				builder = unit
			elif SimEngine.can_repair(unit, target):
				repairers.append(unit.tag)
		if not builder.is_empty():
			_issue_player_command([builder.tag], "resume_construction", target.pos, target.tag, "", queue)
			_issue_context_escorts(own, target.pos, queue)
			_spawn_marker(target.pos, "move")
			return
		var medics := own.filter(func(unit): return not unit.is_structure and not unit.is_immobile and SimEngine.can_restore(unit, target)).map(func(unit): return unit.tag)
		var follow_tag := int(target.tag) if not target.is_structure else 0
		if not medics.is_empty():
			_issue_player_command(medics, "restore_vitals", target.pos, target.tag, "", queue)
			_issue_context_escorts(own, target.pos, queue, follow_tag, medics)
			_spawn_marker(target.pos, "move")
			return
		if not repairers.is_empty():
			_issue_player_command(repairers, "repair", target.pos, target.tag, "", queue)
			_issue_context_escorts(own, target.pos, queue, follow_tag)
			_spawn_marker(target.pos, "move")
			return
		if target.is_extractor and not workers.is_empty():
			_issue_player_command(workers, "harvest", target.pos, target.tag, "", queue)
			_issue_context_escorts(own, target.pos, queue)
			_spawn_marker(target.pos, "gather")
			return

	# The battlefield pick has precedence over a deposit near the projected ground point.
	var picked_hostile: bool = screen.is_finite() and not target.is_empty() and target.owner != local_player
	if not workers.is_empty() and not picked_hostile:
		for r in SimEngine.resources.values():
			if SimEngine.deposit_present(r) and SimEngine.can_see_position(local_player, r.pos) and wpos.distance_to(r.pos) <= float(r.radius) + 1.6:
				_issue_player_command(workers, "harvest", r.pos, r.tag, "", queue)
				_issue_context_escorts(own, r.pos, queue)
				_spawn_marker(r.pos, "gather")
				return

	if not target.is_empty():
		if target["owner"] != local_player:
			if _issue_player_command(tags, "attack_target", target.pos, target.tag, "", queue).ok:
				_spawn_attack_marker(target)
			else:
				push_message("Selected weapons cannot hit that target.", "warn")
			return
		elif SimEngine.is_dropoff(target, local_player):
			var carrying := workers.filter(func(tag): return SimEngine.units[tag].cargo_amount > 0)
			if not carrying.is_empty():
				_issue_player_command(carrying, "return_cargo", target.pos, target.tag, "", queue)
				_issue_context_escorts(own, target.pos, queue)
				_spawn_marker(target.pos, "gather")
				return
		elif not target.is_structure and _issue_player_command(tags, "follow", target.pos, target.tag, "", queue).ok:
			_spawn_marker(target.pos, "move")
			return

	var mobile := own.filter(func(unit): return not unit.is_structure and not unit.is_immobile).map(func(unit): return unit.tag)
	if not mobile.is_empty() and _issue_player_command(mobile, "move", wpos, 0, "", queue).ok:
		_spawn_marker(wpos, "move")

func _execute_pending_ability_at(wpos: Vector2, queue: bool, minimap: bool = false, force: bool = false, screen: Vector2 = Vector2.INF) -> void:
	if pending_ability == "ping":
		pending_ability = ""
		var position := wpos.clamp(Vector2.ZERO, Vector2(SimEngine.map_width, SimEngine.map_height))
		_spawn_marker(position, "ping")
		return
	var own := selected_owned()
	if own.is_empty():
		pending_ability = ""
		return
	var abil := pending_ability
	if not abil.begins_with("build_"):
		_repeating_target = queue and abil in ["attack", "move", "rally", "rally_worker"]
	var tags: Array = []
	for u in own:
		tags.append(u["tag"])
	if abil == "attack":
		pending_ability = abil if _repeating_target else ""
		var tgt := {} if minimap else _order_target_at(wpos, screen)
		if not tgt.is_empty() and tgt["owner"] != local_player:
			if _issue_player_command(tags, "attack_target", tgt.pos, tgt.tag, "", queue).ok:
				_spawn_attack_marker(tgt)
			else:
				push_message("Selected weapons cannot hit that target.", "warn")
		elif force and not tgt.is_empty():
			if _issue_player_command(tags, "force_attack", tgt.pos, tgt.tag, "", queue).ok:
				_spawn_attack_marker(tgt)
		else:
			_issue_player_command(tags, "attack_move", wpos, 0, "", queue)
			_spawn_marker(wpos, "attack")
	elif abil in ["move", "phase_step", "shadow_stride", "patrol"]:
		pending_ability = abil if _repeating_target else ""
		var ability_tags: Array = []
		for u in own:
			var unit_abilities: Array = RTSData.get_unit_def(u.unit_type).get("abilities", [])
			if unit_abilities.has(abil) or (abil == "patrol" and unit_abilities.has("move")) \
					or (abil == "move" and u.is_structure and (u.flight_height > 0.0 or u.get("crawler_uprooted", false))):
				ability_tags.append(u["tag"])
		_issue_player_command(ability_tags, abil, wpos, 0, "", queue)
		_spawn_marker(wpos, "patrol" if abil == "patrol" else "move")
	elif abil == "land":
		var producer := primary_unit()
		if not producer.is_empty() and _issue_player_command([producer.tag], "land", wpos, 0, "", queue).ok:
			pending_ability = ""
			_spawn_marker(producer.orders.back().target_pos, "move")
	elif abil in ["crawler_root", "hurler_lunge"]:
		if _issue_player_command(tags, abil, wpos, 0, "", queue).ok:
			pending_ability = ""
			_spawn_marker(wpos, "move")
	elif abil in ["rally", "rally_worker"]:
		pending_ability = abil if _repeating_target else ""
		_issue_rally_at(tags, wpos, queue, not minimap, abil, screen)
	elif abil == "unload_transport":
		if _issue_player_command(tags, abil, wpos, 0, "", queue).ok:
			pending_ability = ""
			_spawn_marker(wpos, "move")
		else:
			push_message("Choose a clear ground drop site.", "warn")
	elif abil in ["phase_barrier", "lattice_burst"]:
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		elif abil == "phase_barrier":
			push_message("Choose clear visible ground within the Warden's cast range.", "warn")
		else:
			push_message("Choose a visible point within the Warden's cast range.", "warn")
	elif abil in ["corrosive_miasma", "caustic_barrage"]:
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose ground within cast range.", "warn")
	elif abil == "canticle_storm":
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose a visible point within the Scribe's cast range.", "warn")
	elif abil in ["fungal_grasp", "microbial_shroud", "launch_locusts", "locust_swoop", "blinding_cloud",
			"seed_growth_node", "spread_growth_node", "revelation", "seed_stasis_ward", "time_warp", "flagship_recall",
			"agent_emp", "agent_strike", "sky_defender_mode", "deploy_bastion_turret", "dreadnought_jump"]:
		if _issue_player_command(tags, abil, wpos, 0, "", queue).ok:
			pending_ability = ""
		else:
			push_message("Choose a valid point for this ability.", "warn")
	elif abil == "summon_brood_worm":
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose visible ground with room for the Tunnel Worm.", "warn")
	elif abil == "load_brood_tunnel":
		var target := _order_target_at(wpos, screen)
		if not target.is_empty() and _issue_player_command(tags, abil, target.pos, target.tag, "", queue).ok:
			pending_ability = ""
		else:
			push_message("Choose a friendly ground unit.", "warn")
	elif abil == "scribe_feedback":
		var target := _order_target_at(wpos, screen)
		if not target.is_empty() and _issue_player_command(tags, abil, target.pos, target.tag).ok:
			pending_ability = ""
		else:
			push_message("Choose a visible enemy unit with energy in Feedback range.", "warn")
	elif abil in ["contaminate_production", "caustic_spray", "neural_tether", "siphon_structure", "wyrm_grasp",
			"parasitic_cloud", "transfuse_brood", "gravity_lift", "agent_snipe", "vortex_lock", "sentinel_missiles",
			"systems_jammer", "armor_breaker", "dreadnought_beam"]:
		var target := _order_target_at(wpos, screen)
		if not target.is_empty() and _issue_player_command(tags, abil, target.pos, target.tag).ok:
			pending_ability = ""
		else:
			var prompt := "Choose a visible enemy unit in tether range."
			if abil == "contaminate_production":
				prompt = "Choose an enemy production structure in range."
			elif abil == "caustic_spray":
				prompt = "Choose an enemy structure in spray range."
			elif abil == "siphon_structure":
				prompt = "Choose a friendly Gnarl structure in siphon range."
			elif abil == "wyrm_grasp":
				prompt = "Choose a visible unit in grasp range."
			elif abil == "parasitic_cloud":
				prompt = "Choose a visible enemy aircraft in range."
			elif abil == "transfuse_brood":
				prompt = "Choose a wounded ally on living ground."
			elif abil == "gravity_lift":
				prompt = "Choose a visible enemy ground unit in lift range."
			elif abil == "agent_snipe":
				prompt = "Choose a visible enemy biological unit in range."
			elif abil == "vortex_lock":
				prompt = "Choose a visible enemy within Vortex Lock range."
			elif abil == "sentinel_missiles":
				prompt = "Choose a visible enemy within Sentinel Missile range."
			elif abil in ["systems_jammer", "armor_breaker", "dreadnought_beam"]:
				prompt = "Choose an eligible visible enemy in range."
			push_message(prompt, "warn")
	elif abil == "ridge_charge":
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose a visible point in range of a ready Ridge Scout.", "warn")
	elif abil == "link_tunnel":
		var target := _order_target_at(wpos, screen)
		if not target.is_empty() and _issue_player_command(tags, abil, target.pos, target.tag).ok:
			pending_ability = ""
			_spawn_marker(target.pos, "move")
		else:
			push_message("Choose a completed, unlinked Tunnel Mouth you own.", "warn")
	elif abil == "harvest":
		pending_ability = ""
		for r in SimEngine.resources.values():
			if not SimEngine.deposit_present(r):
				continue
			if SimEngine.can_see_position(local_player, r.pos) and wpos.distance_to(r["pos"]) <= float(r["radius"]) + 1.6:
				_issue_player_command(tags, "harvest", r["pos"], r["tag"], "", queue)
				_spawn_marker(r["pos"], "gather")
				return
		push_message("Select a crystal field or aether vent.", "warn")
	elif abil == "fill_gas":
		var target := _order_target_at(wpos, screen)
		if target.is_empty() or not target.is_extractor or target.owner != local_player:
			push_message("Select a friendly extractor.", "warn")
			return
		pending_ability = ""
		var result := _issue_player_command(tags, "fill_gas", target.pos, target.tag)
		if result.ok:
			_spawn_marker(target.pos, "gather")
		else:
			push_message("No available gas slots or workers.", "warn")
	elif abil == "inject_brood":
		var nest := _order_target_at(wpos, screen)
		var keepers: Array[int] = []
		for unit in own:
			if unit.unit_type == "brood_keeper":
				keepers.append(unit.tag)
		if _issue_player_command(keepers, abil, nest.get("pos", wpos), nest.get("tag", 0), "", queue).ok:
			pending_ability = ""
			_spawn_marker(nest.pos, "move")
	elif abil in ["repair", "restore_vitals", "restore_aegis", "charge"]:
		var target := _order_target_at(wpos, screen)
		if target.is_empty() or not _issue_player_command(tags, abil, target.pos, target.tag, "", queue).ok:
			var messages := {"repair": "Select a damaged friendly mechanical unit or building.",
				"restore_vitals": "Select a wounded biological ally.", "restore_aegis": "Select a nearby ally with damaged shields.",
				"charge": "Select a nearby ground enemy within Charge range."}
			push_message(messages[abil], "warn")
			return
		pending_ability = ""
		_spawn_marker(target.pos, "move")
	elif abil == "recon_sweep":
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose a map location for the sweep.", "warn")
	elif abil == "defensive_recall":
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose a visible location with friendly mobile units.", "warn")
	elif abil == "deploy_prospector":
		for deposit in SimEngine.resources.values():
			if deposit.resource_type != "crystal_field" or wpos.distance_to(deposit.pos) > deposit.radius + 1.6:
				continue
			if _issue_player_command(tags, abil, deposit.pos, deposit.tag).ok:
				pending_ability = ""
				_spawn_marker(deposit.pos, "gather")
				return
		if SimEngine.ladder_rules and _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
			_spawn_marker(wpos, "move")
			return
		push_message("Choose a visible crystal field with room to deploy.", "warn")
	elif abil == "reinforce_supply":
		var target := _order_target_at(wpos, screen)
		if target.is_empty() or not _issue_player_command(tags, abil, target.pos, target.tag).ok:
			push_message("Select a completed, unreinforced friendly Provision Silo.", "warn")
			return
		pending_ability = ""
		_spawn_marker(target.pos, "move")
	elif abil == "production_boost":
		var target := _order_target_at(wpos, screen)
		var reason := SimEngine.production_boost_target_reason(local_player, target)
		if not reason.is_empty():
			push_message(reason, "warn")
			return
		if not _issue_player_command(tags, abil, target.pos, target.tag).ok:
			push_message("Requires 50 Heartstone energy.", "warn")
			return
		pending_ability = ""
		_spawn_marker(target.pos, "boost")
	elif abil == "energy_recharge":
		var target := _order_target_at(wpos, screen)
		var reason := SimEngine.energy_recharge_target_reason(local_player, target)
		if not reason.is_empty():
			push_message(reason, "warn")
			return
		var casters := tags.filter(func(tag): return tag != target.tag)
		if casters.is_empty() or not _issue_player_command(casters, abil, target.pos, target.tag).ok:
			push_message("Select another friendly target or use a different Heartstone.", "warn")
			return
		pending_ability = ""
		_spawn_marker(target.pos, "boost")
	elif abil in ["rift_nova_cast", "mirage_transfer"]:
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose visible ground within Nova range." if abil == "rift_nova_cast" else "Choose ground inside the map.", "warn")
	elif abil == "fast_deploy":
		if not _issue_player_command(tags, abil, wpos).ok:
			push_message("Choose a clear, visible powered deployment site.", "warn")
			return
		pending_ability = ""
		_spawn_marker(wpos, "boost")
	elif RTSData.get_ability_def(abil).has("transit_unit"):
		if _issue_player_command(tags, abil, wpos).ok:
			pending_ability = ""
		else:
			push_message("Choose a clear, visible powered deployment site.", "warn")
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
		var best_has_build := false
		for u in own:
			if not RTSData.get_unit_def(u.unit_type).get("abilities", []).has(abil):
				continue
			var has_build: bool = u.orders.any(func(order): return order.type == "build")
			if has_build and u.unit_type == "forager":
				continue
			var d: float = u.pos.distance_squared_to(placement.pos)
			if not queue and has_build != best_has_build and not best.is_empty():
				if has_build:
					continue
			elif d >= best_d:
				continue
			best_d = d
			best = u
			best_has_build = has_build
		if not best.is_empty() and _issue_player_command([best["tag"]], abil, placement["pos"], 0, "", queue).ok:
			_repeating_target = queue
			if not queue:
				_close_worker_build_page()
				pending_ability = ""
			if RTSAudio:
				RTSAudio.play_ui("ui_build_place")
			_spawn_marker(placement["pos"], "move")
		elif best.is_empty() and primary_type() == "forager":
			push_message("Select a Forager without a structure order.", "warn")

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
		return {"ok": false, "pos": pos, "reason": "Place the %s inside a friendly power field." % def.name}
	if def.get("requires_living_ground", false) and not SimEngine.has_active_living_ground(pos, local_player):
		return {"ok": false, "pos": pos, "reason": "Place the %s on active friendly living ground." % def.name}
	if pos.x < r or pos.y < r or pos.x > SimEngine.map_width - r or pos.y > SimEngine.map_height - r:
		return {"ok": false, "pos": pos, "reason": "Cannot build outside the map."}
	for obs in SimEngine.terrain_obstacles:
		if obs.grow(r * 0.8).has_point(pos):
			return {"ok": false, "pos": pos, "reason": "Cannot build there."}
	for u in SimEngine.units.values():
		if u["is_structure"] and SimEngine.can_see_unit(local_player, u) and pos.distance_to(u["pos"]) < r + float(u["radius"]) - 0.4:
			return {"ok": false, "pos": pos, "reason": "Too close to another structure."}
	for res in SimEngine.resources.values():
		if not SimEngine.deposit_present(res):
			continue
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
func ability_cost(adef: Dictionary) -> Dictionary:
	if adef.get("id") in ["upgrade_hub", "fortify_hub"]:
		return SimEngine.hub_upgrade_offer(adef.id)
	if adef.get("id") == "morph_carapace":
		return SimEngine.CARAPACE_MORPH_OFFER
	if adef.get("id") == "morph_sporeburst":
		var definition := RTSData.get_unit_def("sporeburst")
		return {"crystal": definition.crystal_cost, "aether": definition.aether_cost,
			"time": definition.build_time, "supply": 0, "requires": ["spore_nursery"]}
	if adef.has("unit_morph"):
		var definition := RTSData.get_unit_def(adef.unit_morph)
		return {"crystal": definition.crystal_cost, "aether": definition.aether_cost,
			"time": definition.build_time, "supply": SimEngine.brood_morph_supply(adef.unit_morph), "requires": definition.requires}
	if adef.has("upgrade"):
		return SimEngine.research_offer(local_player, adef.upgrade)
	var def_id := str(adef.get("unit", adef.get("transit_unit", adef.get("structure", adef.get("structure_evolution", "")))))
	if def_id == "":
		return {}
	var d := SimEngine.unit_definition_for(def_id, local_player)
	var duration := float(d.get("build_time", 0.0))
	if adef.has("transit_unit"):
		duration = 0.0
	elif adef.has("structure"):
		duration = SimEngine.construction_time(def_id)
	return {
		"crystal": int(d.get("crystal_cost", 0)),
		"aether": int(d.get("aether_cost", 0)),
		"supply": float(d.get("supply_cost", 0)) * int(d.get("hatch_count", 1)),
		"time": duration,
		"requires": d.get("requires", []),
		"def_id": def_id
	}

func _block_reason(adef: Dictionary, pu: Dictionary) -> String:
	if adef.id == "cancel_construction":
		return ""
	if adef.has("structure_evolution"):
		return SimEngine.structure_evolution_block_reason(pu, adef.structure_evolution)
	if adef.has("structure"):
		var alternatives: Array = RTSData.get_unit_def(adef.structure).get("requires_any", [])
		if not SimEngine.alternative_tech_met(local_player, alternatives):
			return "Requires %s." % " or ".join(alternatives.map(func(required): return RTSData.get_unit_def(required).name))
	if adef.has("unit_morph"):
		if not selected_owned().any(func(unit): return SimEngine.brood_morph_block_reason(unit, adef.unit_morph).is_empty()):
			return SimEngine.brood_morph_block_reason(pu, adef.unit_morph)
	if adef.id in ["open_transit", "close_transit"]:
		return SimEngine.transit_morph_block_reason(pu, adef.id)
	if adef.has("transit_unit"):
		if selected_owned().any(func(gate): return SimEngine.transit_deploy_block_reason(gate, adef.transit_unit).is_empty()):
			return ""
		return SimEngine.transit_deploy_block_reason(pu, adef.transit_unit)
	if pu["is_structure"] and float(pu["build_progress"]) < 1.0:
		return "Under construction."
	if pu.has("archon_warp_finish"):
		return "The Archon is still forming."
	if SimEngine.systems_jammed(pu) and adef.id not in ["move", "stop", "hold_position", "hold_fire", "patrol"]:
		return "Systems are jammed."
	if adef.id == "hallucination" or adef.has("hallucination_unit"):
		if not selected_owned().any(func(unit): return SimEngine.hallucination_block_reason(unit).is_empty()):
			return SimEngine.hallucination_block_reason(pu)
	if adef.id in ["upgrade_hub", "fortify_hub"]:
		return SimEngine.hub_upgrade_block_reason(pu, adef.id)
	if adef.id == "morph_carapace":
		if selected_owned().any(func(unit): return SimEngine.carapace_morph_block_reason(unit).is_empty()):
			return ""
		return SimEngine.carapace_morph_block_reason(pu)
	if adef.id == "morph_sporeburst":
		if selected_owned().any(func(unit): return SimEngine.sporeburst_morph_block_reason(unit).is_empty()):
			return ""
		return SimEngine.sporeburst_morph_block_reason(pu)
	if adef.get("attachment", false):
		return SimEngine.attachment_block_reason(pu, str(adef.structure))
	if adef.id == "lift":
		return SimEngine.lift_block_reason(pu)
	if adef.id == "extend_silo":
		if selected_owned().any(func(unit): return unit.unit_type == "silo_retracted" and unit.build_progress >= 1.0 and SimEngine.silo_raise_block_reason(unit).is_empty()):
			return ""
		return SimEngine.silo_raise_block_reason(pu)
	if adef.has("unit"):
		var producers := selected_owned()
		var training_reason := SimEngine.training_block_reason(pu, adef.unit)
		if not training_reason.is_empty() and not producers.any(func(u):
			return u.unit_type == pu.unit_type and u.build_progress >= 1.0 and u.flight_height <= 0.0 \
				and SimEngine.training_block_reason(u, adef.unit).is_empty()):
			return training_reason
		if SimEngine.training_uses_brood_slot(pu, adef.unit) and not producers.any(func(u): return SimEngine.training_uses_brood_slot(u, adef.unit) and u.build_progress >= 1.0 and u.brood_slots > 0):
			return "No brood slots ready."
		if SimEngine.requires_power(pu.unit_type) and not producers.any(func(u): return u.unit_type == pu.unit_type and u.build_progress >= 1.0 and SimEngine.is_powered(u.owner, u.pos)):
			return "Waystone needs a friendly power field."
	if adef.has("upgrade"):
		var reason := SimEngine.research_block_reason(local_player, adef.upgrade)
		if not reason.is_empty():
			return reason
		if not selected_owned().any(func(unit): return SimEngine.research_producer_block_reason(unit, adef.upgrade).is_empty()):
			return SimEngine.research_producer_block_reason(pu, adef.upgrade)
	var p: Dictionary = SimEngine.players.get(local_player, {})
	var cost := ability_cost(adef)
	if not cost.is_empty():
		for req in cost["requires"]:
			if not SimEngine.has_tech_structure(local_player, str(req)):
				return "Requires %s." % str(RTSData.get_unit_def(str(req)).get("name", req))
		if int(p.get("crystal", 0)) < int(cost["crystal"]):
			return "Not enough crystal."
		if int(p.get("aether", 0)) < int(cost["aether"]):
			return "Not enough aether."
		if SimEngine.ladder_rules and adef.has("unit") and SimEngine.training_uses_brood_slot(pu, adef.unit) \
				and float(cost.supply) > 0.0 and float(p.get("supply_used", 0)) + float(cost.supply) > int(p.get("supply_cap", 0)):
			return "Supply blocked. Build more supply structures."
	match str(adef.get("id", "")):
		"link_tunnel":
			if not SimEngine.linked_tunnel(pu).is_empty():
				return "Already linked to a Tunnel Mouth."
		"send_tunnel_squad":
			return SimEngine.tunnel_send_block_reason(pu)
		"corrosive_miasma":
			if not selected_owned().any(func(unit): return SimEngine.miasma_block_reason(unit).is_empty()):
				return SimEngine.miasma_block_reason(pu)
		"caustic_barrage":
			if not selected_owned().any(func(unit): return unit.unit_type == "rupture_crawler" and SimEngine.caustic_barrage_ticks(unit) == 0):
				return "Caustic Barrage is recharging."
		"hurler_lunge":
			if not selected_owned().any(func(unit): return SimEngine.hurler_lunge_block_reason(unit).is_empty()):
				return SimEngine.hurler_lunge_block_reason(pu)
		"crawler_root", "crawler_uproot":
			return SimEngine.crawler_mode_block_reason(pu, adef.id == "crawler_root")
		"generate_drift_creep":
			return SimEngine.drift_creep_block_reason(pu)
		"spawn_brood_mimic", "contaminate_production":
			var energy: float = adef.energy_cost
			if not selected_owned().any(func(unit): return unit.unit_type == "spore_seer" and unit.energy >= energy):
				return "Requires %d Spore Seer energy." % energy
		"caustic_spray":
			if not selected_owned().any(SimEngine.caustic_spray_ready):
				return "Caustic Spray is active or recharging."
		"canticle_storm":
			if not selected_owned().any(func(unit): return SimEngine.canticle_storm_block_reason(unit).is_empty()):
				return SimEngine.canticle_storm_block_reason(pu)
		"fungal_grasp", "microbial_shroud":
			if not selected_owned().any(func(unit): return SimEngine.mireweaver_spell_block_reason(unit, adef.id).is_empty()):
				return SimEngine.mireweaver_spell_block_reason(pu, adef.id)
		"neural_tether":
			if not selected_owned().any(func(unit): return SimEngine.neural_tether_block_reason(unit).is_empty()):
				return SimEngine.neural_tether_block_reason(pu)
		"siphon_structure", "wyrm_grasp", "blinding_cloud", "parasitic_cloud":
			if not selected_owned().any(func(unit): return SimEngine.siphon_wyrm_spell_block_reason(unit, adef.id).is_empty()):
				return SimEngine.siphon_wyrm_spell_block_reason(pu, adef.id)
		"seed_growth_node", "spread_growth_node":
			if not selected_owned().any(func(unit): return SimEngine.growth_node_block_reason(unit, adef.id).is_empty()):
				return SimEngine.growth_node_block_reason(pu, adef.id)
		"transfuse_brood":
			if not selected_owned().any(func(unit): return SimEngine.transfuse_block_reason(unit).is_empty()):
				return SimEngine.transfuse_block_reason(pu)
		"gravity_lift":
			if not selected_owned().any(func(unit): return SimEngine.gravity_lift_block_reason(unit).is_empty()):
				return SimEngine.gravity_lift_block_reason(pu)
		"prism_alignment":
			if not selected_owned().any(func(unit): return SimEngine.prism_alignment_block_reason(unit).is_empty()):
				return SimEngine.prism_alignment_block_reason(pu)
		"pulsar_beam", "end_pulsar_beam", "revelation", "seed_stasis_ward":
			if not selected_owned().any(func(unit): return SimEngine.sunseer_spell_block_reason(unit, adef.id).is_empty()):
				return SimEngine.sunseer_spell_block_reason(pu, adef.id)
		"flagship_cloak", "time_warp", "flagship_recall":
			return SimEngine.flagship_spell_block_reason(pu, adef.id)
		"agent_cloak", "agent_snipe", "agent_emp", "agent_strike":
			if not selected_owned().any(func(unit): return SimEngine.agent_spell_block_reason(unit, adef.id).is_empty()):
				return SimEngine.agent_spell_block_reason(pu, adef.id)
		"cinder_guard_mode", "cinder_runner_mode", "mine_burrow", "mine_surface", "atlas_precision_mode", "atlas_airburst_mode":
			if not selected_owned().any(func(unit): return SimEngine.vehicle_mode_block_reason(unit, adef.id).is_empty()):
				return SimEngine.vehicle_mode_block_reason(pu, adef.id)
		"vortex_lock":
			if not selected_owned().any(func(unit): return SimEngine.vortex_lock_block_reason(unit).is_empty()):
				return SimEngine.vortex_lock_block_reason(pu)
		"sentinel_missiles":
			if not selected_owned().any(func(unit): return SimEngine.sentinel_missile_block_reason(unit).is_empty()):
				return SimEngine.sentinel_missile_block_reason(pu)
		"train_crownspire":
			if SimEngine.ladder_rules:
				var reason := SimEngine.flagship_production_block_reason(pu.owner)
				if not reason.is_empty():
					return reason
		"build_pursuit_fighter":
			if not selected_owned().any(func(unit): return SimEngine.pursuit_fighter_block_reason(unit).is_empty()):
				return SimEngine.pursuit_fighter_block_reason(pu)
		"launch_locusts":
			if not selected_owned().any(func(unit): return SimEngine.launch_locusts_block_reason(unit).is_empty()):
				return SimEngine.launch_locusts_block_reason(pu)
		"summon_brood_worm":
			if not selected_owned().any(func(unit): return SimEngine.brood_worm_block_reason(unit).is_empty()):
				return SimEngine.brood_worm_block_reason(pu)
		"unload_brood_tunnel":
			if SimEngine.brood_tunnel_cargo_count(pu) <= 0:
				return "Tunnel cargo is empty."
		"scribe_feedback":
			if not selected_owned().any(func(unit): return unit.unit_type == "storm_scribe" and unit.energy >= 50.0):
				return "Requires 50 energy."
		"merge_archon":
			if selected_owned().filter(SimEngine.can_merge_archon_unit).size() < 2:
				return "Select two available Storm Scribes or Duskblades."
		"guardian_shield":
			if not selected_owned().any(func(unit): return SimEngine.guardian_shield_block_reason(unit).is_empty()):
				return SimEngine.guardian_shield_block_reason(pu)
		"fighter_assault", "fighter_intercept":
			if not selected_owned().any(func(unit): return SimEngine.fighter_mode_block_reason(unit, adef.id).is_empty()):
				return SimEngine.fighter_mode_block_reason(pu, adef.id)
		"rampart_boost":
			if not selected_owned().any(func(unit): return SimEngine.rampart_boost_block_reason(unit).is_empty()):
				return SimEngine.rampart_boost_block_reason(pu)
		"harrier_cloak":
			if not selected_owned().any(func(unit): return SimEngine.harrier_cloak_block_reason(unit).is_empty()):
				return SimEngine.harrier_cloak_block_reason(pu)
		"sky_defender_mode", "sky_fighter_mode":
			if not selected_owned().any(func(unit): return SimEngine.sky_mode_block_reason(unit, adef.id).is_empty()):
				return SimEngine.sky_mode_block_reason(pu, adef.id)
		"deploy_bastion_turret", "systems_jammer", "armor_breaker":
			if not selected_owned().any(func(unit): return SimEngine.watchkeeper_spell_block_reason(unit, adef.id).is_empty()):
				return SimEngine.watchkeeper_spell_block_reason(pu, adef.id)
		"dreadnought_jump", "dreadnought_beam":
			if not selected_owned().any(func(unit): return SimEngine.dreadnought_ability_block_reason(unit, adef.id).is_empty()):
				return SimEngine.dreadnought_ability_block_reason(pu, adef.id)
		"load_transport":
			if not selected_owned().any(func(unit): return SimEngine.transport_slots_used(unit) < RTSData.get_unit_def(unit.unit_type).get("transport_capacity", 0)):
				return "Passenger bay is full."
		"unload_transport":
			if not selected_owned().any(func(unit): return not unit.get("passengers", []).is_empty()):
				return "No troops aboard."
		"unload_bunker":
			if pu.get("passengers", []).is_empty():
				return "The bunker is empty."
		"load_hub_workers", "unload_hub_workers":
			if not selected_owned().any(func(unit): return SimEngine.hub_worker_cargo_available(unit, adef.id)):
				return "Requires a grounded Hub with available cargo."
		"attack":
			if pu.unit_type == "field_bunker" and not pu.get("passengers", []).any(func(unit): return RTSData.get_unit_def(unit.unit_type).has("weapon")):
				return "Load Riflemen or Breachers to fire."
		"deploy_prospector":
			if not selected_owned().any(func(unit): return unit.get("hub_operations", false) and SimEngine.can_use_hub_power(unit)):
				return "Requires 50 energy from an upgraded Colony Hub."
		"recon_sweep", "reinforce_supply":
			if adef.id == "recon_sweep" and SimEngine.vision == null:
				return "Fog of war is disabled."
			if not selected_owned().any(SimEngine.can_use_hub_power):
				return "Requires 50 Hub energy."
		"production_boost":
			if not selected_owned().any(SimEngine.can_use_production_boost):
				return "Requires 50 Heartstone energy."
		"energy_recharge":
			if not selected_owned().any(func(unit): return SimEngine.energy_recharge_block_reason(unit).is_empty()):
				return SimEngine.energy_recharge_block_reason(pu)
		"defensive_recall":
			if not selected_owned().any(func(unit): return SimEngine.defensive_recall_block_reason(unit).is_empty()):
				return SimEngine.defensive_recall_block_reason(pu)
		"fast_deploy":
			if not selected_owned().any(func(unit): return SimEngine.fast_deployment_block_reason(unit).is_empty()):
				return SimEngine.fast_deployment_block_reason(pu)
		"deploy_power_field", "retract_power_field":
			var deploy: bool = adef.id == "deploy_power_field"
			if not selected_owned().any(func(unit): return SimEngine.carrier_field_block_reason(unit, deploy).is_empty()):
				return SimEngine.carrier_field_block_reason(pu, deploy)
		"move", "patrol":
			if pu.unit_type == "lumen_carrier" and pu.is_immobile and not selected_owned().any(func(unit): return not unit.is_structure and not unit.is_immobile):
				return "Fold the power field to move."
		"return_cargo":
			if not selected_owned().any(func(unit): return unit.is_worker and unit.cargo_amount > 0):
				return "No worker is carrying resources."
		"phase_step", "shadow_stride":
			var research := SimEngine.concord_combat_research_block_reason(local_player, adef.id)
			if not research.is_empty():
				return research
			if float(pu["phase_cooldown"]) > 0.0:
				return "%s is recharging." % adef.name
		"charge":
			var research := SimEngine.concord_combat_research_block_reason(local_player, adef.id)
			if not research.is_empty():
				return research
			if not selected_owned().any(func(unit): return unit.unit_type == "sunblade" and int(unit.get("charge_ready_tick", 0)) <= SimEngine.tick):
				return "Charge is recharging."
		"restore_aegis":
			if not SimEngine.is_powered(local_player, pu.pos):
				return "The Aegis Capacitor needs a friendly power field."
		"bastion_barrier":
			if not selected_owned().any(func(unit): return unit.unit_type == "bastion_walker" and SimEngine.bastion_barrier_ticks(unit) == 0):
				return "Barrier is recharging."
		"rift_nova_cast":
			if not selected_owned().any(func(unit): return unit.unit_type == "rift_engine" and SimEngine.rift_nova_ticks(unit) == 0):
				return "Rift Nova is recharging."
		"mirage_transfer":
			if not selected_owned().any(func(unit): return unit.unit_type == "mirage_adept" and SimEngine.mirage_transfer_ticks(unit) == 0):
				return "Mirage Transfer is recharging."
		"cancel_mirage_transfer":
			if not selected_owned().any(func(unit): return unit.unit_type == "mirage_shade" or unit.has("mirage_shade_tag")):
				return "There is no active shade."
		"ridge_charge":
			if not selected_owned().any(func(unit): return unit.unit_type == "ridge_scout" and SimEngine.ridge_charge_remaining(unit) == 0.0):
				return "Ridge Charge is recharging."
		"phase_cloak":
			if not pu.get("cloaked", false) and pu.energy < SimEngine.CLOAK_START_ENERGY:
				return "Requires 25 energy."
		"inject_brood":
			if SimEngine.match_state.is_empty():
				return "Brood slots are enabled in skirmishes."
			if not selected_owned().any(func(unit): return unit.unit_type == "brood_keeper" and unit.energy >= SimEngine.BROOD_INJECT_COST):
				return "Requires 25 energy."
		"burrow", "surface":
			var underground: bool = adef.id == "burrow"
			if not selected_owned().any(func(unit): return SimEngine.burrow_block_reason(unit, underground).is_empty()):
				return SimEngine.burrow_block_reason(pu, underground)
		"phase_barrier", "lattice_burst":
			var energy_cost := SimEngine.PHASE_BARRIER_COST if adef.id == "phase_barrier" else SimEngine.LATTICE_BURST_COST
			if not selected_owned().any(func(unit): return SimEngine.warden_cast_block_reason(unit, energy_cost).is_empty()):
				return SimEngine.warden_cast_block_reason(pu, energy_cost)
		"surge":
			if not selected_owned().any(func(unit): return SimEngine.surge_block_reason(unit).is_empty()):
				return SimEngine.surge_block_reason(pu)
	return ""

func _card_button(adef: Dictionary, slot: int, hotkey: String, button_size: float, blocked: String) -> Dictionary:
	var offset := Vector2(slot % 5, slot / 5) * (button_size + CARD_GAP)
	return {
		"ability_id": adef.id,
		"def": adef,
		"hotkey": hotkey,
		"rect": Rect2(CARD_ORIGIN + offset, Vector2.ONE * button_size),
		"blocked": blocked,
		"cost": ability_cost(adef),
	}

func _worker_is_building(unit: Dictionary) -> bool:
	return unit.unit_type == "pioneer" and not unit.orders.is_empty() and unit.orders[0].type == "build"

func _worker_card_buttons(worker: Dictionary, grid: bool) -> Array[Dictionary]:
	var layout: Dictionary = WORKER_BUILD_PAGES[worker.unit_type]
	var buttons: Array[Dictionary] = []
	if not _worker_build_page.is_empty():
		var page: Dictionary = layout[_worker_build_page]
		for slot in page:
			var id: String = page[slot]
			if not _worker_build_offered(id):
				continue
			var adef := RTSData.get_ability_def(id)
			var hotkey: String = GRID_KEYS[slot] if grid else adef.hotkey
			buttons.append(_card_button(adef, slot, hotkey, CARD_BTN, _block_reason(adef, worker)))
		var back := {"id": "worker_back", "name": "Back", "desc": "Return to worker orders."}
		buttons.append(_card_button(back, 14, "Esc", CARD_BTN, ""))
		return buttons

	var slots := WORKER_CARD_ROOT.duplicate()
	if worker.unit_type == "pioneer":
		slots[7] = "repair"
		slots[14] = "halt_construction"
	elif worker.unit_type == "forager" and SimEngine.ladder_rules:
		slots[7] = "burrow"
	for slot in range(slots.size()):
		var id: String = slots[slot]
		if id.is_empty():
			continue
		var adef: Dictionary
		var blocked := ""
		var hotkey := ""
		match id:
			"worker_basic", "worker_advanced":
				var advanced := id == "worker_advanced"
				var page: Dictionary = layout.advanced if advanced else layout.basic
				if not page.values().any(_worker_build_offered):
					continue
				adef = RTSData.get_ability_def(id).duplicate()
				adef.name = "%s %s" % [layout.verb, adef.name]
				if advanced and not SimEngine.has_tech_structure(local_player, layout.tech):
					blocked = "Requires a completed %s." % RTSData.get_unit_def(layout.tech).name
				hotkey = adef.hotkey
			"halt_construction":
				adef = RTSData.get_ability_def(id)
				if not selected_owned().any(_worker_is_building):
					blocked = "No selected Pioneer is building."
				hotkey = adef.hotkey
			_:
				if not SimEngine.campaign_allows_ability(local_player, id):
					continue
				adef = RTSData.get_ability_def(id)
				hotkey = str(adef.get("hotkey", ""))
				if id == "return_cargo":
					hotkey = "C"
				elif id == "repair":
					adef = adef.duplicate()
					adef.desc += " Right-click to toggle Auto-Repair."
					hotkey = "R"
				blocked = _block_reason(adef, worker)
		buttons.append(_card_button(adef, slot, GRID_KEYS[slot] if grid else hotkey, CARD_BTN, blocked))
	return buttons

func _worker_build_offered(id: String) -> bool:
	if not SimEngine.campaign_allows_ability(local_player, id):
		return false
	var structure: String = RTSData.get_ability_def(id).structure
	return SimEngine.ladder_rules or not RTSData.get_unit_def(structure).get("ladder_only", false)

func get_card_buttons() -> Array[Dictionary]:
	var buttons: Array[Dictionary] = []
	var pu := primary_unit()
	if pu.is_empty() or pu["owner"] != local_player or pu.get("campaign_scripted", false) or observer_player >= 0:
		return buttons
	var grid: bool = match_menu != null and match_menu.grid_hotkeys
	if pu.has("burrow_transition") or pu.has("crawler_transition"):
		return buttons
	if WORKER_BUILD_PAGES.has(pu.unit_type) and not pu.get("burrowed", false):
		return _worker_card_buttons(pu, grid)
	if _hallucination_open and pu.unit_type == "aegis_warden":
		var types: Array = SimEngine.hallucination_types()
		for slot in range(types.size()):
			var option := RTSData.get_ability_def("hallucinate_" + str(types[slot]))
			var key: String = GRID_KEYS[slot] if grid else option.hotkey
			buttons.append(_card_button(option, slot, key, CARD_BTN, _block_reason(option, pu)))
		var back := {"id": "hallucination_back", "name": "Back", "desc": "Return to Warden orders."}
		buttons.append(_card_button(back, 14, "Esc", CARD_BTN, ""))
		return buttons
	var abils: Array = RTSData.get_unit_def(pu["unit_type"]).get("abilities", [])
	if SimEngine.ladder_rules:
		if pu.unit_type == "research_module":
			abils = SimEngine.research_module_abilities(pu)
		elif SimEngine.supports_meridian_attachments(pu.unit_type):
			abils = abils.filter(func(id): return RTSData.get_ability_def(id).get("requires_attachment") != "research_module")
	if pu.get("hallucinated", false):
		abils = ["move", "stop", "hold_position", "attack"] if RTSData.get_unit_def(pu.unit_type).has("weapon") else ["move", "stop", "hold_position"]
	elif pu.is_structure and pu.build_progress < 1.0:
		abils = ["cancel_construction"]
	elif pu.has("flight_transition"):
		abils = []
	elif pu.has("carapace_morph_until"):
		abils = ["cancel_carapace_morph"]
	elif pu.is_structure and pu.flight_height > 0.0:
		abils = ["move", "stop", "land"]
	elif pu.get("crawler_uprooted", false):
		abils = ["move", "stop", "crawler_root"]
	elif pu.unit_type == "spore_seer" and pu.is_immobile:
		abils = ["seer_mobile", "contaminate_production", "spawn_brood_mimic"]
	elif pu.unit_type == "colony_hub":
		abils = abils.duplicate()
		if SimEngine.ladder_rules:
			var unavailable := ["upgrade_hub", "fortify_hub", "load_hub_workers", "unload_hub_workers"] if pu.get("hub_operations", false) else [
				"recon_sweep", "reinforce_supply", "deploy_prospector"]
			abils = abils.filter(func(id): return id not in unavailable)
		else:
			abils.erase("upgrade_hub" if pu.get("hub_operations", false) else "deploy_prospector")
	elif SimEngine.ladder_rules and pu.unit_type == "brood_nest":
		match pu.get("structure_form", "brood_nest"):
			"brood_nest":
				abils = abils + ["evolve_brood_lair"]
			"brood_lair":
				abils = abils + ["evolve_brood_hive"]
	elif pu.get("structure_form") == "greater_blight_spire":
		abils = abils.filter(func(id): return id != "evolve_greater_blight_spire")
	elif pu.unit_type == "sunseer" and pu.get("pulsar_active", false):
		abils = abils.map(func(id): return "end_pulsar_beam" if id == "pulsar_beam" else id)
	elif pu.get("burrowed", false) and not pu.is_structure:
		abils = ["surface", "detonate_sporeburst"] if pu.unit_type == "sporeburst" else ["surface"]
		if pu.get("burrow_mobile", false):
			abils = ["move", "stop"] + abils
			if pu.unit_type == "mireweaver":
				abils.append("neural_tether")
		elif pu.unit_type == "spine_ambusher":
			abils += ["attack", "hold_fire", "stop"]
		elif pu.unit_type == "locust_brooder":
			abils.append("launch_locusts")
	elif not pu.is_worker and pu.unit_type != "spine_ambusher" and RTSData.get_unit_def(pu.unit_type).has("weapon"):
		abils = abils + ["hold_fire"]
	if abils.has("move") and not pu.is_structure and not pu.get("burrowed", false):
		abils = abils + ["patrol"]
	if pu.is_worker and not pu.get("burrowed", false):
		abils = abils + ["return_cargo"]
	abils = abils.filter(func(id): return SimEngine.campaign_allows_ability(local_player, id))
	var button_size := 48.0 if abils.size() > 15 else CARD_BTN
	for i in range(mini(20, abils.size())):
		var abil_id := str(abils[i])
		var adef := RTSData.get_ability_def(abil_id)
		if abil_id == "sporeburst_structures":
			adef = adef.duplicate()
			adef["name"] = "Structure Targeting: On" if pu.get("target_structures", false) else "Structure Targeting: Off"
		if abil_id == "generate_drift_creep" and pu.get("generating_creep", false):
			adef = adef.duplicate()
			adef["name"] = "Stop Generating Living Ground"
		if abil_id == "surge":
			var hp_cost := SimEngine.surge_hp_cost(pu)
			if hp_cost != float(adef.hp_cost):
				adef = adef.duplicate()
				if hp_cost < float(adef.hp_cost):
					adef["name"] = "Efficient Surge"
				adef["hp_cost"] = hp_cost
				adef["desc"] = "Spend %d HP for +50%% movement and attack speed for 11 seconds." % int(hp_cost)
		var hotkey := GRID_KEYS[i] if grid else str(adef.get("hotkey", ""))
		if abil_id == "cancel_construction" and pu.has("morph_worker"):
			hotkey = "Esc"
		buttons.append(_card_button(adef, i, hotkey, button_size, _block_reason(adef, pu)))
	return buttons

func _trigger_card_button(btn: Dictionary, shift: bool = false) -> void:
	var abil_id: String = btn["ability_id"]
	var adef: Dictionary = btn["def"]
	if str(btn["blocked"]) != "":
		push_message(str(btn["blocked"]), "error")
		if RTSAudio:
			RTSAudio.play_ui("ui_error")
		return
	_repeating_target = false
	match abil_id:
		"worker_basic", "worker_advanced":
			pending_ability = ""
			_worker_build_page = "basic" if abil_id == "worker_basic" else "advanced"
			if RTSAudio:
				RTSAudio.play_ui("ui_select")
			return
		"worker_back":
			_close_worker_build_page()
			return
		"hallucination", "hallucination_back":
			_hallucination_open = abil_id == "hallucination"
			return
		"halt_construction":
			var builders := selected_owned().filter(_worker_is_building)
			_issue_player_command(builders.map(func(unit): return unit.tag), "stop")
			pending_ability = ""
			return
	var target_mode := str(adef.get("target", "none"))
	if target_mode in ["point", "point_or_unit", "resource", "unit"]:
		pending_ability = abil_id
		if RTSAudio:
			RTSAudio.play_ui("ui_select")
		return
	if adef.has("hallucination_unit"):
		var casters := selected_owned().filter(func(unit): return SimEngine.hallucination_block_reason(unit).is_empty())
		if _issue_player_command(casters.map(func(unit): return unit.tag), abil_id).ok:
			_hallucination_open = false
		else:
			push_message("Choose a Warden with room around it.", "warn")
		return
	if abil_id.begins_with("train_") or adef.has("upgrade"):
		_train_on_best(abil_id, 5 if shift and abil_id.begins_with("train_") else 1)
		if RTSAudio:
			RTSAudio.play_ui("ui_select")
		return
	var tags: Array = []
	for u in selected_owned():
		var def: Dictionary = RTSData.get_unit_def(u.unit_type)
		if def.get("abilities", []).has(abil_id) \
			or (abil_id == "end_pulsar_beam" and u.unit_type == "sunseer" and u.get("pulsar_active", false)) \
			or (adef.has("structure_evolution") and SimEngine.structure_evolution_block_reason(u, adef.structure_evolution).is_empty()) \
			or (abil_id == "cancel_carapace_morph" and u.has("carapace_morph_until")) \
			or (abil_id == "surface" and u.get("burrowed", false)) \
			or (abil_id == "stop" and u.get("crawler_uprooted", false)) \
			or (abil_id == "seer_mobile" and u.unit_type == "spore_seer" and u.is_immobile) \
			or (abil_id == "stop" and u.is_structure and u.flight_height > 0.0) \
			or (abil_id == "hold_fire" and not u.is_worker and def.has("weapon")) \
			or (abil_id == "return_cargo" and u.is_worker) \
			or (abil_id == "cancel_construction" and u.unit_type == primary_type()):
			tags.append(u["tag"])
	var result := _issue_player_command(tags, abil_id, Vector2.ZERO, 0, "", shift and abil_id in ["stop", "hold_position"])
	if adef.get("attachment", false) and result.ok and RTSAudio:
		RTSAudio.play_ui("ui_build_place")

func _train_on_best(abil_id: String, count: int, skip_full_queues: bool = false) -> void:
	var producers: Array[Dictionary] = []
	var ability := RTSData.get_ability_def(abil_id)
	var upgrade := str(ability.get("upgrade", ""))
	var unit_type := str(ability.get("unit", ""))
	for u in selected_owned():
		var abilities: Array = SimEngine.research_module_abilities(u) if SimEngine.ladder_rules and u.unit_type == "research_module" \
			else RTSData.get_unit_def(u.unit_type).get("abilities", [])
		if not abilities.has(abil_id):
			continue
		if float(u["build_progress"]) < 1.0 or u.flight_height > 0.0:
			continue
		if not upgrade.is_empty() and not SimEngine.research_producer_block_reason(u, upgrade).is_empty():
			continue
		if not unit_type.is_empty() and not SimEngine.training_block_reason(u, unit_type).is_empty():
			continue
		producers.append(u)
	for i in range(count):
		var best: Dictionary = {}
		for producer in producers:
			if skip_full_queues and producer.production_queue.size() >= SimEngine.PRODUCTION_QUEUE_CAPACITY:
				continue
			if not unit_type.is_empty() and SimEngine.training_uses_brood_slot(producer, unit_type) and producer.brood_slots <= 0:
				continue
			if SimEngine.requires_power(producer.unit_type) and not SimEngine.is_powered(producer.owner, producer.pos):
				continue
			if best.is_empty() or producer.production_queue.size() < best.production_queue.size():
				best = producer
		if best.is_empty() or not _issue_player_command([best.tag], abil_id).ok:
			break

func _cancel_training_repeat() -> void:
	_training_repeat_timer.stop()
	_training_repeat.clear()

func _repeat_training_hotkey() -> void:
	if _training_repeat.is_empty():
		return
	if selected_tags != _training_repeat.selection \
		or (match_menu and (match_menu.panel.visible or match_menu.result_panel.visible)) \
		or (campaign_hud and campaign_hud.blocks_battle_input()):
		_cancel_training_repeat()
		return
	for btn in get_card_buttons():
		if btn.ability_id == _training_repeat.ability_id:
			if btn.blocked.is_empty():
				_train_on_best(btn.ability_id, 1, true)
			_training_repeat_timer.start(TRAIN_REPEAT_INTERVAL)
			return
	_cancel_training_repeat()

func _hotkey_char(ke: InputEventKey) -> String:
	var s := OS.get_keycode_string(ke.keycode)
	return s.to_upper() if s.length() == 1 else ""

func _living_tags(tags: Array, owned_only: bool = false, include_embarked: bool = false) -> Array[int]:
	var out: Array[int] = []
	var seen := {}
	for tag in tags:
		var t := int(tag)
		if seen.has(t):
			continue
		var u: Dictionary = SimEngine.units.get(t, {})
		if u.is_empty():
			if include_embarked and SimEngine.is_embarked(t, local_player):
				out.append(t)
				seen[t] = true
			continue
		if float(u.get("hp", 0.0)) <= 0.0:
			continue
		if owned_only and int(u["owner"]) != local_player:
			if include_embarked and int(u.get("neural_original_owner", 0)) == local_player:
				out.append(t)
				seen[t] = true
			continue
		if not SimEngine.can_see_unit(viewing_player(), u):
			continue
		out.append(t)
		seen[t] = true
	return out

func _inherit_growth_node_groups(node: Dictionary, ability: String, _pos: Vector2) -> void:
	if ability != "growth_node_seeded" or node.owner != local_player or not node.has("growth_node_parent"):
		return
	for members in control_groups.values():
		if node.growth_node_parent in members:
			members.append(node.tag)

func _prune_control_groups() -> void:
	selected_tags = _living_tags(selected_tags)
	for g in control_groups.keys():
		var kept := _living_tags(control_groups[g], true, true)
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
			for t in _living_tags(control_groups[other], true, true):
				if not incoming.has(t):
					kept.append(t)
			if kept.is_empty():
				control_groups.erase(other)
			else:
				control_groups[other] = kept
	if append:
		var existing := _living_tags(control_groups.get(g, []), true, true)
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
	var available := _living_tags(control_groups.get(g, []), true)
	if available.is_empty():
		_last_group_press.clear()
		return
	var now := Time.get_ticks_msec()
	var last: int = int(_last_group_press.get(g, -10000))
	_select_tags(available, add)
	pending_ability = ""
	if not add and now - last < 400 and world_3d:
		var first: Dictionary = SimEngine.units[available[0]]
		_focus_camera(first["pos"])
	_last_group_press.clear()
	if not add:
		_last_group_press[g] = now

func _set_local_player(player: int) -> void:
	if RTSNetwork.match_active and player != RTSNetwork.seat:
		return
	if player == local_player:
		return
	_close_worker_build_page()
	local_player = player
	if RTSAudio:
		RTSAudio.local_player_id = local_player
	selected_tags.clear()
	_selected_blueprint = null
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
	_cancel_training_repeat()
	if ke.alt_pressed and ke.keycode == KEY_G:
		_repeating_target = false
		pending_ability = "ping"
		return
	if ke.alt_pressed and ke.keycode == KEY_H:
		if selected_owned().any(func(unit): return unit.is_worker):
			_repeating_target = false
			pending_ability = "fill_gas"
		return
	if ke.alt_pressed and ke.keycode == KEY_R:
		_show_weapon_ranges = not _show_weapon_ranges
		return
	if ke.alt_pressed and ke.keycode == KEY_Y:
		if _issue_player_command(selected_owned().map(func(unit): return unit.tag), "reset_rally").ok:
			pending_ability = ""
			_repeating_target = false
			push_message("Rally reset.")
		return
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
			if not RTSNetwork.match_active and SimEngine.match_state.get("status") != "finished":
				SimEngine.paused = not SimEngine.paused
			return
		KEY_BACKSPACE:
			if ke.ctrl_pressed or ke.meta_pressed:
				if _issue_player_command(selected_owned().map(func(unit): return unit.tag), "undo_queued_order").ok:
					push_message("Last queued order removed.")
			else:
				_cycle_base()
			return
		KEY_HOME:
			_center_selection()
			return
		KEY_PAGEUP, KEY_PAGEDOWN:
			if world_3d:
				world_3d.zoom_by(-4.0 if ke.keycode == KEY_PAGEUP else 4.0)
			return
		KEY_COMMA:
			_select_idle_production(ke.ctrl_pressed or ke.meta_pressed)
			return
		KEY_F8:
			if match_menu:
				match_menu.toggle()
			return
		KEY_ESCAPE:
			_repeating_target = false
			if show_help:
				show_help = false
			elif not pending_ability.is_empty():
				pending_ability = ""
			elif not _worker_build_page.is_empty() or _hallucination_open:
				_close_worker_build_page()
			elif technology_open:
				technology_open = false
			elif is_instance_valid(_selected_blueprint):
				_cancel_selected_blueprint()
			else:
				var site := primary_unit()
				if site.has("morph_worker") and site.owner == local_player and site.build_progress < 1.0 and observer_player < 0:
					_issue_player_command([site.tag], "cancel_construction")
				elif site.has("brood_morph") and site.owner == local_player and observer_player < 0:
					_issue_player_command([site.tag], SimEngine.brood_morph_cancel_command(site))
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
				_close_worker_build_page()
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
				if RTSAudio:
					RTSAudio.local_player_id = observer_player
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
			if not ke.shift_pressed and not ke.meta_pressed and btn.ability_id.begins_with("train_"):
				_training_repeat = {
					"keycode": ke.keycode,
					"ability_id": btn.ability_id,
					"selection": selected_tags.duplicate(),
				}
				_training_repeat_timer.start(TRAIN_REPEAT_DELAY)
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
		"confirmation": match_menu.confirmation_title() if match_menu else "",
		"online_status": RTSNetwork.state, "online_seat": RTSNetwork.seat,
		"scorecard_visible": match_menu != null and match_menu.result_panel.visible,
		"campaign_presentation": campaign_hud.presentation_state() if campaign_hud and SimEngine.campaign != null else {},
		"setup_map": match_menu.selected_map_id() if match_menu != null else "",
		"setup_map_options": match_menu.map_option_ids() if match_menu != null else [],
		"map_preview": match_menu.map_preview.preview_state() if match_menu != null and match_menu.map_preview else {},
		"setup_unlimited_resources": match_menu != null and match_menu.deposit_rules.selected == 0,
		"observer_player": observer_player,
		"health_bar_mode": health_bar_mode,
		"health_bars_revealed": reveal_health_bars,
		"inspected_deposit": inspected_deposit().get("tag", 0),
		"technology": hud.technology_state() if hud and technology_open and not hud_hidden else {"visible": false},
		"local_player": local_player,
		"selected": tags,
		"primary_type": primary_type(),
		"pending_ability": pending_ability,
		"worker_build_page": _worker_build_page,
		"build_blueprints": world_3d.build_blueprints.keys().map(func(point):
			return {"type": world_3d.build_blueprints[point].get_meta("structure_type"), "pos": [point.x, point.y]}) if world_3d else [],
		"messages": msgs,
		"camera_focus": [f.x, f.y],
		"commander_camera": RTSNetwork.commander_cameras.map(func(point): return [point.x, point.y] if point.is_finite() else []),
		"camera_height": world_3d.cam_height if world_3d else 0.0,
		"camera_pan_speed": match_menu.pan_speed if match_menu else 46.0,
		"living_ground_visible": world_3d.living_ground_visible_count if world_3d else 0,
		"speed_tooltip": hud.speed_tooltip() if hud else "",
		"order_lines_visible": _order_lines_visible(),
		"weapon_ranges": _selected_weapon_ranges(),
		"mobile_detection_ranges": _selected_mobile_detection_ranges(),
		"weapon_timing": selected_weapon_timing(),
		"power_overlay": _power_overlay(),
		"recall_markers": SimEngine.defensive_recall_markers_for(viewing_player()),
		"area_warnings": _area_attack_warnings(),
		"phase_barriers": SimEngine.visible_phase_barriers(viewing_player()),
		"lattice_bursts": SimEngine.visible_lattice_bursts(viewing_player()),
		"pings": click_markers.filter(func(marker): return marker.kind == "ping").map(func(marker): return [marker.pos.x, marker.pos.y]),
		"path_feedback": _selected_path_feedback().map(func(feedback): return {
			"tag": feedback.tag, "status": feedback.status, "endpoint": [feedback.endpoint.x, feedback.endpoint.y]
		}),
		"worker_rally_previews": _worker_rally_previews.values().map(func(deposit): return deposit.tag),
		"recent_income": SimEngine.recent_income(local_player),
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
		_input(event)
		_unhandled_input(event)
	else:
		get_viewport().push_input(event)

# ---------------------------------------------------------------------------
# In-world 2D overlays (unit bars, orders, markers, build ghost, selection box)
# ---------------------------------------------------------------------------
func _draw() -> void:
	if world_3d == null or hud_hidden or (campaign_hud and campaign_hud.cinematic()):
		return
	var font := ThemeDB.fallback_font
	for warning in _area_attack_warnings():
		_draw_area_attack_warning(warning)
	_draw_miasma_zones(font)
	_draw_lattice_bursts(font)
	_draw_canticle_storms()
	_draw_microbial_shrouds()
	_draw_wyrm_clouds()
	_draw_time_warps()
	_draw_meridian_ground_targets()
	_draw_guardian_shields()
	_draw_caustic_strikes()
	_draw_ridge_charges()
	_draw_power_overlay(font)
	_draw_rally_and_orders()
	_draw_building_memory(font)
	_draw_recon_sweeps()
	_draw_radar_contacts()
	_draw_recall_markers(font)
	if pending_ability == "energy_recharge":
		for heartstone in SimEngine.units.values():
			if heartstone.owner == local_player and heartstone.unit_type == "heartstone" and heartstone.build_progress >= 1.0:
				_draw_range_ring(heartstone.pos, SimEngine.energy_recharge_radius(), Color(0.42, 0.92, 0.70, 0.55))
	_draw_campaign_markers(font)
	_draw_mutator_zones(font)
	for station in SimEngine.watch_stations:
		if SimEngine.can_see_position(viewing_player(), station.pos):
			var owner := int(station.owner)
			var color := Color("#c3d2da") if owner == 0 else RTSData.get_player_color(owner)
			_draw_range_ring(station.pos, SimEngine.WATCH_STATION_CAPTURE, color)
			var label_pos := world_to_screen(station.pos, 3.8) - Vector2(70, 0)
			draw_string(font, label_pos + Vector2.ONE, "Watch station", HORIZONTAL_ALIGNMENT_CENTER, 140, 16, Color.BLACK)
			draw_string(font, label_pos, "Watch station", HORIZONTAL_ALIGNMENT_CENTER, 140, 16, color.lightened(0.28))
	var deposit := inspected_deposit()
	if not deposit.is_empty():
		_draw_range_ring(deposit.pos, deposit.radius + 0.2, Color("#fbbf24"))
	if is_instance_valid(_selected_blueprint) and _selected_blueprint.visible:
		var order: Dictionary = _selected_blueprint.get_meta("build_order")
		var definition := RTSData.get_unit_def(order.structure_type)
		var half := Vector2.ONE * float(definition.radius)
		_draw_build_tile(Rect2(order.target_pos - half, half * 2.0), Color("#58ffac"), 0.0, 3.0)
	for u in SimEngine.units.values():
		if u.unit_type == "phase_barrier":
			if u.get("cast_owner") == viewing_player() or SimEngine.can_see_position(viewing_player(), u.pos):
				_draw_phase_barrier(u, font)
			continue
		if SimEngine.can_see_unit(viewing_player(), u):
			if u.unit_type == "rift_nova":
				_draw_range_ring(u.pos, SimEngine.rift_nova_radius(), Color("#f9aeff"), 2.0)
			_draw_unit_bars(u, font)
			if u.get("support_target_tag", 0) > 0:
				var recipient: Dictionary = SimEngine.units.get(u.support_target_tag, {})
				if not recipient.is_empty() and SimEngine.can_see_unit(viewing_player(), recipient):
					var beam := Color("#8fdcff") if u.is_structure else Color("#a6f2ba")
					draw_line(_unit_screen(u, unit_height(u) * 0.65), _unit_screen(recipient, unit_height(recipient) * 0.55), beam, 2.5, true)
			if u.get("cloaked", false):
				_ellipse(world_to_screen(u.pos, 0.3), 12.0, Color(0.58, 0.83, 1.0, 0.7), 1.5)
			if u.has("carapace_morph_until") or u.has("sporeburst_morph_until"):
				_draw_range_ring(u.pos, u.radius + 0.65, Color("#dcb660"), 2.0)
			if u.owner == local_player and _saturation.has(u.tag):
				var site: Dictionary = _saturation[u.tag]
				if site.ideal > 0:
					_draw_saturation(u, site, font)
	_draw_build_ghost()
	if pending_ability == "phase_barrier":
		var caster := primary_unit()
		if not caster.is_empty():
			var point := screen_to_world(hover_pos())
			var color := Color("#78dfff")
			_draw_range_ring(caster.pos, SimEngine.phase_barrier_cast_range(), Color(color, 0.38))
			_draw_range_ring(point, float(RTSData.get_unit_def("phase_barrier").radius), Color(color, 0.78), 2.0)
	_draw_click_markers()
	_draw_path_feedback()
	if show_names:
		_draw_name_labels(font)
	if is_box_selecting:
		var sel_rect := Rect2(
			Vector2(minf(box_start_screen.x, box_end_screen.x), minf(box_start_screen.y, box_end_screen.y)),
			Vector2(absf(box_end_screen.x - box_start_screen.x), absf(box_end_screen.y - box_start_screen.y))
		)
		draw_rect(sel_rect, Color(0.45, 1.0, 0.55, 0.08))
		draw_rect(sel_rect, Color(0.55, 1.0, 0.65, 0.9), false, 1.5)

func _draw_mutator_zones(font: Font) -> void:
	if SimEngine.campaign == null or SimEngine.campaign.mutators == null or SimEngine.campaign.status != "playing":
		return
	for zone in SimEngine.campaign.mutators.zones:
		if not SimEngine.campaign.mutators.can_see_zone(SimEngine, local_player, zone):
			continue
		var position := world_to_screen(zone.pos, 0.7)
		if not Rect2(-150, -150, 2220, HUD_TOP + 300).has_point(position):
			continue
		var color := Color("#ff5d61")
		var caption := "Orbital strike"
		match zone.kind:
			"time_warp":
				color = Color("#bda0ff")
				caption = "Time Warp"
			"scorched_earth":
				color = Color("#ff9c4e")
				caption = ""
			"self_destruction":
				caption = ""
		_draw_range_ring(zone.pos, zone.radius, color, 3.0)
		if not caption.is_empty():
			var width := font.get_string_size(caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x
			var label_at := position + Vector2(-width * 0.5, -9)
			draw_string(font, label_at + Vector2.ONE, caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color.BLACK)
			draw_string(font, label_at, caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, color)

func _draw_campaign_markers(font: Font) -> void:
	if not campaign_hud or campaign_hud.state.get("status") != "playing":
		return
	for marker in campaign_hud.state.markers:
		var point := Vector2(marker.point[0], marker.point[1])
		var color: Color = CampaignHud.GOLD if marker.bonus else CampaignHud.CYAN
		var center := world_to_screen(point, 2.5)
		if not Rect2(0, 54, 1920, HUD_TOP - 58).has_point(center):
			continue
		if marker.kind not in ["carrier", "hero"]:
			_draw_range_ring(point, 2.6 if marker.bonus else 4.5, color, 2.0)
		var label: String = marker.label
		if marker.has("cover_seconds"):
			var seconds: int = marker.cover_seconds
			label += "  %d:%02d" % [seconds / 60, seconds % 60] if seconds > 0 else "  ·  Under fire"
		var label_at := center - Vector2(118, 16)
		draw_string(font, label_at + Vector2.ONE, label, HORIZONTAL_ALIGNMENT_CENTER, 236, 18, Color.BLACK)
		draw_string(font, label_at, label, HORIZONTAL_ALIGNMENT_CENTER, 236, 18, color)

func _draw_recon_sweeps() -> void:
	if SimEngine.vision == null:
		return
	for sweep in SimEngine.vision.sweeps_for(viewing_player()):
		_draw_range_ring(sweep.pos, sweep.radius, RTSData.get_player_color(sweep.owner) if SimEngine.ladder_rules else Color("#6fb6ff"))

func _draw_radar_contacts() -> void:
	for beacon in selected_owned():
		if beacon.unit_type == "radar_beacon" and beacon.build_progress >= 1.0:
			_draw_range_ring(beacon.pos, LadderRules.RADAR_RADIUS, Color("#9cb9d7"))
	for position in SimEngine.radar_contacts(viewing_player()):
		var marker := world_to_screen(position, 1.4)
		draw_line(marker + Vector2(0.0, -11.0), marker, Color("#ff6768"), 2.4, true)
		draw_circle(marker + Vector2(0.0, 4.0), 1.8, Color("#ff6768"))

func _draw_phase_barrier(barrier: Dictionary, font: Font) -> void:
	var color := Color("#78dfff")
	_draw_range_ring(barrier.pos, barrier.radius, color, 2.2)
	var remaining := float(maxi(0, int(barrier.expires_tick) - SimEngine.tick)) / SimEngine.TICK_RATE
	var label := "%.1fs" % remaining
	var position := world_to_screen(barrier.pos, 2.45) - Vector2(35.0, 0.0)
	draw_string(font, position + Vector2.ONE, label, HORIZONTAL_ALIGNMENT_CENTER, 70.0, 16, Color.BLACK)
	draw_string(font, position, label, HORIZONTAL_ALIGNMENT_CENTER, 70.0, 16, color)

func _draw_miasma_zones(font: Font) -> void:
	for zone in SimEngine.visible_miasma(viewing_player()):
		var position := Vector2(zone.x, zone.y)
		var color := Color("#e8c27a") if zone.warning else Color("#bcf264")
		_draw_range_ring(position, zone.radius, color, 3.0)
		_draw_range_ring(position, zone.radius * 0.9, Color(color, 0.45), 1.3)
		var anchor := world_to_screen(position, 0.5) - Vector2(72, 4)
		var label := "%s %.1fs" % ["Miasma incoming" if zone.warning else "Corrosive Miasma", zone.ticks * SimEngine.TICK_DT]
		draw_string(font, anchor + Vector2.ONE, label, HORIZONTAL_ALIGNMENT_CENTER, 144, 15, Color.BLACK)
		draw_string(font, anchor, label, HORIZONTAL_ALIGNMENT_CENTER, 144, 15, color)
	if pending_ability == "corrosive_miasma" and hover_pos().y < HUD_TOP:
		var point := screen_to_world(hover_pos())
		_draw_range_ring(point, SimEngine.MIASMA_RADIUS, Color(0.78, 0.91, 0.43, 0.65))

func _draw_recall_markers(font: Font) -> void:
	var color := Color("#71f4b5")
	if pending_ability == "defensive_recall" and hover_pos().y < HUD_TOP:
		_draw_range_ring(screen_to_world(hover_pos()), SimEngine.defensive_recall_radius(), Color(color, 0.65))
	if pending_ability == "flagship_recall" and hover_pos().y < HUD_TOP:
		_draw_range_ring(screen_to_world(hover_pos()), LadderRules.FLAGSHIP_RECALL_RADIUS, Color(color, 0.65))
	for marker in SimEngine.defensive_recall_markers_for(viewing_player()):
		var position := Vector2(marker.x, marker.y)
		_draw_range_ring(position, marker.radius, color, 2.5)
		var center := world_to_screen(position, 2.8) - Vector2(60, 0)
		var label := "Recall %.1fs" % (marker.ticks * SimEngine.TICK_DT)
		draw_rect(Rect2(center - Vector2(0, 15), Vector2(120, 21)), Color(0.04, 0.08, 0.07, 0.9))
		draw_string(font, center, label, HORIZONTAL_ALIGNMENT_CENTER, 120, 16, color)

func _draw_lattice_bursts(font: Font) -> void:
	for zone in SimEngine.visible_lattice_bursts(viewing_player()):
		var position := Vector2(zone.x, zone.y)
		var color := Color("#ffd095") if zone.warning else Color("#c59aff")
		_draw_range_ring(position, zone.radius, color, 3.0)
		_draw_range_ring(position, zone.radius * 0.87, Color(color, 0.48), 1.4)
		var anchor := world_to_screen(position, 1.4) - Vector2(98, 4)
		var label := "%s %.1fs" % ["Lattice Burst incoming" if zone.warning else "Lattice Burst", zone.ticks * SimEngine.TICK_DT]
		draw_string_outline(font, anchor, label, HORIZONTAL_ALIGNMENT_CENTER, 196.0, 15, 4, Color.BLACK)
		draw_string(font, anchor, label, HORIZONTAL_ALIGNMENT_CENTER, 196.0, 15, color)
	if pending_ability == "lattice_burst" and hover_pos().y < HUD_TOP:
		var color := Color("#ffd095")
		for caster in selected_owned():
			if SimEngine.warden_cast_block_reason(caster, SimEngine.LATTICE_BURST_COST).is_empty():
				_draw_range_ring(caster.pos, SimEngine.LATTICE_BURST_RANGE, Color(color, 0.38))
		_draw_range_ring(screen_to_world(hover_pos()), SimEngine.LATTICE_BURST_RADIUS, Color(color, 0.78), 2.0)

func _draw_caustic_strikes() -> void:
	var tint := Color("#f3b04f")
	var radius := SimEngine.caustic_barrage_radius()
	for strike in SimEngine.visible_caustic_strikes(viewing_player()):
		_draw_range_ring(strike.pos, radius, tint, 2.4)
	if pending_ability == "caustic_barrage" and hover_pos().y < HUD_TOP:
		_draw_range_ring(screen_to_world(hover_pos()), radius, Color(tint, 0.75), 2.0)

func _draw_guardian_shields() -> void:
	for tag in SimEngine.guardian_shields:
		var warden: Dictionary = SimEngine.units.get(tag, {})
		if not warden.is_empty() and SimEngine.guardian_shield_ticks(warden) > 0 and SimEngine.can_see_unit(viewing_player(), warden):
			_draw_range_ring(warden.pos, SimEngine.guardian_shield_radius(), Color("#91dfff"), 2.5)

func _draw_canticle_storms() -> void:
	var radius := SimEngine.canticle_storm_radius()
	var color := Color("#9fc6ff")
	for zone in SimEngine.visible_canticle_storms(viewing_player()):
		_draw_range_ring(zone.pos, radius, color, 2.5)
		_draw_range_ring(zone.pos, radius * 0.90, Color(color, 0.48), 1.5)
	if pending_ability == "canticle_storm" and hover_pos().y < HUD_TOP:
		_draw_range_ring(screen_to_world(hover_pos()), radius, Color(color, 0.75), 2.0)

func _draw_microbial_shrouds() -> void:
	var color := Color("#a4da74")
	for zone in SimEngine.visible_microbial_shrouds(viewing_player()):
		_draw_range_ring(zone.pos, LadderRules.MICROBIAL_SHROUD_RADIUS, color, 2.5)
		_draw_range_ring(zone.pos, LadderRules.MICROBIAL_SHROUD_RADIUS * 0.9, Color(color, 0.48), 1.5)
	if pending_ability in ["fungal_grasp", "microbial_shroud"] and hover_pos().y < HUD_TOP:
		var radius := LadderRules.FUNGAL_GRASP_RADIUS if pending_ability == "fungal_grasp" else LadderRules.MICROBIAL_SHROUD_RADIUS
		_draw_range_ring(screen_to_world(hover_pos()), radius, Color(color, 0.75), 2.0)

func _draw_wyrm_clouds() -> void:
	for cloud in SimEngine.blinding_clouds:
		if SimEngine.can_see_position(viewing_player(), cloud.pos):
			_draw_range_ring(cloud.pos, LadderRules.BLINDING_CLOUD_RADIUS, Color("#d0bd8d"), 2.5)
	for cloud in SimEngine.parasitic_clouds:
		var anchor: Dictionary = SimEngine.units.get(cloud.target, {})
		if SimEngine.can_see_position(viewing_player(), cloud.pos) and (anchor.is_empty() or SimEngine.can_see_unit(viewing_player(), anchor)):
			_draw_range_ring(cloud.pos, LadderRules.PARASITIC_CLOUD_RADIUS, Color("#c3e473"), 2.5)
	if pending_ability == "blinding_cloud" and hover_pos().y < HUD_TOP:
		_draw_range_ring(screen_to_world(hover_pos()), LadderRules.BLINDING_CLOUD_RADIUS, Color("#d0bd8d"), 2.0)

func _draw_time_warps() -> void:
	var color := Color("#d5beff")
	for zone in SimEngine.time_warps:
		if SimEngine.can_see_position(viewing_player(), zone.pos):
			var alpha := 0.8 if SimEngine.tick >= int(zone.activates) else 0.4
			_draw_range_ring(zone.pos, LadderRules.TIME_WARP_RADIUS, Color(color, alpha), 2.5)
	if pending_ability == "time_warp" and hover_pos().y < HUD_TOP:
		_draw_range_ring(screen_to_world(hover_pos()), LadderRules.TIME_WARP_RADIUS, Color(color, 0.65))

func _draw_meridian_ground_targets() -> void:
	var player := viewing_player()
	var zone_color := Color("#ffc37b")
	for unit in SimEngine.units.values():
		if unit.has("agent_strike") and SimEngine.can_see_position(player, unit.agent_strike.pos):
			var marker: Vector2 = unit.agent_strike.pos
			_draw_range_ring(marker, 0.95, Color("#fe4949"), 2.5)
		if unit.has("sky_zone") and SimEngine.can_see_position(player, unit.sky_zone.pos) and SimEngine.can_see_unit(player, unit):
			_draw_range_ring(unit.sky_zone.pos, unit.sky_zone.radius, Color(zone_color, 0.80), 2.2)
	if pending_ability == "agent_strike" and hover_pos().y < HUD_TOP:
		_draw_range_ring(screen_to_world(hover_pos()), LadderRules.AGENT_STRIKE_RADIUS, Color("#fe4949"), 2.0)
	if pending_ability == "sky_defender_mode" and hover_pos().y < HUD_TOP:
		_draw_range_ring(screen_to_world(hover_pos()), LadderRules.SKY_ZONE_RADIUS, Color(zone_color, 0.80), 2.2)

func _draw_ridge_charges() -> void:
	var color := Color("#ffb55e")
	for charge in SimEngine.visible_ridge_charges(viewing_player()):
		_draw_range_ring(charge.pos, SimEngine.RIDGE_CHARGE_RADIUS, color, 2.0)
	if pending_ability == "ridge_charge" and hover_pos().y < HUD_TOP:
		for scout in selected_owned():
			if scout.unit_type == "ridge_scout" and SimEngine.ridge_charge_remaining(scout) == 0.0:
				_draw_range_ring(scout.pos, SimEngine.RIDGE_CHARGE_RANGE, Color(color, 0.38))
		_draw_range_ring(screen_to_world(hover_pos()), SimEngine.RIDGE_CHARGE_RADIUS, Color(color, 0.78), 2.0)

func _draw_range_ring(position: Vector2, radius: float, color: Color, width: float = 1.5) -> void:
	var outline := PackedVector2Array()
	for i in range(33):
		var offset := Vector2.from_angle(TAU * i / 32.0) * radius
		outline.append(world_to_screen(position + offset, 0.2))
	draw_polyline(outline, color, width, true)

func _power_overlay() -> Dictionary:
	if observer_player >= 0 or hud_hidden:
		return {"visible": false}
	var show_overlay := (pending_ability.begins_with("build_") and SimEngine.requires_power(pending_ability.trim_prefix("build_"))) \
		or RTSData.get_ability_def(pending_ability).has("transit_unit")
	var selected_sources: Array[int] = []
	for unit in selected_owned():
		var radius := SimEngine.power_source_radius(unit)
		if unit.unit_type in ["resonator", "waystone", "transit_waystone"] or radius > 0.0:
			show_overlay = true
			if radius > 0.0:
				selected_sources.append(unit.tag)
	if not show_overlay:
		return {"visible": false}

	var sources: Array[Dictionary] = []
	var fields: Array[Dictionary] = []
	var waystones: Array[Dictionary] = []
	for unit in SimEngine.units.values():
		if unit.owner != local_player or unit.build_progress < 1.0:
			continue
		var radius := SimEngine.power_source_radius(unit)
		if radius > 0.0:
			sources.append(unit)
			fields.append({"tag": unit.tag, "selected": selected_sources.has(unit.tag), "radius": radius,
				"carrier": unit.unit_type == "lumen_carrier", "temporary": unit.unit_type == "lumen_carrier" and not SimEngine.ladder_rules})
		elif unit.unit_type in ["waystone", "transit_waystone"]:
			waystones.append(unit)
	var coverage: Array[Dictionary] = []
	for waystone in waystones:
		var covering: Array[int] = []
		for source in sources:
			if SimEngine.power_source_covers(source, waystone.pos):
				covering.append(source.tag)
		var state := "unpowered"
		if covering.size() > 1:
			state = "redundant"
		elif covering.size() == 1:
			state = "at_risk" if selected_sources.has(covering[0]) else "single"
		coverage.append({"tag": waystone.tag, "sources": covering, "state": state})
	return {"visible": true, "fields": fields, "waystones": coverage}

func _draw_power_overlay(font: Font) -> void:
	var overlay := _power_overlay()
	if not overlay.visible:
		return
	for field in overlay.fields:
		var source: Dictionary = SimEngine.units[field.tag]
		var color := Color("#9eeaff") if field.selected else Color(0.46, 0.60, 1.0, 0.75)
		if field.carrier:
			color = Color("#e2c2ff") if field.selected else Color(0.70, 0.52, 1.0, 0.80)
		_draw_range_ring(source.pos, field.radius, color, 2.5 if field.selected else 1.5)
	for entry in overlay.waystones:
		var unit: Dictionary = SimEngine.units[entry.tag]
		var head := _unit_screen(unit, unit_height(unit) + 0.6) - Vector2(0, 23)
		if not Rect2(0, 28, 1920, HUD_TOP - 42).has_point(head):
			continue
		var color := Color("#a5c4ff")
		var label := "1 source"
		match entry.state:
			"at_risk":
				color = Color("#fbbf24")
				label = "Loses power"
				var source: Dictionary = SimEngine.units[entry.sources[0]]
				draw_dashed_line(world_to_screen(source.pos, 0.25), world_to_screen(unit.pos, 0.25), color, 1.5, 7.0)
			"redundant":
				color = Color("#73dca1")
				label = "%d sources" % entry.sources.size()
			"unpowered":
				color = Color("#ff8e82")
				label = "Unpowered"
		var width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x + 14.0
		var badge := Rect2(head - Vector2(width * 0.5, 10), Vector2(width, 20))
		draw_rect(badge, Color(0.04, 0.06, 0.09, 0.92))
		draw_string(font, badge.position + Vector2(7, 15), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, color)
	if overlay.fields.any(func(field): return field.selected):
		var legend := "Amber Waystones lose power when the selected field ends"
		draw_string(font, Vector2(611, 70), legend, HORIZONTAL_ALIGNMENT_CENTER, 700, 16, Color.BLACK)
		draw_string(font, Vector2(610, 69), legend, HORIZONTAL_ALIGNMENT_CENTER, 700, 16, Color("#fbbf24"))

func selected_weapon_timing() -> Dictionary:
	if selected_tags.size() != 1:
		return {}
	var unit: Dictionary = SimEngine.units.get(selected_tags[0], {})
	if unit.is_empty() or unit.owner != local_player or unit.build_progress < 1.0:
		return {}
	var weapon: Dictionary = RTSData.get_unit_def(unit.unit_type).get("weapon", {})
	if weapon.is_empty():
		return {}
	if unit.attack_state == "windup":
		var remaining := float(unit.attack_state_timer)
		return {"state": "Wind-up", "remaining": remaining, "progress": 1.0 - remaining / unit.attack_windup_duration}
	if unit.weapon_cooldown > 0.0:
		var recovery := float(unit.weapon_cooldown)
		# Surge can wear off partway through the remaining cooldown.
		var saved_time := minf(float(unit.surge_timer), recovery / 1.5) * 0.5
		return {"state": "Cooldown", "remaining": recovery - saved_time, "progress": 1.0 - recovery / float(weapon.period)}
	return {"state": "Ready", "remaining": 0.0, "progress": 1.0}

func _area_attack_warnings() -> Array:
	var by_impact := {}
	for attacker in SimEngine.units.values():
		var warning := _area_attack_warning(attacker)
		if warning.is_empty():
			continue
		var key := Vector3(warning.position[0], warning.position[1], warning.radius)
		if not by_impact.has(key) or warning.remaining < by_impact[key].remaining:
			by_impact[key] = warning
	return by_impact.values()

func _area_attack_warning(attacker: Dictionary) -> Dictionary:
	if attacker.attack_state != "windup":
		return {}
	var weapon: Dictionary = RTSData.get_unit_def(attacker.unit_type).get("weapon", {})
	var radius := float(weapon.get("splash_radius", 0.0))
	if radius <= 0.0 or not SimEngine.can_see_unit(viewing_player(), attacker):
		return {}
	var target: Dictionary = SimEngine.units.get(attacker.attack_target_tag, {})
	if target.is_empty() or not SimEngine.can_see_unit(viewing_player(), target) or not SimEngine.can_see_unit(attacker.owner, target):
		return {}
	return {
		"position": [target.pos.x, target.pos.y],
		"radius": radius,
		"inner_radius": radius * SimEngine.SPLASH_INNER_RADIUS_RATIO,
		"remaining": float(attacker.attack_state_timer),
		"fraction": float(attacker.attack_state_timer) / attacker.attack_windup_duration
	}

func _draw_area_attack_warning(warning: Dictionary) -> void:
	var position := Vector2(warning.position[0], warning.position[1])
	var fraction := clampf(warning.fraction, 0.0, 1.0)
	var countdown := maxi(1, ceili(SPLASH_RING_SEGMENTS * fraction))
	_draw_splash_ring(position, warning.radius, Color("#ea624b"), 2.0, countdown)
	_draw_splash_ring(position, warning.inner_radius, Color("#ffb276"), 1.5)

func _draw_splash_ring(position: Vector2, radius: float, color: Color, width: float, countdown: int = 0) -> void:
	var camera: Camera3D = world_3d.camera_3d
	var outline := PackedVector2Array()
	var breaks := PackedInt32Array()
	var center_elevation := SimEngine.get_elevation_at(position)
	var previous_elevation := center_elevation
	var flat := true
	for i in range(SPLASH_RING_SEGMENTS + 1):
		var point := position + Vector2.from_angle(TAU * i / SPLASH_RING_SEGMENTS - PI / 2.0) * radius
		var elevation := SimEngine.get_elevation_at(point)
		flat = flat and is_equal_approx(elevation, center_elevation)
		if i > 0 and absf(elevation - previous_elevation) > 1.75:
			breaks.append(i)
		previous_elevation = elevation
		outline.append(camera.unproject_position(Vector3(point.x, elevation + 0.25, point.y)))
	if flat and countdown > 0:
		draw_colored_polygon(outline.slice(0, SPLASH_RING_SEGMENTS), Color(1.0, 0.29, 0.15, 0.15))
	# A cliff jump splits the projected ring into separate arcs.
	breaks.append(outline.size())
	var start := 0
	for end in breaks:
		if end - start > 1:
			draw_polyline(outline.slice(start, end), color, width, true)
		var arc_end := mini(end, countdown + 1)
		if arc_end - start > 1:
			draw_polyline(outline.slice(start, arc_end), Color("#ffb276"), 3.0, true)
		start = end

func _draw_saturation(unit: Dictionary, site: Dictionary, font: Font) -> void:
	var label := "%d/%d" % [site.assigned, site.ideal]
	var center := world_to_screen(unit.pos, unit_height(unit) + 1.8)
	var color := Color("#52e08a") if site.type == "aether" else Color("#5eead4")
	if site.assigned > site.ideal:
		color = Color("#fbbf24")
	_draw_count_badge(center, label, font, color)

func _draw_count_badge(center: Vector2, label: String, font: Font, color: Color) -> void:
	var width := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x + 20.0
	var badge := Rect2(center - Vector2(width * 0.5, 11.0), Vector2(width, 22.0))
	draw_rect(badge, Color(0.03, 0.06, 0.09, 0.92))
	draw_string(font, badge.position + Vector2(0.0, 16.0), label, HORIZONTAL_ALIGNMENT_CENTER, width, 16, color)

func viewing_player() -> int:
	return observer_player if observer_player >= 0 else local_player

func _enter_observer() -> void:
	if SimEngine.match_state.get("status") != "finished" or not match_menu:
		return
	match_menu.result_panel.hide()
	pending_ability = ""
	_selected_blueprint = null
	observer_player = 0

func _cancel_selected_blueprint() -> void:
	var worker: Dictionary = SimEngine.units.get(_selected_blueprint.get_meta("worker_tag"), {})
	var order: Dictionary = _selected_blueprint.get_meta("build_order")
	_selected_blueprint = null
	if observer_player >= 0 or worker.is_empty() or worker.owner != local_player or order.structure_tag != 0:
		return
	if worker.orders.any(func(candidate): return is_same(candidate, order)):
		_issue_player_command([worker.tag], "cancel_queued_build", order.target_pos, 0, order.structure_type)

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
		var sp := _unit_screen(u, -0.2)
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
		var sp := world_to_screen(m["pos"], m.height)
		var col := Color("#4ade80")
		match str(m["kind"]):
			"ping", "boost": col = Color("#b093ff")
			"attack": col = Color("#f87171")
			"gather": col = Color("#5eead4")
			"patrol": col = Color("#b9a3ef")
			"rally": col = Color("#fbbf24")
		col.a = 1.0 - t
		_ellipse(sp, lerpf(26.0, 8.0, t), col, 2.5)

func _draw_path_feedback() -> void:
	var marked_endpoints := {}
	for feedback in _selected_path_feedback():
		var unit: Dictionary = SimEngine.units[feedback.tag]
		var color := _path_feedback_color(feedback.status)
		color.a = feedback.alpha
		var shadow := Color(0.07, 0.08, 0.10, feedback.alpha * 0.9)
		var badge := _unit_screen(unit, unit_height(unit) + 0.6) - Vector2(0, 23)
		draw_circle(badge, 8.0, shadow)
		draw_line(badge + Vector2(0, -4), badge + Vector2(0, 0), color, 2.0, true)
		draw_circle(badge + Vector2(0, 3), 1.1, color)
		if marked_endpoints.has(feedback.endpoint):
			continue
		marked_endpoints[feedback.endpoint] = true
		var endpoint := world_to_screen(feedback.endpoint, 0.2)
		_ellipse(endpoint, 12.0, shadow, 4.0)
		_ellipse(endpoint, 12.0, color, 2.0)
		if feedback.status == "waiting":
			for x in [-3, 3]:
				draw_line(endpoint + Vector2(x, -4), endpoint + Vector2(x, 4), color, 2.0, true)
		else:
			draw_circle(endpoint, 2.0, color)

func _path_feedback_color(status: String) -> Color:
	return Color("#fbbf24") if status == "adjusted" else Color("#ff9357")

func _order_lines_visible() -> bool:
	return not match_menu or match_menu.order_lines == MatchMenu.OrderLines.ALWAYS or (match_menu.order_lines == MatchMenu.OrderLines.SHIFT and _shift_held)

func _selected_weapon_ranges() -> Array:
	var ranges := []
	if _show_weapon_ranges:
		for unit in selected_owned():
			var weapon: Dictionary = RTSData.get_unit_def(unit.unit_type).get("weapon", {})
			if not weapon.is_empty() and unit.build_progress >= 1.0:
				ranges.append({"tag": unit.tag, "maximum": SimEngine.weapon_range_against(unit), "minimum": weapon.get("min_range", 0.0)})
	return ranges

func _selected_mobile_detection_ranges() -> Array[Dictionary]:
	var ranges: Array[Dictionary] = []
	for unit in selected_owned():
		if not unit.is_structure and unit.hp > 0.0 and unit.build_progress >= 1.0 and unit.detection_radius > 0.0:
			ranges.append({"tag": unit.tag, "radius": unit.detection_radius})
	return ranges

func _draw_rally_and_orders() -> void:
	for detection in _selected_mobile_detection_ranges():
		_draw_range_ring(SimEngine.units[detection.tag].pos, detection.radius, Color("#77f1ed"), 2.0)
	for weapon in _selected_weapon_ranges():
		var unit: Dictionary = SimEngine.units[weapon.tag]
		_draw_range_ring(unit.pos, unit.radius + weapon.maximum, Color("#b093ff"))
		if weapon.minimum > 0.0:
			_draw_range_ring(unit.pos, unit.radius + weapon.minimum, Color("#f0645a"))
	var show_orders := _order_lines_visible()
	for t in selected_tags:
		var u: Dictionary = SimEngine.units.get(t, {})
		if u.is_empty() or u["owner"] != local_player:
			continue
		var sp := _unit_screen(u, 0.2)
		if u.unit_type == "tunnel_mouth" and u.build_progress >= 1.0:
			_draw_range_ring(u.pos, SimEngine.TRANSPORT_PICKUP_RADIUS, Color("#a3d270"))
			var exit := SimEngine.linked_tunnel(u)
			if not exit.is_empty():
				draw_dashed_line(sp, _unit_screen(exit, 0.2), Color(0.55, 0.73, 0.4, 0.65), 2.0, 10.0, true)
		if u.build_progress >= 1.0 and u.has("support"):
			_draw_range_ring(u.pos, float(u.support.range) + float(u.radius), Color("#9ae8d1"))
		if u.is_structure and u.flight_height <= 0.0:
			if u.build_progress >= 1.0 and u.detection_radius > 0.0:
				_draw_range_ring(u.pos, u.detection_radius, Color(0.35, 0.87, 1.0, 0.7))
			if u.build_progress >= 1.0 and RTSData.get_unit_def(u.unit_type).has("trains"):
				var route: Array = u.rally_route
				if route.is_empty():
					route = [{"kind": "move", "pos": SimEngine.default_rally_position(u)}]
				_draw_rally_route(route, sp, Color("#fbbf24"))
				if u.unit_type == "waystone" and not u.production_queue.is_empty():
					var deployment: Vector2 = u.production_queue[0].get("deployment_pos", Vector2.INF)
					if deployment.is_finite():
						_draw_range_ring(deployment, 1.25, Color("#b093ff"), 2.0)
				if u.unit_type == "brood_nest":
					_draw_rally_route(u.worker_rally_route, sp, Color("#5eead4"))
				var preview: Dictionary = _worker_rally_previews.get(u.tag, {})
				if not preview.is_empty():
					_draw_rally_route([{"kind": "harvest", "pos": preview.pos, "target_tag": preview.tag}], sp, Color("#5eead4"))
			continue
		if not show_orders:
			continue
		var prev := sp
		var feedback: Dictionary = _path_feedback.get(t, {})
		for ord in u["orders"]:
			var tp := Vector2.ZERO
			var target: Dictionary = SimEngine.units.get(ord.get("target_tag", 0), {})
			if not target.is_empty() and target.flight_height > 0.0 and SimEngine.can_see_unit(local_player, target):
				tp = _unit_screen(target, 0.4)
			elif ord.has("target_pos"):
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
			if not feedback.is_empty() and is_same(ord, feedback.order) and ord.get("target_pos") == feedback.requested:
				col = _path_feedback_color(feedback.status)
				draw_dashed_line(prev, tp, col, 1.8, 7.0)
			else:
				draw_line(prev, tp, col, 1.4)
			draw_circle(tp, 3.0, col)
			prev = tp

func _draw_rally_route(route: Array, start: Vector2, base_color: Color) -> void:
	var last := start
	for waypoint in route:
		var crystal_height: float = world_3d.crystal_center_height(waypoint.target_tag) if waypoint.kind == "harvest" else 0.0
		var end := world_to_screen(SimEngine.rally_waypoint_position(waypoint), maxf(0.2, crystal_height))
		var color := base_color
		if waypoint.kind == "harvest":
			color = Color("#5eead4")
		elif waypoint.kind == "follow":
			color = Color("#9eb5ff")
		draw_dashed_line(last, end, color, 1.5, 6.0)
		if crystal_height > 0.0:
			draw_circle(end, 3.0, color)
		draw_line(end, end + Vector2(0, -26), color, 2.0)
		draw_colored_polygon(PackedVector2Array([end + Vector2(0, -26), end + Vector2(16, -21), end + Vector2(0, -15)]), color)
		last = end

func _draw_unit_bars(u: Dictionary, font: Font) -> void:
	var is_sel := selected_tags.has(u["tag"])
	var hurt: bool = u["hp"] < u["max_hp"] - 0.5 or (u["max_shields"] > 0.0 and u["shields"] < u["max_shields"] - 0.5)
	var health := reveal_health_bars or health_bar_mode == 1 or (health_bar_mode == 0 and (is_sel or hurt))
	var building: bool = u["is_structure"] and u["build_progress"] < 1.0
	var garrison: bool = u.unit_type == "field_bunker" and u.owner == local_player and not building
	var producing: bool = u["is_structure"] and u.flight_height <= 0.0 and u["production_queue"].size() > 0 and is_sel
	var salvage: int = maxi(0, int(u.get("salvage_finish", 0)) - SimEngine.tick)
	var plagued: bool = u.get("mutation_plagued", false)
	var plague_carrier: bool = u.get("mutation_carrier", false)
	if not (health or building or garrison or producing or plagued or plague_carrier or salvage > 0):
		return
	var sp_head := _unit_screen(u, unit_height(u) + 0.6)
	if sp_head.y > HUD_TOP - 6.0 or sp_head.y < 10.0 or sp_head.x < -40.0 or sp_head.x > 1960.0:
		return
	if plagued or plague_carrier:
		_draw_count_badge(sp_head - Vector2(0, 22), "Plague carrier" if plague_carrier else "Plague", font, Color("#c0e96a"))
	if garrison:
		var count: int = SimEngine.transport_slots_used(u) if SimEngine.ladder_rules else u.get("passengers", []).size()
		var capacity: int = RTSData.get_unit_def(u.unit_type).transport_capacity
		_draw_count_badge(sp_head - Vector2(0, 26), "%d/%d" % [count, capacity], font, Color("#5eead4") if count > 0 else Color("#a8b4c2"))
	var is_own: bool = u["owner"] == local_player
	var bar_w := clampf(float(u["radius"]) * 26.0, 30.0, 104.0)
	var bar_h := 4.0
	var x0 := sp_head.x - bar_w * 0.5
	var y := sp_head.y - 6.0

	if building:
		_bar(Rect2(x0, y, bar_w, bar_h), float(u["build_progress"]), Color("#fbbf24"))
		y -= bar_h + 2.0
	elif salvage > 0:
		_bar(Rect2(x0, y, bar_w, bar_h), 1.0 - float(salvage) / SimEngine.salvage_duration_ticks(), Color("#fbbf24"))
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
	var landing := pending_ability == "land"
	if not landing and not pending_ability.begins_with("build_"):
		return
	var producer := primary_unit() if landing else {}
	if landing and producer.is_empty():
		return
	var sid := str(producer.unit_type) if landing else str(RTSData.get_ability_def(pending_ability).get("structure", ""))
	if sid == "":
		return
	var mpos := hover_pos()
	if mpos.y >= HUD_TOP:
		return
	var wpos := screen_to_world(mpos)
	var placement: Dictionary
	if landing:
		var position := SimEngine.production_landing_position(producer, wpos)
		var reason := SimEngine.landing_block_reason(producer, position)
		placement = {"pos": position, "reason": reason, "ok": reason.is_empty()}
	else:
		placement = placement_for(sid, wpos)
	var r: float = float(RTSData.get_unit_def(sid).get("radius", 2.0))
	var c: Vector2 = placement["pos"]
	var definition: Dictionary = RTSData.get_unit_def(sid)
	var cells: Vector2i = definition.get("footprint", Vector2i(2, 2))
	var step := Vector2.ONE * (r * 2.0) / Vector2(cells)
	var origin := c - Vector2.ONE * r
	var valid_color := Color("#51e480")
	var blocked_color := Color("#ef6158")
	var queued_color := Color("#fbbf24")
	var outline := valid_color if placement.ok else (queued_color if placement.reason.contains("queued") else blocked_color)
	var vent := c if definition.get("is_extractor", false) and placement.ok else Vector2.INF
	for y in range(cells.y):
		for x in range(cells.x):
			var tile := origin + Vector2(x, y) * step
			var color := blocked_color if SimEngine.is_build_tile_blocked(tile + step * 0.5, local_player, vent) else outline
			_draw_build_tile(Rect2(tile, step), color, 0.16, 1.0)
	_draw_build_tile(Rect2(origin, Vector2.ONE * r * 2.0), outline, 0.0, 2.0)
	if vent.is_finite():
		_draw_range_ring(c, 0.8, Color("#5eead4"))
	if placement.ok and definition.get("requires_living_ground", false):
		_draw_range_ring(c, float(definition.living_ground_radius), Color("#c477b4"))
	if not landing and SimEngine.supports_meridian_attachments(sid) and (SimEngine.campaign_allows_ability(local_player, "attach_research_module") or SimEngine.campaign_allows_ability(local_player, "attach_fabrication_module")):
		var pad := SimEngine.production_attachment_pad({"pos": c})
		var pad_radius: float = RTSData.get_unit_def("research_module").radius
		var pad_clear: bool = SimEngine.can_see_position(local_player, pad) \
			and is_equal_approx(SimEngine.get_elevation_at(pad), SimEngine.get_elevation_at(c)) \
			and _check_planned_placement("research_module", pad, pad_radius).ok
		_draw_build_tile(Rect2(pad - Vector2.ONE * pad_radius, Vector2.ONE * pad_radius * 2.0), valid_color if pad_clear else blocked_color, 0.08, 1.0)

func _draw_build_tile(tile: Rect2, color: Color, fill: float, width: float) -> void:
	var points := PackedVector2Array([
		world_to_screen(tile.position, 0.1), world_to_screen(Vector2(tile.end.x, tile.position.y), 0.1),
		world_to_screen(tile.end, 0.1), world_to_screen(Vector2(tile.position.x, tile.end.y), 0.1),
	])
	if fill > 0.0:
		draw_colored_polygon(points, Color(color, fill))
	points.append(points[0])
	draw_polyline(points, color, width)
