extends CanvasLayer

class DamageChart extends Control:
	var report: Dictionary
	func _draw() -> void:
		var font = ThemeDB.fallback_font
		var plot = Rect2(60, 32, size.x - 85, size.y - 58)
		draw_rect(plot, Color("#0b121b"))
		var peak = 1.0
		for bin in report.timeline:
			peak = maxf(peak, maxf(bin.blue_dps, bin.red_dps))
		for i in range(4):
			var y = plot.end.y - plot.size.y * float(i) / 3.0
			draw_line(Vector2(plot.position.x, y), Vector2(plot.end.x, y), Color("#253446"))
			draw_string(font, Vector2(4, y + 5), "%.0f" % (peak * i / 3.0), HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
		for pid in [1, 2]:
			var points = PackedVector2Array()
			for bin in report.timeline:
				var y = plot.end.y - plot.size.y * bin["blue_dps" if pid == 1 else "red_dps"] / peak
				points.append(Vector2(plot.position.x + plot.size.x * bin.from / maxf(report.duration, 0.01), y))
				points.append(Vector2(plot.position.x + plot.size.x * bin.to / maxf(report.duration, 0.01), y))
			if points.size() > 1:
				draw_polyline(points, Color("#67b7ff") if pid == 1 else Color("#ff8075"), 2.0, true)
		draw_string(font, Vector2(60, 21), "EFFECTIVE DPS   ·   Blue / Red   ·   1-second buckets; partial final bucket normalized", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color("#aebfd2"))
		draw_string(font, Vector2(60, size.y - 5), "0 s", HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
		draw_string(font, Vector2(plot.end.x - 80, size.y - 5), "%.2f s" % report.duration, HORIZONTAL_ALIGNMENT_LEFT, -1, 14)

var panel: PanelContainer
var shade: ColorRect
var tabs: TabContainer
var saved: Label
var save_button: Button
var report: Dictionary = {}

func _ready() -> void:
	layer = 8

func dismiss() -> void:
	if shade:
		shade.hide()
	if panel:
		panel.hide()

func reopen() -> void:
	if panel and not report.is_empty():
		panel.show()
		shade.show()

func is_open() -> bool:
	return panel != null and panel.visible

func _label(parent: Node, text: String, font_size: int = 18) -> Label:
	var label = Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	parent.add_child(label)
	return label

func show_report(data: Dictionary) -> void:
	report = data
	if panel:
		panel.free()
		shade.free()
	shade = ColorRect.new()
	shade.size = Vector2(1920, 1080)
	shade.color = Color(0.015, 0.025, 0.045, 0.88)
	add_child(shade)
	panel = PanelContainer.new()
	panel.position = Vector2(120, 75)
	panel.size = Vector2(1680, 930)
	var style = StyleBoxFlat.new()
	style.bg_color = Color("#111c2b")
	style.border_color = Color("#46627f")
	style.set_border_width_all(1)
	style.set_content_margin_all(24)
	style.set_corner_radius_all(8)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 12)
	panel.add_child(box)
	var title = "DRAW" if report.winner == 0 else ("BLUE VICTORY" if report.winner == 1 else "RED VICTORY")
	var header = _label(box, title + "   /   BATTLE RESULTS", 32)
	header.add_theme_color_override("font_color", Color("#8ecaff") if report.winner == 1 else Color("#ffaaa1"))
	_label(box, "%s   ·   %.3f seconds   ·   %d ticks at 64 Hz   ·   Seed %d   ·   %s" % [report.scenario, report.duration, report.ticks, report.seed, report.reason.replace("_", " ")], 17)
	tabs = TabContainer.new()
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	tabs.custom_minimum_size.y = 690
	box.add_child(tabs)
	var overview = VBoxContainer.new()
	overview.name = "Overview"
	tabs.add_child(overview)
	var chart = DamageChart.new()
	chart.report = report
	chart.custom_minimum_size.y = 160
	overview.add_child(chart)
	var summaries = HBoxContainer.new()
	summaries.add_theme_constant_override("separation", 40)
	overview.add_child(summaries)
	for pid in ["1", "2"]:
		var s = report.sides[pid]
		var m = s.mvp
		_label(summaries, "%s MVP: %s #%d   ·   %d kills   ·   %.0f damage" % ["BLUE" if pid == "1" else "RED", m.name, m.tag, m.kills, m.damage], 17)
	var lowlights = HBoxContainer.new()
	lowlights.add_theme_constant_override("separation", 40)
	overview.add_child(lowlights)
	for pid in ["1", "2"]:
		var unit = report.sides[pid].lowest_damage_unit
		_label(lowlights, "%s lowest damage: %s #%d   ·   %.0f damage   ·   %.2f s alive" % ["BLUE" if pid == "1" else "RED", unit.name, unit.tag, unit.damage, unit.alive_seconds], 16)
	var economy = _table(overview)
	_fill(economy, [
		["Units deployed", "started"], ["Surviving units", "survivors"], ["Units lost", "lost"], ["Enemy units killed", "kills"],
		["Survival %", "survival_percent"], ["Kill / loss ratio", "kill_loss_ratio"],
		["Starting supply", "starting_supply"], ["Surviving supply", "surviving_supply"], ["Supply destroyed", "supply_destroyed"],
		["Starting crystal value", "starting_crystal"], ["Starting aether value", "starting_aether"],
		["Crystal lost", "crystal_lost"], ["Aether lost", "aether_lost"], ["Enemy crystal destroyed", "crystal_destroyed"], ["Enemy aether destroyed", "aether_destroyed"],
		["Surviving crystal value", "surviving_crystal"], ["Surviving aether value", "surviving_aether"],
		["Resource trade ratio (equal crystal/aether weight)", "trade_ratio"], ["Initial HP", "initial_hp"], ["Remaining HP", "hp"],
		["Initial shields", "initial_shields"], ["Remaining shields", "shields"], ["Effective damage dealt", "damage"], ["Battle-average DPS", "dps"]])
	var combat = VBoxContainer.new()
	combat.name = "Weapons & Micro"
	tabs.add_child(combat)
	_label(combat, "Damage is actual HP/shields removed. Overkill and armor prevention are separate. Hitscan has no aiming-accuracy roll.", 16)
	var weapon_table = _table(combat)
	_fill(weapon_table, [
		["Effective HP damage", "hp_damage"], ["Effective shield damage", "shield_damage"], ["Damage received from enemies", "damage_taken"],
		["Direct damage", "direct_damage"], ["Splash damage", "splash_damage"], ["Overkill damage wasted", "overkill"], ["Overkill % of post-armor output", "overkill_percent"],
		["Damage prevented by enemy armor", "armor_blocked"], ["HP healed", "hp_healed"], ["Shields regenerated", "shields_regenerated"],
		["Weapon attacks started", "attack_starts"], ["Shots fired", "shots"], ["Effective damage / shot", "damage_per_shot"],
		["Wind-ups canceled (commands / lost target)", "windup_cancels"], ["Recoveries canceled by commands", "recovery_cancels"],
		["First shot at (seconds)", "first_shot_seconds"], ["Peak bucket DPS", "peak_dps"], ["Peak bucket starts (seconds)", "peak_from"], ["Peak bucket ends (seconds)", "peak_to"],
		["Surge uses", "surge_uses"], ["HP spent on Surge", "self_damage"], ["Total distance displaced (world units)", "distance"],
		["Moving time (sum across units)", "moving_seconds"], ["Wind-up time (sum across units)", "windup_seconds"], ["Recovery time (sum across units)", "recovery_seconds"]])
	_roster_tab()
	_type_tab()
	var footer = HBoxContainer.new()
	footer.add_theme_constant_override("separation", 16)
	box.add_child(footer)
	_button(footer, "View battlefield  [Esc]", dismiss)
	_button(footer, "Reset armies  [F9]", func(): SimEngine.reset_unit_battle())
	save_button = _button(footer, "Save full JSON report", _save)
	saved = _label(box, "Select a unit for its complete record, including destroyed units. R reopens these results after closing.", 15)
	saved.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

func _button(parent: Node, text: String, action: Callable) -> Button:
	var button = Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(260, 38)
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(action)
	parent.add_child(button)
	return button

func ui_state() -> Dictionary:
	var state = {"visible": is_open(), "tabs": [], "current_tab": -1, "saved": ""}
	if not panel:
		return state
	var bar = tabs.get_tab_bar()
	for i in range(tabs.get_tab_count()):
		var rect = bar.get_tab_rect(i)
		rect.position += bar.global_position
		state.tabs.append({"title": tabs.get_tab_title(i), "rect": [rect.position.x, rect.position.y, rect.size.x, rect.size.y]})
	state.current_tab = tabs.current_tab
	state.saved = saved.text
	var rect = save_button.get_global_rect()
	state.save_rect = [rect.position.x, rect.position.y, rect.size.x, rect.size.y]
	return state

func _table(parent: Node) -> Tree:
	var tree = Tree.new()
	tree.columns = 3
	tree.hide_root = true
	tree.column_titles_visible = true
	tree.set_column_title(0, "STATISTIC")
	tree.set_column_title(1, "BLUE")
	tree.set_column_title(2, "RED")
	tree.set_column_expand_ratio(0, 3)
	tree.add_theme_constant_override("v_separation", 5)
	tree.add_theme_font_size_override("font_size", 18)
	tree.size_flags_vertical = Control.SIZE_EXPAND_FILL
	parent.add_child(tree)
	tree.create_item()
	return tree

func _value(value: Variant, key: String = "") -> String:
	if value == null:
		return "No losses" if key in ["trade_ratio", "kill_loss_ratio"] else "—"
	if key == "first_shot_seconds" and float(value) < 0:
		return "—"
	if typeof(value) == TYPE_BOOL:
		return "Survived" if value else "Destroyed"
	if typeof(value) in [TYPE_INT, TYPE_FLOAT]:
		return "%.2f×" % value if key in ["trade_ratio", "kill_loss_ratio"] else ("%.2f" % value if absf(float(value) - roundf(float(value))) > 0.001 else "%.0f" % value)
	return str(value)

func _fill(tree: Tree, fields: Array) -> void:
	for field in fields:
		var row = tree.create_item(tree.get_root())
		row.set_text(0, field[0])
		for pid in [1, 2]:
			row.set_text(pid, _value(report.sides[str(pid)].get(field[1]), field[1]))
			row.set_custom_color(pid, Color("#8bc6ff") if pid == 1 else Color("#ff9e94"))

func _roster_tab() -> void:
	var split = HSplitContainer.new()
	split.name = "Unit Breakdown"
	tabs.add_child(split)
	var tree = Tree.new()
	tree.custom_minimum_size.x = 1030
	tree.columns = 8
	tree.hide_root = true
	tree.column_titles_visible = true
	tree.add_theme_font_size_override("font_size", 17)
	tree.add_theme_constant_override("v_separation", 8)
	var titles = ["Unit", "Side", "Result", "Kills", "Damage", "Shots", "HP left", "Alive DPS"]
	for i in range(titles.size()):
		tree.set_column_title(i, titles[i])
		tree.set_column_custom_minimum_width(i, 180 if i == 0 else 100)
	var root = tree.create_item()
	split.add_child(tree)
	var detail = RichTextLabel.new()
	detail.custom_minimum_size.x = 540
	detail.add_theme_font_size_override("normal_font_size", 17)
	split.add_child(detail)
	for unit in report.units:
		var item = tree.create_item(root)
		item.set_metadata(0, unit)
		var values = ["%s #%d" % [unit.name, unit.tag], "Blue" if unit.owner == 1 else "Red", "Survived" if unit.alive else "Destroyed", unit.kills, unit.damage, unit.shots, unit.hp, unit.dps]
		for i in range(values.size()):
			item.set_text(i, _value(values[i]))
			item.set_custom_color(i, Color("#8bc6ff") if unit.owner == 1 else Color("#ff9e94"))
	tree.item_selected.connect(func():
		var unit = tree.get_selected().get_metadata(0)
		var text = "%s #%d\n\n" % [unit.name, unit.tag]
		for key in unit:
			text += "%s: %s\n" % [str(key).replace("_", " ").capitalize(), _value(unit[key], key)]
		detail.text = text)
	if root.get_first_child():
		root.get_first_child().select(0)

func _type_tab() -> void:
	var box = VBoxContainer.new()
	box.name = "Unit Type Efficiency"
	tabs.add_child(box)
	_label(box, "Costs use starting crystal + aether with equal weighting. MVP type = most kills per 100 resources; lowlight = least damage per 100.", 16)
	var tree = Tree.new()
	tree.columns = 8
	tree.hide_root = true
	tree.column_titles_visible = true
	tree.size_flags_vertical = Control.SIZE_EXPAND_FILL
	tree.add_theme_font_size_override("font_size", 18)
	tree.add_theme_constant_override("v_separation", 8)
	box.add_child(tree)
	var titles = ["Type / Side", "Deployed", "Lost", "Kills", "Damage", "Starting value", "Kills / 100", "Damage / 100"]
	for i in range(titles.size()):
		tree.set_column_title(i, titles[i])
	var root = tree.create_item()
	for pid in ["1", "2"]:
		for type in report.sides[pid].types.values():
			var item = tree.create_item(root)
			var values = [type.name + (" / Blue" if pid == "1" else " / Red"), type.count, type.lost, type.kills, type.damage, type.cost, type.kills_per_100_resources, type.damage_per_100_resources]
			for i in range(values.size()):
				item.set_text(i, _value(values[i]))
				item.set_custom_color(i, Color("#8bc6ff") if pid == "1" else Color("#ff9e94"))

func _save() -> void:
	var home = OS.get_environment("USERPROFILE") if OS.has_feature("windows") else OS.get_environment("HOME")
	var folder = home.path_join(".config/robos/rts/battle-results")
	var err = DirAccess.make_dir_recursive_absolute(folder)
	if err != OK:
		saved.text = "Could not create report folder: " + error_string(err)
		return
	var path = folder.path_join("battle-%s.json" % Time.get_datetime_string_from_system().replace(":", "-"))
	var file = FileAccess.open(path, FileAccess.WRITE)
	if not file:
		saved.text = "Could not save report: " + error_string(FileAccess.get_open_error())
		return
	file.store_string(JSON.stringify(report, "  "))
	saved.text = "Saved: " + path

func _unhandled_input(event: InputEvent) -> void:
	if is_open() and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		dismiss()
		get_viewport().set_input_as_handled()
