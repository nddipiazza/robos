extends Node
## Deterministic dice for the scenario engine.
##
## Every rules roll goes through here, so a battle is reproducible from its seed,
## and tests can script exact rolls ("the next d20 is a 20"). Each roll is logged
## with its purpose; engine events reference rolls by `seq`, and the audit checks
## that every value an event reports really came from this log.

var rng := RandomNumberGenerator.new()
var seed_value: int = 1
## Scripted rolls, consumed front to back. Each entry is {"d": sides, "v": value}
## (applies only to that die size) or {"v": value} (applies to the next die of any size).
var queue: Array = []
var log: Array[Dictionary] = []

func _ready() -> void:
	reseed(1)

func reseed(new_seed: int) -> void:
	seed_value = new_seed
	rng.seed = new_seed
	rng.state = 0
	rng.seed = new_seed
	queue.clear()
	log.clear()

func force(values: Array) -> void:
	for v in values:
		if v is Dictionary:
			queue.append({"d": int(v.get("d", 0)), "v": int(v.get("v", 1))})
		else:
			queue.append({"d": 0, "v": int(v)})

func pending() -> int:
	return queue.size()

func roll(sides: int, purpose: String = "") -> int:
	var value := -1
	var forced := false
	# A scripted value for this die size is used first, even if values for other
	# die sizes are queued ahead of it; a sizeless value is used only at the head.
	for i in range(queue.size()):
		var q: Dictionary = queue[i]
		var d := int(q.get("d", 0))
		if d == sides or (d == 0 and i == 0):
			value = int(q.get("v", 1))
			forced = true
			queue.remove_at(i)
			break
	if not forced:
		value = rng.randi_range(1, sides)
	var entry := {"seq": log.size() + 1, "d": sides, "v": value, "purpose": purpose, "forced": forced}
	if value < 1 or value > sides:
		entry["invalid"] = true
	log.append(entry)
	return value

func last_seq() -> int:
	return log.size()

func entry(seq: int) -> Dictionary:
	if seq < 1 or seq > log.size():
		return {}
	return log[seq - 1]

## Rolls a formula such as "8d6", "1d8+3", "2d6+MOD" or "1d4+WIS".
## `mods` maps named modifiers (MOD, STR, DEX, ...) to integers.
## When `crit` is true the number of dice doubles (5e critical hit).
func roll_formula(formula: String, mods: Dictionary = {}, purpose: String = "", crit: bool = false) -> Dictionary:
	var f := formula.replace(" ", "").to_upper()
	var dice_part := f
	var flat := 0
	var flat_terms: Array = []
	var plus := f.find("+")
	var minus := f.find("-")
	var cut := -1
	if plus >= 0 and (minus < 0 or plus < minus):
		cut = plus
	elif minus >= 0:
		cut = minus
	if cut >= 0:
		dice_part = f.substr(0, cut)
		var rest := f.substr(cut)
		var term := ""
		var sign := 1
		for i in range(rest.length()):
			var c := rest[i]
			if c == "+" or c == "-":
				if term != "":
					flat += sign * _term_value(term, mods)
					flat_terms.append(("+" if sign > 0 else "-") + term)
				term = ""
				sign = 1 if c == "+" else -1
			else:
				term += c
		if term != "":
			flat += sign * _term_value(term, mods)
			flat_terms.append(("+" if sign > 0 else "-") + term)
	var count := 0
	var sides := 0
	if dice_part.find("D") >= 0:
		var parts := dice_part.split("D")
		count = int(parts[0]) if parts[0] != "" else 1
		sides = int(parts[1])
	elif dice_part != "":
		flat += int(dice_part)
	if crit:
		count *= 2
	var rolls: Array = []
	var dice_total := 0
	for i in range(count):
		var v := roll(sides, purpose)
		rolls.append({"seq": last_seq(), "v": v})
		dice_total += v
	return {
		"formula": formula,
		"dice": "%dd%d" % [count, sides] if count > 0 else "",
		"rolls": rolls,
		"dice_total": dice_total,
		"modifier": flat,
		"total": dice_total + flat,
		"crit": crit,
	}

func _term_value(term: String, mods: Dictionary) -> int:
	if term.is_valid_int():
		return int(term)
	return int(mods.get(term, 0))
