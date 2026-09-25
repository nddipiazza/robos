extends RefCounted
## Parses .feature files into runnable scenarios for the in-game demo runner.
## Supports Feature, Rule, Background (feature and rule level), Scenario,
## Scenario Outline + Examples, tags, data tables and doc strings. Outlines are
## expanded into one scenario per Examples row, named the way behave names them.

static func parse_file(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	return parse(f.get_as_text(), path)

static func parse(text: String, path: String = "") -> Dictionary:
	var lines := text.split("\n")
	var feature := {"name": "", "description": [], "tags": [], "path": path, "scenarios": [], "background": []}
	var pending_tags: Array = []
	var rule_background: Array = []
	var in_rule := false
	var cur: Dictionary = {}          # current scenario / outline / background block
	var cur_kind := ""                # "background", "rule_background", "scenario", "outline"
	var last_step: Dictionary = {}
	var in_doc := false
	var doc_lines: Array = []
	var doc_indent := 0
	var examples_header: Array = []
	var in_examples := false
	var outline_examples: Array = []
	var desc_target := "feature"
	var i := 0
	while i < lines.size():
		var raw: String = lines[i]
		var line := raw.strip_edges()
		i += 1
		if in_doc:
			if line.begins_with('"""'):
				in_doc = false
				last_step["text"] = "\n".join(doc_lines)
			else:
				doc_lines.append(raw.substr(min(doc_indent, raw.length() - raw.strip_edges(true, false).length())) if raw.length() > 0 else "")
			continue
		if line == "" or line.begins_with("#"):
			continue
		if line.begins_with('"""'):
			in_doc = true
			doc_lines = []
			doc_indent = raw.length() - raw.strip_edges(true, false).length()
			continue
		if line.begins_with("@"):
			for t in line.split(" ", false):
				if t.begins_with("@"):
					pending_tags.append(t.substr(1))
			continue
		if line.begins_with("|"):
			var cells := _cells(line)
			if in_examples:
				if examples_header.is_empty():
					examples_header = cells
				else:
					var row := {}
					for k in range(examples_header.size()):
						row[examples_header[k]] = cells[k] if k < cells.size() else ""
					outline_examples.append(row)
			elif not last_step.is_empty():
				if not last_step.has("table"):
					last_step["table"] = {"headings": cells, "rows": []}
				else:
					last_step["table"]["rows"].append(cells)
			continue
		var kw := _keyword(line)
		if kw == "Feature":
			feature["name"] = line.substr(line.find(":") + 1).strip_edges()
			feature["tags"] = pending_tags
			pending_tags = []
			desc_target = "feature"
			continue
		if kw == "Rule":
			_close(feature, cur, cur_kind, outline_examples, rule_background)
			cur = {}
			cur_kind = ""
			in_rule = true
			rule_background = []
			in_examples = false
			desc_target = ""
			continue
		if kw == "Background":
			_close(feature, cur, cur_kind, outline_examples, rule_background)
			cur = {"steps": []}
			cur_kind = "rule_background" if in_rule else "background"
			in_examples = false
			desc_target = ""
			continue
		if kw == "Scenario" or kw == "Scenario Outline":
			_close(feature, cur, cur_kind, outline_examples, rule_background)
			outline_examples = []
			cur = {"name": line.substr(line.find(":") + 1).strip_edges(), "steps": [], "tags": feature["tags"] + pending_tags,
				"description": [], "line": i, "rule_background": rule_background.duplicate(true)}
			pending_tags = []
			cur_kind = "outline" if kw == "Scenario Outline" else "scenario"
			in_examples = false
			desc_target = "scenario"
			continue
		if kw == "Examples":
			in_examples = true
			examples_header = []
			continue
		if kw in ["Given", "When", "Then", "And", "But", "*"]:
			desc_target = ""
			if cur.is_empty():
				continue
			last_step = {"keyword": kw, "name": line.substr(kw.length()).strip_edges()}
			cur["steps"].append(last_step)
			continue
		# Free text: a description line
		if desc_target == "feature":
			feature["description"].append(line)
		elif desc_target == "scenario" and not cur.is_empty():
			cur["description"].append(line)
	_close(feature, cur, cur_kind, outline_examples, rule_background)
	# Resolve And/But to the preceding step type and attach backgrounds
	for sc in feature["scenarios"]:
		var all_steps: Array = []
		for s in feature["background"]:
			all_steps.append(s.duplicate(true))
		for s in sc["rule_background"]:
			all_steps.append(s.duplicate(true))
		for s in sc["steps"]:
			all_steps.append(s)
		var last_type := "given"
		for s in all_steps:
			match s["keyword"]:
				"Given":
					last_type = "given"
				"When":
					last_type = "when"
				"Then":
					last_type = "then"
			s["type"] = last_type
		sc["steps"] = all_steps
		sc.erase("rule_background")
	return feature

static func _close(feature: Dictionary, cur: Dictionary, kind: String, examples: Array, rule_background: Array) -> void:
	if cur.is_empty():
		return
	match kind:
		"background":
			feature["background"] = cur["steps"]
		"rule_background":
			rule_background.clear()
			rule_background.append_array(cur["steps"])
			# Scenarios in this rule are created after the background, so they pick it up
		"scenario":
			feature["scenarios"].append(cur)
		"outline":
			var n := 0
			for row in examples:
				n += 1
				var sc: Dictionary = cur.duplicate(true)
				var name: String = _sub(cur["name"], row)
				sc["name"] = "%s -- @1.%d " % [name, n]
				sc["outline"] = cur["name"]
				sc["example"] = row
				for s in sc["steps"]:
					s["name"] = _sub(s["name"], row)
					if s.has("text"):
						s["text"] = _sub(s["text"], row)
					if s.has("table"):
						var t: Dictionary = s["table"]
						t["headings"] = t["headings"].map(func(h): return _sub(h, row))
						for r in range(t["rows"].size()):
							t["rows"][r] = t["rows"][r].map(func(c): return _sub(c, row))
				feature["scenarios"].append(sc)

static func _sub(text: String, row: Dictionary) -> String:
	var out := text
	for k in row:
		out = out.replace("<%s>" % k, str(row[k]))
	return out

static func _cells(line: String) -> Array:
	var inner := line.strip_edges()
	inner = inner.substr(1, inner.length() - 2)
	var out: Array = []
	for c in inner.split("|"):
		out.append(c.strip_edges())
	return out

static func _keyword(line: String) -> String:
	for kw in ["Scenario Outline:", "Scenario Template:", "Scenario:", "Example:", "Feature:", "Background:", "Examples:", "Scenarios:", "Rule:"]:
		if line.begins_with(kw):
			match kw:
				"Scenario Template:":
					return "Scenario Outline"
				"Example:":
					return "Scenario"
				"Scenarios:":
					return "Examples"
			return kw.trim_suffix(":")
	for kw in ["Given ", "When ", "Then ", "And ", "But ", "* "]:
		if line.begins_with(kw):
			return kw.strip_edges()
	return ""
