extends Node
## Plays the e2e test pyramid inside the game. The engine layer runs live through
## EngineSteps (the in-game port of the Python step library); the scene and
## playthrough layers need the desktop harness, so they're listed and shown but
## not played. Used by demo mode (with the BDD HUD and pacing) and by the parity
## check (headless, no pacing).

signal catalog_ready
signal scenario_started(index: int)
signal scenario_finished(index: int, status: String, message: String)
signal step_started(index: int, step_index: int, text: String)
signal cycle_finished(passed: int, failed: int, skipped: int)

const GherkinParser := preload("res://scripts/demo/GherkinParser.gd")
const EngineSteps := preload("res://scripts/demo/EngineSteps.gd")
const RealSteps := preload("res://scripts/demo/RealSteps.gd")
const FEATURES_DIR := "res://tests/e2e/features/"

enum Mode { DEMO, REAL }

## Pyramid layers, base first (that's also the playing order)
const LAYERS := [
	{"id": "engine", "title": "Base · Infinity AI scenario engine", "note": "plays in Demo Arena", "dirs": ["engine"], "runnable": true},
	{"id": "scenes", "title": "Middle · Scene and UI tests", "note": "plays in Real cRPG", "dirs": ["normal", "spells"], "runnable": false},
	{"id": "playthroughs", "title": "Top · Real-player playthroughs", "note": "plays in Real cRPG", "dirs": ["full_playthroughs"], "runnable": false},
	{"id": "scenarios", "title": "Adventures · Real cRPG Scenarios", "note": "plays in Real cRPG", "dirs": ["scenarios"], "runnable": false},
]

## Flat list of every scenario: {layer, feature, feature_path, name, steps, tags, runnable, status, message}
var scenarios: Array = []
var features: Array = []
var mode: int = Mode.DEMO
var steps
var engine_steps
var real_steps
var visual := true
var speed := 1.0
var paused := false
var current := -1
var _generation := 0
var _cycle_ran := {}

## Seconds, at 1x speed (combat round and turn pace slowed down 2x)
const SPLASH := 2.6
const STEP_PAUSE := 0.9
var turn_pause: float = 1.4  # slowed down 2x from 0.7
var action_pause: float = 1.8  # slowed down 2x from 0.9

func _ready() -> void:
	engine_steps = EngineSteps.new(self)
	real_steps = RealSteps.new(self)
	steps = engine_steps

func set_mode(new_mode: int) -> void:
	mode = new_mode
	steps = real_steps if mode == Mode.REAL else engine_steps
	_update_runnable()

func _update_runnable() -> void:
	for sc in scenarios:
		var desktop_only: bool = "desktop_only" in sc["tags"]
		if mode == Mode.REAL:
			var is_real_layer: bool = sc["layer"] in ["playthroughs", "scenes", "scenarios"]
			sc["runnable"] = is_real_layer and not desktop_only
		else:
			var is_engine_layer: bool = sc["layer"] == "engine"
			sc["runnable"] = is_engine_layer and not desktop_only

func load_catalog() -> void:
	scenarios.clear()
	features.clear()
	for layer in LAYERS:
		for d in layer["dirs"]:
			var dir: String = FEATURES_DIR + d
			var files := Array(DirAccess.get_files_at(dir)).filter(func(f): return f.ends_with(".feature"))
			files.sort()
			for f in files:
				var feat := GherkinParser.parse_file(dir + "/" + f)
				if feat.is_empty():
					continue
				feat["layer"] = layer["id"]
				feat["file"] = f
				feat["first"] = scenarios.size()
				features.append(feat)
				for sc in feat["scenarios"]:
					var desktop_only: bool = "desktop_only" in sc["tags"]
					scenarios.append({
						"layer": layer["id"], "feature": feat["name"], "file": f, "name": sc["name"],
						"description": " ".join(sc["description"]), "steps": sc["steps"], "tags": sc["tags"],
						"runnable": layer["runnable"] and not desktop_only, "status": "pending", "message": "",
					})
				feat["last"] = scenarios.size() - 1
	_update_runnable()
	catalog_ready.emit()

func runnable_indices() -> Array:
	var out: Array = []
	for i in range(scenarios.size()):
		if scenarios[i]["runnable"]:
			out.append(i)
	return out

# ── Pacing (all no-ops when not visual) ─────────────────────────────────────

func _wait(seconds: float) -> void:
	if not visual or seconds <= 0.0:
		return
	var gen := _generation
	var left: float = seconds / max(speed, 0.1)
	while left > 0.0 or paused:
		if not is_inside_tree() or get_tree() == null:
			return
		await get_tree().process_frame
		if not is_inside_tree() or get_tree() == null or gen != _generation:
			return
		if not paused:
			left -= get_process_delta_time()

func set_turn_pause(sec: float) -> void:
	turn_pause = max(0.1, sec)
	action_pause = turn_pause * (1.8 / 1.4)

func pause_action() -> void:
	await _wait(action_pause)

func pause_turn() -> void:
	await _wait(turn_pause)

func set_quiet(q: bool) -> void:
	ScenarioEngine.quiet = q

func coverage_complete() -> bool:
	for i in runnable_indices():
		if "coverage_gate" in scenarios[i]["tags"]:
			continue
		if not _cycle_ran.has(i):
			return false
	return true

func show_scenario_splash(ctx: Dictionary) -> void:
	if not visual:
		return
	var party: Array = []
	var foes: Array = []
	for id in ScenarioEngine.actors:
		var a: Dictionary = ScenarioEngine.actors[id]
		if a["side"] == "party":
			party.append("%s (L%d %s)" % [a["name"], int(a["level"]), a["class"]] if a["kind"] == "pc" else str(a["name"]))
		else:
			foes.append(str(a["name"]))
	var sc: Dictionary = scenarios[current] if current >= 0 else {}
	_overlay("show_scenario_splash", [str(sc.get("name", ScenarioEngine.scenario.get("name", ""))),
		str(ctx.get("description", "")) if str(ctx.get("description", "")) != "" else str(sc.get("description", "Infinity AI scenario engine test")),
		"ScenarioArena · seed %d" % Dice.seed_value,
		"Party: %s  vs  %s" % [", ".join(party), ", ".join(foes) if not foes.is_empty() else "no enemies"], SPLASH / max(speed, 0.1)])
	await _wait(SPLASH)

func run_battle(max_rounds: int) -> Dictionary:
	if not visual:
		return ScenarioEngine.run(max_rounds)
	if max_rounds > 0:
		ScenarioEngine.max_rounds = max_rounds if ScenarioEngine.round_num == 0 else min(ScenarioEngine.max_rounds, ScenarioEngine.round_num + max_rounds)
	var gen := _generation
	var guard := 0
	while ScenarioEngine.status == "active" and guard < 5000:
		guard += 1
		if ScenarioEngine.step_turn() == "" and ScenarioEngine.status == "active":
			break
		await pause_turn()
		if gen != _generation:
			break
	return ScenarioEngine.summary()

func run_fuzz(fuzz_seed: int, count: int) -> Dictionary:
	var runs: Array = []
	var nondeterministic := 0
	var violations := 0
	var gen := _generation
	for i in range(count):
		var r := ScenarioEngine.fuzz_one(fuzz_seed, i, 25)
		runs.append(r)
		violations += r["violations"].size()
		if not r["deterministic"]:
			nondeterministic += 1
		if visual:
			_overlay("set_step", ["WHEN the Infinity AI plays %d random scenarios from seed %d" % [count, fuzz_seed],
				"Battle %d of %d: %s → %s in %d rounds" % [i + 1, count, str(r["scenario"]["name"]), str(r["outcome"]), int(r["rounds"])], ""])
			await get_tree().process_frame
			if gen != _generation:
				break
	return {"seed": fuzz_seed, "count": count, "violations": violations, "nondeterministic": nondeterministic, "runs": runs}

# ── Running ─────────────────────────────────────────────────────────────────

## Plays scenario `index` and returns {status, message}. Visual runs show the HUD.
func run_scenario(index: int) -> Dictionary:
	current = index
	var sc: Dictionary = scenarios[index]
	var gen := _generation
	scenario_started.emit(index)
	if not sc["runnable"]:
		sc["status"] = "desktop"
		_show_desktop_only(sc)
		scenario_finished.emit(index, "desktop", "")
		return {"status": "desktop", "message": ""}
	sc["status"] = "running"
	_overlay("clear_proofs", ["%s › %s" % [sc["feature"], sc["name"]]])
	var ctx := {"spec": null, "loaded": false, "payload": {}, "last": null, "cursor": 0, "fuzz": {}, "proofs": [],
		"scenario_name": sc["name"], "description": sc["description"]}
	var status := "passed"
	var message := ""
	var skipped_steps := 0
	for k in range(sc["steps"].size()):
		var st: Dictionary = sc["steps"][k]
		var text := "%s %s" % [st["keyword"].to_upper(), st["name"]]
		step_started.emit(index, k, text)
		_overlay("set_step", [text, "%s › %s" % [sc["feature"], sc["name"]], sc["description"]])
		ctx["proofs"] = []
		var found: Dictionary = steps.find(st["type"], st["name"])
		if found.is_empty():
			var alt = engine_steps if steps == real_steps else real_steps
			if alt:
				found = alt.find(st["type"], st["name"])
		var err := ""
		# Like the Python library, reading state loads a table-built scenario first
		if st["type"] == "then" and not bool(ctx["loaded"]) and ctx["spec"] != null:
			if engine_steps:
				err = await engine_steps._ensure(ctx)
		if err != "":
			pass
		elif found.is_empty():
			err = "Undefined step: %s %s" % [st["type"], st["name"]]
		else:
			err = await found["fn"].call(ctx, found["args"], st)
		if gen != _generation:
			return {"status": "cancelled", "message": ""}
		var evidence := "  |  ".join(ctx["proofs"])
		if err.begins_with("SKIP:"):
			skipped_steps += 1
			_overlay("add_proof", [st["name"], "skipped: " + err.substr(5).strip_edges(), true])
			continue
		var passed := err == ""
		if st["type"] == "then" or not ctx["proofs"].is_empty() or not passed:
			_overlay("add_proof", [st["name"], (err + ("  |  " + evidence if evidence != "" else "")) if not passed else evidence, passed])
		if not passed:
			status = "failed"
			message = "%s: %s" % [st["name"], err]
			break
		await _wait(STEP_PAUSE)
		if gen != _generation:
			return {"status": "cancelled", "message": ""}
	if status == "passed" and skipped_steps == sc["steps"].filter(func(x): return x["type"] == "then").size() and skipped_steps > 0:
		status = "skipped"
	sc["status"] = status
	sc["message"] = message
	_cycle_ran[index] = true
	ScenarioEngine.quiet = false
	scenario_finished.emit(index, status, message)
	return {"status": status, "message": message}

func _show_desktop_only(sc: Dictionary) -> void:
	_overlay("clear_proofs", ["%s › %s" % [sc["feature"], sc["name"]]])
	var layer_note := ""
	for l in LAYERS:
		if l["id"] == sc["layer"]:
			layer_note = "%s: %s" % [l["title"], l["note"]]
	_overlay("set_step", ["Desktop/Alternate Mode: %s" % sc["name"], layer_note, "Switch mode to play: Press 'M' or click Mode button"])
	for st in sc["steps"]:
		_overlay("add_proof", ["%s %s" % [st["keyword"], st["name"]], "switch mode (Key: M) to play live", true])

## Plays every runnable scenario from `from_index`, looping forever when `loop` is set.
func play_from(from_index: int, loop: bool = true) -> void:
	_generation += 1
	var gen := _generation
	var order := runnable_indices()
	if order.is_empty():
		return
	var start := order.find(from_index)
	if start < 0:
		start = 0
		for k in range(order.size()):
			if order[k] >= from_index:
				start = k
				break
	while gen == _generation:
		if start == 0:
			ScenarioEngine.reset_coverage()
			_cycle_ran.clear()
		for k in range(start, order.size()):
			await run_scenario(order[k])
			if gen != _generation:
				return
			await _wait(1.0)
		var counts := tally()
		cycle_finished.emit(counts["passed"], counts["failed"], counts["skipped"])
		if not loop:
			return
		start = 0

## Stops whatever is playing (the current scenario is abandoned).
func stop() -> void:
	_generation += 1

func tally() -> Dictionary:
	var t := {"passed": 0, "failed": 0, "skipped": 0, "pending": 0}
	for i in runnable_indices():
		var s := str(scenarios[i]["status"])
		t[s if t.has(s) else "pending"] = int(t.get(s if t.has(s) else "pending", 0)) + 1
	return t

## Headless run of the whole engine layer (the parity check). No pacing, no HUD.
func run_all() -> Array:
	visual = false
	set_mode(Mode.DEMO)
	load_catalog()
	ScenarioEngine.reset_coverage()
	_cycle_ran.clear()
	var results: Array = []
	for i in runnable_indices():
		var r := await run_scenario(i)
		results.append({"file": scenarios[i]["file"], "scenario": scenarios[i]["name"], "status": r["status"], "message": r["message"]})
	return results

func _overlay(method: String, args: Array) -> void:
	if not visual or not has_node("/root/QAOverlay"):
		return
	var o := get_node("/root/QAOverlay")
	if o.has_method(method):
		o.callv(method, args)
