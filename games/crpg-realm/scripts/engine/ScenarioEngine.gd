extends Node
## Scenario engine: a generic, deterministic, data-driven rules core.
##
## Load any scenario (party, enemies, positions, seed, rules) as a Dictionary or a
## JSON file from res://scenarios/. Party members and enemies share one combatant
## model. Rules come from data/v1 (spells.mechanics, monsters, items, classes,
## races). Every roll goes through the Dice autoload, every state change is an
## event, and every event is audited against the rules' invariants.
##
## Distances are in feet. Reach, range and movement use 5e grid distance
## (Chebyshev); sphere areas use straight-line distance.

signal scenario_loaded(summary: Dictionary)
signal event_recorded(ev: Dictionary)
signal scenario_ended(outcome: String)

const DATA_DIR := "res://data/v1/"
const CONTENT_KINDS := ["spells", "monsters", "classes", "races", "items", "traps", "status_effects"]
const ABILITIES := ["STR", "DEX", "CON", "INT", "WIS", "CHA"]

const INCAPACITATING := ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"]
const AUTO_FAIL_STR_DEX := ["paralyzed", "petrified", "stunned", "unconscious"]
const ATTACKER_DISADVANTAGE := ["blinded", "poisoned", "frightened", "restrained"]
const TARGET_GRANTS_ADVANTAGE := ["blinded", "paralyzed", "restrained", "stunned", "unconscious", "petrified"]
const AUTO_CRIT_WITHIN_5FT := ["paralyzed", "unconscious"]
const SPEED_ZERO := ["grappled", "restrained", "paralyzed", "petrified", "stunned", "unconscious"]

const CASTING_ABILITY := {
	"bard": "CHA", "cleric": "WIS", "druid": "WIS", "paladin": "CHA", "ranger": "WIS",
	"sorcerer": "CHA", "warlock": "CHA", "wizard": "INT",
}
const FULL_CASTERS := ["bard", "cleric", "druid", "sorcerer", "wizard"]
const HALF_CASTERS := ["paladin", "ranger"]
const FULL_CASTER_SLOTS := [
	[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
]
const HALF_CASTER_SLOTS := [
	[], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
]
const EXTRA_ATTACK_CLASSES := ["barbarian", "fighter", "monk", "paladin", "ranger"]

## Sensible starting kits so a scenario only has to name a class.
const CLASS_KITS := {
	"barbarian": {"weapon": "greatsword", "armor": "", "shield": false, "abilities": [15, 13, 14, 8, 12, 10], "spells": []},
	"bard": {"weapon": "rapier", "armor": "leather-armor", "shield": false, "abilities": [8, 14, 13, 10, 12, 15], "spells": ["healing-word", "sleep", "invisibility"]},
	"cleric": {"weapon": "mace", "armor": "chain-mail", "shield": true, "abilities": [14, 8, 13, 10, 15, 12], "spells": ["cure-wounds", "healing-word", "bless", "sanctuary", "spiritual-weapon", "hold-person", "dispel-magic", "find-traps"]},
	"druid": {"weapon": "quarterstaff", "armor": "hide-armor", "shield": true, "abilities": [10, 14, 13, 12, 15, 8], "spells": ["cure-wounds", "healing-word", "thunderwave"]},
	"fighter": {"weapon": "longsword", "armor": "chain-mail", "shield": true, "abilities": [15, 13, 14, 10, 12, 8], "spells": ["tremor-stomp", "crushing-cleave", "rallying-stomp"]},
	"monk": {"weapon": "quarterstaff", "armor": "", "shield": false, "abilities": [10, 15, 13, 8, 14, 12], "spells": []},
	"paladin": {"weapon": "longsword", "armor": "chain-mail", "shield": true, "abilities": [15, 8, 13, 10, 12, 14], "spells": ["cure-wounds", "bless"]},
	"ranger": {"weapon": "longbow", "armor": "studded-leather", "shield": false, "abilities": [12, 15, 13, 8, 14, 10], "spells": ["cure-wounds"]},
	"rogue": {"weapon": "shortsword", "armor": "leather-armor", "shield": false, "abilities": [8, 15, 13, 12, 14, 10], "spells": []},
	"sorcerer": {"weapon": "dagger", "armor": "", "shield": false, "abilities": [8, 14, 13, 10, 12, 15], "spells": ["magic-missile", "shield", "burning-hands", "fireball", "lightning-bolt", "haste"]},
	"warlock": {"weapon": "dagger", "armor": "leather-armor", "shield": false, "abilities": [8, 14, 13, 12, 10, 15], "spells": ["hold-person", "invisibility"]},
	"wizard": {"weapon": "quarterstaff", "armor": "", "shield": false, "abilities": [8, 14, 13, 15, 12, 10], "spells": ["magic-missile", "shield", "sleep", "burning-hands", "thunderwave", "mage-armor", "invisibility", "hold-person", "fireball", "lightning-bolt", "haste", "counterspell", "dispel-magic", "blizzard", "stinking-cloud", "see-invisibility", "knock"]},
}

var content: Dictionary = {}
var scenario: Dictionary = {}
var actors: Dictionary = {}
var order: Array = []
var round_num: int = 0
var turn_index: int = -1
var current_actor: String = ""
var status: String = "idle"
var outcome: String = ""
var max_rounds: int = 30
var events: Array = []
var violations: Array = []
var coverage: Dictionary = {"content": {}, "rules": {}}
var traps: Dictionary = {}
var map_size := Vector2.ZERO  # feet; ZERO means unbounded
## Blockout collision grid from robos-crpg-blockout (5-ft cells). Empty = open field.
var grid_active := false
var cells_blocked := {}
var cells_opaque := {}
var cells_difficult := {}
var cells_cover := {}  # Vector2i -> "half" | "three-quarters"
var map_info := {}
var _in_run := false
## When true, events are still recorded and audited but not broadcast (replays, fuzz batches)
var quiet := false

func _ready() -> void:
	_load_content()

# ─────────────────────────────────────────────────────────────────────────────
# Content
# ─────────────────────────────────────────────────────────────────────────────

func _load_content() -> void:
	for kind in CONTENT_KINDS:
		content[kind] = {}
		var f := FileAccess.open(DATA_DIR + kind + ".json", FileAccess.READ)
		if f == null:
			continue
		var parsed = JSON.parse_string(f.get_as_text())
		if parsed is Array:
			for rec in parsed:
				if rec is Dictionary and rec.has("id"):
					content[kind][str(rec["id"])] = rec

func content_ids() -> Dictionary:
	var out := {}
	for kind in CONTENT_KINDS:
		out[kind] = content.get(kind, {}).keys()
	return out

# ─────────────────────────────────────────────────────────────────────────────
# Loading
# ─────────────────────────────────────────────────────────────────────────────

func load_scenario_file(path: String) -> Dictionary:
	var p := path if path.begins_with("res://") else "res://" + path
	var f := FileAccess.open(p, FileAccess.READ)
	if f == null:
		return {"success": false, "errors": ["Scenario file not found: %s" % p]}
	var parsed = JSON.parse_string(f.get_as_text())
	if parsed is Dictionary and parsed.has("@graph"):
		# A KGraph package: take its first robos:CRPGTestScenario node
		for node in parsed["@graph"]:
			if node is Dictionary and "CRPGTestScenario" in str(node.get("@type", "")):
				parsed = node
				break
	if not (parsed is Dictionary):
		return {"success": false, "errors": ["Scenario file is not a JSON object: %s" % p]}
	parsed["source_file"] = p
	return load_scenario(parsed)

func validate(spec: Dictionary) -> Array:
	var errors: Array = []
	var party = spec.get("party", [])
	var enemies = spec.get("enemies", [])
	var allies_spec = spec.get("allies", [])
	if allies_spec is Array:
		enemies = (enemies if enemies is Array else []) + allies_spec
	if not (party is Array) or party.is_empty():
		errors.append("Scenario needs a non-empty 'party' list")
		party = []
	if not (enemies is Array):
		errors.append("'enemies' must be a list")
		enemies = []
	var seen := {}
	var idx := 0
	for p in party:
		idx += 1
		if not (p is Dictionary):
			errors.append("party[%d] must be an object" % idx)
			continue
		var cls := str(p.get("class", "fighter"))
		var race := str(p.get("race", "human"))
		if not content["classes"].has(cls):
			errors.append("party[%d]: unknown class '%s'" % [idx, cls])
		if not content["races"].has(race):
			errors.append("party[%d]: unknown race '%s'" % [idx, race])
		for key in ["weapon", "armor"]:
			var item_id := str(p.get(key, ""))
			if item_id != "" and not content["items"].has(item_id):
				errors.append("party[%d]: unknown %s '%s'" % [idx, key, item_id])
		for s in p.get("spells", []):
			if not content["spells"].has(str(s)):
				errors.append("party[%d]: unknown spell '%s'" % [idx, s])
		for acc in p.get("accessories", []):
			if not content["items"].has(str(acc)):
				errors.append("party[%d]: unknown accessory '%s'" % [idx, acc])
		for it in p.get("inventory", []):
			if not content["items"].has(str(it)):
				errors.append("party[%d]: unknown item '%s'" % [idx, it])
		var lvl := int(p.get("level", 1))
		if lvl < 1 or lvl > 20:
			errors.append("party[%d]: level must be 1-20" % idx)
		var pid := str(p.get("id", ""))
		if pid != "":
			if seen.has(pid):
				errors.append("duplicate actor id '%s'" % pid)
			seen[pid] = true
	idx = 0
	for e in enemies:
		idx += 1
		if not (e is Dictionary):
			errors.append("enemies[%d] must be an object" % idx)
			continue
		var mid := str(e.get("monster", ""))
		if mid == "" and not e.has("attacks"):
			errors.append("enemies[%d]: give a 'monster' id or a custom stat block with 'attacks'" % idx)
		elif mid != "" and not content["monsters"].has(mid):
			errors.append("enemies[%d]: unknown monster '%s'" % [idx, mid])
		for s in e.get("spells", []):
			if not content["spells"].has(str(s)):
				errors.append("enemies[%d]: unknown spell '%s'" % [idx, s])
		var eid := str(e.get("id", ""))
		if eid != "" and int(e.get("count", 1)) <= 1:
			if seen.has(eid):
				errors.append("duplicate actor id '%s'" % eid)
			seen[eid] = true
	for a in [party, enemies]:
		for x in a:
			if x is Dictionary:
				for c in x.get("conditions", []):
					var cid := str(c.get("id", c) if c is Dictionary else c)
					if not _known_condition(cid):
						errors.append("unknown condition '%s'" % cid)
	var m = spec.get("map", {})
	if m is Dictionary and m.has("width"):
		var w := float(m.get("width", 0))
		var h := float(m.get("height", 0))
		if w <= 0 or h <= 0:
			errors.append("map width and height must be positive (feet)")
		else:
			for side in [party, enemies]:
				for x in side:
					if x is Dictionary and (float(x.get("x", 0)) < 0 or float(x.get("x", 0)) > w or float(x.get("y", 0)) < 0 or float(x.get("y", 0)) > h):
						errors.append("%s starts outside the %dx%d ft map" % [str(x.get("id", x.get("monster", "?"))), int(w), int(h)])
	if m is Dictionary and not m.get("mapObjects", []).is_empty() and not (m.get("blockout", {}) is Dictionary and m.get("blockout", {}).has("blocked")):
		errors.append("map '%s' has objects but no blockout grid; run: python3 -m robos_crpg_blockout build maps/<map>.jsonld" % str(m.get("title", m.get("@id", "?"))))
	elif m is Dictionary and m.get("blockout", {}) is Dictionary and m.get("blockout", {}).has("blocked"):
		var blocked_cells := {}
		for c in m["blockout"]["blocked"]:
			blocked_cells[Vector2i(int(c[0]), int(c[1]))] = true
		for side in [party, enemies]:
			for x in side:
				if x is Dictionary and int(x.get("count", 1)) <= 1:
					var cell := Vector2i(int(floor(float(x.get("x", 0)) / 5.0)), int(floor(float(x.get("y", 0)) / 5.0)))
					if blocked_cells.has(cell):
						errors.append("%s starts inside a wall or obstacle (cell %d,%d)" % [str(x.get("id", x.get("monster", "?"))), cell.x, cell.y])
	for dv in spec.get("directives", []):
		if not (dv is Dictionary):
			errors.append("directives must be objects")
			continue
		var ctl := str(dv.get("controller", "infinity_ai"))
		if not (ctl in ["infinity_ai", "scripted", "idle"]):
			errors.append("directive controller must be infinity_ai, scripted or idle (got '%s')" % ctl)
		if str(dv.get("side", "")) != "" and not (str(dv.get("side", "")) in ["party", "enemy", "all"]):
			errors.append("directive side must be party, enemy or all")
		for inp in dv.get("inputs", []):
			if not (inp is Dictionary) or not (str(inp.get("type", "")) in ["attack", "cast", "use_item", "move", "dodge", "disengage", "search", "disarm", "wait"]):
				errors.append("unknown player input %s" % str(inp))
	for t in spec.get("traps", []):
		if not (t is Dictionary) or not content["traps"].has(str(t.get("trap", ""))):
			errors.append("unknown trap '%s'" % (str(t.get("trap", "")) if t is Dictionary else str(t)))
	return errors

func _load_grid(m) -> void:
	grid_active = false
	cells_blocked = {}
	cells_opaque = {}
	cells_difficult = {}
	cells_cover = {}
	map_info = {}
	if not (m is Dictionary):
		return
	map_info = {"id": str(m.get("@id", "")), "title": str(m.get("title", "")), "width": float(m.get("width", 0)),
		"height": float(m.get("height", 0)), "background": str(m.get("backgroundImage", ""))}
	var g = m.get("blockout", {})
	if not (g is Dictionary) or not g.has("blocked"):
		return
	grid_active = true
	for c in g.get("blocked", []):
		cells_blocked[Vector2i(int(c[0]), int(c[1]))] = true
	for c in g.get("opaque", []):
		cells_opaque[Vector2i(int(c[0]), int(c[1]))] = true
	for c in g.get("difficult", []):
		cells_difficult[Vector2i(int(c[0]), int(c[1]))] = true
	var cov = g.get("cover", {})
	for c in cov.get("half", []):
		cells_cover[Vector2i(int(c[0]), int(c[1]))] = "half"
	for c in cov.get("three-quarters", []):
		cells_cover[Vector2i(int(c[0]), int(c[1]))] = "three-quarters"
	_cov_rule("map.blockout_loaded")

func cell_of(p: Vector2) -> Vector2i:
	return Vector2i(int(floor(p.x / 5.0)), int(floor(p.y / 5.0)))

func _cells_between(from: Vector2, to: Vector2) -> Array:
	# Cells crossed by the line between two creatures' cell centres (endpoints excluded)
	var c0 := cell_of(from)
	var c1 := cell_of(to)
	var a := Vector2(c0) * 5.0 + Vector2(2.5, 2.5)
	var b := Vector2(c1) * 5.0 + Vector2(2.5, 2.5)
	var n := int(ceil(a.distance_to(b) / 0.5))
	var out := []
	var seen := {}
	for i in range(1, n):
		var p := a.lerp(b, float(i) / float(n))
		var c := cell_of(p)
		if c != c0 and c != c1 and not seen.has(c):
			seen[c] = true
			out.append(c)
	return out

func has_los(from: Vector2, to: Vector2) -> bool:
	if not grid_active:
		return true
	for c in _cells_between(from, to):
		if cells_opaque.has(c):
			return false
	return true

func cover_between(from: Vector2, to: Vector2) -> String:
	if not grid_active:
		return "none"
	var best := "none"
	for c in _cells_between(from, to):
		var cv := str(cells_cover.get(c, "none"))
		if cv == "three-quarters":
			return cv
		if cv == "half":
			best = "half"
	return best

func _cell_passable(c: Vector2i) -> bool:
	if cells_blocked.has(c) or c.x < 0 or c.y < 0:
		return false
	if map_size != Vector2.ZERO and (c.x * 5 > map_size.x or c.y * 5 > map_size.y):
		return false
	return true

## Dijkstra over the 5-ft grid: 8-way moves, no cutting corners past walls,
## difficult terrain costs double, hostile creatures can't be moved through.
## Returns {"dest": Vector2, "cost": float, "path": Array} limited by `budget` feet.
func _grid_path(a: Dictionary, from: Vector2, to: Vector2, budget: float) -> Dictionary:
	var start := cell_of(from)
	var goal := cell_of(to)
	var hostile := {}
	var occupied := {}
	for id in actors:
		var o: Dictionary = actors[id]
		if id == a["id"] or o["dead"]:
			continue
		occupied[cell_of(o["pos"])] = true
		if o["side"] != a["side"]:
			hostile[cell_of(o["pos"])] = true
	var cost := {start: 0.0}
	var prev := {}
	var frontier := [start]
	while not frontier.is_empty():
		var best_i := 0
		for i in range(frontier.size()):
			if cost[frontier[i]] < cost[frontier[best_i]]:
				best_i = i
		var cur: Vector2i = frontier[best_i]
		frontier.remove_at(best_i)
		for dx in [-1, 0, 1]:
			for dy in [-1, 0, 1]:
				if dx == 0 and dy == 0:
					continue
				var nb := cur + Vector2i(dx, dy)
				if not _cell_passable(nb) or hostile.has(nb):
					continue
				if dx != 0 and dy != 0 and (not _cell_passable(cur + Vector2i(dx, 0)) or not _cell_passable(cur + Vector2i(0, dy))):
					continue
				var step := 10.0 if cells_difficult.has(nb) else 5.0
				var c2: float = cost[cur] + step
				if not cost.has(nb) or c2 < cost[nb]:
					cost[nb] = c2
					prev[nb] = cur
					if not (nb in frontier):
						frontier.append(nb)
	# Head for the reachable free cell closest to the goal (the goal itself when it's free)
	var target := start
	var best_key := Vector2(INF, INF)
	for c in cost:
		if c != start and occupied.has(c):
			continue
		var gd := float(max(abs(c.x - goal.x), abs(c.y - goal.y)))
		var key := Vector2(gd, cost[c])
		if key.x < best_key.x or (key.x == best_key.x and key.y < best_key.y):
			best_key = key
			target = c
	if target != goal:
		_cov_rule("move.goal_blocked_nearest_cell")
	var path := [target]
	while path[0] != start:
		path.push_front(prev[path[0]])
	# Walk the path until the movement budget runs out, never stopping on an occupied cell
	var reach_i := 0
	for i in range(1, path.size()):
		if cost[path[i]] > budget + 0.001:
			_cov_rule("move.limited_by_speed")
			break
		reach_i = i
		if cells_difficult.has(path[i]):
			_cov_rule("move.difficult_terrain")
	while reach_i > 0 and occupied.has(path[reach_i]):
		reach_i -= 1
	if path.size() > 2 or target != goal:
		_cov_rule("move.pathfinding")
	var dest_cell: Vector2i = path[reach_i]
	return {"dest": Vector2(dest_cell) * 5.0, "cost": cost[dest_cell], "path": path.slice(0, reach_i + 1).map(func(c): return [c.x * 5, c.y * 5])}

func _known_condition(cid: String) -> bool:
	if content["status_effects"].has(cid):
		return true
	return cid in ["shielded", "mage_armor", "blessed", "hasted", "dodging", "rallied"]

## Key aliases so a robos:CRPGTestScenario JSON-LD node loads as-is.
const KEY_ALIASES := {
	"title": "name", "characterClass": "class", "actorId": "id", "hitPoints": "hp", "maxHitPoints": "max_hp",
	"armorClass": "ac", "maxRounds": "max_rounds", "scriptedInputs": "inputs", "trapType": "trap",
	"conditionImmunities": "condition_immunities", "damageResistances": "resistances",
	"damageImmunities": "immunities", "damageVulnerabilities": "vulnerabilities", "saveBonuses": "saves",
}

## Accepts plain engine JSON or a KGraph JSON-LD node: strips namespace prefixes
## (robos:, dcterms:, schema:), maps aliases and unpacks robos:position.
func normalize(v):
	if v is Array:
		var out := []
		for x in v:
			out.append(normalize(x))
		return out
	if not (v is Dictionary):
		return v
	var d := {}
	for k in v:
		var key := str(k)
		if key.begins_with("@"):
			d[key] = v[k]
			continue
		var colon := key.find(":")
		if colon >= 0:
			key = key.substr(colon + 1)
		key = str(KEY_ALIASES.get(key, key))
		d[key] = normalize(v[k])
	if d.has("position") and d["position"] is Array and d["position"].size() >= 2:
		d["x"] = float(d["position"][0])
		d["y"] = float(d["position"][1])
		d.erase("position")
	if d.has("gameState") and d["gameState"] is Dictionary:
		for k2 in d["gameState"]:
			if not d.has(k2):
				d[k2] = d["gameState"][k2]
		d.erase("gameState")
	return d

## A scenario's map can be inline or a reference ({"@id": "urn:robos:crpg:battle-map:<slug>"})
## to a robos:CRPGBattleMap node in res://maps/<slug>.jsonld built by robos-crpg-blockout.
func _resolve_map(spec: Dictionary) -> String:
	var m = spec.get("map", {})
	if not (m is Dictionary) or not m.has("@id") or m.has("width"):
		return ""
	var ref := str(m["@id"])
	var slug := ref.get_slice(":", ref.get_slice_count(":") - 1)
	var path := "res://maps/%s.jsonld" % slug
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return "map '%s' not found (expected %s)" % [ref, path]
	var parsed = JSON.parse_string(f.get_as_text())
	if not (parsed is Dictionary):
		return "map file %s is not a JSON object" % path
	spec["map"] = normalize(parsed)
	return ""

func load_scenario(raw_spec: Dictionary) -> Dictionary:
	var spec: Dictionary = normalize(raw_spec)
	var map_error := _resolve_map(spec)
	if map_error != "":
		return {"success": false, "errors": [map_error]}
	var errors := validate(spec)
	if not errors.is_empty():
		return {"success": false, "errors": errors}
	scenario = spec.duplicate(true)
	actors.clear()
	order.clear()
	events.clear()
	violations.clear()
	traps.clear()
	round_num = 0
	turn_index = -1
	current_actor = ""
	outcome = ""
	status = "active"
	max_rounds = int(spec.get("max_rounds", 30))
	map_size = Vector2.ZERO
	if spec.get("map", {}) is Dictionary and spec.get("map", {}).has("width"):
		map_size = Vector2(float(spec["map"]["width"]), float(spec["map"]["height"]))
	_load_grid(spec.get("map", {}))
	Dice.reseed(int(spec.get("seed", 1)))
	if spec.has("dice"):
		Dice.force(spec["dice"])

	var i := 0
	for p in spec.get("party", []):
		i += 1
		var a := _build_pc(p, i)
		actors[a["id"]] = a
	i = 0
	for e in spec.get("enemies", []):
		var count := int(e.get("count", 1))
		for n in range(count):
			i += 1
			var a := _build_monster(e, i, n, count)
			actors[a["id"]] = a
	# NPC allies fight on the party's side, steered by the Infinity AI like anyone else
	for e in spec.get("allies", []):
		var count2 := int(e.get("count", 1))
		for n in range(count2):
			i += 1
			var e2: Dictionary = e.duplicate()
			e2["side"] = "party"
			var a2 := _build_monster(e2, i, n, count2)
			a2["kind"] = "npc"
			actors[a2["id"]] = a2
	for t in spec.get("traps", []):
		var trap_def: Dictionary = content["traps"][str(t["trap"])]
		var tid := str(t.get("id", "trap_%d" % (traps.size() + 1)))
		traps[tid] = {
			"id": tid, "trap": trap_def["id"], "pos": Vector2(float(t.get("x", 30)), float(t.get("y", 0))),
			"detected": bool(t.get("detected", false)), "disarmed": false, "triggered": false,
			"hidden": not bool(t.get("detected", false)),
		}
		_cov_content("traps", trap_def["id"])

	var overlap := []
	var ids := actors.keys()
	for x in range(ids.size()):
		for y in range(x + 1, ids.size()):
			if dist(actors[ids[x]]["pos"], actors[ids[y]]["pos"]) < 5.0:
				overlap.append("%s and %s start on the same square (%s)" % [ids[x], ids[y], str(actors[ids[x]]["pos"])])
	if not overlap.is_empty():
		status = "idle"
		actors.clear()
		return {"success": false, "errors": overlap}
	_emit("scenario_loaded", {
		"name": str(spec.get("name", "Unnamed scenario")),
		"seed": Dice.seed_value,
		"party": _ids_on_side("party"),
		"enemies": _ids_on_side("enemy"),
		"text": "Scenario '%s' loaded (seed %d)" % [str(spec.get("name", "Unnamed scenario")), Dice.seed_value],
	})
	_roll_initiative()
	var summary := {"success": true, "name": str(spec.get("name", "")), "seed": Dice.seed_value, "actors": actors.size(), "order": order.duplicate()}
	if not quiet:
		scenario_loaded.emit(summary)
	return summary

func _build_pc(p: Dictionary, index: int) -> Dictionary:
	var cls := str(p.get("class", "fighter"))
	var race := str(p.get("race", "human"))
	var level := int(p.get("level", 1))
	var kit: Dictionary = CLASS_KITS.get(cls, CLASS_KITS["fighter"])
	var abilities := {}
	if p.has("abilities") and p["abilities"] is Dictionary:
		for ab in ABILITIES:
			abilities[ab] = int(p["abilities"].get(ab, 10))
	else:
		var arr: Array = kit["abilities"]
		for k in range(6):
			abilities[ABILITIES[k]] = int(arr[k])
		var race_def: Dictionary = content["races"].get(race, {})
		var bonuses = race_def.get("abilityBonuses", {})
		for ab in bonuses:
			abilities[ab] = int(abilities.get(ab, 10)) + int(bonuses[ab])
	var class_def: Dictionary = content["classes"].get(cls, {})
	var hit_die := int(str(class_def.get("hitDie", "d8")).replace("d", ""))
	var con_mod := _mod(abilities["CON"])
	var max_hp := hit_die + con_mod + (level - 1) * (hit_die / 2 + 1 + con_mod)
	max_hp = max(1, max_hp)
	var prof := 2 + (level - 1) / 4
	var weapon_id := str(p.get("weapon", kit["weapon"]))
	var armor_id := str(p.get("armor", kit["armor"]))
	var shield := bool(p.get("shield", kit["shield"]))
	var race_def2: Dictionary = content["races"].get(race, {})
	var a := {
		"id": str(p.get("id", "%s_%d" % [cls, index])),
		"name": str(p.get("name", "%s %s" % [race.capitalize(), cls.capitalize()])),
		"side": "party",
		"kind": "pc",
		"class": cls,
		"race": race,
		"level": level,
		"creature_type": "humanoid",
		"abilities": abilities,
		"prof": prof,
		"max_hp": int(p.get("max_hp", p.get("hp", max_hp))),
		"hp": int(p.get("hp", p.get("max_hp", max_hp))),
		"speed": int(p.get("speed", race_def2.get("speed", 30))),
		"weapon": weapon_id,
		"armor": armor_id,
		"shield": shield,
		"save_profs": class_def.get("savingThrows", []),
		"spells": p.get("spells", kit["spells"]).duplicate(),
		"slots": {},
		"resources": {"maneuver": 3 if cls == "fighter" else 0},
		"inventory": p.get("inventory", []).duplicate(),
		"conditions": {},
		"resistances": p.get("resistances", []).duplicate(),
		"immunities": p.get("immunities", []).duplicate(),
		"vulnerabilities": p.get("vulnerabilities", []).duplicate(),
		"condition_immunities": p.get("condition_immunities", []).duplicate(),
		"pos": Vector2(float(p.get("x", 10)), float(p.get("y", (index - 1) * 10))),
		"dead": false,
		"stable": false,
		"death_saves": {"success": 0, "failure": 0},
		"ai": str(p.get("ai", "default")),
		"portrait": "res://assets/portraits/portrait_%s.png" % cls,
		"attacks_per_action": 2 if (cls in EXTRA_ATTACK_CLASSES and level >= 5) else 1,
		"sneak_attack_dice": ((level + 1) / 2) if cls == "rogue" else 0,
		"base_ac_override": int(p.get("ac", -1)),
	}
	# Spell slots
	var slots := {}
	if cls in FULL_CASTERS:
		var row: Array = FULL_CASTER_SLOTS[min(level, 10) - 1]
		for k in range(row.size()):
			slots[str(k + 1)] = int(row[k])
	elif cls in HALF_CASTERS:
		var row2: Array = HALF_CASTER_SLOTS[min(level, 10) - 1]
		for k in range(row2.size()):
			slots[str(k + 1)] = int(row2[k])
	elif cls == "warlock":
		var pact_level := 1 if level < 3 else (2 if level < 5 else 3)
		slots[str(pact_level)] = 1 if level == 1 else 2
	if p.has("slots") and p["slots"] is Dictionary:
		slots = {}
		for k in p["slots"]:
			slots[str(k)] = int(p["slots"][k])
	a["slots"] = slots
	a["attacks"] = _weapon_attacks(a)
	a["accessories"] = p.get("accessories", []).duplicate()
	for acc in a["accessories"]:
		var item: Dictionary = content["items"].get(str(acc), {})
		for g in item.get("grants", []):
			_add_condition(a, str(g), 100000, {"source": str(acc), "magical": false})
		_cov_content("items", str(acc))
	_apply_initial_conditions(a, p)
	_cov_content("classes", cls)
	_cov_content("races", race)
	if weapon_id != "":
		_cov_content("items", weapon_id)
	if armor_id != "":
		_cov_content("items", armor_id)
	if shield:
		_cov_content("items", "shield")
	return a

func _weapon_attacks(a: Dictionary) -> Array:
	var weapon: Dictionary = content["items"].get(str(a["weapon"]), {})
	var props: Array = weapon.get("properties", [])
	var ranged: bool = str(weapon.get("weaponType", "melee")) == "ranged"
	var str_mod := _mod(a["abilities"]["STR"])
	var dex_mod := _mod(a["abilities"]["DEX"])
	var mod := str_mod
	if ranged:
		mod = dex_mod
	elif "finesse" in props:
		mod = max(str_mod, dex_mod)
	if weapon.is_empty():
		# Unarmed strike (monks use DEX and a d6 in this engine)
		var unarmed_mod: int = max(str_mod, dex_mod) if a["class"] == "monk" else str_mod
		return [{"name": "Unarmed Strike", "bonus": unarmed_mod + int(a["prof"]), "damage": "%s+%d" % ["1d6" if a["class"] == "monk" else "1", unarmed_mod], "type": "bludgeoning", "reach": 5, "range": 0, "ranged": false, "finesse": a["class"] == "monk"}]
	var dice := str(weapon.get("damageDice", "1d4"))
	return [{
		"name": str(weapon.get("title", weapon.get("id", "Weapon"))),
		"item": str(weapon.get("id", "")),
		"bonus": mod + int(a["prof"]),
		"damage": "%s%s%d" % [dice, "+" if mod >= 0 else "-", abs(mod)],
		"type": str(weapon.get("damageType", "slashing")),
		"reach": 5,
		"range": int(weapon.get("rangeFeet", 0)) if ranged else 0,
		"ranged": ranged,
		"finesse": "finesse" in props,
	}]

func _build_monster(e: Dictionary, index: int, n: int, count: int) -> Dictionary:
	var mid := str(e.get("monster", ""))
	var base: Dictionary = content["monsters"].get(mid, {})
	var abilities := {}
	var src_ab = e.get("abilities", base.get("abilities", {}))
	for ab in ABILITIES:
		abilities[ab] = int(src_ab.get(ab, 10))
	var attacks: Array = []
	for atk in e.get("attacks", base.get("attacks", [])):
		var rng_ft := int(atk.get("range", 5))
		attacks.append({
			"name": str(atk.get("name", "Attack")),
			"bonus": int(atk.get("attackBonus", atk.get("bonus", 3))),
			"damage": str(atk.get("damage", "1d6")),
			"type": str(atk.get("damageType", atk.get("type", "bludgeoning"))),
			"reach": 5 if rng_ft <= 10 else 0,
			"range": rng_ft if rng_ft > 10 else 0,
			"ranged": rng_ft > 10,
			"finesse": false,
		})
	var base_id := str(e.get("id", mid if mid != "" else "enemy"))
	var aid := base_id if count == 1 else "%s_%d" % [base_id, n + 1]
	var hp := int(e.get("hp", base.get("hitPoints", 10)))
	var a := {
		"id": aid,
		"name": str(e.get("name", base.get("title", aid))) + ("" if count == 1 else " %d" % (n + 1)),
		"side": str(e.get("side", "enemy")),
		"kind": "monster",
		"monster": mid,
		"class": "",
		"race": "",
		"level": 1,
		"creature_type": str(e.get("creature_type", base.get("creatureType", "humanoid"))),
		"abilities": abilities,
		"prof": int(e.get("prof", 2)),
		"max_hp": int(e.get("max_hp", hp)),
		"hp": hp,
		"speed": int(e.get("speed", base.get("speed", 30))),
		"weapon": "",
		"armor": "",
		"shield": false,
		"save_profs": e.get("save_profs", []),
		"save_bonuses": e.get("saves", {}),
		"spells": e.get("spells", []).duplicate(),
		"slots": {},
		"resources": {"maneuver": 0},
		"inventory": e.get("inventory", []).duplicate(),
		"conditions": {},
		"resistances": e.get("resistances", base.get("damageResistances", [])).duplicate(),
		"immunities": e.get("immunities", base.get("damageImmunities", [])).duplicate(),
		"vulnerabilities": e.get("vulnerabilities", base.get("damageVulnerabilities", [])).duplicate(),
		"condition_immunities": e.get("condition_immunities", base.get("conditionImmunities", [])).duplicate(),
		"pos": Vector2(float(e.get("x", 60)) + (n % 3) * 10.0, float(e.get("y", (index - 1) * 10)) + (n / 3) * 10.0),
		"dead": false,
		"stable": false,
		"death_saves": {"success": 0, "failure": 0},
		"ai": str(e.get("ai", "default")),
		"portrait": str(e.get("token", base.get("token", "res://assets/sprites/enemies/skeleton.png"))),
		"attacks": attacks,
		"attacks_per_action": int(e.get("attacks_per_action", 1)),
		"sneak_attack_dice": 0,
		"base_ac_override": int(e.get("ac", base.get("armorClass", 12))),
		"casting_ability": str(e.get("casting_ability", "INT")),
	}
	if e.has("slots") and e["slots"] is Dictionary:
		for k in e["slots"]:
			a["slots"][str(k)] = int(e["slots"][k])
	elif not a["spells"].is_empty():
		a["slots"] = {"1": 4, "2": 3, "3": 2}
	_apply_initial_conditions(a, e)
	if mid != "":
		_cov_content("monsters", mid)
	return a

func _apply_initial_conditions(a: Dictionary, spec: Dictionary) -> void:
	for c in spec.get("conditions", []):
		if c is Dictionary:
			_add_condition(a, str(c.get("id", "")), int(c.get("rounds", 100)), {"source": str(c.get("source", "scenario")), "magical": bool(c.get("magical", false))})
		else:
			_add_condition(a, str(c), 100, {"source": "scenario"})

func _ids_on_side(side: String) -> Array:
	var out := []
	for id in actors:
		if actors[id]["side"] == side:
			out.append(id)
	return out

func _roll_initiative() -> void:
	var rolls := []
	for id in actors:
		var a: Dictionary = actors[id]
		var d := Dice.roll(20, "initiative:%s" % id)
		var total := d + _mod(a["abilities"]["DEX"])
		a["initiative"] = total
		rolls.append({"actor": id, "d20": d, "seq": Dice.last_seq(), "dex_mod": _mod(a["abilities"]["DEX"]), "total": total})
	var ids := actors.keys()
	ids.sort_custom(func(x, y):
		var ax: Dictionary = actors[x]
		var ay: Dictionary = actors[y]
		if ax["initiative"] != ay["initiative"]:
			return ax["initiative"] > ay["initiative"]
		if ax["abilities"]["DEX"] != ay["abilities"]["DEX"]:
			return ax["abilities"]["DEX"] > ay["abilities"]["DEX"]
		if ax["side"] != ay["side"]:
			return ax["side"] == "party"
		return str(x) < str(y))
	order = ids
	_cov_rule("initiative")
	_emit("initiative", {"rolls": rolls, "order": order.duplicate(), "text": "Initiative: " + ", ".join(order.map(func(x): return "%s (%d)" % [actors[x]["name"], actors[x]["initiative"]]))})

# ─────────────────────────────────────────────────────────────────────────────
# Derived stats
# ─────────────────────────────────────────────────────────────────────────────

func _mod(score) -> int:
	return int(floor((float(score) - 10.0) / 2.0))

func ability_mod(a: Dictionary, ab: String) -> int:
	return _mod(a["abilities"].get(ab, 10))

func base_ac(a: Dictionary) -> int:
	if a["kind"] == "monster":
		return int(a["base_ac_override"])
	if int(a.get("base_ac_override", -1)) > 0:
		return int(a["base_ac_override"])
	var dex := ability_mod(a, "DEX")
	var ac := 10 + dex
	var armor: Dictionary = content["items"].get(str(a["armor"]), {})
	if not armor.is_empty():
		var t := str(armor.get("armorType", "light"))
		var arm := int(armor.get("acBonus", 11))
		if t == "light":
			ac = arm + dex
		elif t == "medium":
			ac = arm + min(dex, 2)
		else:
			ac = arm
	elif a["class"] == "barbarian":
		ac = 10 + dex + ability_mod(a, "CON")
	elif a["class"] == "monk":
		ac = 10 + dex + ability_mod(a, "WIS")
	if has_condition(a, "mage_armor") and armor.is_empty():
		ac = max(ac, 13 + dex)
	if a["shield"]:
		ac += 2
	for acc in a.get("accessories", []):
		ac += int(content["items"].get(str(acc), {}).get("acBonus", 0))
	return ac

func effective_ac(a: Dictionary) -> Dictionary:
	var ac := base_ac(a)
	var sources := []
	if has_condition(a, "shielded"):
		ac += 5
		sources.append("shield +5")
	if has_condition(a, "hasted"):
		ac += 2
		sources.append("haste +2")
	if has_condition(a, "rallied"):
		ac += 2
		sources.append("rallied +2")
	return {"ac": ac, "sources": sources}

func casting_ability(a: Dictionary) -> String:
	if a["kind"] == "monster":
		return str(a.get("casting_ability", "INT"))
	return str(CASTING_ABILITY.get(a["class"], "INT"))

func spell_dc(a: Dictionary) -> int:
	return 8 + int(a["prof"]) + ability_mod(a, casting_ability(a))

func spell_attack_bonus(a: Dictionary) -> int:
	return int(a["prof"]) + ability_mod(a, casting_ability(a))

func save_bonus(a: Dictionary, ab: String) -> int:
	if a.has("save_bonuses") and a["save_bonuses"] is Dictionary and a["save_bonuses"].has(ab):
		return int(a["save_bonuses"][ab])
	var b := ability_mod(a, ab)
	if ab in a.get("save_profs", []):
		b += int(a["prof"])
	return b

# ─────────────────────────────────────────────────────────────────────────────
# Conditions
# ─────────────────────────────────────────────────────────────────────────────

func has_condition(a: Dictionary, cid: String) -> bool:
	return a["conditions"].has(cid)

func is_down(a: Dictionary) -> bool:
	return a["dead"] or int(a["hp"]) <= 0

func is_incapacitated(a: Dictionary) -> bool:
	for c in INCAPACITATING:
		if has_condition(a, c):
			return true
	return false

func can_act(a: Dictionary) -> bool:
	return not is_down(a) and not is_incapacitated(a)

func can_see(viewer: Dictionary, target: Dictionary) -> bool:
	if has_condition(viewer, "blinded"):
		return false
	if has_condition(target, "invisible") and not has_condition(viewer, "see_invisibility"):
		return false
	return true

func _add_condition(a: Dictionary, cid: String, rounds: int, extra: Dictionary = {}) -> bool:
	if cid == "":
		return false
	if cid in a.get("condition_immunities", []):
		_cov_rule("condition.immune")
		_emit("condition_immune", {"target": a["id"], "condition": cid, "text": "%s is immune to %s" % [a["name"], cid]})
		return false
	var rec := {"rounds": rounds}
	rec.merge(extra, true)
	a["conditions"][cid] = rec
	_cov_content("status_effects", cid)
	_emit("condition_applied", {"target": a["id"], "condition": cid, "rounds": rounds, "source": str(extra.get("source", "")), "text": "%s is now %s" % [a["name"], cid]})
	return true

func _remove_condition(a: Dictionary, cid: String, reason: String) -> void:
	if a["conditions"].has(cid):
		a["conditions"].erase(cid)
		_emit("condition_removed", {"target": a["id"], "condition": cid, "reason": reason, "text": "%s is no longer %s (%s)" % [a["name"], cid, reason]})

# ─────────────────────────────────────────────────────────────────────────────
# Public actions
# ─────────────────────────────────────────────────────────────────────────────

## Resolves one action for an actor. `action.type` is one of: attack, cast,
## use_item, move, dodge, disengage, search, disarm, wait.
func act(actor_id: String, action: Dictionary) -> Dictionary:
	if status != "active":
		return {"success": false, "reason": "scenario_not_active", "status": status}
	if not actors.has(actor_id):
		return {"success": false, "reason": "unknown_actor", "actor": actor_id}
	var a: Dictionary = actors[actor_id]
	var t := str(action.get("type", "wait"))
	if t != "move" and not can_act(a):
		_cov_rule("action.refused_incapacitated")
		return _refuse(a, t, "incapacitated" if not is_down(a) else "down")
	if t == "move" and (not can_act(a)):
		_cov_rule("action.refused_incapacitated")
		return _refuse(a, t, "incapacitated" if not is_down(a) else "down")
	var res: Dictionary
	match t:
		"attack":
			res = _action_attack(a, action)
		"cast":
			res = _action_cast(a, action)
		"use_item":
			res = _action_use_item(a, action)
		"move":
			res = _action_move(a, _vec(action.get("to", [a["pos"].x, a["pos"].y])), bool(action.get("disengage", false)))
		"dodge":
			_add_condition(a, "dodging", 1, {"source": "dodge", "until": "start_of_turn"})
			_cov_rule("action.dodge")
			res = {"success": true, "action": "dodge"}
		"disengage":
			a["disengaged"] = true
			_cov_rule("action.disengage")
			_emit("disengage", {"actor": a["id"], "text": "%s disengages" % a["name"]})
			res = {"success": true, "action": "disengage"}
		"search":
			res = _action_search(a)
		"disarm":
			res = _action_disarm(a, str(action.get("trap", "")))
		"wait":
			_emit("wait", {"actor": a["id"], "text": "%s waits" % a["name"]})
			res = {"success": true, "action": "wait"}
		_:
			res = _refuse(a, t, "unknown_action")
	_check_end()
	return res

func _refuse(a: Dictionary, action_type: String, reason: String, extra: Dictionary = {}) -> Dictionary:
	var ev := {"actor": a["id"], "action": action_type, "reason": reason, "text": "%s cannot %s: %s" % [a["name"], action_type, reason]}
	ev.merge(extra, true)
	_emit("action_refused", ev)
	var res := {"success": false, "reason": reason, "action": action_type}
	res.merge(extra, true)
	return res

func _vec(v) -> Vector2:
	if v is Vector2:
		return v
	if v is Array and v.size() >= 2:
		return Vector2(float(v[0]), float(v[1]))
	if v is Dictionary:
		return Vector2(float(v.get("x", 0)), float(v.get("y", 0)))
	return Vector2.ZERO

## Two living creatures can't end a move in the same 5-ft square.
func occupied_by(p: Vector2, except_id: String) -> String:
	for id in actors:
		var o: Dictionary = actors[id]
		if id != except_id and not o["dead"] and dist(o["pos"], p) < 5.0:
			return id
	return ""

## Walks back from `to` toward `from` in 5-ft steps until the square is free.
func _free_square_along(a: Dictionary, from: Vector2, to: Vector2) -> Vector2:
	if occupied_by(to, a["id"]) == "":
		return to
	_cov_rule("move.avoided_occupied_square")
	var dir := (from - to)
	var length := dir.length()
	if length <= 0.0:
		return from
	var step := dir / length * 5.0
	var p := to
	for i in range(int(ceil(length / 5.0))):
		p += step
		if occupied_by(p, a["id"]) == "":
			return p
	return from

func clamp_to_map(p: Vector2) -> Vector2:
	if map_size == Vector2.ZERO:
		return p
	if p.x < 0 or p.y < 0 or p.x > map_size.x or p.y > map_size.y:
		_cov_rule("map.clamped")
	return Vector2(clampf(p.x, 0, map_size.x), clampf(p.y, 0, map_size.y))

func dist(a: Vector2, b: Vector2) -> float:
	return max(abs(a.x - b.x), abs(a.y - b.y))

# ─────────────────────────────────────────────────────────────────────────────
# Attacks
# ─────────────────────────────────────────────────────────────────────────────

func _action_attack(a: Dictionary, action: Dictionary) -> Dictionary:
	var tid := str(action.get("target", ""))
	if not actors.has(tid):
		return _refuse(a, "attack", "unknown_target", {"target": tid})
	var t: Dictionary = actors[tid]
	if t["dead"]:
		_cov_rule("attack.refused_dead_target")
		return _refuse(a, "attack", "target_dead", {"target": tid})
	var atk := _pick_attack(a, t, str(action.get("attack", "")))
	if atk.is_empty():
		_cov_rule("attack.refused_out_of_range")
		return _refuse(a, "attack", "out_of_range", {"target": tid, "distance": dist(a["pos"], t["pos"])})
	if not has_los(a["pos"], t["pos"]):
		_cov_rule("los.blocked_attack")
		return _refuse(a, "attack", "no_line_of_sight", {"target": tid})
	if has_condition(a, "charmed") and str(a["conditions"]["charmed"].get("caster", "")) == t["id"]:
		_cov_rule("attack.refused_charmed")
		return _refuse(a, "attack", "charmed", {"target": tid})
	if _sanctuary_blocks(a, t):
		return {"success": false, "reason": "sanctuary", "action": "attack"}
	var results := []
	var n := int(a.get("attacks_per_action", 1))
	if n > 1:
		_cov_rule("attack.extra_attack")
	a["sneak_used"] = bool(a.get("sneak_used", false))
	for i in range(n):
		if t["dead"] or (t["kind"] == "monster" and is_down(t)):
			break
		results.append(resolve_attack(a, t, atk))
	_break_invisibility(a, "attacked")
	_break_sanctuary(a, "attacked")
	return {"success": true, "action": "attack", "attacks": results}

func _pick_attack(a: Dictionary, t: Dictionary, name: String) -> Dictionary:
	var d := dist(a["pos"], t["pos"])
	var fallback := {}
	for atk in a["attacks"]:
		if name != "" and str(atk["name"]).to_lower() != name.to_lower():
			continue
		if not atk["ranged"] and d <= float(atk["reach"]):
			return atk
		if atk["ranged"] and d <= float(atk["range"]):
			fallback = atk
	return fallback

## One attack roll and its damage. Public so reactions (opportunity attacks) reuse it.
func resolve_attack(a: Dictionary, t: Dictionary, atk: Dictionary, opportunity: bool = false) -> Dictionary:
	var d := dist(a["pos"], t["pos"])
	var adv_sources := []
	var dis_sources := []
	for c in ATTACKER_DISADVANTAGE:
		if has_condition(a, c):
			dis_sources.append("attacker %s" % c)
	if has_condition(a, "prone"):
		dis_sources.append("attacker prone")
	for c in TARGET_GRANTS_ADVANTAGE:
		if has_condition(t, c):
			adv_sources.append("target %s" % c)
	if has_condition(t, "prone"):
		if d <= 5:
			adv_sources.append("target prone (within 5 ft)")
		else:
			dis_sources.append("target prone (ranged)")
	if not can_see(a, t):
		dis_sources.append("target unseen")
	if not can_see(t, a):
		adv_sources.append("attacker unseen")
	if has_condition(t, "dodging") and can_see(t, a):
		dis_sources.append("target dodging")
	if atk["ranged"]:
		for other in _hostiles_of(a):
			if can_act(other) and dist(other["pos"], a["pos"]) <= 5:
				dis_sources.append("ranged attack with a hostile within 5 ft")
				_cov_rule("attack.ranged_in_melee")
				break
	var has_adv := adv_sources.size() > 0
	var has_dis := dis_sources.size() > 0
	var r1 := Dice.roll(20, "attack:%s->%s" % [a["id"], t["id"]])
	var s1 := Dice.last_seq()
	var d20 := r1
	var rolls := [{"seq": s1, "v": r1}]
	if has_adv or has_dis:
		var r2 := Dice.roll(20, "attack:%s->%s" % [a["id"], t["id"]])
		rolls.append({"seq": Dice.last_seq(), "v": r2})
		if has_adv and not has_dis:
			d20 = max(r1, r2)
			_cov_rule("attack.advantage")
		elif has_dis and not has_adv:
			d20 = min(r1, r2)
			_cov_rule("attack.disadvantage")
		else:
			_cov_rule("attack.advantage_cancelled")
	var bonus := int(atk["bonus"])
	var bless_roll := {}
	if has_condition(a, "blessed"):
		bless_roll = Dice.roll_formula("1d4", {}, "bless:%s" % a["id"])
		bonus += int(bless_roll["total"])
		_cov_rule("attack.bless")
	var total := d20 + bonus
	var acinfo := effective_ac(t)
	var ac := int(acinfo["ac"])
	var cover := cover_between(a["pos"], t["pos"])
	if cover == "half":
		ac += 2
		acinfo["sources"].append("half cover +2")
		_cov_rule("cover.half")
	elif cover == "three-quarters":
		ac += 5
		acinfo["sources"].append("three-quarters cover +5")
		_cov_rule("cover.three_quarters")
	var fumble := d20 == 1
	var crit := d20 == 20
	var hit := crit or (not fumble and total >= ac)
	# Shield as a reaction: turns a hit into a miss when +5 AC is enough
	var reaction := {}
	if hit and not crit and not has_condition(t, "shielded") and _can_react_with(t, "shield"):
		if total < ac + 5:
			reaction = _cast_reaction(t, "shield", a)
			ac += 5
			acinfo["sources"].append("shield +5")
			hit = total >= ac
	if hit and not crit and d <= 5:
		for c in AUTO_CRIT_WITHIN_5FT:
			if has_condition(t, c):
				crit = true
				_cov_rule("attack.auto_crit_%s" % c)
	if crit:
		_cov_rule("attack.crit")
	elif fumble:
		_cov_rule("attack.fumble")
	elif hit:
		_cov_rule("attack.hit")
	else:
		_cov_rule("attack.miss")
	if opportunity:
		_cov_rule("attack.opportunity")
	var ev := {
		"actor": a["id"], "target": t["id"], "attack": atk["name"], "ranged": atk["ranged"],
		"rolls": rolls, "d20": d20, "bonus": bonus, "bless": bless_roll, "total": total,
		"ac": ac, "ac_sources": acinfo["sources"], "advantage": has_adv and not has_dis,
		"disadvantage": has_dis and not has_adv, "adv_sources": adv_sources, "dis_sources": dis_sources,
		"hit": hit, "crit": crit, "fumble": fumble, "opportunity": opportunity, "shield_reaction": not reaction.is_empty(),
		"text": "%s %s %s with %s: %s (d20 %d + %d = %d vs AC %d)" % [a["name"], "makes an opportunity attack on" if opportunity else "attacks", t["name"], atk["name"], "CRITICAL HIT" if crit else ("HIT" if hit else ("CRITICAL MISS" if fumble else "miss")), d20, bonus, total, ac],
	}
	var attack_ev := _emit("attack", ev)
	_audit_attack(attack_ev)
	var result := {"hit": hit, "crit": crit, "fumble": fumble, "d20": d20, "total": total, "ac": ac, "attack_seq": attack_ev["seq"]}
	if hit:
		var dmg := Dice.roll_formula(str(atk["damage"]), {}, "damage:%s->%s" % [a["id"], t["id"]], crit)
		var extra := []
		# Sneak attack: once per turn with a finesse or ranged weapon, with advantage or an ally next to the target
		if int(a.get("sneak_attack_dice", 0)) > 0 and not bool(a.get("sneak_used", false)) and (atk["ranged"] or atk.get("finesse", false)):
			var ally_adjacent := false
			for ally in _allies_of(a):
				if ally["id"] != a["id"] and can_act(ally) and dist(ally["pos"], t["pos"]) <= 5:
					ally_adjacent = true
			if (has_adv and not has_dis) or (ally_adjacent and not (has_dis and not has_adv)):
				var sneak := Dice.roll_formula("%dd6" % int(a["sneak_attack_dice"]), {}, "sneak_attack:%s" % a["id"], crit)
				extra.append({"source": "sneak_attack", "roll": sneak})
				a["sneak_used"] = true
				_cov_rule("attack.sneak_attack")
		var raw := int(dmg["total"])
		for x in extra:
			raw += int(x["roll"]["total"])
		result["damage"] = apply_damage(t, raw, str(atk["type"]), crit, a["id"], {"roll": dmg, "extra": extra, "attack_seq": attack_ev["seq"]})
	return result

func _hostiles_of(a: Dictionary) -> Array:
	var out := []
	for id in actors:
		var o: Dictionary = actors[id]
		if o["side"] != a["side"] and not o["dead"]:
			out.append(o)
	return out

func _allies_of(a: Dictionary) -> Array:
	var out := []
	for id in actors:
		var o: Dictionary = actors[id]
		if o["side"] == a["side"] and not o["dead"]:
			out.append(o)
	return out

func _sanctuary_blocks(a: Dictionary, t: Dictionary) -> bool:
	if not has_condition(t, "sanctuary") or a["side"] == t["side"]:
		return false
	var rec: Dictionary = t["conditions"]["sanctuary"]
	var dc := int(rec.get("dc", 13))
	var save := roll_save(a, "WIS", dc, "sanctuary")
	if save["success"]:
		_cov_rule("sanctuary.pierced")
		return false
	_cov_rule("sanctuary.blocked")
	_emit("sanctuary_blocked", {"actor": a["id"], "target": t["id"], "save": save, "text": "%s is turned away by %s's Sanctuary" % [a["name"], t["name"]]})
	return true

func _break_invisibility(a: Dictionary, why: String) -> void:
	if has_condition(a, "invisible") and str(a["conditions"]["invisible"].get("source", "")) != "scenario":
		_cov_rule("invisibility.broken")
		_remove_condition(a, "invisible", why)

func _break_sanctuary(a: Dictionary, why: String) -> void:
	if has_condition(a, "sanctuary"):
		_cov_rule("sanctuary.broken")
		_remove_condition(a, "sanctuary", why)

# ─────────────────────────────────────────────────────────────────────────────
# Damage, healing, dying
# ─────────────────────────────────────────────────────────────────────────────

func apply_damage(t: Dictionary, raw: int, dtype: String, crit: bool, source_id: String, details: Dictionary = {}) -> Dictionary:
	var adjusted := raw
	var adjust := "none"
	if dtype in t.get("immunities", []):
		adjusted = 0
		adjust = "immune"
		_cov_rule("damage.immunity")
	elif dtype in t.get("resistances", []):
		adjusted = raw / 2
		adjust = "resistant"
		_cov_rule("damage.resistance")
	elif dtype in t.get("vulnerabilities", []):
		adjusted = raw * 2
		adjust = "vulnerable"
		_cov_rule("damage.vulnerability")
	var hp_before := int(t["hp"])
	var outcome_note := ""
	if hp_before <= 0 and t["kind"] == "pc" and not t["dead"]:
		# Damage while dying: a failed death save (two on a critical hit), or death if massive
		if adjusted > 0:
			t["stable"] = false
			if adjusted >= int(t["max_hp"]):
				_die(t, "massive damage while dying")
				outcome_note = "killed"
			else:
				t["death_saves"]["failure"] += 2 if crit else 1
				_cov_rule("death.damage_while_dying")
				outcome_note = "death save failure"
				if t["death_saves"]["failure"] >= 3:
					_die(t, "three death save failures")
					outcome_note = "killed"
	else:
		var hp_after: int = max(0, hp_before - adjusted)
		t["hp"] = hp_after
		if adjusted > 0:
			_on_damaged(t)
		if hp_after == 0 and hp_before > 0:
			var overflow := adjusted - hp_before
			if t["kind"] == "monster":
				_die(t, "reduced to 0 HP")
				outcome_note = "killed"
			elif overflow >= int(t["max_hp"]):
				_cov_rule("death.massive_damage")
				_die(t, "massive damage")
				outcome_note = "killed"
			else:
				_drop_unconscious(t)
				outcome_note = "unconscious"
	var ev := {
		"target": t["id"], "source": source_id, "raw": raw, "damage_type": dtype, "adjusted": adjusted,
		"adjust": adjust, "crit": crit, "hp_before": hp_before, "hp_after": int(t["hp"]), "result": outcome_note,
		"text": "%s takes %d %s damage%s (%d → %d HP)%s" % [t["name"], adjusted, dtype, "" if adjust == "none" else " (%s)" % adjust, hp_before, int(t["hp"]), "" if outcome_note == "" else " — " + outcome_note],
	}
	ev.merge(details, false)
	var dev := _emit("damage", ev)
	_audit_damage(dev)
	return {"raw": raw, "adjusted": adjusted, "adjust": adjust, "hp_before": hp_before, "hp_after": int(t["hp"]), "result": outcome_note, "seq": dev["seq"]}

func _on_damaged(t: Dictionary) -> void:
	for cid in t["conditions"].keys():
		var rec: Dictionary = t["conditions"][cid]
		if bool(rec.get("ends_on_damage", false)):
			_cov_rule("condition.ends_on_damage")
			_remove_condition(t, cid, "took damage")

func _drop_unconscious(t: Dictionary) -> void:
	t["hp"] = 0
	t["death_saves"] = {"success": 0, "failure": 0}
	t["stable"] = false
	_cov_rule("death.dropped_to_zero")
	_add_condition(t, "unconscious", 1000, {"source": "dying"})
	if not has_condition(t, "prone"):
		_add_condition(t, "prone", 1000, {"source": "dying"})

func _die(t: Dictionary, why: String) -> void:
	t["hp"] = 0
	t["dead"] = true
	_cov_rule("death.died")
	_emit("died", {"target": t["id"], "reason": why, "text": "💀 %s dies (%s)" % [t["name"], why]})

func heal(t: Dictionary, amount: int, source_id: String, details: Dictionary = {}) -> Dictionary:
	if t["dead"]:
		_cov_rule("heal.refused_dead")
		_emit("heal_failed", {"target": t["id"], "source": source_id, "reason": "dead", "text": "%s is dead and can't be healed" % t["name"]})
		return {"healed": 0, "reason": "dead"}
	var before := int(t["hp"])
	var after: int = min(int(t["max_hp"]), before + amount)
	t["hp"] = after
	if before <= 0 and after > 0:
		t["death_saves"] = {"success": 0, "failure": 0}
		t["stable"] = false
		_cov_rule("heal.revived_from_zero")
		if has_condition(t, "unconscious") and str(t["conditions"]["unconscious"].get("source", "")) == "dying":
			_remove_condition(t, "unconscious", "healed")
	_cov_rule("heal.applied")
	var ev := {"target": t["id"], "source": source_id, "amount": amount, "hp_before": before, "hp_after": after,
		"text": "%s regains %d HP (%d → %d)" % [t["name"], after - before, before, after]}
	ev.merge(details, false)
	var hev := _emit("heal", ev)
	_audit_heal(hev)
	return {"healed": after - before, "hp_before": before, "hp_after": after, "seq": hev["seq"]}

func roll_death_save(a: Dictionary) -> Dictionary:
	var d := Dice.roll(20, "death_save:%s" % a["id"])
	var seq := Dice.last_seq()
	var res := "success"
	if d == 20:
		res = "revived"
		a["hp"] = 1
		a["death_saves"] = {"success": 0, "failure": 0}
		_cov_rule("death_save.natural_20")
		if has_condition(a, "unconscious"):
			_remove_condition(a, "unconscious", "natural 20 death save")
	elif d == 1:
		a["death_saves"]["failure"] += 2
		res = "double_failure"
		_cov_rule("death_save.natural_1")
	elif d >= 10:
		a["death_saves"]["success"] += 1
		_cov_rule("death_save.success")
	else:
		a["death_saves"]["failure"] += 1
		res = "failure"
		_cov_rule("death_save.failure")
	_emit("death_save", {"actor": a["id"], "d20": d, "rolls": [{"seq": seq, "v": d}], "result": res, "successes": a["death_saves"]["success"], "failures": a["death_saves"]["failure"],
		"text": "%s death save: %d (%s) — %d successes, %d failures" % [a["name"], d, res, a["death_saves"]["success"], a["death_saves"]["failure"]]})
	if a["death_saves"]["failure"] >= 3:
		_die(a, "three death save failures")
	elif a["death_saves"]["success"] >= 3:
		a["stable"] = true
		_cov_rule("death_save.stabilized")
		_emit("stabilized", {"actor": a["id"], "text": "%s is stable" % a["name"]})
	return {"d20": d, "result": res}

# ─────────────────────────────────────────────────────────────────────────────
# Saving throws
# ─────────────────────────────────────────────────────────────────────────────

func roll_save(a: Dictionary, ab: String, dc: int, purpose: String) -> Dictionary:
	var auto_fail := false
	if ab in ["STR", "DEX"]:
		for c in AUTO_FAIL_STR_DEX:
			if has_condition(a, c):
				auto_fail = true
	var bonus := save_bonus(a, ab)
	var rolls := []
	var d20 := 0
	var has_adv := ab == "DEX" and has_condition(a, "hasted")
	var has_dis := false
	if has_condition(a, "restrained") and ab == "DEX":
		has_dis = true
	var bless := {}
	if auto_fail:
		_cov_rule("save.auto_fail")
	else:
		var r1 := Dice.roll(20, "save:%s:%s" % [purpose, a["id"]])
		rolls.append({"seq": Dice.last_seq(), "v": r1})
		d20 = r1
		if has_adv != has_dis:
			var r2 := Dice.roll(20, "save:%s:%s" % [purpose, a["id"]])
			rolls.append({"seq": Dice.last_seq(), "v": r2})
			d20 = max(r1, r2) if has_adv else min(r1, r2)
			_cov_rule("save.advantage" if has_adv else "save.disadvantage")
		if has_condition(a, "blessed"):
			bless = Dice.roll_formula("1d4", {}, "bless_save:%s" % a["id"])
			bonus += int(bless["total"])
			_cov_rule("save.bless")
	var total := d20 + bonus
	var success := (not auto_fail) and total >= dc
	_cov_rule("save.success" if success else "save.failure")
	var ev := _emit("saving_throw", {"actor": a["id"], "ability": ab, "dc": dc, "rolls": rolls, "d20": d20, "bonus": bonus, "bless": bless,
		"total": total, "success": success, "auto_fail": auto_fail, "purpose": purpose,
		"text": "%s %s save vs DC %d: %s" % [a["name"], ab, dc, "auto-fail" if auto_fail else "%d + %d = %d → %s" % [d20, bonus, total, "success" if success else "failure"]]})
	_audit_save(ev)
	return {"success": success, "total": total, "d20": d20, "auto_fail": auto_fail, "seq": ev["seq"]}

# ─────────────────────────────────────────────────────────────────────────────
# Spells
# ─────────────────────────────────────────────────────────────────────────────

func _spell_level(spell: Dictionary) -> int:
	return int(spell.get("level", 1))

func _action_cast(a: Dictionary, action: Dictionary) -> Dictionary:
	var sid := str(action.get("spell", ""))
	if not content["spells"].has(sid):
		return _refuse(a, "cast", "unknown_spell", {"spell": sid})
	if not (sid in a["spells"]):
		_cov_rule("cast.refused_not_known")
		return _refuse(a, "cast", "spell_not_known", {"spell": sid})
	var spell: Dictionary = content["spells"][sid]
	var mech: Dictionary = spell.get("mechanics", {})
	var kind := str(mech.get("kind", "utility"))
	if kind == "counter":
		_cov_rule("cast.refused_reaction_only")
		return _refuse(a, "cast", "reaction_only", {"spell": sid})
	# Resolve target / point
	var target: Dictionary = {}
	var point: Vector2 = a["pos"]
	var tgt_kind := str(mech.get("target", "creature"))
	var rng_ft := float(mech.get("range", 5))
	if tgt_kind in ["creature", "ally"]:
		var tid := str(action.get("target", a["id"] if tgt_kind == "ally" else ""))
		if not actors.has(tid):
			return _refuse(a, "cast", "unknown_target", {"spell": sid, "target": tid})
		target = actors[tid]
		if target["dead"]:
			return _refuse(a, "cast", "target_dead", {"spell": sid, "target": tid})
		if dist(a["pos"], target["pos"]) > max(rng_ft, 5.0):
			_cov_rule("cast.refused_out_of_range")
			return _refuse(a, "cast", "out_of_range", {"spell": sid, "target": tid})
		if target["id"] != a["id"] and not can_see(a, target):
			_cov_rule("cast.refused_unseen_target")
			return _refuse(a, "cast", "target_unseen", {"spell": sid, "target": tid})
		point = target["pos"]
	elif tgt_kind == "point":
		if action.has("point"):
			point = _vec(action["point"])
		elif action.has("target") and actors.has(str(action["target"])):
			point = actors[str(action["target"])]["pos"]
		else:
			return _refuse(a, "cast", "needs_point", {"spell": sid})
		if dist(a["pos"], point) > max(rng_ft, 5.0) and str(mech.get("origin", "")) != "self":
			_cov_rule("cast.refused_out_of_range")
			return _refuse(a, "cast", "out_of_range", {"spell": sid})
	if tgt_kind in ["creature", "ally", "point"] and not (not target.is_empty() and target["id"] == a["id"]) and str(mech.get("origin", "")) != "self" and not has_los(a["pos"], point):
		_cov_rule("los.blocked_spell")
		return _refuse(a, "cast", "no_line_of_sight", {"spell": sid})
	# Harmful single-target spells must get past Sanctuary
	if not target.is_empty() and target["side"] != a["side"] and kind in ["auto_damage", "save_condition", "spell_attack", "maneuver_attack"]:
		if _sanctuary_blocks(a, target):
			return {"success": false, "reason": "sanctuary", "action": "cast", "spell": sid}
	# Pay the cost
	var level := _spell_level(spell)
	var slot_used := ""
	var resource := str(mech.get("resource", ""))
	if resource != "":
		if int(a["resources"].get(resource, 0)) <= 0:
			_cov_rule("cast.refused_no_resource")
			return _refuse(a, "cast", "no_%s_left" % resource, {"spell": sid})
		a["resources"][resource] = int(a["resources"][resource]) - 1
	else:
		slot_used = _lowest_slot(a, level)
		if slot_used == "":
			_cov_rule("cast.refused_no_slot")
			return _refuse(a, "cast", "no_slot", {"spell": sid, "level": level})
		a["slots"][slot_used] = int(a["slots"][slot_used]) - 1
	_cov_content("spells", sid)
	var cast_ev := _emit("cast", {"actor": a["id"], "spell": sid, "level": level, "slot": slot_used, "resource": resource,
		"target": target.get("id", ""), "point": [point.x, point.y],
		"text": "✨ %s casts %s%s" % [a["name"], spell.get("title", sid), "" if target.is_empty() else " on %s" % target["name"]]})
	_audit_slots(a)
	# Counterspell reaction from any hostile caster in range
	if resource == "":
		for foe in _hostiles_of(a):
			if _can_react_with(foe, "counterspell") and dist(foe["pos"], a["pos"]) <= 60 and level <= 3:
				_cast_reaction(foe, "counterspell", a)
				_cov_rule("cast.counterspelled")
				_emit("spell_countered", {"actor": a["id"], "spell": sid, "by": foe["id"], "text": "🚫 %s's %s is countered by %s" % [a["name"], spell.get("title", sid), foe["name"]]})
				_break_invisibility(a, "cast a spell")
				return {"success": false, "reason": "countered", "action": "cast", "spell": sid, "countered_by": foe["id"]}
	var res: Dictionary
	match kind:
		"auto_damage":
			res = _spell_auto_damage(a, spell, mech, target)
		"heal":
			res = _spell_heal(a, spell, mech, target)
		"buff":
			res = _spell_buff(a, spell, mech, target, action)
		"hp_pool":
			res = _spell_hp_pool(a, spell, mech, point)
		"save_damage":
			res = _spell_save_damage(a, spell, mech, point)
		"save_condition":
			res = _spell_save_condition(a, spell, mech, target)
		"spell_attack":
			res = _spell_attack(a, spell, mech, target)
		"maneuver_attack":
			res = _spell_maneuver(a, spell, mech, target)
		"dispel":
			res = _spell_dispel(a, spell, mech, point)
		"detect_traps":
			res = _spell_detect_traps(a, mech)
		_:
			_cov_rule("cast.utility")
			res = {"success": true}
	res["spell"] = sid
	res["cast_seq"] = cast_ev["seq"]
	if sid != "invisibility":
		_break_invisibility(a, "cast a spell")
	if kind in ["auto_damage", "save_damage", "save_condition", "spell_attack", "maneuver_attack", "hp_pool"]:
		_break_sanctuary(a, "cast a harmful spell")
	return res

func _lowest_slot(a: Dictionary, level: int) -> String:
	if level <= 0:
		return "0"
	var keys: Array = a["slots"].keys()
	keys.sort_custom(func(x, y): return int(x) < int(y))
	for k in keys:
		if int(k) >= level and int(a["slots"][k]) > 0:
			return str(k)
	return ""

func _can_react_with(a: Dictionary, sid: String) -> bool:
	if not bool(scenario.get("reactions", true)):
		return false
	if not (sid in a["spells"]) or not can_act(a) or bool(a.get("reaction_used", false)):
		return false
	var level := _spell_level(content["spells"][sid])
	return _lowest_slot(a, level) != ""

func _cast_reaction(a: Dictionary, sid: String, trigger: Dictionary) -> Dictionary:
	var spell: Dictionary = content["spells"][sid]
	var slot := _lowest_slot(a, _spell_level(spell))
	a["slots"][slot] = int(a["slots"][slot]) - 1
	a["reaction_used"] = true
	_cov_content("spells", sid)
	_cov_rule("reaction.%s" % sid)
	_emit("reaction", {"actor": a["id"], "spell": sid, "slot": slot, "trigger": trigger["id"], "text": "⚡ %s reacts with %s" % [a["name"], spell.get("title", sid)]})
	_audit_slots(a)
	if sid == "shield":
		_add_condition(a, "shielded", 1, {"source": "shield", "magical": true, "until": "start_of_turn"})
	return {"reacted": true, "spell": sid}

func _spell_mods(a: Dictionary) -> Dictionary:
	var m := {"MOD": ability_mod(a, casting_ability(a))}
	for ab in ABILITIES:
		m[ab] = ability_mod(a, ab)
	return m

func _spell_auto_damage(a: Dictionary, spell: Dictionary, mech: Dictionary, t: Dictionary) -> Dictionary:
	var blocked_by := str(mech.get("blockedByCondition", ""))
	if blocked_by != "" and not has_condition(t, blocked_by) and _can_react_with(t, "shield"):
		_cast_reaction(t, "shield", a)
	if blocked_by != "" and has_condition(t, blocked_by):
		_cov_rule("spell.magic_missile_blocked_by_shield")
		_emit("spell_blocked", {"actor": a["id"], "target": t["id"], "spell": spell["id"], "by": blocked_by, "text": "🛡️ %s's Shield absorbs every dart" % t["name"]})
		return {"success": true, "damage": 0, "blocked": true}
	var darts := []
	var total := 0
	for i in range(int(mech.get("darts", 1))):
		var r := Dice.roll_formula(str(mech.get("dartDamage", "1d4+1")), {}, "dart:%s" % a["id"])
		darts.append(r)
		total += int(r["total"])
	_cov_rule("spell.auto_damage")
	var dmg := apply_damage(t, total, str(mech.get("damageType", "force")), false, a["id"], {"spell": spell["id"], "darts": darts})
	return {"success": true, "damage": dmg, "darts": darts.map(func(d): return d["total"])}

func _spell_heal(a: Dictionary, spell: Dictionary, mech: Dictionary, t: Dictionary) -> Dictionary:
	var targets := []
	if str(mech.get("target", "")) == "allies_all":
		for ally in _allies_of(a):
			if dist(a["pos"], ally["pos"]) <= float(mech.get("range", 30)):
				targets.append(ally)
	else:
		targets.append(t if not t.is_empty() else a)
	var roll := Dice.roll_formula(str(mech.get("heal", "1d8+MOD")), _spell_mods(a), "heal:%s" % spell["id"])
	var results := []
	for x in targets:
		results.append(heal(x, int(roll["total"]), a["id"], {"spell": spell["id"], "roll": roll}))
		if mech.has("condition"):
			_add_condition(x, str(mech["condition"]), int(mech.get("duration", 1)), {"source": spell["id"], "magical": true})
	_cov_rule("spell.heal")
	return {"success": true, "healed": results}

func _spell_buff(a: Dictionary, spell: Dictionary, mech: Dictionary, t: Dictionary, action: Dictionary) -> Dictionary:
	var cid := str(mech.get("condition", ""))
	var targets := []
	var tk := str(mech.get("target", "self"))
	if tk == "self":
		targets.append(a)
	elif tk == "allies":
		var ids = action.get("targets", [])
		if ids is Array and not ids.is_empty():
			for id in ids:
				if actors.has(str(id)):
					targets.append(actors[str(id)])
		else:
			var allies := _allies_of(a)
			allies.sort_custom(func(x, y): return dist(a["pos"], x["pos"]) < dist(a["pos"], y["pos"]))
			targets = allies
		targets = targets.filter(func(x): return dist(a["pos"], x["pos"]) <= float(mech.get("range", 30)))
		targets = targets.slice(0, int(mech.get("maxTargets", 3)))
	else:
		targets.append(t)
	var extra := {"source": spell["id"], "magical": true, "caster": a["id"]}
	if cid == "shielded":
		extra["until"] = "start_of_turn"
	if cid == "sanctuary":
		extra["dc"] = spell_dc(a)
	for x in targets:
		_add_condition(x, cid, int(mech.get("duration", 10)), extra)
	_cov_rule("spell.buff")
	return {"success": true, "targets": targets.map(func(x): return x["id"]), "condition": cid}

func creatures_in_area(a: Dictionary, mech: Dictionary, point: Vector2) -> Array:
	var area: Dictionary = mech.get("area", {})
	var shape := str(area.get("shape", "sphere"))
	var size := float(area.get("size", 20))
	var origin: Vector2 = a["pos"]
	var dir: Vector2 = (point - origin).normalized() if point != origin else Vector2.RIGHT
	var out := []
	for id in actors:
		var o: Dictionary = actors[id]
		if o["dead"]:
			continue
		var p: Vector2 = o["pos"]
		var inside := false
		match shape:
			"sphere":
				inside = p.distance_to(point) <= size
			"cube":
				inside = o["id"] != a["id"] and dist(origin, p) <= size
			"cone":
				if o["id"] != a["id"]:
					var v := p - origin
					var l := v.length()
					inside = l <= size + 2.5 and l > 0 and abs(rad_to_deg(dir.angle_to(v))) <= 30.0
			"line":
				if o["id"] != a["id"]:
					var v2 := p - origin
					var along := v2.dot(dir)
					var perp := absf(v2.cross(dir))
					inside = along >= 0 and along <= size and perp <= float(area.get("width", 5)) / 2.0 + 2.5
		if inside and grid_active:
			var from_pt: Vector2 = point if shape == "sphere" else origin
			if not has_los(from_pt, p):
				_cov_rule("spell.area_blocked_by_wall")
				inside = false
		if inside:
			out.append(o)
	return out

func _spell_hp_pool(a: Dictionary, spell: Dictionary, mech: Dictionary, point: Vector2) -> Dictionary:
	var pool_roll := Dice.roll_formula(str(mech.get("pool", "5d8")), {}, "hp_pool:%s" % spell["id"])
	var pool := int(pool_roll["total"])
	var immune_types: Array = mech.get("immuneCreatureTypes", [])
	var candidates := creatures_in_area(a, mech, point).filter(func(o):
		return int(o["hp"]) > 0 and not has_condition(o, "unconscious") and not (o["creature_type"] in immune_types))
	candidates.sort_custom(func(x, y):
		if int(x["hp"]) != int(y["hp"]):
			return int(x["hp"]) < int(y["hp"])
		return str(x["id"]) < str(y["id"]))
	var affected := []
	var remaining := pool
	for o in candidates:
		if int(o["hp"]) > remaining:
			break
		remaining -= int(o["hp"])
		if _add_condition(o, str(mech.get("condition", "unconscious")), int(mech.get("duration", 10)), {"source": spell["id"], "magical": true, "ends_on_damage": bool(mech.get("endsOnDamage", true))}):
			affected.append(o["id"])
	_cov_rule("spell.hp_pool")
	_emit("hp_pool", {"actor": a["id"], "spell": spell["id"], "pool": pool, "roll": pool_roll, "affected": affected, "remaining": remaining,
		"text": "%s pool of %d HP affects %s" % [spell.get("title", spell["id"]), pool, ", ".join(affected) if not affected.is_empty() else "no one"]})
	return {"success": true, "pool": pool, "affected": affected}

func _spell_save_damage(a: Dictionary, spell: Dictionary, mech: Dictionary, point: Vector2) -> Dictionary:
	var victims := creatures_in_area(a, mech, point)
	var dc := spell_dc(a)
	var dmg_roll := Dice.roll_formula(str(mech.get("damage", "1d6")), _spell_mods(a), "area_damage:%s" % spell["id"])
	var results := {}
	for v in victims:
		var save := roll_save(v, str(mech.get("save", "DEX")), dc, spell["id"])
		var amount := int(dmg_roll["total"])
		if save["success"]:
			amount = amount / 2 if str(mech.get("onSave", "half")) == "half" else 0
			_cov_rule("spell.save_half" if str(mech.get("onSave", "half")) == "half" else "spell.save_negates")
		var d := apply_damage(v, amount, str(mech.get("damageType", "force")), false, a["id"], {"spell": spell["id"], "roll": dmg_roll, "saved": save["success"], "save_seq": save["seq"]})
		results[v["id"]] = {"saved": save["success"], "damage": d}
		if not save["success"] and not v["dead"]:
			if mech.has("conditionOnFail"):
				_add_condition(v, str(mech["conditionOnFail"]), int(mech.get("duration", 1)), {"source": spell["id"], "magical": true})
			if mech.has("pushOnFail"):
				var away: Vector2 = (v["pos"] - a["pos"]).normalized()
				if away == Vector2.ZERO:
					away = Vector2.RIGHT
				var old: Vector2 = v["pos"]
				v["pos"] = _free_square_along(v, old, clamp_to_map(old + away * float(mech["pushOnFail"])))
				_cov_rule("spell.push")
				_emit("pushed", {"target": v["id"], "from": [old.x, old.y], "to": [v["pos"].x, v["pos"].y], "text": "%s is pushed %d ft" % [v["name"], int(mech["pushOnFail"])]})
	_cov_rule("spell.area_%s" % str(mech.get("area", {}).get("shape", "sphere")))
	_emit("area_resolved", {"actor": a["id"], "spell": spell["id"], "point": [point.x, point.y], "victims": results.keys(), "dc": dc,
		"text": "%s engulfs %d creature(s)" % [spell.get("title", spell["id"]), results.size()]})
	return {"success": true, "dc": dc, "damage_roll": dmg_roll["total"], "results": results}

func _spell_save_condition(a: Dictionary, spell: Dictionary, mech: Dictionary, t: Dictionary) -> Dictionary:
	var req := str(mech.get("requiresCreatureType", ""))
	if req != "" and t["creature_type"] != req:
		_cov_rule("spell.wrong_creature_type")
		_emit("spell_no_effect", {"actor": a["id"], "target": t["id"], "spell": spell["id"], "reason": "not a %s" % req, "text": "%s has no effect on %s (not a %s)" % [spell.get("title", spell["id"]), t["name"], req]})
		return {"success": true, "effect": false, "reason": "creature_type"}
	var dc := spell_dc(a)
	var save := roll_save(t, str(mech.get("save", "WIS")), dc, spell["id"])
	if save["success"]:
		return {"success": true, "effect": false, "saved": true}
	var applied := _add_condition(t, str(mech.get("condition", "")), int(mech.get("duration", 10)), {
		"source": spell["id"], "magical": true, "caster": a["id"], "dc": dc,
		"repeat_save": str(mech.get("save", "WIS")) if bool(mech.get("repeatSave", false)) else ""})
	_cov_rule("spell.save_condition")
	return {"success": true, "effect": applied, "saved": false}

func _spell_attack(a: Dictionary, spell: Dictionary, mech: Dictionary, t: Dictionary) -> Dictionary:
	var atk := {"name": spell.get("title", spell["id"]), "bonus": spell_attack_bonus(a), "damage": str(mech.get("damage", "1d8")).replace("MOD", str(ability_mod(a, casting_ability(a)))), "type": str(mech.get("damageType", "force")), "reach": int(mech.get("range", 60)), "range": int(mech.get("range", 60)), "ranged": false, "finesse": false}
	_cov_rule("spell.attack_roll")
	return {"success": true, "attack": resolve_attack(a, t, atk)}

func _spell_maneuver(a: Dictionary, spell: Dictionary, mech: Dictionary, t: Dictionary) -> Dictionary:
	var roll := Dice.roll_formula(str(mech.get("damage", "1d8")), _spell_mods(a), "maneuver:%s" % spell["id"])
	var d := apply_damage(t, int(roll["total"]), str(mech.get("damageType", "bludgeoning")), false, a["id"], {"spell": spell["id"], "roll": roll})
	if mech.has("condition") and not t["dead"]:
		_add_condition(t, str(mech["condition"]), int(mech.get("duration", 1)), {"source": spell["id"]})
	_cov_rule("spell.maneuver")
	return {"success": true, "damage": d}

func _spell_dispel(a: Dictionary, spell: Dictionary, mech: Dictionary, point: Vector2) -> Dictionary:
	var removed := {}
	for o in creatures_in_area(a, mech, point):
		for cid in o["conditions"].keys():
			if bool(o["conditions"][cid].get("magical", false)):
				_remove_condition(o, cid, "dispelled")
				if not removed.has(o["id"]):
					removed[o["id"]] = []
				removed[o["id"]].append(cid)
	# The caster's own dispel doesn't strip their own effects
	_cov_rule("spell.dispel")
	return {"success": true, "removed": removed}

func _spell_detect_traps(a: Dictionary, mech: Dictionary) -> Dictionary:
	var found := []
	for tid in traps:
		var tr: Dictionary = traps[tid]
		if not tr["disarmed"] and dist(a["pos"], tr["pos"]) <= float(mech.get("range", 120)):
			if not tr["detected"]:
				tr["detected"] = true
				tr["hidden"] = false
				_emit("trap_detected", {"trap": tid, "by": a["id"], "method": "spell", "text": "🔎 %s senses %s" % [a["name"], tid]})
			found.append(tid)
	_cov_rule("traps.detected_by_spell")
	return {"success": true, "found": found}

# ─────────────────────────────────────────────────────────────────────────────
# Items
# ─────────────────────────────────────────────────────────────────────────────

func _action_use_item(a: Dictionary, action: Dictionary) -> Dictionary:
	var iid := str(action.get("item", ""))
	if not (iid in a["inventory"]):
		_cov_rule("item.refused_not_carried")
		return _refuse(a, "use_item", "not_carried", {"item": iid})
	var item: Dictionary = content["items"].get(iid, {})
	var use: Dictionary = item.get("use", {})
	if use.is_empty():
		return _refuse(a, "use_item", "not_usable", {"item": iid})
	var tid := str(action.get("target", a["id"]))
	if not actors.has(tid):
		return _refuse(a, "use_item", "unknown_target", {"item": iid})
	var t: Dictionary = actors[tid]
	if dist(a["pos"], t["pos"]) > 5:
		return _refuse(a, "use_item", "out_of_reach", {"item": iid})
	a["inventory"].erase(iid)
	_cov_content("items", iid)
	_emit("item_used", {"actor": a["id"], "item": iid, "target": tid, "text": "🧪 %s uses %s on %s" % [a["name"], item.get("title", iid), t["name"]]})
	var res := {"success": true, "item": iid}
	if use.has("heal"):
		var roll := Dice.roll_formula(str(use["heal"]), {}, "potion:%s" % iid)
		res["heal"] = heal(t, int(roll["total"]), a["id"], {"item": iid, "roll": roll})
		_cov_rule("item.heal")
	if use.has("condition"):
		_add_condition(t, str(use["condition"]), int(use.get("duration", 10)), {"source": iid, "magical": true})
		_cov_rule("item.condition")
	if use.has("removeCondition"):
		_remove_condition(t, str(use["removeCondition"]), iid)
		_cov_rule("item.cure")
	return res

# ─────────────────────────────────────────────────────────────────────────────
# Movement, opportunity attacks and traps
# ─────────────────────────────────────────────────────────────────────────────

func movement_left(a: Dictionary) -> float:
	return float(a.get("move_left", a["speed"]))

func _action_move(a: Dictionary, to: Vector2, disengage: bool) -> Dictionary:
	for c in SPEED_ZERO:
		if has_condition(a, c):
			_cov_rule("move.refused_speed_zero")
			return _refuse(a, "move", "speed_zero_%s" % c)
	var from: Vector2 = a["pos"]
	var budget := movement_left(a)
	if has_condition(a, "prone"):
		# Standing up costs half your speed
		_remove_condition(a, "prone", "stood up")
		budget -= float(a["speed"]) / 2.0
		_cov_rule("move.stand_from_prone")
	var want := dist(from, to)
	var dest := to
	var path := []
	var spent := 0.0
	if grid_active:
		var gp := _grid_path(a, from, to, max(0.0, budget))
		dest = gp["dest"]
		spent = float(gp["cost"])
		path = gp["path"]
	else:
		if want > budget:
			var frac: float = max(0.0, budget) / want if want > 0 else 0.0
			dest = from + (to - from) * frac
			_cov_rule("move.limited_by_speed")
		spent = dist(from, dest)
	a["move_left"] = budget - spent
	# Opportunity attacks from foes whose reach we leave
	if not disengage and not bool(a.get("disengaged", false)):
		for foe in _hostiles_of(a):
			if not can_act(foe) or bool(foe.get("reaction_used", false)):
				continue
			var melee := {}
			for atk in foe["attacks"]:
				if not atk["ranged"]:
					melee = atk
					break
			if melee.is_empty():
				continue
			var reach := float(melee["reach"])
			if dist(foe["pos"], from) <= reach and dist(foe["pos"], dest) > reach:
				foe["reaction_used"] = true
				resolve_attack(foe, a, melee, true)
				if is_down(a) or not can_act(a):
					dest = from
					break
	else:
		_cov_rule("move.disengaged")
	dest = clamp_to_map(dest)
	if not grid_active:
		dest = _free_square_along(a, from, dest)
	a["pos"] = dest
	_cov_rule("move")
	_emit("moved", {"actor": a["id"], "from": [from.x, from.y], "to": [dest.x, dest.y], "feet": spent if grid_active else dist(from, dest), "path": path, "text": "%s moves %d ft" % [a["name"], int(spent if grid_active else dist(from, dest))]})
	_check_traps(a)
	return {"success": true, "action": "move", "to": [dest.x, dest.y], "feet": dist(from, dest)}

func _check_traps(a: Dictionary) -> void:
	for tid in traps:
		var tr: Dictionary = traps[tid]
		if tr["disarmed"] or tr["triggered"]:
			continue
		var d := dist(a["pos"], tr["pos"])
		var trap_def: Dictionary = content["traps"][tr["trap"]]
		# Passive perception spots hidden traps within 10 ft
		if not tr["detected"] and d <= 10 and a["side"] == "party":
			var passive := 10 + ability_mod(a, "WIS") + (int(a["prof"]) if a["class"] in ["rogue", "ranger"] else 0)
			if passive >= int(trap_def.get("detectDC", 15)):
				tr["detected"] = true
				tr["hidden"] = false
				_cov_rule("traps.passive_perception")
				_emit("trap_detected", {"trap": tid, "by": a["id"], "method": "passive", "passive": passive, "text": "👁️ %s spots %s (passive %d)" % [a["name"], tid, passive]})
		if d <= 2.5 and not tr["detected"]:
			_trigger_trap(tr, a)

func _trigger_trap(tr: Dictionary, victim: Dictionary) -> void:
	var trap_def: Dictionary = content["traps"][tr["trap"]]
	tr["triggered"] = true
	_cov_rule("traps.triggered")
	_emit("trap_triggered", {"trap": tr["id"], "victim": victim["id"], "text": "💥 %s triggers %s" % [victim["name"], trap_def.get("title", tr["trap"])]})
	var save := roll_save(victim, str(trap_def.get("saveStat", "DEX")), int(trap_def.get("saveDC", 13)), "trap:%s" % tr["trap"])
	var roll := Dice.roll_formula(str(trap_def.get("damageFormula", "1d6")), {}, "trap_damage:%s" % tr["trap"])
	var amount := int(roll["total"])
	if save["success"]:
		amount = amount / 2
	apply_damage(victim, amount, str(trap_def.get("damageType", "piercing")), false, tr["id"], {"trap": tr["trap"], "roll": roll, "saved": save["success"]})
	if not save["success"] and str(trap_def.get("statusEffect", "")) != "" and not victim["dead"]:
		_add_condition(victim, str(trap_def["statusEffect"]), int(trap_def.get("statusDuration", 2)), {"source": tr["trap"]})

func _action_search(a: Dictionary) -> Dictionary:
	var found := []
	for tid in traps:
		var tr: Dictionary = traps[tid]
		if tr["detected"] or tr["disarmed"] or dist(a["pos"], tr["pos"]) > 30:
			continue
		var trap_def: Dictionary = content["traps"][tr["trap"]]
		var d := Dice.roll(20, "search:%s" % a["id"])
		var total := d + ability_mod(a, "WIS") + (int(a["prof"]) if a["class"] in ["rogue", "ranger"] else 0)
		var ok := total >= int(trap_def.get("detectDC", 15))
		_emit("search", {"actor": a["id"], "trap": tid, "d20": d, "rolls": [{"seq": Dice.last_seq(), "v": d}], "total": total, "dc": int(trap_def.get("detectDC", 15)), "success": ok,
			"text": "%s searches: %d vs DC %d → %s" % [a["name"], total, int(trap_def.get("detectDC", 15)), "found %s" % tid if ok else "nothing"]})
		if ok:
			tr["detected"] = true
			tr["hidden"] = false
			found.append(tid)
			_cov_rule("traps.found_by_search")
	return {"success": true, "found": found}

func _action_disarm(a: Dictionary, tid: String) -> Dictionary:
	if not traps.has(tid):
		return _refuse(a, "disarm", "unknown_trap", {"trap": tid})
	var tr: Dictionary = traps[tid]
	if not tr["detected"]:
		return _refuse(a, "disarm", "trap_not_detected", {"trap": tid})
	if dist(a["pos"], tr["pos"]) > 5:
		return _refuse(a, "disarm", "too_far", {"trap": tid})
	var trap_def: Dictionary = content["traps"][tr["trap"]]
	var tools: bool = "thieves-tools" in a["inventory"]
	if tools:
		_cov_content("items", "thieves-tools")
	var bonus := ability_mod(a, "DEX") + (int(a["prof"]) if tools else 0)
	var d := Dice.roll(20, "disarm:%s" % a["id"])
	var total := d + bonus
	var dc := int(trap_def.get("disarmDC", 15))
	var ok := total >= dc
	_emit("disarm", {"actor": a["id"], "trap": tid, "d20": d, "rolls": [{"seq": Dice.last_seq(), "v": d}], "bonus": bonus, "tools": tools, "total": total, "dc": dc, "success": ok,
		"text": "%s tries to disarm %s: %d vs DC %d → %s" % [a["name"], tid, total, dc, "disarmed" if ok else "failed"]})
	if ok:
		tr["disarmed"] = true
		_cov_rule("traps.disarmed")
	elif total <= dc - 5:
		_cov_rule("traps.disarm_fumble")
		_trigger_trap(tr, a)
	else:
		_cov_rule("traps.disarm_failed")
	return {"success": ok, "total": total, "dc": dc}

# ─────────────────────────────────────────────────────────────────────────────
# Turns
# ─────────────────────────────────────────────────────────────────────────────

func _advance_turn() -> Dictionary:
	if order.is_empty():
		return {}
	turn_index += 1
	if turn_index >= order.size() or round_num == 0:
		turn_index = 0
		round_num += 1
		_cov_rule("round.started")
		_emit("round_started", {"round": round_num, "text": "── Round %d ──" % round_num})
		if round_num > max_rounds:
			_finish("timeout")
			return {}
	current_actor = str(order[turn_index])
	return actors[current_actor]

func start_turn(a: Dictionary) -> void:
	a["reaction_used"] = false
	a["move_left"] = float(a["speed"])
	a["sneak_used"] = false
	a["disengaged"] = false
	for cid in a["conditions"].keys():
		if str(a["conditions"][cid].get("until", "")) == "start_of_turn":
			_cov_rule("condition.ends_at_start_of_turn")
			_remove_condition(a, cid, "start of turn")
	_emit("turn_started", {"actor": a["id"], "text": "%s's turn" % a["name"]})
	if a["kind"] == "pc" and int(a["hp"]) <= 0 and not a["dead"] and not a["stable"]:
		roll_death_save(a)

func end_turn(a: Dictionary) -> void:
	if a["dead"]:
		return
	for cid in a["conditions"].keys():
		if not a["conditions"].has(cid):
			continue
		var rec: Dictionary = a["conditions"][cid]
		var rs := str(rec.get("repeat_save", ""))
		if rs != "":
			var save := roll_save(a, rs, int(rec.get("dc", 13)), "repeat:%s" % cid)
			if save["success"]:
				_cov_rule("condition.repeat_save_ended")
				_remove_condition(a, cid, "saved at end of turn")
				continue
		if cid == "unconscious" and str(rec.get("source", "")) == "dying":
			continue
		if str(rec.get("until", "")) == "start_of_turn":
			continue
		if cid == "prone" and str(rec.get("source", "")) == "dying":
			continue
		rec["rounds"] = int(rec["rounds"]) - 1
		if int(rec["rounds"]) <= 0:
			_cov_rule("condition.expired")
			_remove_condition(a, cid, "expired")

## Plays the next creature's turn with its AI. Returns the actor id, or "" when over.
func step_turn() -> String:
	if status != "active":
		return ""
	var a := _advance_turn()
	if a.is_empty() or status != "active":
		return ""
	play_turn(a)
	return a["id"]

func play_turn(a: Dictionary) -> void:
	start_turn(a)
	if status == "active" and can_act(a) and not a["dead"]:
		ai_turn(a)
	end_turn(a)
	_check_end()

func run(rounds: int = -1) -> Dictionary:
	if rounds > 0:
		max_rounds = min(max_rounds, round_num + rounds) if round_num > 0 else rounds
	_in_run = true
	var guard := 0
	while status == "active" and guard < 5000:
		guard += 1
		if step_turn() == "" and status == "active":
			break
	_in_run = false
	return summary()

# ─────────────────────────────────────────────────────────────────────────────
# AI
# ─────────────────────────────────────────────────────────────────────────────

## Directive fields (all optional). A directive applies to one actor ("actor"),
## a whole side ("side": party | enemy), or everyone ("side": "all"); actor-level
## fields override side-level ones.
##   controller          infinity_ai (default) | scripted | idle
##   inputs              scripted player inputs: [{round?, type, target?, spell?, item?, point?, to?}]
##   targetPriority      nearest (default) | lowest_hp | highest_hp | weakest_ac | spellcaster
##   focusTarget         actor id to attack whenever it's valid
##   preferSpells        spell ids to try first, in order
##   forbidSpells        spell ids the AI must never cast
##   useSpells           false to fight with weapons only
##   healThreshold       heal an ally below this fraction of max HP (default 0.5)
##   potionThreshold     drink a potion below this fraction (default 0.5)
##   movement            advance (default) | hold | kite
##   guard               actor id to stay next to
##   areaMinTargets      foes an area spell must catch (default 2)
##   allowFriendlyFire   let area spells catch allies (default false)
const DEFAULT_DIRECTIVE := {
	"controller": "infinity_ai", "targetPriority": "nearest", "focusTarget": "", "preferSpells": [],
	"forbidSpells": [], "useSpells": true, "healThreshold": 0.5, "potionThreshold": 0.5,
	"movement": "advance", "guard": "", "areaMinTargets": 2, "allowFriendlyFire": false, "inputs": [],
}

func directive_for(a: Dictionary) -> Dictionary:
	var d := DEFAULT_DIRECTIVE.duplicate(true)
	var side_d := {}
	var actor_d := {}
	for dv in scenario.get("directives", []):
		if not (dv is Dictionary):
			continue
		if str(dv.get("actor", "")) == a["id"]:
			actor_d = dv
		elif str(dv.get("side", "")) in [a["side"], "all"] and str(dv.get("actor", "")) == "":
			side_d.merge(dv, true)
	d.merge(side_d, true)
	d.merge(actor_d, true)
	return d

## Every decision the Infinity AI makes is a player input: the same command a
## person would give by clicking. Inputs are recorded, then executed.
func _player_input(a: Dictionary, action: Dictionary, source: String, reason: String) -> Dictionary:
	_cov_rule("input.%s" % source)
	_emit("player_input", {"actor": a["id"], "source": source, "input": action.duplicate(true), "reason": reason,
		"text": "🎮 %s → %s%s" % [a["name"], _describe_input(action), "" if reason == "" else " (%s)" % reason]})
	return act(a["id"], action)

func _describe_input(action: Dictionary) -> String:
	var t := str(action.get("type", "wait"))
	match t:
		"attack":
			return "attack %s" % str(action.get("target", ""))
		"cast":
			return "cast %s%s" % [str(action.get("spell", "")), "" if str(action.get("target", "")) == "" else " at %s" % str(action.get("target", ""))]
		"use_item":
			return "use %s" % str(action.get("item", ""))
		"move":
			var to = action.get("to", [0, 0])
			return "move to (%d, %d)" % [int(to[0]), int(to[1])]
	return t

func _scripted_input(a: Dictionary, d: Dictionary) -> Dictionary:
	var inputs: Array = d.get("inputs", [])
	var cursor := int(a.get("input_cursor", 0))
	while cursor < inputs.size():
		var inp = inputs[cursor]
		if inp is Dictionary and inp.has("round") and int(inp["round"]) > round_num:
			return {}
		a["input_cursor"] = cursor + 1
		if inp is Dictionary and (not inp.has("round") or int(inp["round"]) == round_num):
			var action: Dictionary = inp.duplicate(true)
			action.erase("round")
			return action
		cursor += 1
	return {}

func ai_turn(a: Dictionary) -> void:
	var d := directive_for(a)
	var controller := str(d["controller"])
	var scripted := _scripted_input(a, d)
	if not scripted.is_empty():
		_player_input(a, scripted, "script", "scripted input")
		# Like a real player: move, then take the turn's action
		if str(scripted.get("type", "")) == "move" and status == "active" and can_act(a):
			var follow := _scripted_input(a, d)
			if not follow.is_empty():
				_player_input(a, follow, "script", "scripted input")
		return
	if controller == "idle" or (controller == "scripted"):
		_cov_rule("ai.idle")
		_player_input(a, {"type": "wait"}, "infinity_ai", "directive: %s" % controller)
		return
	var use_spells := bool(d["useSpells"])
	var forbid: Array = d["forbidSpells"]
	var allies := _allies_of(a)
	# 1. Heal an ally who is down or badly hurt
	var threshold := float(d["healThreshold"])
	var hurt := allies.filter(func(o): return not o["dead"] and float(o["hp"]) < float(o["max_hp"]) * threshold)
	hurt.sort_custom(func(x, y): return int(x["hp"]) < int(y["hp"]))
	if not hurt.is_empty() and use_spells:
		for sid in ["healing-word", "cure-wounds"]:
			if sid in a["spells"] and not (sid in forbid) and _lowest_slot(a, 1) != "":
				var mech: Dictionary = content["spells"][sid]["mechanics"]
				var who: Dictionary = hurt[0]
				if dist(a["pos"], who["pos"]) > float(mech["range"]) and str(d["movement"]) != "hold":
					_ai_move_toward(a, who["pos"], float(mech["range"]), "reach ally to heal")
				if dist(a["pos"], who["pos"]) <= max(float(mech["range"]), 5.0):
					_cov_rule("ai.heal_ally")
					_player_input(a, {"type": "cast", "spell": sid, "target": who["id"]}, "infinity_ai", "%s is at %d/%d HP" % [who["name"], int(who["hp"]), int(who["max_hp"])])
					return
	if float(a["hp"]) < float(a["max_hp"]) * float(d["potionThreshold"]):
		for pot in ["potion-greater-healing", "potion-healing"]:
			if pot in a["inventory"]:
				_cov_rule("ai.drink_potion")
				_player_input(a, {"type": "use_item", "item": pot}, "infinity_ai", "low HP")
				return
	var live_foes := _hostiles_of(a).filter(func(o): return not is_down(o))
	if live_foes.is_empty():
		_player_input(a, {"type": "wait"}, "infinity_ai", "no foes standing")
		return
	live_foes = _sort_targets(a, live_foes, str(d["targetPriority"]))
	var focus := str(d["focusTarget"])
	if focus != "" and actors.has(focus) and not is_down(actors[focus]):
		live_foes.erase(actors[focus])
		live_foes.push_front(actors[focus])
		_cov_rule("ai.focus_target")
	if use_spells:
		var spell_order: Array = []
		for sid in d["preferSpells"]:
			spell_order.append(str(sid))
		for sid in ["fireball", "lightning-bolt", "blizzard", "stinking-cloud", "burning-hands", "thunderwave", "sleep", "hold-person", "magic-missile", "spiritual-weapon"]:
			if not (sid in spell_order):
				spell_order.append(sid)
		for sid in spell_order:
			if sid in forbid or not (sid in a["spells"]) or not content["spells"].has(sid):
				continue
			var decision := _consider_spell(a, sid, live_foes, d)
			if not decision.is_empty():
				_player_input(a, decision["input"], "infinity_ai", decision["reason"])
				return
	# Weapon attack, moving into reach or range first
	var target: Dictionary = live_foes[0]
	for f in live_foes:
		if can_see(a, f):
			target = f
			break
	var atk := _pick_attack(a, target, "")
	var blocked_sight := false
	if not atk.is_empty() and not has_los(a["pos"], target["pos"]):
		# In range but a wall is in the way: walk around it rather than stand still
		_cov_rule("ai.no_line_of_sight")
		atk = {}
		blocked_sight = true
	if atk.is_empty() and str(d["movement"]) != "hold":
		var ranged: Array = a["attacks"].filter(func(x): return x["ranged"])
		var want := 5.0 if (ranged.is_empty() or blocked_sight) else float(ranged[0]["range"])
		_ai_move_toward(a, target["pos"], want, "close in on %s" % target["name"])
		atk = _pick_attack(a, target, "")
		if not atk.is_empty() and not has_los(a["pos"], target["pos"]):
			atk = {}
	if not atk.is_empty() and status == "active" and can_act(a):
		if use_spells:
			for m in ["tremor-stomp", "crushing-cleave"]:
				if m in a["spells"] and not (m in forbid) and int(a["resources"].get("maneuver", 0)) > 0 and not atk["ranged"] and int(target["hp"]) > 8:
					_cov_rule("ai.maneuver")
					_player_input(a, {"type": "cast", "spell": m, "target": target["id"]}, "infinity_ai", "maneuver on a tough foe")
					return
		_cov_rule("ai.weapon_attack")
		_player_input(a, {"type": "attack", "target": target["id"]}, "infinity_ai", "%s target" % str(d["targetPriority"]))
		if str(d["movement"]) == "kite" and atk["ranged"] and status == "active" and can_act(a):
			var away: Vector2 = (a["pos"] - target["pos"]).normalized()
			if away != Vector2.ZERO and movement_left(a) > 0:
				_cov_rule("ai.kite")
				var dest: Vector2 = a["pos"] + away * movement_left(a)
				_player_input(a, {"type": "move", "to": [dest.x, dest.y]}, "infinity_ai", "kite away")
	elif status == "active" and can_act(a):
		_cov_rule("ai.dodge")
		_player_input(a, {"type": "dodge"}, "infinity_ai", "no target in reach")

func _sort_targets(a: Dictionary, foes: Array, priority: String) -> Array:
	var out := foes.duplicate()
	out.sort_custom(func(x, y):
		var kx := 0.0
		var ky := 0.0
		match priority:
			"lowest_hp":
				kx = float(x["hp"]); ky = float(y["hp"])
			"highest_hp":
				kx = -float(x["hp"]); ky = -float(y["hp"])
			"weakest_ac":
				kx = float(effective_ac(x)["ac"]); ky = float(effective_ac(y)["ac"])
			"spellcaster":
				kx = 0.0 if not x["spells"].is_empty() else 1.0
				ky = 0.0 if not y["spells"].is_empty() else 1.0
		if kx != ky:
			return kx < ky
		var dx := dist(a["pos"], x["pos"])
		var dy := dist(a["pos"], y["pos"])
		if dx != dy:
			return dx < dy
		return str(x["id"]) < str(y["id"]))
	_cov_rule("ai.priority_%s" % priority)
	return out

func _consider_spell(a: Dictionary, sid: String, live_foes: Array, d: Dictionary) -> Dictionary:
	var spell: Dictionary = content["spells"][sid]
	if _lowest_slot(a, _spell_level(spell)) == "" and str(spell.get("mechanics", {}).get("resource", "")) == "":
		return {}
	var mech: Dictionary = spell.get("mechanics", {})
	var kind := str(mech.get("kind", ""))
	if kind in ["save_damage", "hp_pool"]:
		for tgt in live_foes:
			var origin_self := str(mech.get("origin", "")) == "self" or str(mech.get("target", "")) == "self"
			if not origin_self and (dist(a["pos"], tgt["pos"]) > float(mech.get("range", 0)) or not has_los(a["pos"], tgt["pos"])):
				continue
			var hit := creatures_in_area(a, mech, tgt["pos"])
			# Only count foes the spell can actually affect (Sleep skips undead, poison skips the immune)
			var immune_types: Array = mech.get("immuneCreatureTypes", [])
			var dtype := str(mech.get("damageType", ""))
			var n_foes := hit.filter(func(o): return o["side"] != a["side"] and not is_down(o) \
				and not (o["creature_type"] in immune_types) and not (dtype != "" and dtype in o.get("immunities", []))).size()
			var n_allies := hit.filter(func(o): return o["side"] == a["side"]).size()
			if n_foes < hit.filter(func(o): return o["side"] != a["side"] and not is_down(o)).size():
				_cov_rule("ai.skips_immune_foes")
			if n_foes >= int(d["areaMinTargets"]) and (n_allies == 0 or bool(d["allowFriendlyFire"])):
				_cov_rule("ai.area_spell")
				return {"input": {"type": "cast", "spell": sid, "point": [tgt["pos"].x, tgt["pos"].y], "target": tgt["id"]},
					"reason": "catches %d foe(s)%s" % [n_foes, "" if n_allies == 0 else " and %d ally(ies)" % n_allies]}
		return {}
	if kind in ["save_condition", "auto_damage", "spell_attack"]:
		for f in live_foes:
			if sid == "hold-person" and (f["creature_type"] != "humanoid" or has_condition(f, "paralyzed")):
				continue
			if dist(a["pos"], f["pos"]) <= float(mech.get("range", 60)) and can_see(a, f) and has_los(a["pos"], f["pos"]):
				_cov_rule("ai.single_target_spell")
				return {"input": {"type": "cast", "spell": sid, "target": f["id"]}, "reason": "best spell on %s" % f["name"]}
	return {}

func _ai_move_toward(a: Dictionary, goal: Vector2, stop_within: float, reason: String = "") -> void:
	var from: Vector2 = a["pos"]
	var d := dist(from, goal)
	if d <= stop_within:
		return
	if grid_active and stop_within <= 5.0:
		# The pathfinder walks around walls to the nearest free cell beside the target
		_cov_rule("ai.move")
		_player_input(a, {"type": "move", "to": [goal.x, goal.y]}, "infinity_ai", reason)
		return
	if stop_within <= 5.0:
		# Melee: head for the free square next to the target that's closest to us
		var best := Vector2.INF
		for dx in [-1, 0, 1]:
			for dy in [-1, 0, 1]:
				if dx == 0 and dy == 0:
					continue
				var sq: Vector2 = clamp_to_map(goal + Vector2(dx, dy) * 5.0)
				if occupied_by(sq, a["id"]) != "":
					continue
				if best == Vector2.INF or dist(from, sq) < dist(from, best):
					best = sq
		if best != Vector2.INF:
			_cov_rule("ai.move")
			_player_input(a, {"type": "move", "to": [best.x, best.y]}, "infinity_ai", reason)
			return
	var dir := (goal - from)
	var frac := (d - stop_within) / d
	var dest := from + dir * frac
	var snapped := Vector2(round(dest.x / 5.0) * 5.0, round(dest.y / 5.0) * 5.0)
	if dist(snapped, goal) <= stop_within:
		dest = snapped
	_cov_rule("ai.move")
	_player_input(a, {"type": "move", "to": [dest.x, dest.y]}, "infinity_ai", reason)

# ─────────────────────────────────────────────────────────────────────────────
# Test-facing API
# ─────────────────────────────────────────────────────────────────────────────

## A player input given directly by a test (as if a person clicked it).
func test_input(actor_id: String, body: Dictionary) -> Dictionary:
	if not actors.has(actor_id):
		return {"success": false, "reason": "unknown_actor", "actor": actor_id}
	var action := body.duplicate(true)
	action.erase("actor")
	return _player_input(actors[actor_id], action, "test", "")

## Plays one full turn. With an actor id, that creature takes its turn now.
func play_turn_api(actor_id: String) -> Dictionary:
	var before := events.size()
	if actor_id == "":
		var who := step_turn()
		return {"success": who != "", "actor": who, "events": events.slice(before), "summary": summary()}
	if not actors.has(actor_id):
		return {"success": false, "reason": "unknown_actor"}
	if round_num == 0:
		round_num = 1
		_emit("round_started", {"round": round_num, "text": "── Round %d ──" % round_num})
	current_actor = actor_id
	play_turn(actors[actor_id])
	return {"success": true, "actor": actor_id, "events": events.slice(before), "summary": summary()}

## Adjusts state mid-scenario for a test ("Given the fighter is at 3 HP").
## Every patch is recorded as an event so the audit trail stays complete.
func patch(body: Dictionary) -> Dictionary:
	var aid := str(body.get("actor", ""))
	if not actors.has(aid):
		return {"success": false, "reason": "unknown_actor"}
	var a: Dictionary = actors[aid]
	var changes := {}
	if body.has("hp"):
		a["hp"] = clampi(int(body["hp"]), 0, int(a["max_hp"]))
		changes["hp"] = a["hp"]
		if int(a["hp"]) == 0 and a["kind"] == "pc":
			_drop_unconscious(a)
		elif int(a["hp"]) == 0:
			_die(a, "set to 0 HP")
	if body.has("speed"):
		a["speed"] = int(body["speed"])
		changes["speed"] = a["speed"]
	if body.has("x") or body.has("y"):
		a["pos"] = Vector2(float(body.get("x", a["pos"].x)), float(body.get("y", a["pos"].y)))
		changes["pos"] = [a["pos"].x, a["pos"].y]
	for c in body.get("add_conditions", []):
		_add_condition(a, str(c), int(body.get("rounds", 10)), {"source": "test", "magical": bool(body.get("magical", false)), "caster": str(body.get("by", ""))})
	for c in body.get("remove_conditions", []):
		_remove_condition(a, str(c), "test")
	if body.has("slots") and body["slots"] is Dictionary:
		for k in body["slots"]:
			a["slots"][str(k)] = int(body["slots"][k])
		changes["slots"] = a["slots"]
	if body.has("inventory") and body["inventory"] is Array:
		a["inventory"] = body["inventory"].duplicate()
		changes["inventory"] = a["inventory"]
	_emit("state_patched", {"target": aid, "changes": changes, "text": "Test set %s: %s" % [a["name"], JSON.stringify(changes)]})
	_check_end()
	return {"success": true, "actor": actor_view(a)}

func _fuzz_square(gen: RandomNumberGenerator, taken: Dictionary, col_lo: int, col_hi: int) -> Vector2:
	for attempt in range(200):
		var sq := Vector2(gen.randi_range(col_lo, col_hi) * 5, gen.randi_range(0, 12) * 5)
		if not taken.has(sq):
			taken[sq] = true
			return sq
	return Vector2(col_hi * 5 + taken.size() * 5, 0)

## Generates `count` random scenarios from the content data, plays each to the
## end, and replays each one to prove the same seed gives the same battle.
func fuzz(fuzz_seed: int, count: int, rounds: int) -> Dictionary:
	var gen := RandomNumberGenerator.new()
	gen.seed = fuzz_seed
	var runs := []
	var total_violations := 0
	var nondeterministic := 0
	for i in range(count):
		var r := _fuzz_play(_fuzz_spec(gen, fuzz_seed, i, rounds))
		total_violations += r["violations"].size()
		if not r["deterministic"]:
			nondeterministic += 1
		runs.append(r)
	_cov_rule("fuzz.run")
	return {"seed": fuzz_seed, "count": count, "violations": total_violations, "nondeterministic": nondeterministic, "runs": runs}

## The index-th battle of fuzz(fuzz_seed, ...), played on its own (the demo runner
## plays fuzz batches one battle per frame so the screen stays live).
func fuzz_one(fuzz_seed: int, index: int, rounds: int) -> Dictionary:
	var gen := RandomNumberGenerator.new()
	gen.seed = fuzz_seed
	var spec := {}
	for i in range(index + 1):
		spec = _fuzz_spec(gen, fuzz_seed, i, rounds)
	_cov_rule("fuzz.run")
	return _fuzz_play(spec)

func _fuzz_spec(gen: RandomNumberGenerator, fuzz_seed: int, i: int, rounds: int) -> Dictionary:
	var classes: Array = content["classes"].keys()
	var races: Array = content["races"].keys()
	var monsters: Array = content["monsters"].keys()
	var taken := {}
	var party := []
	for p in range(gen.randi_range(1, 6)):
		var pp := _fuzz_square(gen, taken, 0, 6)
		party.append({"id": "pc_%d" % (p + 1), "class": classes[gen.randi_range(0, classes.size() - 1)],
			"race": races[gen.randi_range(0, races.size() - 1)], "level": gen.randi_range(1, 9),
			"x": pp.x, "y": pp.y, "inventory": ["potion-healing"] if gen.randf() < 0.5 else []})
	var enemies := []
	for e in range(gen.randi_range(1, 8)):
		var ep := _fuzz_square(gen, taken, 8, 16)
		enemies.append({"id": "foe_%d" % (e + 1), "monster": monsters[gen.randi_range(0, monsters.size() - 1)],
			"x": ep.x, "y": ep.y})
	return {"name": "fuzz %d/%d" % [fuzz_seed, i], "seed": gen.randi(), "max_rounds": rounds, "party": party, "enemies": enemies}

func _fuzz_play(spec: Dictionary) -> Dictionary:
	load_scenario(spec)
	run()
	var first := summary()
	var h1 := JSON.stringify(events).hash()
	var v1 := violations.duplicate()
	var was_quiet := quiet
	quiet = true
	load_scenario(spec)
	run()
	quiet = was_quiet
	var h2 := JSON.stringify(events).hash()
	return {"scenario": spec, "outcome": first["outcome"], "rounds": first["rounds"], "events": first["events"],
		"violations": v1, "deterministic": h1 == h2}

# ─────────────────────────────────────────────────────────────────────────────
# Outcome
# ─────────────────────────────────────────────────────────────────────────────

func _check_end() -> void:
	if status != "active":
		return
	var enemies_up := 0
	var party_up := 0
	for id in actors:
		var o: Dictionary = actors[id]
		if o["side"] == "enemy" and not is_down(o):
			enemies_up += 1
		if o["side"] == "party" and not is_down(o):
			party_up += 1
	if enemies_up == 0:
		_finish("victory")
	elif party_up == 0:
		_finish("defeat")

func _finish(result: String) -> void:
	if status != "active":
		return
	status = "ended"
	outcome = result
	_cov_rule("outcome.%s" % result)
	_emit("scenario_ended", {"outcome": result, "round": round_num, "text": "🏁 %s after %d round(s)" % [result.to_upper(), round_num]})
	scenario_ended.emit(result)

func summary() -> Dictionary:
	var survivors := {"party": [], "enemy": []}
	for id in actors:
		var o: Dictionary = actors[id]
		if not is_down(o):
			survivors[o["side"]].append(id)
	return {"status": status, "outcome": outcome, "rounds": round_num, "events": events.size(),
		"violations": violations.size(), "survivors": survivors, "seed": Dice.seed_value}

# ─────────────────────────────────────────────────────────────────────────────
# Events, audit, coverage
# ─────────────────────────────────────────────────────────────────────────────

func _emit(type: String, data: Dictionary) -> Dictionary:
	var ev := data.duplicate(true)
	ev["seq"] = events.size() + 1
	ev["type"] = type
	ev["round"] = round_num
	ev["turn"] = current_actor
	events.append(ev)
	_audit_global(ev)
	if not quiet:
		event_recorded.emit(ev)
	return ev

func _violate(msg: String, ev: Dictionary) -> void:
	violations.append({"message": msg, "event_seq": int(ev.get("seq", 0)), "event_type": str(ev.get("type", ""))})
	push_warning("[ScenarioEngine audit] %s (event %s)" % [msg, str(ev.get("seq", "?"))])

func _check(cond: bool, msg: String, ev: Dictionary) -> void:
	if not cond:
		_violate(msg, ev)

func _check_rolls(rolls: Array, ev: Dictionary) -> int:
	var sum := 0
	for r in rolls:
		var e := Dice.entry(int(r["seq"]))
		_check(not e.is_empty() and int(e["v"]) == int(r["v"]), "event reports roll %s that isn't in the dice log" % str(r), ev)
		_check(not bool(e.get("invalid", false)), "roll %s is outside its die's range" % str(r), ev)
		sum += int(r["v"])
	return sum

func _audit_global(ev: Dictionary) -> void:
	for id in actors:
		var o: Dictionary = actors[id]
		_check(int(o["hp"]) >= 0 and int(o["hp"]) <= int(o["max_hp"]), "%s HP %d outside 0..%d" % [id, int(o["hp"]), int(o["max_hp"])], ev)
		if o["dead"]:
			_check(int(o["hp"]) == 0, "%s is dead with %d HP" % [id, int(o["hp"])], ev)
		for k in o["slots"]:
			_check(int(o["slots"][k]) >= 0, "%s has negative level-%s slots" % [id, k], ev)
		if ev["type"] == "moved" and str(ev.get("actor", "")) == id and grid_active:
			# Every step of the path is an open, adjacent cell and never cuts a wall's corner
			var path: Array = ev.get("path", [])
			for i in range(path.size()):
				var c := Vector2i(int(path[i][0]) / 5, int(path[i][1]) / 5)
				_check(not cells_blocked.has(c), "%s's path enters blocked cell %s" % [id, str(c)], ev)
				if i > 0:
					var pc := Vector2i(int(path[i - 1][0]) / 5, int(path[i - 1][1]) / 5)
					var step := c - pc
					_check(abs(step.x) <= 1 and abs(step.y) <= 1, "%s's path jumps from %s to %s" % [id, str(pc), str(c)], ev)
					if step.x != 0 and step.y != 0:
						_check(not cells_blocked.has(pc + Vector2i(step.x, 0)) and not cells_blocked.has(pc + Vector2i(0, step.y)), "%s's path cuts a wall corner at %s" % [id, str(pc)], ev)
		if ev["type"] == "moved" and str(ev.get("actor", "")) == id and not o["dead"]:
			var other := occupied_by(o["pos"], id)
			_check(other == "", "%s ended its move in %s's square" % [id, other], ev)
	var actor_id := str(ev.get("actor", ""))
	if actor_id != "" and actors.has(actor_id) and ev["type"] in ["attack", "cast", "item_used", "moved"] and not bool(ev.get("opportunity", false)):
		var a: Dictionary = actors[actor_id]
		# The actor was able to act when it chose this action (reactions are audited separately)
		_check(not a["dead"], "%s acted while dead" % actor_id, ev)

func _audit_attack(ev: Dictionary) -> void:
	_check_rolls(ev["rolls"], ev)
	var vals: Array = ev["rolls"].map(func(r): return int(r["v"]))
	var expected := int(vals[0])
	if bool(ev["advantage"]):
		expected = vals.max()
	elif bool(ev["disadvantage"]):
		expected = vals.min()
	_check(int(ev["d20"]) == expected, "attack d20 %d doesn't follow advantage/disadvantage (%s)" % [int(ev["d20"]), str(vals)], ev)
	if not ev["bless"].is_empty():
		_check_rolls(ev["bless"]["rolls"], ev)
	_check(int(ev["total"]) == int(ev["d20"]) + int(ev["bonus"]), "attack total arithmetic is wrong", ev)
	if int(ev["d20"]) == 20:
		_check(bool(ev["hit"]) and bool(ev["crit"]), "natural 20 must be a critical hit", ev)
	elif int(ev["d20"]) == 1:
		_check(not bool(ev["hit"]), "natural 1 must miss", ev)
	else:
		_check(bool(ev["hit"]) == (int(ev["total"]) >= int(ev["ac"])), "hit/miss doesn't match total %d vs AC %d" % [int(ev["total"]), int(ev["ac"])], ev)
	var attacker: Dictionary = actors.get(str(ev["actor"]), {})
	if not attacker.is_empty():
		_check(not attacker["dead"], "dead creature %s attacked" % ev["actor"], ev)
		if not bool(ev["opportunity"]):
			_check(not is_incapacitated(attacker) or ev.get("spell", "") != "", "incapacitated creature %s attacked" % ev["actor"], ev)

func _audit_damage(ev: Dictionary) -> void:
	var roll = ev.get("roll", {})
	if roll is Dictionary and not roll.is_empty():
		var dice_sum := _check_rolls(roll["rolls"], ev)
		_check(int(roll["total"]) == dice_sum + int(roll["modifier"]), "damage roll total != dice + modifier", ev)
	if ev.has("darts"):
		var dsum := 0
		for d in ev["darts"]:
			dsum += _check_rolls(d["rolls"], ev) + int(d["modifier"])
		_check(dsum == int(ev["raw"]), "magic missile darts don't add up to the damage", ev)
	var expected := int(ev["raw"])
	match str(ev["adjust"]):
		"immune":
			expected = 0
		"resistant":
			expected = int(ev["raw"]) / 2
		"vulnerable":
			expected = int(ev["raw"]) * 2
	_check(int(ev["adjusted"]) == expected, "resistance math wrong: %s of %d gave %d" % [ev["adjust"], int(ev["raw"]), int(ev["adjusted"])], ev)
	if int(ev["hp_before"]) > 0:
		_check(int(ev["hp_after"]) == max(0, int(ev["hp_before"]) - int(ev["adjusted"])), "HP after damage is wrong", ev)

func _audit_heal(ev: Dictionary) -> void:
	var roll = ev.get("roll", {})
	if roll is Dictionary and not roll.is_empty():
		var dice_sum := _check_rolls(roll["rolls"], ev)
		_check(int(roll["total"]) == dice_sum + int(roll["modifier"]), "heal roll total != dice + modifier", ev)
		_check(int(ev["amount"]) == int(roll["total"]), "heal amount != roll", ev)
	var t: Dictionary = actors.get(str(ev["target"]), {})
	if not t.is_empty():
		_check(int(ev["hp_after"]) == min(int(t["max_hp"]), int(ev["hp_before"]) + int(ev["amount"])), "healing went past max HP or was miscounted", ev)

func _audit_save(ev: Dictionary) -> void:
	if bool(ev["auto_fail"]):
		_check(not bool(ev["success"]), "auto-failed save marked as success", ev)
		return
	_check_rolls(ev["rolls"], ev)
	_check(int(ev["total"]) == int(ev["d20"]) + int(ev["bonus"]), "save total arithmetic wrong", ev)
	_check(bool(ev["success"]) == (int(ev["total"]) >= int(ev["dc"])), "save success doesn't match total vs DC", ev)

func _audit_slots(a: Dictionary) -> void:
	for k in a["slots"]:
		_check(int(a["slots"][k]) >= 0, "%s spent a slot it didn't have (level %s)" % [a["id"], k], {"seq": events.size(), "type": "slots"})

func _cov_content(kind: String, id: String) -> void:
	if not coverage["content"].has(kind):
		coverage["content"][kind] = {}
	coverage["content"][kind][id] = int(coverage["content"][kind].get(id, 0)) + 1

func _cov_rule(rule: String) -> void:
	coverage["rules"][rule] = int(coverage["rules"].get(rule, 0)) + 1

## Items the engine gives rules to: weapons, armor, usable consumables and
## accessories that grant something. Quest items and keys aren't combat content.
func _is_mechanical_item(item: Dictionary) -> bool:
	var cat := str(item.get("category", ""))
	if cat in ["weapon", "armor"]:
		return true
	if item.has("use"):
		return true
	if cat == "accessory" and (not item.get("grants", []).is_empty() or int(item.get("acBonus", 0)) > 0):
		return true
	return str(item.get("id", "")) == "thieves-tools"

func reset_coverage() -> void:
	coverage = {"content": {}, "rules": {}}

func coverage_report() -> Dictionary:
	var missing := {}
	for kind in ["spells", "monsters", "classes", "races", "items", "traps", "status_effects"]:
		var used: Dictionary = coverage["content"].get(kind, {})
		var miss := []
		for id in content[kind]:
			if kind == "items" and not _is_mechanical_item(content[kind][id]):
				continue
			if not used.has(id):
				miss.append(id)
		missing[kind] = miss
	return {"content": coverage["content"], "rules": coverage["rules"], "missing": missing}

# ─────────────────────────────────────────────────────────────────────────────
# Serialization
# ─────────────────────────────────────────────────────────────────────────────

func actor_view(a: Dictionary) -> Dictionary:
	var v := a.duplicate(true)
	v["pos"] = [a["pos"].x, a["pos"].y]
	v["ac"] = effective_ac(a)["ac"]
	v["base_ac"] = base_ac(a)
	v["can_act"] = can_act(a)
	v["down"] = is_down(a)
	v["condition_list"] = a["conditions"].keys()
	if a["kind"] == "pc" and not CASTING_ABILITY.get(a["class"], "").is_empty():
		v["spell_dc"] = spell_dc(a)
	return v

func state() -> Dictionary:
	var out := {}
	for id in actors:
		out[id] = actor_view(actors[id])
	var trap_view := {}
	for tid in traps:
		var tr: Dictionary = traps[tid].duplicate()
		tr["pos"] = [traps[tid]["pos"].x, traps[tid]["pos"].y]
		trap_view[tid] = tr
	return {"name": str(scenario.get("name", "")), "status": status, "outcome": outcome, "round": round_num,
		"current": current_actor, "order": order.duplicate(), "actors": out, "traps": trap_view,
		"map": map_info, "grid_active": grid_active,
		"violations": violations.size(), "events": events.size(), "seed": Dice.seed_value, "dice_pending": Dice.pending()}
