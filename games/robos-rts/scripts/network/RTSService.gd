extends SceneTree

const Wire = preload("res://scripts/network/RTSWire.gd")
const FRAME_SECONDS := Wire.FRAME_TICKS / 64.0
const HELLO_TIMEOUT := 6000
const READY_TIMEOUT := 30000
const MAX_PENDING := 72

var _sim: Node
var _host := ENetConnection.new()
var _peers := {}
var _seats := {}
var _pending: Array = []
var _phase := "lobby"
var _clock := 0.0
var _ready_deadline := 0
var _compatibility_digest := ""
var _room_code := ""
var _map := "iron-narrows"
var _room_seed := 0
var _fixed_seed := -1
var _started := false
var _watch_factions: Array = []
var _watch_host: ENetPacketPeer

func _initialize() -> void:
	call_deferred("_start")

func _start() -> void:
	_sim = root.get_node("SimEngine")
	_sim.rts_mode = "backend"
	_sim.network_clock = true
	Engine.max_fps = 128
	var bind_address := "127.0.0.1"
	var port := Wire.PORT
	_room_code = OS.get_environment("RTS_ROOM_CODE")
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--rts-bind="):
			bind_address = arg.trim_prefix("--rts-bind=")
		elif arg.begins_with("--rts-port="):
			port = arg.trim_prefix("--rts-port=").to_int()
		elif arg.begins_with("--rts-map="):
			_map = arg.trim_prefix("--rts-map=")
		elif arg.begins_with("--rts-seed="):
			var seed_text := arg.trim_prefix("--rts-seed=")
			if not seed_text.is_valid_int() or seed_text.to_int() < 0 or seed_text.to_int() > 4294967295:
				printerr("RTS seed must be an unsigned 32-bit integer.")
				quit(2)
				return
			_fixed_seed = seed_text.to_int()
	if port < 1 or port > 65535 or not _sim.SKIRMISH_MAPS.has(_map) or _room_code.length() > 64:
		printerr("Invalid RTS service port, map, or room code.")
		quit(2)
		return
	var result := _host.create_host_bound(bind_address, port, 8, 1)
	if result != OK:
		printerr("Could not bind RTS UDP service on %s:%d: %s" % [bind_address, port, error_string(result)])
		quit(2)
		return
	_started = true
	_event("listening", {"address": bind_address, "port": port, "map": _map})

func _process(delta: float) -> bool:
	if not _started:
		return false
	for _i in 96:
		var event := _host.service()
		match int(event[0]):
			ENetConnection.EVENT_NONE:
				break
			ENetConnection.EVENT_ERROR:
				printerr("RTS transport failed.")
				quit(1)
				return false
			ENetConnection.EVENT_CONNECT:
				var peer: ENetPacketPeer = event[1]
				peer.set_timeout(16, 4000, 9000)
				_peers[peer] = {"seat": 0, "deadline": Time.get_ticks_msec() + HELLO_TIMEOUT}
			ENetConnection.EVENT_DISCONNECT:
				_drop(event[1])
			ENetConnection.EVENT_RECEIVE:
				var peer: ENetPacketPeer = event[1]
				_receive(peer, Wire.receive(peer, Wire.MAX_CLIENT_BYTES))
	var now := Time.get_ticks_msec()
	for peer in _peers.keys():
		if _peers[peer].seat == 0 and now >= _peers[peer].deadline:
			peer.peer_disconnect_now()
			_peers.erase(peer)
	if _phase == "preparing" and now >= _ready_deadline:
		_finish(0, "setup_timeout")
	if _phase == "playing":
		_clock = minf(_clock + delta, FRAME_SECONDS * 6)
		while _clock >= FRAME_SECONDS and _phase == "playing":
			_clock -= FRAME_SECONDS
			_step_match()
	_host.flush()
	return false

func _receive(peer: ENetPacketPeer, message: Array) -> void:
	if not _peers.has(peer) or message.is_empty():
		return
	var entry: Dictionary = _peers[peer]
	if entry.seat == 0:
		if message[0] == "join":
			_join(peer, message)
		return
	match str(message[0]):
		"launch":
			if _phase == "lobby" and peer == _watch_host:
				_prepare_match()
		"ready":
			if _phase == "preparing" and message.size() == 3 and message[1] == Wire.digest(_sim) and message[2] == _compatibility_digest:
				entry["ready"] = true
				_begin_when_ready()
			elif _phase == "preparing":
				_finish(0, "incompatible_game_data")
		"order":
			if _phase == "playing" and _watch_factions.is_empty() and _pending.size() < MAX_PENDING:
				var sequence := Wire.new_order_sequence(message, entry.last_order_sequence)
				if sequence == 0:
					return
				var now := Time.get_ticks_msec()
				if now - int(entry.rate_start) >= 1000:
					entry.rate_start = now
					entry.rate_count = 0
				if entry.rate_count < 40:
					entry.last_order_sequence = sequence
					entry.rate_count += 1
					_pending.append([peer, message])
		"surrender", "leave":
			if not _watch_factions.is_empty():
				if message[0] == "leave":
					_drop(peer)
					peer.peer_disconnect_later()
				return
			if _phase in ["playing", "preparing"]:
				_finish(3 - int(entry.seat), "surrender" if message[0] == "surrender" else "disconnect")
			elif _phase == "lobby":
				_drop(peer)
				peer.peer_disconnect_later()

func _join(peer: ENetPacketPeer, message: Array) -> void:
	var error := ""
	if message.size() != 6 or not Wire.integer(message[1], Wire.VERSION, Wire.VERSION):
		error = "The server and game use different online protocol versions."
	elif _phase != "lobby" or _seats.size() >= 2:
		error = "A match is already in progress on this server."
	elif not message[3] is String or message[3] != _room_code:
		error = "The room code is incorrect."
	elif not _valid_faction(message[2]) or not _valid_faction(message[5]):
		error = "Choose a valid faction."
	elif message[4] == "watch" and _watch_host == null:
		error = "Create the AI match before joining as a viewer."
	elif (message[4] == "host_ai" and not _seats.is_empty()) or (message[4] == "play" and _watch_host != null):
		error = "This lobby is set up for a different match type."
	elif message[4] not in ["play", "host_ai", "watch"]:
		error = "Choose a valid match type."
	if not error.is_empty():
		Wire.send(peer, ["error", error])
		peer.peer_disconnect_later()
		_peers.erase(peer)
		return
	var seat := 2 if _seats.has(1) else 1
	if message[4] == "host_ai":
		_watch_host = peer
		_watch_factions = [message[2], message[5]]
	_seats[seat] = peer
	_peers[peer].merge({"seat": seat, "faction": message[2], "ready": false,
		"rate_start": Time.get_ticks_msec(), "rate_count": 0, "last_notice": -1000, "last_order_sequence": 0}, true)
	Wire.send(peer, ["waiting", seat, _map if _watch_factions.is_empty() else "frontier-hunters"])
	if _seats.size() == 2 and _watch_factions.is_empty():
		_prepare_match()

func _valid_faction(choice: Variant) -> bool:
	return choice is String and (choice == "random" or _sim.get_node("/root/RTSData").faction_info.has(choice))

func _begin_when_ready() -> void:
	if _seats.is_empty() or not _seats.values().all(func(peer): return _peers[peer].ready):
		return
	_phase = "playing"
	_clock = 0.0
	_broadcast(["live"])
	_event("started", {"seed": _room_seed, "map": _sim.match_state.map_id,
		"mode": _sim.match_state.mode, "factions": _sim.match_state.factions})

func _prepare_match() -> void:
	var watch_ai := not _watch_factions.is_empty()
	var factions: Array = _watch_factions if watch_ai else [_peers[_seats[1]].faction, _peers[_seats[2]].faction]
	var battlefield := "frontier-hunters" if watch_ai else _map
	_room_seed = randi() if _fixed_seed < 0 else _fixed_seed
	var result: Dictionary = _sim.start_online_match(battlefield, _room_seed, factions, watch_ai)
	if not result.ok:
		for peer in _seats.values():
			Wire.send(peer, ["error", result.error])
			peer.peer_disconnect_later()
		_phase = "finished"
		return
	_phase = "preparing"
	_compatibility_digest = Wire.compatibility_digest(_sim)
	_ready_deadline = Time.get_ticks_msec() + READY_TIMEOUT
	for seat in _seats:
		Wire.send(_seats[seat], ["start", seat, battlefield, _room_seed, factions, watch_ai,
			Wire.match_setup(_sim)])

func _step_match() -> void:
	var first_tick: int = _sim.tick
	var orders: Array = []
	for _i in mini(_pending.size(), Wire.MAX_COMMANDS):
		var request: Array = _pending.pop_front()
		var peer: ENetPacketPeer = request[0]
		if not _peers.has(peer):
			continue
		var entry: Dictionary = _peers[peer]
		var order := Wire.normalize_order(_sim, entry.seat, request[1])
		if order.is_empty():
			_notice(peer, "That order is no longer available.")
			continue
		var result := Wire.apply_order(_sim, order)
		orders.append(order)
		if not result.ok:
			_notice(peer, str(result.get("error", "Order was rejected.")))
	var commander := root.get_node("RTSCommanderAI")
	commander.record_orders = not _watch_factions.is_empty()
	commander.recorded_orders.clear()
	_sim.step_ticks(Wire.FRAME_TICKS)
	commander.record_orders = false
	var digest := Wire.digest(_sim) if _sim.tick % 64 == 0 else ""
	var cameras: Array = []
	if not _watch_factions.is_empty():
		for pid in [1, 2]:
			var center: Vector2 = commander.camera_center(pid)
			cameras.append([center.x, center.y] if center.is_finite() else [])
	_broadcast(["frame", first_tick, orders, digest, commander.recorded_orders, cameras])
	if _sim.match_state.status == "finished":
		_finish(_sim.match_state.winner, _sim.match_state.reason)

func _notice(peer: ENetPacketPeer, message: String) -> void:
	var entry: Dictionary = _peers[peer]
	var now := Time.get_ticks_msec()
	if now - int(entry.last_notice) >= 500:
		entry.last_notice = now
		Wire.send(peer, ["notice", message])

func _broadcast(message: Array) -> void:
	for peer in _seats.values():
		Wire.send(peer, message)

func _drop(peer: ENetPacketPeer) -> void:
	var entry: Dictionary = _peers.get(peer, {})
	_peers.erase(peer)
	var seat := int(entry.get("seat", 0))
	if seat == 0:
		return
	_seats.erase(seat)
	if not _watch_factions.is_empty():
		if _phase == "lobby" and peer == _watch_host:
			for viewer in _seats.values():
				Wire.send(viewer, ["error", "The match host left the lobby."])
				viewer.peer_disconnect_later()
			_phase = "finished"
		elif _phase == "preparing" and not _seats.is_empty():
			_begin_when_ready()
		elif _phase == "playing":
			return
	elif _phase in ["preparing", "playing"]:
		_finish(3 - seat, "disconnect")
	if _seats.is_empty():
		_reset_lobby()

func _reset_lobby() -> void:
	_phase = "lobby"
	_watch_factions = []
	_watch_host = null

func _finish(winner: int, reason: String) -> void:
	_phase = "finished"
	_pending.clear()
	if _sim.match_state.status == "playing":
		_sim._finish_match(winner, reason)
	_broadcast(["end", winner, reason])
	_event("finished", {"seed": _room_seed, "winner": winner, "reason": reason, "tick": _sim.tick})
	for peer in _seats.values():
		peer.peer_disconnect_later()
	if _seats.is_empty():
		_reset_lobby()

func _event(kind: String, detail: Dictionary) -> void:
	detail["event"] = kind
	print("ROBOS_GAME_EVENT ", JSON.stringify(detail))
