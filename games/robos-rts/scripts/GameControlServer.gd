extends Node

# GameControlServer.gd — HTTP/JSON observation, action and step server (bot API & E2E test hook)
# Default Port: 18095 (override via RTS_WEB_SERVICE_PORT or --port=NNNN)
#
# Endpoints:
# - GET  /health       -> Server status, tick, scenario name
# - GET  /observation  -> Full observation snapshot (units, resources, players, map, events)
# - POST /action       -> Issue command(s) to unit tags (move, attack, harvest, build, surge, emplace, retract_silo, train_rifleman, etc.)
# - POST /step         -> Advance deterministic 64Hz simulation by `count` ticks (instant in backend mode)
# - POST /scenario     -> Load a scenario JSON dict or named KGraph scenario from `scenarios/<slug>.jsonld`
# - POST /directive    -> Configure RTSCommanderAI directive for Player 1 or Player 2
# - POST /overlay      -> Update on-screen BDD step / proof banner for video walkthroughs
# - POST /pause        -> Pause or resume real-time simulation ({paused: bool}); /step still advances ticks
# - POST /select       -> Select units (tags, or unit_type + owner)
# - POST /camera       -> Move the camera ({x,y,z} raw, or {focus_x,focus_y,height})
# - POST /input        -> Inject mouse_button / mouse_motion / key events through the real input handlers
# - POST /ui           -> Drive HUD state: local_player, hover, help, pending_ability, message, control_group, focus
# - POST /screenshot   -> Save the current frame as PNG
# - GET|POST /editor   -> Map Editor state / actions (only while scenes/MapEditor.tscn is active)

var server: TCPServer = TCPServer.new()
var active_port: int = 18095
var bdd_step_text: String = ""
var bdd_proof_text: String = ""

func _ready() -> void:
	process_mode = PROCESS_MODE_ALWAYS
	if OS.has_feature("web"):
		set_process(false)
		return
	_determine_port()
	_start_server()

func _determine_port() -> void:
	var env_port = OS.get_environment("RTS_WEB_SERVICE_PORT")
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
			print("[GameControlServer] RTS control service listening on http://127.0.0.1:%d" % active_port)
			return
	push_warning("[GameControlServer] Could not bind HTTP server in range %d-%d" % [active_port, active_port + 9])

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
		OS.delay_msec(1)
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

	var cl_idx = raw_request.to_lower().find("content-length:")
	if cl_idx != -1:
		var end_cl = raw_request.find("\r\n", cl_idx)
		if end_cl != -1:
			var cl_str = raw_request.substr(cl_idx + 15, end_cl - (cl_idx + 15)).strip_edges()
			var content_len = cl_str.to_int()
			var body_start = raw_request.find("\r\n\r\n")
			var body_len = raw_request.substr(body_start + 4).to_utf8_buffer().size() if body_start != -1 else 0
			var extra_retries = 0
			while body_len < content_len and extra_retries < 100:
				client.poll()
				var avail = client.get_available_bytes()
				if avail > 0:
					var extra_data = client.get_data(avail)
					if extra_data[0] == OK:
						raw_request += extra_data[1].get_string_from_utf8()
						body_start = raw_request.find("\r\n\r\n")
						body_len = raw_request.substr(body_start + 4).to_utf8_buffer().size() if body_start != -1 else 0
				else:
					OS.delay_msec(1)
				extra_retries += 1

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
		_send_json(client, 200, {"ok": true})
		return

	var body_dict: Dictionary = {}
	var body_start_idx = raw_req.find("\r\n\r\n")
	if body_start_idx != -1:
		var raw_body = raw_req.substr(body_start_idx + 4).strip_edges()
		if raw_body != "":
			var parsed = JSON.parse_string(raw_body)
			if typeof(parsed) == TYPE_DICTIONARY:
				body_dict = parsed

	match path:
		"/health", "/status":
			_send_json(client, 200, {
				"ok": true,
				"game": "robos-rts",
				"tick": SimEngine.tick,
				"sim_time": SimEngine.sim_time,
				"scenario": SimEngine.scenario_name,
				"rts_mode": SimEngine.rts_mode
			})

		"/observation", "/state":
			var p_id = int(body_dict.get("player", 0))
			_send_json(client, 200, SimEngine.get_observation(p_id))

		"/step":
			var count = int(body_dict.get("count", body_dict.get("ticks", 1)))
			count = clampi(count, 1, 20000)
			SimEngine.step_ticks(count)
			_send_json(client, 200, SimEngine.get_observation())

		"/action", "/command":
			var tags: Array = body_dict.get("tags", body_dict.get("unit_tags", []))
			if tags.is_empty() and body_dict.has("unit_type"):
				# Convenience selector by unit_type and owner
				var ut = str(body_dict.get("unit_type")).to_lower()
				var owner_filter = int(body_dict.get("owner", 1))
				for u in SimEngine.units.values():
					if u["unit_type"] == ut and u["owner"] == owner_filter:
						tags.append(u["tag"])
			var cmd = str(body_dict.get("command", body_dict.get("ability", "move")))
			var tx = float(body_dict.get("x", body_dict.get("target_pos", {}).get("x", 0.0) if typeof(body_dict.get("target_pos")) == TYPE_DICTIONARY else 0.0))
			var ty = float(body_dict.get("y", body_dict.get("target_pos", {}).get("y", 0.0) if typeof(body_dict.get("target_pos")) == TYPE_DICTIONARY else 0.0))
			var t_tag = int(body_dict.get("target_tag", 0))
			var extra = str(body_dict.get("structure_type", body_dict.get("extra", "")))
			var queue = bool(body_dict.get("queue", false))
			var res = SimEngine.issue_command(tags, cmd, Vector2(tx, ty), t_tag, extra, queue)
			_send_json(client, 200, res)

		"/directive":
			var pid = int(body_dict.get("player", 1))
			var mode = str(body_dict.get("mode", "stutter_step_kite"))
			var enabled = bool(body_dict.get("enabled", true))
			var tx = float(body_dict.get("target_x", 64.0))
			var ty = float(body_dict.get("target_y", 48.0))
			RTSCommanderAI.set_directive(pid, mode, enabled, Vector2(tx, ty))
			_send_json(client, 200, {"ok": true, "player": pid, "mode": mode, "enabled": enabled})

		"/scenario":
			if body_dict.has("slug"):
				var slug = str(body_dict.get("slug"))
				if slug == "default" or slug == "starfall-canyon":
					SimEngine.load_default_scenario()
					RTSCommanderAI.configure_from_scenario([])
					_send_json(client, 200, {"ok": true, "scenario": SimEngine.scenario_name, "unit_count": SimEngine.units.size()})
					return
				var res = SimEngine.load_scenario_file(slug)
				_send_json(client, 200 if bool(res.get("ok", false)) else 404, res)
			else:
				var res = SimEngine.load_scenario_dict(body_dict)
				_send_json(client, 200, res)

		"/pause":
			SimEngine.paused = bool(body_dict.get("paused", true))
			_send_json(client, 200, {"ok": true, "paused": SimEngine.paused})

		"/overlay":
			bdd_step_text = str(body_dict.get("step", bdd_step_text))
			bdd_proof_text = str(body_dict.get("proof", bdd_proof_text))
			_send_json(client, 200, {"ok": true})

		"/select":
			var tags_in: Array = body_dict.get("tags", [])
			var main_node = get_tree().current_scene
			if main_node and "selected_tags" in main_node:
				main_node.selected_tags.clear()
				if tags_in.is_empty() and body_dict.has("unit_type"):
					var ut = str(body_dict.get("unit_type")).to_lower()
					var own = int(body_dict.get("owner", 1))
					for u in SimEngine.units.values():
						if u["unit_type"] == ut and u["owner"] == own:
							main_node.selected_tags.append(int(u["tag"]))
				else:
					for t in tags_in:
						main_node.selected_tags.append(int(t))
				_send_json(client, 200, {"ok": true, "selected": main_node.selected_tags.size()})
			else:
				_send_json(client, 200, {"ok": false, "error": "Main scene not ready"})

		"/camera":
			var main_node = get_tree().current_scene
			if main_node and "world_3d" in main_node and main_node.world_3d and main_node.world_3d.camera_3d:
				if body_dict.has("focus_x"):
					main_node.world_3d.set_focus(Vector2(float(body_dict.get("focus_x")), float(body_dict.get("focus_y", 48.0))), float(body_dict.get("height", main_node.world_3d.cam_height)))
				else:
					main_node.world_3d.camera_3d.position = Vector3(float(body_dict.get("x", 64.0)), float(body_dict.get("y", 68.0)), float(body_dict.get("z", 92.0)))
				var cp: Vector3 = main_node.world_3d.camera_3d.position
				_send_json(client, 200, {"ok": true, "camera": [cp.x, cp.y, cp.z]})
			else:
				_send_json(client, 200, {"ok": false, "error": "Main scene not ready"})

		"/ui":
			var main_ui = get_tree().current_scene
			if main_ui and main_ui.has_method("apply_ui_state"):
				_send_json(client, 200, {"ok": true, "state": main_ui.apply_ui_state(body_dict)})
			else:
				_send_json(client, 200, {"ok": false, "error": "Main scene not ready"})

		"/input":
			var main_in = get_tree().current_scene
			if main_in and main_in.has_method("inject_input"):
				main_in.inject_input(body_dict)
				_send_json(client, 200, {"ok": true, "state": main_in.ui_state()})
			else:
				_send_json(client, 200, {"ok": false, "error": "Main scene not ready"})

		"/screenshot":
			var out_path = str(body_dict.get("path", "/tmp/robos_rts_shot.png"))
			var img = get_viewport().get_texture().get_image()
			if img:
				var err = img.save_png(out_path)
				_send_json(client, 200, {"ok": err == OK, "path": out_path, "width": img.get_width(), "height": img.get_height()})
			else:
				_send_json(client, 500, {"ok": false, "error": "No viewport image available"})

		"/editor":
			# Map Editor automation: GET (empty body) returns state, POST {"action": ...} edits the map.
			var editor_node = get_tree().current_scene
			if str(body_dict.get("action", "")) == "open":
				if not (editor_node and editor_node.has_method("handle_control_request")):
					get_tree().change_scene_to_file("res://scenes/MapEditor.tscn")
				_send_json(client, 200, {"ok": true, "opening": true})
			elif editor_node and editor_node.has_method("handle_control_request"):
				var res = editor_node.handle_control_request(body_dict)
				_send_json(client, 200 if bool(res.get("ok", false)) else 404, res)
			else:
				_send_json(client, 404, {"ok": false, "error": "Map Editor is not the active scene"})

		_:
			_send_json(client, 404, {"ok": false, "error": "Unknown endpoint: " + path})

func _send_json(client: StreamPeerTCP, status_code: int, payload: Dictionary) -> void:
	var body = JSON.stringify(payload)
	var body_bytes = body.to_utf8_buffer()
	var status_text = "OK" if status_code == 200 else "Not Found"
	var header = "HTTP/1.1 %d %s\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % [status_code, status_text, body_bytes.size()]
	client.put_data(header.to_utf8_buffer())
	client.put_data(body_bytes)
	client.disconnect_from_host()
