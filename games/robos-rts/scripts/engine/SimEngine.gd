extends Node

# SimEngine.gd — Deterministic 64Hz RTS Simulation Engine (fixed-step, seeded, renderer-independent)
# Supports 3 Factions:
# - HUMANS ("humans" / Meridian Guard): Surge Injector, Retract/Extend Provision Silos, Howitzers, Pioneer Construction
# - MONSTERS ("monsters" / Gnarl Brood): High-speed Skitterling packs, Bile Crawlers, Blight Hurlers
# - ALIENS ("aliens" / Aurelian Concord): Regenerating Aegis Shields, Skirmisher Phase Step teleport, Sunblade Charge, Prism Beam Spire Walker

signal simulation_ticked(tick: int)
signal unit_spawned(unit: Dictionary)
signal unit_destroyed(unit: Dictionary)
signal projectile_fired(from_pos: Vector2, to_pos: Vector2, weapon_name: String, is_splash: bool, owner_id: int)
signal unit_phased(from_pos: Vector2, to_pos: Vector2, unit_tag: int)
signal scenario_loaded(scenario_name: String)
signal paused_step
signal notice(owner_id: int, text: String, kind: String)
signal unit_damaged(owner_id: int, pos: Vector2)
signal weapon_attack(attacker: Dictionary, target: Dictionary, weapon: Dictionary, hit_shields: bool)
signal ability_triggered(unit: Dictionary, ability_id: String, pos: Vector2)
signal resource_gathered(unit: Dictionary, resource_type: String, pos: Vector2)
signal resource_depleted(owner_id: int, resource_type: String)
signal unit_production_finished(unit: Dictionary, structure: Dictionary)
signal structure_construction_finished(structure: Dictionary)
signal match_finished

const TICK_RATE: int = 64
const TICK_DT: float = 1.0 / float(TICK_RATE)
const SPATIAL_CELL_SIZE: float = 8.0
const PATH_CELL_SIZE: float = 2.0
const FOOTPRINT_BIN_SIZE := 8.0
const INFANTRY_CLEARANCE := 1.0
const HEAVY_CLEARANCE := 2.0
const NO_FOOTPRINTS: Array = []
const HARVEST_REACH := 1.2
const GAS_WORKER_SLOTS := 3
const INCOME_WINDOW := 60
const CRYSTAL_LINE_RADIUS := 26.0
const CONSTRUCTION_REFUND := 0.75
const REPAIR_HP_PER_SECOND := 12.0
const AUTO_REPAIR_RADIUS := 8.0
const MAX_RALLY_WAYPOINTS := 8
const MAX_UPGRADE_LEVEL := 3
const HUB_ENERGY_MAX := 200.0
const HUB_POWER_COST := 50.0
const SWEEP_RADIUS := 16.0
const SWEEP_TICKS := 10 * TICK_RATE
const SALVAGE_TICKS := 5 * TICK_RATE
const REINFORCED_SUPPLY := 8
const BROOD_SLOTS := 3
const BROOD_RECHARGE := 12.0
const POWER_RADIUS := 18.0
const CLOAK_ENERGY_MAX := 100.0
const CLOAK_START_ENERGY := 25.0
const CLOAK_DRAIN := 4.0
const SKIRMISH_MAPS := {"frontier-hunters": "Frontier Hunters", "iron-narrows": "Iron Narrows"}
const Vision = preload("res://scripts/engine/RTSVision.gd")
const VISION_UPDATE_TICKS := 8

var tick: int = 0
var sim_time: float = 0.0
var rng_seed: int = 42
var rng: RandomNumberGenerator = RandomNumberGenerator.new()
var paused: bool = false
var decor_enabled: bool = true
var last_step_count: int = 1
var rts_mode: String = "human"
var sim_speed: float = 1.0
var manual_step_requests: int = 0

var map_width: float = 128.0
var map_height: float = 96.0
var scenario_name: String = "Starfall Canyon — Humans vs Monsters vs Aliens"

var terrain_obstacles: Array[Rect2] = []
var high_ground_zones: Array[Rect2] = []
var ramps: Array[Rect2] = []
var water_polygons: Array[PackedVector2Array] = []
var land_bridges: Array[Rect2] = []
var water_cells: Dictionary = {}
var unlimited_resources: bool = false
var terrain_tiles: Array = []

var players: Dictionary = {}
var next_tag: int = 1001
var units: Dictionary = {}
var resources: Dictionary = {}
var spatial_grid: Dictionary = {}
var _spatial_by_owner: Dictionary = {}
var astar_grid: AStarGrid2D = AStarGrid2D.new()
var nav_dirty: bool = true

var recent_events: Array[Dictionary] = []
var command_history: Array[Dictionary] = []
var _accum_time: float = 0.0

# Map Editor <-> playtest handoff: holds the editor document while RTSMain playtests it.
var editor_session: Dictionary = {}
var startup_complete := false
var resume_from_title := false
var title_battle_view: Dictionary = {}
var match_state: Dictionary = {}
var _skirmish_source: Dictionary = {}
var vision: Vision
var frame_sim_usec: int = 0
var frame_sim_ticks: int = 0
var profile_usec: Dictionary = {"navigation": 0, "orders": 0, "steering": 0, "ai": 0}
var _static_structures: Array[Dictionary] = []
var _footprint_bins: Dictionary = {}
var _heavy_grid: AStarGrid2D
var _cliff_grid: AStarGrid2D
var _max_unit_radius: float = 4.5
var _town_halls: Array[Dictionary] = []
var _detectors: Array[Dictionary] = []
var _gas_source_by_tap: Dictionary = {}
var _gas_tap_by_vent: Dictionary = {}
var _income_buckets: Dictionary = {}

func _ready() -> void:
	var env_mode = OS.get_environment("RTS_MODE")
	if env_mode != "":
		rts_mode = env_mode.to_lower()
	elif DisplayServer.get_name() == "headless":
		rts_mode = "backend"
	rng.seed = rng_seed
	call_deferred("_load_startup_scenario")

func _load_startup_scenario() -> void:
	startup_complete = true
	var scene := get_tree().current_scene
	if scene and scene.has_method("waiting_on_title") and scene.waiting_on_title():
		scenario_name = "Starfall Command"
		paused = true
		return
	var args = OS.get_cmdline_user_args()
	for arg in args:
		if arg.begins_with("--scenario="):
			var res = load_scenario_file(arg.split("=", true, 1)[1])
			if bool(res.get("ok", false)):
				return
			push_warning("[SimEngine] %s" % res.get("error", "Failed to load scenario"))
	load_default_scenario()

func _process(delta: float) -> void:
	frame_sim_usec = 0
	frame_sim_ticks = 0
	if rts_mode == "backend" or paused or match_state.get("status", "") == "finished":
		return
	var started = Time.get_ticks_usec()
	# Keep input/rendering responsive when fast-forward or a slow capture exhausts
	# the CPU. The fixed simulation tick is unchanged; overload slows wall-clock
	# playback instead of creating an unbounded catch-up frame.
	_accum_time = minf(_accum_time + delta * sim_speed, 1.0)
	var max_steps = 64
	var steps = 0
	while _accum_time >= TICK_DT and steps < max_steps:
		_accum_time -= TICK_DT
		step_ticks(1)
		steps += 1
		if Time.get_ticks_usec() - started >= 8000:
			break
	frame_sim_usec = Time.get_ticks_usec() - started
	frame_sim_ticks = steps

func reset_state(new_seed: int = 42, width: float = 128.0, height: float = 96.0) -> void:
	tick = 0
	sim_time = 0.0
	rng_seed = new_seed
	rng.seed = rng_seed
	map_width = width
	map_height = height
	next_tag = 1001
	units.clear()
	resources.clear()
	_footprint_bins.clear()
	_income_buckets.clear()
	nav_dirty = true
	spatial_grid.clear()
	terrain_obstacles.clear()
	high_ground_zones.clear()
	ramps.clear()
	water_polygons.clear()
	land_bridges.clear()
	water_cells.clear()
	unlimited_resources = false
	terrain_tiles.clear()
	recent_events.clear()
	command_history.clear()
	match_state.clear()
	resume_from_title = false
	title_battle_view.clear()
	_skirmish_source = {}
	vision = null
	_accum_time = 0.0
	sim_speed = 1.0
	manual_step_requests = 0
	paused = false
	decor_enabled = true

	var default_factions = {
		1: {"name": "Humans (Meridian Guard)", "faction": "humans"},
		2: {"name": "Monsters (Gnarl Brood)", "faction": "monsters"},
		3: {"name": "Aliens (Aurelian Concord)", "faction": "aliens"}
	}
	players.clear()
	for pid in [1, 2, 3]:
		players[pid] = {
			"id": pid,
			"name": default_factions[pid]["name"],
			"faction": default_factions[pid]["faction"],
			"crystal": 400,
			"aether": 150,
			"supply_used": 0,
			"supply_cap": 0,
			"upgrades": {"weapons": 0, "armor": 0},
			"crystal_collected": 0,
			"aether_collected": 0,
			"units_killed": 0,
			"units_trained": 0,
			"units_lost": 0,
			"structures_built": 0,
			"stutter_step_cancels": 0,
			"phase_steps_executed": 0
		}
	_rebuild_astar_grid()

func load_default_scenario() -> void:
	load_scenario_file("frontier-hunters")

func load_legacy_scenario() -> void:
	reset_state(42, 128.0, 96.0)
	scenario_name = "Starfall Canyon — Humans vs Monsters vs Aliens"

	terrain_obstacles.append(Rect2(60.0, 0.0, 6.0, 34.0))
	terrain_obstacles.append(Rect2(60.0, 62.0, 6.0, 34.0))
	high_ground_zones.append(Rect2(0.0, 0.0, 60.0, 96.0))
	ramps.append(Rect2(56.0, 34.0, 14.0, 28.0))

	# Player 1: HUMANS (Meridian Guard) at West High Ground
	spawn_unit("colony_hub", 1, Vector2(20.0, 48.0))
	spawn_unit("silo", 1, Vector2(34.0, 34.0))
	spawn_unit("silo", 1, Vector2(34.0, 62.0))
	spawn_unit("muster_hall", 1, Vector2(36.0, 48.0))
	spawn_unit("workshop", 1, Vector2(28.0, 66.0))

	for i in range(6):
		spawn_resource("crystal_field", Vector2(10.0, 33.0 + i * 5.5), 1500)
	spawn_resource("aether_vent", Vector2(14.0, 68.0), 2250)
	spawn_unit("aether_tap", 1, Vector2(14.0, 68.0))

	for i in range(6):
		var pioneer = spawn_unit("pioneer", 1, Vector2(15.0, 35.0 + i * 3.8))
		issue_SmartHarvest(pioneer["tag"])

	for i in range(6):
		var row = i / 3
		var col = i % 3
		spawn_unit("rifleman", 1, Vector2(44.0 + col * 2.2, 43.0 + row * 2.5))
	spawn_unit("breacher", 1, Vector2(48.0, 50.0))
	spawn_unit("howitzer", 1, Vector2(41.0, 48.0))

	# Player 2: MONSTERS (Gnarl Brood) at South-East Low Ground
	spawn_unit("brood_nest", 2, Vector2(106.0, 68.0))
	for i in range(4):
		spawn_resource("crystal_field", Vector2(118.0, 58.0 + i * 5.5), 1500)
	for i in range(4):
		var forager = spawn_unit("forager", 2, Vector2(112.0, 60.0 + i * 4.0))
		issue_SmartHarvest(forager["tag"])
	for i in range(8):
		var row = i / 4
		var col = i % 4
		spawn_unit("skitterling", 2, Vector2(84.0 + col * 2.2, 56.0 + row * 2.5))
	spawn_unit("bile_crawler", 2, Vector2(92.0, 60.0))
	spawn_unit("blight_hurler", 2, Vector2(94.0, 65.0))

	# Player 3: ALIENS (Aurelian Concord) at North-East Outpost
	spawn_unit("heartstone", 3, Vector2(104.0, 22.0))
	spawn_unit("resonator", 3, Vector2(92.0, 20.0))
	spawn_unit("waystone", 3, Vector2(90.0, 28.0))
	for i in range(3):
		spawn_resource("crystal_field", Vector2(116.0, 14.0 + i * 5.5), 1500)
	for i in range(3):
		var mote = spawn_unit("mote", 3, Vector2(110.0, 16.0 + i * 4.0))
		issue_SmartHarvest(mote["tag"])
	spawn_unit("sunblade", 3, Vector2(80.0, 26.0))
	spawn_unit("sunblade", 3, Vector2(80.0, 30.0))
	spawn_unit("skirmisher", 3, Vector2(84.0, 24.0))
	spawn_unit("skirmisher", 3, Vector2(84.0, 28.0))
	spawn_unit("spire_walker", 3, Vector2(88.0, 26.0))

	_rebuild_astar_grid()
	_recompute_supplies()
	emit_signal("scenario_loaded", scenario_name)

func load_scenario_dict(data: Dictionary) -> Dictionary:
	if str(data.get("mode", "")) == "skirmish":
		return _load_skirmish(data)
	var s_seed = int(data.get("seed", 42))
	var map_cfg = data.get("map", {})
	var w = float(map_cfg.get("width", 128.0))
	var h = float(map_cfg.get("height", 96.0))
	reset_state(s_seed, w, h)
	scenario_name = str(data.get("name", data.get("rdfs:label", "Custom RTS Scenario")))
	paused = bool(data.get("paused", false))
	decor_enabled = bool(data.get("decor", true))
	unlimited_resources = bool(data.get("unlimited_resources", false))
	_configure_water(map_cfg)
	if data.get("victory", "") == "all_structures":
		players.erase(3)
		match_state = {"mode": "annihilation_fixture", "status": "playing", "winner": 0, "reason": ""}

	for obs in map_cfg.get("obstacles", []):
		terrain_obstacles.append(Rect2(
			float(obs.get("x", 0.0)),
			float(obs.get("y", 0.0)),
			float(obs.get("w", obs.get("width", 4.0))),
			float(obs.get("h", obs.get("height", 4.0)))
		))
	for hg in map_cfg.get("high_ground", []):
		high_ground_zones.append(Rect2(
			float(hg.get("x", 0.0)),
			float(hg.get("y", 0.0)),
			float(hg.get("w", 20.0)),
			float(hg.get("h", 20.0))
		))
	for rmp in map_cfg.get("ramps", []):
		ramps.append(Rect2(
			float(rmp.get("x", 0.0)),
			float(rmp.get("y", 0.0)),
			float(rmp.get("w", 10.0)),
			float(rmp.get("h", 10.0))
		))

	var p_cfg = data.get("players", {})
	for pid_key in p_cfg.keys():
		var pid = int(pid_key)
		if players.has(pid):
			var pd = p_cfg[pid_key]
			players[pid]["crystal"] = int(pd.get("crystal", 400))
			players[pid]["aether"] = int(pd.get("aether", 150))
			if pd.has("faction"):
				players[pid]["faction"] = str(pd["faction"])

	for res in data.get("resources", []):
		spawn_resource(
			str(res.get("type", "crystal_field")),
			Vector2(float(res.get("x", 20.0)), float(res.get("y", 20.0))),
			int(res.get("amount", 1500)),
			str(res.get("id", "")),
			bool(res.get("rich", false))
		)

	for u in data.get("units", []):
		var count = int(u.get("count", 1))
		var base_x = float(u.get("x", 30.0))
		var base_y = float(u.get("y", 30.0))
		var utype = str(u.get("type", "rifleman"))
		var owner_id = int(u.get("owner", u.get("player", 1)))
		var spread = float(u.get("spread", 2.1))
		var cols = max(1, int(ceil(sqrt(float(count)))))
		for idx in range(count):
			var r = idx / cols
			var c = idx % cols
			var pos = Vector2(base_x + c * spread, base_y + r * spread) if count > 1 else Vector2(base_x, base_y)
			var spawned = spawn_unit(utype, owner_id, pos, str(u.get("id", "")) if count == 1 else "", float(u.get("build_progress", 1.0)))
			if u.has("hp"):
				spawned["hp"] = float(u.get("hp"))
			if u.has("shields"):
				spawned["shields"] = float(u.get("shields"))
			if bool(u.get("auto_harvest", false)):
				issue_SmartHarvest(spawned["tag"])

	_rebuild_astar_grid()
	_recompute_supplies()
	RTSCommanderAI.configure_from_scenario(data.get("directives", []))
	_start_vision(bool(data.get("fog_of_war", false)))
	emit_signal("scenario_loaded", scenario_name)
	return {"ok": true, "scenario": scenario_name, "unit_count": units.size()}

# Resolves a scenario slug (`scenarios/<slug>.jsonld|.json`) or an explicit file path and loads it.
func resolve_scenario_path(slug_or_path: String) -> String:
	if FileAccess.file_exists(slug_or_path):
		return slug_or_path
	for ext in [".jsonld", ".json"]:
		var candidate = "res://scenarios/%s%s" % [slug_or_path, ext]
		if FileAccess.file_exists(candidate):
			return candidate
	return ""

func load_scenario_file(slug_or_path: String) -> Dictionary:
	var file_path = resolve_scenario_path(slug_or_path)
	if file_path == "":
		return {"ok": false, "error": "Scenario file not found: " + slug_or_path}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(file_path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"ok": false, "error": "Scenario is not a JSON object: " + file_path}
	return load_scenario_dict(parsed)

func start_skirmish(map_id: String = "frontier-hunters", options: Dictionary = {}) -> Dictionary:
	if not SKIRMISH_MAPS.has(map_id):
		return {"ok": false, "error": "Unknown skirmish map."}
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://scenarios/%s.jsonld" % map_id))
	for key in ["seed", "difficulty", "strategy", "unlimited_resources", "player_faction", "ai_faction"]:
		if options.has(key):
			data[key] = options[key]
	return _load_skirmish(data)

# Only the two assigned seats participate; unoccupied sites are expansions.
# A provided seed replays the same assignment; ordinary new games use fresh seeds.
func _load_skirmish(data: Dictionary) -> Dictionary:
	var map_cfg: Dictionary = data.get("map", {})
	var starts: Array = map_cfg.get("starts", [])
	var difficulty = str(data.get("difficulty", "normal"))
	var strategy = str(data.get("strategy", "balanced"))
	var player_faction := str(data.get("player_faction", RTSData.FACTION_HUMANS))
	var ai_faction := str(data.get("ai_faction", RTSData.FACTION_HUMANS))
	var faction_ids: Array = RTSData.faction_info.keys()
	for choice in [player_faction, ai_faction]:
		if choice != "random" and not RTSData.faction_info.has(choice):
			return {"ok": false, "error": "Unknown skirmish faction."}
	if starts.size() < 2 or starts.size() > 8 or not difficulty in ["easy", "normal", "hard"] or not strategy in ["rush", "balanced", "economy", "siege"]:
		return {"ok": false, "error": "Expected 2–8 starts and a supported difficulty/strategy"}
	var match_seed = int(data.get("seed", Time.get_unix_time_from_system() * 1000.0 + Time.get_ticks_msec()))
	reset_state(match_seed, float(map_cfg.get("width", 256)), float(map_cfg.get("height", 256)))
	_skirmish_source = data.duplicate(true)
	_skirmish_source["seed"] = match_seed
	unlimited_resources = bool(data.get("unlimited_resources", true))
	_configure_water(map_cfg)
	players.erase(3)
	scenario_name = str(data.get("name", "Frontier Hunters — 1 Player vs AI"))
	var slots: Array = range(starts.size())
	for i in range(starts.size() - 1, 0, -1):
		var j = rng.randi_range(0, i)
		var temp = slots[i]
		slots[i] = slots[j]
		slots[j] = temp
	# Faction rolls do not change which starting sites a given seed selects.
	var faction_rng := RandomNumberGenerator.new()
	faction_rng.seed = match_seed ^ 0x348ba701
	var rolled := [faction_ids[faction_rng.randi_range(0, faction_ids.size() - 1)], faction_ids[faction_rng.randi_range(0, faction_ids.size() - 1)]]
	var choices := {"1": player_faction, "2": ai_faction}
	var factions := {"1": rolled[0] if player_faction == "random" else player_faction,
		"2": rolled[1] if ai_faction == "random" else ai_faction}
	match_state = {"mode": "1p_vs_ai", "status": "playing", "winner": 0, "reason": "", "seed": match_seed,
		"map_id": str(data.get("map_id", "custom")),
		"difficulty": difficulty, "strategy": strategy, "unlimited_resources": unlimited_resources,
		"starts": starts.duplicate(true), "expansions": map_cfg.get("expansions", []).duplicate(true),
		"assigned_starts": {"1": slots[0], "2": slots[1]}, "factions": factions, "faction_choices": choices}
	for obs in map_cfg.get("obstacles", []):
		terrain_obstacles.append(Rect2(float(obs.x), float(obs.y), float(obs.w), float(obs.h)))
	var resource_sites = starts + map_cfg.get("expansions", [])
	var crystal_lines := {}
	var crystal_stock := 50000 if unlimited_resources else 1500
	var aether_stock := 50000 if unlimited_resources else 2250
	for slot in range(resource_sites.size()):
		var site: Dictionary = resource_sites[slot]
		var base = Vector2(float(site.x), float(site.y))
		var outward = (base - Vector2(map_width, map_height) * 0.5).normalized()
		var tangent = Vector2(-outward.y, outward.x)
		for i in range(8):
			var patch := spawn_resource("crystal_field", _resource_land_position(base + outward * 13.0 + tangent * (float(i) - 3.5) * 3.6), crystal_stock, "start_%d_crystal_%d" % [slot, i])
			patch["line_origin"] = base
			if i == 0:
				crystal_lines[slot] = patch
		for side in [-1, 1]:
			spawn_resource("aether_vent", _resource_land_position(base + tangent * side * 17.0), aether_stock, "start_%d_aether_%d" % [slot, side])
	if data.has("resources"):
		resources.clear()
		crystal_lines.clear()
		next_tag = 1001
		for resource in data.resources:
			spawn_resource(str(resource.type), Vector2(float(resource.x), float(resource.y)), int(resource.get("amount", 1500)), str(resource.get("id", "")), bool(resource.get("rich", false)))
	for pid in [1, 2]:
		var faction: String = factions[str(pid)]
		var roster: Dictionary = RTSData.faction_info[faction]
		players[pid]["faction"] = faction
		players[pid]["name"] = "Commander" if pid == 1 else "AI Commander"
		players[pid]["crystal"] = 50
		players[pid]["aether"] = 0
		var start: Dictionary = starts[slots[pid - 1]]
		var base = Vector2(float(start.x), float(start.y))
		spawn_unit(roster.town_hall, pid, base)
		for i in range(12):
			var angle = TAU * float(i) / 12.0
			var worker = spawn_unit(roster.worker, pid, base + Vector2(cos(angle), sin(angle)) * 7.0)
			issue_SmartHarvest(worker.tag, crystal_lines.get(slots[pid - 1], {}))
	_rebuild_astar_grid()
	_recompute_supplies()
	RTSCommanderAI.configure_from_scenario([])
	RTSCommanderAI.set_skirmish_directive(2, difficulty, strategy)
	_start_vision(bool(data.get("fog_of_war", true)))
	emit_signal("scenario_loaded", scenario_name)
	return {"ok": true, "scenario": scenario_name, "match": match_state.duplicate(true)}

func _start_vision(enabled: bool) -> void:
	if enabled:
		vision = Vision.new(map_width, map_height, players.keys())
		if not high_ground_zones.is_empty() or not ramps.is_empty():
			vision.configure_elevation(get_elevation_at)
		vision.update(units, tick)

func can_see_position(player: int, pos: Vector2) -> bool:
	return vision == null or player == 0 or vision.state_at(player, pos) == Vision.VISIBLE

func can_see_unit(player: int, unit: Dictionary) -> bool:
	if player == 0 or unit.owner == player:
		return true
	if not can_see_position(player, unit.pos):
		return false
	if not unit.get("cloaked", false):
		return true
	if vision != null and vision.sweep_detects(player, unit.pos):
		return true
	for detector in _detectors:
		if detector.owner == player and detector.hp > 0.0 and detector.build_progress >= 1.0:
			var radius: float = detector.detection_radius
			if unit.pos.distance_squared_to(detector.pos) <= radius * radius:
				return true
	return false

func remembered_buildings(player: int) -> Array:
	if vision == null:
		return []
	return vision.buildings_for(player).filter(func(building): return not can_see_position(player, building.pos))

func _check_match_result() -> void:
	if match_state.get("status", "") != "playing":
		return
	var remaining = {1: 0, 2: 0}
	for u in units.values():
		if u.is_structure and u.hp > 0 and remaining.has(u.owner):
			remaining[u.owner] += 1
	if remaining[1] == 0 or remaining[2] == 0:
		var winner = 0 if remaining[1] == 0 and remaining[2] == 0 else (2 if remaining[1] == 0 else 1)
		_finish_match(winner, "all_structures_destroyed")

func surrender(player_id: int) -> Dictionary:
	if match_state.get("status", "") != "playing" or not player_id in [1, 2]:
		return {"ok": false, "error": "No active match for that player"}
	_finish_match(3 - player_id, "surrender")
	return {"ok": true, "match": match_state.duplicate(true)}

func rematch() -> Dictionary:
	if _skirmish_source.is_empty() or match_state.get("status") != "finished":
		return {"ok": false, "error": "Finish a skirmish before starting a same-seed rematch."}
	var speed := sim_speed
	var result := _load_skirmish(_skirmish_source)
	sim_speed = speed
	return result

func _finish_match(winner: int, reason: String) -> void:
	match_state["status"] = "finished"
	match_state["winner"] = winner
	match_state["reason"] = reason
	match_state["finished_tick"] = tick
	var scores := {}
	for owner in players:
		var row := {}
		for stat in ["crystal_collected", "aether_collected", "units_trained", "units_lost", "structures_built"]:
			row[stat] = players[owner][stat]
		scores[str(owner)] = row
	match_state["scorecard"] = scores
	emit_signal("notice", 1, "Victory" if winner == 1 else ("Draw" if winner == 0 else "Defeat"), "info")
	emit_signal("match_finished")

func _can_build(worker: Dictionary, structure_type: String, pos: Vector2) -> bool:
	var def = RTSData.get_unit_def(structure_type)
	if not worker.is_worker or not bool(def.get("is_structure", false)) or def.get("faction", "") != worker.faction:
		return false
	for required in def.get("requires", []):
		var found = false
		for u in units.values():
			if u.owner == worker.owner and u.unit_type == required and u.build_progress >= 1.0:
				found = true
		if not found:
			return false
	if requires_power(structure_type) and not is_powered(worker.owner, pos):
		return false
	return can_place_structure(structure_type, pos)

func requires_power(structure_type: String) -> bool:
	return structure_type == "waystone" and not match_state.is_empty()

func is_powered(owner_id: int, pos: Vector2) -> bool:
	for unit in units.values():
		if unit.unit_type == "resonator" and unit.owner == owner_id and unit.build_progress >= 1.0 and unit.pos.distance_squared_to(pos) <= POWER_RADIUS * POWER_RADIUS:
			return true
	return false

func uses_brood_slots(unit: Dictionary) -> bool:
	return unit.unit_type == "brood_nest" and not match_state.is_empty()

func can_place_structure(structure_type: String, pos: Vector2) -> bool:
	var def = RTSData.get_unit_def(structure_type)
	if def.is_empty():
		return false
	var radius = float(def.get("radius", 2.0))
	if is_water_at(pos, radius):
		return false
	var extractor := bool(def.get("is_extractor", false))
	if extractor:
		var vent_found = false
		for res in resources.values():
			if res.resource_type == "aether_vent" and pos.distance_to(res.pos) <= 0.5:
				vent_found = true
		if not vent_found:
			return false
	if pos.x < radius + 1 or pos.y < radius + 1 or pos.x > map_width - radius - 1 or pos.y > map_height - radius - 1:
		return false
	for obs in terrain_obstacles:
		if obs.grow(radius).has_point(pos):
			return false
	for u in units.values():
		if u.is_structure and pos.distance_to(u.pos) < radius + float(u.radius) + 1.0:
			return false
	for res in resources.values():
		if not deposit_present(res):
			continue
		if pos.distance_to(res.pos) < radius + float(res.radius) + 0.5:
			if not extractor or res.resource_type != "aether_vent":
				return false
	return true

func is_build_tile_blocked(point: Vector2, player: int, allowed_vent: Vector2 = Vector2.INF) -> bool:
	if not can_see_position(player, point) or is_water_at(point):
		return true
	if not Rect2(0, 0, map_width, map_height).has_point(point):
		return true
	for obstacle in terrain_obstacles:
		if obstacle.has_point(point):
			return true
	for footprint in _footprint_bins.get(_footprint_bin(point), NO_FOOTPRINTS):
		if point.distance_squared_to(footprint.pos) >= footprint.radius * footprint.radius:
			continue
		if footprint.has("resource_type"):
			if deposit_present(footprint) and (footprint.resource_type != "aether_vent" or footprint.pos.distance_squared_to(allowed_vent) > 0.25):
				return true
		elif can_see_unit(player, footprint):
			return true
	return false

func _configure_water(map_cfg: Dictionary) -> void:
	terrain_tiles = map_cfg.get("terrain_tiles", []).duplicate(true)
	for bridge in map_cfg.get("bridges", []):
		land_bridges.append(Rect2(float(bridge.x), float(bridge.y), float(bridge.w), float(bridge.h)))
	for channel in map_cfg.get("water_channels", []):
		var points = PackedVector2Array()
		for point in channel.get("points", []):
			points.append(Vector2(float(point[0]), float(point[1])))
		if points.size() >= 2:
			for polygon in Geometry2D.offset_polyline(points, float(channel.get("width", 10)) * 0.5, Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
				water_polygons.append(polygon)
	for x in range(int(ceil(map_width / PATH_CELL_SIZE))):
		for y in range(int(ceil(map_height / PATH_CELL_SIZE))):
			var pos = Vector2(x + 0.5, y + 0.5) * PATH_CELL_SIZE
			var on_bridge = false
			for bridge in land_bridges:
				if bridge.has_point(pos):
					on_bridge = true
			if on_bridge:
				continue
			for polygon in water_polygons:
				if Geometry2D.is_point_in_polygon(pos, polygon):
					water_cells[Vector2i(x, y)] = true
					break
	for tile in terrain_tiles:
		var rect = Rect2(float(tile.x), float(tile.y), 4, 4)
		for x in range(int(rect.position.x / PATH_CELL_SIZE), int(rect.end.x / PATH_CELL_SIZE)):
			for y in range(int(rect.position.y / PATH_CELL_SIZE), int(rect.end.y / PATH_CELL_SIZE)):
				if tile.terrain == "water":
					water_cells[Vector2i(x, y)] = true
				else:
					water_cells.erase(Vector2i(x, y))
	for kind in ["water", "cliff", "plateau"]:
		for rect in merged_terrain_rects(kind):
			match kind:
				"water":
					water_polygons.append(PackedVector2Array([rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)]))
				"cliff":
					terrain_obstacles.append(rect)
				"plateau":
					high_ground_zones.append(rect)

# Compile brush cells into rectangles so a large bucket fill does not create
# thousands of terrain meshes or repeated shoreline geometry.
func merged_terrain_rects(kind: String) -> Array[Rect2]:
	var mask: Dictionary = {}
	for tile in terrain_tiles:
		if str(tile.terrain) == kind:
			mask[Vector2i(int(float(tile.x) / 4.0), int(float(tile.y) / 4.0))] = true
	var result: Array[Rect2] = []
	for y in range(int(ceil(map_height / 4.0))):
		for x in range(int(ceil(map_width / 4.0))):
			if not mask.has(Vector2i(x, y)):
				continue
			var width = 1
			while mask.has(Vector2i(x + width, y)):
				width += 1
			var height = 1
			var extend = true
			while extend:
				for dx in range(width):
					if not mask.has(Vector2i(x + dx, y + height)):
						extend = false
						break
				if extend:
					height += 1
			for dx in range(width):
				for dy in range(height):
					mask.erase(Vector2i(x + dx, y + dy))
			result.append(Rect2(x * 4, y * 4, width * 4, height * 4))
	return result

func is_water_at(pos: Vector2, radius: float = 0.0) -> bool:
	for x in range(int(floor((pos.x - radius) / PATH_CELL_SIZE)), int(floor((pos.x + radius) / PATH_CELL_SIZE)) + 1):
		for y in range(int(floor((pos.y - radius) / PATH_CELL_SIZE)), int(floor((pos.y + radius) / PATH_CELL_SIZE)) + 1):
			if water_cells.has(Vector2i(x, y)):
				var nearest = Vector2(clampf(pos.x, x * PATH_CELL_SIZE, (x + 1) * PATH_CELL_SIZE), clampf(pos.y, y * PATH_CELL_SIZE, (y + 1) * PATH_CELL_SIZE))
				if nearest.distance_squared_to(pos) <= radius * radius:
					return true
	return false

func _resource_land_position(pos: Vector2) -> Vector2:
	if not is_water_at(pos, 3.0):
		return pos
	for radius in range(2, 24, 2):
		for i in range(16):
			var candidate = pos + Vector2.from_angle(TAU * float(i) / 16.0) * radius
			if candidate.x > 4 and candidate.y > 4 and candidate.x < map_width - 4 and candidate.y < map_height - 4 and not is_water_at(candidate, 3.0):
				return candidate
	return pos

func spawn_resource(res_type: String, pos: Vector2, amount: int = 1500, custom_id: String = "", rich: bool = false) -> Dictionary:
	var tag = next_tag
	next_tag += 1
	var r = {
		"tag": tag,
		"id": custom_id if custom_id != "" else "%s_%d" % [res_type, tag],
		"resource_type": res_type,
		"pos": pos,
		"amount": amount,
		"rich": rich,
		"radius": 1.8 if res_type == "crystal_field" else 2.6,
		"mining_worker": 0
	}
	resources[tag] = r
	nav_dirty = true
	return r

func deposit_present(deposit: Dictionary) -> bool:
	return unlimited_resources or deposit.resource_type != "crystal_field" or deposit.amount > 0

func deposit_yield(deposit: Dictionary) -> int:
	if deposit.resource_type == "crystal_field":
		return 7 if deposit.rich else 5
	return 6 if deposit.rich else 4

func spawn_unit(unit_type: String, owner_id: int, pos: Vector2, custom_id: String = "", build_progress: float = 1.0) -> Dictionary:
	var def = RTSData.get_unit_def(unit_type)
	if def.is_empty():
		push_warning("[SimEngine] Unknown unit_type: " + unit_type)
		return {}

	var tag = next_tag
	next_tag += 1
	var max_hp = float(def.get("max_hp", 45.0))
	var max_shields = float(def.get("max_shields", 0.0))
	var start_hp = max_hp if build_progress >= 1.0 else max(10.0, max_hp * build_progress)
	var start_shields = max_shields if build_progress >= 1.0 else max_shields * build_progress

	var u = {
		"tag": tag,
		"id": custom_id if custom_id != "" else "%s_%d" % [unit_type, tag],
		"unit_type": unit_type.to_lower(),
		"name": str(def.get("name", unit_type)),
		"faction": str(def.get("faction", "humans")),
		"owner": owner_id,
		"pos": pos,
		"prev_pos": pos,
		"vel": Vector2.ZERO,
		"facing": 0.0 if owner_id == 1 else PI,
		"hp": start_hp,
		"max_hp": max_hp,
		"shields": start_shields,
		"max_shields": max_shields,
		"out_of_combat_timer": 10.0,
		"armor": float(def.get("armor", 0.0)),
		"radius": float(def.get("radius", 0.85)),
		"speed": float(def.get("speed", 7.0)),
		"sight_range": float(def.get("sight_range", 20.0)),
		"push_priority": int(def.get("push_priority", 1)),
		"is_structure": bool(def.get("is_structure", false)),
		"is_extractor": bool(def.get("is_extractor", false)),
		"is_walkable_structure": bool(def.get("is_walkable_structure", false)),
		"is_worker": bool(def.get("is_worker", false)),
		"is_immobile": bool(def.get("is_immobile", false)),
		"armed_structure": bool(def.get("is_structure", false)) and def.has("weapon"),
		"detection_radius": float(def.get("detection_radius", 0.0)),
		"attributes": def.get("attributes", []).duplicate(),
		"orders": [],
		"path": [],
		"home_pos": pos,
		"has_home_pos": true,
		"pushed_timer": 0.0,
		"attack_state": "idle",
		"attack_state_timer": 0.0,
		"attack_target_tag": 0,
		"weapon_cooldown": 0.0,
		"surge_timer": 0.0,
		"charge_timer": 0.0,
		"phase_cooldown": 0.0,
		"slow_timer": 0.0,
		"cargo_type": "",
		"cargo_amount": 0,
		"harvest_timer": 0.0,
		"harvest_target_tag": 0,
		"energy": _starting_energy(unit_type),
		"build_progress": build_progress,
		"build_total_time": float(def.get("build_time", 20.0)),
		"production_queue": [],
		"rally_route": [],
		"kills": 0,
		"damage_dealt": 0.0
	}
	if unit_type == "brood_nest":
		u["brood_slots"] = BROOD_SLOTS
		u["brood_recharge"] = 0.0
		u["worker_rally_route"] = []
	units[tag] = u
	if u.detection_radius > 0.0:
		_detectors.append(u)
	if u["is_structure"]:
		nav_dirty = true
	_recompute_supplies()
	emit_signal("unit_spawned", u)
	return u

func _starting_energy(unit_type: String) -> float:
	match unit_type:
		"colony_hub": return HUB_POWER_COST
		"skirmisher": return 75.0
	return 0.0

func get_elevation_at(pos: Vector2) -> float:
	for rmp in ramps:
		if rmp.has_point(pos):
			var t = clampf((pos.x - rmp.position.x) / max(1.0, rmp.size.x), 0.0, 1.0)
			return lerp(2.2, 0.0, t)
	for hg in high_ground_zones:
		if hg.has_point(pos):
			return 2.2
	return 0.0

func step_ticks(count: int = 1) -> void:
	last_step_count = count
	if paused:
		emit_signal("paused_step")
	for _i in range(count):
		if match_state.get("status", "") == "finished":
			break
		_step_single_tick()

func _step_single_tick() -> void:
	tick += 1
	sim_time = float(tick) * TICK_DT

	if nav_dirty:
		_rebuild_astar_grid()
		nav_dirty = false

	_rebuild_spatial_grid()

	if tick % 8 == 0:
		var ai_started = Time.get_ticks_usec()
		RTSCommanderAI.step_ai(TICK_DT * 8.0)
		profile_usec.ai += Time.get_ticks_usec() - ai_started

	_update_structures(TICK_DT)

	var all_tags = units.keys()
	all_tags.sort()
	var orders_started = Time.get_ticks_usec()
	var mineral_walkers := {}
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u = units[tag]
		u["prev_pos"] = u["pos"]
		_update_unit_timers(u, TICK_DT)
		if u.is_structure and (not u.armed_structure or u.build_progress < 1.0):
			continue
		_update_unit_orders(u, TICK_DT)
		if u.is_worker and not u.orders.is_empty() and u.orders[0].type in ["harvest", "return_cargo"]:
			var deposit: Dictionary = resources.get(int(u.orders[0].target_tag), {})
			if u.cargo_type == "crystal" or (u.orders[0].type == "harvest" and u.cargo_amount == 0 and deposit.get("resource_type") == "crystal_field"):
				mineral_walkers[tag] = true

	profile_usec.orders += Time.get_ticks_usec() - orders_started
	var steering_started = Time.get_ticks_usec()
	_apply_steering_and_push_resolution(all_tags, TICK_DT, mineral_walkers)
	profile_usec.steering += Time.get_ticks_usec() - steering_started
	if vision != null and tick % VISION_UPDATE_TICKS == 0:
		vision.update(units, tick)
	_check_match_result()
	emit_signal("simulation_ticked", tick)

func _rebuild_astar_grid() -> void:
	_static_structures.clear()
	_footprint_bins.clear()
	_heavy_grid = null
	_cliff_grid = null
	_detectors.clear()
	_town_halls.clear()
	_gas_source_by_tap.clear()
	_gas_tap_by_vent.clear()
	for deposit in resources.values():
		if deposit_present(deposit):
			_index_footprint(deposit)
	for u in units.values():
		if u.detection_radius > 0.0:
			_detectors.append(u)
		if u.is_structure and bool(RTSData.get_unit_def(u.unit_type).get("is_town_hall", false)):
			_town_halls.append(u)
		if u.is_extractor:
			for resource in resources.values():
				if resource.resource_type == "aether_vent" and resource.pos.distance_squared_to(u.pos) < 1.0:
					_gas_source_by_tap[u.tag] = resource.tag
					_gas_tap_by_vent[Vector2i(u.owner, resource.tag)] = u.tag
		if u["is_structure"] and not u["is_walkable_structure"]:
			_static_structures.append(u)
			_index_footprint(u)
		else:
			u.path.clear()
	_fill_navigation_grid(astar_grid, INFANTRY_CLEARANCE, false)

func _index_footprint(footprint: Dictionary) -> void:
	var reach := Vector2.ONE * (float(footprint.radius) + HEAVY_CLEARANCE + 0.1)
	var first := _footprint_bin(footprint.pos - reach)
	var last := _footprint_bin(footprint.pos + reach)
	for x in range(first.x, last.x + 1):
		for y in range(first.y, last.y + 1):
			var cell := Vector2i(x, y)
			if not _footprint_bins.has(cell):
				_footprint_bins[cell] = []
			_footprint_bins[cell].append(footprint)

func _footprint_bin(pos: Vector2) -> Vector2i:
	return Vector2i(floori(pos.x / FOOTPRINT_BIN_SIZE), floori(pos.y / FOOTPRINT_BIN_SIZE))

func _fill_navigation_grid(grid: AStarGrid2D, clearance: float, ignore_cliffs: bool) -> void:
	grid.clear()
	grid.region = Rect2i(0, 0, ceili(map_width / PATH_CELL_SIZE), ceili(map_height / PATH_CELL_SIZE))
	grid.cell_size = Vector2.ONE * PATH_CELL_SIZE
	grid.offset = grid.cell_size * 0.5
	grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	grid.update()
	if not ignore_cliffs:
		for obs in terrain_obstacles:
			var expanded := obs.grow(clearance * 0.7)
			var first := Vector2i(((expanded.position - grid.offset) / PATH_CELL_SIZE).ceil())
			var last := Vector2i(((expanded.end - grid.offset) / PATH_CELL_SIZE).ceil())
			grid.fill_solid_region(Rect2i(first, last - first).intersection(grid.region))
		for cell in water_cells:
			grid.set_point_solid(cell)
	for footprint in resources.values():
		if deposit_present(footprint):
			_mark_footprint(grid, footprint, clearance)
	for footprint in _static_structures:
		_mark_footprint(grid, footprint, clearance)

func _mark_footprint(grid: AStarGrid2D, footprint: Dictionary, clearance: float) -> void:
	var reach := float(footprint.radius) + clearance + 0.15
	var first := _path_cell(grid, footprint.pos - Vector2.ONE * reach)
	var last := _path_cell(grid, footprint.pos + Vector2.ONE * reach)
	for x in range(first.x, last.x + 1):
		for y in range(first.y, last.y + 1):
			var cell := Vector2i(x, y)
			if grid.get_point_position(cell).distance_squared_to(footprint.pos) < reach * reach:
				grid.set_point_solid(cell)

func _navigation_grid(radius: float, ignore_cliffs: bool) -> AStarGrid2D:
	if ignore_cliffs:
		if _cliff_grid == null:
			_cliff_grid = AStarGrid2D.new()
			_fill_navigation_grid(_cliff_grid, HEAVY_CLEARANCE, true)
		return _cliff_grid
	if radius > INFANTRY_CLEARANCE:
		if _heavy_grid == null:
			_heavy_grid = AStarGrid2D.new()
			_fill_navigation_grid(_heavy_grid, HEAVY_CLEARANCE, false)
		return _heavy_grid
	return astar_grid

func _path_cell(grid: AStarGrid2D, pos: Vector2) -> Vector2i:
	return Vector2i(pos / PATH_CELL_SIZE).clamp(Vector2i.ZERO, grid.region.size - Vector2i.ONE)

func compute_smooth_path(start_pos: Vector2, end_pos: Vector2, unit_radius: float = 0.85, ignore_cliffs: bool = false, interaction_reach: float = INF) -> Array[Vector2]:
	var started = Time.get_ticks_usec()
	var result = _compute_smooth_path(start_pos, end_pos, unit_radius, ignore_cliffs, interaction_reach)
	profile_usec.navigation += Time.get_ticks_usec() - started
	return result

func _compute_smooth_path(start_pos: Vector2, end_pos: Vector2, unit_radius: float, ignore_cliffs: bool, interaction_reach: float) -> Array[Vector2]:
	if not end_pos.is_finite():
		return [start_pos]
	var goal := _project_destination(start_pos, end_pos, unit_radius, ignore_cliffs)
	if interaction_reach < INF and goal.distance_to(end_pos) >= interaction_reach - 0.12:
		goal = _interaction_destination(start_pos, end_pos, goal, unit_radius, interaction_reach, ignore_cliffs)
	if _has_clear_line_of_walk(start_pos, goal, unit_radius, ignore_cliffs):
		return [goal]

	var grid := _navigation_grid(unit_radius, ignore_cliffs)
	var start := _find_nearest_walkable_cell(grid, start_pos, start_pos)
	var end := _find_nearest_walkable_cell(grid, goal, start_pos)
	if grid.is_point_solid(start) or grid.is_point_solid(end):
		return [start_pos]
	var waypoints := grid.get_point_path(start, end, true)
	if waypoints.is_empty():
		return [start_pos]
	if waypoints[-1] == grid.get_point_position(end) and _has_clear_line_of_walk(waypoints[-1], goal, unit_radius, ignore_cliffs):
		waypoints.append(goal)

	var smoothed: Array[Vector2] = []
	var anchor: Vector2 = start_pos
	var idx := -1
	while idx < waypoints.size() - 1:
		var furthest = idx + 1
		# Grow visibility probes exponentially, then bisect the blocked interval.
		# Reverse-scanning a long cross-map path repeated hundreds of ray tests.
		var stride = 2
		var blocked = waypoints.size()
		while idx + stride < waypoints.size():
			var probe = idx + stride
			if not _has_clear_line_of_walk(anchor, waypoints[probe], unit_radius, ignore_cliffs):
				blocked = probe
				break
			furthest = probe
			stride *= 2
		var low = furthest + 1
		var high = mini(blocked - 1, waypoints.size() - 1)
		while low <= high:
			var probe = (low + high) / 2
			if _has_clear_line_of_walk(anchor, waypoints[probe], unit_radius, ignore_cliffs):
				furthest = probe
				low = probe + 1
			else:
				high = probe - 1
		if furthest == idx + 1 and not _has_clear_line_of_walk(anchor, waypoints[furthest], unit_radius, ignore_cliffs):
			# An authored spawn can overlap a footprint. Let it step out to its first cell.
			if idx >= 0 or not _is_point_blocked_by_static(anchor, unit_radius, ignore_cliffs):
				break
		smoothed.append(waypoints[furthest])
		anchor = waypoints[furthest]
		idx = furthest
		if idx == waypoints.size() - 1:
			break
	return [start_pos] if smoothed.is_empty() else smoothed

func _interaction_destination(from: Vector2, target: Vector2, fallback: Vector2, radius: float, reach: float, ignore_cliffs: bool) -> Vector2:
	# A neighboring deposit can block the direct approach even though the assigned
	# patch has open gathering space along its sides.
	var angle := (from - target).angle()
	var first_open := Vector2.INF
	for i in range(16):
		var turn := ((i + 1) / 2) * (1 if i % 2 == 1 else -1)
		var candidate := target + Vector2.from_angle(angle + float(turn) * TAU / 16.0) * (reach - 0.25)
		if _is_point_blocked_by_static(candidate, radius, ignore_cliffs):
			continue
		if _has_clear_line_of_walk(from, candidate, radius, ignore_cliffs):
			return candidate
		if not first_open.is_finite():
			first_open = candidate
	return first_open if first_open.is_finite() else fallback

func _project_destination(from: Vector2, requested: Vector2, radius: float, ignore_cliffs: bool) -> Vector2:
	var goal := _map_clamped_position(requested, radius)
	if not _is_point_blocked_by_static(goal, radius, ignore_cliffs):
		return goal
	# Search back from the click so a large obstacle uses the edge facing the unit.
	var distance := goal.distance_to(from)
	var steps := maxi(1, ceili(distance / PATH_CELL_SIZE))
	var blocked := goal
	for i in range(1, steps + 1):
		var point := goal.lerp(from, float(i) / float(steps))
		if _is_point_blocked_by_static(point, radius, ignore_cliffs):
			blocked = point
			continue
		for _probe in range(5):
			var middle := point.lerp(blocked, 0.5)
			if _is_point_blocked_by_static(middle, radius, ignore_cliffs):
				blocked = middle
			else:
				point = middle
		return point
	return goal

func _find_nearest_walkable_cell(grid: AStarGrid2D, pos: Vector2, approach: Vector2) -> Vector2i:
	var cell := _path_cell(grid, pos)
	if not grid.is_point_solid(cell):
		return cell
	var size := grid.region.size
	var best := cell
	var best_distance := INF
	var best_approach := INF
	for radius in range(1, maxi(size.x, size.y)):
		for side in [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]:
			var along := Vector2i(-side.y, side.x)
			for offset in range(-radius, radius):
				var candidate: Vector2i = cell + side * radius + along * offset
				if not grid.region.has_point(candidate) or grid.is_point_solid(candidate):
					continue
				var point := grid.get_point_position(candidate)
				var distance := point.distance_squared_to(pos)
				var from_distance := point.distance_squared_to(approach)
				if distance < best_distance or (is_equal_approx(distance, best_distance) and from_distance < best_approach):
					best = candidate
					best_distance = distance
					best_approach = from_distance
		if best != cell:
			return best
	return cell

func _has_clear_line_of_walk(a: Vector2, b: Vector2, radius: float, ignore_cliffs: bool = false) -> bool:
	var dist = a.distance_to(b)
	var steps = maxi(1, ceili(dist / (PATH_CELL_SIZE * 0.6)))
	for i in range(1, steps + 1):
		var p = a.lerp(b, float(i) / float(steps))
		if _is_point_blocked_by_static(p, radius, ignore_cliffs):
			return false
	return true

func _is_point_blocked_by_static(p: Vector2, radius: float, ignore_cliffs: bool = false) -> bool:
	if p.x < radius or p.y < radius or p.x > map_width - radius or p.y > map_height - radius:
		return true
	if not ignore_cliffs:
		if is_water_at(p, radius * 0.5):
			return true
		for obs in terrain_obstacles:
			if obs.grow(radius * 0.7).has_point(p):
				return true
	for footprint in _footprint_bins.get(_footprint_bin(p), NO_FOOTPRINTS):
		var reach := float(footprint.radius) + radius
		if p.distance_squared_to(footprint.pos) < reach * reach:
			return true
	return false

func _rebuild_spatial_grid() -> void:
	spatial_grid.clear()
	_spatial_by_owner.clear()
	_max_unit_radius = 0.0
	for tag in units.keys():
		var u = units[tag]
		_max_unit_radius = maxf(_max_unit_radius, u.radius)
		var cell = Vector2i(int(floor(u["pos"].x / SPATIAL_CELL_SIZE)), int(floor(u["pos"].y / SPATIAL_CELL_SIZE)))
		if not spatial_grid.has(cell):
			spatial_grid[cell] = []
		spatial_grid[cell].append(tag)
		if not _spatial_by_owner.has(u.owner):
			_spatial_by_owner[u.owner] = {}
		var owner_grid: Dictionary = _spatial_by_owner[u.owner]
		if not owner_grid.has(cell):
			owner_grid[cell] = []
		owner_grid[cell].append(tag)

func query_units_in_radius(center: Vector2, radius: float, exclude_owner: int = 0) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var reach = radius + _max_unit_radius
	var x0 = int(floor((center.x - reach) / SPATIAL_CELL_SIZE))
	var x1 = int(floor((center.x + reach) / SPATIAL_CELL_SIZE))
	var y0 = int(floor((center.y - reach) / SPATIAL_CELL_SIZE))
	var y1 = int(floor((center.y + reach) / SPATIAL_CELL_SIZE))
	var grids: Array = [spatial_grid]
	if exclude_owner != 0:
		grids.clear()
		for owner_id in _spatial_by_owner:
			if owner_id != exclude_owner:
				grids.append(_spatial_by_owner[owner_id])
	for grid_value in grids:
		var grid: Dictionary = grid_value
		for x in range(x0, x1 + 1):
			for y in range(y0, y1 + 1):
				var cell = Vector2i(x, y)
				if grid.has(cell):
					for tag in grid[cell]:
						if units.has(tag):
							var u: Dictionary = units[tag]
							var combined_radius: float = radius + u["radius"]
							if center.distance_squared_to(u["pos"]) <= combined_radius * combined_radius:
								result.append(u)
	return result

func _update_structures(dt: float) -> void:
	for u in units.values():
		if not u["is_structure"]:
			continue
		if u["build_progress"] < 1.0:
			if bool(u.get("auto_summon", false)):
				var rate = dt / maxf(1.0, float(u.build_total_time) * build_time_scale())
				u.build_progress = minf(1.0, u.build_progress + rate)
				u.hp = minf(u.max_hp, u.hp + u.max_hp * rate)
				if u.build_progress >= 1.0:
					players[u.owner].structures_built += 1
					_recompute_supplies()
					emit_signal("structure_construction_finished", u)
			continue
		if u.unit_type == "colony_hub":
			u.energy = minf(HUB_ENERGY_MAX, u.energy + 0.75 * dt)
		var salvage_finish: int = u.get("salvage_finish", 0)
		if salvage_finish > 0 and tick >= salvage_finish:
			var definition: Dictionary = RTSData.get_unit_def(u.unit_type)
			var cost: Vector2i = u.get("construction_cost", Vector2i(definition.crystal_cost, definition.aether_cost))
			_refund_structure(u, cost)
			emit_signal("notice", u.owner, "%s salvaged." % u.name, "info")
			continue
		var queue: Array = u["production_queue"]
		var brood := uses_brood_slots(u)
		if brood and u.brood_slots < BROOD_SLOTS:
			u.brood_recharge += dt
			if u.brood_recharge >= BROOD_RECHARGE:
				u.brood_recharge = 0.0
				u.brood_slots += 1
		if queue.is_empty() or (requires_power(u.unit_type) and not is_powered(u.owner, u.pos)):
			continue
		var completed := 0
		for index in range(queue.size() if brood else 1):
			var item: Dictionary = queue[index]
			item.progress += dt
			if item.progress >= item.total_time:
				completed += 1
		if completed == 0:
			continue
		var finished: Array[Dictionary] = []
		for index in range((queue.size() if brood else 1) - 1, -1, -1):
			if queue[index].progress >= queue[index].total_time:
				finished.push_front(queue.pop_at(index))
		for item in finished:
			_finish_production(u, item)

func _finish_production(structure: Dictionary, item: Dictionary) -> void:
	if item.has("upgrade"):
		players[structure.owner].upgrades[item.upgrade] = item.level
		notice.emit(structure.owner, "%s level %d complete." % [str(item.upgrade).capitalize(), item.level], "info")
		return
	var utype: String = item.unit_type
	var is_worker := bool(RTSData.get_unit_def(utype).get("is_worker", false))
	var route: Array = structure.rally_route
	if structure.unit_type == "brood_nest" and is_worker:
		route = structure.worker_rally_route
	var first := default_rally_position(structure)
	if not route.is_empty():
		first = rally_waypoint_position(route.front())
	var spawn_pos := _rally_spawn_position(structure, first)
	var new_unit := spawn_unit(utype, structure.owner, spawn_pos)
	if new_unit.is_empty():
		return
	players[structure.owner].units_trained += 1
	unit_production_finished.emit(new_unit, structure)
	if not route.is_empty():
		_apply_rally_route(new_unit, route)
	elif is_worker and not match_state.is_empty():
		issue_SmartHarvest(new_unit.tag)
	elif first.distance_to(structure.pos) > structure.radius + 1.5:
		issue_command([new_unit.tag], "move", first)

func _rally_spawn_position(structure: Dictionary, first: Vector2) -> Vector2:
	var direction: Vector2 = (first - structure.pos).normalized()
	if direction.is_zero_approx():
		direction = Vector2.RIGHT if structure.owner == 1 else Vector2.LEFT
	return structure.pos + direction * (structure.radius + 1.8)

func _update_unit_timers(u: Dictionary, dt: float) -> void:
	if u.unit_type == "skirmisher":
		if u.get("cloaked", false):
			u.energy = maxf(0.0, u.energy - CLOAK_DRAIN * dt)
			if u.energy <= 0.0:
				u["cloaked"] = false
		else:
			u.energy = minf(CLOAK_ENERGY_MAX, u.energy + dt)
	if u["surge_timer"] > 0.0:
		u["surge_timer"] = max(0.0, u["surge_timer"] - dt)
	if u["charge_timer"] > 0.0:
		u["charge_timer"] = max(0.0, u["charge_timer"] - dt)
	if u["phase_cooldown"] > 0.0:
		u["phase_cooldown"] = max(0.0, u["phase_cooldown"] - dt)
	if u["slow_timer"] > 0.0:
		u["slow_timer"] = max(0.0, u["slow_timer"] - dt)

	# Aegis Shield Regeneration (2.0 shields/sec after 3.5s out of combat)
	u["out_of_combat_timer"] += dt
	if u["max_shields"] > 0.0 and u["shields"] < u["max_shields"] and u["out_of_combat_timer"] >= 3.5:
		u["shields"] = min(u["max_shields"], u["shields"] + 6.0 * dt)

	var atk_speed_mult = 1.5 if u["surge_timer"] > 0.0 else 1.0
	if u["weapon_cooldown"] > 0.0:
		u["weapon_cooldown"] = max(0.0, u["weapon_cooldown"] - dt * atk_speed_mult)

	if u["pushed_timer"] > 0.0:
		u["pushed_timer"] = max(0.0, u["pushed_timer"] - dt)

func _update_unit_orders(u: Dictionary, dt: float) -> void:
	u["vel"] = Vector2.ZERO

	if u["attack_state"] == "windup":
		var target = units.get(u["attack_target_tag"], {})
		if target.is_empty() or target["hp"] <= 0.0 or not can_see_unit(u.owner, target):
			u["attack_state"] = "idle"
		else:
			u["attack_state_timer"] -= dt
			u["facing"] = (target["pos"] - u["pos"]).angle()
			if u["attack_state_timer"] <= 0.0:
				_execute_weapon_hit(u, target)
				var def = RTSData.get_unit_def(u["unit_type"])
				var wpn = def.get("weapon", {})
				u["weapon_cooldown"] = float(wpn.get("period", 0.8))
				u["attack_state"] = "backswing"
				u["attack_state_timer"] = float(wpn.get("backswing", 0.25))
			return

	elif u["attack_state"] == "backswing":
		u["attack_state_timer"] -= dt
		if u["attack_state_timer"] <= 0.0:
			u["attack_state"] = "idle"
		if u["orders"].size() > 0 and u["orders"][0]["type"] != "move":
			return

	if u["orders"].is_empty():
		if u.get("auto_repair", false) and tick % 8 == u.tag % 8 and _begin_auto_repair(u):
			return
		var enemy = _find_best_attack_target(u, u.is_structure)
		if not enemy.is_empty():
			var wpn_range = _get_weapon_range(u)
			var dist_edge = _edge_distance(u, enemy)
			if dist_edge <= wpn_range:
				_begin_attack_on(u, enemy)
				return
			elif not u["is_immobile"] and not u["is_worker"]:
				_approach_target(u, enemy["pos"], dt)
				return

		if u["has_home_pos"] and u["pushed_timer"] <= 0.0 and not u["is_immobile"]:
			var d_home = u["pos"].distance_to(u["home_pos"])
			if d_home > 0.35 and d_home < 6.0:
				_move_toward_point(u, u["home_pos"], dt)
		return

	var order = u["orders"][0]
	var otype = str(order.get("type", "move"))

	match otype:
		"move":
			var target_pos := _prepare_order_path(u, order)
			var arrival_rad: float = float(order.get("arrival_radius", 0.9))
			if u.path.size() == 1 and u.pos.distance_to(target_pos) <= arrival_rad:
				u["orders"].pop_front()
				u["path"].clear()
				u["home_pos"] = u["pos"]
				u["has_home_pos"] = true
			else:
				if _should_settle_in_group_arrival(u, target_pos, arrival_rad):
					u["orders"].pop_front()
					u["path"].clear()
					u["home_pos"] = u["pos"]
					u["has_home_pos"] = true
				else:
					_follow_path(u, dt)

		"hold_position":
			if u.orders.size() > 1:
				u.orders.pop_front()
				u.path.clear()
				return
			var enemy = _find_best_attack_target(u, true)
			if not enemy.is_empty():
				_begin_attack_on(u, enemy)

		"stop":
			_release_mining_slot(u)
			u.orders.pop_front()
			u.path.clear()
			u.home_pos = u.pos

		"attack_move", "patrol":
			if otype == "patrol" and not order.has("patrol_origin"):
				order["patrol_origin"] = u.pos
			var enemy = _find_best_attack_target(u, false)
			if not enemy.is_empty():
				var wpn_range = _get_weapon_range(u)
				if _edge_distance(u, enemy) <= wpn_range:
					_begin_attack_on(u, enemy)
				else:
					_approach_target(u, enemy["pos"], dt)
			else:
				var target_pos := _prepare_order_path(u, order)
				var arrival_rad: float = float(order.get("arrival_radius", 1.5))
				if u.path.size() == 1 and u.pos.distance_to(target_pos) <= arrival_rad:
					if otype == "patrol" and target_pos.distance_to(order.patrol_origin) > arrival_rad:
						order.target_pos = order.patrol_origin
						order.patrol_origin = target_pos
						u.path.clear()
					else:
						u["orders"].pop_front()
						u.path.clear()
						u["home_pos"] = u["pos"]
				else:
					_follow_path(u, dt)

		"attack_target", "force_attack":
			var t_tag = int(order.get("target_tag", 0))
			var enemy: Dictionary = units.get(t_tag, {})
			if enemy.is_empty() or not can_see_unit(u.owner, enemy):
				# Mobile units can continue to the last observed location of an enemy.
				if otype == "attack_target" and not u.is_immobile and order.has("target_pos") and (vision != null or not enemy.is_empty()):
					u.orders[0] = {"type": "attack_move", "target_pos": order.target_pos}
				else:
					u.orders.pop_front()
				u.path.clear()
				return
			if enemy.hp <= 0.0:
				u["orders"].pop_front()
				return
			order.target_pos = enemy.pos
			var wpn_range = _get_weapon_range(u)
			if _edge_distance(u, enemy) <= wpn_range:
				_begin_attack_on(u, enemy)
			elif not u["is_immobile"]:
				_approach_target(u, enemy["pos"], dt)
			elif u.armed_structure:
				u.orders.pop_front()

		"harvest":
			_process_worker_harvest_order(u, order, dt)

		"return_cargo":
			if _deliver_worker_cargo(u, dt, order.target_tag):
				u.orders.pop_front()
				u.path.clear()

		"follow":
			var leader: Dictionary = units.get(order.target_tag, {})
			if not _is_friendly_mobile(leader, u.owner):
				u.orders.pop_front()
				u.path.clear()
			elif _edge_distance(u, leader) > 1.5:
				if u.get("nav_goal", Vector2.INF).distance_squared_to(leader.pos) > 1.0:
					u.path.clear()
				_follow_order_path(u, leader.pos, dt)
			else:
				u.path.clear()
				if u.orders.size() > 1:
					u.orders.pop_front()

		"build":
			_process_worker_build_order(u, order, dt)

		"repair":
			_process_repair_order(u, order, dt)

func _release_mining_slot(worker: Dictionary) -> void:
	if worker.harvest_timer <= 0.0:
		return
	if not worker.orders.is_empty() and worker.orders[0].type == "harvest":
		var patch: Dictionary = resources.get(int(worker.orders[0].target_tag), {})
		if int(patch.get("mining_worker", 0)) == worker.tag:
			patch.mining_worker = 0
	worker.harvest_timer = 0.0

func _claim_mining_slot(worker: Dictionary, patch: Dictionary) -> bool:
	var holder: int = patch.mining_worker
	if holder == worker.tag:
		return true
	var miner: Dictionary = units.get(holder, {})
	if not miner.is_empty() and miner.hp > 0.0 and miner.cargo_amount == 0 and not miner.orders.is_empty():
		var active: Dictionary = miner.orders[0]
		if active.type == "harvest" and active.target_tag == patch.tag and _edge_distance(miner, patch) <= HARVEST_REACH:
			return false
	patch.mining_worker = worker.tag
	worker.harvest_timer = 0.0
	return true

func _deliver_worker_cargo(worker: Dictionary, dt: float, hall_tag: int = 0) -> bool:
	if worker.cargo_amount <= 0:
		return true
	var hall: Dictionary = units.get(hall_tag, {})
	if not is_dropoff(hall, worker.owner):
		hall = _find_nearest_town_hall(worker.owner, worker.pos)
	if hall.is_empty():
		return false
	if _edge_distance(worker, hall) > 1.6:
		_follow_order_path(worker, hall.pos, dt, worker.radius + hall.radius + 1.6)
		return false
	var player: Dictionary = players[worker.owner]
	var cargo: String = worker.cargo_type
	player[cargo] += worker.cargo_amount
	player[cargo + "_collected"] += worker.cargo_amount
	_record_income(worker.owner, cargo, worker.cargo_amount)
	worker.cargo_amount = 0
	worker.cargo_type = ""
	return true

func _record_income(owner_id: int, cargo: String, amount: int) -> void:
	if not _income_buckets.has(owner_id):
		_income_buckets[owner_id] = {}
	var buckets: Dictionary = _income_buckets[owner_id]
	var second := floori(sim_time)
	var slot := second % INCOME_WINDOW
	var sample: Dictionary = buckets.get(slot, {})
	if sample.get("second", -1) != second:
		sample = {"second": second, "crystal": 0, "aether": 0}
		buckets[slot] = sample
	sample[cargo] += amount

func recent_income(owner_id: int) -> Dictionary:
	var totals := {"crystal": 0, "aether": 0}
	var second := floori(sim_time)
	for sample in _income_buckets.get(owner_id, {}).values():
		if second - sample.second < INCOME_WINDOW:
			totals.crystal += sample.crystal
			totals.aether += sample.aether
	return totals

func _harvest_dropoff(worker: Dictionary, order: Dictionary) -> int:
	var previous: int = order.get("dropoff_tag", 0)
	if is_dropoff(units.get(previous, {}), worker.owner):
		return previous
	if previous == 0:
		var target: Dictionary = resources.get(order.target_tag, units.get(order.target_tag, {}))
		var hall := _find_nearest_town_hall(worker.owner, target.get("pos", worker.pos))
		order["dropoff_tag"] = hall.get("tag", 0)
		return order.dropoff_tag
	if tick < int(order.get("dropoff_retry", 0)):
		return -1
	var replacement := _reachable_dropoff(worker)
	if replacement.is_empty():
		order["dropoff_retry"] = tick + TICK_RATE
		return -1
	order.erase("dropoff_retry")
	order.dropoff_tag = replacement.tag
	var patch := _pick_local_crystal({"tag": worker.tag, "owner": worker.owner, "pos": replacement.pos}, _find_nearest_crystal(replacement.pos))
	if not patch.is_empty():
		_release_mining_slot(worker)
		order.target_tag = patch.tag
		worker.harvest_target_tag = patch.tag
		worker.path.clear()
	return replacement.tag

func _reachable_dropoff(worker: Dictionary) -> Dictionary:
	var nearest := {}
	var best_distance := INF
	for hall in _town_halls:
		if not is_dropoff(hall, worker.owner):
			continue
		var distance: float = worker.pos.distance_squared_to(hall.pos)
		if distance >= best_distance:
			continue
		var reach: float = worker.radius + hall.radius + 1.6
		var path := compute_smooth_path(worker.pos, hall.pos, worker.radius, false, reach)
		if path.back().distance_to(hall.pos) <= reach:
			nearest = hall
			best_distance = distance
	return nearest

func _process_worker_harvest_order(u: Dictionary, order: Dictionary, dt: float) -> void:
	var hall_tag := _harvest_dropoff(u, order)
	if hall_tag < 0:
		return
	var res_tag = int(order.get("target_tag", u["harvest_target_tag"]))
	if u["cargo_amount"] > 0:
		if _deliver_worker_cargo(u, dt, hall_tag) and u.orders.size() > 1:
			u.orders.pop_front()
			u.path.clear()
		return

	var target_entity: Dictionary = {}
	var is_gas: bool = false
	if resources.has(res_tag):
		target_entity = resources[res_tag]
		is_gas = (target_entity["resource_type"] == "aether_vent")
	elif units.has(res_tag) and units[res_tag].is_extractor:
		target_entity = units[res_tag]
		is_gas = true
	else:
		_release_mining_slot(u)
		var nearest_res := _pick_local_crystal(u, _find_nearest_crystal(u.pos))
		if nearest_res.is_empty():
			u["orders"].pop_front()
			return
		order["target_tag"] = nearest_res["tag"]
		res_tag = nearest_res.tag
		u["harvest_target_tag"] = nearest_res["tag"]
		target_entity = nearest_res

	var dist = u["pos"].distance_to(target_entity["pos"]) - (u["radius"] + float(target_entity.get("radius", 1.8)))
	var source_tag = res_tag
	if is_gas:
		# Links change only when structures change. Scanning the whole army and
		# every map deposit for each gas worker at 64 Hz dominated late-game CPU.
		var tap_tag = res_tag if units.has(res_tag) else int(_gas_tap_by_vent.get(Vector2i(u.owner, res_tag), 0))
		var extractor: Dictionary = units.get(tap_tag, {})
		if extractor.is_empty() or extractor.owner != u.owner:
			u.orders.pop_front()
			return
		if extractor.build_progress < 1.0:
			if dist > HARVEST_REACH:
				_follow_order_path(u, target_entity.pos, dt, u.radius + target_entity.radius + HARVEST_REACH)
			return
		source_tag = int(_gas_source_by_tap.get(tap_tag, res_tag))
	if resources.has(source_tag) and int(resources[source_tag].amount) <= 0 and not unlimited_resources:
		_release_mining_slot(u)
		u.orders.pop_front()
		if u.orders.is_empty():
			issue_SmartHarvest(u.tag)
		return
	if dist <= HARVEST_REACH:
		u["vel"] = Vector2.ZERO
		u["facing"] = (target_entity["pos"] - u["pos"]).angle()
		if not is_gas and not _claim_mining_slot(u, target_entity):
			u.harvest_timer = 0.0
			return
		var prev_timer: float = float(u["harvest_timer"])
		u["harvest_timer"] += dt
		if not is_gas and prev_timer <= 0.0 and u["harvest_timer"] > 0.0:
			if not resources.has(source_tag) or int(resources[source_tag].amount) > 0 or unlimited_resources:
				emit_signal("resource_gathered", u, "crystal", target_entity["pos"])
		if u["harvest_timer"] >= 1.75:
			_release_mining_slot(u)
			u.cargo_type = "aether" if is_gas else "crystal"
			var source: Dictionary = resources.get(source_tag, {})
			u.cargo_amount = deposit_yield(source) if not source.is_empty() else (4 if is_gas else 5)
			if resources.has(source_tag) and not unlimited_resources:
				u.cargo_amount = mini(u.cargo_amount, int(source.amount))
				source.amount -= u.cargo_amount
				if source.amount == 0:
					if not deposit_present(source):
						nav_dirty = true
					resource_depleted.emit(u.owner, source.resource_type)
	else:
		if not is_gas:
			_release_mining_slot(u)
		_follow_order_path(u, target_entity.pos, dt, u.radius + target_entity.radius + HARVEST_REACH)

func _process_worker_build_order(u: Dictionary, order: Dictionary, dt: float) -> void:
	var struct_type = str(order.get("structure_type", "silo"))
	var build_pos: Vector2 = order.get("target_pos", u["pos"])
	var struct_tag = int(order.get("structure_tag", 0))

	if struct_tag == 0:
		var s_def = RTSData.get_unit_def(struct_type)
		if not _can_build(u, struct_type, build_pos):
			u.orders.pop_front()
			return
		var build_rad = float(s_def.get("radius", 2.0))
		if u["pos"].distance_to(build_pos) <= build_rad + u["radius"] + 1.5:
			var m_cost = int(s_def.get("crystal_cost", 100))
			var v_cost = int(s_def.get("aether_cost", 0))
			var p = players[u["owner"]]
			if p["crystal"] >= m_cost and p["aether"] >= v_cost:
				p["crystal"] -= m_cost
				p["aether"] -= v_cost
				var s_unit = spawn_unit(struct_type, u["owner"], build_pos, "", 0.1)
				order["structure_tag"] = s_unit["tag"]
				s_unit["builder_tag"] = u.tag
				s_unit["construction_cost"] = Vector2i(m_cost, v_cost)
				# Alien Motes summon in structures automatically and are immediately free!
				if u["unit_type"] == "mote":
					s_unit["auto_summon"] = true
					u["orders"].pop_front()
				elif u.unit_type == "forager":
					s_unit["auto_summon"] = true
					s_unit["morph_worker"] = {"id": u.id, "hp": u.hp, "cargo_type": u.cargo_type, "cargo_amount": u.cargo_amount}
					_release_mining_slot(u)
					units.erase(u.tag)
					_recompute_supplies()
			else:
				emit_signal("notice", u["owner"], "Not enough %s to build." % ("crystal" if p["crystal"] < m_cost else "aether"), "error")
				u["orders"].pop_front()
		else:
			_approach_target(u, build_pos, dt)
	else:
		var s_unit: Dictionary = units.get(struct_tag, {})
		if not can_resume_construction(u, s_unit):
			u["orders"].pop_front()
			u.path.clear()
			return
		s_unit["builder_tag"] = u.tag
		var dist = _edge_distance(u, s_unit)
		if dist <= 1.8:
			u["vel"] = Vector2.ZERO
			u["facing"] = (s_unit["pos"] - u["pos"]).angle()
			var rate = dt / max(1.0, float(s_unit["build_total_time"]) * build_time_scale())
			s_unit["build_progress"] = min(1.0, s_unit["build_progress"] + rate)
			s_unit["hp"] = min(s_unit["max_hp"], s_unit["hp"] + s_unit["max_hp"] * rate)
			if s_unit["build_progress"] >= 1.0:
				players[u["owner"]]["structures_built"] += 1
				_recompute_supplies()
				emit_signal("notice", u["owner"], "%s complete." % s_unit["name"], "info")
				emit_signal("structure_construction_finished", s_unit)
				u["orders"].pop_front()
		else:
			_approach_target(u, s_unit["pos"], dt)

func can_resume_construction(worker: Dictionary, site: Dictionary) -> bool:
	if site.is_empty() or not site.is_structure or site.owner != worker.owner or site.faction != worker.faction:
		return false
	if not worker.is_worker or worker.is_immobile or site.build_progress >= 1.0 or site.get("auto_summon", false):
		return false
	var builder := construction_builder(site)
	return builder.is_empty() or builder.tag == worker.tag

func construction_builder(site: Dictionary) -> Dictionary:
	var builder: Dictionary = units.get(site.get("builder_tag", 0), {})
	if builder.is_empty() or builder.orders.is_empty() or site.build_progress >= 1.0 or site.get("auto_summon", false):
		return {}
	var order: Dictionary = builder.orders[0]
	return builder if order.type == "build" and int(order.get("structure_tag", 0)) == site.tag else {}

func _cancel_construction(site: Dictionary) -> bool:
	if not units.has(site.tag) or not site.is_structure or site.build_progress >= 1.0:
		return false
	var costs: Vector2i = site.get("construction_cost", Vector2i.ZERO)
	_refund_structure(site, costs)
	if site.has("morph_worker"):
		var worker = spawn_unit("forager", site.owner, site.pos, site.morph_worker.id)
		for key in ["hp", "cargo_type", "cargo_amount"]:
			worker[key] = site.morph_worker[key]
	emit_signal("notice", site.owner, "%s construction cancelled." % site.name, "info")
	return true

func _refund_structure(site: Dictionary, costs: Vector2i) -> void:
	var player: Dictionary = players[site.owner]
	player.crystal += floori(costs.x * CONSTRUCTION_REFUND)
	player.aether += floori(costs.y * CONSTRUCTION_REFUND)
	units.erase(site.tag)
	nav_dirty = true
	_recompute_supplies()

func _is_finished_silo(unit: Dictionary, owner_id: int) -> bool:
	return not unit.is_empty() and unit.owner == owner_id and unit.unit_type in ["silo", "silo_retracted"] and unit.build_progress >= 1.0

func can_use_hub_power(unit: Dictionary) -> bool:
	return unit.unit_type == "colony_hub" and unit.build_progress >= 1.0 and unit.energy >= HUB_POWER_COST

func _use_hub_power(hub: Dictionary, command: String, position: Vector2, target_tag: int) -> bool:
	if not can_use_hub_power(hub):
		return false
	if command == "recon_sweep":
		if vision == null or not position.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(position):
			return false
		vision.add_sweep(hub.owner, position, SWEEP_RADIUS, tick + SWEEP_TICKS)
		vision.update(units, tick)
	else:
		var silo: Dictionary = units.get(target_tag, {})
		if not _is_finished_silo(silo, hub.owner) or silo.get("supply_reinforced", false):
			return false
		silo["supply_reinforced"] = true
		_recompute_supplies()
		emit_signal("notice", hub.owner, "Provision Silo reinforced.", "info")
	hub.energy -= HUB_POWER_COST
	return true

func _toggle_salvage(silo: Dictionary) -> bool:
	if not _is_finished_silo(silo, silo.owner):
		return false
	if silo.get("salvage_finish", 0) > 0:
		silo.erase("salvage_finish")
		emit_signal("notice", silo.owner, "Salvage cancelled.", "info")
	else:
		silo["salvage_finish"] = tick + SALVAGE_TICKS
		emit_signal("notice", silo.owner, "Salvaging Provision Silo.", "info")
	return true

func supply_from(unit: Dictionary) -> int:
	return int(RTSData.get_unit_def(unit.unit_type).get("supply_provided", 0)) + (REINFORCED_SUPPLY if unit.get("supply_reinforced", false) else 0)

func can_repair(worker: Dictionary, target: Dictionary) -> bool:
	return worker.unit_type == "pioneer" and not target.is_empty() and target.owner == worker.owner and target.tag != worker.tag and target.build_progress >= 1.0 and target.hp < target.max_hp and target.attributes.has("Mechanical")

func _begin_auto_repair(worker: Dictionary) -> bool:
	if players[worker.owner].crystal <= 0:
		return false
	var best: Dictionary = {}
	var best_distance := AUTO_REPAIR_RADIUS
	for target in query_units_in_radius(worker.pos, AUTO_REPAIR_RADIUS + worker.radius):
		if not can_repair(worker, target):
			continue
		var distance := _edge_distance(worker, target)
		if distance <= best_distance:
			best = target
			best_distance = distance
	if best.is_empty():
		return false
	worker.orders.append({"type": "repair", "target_tag": best.tag, "automatic": true})
	return true

func _process_repair_order(worker: Dictionary, order: Dictionary, dt: float) -> void:
	var target: Dictionary = units.get(order.target_tag, {})
	var player: Dictionary = players[worker.owner]
	if not can_repair(worker, target) or (order.get("automatic", false) and (_edge_distance(worker, target) > AUTO_REPAIR_RADIUS or (player.crystal <= 0 and target.get("repair_credit", 0.0) <= 0.0))):
		worker.orders.pop_front()
		worker.path.clear()
		return
	if _edge_distance(worker, target) > 1.1:
		_follow_order_path(worker, target.pos, dt)
		return
	worker.facing = (target.pos - worker.pos).angle()
	var replacement_cost: float = RTSData.get_unit_def(target.unit_type).get("crystal_cost", 0)
	var price_per_hp: float = replacement_cost * 0.25 / target.max_hp
	var hp := minf(REPAIR_HP_PER_SECOND * dt, target.max_hp - target.hp)
	if price_per_hp > 0.0:
		var credit: float = target.get("repair_credit", 0.0)
		hp = minf(hp, (player.crystal + credit) / price_per_hp)
		var price := hp * price_per_hp
		var charge := clampi(ceili(price - credit - 0.000001), 0, player.crystal)
		player.crystal -= charge
		target["repair_credit"] = maxf(0.0, credit + charge - price)
	target.hp += hp

func _approach_target(u: Dictionary, target_pos: Vector2, dt: float) -> void:
	_prepare_path(u, target_pos, 1.0)
	_follow_path(u, dt)

func _follow_order_path(u: Dictionary, target_pos: Vector2, dt: float, reach: float = INF) -> void:
	_prepare_path(u, target_pos, 3.0, reach)
	_follow_path(u, dt)

func _prepare_order_path(u: Dictionary, order: Dictionary) -> Vector2:
	_prepare_path(u, order.get("target_pos", u.pos), 0.05)
	return u.path.back()

func _prepare_path(u: Dictionary, target_pos: Vector2, tolerance: float, reach: float = INF) -> void:
	if u.path.is_empty() or u.get("nav_goal", Vector2.INF).distance_squared_to(target_pos) > tolerance * tolerance:
		u.path = compute_smooth_path(u.pos, target_pos, u.radius, u.unit_type == "spire_walker", reach)
		u["nav_goal"] = target_pos

func _follow_path(u: Dictionary, dt: float) -> void:
	var path: Array = u.path
	var waypoint: Vector2 = path.front()
	if path.size() > 1 and u.pos.distance_to(waypoint) <= maxf(1.1, u.radius * 1.2):
		if _has_clear_line_of_walk(u.pos, path[1], u.radius, u.unit_type == "spire_walker"):
			path.pop_front()
			waypoint = path.front()
	_move_toward_point(u, waypoint, dt)

func _move_toward_point(u: Dictionary, wp: Vector2, _dt: float) -> void:
	if u["is_immobile"]:
		u["vel"] = Vector2.ZERO
		return
	var dir = (wp - u["pos"])
	if dir.length_squared() < 0.001:
		u["vel"] = Vector2.ZERO
		return
	dir = dir.normalized()
	var spd = float(u["speed"])
	if u["surge_timer"] > 0.0:
		spd *= 1.5
	if u["charge_timer"] > 0.0:
		spd *= 1.8
	if u["slow_timer"] > 0.0:
		spd *= 0.5
	u["vel"] = dir * spd
	u["facing"] = dir.angle()

func _should_settle_in_group_arrival(u: Dictionary, target_pos: Vector2, base_arrival: float) -> bool:
	var dist = u["pos"].distance_to(target_pos)
	if dist > base_arrival * 2.8:
		return false
	var neighbors = query_units_in_radius(u["pos"], u["radius"] * 2.4)
	for n in neighbors:
		if n["tag"] == u["tag"] or n["owner"] != u["owner"]:
			continue
		if n["orders"].is_empty() and n["home_pos"].distance_to(target_pos) <= base_arrival * 3.0:
			if u["pos"].distance_to(n["pos"]) <= (u["radius"] + n["radius"]) * 1.35:
				return true
	return false

func _apply_steering_and_push_resolution(all_tags: Array, dt: float, mineral_walkers: Dictionary = {}) -> void:
	var neighbors_by_tag: Dictionary = {}
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u: Dictionary = units[tag]
		if u["is_structure"] or u["is_immobile"]:
			continue

		var position: Vector2 = u["pos"]
		var radius: float = u["radius"]
		var speed: float = u["speed"]
		var owner_id: int = u["owner"]
		var desired_vel: Vector2 = u["vel"]
		var is_moving: bool = desired_vel.length_squared() > 0.05
		var neighbors = query_units_in_radius(position, radius + 2.6)
		neighbors_by_tag[tag] = neighbors

		var steer_force: Vector2 = Vector2.ZERO
		var mineral_walking := mineral_walkers.has(tag)
		for neighbor in neighbors:
			var n: Dictionary = neighbor
			if n["tag"] == tag:
				continue
			if n["is_structure"] and n["is_walkable_structure"]:
				continue
			# Mineral walking is a pair rule. Neither mobile gets to push the other.
			if not n.is_structure and (mineral_walking or mineral_walkers.has(n.tag)):
				continue

			var neighbor_position: Vector2 = n["pos"]
			var delta_p: Vector2 = position - neighbor_position
			var dist: float = delta_p.length()
			var min_sep: float = radius + float(n["radius"])
			if dist < 0.001:
				var angle = float((u["tag"] * 73) % 360) * PI / 180.0
				delta_p = Vector2(cos(angle), sin(angle))
				dist = 0.01

			var normal = delta_p / dist

			if is_moving and not n["is_structure"]:
				if dist < min_sep * 1.55:
					var overlap_ratio = (min_sep * 1.55 - dist) / (min_sep * 1.55)
					steer_force += normal * overlap_ratio * speed * 0.85

				if n["owner"] == owner_id and n["orders"].is_empty() and n["attack_state"] == "idle" and not n["is_immobile"]:
					if u["push_priority"] >= n["push_priority"] and dist < min_sep * 1.25:
						var move_dir = desired_vel.normalized()
						var perp = Vector2(-move_dir.y, move_dir.x)
						if perp.dot(neighbor_position - position) < 0.0:
							perp = -perp
						var push_vec = (perp * 0.75 + (-normal) * 0.25).normalized()
						_move_on_terrain(n, neighbor_position + push_vec * speed * dt * 0.9)
						n["pushed_timer"] = 0.35

		var final_vel = desired_vel + steer_force
		var max_spd: float = speed * (1.5 if u["surge_timer"] > 0.0 else 1.0) * (1.8 if u["charge_timer"] > 0.0 else 1.0) * (0.5 if u["slow_timer"] > 0.0 else 1.0)
		if final_vel.length() > max_spd and max_spd > 0.0:
			final_vel = final_vel.normalized() * max_spd

		if final_vel.length_squared() > 0.001:
			_move_on_terrain(u, position + final_vel * dt)
			u["vel"] = final_vel

	for tag in all_tags:
		if not units.has(tag):
			continue
		var u: Dictionary = units[tag]
		if u["is_structure"]:
			continue
		# Structures never moved between the passes; nearby mobiles moved by less
		# than a tick. The wider steering query already covers collision contacts.
		var neighbors: Array = neighbors_by_tag[tag] if neighbors_by_tag.has(tag) else query_units_in_radius(u["pos"], u["radius"] + 1.8)
		var mineral_walking := mineral_walkers.has(tag)
		for n in neighbors:
			if n["tag"] <= u["tag"]:
				continue
			if n["is_structure"] and n["is_walkable_structure"]:
				continue
			if not n.is_structure and (mineral_walking or mineral_walkers.has(n.tag)):
				continue
			var diff: Vector2 = u["pos"] - n["pos"]
			var dist: float = diff.length()
			var min_dist: float = (u["radius"] + n["radius"]) * 0.92
			if dist < min_dist:
				var nrm = diff / dist if dist > 0.001 else Vector2.RIGHT
				var pen = min_dist - dist
				if n["is_structure"] or n["is_immobile"]:
					_move_on_terrain(u, u.pos + nrm * pen)
				elif u["is_immobile"]:
					_move_on_terrain(n, n.pos - nrm * pen)
				else:
					_move_on_terrain(u, u.pos + nrm * (pen * 0.5))
					_move_on_terrain(n, n.pos - nrm * (pen * 0.5))

func _move_on_terrain(unit: Dictionary, pos: Vector2) -> void:
	unit.pos = _clamp_to_walkable(pos, unit.radius, unit.unit_type == "spire_walker", unit.pos)

func _map_clamped_position(p: Vector2, radius: float) -> Vector2:
	return Vector2(
		clampf(p.x, radius + 1.0, map_width - radius - 1.0),
		clampf(p.y, radius + 1.0, map_height - radius - 1.0)
	)

func _clamp_to_walkable(p: Vector2, radius: float, ignore_cliffs: bool = false, previous: Vector2 = Vector2.INF) -> Vector2:
	var res := _map_clamped_position(p, radius)
	if not ignore_cliffs:
		if is_water_at(res, radius * 0.5):
			if previous.is_finite() and not is_water_at(previous, radius * 0.5):
				return previous
			var cell := _find_nearest_walkable_cell(astar_grid, res, res)
			res = astar_grid.get_point_position(cell)
		for obs in terrain_obstacles:
			var exp_rect := obs.grow(radius * 0.7)
			if exp_rect.has_point(res):
				var dl := absf(res.x - exp_rect.position.x)
				var dr := absf(exp_rect.end.x - res.x)
				var dt_top := absf(res.y - exp_rect.position.y)
				var db := absf(exp_rect.end.y - res.y)
				var m := minf(minf(dl, dr), minf(dt_top, db))
				if m == dl:
					res.x = exp_rect.position.x - 0.05
				elif m == dr:
					res.x = exp_rect.end.x + 0.05
				elif m == dt_top:
					res.y = exp_rect.position.y - 0.05
				else:
					res.y = exp_rect.end.y + 0.05
	var before_collision := res
	for footprint in _footprint_bins.get(_footprint_bin(res), NO_FOOTPRINTS):
		var separation := float(footprint.radius) + radius
		var delta: Vector2 = res - footprint.pos
		if delta.length_squared() >= separation * separation:
			continue
		var origin: Vector2 = previous - footprint.pos
		if previous.is_finite() and (delta.is_zero_approx() or delta.dot(origin) < 0.0):
			delta = origin
		if delta.is_zero_approx():
			delta = Vector2.RIGHT
		res = footprint.pos + delta.normalized() * (separation + 0.02)
	if res != before_collision and previous.is_finite() and _is_point_blocked_by_static(res, radius, ignore_cliffs):
		return previous
	return res

func _get_weapon_range(u: Dictionary) -> float:
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	return float(wpn.get("range", 0.0))

func _edge_distance(a: Dictionary, b: Dictionary) -> float:
	return max(0.0, a["pos"].distance_to(b["pos"]) - (float(a["radius"]) + float(b["radius"])))

func _find_best_attack_target(u: Dictionary, range_only: bool) -> Dictionary:
	if u.get("hold_fire", false):
		return {}
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return {}
	var wpn_range = float(wpn.get("range", 5.0))
	var min_range = float(wpn.get("min_range", 0.0))
	var scan_rad = wpn_range if range_only else max(wpn_range, float(u["sight_range"]))

	var candidates = query_units_in_radius(u["pos"], scan_rad + 2.5, u["owner"])
	var best: Dictionary = {}
	var best_score: float = -999999.0

	for c in candidates:
		if c["owner"] == u["owner"] or c["hp"] <= 0.0 or not can_see_unit(u.owner, c):
			continue
		var d_edge = _edge_distance(u, c)
		if d_edge < min_range:
			continue
		if range_only and d_edge > wpn_range:
			continue

		var prio = 200.0
		if c["is_structure"]:
			prio = 20.0
		elif c["is_worker"]:
			prio = 100.0
		var in_range_bonus = 50.0 if d_edge <= wpn_range else 0.0
		var score = prio + in_range_bonus - d_edge * 2.5 - (c["hp"] / c["max_hp"]) * 10.0
		if score > best_score:
			best_score = score
			best = c

	return best

func _begin_attack_on(u: Dictionary, target: Dictionary) -> void:
	u["vel"] = Vector2.ZERO
	u["facing"] = (target["pos"] - u["pos"]).angle()
	if u["weapon_cooldown"] > 0.0:
		return
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return
	var atk_speed_mult = 1.5 if u["surge_timer"] > 0.0 else 1.0
	u["attack_state"] = "windup"
	u["attack_target_tag"] = target["tag"]
	u["attack_state_timer"] = float(wpn.get("damage_point", 0.08)) / atk_speed_mult

func _execute_weapon_hit(attacker: Dictionary, primary_target: Dictionary) -> void:
	var def = RTSData.get_unit_def(attacker["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return

	var base_dmg = float(wpn.get("damage", 6.0)) + unit_upgrade_level(attacker, "weapons")
	var bonus_dict: Dictionary = wpn.get("bonus", {})
	var splash_rad = float(wpn.get("splash_radius", 0.0))
	var slow_factor = float(wpn.get("concussive_slow", 0.0))
	var hit_shields: bool = float(primary_target.get("shields", 0.0)) > 0.0

	_apply_damage_to_target(attacker, primary_target, base_dmg, bonus_dict, 1.0)
	if slow_factor > 0.0 and not primary_target["is_structure"]:
		primary_target["slow_timer"] = 2.0

	if splash_rad > 0.0:
		var splashed = query_units_in_radius(primary_target["pos"], splash_rad)
		for s in splashed:
			if s["tag"] == primary_target["tag"] or s["hp"] <= 0.0:
				continue
			if s["owner"] == attacker["owner"]:
				continue
			var d = primary_target["pos"].distance_to(s["pos"])
			var mult = 0.5 if d <= splash_rad * 0.5 else 0.25
			_apply_damage_to_target(attacker, s, base_dmg, bonus_dict, mult)

	var evt = {
		"tick": tick,
		"type": "weapon_fire",
		"attacker_tag": attacker["tag"],
		"target_tag": primary_target["tag"],
		"from": [attacker["pos"].x, attacker["pos"].y],
		"to": [primary_target["pos"].x, primary_target["pos"].y],
		"weapon": str(wpn.get("name", "Weapon")),
		"splash": splash_rad > 0.0,
		"owner": attacker["owner"]
	}
	recent_events.append(evt)
	if recent_events.size() > 80:
		recent_events.pop_front()
	emit_signal("weapon_attack", attacker, primary_target, wpn, hit_shields)
	emit_signal("projectile_fired", attacker["pos"], primary_target["pos"], str(wpn.get("name", "")), splash_rad > 0.0, attacker["owner"])

func _apply_damage_to_target(attacker: Dictionary, target: Dictionary, base_dmg: float, bonus_dict: Dictionary, mult: float) -> void:
	var dmg = base_dmg
	var attrs: Array = target.get("attributes", [])
	for attr in bonus_dict.keys():
		if attrs.has(attr):
			dmg += float(bonus_dict[attr])
	dmg = max(0.5, dmg * mult)

	target["out_of_combat_timer"] = 0.0
	if target.erase("salvage_finish"):
		emit_signal("notice", target.owner, "Damage interrupted salvage.", "warn")
	emit_signal("unit_damaged", target["owner"], target["pos"])

	# Aegis Shields absorb damage before HP
	if target["shields"] > 0.0:
		if target["shields"] >= dmg:
			target["shields"] -= dmg
			attacker["damage_dealt"] += dmg
			return
		else:
			var overflow = dmg - target["shields"]
			attacker["damage_dealt"] += target["shields"]
			target["shields"] = 0.0
			dmg = overflow

	var hp_dmg = max(0.5, dmg - float(target.get("armor", 0.0)) - unit_upgrade_level(target, "armor"))
	target["hp"] = max(0.0, target["hp"] - hp_dmg)
	attacker["damage_dealt"] += hp_dmg

	if target["hp"] <= 0.0:
		if attacker.owner != target.owner:
			attacker["kills"] += 1
			if players.has(attacker["owner"]):
				players[attacker["owner"]]["units_killed"] += 1
		if players.has(target["owner"]):
			players[target["owner"]]["units_lost"] += 1
		var dead = target.duplicate(true)
		units.erase(target["tag"])
		if dead["is_structure"]:
			nav_dirty = true
		_recompute_supplies()
		emit_signal("unit_destroyed", dead)

func issue_command(unit_tags: Array, cmd_type: String, target_pos: Vector2 = Vector2.ZERO, target_tag: int = 0, extra: String = "", queue: bool = false) -> Dictionary:
	if match_state.get("status", "") == "finished":
		return {"ok": false, "accepted": 0, "error": "Match has finished"}
	var accepted: int = 0
	var valid_units: Array[Dictionary] = []
	var seen := {}
	for t in unit_tags:
		var tag_int = int(t)
		if units.has(tag_int) and not seen.has(tag_int):
			seen[tag_int] = true
			valid_units.append(units[tag_int])

	if valid_units.is_empty():
		return {"ok": false, "accepted": 0, "error": "No valid unit tags"}
	if cmd_type == "fill_gas":
		return _fill_gas(valid_units, target_tag)

	var group_size = valid_units.size()
	var dynamic_arrival = clampf(0.85 + sqrt(float(group_size)) * 0.65, 0.85, 5.5)

	for u in valid_units:
		var ctype = cmd_type.to_lower()
		if u.armed_structure and not ctype in ["attack", "attack_target", "force_attack", "hold_fire", "stop", "cancel_construction"]:
			continue
		if u.armed_structure and (ctype == "attack_target" or ctype == "force_attack" or ctype == "attack") and (u.build_progress < 1.0 or target_tag <= 0):
			continue
		if ctype == "undo_queued_order":
			if not u.is_structure and u.orders.size() > 1:
				u.orders.pop_back()
				accepted += 1
			continue
		if ctype == "reset_rally":
			if u.is_structure and u.build_progress >= 1.0 and RTSData.get_unit_def(u.unit_type).has("trains"):
				u.rally_route.clear()
				if u.has("worker_rally_route"):
					u.worker_rally_route.clear()
				accepted += 1
			continue
		if ctype == "phase_cloak":
			if u.unit_type != "skirmisher":
				continue
			if u.get("cloaked", false):
				u["cloaked"] = false
			elif u.energy >= CLOAK_START_ENERGY:
				u.energy -= CLOAK_START_ENERGY
				u["cloaked"] = true
			else:
				continue
			emit_signal("ability_triggered", u, ctype, u.pos)
			accepted += 1
			continue
		if ctype == "hold_fire":
			if u.is_worker or not RTSData.get_unit_def(u.unit_type).has("weapon") or u.build_progress < 1.0:
				continue
			u["hold_fire"] = not u.get("hold_fire", false)
			if u.hold_fire and u.attack_state == "windup" and (u.orders.is_empty() or not u.orders[0].type in ["attack_target", "force_attack"]):
				u.attack_state = "idle"
			accepted += 1
			continue
		if ctype in ["recon_sweep", "reinforce_supply"]:
			if accepted == 0 and _use_hub_power(u, ctype, target_pos, target_tag):
				accepted += 1
			continue
		if ctype == "salvage":
			if _toggle_salvage(u):
				accepted += 1
			continue
		if ctype == "auto_repair":
			if u.unit_type == "pioneer":
				u["auto_repair"] = not u.get("auto_repair", false)
				if not u.auto_repair and not u.orders.is_empty() and u.orders[0].get("automatic", false):
					u.orders.pop_front()
					u.path.clear()
				accepted += 1
			continue
		if ctype == "cancel_construction":
			if _cancel_construction(u):
				accepted += 1
			continue
		if ctype == "resume_construction" and (accepted > 0 or not can_resume_construction(u, units.get(target_tag, {}))):
			continue
		if ctype == "repair" and not can_repair(u, units.get(target_tag, {})):
			continue
		if ctype == "follow" and (u.is_structure or u.is_immobile or u.tag == target_tag or not _is_friendly_mobile(units.get(target_tag, {}), u.owner)):
			continue
		if ctype == "harvest" and (not u.is_worker or u.is_immobile):
			continue
		if ctype == "return_cargo":
			if not u.is_worker or u.is_immobile or u.cargo_amount <= 0 or (target_tag > 0 and not is_dropoff(units.get(target_tag, {}), u.owner)):
				continue
			var dropoff := {"type": "return_cargo", "target_tag": target_tag}
			if queue:
				u.orders.append(dropoff)
			else:
				if not u.orders.is_empty() and u.orders[0].type == "return_cargo":
					u.orders.pop_front()
				var current: Dictionary = u.orders.front() if not u.orders.is_empty() else {}
				u.orders.clear()
				u.orders.append(dropoff)
				if current.get("type") == "harvest":
					u.orders.append(current)
				u.path.clear()
			accepted += 1
			continue
		if ctype == "patrol" and (u.is_immobile or u.is_structure or not target_pos.is_finite()):
			continue
		if ctype == "force_attack":
			var friendly: Dictionary = units.get(target_tag, {})
			if friendly.is_empty() or friendly.owner != u.owner or friendly.tag == u.tag or not RTSData.get_unit_def(u.unit_type).has("weapon"):
				continue
		elif ctype == "attack_target" or (ctype in ["attack", "attack_move"] and target_tag > 0):
			var target: Dictionary = units.get(target_tag, {})
			if target.is_empty() or target.owner == u.owner or not can_see_unit(u.owner, target):
				continue
		if ctype.begins_with("build_") or ctype == "build":
			var stype_check = ctype.trim_prefix("build_") if ctype != "build" else extra
			if not _can_build(u, stype_check, target_pos):
				continue

		if queue and ctype in ["stop", "hold_position"]:
			u.orders.append({"type": ctype})
			accepted += 1
			continue

		if u["attack_state"] == "backswing" and ctype in ["move", "attack_move", "patrol", "phase_step"]:
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0
			if players.has(u["owner"]):
				players[u["owner"]]["stutter_step_cancels"] += 1
		elif u["attack_state"] == "windup" and ctype in ["move", "stop", "phase_step"]:
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0

		if ctype == "surge":
			if u["unit_type"] in ["rifleman", "breacher"] and u["hp"] > 10.0:
				u["hp"] -= 10.0
				u["surge_timer"] = 11.0
				emit_signal("ability_triggered", u, "surge", u["pos"])
				accepted += 1
			continue

		elif ctype == "charge":
			if u["unit_type"] == "sunblade":
				u["charge_timer"] = 3.5
				emit_signal("ability_triggered", u, "charge", u["pos"])
				accepted += 1
			continue

		elif ctype == "phase_step":
			if u["unit_type"] == "skirmisher" and u["phase_cooldown"] <= 0.0:
				var old_pos: Vector2 = u["pos"]
				var delta_b: Vector2 = target_pos - old_pos
				if delta_b.length() > 18.0:
					delta_b = delta_b.normalized() * 18.0
				var dest := _project_destination(old_pos, old_pos + delta_b, u.radius, true)
				u["pos"] = dest
				u["prev_pos"] = dest
				u["home_pos"] = dest
				u["phase_cooldown"] = 7.0
				u["orders"].clear()
				u["path"].clear()
				if players.has(u["owner"]):
					players[u["owner"]]["phase_steps_executed"] += 1
				emit_signal("unit_phased", old_pos, dest, u["tag"])
				emit_signal("ability_triggered", u, "phase_step", dest)
				accepted += 1
			continue

		elif ctype in ["emplace", "emplace"]:
			if u["unit_type"] == "howitzer":
				_morph_unit_in_place(u, "howitzer_emplaced")
				emit_signal("ability_triggered", u, "emplace", u["pos"])
				accepted += 1
			continue

		elif ctype in ["mobilize", "mobile_mode"]:
			if u["unit_type"] == "howitzer_emplaced":
				_morph_unit_in_place(u, "howitzer")
				emit_signal("ability_triggered", u, "mobilize", u["pos"])
				accepted += 1
			continue

		elif ctype == "retract_silo":
			if u["unit_type"] == "silo":
				_morph_unit_in_place(u, "silo_retracted")
				emit_signal("ability_triggered", u, "retract_silo", u["pos"])
				accepted += 1
			continue

		elif ctype == "extend_silo":
			if u["unit_type"] == "silo_retracted":
				_morph_unit_in_place(u, "silo")
				emit_signal("ability_triggered", u, "extend_silo", u["pos"])
				accepted += 1
			continue

		elif ctype.begins_with("train_"):
			var train_type = ctype.replace("train_", "")
			if _enqueue_unit_production(u, train_type):
				accepted += 1
			continue

		elif ctype.begins_with("research_"):
			if _enqueue_research(u, ctype.trim_prefix("research_")):
				accepted += 1
			continue

		elif ctype == "cancel_training":
			if (extra.is_empty() or extra.is_valid_int()) and _cancel_training(u, int(extra) if not extra.is_empty() else u.production_queue.size() - 1):
				accepted += 1
			continue

		elif ctype in ["rally", "rally_worker"]:
			if _set_rally(u, target_pos, target_tag, queue, ctype == "rally_worker"):
				accepted += 1
			continue

		elif ctype == "stop":
			_release_mining_slot(u)
			u["orders"].clear()
			u["path"].clear()
			u["vel"] = Vector2.ZERO
			u["home_pos"] = u["pos"]
			accepted += 1
			continue

		elif ctype == "hold_position":
			_release_mining_slot(u)
			u["orders"] = [{"type": "hold_position"}]
			u["path"].clear()
			u["vel"] = Vector2.ZERO
			u["home_pos"] = u["pos"]
			accepted += 1
			continue

		if not queue:
			_release_mining_slot(u)
			u["orders"].clear()
			u["path"].clear()

		if ctype == "move":
			u["orders"].append({
				"type": "move",
				"target_pos": target_pos,
				"arrival_radius": dynamic_arrival
			})
			u["has_home_pos"] = false
			accepted += 1

		elif ctype == "patrol":
			u.orders.append({"type": "patrol", "target_pos": target_pos})
			u.has_home_pos = false
			accepted += 1

		elif ctype == "follow":
			u.orders.append({"type": "follow", "target_tag": target_tag})
			u.has_home_pos = false
			accepted += 1

		elif ctype in ["attack", "attack_move"]:
			if target_tag > 0 and units.has(target_tag):
				u["orders"].append({
					"type": "attack_target",
					"target_tag": target_tag
				})
				u.orders.back()["target_pos"] = units[target_tag].pos
			else:
				u["orders"].append({
					"type": "attack_move",
					"target_pos": target_pos,
					"arrival_radius": dynamic_arrival
				})
			accepted += 1

		elif ctype in ["attack_target", "force_attack"]:
			u["orders"].append({
				"type": ctype,
				"target_tag": target_tag,
				"target_pos": units[target_tag].pos
			})
			accepted += 1

		elif ctype == "harvest":
			var harvest_tag := target_tag
			var deposit: Dictionary = resources.get(target_tag, {})
			if group_size > 1 and not queue and deposit.get("resource_type") == "crystal_field":
				harvest_tag = _pick_local_crystal(u, deposit).tag
			u["harvest_target_tag"] = harvest_tag
			u["orders"].append({
				"type": "harvest",
				"target_tag": harvest_tag
			})
			accepted += 1

		elif ctype == "resume_construction":
			var site: Dictionary = units[target_tag]
			u.orders.append({"type": "build", "structure_tag": site.tag, "target_pos": site.pos})
			if u.orders.size() == 1:
				site["builder_tag"] = u.tag
			accepted += 1

		elif ctype == "repair":
			u.orders.append({"type": "repair", "target_tag": target_tag})
			accepted += 1

		elif ctype.begins_with("build_"):
			var stype = ctype.replace("build_", "")
			u["orders"].append({
				"type": "build",
				"structure_type": stype,
				"target_pos": target_pos,
				"structure_tag": 0
			})
			accepted += 1
		elif ctype == "build":
			u["orders"].append({
				"type": "build",
				"structure_type": extra if extra != "" else "silo",
				"target_pos": target_pos,
				"structure_tag": 0
			})
			accepted += 1

	command_history.append({
		"tick": tick,
		"cmd": cmd_type,
		"tags": unit_tags,
		"pos": [target_pos.x, target_pos.y],
		"target_tag": target_tag
	})
	if command_history.size() > 100:
		command_history.pop_front()

	return {"ok": accepted > 0, "accepted": accepted, "tick": tick}

func _fill_gas(workers: Array[Dictionary], tap_tag: int) -> Dictionary:
	var tap: Dictionary = units.get(tap_tag, {})
	if tap.is_empty() or not tap.is_extractor or tap.hp <= 0.0:
		return {"ok": false, "accepted": 0}
	var vent_tag: int = _gas_source_by_tap.get(tap_tag, 0)
	var vent: Dictionary = resources.get(vent_tag, {})
	if vent.is_empty() or (not unlimited_resources and vent.amount <= 0):
		return {"ok": false, "accepted": 0}
	var assigned := {}
	for unit in units.values():
		if unit.owner == tap.owner and unit.is_worker:
			for order in unit.orders:
				if order.type == "harvest" and order.target_tag in [tap_tag, vent_tag]:
					assigned[unit.tag] = true
					break
	var slots := GAS_WORKER_SLOTS - assigned.size()
	var accepted := 0
	for worker in workers:
		if accepted >= slots:
			break
		if worker.is_worker and worker.owner == tap.owner and not assigned.has(worker.tag) and (worker.orders.is_empty() or worker.orders[0].type != "build"):
			if issue_command([worker.tag], "harvest", tap.pos, tap.tag).ok:
				accepted += 1
	return {"ok": accepted > 0, "accepted": accepted, "tick": tick}

func _is_friendly_mobile(unit: Dictionary, owner_id: int) -> bool:
	return not unit.is_empty() and unit.owner == owner_id and not unit.is_structure and unit.hp > 0.0

func default_rally_position(structure: Dictionary) -> Vector2:
	return structure.pos + (Vector2(8.0, 0.0) if structure.owner == 1 else Vector2(-8.0, 0.0))

func rally_waypoint_position(waypoint: Dictionary) -> Vector2:
	if waypoint.kind == "follow" and units.has(waypoint.target_tag):
		return units[waypoint.target_tag].pos
	return waypoint.pos

func _set_rally(structure: Dictionary, position: Vector2, target_tag: int, append: bool, workers: bool = false) -> bool:
	if not structure.is_structure or structure.build_progress < 1.0 or not RTSData.get_unit_def(structure.unit_type).has("trains"):
		return false
	if workers and structure.unit_type != "brood_nest":
		return false
	var kind := "move"
	if target_tag > 0:
		var resource := worker_rally_resource(structure.owner, target_tag)
		var unit: Dictionary = units.get(target_tag, {})
		if not resource.is_empty() and can_see_position(structure.owner, resource.pos):
			kind = "harvest"
			position = resource.pos
		elif _is_friendly_mobile(unit, structure.owner):
			kind = "follow"
			position = unit.pos
		else:
			return false
	if not position.is_finite():
		return false
	var route: Array = structure.rally_route
	if structure.unit_type == "brood_nest" and (workers or kind == "harvest"):
		route = structure.worker_rally_route
	if append and route.size() >= MAX_RALLY_WAYPOINTS:
		notice.emit(structure.owner, "Rally route already has eight waypoints.", "warn")
		return false
	if not append:
		route.clear()
	elif not route.is_empty() and route.back().kind != "move":
		# A gather or follow order persists, so only the final waypoint may use it.
		route[-1] = {"kind": "move", "target_tag": 0, "pos": rally_waypoint_position(route.back())}
	route.append({"kind": kind, "target_tag": target_tag, "pos": position})
	return true

func _apply_rally_route(unit: Dictionary, route: Array) -> void:
	for waypoint in route:
		var target_tag: int = waypoint.target_tag
		var position := rally_waypoint_position(waypoint)
		var command := "move"
		if waypoint.kind == "follow" and _is_friendly_mobile(units.get(target_tag, {}), unit.owner):
			command = "follow"
		elif waypoint.kind == "harvest" and unit.is_worker and not worker_rally_resource(unit.owner, target_tag).is_empty():
			command = "harvest"
		issue_command([unit.tag], command, position, target_tag if command != "move" else 0, "", not unit.orders.is_empty())

func worker_rally_resource(owner_id: int, target_tag: int) -> Dictionary:
	var deposit: Dictionary = resources.get(target_tag, {})
	if not deposit.is_empty() and deposit.resource_type == "crystal_field" and (unlimited_resources or deposit.amount > 0):
		return deposit
	var tap: Dictionary = units.get(target_tag, {})
	if not tap.is_empty() and tap.owner == owner_id and tap.is_extractor and tap.hp > 0 and tap.build_progress >= 1.0:
		var vent: Dictionary = resources.get(_gas_source_by_tap.get(target_tag, 0), {})
		if not vent.is_empty() and (unlimited_resources or vent.amount > 0):
			return tap
	return {}

func issue_SmartHarvest(worker_tag: int, preferred: Dictionary = {}) -> void:
	if not units.has(worker_tag):
		return
	var u = units[worker_tag]
	var nearest := _worker_crystal(u, preferred)
	if not nearest.is_empty():
		issue_command([worker_tag], "harvest", nearest["pos"], nearest["tag"])

func _worker_crystal(worker: Dictionary, preferred: Dictionary = {}) -> Dictionary:
	return _pick_local_crystal(worker, _find_nearest_crystal(worker.pos) if preferred.is_empty() else preferred)

func default_worker_deposit(structure: Dictionary) -> Dictionary:
	if match_state.is_empty() or not is_dropoff(structure, structure.owner):
		return {}
	var route: Array = structure.get("worker_rally_route", structure.rally_route)
	if not route.is_empty():
		return {}
	var spawn := _rally_spawn_position(structure, default_rally_position(structure))
	return _worker_crystal({"tag": 0, "owner": structure.owner, "pos": spawn})

func _morph_unit_in_place(u: Dictionary, new_type: String) -> void:
	var def = RTSData.get_unit_def(new_type)
	if def.is_empty():
		return
	u["unit_type"] = new_type
	u["name"] = str(def.get("name", new_type))
	u["speed"] = float(def.get("speed", 0.0))
	u["sight_range"] = float(def.get("sight_range", u["sight_range"]))
	u["push_priority"] = int(def.get("push_priority", u["push_priority"]))
	u["is_immobile"] = bool(def.get("is_immobile", false))
	u["is_walkable_structure"] = bool(def.get("is_walkable_structure", false))
	u["orders"].clear()
	u["vel"] = Vector2.ZERO
	if u["is_structure"]:
		nav_dirty = true

func _enqueue_unit_production(structure: Dictionary, unit_type: String) -> bool:
	if not structure["is_structure"] or structure["build_progress"] < 1.0:
		return false
	var u_def = RTSData.get_unit_def(unit_type)
	if u_def.is_empty():
		return false
	if not RTSData.get_unit_def(structure["unit_type"]).get("trains", []).has(unit_type):
		return false
	if requires_power(structure.unit_type) and not is_powered(structure.owner, structure.pos):
		notice.emit(structure.owner, "Waystone needs a Resonator's power field.", "error")
		return false
	if uses_brood_slots(structure) and structure.brood_slots <= 0:
		notice.emit(structure.owner, "No brood slots ready.", "error")
		return false
	var p = players.get(structure["owner"], {})
	if p.is_empty():
		return false
	var m_cost = int(u_def.get("crystal_cost", 50))
	var v_cost = int(u_def.get("aether_cost", 0))
	var s_cost = int(u_def.get("supply_cost", 1))
	if p["crystal"] < m_cost:
		emit_signal("notice", structure["owner"], "Not enough crystal.", "error")
		return false
	if p["aether"] < v_cost:
		emit_signal("notice", structure["owner"], "Not enough aether.", "error")
		return false
	if p["supply_used"] + s_cost > p["supply_cap"]:
		emit_signal("notice", structure["owner"], "Supply blocked. Build more supply structures.", "error")
		return false
	if structure["production_queue"].size() >= 5:
		emit_signal("notice", structure["owner"], "Production queue is full.", "error")
		return false
	p["crystal"] -= m_cost
	p["aether"] -= v_cost
	if uses_brood_slots(structure):
		structure.brood_slots -= 1
	structure["production_queue"].append({
		"unit_type": unit_type,
		"crystal_cost": m_cost,
		"aether_cost": v_cost,
		"progress": 0.0,
		"total_time": max(2.5, float(u_def.get("build_time", 12.0)) * build_time_scale())
	})
	_recompute_supplies()
	return true

func unit_upgrade_level(unit: Dictionary, upgrade: String) -> int:
	if unit.faction != "humans" or unit.is_structure or unit.is_worker:
		return 0
	return players.get(unit.owner, {}).get("upgrades", {}).get(upgrade, 0)

func research_offer(owner_id: int, upgrade: String) -> Dictionary:
	var completed: int = players[owner_id].upgrades.get(upgrade, 0)
	if completed >= MAX_UPGRADE_LEVEL:
		return {}
	return {"level": completed + 1, "crystal": 100 + completed * 75, "aether": 100 + completed * 75,
		"supply": 0, "time": 40.0 + completed * 15.0, "requires": []}

func research_block_reason(owner_id: int, upgrade: String) -> String:
	if players[owner_id].upgrades[upgrade] >= MAX_UPGRADE_LEVEL:
		return "All levels researched."
	for structure in units.values():
		if structure.owner != owner_id or structure.unit_type != "workshop":
			continue
		for item in structure.production_queue:
			if item.get("upgrade") == upgrade:
				return "Research already queued."
	return ""

func _enqueue_research(structure: Dictionary, upgrade: String) -> bool:
	if structure.unit_type != "workshop" or structure.build_progress < 1.0 or not players[structure.owner].upgrades.has(upgrade):
		return false
	if not research_block_reason(structure.owner, upgrade).is_empty() or structure.production_queue.size() >= 5:
		return false
	var offer := research_offer(structure.owner, upgrade)
	var player: Dictionary = players[structure.owner]
	if player.crystal < offer.crystal or player.aether < offer.aether:
		return false
	player.crystal -= offer.crystal
	player.aether -= offer.aether
	structure.production_queue.append({
		"upgrade": upgrade, "level": offer.level,
		"crystal_cost": offer.crystal, "aether_cost": offer.aether,
		"progress": 0.0, "total_time": offer.time * build_time_scale(),
	})
	return true

func _cancel_training(structure: Dictionary, index: int) -> bool:
	var queue: Array = structure.production_queue
	if not structure.is_structure or index < 0 or index >= queue.size():
		return false
	var player: Dictionary = players.get(structure.owner, {})
	if player.is_empty():
		return false
	var item: Dictionary = queue.pop_at(index)
	if uses_brood_slots(structure):
		structure.brood_slots = mini(BROOD_SLOTS, structure.brood_slots + 1)
		if structure.brood_slots == BROOD_SLOTS:
			structure.brood_recharge = 0.0
	var definition: Dictionary = RTSData.get_unit_def(item.get("unit_type", ""))
	player.crystal += int(item.get("crystal_cost", definition.get("crystal_cost", 50)))
	player.aether += int(item.get("aether_cost", definition.get("aether_cost", 0)))
	_recompute_supplies()
	return true

func build_time_scale() -> float:
	return 1.0 if not match_state.is_empty() else 0.25

func _recompute_supplies() -> void:
	for pid in players.keys():
		players[pid]["supply_used"] = 0
		players[pid]["supply_cap"] = 0

	for u in units.values():
		var pid = u["owner"]
		if not players.has(pid):
			continue
		var def = RTSData.get_unit_def(u["unit_type"])
		if u["is_structure"]:
			if u["build_progress"] >= 1.0:
				players[pid]["supply_cap"] += supply_from(u)
			for q in u["production_queue"]:
				if q.has("upgrade"):
					continue
				var q_def = RTSData.get_unit_def(str(q["unit_type"]))
				players[pid]["supply_used"] += int(q_def.get("supply_cost", 1))
		else:
			players[pid]["supply_used"] += int(def.get("supply_cost", 1))
	for pid in players:
		players[pid]["supply_cap"] = mini(200, players[pid]["supply_cap"])

func is_dropoff(unit: Dictionary, owner_id: int) -> bool:
	return not unit.is_empty() and unit.owner == owner_id and unit.build_progress >= 1.0 and unit.hp > 0.0 and RTSData.get_unit_def(unit.unit_type).get("is_town_hall", false)

func _find_nearest_town_hall(owner_id: int, pos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = 999999.0
	for u in _town_halls:
		if u.owner == owner_id and u.build_progress >= 1.0 and u.hp > 0:
			var d = pos.distance_squared_to(u.pos)
			if d < best_d:
				best_d = d
				best = u
	return best

func worker_saturation(owner_id: int) -> Dictionary:
	var sites := {}
	var deposits := {}
	for unit in units.values():
		if unit.owner != owner_id or not unit.is_structure or unit.build_progress < 1.0:
			continue
		if unit.is_extractor:
			var vent: int = _gas_source_by_tap.get(unit.tag, 0)
			var source: Dictionary = resources.get(vent, {})
			if not source.is_empty() and (source.amount > 0 or unlimited_resources):
				sites[unit.tag] = {"assigned": 0, "ideal": GAS_WORKER_SLOTS, "type": "aether"}
				deposits[vent] = unit.tag
				deposits[unit.tag] = unit.tag
		elif is_dropoff(unit, owner_id):
			sites[unit.tag] = {"assigned": 0, "ideal": 0, "type": "crystal"}
	for patch in resources.values():
		if patch.resource_type != "crystal_field" or (patch.amount <= 0 and not unlimited_resources):
			continue
		if vision != null and vision.state_at(owner_id, patch.pos) == Vision.UNEXPLORED:
			continue
		var origin: Vector2 = patch.get("line_origin", patch.pos)
		var hall := _find_nearest_town_hall(owner_id, origin)
		if hall.is_empty():
			continue
		var reach: float = hall.radius + 2.0 if patch.has("line_origin") else CRYSTAL_LINE_RADIUS
		if hall.pos.distance_squared_to(origin) <= reach * reach:
			sites[hall.tag].ideal += 2
			deposits[patch.tag] = hall.tag
	for worker in units.values():
		if worker.owner != owner_id or not worker.is_worker:
			continue
		for order in worker.orders:
			if order.type == "return_cargo":
				continue
			if order.type == "harvest" and deposits.has(order.target_tag):
				sites[deposits[order.target_tag]].assigned += 1
			break
	return sites

func _find_nearest_crystal(pos: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d: float = 999999.0
	for r in resources.values():
		if r["resource_type"] == "crystal_field" and (r["amount"] > 0 or unlimited_resources):
			var d = pos.distance_to(r["pos"])
			if d < best_d:
				best_d = d
				best = r
	return best

func _pick_local_crystal(worker: Dictionary, preferred: Dictionary) -> Dictionary:
	if preferred.is_empty():
		return {}
	var assignments := {}
	for other in units.values():
		if other.tag == worker.tag or other.owner != worker.owner or not other.is_worker or other.orders.is_empty():
			continue
		var order: Dictionary = other.orders[0]
		if order.type == "harvest":
			assignments[order.target_tag] = int(assignments.get(order.target_tag, 0)) + 1
	var best := preferred
	var best_count := 2147483647
	var best_distance := INF
	for patch in resources.values():
		if patch.resource_type != "crystal_field" or (patch.amount <= 0 and not unlimited_resources):
			continue
		if preferred.has("line_origin"):
			if patch.get("line_origin") != preferred.line_origin:
				continue
		elif patch.pos.distance_squared_to(preferred.pos) > CRYSTAL_LINE_RADIUS * CRYSTAL_LINE_RADIUS:
			continue
		if vision != null and vision.state_at(worker.owner, patch.pos) == Vision.UNEXPLORED:
			continue
		var count: int = assignments.get(patch.tag, 0)
		var distance: float = patch.pos.distance_squared_to(worker.pos)
		if count < best_count or (count == best_count and distance < best_distance):
			best = patch
			best_count = count
			best_distance = distance
	return best

func get_observation(perspective_player: int = 0) -> Dictionary:
	var limited := vision != null and perspective_player != 0
	var unit_list: Array = []
	var all_tags = units.keys()
	all_tags.sort()
	for tag in all_tags:
		var u = units[tag]
		if perspective_player != 0 and not can_see_unit(perspective_player, u):
			continue
		unit_list.append({
			"tag": u["tag"],
			"id": u["id"],
			"unit_type": u["unit_type"],
			"faction": u["faction"],
			"name": u["name"],
			"owner": u["owner"],
			"pos": {"x": snappedf(u["pos"].x, 0.01), "y": snappedf(u["pos"].y, 0.01), "z": snappedf(get_elevation_at(u["pos"]), 0.01)},
			"hp": snappedf(u["hp"], 0.1),
			"max_hp": u["max_hp"],
			"shields": snappedf(u["shields"], 0.1),
			"max_shields": u["max_shields"],
			"radius": u["radius"],
			"is_structure": u["is_structure"],
			"is_walkable_structure": u["is_walkable_structure"],
			"is_worker": u["is_worker"],
			"build_progress": snappedf(u["build_progress"], 0.01),
			"weapon_cooldown": snappedf(u["weapon_cooldown"], 0.01),
			"phase_cooldown": snappedf(u["phase_cooldown"], 0.01),
			"attack_state": u["attack_state"],
			"surge_timer": snappedf(u["surge_timer"], 0.01),
			"cargo_type": u["cargo_type"],
			"cargo_amount": u["cargo_amount"],
			"orders": [] if limited and u.owner != perspective_player else u["orders"].duplicate(true),
			"production_queue_len": 0 if limited and u.owner != perspective_player else u["production_queue"].size(),
			"kills": u["kills"]
		})
		var entry: Dictionary = unit_list.back()
		if u.get("hold_fire", false):
			entry["hold_fire"] = true
		match u.unit_type:
			"colony_hub":
				entry["energy"] = snappedf(u.energy, 0.01)
			"skirmisher":
				entry["energy"] = snappedf(u.energy, 0.01)
				entry["cloaked"] = u.get("cloaked", false)
			"silo", "silo_retracted":
				entry["supply_reinforced"] = u.get("supply_reinforced", false)
				entry["salvage_ticks"] = maxi(0, int(u.get("salvage_finish", 0)) - tick)
			"pioneer":
				entry["auto_repair"] = u.get("auto_repair", false)
		if not limited or u.owner == perspective_player:
			if not u.rally_route.is_empty():
				entry["rally_route"] = _observed_rally(u.rally_route)
			if u.unit_type == "brood_nest" and not u.worker_rally_route.is_empty():
				entry["worker_rally_route"] = _observed_rally(u.worker_rally_route)
			if uses_brood_slots(u):
				entry["brood_slots"] = u.brood_slots
			if requires_power(u.unit_type):
				entry["powered"] = is_powered(u.owner, u.pos)
			if u.is_structure and u.build_progress < 1.0:
				entry["builder_tag"] = construction_builder(u).get("tag", 0)
			if (uses_brood_slots(u) or requires_power(u.unit_type)) and not u.production_queue.is_empty():
				entry["production_progress"] = u.production_queue.map(func(item): return snappedf(item.progress, 0.01))

	var res_list: Array = []
	for r in resources.values():
		if limited and not can_see_position(perspective_player, r.pos):
			continue
		res_list.append({
			"tag": r["tag"],
			"id": r["id"],
			"resource_type": r["resource_type"],
			"pos": {"x": r["pos"].x, "y": r["pos"].y, "z": snappedf(get_elevation_at(r["pos"]), 0.01)},
			"amount": r["amount"],
			"rich": r.rich,
			"yield": deposit_yield(r),
			"present": deposit_present(r),
			"unlimited": unlimited_resources
		})

	var match_view := match_state.duplicate(true)
	var player_view := players.duplicate(true)
	var events := recent_events.slice(max(0, recent_events.size() - 15))
	if perspective_player != 0:
		events = []
	var memory := []
	if limited:
		if match_view.has("assigned_starts"):
			var slot = match_view.assigned_starts.get(str(perspective_player))
			match_view.assigned_starts = {str(perspective_player): slot} if slot != null else {}
		for player in player_view.keys():
			if player != perspective_player:
				player_view[player] = {"id": player, "name": players[player].name, "faction": players[player].faction}
		for building in remembered_buildings(perspective_player):
			var snapshot: Dictionary = building.duplicate()
			snapshot.pos = {"x": building.pos.x, "y": building.pos.y}
			memory.append(snapshot)
	var observation := {
		"tick": tick,
		"match": match_view,
		"sim_time": snappedf(sim_time, 0.01),
		"scenario": scenario_name,
		"rts_mode": rts_mode,
		"perspective_player": perspective_player,
		"map": {
			"width": map_width,
			"height": map_height,
			"obstacles": _rects_to_dicts(terrain_obstacles),
			"high_ground": _rects_to_dicts(high_ground_zones),
			"ramps": _rects_to_dicts(ramps),
			"water": _water_to_arrays(), "bridges": _rects_to_dicts(land_bridges),
			"terrain_tiles": terrain_tiles.duplicate(true)
		},
		"players": player_view,
		"units": unit_list,
		"resources": res_list,
		"recent_events": events
	}
	if limited:
		observation["vision"] = {
			"width": vision.size.x, "height": vision.size.y, "cell_size": Vision.CELL_SIZE,
			"cells": Array(vision.cells_for(perspective_player)),
			"last_seen_buildings": memory,
		}
	return observation

func _observed_rally(route: Array) -> Array:
	return route.map(func(waypoint):
		var position := rally_waypoint_position(waypoint)
		return {"kind": waypoint.kind, "target_tag": waypoint.target_tag, "x": position.x, "y": position.y})

func _water_to_arrays() -> Array:
	var out: Array = []
	for polygon in water_polygons:
		var points: Array = []
		for point in polygon:
			points.append([point.x, point.y])
		out.append(points)
	return out

func _rects_to_dicts(rects: Array[Rect2]) -> Array:
	var out: Array = []
	for r in rects:
		out.append({"x": r.position.x, "y": r.position.y, "w": r.size.x, "h": r.size.y})
	return out
