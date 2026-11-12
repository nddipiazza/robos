extends Control

var _ws := WebSocketPeer.new()
var _ws_url: String = ""
var _ws_connected: bool = false
var _conn_state_kind: String = "connecting" # "connecting" | "live" | "reconnecting" | "error"
var _conn_err_code: int = 0
var _reconnect_timer: float = 0.0

var _symbols_ready: bool = false
var _fallback_fonts: Array[FontFile] = []

var _me: Dictionary = {}
var _snapshot: Dictionary = {}
var _game_ids: Array[String] = []
var _ai_mode: String = "generate" # "generate" | "modify"
var _updating_dropdown: bool = false

# UI Nodes
var _brand_label: Label
var _lobby_hdr_label: Label
var _ai_hdr_label: Label
var _chat_hdr_label: Label
var _conn_badge: Label
var _player_badge: Label
var _game_dropdown: OptionButton
var _cap_badge: Label
var _online_label: Label
var _seats_vbox: VBoxContainer
var _seat_btn: Button
var _start_btn: Button
var _lobby_notice: Label
var _mode_new_btn: Button
var _mode_edit_btn: Button
var _title_input: LineEdit
var _prompt_input: TextEdit
var _run_agent_btn: Button
var _agent_status_label: Label
var _chat_log_rtl: RichTextLabel
var _chat_input: LineEdit
var _sandbox_host: GameSandboxHost
var _waiting_banner: PanelContainer
var _waiting_label: Label

func _ready() -> void:
	_load_native_vector_fonts_if_available()
	_build_ui()
	_ws_url = _discover_ws_url()
	if OS.has_feature("web"):
		_fetch_web_vector_fonts()
	_connect_ws()

func _has_glyph(cp: int) -> bool:
	if cp == 0x09 or cp == 0x0A or cp == 0x0D or cp == 0x20:
		return true
	if cp == 0x200D or cp == 0xFE0E or cp == 0xFE0F:
		return false
	if ThemeDB.fallback_font != null and ThemeDB.fallback_font.has_char(cp):
		return true
	for ff in _fallback_fonts:
		if ff != null and ff.has_char(cp):
			return true
	return false

func _all_glyphs_supported(s: String) -> bool:
	if s == "":
		return false
	for i in range(s.length()):
		if not _has_glyph(s.unicode_at(i)):
			return false
	return true

func _icon(glyph_str: String, ascii_fallback: String = "") -> String:
	if _all_glyphs_supported(glyph_str):
		return glyph_str + " "
	if ascii_fallback != "":
		return ascii_fallback + " "
	return ""

func _avatar_prefix(raw_avatar: String) -> String:
	if raw_avatar.strip_edges() == "":
		return _icon("🎮", "•")
	# Strip variation selectors & ZWJ first (e.g. 🛡️ -> 🛡)
	var cleaned := ""
	for i in range(raw_avatar.length()):
		var cp := raw_avatar.unicode_at(i)
		if cp != 0x200D and cp != 0xFE0E and cp != 0xFE0F and cp != 0x2640 and cp != 0x2642:
			cleaned += raw_avatar.substr(i, 1)
	cleaned = cleaned.strip_edges()
	if cleaned != "" and _all_glyphs_supported(cleaned):
		return cleaned + " "
	# Map color-only bitmap avatars to crisp vector outline icons
	if raw_avatar.contains("🧙"):
		return _icon("★", "•")
	if raw_avatar.contains("🛡"):
		return _icon("🛡", "•")
	if raw_avatar.contains("🌸") or raw_avatar.contains("🎉"):
		return _icon("✦", "•")
	if raw_avatar.contains("🦞"):
		return _icon("❖", "•")
	return _icon("🎮", "•")

func _safe_text(raw: String) -> String:
	if raw == "":
		return ""
	var out := ""
	for i in range(raw.length()):
		var cp := raw.unicode_at(i)
		if _has_glyph(cp):
			out += raw.substr(i, 1)
	return out

func _attach_fallback_font(ff: FontFile) -> void:
	if ff == null:
		return
	_fallback_fonts.append(ff)
	var font_arr: Array[Font] = []
	for item in _fallback_fonts:
		font_arr.append(item)
	ThemeDB.fallback_font.fallbacks = font_arr
	if ff.has_char(0x1F3AD) or ff.has_char(0x25B6):
		_symbols_ready = true

func _load_native_vector_fonts_if_available() -> void:
	if OS.has_feature("web"):
		return
	var paths := [
		"/usr/share/fonts/truetype/noto/NotoSansSymbols2-Regular.ttf",
		"/usr/share/fonts/truetype/noto/NotoSansSymbols-Regular.ttf",
		"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
	]
	for p in paths:
		if FileAccess.file_exists(p):
			var ff := FontFile.new()
			if ff.load_dynamic_font(p) == OK:
				_attach_fallback_font(ff)

func _discover_http_origin() -> String:
	if OS.has_feature("web"):
		var res: Variant = JavaScriptBridge.eval("window.location.origin", true)
		if typeof(res) == TYPE_STRING and String(res) != "":
			return String(res)
	if _ws_url.begins_with("wss://"):
		var rest := _ws_url.trim_prefix("wss://")
		return "https://" + rest.split("/")[0]
	if _ws_url.begins_with("ws://"):
		var rest2 := _ws_url.trim_prefix("ws://")
		return "http://" + rest2.split("/")[0]
	return "http://127.0.0.1:19228"

func _fetch_web_vector_fonts() -> void:
	var origin := _discover_http_origin()
	for endpoint in ["/api/fonts/symbols2.ttf", "/api/fonts/symbols.ttf", "/api/fonts/dejavu.ttf"]:
		_fetch_single_font(origin + endpoint)

func _fetch_single_font(url: String) -> void:
	var req := HTTPRequest.new()
	req.body_size_limit = -1
	add_child(req)
	req.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
		if result == HTTPRequest.RESULT_SUCCESS and response_code == 200 and body.size() > 1024:
			var ff := FontFile.new()
			ff.data = body
			_attach_fallback_font(ff)
			_refresh_all_ui_after_font_load()
		req.queue_free()
	)
	req.request(url)

func _refresh_all_ui_after_font_load() -> void:
	if is_instance_valid(_brand_label):
		_brand_label.text = _icon("🎭") + "RobOS AI Multiplayer Game Theater"
	if is_instance_valid(_lobby_hdr_label):
		_lobby_hdr_label.text = _icon("❖") + "Multiplayer Lobby & Seats"
	if is_instance_valid(_ai_hdr_label):
		_ai_hdr_label.text = _icon("⚡") + "RobOS Agent Game Studio"
	if is_instance_valid(_chat_hdr_label):
		_chat_hdr_label.text = _icon("✉") + "Lobby Chat"
	if is_instance_valid(_mode_new_btn):
		_mode_new_btn.text = _icon("✦", "+") + "New Game"
	if is_instance_valid(_mode_edit_btn):
		_mode_edit_btn.text = _icon("⚙") + "Change Game"
	if is_instance_valid(_sandbox_host):
		_sandbox_host.set_emoji_enabled(_all_glyphs_supported("🎭"))
	_set_ai_mode(_ai_mode)
	_refresh_conn_badge()
	if not _snapshot.is_empty():
		_apply_snapshot(_snapshot)
	propagate_notification(NOTIFICATION_THEME_CHANGED)
	queue_redraw()

func _discover_ws_url() -> String:
	if OS.has_feature("web"):
		var js_expr := """
			(function() {
				var loc = window.location;
				var proto = (loc.protocol === 'https:') ? 'wss:' : 'ws:';
				var params = new URLSearchParams(loc.search || '');
				var q = [];
				if (params.get('auth')) q.push('auth=' + encodeURIComponent(params.get('auth')));
				if (params.get('as')) q.push('as=' + encodeURIComponent(params.get('as')));
				return proto + '//' + loc.host + '/ws' + (q.length ? ('?' + q.join('&')) : '');
			})()
		"""
		var res: Variant = JavaScriptBridge.eval(js_expr, true)
		if typeof(res) == TYPE_STRING and String(res) != "":
			return String(res)

	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--ws-url="):
			return arg.trim_prefix("--ws-url=")
	var env_ws := OS.get_environment("ROBOS_THEATER_WS_URL")
	if env_ws != "":
		return env_ws
	return "ws://127.0.0.1:19228/ws"

func _connect_ws() -> void:
	_ws = WebSocketPeer.new()
	_ws.inbound_buffer_size = 4 * 1024 * 1024
	_ws.outbound_buffer_size = 1024 * 1024
	var err := _ws.connect_to_url(_ws_url)
	if err != OK:
		_conn_state_kind = "error"
		_conn_err_code = err
	else:
		_conn_state_kind = "connecting"
	_refresh_conn_badge()

func _refresh_conn_badge() -> void:
	if not is_instance_valid(_conn_badge):
		return
	if _conn_state_kind == "live":
		var secure := _ws_url.begins_with("wss://")
		if secure:
			_set_conn_badge(_icon("🔒", "•") + "HTTPS/WSS Live", Color("#22c55e"))
		else:
			_set_conn_badge(_icon("●", "•") + "WS Live", Color("#22c55e"))
	elif _conn_state_kind == "reconnecting":
		_set_conn_badge(_icon("●", "•") + "Reconnecting...", Color("#ef4444"))
	elif _conn_state_kind == "error":
		_set_conn_badge(_icon("⚠", "!") + "Connection Error (" + str(_conn_err_code) + ")", Color("#ef4444"))
	else:
		_set_conn_badge(_icon("●", "•") + "Connecting...", Color("#eab308"))

func _process(delta: float) -> void:
	_ws.poll()
	var state := _ws.get_ready_state()
	if state == WebSocketPeer.STATE_OPEN:
		if not _ws_connected:
			_ws_connected = true
			_conn_state_kind = "live"
			_refresh_conn_badge()
			_publish_web_bridge()
		while _ws.get_available_packet_count() > 0:
			var pkt := _ws.get_packet().get_string_from_utf8()
			_handle_ws_message(pkt)
	elif state == WebSocketPeer.STATE_CLOSED:
		if _ws_connected:
			_ws_connected = false
			_conn_state_kind = "reconnecting"
			_refresh_conn_badge()
			_publish_web_bridge()
		_reconnect_timer += delta
		if _reconnect_timer >= 2.0:
			_reconnect_timer = 0.0
			_connect_ws()

func _send_ws(payload: Dictionary) -> void:
	if _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_ws.send_text(JSON.stringify(payload))

func _handle_ws_message(raw_text: String) -> void:
	var parsed: Variant = JSON.parse_string(raw_text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var msg: Dictionary = parsed
	var msg_type := String(msg.get("type", ""))

	if msg_type == "snapshot":
		var snap: Variant = msg.get("snapshot", {})
		if typeof(snap) == TYPE_DICTIONARY:
			_apply_snapshot(snap)
	elif msg_type == "action_error":
		_show_notice(_icon("⚠", "[!]") + _safe_text(String(msg.get("error", "Action rejected"))), Color("#f97316"))
	elif msg_type == "info":
		_show_notice(_icon("✦", "*") + _safe_text(String(msg.get("message", ""))), Color("#00bcd4"))

func _apply_snapshot(snap: Dictionary) -> void:
	_snapshot = snap
	var me_var: Variant = snap.get("me", {})
	_me = me_var if typeof(me_var) == TYPE_DICTIONARY else {}

	var my_avatar := _avatar_prefix(String(_me.get("avatar", "")))
	var my_name := _safe_text(String(_me.get("name", "Guest")))
	var my_tag := _safe_text(String(_me.get("gamerTag", "")))
	_player_badge.text = my_avatar + my_name + (" (@" + my_tag + ")" if my_tag != "" else "")

	# Games dropdown
	var games_arr: Array = snap.get("games", []) if typeof(snap.get("games")) == TYPE_ARRAY else []
	var active_game: Variant = snap.get("activeGame", null)
	var active_id := String(active_game.get("id", "")) if typeof(active_game) == TYPE_DICTIONARY else ""

	_updating_dropdown = true
	_game_dropdown.clear()
	_game_ids.clear()
	if games_arr.is_empty():
		_game_dropdown.add_item("No Games Generated Yet")
		_game_dropdown.disabled = true
		_cap_badge.text = "Stage: Ready"
	else:
		_game_dropdown.disabled = false
		var sel_idx := 0
		for i in range(games_arr.size()):
			var g: Dictionary = games_arr[i]
			var gid := String(g.get("id", ""))
			var gtitle := _safe_text(String(g.get("title", gid)))
			var gmax := int(g.get("maxPlayers", 2))
			var ver := int(g.get("version", 1))
			_game_ids.append(gid)
			_game_dropdown.add_item(gtitle + " (v" + str(ver) + " · max " + str(gmax) + "P)")
			if gid == active_id:
				sel_idx = i
		_game_dropdown.select(sel_idx)
	_updating_dropdown = false

	var seats: Array = snap.get("seats", []) if typeof(snap.get("seats")) == TYPE_ARRAY else []
	var is_seated := bool(snap.get("isSeated", false))
	var max_p := int(active_game.get("maxPlayers", 2)) if typeof(active_game) == TYPE_DICTIONARY else 2
	var min_p := int(active_game.get("minPlayers", 2)) if typeof(active_game) == TYPE_DICTIONARY else 2

	if typeof(active_game) == TYPE_DICTIONARY:
		_cap_badge.text = "Players: " + str(seats.size()) + " / " + str(max_p) + " Max"
		_mode_edit_btn.disabled = false
	else:
		_mode_edit_btn.disabled = true
		if _ai_mode == "modify":
			_set_ai_mode("generate")

	# Online list
	var online_arr: Array = snap.get("onlinePlayers", []) if typeof(snap.get("onlinePlayers")) == TYPE_ARRAY else []
	var online_names: PackedStringArray = []
	for p in online_arr:
		if typeof(p) == TYPE_DICTIONARY:
			var av := _avatar_prefix(String(p.get("avatar", "")))
			var nm := _safe_text(String(p.get("shortName", p.get("name", "Player"))))
			online_names.append(av + nm)
	_online_label.text = "Online in Lobby (" + str(online_names.size()) + "): " + (", ".join(online_names) if online_names.size() > 0 else "Connecting...")

	# Seats list
	for child in _seats_vbox.get_children():
		child.queue_free()
	var seat_slots := maxi(max_p, seats.size())
	for idx in range(seat_slots):
		var row := Label.new()
		row.add_theme_font_size_override("font_size", 13)
		if idx < seats.size() and typeof(seats[idx]) == TYPE_DICTIONARY:
			var sp: Dictionary = seats[idx]
			var sp_av := _avatar_prefix(String(sp.get("avatar", "")))
			row.text = "Seat " + str(idx + 1) + ": " + sp_av + _safe_text(String(sp.get("name", ""))) + " (@" + _safe_text(String(sp.get("gamerTag", ""))) + ")"
			row.add_theme_color_override("font_color", Color("#e2e8f0"))
		else:
			row.text = "Seat " + str(idx + 1) + ": — Open Seat —"
			row.add_theme_color_override("font_color", Color("#64748b"))
		_seats_vbox.add_child(row)

	if is_seated:
		_seat_btn.text = "Leave Seat"
		_seat_btn.disabled = false
	else:
		if typeof(active_game) == TYPE_DICTIONARY and seats.size() >= max_p:
			_seat_btn.text = "Seats Full (" + str(max_p) + "/" + str(max_p) + ")"
			_seat_btn.disabled = false
		else:
			_seat_btn.text = _icon("🪑", "+") + "Join Game Seat"
			_seat_btn.disabled = false

	_start_btn.disabled = (typeof(active_game) != TYPE_DICTIONARY)
	var match_status := String(snap.get("matchStatus", "idle"))
	_start_btn.text = (_icon("↻") + "New Match") if match_status == "playing" else (_icon("▶") + "Start Match")

	# Agent status
	var agent_st: Dictionary = snap.get("agentStatus", {}) if typeof(snap.get("agentStatus")) == TYPE_DICTIONARY else {}
	var agent_busy := bool(agent_st.get("busy", false))
	_run_agent_btn.disabled = agent_busy
	if agent_busy:
		var who := _safe_text(String(agent_st.get("requestedBy", "A player")))
		var step := _safe_text(String(agent_st.get("step", "Generating server.js & Godot 4 client.gd...")))
		_agent_status_label.text = _icon("⚡", "[AI]") + who + ": " + step
		_agent_status_label.add_theme_color_override("font_color", Color("#eab308"))
	elif agent_st.get("error", null) != null and String(agent_st.get("error", "")) != "":
		_agent_status_label.text = _icon("⚠", "[!]") + _safe_text(String(agent_st.get("error", "")))
		_agent_status_label.add_theme_color_override("font_color", Color("#ef4444"))
	elif String(agent_st.get("step", "")) != "":
		_agent_status_label.text = _icon("✓", "[OK]") + _safe_text(String(agent_st.get("step", "")))
		_agent_status_label.add_theme_color_override("font_color", Color("#22c55e"))
	else:
		_agent_status_label.text = "Any RobOS Game User can generate or evolve games."
		_agent_status_label.add_theme_color_override("font_color", Color("#94a3b8"))

	# Chat log
	var chats: Array = snap.get("chatLog", []) if typeof(snap.get("chatLog")) == TYPE_ARRAY else []
	var chat_lines: PackedStringArray = []
	for c in chats:
		if typeof(c) == TYPE_DICTIONARY:
			var c_av := _avatar_prefix(String(c.get("avatar", "")))
			chat_lines.append("[b]" + c_av + _safe_text(String(c.get("name", "Player"))) + ":[/b] " + _safe_text(String(c.get("text", ""))))
	_chat_log_rtl.text = "\n".join(chat_lines) if chat_lines.size() > 0 else "[i]Lobby chat ready...[/i]"

	# Waiting banner vs active match
	if typeof(active_game) == TYPE_DICTIONARY and match_status != "playing":
		_waiting_banner.visible = true
		_waiting_label.text = (
			_icon("⏳") + "Waiting for players to claim seats for '" + _safe_text(String(active_game.get("title", "Game"))) + "' ("
			+ str(seats.size()) + "/" + str(min_p) + " needed, max " + str(max_p) + "). Click 'Join Game Seat' on the left!"
		)
	else:
		_waiting_banner.visible = false

	# Mount / update dynamic Godot 4 game stage
	var lobby_meta := {
		"seats": seats,
		"onlinePlayers": online_arr,
		"isSeated": is_seated,
		"matchStatus": match_status,
		"minPlayers": min_p,
		"maxPlayers": max_p,
	}
	_sandbox_host.sync_dynamic_game(active_game, snap.get("gameView", null), _me, lobby_meta)
	_publish_web_bridge()

func _publish_web_bridge() -> void:
	if not OS.has_feature("web"):
		return
	var active_game: Variant = _snapshot.get("activeGame", null)
	var bridge_state := {
		"connected": _ws_connected,
		"symbolsFontLoaded": _symbols_ready,
		"wsUrl": _ws_url,
		"me": _me,
		"activeGameId": active_game.get("id", null) if typeof(active_game) == TYPE_DICTIONARY else null,
		"activeGameTitle": active_game.get("title", null) if typeof(active_game) == TYPE_DICTIONARY else null,
		"matchStatus": _snapshot.get("matchStatus", "idle"),
		"seats": _snapshot.get("seats", []),
		"isSeated": _snapshot.get("isSeated", false),
		"gameView": _snapshot.get("gameView", null),
		"agentStatus": _snapshot.get("agentStatus", {}),
	}
	var encoded := JSON.stringify(bridge_state)
	JavaScriptBridge.eval("window.__robosGodotState = " + encoded + ";", true)

func _show_notice(text: String, col: Color) -> void:
	_lobby_notice.text = text
	_lobby_notice.add_theme_color_override("font_color", col)

func _set_conn_badge(text: String, col: Color) -> void:
	if is_instance_valid(_conn_badge):
		_conn_badge.text = text
		_conn_badge.add_theme_color_override("font_color", col)

func _set_ai_mode(mode: String) -> void:
	_ai_mode = mode
	if is_instance_valid(_title_input):
		_title_input.visible = (mode == "generate")
	if is_instance_valid(_prompt_input) and is_instance_valid(_run_agent_btn):
		if mode == "generate":
			_prompt_input.placeholder_text = "Describe a new multiplayer game (e.g. '2-player Hangman, max 2 players, random starter then alternate phrase chooser')..."
			_run_agent_btn.text = _icon("✦", "+") + "Generate New Game"
		else:
			_prompt_input.placeholder_text = "Describe how to change the active game's rules, server logic, or Godot 4 visuals..."
			_run_agent_btn.text = _icon("⚙") + "Modify Active Game"

func _on_seat_pressed() -> void:
	var is_seated := bool(_snapshot.get("isSeated", false))
	_send_ws({"type": "leave_seat" if is_seated else "join_seat"})

func _on_start_pressed() -> void:
	_send_ws({"type": "start_match"})

func _on_game_selected(idx: int) -> void:
	if _updating_dropdown:
		return
	if idx >= 0 and idx < _game_ids.size():
		_send_ws({"type": "select_game", "gameId": _game_ids[idx]})

func _on_run_agent_pressed() -> void:
	var prompt := _prompt_input.text.strip_edges()
	if prompt == "":
		_show_notice(_icon("⚠", "[!]") + "Enter a description for the RobOS Agent first.", Color("#f97316"))
		return
	if _ai_mode == "generate":
		_send_ws({
			"type": "generate_game",
			"title": _title_input.text.strip_edges(),
			"prompt": prompt,
		})
	else:
		var active_game: Variant = _snapshot.get("activeGame", null)
		var gid := String(active_game.get("id", "")) if typeof(active_game) == TYPE_DICTIONARY else ""
		_send_ws({
			"type": "modify_game",
			"gameId": gid,
			"prompt": prompt,
		})
	_prompt_input.text = ""

func _on_chat_submit(_txt: String = "") -> void:
	var msg := _chat_input.text.strip_edges()
	if msg == "":
		return
	_send_ws({"type": "chat", "text": msg})
	_chat_input.text = ""

func _make_card_style(bg: String = "#161b22", border: String = "#2d3748", pad: int = 12) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(bg)
	s.border_color = Color(border)
	s.set_border_width_all(1)
	s.set_corner_radius_all(10)
	s.set_content_margin_all(pad)
	return s

func _make_btn_style(bg: String, border: String = "") -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(bg)
	s.border_color = Color(border if border != "" else bg)
	s.set_border_width_all(1)
	s.set_corner_radius_all(8)
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	return s

func _style_button(btn: Button, bg: String, hover_bg: String, fg: String = "#f8fafc") -> void:
	btn.add_theme_stylebox_override("normal", _make_btn_style(bg))
	btn.add_theme_stylebox_override("hover", _make_btn_style(hover_bg, "#00bcd4"))
	btn.add_theme_stylebox_override("pressed", _make_btn_style(hover_bg))
	btn.add_theme_color_override("font_color", Color(fg))
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

func _build_ui() -> void:
	var bg_rect := ColorRect.new()
	bg_rect.color = Color("#0d1117")
	bg_rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg_rect)

	var root_margin := MarginContainer.new()
	root_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root_margin.add_theme_constant_override("margin_left", 14)
	root_margin.add_theme_constant_override("margin_right", 14)
	root_margin.add_theme_constant_override("margin_top", 12)
	root_margin.add_theme_constant_override("margin_bottom", 12)
	add_child(root_margin)

	var root_vbox := VBoxContainer.new()
	root_vbox.add_theme_constant_override("separation", 12)
	root_margin.add_child(root_vbox)

	# ── Header Bar ──────────────────────────────────────────────────────────
	var header_card := PanelContainer.new()
	header_card.add_theme_stylebox_override("panel", _make_card_style("#161b22", "#30363d", 10))
	root_vbox.add_child(header_card)

	var header_hbox := HBoxContainer.new()
	header_hbox.add_theme_constant_override("separation", 14)
	header_card.add_child(header_hbox)

	_brand_label = Label.new()
	_brand_label.text = _icon("🎭") + "RobOS AI Multiplayer Game Theater"
	_brand_label.add_theme_font_size_override("font_size", 18)
	_brand_label.add_theme_color_override("font_color", Color("#00bcd4"))
	header_hbox.add_child(_brand_label)

	_game_dropdown = OptionButton.new()
	_game_dropdown.custom_minimum_size = Vector2(250, 34)
	_game_dropdown.item_selected.connect(_on_game_selected)
	header_hbox.add_child(_game_dropdown)

	_cap_badge = Label.new()
	_cap_badge.text = "Stage: Ready"
	_cap_badge.add_theme_font_size_override("font_size", 13)
	_cap_badge.add_theme_color_override("font_color", Color("#a78bfa"))
	header_hbox.add_child(_cap_badge)

	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header_hbox.add_child(spacer)

	_conn_badge = Label.new()
	_conn_badge.text = _icon("●", "•") + "Connecting..."
	_conn_badge.add_theme_font_size_override("font_size", 13)
	header_hbox.add_child(_conn_badge)

	_player_badge = Label.new()
	_player_badge.text = _icon("🎮") + "Authenticating..."
	_player_badge.add_theme_font_size_override("font_size", 14)
	_player_badge.add_theme_color_override("font_color", Color("#f8fafc"))
	header_hbox.add_child(_player_badge)

	# ── Main Split: Left Lobby/AI Studio + Right Godot 4 Stage ──────────────
	var body_hbox := HBoxContainer.new()
	body_hbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body_hbox.add_theme_constant_override("separation", 12)
	root_vbox.add_child(body_hbox)

	var left_scroll := ScrollContainer.new()
	left_scroll.custom_minimum_size = Vector2(360, 0)
	left_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body_hbox.add_child(left_scroll)

	var left_vbox := VBoxContainer.new()
	left_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_vbox.add_theme_constant_override("separation", 10)
	left_scroll.add_child(left_vbox)

	# 1. Lobby & Seats Card
	var lobby_card := PanelContainer.new()
	lobby_card.add_theme_stylebox_override("panel", _make_card_style())
	left_vbox.add_child(lobby_card)

	var lobby_vbox := VBoxContainer.new()
	lobby_vbox.add_theme_constant_override("separation", 8)
	lobby_card.add_child(lobby_vbox)

	_lobby_hdr_label = Label.new()
	_lobby_hdr_label.text = _icon("❖") + "Multiplayer Lobby & Seats"
	_lobby_hdr_label.add_theme_font_size_override("font_size", 15)
	_lobby_hdr_label.add_theme_color_override("font_color", Color("#38bdf8"))
	lobby_vbox.add_child(_lobby_hdr_label)

	_online_label = Label.new()
	_online_label.text = "Online in Lobby: ..."
	_online_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_online_label.add_theme_font_size_override("font_size", 12)
	_online_label.add_theme_color_override("font_color", Color("#94a3b8"))
	lobby_vbox.add_child(_online_label)

	_seats_vbox = VBoxContainer.new()
	_seats_vbox.add_theme_constant_override("separation", 4)
	lobby_vbox.add_child(_seats_vbox)

	var seat_btns_hbox := HBoxContainer.new()
	seat_btns_hbox.add_theme_constant_override("separation", 8)
	lobby_vbox.add_child(seat_btns_hbox)

	_seat_btn = Button.new()
	_seat_btn.text = _icon("🪑", "+") + "Join Game Seat"
	_seat_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_style_button(_seat_btn, "#0284c7", "#0369a1")
	_seat_btn.pressed.connect(_on_seat_pressed)
	seat_btns_hbox.add_child(_seat_btn)

	_start_btn = Button.new()
	_start_btn.text = _icon("▶") + "Start Match"
	_start_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_style_button(_start_btn, "#1e293b", "#334155")
	_start_btn.pressed.connect(_on_start_pressed)
	seat_btns_hbox.add_child(_start_btn)

	_lobby_notice = Label.new()
	_lobby_notice.text = ""
	_lobby_notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_lobby_notice.add_theme_font_size_override("font_size", 12)
	lobby_vbox.add_child(_lobby_notice)

	# 2. AI Game Builder Card (Any Player!)
	var ai_card := PanelContainer.new()
	ai_card.add_theme_stylebox_override("panel", _make_card_style("#161b22", "#4c1d95"))
	left_vbox.add_child(ai_card)

	var ai_vbox := VBoxContainer.new()
	ai_vbox.add_theme_constant_override("separation", 8)
	ai_card.add_child(ai_vbox)

	_ai_hdr_label = Label.new()
	_ai_hdr_label.text = _icon("⚡") + "RobOS Agent Game Studio"
	_ai_hdr_label.add_theme_font_size_override("font_size", 15)
	_ai_hdr_label.add_theme_color_override("font_color", Color("#c084fc"))
	ai_vbox.add_child(_ai_hdr_label)

	var mode_hbox := HBoxContainer.new()
	mode_hbox.add_theme_constant_override("separation", 6)
	ai_vbox.add_child(mode_hbox)

	_mode_new_btn = Button.new()
	_mode_new_btn.text = _icon("✦", "+") + "New Game"
	_mode_new_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_style_button(_mode_new_btn, "#4c1d95", "#6d28d9")
	_mode_new_btn.pressed.connect(func(): _set_ai_mode("generate"))
	mode_hbox.add_child(_mode_new_btn)

	_mode_edit_btn = Button.new()
	_mode_edit_btn.text = _icon("⚙") + "Change Game"
	_mode_edit_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_style_button(_mode_edit_btn, "#1e293b", "#334155")
	_mode_edit_btn.pressed.connect(func(): _set_ai_mode("modify"))
	mode_hbox.add_child(_mode_edit_btn)

	_title_input = LineEdit.new()
	_title_input.placeholder_text = "Game Title (e.g. Hangman)"
	ai_vbox.add_child(_title_input)

	_prompt_input = TextEdit.new()
	_prompt_input.custom_minimum_size = Vector2(0, 96)
	_prompt_input.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	ai_vbox.add_child(_prompt_input)

	_run_agent_btn = Button.new()
	_style_button(_run_agent_btn, "#7c3aed", "#6d28d9")
	_run_agent_btn.pressed.connect(_on_run_agent_pressed)
	ai_vbox.add_child(_run_agent_btn)

	_agent_status_label = Label.new()
	_agent_status_label.text = "Any RobOS Game User can generate or evolve games."
	_agent_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_agent_status_label.add_theme_font_size_override("font_size", 12)
	_agent_status_label.add_theme_color_override("font_color", Color("#94a3b8"))
	ai_vbox.add_child(_agent_status_label)

	_set_ai_mode("generate")

	# 3. Lobby Chat Card
	var chat_card := PanelContainer.new()
	chat_card.add_theme_stylebox_override("panel", _make_card_style())
	left_vbox.add_child(chat_card)

	var chat_vbox := VBoxContainer.new()
	chat_vbox.add_theme_constant_override("separation", 6)
	chat_card.add_child(chat_vbox)

	_chat_hdr_label = Label.new()
	_chat_hdr_label.text = _icon("✉") + "Lobby Chat"
	_chat_hdr_label.add_theme_font_size_override("font_size", 14)
	_chat_hdr_label.add_theme_color_override("font_color", Color("#38bdf8"))
	chat_vbox.add_child(_chat_hdr_label)

	_chat_log_rtl = RichTextLabel.new()
	_chat_log_rtl.bbcode_enabled = true
	_chat_log_rtl.scroll_following = true
	_chat_log_rtl.custom_minimum_size = Vector2(0, 100)
	chat_vbox.add_child(_chat_log_rtl)

	var chat_hbox := HBoxContainer.new()
	chat_hbox.add_theme_constant_override("separation", 6)
	chat_vbox.add_child(chat_hbox)

	_chat_input = LineEdit.new()
	_chat_input.placeholder_text = "Message lobby..."
	_chat_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chat_input.text_submitted.connect(_on_chat_submit)
	chat_hbox.add_child(_chat_input)

	var send_btn := Button.new()
	send_btn.text = "Send"
	_style_button(send_btn, "#0284c7", "#0369a1")
	send_btn.pressed.connect(func(): _on_chat_submit())
	chat_hbox.add_child(send_btn)

	# ── Right Stage Area ────────────────────────────────────────────────────
	var right_vbox := VBoxContainer.new()
	right_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_vbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right_vbox.add_theme_constant_override("separation", 8)
	body_hbox.add_child(right_vbox)

	_waiting_banner = PanelContainer.new()
	_waiting_banner.visible = false
	_waiting_banner.add_theme_stylebox_override("panel", _make_card_style("#172554", "#0284c7", 10))
	right_vbox.add_child(_waiting_banner)

	_waiting_label = Label.new()
	_waiting_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_waiting_label.add_theme_font_size_override("font_size", 14)
	_waiting_label.add_theme_color_override("font_color", Color("#bae6fd"))
	_waiting_banner.add_child(_waiting_label)

	_sandbox_host = GameSandboxHost.new()
	_sandbox_host.set_emoji_enabled(_all_glyphs_supported("🎭"))
	_sandbox_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sandbox_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_sandbox_host.action_dispatched.connect(func(payload: Dictionary):
		_send_ws({"type": "game_action", "action": payload})
	)
	right_vbox.add_child(_sandbox_host)
