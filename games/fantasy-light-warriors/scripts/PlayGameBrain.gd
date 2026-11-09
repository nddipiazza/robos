extends Node

var active: bool = false
var completed: bool = false
var milestones: Array = []
var total_milestones: int = 0
var current_milestone_index: int = 1
var stop_at_milestone: int = 0
var current_action_description: String = "Idle"
var total_inputs_sent: int = 0
var _tick_accum: float = 0.0
var _step_interval: float = 0.05
var _shop_wait_ticks: int = 0

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_load_milestones()

func _load_milestones() -> void:
	if FileAccess.file_exists("res://data/v1/milestones.json"):
		var f := FileAccess.open("res://data/v1/milestones.json", FileAccess.READ)
		if f:
			var parsed = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				milestones = parsed.get("milestones", [])
				total_milestones = milestones.size()

func start(until_idx: int = 0, start_idx: int = 0) -> void:
	if milestones.is_empty():
		_load_milestones()
	stop_at_milestone = until_idx
	if start_idx > 0:
		current_milestone_index = start_idx
	else:
		_advance_completed_milestones()
	completed = false
	active = true
	current_action_description = "Starting milestone %d" % current_milestone_index

func stop() -> void:
	active = false
	current_action_description = "Stopped"

func current_milestone() -> Dictionary:
	if current_milestone_index >= 1 and current_milestone_index <= milestones.size():
		return milestones[current_milestone_index - 1]
	return {}

func is_milestone_done(m: Dictionary) -> bool:
	if m.is_empty():
		return true
	var gs := get_node_or_null("/root/GameState")
	var sc := get_tree().current_scene
	if sc and "_dialog_active" in sc and sc._dialog_active:
		return false
	if sc and "_battle_active" in sc and sc._battle_active:
		return false
	var dw: Dictionary = m.get("done_when", {})
	var kind := str(dw.get("kind", ""))
	match kind:
		"flag":
			var fname := str(dw.get("flag", ""))
			if fname == "party_created":
				return gs != null and gs.party_created and sc != null and str(sc.name) == "Coneria"
			return gs != null and gs.get_flag(fname)
		"on_map":
			var target_map := str(dw.get("map", ""))
			return sc != null and str(sc.name) == target_map
		"chest":
			var cmap := str(dw.get("map", "temple_of_fiends"))
			var cx := int(dw.get("col", 0))
			var cy := int(dw.get("row", 0))
			var k1 := "%s:%d,%d" % [cmap, cx, cy]
			var k2 := "%d,%d" % [cx, cy]
			return gs != null and (gs.opened_chests.has(k1) or gs.opened_chests.has(k2))
	return false

func _advance_completed_milestones() -> void:
	while current_milestone_index <= milestones.size():
		var m: Dictionary = milestones[current_milestone_index - 1]
		if is_milestone_done(m):
			if stop_at_milestone > 0 and current_milestone_index >= stop_at_milestone:
				completed = true
				active = false
				current_action_description = "Reached target milestone %d (%s)" % [current_milestone_index, str(m.get("id", ""))]
				return
			current_milestone_index += 1
		else:
			break
	if current_milestone_index > milestones.size():
		completed = true
		active = false
		current_action_description = "All %d milestones complete!" % milestones.size()

func _process(delta: float) -> void:
	if not active:
		return
	_tick_accum += delta
	if _tick_accum < _step_interval:
		return
	_tick_accum = 0.0
	_step_brain()

func _send_key(action_name: String, reason: String) -> void:
	current_action_description = reason
	total_inputs_sent += 1
	var ev := InputEventAction.new()
	ev.action = action_name
	ev.pressed = true
	Input.parse_input_event(ev)
	var ev_up := InputEventAction.new()
	ev_up.action = action_name
	ev_up.pressed = false
	Input.parse_input_event(ev_up)

func _step_brain() -> void:
	_advance_completed_milestones()
	if not active or completed:
		return

	var m: Dictionary = current_milestone()
	var sc := get_tree().current_scene
	if not sc:
		return

	var sname := str(sc.name)

	# 1. Handle TitleScreen & PartyCreate
	if sname == "TitleScreen":
		_send_key("ui_accept", "Press START on TitleScreen")
		return
	if sname == "PartyCreate":
		_send_key("ui_accept", "Confirm Light Warrior slot on PartyCreate")
		return

	# 2. Handle active battle, shop interior, or dialog
	if "_battle_active" in sc and sc._battle_active:
		var ename := str(sc._battle_enemy.get("name", "Enemy"))
		var ehp := int(sc._battle_enemy_hp)
		_send_key("ui_accept", "Battle vs %s (HP %d) -> FIGHT/MAGIC" % [ename, ehp])
		return

	if "_shop_active" in sc and sc._shop_active:
		_shop_wait_ticks += 1
		if _shop_wait_ticks < 6:
			current_action_description = "Inside %s Shop (%s)" % [str(sc._shop_type_str), "Buy" if sc._shop_cursor == 0 else "Exit"]
			return
		_shop_wait_ticks = 0
		if sc._shop_cursor == 0:
			_send_key("ui_accept", "Buy merch at %s Shop" % str(sc._shop_type_str))
		else:
			_send_key("ui_accept", "Exit %s Shop" % str(sc._shop_type_str))
		return

	_shop_wait_ticks = 0
	if "_dialog_active" in sc and sc._dialog_active:
		_send_key("ui_accept", "Advance dialogue (%s)" % str(sc._speaker_label.text))
		return

	# 3. Navigate toward milestone goal
	var goal: Dictionary = m.get("goal", {})
	var target_map := str(goal.get("map", "Coneria"))
	var target_col := int(goal.get("col", 16))
	var target_row := int(goal.get("row", 21))
	var action := str(goal.get("action", "walk"))

	# Special multi-chest sequence for Milestone 10 (open (3,3) first, then (2,3))
	var gs := get_node_or_null("/root/GameState")
	if str(m.get("id", "")) == "chest-tof-heal-potion" and sname == "TempleOfFiends" and gs:
		if not gs.opened_chests.has("temple_of_fiends:3,3") and not gs.opened_chests.has("3,3"):
			target_col = 3
			target_row = 3

	if sname != target_map:
		var exit_tile := _choose_transition_tile(sname, target_map)
		_walk_toward_or_interact(sc, exit_tile, "up", "walk_exit", "Transition %s -> %s via (%d,%d)" % [sname, target_map, exit_tile.x, exit_tile.y])
		return

	var target_vec := Vector2i(target_col, target_row)
	var target_facing := str(goal.get("facing", "up"))
	_walk_toward_or_interact(sc, target_vec, target_facing, action, "%s at %s (%d,%d)" % [action.to_upper(), target_map, target_col, target_row])

func _choose_transition_tile(cur_map: String, goal_map: String) -> Vector2i:
	if cur_map == "Coneria":
		return Vector2i(16, 24)
	if cur_map == "WorldMap":
		if goal_map in ["ConeriaCastle1F", "ConeriaCastle2F"]:
			return Vector2i(41, 47)
		if goal_map == "TempleOfFiends":
			return Vector2i(18, 11)
		return Vector2i(40, 50)
	if cur_map == "ConeriaCastle1F":
		if goal_map == "ConeriaCastle2F":
			return Vector2i(12, 18)
		return Vector2i(12, 36)
	if cur_map == "ConeriaCastle2F":
		return Vector2i(12, 18)
	if cur_map == "TempleOfFiends":
		return Vector2i(20, 30)
	return Vector2i(16, 21)

func _walk_toward_or_interact(sc: Node, goal_tile: Vector2i, facing_str: String, action: String, desc: String) -> void:
	var cur: Vector2i = sc._hero_tile
	if cur == goal_tile:
		if action in ["talk", "boss"]:
			var desired_dir: Vector2i = sc._str_to_facing(facing_str)
			if sc._hero_facing != desired_dir:
				sc._hero_facing = desired_dir
				sc._update_camera_and_sprites()
			_send_key("ui_accept", "Talk / Interact (%s)" % desc)
		elif action in ["chest", "shop"]:
			_send_key("ui_accept", "Open / Interact (%s)" % desc)
		return

	if sc.has_method("find_path_to"):
		var path: Array[Vector2i] = sc.find_path_to(goal_tile)
		if not path.is_empty():
			var nxt: Vector2i = path[0]
			var d: Vector2i = nxt - cur
			if d == Vector2i(0, -1): _send_key("move_up", "%s (up -> %d,%d)" % [desc, nxt.x, nxt.y]); return
			if d == Vector2i(0, 1): _send_key("move_down", "%s (down -> %d,%d)" % [desc, nxt.x, nxt.y]); return
			if d == Vector2i(-1, 0): _send_key("move_left", "%s (left -> %d,%d)" % [desc, nxt.x, nxt.y]); return
			if d == Vector2i(1, 0): _send_key("move_right", "%s (right -> %d,%d)" % [desc, nxt.x, nxt.y]); return

	# Fallback direct step
	var dx := goal_tile.x - cur.x
	var dy := goal_tile.y - cur.y
	if abs(dx) >= abs(dy):
		_send_key("move_right" if dx > 0 else "move_left", desc)
	else:
		_send_key("move_down" if dy > 0 else "move_up", desc)

func get_status_dict() -> Dictionary:
	var m := current_milestone()
	return {
		"active": active,
		"completed": completed,
		"current_milestone_index": current_milestone_index,
		"total_milestones": total_milestones,
		"stop_at_milestone": stop_at_milestone,
		"current_milestone": m,
		"current_action": current_action_description,
		"total_inputs_sent": total_inputs_sent
	}
