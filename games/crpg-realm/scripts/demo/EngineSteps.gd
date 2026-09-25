extends RefCounted
## In-game port of tests/e2e/features/steps/engine_steps.py, so the engine layer of
## the test pyramid runs inside the game (demo mode, browser builds). Patterns,
## registration order and behaviour mirror the Python library; the parity feature
## (12_in_game_runner_parity.feature) runs every engine scenario through this port
## too, so the two can't drift apart.
##
## A step returns "" on success, an error message on failure, or "SKIP: reason"
## for steps that need desktop tooling (Node, Python) the browser doesn't have.

var runner: Node
var registry: Array = []

func _init(r: Node) -> void:
	runner = r
	_register()

# ── Registry ─────────────────────────────────────────────────────────────────

func add(type: String, pattern: String, fn: Callable) -> void:
	var rx := "^"
	var names: Array = []
	var i := 0
	while i < pattern.length():
		var c := pattern[i]
		if c == "{":
			var close := pattern.find("}", i)
			var spec := pattern.substr(i + 1, close - i - 1)
			var is_int := spec.ends_with(":d")
			names.append(spec.trim_suffix(":d"))
			rx += "(-?\\d+)" if is_int else "(.+?)"
			i = close + 1
			continue
		if c in ["\\", ".", "+", "*", "?", "(", ")", "[", "]", "^", "$", "|"]:
			rx += "\\"
		rx += c
		i += 1
	rx += "$"
	var re := RegEx.new()
	re.compile(rx)
	var ints: Array = []
	var j := 0
	while true:
		j = pattern.find("{", j)
		if j < 0:
			break
		ints.append(pattern.substr(j, pattern.find("}", j) - j).ends_with(":d"))
		j += 1
	registry.append({"type": type, "pattern": pattern, "re": re, "ints": ints, "fn": fn})

func find(step_type: String, text: String) -> Dictionary:
	for r in registry:
		if r["type"] != step_type:
			continue
		var m: RegExMatch = r["re"].search(text)
		if m == null:
			continue
		var args: Array = []
		for k in range(1, m.get_group_count() + 1):
			var v := m.get_string(k)
			args.append(int(v) if r["ints"][k - 1] else v)
		return {"fn": r["fn"], "args": args, "pattern": r["pattern"]}
	return {}

# ── Helpers ──────────────────────────────────────────────────────────────────

func _proof(ctx: Dictionary, evidence: String) -> void:
	ctx["proofs"].append(evidence)

func _spec(ctx: Dictionary) -> Dictionary:
	if ctx.get("spec") == null:
		ctx["spec"] = {"name": ctx.get("scenario_name", "scenario"), "seed": 1, "party": [], "enemies": [], "directives": [], "traps": []}
		ctx["loaded"] = false
	return ctx["spec"]

func _defining(ctx: Dictionary) -> String:
	if bool(ctx.get("loaded", false)) and ctx.get("spec") != null:
		return "This step defines the scenario, but the scenario was already loaded by an earlier step. Put party, enemies, traps, map, round limit and directive steps first."
	_spec(ctx)
	return ""

func _num(v: String):
	v = v.strip_edges()
	if v == "":
		return null
	if v.to_lower() in ["true", "yes"]:
		return true
	if v.to_lower() in ["false", "no"]:
		return false
	if v.is_valid_int():
		return int(v)
	if v.is_valid_float():
		return float(v)
	return v

const LIST_KEYS := ["spells", "inventory", "conditions", "preferSpells", "forbidSpells", "resistances", "immunities",
	"vulnerabilities", "condition_immunities", "accessories"]

func _row(headings: Array, cells: Array) -> Dictionary:
	var out := {}
	for k in range(headings.size()):
		var v: String = str(cells[k]).strip_edges() if k < cells.size() else ""
		if v == "":
			continue
		var key: String = headings[k]
		if key in LIST_KEYS:
			var items: Array = []
			for x in v.split(","):
				if x.strip_edges() != "":
					items.append(x.strip_edges())
			out[key] = items
		elif key == "position":
			var parts := v.replace("(", "").replace(")", "").split(",")
			out["x"] = float(parts[0])
			out["y"] = float(parts[1])
		else:
			out[key] = _num(v)
	return out

func _load(ctx: Dictionary, payload: Dictionary) -> String:
	var res: Dictionary
	if payload.has("file"):
		res = ScenarioEngine.load_scenario_file(str(payload["file"]))
	else:
		res = ScenarioEngine.load_scenario(payload["scenario"])
	if not res.get("success", false):
		return "Scenario failed to load: %s" % JSON.stringify(res.get("errors", res))
	ctx["payload"] = payload
	ctx["loaded"] = true
	ctx["load_result"] = res
	ctx["last"] = null
	await runner.show_scenario_splash(ctx)
	return ""

func _ensure(ctx: Dictionary) -> String:
	if bool(ctx.get("loaded", false)):
		return ""
	return await _load(ctx, {"scenario": _spec(ctx).duplicate(true)})

func _actor(id: String) -> Dictionary:
	if not ScenarioEngine.actors.has(id):
		return {}
	return ScenarioEngine.actor_view(ScenarioEngine.actors[id])

func _no_actor(id: String) -> String:
	return "No actor '%s' (have: %s)" % [id, ", ".join(ScenarioEngine.actors.keys())]

func _new_events(ctx: Dictionary, type: String = "") -> Array:
	var since := int(ctx.get("cursor", 0))
	return ScenarioEngine.events.slice(since).filter(func(e): return type == "" or e["type"] == type)

func _all_events(type: String = "") -> Array:
	return ScenarioEngine.events.filter(func(e): return type == "" or e["type"] == type)

func _begin(ctx: Dictionary) -> String:
	var err: String = await _ensure(ctx)
	ctx["cursor"] = ScenarioEngine.events.size()
	return err

func _input(ctx: Dictionary, actor: String, action: Dictionary) -> String:
	var err: String = await _begin(ctx)
	if err != "":
		return err
	ctx["last"] = ScenarioEngine.test_input(actor, action)
	await runner.pause_action()
	return ""

func _last(ctx: Dictionary, type: String, match: Dictionary = {}) -> Dictionary:
	var evs := _new_events(ctx, type).filter(func(e):
		for k in match:
			if str(e.get(k, "")) != str(match[k]):
				return false
		return true)
	return evs[-1] if not evs.is_empty() else {}

func _patch(body: Dictionary) -> void:
	ScenarioEngine.patch(body)

func _pos_str(p) -> String:
	return "[%s, %s]" % [str(p[0]), str(p[1])]

# ── Step definitions (same order as engine_steps.py) ────────────────────────

func _register() -> void:
	add("given", 'the scenario description "{text}"', func(ctx, a, s):
		ctx["description"] = a[0]
		return "")
	add("given", 'the cRPG test scenario "{name}" from the knowledge graph', func(ctx, a, s):
		var name: String = a[0]
		var path := name if (name.ends_with(".jsonld") or name.ends_with(".json")) else "scenarios/%s.jsonld" % name
		ctx["spec"] = null
		var err: String = await _load(ctx, {"file": path})
		if err == "":
			_proof(ctx, "loaded %s: %d actors, order %s" % [path, int(ctx["load_result"]["actors"]), " → ".join(ctx["load_result"]["order"])])
		return err)
	add("given", 'a cRPG test scenario', func(ctx, a, s):
		ctx["spec"] = null
		var parsed = JSON.parse_string(str(s.get("text", "")))
		if not (parsed is Dictionary):
			return "The doc string isn't a JSON object"
		var err: String = await _load(ctx, {"scenario": parsed})
		if err == "":
			_proof(ctx, "loaded inline scenario: %d actors" % int(ctx["load_result"]["actors"]))
		return err)
	add("given", 'a cRPG test scenario "{name}" with seed {seed:d}', func(ctx, a, s):
		ctx["spec"] = null
		var sp := _spec(ctx)
		sp["name"] = a[0]
		sp["seed"] = a[1]
		return "")
	add("given", 'the round limit is {n:d}', func(ctx, a, s):
		var e := _defining(ctx)
		if e == "":
			ctx["spec"]["max_rounds"] = a[0]
		return e)
	add("given", 'reactions are disabled', func(ctx, a, s):
		var e := _defining(ctx)
		if e == "":
			ctx["spec"]["reactions"] = false
		return e)
	add("given", 'the party', func(ctx, a, s):
		var e := _defining(ctx)
		if e == "":
			for r in s["table"]["rows"]:
				ctx["spec"]["party"].append(_row(s["table"]["headings"], r))
		return e)
	add("given", 'the enemies', func(ctx, a, s):
		var e := _defining(ctx)
		if e == "":
			for r in s["table"]["rows"]:
				ctx["spec"]["enemies"].append(_row(s["table"]["headings"], r))
		return e)
	add("given", 'the traps', func(ctx, a, s):
		var e := _defining(ctx)
		if e == "":
			for r in s["table"]["rows"]:
				ctx["spec"]["traps"].append(_row(s["table"]["headings"], r))
		return e)
	add("given", 'the Infinity AI directives', func(ctx, a, s):
		var e := _defining(ctx)
		if e != "":
			return e
		if s.has("text"):
			var d = JSON.parse_string(str(s["text"]))
			if d is Array:
				ctx["spec"]["directives"].append_array(d)
			else:
				ctx["spec"]["directives"].append(d)
		else:
			for r in s["table"]["rows"]:
				ctx["spec"]["directives"].append(_row(s["table"]["headings"], r))
		return "")
	add("given", 'the scripted player inputs for "{actor}"', func(ctx, a, s):
		var e := _defining(ctx)
		if e != "":
			return e
		var inputs: Array = []
		for r in s["table"]["rows"]:
			var d := _row(s["table"]["headings"], r)
			for key in ["point", "to"]:
				if d.has(key) and d[key] is String:
					var parts: PackedStringArray = str(d[key]).split(",")
					d[key] = [float(parts[0]), float(parts[1])]
			inputs.append(d)
		var existing = null
		for d in ctx["spec"]["directives"]:
			if d.get("actor", "") == a[0]:
				existing = d
		if existing == null:
			existing = {"actor": a[0], "controller": "infinity_ai"}
			ctx["spec"]["directives"].append(existing)
		existing["inputs"] = inputs
		return "")
	add("given", 'the next dice rolls are {values}', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err != "":
			return err
		Dice.force(Array(str(a[0]).replace(" and ", ",").split(",")).map(func(v): return int(v)))
		return "")
	add("given", 'the next d{sides:d} rolls are {values}', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err != "":
			return err
		Dice.force(Array(str(a[1]).replace(" and ", ",").split(",")).map(func(v): return {"d": a[0], "v": int(v)}))
		return "")
	add("given", 'the next d{sides:d} roll is {value:d}', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err != "":
			return err
		Dice.force([{"d": a[0], "v": a[1]}])
		return "")
	add("given", '"{actor}" is at {hp:d} HP', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err == "":
			_patch({"actor": a[0], "hp": a[1]})
		return err)
	add("given", '"{actor}" is {condition} for {rounds:d} rounds', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err == "":
			_patch({"actor": a[0], "add_conditions": [a[1]], "rounds": a[2]})
		return err)
	add("given", '"{actor}" is standing at {x:d},{y:d}', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err == "":
			_patch({"actor": a[0], "x": a[1], "y": a[2]})
		return err)
	add("given", '"{actor}" has no spell slots left', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err != "":
			return err
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		var slots := {}
		for k in act["slots"]:
			slots[k] = 0
		_patch({"actor": a[0], "slots": slots})
		return "")
	var loaded_step := func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err == "":
			_proof(ctx, "initiative order: %s" % " → ".join(ctx["load_result"]["order"]))
		return err
	add("given", 'the scenario is loaded', loaded_step)
	add("when", 'the scenario is loaded', loaded_step)

	# Player inputs
	add("when", '"{actor}" attacks "{target}"', func(ctx, a, s): return await _input(ctx, a[0], {"type": "attack", "target": a[1]}))
	add("when", '"{actor}" casts "{spell}" at "{target}"', func(ctx, a, s): return await _input(ctx, a[0], {"type": "cast", "spell": a[1], "target": a[2]}))
	add("when", '"{actor}" casts "{spell}" at point {x:d},{y:d}', func(ctx, a, s): return await _input(ctx, a[0], {"type": "cast", "spell": a[1], "point": [a[2], a[3]]}))
	add("when", '"{actor}" casts "{spell}"', func(ctx, a, s): return await _input(ctx, a[0], {"type": "cast", "spell": a[1]}))
	add("when", '"{actor}" uses "{item}" on "{target}"', func(ctx, a, s): return await _input(ctx, a[0], {"type": "use_item", "item": a[1], "target": a[2]}))
	add("when", '"{actor}" uses "{item}"', func(ctx, a, s): return await _input(ctx, a[0], {"type": "use_item", "item": a[1]}))
	add("when", '"{actor}" moves to {x:d},{y:d}', func(ctx, a, s): return await _input(ctx, a[0], {"type": "move", "to": [a[1], a[2]]}))
	add("when", '"{actor}" disengages and moves to {x:d},{y:d}', func(ctx, a, s): return await _input(ctx, a[0], {"type": "move", "to": [a[1], a[2]], "disengage": true}))
	add("when", '"{actor}" dodges', func(ctx, a, s): return await _input(ctx, a[0], {"type": "dodge"}))
	add("when", '"{actor}" searches for traps', func(ctx, a, s): return await _input(ctx, a[0], {"type": "search"}))
	add("when", '"{actor}" disarms "{trap}"', func(ctx, a, s): return await _input(ctx, a[0], {"type": "disarm", "trap": a[1]}))

	# The Infinity AI plays
	add("when", "the Infinity AI plays \"{actor}\"'s turn", func(ctx, a, s):
		var err: String = await _begin(ctx)
		if err != "":
			return err
		ctx["last"] = ScenarioEngine.play_turn_api(a[0])
		await runner.pause_action()
		return "")
	add("when", 'the Infinity AI plays the next {n:d} turns', func(ctx, a, s):
		var err: String = await _begin(ctx)
		if err != "":
			return err
		for i in range(a[0]):
			ctx["last"] = ScenarioEngine.play_turn_api("")
			await runner.pause_turn()
		return "")
	add("when", 'the Infinity AI plays the battle to the end', func(ctx, a, s):
		var err: String = await _begin(ctx)
		if err != "":
			return err
		ctx["last"] = await runner.run_battle(-1)
		_proof(ctx, "%s after %d rounds, %d events" % [ctx["last"]["outcome"], int(ctx["last"]["rounds"]), int(ctx["last"]["events"])])
		await runner.pause_action()
		return "")
	add("when", 'the Infinity AI plays up to {n:d} rounds', func(ctx, a, s):
		var err: String = await _begin(ctx)
		if err != "":
			return err
		ctx["last"] = await runner.run_battle(a[0])
		await runner.pause_action()
		return "")

	# Assertions on combatants
	add("then", '"{actor}" has {hp:d} HP', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s HP %d/%d" % [a[0], int(act["hp"]), int(act["max_hp"])])
		return "" if int(act["hp"]) == a[1] else "%s has %d HP, expected %d" % [a[0], int(act["hp"]), a[1]])
	add("then", '"{actor}" has at most {hp:d} HP', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s HP %d/%d" % [a[0], int(act["hp"]), int(act["max_hp"])])
		return "" if int(act["hp"]) <= a[1] else "%s has %d HP, expected at most %d" % [a[0], int(act["hp"]), a[1]])
	add("then", '"{actor}" has at least {hp:d} HP', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s HP %d/%d" % [a[0], int(act["hp"]), int(act["max_hp"])])
		return "" if int(act["hp"]) >= a[1] else "%s has %d HP, expected at least %d" % [a[0], int(act["hp"]), a[1]])
	add("then", '"{actor}" has full HP', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s HP %d/%d" % [a[0], int(act["hp"]), int(act["max_hp"])])
		return "" if int(act["hp"]) == int(act["max_hp"]) else "%s has %d/%d HP" % [a[0], int(act["hp"]), int(act["max_hp"])])
	add("then", '"{actor}" has {hp:d} max HP and AC {ac:d}', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s max HP %d, AC %d" % [a[0], int(act["max_hp"]), int(act["ac"])])
		return "" if int(act["max_hp"]) == a[1] and int(act["ac"]) == a[2] else "%s has max HP %d, AC %d" % [a[0], int(act["max_hp"]), int(act["ac"])])
	add("then", '"{actor}" has AC {ac:d}', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s AC %d (base %d)" % [a[0], int(act["ac"]), int(act["base_ac"])])
		return "" if int(act["ac"]) == a[1] else "%s has AC %d, expected %d" % [a[0], int(act["ac"]), a[1]])
	add("then", '"{actor}" is dead', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s dead=%s hp=%d" % [a[0], str(act["dead"]), int(act["hp"])])
		return "" if act["dead"] else "%s is not dead (HP %d)" % [a[0], int(act["hp"])])
	add("then", '"{actor}" is alive', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s dead=%s hp=%d" % [a[0], str(act["dead"]), int(act["hp"])])
		return "" if not act["dead"] else "%s is dead" % a[0])
	add("then", '"{actor}" is standing', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s HP %d, conditions %s" % [a[0], int(act["hp"]), str(act["condition_list"])])
		return "" if not act["down"] else "%s is down" % a[0])
	add("then", '"{actor}" is down', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s HP %d, dead=%s" % [a[0], int(act["hp"]), str(act["dead"])])
		return "" if act["down"] else "%s is still standing with %d HP" % [a[0], int(act["hp"])])
	add("then", '"{actor}" is not {condition}', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s conditions: %s" % [a[0], ", ".join(act["condition_list"]) if not act["condition_list"].is_empty() else "none"])
		return "" if not (a[1] in act["condition_list"]) else "%s is still %s" % [a[0], a[1]])
	add("then", '"{actor}" is at {x:d},{y:d}', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s at %s" % [a[0], _pos_str(act["pos"])])
		return "" if int(round(float(act["pos"][0]))) == a[1] and int(round(float(act["pos"][1]))) == a[2] else "%s is at %s" % [a[0], _pos_str(act["pos"])])
	add("then", '"{actor}" has {n:d} death save successes and {m:d} failures', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		var ds: Dictionary = act["death_saves"]
		_proof(ctx, "%s death saves %s" % [a[0], str(ds)])
		return "" if int(ds["success"]) == a[1] and int(ds["failure"]) == a[2] else "%s death saves are %s" % [a[0], str(ds)])
	add("then", '"{actor}" has {n:d} level-{lvl:d} spell slots left', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		var have := int(act["slots"].get(str(a[2]), 0))
		_proof(ctx, "%s slots %s" % [a[0], str(act["slots"])])
		return "" if have == a[1] else "%s has %d level-%d slots, expected %d" % [a[0], have, a[2], a[1]])
	add("then", '"{actor}" has {n:d} "{item}" left', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		var have: int = act["inventory"].count(a[2])
		_proof(ctx, "%s inventory %s" % [a[0], str(act["inventory"])])
		return "" if have == a[1] else "%s carries %d %s" % [a[0], have, a[2]])

	# The last action
	add("then", 'the action is refused because "{reason}"', func(ctx, a, s):
		var r = ctx.get("last")
		if not (r is Dictionary):
			r = {}
		_proof(ctx, "result: %s" % JSON.stringify(r).left(160))
		if r.get("success", true):
			return "Action succeeded: %s" % JSON.stringify(r)
		return "" if str(r.get("reason", "")) == a[0] else "Refused because %s, expected %s" % [str(r.get("reason", "")), a[0]])
	add("then", 'the action succeeds', func(ctx, a, s):
		var r = ctx.get("last")
		return "" if r is Dictionary and r.get("success", false) else "Action failed: %s" % JSON.stringify(r))
	add("then", 'the attack hits', func(ctx, a, s):
		var e := _last(ctx, "attack")
		if e.is_empty():
			return "No attack event since the last action"
		_proof(ctx, e["text"])
		return "" if e["hit"] else e["text"])
	add("then", 'the attack misses', func(ctx, a, s):
		var e := _last(ctx, "attack")
		if e.is_empty():
			return "No attack event since the last action"
		_proof(ctx, e["text"])
		return "" if not e["hit"] else e["text"])
	add("then", 'the attack is a critical hit', func(ctx, a, s):
		var e := _last(ctx, "attack")
		if e.is_empty():
			return "No attack event since the last action"
		_proof(ctx, e["text"])
		return "" if e["crit"] else e["text"])
	add("then", 'the attack was rolled with advantage', func(ctx, a, s):
		var e := _last(ctx, "attack")
		if e.is_empty():
			return "No attack event since the last action"
		_proof(ctx, "%s | advantage from %s" % [e["text"], str(e["adv_sources"])])
		return "" if e["advantage"] else "no advantage: %s / %s" % [str(e["adv_sources"]), str(e["dis_sources"])])
	add("then", 'the attack was rolled with disadvantage', func(ctx, a, s):
		var e := _last(ctx, "attack")
		if e.is_empty():
			return "No attack event since the last action"
		_proof(ctx, "%s | disadvantage from %s" % [e["text"], str(e["dis_sources"])])
		return "" if e["disadvantage"] else "no disadvantage: %s / %s" % [str(e["adv_sources"]), str(e["dis_sources"])])
	add("then", '"{actor}" took {n:d} {dtype} damage', func(ctx, a, s):
		var e := _last(ctx, "damage", {"target": a[0]})
		if e.is_empty():
			return "No damage event for %s since the last action" % a[0]
		_proof(ctx, e["text"])
		return "" if int(e["adjusted"]) == a[1] and str(e["damage_type"]) == a[2] else e["text"])
	add("then", '"{actor}" took no damage', func(ctx, a, s):
		var evs := _new_events(ctx, "damage").filter(func(e): return e["target"] == a[0] and int(e["adjusted"]) > 0)
		_proof(ctx, "damage events on %s: %d" % [a[0], evs.size()])
		return "" if evs.is_empty() else evs[-1]["text"])
	add("then", '"{actor}" made a {ability} saving throw', func(ctx, a, s):
		var e := _last(ctx, "saving_throw", {"actor": a[0], "ability": a[1]})
		if e.is_empty():
			return "No %s saving throw by %s since the last action" % [a[1], a[0]]
		_proof(ctx, e["text"])
		return "")
	add("then", '"{actor}" was not affected', func(ctx, a, s):
		var evs := _new_events(ctx).filter(func(e): return e.get("target", "") == a[0] and e["type"] in ["damage", "condition_applied", "saving_throw"])
		evs.append_array(_new_events(ctx, "saving_throw").filter(func(e): return e.get("actor", "") == a[0]))
		_proof(ctx, "events touching %s: %d" % [a[0], evs.size()])
		return "" if evs.is_empty() else "%s was affected: %s" % [a[0], evs[-1]["text"]])

	# The Infinity AI's decisions
	add("then", 'the Infinity AI made "{actor}" {verb} "{what}"', func(ctx, a, s):
		var inputs := _all_events("player_input").filter(func(e): return e["actor"] == a[0])
		if inputs.is_empty():
			return "The Infinity AI gave %s no input" % a[0]
		_proof(ctx, " | ".join(inputs.map(func(e): return e["text"])))
		var keys := {"attack": ["attack", "target"], "cast": ["cast", "spell"], "use": ["use_item", "item"], "target": ["", "target"]}
		if not keys.has(a[1]):
			return "Unknown verb %s" % a[1]
		var k: Array = keys[a[1]]
		for e in inputs:
			var inp: Dictionary = e["input"]
			if (k[0] == "" or inp.get("type", "") == k[0]) and str(inp.get(k[1], "")) == a[2]:
				return ""
		return "Inputs for %s were %s" % [a[0], str(inputs.map(func(e): return e["input"]))])
	add("then", 'the Infinity AI made "{actor}" {action}', func(ctx, a, s):
		var inputs := _all_events("player_input").filter(func(e): return e["actor"] == a[0])
		_proof(ctx, " | ".join(inputs.map(func(e): return e["text"])) if not inputs.is_empty() else "no input")
		var want := {"move": "move", "dodge": "dodge", "wait": "wait"}
		if not want.has(a[1]):
			return "Unknown action %s" % a[1]
		for e in inputs:
			if e["input"].get("type", "") == want[a[1]]:
				return ""
		return "Inputs: %s" % str(inputs.map(func(e): return e["input"])))
	add("then", 'the Infinity AI never made "{actor}" cast "{spell}"', func(ctx, a, s):
		var bad := _all_events("player_input").filter(func(e): return e["actor"] == a[0] and e["input"].get("spell", "") == a[1])
		_proof(ctx, "%s cast %s %d times" % [a[0], a[1], bad.size()])
		return "" if bad.is_empty() else bad[0]["text"])
	add("then", 'every input "{actor}" gave came from its script', func(ctx, a, s):
		var evs := _all_events("player_input").filter(func(e): return e["actor"] == a[0])
		_proof(ctx, " | ".join(evs.map(func(e): return "%s:%s" % [e["source"], e["input"].get("type", "")])))
		if evs.is_empty():
			return "%s gave no input" % a[0]
		for e in evs:
			if e["source"] != "script":
				return "Input from %s: %s" % [e["source"], e["text"]]
		return "")

	# The battle
	add("then", 'the outcome is "{outcome}"', func(ctx, a, s):
		_proof(ctx, "outcome %s after %d rounds" % [ScenarioEngine.outcome if ScenarioEngine.outcome != "" else ScenarioEngine.status, ScenarioEngine.round_num])
		return "" if ScenarioEngine.outcome == a[0] else "Outcome is %s" % ScenarioEngine.outcome)
	add("then", 'the battle lasted at most {n:d} rounds', func(ctx, a, s):
		_proof(ctx, "%d rounds" % ScenarioEngine.round_num)
		return "" if ScenarioEngine.round_num <= a[0] else "Battle lasted %d rounds" % ScenarioEngine.round_num)
	add("then", 'the event log shows "{text}"', func(ctx, a, s):
		var evs := _all_events().filter(func(e): return str(e.get("text", "")).contains(a[0]))
		_proof(ctx, evs[-1]["text"] if not evs.is_empty() else "not found")
		return "" if not evs.is_empty() else "No event text contains \"%s\"" % a[0])
	add("then", 'the engine audit is clean', func(ctx, a, s):
		_proof(ctx, "%d events, %d dice rolls, %d violations" % [ScenarioEngine.events.size(), Dice.log.size(), ScenarioEngine.violations.size()])
		return "" if ScenarioEngine.violations.is_empty() else "Audit violations: %s" % JSON.stringify(ScenarioEngine.violations.slice(0, 5)))
	add("then", 'replaying the scenario produces the identical battle', func(ctx, a, s):
		var original := JSON.stringify(ScenarioEngine.events)
		var pure := not ScenarioEngine.events.any(func(e): return e["type"] == "state_patched" or (e["type"] == "player_input" and e["source"] == "test"))
		var payload: Dictionary = ctx["payload"]
		var logs: Array = []
		runner.set_quiet(true)
		for i in range(2):
			if payload.has("file"):
				ScenarioEngine.load_scenario_file(str(payload["file"]))
			else:
				ScenarioEngine.load_scenario(payload["scenario"])
			ScenarioEngine.run()
			logs.append(JSON.stringify(ScenarioEngine.events))
		runner.set_quiet(false)
		_proof(ctx, "two replays %s; original %s run" % ["match" if logs[0] == logs[1] else "DIFFER", "pure AI" if pure else "test-driven"])
		if logs[0] != logs[1]:
			return "Two replays of the same seed diverged"
		if pure and original != logs[0]:
			return "Replay diverged from the original run"
		return "")
	add("when", 'the Infinity AI plays {count:d} random scenarios from seed {seed:d}', func(ctx, a, s):
		ctx["fuzz"] = await runner.run_fuzz(a[1], a[0])
		var outcomes := {}
		for r in ctx["fuzz"]["runs"]:
			outcomes[r["outcome"]] = int(outcomes.get(r["outcome"], 0)) + 1
		_proof(ctx, "%d battles: %s" % [a[0], str(outcomes)])
		return "")
	add("then", 'every random battle finished with a clean audit', func(ctx, a, s):
		var bad: Array = ctx["fuzz"]["runs"].filter(func(r): return not r["violations"].is_empty())
		_proof(ctx, "%d battles with violations" % bad.size())
		if not bad.is_empty():
			return JSON.stringify({"scenario": bad[0]["scenario"], "violations": bad[0]["violations"].slice(0, 5)})
		for r in ctx["fuzz"]["runs"]:
			if not (r["outcome"] in ["victory", "defeat", "timeout"]):
				return "Battle without an outcome: %s" % JSON.stringify(r["scenario"])
		return "")
	add("then", 'every random battle replayed identically', func(ctx, a, s):
		_proof(ctx, "%d nondeterministic" % int(ctx["fuzz"]["nondeterministic"]))
		return "" if int(ctx["fuzz"]["nondeterministic"]) == 0 else "%d battles didn't replay identically" % int(ctx["fuzz"]["nondeterministic"]))
	add("then", 'the engine has exercised every {kind} in the content data', func(ctx, a, s):
		if not runner.coverage_complete():
			return "SKIP: the coverage gate needs the whole engine layer to have run in this cycle"
		var cov := ScenarioEngine.coverage_report()
		var missing: Array = cov["missing"].get(a[0], [])
		_proof(ctx, "%s: %d exercised, missing %s" % [a[0], cov["content"].get(a[0], {}).size(), str(missing) if not missing.is_empty() else "none"])
		return "" if missing.is_empty() else "Never exercised %s: %s" % [a[0], str(missing)])
	add("then", 'the damage included {dice} of sneak attack', func(ctx, a, s):
		var e := _last(ctx, "damage")
		if e.is_empty():
			return "No damage event since the last action"
		var extra: Array = e.get("extra", []).filter(func(x): return x["source"] == "sneak_attack")
		_proof(ctx, "%s | sneak attack %s" % [e["text"], str(extra.map(func(x): return "%s=%d" % [x["roll"]["dice"], int(x["roll"]["total"])]))])
		return "" if not extra.is_empty() and extra[0]["roll"]["dice"] == a[0] else "No %s sneak attack in %s" % [a[0], str(e.get("extra", []))])
	add("given", '"{actor}" has {n:d} level-{lvl:d} spell slots', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err == "":
			_patch({"actor": a[0], "slots": {str(a[2]): a[1]}})
		return err)
	add("then", '"{actor}" has {n:d} maneuvers left', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s resources %s" % [a[0], str(act["resources"])])
		return "" if int(act["resources"].get("maneuver", 0)) == a[1] else "%s has %s maneuvers" % [a[0], str(act["resources"])])
	add("then", '"{a}" and "{b}" are in different squares', func(ctx, a, s):
		var pa := _actor(a[0])
		var pb := _actor(a[1])
		if pa.is_empty() or pb.is_empty():
			return _no_actor(a[0] if pa.is_empty() else a[1])
		var d: float = max(abs(float(pa["pos"][0]) - float(pb["pos"][0])), abs(float(pa["pos"][1]) - float(pb["pos"][1])))
		_proof(ctx, "%s at %s, %s at %s (%.1f ft apart)" % [a[0], _pos_str(pa["pos"]), a[1], _pos_str(pb["pos"]), d])
		return "" if d >= 5 else "%s and %s share a square" % [a[0], a[1]])
	add("then", '"{actor}" has speed {n:d}', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s speed %d" % [a[0], int(act["speed"])])
		return "" if int(act["speed"]) == a[1] else "%s has speed %d" % [a[0], int(act["speed"])])
	add("then", 'the battle has ended', func(ctx, a, s):
		_proof(ctx, "status %s, outcome %s, round %d" % [ScenarioEngine.status, ScenarioEngine.outcome, ScenarioEngine.round_num])
		return "" if ScenarioEngine.status == "ended" and ScenarioEngine.outcome in ["victory", "defeat", "timeout"] else ScenarioEngine.status)
	add("then", 'applying "{condition}" to the {who} means it {effect}', func(ctx, a, s): return await _condition_effect(ctx, a[0], a[1], a[2]))
	add("then", 'the engine has exercised every rule path it defines', func(ctx, a, s):
		if not runner.coverage_complete():
			return "SKIP: the coverage gate needs the whole engine layer to have run in this cycle"
		var f := FileAccess.open("res://scripts/engine/ScenarioEngine.gd", FileAccess.READ)
		if f == null or not f.get_as_text().contains("_cov_rule"):
			return "SKIP: the engine source isn't readable in this build"
		var re := RegEx.new()
		re.compile('_cov_rule\\("([a-z0-9_.]+)"\\)')
		var defined := {}
		for m in re.search_all(f.get_as_text()):
			defined[m.get_string(1)] = true
		var hit: Dictionary = ScenarioEngine.coverage_report()["rules"]
		var missing := defined.keys().filter(func(r): return not hit.has(r))
		_proof(ctx, "%d rule paths defined, %d exercised, missing %s" % [defined.size(), defined.size() - missing.size(), str(missing) if not missing.is_empty() else "none"])
		return "" if missing.is_empty() else "Rule paths never exercised: %s" % str(missing))
	add("then", '"{actor}" took at least {n:d} {dtype} damage', func(ctx, a, s):
		var e := _last(ctx, "damage", {"target": a[0]})
		if e.is_empty():
			return "No damage event for %s since the last action" % a[0]
		_proof(ctx, e["text"])
		return "" if int(e["adjusted"]) >= a[1] and str(e["damage_type"]) == a[2] else e["text"])
	add("when", '"{actor}" takes the disengage action', func(ctx, a, s): return await _input(ctx, a[0], {"type": "disengage"}))
	add("given", '"{actor}" carries "{item}"', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err != "":
			return err
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_patch({"actor": a[0], "inventory": act["inventory"] + [a[1]]})
		return "")
	add("given", 'the battle map "{slug}"', func(ctx, a, s):
		var e := _defining(ctx)
		if e == "":
			ctx["spec"]["map"] = {"@id": "urn:robos:crpg:battle-map:%s" % a[0]}
		return e)
	add("given", '"{actor}" has speed {n:d}', func(ctx, a, s):
		var err: String = await _ensure(ctx)
		if err == "":
			_patch({"actor": a[0], "speed": a[1]})
		return err)
	add("then", 'the last move cost {n:d} ft', func(ctx, a, s):
		var e := _last(ctx, "moved")
		if e.is_empty():
			return "No move since the last action"
		_proof(ctx, "%s via %s" % [e["text"], str(e.get("path", []))])
		return "" if int(round(float(e["feet"]))) == a[0] else "Move cost %s ft, expected %d" % [str(e["feet"]), a[0]])
	add("then", 'the last move passed through {x:d},{y:d}', func(ctx, a, s):
		var e := _last(ctx, "moved")
		if e.is_empty():
			return "No move since the last action"
		_proof(ctx, "path %s" % str(e.get("path", [])))
		for p in e.get("path", []):
			if int(round(float(p[0]))) == a[0] and int(round(float(p[1]))) == a[1]:
				return ""
		return "Path %s doesn't pass %d,%d" % [str(e.get("path", [])), a[0], a[1]])
	add("then", 'the attack was against AC {ac:d} with {source}', func(ctx, a, s):
		var e := _last(ctx, "attack")
		if e.is_empty():
			return "No attack event since the last action"
		_proof(ctx, "%s | AC sources %s" % [e["text"], str(e["ac_sources"])])
		var has_src: bool = e["ac_sources"].any(func(x): return str(x).contains(a[1]))
		return "" if int(e["ac"]) == a[0] and has_src else "AC %d from %s" % [int(e["ac"]), str(e["ac_sources"])])
	add("then", 'every blockout map is up to date with its objects', func(ctx, a, s):
		return "SKIP: runs the Python blockout checker, which needs a desktop CI machine")
	add("then", '"{actor}" is {condition}', func(ctx, a, s):
		var act := _actor(a[0])
		if act.is_empty():
			return _no_actor(a[0])
		_proof(ctx, "%s conditions: %s" % [a[0], ", ".join(act["condition_list"]) if not act["condition_list"].is_empty() else "none"])
		return "" if a[1] in act["condition_list"] else "%s is not %s (has %s)" % [a[0], a[1], str(act["condition_list"])])
	add("then", 'every scenario file conforms to the robos:CRPGTestScenario SHACL shapes', func(ctx, a, s):
		return "SKIP: runs the KGraph SHACL validator (Node.js), which needs a desktop CI machine")
	add("then", 'loading this scenario fails with "{message}"', func(ctx, a, s):
		var parsed = JSON.parse_string(str(s.get("text", "")))
		if not (parsed is Dictionary):
			return "The doc string isn't a JSON object"
		var res := ScenarioEngine.load_scenario(parsed)
		_proof(ctx, "errors: %s" % str(res.get("errors", [])))
		if res.get("success", false):
			return "Scenario loaded but should have been rejected"
		for e in res.get("errors", []):
			if str(e).contains(a[0]):
				return ""
		return "Errors were %s" % str(res.get("errors", [])))

func _condition_effect(ctx: Dictionary, condition: String, who: String, effect: String) -> String:
	var err: String = await _ensure(ctx)
	if err != "":
		return err
	var subject := "vance" if who == "attacker" else "guard"
	var patch := {"actor": subject, "add_conditions": [condition], "rounds": 10}
	if condition == "charmed":
		patch["by"] = "guard"
	_patch(patch)
	if effect in ["attacks with disadvantage", "is attacked with advantage", "attacks with advantage"]:
		Dice.force([{"d": 20, "v": 11}, {"d": 20, "v": 12}])
		await _input(ctx, "vance", {"type": "attack", "target": "guard"})
		var e := _last(ctx, "attack")
		if e.is_empty():
			return "No attack was made: %s" % JSON.stringify(ctx["last"])
		_proof(ctx, "%s | adv %s dis %s" % [e["text"], str(e["adv_sources"]), str(e["dis_sources"])])
		var want_adv := effect != "attacks with disadvantage"
		var ok: bool = e["advantage"] if want_adv else e["disadvantage"]
		return "" if ok else "%s: adv=%s dis=%s" % [condition, str(e["adv_sources"]), str(e["dis_sources"])]
	if effect == "cannot act":
		await _input(ctx, subject, {"type": "attack", "target": "vance" if subject == "guard" else "guard"})
		var r: Dictionary = ctx["last"]
		_proof(ctx, "result %s" % JSON.stringify(r))
		return "" if not r.get("success", true) and r.get("reason", "") == "incapacitated" else JSON.stringify(r)
	if effect == "cannot move":
		await _input(ctx, subject, {"type": "move", "to": [0, 30]})
		var r2: Dictionary = ctx["last"]
		_proof(ctx, "result %s" % JSON.stringify(r2))
		return "" if not r2.get("success", true) and str(r2.get("reason", "")).begins_with("speed_zero") else JSON.stringify(r2)
	if effect == "cannot attack its charmer":
		await _input(ctx, "vance", {"type": "attack", "target": "guard"})
		var r3: Dictionary = ctx["last"]
		_proof(ctx, "result %s" % JSON.stringify(r3))
		return "" if not r3.get("success", true) and r3.get("reason", "") == "charmed" else JSON.stringify(r3)
	if effect == "still acts normally":
		await _input(ctx, "vance", {"type": "attack", "target": "guard"})
		var r4: Dictionary = ctx["last"]
		_proof(ctx, "result %s" % ("acted" if r4.get("success", false) else JSON.stringify(r4)))
		return "" if r4.get("success", false) else JSON.stringify(r4)
	if effect == "forces a WIS save to attack it":
		_patch({"actor": "guard", "remove_conditions": ["sanctuary"]})
		_patch({"actor": "guard", "add_conditions": ["sanctuary"], "rounds": 10})
		await _input(ctx, "vance", {"type": "attack", "target": "guard"})
		var e2 := _last(ctx, "saving_throw", {"actor": "vance", "ability": "WIS"})
		if e2.is_empty():
			return "No WIS save by vance"
		_proof(ctx, e2["text"])
		return ""
	if effect == "sees invisible creatures":
		_patch({"actor": "guard", "add_conditions": ["invisible"], "rounds": 10})
		Dice.force([{"d": 20, "v": 11}])
		await _input(ctx, "vance", {"type": "attack", "target": "guard"})
		var e3 := _last(ctx, "attack")
		if e3.is_empty():
			return "No attack was made"
		_proof(ctx, "%s | dis %s" % [e3["text"], str(e3["dis_sources"])])
		return "" if not e3["disadvantage"] else str(e3["dis_sources"])
	return "No check defined for effect %s" % effect
