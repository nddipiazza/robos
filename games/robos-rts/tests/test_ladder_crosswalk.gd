extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var data := root.get_node("RTSData")
	var audit: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://balance/ladder-audit-5.0.17.json"))
	var failures := []
	var known := {}
	var mapped := 0
	for row in audit.rows:
		var key := str(row.get("source_entity", "")) + "/" + str(row.id)
		if known.has(key):
			failures.append("Duplicate crosswalk row: %s" % key)
		known[key] = true
		if row.starfall == null:
			if row.status != "unmapped" or row.has("evidence"):
				failures.append("Unmapped entity has an implementation claim: %s" % key)
			continue
		mapped += 1
		if not data.units.has(row.starfall) and not data.abilities.has(row.starfall):
			failures.append("Unknown Starfall counterpart: %s -> %s" % [key, row.starfall])
	for row in audit.rows:
		for dependency in row.get("requires", []):
			if not known.has("/" + str(dependency)):
				failures.append("Unknown dependency on %s: %s" % [row.id, dependency])
	if audit.rows.size() != 460:
		failures.append("The audited entity and weapon total changed")
	print(JSON.stringify({"mapped": mapped, "unmapped": audit.rows.size() - mapped, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
