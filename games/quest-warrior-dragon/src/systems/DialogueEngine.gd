extends Node

# DialogueEngine.gd — Specification-Driven NPC Dialogue & Story Engine for AI Quest: Warrior Dragon v2
# Evaluates JSON dialogue specifications, NPC trees, conditional quest flags, and line emission.

var active_npc_id: String = ""
var active_dialogue_tree: Array = []
var current_line_index: int = 0
var is_active: bool = false

func _ready():
	print("[DialogueEngine] Initialized NPC dialogue engine.")

func start_dialogue(npc_id: String) -> bool:
	active_npc_id = npc_id
	var dialogue_data: Array = []
	
	if DataManager and DataManager.dialogue.has(npc_id):
		var raw = DataManager.dialogue[npc_id]
		if raw is Array:
			dialogue_data = raw
		elif raw is Dictionary and raw.has("lines"):
			dialogue_data = raw["lines"]
	
	if dialogue_data.is_empty():
		dialogue_data = ["Hello traveler!", "Welcome to Alefgard."]
	
	active_dialogue_tree = dialogue_data
	current_line_index = 0
	is_active = true
	
	print("[DialogueEngine] Started dialogue with NPC: %s (%d lines)" % [npc_id, active_dialogue_tree.size()])
	if EventBus:
		EventBus.dialogue_started.emit(npc_id, active_dialogue_tree)
		EventBus.dialogue_line_changed.emit(npc_id, get_current_line())
	return true

func advance_dialogue() -> Dictionary:
	if not is_active:
		return {"finished": true, "line": ""}
	
	current_line_index += 1
	if current_line_index < active_dialogue_tree.size():
		var line = get_current_line()
		if EventBus:
			EventBus.dialogue_line_changed.emit(active_npc_id, line)
		return {"finished": false, "line": line}
	else:
		is_active = false
		if EventBus:
			EventBus.dialogue_ended.emit()
		return {"finished": true, "line": ""}

func get_current_line() -> String:
	if current_line_index >= 0 and current_line_index < active_dialogue_tree.size():
		var item = active_dialogue_tree[current_line_index]
		if item is String:
			return item
		elif item is Dictionary and item.has("text"):
			return str(item["text"])
	return ""
