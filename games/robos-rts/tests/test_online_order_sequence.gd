extends SceneTree

const Wire = preload("res://scripts/network/RTSWire.gd")

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim := root.get_node("SimEngine")
	var network := root.get_node("RTSNetwork")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	sim.reset_state()
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(10, 10))
	var order := ["order", [worker.tag], "move", 20.0, 10.0, 0, "", true, 1.0]
	var failures := []
	if Wire.new_order_sequence(order, 0) != 1 or Wire.new_order_sequence(order, 1) != 0 or Wire.new_order_sequence(order, 2) != 0:
		failures.append("Only a new sequence is eligible for enqueue")
	if Wire.normalize_order(sim, 1, order).size() != 7 or not Wire.normalize_order(sim, 2, order).is_empty():
		failures.append("Normalized wire orders enforce ownership and omit the transport sequence")
	order[8] = 2.5
	if Wire.new_order_sequence(order, 1) != 0:
		failures.append("Fractional order sequence was accepted")
	var frame := ["frame", 0, [[[worker.tag], "move", 20.0, 10.0, 0, "", true]], "", [], []]
	network._apply_message(frame)
	network._apply_message(frame)
	if sim.tick != Wire.FRAME_TICKS or worker.orders.size() != 1:
		failures.append("A replayed command frame advances the tick or reapplies its queued move")
	network.match_active = true
	network._apply_message(["frame", sim.tick + Wire.FRAME_TICKS, [], "", [], []])
	if network.state != "finished" or not network.status_message.contains("synchronization"):
		failures.append("The client accepted a frame with a missing predecessor")
	print("Online order sequencing: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
