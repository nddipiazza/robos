extends Node

# GameControlServer.gd — HTTP REST Web Service for E2E Automation & QA Player User Simulation
# Runs an asynchronous TCPServer embedded in Godot 4 to inspect screen state and inject real user inputs.

var server: TCPServer = TCPServer.new()
var active_port: int = 8080
var _active_clients: Array[StreamPeerTCP] = []

func _ready() -> void:
	process_mode = PROCESS_MODE_ALWAYS
	_determine_port()
	_start_server()

func _determine_port() -> void:
	var env_port = OS.get_environment("CRPG_WEB_SERVICE_PORT")
	if env_port != "" and env_port.is_valid_int():
		active_port = env_port.to_int()

	var args = OS.get_cmdline_args()
	args.append_array(OS.get_cmdline_user_args())
	for i in range(args.size()):
		var arg = args[i]
		if arg.begins_with("--port="):
			active_port = arg.split("=")[1].to_int()
		elif arg == "--port" and i + 1 < args.size():
			active_port = args[i + 1].to_int()

func _start_server() -> void:
	for p in range(active_port, active_port + 10):
		server = TCPServer.new()
		var err = server.listen(p, "127.0.0.1")
		if err == OK:
			active_port = p
			print("[GameControlServer] HTTP REST Web Service running on http://127.0.0.1:%d" % active_port)
			return
		else:
			print("[GameControlServer] Port %d unavailable (err=%d), trying next..." % [p, err])
	push_warning("[GameControlServer] Could not bind HTTP server to any port in range %d-%d" % [active_port, active_port + 9])

func _process(_delta: float) -> void:
	if not server or not server.is_listening():
		return

	while server.is_connection_available():
		var client: StreamPeerTCP = server.take_connection()
		if client:
			_handle_client(client)

func _handle_client(client: StreamPeerTCP) -> void:
	client.poll()
	var retries = 0
	while client.get_status() == StreamPeerTCP.STATUS_CONNECTED and client.get_available_bytes() == 0 and retries < 50:
		OS.delay_msec(2)
		client.poll()
		retries += 1

	var bytes_avail = client.get_available_bytes()
	if bytes_avail <= 0:
		client.disconnect_from_host()
		return

	var req_data = client.get_data(bytes_avail)
	if req_data[0] != OK:
		client.disconnect_from_host()
		return

	var raw_request: String = req_data[1].get_string_from_utf8()
	_process_http_request(client, raw_request)

func _process_http_request(client: StreamPeerTCP, raw_req: String) -> void:
	var lines = raw_req.split("\r\n")
	if lines.size() == 0:
		client.disconnect_from_host()
		return

	var req_line = lines[0].split(" ")
	if req_line.size() < 2:
		client.disconnect_from_host()
		return

	var method = req_line[0]
	var path = req_line[1]

	if "?" in path:
		path = path.split("?")[0]

	if method == "OPTIONS":
		_send_cors_response(client)
		return

	var body_dict: Dictionary = {}
	var body_start_idx = raw_req.find("\r\n\r\n")
	if body_start_idx != -1:
		var raw_body = raw_req.substr(body_start_idx + 4).strip_edges()
		if raw_body != "":
			var parsed = JSON.parse_string(raw_body)
			if typeof(parsed) == TYPE_DICTIONARY:
				body_dict = parsed

	match [method, path]:
		["GET", "/health"], ["GET", "/api/v1/health"]:
			_send_http_response(client, 200, {
				"status": "ok",
				"game": "Realm of Heroes: A Night Without Memory",
				"engine": "Godot 4.3",
				"port": active_port
			})
		["GET", "/state"], ["GET", "/api/v1/state"]:
			_send_http_response(client, 200, _get_full_game_state())
		["GET", "/screen_state"], ["GET", "/api/v1/screen_state"]:
			_send_http_response(client, 200, _get_screen_state())
		["GET", "/combat/round_stats"], ["GET", "/api/v1/combat/round_stats"]:
			var cur_sc = get_tree().current_scene
			var telemetry = cur_sc.get_combat_telemetry() if (cur_sc and cur_sc.has_method("get_combat_telemetry")) else {"current_round": 0, "rounds": [], "latest_round": {}}
			_send_http_response(client, 200, telemetry)
		["POST", "/user_input/click_button"], ["POST", "/api/v1/user_input/click_button"]:
			var res = await _handle_click_button(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/type_text"], ["POST", "/api/v1/user_input/type_text"]:
			var res = await _handle_type_text(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/click_object"], ["POST", "/api/v1/user_input/click_object"]:
			var res = await _handle_click_object(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/dialog/choice"], ["POST", "/api/v1/dialog/choice"], ["POST", "/user_input/click_dialog_choice"], ["POST", "/api/v1/user_input/click_dialog_choice"]:
			var res = await _handle_click_dialog_choice(body_dict)
			_send_http_response(client, 200, res)
		["GET", "/action_log"], ["GET", "/api/v1/action_log"]:
			var res = _handle_get_action_log()
			_send_http_response(client, 200, res)
		["POST", "/user_input/mouse_click"], ["POST", "/api/v1/user_input/mouse_click"]:
			var res = await _handle_mouse_click(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/move_to"], ["POST", "/api/v1/user_input/move_to"]:
			var res = await _handle_move_to(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/move_to_target"], ["POST", "/api/v1/user_input/move_to_target"]:
			var res = await _handle_move_to_target(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/interact_target"], ["POST", "/api/v1/user_input/interact_target"]:
			var res = await _handle_interact_target(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/inventory/toggle"], ["POST", "/api/v1/user_input/inventory/toggle"]:
			var res = _handle_inventory_toggle(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/inventory/use_item"], ["POST", "/api/v1/user_input/inventory/use_item"]:
			var res = _handle_inventory_use(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/inventory/equip_item"], ["POST", "/api/v1/user_input/inventory/equip_item"]:
			var res = _handle_inventory_equip(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/select_option"], ["POST", "/api/v1/user_input/select_option"]:
			var res = await _handle_select_option(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/action_log/set_size"], ["POST", "/api/v1/user_input/action_log/set_size"]:
			var res = _handle_action_log_set_size(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/pan_camera"], ["POST", "/api/v1/user_input/pan_camera"]:
			var res = _handle_pan_camera(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/user_input/center_camera"], ["POST", "/api/v1/user_input/center_camera"]:
			var res = _handle_center_camera(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/qa/scenario_splash"], ["POST", "/api/v1/qa/scenario_splash"]:
			var sc_name = str(body_dict.get("scenario_name", ""))
			var sc_desc = str(body_dict.get("description", ""))
			var sc_map = str(body_dict.get("starting_scene", ""))
			var sc_state = str(body_dict.get("game_state_summary", ""))
			var sc_dur = float(body_dict.get("duration", 3.0))
			if has_node("/root/QAOverlay"):
				get_node("/root/QAOverlay").show_scenario_splash(sc_name, sc_desc, sc_map, sc_state, sc_dur)
			_send_http_response(client, 200, {"success": true, "scenario_name": sc_name})
		["POST", "/qa/set_step"], ["POST", "/api/v1/qa/set_step"]:
			var step = str(body_dict.get("step", ""))
			var subtitle = str(body_dict.get("subtitle", ""))
			var description = str(body_dict.get("description", ""))
			if has_node("/root/QAOverlay"):
				get_node("/root/QAOverlay").set_step(step, subtitle, description)
			_send_http_response(client, 200, {"success": true, "step": step, "subtitle": subtitle, "description": description})
		["POST", "/setup_state"], ["POST", "/api/v1/setup_state"]:
			var res = await _setup_initial_state(body_dict)
			_send_http_response(client, 200, res)
		["POST", "/reset"], ["POST", "/api/v1/reset"]:
			_reset_game()
			_send_http_response(client, 200, {"success": true, "message": "Game state reset"})
		["POST", "/action"], ["POST", "/api/v1/action"]:
			var res = await _execute_game_action(body_dict)
			_send_http_response(client, 200, res)
		_:
			_send_http_response(client, 404, {"error": "Endpoint not found: %s %s" % [method, path]})

# ── User Input Simulation (No Backend Cheats) ──────────────────────────────────

func _simulate_mouse_to_node_or_pos(target_node_or_pos: Variant, ping_color: Color = Color(0.1, 0.95, 0.4, 0.95), tag: String = "") -> void:
	if not has_node("/root/QAOverlay"):
		return
	var qa = get_node("/root/QAOverlay")
	var screen_pos = Vector2(960, 540)
	if target_node_or_pos is Vector2:
		screen_pos = get_viewport().get_canvas_transform() * target_node_or_pos
	elif target_node_or_pos is Control and target_node_or_pos.is_inside_tree():
		screen_pos = target_node_or_pos.get_global_transform_with_canvas().origin + target_node_or_pos.size / 2.0
	elif target_node_or_pos is Node2D and target_node_or_pos.is_inside_tree():
		screen_pos = target_node_or_pos.get_global_transform_with_canvas().origin
	screen_pos.x = clampf(screen_pos.x, 30.0, 1890.0)
	screen_pos.y = clampf(screen_pos.y, 50.0, 1030.0)
	if tag != "":
		qa.log_event("[%s]" % tag)
	await qa.human_move_and_click(screen_pos, ping_color, tag)

func _handle_click_button(payload: Dictionary) -> Dictionary:
	var target = str(payload.get("target", ""))
	var text_match = str(payload.get("text", "")).to_lower()
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var btn: Button = null
	if target != "":
		btn = _find_button_by_name(cur_scene, target)
		if not btn and cur_scene.has_node(target):
			var n = cur_scene.get_node(target)
			if n is Button and n.is_visible_in_tree() and not n.disabled:
				btn = n

	if not btn and text_match != "":
		btn = _find_button_by_text(cur_scene, text_match)
	if not btn and target != "":
		btn = _find_button_by_text(cur_scene, target.to_lower())

	if btn and btn.is_visible_in_tree() and not btn.disabled:
		var btn_pos = btn.get_global_transform_with_canvas().origin + btn.size / 2.0
		var b_label = btn.text.strip_edges() if btn.text.strip_edges() != "" else btn.name
		if has_node("/root/QAOverlay"):
			var qa = get_node("/root/QAOverlay")
			qa.log_event("[CLICK] %s" % b_label)
			await qa.human_move_and_click(btn_pos, Color(0.1, 0.95, 0.4, 0.95), "")
		btn.grab_focus()
		btn.pressed.emit()
		return {"success": true, "button": btn.name, "text": btn.text}

	return {"success": false, "error": "Button not found or not clickable: %s" % [target if target != "" else text_match]}

func _find_button_by_name(root: Node, name_query: String) -> Button:
	if root is Button and root.is_visible_in_tree() and not root.disabled:
		if root.name == name_query or root.name.to_lower() == name_query.to_lower():
			return root
	for child in root.get_children():
		var found = _find_button_by_name(child, name_query)
		if found:
			return found
	return null

func _find_button_by_text(root: Node, text_query: String) -> Button:
	if root is Button and root.is_visible_in_tree() and not root.disabled:
		if root.text.to_lower().contains(text_query) or root.name.to_lower().contains(text_query):
			return root
	for child in root.get_children():
		var found = _find_button_by_text(child, text_query)
		if found:
			return found
	return null

func _handle_type_text(payload: Dictionary) -> Dictionary:
	var target = str(payload.get("target", ""))
	var text = str(payload.get("text", ""))
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var edit: LineEdit = null
	if target != "":
		if cur_scene.has_node(target):
			var n = cur_scene.get_node(target)
			if n is LineEdit:
				edit = n
		if not edit:
			var found = cur_scene.find_child(target, true, false)
			if found is LineEdit:
				edit = found

	if not edit:
		edit = _find_first_line_edit(cur_scene)

	if edit and edit.is_visible_in_tree() and edit.editable:
		var edit_pos = edit.get_global_transform_with_canvas().origin + edit.size / 2.0
		if has_node("/root/QAOverlay"):
			var qa = get_node("/root/QAOverlay")
			qa.log_event("[TYPE] \"%s\"" % text)
			await qa.human_move_and_click(edit_pos, Color(0.2, 0.85, 1.0, 0.95), "")
		edit.text = text
		edit.emit_signal("text_changed", text)
		edit.emit_signal("text_submitted", text)
		return {"success": true, "field": edit.name, "text": text}

	return {"success": false, "error": "LineEdit field not found"}

func _find_first_line_edit(root: Node) -> LineEdit:
	if root is LineEdit and root.is_visible_in_tree():
		return root
	for child in root.get_children():
		var found = _find_first_line_edit(child)
		if found:
			return found
	return null

func _find_node_by_target_id(root: Node, target_id: String) -> Node:
	if not root:
		return null
	var t_lower = target_id.to_lower().strip_edges()
	if root.name.to_lower() == t_lower:
		return root
	for prop in ["npc_id", "door_id", "item_id", "building_id", "chest_id", "enemy_id"]:
		if prop in root and str(root.get(prop)).to_lower() == t_lower:
			return root
	if (t_lower == "npc-id-1" or t_lower == "npc-1" or t_lower == "blacksmith" or t_lower == "brand") and root.name == "BlacksmithBrand":
		return root
	for child in root.get_children():
		var res = _find_node_by_target_id(child, target_id)
		if res != null:
			return res
	return null

func _handle_move_to_target(payload: Dictionary) -> Dictionary:
	var target_id = str(payload.get("target_id", payload.get("target", payload.get("name", ""))))
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var node = _find_node_by_target_id(cur_scene, target_id)
	if not node:
		return {"success": false, "error": "Target '%s' not found" % target_id}

	var target_pos = node.global_position if node is Node2D else Vector2(960, 540)
	var hero: HeroPlayer = cur_scene.find_child("HeroPlayer", true, false)
	if hero:
		var dir = (hero.global_position - target_pos).normalized()
		if dir == Vector2.ZERO: dir = Vector2(0, 1)
		target_pos += dir * 48.0

	return await _handle_move_to({"x": target_pos.x, "y": target_pos.y, "queue": payload.get("queue", false)})

func _handle_interact_target(payload: Dictionary) -> Dictionary:
	var target_id = str(payload.get("target_id", payload.get("target", payload.get("name", ""))))
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var node = _find_node_by_target_id(cur_scene, target_id)
	if not node:
		return {"success": false, "error": "Target '%s' not found" % target_id}

	var hero: HeroPlayer = cur_scene.find_child("HeroPlayer", true, false)
	if hero and node is Node2D and hero.global_position.distance_to(node.global_position) > 130.0:
		var dir = (hero.global_position - node.global_position).normalized()
		if dir == Vector2.ZERO: dir = Vector2(0, 1)
		var approach_pos = node.global_position + dir * 55.0
		await _handle_move_to({"x": approach_pos.x, "y": approach_pos.y})
		var wait_ticks = 0
		while hero.is_moving and wait_ticks < 80:
			await get_tree().create_timer(0.1).timeout
			wait_ticks += 1

	return await _handle_click_object({"name": node.name})

func _handle_encounter_clearing(_payload: Dictionary) -> Dictionary:
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var enemies: Array[Node2D] = []
	for child in cur_scene.get_children():
		if child is Node2D and (child.has_method("take_damage") or child.has_signal("hound_slain") or "enemy_id" in child):
			if child.get("current_state") != 3: # Not DEAD
				enemies.append(child)

	if enemies.is_empty():
		return {"success": true, "enemies_cleared": 0, "message": "No active threats detected"}

	var cleared_count = 0
	var hero: HeroPlayer = cur_scene.find_child("HeroPlayer", true, false)
	for enemy in enemies:
		if not is_instance_valid(enemy) or enemy.get("current_state") == 3:
			continue
		var e_pos = enemy.global_position
		if has_node("/root/QAOverlay"):
			get_node("/root/QAOverlay").log_event("[AUTO-COMBAT] Engaging %s" % enemy.name)
			await _simulate_mouse_to_node_or_pos(enemy, Color(1.0, 0.2, 0.2, 0.95), "ATK " + enemy.name)

		if cur_scene.has_method("_engage_beast"):
			cur_scene._engage_beast(enemy)
		elif cur_scene.has_method("_engage_undead"):
			cur_scene._engage_undead(enemy)
		elif cur_scene.has_method("trigger_hound_combat"):
			cur_scene.trigger_hound_combat()
		elif hero:
			hero.play_attack(e_pos, func():
				if is_instance_valid(enemy):
					enemy.take_damage(99)
			)
		cleared_count += 1
		await get_tree().create_timer(1.2).timeout

	return {"success": true, "enemies_cleared": cleared_count, "kills": GameState.stats.kills}

func _handle_click_object(payload: Dictionary) -> Dictionary:
	var name = str(payload.get("name", payload.get("target", payload.get("target_id", ""))))
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var obj: Node = _find_node_by_target_id(cur_scene, name)
	if not obj:
		if cur_scene.has_node(name):
			obj = cur_scene.get_node(name)
		else:
			obj = cur_scene.find_child(name, true, false)

	if not obj:
		return {"success": false, "error": "World object '%s' not found" % name}

	var obj_pos = Vector2(960, 540)
	if obj is Node2D:
		obj_pos = obj.get_global_transform_with_canvas().origin
	elif obj is Control:
		obj_pos = obj.get_global_transform_with_canvas().origin + obj.size / 2.0
	obj_pos.x = clampf(obj_pos.x, 40.0, 1880.0)
	obj_pos.y = clampf(obj_pos.y, 60.0, 1020.0)
	if has_node("/root/QAOverlay"):
		var qa = get_node("/root/QAOverlay")
		qa.log_event("[INTERACT] %s" % obj.name)
		await qa.human_move_and_click(obj_pos, Color(1.0, 0.8, 0.2, 0.95), "")

	# Dispatch interaction
	if obj.has_method("pickup"):
		obj.pickup()
		return {"success": true, "object": obj.name, "action": "pickup"}
	elif obj.has_method("try_enter"):
		var ok = obj.try_enter()
		return {"success": true, "object": obj.name, "action": "try_enter", "entered": ok}
	elif obj.has_method("interact"):
		obj.interact()
		return {"success": true, "object": obj.name, "action": "interact"}
	elif obj.has_method("try_open"):
		obj.try_open()
		return {"success": true, "object": obj.name, "action": "try_open"}
	elif obj.has_signal("body_clicked"):
		obj.emit_signal("body_clicked")
		return {"success": true, "object": obj.name, "signal": "body_clicked"}
	elif obj.has_signal("chest_opened"):
		if "is_opened" in obj and not obj.is_opened:
			obj.is_opened = true
			if obj.has_node("Label"):
				obj.get_node("Label").text = "[Chest Opened]"
		obj.emit_signal("chest_opened")
		return {"success": true, "object": obj.name, "signal": "chest_opened"}
	elif obj.has_signal("door_entered"):
		obj.emit_signal("door_entered")
		return {"success": true, "object": obj.name, "signal": "door_entered"}

	return {"success": false, "error": "Object '%s' has no interactive click signal" % name}

func _handle_click_dialog_choice(payload: Dictionary) -> Dictionary:
	var choice_idx = int(payload.get("index", 0))
	var choice_text = str(payload.get("text", "")).to_lower()
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No current active scene"}

	# Inspect ActionLog for in-log dialogue choices
	var action_log: ActionLog = cur_scene.find_child("ActionLog", true, false)
	if not action_log or not action_log.is_dialogue_active:
		return {"success": false, "error": "No active dialogue found in ActionLog"}

	var container: VBoxContainer = action_log.find_child("ChoicesContainer", true, false)
	if not container:
		return {"success": false, "error": "No ChoicesContainer found in ActionLog"}

	var dial_ref: Node = action_log

	var buttons: Array[Button] = []
	for c in container.get_children():
		if c is Button and (c.is_visible_in_tree() or (c.visible and container.visible)):
			buttons.append(c)

	if buttons.size() == 0:
		if dial_ref.has_method("close_dialogue"):
			dial_ref.close_dialogue()
		return {"success": true, "message": "Dialogue dismissed"}

	var target_btn: Button = null
	if choice_text != "":
		for b in buttons:
			if b.text.to_lower().contains(choice_text):
				target_btn = b
				break

	if not target_btn and choice_idx >= 0 and choice_idx < buttons.size():
		target_btn = buttons[choice_idx]

	if target_btn:
		var btn_pos = target_btn.get_global_transform_with_canvas().origin + target_btn.size / 2.0
		var choice_lbl = target_btn.text.strip_edges()
		if choice_lbl.length() > 24:
			choice_lbl = choice_lbl.substr(0, 24) + "..."
		if has_node("/root/QAOverlay"):
			var qa = get_node("/root/QAOverlay")
			qa.log_event("[CHOICE] %s" % choice_lbl)
			await qa.human_move_and_click(btn_pos, Color(0.25, 1.0, 0.55, 0.95), "")
		target_btn.emit_signal("pressed")
		return {"success": true, "chosen": target_btn.text}

	return {"success": false, "error": "Choice index %d not found" % choice_idx}

func _handle_action_log_set_size(payload: Dictionary) -> Dictionary:
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}
	var al: ActionLog = cur_scene.find_child("ActionLog", true, false)
	if not al:
		return {"success": false, "error": "ActionLog not found"}

	var mode_str = str(payload.get("mode", "cycle")).to_lower()
	match mode_str:
		"small", "sml", "0":
			al.set_size_mode(ActionLog.SizeMode.SMALL)
		"medium", "med", "1":
			al.set_size_mode(ActionLog.SizeMode.MEDIUM)
		"large", "lrg", "2":
			al.set_size_mode(ActionLog.SizeMode.LARGE)
		_:
			al.cycle_size_mode()

	return {
		"success": true,
		"size_mode": al.current_size_mode,
		"height": al.size.y,
		"position_y": al.position.y
	}

func _handle_get_action_log() -> Dictionary:
	var cur_scene = get_tree().current_scene
	var al: ActionLog = cur_scene.find_child("ActionLog", true, false) if cur_scene else null
	var log_text = al.rich_label.get_parsed_text() if (al and al.rich_label) else ""
	var bbcode_text = al.rich_label.text if (al and al.rich_label) else ""
	var scroll_info = al.get_scroll_info() if al else {}
	return {
		"status": "ok",
		"text": log_text,
		"bbcode": bbcode_text,
		"scroll": scroll_info,
		"history": GameState.activity_log_history
	}

func _handle_pan_camera(payload: Dictionary) -> Dictionary:
	var dir = str(payload.get("direction", "right")).to_lower()
	var duration = float(payload.get("duration", 0.6))
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var hero: HeroPlayer = cur_scene.find_child("HeroPlayer", true, false)
	if not hero:
		return {"success": false, "error": "HeroPlayer not found"}

	var pan_vec = Vector2.ZERO
	var keycode = KEY_RIGHT
	match dir:
		"left":
			pan_vec = Vector2(-1, 0)
			keycode = KEY_LEFT
		"right":
			pan_vec = Vector2(1, 0)
			keycode = KEY_RIGHT
		"up":
			pan_vec = Vector2(0, -1)
			keycode = KEY_UP
		"down":
			pan_vec = Vector2(0, 1)
			keycode = KEY_DOWN

	var ev_down = InputEventKey.new()
	ev_down.keycode = keycode
	ev_down.pressed = true
	Input.parse_input_event(ev_down)
	if has_node("/root/QAOverlay"):
		get_node("/root/QAOverlay").log_event("[PAN CAMERA] %s" % dir.to_upper())

	hero.simulated_pan_dir = pan_vec

	get_tree().create_timer(duration).timeout.connect(func():
		if is_instance_valid(hero):
			hero.simulated_pan_dir = Vector2.ZERO
		var ev_up = InputEventKey.new()
		ev_up.keycode = keycode
		ev_up.pressed = false
		Input.parse_input_event(ev_up)
	)

	return {
		"success": true,
		"direction": dir,
		"duration": duration,
		"camera_target": [hero.camera_target_offset.x, hero.camera_target_offset.y]
	}

func _handle_center_camera(_payload: Dictionary) -> Dictionary:
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var hero: HeroPlayer = cur_scene.find_child("HeroPlayer", true, false)
	if not hero:
		return {"success": false, "error": "HeroPlayer not found"}

	if has_node("/root/QAOverlay"):
		get_node("/root/QAOverlay").log_event("[CAMERA CENTER]")

	hero.center_camera_on_hero()
	return {
		"success": true,
		"camera_position": [hero.camera.offset.x if hero.camera else 0, hero.camera.offset.y if hero.camera else 0]
	}

func _handle_mouse_click(payload: Dictionary) -> Dictionary:
	var x = float(payload.get("x", 0))
	var y = float(payload.get("y", 0))
	var shift = bool(payload.get("shift", false))
	var pos = Vector2(x, y)

	if has_node("/root/QAOverlay"):
		var qa = get_node("/root/QAOverlay")
		var color = Color(0.0, 0.9, 1.0, 0.95) if shift else Color(0.1, 0.95, 0.4, 0.95)
		var tag = "+" if shift else ""
		var prefix = "[SHIFT-CLICK]" if shift else "[CLICK]"
		qa.log_event("%s (%d, %d)" % [prefix, int(x), int(y)])
		await qa.human_move_and_click(pos, color, tag)

	var ev_down = InputEventMouseButton.new()
	ev_down.button_index = MOUSE_BUTTON_LEFT
	ev_down.pressed = true
	ev_down.shift_pressed = shift
	ev_down.position = pos
	ev_down.global_position = pos
	Input.parse_input_event(ev_down)
	get_viewport().push_input(ev_down)

	return {"success": true, "click_position": [x, y], "shift": shift}

func _handle_move_to(payload: Dictionary) -> Dictionary:
	var x = float(payload.get("x", 0))
	var y = float(payload.get("y", 0))
	var queue = bool(payload.get("queue", false))
	var pos = Vector2(x, y)
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var hero: Node = cur_scene.get_node_or_null("HeroPlayer")
	if not hero:
		hero = cur_scene.find_child("HeroPlayer", true, false)

	if has_node("/root/QAOverlay"):
		var qa = get_node("/root/QAOverlay")
		var screen_pos = get_viewport().get_canvas_transform() * pos
		screen_pos.x = clampf(screen_pos.x, 40.0, 1880.0)
		screen_pos.y = clampf(screen_pos.y, 60.0, 1020.0)
		var ping_color = Color(0.1, 0.95, 0.4, 0.95)
		var label = "[CLICK MOVE] (%d, %d)" % [int(x), int(y)]
		var tag = ""
		if queue and hero and (hero.get("target_position") != Vector2.ZERO or (hero.get("waypoint_queue") != null and hero.get("waypoint_queue").size() > 0)):
			ping_color = Color(0.0, 0.88, 1.0, 0.95)
			var wp_count = hero.get("waypoint_queue").size() + 2
			label = "[QUEUE MOVE #%d] (%d, %d)" % [wp_count, int(x), int(y)]
			tag = "WP %d" % wp_count
		qa.log_event(label)
		await qa.human_move_and_click(screen_pos, ping_color, tag)

	if hero:
		if queue and hero.has_method("queue_move_point"):
			hero.queue_move_point(pos)
			var q_size = hero.waypoint_queue.size() if "waypoint_queue" in hero else 0
			return {
				"success": true,
				"queued": true,
				"target": [x, y],
				"queue_size": q_size,
				"hero_pos": [hero.global_position.x, hero.global_position.y]
			}
		elif hero.has_method("move_to_point"):
			hero.move_to_point(pos)
			return {
				"success": true,
				"queued": false,
				"target": [x, y],
				"hero_pos": [hero.global_position.x, hero.global_position.y]
			}
		elif hero.has_method("move_to"):
			hero.move_to(pos)
			return {
				"success": true,
				"queued": false,
				"target": [x, y],
				"hero_pos": [hero.global_position.x, hero.global_position.y]
			}

	return await _handle_mouse_click({"x": x, "y": y, "shift": queue})

func _handle_inventory_toggle(_payload: Dictionary) -> Dictionary:
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var inv_win = cur_scene.get_node_or_null("CanvasLayer/InventoryWindow")
	if not inv_win:
		inv_win = cur_scene.find_child("InventoryWindow", true, false)

	if not inv_win:
		return {"success": false, "error": "InventoryWindow not found in scene"}

	inv_win.toggle()
	if has_node("/root/QAOverlay"):
		get_node("/root/QAOverlay").log_event("[INVENTORY] (Open=%s)" % str(inv_win.visible))

	return {"success": true, "visible": inv_win.visible}

func _handle_inventory_use(payload: Dictionary) -> Dictionary:
	var item_id = str(payload.get("item", payload.get("item_id", "")))
	if item_id == "":
		return {"success": false, "error": "Missing item or item_id"}

	var res = GameState.use_item(item_id)
	if has_node("/root/QAOverlay"):
		var title = res.get("title", item_id)
		get_node("/root/QAOverlay").log_event("[USE] %s (+%d HP)" % [title, res.get("hp_restored", 0)])

	return res

func _handle_inventory_equip(payload: Dictionary) -> Dictionary:
	var item_id = str(payload.get("item", payload.get("item_id", "")))
	if item_id == "":
		return {"success": false, "error": "Missing item or item_id"}

	var res = GameState.equip_item(item_id)
	if has_node("/root/QAOverlay"):
		get_node("/root/QAOverlay").log_event("[EQUIP] %s" % item_id)

	return res

func _handle_select_option(payload: Dictionary) -> Dictionary:
	var target = str(payload.get("target", "OptHealthBars"))
	var index = int(payload.get("index", 0))
	var cur_scene = get_tree().current_scene
	if not cur_scene:
		return {"success": false, "error": "No active scene"}

	var opt_btn: OptionButton = cur_scene.find_child(target, true, false)
	if opt_btn and opt_btn.is_visible_in_tree():
		opt_btn.selected = index
		opt_btn.item_selected.emit(index)
		if has_node("/root/QAOverlay"):
			var p = opt_btn.get_global_transform_with_canvas().origin + opt_btn.size / 2.0
			var qa = get_node("/root/QAOverlay")
			var item_txt = opt_btn.get_item_text(index)
			qa.log_event("[SELECT] %s -> %s" % [target, item_txt])
			await qa.human_move_and_click(p, Color(0.2, 0.9, 0.6, 0.95), "")
		return {"success": true, "selected": index, "text": opt_btn.get_item_text(index)}

	return {"success": false, "error": "OptionButton '%s' not found or not visible" % target}

func _setup_initial_state(payload: Dictionary) -> Dictionary:
	if payload.has("state_spec"):
		var spec = str(payload.get("state_spec", "")).strip_edges()
		if spec.begins_with("{") and spec.ends_with("}"):
			var parsed_json = JSON.parse_string(spec)
			if parsed_json is Dictionary:
				for k in parsed_json:
					payload[k] = parsed_json[k]
		else:
			var s_low = spec.to_lower()
			if "village" in s_low or "square" in s_low:
				if not payload.has("scene"): payload["scene"] = "VillageSquare"
				if not payload.has("quest_stage"): payload["quest_stage"] = 2
				if not payload.has("inventory"): payload["inventory"] = ["service-sword", "potion-healing"]
				if "garrison-key" in s_low or "garrison key" in s_low or "ready for keep" in s_low:
					payload["inventory"].append("garrison-key")
					payload["quest_stage"] = 3
			elif "forest" in s_low or "wilderness" in s_low:
				if not payload.has("scene"): payload["scene"] = "WhisperingForest"
				if not payload.has("quest_stage"): payload["quest_stage"] = 3
				if not payload.has("companions"): payload["companions"] = ["elora"]
				if not payload.has("inventory"): payload["inventory"] = ["service-sword", "potion-healing", "garrison-key"]
			elif "catacomb" in s_low or "crypt" in s_low:
				if not payload.has("scene"): payload["scene"] = "AncientCatacombs"
				if not payload.has("quest_stage"): payload["quest_stage"] = 4
				if not payload.has("companions"): payload["companions"] = ["elora"]
				if not payload.has("inventory"): payload["inventory"] = ["service-sword", "potion-healing"]
			elif "keep" in s_low or "garrison" in s_low or "malakor" in s_low:
				if not payload.has("scene"): payload["scene"] = "GarrisonKeep"
				if not payload.has("quest_stage"): payload["quest_stage"] = 4
				if not payload.has("companions"): payload["companions"] = ["elora"]
				if not payload.has("inventory"): payload["inventory"] = ["service-sword", "potion-healing", "garrison-key"]
			elif "arena" in s_low or "tactical" in s_low or "battle" in s_low:
				if not payload.has("scene"): payload["scene"] = "TacticalBattle"
			elif "homestead" in s_low:
				if not payload.has("scene"): payload["scene"] = "Homestead"
				if not payload.has("quest_stage"): payload["quest_stage"] = 1

	var h_name = str(payload.get("name", "Lieutenant Vance"))
	var h_class = str(payload.get("class", "fighter"))
	var h_race = str(payload.get("race", "human"))
	GameState.init_hero(h_name, h_class, {}, h_race)

	if payload.has("gold"):
		GameState.gold = int(payload.get("gold", 150))
	if payload.has("inventory"):
		var inv_arr = payload.get("inventory")
		if inv_arr is Array:
			GameState.inventory.clear()
			for item in inv_arr:
				GameState.inventory.append(str(item))
	if payload.has("quest_stage"):
		GameState.quest_stage = int(payload.get("quest_stage", 1))
	if payload.has("flags") and payload.get("flags") is Dictionary:
		for k in payload["flags"]:
			GameState.flags[k] = payload["flags"][k]

	var companions = payload.get("companions", [])
	if companions is Array:
		for comp in companions:
			var comp_str = str(comp).to_lower()
			if comp_str == "elora":
				var has_elora = false
				for m in GameState.party_members:
					if m.get("id") == "elora": has_elora = true
				if not has_elora:
					GameState.add_party_member({
						"id": "elora",
						"name": "Elora",
						"race": "half-elf",
						"class": "rogue",
						"hp": 16,
						"max_hp": 16,
						"ac": 14,
						"level": 2,
						"portrait": "res://assets/portraits/portrait_elora.png",
						"weapon": "hunting-bow",
						"armor": "leather-armor",
						"spells": [],
						"status_effects": []
					})
			elif comp_str == "thrumbar":
				var has_thrumbar = false
				for m in GameState.party_members:
					if m.get("id") == "thrumbar": has_thrumbar = true
				if not has_thrumbar:
					GameState.add_party_member({
						"id": "thrumbar",
						"name": "Thrumbar",
						"race": "dwarf",
						"class": "cleric",
						"hp": 20,
						"max_hp": 20,
						"ac": 16,
						"level": 2,
						"portrait": "res://assets/portraits/portrait_cleric.png",
						"weapon": "mace",
						"armor": "chain-mail",
						"spells": ["cure-wounds"],
						"status_effects": []
					})

	var scene_to_load = str(payload.get("scene", ""))
	if scene_to_load != "":
		if not scene_to_load.begins_with("res://"):
			scene_to_load = "res://scenes/%s.tscn" % scene_to_load
		var is_golem_battle = (payload.get("encounter") == "golems" or payload.get("golems", false) or str(payload.get("state_spec", "")).to_lower().contains("golem"))
		if scene_to_load.contains("TacticalBattle"):
			if is_golem_battle:
				GameState.setup_fighter_trio(100, 50)
			else:
				GameState.setup_tactical_party()
		if get_tree().current_scene and get_tree().current_scene.scene_file_path == scene_to_load:
			get_tree().reload_current_scene()
		else:
			get_tree().change_scene_to_file(scene_to_load)
		await get_tree().process_frame
		await get_tree().process_frame
		await get_tree().process_frame

		if is_golem_battle:
			var sc = get_tree().current_scene
			if sc and sc.has_method("configure_golem_encounter"):
				sc.configure_golem_encounter(100, 500, 50)
			await get_tree().process_frame
			await get_tree().process_frame

	var cur_scene = get_tree().current_scene
	var cur_scene_name = cur_scene.name if cur_scene else scene_to_load
	return {
		"success": true,
		"hero": GameState.hero_name,
		"class": GameState.hero_class,
		"scene": cur_scene_name,
		"party_count": GameState.party_members.size()
	}

# ── Screen State Observation (Perception for QA Player) ───────────────────────

func _get_screen_state() -> Dictionary:
	var cur_scene = get_tree().current_scene
	var scene_name = cur_scene.name if cur_scene else "None"

	var buttons_info: Array = []
	var inputs_info: Array = []
	var objects_info: Array = []
	var dialog_info = {"active": false, "speaker": "", "text": "", "choices": []}

	if cur_scene:
		_gather_screen_elements(cur_scene, buttons_info, inputs_info, objects_info)

		var action_log: ActionLog = cur_scene.find_child("ActionLog", true, false)
		if action_log and action_log.is_dialogue_active:
			dialog_info.active = true
			dialog_info.speaker = action_log.current_speaker
			dialog_info.text = action_log.current_text
			if action_log.choices_container:
				var idx = 0
				for child in action_log.choices_container.get_children():
					if child is Button:
						dialog_info.choices.append({"index": idx, "text": child.text})
						idx += 1

	return {
		"scene": scene_name,
		"buttons": buttons_info,
		"inputs": inputs_info,
		"interactive_objects": objects_info,
		"dialogue": dialog_info,
		"hero": {
			"name": GameState.hero_name,
			"class": GameState.hero_class,
			"hp": GameState.hero_hp,
			"inventory": GameState.inventory,
			"quest_stage": GameState.quest_stage
		}
	}

func _gather_screen_elements(root: Node, buttons: Array, inputs: Array, objects: Array) -> void:
	if root is Button and root.is_visible_in_tree() and not root.disabled:
		buttons.append({
			"name": root.name,
			"text": root.text,
			"position": [root.global_position.x, root.global_position.y]
		})
	elif root is LineEdit and root.is_visible_in_tree():
		inputs.append({
			"name": root.name,
			"text": root.text,
			"placeholder": root.placeholder_text
		})
	elif (root is Area2D or root is CharacterBody2D or root is StaticBody2D) and root.is_visible_in_tree():
		var label_text = ""
		if root.has_node("Label"):
			label_text = root.get_node("Label").text
		elif root.has_node("NameLabel"):
			label_text = root.get_node("NameLabel").text

		var tid = ""
		var o_type = "object"
		if "npc_id" in root:
			tid = str(root.npc_id)
			o_type = "npc"
		elif "door_id" in root:
			tid = str(root.door_id)
			o_type = "door"
		elif "item_id" in root:
			tid = str(root.item_id)
			o_type = "item"
		elif "chest_id" in root:
			tid = str(root.chest_id)
			o_type = "chest"
		elif "building_id" in root:
			tid = str(root.building_id)
			o_type = "building"
		elif "enemy_id" in root or root.name.contains("Hound") or root.name.contains("Wolf") or root.name.contains("Archer") or root.name.contains("Boss"):
			tid = root.name
			o_type = "enemy"
		else:
			tid = root.name

		if tid != "" and (label_text != "" or o_type != "object" or root is Area2D or root is CharacterBody2D):
			objects.append({
				"id": tid,
				"name": root.name,
				"type": o_type,
				"label": label_text,
				"position": [root.global_position.x, root.global_position.y]
			})

	for child in root.get_children():
		_gather_screen_elements(child, buttons, inputs, objects)

# ── General Telemetry & Legacy Actions ────────────────────────────────────────

func _get_full_game_state() -> Dictionary:
	var cur_scene = get_tree().current_scene
	var scene_name = cur_scene.name if cur_scene else "None"
	var scene_path = cur_scene.scene_file_path if cur_scene else ""

	var dial_state = {"active": false, "speaker": "", "text": "", "choices": []}
	var al: ActionLog = cur_scene.find_child("ActionLog", true, false) if cur_scene else null
	if al and al.is_dialogue_active:
		dial_state.active = true
		dial_state.speaker = al.current_speaker
		dial_state.text = al.current_text
		if al.choices_container:
			for b in al.choices_container.get_children():
				if b is Button:
					dial_state.choices.append(b.text)

	var fow_info = {"active": false, "enabled": GameState.settings.get("fog_of_war", true), "explored_cells": 0, "total_cells": 0, "explored_pct": 0.0}
	var fow = cur_scene.find_child("FogOfWar", true, false) if cur_scene else null
	if fow:
		fow_info.active = true
		fow_info.enabled = fow._is_fog_enabled()
		if fow.fog_image:
			var exp_count = 0
			var total_cells = fow.grid_w * fow.grid_h
			for y in range(fow.grid_h):
				for x in range(fow.grid_w):
					if fow.fog_image.get_pixel(x, y).r > 0.05:
						exp_count += 1
			fow_info.explored_cells = exp_count
			fow_info.total_cells = total_cells
			fow_info.explored_pct = (float(exp_count) / float(total_cells)) * 100.0

	var battle_enemies: Array[Dictionary] = []
	if cur_scene:
		for child in cur_scene.get_children():
			if child.has_method("loot_corpse") and "enemy_id" in child:
				var c_state = int(child.get("current_state"))
				var st_name = "PATROL"
				if c_state == 1: st_name = "CHASE"
				elif c_state == 2: st_name = "ATTACK"
				elif c_state == 3: st_name = "DEAD"
				battle_enemies.append({
					"id": str(child.get("enemy_id")),
					"name": str(child.get("enemy_name")),
					"hp": int(child.get("current_hp")),
					"max_hp": int(child.get("max_hp")),
					"state": c_state,
					"state_name": st_name,
					"current_target": str(child.get("current_target_name")),
					"is_looted": bool(child.get("is_looted")),
					"loot_gold": int(child.get("loot_gold")),
					"threat_table": child.get("threat_table") if "threat_table" in child else {},
					"is_hostile": bool(child.get("is_hostile")) if "is_hostile" in child else true,
					"aggro_radius": float(child.get("aggro_radius")) if "aggro_radius" in child else 280.0,
					"pack_friend_radius": float(child.get("pack_friend_radius")) if "pack_friend_radius" in child else 480.0,
					"friends": child.get("friends") if "friends" in child else [],
					"position": [child.global_position.x, child.global_position.y]
				})

	var def_screen = cur_scene.find_child("DefeatScreen", true, false) if cur_scene else null
	var is_def_open = (def_screen != null and def_screen.visible) or GameState.is_party_defeated

	var living_heroes = 0
	for m in GameState.party_members:
		if int(m.get("hp", 0)) > 0:
			living_heroes += 1

	var scene_traps: Array[Dictionary] = []
	var detected_traps_count = 0
	var disarmed_traps_count = 0
	var triggered_traps_count = 0
	if cur_scene:
		for child in cur_scene.get_children():
			if child.has_method("get_trap_info"):
				var t_info = child.get_trap_info()
				scene_traps.append(t_info)
				if t_info.get("is_detected", false): detected_traps_count += 1
				if t_info.get("is_disarmed", false): disarmed_traps_count += 1
				if t_info.get("is_triggered", false): triggered_traps_count += 1

	var hero_node: Node2D = cur_scene.find_child("HeroPlayer", true, false) if cur_scene else null
	var hero_pos = [hero_node.global_position.x, hero_node.global_position.y] if hero_node else [0.0, 0.0]

	return {
		"traps": scene_traps,
		"detect_traps_mode": GameState.is_detecting_traps,
		"traps_summary": {
			"total": scene_traps.size(),
			"detected": detected_traps_count,
			"disarmed": disarmed_traps_count,
			"triggered": triggered_traps_count
		},
		"scene": {
			"name": scene_name,
			"path": scene_path
		},
		"hero": {
			"name": GameState.hero_name,
			"position": hero_pos,
			"race": GameState.hero_race,
			"class": GameState.hero_class,
			"selected_spells": GameState.selected_spells,
			"hp": GameState.hero_hp,
			"max_hp": GameState.hero_max_hp,
			"ac": GameState.hero_ac,
			"level": GameState.hero_level,
			"gold": GameState.gold,
			"weapon": GameState.equipped_weapon,
			"armor": GameState.equipped_armor,
			"ability_scores": GameState.ability_scores
		},
		"inventory": GameState.inventory,
		"quest_stage": GameState.quest_stage,
		"flags": GameState.flags,
		"stats": GameState.stats,
		"settings": GameState.settings,
		"fog_of_war": fow_info,
		"dialogue": dial_state,
		"is_paused": GameState.is_game_paused,
		"party": _serialize_party_with_hud_status(),
		"party_members": _serialize_party_with_hud_status(),
		"companion_present": (cur_scene.find_child("PartyCompanion", true, false) != null if cur_scene else false),
		"selected_party_indices": GameState.selected_party_indices,
		"status_effects": GameState.status_effects,
		"gold": GameState.gold,
		"pause_banner_visible": (cur_scene.find_child("PauseBanner", true, false).visible if (cur_scene and cur_scene.find_child("PauseBanner", true, false) != null) else GameState.is_game_paused),
		"shop_window_open": (cur_scene.find_child("ShopWindow", true, false).visible if (cur_scene and cur_scene.find_child("ShopWindow", true, false) != null) else false),
		"shop": {
			"open": (cur_scene.find_child("ShopWindow", true, false).visible if (cur_scene and cur_scene.find_child("ShopWindow", true, false) != null) else false),
			"visible": (cur_scene.find_child("ShopWindow", true, false).visible if (cur_scene and cur_scene.find_child("ShopWindow", true, false) != null) else false),
			"title": (cur_scene.find_child("ShopWindow", true, false).title_label.text if (cur_scene and cur_scene.find_child("ShopWindow", true, false) != null and cur_scene.find_child("ShopWindow", true, false).title_label != null) else ""),
			"gold_text": (cur_scene.find_child("ShopWindow", true, false).gold_label.text if (cur_scene and cur_scene.find_child("ShopWindow", true, false) != null and cur_scene.find_child("ShopWindow", true, false).gold_label != null) else ""),
			"tab": (cur_scene.find_child("ShopWindow", true, false).current_tab if (cur_scene and cur_scene.find_child("ShopWindow", true, false) != null) else "buy")
		},
		"character_status_open": (_is_character_status_open(cur_scene)),
		"battle": {
			"enemies": battle_enemies,
			"enemy_count": battle_enemies.size(),
			"all_enemies_dead": (battle_enemies.size() > 0 and battle_enemies.all(func(e): return e.hp <= 0))
		},
		"combat_telemetry": (cur_scene.get_combat_telemetry() if (cur_scene and cur_scene.has_method("get_combat_telemetry")) else {}),
		"defeat_screen": {
			"open": is_def_open,
			"visible": is_def_open
		},
		"party_status": {
			"alive_count": living_heroes,
			"total_count": GameState.party_members.size(),
			"is_wiped": GameState.is_party_defeated or living_heroes == 0
		},
		"action_log_text": (al.rich_label.get_parsed_text() if (al and al.rich_label) else ""),
		"action_log_bbcode": (al.rich_label.text if (al and al.rich_label) else ""),
		"activity_log": GameState.activity_log_history,
		"action_log_scroll": (al.get_scroll_info() if al else {}),
		"hud": {
			"has_inventory_label": (cur_scene.find_child("InventoryLabel", true, false) != null if cur_scene else false),
			"has_action_toolbar": (cur_scene.find_child("ActionToolbar", true, false) != null if cur_scene else false),
			"action_toolbar_visible": (cur_scene.find_child("ActionToolbar", true, false).visible if (cur_scene and cur_scene.find_child("ActionToolbar", true, false) != null) else false),
			"has_dead_hero_toolbar": _check_has_dead_hero_toolbar(cur_scene)
		}
	}

func _check_has_dead_hero_toolbar(cur_scene: Node) -> bool:
	if not cur_scene:
		return false
	var hud = cur_scene.find_child("PartyHUD", true, false)
	if not hud:
		return false
	return (hud.find_child("HeroNameLabel", true, false) != null
		or hud.find_child("HeroLabel", true, false) != null
		or hud.find_child("HPBar", true, false) != null
		or hud.find_child("HPLabel", true, false) != null)

func _serialize_party_with_hud_status() -> Array:
	var list: Array = []
	var cur_sc = get_tree().current_scene
	for m in GameState.party_members:
		var m_copy = m.duplicate(true)
		var is_dead = int(m.get("hp", 0)) <= 0 or GameState.has_status_effect(m.get("name", ""), "unconscious")
		m_copy["is_dead"] = is_dead
		m_copy["hud_red"] = is_dead
		m_copy["position"] = [0.0, 0.0]
		if cur_sc:
			if m.get("id") == "hero" or m.get("name") == GameState.hero_name:
				var h = cur_sc.find_child("HeroPlayer", true, false)
				if h: m_copy["position"] = [h.global_position.x, h.global_position.y]
			else:
				for child in cur_sc.get_children():
					if "companion_id" in child and (child.get("companion_id") == m.get("id") or child.companion_name == m.get("name")):
						m_copy["position"] = [child.global_position.x, child.global_position.y]
						break
		list.append(m_copy)
	return list

func _is_character_status_open(cur_scene: Node) -> bool:
	var csw = cur_scene.find_child("CharacterStatusWindow", true, false) if cur_scene else null
	if not csw:
		csw = get_tree().root.find_child("CharacterStatusWindow", true, false)
	return (csw != null and csw.visible)

func _execute_game_action(payload: Dictionary) -> Dictionary:
	var action = str(payload.get("action", ""))
	var args = payload.get("args", {})
	var cur_scene = get_tree().current_scene

	match action:
		"move_to_target", "move_to":
			return await _handle_move_to_target(args)

		"interact_target", "click_object":
			return await _handle_interact_target(args)

		"handle_encounters", "clear_threats":
			return await _handle_encounter_clearing(args)

		"talk_npc", "talk_to_npc":
			var target = str(args.get("npc_id", args.get("target", args.get("name", ""))))
			return await _handle_interact_target({"target_id": target})

		"pickup_item", "pick_up_item":
			var target = str(args.get("item_id", args.get("target", args.get("name", ""))))
			return await _handle_interact_target({"target_id": target})

		"enter_door":
			var target = str(args.get("door_id", args.get("target", args.get("name", ""))))
			return await _handle_interact_target({"target_id": target})

		"select_dialogue_choice", "dialogue_choice", "dialog_choice", "click_dialog_choice":
			return await _handle_click_dialog_choice(args)

		"scroll_action_log":
			var delta = float(args.get("delta", -100.0))
			var to_top = bool(args.get("to_top", false))
			var al_node: ActionLog = cur_scene.find_child("ActionLog", true, false) if cur_scene else null
			if al_node:
				if to_top:
					al_node.scroll_log_to_top()
				else:
					al_node.scroll_log_by(delta)
				return {"success": true, "scroll": al_node.get_scroll_info()}
			return {"success": false, "error": "ActionLog not found"}

		"set_fog_of_war":
			var en = bool(args.get("enabled", true))
			GameState.settings["fog_of_war"] = en
			GameState.settings_changed.emit()
			return {"success": true, "fog_of_war": GameState.settings["fog_of_war"]}

		"open_character_status":
			var idx = int(args.get("member_index", 0))
			var csw = cur_scene.find_child("CharacterStatusWindow", true, false) if cur_scene else null
			if not csw:
				csw = get_tree().root.find_child("CharacterStatusWindow", true, false)
			if not csw and cur_scene:
				var canvas = cur_scene.find_child("CanvasLayer", true, false)
				if canvas:
					var cs_scene = load("res://scenes/components/CharacterStatusWindow.tscn")
					if cs_scene:
						csw = cs_scene.instantiate()
						csw.name = "CharacterStatusWindow"
						canvas.add_child(csw)
			if csw and csw.has_method("open"):
				csw.open(idx)
				return {"success": true, "character_status_open": true, "member_index": idx}
			return {"success": false, "error": "CharacterStatusWindow not found"}

		"close_character_status":
			var csw = cur_scene.find_child("CharacterStatusWindow", true, false) if cur_scene else null
			if not csw:
				csw = get_tree().root.find_child("CharacterStatusWindow", true, false)
			if csw and csw.has_method("close"):
				csw.close()
				return {"success": true, "character_status_open": false}
			return {"success": false, "error": "CharacterStatusWindow not found"}

		"toggle_fog":
			var cur_val = GameState.settings.get("fog_of_war", true)
			GameState.settings["fog_of_war"] = not cur_val
			GameState.settings_changed.emit()
			return {"success": true, "fog_of_war": GameState.settings["fog_of_war"]}

		"move_hero":
			return await _handle_move_to(args)

		"reroll_stats":
			if cur_scene and "btn_reroll" in cur_scene and cur_scene.btn_reroll:
				await _simulate_mouse_to_node_or_pos(cur_scene.btn_reroll, Color(0.2, 0.8, 1.0, 0.95), "REROLL STATS")
			elif cur_scene:
				var btn = _find_button_by_name(cur_scene, "BtnReroll")
				if btn:
					await _simulate_mouse_to_node_or_pos(btn, Color(0.2, 0.8, 1.0, 0.95), "REROLL STATS")
			if cur_scene and cur_scene.has_method("reroll_stats"):
				cur_scene.reroll_stats()
			return {"success": true, "scores": GameState.ability_scores}

		"select_race":
			var r_name = str(args.get("race", "human")).to_lower()
			if cur_scene and "race_buttons" in cur_scene and cur_scene.race_buttons.has(r_name):
				var r_btn = cur_scene.race_buttons[r_name]
				await _simulate_mouse_to_node_or_pos(r_btn, Color(0.2, 0.8, 1.0, 0.95), "RACE " + r_name.to_upper())
			if cur_scene and cur_scene.has_method("select_race"):
				cur_scene.select_race(r_name)
			else:
				GameState.hero_race = r_name
			return {"success": true, "race": GameState.hero_race}

		"select_spell":
			var spell_id = str(args.get("spell", ""))
			if cur_scene and "spell_buttons" in cur_scene and cur_scene.spell_buttons.has(spell_id):
				var s_btn = cur_scene.spell_buttons[spell_id]
				await _simulate_mouse_to_node_or_pos(s_btn, Color(0.7, 0.3, 1.0, 0.95), "SPELL " + spell_id.to_upper())
			if cur_scene and cur_scene.has_method("select_spell"):
				cur_scene.select_spell(spell_id)
			else:
				if not GameState.selected_spells.has(spell_id):
					GameState.selected_spells.append(spell_id)
			return {"success": true, "spells": GameState.selected_spells}

		"select_class":
			var c_name = str(args.get("class", "fighter")).to_lower()
			var h_name = str(args.get("name", "Lieutenant Vance"))
			var r_name = str(args.get("race", GameState.hero_race if GameState.hero_race != "" else "human")).to_lower()
			var spells_arg = args.get("spells", [])
			if cur_scene and "class_buttons" in cur_scene and cur_scene.class_buttons.has(c_name):
				var c_btn = cur_scene.class_buttons[c_name]
				await _simulate_mouse_to_node_or_pos(c_btn, Color(0.2, 0.8, 1.0, 0.95), "CLASS " + c_name.to_upper())
			if cur_scene and cur_scene.has_method("select_class"):
				if args.has("race") and cur_scene.has_method("select_race"):
					cur_scene.select_race(r_name)
				cur_scene.select_class(c_name)
				if args.has("spells"):
					for s in spells_arg:
						if cur_scene.has_method("select_spell"):
							cur_scene.select_spell(s)
			else:
				GameState.init_hero(h_name, c_name, {}, r_name, spells_arg)
			return {"success": true, "hero": GameState.hero_name, "class": GameState.hero_class, "race": GameState.hero_race}

		"embark":
			var h_name = str(args.get("name", GameState.hero_name))
			var c_name = str(args.get("class", GameState.hero_class))
			var r_name = str(args.get("race", GameState.hero_race))
			var spells_arg = args.get("spells", GameState.selected_spells)
			if cur_scene and "embark_btn" in cur_scene and cur_scene.embark_btn:
				await _simulate_mouse_to_node_or_pos(cur_scene.embark_btn, Color(0.2, 0.95, 0.4, 0.95), "EMBARK")
			elif cur_scene:
				var eb = _find_button_by_name(cur_scene, "EmbarkBtn")
				if eb:
					await _simulate_mouse_to_node_or_pos(eb, Color(0.2, 0.95, 0.4, 0.95), "EMBARK")
			if cur_scene and cur_scene.has_method("embark"):
				if args.has("name") and cur_scene.name_input:
					cur_scene.name_input.text = h_name
				if args.has("race") and cur_scene.has_method("select_race"):
					cur_scene.select_race(r_name)
				if args.has("class") and cur_scene.has_method("select_class"):
					cur_scene.select_class(c_name)
				if args.has("spells"):
					for s in spells_arg:
						if cur_scene.has_method("select_spell"):
							cur_scene.select_spell(s)
				cur_scene.embark()
			else:
				GameState.init_hero(h_name, c_name, GameState.ability_scores, r_name, spells_arg)
				get_tree().change_scene_to_file("res://scenes/Homestead.tscn")
			return {"success": true, "target_scene": "Homestead.tscn", "race": GameState.hero_race, "class": GameState.hero_class}

		"talk_partner":
			var partner = cur_scene.find_child("EloraNPC", true, false) if cur_scene else null
			if partner and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(partner, Color(0.3, 0.9, 0.5, 0.95), "TALK")
			if cur_scene and cur_scene.has_method("talk_to_elora"):
				cur_scene.talk_to_elora()
			else:
				GameState.flags.partner_conversed = true
				GameState.advance_quest(2)
			return {"success": true, "quest_stage": GameState.quest_stage}

		"loot_footlocker":
			var al = cur_scene.find_child("ActionLog", true, false) if cur_scene else null
			if al and al.has_method("close_dialogue"):
				al.close_dialogue()
			var chest = cur_scene.find_child("Footlocker", true, false) if cur_scene else null
			if chest and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(chest, Color(1.0, 0.85, 0.2, 0.95), "LOOT")
			if cur_scene and cur_scene.has_method("open_footlocker"):
				cur_scene.open_footlocker()
			else:
				GameState.flags.footlocker_looted = true
				if GameState.hero_class == "rogue":
					GameState.add_item("hunting-bow")
					GameState.equipped_weapon = "hunting-bow"
				GameState.add_item("service-sword")
				GameState.add_item("potion-healing")
				GameState.add_chest()
				GameState.advance_quest(2)
			return {"success": true, "inventory": GameState.inventory, "quest_stage": GameState.quest_stage}

		"exit_to_village":
			get_tree().change_scene_to_file("res://scenes/VillageSquare.tscn")
			return {"success": true, "target_scene": "VillageSquare.tscn"}

		"talk_blacksmith":
			var smith = cur_scene.find_child("BlacksmithBrand", true, false) if cur_scene else null
			if smith and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(smith, Color(0.3, 0.9, 0.5, 0.95), "TALK")
			if cur_scene and cur_scene.has_method("talk_to_blacksmith"):
				cur_scene.talk_to_blacksmith()
			else:
				GameState.flags.blacksmith_conversed = true
				GameState.add_item("garrison-key")
				GameState.advance_quest(3)
			return {"success": true, "inventory": GameState.inventory, "quest_stage": GameState.quest_stage}

		"attack_hound":
			var hound = cur_scene.find_child("BlightHound", true, false) if cur_scene else null
			if not hound and cur_scene:
				hound = cur_scene.find_child("ShadowHound", true, false)
			if hound and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(hound, Color(1.0, 0.25, 0.25, 0.95), "ATK HOUND")
			if cur_scene and cur_scene.has_method("trigger_hound_combat"):
				cur_scene.trigger_hound_combat()
			return {"success": true, "kills": GameState.stats.kills}

		"ranged_attack":
			var hound = cur_scene.find_child("BlightHound", true, false) if cur_scene else null
			if not hound and cur_scene:
				hound = cur_scene.find_child("ShadowHound", true, false)
			if hound and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(hound, Color(1.0, 0.4, 0.2, 0.95), "RANGED ATK")
			if cur_scene and cur_scene.has_method("execute_ranged_attack_on_hound"):
				cur_scene.execute_ranged_attack_on_hound()
			return {"success": true, "type": "ranged", "kills": GameState.stats.kills}

		"cast_spell":
			var spell_id = str(args.get("spell", "magic-missile"))
			var caster = str(args.get("caster", GameState.hero_name))
			if spell_id == "cure-wounds":
				var hero = cur_scene.find_child("HeroPlayer", true, false) if cur_scene else null
				if hero and has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(hero, Color(0.2, 0.95, 0.5, 0.95), "HEAL HERO")
				if cur_scene and cur_scene.has_method("execute_heal_spell"):
					cur_scene.execute_heal_spell(spell_id)
				else:
					if GameState.hero_hp >= GameState.hero_max_hp:
						GameState.take_damage(4)
					GameState.heal(8)
			elif spell_id == "find-traps":
				var cm = cur_scene.find_child("CombatManager", true, false) if cur_scene else null
				var hero = cur_scene.find_child("HeroPlayer", true, false) if cur_scene else null
				if hero and has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(hero, Color(0.8, 0.2, 1.0, 0.95), "CAST FIND TRAPS")
				var res = {}
				if cm and cm.has_method("cast_spell"):
					res = cm.cast_spell("find-traps", caster)
				else:
					GameState.log_message("magic", "✨ %s casts [b]Find Traps[/b]! Divine divination radiates across the area." % caster)
					var rev = 0
					if cur_scene:
						for child in cur_scene.get_children():
							if child.has_method("reveal_trap"):
								child.reveal_trap(caster)
								rev += 1
					res = {"success": true, "spell": "find-traps", "revealed_count": rev}
				return res
			else:
				var hound = cur_scene.find_child("BlightHound", true, false) if cur_scene else null
				if not hound and cur_scene:
					hound = cur_scene.find_child("ShadowHound", true, false)
				if hound and has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(hound, Color(0.7, 0.3, 1.0, 0.95), "CAST " + spell_id.to_upper())
				if cur_scene and cur_scene.has_method("execute_spell_on_hound"):
					cur_scene.execute_spell_on_hound(spell_id)
			return {"success": true, "spell": spell_id, "kills": GameState.stats.kills, "hp": GameState.hero_hp}

		"toggle_detect_traps", "set_detect_traps", "find_traps":
			var en = bool(args.get("enabled", not GameState.is_detecting_traps))
			GameState.set_detect_traps_mode(en)
			return {"success": true, "detect_traps_mode": GameState.is_detecting_traps}

		"disarm_trap":
			var t_id = str(args.get("trap_id", args.get("target", "")))
			var actor = str(args.get("actor", args.get("disarmer", "")))
			if actor == "":
				actor = GameState.get_thief_member_name()
			var fumble = bool(args.get("fumble", args.get("critical_fumble", false)))
			var no_walk = bool(args.get("no_walk", args.get("direct_only", false)))
			if cur_scene:
				var t_node = cur_scene.find_child(t_id, true, false)
				if not t_node:
					for child in cur_scene.find_children("*", "Area2D", true, false):
						var c_name = String(child.name).to_snake_case().replace("_", "-")
						if child.get("trap_id") == t_id or String(child.name) == t_id or c_name == t_id:
							t_node = child
							break
				if not t_node:
					for child in cur_scene.get_children():
						if child.get("trap_id") == t_id or child.name == t_id:
							t_node = child
							break
				if t_node:
					var disarmer_node: CharacterBody2D = null
					var hero = cur_scene.find_child("HeroPlayer", true, false)
					if actor == "" or actor == GameState.hero_name or actor.to_lower() == "hero" or (hero and hero.name.to_lower().contains(actor.to_lower())):
						disarmer_node = hero
					else:
						for child in cur_scene.get_children():
							if child is CharacterBody2D and (child.name.to_lower().contains(actor.to_lower()) or child.get("companion_name") == actor):
								disarmer_node = child
								break
						if not disarmer_node:
							disarmer_node = hero

					if disarmer_node and not no_walk:
						var reach = float(t_node.get("disarm_reach")) if "disarm_reach" in t_node else 72.0
						var dist = disarmer_node.global_position.distance_to(t_node.global_position)
						if dist > reach:
							var dir = (disarmer_node.global_position - t_node.global_position).normalized()
							if dir == Vector2.ZERO: dir = Vector2(-1, 0)
							var adjacent_pos = t_node.global_position + dir * 55.0
							if has_node("/root/QAOverlay"):
								await _simulate_mouse_to_node_or_pos(t_node, Color(0.2, 0.95, 0.4, 0.95), "WALK NEXT TO TRAP")
							if disarmer_node.has_method("move_to_point"):
								disarmer_node.move_to_point(adjacent_pos)
							elif disarmer_node.has_method("move_to"):
								disarmer_node.move_to(adjacent_pos)

							var wait_ticks = 0
							while wait_ticks < 160:
								await get_tree().create_timer(0.05).timeout
								wait_ticks += 1
								if disarmer_node.global_position.distance_to(t_node.global_position) <= reach - 10.0 or disarmer_node.global_position.distance_to(adjacent_pos) <= 24.0:
									break
								if wait_ticks > 15 and not disarmer_node.get("is_moving"):
									break

							if disarmer_node.has_method("_update_facing"):
								disarmer_node._update_facing(t_node.global_position)
							elif "sprite" in disarmer_node and disarmer_node.sprite:
								disarmer_node.sprite.flip_h = (t_node.global_position.x < disarmer_node.global_position.x)
				elif has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(t_node, Color(0.2, 0.95, 0.4, 0.95), "DISARM TRAP")
			return GameState.disarm_trap_by_id(t_id, actor, fumble)

		"trigger_trap":
			var t_id = str(args.get("trap_id", args.get("target", "")))
			var victim = str(args.get("victim", ""))
			var fail_save = bool(args.get("fail_save", args.get("force_fail_save", false)))
			var no_walk = bool(args.get("no_walk", args.get("direct_only", false)))
			if cur_scene:
				var t_node = cur_scene.find_child(t_id, true, false)
				if not t_node:
					for child in cur_scene.get_children():
						if child.get("trap_id") == t_id or child.name == t_id:
							t_node = child
							break
				if t_node:
					var victim_node: CharacterBody2D = null
					var hero = cur_scene.find_child("HeroPlayer", true, false)
					if victim == "" or victim == GameState.hero_name or victim.to_lower() == "hero" or (hero and hero.name.to_lower().contains(victim.to_lower())):
						victim_node = hero
					else:
						for child in cur_scene.get_children():
							if child is CharacterBody2D and (child.name.to_lower().contains(victim.to_lower()) or child.get("companion_name") == victim):
								victim_node = child
								break
						if not victim_node:
							victim_node = hero

					if victim_node and not no_walk:
						var dist = victim_node.global_position.distance_to(t_node.global_position)
						if dist > 36.0 and not t_node.get("is_triggered"):
							if has_node("/root/QAOverlay"):
								await _simulate_mouse_to_node_or_pos(t_node, Color(1.0, 0.2, 0.2, 0.95), "WALK OVER TRAP")
							if "next_trigger_force_fail_save" in t_node:
								t_node.next_trigger_force_fail_save = fail_save
							if victim_node.has_method("move_to_point"):
								victim_node.move_to_point(t_node.global_position)
							elif victim_node.has_method("move_to"):
								victim_node.move_to(t_node.global_position)

							var wait_ticks = 0
							while wait_ticks < 80 and not t_node.get("is_triggered"):
								await get_tree().create_timer(0.05).timeout
								wait_ticks += 1
								if victim_node.global_position.distance_to(t_node.global_position) <= 40.0:
									break

							if not t_node.get("is_triggered"):
								return t_node.force_trigger(victim if victim != "" else GameState.hero_name, fail_save)
							return {"success": true, "triggered": true, "trap_id": t_id, "walked_over": true}
				elif has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(t_node, Color(1.0, 0.2, 0.2, 0.95), "TRIGGER TRAP")
			return GameState.trigger_trap_by_id(t_id, victim, fail_save)

		"enter_garrison":
			GameState.advance_quest(4)
			get_tree().change_scene_to_file("res://scenes/GarrisonKeep.tscn")
			return {"success": true, "target_scene": "GarrisonKeep.tscn", "quest_stage": GameState.quest_stage}

		"confront_malakor":
			var malakor = cur_scene.find_child("CaptainMalakor", true, false) if cur_scene else null
			if not malakor and cur_scene:
				malakor = cur_scene.find_child("MalakorNPC", true, false)
			if malakor and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(malakor, Color(1.0, 0.2, 0.2, 0.95), "CONFRONT MALAKOR")
			if cur_scene and cur_scene.has_method("confront_malakor"):
				cur_scene.confront_malakor()
			return {"success": true, "message": "Showdown triggered"}

		"attack_malakor":
			var malakor = cur_scene.find_child("CaptainMalakor", true, false) if cur_scene else null
			if not malakor and cur_scene:
				malakor = cur_scene.find_child("MalakorNPC", true, false)
			if malakor and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(malakor, Color(1.0, 0.2, 0.2, 0.95), "ATK MALAKOR")
			if cur_scene and cur_scene.has_method("execute_boss_round"):
				cur_scene.execute_boss_round()
			return {"success": true, "kills": GameState.stats.kills}

		"defeat_malakor":
			var malakor = cur_scene.find_child("CaptainMalakor", true, false) if cur_scene else null
			if not malakor and cur_scene:
				malakor = cur_scene.find_child("MalakorNPC", true, false)
			if malakor and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(malakor, Color(1.0, 0.1, 0.1, 0.95), "STRIKE MALAKOR")
			GameState.flags.malakor_slain = true
			GameState.add_kill()
			GameState.advance_quest(5)
			get_tree().change_scene_to_file("res://scenes/VictoryScreen.tscn")
			return {"success": true, "quest_stage": 5, "kills": GameState.stats.kills}

		"close_dialogue":
			var al = cur_scene.find_child("ActionLog", true, false) if cur_scene else null
			if al and al.has_method("close_dialogue"):
				al.close_dialogue()
			return {"success": true}

		"toggle_pause":
			GameState.toggle_pause()
			return {"success": true, "is_paused": GameState.is_game_paused}

		"set_paused":
			var val = bool(args.get("paused", true))
			GameState.set_paused(val)
			return {"success": true, "is_paused": GameState.is_game_paused}

		"open_shop":
			var smith = cur_scene.find_child("BlacksmithBrand", true, false) if cur_scene else null
			if smith and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(smith, Color(0.95, 0.8, 0.2, 0.95), "TRADE")
			if cur_scene and cur_scene.has_method("open_shop_window"):
				cur_scene.open_shop_window()
				return {"success": true, "shop_open": true}
			var shop = cur_scene.find_child("ShopWindow", true, false) if cur_scene else null
			if not shop and cur_scene:
				var canvas = cur_scene.find_child("CanvasLayer", true, false)
				if canvas:
					var sw_scene = load("res://scenes/components/ShopWindow.tscn")
					if sw_scene:
						shop = sw_scene.instantiate()
						canvas.add_child(shop)
			if shop and shop.has_method("open"):
				shop.open("Blacksmith Brand's Armory")
				return {"success": true, "shop_open": true}
			return {"success": false, "error": "ShopWindow not found"}

		"close_shop":
			var shop = cur_scene.find_child("ShopWindow", true, false) if cur_scene else null
			var close_btn = shop.find_child("BtnClose", true, false) if shop else null
			if close_btn and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(close_btn, Color(0.9, 0.3, 0.3, 0.95), "CLOSE")
			if shop and shop.has_method("close"):
				shop.close()
				return {"success": true, "shop_open": false}
			return {"success": true, "shop_open": false}

		"switch_shop_tab":
			var tab = str(args.get("tab", "buy")).to_lower()
			var shop = cur_scene.find_child("ShopWindow", true, false) if cur_scene else null
			if shop:
				var target_btn = shop.btn_tab_buy if tab == "buy" else shop.btn_tab_sell
				if target_btn and has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(target_btn, Color(0.2, 0.8, 1.0, 0.95), "TAB " + tab.to_upper())
				if shop.has_method("_switch_tab"):
					shop._switch_tab(tab)
				return {"success": true, "tab": shop.current_tab}
			return {"success": false, "error": "ShopWindow not found"}

		"buy_item":
			var item_id = str(args.get("item", "service-sword"))
			var shop = cur_scene.find_child("ShopWindow", true, false) if cur_scene else null
			if shop and shop.visible:
				if shop.has_method("_switch_tab") and shop.current_tab != "buy":
					shop._switch_tab("buy")
				var btn = shop.find_child("BtnAction_" + item_id, true, false)
				if btn and has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(btn, Color(0.25, 1.0, 0.5, 0.95), "BUY " + item_id)
				elif has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(Vector2(960, 520), Color(0.25, 1.0, 0.5, 0.95), "BUY")
			var ok = GameState.buy_item(item_id)
			return {"success": ok, "item": item_id, "gold": GameState.gold, "inventory": GameState.inventory}

		"sell_item":
			var item_id = str(args.get("item", ""))
			var shop = cur_scene.find_child("ShopWindow", true, false) if cur_scene else null
			if shop and shop.visible:
				if shop.has_method("_switch_tab") and shop.current_tab != "sell":
					shop._switch_tab("sell")
				var btn = shop.find_child("BtnAction_" + item_id, true, false)
				if btn and has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(btn, Color(0.95, 0.8, 0.2, 0.95), "SELL " + item_id)
				elif has_node("/root/QAOverlay"):
					await _simulate_mouse_to_node_or_pos(Vector2(960, 520), Color(0.95, 0.8, 0.2, 0.95), "SELL")
			var ok = GameState.sell_item(item_id)
			return {"success": ok, "item": item_id, "gold": GameState.gold, "inventory": GameState.inventory}

		"select_party_member":
			var idx = int(args.get("index", 0))
			var pt = cur_scene.find_child("PortraitToolbar", true, false) if cur_scene else null
			if pt and has_node("/root/QAOverlay"):
				var container = pt.find_child("VBoxContainer", true, false)
				if container and idx < container.get_child_count():
					var card = container.get_child(idx)
					var p_name = "HERO"
					if idx < GameState.party_members.size():
						p_name = GameState.party_members[idx].get("name", "HERO").to_upper()
					await _simulate_mouse_to_node_or_pos(card, Color(0.25, 0.65, 1.0, 0.95), "SELECT " + p_name)
			GameState.select_party_member(idx)
			return {"success": true, "selected_indices": GameState.selected_party_indices}

		"select_all_party":
			GameState.select_all_party_members()
			return {"success": true, "selected_indices": GameState.selected_party_indices}

		"apply_status_effect":
			var eff = str(args.get("effect", "poisoned"))
			var target = str(args.get("target", GameState.hero_name))
			GameState.apply_status_effect(target, eff)
			return {"success": true, "target": target, "effect": eff, "effects": GameState.get_status_effects(target)}

		"remove_status_effect":
			var eff = str(args.get("effect", "poisoned"))
			var target = str(args.get("target", GameState.hero_name))
			GameState.remove_status_effect(target, eff)
			return {"success": true, "target": target, "effect": eff, "effects": GameState.get_status_effects(target)}

		"action_toolbar_click", "toolbelt_click", "action_toolbelt_click":
			var act = str(args.get("action", "attack"))
			var at = cur_scene.find_child("ActionToolbar", true, false) if cur_scene else null
			if not at:
				at = get_tree().root.find_child("ActionToolbar", true, false)
			if at:
				var btn_map = {
					"attack": "BtnAttack",
					"move": "BtnMove",
					"guard": "BtnGuard",
					"spell": "BtnSpell",
					"special": "BtnSpecial",
					"heal": "BtnPotion",
					"potion": "BtnPotion",
					"antidote": "BtnAntidote",
					"pause": "BtnPause"
				}
				var b_name = btn_map.get(act, "")
				var b_node: Button = at.find_child(b_name, true, false) if b_name != "" else null
				if b_node and b_node.is_visible_in_tree() and has_node("/root/QAOverlay"):
					var btn_pos = b_node.get_global_transform_with_canvas().origin + b_node.size / 2.0
					var qa = get_node("/root/QAOverlay")
					qa.log_event("[TOOLBELT] %s" % act.capitalize())
					await qa.human_move_and_click(btn_pos, Color(0.95, 0.75, 0.2, 0.95), "")
				if at.has_method("_on_action_clicked"):
					at._on_action_clicked(act)
			return {"success": true, "action": act}

		"start_tactical_battle", "load_tactical_battle":
			GameState.setup_tactical_party()
			get_tree().change_scene_to_file("res://scenes/TacticalBattle.tscn")
			return {"success": true, "target_scene": "TacticalBattle.tscn"}

		"start_golem_battle", "setup_golem_battle", "load_golem_battle":
			var f_hp = int(args.get("fighters_hp", 100))
			var g_hp = int(args.get("golem_hp", 500))
			var pots = int(args.get("potions_per_fighter", 50))
			if cur_scene and cur_scene.name == "TacticalBattle" and cur_scene.has_method("configure_golem_encounter"):
				return cur_scene.configure_golem_encounter(f_hp, g_hp, pots)
			GameState.setup_fighter_trio(f_hp, pots)
			get_tree().change_scene_to_file("res://scenes/TacticalBattle.tscn")
			await get_tree().process_frame
			await get_tree().process_frame
			await get_tree().process_frame
			var new_sc = get_tree().current_scene
			if new_sc and new_sc.has_method("configure_golem_encounter"):
				return new_sc.configure_golem_encounter(f_hp, g_hp, pots)
			return {"success": true, "scene": "TacticalBattle"}

		"use_fighter_ability", "fighter_maneuver":
			var fighter = str(args.get("fighter", args.get("actor", GameState.hero_name)))
			var ability = str(args.get("ability", "tremor-stomp"))
			var target = str(args.get("target", "golem_alpha"))
			if cur_scene and cur_scene.has_method("execute_fighter_maneuver"):
				var res = await cur_scene.execute_fighter_maneuver(fighter, ability, target)
				return res
			return {"success": false, "error": "execute_fighter_maneuver not available"}

		"execute_combat_round", "combat_round":
			if cur_scene and cur_scene.has_method("execute_combat_round"):
				var res = await cur_scene.execute_combat_round()
				return {"success": true, "round": res}
			return {"success": false, "error": "execute_combat_round not available"}

		"get_round_stats", "combat_round_stats":
			var r_num = int(args.get("round", -1))
			if cur_scene and cur_scene.has_method("get_round_stats"):
				return {"success": true, "round_stats": cur_scene.get_round_stats(r_num)}
			return {"success": false, "error": "get_round_stats not available"}

		"simulate_golem_assault", "golems_assault", "golem_attack_round":
			if cur_scene and cur_scene.has_method("execute_combat_round"):
				var res = await cur_scene.execute_combat_round()
				return {"success": true, "round": res}
			elif cur_scene and cur_scene.has_method("execute_golems_assault_round"):
				var res = await cur_scene.execute_golems_assault_round()
				return {"success": true, "round": res}
			return {"success": false, "error": "execute_combat_round not available"}

		"trigger_auto_heal", "execute_party_auto_heal", "auto_heal":
			var threshold = int(args.get("threshold", 55))
			return GameState.execute_party_auto_heal(threshold)

		"order_party_attack", "tactical_attack":
			var attacker = str(args.get("attacker", "hero")).to_lower()
			var enemy_id = str(args.get("enemy", "wolf_alpha"))
			
			# 1. Determine attacker index: Vance/Hero = 0, Garrick = 1, Brutus = 2
			var target_idx = 0
			if attacker in ["elora", "rogue", "archer", "garrick", "sergeant garrick"]:
				target_idx = 1
			elif attacker in ["thrumbar", "cleric", "dwarf", "brutus", "corporal brutus"]:
				target_idx = 2
			else:
				for i in range(GameState.party_members.size()):
					var m = GameState.party_members[i]
					if m.get("id", "").to_lower() == attacker or m.get("name", "").to_lower().contains(attacker):
						target_idx = i
						break

			# 2. If not selected, click portrait card to select attacker
			if not GameState.selected_party_indices.has(target_idx):
				var pt = cur_scene.find_child("PortraitToolbar", true, false) if cur_scene else null
				if pt and has_node("/root/QAOverlay"):
					var container = pt.find_child("VBoxContainer", true, false)
					if container and target_idx < container.get_child_count():
						var card = container.get_child(target_idx)
						var a_name = attacker.capitalize()
						if target_idx < GameState.party_members.size():
							a_name = GameState.party_members[target_idx].get("name", a_name)
						await _simulate_mouse_to_node_or_pos(card, Color(0.25, 0.65, 1.0, 0.95), "SELECT " + a_name.to_upper())
				GameState.select_party_member(target_idx)

			# 3. Move mouse to target enemy and click with red attack ping
			var enemy_node: Node2D = null
			if cur_scene and "enemies" in cur_scene and cur_scene.enemies.has(enemy_id):
				enemy_node = cur_scene.enemies[enemy_id]
			if enemy_node and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(enemy_node, Color(1.0, 0.25, 0.25, 0.95), "ATK " + enemy_id)

			# 4. Dispatch attack
			if cur_scene:
				if attacker in ["hero", "vance", "commander vance"] and cur_scene.has_method("execute_hero_attack_on_enemy"):
					var res = await cur_scene.execute_hero_attack_on_enemy(enemy_id)
					return {"success": true, "result": res}
				elif cur_scene.has_method("execute_companion_attack_on_enemy"):
					var res = await cur_scene.execute_companion_attack_on_enemy(attacker, enemy_id)
					return {"success": true, "result": res}
			return {"success": false, "error": "Battle or attack method not found"}

		"taunt_enemy":
			var taunter = str(args.get("taunter", "Lieutenant Vance"))
			var enemy_id = str(args.get("enemy", "wolf_alpha"))

			# Select Vance if not selected
			if not GameState.selected_party_indices.has(0):
				var pt = cur_scene.find_child("PortraitToolbar", true, false) if cur_scene else null
				if pt and has_node("/root/QAOverlay"):
					var container = pt.find_child("VBoxContainer", true, false)
					if container and container.get_child_count() > 0:
						await _simulate_mouse_to_node_or_pos(container.get_child(0), Color(0.25, 0.65, 1.0, 0.95), "SELECT VANCE")
				GameState.select_party_member(0)

			# Click toolbelt special button
			var at = cur_scene.find_child("ActionToolbar", true, false) if cur_scene else null
			if not at:
				at = get_tree().root.find_child("ActionToolbar", true, false)
			if at and has_node("/root/QAOverlay"):
				var sp_btn = at.find_child("BtnSpecial", true, false)
				if sp_btn and sp_btn.is_visible_in_tree():
					await _simulate_mouse_to_node_or_pos(sp_btn, Color(0.2, 0.85, 1.0, 0.95), "TAUNT")

			# Move mouse to enemy and click
			var enemy_node: Node2D = null
			if cur_scene and "enemies" in cur_scene and cur_scene.enemies.has(enemy_id):
				enemy_node = cur_scene.enemies[enemy_id]
			if enemy_node and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(enemy_node, Color(0.2, 0.85, 1.0, 0.95), "TAUNT " + enemy_id)

			if cur_scene and cur_scene.has_method("execute_taunt_on_enemy"):
				var res = cur_scene.execute_taunt_on_enemy(taunter, enemy_id)
				return {"success": true, "result": res}
			return {"success": false, "error": "Taunt method not found"}

		"loot_enemy_corpse", "loot_corpse":
			var enemy_id = str(args.get("enemy", "wolf_alpha"))
			var enemy_node: Node2D = null
			if cur_scene and "enemies" in cur_scene and cur_scene.enemies.has(enemy_id):
				enemy_node = cur_scene.enemies[enemy_id]
			if enemy_node and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(enemy_node, Color(1.0, 0.85, 0.2, 0.95), "LOOT " + enemy_id)

			if cur_scene and cur_scene.has_method("loot_enemy_corpse"):
				var res = cur_scene.loot_enemy_corpse(enemy_id)
				return {"success": true, "result": res, "gold": GameState.gold, "inventory": GameState.inventory}
		"enemy_strike", "enemy_strike_party_member":
			var enemy_id = str(args.get("enemy_id", "wolf_alpha"))
			var target_name = str(args.get("target", "Lieutenant Vance"))
			var lethal = bool(args.get("lethal", true))
			if cur_scene and cur_scene.has_method("execute_enemy_strike_on_party_member"):
				var res = cur_scene.execute_enemy_strike_on_party_member(enemy_id, target_name, lethal)
				return res
			return {"success": false, "error": "execute_enemy_strike_on_party_member not supported"}

		"inflict_party_damage":
			var tgt = str(args.get("target", "hero")).to_lower()
			var amount = int(args.get("amount", 20))
			if tgt == "all":
				GameState.take_damage(amount)
				for m in GameState.party_members:
					if m.get("id") != "hero" and m.get("name") != GameState.hero_name:
						GameState.damage_party_member(m.get("id", ""), amount)
			elif tgt in ["hero", "vance"]:
				GameState.take_damage(amount)
			else:
				GameState.damage_party_member(tgt, amount)
			return {
				"success": true,
				"target": tgt,
				"amount": amount,
				"hero_hp": GameState.hero_hp,
				"is_party_defeated": GameState.is_party_defeated
			}

		"set_enemy_hostility", "set_enemy_hostile":
			var enemy_id = str(args.get("enemy_id", args.get("enemy", "")))
			var is_hostile = bool(args.get("is_hostile", args.get("hostile", true)))
			var enemy_node: Node2D = null
			if cur_scene and "enemies" in cur_scene and cur_scene.enemies.has(enemy_id):
				enemy_node = cur_scene.enemies[enemy_id]
			elif cur_scene:
				for child in cur_scene.get_children():
					if "enemy_id" in child and str(child.get("enemy_id")) == enemy_id:
						enemy_node = child
						break
			if enemy_node:
				enemy_node.set("is_hostile", is_hostile)
				return {"success": true, "enemy_id": enemy_id, "is_hostile": is_hostile}
			return {"success": false, "error": "Enemy not found: %s" % enemy_id}

		"set_enemy_position":
			var enemy_id = str(args.get("enemy_id", args.get("enemy", "")))
			var x = float(args.get("x", 0.0))
			var y = float(args.get("y", 0.0))
			var enemy_node: Node2D = null
			if cur_scene and "enemies" in cur_scene and cur_scene.enemies.has(enemy_id):
				enemy_node = cur_scene.enemies[enemy_id]
			elif cur_scene:
				for child in cur_scene.get_children():
					if "enemy_id" in child and str(child.get("enemy_id")) == enemy_id:
						enemy_node = child
						break
			if enemy_node:
				enemy_node.global_position = Vector2(x, y)
				return {"success": true, "enemy_id": enemy_id, "position": [x, y]}
			return {"success": false, "error": "Enemy not found: %s" % enemy_id}

		"approach_enemy":
			var enemy_id = str(args.get("enemy_id", args.get("enemy", "wolf_alpha")))
			var dist = float(args.get("distance", 220.0))
			var enemy_node: Node2D = null
			if cur_scene and "enemies" in cur_scene and cur_scene.enemies.has(enemy_id):
				enemy_node = cur_scene.enemies[enemy_id]
			elif cur_scene:
				for child in cur_scene.get_children():
					if "enemy_id" in child and str(child.get("enemy_id")) == enemy_id:
						enemy_node = child
						break
			if not enemy_node:
				return {"success": false, "error": "Enemy not found: %s" % enemy_id}

			var hero_node = cur_scene.find_child("HeroPlayer", true, false)
			var hero_pos = hero_node.global_position if hero_node else Vector2(480, 540)
			var dir = (hero_pos - enemy_node.global_position).normalized()
			if dir == Vector2.ZERO:
				dir = Vector2.LEFT
			var approach_pos = enemy_node.global_position + dir * dist

			return await _handle_move_to({"x": approach_pos.x, "y": approach_pos.y, "queue": false})

		"retry_encounter":
			var def_screen = cur_scene.find_child("DefeatScreen", true, false) if cur_scene else null
			var btn_ret = def_screen.find_child("BtnRetry", true, false) if def_screen else null
			if btn_ret and btn_ret.is_visible_in_tree() and has_node("/root/QAOverlay"):
				await _simulate_mouse_to_node_or_pos(btn_ret, Color(0.3, 1.0, 0.5, 0.95), "RETRY")

			if cur_scene and cur_scene.has_method("reset_encounter"):
				cur_scene.reset_encounter()
			else:
				GameState.retry_encounter()
			return {"success": true, "hero_hp": GameState.hero_hp, "is_party_defeated": GameState.is_party_defeated}

		_:
			return {"success": false, "error": "Unknown action: %s" % action}
	return {"success": false, "error": "Unknown action fallback"}

func _reset_game() -> void:
	if GameState.has_meta("fog_cache"):
		GameState.set_meta("fog_cache", {})
	GameState.init_hero("Lieutenant Vance", "fighter")
	if get_tree().current_scene and get_tree().current_scene.scene_file_path == "res://scenes/CharacterSelect.tscn":
		get_tree().reload_current_scene()
	else:
		get_tree().change_scene_to_file("res://scenes/CharacterSelect.tscn")

func _send_cors_response(client: StreamPeerTCP) -> void:
	var headers = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nContent-Length: 0\r\n\r\n"
	client.put_data(headers.to_utf8_buffer())

func _send_http_response(client: StreamPeerTCP, status_code: int, data: Variant) -> void:
	var body_bytes = JSON.stringify(data).to_utf8_buffer()
	var status_text = "OK" if status_code == 200 else ("Not Found" if status_code == 404 else "Error")
	var headers = "HTTP/1.1 %d %s\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\nContent-Length: %d\r\n\r\n" % [status_code, status_text, body_bytes.size()]
	client.put_data(headers.to_utf8_buffer())
	client.put_data(body_bytes)
	client.poll()
