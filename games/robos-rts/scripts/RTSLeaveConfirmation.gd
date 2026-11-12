extends ConfirmationDialog

var _action: Callable
var _return_focus: Control

func _ready() -> void:
	unresizable = true
	get_ok_button().text = "Confirm"
	confirmed.connect(_confirm_action)
	canceled.connect(_cancel_action)

func ask(heading: String, message: String, action: Callable) -> void:
	if visible:
		return
	_return_focus = get_parent().get_viewport().gui_get_focus_owner()
	_action = action
	title = heading
	dialog_text = message
	popup_centered(Vector2i(440, 0))
	get_cancel_button().grab_focus()

func dismiss() -> void:
	hide()
	_action = Callable()
	_return_focus = null

func _confirm_action() -> void:
	var action := _action
	dismiss()
	if action.is_valid():
		action.call()

func _cancel_action() -> void:
	var return_focus := _return_focus
	dismiss()
	if is_instance_valid(return_focus) and return_focus.is_visible_in_tree():
		return_focus.grab_focus()
