extends Node
## AIEngine.gd — In-Engine Autonomous Player AI, Enemy AI & Goal-Driven Task Runner
## Lives inside the Godot game engine and plays Dragon Warrior strictly via real
## user input actions (`move_up`, `move_down`, `move_left`, `move_right`,
## `ui_accept`, `ui_cancel`, `cmd_menu`).
##
## Uses continuous multi-tile STRIDES when stepping in the same direction for
## more than 1 tile: holds the directional input action continuously across all
## consecutive collinear tiles in the segment and releases it as soon as the
## hero initiates the step onto the final tile of that straightaway.

const ALLOWED_USER_ACTIONS: Array[String] = [
	"move_up",
	"move_down",
	"move_left",
	"move_right",
	"ui_up",
	"ui_down",
	"ui_left",
	"ui_right",
	"ui_accept",
	"ui_cancel",
	"cmd_menu",
]

var demo_mode: bool = false
var step_interval: float = 0.12
var _step_timer: float = 0.0
var _injecting_input: bool = false

# Stride state for continuous multi-tile movement in the same direction
var _stride_active: bool = false
var _stride_action: String = ""
var _stride_target: Vector2i = Vector2i(-1, -1)
var _stride_scene: String = ""
var _stride_elapsed: float = 0.0
var _stride_max_time: float = 1.0

var task_status: String = "idle" # "idle" | "running" | "completed" | "failed"
var task_type: String = ""
var task_args: Dictionary = {}
var task_error: String = ""
var task_steps_taken: int = 0
var task_max_steps: int = 400
var _task_initial_scene: String = ""

var _play_brain: RefCounted = null
var _play_hud: CanvasLayer = null

var input_history: Array[String] = []
var total_inputs_sent: int = 0
var last_action: String = ""


func _ready() -> void:
	process_mode = PROCESS_MODE_ALWAYS
	var demo_env: String = OS.get_environment("DW_DEMO").to_lower()
	if demo_env in ["1", "true", "yes"]:
		demo_mode = true
	var all_args: Array = OS.get_cmdline_args() + OS.get_cmdline_user_args()
	for arg in all_args:
		if str(arg) in ["--demo", "-d"]:
			demo_mode = true
	if demo_mode:
		print("[AIEngine] Autonomous Demo Mode (Player AI + Enemy AI) ENABLED.")


func _process(delta: float) -> void:
	var gs: Node = get_node_or_null("/root/GameState")
	if gs and "demo_mode_enabled" in gs and (gs.get("demo_mode_enabled") == true) != demo_mode:
		demo_mode = (gs.get("demo_mode_enabled") == true)

	if _stride_active:
		_update_stride(delta)
		return

	if not demo_mode and task_status != "running":
		return
	if _injecting_input:
		return

	# Wait for hero to finish gliding onto current tile before issuing next decision
	var sc: Node = get_tree().current_scene if get_tree() else null
	if sc and (sc.get("_hero_moving") == true):
		return

	_step_timer += delta
	if _step_timer < step_interval:
		return
	_step_timer = 0.0
	_tick_ai()


func set_demo_mode(enabled: bool) -> void:
	demo_mode = enabled
	if not enabled and _stride_active:
		_release_stride()
	var gs: Node = get_node_or_null("/root/GameState")
	if gs and "demo_mode_enabled" in gs:
		gs.set("demo_mode_enabled", enabled)


func start_task(new_task_type: String, args: Dictionary = {}, max_steps: int = 400) -> void:
	if _stride_active:
		_release_stride()
	task_type = new_task_type
	task_args = args.duplicate(true)
	task_status = "running"
	task_error = ""
	task_steps_taken = 0
	task_max_steps = max_steps
	var sc: Node = get_tree().current_scene if get_tree() else null
	_task_initial_scene = str(sc.name) if sc else ""
	_step_timer = step_interval


## "Play the game" mode: the AI seeks every milestone in data/v1/milestones.json.
func start_play_game(args: Dictionary = {}) -> Dictionary:
	if _stride_active:
		_release_stride()
	if _play_brain == null:
		_play_brain = preload("res://src/systems/PlayGameBrain.gd").new()
		_play_brain.call("setup", get_tree())
	var result: Dictionary = _play_brain.call("start", args)
	if not bool(result.get("ok", false)):
		task_status = "failed"
		task_error = str(result.get("error", "play_game failed to start"))
		return result
	demo_mode = false
	task_type = "play_game"
	task_args = args.duplicate(true)
	task_status = "running"
	task_error = ""
	task_steps_taken = 0
	task_max_steps = int(args.get("max_steps", 2000000))
	step_interval = float(args.get("step_interval", 0.08))
	_step_timer = step_interval
	if bool(args.get("hud", true)):
		_show_play_hud()
	return result


## Objective / timer / stats band under the game viewport, captured by recordings and screenshots.
func _show_play_hud() -> void:
	if _play_hud and is_instance_valid(_play_hud):
		return
	_play_hud = preload("res://src/systems/PlayGameHUD.gd").new()
	_play_hud.name = "PlayGameHUD"
	add_child(_play_hud)


func _hide_play_hud() -> void:
	if _play_hud and is_instance_valid(_play_hud):
		_play_hud.queue_free()
	_play_hud = null


func stop_play_game() -> void:
	if _play_brain:
		_play_brain.call("stop")
	_hide_play_hud()
	if task_type == "play_game" and task_status == "running":
		task_status = "idle"
	if _stride_active:
		_release_stride()


func get_milestone_report() -> Dictionary:
	if _play_brain == null:
		return {"status": "idle", "index": 0, "total": 0, "done": [], "skipped": [], "log": []}
	return _play_brain.call("report")


func get_telemetry() -> Dictionary:
	var tel := {
		"demo_mode": demo_mode,
		"stride_active": _stride_active,
		"stride_action": _stride_action,
		"stride_target": [ _stride_target.x, _stride_target.y ],
		"task_status": task_status,
		"task_type": task_type,
		"task_args": task_args,
		"task_error": task_error,
		"task_steps_taken": task_steps_taken,
		"total_inputs_sent": total_inputs_sent,
		"last_action": last_action,
		"recent_inputs": input_history.slice(maxi(0, input_history.size() - 25), input_history.size()),
	}
	if _play_brain != null:
		var rep: Dictionary = _play_brain.call("report")
		tel["milestones"] = {
			"status": rep.get("status", ""), "index": rep.get("index", 0), "total": rep.get("total", 0),
			"current": rep.get("current", {}), "done_count": (rep.get("done", []) as Array).size(),
			"skipped_count": (rep.get("skipped", []) as Array).size(), "objective": rep.get("objective", {}),
			"battles": rep.get("battles", 0), "deaths": rep.get("deaths", 0),
		}
	return tel


func _tick_ai() -> void:
	var ctrl: Node = get_node_or_null("/root/GameControlServer")
	if not ctrl:
		return
	var state: Dictionary = ctrl.call("get_full_scene_state")
	var screen: Dictionary = ctrl.call("get_screen_contents")

	if task_status == "running" and task_type == "play_game" and _play_brain != null:
		var pg: Dictionary = _play_brain.call("decide", state, screen)
		var pg_status := str(_play_brain.get("status"))
		if pg_status == "completed":
			task_status = "completed"
			print("[AIEngine] play_game completed in ", task_steps_taken, " inputs.")
			return
		if pg_status == "failed":
			task_status = "failed"
			task_error = str(_play_brain.get("error"))
			return
		var pg_kind: String = str(pg.get("kind", "tap"))
		var pg_action: String = str(pg.get("action", ""))
		if pg_action == "":
			return
		if pg_kind == "stride":
			_start_stride(pg_action, pg.get("target", Vector2i(-1, -1)), int(pg.get("len", 1)))
		else:
			await _emit_user_input(pg_action)
		return

	if task_status == "running":
		if _is_task_complete(state, screen):
			task_status = "completed"
			print("[AIEngine] Task completed: ", task_type, " in ", task_steps_taken, " inputs.")
			return
		if task_steps_taken >= task_max_steps:
			task_status = "failed"
			task_error = "Task '%s' exceeded max_steps (%d)" % [task_type, task_max_steps]
			push_warning("[AIEngine] " + task_error)
			return

	var decision: Dictionary = _decide_action(state, screen)
	var kind: String = str(decision.get("kind", "tap"))
	var action: String = str(decision.get("action", ""))
	if action == "":
		return
	if kind == "stride":
		var target_tile: Vector2i = decision.get("target", Vector2i(-1, -1))
		var length: int = int(decision.get("len", 1))
		_start_stride(action, target_tile, length)
	else:
		await _emit_user_input(action)


func _start_stride(action_name: String, target_tile: Vector2i, length: int) -> void:
	if not ALLOWED_USER_ACTIONS.has(action_name):
		return
	var sc: Node = get_tree().current_scene if get_tree() else null
	_stride_scene = str(sc.name) if sc else ""
	_stride_active = true
	_stride_action = action_name
	_stride_target = target_tile
	_stride_elapsed = 0.0
	_stride_max_time = maxf(0.35, float(length) * 0.28 + 0.45)

	last_action = action_name
	total_inputs_sent += 1
	task_steps_taken += 1
	input_history.append("%s(stride:%d->%d,%d)" % [action_name, length, target_tile.x, target_tile.y] if length > 1 else action_name)

	Input.action_press(action_name)
	var ev_down := InputEventAction.new()
	ev_down.action = action_name
	ev_down.pressed = true
	Input.parse_input_event(ev_down)


func _update_stride(delta: float) -> void:
	_stride_elapsed += delta
	var sc: Node = get_tree().current_scene if get_tree() else null
	if not sc:
		_release_stride()
		return
	var cur_scene: String = str(sc.name)
	if cur_scene != _stride_scene:
		_release_stride()
		return
	if (sc.get("_dialog_active") == true) or (sc.get("_menu_open") == true) or (sc.get("_battle_active") == true) or sc.get_node_or_null("BattleOverlay") != null:
		_release_stride()
		return

	var ht: Variant = sc.get("_hero_tile")
	if ht is Vector2i and (ht as Vector2i) == _stride_target:
		# Hero has initiated the step onto the target tile of the stride; release now so hero stops cleanly on target_tile
		_release_stride()
		return

	if _stride_elapsed >= _stride_max_time:
		_release_stride()


func _release_stride() -> void:
	if not _stride_active:
		return
	var act: String = _stride_action
	_stride_active = false
	_stride_action = ""
	Input.action_release(act)
	var ev_up := InputEventAction.new()
	ev_up.action = act
	ev_up.pressed = false
	Input.parse_input_event(ev_up)
	_step_timer = step_interval * 0.5


func _emit_user_input(action_name: String) -> void:
	if not ALLOWED_USER_ACTIONS.has(action_name):
		push_warning("[AIEngine] Blocked non-user action: " + action_name)
		return
	_injecting_input = true
	last_action = action_name
	total_inputs_sent += 1
	task_steps_taken += 1
	input_history.append(action_name)

	Input.action_press(action_name)
	var ev_down := InputEventAction.new()
	ev_down.action = action_name
	ev_down.pressed = true
	Input.parse_input_event(ev_down)

	await get_tree().create_timer(0.05).timeout

	Input.action_release(action_name)
	var ev_up := InputEventAction.new()
	ev_up.action = action_name
	ev_up.pressed = false
	Input.parse_input_event(ev_up)

	await get_tree().create_timer(0.05).timeout
	_injecting_input = false


func _is_task_complete(state: Dictionary, screen: Dictionary) -> bool:
	var sc_name: String = str(state.get("scene_shown", {}).get("name", ""))
	var dlg_open: bool = bool(state.get("dialog_box", {}).get("is_showing", false))
	var choice_open: bool = bool(state.get("choice_box", {}).get("is_showing", false))
	var menu_open: bool = bool(state.get("command_window", {}).get("is_showing", false))
	var hero_moving: bool = bool(state.get("game_state", {}).get("hero_moving", false))
	var hero_pos: Dictionary = state.get("hero_position", {})
	var hx: int = int(hero_pos.get("x", -1))
	var hy: int = int(hero_pos.get("y", -1))
	var facing: String = str(hero_pos.get("facing", "down"))
	var overview: Dictionary = screen.get("map_overview", {})

	match task_type:
		"start_fresh_game":
			return sc_name == "ThroneRoom"
		"complete_dialog":
			return task_steps_taken > 0 and not dlg_open and not choice_open
		"move_to_pos":
			if hero_moving or _stride_active:
				return false
			var tx: int = int(task_args.get("x", -1))
			var ty: int = int(task_args.get("y", -1))
			var tfacing: String = str(task_args.get("facing", ""))
			if sc_name != _task_initial_scene and _task_initial_scene != "":
				return true
			if hx == tx and hy == ty:
				if tfacing == "" or facing == tfacing:
					return true
			return false
		"obtain_chest":
			if dlg_open or menu_open or task_steps_taken < 2:
				return false
			for ch in overview.get("all_chests", []):
				if ch is Dictionary and int(ch.get("col", -1)) == hx and int(ch.get("row", -1)) == hy:
					return bool(ch.get("opened", false))
			return task_steps_taken >= 3 and not dlg_open and not menu_open
		"open_door":
			if dlg_open or menu_open or task_steps_taken < 2:
				return false
			return _is_any_door_unlocked(state, overview)
		"take_stairs":
			return sc_name != _task_initial_scene and not dlg_open
		"play_to_checkpoint":
			if hero_moving or _stride_active:
				return false
			var ckpt: String = str(task_args.get("checkpoint", "world_map_reached"))
			return _is_checkpoint_reached(ckpt, state, overview)
	return false


func _is_checkpoint_reached(ckpt: String, state: Dictionary, overview: Dictionary) -> bool:
	var sc_name: String = str(state.get("scene_shown", {}).get("name", ""))
	var dlg_open: bool = bool(state.get("dialog_box", {}).get("is_showing", false))
	var move_en: bool = bool(state.get("game_state", {}).get("move_enabled", false))
	match ckpt:
		"king_talk_done":
			return sc_name == "ThroneRoom" and not dlg_open and move_en
		"magic_key_obtained":
			return _has_item(state, "Magic Key") and not dlg_open
		"throne_door_opened":
			return sc_name == "ThroneRoom" and not dlg_open and _is_any_door_unlocked(state, overview)
		"castle_1f_reached":
			return sc_name == "Castle1F" and not dlg_open
		"world_map_reached":
			return sc_name == "WorldMap"
		"battle_completed":
			return task_steps_taken > 0 and not bool(state.get("battle", {}).get("is_battle", false))
	return false


func _tap(action: String) -> Dictionary:
	return {"kind": "tap", "action": action}


func _decide_action(state: Dictionary, screen: Dictionary) -> Dictionary:
	var sc_name: String = str(state.get("scene_shown", {}).get("name", ""))

	# 1. TitleScreen or SaveSelect
	if sc_name == "TitleScreen" or sc_name == "SaveSelect":
		return _tap("ui_accept")

	# 2. Active Battle — Player AI responds to Enemy AI
	var battle: Dictionary = state.get("battle", {})
	if bool(battle.get("is_battle", false)):
		return _tap(_decide_battle_action(state, battle))

	# 3. Choice Box, Status Window, or Dialog Box
	var choice_box: Dictionary = state.get("choice_box", {})
	if bool(choice_box.get("is_showing", false)):
		var target_opt: String = str(task_args.get("choice", "YES")).to_upper()
		var cur_opt: String = str(choice_box.get("selected_option", "YES")).to_upper()
		if cur_opt != target_opt:
			return _tap("move_down")
		return _tap("ui_accept")

	var status_win: Dictionary = state.get("status_window", {})
	if bool(status_win.get("is_showing", false)):
		return _tap("ui_cancel")

	var dialog_box: Dictionary = state.get("dialog_box", {})
	if bool(dialog_box.get("is_showing", false)):
		return _tap("ui_accept")

	var overview: Dictionary = screen.get("map_overview", {})
	var hero_pos: Dictionary = state.get("hero_position", {})
	var hx: int = int(hero_pos.get("x", 0))
	var hy: int = int(hero_pos.get("y", 0))
	var facing: String = str(hero_pos.get("facing", "down"))
	var has_key: bool = _has_item(state, "Magic Key")

	# 4. Task-specific overrides when a Cucumber step task is running
	if task_status == "running":
		var cmd_win_task: Dictionary = state.get("command_window", {})
		if task_type == "move_to_pos":
			if bool(cmd_win_task.get("is_showing", false)):
				return _tap("ui_cancel")
			var tx: int = int(task_args.get("x", hx))
			var ty: int = int(task_args.get("y", hy))
			var tfacing: String = str(task_args.get("facing", ""))
			if hx == tx and hy == ty and tfacing != "" and facing != tfacing:
				return _tap("move_" + tfacing)
			return _compute_bfs_stride(overview, Vector2i(hx, hy), Vector2i(tx, ty))
		elif task_type == "obtain_chest":
			var cmd_name: String = str(task_args.get("command", "TAKE")).to_upper()
			if bool(cmd_win_task.get("is_showing", false)):
				return _tap(_navigate_menu_to_command(cmd_win_task, cmd_name))
			return _tap("cmd_menu")
		elif task_type == "open_door":
			var door_dir: String = _direction_to_adjacent_door(hx, hy, overview)
			if door_dir != "" and facing != door_dir and not bool(cmd_win_task.get("is_showing", false)):
				return _tap("move_" + door_dir)
			if bool(cmd_win_task.get("is_showing", false)):
				return _tap(_navigate_menu_to_command(cmd_win_task, "DOOR"))
			return _tap("cmd_menu")
		elif task_type == "take_stairs":
			if bool(cmd_win_task.get("is_showing", false)):
				return _tap(_navigate_menu_to_command(cmd_win_task, "STAIRS"))
			return _tap("cmd_menu")

	# 5. Autonomous Demo / Checkpoint AI
	var cmd_win: Dictionary = state.get("command_window", {})
	if bool(cmd_win.get("is_showing", false)):
		var desired_cmd: String = _desired_menu_command(hx, hy, has_key, overview)
		return _tap(_navigate_menu_to_command(cmd_win, desired_cmd))

	if sc_name == "ThroneRoom":
		var door_unlocked: bool = _is_any_door_unlocked(state, overview)
		var door_pos := Vector2i(5, 8)
		for d in overview.get("all_doors", []):
			if d is Dictionary:
				door_pos = Vector2i(int(d.get("col", 5)), int(d.get("row", 8)))
				break

		if not door_unlocked and not has_key:
			var key_chest := Vector2i(6, 5)
			for ch in overview.get("all_chests", []):
				if ch is Dictionary and not bool(ch.get("opened", false)) and str(ch.get("type", "")) == "key":
					key_chest = Vector2i(int(ch.get("col", 6)), int(ch.get("row", 5)))
					break
			if hx == key_chest.x and hy == key_chest.y:
				return _tap("cmd_menu")
			return _compute_bfs_stride(overview, Vector2i(hx, hy), key_chest)

		if not door_unlocked and has_key:
			var pre_door := Vector2i(door_pos.x, door_pos.y - 1)
			if hx == pre_door.x and hy == pre_door.y:
				if facing != "down":
					return _tap("move_down")
				return _tap("cmd_menu")
			return _compute_bfs_stride(overview, Vector2i(hx, hy), pre_door)

		var stair_pos := Vector2i(9, 9)
		for st in overview.get("all_stairs", []):
			if st is Dictionary:
				stair_pos = Vector2i(int(st.get("col", 9)), int(st.get("row", 9)))
				break
		if hx == stair_pos.x and hy == stair_pos.y:
			return _tap("cmd_menu")
		return _compute_bfs_stride(overview, Vector2i(hx, hy), stair_pos)

	if sc_name == "Castle1F":
		var exit_pos := Vector2i(11, 30)
		var exits: Array = overview.get("all_exits", [])
		if not exits.is_empty() and exits[0] is Dictionary:
			var ex_dict: Dictionary = exits[0]
			exit_pos = Vector2i(int(ex_dict.get("col", 11)), int(ex_dict.get("row", 30)))
		if hx == exit_pos.x and hy == exit_pos.y:
			return _tap("move_down")
		return _compute_bfs_stride(overview, Vector2i(hx, hy), exit_pos)

	var dirs: Array[String] = ["move_right", "move_down", "move_left", "move_up"]
	return _tap(dirs[total_inputs_sent % dirs.size()])


func _decide_battle_action(state: Dictionary, battle: Dictionary) -> String:
	var phase_name: String = str(battle.get("phase_name", ""))
	if bool(battle.get("anim_lock", false)) or phase_name in ["INTRO", "VICTORY", "DEFEAT", "FLED"]:
		return "ui_accept"
	if phase_name == "PLAYER_MENU":
		var b_info: Dictionary = battle.get("battle_scene_info", {})
		var h_hp: int = int(b_info.get("hero_hp", 15))
		var gs_info: Dictionary = state.get("game_state", {})
		var h_max: int = int(gs_info.get("hp_max", 15))
		var has_herb: bool = _has_item(state, "Herb")
		var target_cursor: int = 2 if (h_hp <= maxi(5, int(h_max * 0.35)) and has_herb) else 0
		var cur_cursor: int = int(battle.get("cursor", 0))
		if cur_cursor == target_cursor:
			return "ui_accept"
		if (cur_cursor ^ 2) == target_cursor:
			return "move_down"
		return "move_right"
	return "ui_accept"


func _has_item(state: Dictionary, item_name: String) -> bool:
	var target: String = item_name.to_lower()
	var inv: Array = state.get("game_state", {}).get("inventory", [])
	for it in inv:
		if it is Dictionary:
			var n: String = str(it.get("name", "")).to_lower()
			var t: String = str(it.get("type", "")).to_lower()
			if n == target or t == target or target in n:
				return true
		elif it is String and target in str(it).to_lower():
			return true
	return false


func _is_any_door_unlocked(state: Dictionary, overview: Dictionary) -> bool:
	var unlocked: Variant = state.get("game_state", {}).get("unlocked_doors", {})
	if unlocked is Dictionary and bool(unlocked.get("throne_room", false)):
		return true
	for d in overview.get("all_doors", []):
		if d is Dictionary and bool(d.get("unlocked", false)):
			return true
	return false


func _direction_to_adjacent_door(hx: int, hy: int, overview: Dictionary) -> String:
	for d in overview.get("all_doors", []):
		if d is Dictionary and not bool(d.get("unlocked", false)):
			var dx: int = int(d.get("col", -1)) - hx
			var dy: int = int(d.get("row", -1)) - hy
			if dx == 0 and dy == 1: return "down"
			if dx == 0 and dy == -1: return "up"
			if dx == 1 and dy == 0: return "right"
			if dx == -1 and dy == 0: return "left"
	return ""


func _desired_menu_command(hx: int, hy: int, has_key: bool, overview: Dictionary) -> String:
	for st in overview.get("all_stairs", []):
		if st is Dictionary and int(st.get("col", -1)) == hx and int(st.get("row", -1)) == hy:
			return "STAIRS"
	for ch in overview.get("all_chests", []):
		if ch is Dictionary and not bool(ch.get("opened", false)) and int(ch.get("col", -1)) == hx and int(ch.get("row", -1)) == hy:
			return "TAKE"
	if has_key:
		for d in overview.get("all_doors", []):
			if d is Dictionary and not bool(d.get("unlocked", false)):
				var dx: int = int(d.get("col", -1))
				var dy: int = int(d.get("row", -1))
				if abs(dx - hx) + abs(dy - hy) == 1:
					return "DOOR"
	return "SEARCH"


func _navigate_menu_to_command(cmd_win: Dictionary, target_cmd: String) -> String:
	var items: Array = cmd_win.get("menu_items", ["TALK", "DOOR", "STATUS", "TAKE", "STAIRS", "SPELL", "SEARCH", "ITEM"])
	var cur_idx: int = int(cmd_win.get("selected_index", 0))
	var target_idx: int = items.find(target_cmd)
	if target_idx < 0:
		return "ui_cancel"
	if cur_idx == target_idx:
		return "ui_accept"
	var cur_col: int = cur_idx % 2
	var cur_row: int = cur_idx / 2
	var tgt_col: int = target_idx % 2
	var tgt_row: int = target_idx / 2
	if cur_col < tgt_col:
		return "move_right"
	if cur_col > tgt_col:
		return "move_left"
	if cur_row < tgt_row:
		return "move_down"
	return "move_up"


func _dir_vec_to_action(delta: Vector2i) -> String:
	if delta == Vector2i(0, -1): return "move_up"
	if delta == Vector2i(0, 1): return "move_down"
	if delta == Vector2i(-1, 0): return "move_left"
	if delta == Vector2i(1, 0): return "move_right"
	return "move_down"


func _compute_bfs_stride(overview: Dictionary, start: Vector2i, goal: Vector2i) -> Dictionary:
	var matrix: Array = overview.get("walkable_matrix", [])
	var ox: int = int(overview.get("offset_x", 0))
	var oy: int = int(overview.get("offset_y", 0))
	var h: int = matrix.size()
	if h == 0:
		return {"kind": "tap", "action": "move_down"}
	var w: int = str(matrix[0]).length()
	var s: Vector2i = start - Vector2i(ox, oy)
	var g: Vector2i = goal - Vector2i(ox, oy)
	if s == g:
		return {"kind": "tap", "action": ""}
	var queue: Array[Vector2i] = [s]
	var came_from: Dictionary = {s: s}
	var dirs: Array[Vector2i] = [Vector2i(0, -1), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(1, 0)]

	while not queue.is_empty():
		var cur: Vector2i = queue.pop_front()
		if cur == g:
			break
		for d in dirs:
			var nxt: Vector2i = cur + d
			if nxt.x < 0 or nxt.x >= w or nxt.y < 0 or nxt.y >= h:
				continue
			if came_from.has(nxt):
				continue
			var sym: String = str(matrix[nxt.y]).substr(nxt.x, 1)
			if sym in ["#", "D", "N"] and nxt != g:
				continue
			came_from[nxt] = cur
			queue.append(nxt)

	if not came_from.has(g):
		var direct_delta: Vector2i = g - s
		if abs(direct_delta.x) + abs(direct_delta.y) == 1:
			return {"kind": "tap", "action": _dir_vec_to_action(direct_delta)}
		return {"kind": "tap", "action": "move_down"}

	# Reconstruct full path [s, p1, p2, ..., g]
	var rev_path: Array[Vector2i] = []
	var node: Vector2i = g
	while node != s:
		rev_path.append(node)
		node = came_from[node]
	rev_path.reverse()

	var first_dir: Vector2i = rev_path[0] - s
	var stride_end_local: Vector2i = rev_path[0]
	var stride_len: int = 1
	for i in range(1, rev_path.size()):
		if rev_path[i] - rev_path[i - 1] == first_dir:
			stride_end_local = rev_path[i]
			stride_len += 1
		else:
			break

	var world_target: Vector2i = stride_end_local + Vector2i(ox, oy)
	var act: String = _dir_vec_to_action(first_dir)
	return {
		"kind": "stride",
		"action": act,
		"target": world_target,
		"len": stride_len,
	}
