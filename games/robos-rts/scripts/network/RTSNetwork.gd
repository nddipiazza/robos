extends Node

signal status_changed(message: String)

const Wire = preload("res://scripts/network/RTSWire.gd")
const DEFAULT_PORT := Wire.PORT
const MAX_BACKLOG := 192

var seat := 0
var state := "idle"
var match_active := false
var watching_ai := false
var hosting_ai := false
var commander_cameras := [Vector2.INF, Vector2.INF]
var status_message := ""
var _host: ENetConnection
var _peer: ENetPacketPeer
var _join_message: Array = []
var _incoming: Array = []
var _deadline := 0
var _received_result := false
var _ai_events: Array = []
var _server_setup: Array = []
var _order_sequence := 0

func _ready() -> void:
	set_process(false)

func join_match(address: String, port: int, faction: String, room_code: String, mode := "play", other := "random") -> void:
	if match_active or state != "idle":
		return
	address = address.strip_edges()
	if address.is_empty() or address.length() > 253 or port < 1 or port > 65535 or room_code.length() > 64:
		_set_status("idle", "Enter a server address, a valid UDP port, and a room code of up to 64 characters.")
		return
	_host = ENetConnection.new()
	if _host.create_host(1, 1) != OK:
		_fail("Could not initialize online networking.")
		return
	_peer = _host.connect_to_host(address, port, 1)
	if _peer == null:
		_fail("Could not resolve that server address.")
		return
	watching_ai = mode != "play"
	hosting_ai = mode == "host_ai"
	_join_message = ["join", Wire.VERSION, faction, room_code, mode, other]
	_order_sequence = 0
	_deadline = Time.get_ticks_msec() + 8000
	_received_result = false
	set_process(true)
	_set_status("connecting", "Connecting to %s:%d…" % [address, port])

func launch_ai_match() -> void:
	if state == "waiting" and hosting_ai:
		_send(["launch"])

func ready_for_match() -> void:
	if state == "loading" and _peer != null:
		if _server_setup != Wire.match_setup(SimEngine):
			_fail("The server and client disagree on the battlefield setup.")
			return
		_send(["ready", Wire.digest(SimEngine), Wire.compatibility_digest(SimEngine)])

func issue_order(tags: Array, ability: String, position: Vector2, target: int, extra: String, queued: bool) -> Dictionary:
	if state != "playing" or watching_ai:
		return {"ok": false, "error": "Waiting for the server."}
	if tags.is_empty() or tags.size() > Wire.MAX_TAGS or not position.is_finite():
		return {"ok": false, "error": "Invalid online order."}
	_order_sequence += 1
	var ok := _send(["order", tags, ability, position.x, position.y, target, extra, queued, _order_sequence])
	return {"ok": ok, "accepted": tags.size() if ok else 0, "error": "" if ok else "Could not send order."}

func surrender() -> void:
	if state == "playing" and not watching_ai:
		_send(["surrender"])

func leave_match() -> void:
	if _peer != null and _peer.get_state() == ENetPacketPeer.STATE_CONNECTED:
		_send(["leave"])
		_peer.peer_disconnect_later()
		_host.flush()
	_close_transport()
	_incoming.clear()
	_join_message.clear()
	_server_setup.clear()
	_received_result = false
	seat = 0
	match_active = false
	watching_ai = false
	hosting_ai = false
	commander_cameras = [Vector2.INF, Vector2.INF]
	SimEngine.network_clock = false
	SimEngine.network_ai_events = Callable()
	_set_status("idle", "")
	set_process(false)

func _process(_delta: float) -> void:
	if _host != null:
		for _i in 96:
			var event := _host.service()
			match int(event[0]):
				ENetConnection.EVENT_NONE:
					break
				ENetConnection.EVENT_CONNECT:
					_peer.set_timeout(16, 4000, 9000)
					_send(_join_message)
					_join_message.clear()
				ENetConnection.EVENT_RECEIVE:
					_receive(Wire.receive(event[1], Wire.MAX_SERVER_BYTES))
				ENetConnection.EVENT_ERROR, ENetConnection.EVENT_DISCONNECT:
					if not _received_result:
						_fail("Connection to the game server was lost.")
					else:
						_close_transport()
						if state == "finished":
							set_process(false)
					break
			if _host == null:
				break
	if state in ["connecting", "loading"] and Time.get_ticks_msec() >= _deadline:
		_fail("The game server did not respond in time.")
	for _i in mini(_incoming.size(), 12):
		_apply_message(_incoming.pop_front())
		if _incoming.is_empty():
			break

func _receive(message: Array) -> void:
	if message.is_empty():
		return
	match str(message[0]):
		"error":
			if message.size() == 2:
				_fail(str(message[1]))
		"waiting":
			if state == "connecting" and message.size() == 3:
				seat = int(message[1])
				var message_text := "Joined as player %d. Waiting for a second player…" % seat
				if watching_ai:
					message_text = "Lobby ready. Start when your viewers are ready." if hosting_ai else "Waiting for the host to start Frontier Hunters…"
				_set_status("waiting", message_text)
		"start":
			if state != "waiting" or message.size() != 7 or int(message[1]) != seat or not message[4] is Array or message[5] != watching_ai or not message[6] is Array:
				return
			_server_setup = message[6]
			match_active = true
			SimEngine.network_clock = true
			SimEngine.title_battle_view = {}
			SimEngine.resume_from_title = false
			_deadline = Time.get_ticks_msec() + 32000
			_set_status("loading", "Loading the battlefield…")
			if watching_ai:
				SimEngine.network_ai_events = _apply_ai_events
			var result := SimEngine.start_online_match(str(message[2]), int(message[3]), message[4], watching_ai)
			if not result.ok:
				match_active = false
				SimEngine.network_clock = false
				SimEngine.network_ai_events = Callable()
				_fail(str(result.error))
		"live":
			if state == "loading":
				_set_status("playing", "Online match started.")
		"notice":
			if message.size() == 2 and match_active:
				SimEngine.notice.emit(seat, str(message[1]), "warn")
		"frame", "end":
			if match_active:
				_received_result = _received_result or message[0] == "end"
				_incoming.append(message)
				if _incoming.size() > MAX_BACKLOG:
					_fail("The client fell too far behind the game server.")

func _apply_message(message: Array) -> void:
	if message[0] == "end" and message.size() == 3:
		if not SimEngine._scenario_finished():
			SimEngine._finish_match(int(message[1]), str(message[2]))
		_set_status("finished", "")
		if _host == null:
			set_process(false)
		return
	if message[0] != "frame" or message.size() != 6 or not Wire.integer(message[1], 0, 2147483647) or not message[2] is Array or not message[4] is Array or not message[5] is Array:
		_fail("Match synchronization was lost.")
		return
	var frame_tick := int(message[1])
	if frame_tick < SimEngine.tick:
		return
	if frame_tick != SimEngine.tick:
		_fail("Match synchronization was lost.")
		return
	for order in message[2]:
		if not order is Array or order.size() != 7:
			_fail("The server sent an invalid command frame.")
			return
		Wire.apply_order(SimEngine, order)
	_ai_events = message[4]
	SimEngine.step_ticks(Wire.FRAME_TICKS)
	_ai_events = []
	if watching_ai and message[5].size() == 2:
		for index in range(2):
			var position: Variant = message[5][index]
			if position is Array and position.size() == 2:
				commander_cameras[index] = Vector2(position[0], position[1])
	if message[3] != "" and message[3] != Wire.digest(SimEngine):
		_fail("The simulation diverged. Check that both players have the same game build.")

func _apply_ai_events() -> void:
	for event in _ai_events:
		if not event is Array or event.is_empty():
			continue
		if event[0] is Array and event.size() == 8:
			SimEngine.issue_command(event[0], event[1], Vector2(event[2], event[3]), int(event[4]), event[5], event[6], event[7])
		elif event.size() >= 2 and SimEngine.units.has(int(event[1])):
			var unit: Dictionary = SimEngine.units[int(event[1])]
			if not unit.orders.is_empty():
				if event[0] == "intercept" and event.size() == 5:
					RTSCommanderAI.set_defense_intercept(unit, Vector2(event[2], event[3]), event[4])
				elif event[0] == "arrival":
					RTSCommanderAI.set_attack_arrival(unit)

func _send(message: Array) -> bool:
	if _host == null or _peer == null or Wire.send(_peer, message) != OK:
		return false
	_host.flush()
	return true

func _close_transport() -> void:
	if _host != null:
		_host.destroy()
	_host = null
	_peer = null

func _fail(message: String) -> void:
	push_warning("RTS connection stopped at tick %d: %s" % [SimEngine.tick, message])
	_close_transport()
	_incoming.clear()
	_join_message.clear()
	set_process(false)
	if match_active:
		if SimEngine.match_state.get("status") == "playing":
			SimEngine._finish_match(0, "connection_lost")
		_set_status("finished", message)
		SimEngine.notice.emit(seat, message, "warn")
	else:
		seat = 0
		_set_status("idle", message)

func _set_status(next: String, message: String) -> void:
	state = next
	status_message = message
	status_changed.emit(message)
