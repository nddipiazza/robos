extends Node

# GameControlServer.gd — Contract-Based HTTP Web Service for Game Automation & Telemetry
# Runs an asynchronous TCPServer embedded in Godot to receive HTTP JSON requests
# for input injection, command execution, and querying detailed game/scene state.

@export var default_port: int = 8080

var server: TCPServer = TCPServer.new()
var active_port: int = 8080
var api_contract_cache: String = ""
var _active_clients: Array[StreamPeerTCP] = []
var _demo_timer: float = 0.0
var _demo_busy: bool = false
var _demo_step_counter: int = 0
var _demo_last_action: String = ""

static var _chest_registry_cache: Dictionary = {}
static var _door_registry_cache: Dictionary = {}
static var _stair_registry_cache: Dictionary = {}
static var _shops_registry_cache: Array = []


func _ready() -> void:
	process_mode = PROCESS_MODE_ALWAYS
	_load_contract_cache()
	_determine_port()
	_start_server()

func _load_contract_cache() -> void:
	var path := "res://docs/api_contract.json"
	if FileAccess.file_exists(path):
		var file := FileAccess.open(path, FileAccess.READ)
		if file:
			api_contract_cache = file.get_as_text()

func _determine_port() -> void:
	active_port = default_port
	var env_port = OS.get_environment("DW_WEB_SERVICE_PORT")
	if env_port != "" and env_port.is_valid_int():
		active_port = env_port.to_int()

	var args = OS.get_cmdline_args()
	args.append_array(OS.get_cmdline_user_args())
	for i in range(args.size()):
		var arg = args[i]
		if arg.begins_with("--web-service-port=") or arg.begins_with("--port="):
			var parts = arg.split("=")
			if parts.size() > 1 and parts[1].is_valid_int():
				active_port = parts[1].to_int()
		elif (arg == "--web-service-port" or arg == "--port") and i + 1 < args.size():
			if args[i + 1].is_valid_int():
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
			print("[GameControlServer] Failed to bind port %d: err=%d" % [p, err])
	push_warning("[GameControlServer] Could not bind HTTP server to any port in range %d-%d" % [active_port, active_port + 9])

func _process(_delta: float) -> void:
	if server and server.is_listening():
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
	await _process_http_request(client, raw_request)

func _activate_scene_tile_debug(enable: bool = true) -> void:
	var scene = get_tree().current_scene
	if scene:
		if "_debug_active" in scene:
			scene._debug_active = enable
		if "_debug_overlay" in scene and scene._debug_overlay:
			scene._debug_overlay.visible = enable
		if scene.has_method("_update_debug_overlay"):
			scene._update_debug_overlay()

func _process_http_request(client: StreamPeerTCP, raw_req: String) -> void:
	var lines = raw_req.split("\r\n")
	if lines.size() == 0 or lines[0].strip_edges() == "":
		_send_http_response(client, 400, {"error": "Empty HTTP request"})
		return

	var req_line = lines[0].split(" ")
	if req_line.size() < 2:
		_send_http_response(client, 400, {"error": "Malformed HTTP request line"})
		return

	var method = req_line[0].to_upper()
	var path = req_line[1]

	# Parse Query String if present
	var clean_path = path
	if "?" in path:
		clean_path = path.split("?")[0]

	# Handle CORS preflight
	if method == "OPTIONS":
		_send_cors_response(client)
		return

	# Extract JSON Body if present
	var body_dict: Dictionary = {}
	var body_start_idx = raw_req.find("\r\n\r\n")
	if body_start_idx != -1:
		var raw_body = raw_req.substr(body_start_idx + 4).strip_edges()
		if raw_body != "":
			var parsed = JSON.parse_string(raw_body)
			if typeof(parsed) == TYPE_DICTIONARY:
				body_dict = parsed

	# Route Request
	match [method, clean_path]:
		["GET", "/health"], ["GET", "/api/v1/health"]:
			_handle_health(client)
		["GET", "/contract"], ["GET", "/api/v1/contract"]:
			_handle_contract(client)
		["GET", "/state"], ["GET", "/api/v1/state"]:
			_handle_get_state(client)
		["GET", "/screen"], ["GET", "/api/v1/screen"]:
			_handle_get_screen(client)
		["POST", "/input"], ["POST", "/api/v1/input"]:
			await _handle_post_input(client, body_dict)
		["POST", "/command"], ["POST", "/api/v1/command"]:
			await _handle_post_command(client, body_dict)
		_:
			_send_http_response(client, 404, {"error": "Endpoint not found: %s %s" % [method, clean_path]})

func _send_cors_response(client: StreamPeerTCP) -> void:
	var headers = "HTTP/1.1 200 OK\r\n"
	headers += "Access-Control-Allow-Origin: *\r\n"
	headers += "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
	headers += "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
	headers += "Content-Length: 0\r\n\r\n"
	client.put_data(headers.to_utf8_buffer())

func _send_http_response(client: StreamPeerTCP, status_code: int, data: Variant) -> void:
	var body_bytes: PackedByteArray
	if data is String:
		body_bytes = (data as String).to_utf8_buffer()
	else:
		body_bytes = JSON.stringify(data).to_utf8_buffer()

	var status_text = "OK" if status_code == 200 else ("Not Found" if status_code == 404 else "Bad Request")
	var headers = "HTTP/1.1 %d %s\r\n" % [status_code, status_text]
	headers += "Content-Type: application/json\r\n"
	headers += "Connection: close\r\n"
	headers += "Access-Control-Allow-Origin: *\r\n"
	headers += "Access-Control-Allow-Headers: Content-Type, Authorization\r\n"
	headers += "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
	headers += "Content-Length: %d\r\n\r\n" % body_bytes.size()

	client.put_data(headers.to_utf8_buffer())
	client.put_data(body_bytes)
	client.poll()

# ── Route Handlers ─────────────────────────────────────────────────────────────

func _handle_health(client: StreamPeerTCP) -> void:
	var res = {
		"status": "ok",
		"version": "1.0.0",
		"game_running": true,
		"fps": Engine.get_frames_per_second()
	}
	_send_http_response(client, 200, res)

func _handle_contract(client: StreamPeerTCP) -> void:
	if api_contract_cache != "":
		_send_http_response(client, 200, api_contract_cache)
	else:
		_send_http_response(client, 404, {"error": "Contract specification file not found."})

func _handle_get_state(client: StreamPeerTCP) -> void:
	var state = get_full_scene_state()
	_send_http_response(client, 200, state)

func _handle_get_screen(client: StreamPeerTCP) -> void:
	var screen_data = get_screen_contents()
	_send_http_response(client, 200, screen_data)


func _handle_post_input(client: StreamPeerTCP, body: Dictionary) -> void:
	if body.has("actions") and body["actions"] is Array:
		var actions = body["actions"]
		for act in actions:
			if act is Dictionary:
				await _inject_single_input(act)
				await get_tree().create_timer(0.1).timeout
		_send_http_response(client, 200, {"success": true, "message": "Batch inputs processed."})
	else:
		var success = await _inject_single_input(body)
		_send_http_response(client, 200, {"success": success, "message": "Input processed."})

func _handle_post_command(client: StreamPeerTCP, body: Dictionary) -> void:
	var cmd = body.get("command", "")
	var args = body.get("args", {})
	
	match cmd:
		"load_scene":
			var path = args.get("path", "")
			if path != "":
				var tree = get_tree()
				if tree:
					_send_http_response(client, 200, {"success": true, "message": "Scene loading: %s" % path})
					tree.call_deferred("change_scene_to_file", path)
					return
			_send_http_response(client, 400, {"success": false, "message": "Invalid scene path."})
		"trigger_encounter":
			var monster = args.get("monster", "slime")
			var scene = get_tree().current_scene
			if scene and scene.has_method("_start_battle"):
				scene._start_battle(monster, {"name": monster.capitalize(), "hp": 5, "str": 4, "ag": 3})
				await get_tree().create_timer(0.5).timeout
				_send_http_response(client, 200, {"success": true, "message": "Encounter triggered against %s" % monster})
			elif CombatEngine:
				CombatEngine.start_battle(monster)
				await get_tree().create_timer(0.5).timeout
				_send_http_response(client, 200, {"success": true, "message": "CombatEngine started battle against %s" % monster})
			else:
				_send_http_response(client, 400, {"success": false, "message": "Cannot trigger encounter in current scene."})
		"teleport":
			var x = int(args.get("x", 0))
			var y = int(args.get("y", 0))
			var scene = get_tree().current_scene
			if not scene:
				await get_tree().create_timer(0.2).timeout
				scene = get_tree().current_scene
			if scene:
				if "_hero_tile" in scene:
					scene._hero_tile = Vector2i(x, y)
				if PlayerState:
					PlayerState.tile_position = Vector2i(x, y)
				await get_tree().create_timer(0.2).timeout
				_send_http_response(client, 200, {"success": true, "message": "Hero teleported to (%d, %d)" % [x, y]})
			else:
				_send_http_response(client, 400, {"success": false, "message": "No active scene."})
		"use_item":
			var item_name = str(args.get("item", "torch")).to_lower()
			var scene = get_tree().current_scene
			if scene:
				if item_name == "torch":
					if "_torch_active" in scene:
						scene._torch_active = true
					if scene.has_method("_update_darkness_mask"):
						scene.call("_update_darkness_mask")
				_send_http_response(client, 200, {"success": true, "message": "Item %s used." % item_name})
			else:
				_send_http_response(client, 400, {"success": false, "message": "No active scene."})
		"cast_spell":
			var spell_name = str(args.get("spell", "radiant")).to_lower()
			var scene = get_tree().current_scene
			if scene:
				if spell_name == "radiant":
					if "_radiant_steps_left" in scene:
						scene._radiant_steps_left = 200
					if scene.has_method("_update_darkness_mask"):
						scene.call("_update_darkness_mask")
				_send_http_response(client, 200, {"success": true, "message": "Spell %s cast." % spell_name})
			else:
				_send_http_response(client, 400, {"success": false, "message": "No active scene."})
		"open_menu":
			var scene = get_tree().current_scene
			if scene and scene.has_method("_open_menu"):
				scene._open_menu()
				await get_tree().create_timer(0.3).timeout
				_send_http_response(client, 200, {"success": true, "message": "Menu opened."})
			else:
				await _simulate_key_hold("cmd_menu", 0.15)
				_send_http_response(client, 200, {"success": true, "message": "Menu toggle key injected."})
		"toggle_tile_debug", "tile_debug":
			var enable = bool(args.get("enabled", true))
			var gs := get_node_or_null("/root/GameState")
			if gs:
				gs.tile_debug_enabled = enable
			_activate_scene_tile_debug(enable)
			_send_http_response(client, 200, {"success": true, "message": "Tile debug overlay set to %s" % enable})
		"select_command":
			var cmd_name = str(args.get("cmd", "SEARCH")).to_upper()
			var sc: Variant = get_tree().current_scene
			if sc:
				var items: Variant = null
				if "MENU_ITEMS" in sc:
					items = sc.MENU_ITEMS
				elif sc.get_script():
					var cmap = sc.get_script().get_script_constant_map()
					for k in cmap:
						if str(k) == "MENU_ITEMS":
							items = cmap[k]
							break
				if items == null:
					items = sc.get("MENU_ITEMS")
				if items == null:
					items = ["TALK", "DOOR", "STATUS", "TAKE", "STAIRS", "SPELL", "SEARCH", "ITEM"]
				if items != null and cmd_name in items:
					var idx = items.find(cmd_name)
					if "_menu_index" in sc:
						sc._menu_index = idx
					else:
						sc.set("_menu_index", idx)
					if sc.has_method("_update_menu_cursor"):
						sc.call("_update_menu_cursor")
				# Close command menu panel before executing action
				if "_menu_open" in sc:
					sc._menu_open = false
				if "_menu_panel" in sc and sc.get("_menu_panel"):
					sc.get("_menu_panel").visible = false

				_send_http_response(client, 200, {"success": true, "message": "Selected command: %s" % cmd_name})
				if sc.has_method("_execute_command"):
					sc.call_deferred("_execute_command")
				elif cmd_name == "STAIRS" and sc.has_method("_cmd_stairs"):
					sc.call_deferred("_cmd_stairs")
				elif sc.has_method("_execute_menu_item"):
					sc.call_deferred("_execute_menu_item", cmd_name)
			else:
				_send_http_response(client, 400, {"success": false, "message": "No active scene."})
		"give_item", "add_item":
			var item_name = str(args.get("item_name", args.get("name", "Magic Key"))).strip_edges()
			var scene = get_tree().current_scene
			var item_dict := {"name": item_name, "type": "key" if "key" in item_name.to_lower() else "item", "desc": "Added via command."}
			if scene and "_inventory" in scene:
				scene._inventory.append(item_dict)
			var gs := get_node_or_null("/root/GameState")
			if gs:
				gs.inventory.append(item_dict)
			_send_http_response(client, 200, {"success": true, "message": "Given item: %s" % item_name})
		"use_item":
			var item_name = str(args.get("item_name", "")).strip_edges().to_lower()
			var item_index = int(args.get("item_index", -1))
			var scene = get_tree().current_scene
			if scene and scene.has_method("_use_item"):
				var inv: Array = scene.get("_inventory") if "_inventory" in scene else []
				var idx_to_use := -1
				if item_index >= 0 and item_index < inv.size():
					idx_to_use = item_index
				elif item_name != "":
					for i in range(inv.size()):
						var it = inv[i]
						if it is Dictionary:
							var iname = str(it.get("name", "")).to_lower()
							var itype = str(it.get("type", "")).to_lower()
							if iname == item_name or itype == item_name or iname.contains(item_name):
								idx_to_use = i
								break
					if idx_to_use < 0:
						var item_dict := {"name": "Magic Key", "type": "key", "desc": "Opens locked doors."}
						if "herb" in item_name: item_dict = {"name": "Herb", "type": "herb", "desc": "Restores HP."}
						elif "torch" in item_name: item_dict = {"name": "Torch", "type": "item", "desc": "Lights dark places."}
						inv.append(item_dict)
						var gs := get_node_or_null("/root/GameState")
						if gs: gs.inventory = inv.duplicate(true)
						idx_to_use = inv.size() - 1
				if idx_to_use >= 0:
					scene._use_item(idx_to_use)
					await get_tree().create_timer(0.3).timeout
					_send_http_response(client, 200, {"success": true, "message": "Used item at index %d" % idx_to_use})
				else:
					_send_http_response(client, 400, {"success": false, "message": "Item '%s' not found in inventory." % [item_name if item_name != "" else str(item_index)]})
		"set_game_state", "set_state":
			var gs := get_node_or_null("/root/GameState")
			if gs:
				for k in args:
					var k_str := str(k)
					if k_str in ["hero_level", "heroLevel"]:
						gs.hero_stats["level"] = int(args[k])
					elif k_str in ["hero_exp", "heroExp"]:
						gs.hero_stats["exp"] = int(args[k])
					elif k_str in ["hero_hp", "heroHp"]:
						gs.hero_stats["hp"] = int(args[k])
					elif k_str in ["hero_hp_max", "heroHpMax"]:
						gs.hero_stats["hp_max"] = int(args[k])
					elif k_str in ["hero_mp", "heroMp"]:
						gs.hero_stats["mp"] = int(args[k])
					elif k_str in ["hero_mp_max", "heroMpMax"]:
						gs.hero_stats["mp_max"] = int(args[k])
					else:
						gs.set(k, args[k])
			var scene = get_tree().current_scene
			if scene:
				for k in args:
					if k in scene:
						scene.set(k, args[k])
				if scene.name == "ThroneRoom" and args.has("king_intro_done") and bool(args["king_intro_done"]) == false:
					if scene.has_method("_begin_intro"):
						scene.call("_begin_intro")
			_send_http_response(client, 200, {"success": true, "message": "Updated GameState/scene state."})
		"load_save_state":
			var gs: Node = get_node_or_null("/root/GameState")
			var data: Dictionary = {}
			if args.has("file_path") and str(args["file_path"]) != "":
				var fp: String = str(args["file_path"])
				if FileAccess.file_exists(fp):
					var f := FileAccess.open(fp, FileAccess.READ)
					if f:
						var parsed: Variant = JSON.parse_string(f.get_as_text())
						if parsed is Dictionary:
							data = parsed
			elif args.has("state") and args["state"] is Dictionary:
				data = args["state"]
			else:
				data = args
			if gs and not data.is_empty():
				gs.call("load_state_dict", data)
				var sc_name: String = str(data.get("scene", "ThroneRoom"))
				var sc_path: String = "res://scenes/%s.tscn" % sc_name
				_send_http_response(client, 200, {"success": true, "message": "Loaded save state for scene %s" % sc_name, "scene": sc_name})
				get_tree().call_deferred("change_scene_to_file", sc_path)
			else:
				_send_http_response(client, 400, {"success": false, "message": "Invalid save state payload."})
		"export_save_state", "save_checkpoint":
			var gs: Node = get_node_or_null("/root/GameState")
			var sc: Node = get_tree().current_scene
			var sc_name: String = str(sc.name) if sc else "ThroneRoom"
			var ht: Vector2i = _extract_hero_tile(sc) if sc else Vector2i(4, 5)
			var hf: String = _extract_hero_facing(sc) if sc else "down"
			var exported: Dictionary = gs.call("export_state_dict", sc_name, ht, hf) if gs else {}
			if args.has("file_path") and str(args["file_path"]) != "":
				var out_f := FileAccess.open(str(args["file_path"]), FileAccess.WRITE)
				if out_f:
					out_f.store_string(JSON.stringify(exported, "  "))
					out_f.close()
			_send_http_response(client, 200, {"success": true, "save_state": exported})
		"start_demo":
			var ai: Node = get_node_or_null("/root/AIEngine")
			if ai and ai.has_method("set_demo_mode"):
				ai.call("set_demo_mode", true)
			_send_http_response(client, 200, {"success": true, "demo_mode_enabled": true})
		"stop_demo":
			var ai: Node = get_node_or_null("/root/AIEngine")
			if ai and ai.has_method("set_demo_mode"):
				ai.call("set_demo_mode", false)
			_send_http_response(client, 200, {"success": true, "demo_mode_enabled": false})
		"ai_task":
			var ai: Node = get_node_or_null("/root/AIEngine")
			var task_name: String = str(args.get("task", ""))
			var max_steps: int = int(args.get("max_steps", 400))
			if ai and ai.has_method("start_task") and task_name != "":
				ai.call("start_task", task_name, args, max_steps)
				_send_http_response(client, 200, {"success": true, "task": task_name, "status": "running"})
			else:
				_send_http_response(client, 400, {"success": false, "message": "Invalid ai_task request."})
		_:
			_send_http_response(client, 400, {"success": false, "message": "Unknown command: %s" % cmd})

# ── State Serialization ────────────────────────────────────────────────────────

func get_full_scene_state() -> Dictionary:
	var tree = get_tree()
	var scene = tree.current_scene if tree else null
	
	var scene_info = {
		"path": scene.scene_file_path if scene else "",
		"name": scene.name if scene else ""
	}

	# 1. Hero Position
	var pos_x = 0
	var pos_y = 0
	var facing_str = "down"
	
	if scene:
		var ht := _extract_hero_tile(scene)
		if ht != Vector2i(-1, -1):
			pos_x = ht.x
			pos_y = ht.y
		elif PlayerState and PlayerState.tile_position is Vector2i:
			pos_x = PlayerState.tile_position.x
			pos_y = PlayerState.tile_position.y
		
		var hf := _extract_hero_facing(scene)
		if hf != "":
			facing_str = hf

	var hero_pos = {
		"x": pos_x,
		"y": pos_y,
		"facing": facing_str,
		"location_id": PlayerState.current_location_id if PlayerState else "overworld",
		"floor_id": PlayerState.current_floor_id if PlayerState else "main"
	}

	# 2. Game State
	var gs_node = get_node_or_null("/root/GameState")
	var game_state_info = {}
	if gs_node:
		var hero_stats = gs_node.get("hero_stats") if "hero_stats" in gs_node else {}
		game_state_info = {
			"hero_name": hero_stats.get("name", "ERDRICK"),
			"level": hero_stats.get("level", 1),
			"hp": hero_stats.get("hp", 15),
			"hp_max": hero_stats.get("hp_max", 15),
			"mp": hero_stats.get("mp", 0),
			"mp_max": hero_stats.get("mp_max", 0),
			"gold": gs_node.get("gold") if "gold" in gs_node else 0,
			"inventory": gs_node.get("inventory") if "inventory" in gs_node else [],
			"equipment": {
				"weapon": gs_node.get("weapon") if "weapon" in gs_node else "",
				"armor": gs_node.get("armor") if "armor" in gs_node else ""
			},
			"spells": gs_node.get("spells") if "spells" in gs_node else [],
			"opened_chests": gs_node.get("opened_chests") if "opened_chests" in gs_node else {},
			"unlocked_doors": gs_node.get("unlocked_doors") if "unlocked_doors" in gs_node else {},
			"bridge_built": gs_node.get("bridge_built") if "bridge_built" in gs_node else false,
			"king_intro_done": gs_node.get("king_intro_done") if "king_intro_done" in gs_node else false,
			"demo_mode_enabled": gs_node.get("demo_mode_enabled") if "demo_mode_enabled" in gs_node else false
		}
	elif PlayerState:
		game_state_info = PlayerState.serialize()

	if scene:
		if "_inventory" in scene and scene._inventory is Array and not scene._inventory.is_empty():
			game_state_info["inventory"] = scene._inventory
		if "_door_unlocked" in scene and bool(scene._door_unlocked):
			if not game_state_info.get("unlocked_doors") is Dictionary:
				game_state_info["unlocked_doors"] = {}
			game_state_info["unlocked_doors"]["throne_room"] = true
		game_state_info["move_enabled"] = bool(scene.get("_move_enabled")) if scene.get("_move_enabled") != null else true
		game_state_info["hero_moving"] = bool(scene.get("_hero_moving")) if scene.get("_hero_moving") != null else false

	# 3. Dialog Box
	var dialog_info = {
		"is_showing": false,
		"text": "",
		"speaker": "",
		"current_page": 0,
		"total_pages": 0
	}
	if DialogueEngine and DialogueEngine.is_active:
		dialog_info["is_showing"] = true
		dialog_info["text"] = DialogueEngine.get_current_line()
		dialog_info["speaker"] = DialogueEngine.active_npc_id
		dialog_info["current_page"] = DialogueEngine.current_line_index
		dialog_info["total_pages"] = DialogueEngine.active_dialogue_tree.size()
	elif scene:
		var dlg_panel = scene.get("_dialog_panel")
		var is_dlg_active: bool = (scene.get("_dialog_active") == true) or (dlg_panel != null and "visible" in dlg_panel and dlg_panel.visible == true)
		var choice_panel = scene.get("_choice_panel")
		var is_choice_open: bool = (scene.get("_choice_open") == true) or (choice_panel != null and "visible" in choice_panel and choice_panel.visible == true)
		var shop_panel = scene.get("_shop_panel")
		var is_shop_open: bool = (scene.get("_shop_open") == true) or (shop_panel != null and "visible" in shop_panel and shop_panel.visible == true)

		if is_dlg_active or is_choice_open or is_shop_open:
			dialog_info["is_showing"] = true
			if is_shop_open:
				dialog_info["text"] = "WHAT DOST THOU WANT?"
				dialog_info["speaker"] = "Shopkeeper"
			else:
				var spk_label = scene.get("_speaker_label")
				if spk_label and "text" in spk_label:
					dialog_info["speaker"] = spk_label.text
				var pages = scene.get("_dialog_pages")
				var page_idx = scene.get("_current_page") if scene.get("_current_page") != null else 0
				if pages is Array and page_idx < pages.size():
					dialog_info["total_pages"] = pages.size()
					dialog_info["current_page"] = page_idx
					dialog_info["text"] = str(pages[page_idx])
				else:
					var dlg_label = scene.get("_dialog_label")
					if dlg_label and "text" in dlg_label:
						dialog_info["text"] = dlg_label.text

	# 4. Command Window
	var cmd_info = {
		"is_showing": false,
		"selected_index": 0,
		"menu_items": []
	}
	if scene:
		var is_menu_open = scene.get("_menu_open") if scene.get("_menu_open") != null else false
		var menu_panel = scene.get("_menu_panel")
		if is_menu_open or (menu_panel and menu_panel.visible):
			cmd_info["is_showing"] = true
			cmd_info["selected_index"] = scene.get("_menu_index") if scene.get("_menu_index") != null else 0
			var items = scene.get("MENU_ITEMS")
			if items is Array:
				cmd_info["menu_items"] = items

	# 5. Battle Scene Info
	var battle_info = {
		"is_battle": false,
		"phase": "INACTIVE",
		"battle_scene_info": {}
	}
	if CombatEngine and CombatEngine.current_state != CombatEngine.CombatState.INACTIVE:
		battle_info["is_battle"] = true
		battle_info["phase"] = str(CombatEngine.current_state)
		battle_info["battle_scene_info"] = CombatEngine.active_monster
	elif scene:
		var bo = scene.get_node_or_null("BattleOverlay")
		var is_battle_scene = ("Battle" in scene.name) or (scene.get("_battle_active") == true) or (bo != null)
		if is_battle_scene:
			var battle_node = bo if bo != null else scene
			battle_info["is_battle"] = true
			var phase_names := ["INTRO", "PLAYER_MENU", "SPELL_SELECT", "PLAYER_ACT", "ENEMY_ACT", "VICTORY", "DEFEAT", "FLED"]
			var p_int := int(battle_node.get("_phase")) if battle_node.get("_phase") != null else 0
			battle_info["phase"] = str(p_int)
			battle_info["phase_name"] = phase_names[p_int] if p_int >= 0 and p_int < phase_names.size() else str(p_int)
			var b_cursor := int(battle_node.get("_cursor")) if battle_node.get("_cursor") != null else 0
			var b_items: Array = battle_node.get("MENU_ITEMS") if battle_node.get("MENU_ITEMS") is Array else ["FIGHT", "SPELL", "ITEM", "RUN"]
			var msg_lbl = battle_node.get("_msg_lbl")
			battle_info["cursor"] = b_cursor
			battle_info["selected_command"] = b_items[b_cursor] if b_cursor >= 0 and b_cursor < b_items.size() else "FIGHT"
			battle_info["menu_items"] = b_items
			battle_info["anim_lock"] = bool(battle_node.get("_anim_lock")) if battle_node.get("_anim_lock") != null else false
			battle_info["msg_text"] = str(msg_lbl.text) if msg_lbl and "text" in msg_lbl else ""
			battle_info["last_enemy_action"] = str(battle_node.get("_last_enemy_action")) if battle_node.get("_last_enemy_action") != null else ""
			battle_info["battle_scene_info"] = {
				"monster_key": battle_node.get("_mon_key") if battle_node.get("_mon_key") != null else "",
				"monster_name": battle_node.get("_mon_name") if battle_node.get("_mon_name") != null else "",
				"monster_hp": battle_node.get("_mon_hp") if battle_node.get("_mon_hp") != null else 0,
				"monster_atk": battle_node.get("_mon_str") if battle_node.get("_mon_str") != null else 0,
				"monster_def": battle_node.get("_mon_def") if battle_node.get("_mon_def") != null else 0,
				"hero_hp": battle_node.get("_hero_hp") if battle_node.get("_hero_hp") != null else 0,
				"hero_mp": battle_node.get("_hero_mp") if battle_node.get("_hero_mp") != null else 0
			}

	# 6. Encounter RNG Data
	var rng_info = {
		"zone_id": 0,
		"rate_key": "none",
		"denominator": 0,
		"step_count": 0,
		"last_roll": -1
	}
	if scene and "_terrain" in scene and "_zone_data" in scene:
		var terrain = scene._terrain
		var zone_data = scene._zone_data
		if terrain is Array and not terrain.is_empty() and zone_data is Dictionary:
			var h_tile = scene.get("_hero_tile") if scene.get("_hero_tile") != null else Vector2i(0, 0)
			if h_tile.y < terrain.size() and h_tile.x < terrain[h_tile.y].size():
				var tid = int(terrain[h_tile.y][h_tile.x])
				var rate_key = scene.TERRAIN_RATE_KEY.get(tid, "grass") if "TERRAIN_RATE_KEY" in scene else "grass"
				rng_info["rate_key"] = rate_key
				
				var zone_grid: Array = zone_data.get("grid", [])
				if not zone_grid.is_empty():
					var gc = clamp(int(h_tile.x * 8.0 / 124.0), 0, 7)
					var gr = clamp(int(h_tile.y * 8.0 / 124.0), 0, 7)
					if gr < zone_grid.size() and gc < zone_grid[gr].size():
						var zid = int(zone_grid[gr][gc])
						rng_info["zone_id"] = zid
						var rates: Dictionary = zone_data.get("encounter_rates", {})
						var z_rates: Dictionary = rates.get("zone0" if zid == 0 else "other", {})
						rng_info["denominator"] = int(z_rates.get(rate_key, 24))
	elif scene and scene.has_method("_encounters_enabled") and scene._encounters_enabled():
		rng_info["rate_key"] = "dungeon"
		rng_info["denominator"] = 16

	# Choice Box
	var choice_info = {
		"is_showing": false,
		"selected_index": 0,
		"selected_option": "YES"
	}
	if scene:
		var is_choice_open = scene.get("_choice_open") if scene.get("_choice_open") != null else false
		var choice_panel = scene.get("_choice_panel")
		if is_choice_open or (choice_panel and choice_panel.visible):
			choice_info["is_showing"] = true
			var idx = scene.get("_choice_index") if scene.get("_choice_index") != null else 0
			choice_info["selected_index"] = idx
			choice_info["selected_option"] = "YES" if idx == 0 else "NO"

	# 7. Light Status (Darkness & Visibility Telemetry)
	var is_dark := false
	var torch_active := false
	var radiant_steps_left := 0
	var light_radius := 3
	if scene:
		if scene.has_method("_is_dark"):
			is_dark = scene.call("_is_dark")
		elif "_is_dark" in scene:
			is_dark = bool(scene._is_dark)

		if "_torch_active" in scene:
			torch_active = bool(scene._torch_active)
		if "_radiant_steps_left" in scene:
			radiant_steps_left = int(scene._radiant_steps_left)

		if scene.has_method("_get_current_light_radius"):
			light_radius = int(scene.call("_get_current_light_radius"))
		elif is_dark:
			light_radius = 0

	var light_info = {
		"is_dark": is_dark,
		"torch_active": torch_active,
		"radiant_steps_left": radiant_steps_left,
		"light_radius": light_radius
	}

	var item_window_info = {
		"is_showing": bool(scene.get("_item_open")) if scene and scene.get("_item_open") != null else false,
		"selected_index": int(scene.get("_item_index")) if scene and scene.get("_item_index") != null else 0
	}
	var status_window_info = {
		"is_showing": bool(scene.get("_status_open")) if scene and scene.get("_status_open") != null else false
	}
	var checkpoint_save: Dictionary = {}
	if gs_node and gs_node.has_method("export_state_dict"):
		checkpoint_save = gs_node.call("export_state_dict", str(scene_info.get("name", "ThroneRoom")), Vector2i(pos_x, pos_y), facing_str)
	var ai_node: Node = get_node_or_null("/root/AIEngine")
	var ai_telemetry: Dictionary = ai_node.call("get_telemetry") if ai_node and ai_node.has_method("get_telemetry") else {}

	return {
		"scene_shown": scene_info,
		"hero_position": hero_pos,
		"game_state": game_state_info,
		"dialog_box": dialog_info,
		"choice_box": choice_info,
		"command_window": cmd_info,
		"item_window": item_window_info,
		"status_window": status_window_info,
		"battle": battle_info,
		"encounter_rng": rng_info,
		"light_status": light_info,
		"checkpoint_save_state": checkpoint_save,
		"ai_engine": ai_telemetry
	}

# ── Input Event Simulation ─────────────────────────────────────────────────────

func _inject_single_input(data: Dictionary) -> bool:
	var action_name = data.get("action", "")
	var key_name = data.get("key", "")
	var duration = float(data.get("duration", 0.06))
	
	var sc: Variant = get_tree().current_scene
	if sc and not sc.get("_dialog_active"):
		sc.set("_move_enabled", true)
		sc.set("_hero_moving", false)

	var target = action_name if action_name != "" else key_name
	if target != "":
		await _simulate_key_hold(target, duration)
		await get_tree().create_timer(0.15).timeout
		return true
	return false

func _simulate_key_hold(target_name: String, duration: float) -> void:
	_simulate_action(target_name, true)
	await get_tree().create_timer(duration).timeout
	_simulate_action(target_name, false)
	await get_tree().create_timer(0.05).timeout

func _simulate_action(action_name: String, pressed: bool) -> void:
	var mapped_action = action_name
	match action_name:
		"move_up", "up":           mapped_action = "move_up"
		"move_down", "down":       mapped_action = "move_down"
		"move_left", "left":       mapped_action = "move_left"
		"move_right", "right":     mapped_action = "move_right"
		"ui_up":                   mapped_action = "ui_up"
		"ui_down":                 mapped_action = "ui_down"
		"ui_left":                 mapped_action = "ui_left"
		"ui_right":                mapped_action = "ui_right"
		"ui_accept", "accept", "z": mapped_action = "ui_accept"
		"ui_cancel", "cancel", "x": mapped_action = "ui_cancel"
		"cmd_menu", "menu", "b":    mapped_action = "cmd_menu"

	_parse_action(mapped_action, pressed)

func _parse_action(act: String, pressed: bool) -> void:
	if pressed:
		Input.action_press(act)
	else:
		Input.action_release(act)
	var ev_act = InputEventAction.new()
	ev_act.action = act
	ev_act.pressed = pressed
	Input.parse_input_event(ev_act)

func _simulate_key_code(key_name: String, pressed: bool) -> void:
	var code = -1
	match key_name.to_lower():
		"z", "accept", "ui_accept": code = KEY_Z
		"x", "cancel", "ui_cancel": code = KEY_X
		"b", "menu", "cmd_menu":    code = KEY_B
		"space":                   code = KEY_SPACE
		"enter", "return":         code = KEY_ENTER
		"up", "move_up", "ui_up":       code = KEY_UP
		"down", "move_down", "ui_down":   code = KEY_DOWN
		"left", "move_left", "ui_left":   code = KEY_LEFT
		"right", "move_right", "ui_right": code = KEY_RIGHT

	if code != -1:
		var ev_key = InputEventKey.new()
		ev_key.keycode = code
		ev_key.pressed = pressed
		Input.parse_input_event(ev_key)

# ── Screen Contents Extraction ──────────────────────────────────────────────────

func _load_registries_if_needed() -> void:
	if _chest_registry_cache.is_empty():
		var f := FileAccess.open("res://data/v1/chest_registry.json", FileAccess.READ)
		if f:
			var parsed: Variant = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				_chest_registry_cache = parsed
	if _door_registry_cache.is_empty():
		var f := FileAccess.open("res://data/v1/door_registry.json", FileAccess.READ)
		if f:
			var parsed: Variant = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				_door_registry_cache = parsed
	if _stair_registry_cache.is_empty():
		var f := FileAccess.open("res://data/v1/stair_registry.json", FileAccess.READ)
		if f:
			var parsed: Variant = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				_stair_registry_cache = parsed
	if _shops_registry_cache.is_empty():
		var f := FileAccess.open("res://data/v1/shops.json", FileAccess.READ)
		if f:
			var parsed: Variant = JSON.parse_string(f.get_as_text())
			if parsed is Array:
				_shops_registry_cache = parsed

func _get_active_scene_map_key(scene: Node) -> String:
	if not scene:
		return ""
	if scene.has_method("_get_map_key"):
		return scene._get_map_key()
	var path: String = scene.scene_file_path if scene.scene_file_path != "" else scene.name
	path = path.get_file().get_basename().to_lower()
	match path:
		"castle1f": return "tantegel-castle-1f"
		"throneroom": return "tantegel-castle-2f"
		"tantegelbasement": return "tantegel-castle-b1"
		"worldmap": return "world_map"
		"brecconary": return "brecconary-1f"
		"garinham": return "garinham-1f"
		"kol": return "kol-1f"
		"rimuldar": return "rimuldar-1f"
		"cantlin": return "cantlin-1f"
		"hauksness": return "hauksness-1f"
		"charlockcastle1f": return "charlock-castle-1f"
		"charlockthroneroom": return "charlock-throne-room"
		"erdrickscaveb1": return "erdricks-cave-b1"
		"erdrickscaveb2": return "erdricks-cave-b2"
		"mountaincaveb1": return "mountain-cave-b1"
		"mountaincaveb2": return "mountain-cave-b2"
		"swampcave": return "swamp-cave-b1"
		_: return path

func get_screen_contents() -> Dictionary:
	_load_registries_if_needed()
	var tree := get_tree()
	var scene := tree.current_scene if tree else null

	var VW := 512
	var VH := 480
	var TILE_SIZE := 32

	var pos_x := 0
	var pos_y := 0
	var facing_str := "down"

	if scene:
		var ht := _extract_hero_tile(scene)
		if ht != Vector2i(-1, -1):
			pos_x = ht.x
			pos_y = ht.y
		elif PlayerState and PlayerState.tile_position is Vector2i:
			pos_x = PlayerState.tile_position.x
			pos_y = PlayerState.tile_position.y

		var hf := _extract_hero_facing(scene)
		if hf != "":
			facing_str = hf

	var cam_x := (pos_x + 0.5) * TILE_SIZE
	var cam_y := (pos_y + 0.5) * TILE_SIZE
	if scene and "_cam_world" in scene and scene._cam_world is Vector2:
		cam_x = scene._cam_world.x
		cam_y = scene._cam_world.y

	var half_w := VW * 0.5
	var half_h := VH * 0.5
	var min_col := int(floor((cam_x - half_w) / float(TILE_SIZE)))
	var min_row := int(floor((cam_y - half_h) / float(TILE_SIZE)))
	var max_col := int(ceil((cam_x + half_w) / float(TILE_SIZE)))
	var max_row := int(ceil((cam_y + half_h) / float(TILE_SIZE)))

	var map_key := _get_active_scene_map_key(scene)

	# Registries
	var map_chests: Array = _chest_registry_cache.get(map_key, [])
	var map_doors: Array = _door_registry_cache.get(map_key, [])
	var map_stairs: Array = _stair_registry_cache.get(map_key, [])

	# Opened chests and unlocked doors
	var opened_chests: Dictionary = {}
	var unlocked_doors: Dictionary = {}
	var gs := get_node_or_null("/root/GameState")
	if gs:
		if "opened_chests" in gs and gs.opened_chests is Dictionary: opened_chests = gs.opened_chests
		if "unlocked_doors" in gs and gs.unlocked_doors is Dictionary: unlocked_doors = gs.unlocked_doors
	if scene and "_opened_chests" in scene and scene._opened_chests is Dictionary:
		for k in scene._opened_chests:
			opened_chests[k] = scene._opened_chests[k]

	# Build NPCs & shop desks index map
	var npc_map: Dictionary = {}
	var shop_desk_map: Dictionary = {}

	# DungeonMap style NPCs
	if scene and "_npc_data" in scene and scene._npc_data is Array:
		for npc_entry in scene._npc_data:
			if npc_entry is Dictionary:
				var t: Vector2i = npc_entry.get("tile", Vector2i(-1, -1))
				if t != Vector2i(-1, -1):
					npc_map[t] = npc_entry
				var d_tile: Vector2i = npc_entry.get("desk_tile", Vector2i(-1, -1))
				if d_tile != Vector2i(-1, -1):
					shop_desk_map[d_tile] = {
						"shop_id": npc_entry.get("shop_id", ""),
						"npc_speaker": npc_entry.get("speaker", "Shopkeeper"),
						"npc_tile": [t.x, t.y]
					}
	# Castle1F / ThroneRoom style NPCs
	if scene and "NPC_DIALOGS" in scene and scene.NPC_DIALOGS is Dictionary:
		for key_int in scene.NPC_DIALOGS:
			var col := int(key_int) / 100
			var row := int(key_int) % 100
			var nd: Dictionary = scene.NPC_DIALOGS[key_int]
			var facing := "down"
			if "NPC_FACING" in scene and scene.NPC_FACING is Dictionary and scene.NPC_FACING.has(key_int):
				facing = str(scene.NPC_FACING[key_int])
			npc_map[Vector2i(col, row)] = {
				"speaker": nd.get("speaker", ""),
				"pages": nd.get("pages", []),
				"facing": facing
			}

	# Shops registry desk tiles
	for shop in _shops_registry_cache:
		if shop is Dictionary:
			var s_map: String = str(shop.get("map_key", ""))
			if s_map == map_key or s_map == map_key.replace("-1f", ""):
				var d_tile_arr: Array = shop.get("desk_tile", []) if shop.get("desk_tile") != null else []
				if d_tile_arr.size() >= 2:
					var dt := Vector2i(int(d_tile_arr[0]), int(d_tile_arr[1]))
					if not shop_desk_map.has(dt):
						var n_tile_arr: Array = shop.get("npc_tile", []) if shop.get("npc_tile") != null else []
						shop_desk_map[dt] = {
							"shop_id": shop.get("id", ""),
							"npc_speaker": shop.get("name", "Merchant"),
							"npc_tile": n_tile_arr
						}

	var tiles_list: Array = []
	var grid_2d: Array = []
	var ascii_matrix: Array = []

	var map_w := 124 if map_key == "world_map" else 32
	var map_h := 124 if map_key == "world_map" else 32
	if scene:
		if scene.has_method("_get_map_w"): map_w = scene._get_map_w()
		elif "MAP_W" in scene: map_w = scene.MAP_W
		if scene.has_method("_get_map_h"): map_h = scene._get_map_h()
		elif "MAP_H" in scene: map_h = scene.MAP_H

	var screen_r := 0
	for r in range(min_row, max_row + 1):
		var row_tiles: Array = []
		var row_str := ""
		var screen_c := 0
		for c in range(min_col, max_col + 1):
			var tile_pos := Vector2i(c, r)
			var tile_id := -1
			var is_walkable := true
			var is_oob := (c < 0 or c >= map_w or r < 0 or r >= map_h)

			if scene and not is_oob:
				if "_tile_grid" in scene and scene._tile_grid is Array and not scene._tile_grid.is_empty():
					if r >= 0 and r < scene._tile_grid.size() and c >= 0 and c < scene._tile_grid[r].size():
						tile_id = int(scene._tile_grid[r][c])
				elif "MAP_GRID" in scene and scene.MAP_GRID is Array and not scene.MAP_GRID.is_empty():
					if r >= 0 and r < scene.MAP_GRID.size() and c >= 0 and c < scene.MAP_GRID[r].size():
						tile_id = int(scene.MAP_GRID[r][c])
				elif "_terrain" in scene and scene._terrain is Array and not scene._terrain.is_empty():
					if r >= 0 and r < scene._terrain.size() and c >= 0 and c < scene._terrain[r].size():
						tile_id = int(scene._terrain[r][c])

				if scene.has_method("_is_walkable"):
					is_walkable = scene._is_walkable(tile_pos)
				elif TileWalkability:
					is_walkable = TileWalkability.is_walkable(tile_id) if tile_id != -1 else false
			else:
				is_walkable = false

			var is_hero := (c == pos_x and r == pos_y)

			# NPC on tile
			var npc_data = null
			if npc_map.has(tile_pos):
				var n: Dictionary = npc_map[tile_pos]
				npc_data = {
					"speaker": n.get("speaker", ""),
					"sprite_id": n.get("sprite_id", ""),
					"facing": n.get("facing", "down"),
					"shop_id": n.get("shop_id", ""),
					"inn_cost": n.get("inn_cost", 0),
					"pages": n.get("pages", [])
				}

			# Chest on tile
			var chest_data = null
			var coord_str := "%d,%d" % [c, r]
			var is_chest_open: bool = opened_chests.has(map_key + ":" + coord_str) or opened_chests.has("throne_room:" + coord_str) or opened_chests.has("castle_1f:" + coord_str) or opened_chests.has(coord_str)
			for ch in map_chests:
				if ch is Dictionary and int(ch.get("col", -1)) == c and int(ch.get("row", -1)) == r:
					var chest_id: String = str(ch.get("id", ""))
					var is_open: bool = is_chest_open or opened_chests.has(chest_id)
					chest_data = {
						"chest_id": chest_id,
						"opened": is_open
					}
					break
			if chest_data == null and scene and "CHEST_ITEMS" in scene and scene.CHEST_ITEMS is Dictionary and scene.CHEST_ITEMS.has(coord_str):
				var ci: Dictionary = scene.CHEST_ITEMS[coord_str]
				chest_data = {
					"chest_id": map_key + "_" + coord_str,
					"opened": is_chest_open,
					"name": str(ci.get("name", "")),
					"type": str(ci.get("type", "item"))
				}
			elif chest_data == null and tile_id == 30:
				chest_data = {
					"chest_id": map_key + "_" + coord_str,
					"opened": is_chest_open
				}

			# Shop desk on tile
			var shop_desk_data = null
			if shop_desk_map.has(tile_pos):
				shop_desk_data = shop_desk_map[tile_pos]

			# Door on tile
			var door_data = null
			var scene_door_unlocked: bool = bool(scene.get("_door_unlocked")) if scene and "_door_unlocked" in scene else false
			for dr in map_doors:
				if dr is Dictionary and int(dr.get("col", -1)) == c and int(dr.get("row", -1)) == r:
					var door_id: String = str(dr.get("id", ""))
					var is_unlocked: bool = scene_door_unlocked or unlocked_doors.has(door_id) or unlocked_doors.has("%d,%d" % [c, r])
					door_data = {
						"door_id": door_id,
						"unlocked": is_unlocked
					}
					break
			if door_data == null and tile_id == 10:
				var is_unlocked: bool = scene_door_unlocked or unlocked_doors.has("throne_room") or unlocked_doors.has(coord_str)
				door_data = {
					"door_id": map_key + "_door_" + coord_str,
					"unlocked": is_unlocked
				}

			# Stairs on tile
			var stairs_data = null
			for st in map_stairs:
				if st is Dictionary and st.has("tile"):
					var st_tile: Dictionary = st["tile"]
					if int(st_tile.get("col", -1)) == c and int(st_tile.get("row", -1)) == r:
						stairs_data = {
							"stair_id": str(st.get("id", "")),
							"facing": str(st.get("facing", "")),
							"to": str(st.get("to", ""))
						}
						break
			if stairs_data == null and tile_id in [8, 21, 33, 34]:
				stairs_data = {
					"stair_id": map_key + "_stairs_" + coord_str,
					"facing": "any",
					"to": "Castle1F" if map_key == "tantegel-castle-2f" else ""
				}

			# Determine symbol
			var sym_name := "FLOOR"
			var char_sym := "."
			if is_hero:
				sym_name = "HERO"
				char_sym = "@"
			elif npc_data != null:
				sym_name = "NPC"
				char_sym = "N"
			elif chest_data != null:
				sym_name = "CHEST"
				char_sym = "C"
			elif shop_desk_data != null:
				sym_name = "SHOP_DESK"
				char_sym = "$"
			elif door_data != null:
				sym_name = "DOOR"
				char_sym = "D"
			elif stairs_data != null:
				sym_name = "STAIRS"
				char_sym = "S"
			elif is_oob:
				sym_name = "OUT_OF_BOUNDS"
				char_sym = " "
			elif not is_walkable:
				sym_name = "WALL"
				char_sym = "#"

			var tile_obj := {
				"screen_col": screen_c,
				"screen_row": screen_r,
				"col": c,
				"row": r,
				"tile_id": tile_id,
				"symbol": sym_name,
				"walkable": is_walkable,
				"is_hero": is_hero,
				"out_of_bounds": is_oob,
				"npc": npc_data,
				"chest": chest_data,
				"shop_desk": shop_desk_data,
				"door": door_data,
				"stairs": stairs_data
			}
			tiles_list.append(tile_obj)
			row_tiles.append(tile_obj)
			row_str += char_sym
			screen_c += 1

		grid_2d.append(row_tiles)
		ascii_matrix.append(row_str)
		screen_r += 1

	return {
		"viewport": {
			"width": VW,
			"height": VH,
			"tile_size": TILE_SIZE
		},
		"camera": {
			"x": cam_x,
			"y": cam_y
		},
		"bounds": {
			"min_col": min_col,
			"min_row": min_row,
			"max_col": max_col,
			"max_row": max_row,
			"cols": max_col - min_col + 1,
			"rows": max_row - min_row + 1
		},
		"hero": {
			"col": pos_x,
			"row": pos_y,
			"facing": facing_str
		},
		"matrix": ascii_matrix,
		"grid": grid_2d,
		"tiles": tiles_list,
		"map_overview": _build_map_overview(scene, map_key, map_w, map_h, pos_x, pos_y, opened_chests, unlocked_doors, npc_map)
	}


func _build_map_overview(scene: Node, map_key: String, map_w: int, map_h: int, pos_x: int, pos_y: int, opened_chests: Dictionary, unlocked_doors: Dictionary, npc_map: Dictionary) -> Dictionary:
	var all_chests: Array = []
	var all_doors: Array = []
	var all_stairs: Array = []
	var all_exits: Array = []
	var walkable_matrix: Array = []
	if not scene:
		return {
			"map_key": map_key,
			"map_w": map_w,
			"map_h": map_h,
			"walkable_matrix": walkable_matrix,
			"all_chests": all_chests,
			"all_doors": all_doors,
			"all_stairs": all_stairs,
			"all_exits": all_exits
		}

	var scene_door_unlocked: bool = bool(scene.get("_door_unlocked")) if "_door_unlocked" in scene else false
	var scan_w := mini(map_w, 40)
	var scan_h := mini(map_h, 40)
	var offset_x := 0
	var offset_y := 0
	if map_w > 40 or map_h > 40:
		offset_x = maxi(0, mini(map_w - scan_w, pos_x - scan_w / 2))
		offset_y = maxi(0, mini(map_h - scan_h, pos_y - scan_h / 2))

	for r in range(offset_y, offset_y + scan_h):
		var row_str := ""
		for c in range(offset_x, offset_x + scan_w):
			var tp := Vector2i(c, r)
			var tid := -1
			if "_tile_grid" in scene and scene._tile_grid is Array and r < scene._tile_grid.size() and c < scene._tile_grid[r].size():
				tid = int(scene._tile_grid[r][c])
			elif "MAP_GRID" in scene and scene.MAP_GRID is Array and r < scene.MAP_GRID.size() and c < scene.MAP_GRID[r].size():
				tid = int(scene.MAP_GRID[r][c])
			elif "_terrain" in scene and scene._terrain is Array and r < scene._terrain.size() and c < scene._terrain[r].size():
				tid = int(scene._terrain[r][c])

			var walkable := false
			if scene.has_method("_is_walkable"):
				walkable = scene._is_walkable(tp)
			elif TileWalkability:
				walkable = TileWalkability.is_walkable(tid) if tid != -1 else false

			var coord_str := "%d,%d" % [c, r]
			var is_chest_open: bool = opened_chests.has(map_key + ":" + coord_str) or opened_chests.has("throne_room:" + coord_str) or opened_chests.has("castle_1f:" + coord_str) or opened_chests.has(coord_str)

			if tid == 30 or ("CHEST_ITEMS" in scene and scene.CHEST_ITEMS is Dictionary and scene.CHEST_ITEMS.has(coord_str)):
				var cname := ""
				var ctype := "item"
				if "CHEST_ITEMS" in scene and scene.CHEST_ITEMS is Dictionary and scene.CHEST_ITEMS.has(coord_str):
					var ci: Dictionary = scene.CHEST_ITEMS[coord_str]
					cname = str(ci.get("name", ""))
					ctype = str(ci.get("type", "item"))
				all_chests.append({
					"col": c,
					"row": r,
					"opened": is_chest_open,
					"name": cname,
					"type": ctype
				})

			var is_door := (tid == 10)
			var door_unlocked := scene_door_unlocked or unlocked_doors.has("throne_room") or unlocked_doors.has(coord_str)
			if is_door:
				all_doors.append({
					"col": c,
					"row": r,
					"unlocked": door_unlocked,
					"door_id": map_key + "_door_" + coord_str
				})

			if tid in [8, 21, 33, 34]:
				all_stairs.append({
					"col": c,
					"row": r,
					"tile_id": tid,
					"to": "Castle1F" if map_key == "tantegel-castle-2f" else ""
				})

			if map_key == "tantegel-castle-1f" and r == map_h - 2 and c >= 11 and c <= 12:
				all_exits.append({
					"col": c,
					"row": r,
					"direction": "down",
					"to": "WorldMap"
				})

			var ch_sym := "." if walkable else "#"
			if c == pos_x and r == pos_y:
				ch_sym = "@"
			elif npc_map.has(tp):
				ch_sym = "N"
			elif is_door and not door_unlocked:
				ch_sym = "D"
			elif tid == 30 and not is_chest_open:
				ch_sym = "C"
			elif tid in [8, 21, 33, 34]:
				ch_sym = "S"
			row_str += ch_sym
		walkable_matrix.append(row_str)

	return {
		"map_key": map_key,
		"map_w": map_w,
		"map_h": map_h,
		"offset_x": offset_x,
		"offset_y": offset_y,
		"walkable_matrix": walkable_matrix,
		"all_chests": all_chests,
		"all_doors": all_doors,
		"all_stairs": all_stairs,
		"all_exits": all_exits
	}


func _extract_hero_tile(scene: Node) -> Vector2i:
	if not scene:
		return Vector2i(-1, -1)
	var ht: Variant = scene.get("_hero_tile")
	if ht != null and ht is Vector2i:
		return ht
	ht = scene.get("hero_tile")
	if ht != null and ht is Vector2i:
		return ht
	ht = scene.get("spawn_tile")
	if ht != null and ht is Vector2i:
		return ht
	if PlayerState and PlayerState.tile_position is Vector2i and PlayerState.tile_position != Vector2i(-1, -1):
		return PlayerState.tile_position
	return Vector2i(-1, -1)


func _extract_hero_facing(scene: Node) -> String:
	if not scene:
		return ""
	var hf: Variant = scene.get("_hero_facing")
	if hf == null:
		hf = scene.get("hero_facing")
	if hf == null:
		hf = scene.get("spawn_facing")
	if hf != null:
		if hf is Vector2i:
			if hf == Vector2i(0, 1): return "down"
			elif hf == Vector2i(0, -1): return "up"
			elif hf == Vector2i(-1, 0): return "left"
			elif hf == Vector2i(1, 0): return "right"
		elif hf is String:
			return hf
	return ""

