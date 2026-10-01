# RobOS Tabletop RPG: GameControlServer
# Headless telemetry and action injection HTTP REST server listening on port 18092.
extends Node

var tcp_server: TCPServer
var port: int = 18092
var clients: Array[StreamPeerTCP] = []

func _ready() -> void:
	var port_env = OS.get_environment("TABLETOP_SERVER_PORT")
	if port_env != "":
		port = int(port_env)
	
	tcp_server = TCPServer.new()
	var err = tcp_server.listen(port, "127.0.0.1")
	if err == OK:
		print("📡 [GameControlServer] Listening on http://127.0.0.1:%d" % port)
	else:
		print("⚠️ [GameControlServer] Could not bind port %d: %d" % [port, err])

func _process(_delta: float) -> void:
	if not tcp_server or not tcp_server.is_listening():
		return

	while tcp_server.is_connection_available():
		var peer = tcp_server.take_connection()
		if peer:
			clients.append(peer)

	var active_clients: Array[StreamPeerTCP] = []
	for client in clients:
		if client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
			active_clients.append(client)
			if client.get_available_bytes() > 0:
				_handle_request(client)
	clients = active_clients

func _handle_request(client: StreamPeerTCP) -> void:
	var raw = client.get_utf8_string(client.get_available_bytes())
	var lines = raw.split("\r\n")
	if lines.size() == 0:
		return
	var req_line = lines[0].split(" ")
	if req_line.size() < 2:
		return
	var method = req_line[0]
	var path_str = req_line[1].split("?")[0]

	var body_dict: Dictionary = {}
	var empty_line_idx = raw.find("\r\n\r\n")
	if empty_line_idx != -1:
		var body_str = raw.substr(empty_line_idx + 4)
		if body_str.strip_edges() != "":
			var json = JSON.new()
			if json.parse(body_str) == OK and json.data is Dictionary:
				body_dict = json.data

	# Routing
	if method == "GET" and (path_str == "/api/v1/state" or path_str == "/state"):
		var world = get_tree().root.get_node_or_null("TabletopWorld")
		var state: Dictionary = {}
		if world and world.has_method("get_telemetry_state"):
			state = world.get_telemetry_state()
		else:
			state = {
				"cartridge": CartridgeManager.active_cartridge.get("cartridgeId", ""),
				"isCartridgeActive": CartridgeManager.is_cartridge_active
			}
		_send_json(client, 200, state)

	elif method == "GET" and (path_str == "/api/v1/cartridges" or path_str == "/cartridges"):
		_send_json(client, 200, {
			"activeCartridge": CartridgeManager.active_cartridge.get("cartridgeId", ""),
			"cartridges": CartridgeManager.discover_cartridges()
		})

	elif method == "POST" and (path_str == "/api/v1/action" or path_str == "/action"):
		var world = get_tree().root.get_node_or_null("TabletopWorld")
		var res: Dictionary = { "success": false }
		if world and world.has_method("execute_action"):
			res = world.execute_action(body_dict)
		_send_json(client, 200, res)

	elif method == "POST" and (path_str == "/api/v1/cartridge/insert" or path_str == "/cartridge/insert"):
		var target = str(body_dict.get("cartridge", body_dict.get("id", "")))
		var ok = CartridgeManager.insert_cartridge(target)
		_send_json(client, 200, { "success": ok, "cartridge": CartridgeManager.current_cartridge_slug })

	else:
		_send_json(client, 404, { "error": "Not Found", "path": path_str })

func _send_json(client: StreamPeerTCP, code: int, data: Dictionary) -> void:
	var body = JSON.stringify(data)
	var status_text = "OK" if code == 200 else "Not Found"
	var response = "HTTP/1.1 %d %s\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: %d\r\n\r\n%s" % [
		code, status_text, body.length(), body
	]
	client.put_data(response.to_utf8_buffer())
	client.disconnect_from_host()
