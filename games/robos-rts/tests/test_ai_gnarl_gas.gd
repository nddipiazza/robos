extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var sim := root.get_node("SimEngine")
	sim.rts_mode = "backend"
	for opponent in ["humans", "aliens"]:
		sim.start_online_match("frontier-hunters", 3, ["monsters", opponent], true)
		var gas_second := 0
		for second in range(1, 121):
			sim.step_ticks(sim.TICK_RATE)
			if sim.players[1].aether_collected > 0:
				gas_second = second
				break
		if gas_second == 0:
			push_error("Gnarl did not collect gas in its opening against %s" % opponent)
			quit(1)
			return
		print("Gnarl first gas against %s: %ds" % [opponent, gas_second])
	quit()
