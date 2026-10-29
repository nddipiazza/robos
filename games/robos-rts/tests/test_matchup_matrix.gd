extends SceneTree

# Full-health, no-ability 1v1 balance contracts. Both spatial/ownership orientations
# run, so a favorable owner or spawn order cannot masquerade as a unit advantage.
const COVERED_UNITS = ["pioneer", "rifleman", "breacher", "howitzer", "howitzer_emplaced", "forager", "skitterling", "bile_crawler", "blight_hurler", "mote", "sunblade", "skirmisher", "spire_walker"]
var sim: Node
var cases: Array = []
var failures: Array = []
var checks := 0

func _initialize() -> void:
	call_deferred("_run")

func _expect(ok: bool, message: String) -> void:
	checks += 1
	if not ok:
		failures.append(message)

func _duel(a: String, b: String, flip: bool) -> Dictionary:
	var left = b if flip else a
	var right = a if flip else b
	sim.load_scenario_dict({"mode": "unit_battle", "seed": 42, "decor": false,
		"map": {"width": 96, "height": 64}, "units": [
			{"type": left, "owner": 1, "x": 38, "y": 32},
			{"type": right, "owner": 2, "x": 58, "y": 32}]})
	sim.start_unit_battle()
	for _i in range(80):
		sim.step_ticks(64)
		if sim.match_state.status == "finished":
			break
	var survivor: Dictionary = sim.units.values()[0] if sim.units.size() == 1 else {}
	var winner: int = sim.match_state.winner
	return {"a": a, "b": b, "flipped": flip, "status": sim.match_state.status,
		"winner": survivor.get("unit_type", "none"), "winner_owner": sim.match_state.winner,
		"reason": sim.match_state.reason,
		"winner_kills": sim.players.get(winner, {}).get("units_killed", 0),
		"loser_losses": sim.players.get(3-winner, {}).get("units_lost", 0),
		"duration": sim.sim_time, "remaining": float(survivor.get("hp", 0)) + float(survivor.get("shields", 0)),
		"survivors": sim.units.size()}

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var probe = "--probe-matchups" in OS.get_cmdline_user_args()
	var path = "res://tests/data/matchup_expectations.json"
	var expected: Dictionary = {}
	if FileAccess.file_exists(path):
		expected = JSON.parse_string(FileAccess.get_file_as_string(path))
	var contracts: Dictionary = {}
	for row in expected.get("matchups", []):
		_expect(not contracts.has(row[0]+"/"+row[1]), "Duplicate matchup contract: " + row[0]+"/"+row[1])
		contracts[row[0]+"/"+row[1]] = {"winner": row[2], "duration": [row[3],row[4]], "remaining": [row[5],row[6]]}
	if not probe:
		_expect(expected.has("matchups"), "Missing reviewed matchup expectations")
		_expect(contracts.size() == COVERED_UNITS.size()*(COVERED_UNITS.size()+1)/2, "Missing or stale extra matchup contracts")
	var roster: Array = []
	for type in root.get_node("RTSData").units:
		if not root.get_node("RTSData").units[type].get("is_structure", false):
			roster.append(type)
	roster.sort()
	var covered = COVERED_UNITS.duplicate()
	covered.sort()
	_expect(roster == covered, "Combat roster changed; review matrix coverage")
	for i in range(COVERED_UNITS.size()):
		for j in range(i, COVERED_UNITS.size()):
			var a: String = COVERED_UNITS[i]
			var b: String = COVERED_UNITS[j]
			var key = a + "/" + b
			for flip in [false, true]:
				var actual = _duel(a,b,flip)
				cases.append(actual)
				if probe:
					continue
				if not contracts.has(key):
					_expect(false, "Uncovered pair: " + key)
					continue
				var contract: Dictionary = contracts[key]
				var label = key + (" flipped" if flip else " normal")
				_expect(actual.status == "finished", label + ": no terminal combat result")
				_expect(actual.reason == "army_eliminated" and actual.winner_kills == 1 and actual.loser_losses == 1, label + ": result must come from actual combat elimination")
				_expect(actual.winner == contract.winner, label + ": expected " + str(contract.winner) + ", observed " + actual.winner)
				var owner = 1 if a == b else ((2 if flip else 1) if contract.winner == a else (1 if flip else 2))
				_expect(actual.winner_owner == owner, label + ": incorrect winning owner")
				_expect(actual.survivors == 1, label + ": must have one surviving unit")
				_expect(actual.duration >= contract.duration[0] and actual.duration <= contract.duration[1], label + ": duration outside " + str(contract.duration) + ": " + str(actual.duration))
				_expect(actual.remaining >= contract.remaining[0] and actual.remaining <= contract.remaining[1], label + ": survivor HP/shields outside " + str(contract.remaining) + ": " + str(actual.remaining))
				if a == b and flip:
					var previous: Dictionary = cases[cases.size()-2]
					_expect(actual.duration == previous.duration and actual.remaining == previous.remaining and actual.winner_owner == previous.winner_owner, label + ": repeated mirror must reproduce its outcome exactly")
	var report = {"suite": "matchup_matrix", "probe_only": probe, "checks": checks, "cases": cases, "failures": failures}
	var folder = ProjectSettings.globalize_path("res://tests/e2e/reports")
	DirAccess.make_dir_recursive_absolute(folder)
	var file = FileAccess.open(folder.path_join("matchup-probe.json" if probe else "matchup-matrix.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify(report, "  "))
	print(JSON.stringify({"suite": "matchup_matrix", "probe_only": probe, "checks": checks, "duels": cases.size(), "failures": failures}))
	quit(0 if failures.is_empty() else 1)
