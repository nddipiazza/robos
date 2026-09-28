class_name DialogueBox
extends Panel

signal dialogue_ended

@onready var speaker_label = $SpeakerLabel
@onready var text_label = $TextLabel
@onready var choices_container = $ChoicesContainer

var current_tree: Dictionary = {}
var current_node_id: String = ""

func start_dialogue(tree: Dictionary, root_id: String) -> void:
	current_tree = tree
	current_node_id = root_id
	visible = true
	show_node(root_id)

func show_node(node_id: String) -> void:
	var nodes = current_tree.get("nodes", {})
	var node_data = nodes.get(node_id, {})
	if node_data.is_empty():
		close_dialogue()
		return
	
	speaker_label.text = node_data.get("speaker", "Unknown")
	text_label.text = node_data.get("text", "")
	
	for child in choices_container.get_children():
		child.queue_free()
	
	var choices = node_data.get("choices", [])
	if choices.size() == 0:
		var btn = Button.new()
		btn.text = "[Continue]"
		btn.pressed.connect(close_dialogue)
		choices_container.add_child(btn)
	else:
		for c in choices:
			var btn = Button.new()
			btn.text = c.get("text", "...")
			var nxt = c.get("nextNode", null)
			btn.pressed.connect(func(): on_choice_selected(nxt))
			choices_container.add_child(btn)

func on_choice_selected(next_node: Variant) -> void:
	if next_node == null:
		close_dialogue()
	else:
		show_node(str(next_node))

func close_dialogue() -> void:
	visible = false
	dialogue_ended.emit()
