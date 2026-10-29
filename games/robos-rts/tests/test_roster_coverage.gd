extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var data = root.get_node("RTSData")
	var failures: Array = []
	var unit_constants = load("res://tests/test_unit_contracts.gd").get_script_constant_map()
	var combat_constants = load("res://tests/test_combat_abilities.gd").get_script_constant_map()
	var economy_constants = load("res://tests/test_economy_abilities.gd").get_script_constant_map()
	var matrix_constants = load("res://tests/test_matchup_matrix.gd").get_script_constant_map()
	var covered_units: Array = unit_constants.COVERED_UNITS.duplicate()
	var covered_abilities: Array = combat_constants.COVERED_ABILITIES.duplicate()
	covered_abilities.append_array(economy_constants.COVERED_ABILITIES)
	for kind in data.units:
		if not covered_units.has(kind):
			failures.append("Unit missing behavioral contracts: " + kind)
		if data.units[kind].has("weapon") and not unit_constants.WEAPONS.has(kind):
			failures.append("Unit missing weapon contracts: " + kind)
		for ability in data.units[kind].get("abilities", []):
			if not data.abilities.has(ability):
				failures.append("Unit declares an unknown ability: " + kind + "/" + ability)
	for kind in covered_units:
		if not data.units.has(kind):
			failures.append("Stale unit contract: " + kind)
	for ability in data.abilities:
		if not covered_abilities.has(ability):
			failures.append("Ability missing behavioral contracts: " + ability)
	for ability in covered_abilities:
		if not data.abilities.has(ability):
			failures.append("Stale ability contract: " + ability)
	var manifest = JSON.parse_string(FileAccess.get_file_as_string("res://tests/data/matchup_expectations.json"))
	var pair_keys: Array = []
	for row in manifest.matchups:
		var key: String = row[0] + "/" + row[1]
		if pair_keys.has(key):
			failures.append("Duplicate matchup: " + key)
		pair_keys.append(key)
		if row[2] not in [row[0],row[1]] or row[3] > row[4] or row[5] <= 0 or row[5] > row[6]:
			failures.append("Invalid outcome envelope: " + key)
	var matrix_units: Array = matrix_constants.COVERED_UNITS
	for i in range(matrix_units.size()):
		for j in range(i,matrix_units.size()):
			var key: String = matrix_units[i] + "/" + matrix_units[j]
			if not pair_keys.has(key):
				failures.append("Missing matchup: " + key)
	if pair_keys.size() != matrix_units.size() * (matrix_units.size()+1)/2:
		failures.append("Unexpected extra matchup expectations")
	print(JSON.stringify({"suite": "roster_coverage", "units": covered_units, "abilities": covered_abilities,
		"passives": combat_constants.COVERED_PASSIVES, "matchup_pairs": pair_keys.size(), "failures": failures}))
	quit(0 if failures.is_empty() else 1)
