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
# - POST /screenshot   -> Save a frame (async:true encodes PNG/JPEG on a worker)
# - GET  /capture      -> Latest asynchronous capture completion
# - POST /playback     -> Live speed/pause; never manually advances ticks
# - GET  /performance  -> Frame percentiles, simulation sections and rendering cost
# - GET|POST /editor   -> Map Editor state / actions (only while scenes/MapEditor.tscn is active)

var server: TCPServer = TCPServer.new()
var active_port: int = 18095
var bdd_step_text: String = ""
var bdd_proof_text: String = ""
var frame_samples: Array[float] = []
var sim_samples: Array[float] = []
var last_capture_ms: float = 0.0
var last_readback_ms: float = 0.0
var _last_frame_usec: int = 0
var _connections: Array[Dictionary] = []
var _capture_thread: Thread
var _capture_job: Dictionary = {}
var _capture_serial: int = 0

func _sample_stats(samples: Array[float]) -> Dictionary:
	if samples.is_empty():
		return {}
	var sorted = samples.duplicate()
	sorted.sort()
	return {"count": sorted.size(), "p50_ms": sorted[int((sorted.size() - 1) * 0.5)], "p95_ms": sorted[int((sorted.size() - 1) * 0.95)], "p99_ms": sorted[int((sorted.size() - 1) * 0.99)], "max_ms": sorted.back()}

func _performance_snapshot() -> Dictionary:
	var scene = get_tree().current_scene
	var sync_ms = scene.world_3d.sync_ms if scene and "world_3d" in scene and scene.world_3d else 0.0
	return {
		"ok": true,
		"frame": _sample_stats(frame_samples),
		"simulation": _sample_stats(sim_samples),
		"sync_ms": sync_ms,
		"hud_ms": scene.hud.draw_ms if scene and "hud" in scene and scene.hud else 0.0,
		"process_ms": Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
		"profile_usec": SimEngine.profile_usec.duplicate(),
		"fps": Engine.get_frames_per_second(),
		"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		"objects": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
		"units": SimEngine.units.size(),
		"capture_ms": last_capture_ms,
		"readback_ms": last_readback_ms,
		"tick": SimEngine.tick,
		"backlog_seconds": SimEngine._accum_time,
	}

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
	var now = Time.get_ticks_usec()
	if _last_frame_usec > 0:
		frame_samples.append((now - _last_frame_usec) / 1000.0)
		sim_samples.append(SimEngine.frame_sim_usec / 1000.0)
	_last_frame_usec = now
	if frame_samples.size() > 600:
		frame_samples.pop_front()
		sim_samples.pop_front()
	if not server or not server.is_listening():
		return
	if _capture_thread and not _capture_thread.is_alive():
		_capture_job["ok"] = _capture_thread.wait_to_finish() == OK
		_capture_job["pending"] = false
		_capture_thread = null
	while server.is_connection_available() and _connections.size() < 16:
		var client: StreamPeerTCP = server.take_connection()
		if client:
			client.set_no_delay(true)
			_connections.append({"peer": client, "bytes": PackedByteArray(), "started": now, "response": PackedByteArray(), "sent": 0})
	# Never wait for a sender on the frame thread. Partial headers, UTF-8 bodies
	# and responses stay buffered until the next frame, with a bounded service budget.
	for connection in _connections.duplicate():
		var client: StreamPeerTCP = connection.peer
		client.poll()
		if client.get_status() != StreamPeerTCP.STATUS_CONNECTED or now - int(connection.started) > 10000000:
			client.disconnect_from_host()
			_connections.erase(connection)
			continue
		if not connection.response.is_empty():
			_flush_response(connection)
			continue
		var available = mini(client.get_available_bytes(), 65536)
		if available > 0:
			var data = client.get_data(available)
			if data[0] == OK:
				connection.bytes.append_array(data[1])
		if connection.bytes.size() > 4194304:
			client.disconnect_from_host()
			_connections.erase(connection)
			continue
		# Inspect headers as bytes; a TCP packet can end halfway through a UTF-8
		# code point in an authored map. Decode the body only once it is complete.
		var raw: String = connection.bytes.get_string_from_ascii()
		var header_end = raw.find("\r\n\r\n")
		if header_end < 0:
			continue
		var length = 0
		for line in raw.substr(0, header_end).split("\r\n"):
			if line.to_lower().begins_with("content-length:"):
				length = line.substr(15).strip_edges().to_int()
		if connection.bytes.size() < raw.substr(0, header_end + 4).to_utf8_buffer().size() + length:
			continue
		_process_http_request(client, connection.bytes.get_string_from_utf8())
		if Time.get_ticks_usec() - now > 2000:
			break

func _exit_tree() -> void:
	if _capture_thread:
		_capture_thread.wait_to_finish()

func _flush_response(connection: Dictionary) -> void:
	var client: StreamPeerTCP = connection.peer
	var part = client.put_partial_data(connection.response.slice(connection.sent, mini(connection.sent + 65536, connection.response.size())))
	connection.sent += int(part[1])
	if part[0] != OK or connection.sent >= connection.response.size():
		client.disconnect_from_host()
		_connections.erase(connection)

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
		"/performance":
			_send_json(client, 200, _performance_snapshot())
			if body_dict.get("reset", false):
				frame_samples.clear()
				sim_samples.clear()
				for key in SimEngine.profile_usec:
					SimEngine.profile_usec[key] = 0
		"/health", "/status":
			_send_json(client, 200, {
				"ok": true,
				"game": "robos-rts",
				"process_id": OS.get_process_id(),
				"tick": SimEngine.tick,
				"sim_time": SimEngine.sim_time,
				"scenario": SimEngine.scenario_name,
				"rts_mode": SimEngine.rts_mode,
				"paused": SimEngine.paused,
				"speed": SimEngine.sim_speed,
				"manual_step_requests": SimEngine.manual_step_requests
			})

		"/observation", "/state":
			var p_id = int(body_dict.get("player", 0))
			_send_json(client, 200, SimEngine.get_observation(p_id))

		"/step":
			SimEngine.manual_step_requests += 1
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
					if slug == "default":
						SimEngine.load_default_scenario()
					else:
						SimEngine.load_legacy_scenario()
						RTSCommanderAI.configure_from_scenario([])
					_send_json(client, 200, {"ok": true, "scenario": SimEngine.scenario_name, "unit_count": SimEngine.units.size()})
					return
				var res = SimEngine.load_scenario_file(slug)
				_send_json(client, 200 if bool(res.get("ok", false)) else 404, res)
			else:
				var res = SimEngine.load_scenario_dict(body_dict)
				_send_json(client, 200, res)

		"/match":
			if str(body_dict.get("action", "new")) == "surrender":
				_send_json(client, 200, SimEngine.surrender(int(body_dict.get("player", 1))))
			else:
				var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://scenarios/frontier-hunters.jsonld"))
				for key in ["seed", "difficulty", "strategy"]:
					if body_dict.has(key):
						data[key] = body_dict[key]
				_send_json(client, 200, SimEngine.load_scenario_dict(data))

		"/playback":
			var speed = float(body_dict.get("speed", SimEngine.sim_speed))
			if not is_finite(speed) or speed < 1.0 or speed > 8.0:
				_send_json(client, 200, {"ok": false, "error": "Playback speed must be between 1 and 8"})
				return
			var next_paused = bool(body_dict.get("paused", SimEngine.paused))
			if speed != SimEngine.sim_speed or next_paused != SimEngine.paused:
				SimEngine._accum_time = 0.0
			SimEngine.sim_speed = speed
			SimEngine.paused = next_paused
			_send_json(client, 200, {"ok": true, "speed": speed, "paused": SimEngine.paused, "rts_mode": SimEngine.rts_mode})

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
			var capture_started = Time.get_ticks_usec()
			var out_path = str(body_dict.get("path", "/tmp/robos_rts_shot.png"))
			if _capture_thread:
				_send_json(client, 200, {"ok": false, "busy": true, "capture_id": _capture_serial})
				return
			var img = get_viewport().get_texture().get_image()
			last_readback_ms = (Time.get_ticks_usec() - capture_started) / 1000.0
			if img:
				if body_dict.get("async", false):
					_capture_serial += 1
					_capture_job = {"ok": true, "pending": true, "capture_id": _capture_serial, "path": out_path, "width": img.get_width(), "height": img.get_height()}
					_capture_thread = Thread.new()
					var start_error = _capture_thread.start(func(): return img.save_jpg(out_path, 0.88) if out_path.get_extension().to_lower() == "jpg" else img.save_png(out_path))
					if start_error != OK:
						_capture_job["ok"] = false
						_capture_job["pending"] = false
						_capture_thread = null
					_send_json(client, 200, _capture_job)
					return
				var err = img.save_png(out_path)
				last_capture_ms = (Time.get_ticks_usec() - capture_started) / 1000.0
				_send_json(client, 200, {"ok": err == OK, "path": out_path, "width": img.get_width(), "height": img.get_height()})
			else:
				_send_json(client, 500, {"ok": false, "error": "No viewport image available"})
		"/capture":
			_send_json(client, 200, _capture_job)

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
	for connection in _connections:
		if connection.peer == client:
			connection.response = header.to_utf8_buffer()
			connection.response.append_array(body_bytes)
			_flush_response(connection)
			return
