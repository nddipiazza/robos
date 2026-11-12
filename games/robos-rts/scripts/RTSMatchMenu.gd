extends CanvasLayer

signal observe_requested
signal health_mode_changed(mode: int)
signal back_requested
signal campaign_restart_requested

enum Layout { BATTLE, SKIRMISH, SETTINGS }

const PAN_SPEEDS := [28.0, 46.0, 72.0]
const SkirmishPreview = preload("res://scripts/RTSSkirmishPreview.gd")
const LeaveConfirmation = preload("res://scripts/RTSLeaveConfirmation.gd")
const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const MAP_FILTER_LABELS := ["All maps", "Compact maps", "Large maps", "Two starts", "Multiple starts",
	"Finite by default", "Water or bridges", "Cliffs or plateaus", "Watch stations", "Destructible blockers"]
enum OrderLines { ALWAYS, SHIFT, HIDDEN }
enum MapFilter { ALL, COMPACT, LARGE, TWO_STARTS, MULTIPLE_STARTS, FINITE, WATER, CLIFFS, STATIONS, BLOCKERS }

var layout := Layout.BATTLE
var panel: PanelContainer
var result_panel: PanelContainer
var map_picker: OptionButton
var map_filter: OptionButton
var player_faction: OptionButton
var ai_faction: OptionButton
var deposit_rules: OptionButton
var health_bars: OptionButton
var difficulty: OptionButton
var strategy: OptionButton
var speed: OptionButton
var music_volume: HSlider
var grid_hotkeys := false
var edge_scroll := false
var pan_speed := 46.0
var order_lines := OrderLines.ALWAYS
var was_paused: bool = false
var _score_title: Label
var _score_detail: Label
var _score_values: Dictionary = {}
var _rematch: Button
var _show_results: Button
var _map_description: Label
var map_preview: Control
var _faction_ids: Array = []
var _skirmish_options: VBoxContainer
var _start_button: Button
var _surrender_button: Button
var _editor_button: Button
var _retry_mission: Button
var _resume_button: Button
var _leave_confirmation: LeaveConfirmation
var _heading: Label
var _mutator_summary: Label

func _ready() -> void:
	layer = 10
	var in_battle := layout == Layout.BATTLE
	panel = _make_panel(Vector2(630, 145) if in_battle else Vector2(128, 246), Vector2(660, 640) if in_battle else Vector2(608, 0))
	var box := _panel_body(panel)
	if in_battle:
		box.add_theme_constant_override("separation", 12)
	_heading = _label(box, "SETTINGS" if layout == Layout.SETTINGS else "SKIRMISH", 32)
	if in_battle:
		_mutator_summary = _label(box, "", 16)
		_mutator_summary.modulate = Color("#ffcd77")
		_mutator_summary.hide()
	if layout != Layout.SETTINGS:
		map_preview = SkirmishPreview.new()
		map_preview.position = panel.position + Vector2(panel.custom_minimum_size.x + 18, 0)
		map_preview.size = Vector2(460, 368)
		map_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
		map_preview.hide()
		add_child(map_preview)
		var filters := _make_panel(map_preview.position + Vector2(0, map_preview.size.y + 14), Vector2(460, 0))
		map_filter = _option(_panel_body(filters), "Filter maps", MAP_FILTER_LABELS, MapFilter.ALL)
		map_filter.focus_mode = Control.FOCUS_CLICK
		map_filter.item_selected.connect(_filter_maps)
		panel.visibility_changed.connect(func():
			map_preview.visible = panel.visible and (not in_battle or (SimEngine.campaign == null and not RTSNetwork.match_active))
			filters.visible = map_preview.visible)
		_skirmish_options = VBoxContainer.new()
		_skirmish_options.add_theme_constant_override("separation", 12 if in_battle else 18)
		box.add_child(_skirmish_options)
		_build_skirmish_options(_skirmish_options)
	if layout != Layout.SKIRMISH:
		_build_sound_options(box)
		_build_display_options(box)
	if layout != Layout.SETTINGS:
		_leave_confirmation = LeaveConfirmation.new()
		add_child(_leave_confirmation)
		_start_button = _button(box, "Start new match", _start)
	if not in_battle:
		_button(box, "Back", func(): back_requested.emit())
		return
	_resume_button = _button(box, "Resume (F8)", toggle)
	_show_results = _button(box, "Match results", _open_result)
	_show_results.hide()
	_surrender_button = _button(box, "Surrender", _request_surrender)
	_editor_button = _button(box, "Map editor", _request_editor)
	_retry_mission = _button(box, "Restart mission", func(): campaign_restart_requested.emit())
	_button(box, "Main menu", _request_title)
	_create_scorecard()
	SimEngine.match_finished.connect(_open_result)

func _build_skirmish_options(box: VBoxContainer) -> void:
	_faction_ids = RTSData.faction_info.keys() + ["random"]
	var factions := _faction_ids.map(func(id): return RTSData.get_faction_name(id))
	player_faction = _option(box, "Your faction", factions, 0)
	ai_faction = _option(box, "AI faction", factions, 0)
	_map_description = _label(box, "")
	map_picker = _option(box, "Battlefield", [], -1)
	deposit_rules = _option(box, "Resource deposits", ["Unlimited", "Finite"], 0)
	map_picker.item_selected.connect(_on_map_selected)
	_filter_maps(MapFilter.ALL)
	difficulty = _option(box, "AI difficulty", ["Easy", "Normal", "Hard"], 1)
	strategy = _option(box, "AI strategy", ["Rush", "Balanced", "Economy", "Siege"], 1)
	speed = _option(box, "Game speed", ["1×", "2×", "4×", "8×"], 0)

func _build_sound_options(box: VBoxContainer) -> void:
	var sound := VBoxContainer.new()
	sound.add_theme_constant_override("separation", 10)
	box.add_child(sound)
	_label(sound, "Sound", 22)
	music_volume = _volume_slider(sound, "Music Volume", RTSMusic.volume_percent, RTSMusic.set_volume_percent)
	_volume_slider(sound, "SFX Volume", RTSAudio.volume_percent, RTSAudio.set_volume_percent)
	if layout == Layout.SETTINGS:
		var credits := HBoxContainer.new()
		credits.add_theme_constant_override("separation", 10)
		sound.add_child(credits)
		_add_soundtrack_link(credits, RTSMusic.CREDIT, RTSMusic.ALBUM_URL)
		_label(credits, "·", 15)
		_add_soundtrack_link(credits, RTSMusic.TEMPEST_CREDIT, RTSMusic.TEMPEST_ALBUM_URL)

func _add_soundtrack_link(credits: HBoxContainer, title: String, url: String) -> void:
	var link := LinkButton.new()
	link.text = title
	link.uri = url
	link.add_theme_font_size_override("font_size", 15)
	credits.add_child(link)

func _volume_slider(box: VBoxContainer, title: String, percent: int, setter: Callable) -> HSlider:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	box.add_child(row)
	_label(row, title).size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var slider := HSlider.new()
	slider.custom_minimum_size.x = 150
	slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	slider.max_value = 100.0
	slider.step = 1.0
	slider.value = percent
	slider.tooltip_text = title
	row.add_child(slider)
	var value := _label(row, "%d%%" % percent)
	value.custom_minimum_size.x = 48
	value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	slider.value_changed.connect(func(amount: float):
		setter.call(int(amount))
		value.text = "%d%%" % int(amount))
	return slider

func _build_display_options(box: VBoxContainer) -> void:
	if layout == Layout.SETTINGS:
		_label(box, "Display and Controls", 22)
	var display := ConfigFile.new()
	display.load(RTSAudio.prefs_path())
	health_bars = _option(box, "Overhead health bars", ["Selected or damaged", "Always", "Off"], clampi(int(display.get_value("display", "health_bars", 0)), 0, 2))
	health_bars.item_selected.connect(_on_health_selected)
	grid_hotkeys = bool(display.get_value("controls", "grid_hotkeys", false))
	edge_scroll = bool(display.get_value("controls", "edge_scroll", false))
	var pan_index := clampi(int(display.get_value("controls", "pan_speed", 1)), 0, PAN_SPEEDS.size() - 1)
	pan_speed = PAN_SPEEDS[pan_index]
	order_lines = clampi(int(display.get_value("controls", "order_lines", OrderLines.ALWAYS)), 0, OrderLines.HIDDEN)
	if layout == Layout.SETTINGS:
		var hotkeys := _option(box, "Command card hotkeys", ["Standard", "Grid"], int(grid_hotkeys))
		hotkeys.item_selected.connect(func(index): _save_control("grid_hotkeys", index == 1))
		var scrolling := _option(box, "Mouse edge scrolling", ["Off", "On"], int(edge_scroll))
		scrolling.item_selected.connect(func(index): _save_control("edge_scroll", index == 1))
		var pan := _option(box, "Camera pan speed", ["Slow", "Standard", "Fast"], pan_index)
		pan.item_selected.connect(func(index): _save_control("pan_speed", index))
		var lines := _option(box, "Unit order lines", ["Always", "Hold Shift", "Hidden"], order_lines)
		lines.item_selected.connect(func(index): _save_control("order_lines", index))
	_button(box, "Toggle fullscreen", RTSDisplay.toggle_fullscreen)

func _save_control(key: String, value: Variant) -> void:
	var display := ConfigFile.new()
	var path := RTSAudio.prefs_path()
	display.load(path)
	display.set_value("controls", key, value)
	display.save(path)

func open_title_panel() -> void:
	panel.show()
	if map_picker:
		map_picker.grab_focus()
	else:
		music_volume.grab_focus()

func confirmation_title() -> String:
	return _leave_confirmation.title if _leave_confirmation and _leave_confirmation.visible else ""

func _has_active_battle() -> bool:
	if layout != Layout.BATTLE:
		return SimEngine.resume_from_title
	return not SimEngine._scenario_finished() and (
		RTSNetwork.match_active or SimEngine.campaign != null or not SimEngine.units.is_empty())

func _request_surrender() -> void:
	_leave_confirmation.ask("Surrender?", "Surrendering will end the current match.", _surrender)

func _surrender() -> void:
	if RTSNetwork.match_active:
		RTSNetwork.surrender()
	else:
		SimEngine.surrender(1)
	panel.hide()
	SimEngine.paused = false

func _request_editor() -> void:
	if _has_active_battle():
		_leave_confirmation.ask("Open the map editor?", "This will end the current battle.", _open_editor)
	else:
		_open_editor()

func _open_editor() -> void:
	SimEngine.paused = true
	get_tree().call_deferred("change_scene_to_file", "res://scenes/MapEditor.tscn")

func _request_title() -> void:
	if not _has_active_battle():
		_return_to_title()
		return
	var message := "You can resume this battle from the main menu."
	if RTSNetwork.match_active:
		message = "This will disconnect you from the current online match."
	elif SimEngine.campaign != null:
		message = "You can resume this mission from the main menu."
	_leave_confirmation.ask("Return to the main menu?", message, _return_to_title)

func _return_to_title() -> void:
	if RTSNetwork.match_active:
		RTSNetwork.leave_match()
		SimEngine.resume_from_title = false
		SimEngine.paused = true
		get_tree().call_deferred("change_scene_to_file", "res://scenes/RTSStart.tscn")
		return
	SimEngine.resume_from_title = not SimEngine.units.is_empty() and not SimEngine._scenario_finished()
	if SimEngine.resume_from_title:
		get_parent().save_title_view()
	SimEngine.paused = true
	get_tree().call_deferred("change_scene_to_file", "res://scenes/RTSStart.tscn")

func _make_panel(position: Vector2, minimum_size: Vector2) -> PanelContainer:
	var container := PanelContainer.new()
	container.position = position
	container.custom_minimum_size = minimum_size
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#111b27")
	style.border_color = Color("#426578")
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	container.add_theme_stylebox_override("panel", style)
	add_child(container)
	container.hide()
	return container

func _panel_body(container: PanelContainer) -> VBoxContainer:
	var margin := MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 28)
	container.add_child(margin)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 18)
	margin.add_child(box)
	return box

func _label(container: Container, value: String, font_size: int = 18) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", font_size)
	container.add_child(label)
	return label

func _button(container: Container, value: String, handler: Callable) -> Button:
	var button := Button.new()
	button.text = value
	button.pressed.connect(handler)
	container.add_child(button)
	return button

func _create_scorecard() -> void:
	result_panel = _make_panel(Vector2(600, 230), Vector2(720, 485))
	var box := _panel_body(result_panel)
	_score_title = _label(box, "", 36)
	_score_title.modulate = Color("#fbbf24")
	_score_detail = _label(box, "")
	var table := GridContainer.new()
	table.columns = 3
	table.add_theme_constant_override("v_separation", 9)
	table.add_theme_constant_override("h_separation", 24)
	box.add_child(table)
	_label(table, "Match totals").size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_label(table, "Commander 1" if RTSNetwork.watching_ai else "You").horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_label(table, "Commander 2" if RTSNetwork.watching_ai else ("Opponent" if RTSNetwork.match_active else "AI")).horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var rows := {"crystal_collected": "Crystal collected", "aether_collected": "Aether collected",
		"units_trained": "Units trained", "units_lost": "Units lost", "structures_built": "Structures completed"}
	for key in rows:
		_label(table, rows[key]).modulate = Color("#a9bdd0")
		var values: Array[Label] = []
		for player in [1, 2]:
			var value := _label(table, "")
			value.custom_minimum_size.x = 100
			value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			values.append(value)
		_score_values[key] = values
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 12)
	box.add_child(actions)
	_rematch = _button(actions, "Rematch (Ctrl+Enter)", restart)
	_rematch.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_button(actions, "Menu (F8)" if RTSNetwork.match_active else "Match setup (F8)", toggle).size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_button(actions, "Observe (O)", func(): observe_requested.emit()).size_flags_horizontal = Control.SIZE_EXPAND_FILL

func _open_result() -> void:
	var state: Dictionary = SimEngine.match_state
	if not state.has("scorecard"):
		return
	_leave_confirmation.dismiss()
	panel.hide()
	var seat := RTSNetwork.seat if RTSNetwork.match_active and not RTSNetwork.watching_ai else 1
	var opponent := 3 - seat
	var outcome := "VICTORY" if state.winner == seat else ("DRAW" if state.winner == 0 else "DEFEAT")
	if RTSNetwork.watching_ai and state.winner in [1, 2]:
		outcome = "COMMANDER %d WINS" % state.winner
	_score_title.text = outcome
	var seconds := floori(state.finished_tick * SimEngine.TICK_DT)
	var reason := str(state.reason).capitalize() if state.reason != "all_structures_destroyed" else "Annihilation"
	_score_detail.text = "%s vs %s   ·   %s   ·   %d:%02d" % [
		RTSData.get_faction_name(SimEngine.players[seat].faction), RTSData.get_faction_name(SimEngine.players[opponent].faction),
		reason, seconds / 60, seconds % 60]
	for stat in _score_values:
		_score_values[stat][0].text = str(state.scorecard[str(seat)][stat])
		_score_values[stat][1].text = str(state.scorecard[str(opponent)][stat])
	_rematch.visible = state.mode == "1p_vs_ai"
	_show_results.show()
	result_panel.show()

func reset_views() -> void:
	_leave_confirmation.dismiss()
	panel.hide()
	result_panel.hide()
	_show_results.hide()
	var in_campaign := SimEngine.campaign != null
	var online := RTSNetwork.match_active
	_heading.text = "ONLINE MATCH" if online else "SKIRMISH"
	var mutator_count := 0
	if in_campaign:
		var index: int = SimEngine.campaign.mission_index
		_heading.text = "MISSION %02d  /  %s" % [index + 1, Campaign.MISSIONS[index].title.to_upper()]
		mutator_count = SimEngine.campaign.selected_mutators().size()
	_mutator_summary.visible = mutator_count > 0
	_mutator_summary.text = "Mutators  ·  %d active" % mutator_count
	_skirmish_options.visible = not in_campaign and not online
	_start_button.visible = not in_campaign and not online
	_surrender_button.visible = not in_campaign and not RTSNetwork.watching_ai
	_surrender_button.disabled = online and SimEngine._scenario_finished()
	_editor_button.visible = not in_campaign and not online
	speed.get_parent().visible = not online
	_retry_mission.visible = in_campaign
	var map_id: String = SimEngine.match_state.get("map_id", "")
	if SimEngine.SKIRMISH_MAPS.has(map_id):
		var map_index := map_option_ids().find(map_id)
		if map_index < 0:
			map_filter.select(MapFilter.ALL)
			_filter_maps(MapFilter.ALL)
			map_index = map_option_ids().find(map_id)
		map_picker.select(map_index)
		_on_map_selected(map_index)
		deposit_rules.select(0 if SimEngine.unlimited_resources else 1)
	var choices: Dictionary = SimEngine.match_state.get("faction_choices", {})
	player_faction.select(maxi(0, _faction_ids.find(choices.get("1", ""))))
	ai_faction.select(maxi(0, _faction_ids.find(choices.get("2", ""))))

func restart() -> void:
	if RTSNetwork.match_active:
		return
	SimEngine.rematch()

func _option(box: VBoxContainer, label_text: String, choices: Array, selected: int) -> OptionButton:
	var row = HBoxContainer.new()
	var label = Label.new()
	label.text = label_text
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	var option = OptionButton.new()
	option.custom_minimum_size.x = 210
	for choice in choices:
		option.add_item(choice)
	option.selected = selected
	row.add_child(option)
	box.add_child(row)
	return option

func _on_map_selected(index: int) -> void:
	var map_id: String = map_picker.get_item_metadata(index)
	var data := SimEngine.skirmish_map_config(map_id)
	var layout: Dictionary = data.get("map", {})
	_map_description.text = "1 Player vs 1 AI\n%d × %d · %d possible starts" % [layout.get("width", 0), layout.get("height", 0), layout.get("starts", []).size()]
	if data.has("menu_hint"):
		_map_description.text += " · " + str(data.menu_hint)
	map_preview.set_map(data)
	deposit_rules.select(0 if data.get("unlimited_resources", true) else 1)

func selected_map_id() -> String:
	return str(map_picker.get_item_metadata(map_picker.selected)) if map_picker and map_picker.selected >= 0 else ""

func map_option_ids() -> Array[String]:
	var ids: Array[String] = []
	for i in range(map_picker.item_count):
		ids.append(str(map_picker.get_item_metadata(i)))
	return ids

func _filter_maps(filter_id: int) -> void:
	var previous := selected_map_id()
	var previous_deposits := deposit_rules.selected
	map_picker.clear()
	for map_id in SimEngine.SKIRMISH_MAPS:
		var data := SimEngine.skirmish_map_config(map_id)
		if not _matches_map_filter(data, filter_id):
			continue
		map_picker.add_item(SimEngine.SKIRMISH_MAPS[map_id])
		map_picker.set_item_metadata(map_picker.item_count - 1, map_id)
	map_picker.disabled = map_picker.item_count == 0
	if map_picker.disabled:
		_map_description.text = "No battlefields match this filter."
		map_preview.set_map({})
		return
	var index := maxi(0, map_option_ids().find(previous))
	map_picker.select(index)
	_on_map_selected(index)
	if selected_map_id() == previous:
		deposit_rules.select(previous_deposits)

func _matches_map_filter(data: Dictionary, filter_id: int) -> bool:
	var layout: Dictionary = data.get("map", {})
	if layout.is_empty():
		return false
	var longest_side := maxf(float(layout.width), float(layout.height))
	match filter_id:
		MapFilter.COMPACT: return longest_side <= 160
		MapFilter.LARGE: return longest_side > 160
		MapFilter.TWO_STARTS: return layout.starts.size() == 2
		MapFilter.MULTIPLE_STARTS: return layout.starts.size() > 2
		MapFilter.FINITE: return not data.get("unlimited_resources", true)
		MapFilter.WATER:
			return not layout.get("water_channels", []).is_empty() or not layout.get("bridges", []).is_empty() or layout.get("terrain_tiles", []).any(func(tile): return tile.terrain == "water")
		MapFilter.CLIFFS:
			return not layout.get("obstacles", []).is_empty() or not layout.get("high_ground", []).is_empty() or layout.get("terrain_tiles", []).any(func(tile): return tile.terrain in ["cliff", "plateau"])
		MapFilter.STATIONS: return not layout.get("watch_stations", []).is_empty()
		MapFilter.BLOCKERS: return not layout.get("route_blockers", []).is_empty()
	return true

func _on_health_selected(mode: int) -> void:
	var display := ConfigFile.new()
	var path := RTSAudio.prefs_path()
	display.load(path)
	display.set_value("display", "health_bars", mode)
	display.save(path)
	health_mode_changed.emit(mode)

func toggle() -> void:
	result_panel.hide()
	if RTSNetwork.match_active:
		panel.visible = not panel.visible
		if panel.visible:
			_surrender_button.disabled = SimEngine._scenario_finished()
			_resume_button.grab_focus()
		return
	if panel.visible:
		panel.hide()
		if SimEngine.campaign == null:
			SimEngine.sim_speed = float(1 << speed.selected)
		SimEngine.paused = was_paused
	else:
		was_paused = SimEngine.paused
		SimEngine.paused = true
		panel.show()
		(_resume_button if SimEngine.campaign != null else map_picker).grab_focus()

func _start() -> void:
	var map_id := selected_map_id()
	if map_id.is_empty():
		return
	if _has_active_battle():
		_leave_confirmation.ask("Start a new match?", "This will replace the current battle.", _start_match.bind(map_id))
	else:
		_start_match(map_id)

func _start_match(map_id: String) -> void:
	var settings := {"difficulty": ["easy", "normal", "hard"][difficulty.selected],
		"strategy": ["rush", "balanced", "economy", "siege"][strategy.selected],
		"player_faction": _faction_ids[player_faction.selected], "ai_faction": _faction_ids[ai_faction.selected],
		"unlimited_resources": deposit_rules.selected == 0}
	if not SimEngine.start_skirmish(map_id, settings).ok:
		return
	SimEngine.sim_speed = float(1 << speed.selected)
	panel.hide()
	SimEngine.paused = false
