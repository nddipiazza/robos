extends SceneTree

const PAIRINGS := [
	["frontier-hunters", "humans", "monsters", 42],
	["iron-narrows", "monsters", "humans", 43],
	["frontier-hunters", "aliens", "humans", 17],
	["iron-narrows", "humans", "aliens", 6],
	["frontier-hunters", "monsters", "aliens", 81],
	["iron-narrows", "aliens", "monsters", 29],
	["glassline-basin", "humans", "aliens", 31]
]

var sim: Node
var commander: Node
var failures: Array[String] = []
var combat_hits: Dictionary

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	commander = root.get_node("RTSCommanderAI")
	sim.weapon_attack.connect(_record_combat_hit)
	var selected_pair := 0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--pair="):
			selected_pair = int(arg.get_slice("=", 1))
	if selected_pair < 0 or selected_pair > PAIRINGS.size():
		printerr("Choose --pair=1 through --pair=%d, or omit it for all matchups" % PAIRINGS.size())
		quit(1)
		return
	for i in range(PAIRINGS.size()):
		if selected_pair == 0 or selected_pair == i + 1:
			_run_pair(PAIRINGS[i])
	print(JSON.stringify({"failures": failures}))
	quit(0 if failures.is_empty() else 1)

func _run_pair(pairing: Array) -> void:
	var label := "%s %s versus %s" % [pairing[0], pairing[1], pairing[2]]
	var options := {"seed": pairing[3], "player_faction": pairing[1], "ai_faction": pairing[2],
		"difficulty": "normal", "strategy": "rush"}
	var opened: Dictionary = sim.start_skirmish(pairing[0], options)
	_check(opened.ok, label + " starts through the public skirmish entry point")
	if not opened.ok:
		return
	combat_hits = {1: 0, 2: 0}
	# Use the same paid controller for seat one, leaving seat two's built-in
	# opponent to play independently. No armies or resources are injected.
	commander.set_skirmish_directive(1, "normal", "balanced")
	var started := Time.get_ticks_msec()
	while sim.match_state.status == "playing" and sim.sim_time < 480.0:
		sim.step_ticks(256)
		if sim.sim_time >= 360.0 and _has_paid_combat():
			break
	_check(_has_paid_combat(), label + " includes paid economies, deployment and combat on the actual map")
	if sim.match_state.status == "playing":
		_check(sim.surrender(1).ok, label + " can surrender after its live battle")
	var result: Dictionary = sim.match_state
	_check(result.status == "finished" and result.reason in ["surrender", "all_structures_destroyed"], label + " reaches a legal result")
	var final_tick: int = sim.tick
	sim.step_ticks(64)
	_check(sim.tick == final_tick, label + " remains frozen after the result")
	var players: Array[Dictionary] = []
	for seat in [1, 2]:
		var stats: Dictionary = sim.players[seat]
		players.append({"faction": stats.faction, "crystal": stats.crystal_collected,
			"trained": stats.units_trained, "kills": stats.units_killed, "combat_hits": combat_hits[seat]})
	print(JSON.stringify({"pairing": label, "winner": result.winner, "reason": result.reason,
		"seconds": sim.sim_time, "wall_seconds": (Time.get_ticks_msec() - started) / 1000.0, "players": players}))

func _has_paid_combat() -> bool:
	for seat in [1, 2]:
		var player: Dictionary = sim.players[seat]
		if player.crystal_collected < 300 or player.units_trained < 6 or player.structures_built < 1 or combat_hits[seat] == 0:
			return false
	return true

func _record_combat_hit(attacker: Dictionary, target: Dictionary, _weapon: Dictionary, _shields: bool) -> void:
	if combat_hits.has(attacker.owner) and target.owner == 3 - attacker.owner and not attacker.is_worker:
		combat_hits[attacker.owner] += 1

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
