extends Node

var server: TCPServer = TCPServer.new()
var active_port: int = 8080

func _ready() -> void:
	process_mode = PROCESS_MODE_ALWAYS
	_determine_port()
	_start_server()

func _determine_port() -> void:
	var env_port := OS.get_environment("DW_WEB_SERVICE_PORT")
	if env_port != "" and env_port.is_valid_int():
		active_port = env_port.to_int()
	var args := OS.get_cmdline_args()
	args.append_array(OS.get_cmdline_user_args())
	for i in range(args.size()):
		var arg := str(args[i])
		if arg.begins_with("--web-service-port=") or arg.begins_with("--port="):
			var parts := arg.split("=")
			if parts.size() > 1 and parts[1].is_valid_int():
				active_port = parts[1].to_int()

func _start_server() -> void:
	for p in range(active_port, active_port + 10):
		server = TCPServer.new()
		if server.listen(p, "127.0.0.1") == OK:
			active_port = p
			print("[GameControlServer] Listening on http://127.0.0.1:%d" % active_port)
			return

func _process(_delta: float) -> void:
	if server and server.is_listening():
		while server.is_connection_available():
			var client: StreamPeerTCP = server.take_connection()
			if client:
				_handle_client(client)

func _handle_client(client: StreamPeerTCP) -> void:
	client.poll()
	var retries := 0
	while client.get_status() == StreamPeerTCP.STATUS_CONNECTED and client.get_available_bytes() == 0 and retries < 50:
		OS.delay_msec(2)
		client.poll()
		retries += 1
	var avail := client.get_available_bytes()
	if avail <= 0:
		client.disconnect_from_host()
		return
	var req_data := client.get_data(avail)
	if req_data[0] != OK:
		client.disconnect_from_host()
		return
	var raw_req: String = req_data[1].get_string_from_utf8()
	var body_retry := 0
	while body_retry < 40 and raw_req.to_lower().contains("content-length:") and raw_req.ends_with("\r\n\r\n"):
		OS.delay_msec(2)
		client.poll()
		var more := client.get_available_bytes()
		if more > 0:
			var md := client.get_data(more)
			if md[0] == OK:
				raw_req += md[1].get_string_from_utf8()
		body_retry += 1
	await _route_http(client, raw_req)

func _route_http(client: StreamPeerTCP, raw_req: String) -> void:
	var lines := raw_req.split("\r\n")
	if lines.is_empty() or lines[0].strip_edges() == "":
		_send_json(client, 400, {"error": "Empty request"})
		return
	var parts := lines[0].split(" ")
	var method := parts[0].to_upper()
	var path := parts[1].split("?")[0] if parts.size() > 1 else "/"

	var body: Dictionary = {}
	var bidx := raw_req.find("\r\n\r\n")
	if bidx != -1:
		var rbody := raw_req.substr(bidx + 4).strip_edges()
		if rbody != "":
			var parsed = JSON.parse_string(rbody)
			if parsed is Dictionary:
				body = parsed

	match [method, path]:
		["GET", "/health"], ["GET", "/api/v1/health"]:
			_send_json(client, 200, {"status": "ok", "game": "Fantasy: Light Warriors (WIP)", "fps": Engine.get_frames_per_second()})
		["GET", "/state"], ["GET", "/api/v1/state"]:
			_send_json(client, 200, get_full_state())
		["POST", "/input"], ["POST", "/api/v1/input"]:
			var act := str(body.get("action", "ui_accept"))
			await _inject_action(act)
			_send_json(client, 200, {"success": true, "action": act})
		["POST", "/command"], ["POST", "/api/v1/command"]:
			await _handle_command(client, body)
		_:
			_send_json(client, 404, {"error": "Not found"})

func _inject_action(action_name: String) -> void:
	var ev := InputEventAction.new()
	ev.action = action_name
	ev.pressed = true
	Input.parse_input_event(ev)
	await get_tree().process_frame
	var ev_up := InputEventAction.new()
	ev_up.action = action_name
	ev_up.pressed = false
	Input.parse_input_event(ev_up)
	await get_tree().process_frame

func _handle_command(client: StreamPeerTCP, body: Dictionary) -> void:
	var cmd := str(body.get("command", ""))
	var args: Dictionary = body.get("args", {}) if body.get("args") is Dictionary else {}
	var sc := get_tree().current_scene
	var gs := get_node_or_null("/root/GameState")
	var brain := get_node_or_null("/root/PlayGameBrain")

	match cmd:
		"get_milestones":
			var mlist: Array = brain.milestones if brain else []
			_send_json(client, 200, {"success": true, "total": mlist.size(), "milestones": mlist})
		"start_play_game":
			var tscale := float(args.get("time_scale", body.get("time_scale", 1.0)))
			var until_m := int(args.get("until_milestone", body.get("until_milestone", 0)))
			var start_m := int(args.get("start_at_milestone", body.get("start_at_milestone", 0)))
			Engine.time_scale = clamp(tscale, 0.25, 16.0)
			if brain:
				brain.start(until_m, start_m)
			_send_json(client, 200, {"success": true, "status": brain.get_status_dict() if brain else {}})
		"stop_play_game":
			if brain:
				brain.stop()
			_send_json(client, 200, {"success": true})
		"set_time_scale":
			var ts := float(args.get("scale", body.get("scale", 1.0)))
			Engine.time_scale = clamp(ts, 0.25, 16.0)
			_send_json(client, 200, {"success": true, "time_scale": Engine.time_scale})
		"export_save_state":
			var out_path := str(args.get("path", body.get("path", "")))
			var sname := str(sc.name) if sc else "Coneria"
			var hpos := Vector2i(16, 21)
			var hfac := "up"
			if sc and "_hero_tile" in sc:
				hpos = sc._hero_tile
				hfac = sc._facing_to_str(sc._hero_facing) if sc.has_method("_facing_to_str") else "up"
			var ckpt: Dictionary = gs.export_checkpoint_dict(sname, hpos, hfac) if gs else {}
			if out_path != "":
				var f := FileAccess.open(out_path, FileAccess.WRITE)
				if f:
					f.store_string(JSON.stringify(ckpt, "  "))
					f.close()
			_send_json(client, 200, {"success": true, "path": out_path, "checkpoint": ckpt})
		"load_save_state":
			var in_path := str(args.get("path", body.get("path", "")))
			var ckpt_data: Dictionary = args.get("checkpoint", body.get("checkpoint", {})) if (args.get("checkpoint") is Dictionary or body.get("checkpoint") is Dictionary) else {}
			if in_path != "" and FileAccess.file_exists(in_path):
				var f := FileAccess.open(in_path, FileAccess.READ)
				if f:
					var parsed = JSON.parse_string(f.get_as_text())
					if parsed is Dictionary:
						ckpt_data = parsed
			if ckpt_data.is_empty():
				_send_json(client, 400, {"success": false, "error": "Empty or missing checkpoint"})
				return
			if gs:
				gs.apply_checkpoint_dict(ckpt_data)
				gs.spawn_tile = Vector2i(int(ckpt_data.get("x", 16)), int(ckpt_data.get("y", 21)))
				gs.spawn_facing = str(ckpt_data.get("facing", "up"))
			var target_sc := str(ckpt_data.get("scene", "Coneria"))
			var sc_path := "res://scenes/%s.tscn" % target_sc
			_send_json(client, 200, {"success": true, "scene": target_sc})
			get_tree().call_deferred("change_scene_to_file", sc_path)
		"capture_screenshot":
			var spath := str(args.get("path", body.get("path", "")))
			await RenderingServer.frame_post_draw
			var img := get_viewport().get_texture().get_image()
			if img and spath != "":
				img.save_png(spath)
				_send_json(client, 200, {"success": true, "path": spath})
			else:
				_send_json(client, 400, {"success": false, "error": "Failed to capture viewport"})
		"toggle_tile_debug", "tile_debug":
			var en := bool(args.get("enabled", true))
			if gs: gs.tile_debug_enabled = en
			if sc and "_debug_active" in sc:
				sc._debug_active = en
				if sc.has_method("_update_debug_overlay"):
					sc._update_debug_overlay()
			_send_json(client, 200, {"success": true})
		"load_scene":
			var p := str(args.get("path", ""))
			if not p.begins_with("res://"):
				p = "res://scenes/%s.tscn" % p.replace(".tscn", "")
			if args.has("x") and args.has("y") and gs:
				gs.spawn_tile = Vector2i(int(args["x"]), int(args["y"]))
			if args.has("facing") and gs:
				gs.spawn_facing = str(args["facing"])
			_send_json(client, 200, {"success": true, "path": p})
			get_tree().call_deferred("change_scene_to_file", p)
		"teleport":
			var tx := int(args.get("x", 16))
			var ty := int(args.get("y", 21))
			if sc and "_hero_tile" in sc:
				sc._hero_tile = Vector2i(tx, ty)
				if args.has("facing") and sc.has_method("_str_to_facing"):
					sc._hero_facing = sc._str_to_facing(str(args["facing"]))
				if sc.has_method("_update_camera_and_sprites"):
					sc._update_camera_and_sprites()
			_send_json(client, 200, {"success": true, "x": tx, "y": ty})
		"configure_party_slot":
			if sc and sc.has_method("configure_slot"):
				sc.configure_slot(int(args.get("slot", 0)), str(args.get("class", "Fighter")), str(args.get("name", "ZEST")))
				_send_json(client, 200, {"success": true})
			else:
				_send_json(client, 400, {"success": false, "error": "Not on PartyCreate scene"})
		"trigger_encounter":
			var monster := str(args.get("monster", "IMP"))
			if sc and sc.has_method("_start_battle"):
				sc._start_battle(monster)
				_send_json(client, 200, {"success": true, "monster": monster})
			else:
				_send_json(client, 400, {"success": false})
		"trigger_shop":
			var sid := int(args.get("shop_id", 1))
			if sc and sc.has_method("_trigger_shop"):
				sc._trigger_shop(sid)
				_send_json(client, 200, {"success": true, "shop_id": sid})
			else:
				_send_json(client, 400, {"success": false})
		"select_command":
			var cname := str(args.get("cmd", "TALK")).to_upper()
			if sc and "MENU_ITEMS" in sc:
				var idx: int = sc.MENU_ITEMS.find(cname)
				if idx >= 0:
					sc._menu_index = idx
					sc._execute_command()
					_send_json(client, 200, {"success": true, "cmd": cname})
					return
			_send_json(client, 400, {"success": false})
		_:
			_send_json(client, 400, {"error": "Unknown command: %s" % cmd})

func get_full_state() -> Dictionary:
	var sc := get_tree().current_scene
	var gs := get_node_or_null("/root/GameState")
	var brain := get_node_or_null("/root/PlayGameBrain")
	var sc_info := {
		"name": str(sc.name) if sc else "",
		"path": str(sc.scene_file_path) if sc else ""
	}
	var pos := {"x": 0, "y": 0, "facing": "up"}
	if sc and "_hero_tile" in sc:
		pos["x"] = sc._hero_tile.x
		pos["y"] = sc._hero_tile.y
		pos["facing"] = sc._facing_to_str(sc._hero_facing) if sc.has_method("_facing_to_str") else "up"

	var dlg := {"is_showing": false, "speaker": "", "text": "", "current_page": 0, "total_pages": 0}
	if sc and "_dialog_active" in sc and sc._dialog_active:
		dlg["is_showing"] = true
		dlg["speaker"] = str(sc._speaker_label.text) if sc._speaker_label else ""
		dlg["text"] = str(sc._dialog_label.text) if sc._dialog_label else ""
		dlg["current_page"] = int(sc._current_page)
		dlg["total_pages"] = sc._dialog_pages.size()

	var cmd_win := {"is_showing": false, "selected_index": 0, "menu_items": []}
	if sc and "_menu_open" in sc and sc._menu_open:
		cmd_win["is_showing"] = true
		cmd_win["selected_index"] = int(sc._menu_index)
		cmd_win["menu_items"] = sc.MENU_ITEMS

	var btl := {"is_battle": false, "phase": "INACTIVE", "enemy_name": "", "enemy_hp": 0, "msg_text": ""}
	if sc and "_battle_active" in sc and sc._battle_active:
		btl["is_battle"] = true
		btl["phase"] = str(sc._battle_phase)
		btl["enemy_name"] = str(sc._battle_enemy.get("name", ""))
		btl["enemy_hp"] = int(sc._battle_enemy_hp)
		btl["msg_text"] = str(sc._battle_msg_label.text) if sc._battle_msg_label else ""

	var shop_win := {"is_showing": false, "shop_id": 0, "shop_type": "", "cursor_index": 0, "cursor_option": "", "bought_this_visit": false, "welcome_text": "", "items_text": "", "gold_text": ""}
	if sc and "_shop_active" in sc and sc._shop_active:
		shop_win["is_showing"] = true
		shop_win["shop_id"] = int(sc._shop_id)
		shop_win["shop_type"] = str(sc._shop_type_str)
		shop_win["cursor_index"] = int(sc._shop_cursor)
		shop_win["cursor_option"] = str(sc.SHOP_OPTIONS[sc._shop_cursor]) if sc._shop_cursor < sc.SHOP_OPTIONS.size() else ""
		shop_win["bought_this_visit"] = bool(sc._shop_bought_this_visit)
		shop_win["welcome_text"] = str(sc._shop_welcome_label.text) if sc._shop_welcome_label else ""
		shop_win["items_text"] = str(sc._shop_items_label.text) if sc._shop_items_label else ""
		shop_win["gold_text"] = str(sc._shop_gold_label.text) if sc._shop_gold_label else ""

	var party_create := {}
	if sc and sc.has_method("get_party_create_state"):
		party_create = sc.get_party_create_state()

	var gs_dict := {}
	var hero_stats := {}
	if gs:
		hero_stats = gs.hero_stats_summary()
		gs_dict = {
			"gold": gs.gold,
			"party": gs.party,
			"leader": hero_stats,
			"inventory": gs.inventory,
			"opened_chests": gs.opened_chests,
			"party_created": gs.party_created,
			"talked_coneria_guard": gs.talked_coneria_guard,
			"bought_weapon_coneria": gs.bought_weapon_coneria,
			"bought_armor_coneria": gs.bought_armor_coneria,
			"bought_white_magic_coneria": gs.bought_white_magic_coneria,
			"bought_black_magic_coneria": gs.bought_black_magic_coneria,
			"used_inn_coneria": gs.used_inn_coneria,
			"king_intro_done": gs.king_intro_done,
			"first_encounter_won": gs.first_encounter_won,
			"garland_defeated": gs.garland_defeated,
			"princess_rescued": gs.princess_rescued,
			"bridge_built": gs.bridge_built,
			"lute_obtained": gs.lute_obtained,
			"battles_won": gs.battles_won,
			"deaths": gs.deaths
		}

	return {
		"game": "Fantasy: Light Warriors (WIP)",
		"scene_shown": sc_info,
		"hero_position": pos,
		"hero_stats": hero_stats,
		"dialog_box": dlg,
		"command_window": cmd_win,
		"shop_window": shop_win,
		"battle": btl,
		"party_create": party_create,
		"game_state": gs_dict,
		"play_game": brain.get_status_dict() if brain else {},
		"telemetry": {
			"battles_won": gs.battles_won if gs else 0,
			"deaths": gs.deaths if gs else 0,
			"inputs_sent": brain.total_inputs_sent if brain else 0
		}
	}

func _send_json(client: StreamPeerTCP, code: int, payload: Dictionary) -> void:
	var body := JSON.stringify(payload).to_utf8_buffer()
	var hdr := "HTTP/1.1 %d OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: %d\r\n\r\n" % [code, body.size()]
	client.put_data(hdr.to_utf8_buffer())
	client.put_data(body)
	client.poll()
