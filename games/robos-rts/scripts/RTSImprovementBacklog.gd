extends CanvasLayer

const DATA_PATH := "res://data/improvement-backlog.json"
var catalog: Dictionary = {}
var shade: ColorRect
var panel: PanelContainer
var search: LineEdit
var status_index := 0
var status_buttons: Array[Button] = []
var category: OptionButton
var list: ItemList
var detail: RichTextLabel
var summary: Label
var close_button: Button
var filtered: Array = []
var was_paused := false

func _ready() -> void:
	layer = 12
	catalog = JSON.parse_string(FileAccess.get_file_as_string(DATA_PATH))
	shade = ColorRect.new()
	shade.size = Vector2(1920, 1080)
	shade.color = Color(0.01, 0.02, 0.035, 0.9)
	add_child(shade)
	panel = PanelContainer.new()
	panel.position = Vector2(110, 70)
	panel.size = Vector2(1700, 940)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#111d2c")
	style.border_color = Color("#52758f")
	style.set_border_width_all(1)
	style.set_content_margin_all(26)
	style.set_corner_radius_all(6)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 16)
	panel.add_child(box)
	_label(box, "STARFALL COMMAND / IMPROVEMENT BACKLOG", 32)
	_label(box, "Modern RTS fundamentals · Prioritized work with concrete completion checks", 20)
	summary = _label(box, "", 18)
	var filters := HBoxContainer.new()
	filters.add_theme_constant_override("separation", 16)
	box.add_child(filters)
	search = LineEdit.new()
	search.placeholder_text = "Find a todo…"
	search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	search.custom_minimum_size.y = 42
	filters.add_child(search)
	for label in ["All tasks", "To do", "Done"]:
		var button := Button.new()
		button.text = label
		button.toggle_mode = true
		button.custom_minimum_size.x = 95
		button.pressed.connect(_set_status.bind(status_buttons.size()))
		status_buttons.append(button)
		filters.add_child(button)
	status_buttons[0].button_pressed = true
	category = OptionButton.new()
	category.add_item("All areas")
	var areas: Array = []
	for task in catalog.tasks:
		if not areas.has(task.category):
			areas.append(task.category)
	areas.sort()
	for area in areas:
		category.add_item(area)
	category.custom_minimum_size.x = 190
	filters.add_child(category)
	var content := HBoxContainer.new()
	content.add_theme_constant_override("separation", 24)
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(content)
	list = ItemList.new()
	list.custom_minimum_size.x = 805
	list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	list.add_theme_font_size_override("font_size", 18)
	list.add_theme_constant_override("v_separation", 16)
	content.add_child(list)
	detail = RichTextLabel.new()
	detail.bbcode_enabled = true
	detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail.add_theme_font_size_override("normal_font_size", 20)
	content.add_child(detail)
	_label(box, "First batch: F3 army selection · Queue cancellation/refunds · Worker resource rallies", 19)
	close_button = Button.new()
	close_button.text = "Back to game  [Esc / F4]"
	close_button.custom_minimum_size.y = 42
	close_button.pressed.connect(close)
	box.add_child(close_button)
	search.text_changed.connect(_rebuild)
	category.item_selected.connect(_rebuild)
	list.item_selected.connect(_show_task)
	SimEngine.scenario_loaded.connect(func(_name): close(false))
	_rebuild()
	panel.hide()
	shade.hide()

func _label(parent: Node, text: String, font_size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	parent.add_child(label)
	return label

func open() -> void:
	if panel.visible:
		return
	was_paused = SimEngine.paused
	SimEngine.paused = true
	get_parent()._clear_training_repeat()
	_rebuild()
	shade.show()
	panel.show()
	close_button.grab_focus()

func close(restore_pause := true) -> void:
	if panel and panel.visible:
		panel.hide()
		shade.hide()
		if restore_pause:
			SimEngine.paused = was_paused

func _input(event: InputEvent) -> void:
	if panel.visible and event is InputEventKey and event.pressed and not event.echo and event.keycode in [KEY_ESCAPE, KEY_F4]:
		close()
		get_viewport().set_input_as_handled()

func _unhandled_input(_event: InputEvent) -> void:
	if panel.visible:
		get_viewport().set_input_as_handled()

func _set_status(index: int) -> void:
	status_index = index
	for i in range(status_buttons.size()):
		status_buttons[i].set_pressed_no_signal(i == index)
	_rebuild()

func _rebuild(_value: Variant = null) -> void:
	filtered.clear()
	list.clear()
	var done := 0
	for task in catalog.tasks:
		if task.status == "done":
			done += 1
		if status_index == 1 and task.status == "done" or status_index == 2 and task.status != "done":
			continue
		if category.selected > 0 and task.category != category.get_item_text(category.selected):
			continue
		var searchable := (str(task.title) + " " + str(task.why) + " " + str(task.category) + " " + " ".join(task.acceptance)).to_lower()
		var query := search.text.strip_edges().to_lower()
		if not query.is_empty() and not searchable.contains(query):
			continue
		filtered.append(task)
	filtered.sort_custom(func(a, b):
		if a.status != b.status:
			return a.status != "done"
		if a.priority != b.priority:
			return a.priority < b.priority
		return a.title < b.title)
	for task in filtered:
		var index := list.add_item("%s · %s  [%s]  %s" % [task.priority, "DONE" if task.status == "done" else "TODO", task.category, task.title])
		list.set_item_custom_fg_color(index, Color("#85d9a7") if task.status == "done" else (Color("#f2ca85") if task.priority == "P0" else Color("#c6d8ed")))
		list.set_item_tooltip(index, task.title + "\n" + task.why)
	summary.text = "%d done · %d to do · %d shown    |    P0: foundations   P1: play quality   P2: expansion" % [done, catalog.tasks.size() - done, filtered.size()]
	if filtered.is_empty():
		detail.text = "No matching todos. Try another search or area."
	else:
		list.select(0)
		_show_task(0)

func _show_task(index: int) -> void:
	var task: Dictionary = filtered[index]
	var text := "[font_size=26][b]%s[/b][/font_size]\n\n%s · %s · %s\n\n%s\n\n[b]Completion checks[/b]\n" % [task.title, task.priority, task.category, "DONE" if task.status == "done" else "TO DO", task.why]
	for criterion in task.acceptance:
		text += "\n• " + criterion + "\n"
	if not task.evidence.is_empty():
		text += "\n[b]Verification[/b]\n" + "\n".join(task.evidence)
	else:
		text += "\n[color=#95a2b3]Planned work. This item is not implemented yet.[/color]"
	detail.text = text

func ui_state() -> Dictionary:
	var ids: Array = []
	var done := 0
	for task in catalog.tasks:
		if task.status == "done":
			done += 1
	for task in filtered:
		ids.append(task.id)
	return {"visible": panel.visible, "done": done, "todo": catalog.tasks.size() - done, "shown": ids,
		"selected": filtered[list.get_selected_items()[0]].id if not list.get_selected_items().is_empty() else "",
		"done_rect": get_parent()._control_rect(status_buttons[2]), "todo_rect": get_parent()._control_rect(status_buttons[1]), "search_rect": get_parent()._control_rect(search),
		"list_rect": get_parent()._control_rect(list), "close_rect": get_parent()._control_rect(close_button)}
