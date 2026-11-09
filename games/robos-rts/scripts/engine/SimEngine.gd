extends Node

class MoveFormation extends RefCounted:
	var slots := {}
	var bins := {}
	var spacing := 0.0
	var rings: Array[PackedVector2Array] = []
	var first_open_ring := {}

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
signal order_path_resolved(unit: Dictionary, order: Dictionary, requested: Vector2, endpoint: Vector2, status: String)
signal weapon_attack(attacker: Dictionary, target: Dictionary, weapon: Dictionary, hit_shields: bool)
signal ability_triggered(unit: Dictionary, ability_id: String, pos: Vector2)
signal resource_gathered(unit: Dictionary, resource_type: String, pos: Vector2)
signal resource_depleted(owner_id: int, resource_type: String)
signal unit_production_finished(unit: Dictionary, structure: Dictionary)
signal structure_construction_finished(structure: Dictionary)
signal match_finished

const TICK_RATE: int = 64
const TICK_DT: float = 1.0 / float(TICK_RATE)
const SPLASH_INNER_RADIUS_RATIO := 0.5
const SPATIAL_CELL_SIZE: float = 8.0
const PATH_CELL_SIZE: float = 2.0
const NARROW_PATH_CELL_SIZE := PATH_CELL_SIZE * 0.5
const FOOTPRINT_LATTICE_MARGIN := 0.15
const BRUSH_REVEAL_RADIUS := 6.0
const WATCH_STATION_CAPTURE := 4.0
const WATCH_STATION_SIGHT := 32.0
const FOOTPRINT_BIN_SIZE := 8.0
const INFANTRY_CLEARANCE := 0.85
const MAX_GROUND_CLEARANCE := 2.0
const WALK_TRACE_STEP := PATH_CELL_SIZE * 0.6
const NO_FOOTPRINTS: Array = []
const HARVEST_REACH := 1.2
const GAS_WORKER_SLOTS := 3
const INCOME_WINDOW := 60
const CRYSTAL_LINE_RADIUS := 26.0
const CONSTRUCTION_REFUND := 0.75
const REPAIR_HP_PER_SECOND := 12.0
const AUTO_REPAIR_RADIUS := 8.0
const MAX_RALLY_WAYPOINTS := 8
const ATTACHMENT_PAD_OFFSET := Vector2(5.5, 0.0)
const ATTACHMENT_LANDING_SNAP := 2.0
const PRODUCTION_FLIGHT_HEIGHT := 8.0
const PRODUCTION_EXIT_RETRY_TICKS := 8
const MAX_UPGRADE_LEVEL := 3
const HUB_ENERGY_MAX := 200.0
const HUB_POWER_COST := 50.0
const HUB_OPERATIONS_OFFER := {"crystal": 150, "aether": 50, "supply": 0, "time": 30.0, "requires": ["muster_hall"]}
const PROSPECTOR_LIFETIME_TICKS := 45 * TICK_RATE
const TRANSPORT_PICKUP_RADIUS := 6.5
const FIGHTER_TRANSITION_TICKS := 96
const PRODUCTION_BOOST_COST := 50.0
const PRODUCTION_BOOST_TICKS := 12 * TICK_RATE
const PRODUCTION_BOOST_RATE := 1.5
const FAST_DEPLOYMENT_COOLDOWN_TICKS := 20 * TICK_RATE
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
const SKIRMISH_MAPS := {"frontier-hunters": "Frontier Hunters", "iron-narrows": "Iron Narrows", "glassline-basin": "Glassline Basin"}
const Vision = preload("res://scripts/engine/RTSVision.gd")
const LivingGround = preload("res://scripts/engine/RTSLivingGround.gd")
const VISION_UPDATE_TICKS := 8

enum CrystalSelection { LINE_ASSIGNMENT, OPEN_SLOT, REACHABLE_PATCH }

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
var _brush_cells: Dictionary = {}
var watch_stations: Array[Dictionary] = []

var players: Dictionary = {}
var next_tag: int = 1001
var units: Dictionary = {}
var resources: Dictionary = {}
var spatial_grid: Dictionary = {}
var _spatial_by_owner: Dictionary = {}
var astar_grid: AStarGrid2D = AStarGrid2D.new()
var nav_dirty: bool = true
var _navigation_revision := 0

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
var living_ground := LivingGround.new(128.0, 96.0)
var frame_sim_usec: int = 0
var frame_sim_ticks: int = 0
var profile_usec: Dictionary = {"navigation": 0, "orders": 0, "steering": 0, "ai": 0, "vision": 0}
var _static_structures: Array[Dictionary] = []
var _footprint_bins: Dictionary = {}
var _clearance_grids: Dictionary = {}
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
	living_ground = LivingGround.new(width, height)
	next_tag = 1001
	units.clear()
	resources.clear()
	_footprint_bins.clear()
	_income_buckets.clear()
	nav_dirty = true
	_navigation_revision = 0
	spatial_grid.clear()
	_spatial_by_owner.clear()
	terrain_obstacles.clear()
	high_ground_zones.clear()
	ramps.clear()
	water_polygons.clear()
	land_bridges.clear()
	water_cells.clear()
	unlimited_resources = false
	terrain_tiles.clear()
	_brush_cells.clear()
	watch_stations.clear()
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
			"surge_efficiency": false,
			"fast_deployment": false,
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
	_configure_watch_stations(map_cfg)
	_spawn_route_blockers(map_cfg)
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
	var data := skirmish_map_config(map_id)
	if data.is_empty():
		return {"ok": false, "error": "Could not load the selected skirmish map."}
	for key in ["seed", "difficulty", "strategy", "unlimited_resources", "player_faction", "ai_faction"]:
		if options.has(key):
			data[key] = options[key]
	return _load_skirmish(data)

func skirmish_map_config(map_id: String) -> Dictionary:
	if not SKIRMISH_MAPS.has(map_id):
		return {}
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://scenarios/%s.jsonld" % map_id))
	return data if data is Dictionary else {}

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
	_configure_watch_stations(map_cfg)
	_spawn_route_blockers(map_cfg)
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
	if not _brush_cells.is_empty() or not watch_stations.is_empty():
		_rebuild_spatial_grid()
	if enabled:
		vision = Vision.new(map_width, map_height, players.keys())
		if not high_ground_zones.is_empty() or not ramps.is_empty():
			vision.configure_elevation(get_elevation_at)
	_refresh_vision()

func _configure_watch_stations(map_cfg: Dictionary) -> void:
	var bounds := Rect2(0, 0, map_width, map_height)
	var entries = map_cfg.get("watch_stations", [])
	if not entries is Array:
		return
	for entry in entries:
		if not entry is Dictionary:
			continue
		var position := Vector2(float(entry.get("x", -1)), float(entry.get("y", -1)))
		if bounds.has_point(position):
			watch_stations.append({"pos": position, "owner": 0})

func _refresh_vision() -> void:
	for station in watch_stations:
		var owner := 0
		for unit in query_units_in_radius(station.pos, WATCH_STATION_CAPTURE):
			if unit.is_structure or unit.flight_height > 0.0 or unit.hp <= 0.0 or not players.has(unit.owner):
				continue
			if unit.pos.distance_squared_to(station.pos) > WATCH_STATION_CAPTURE * WATCH_STATION_CAPTURE:
				continue
			if owner != 0 and owner != unit.owner:
				owner = 0
				break
			owner = unit.owner
		station.owner = owner
	if vision != null:
		var started := Time.get_ticks_usec()
		vision.update(units, tick, watch_stations, WATCH_STATION_SIGHT)
		profile_usec.vision += Time.get_ticks_usec() - started

func visible_watch_station_owner(station: Dictionary, player: int) -> int:
	return station.owner if can_see_position(player, station.pos) else 0

func _spawn_route_blockers(map_cfg: Dictionary) -> void:
	var bounds := Rect2(0, 0, map_width, map_height)
	var entries = map_cfg.get("route_blockers", [])
	if not entries is Array:
		return
	for entry in entries:
		if not entry is Dictionary:
			continue
		var position := Vector2(float(entry.get("x", -1)), float(entry.get("y", -1)))
		if bounds.has_point(position):
			spawn_unit("shale_barrier", 0, position, str(entry.get("id", "")))

func can_see_position(player: int, pos: Vector2) -> bool:
	return vision == null or player == 0 or vision.state_at(player, pos) == Vision.VISIBLE

func has_living_ground(position: Vector2, owner: int = 0) -> bool:
	return living_ground.covers(position, owner)

func visible_living_ground_cells(player: int) -> Array[Vector2i]:
	var visible: Array[Vector2i] = []
	for cell in living_ground.cells:
		if can_see_position(player, living_ground.cell_center(cell)):
			visible.append(cell)
	return visible

func _can_spread_living_ground(from: Vector2, to: Vector2) -> bool:
	if is_water_at(to, LivingGround.CELL_SIZE * 0.4) or is_water_at(from.lerp(to, 0.5), 0.45):
		return false
	for obstacle in terrain_obstacles:
		if obstacle.grow(1.25).has_point(to) or _walk_segment_enters_rect(from, to, obstacle):
			return false
	return true

func can_see_unit(player: int, unit: Dictionary) -> bool:
	if player == 0 or unit.owner == player:
		return true
	if not can_see_position(player, unit.pos):
		return false
	var cloaked := bool(unit.get("cloaked", false))
	var concealed: bool = not _brush_cells.is_empty() and not unit.is_structure and not unit.is_worker and unit.flight_height <= 0.0 and unit.attributes.has("Biological") and _brush_cells.has(Vector2i((unit.pos / 4.0).floor()))
	if not cloaked and not concealed:
		return true
	if vision != null and vision.sweep_detects(player, unit.pos):
		return true
	for detector in _detectors:
		if detector.owner == player and detector.hp > 0.0 and detector.build_progress >= 1.0:
			var radius: float = detector.detection_radius
			if unit.pos.distance_squared_to(detector.pos) <= radius * radius:
				return true
	if not cloaked:
		for scout in query_units_in_radius(unit.pos, BRUSH_REVEAL_RADIUS):
			if scout.owner == player and scout.hp > 0.0 and scout.build_progress >= 1.0 and scout.pos.distance_squared_to(unit.pos) <= BRUSH_REVEAL_RADIUS * BRUSH_REVEAL_RADIUS:
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
	if not worker.is_worker or worker.unit_type == "prospector" or not bool(def.get("is_structure", false)) or def.has("attachment_for") or def.get("faction", "") != worker.faction:
		return false
	for required in def.get("requires", []):
		if not has_tech_structure(worker.owner, str(required)):
			return false
	if requires_power(structure_type) and not is_powered(worker.owner, pos):
		return false
	return can_place_structure(structure_type, pos)

func has_tech_structure(owner_id: int, type_id: String) -> bool:
	var retracted_type := type_id + "_retracted"
	for unit in units.values():
		if unit.owner != owner_id or not unit.is_structure or unit.build_progress < 1.0:
			continue
		if unit.unit_type == type_id or unit.unit_type == retracted_type:
			return true
	return false

func requires_power(structure_type: String) -> bool:
	return structure_type == "aegis_relay" or (structure_type == "waystone" and not match_state.is_empty())

func is_powered(owner_id: int, pos: Vector2) -> bool:
	for unit in units.values():
		if unit.unit_type == "resonator" and unit.owner == owner_id and resonator_covers(unit, pos):
			return true
	return false

func resonator_covers(resonator: Dictionary, pos: Vector2) -> bool:
	return resonator.build_progress >= 1.0 and resonator.pos.distance_squared_to(pos) <= POWER_RADIUS * POWER_RADIUS

func uses_brood_slots(unit: Dictionary) -> bool:
	return unit.unit_type == "brood_nest" and not match_state.is_empty()

func can_place_structure(structure_type: String, pos: Vector2) -> bool:
	var def = RTSData.get_unit_def(structure_type)
	if def.is_empty() or not pos.is_finite():
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
		if u.is_structure and u.flight_height <= 0.0 and pos.distance_to(u.pos) < radius + float(u.radius) + 1.0:
			return false
	for res in resources.values():
		if not deposit_present(res):
			continue
		if pos.distance_to(res.pos) < radius + float(res.radius) + 0.5:
			if not extractor or res.resource_type != "aether_vent":
				return false
	return true

func _ground_mobile_overlaps(point: Vector2, radius: float) -> bool:
	for unit in units.values():
		if not unit.is_structure and unit.flight_height <= 0.0 and point.distance_to(unit.pos) < radius + unit.radius:
			return true
	return false

func production_attachment_pad(producer: Dictionary) -> Vector2:
	return producer.pos + ATTACHMENT_PAD_OFFSET

func _attachment_link_valid(producer: Dictionary, attachment: Dictionary) -> bool:
	return not producer.is_empty() and not attachment.is_empty() and producer.hp > 0.0 and producer.flight_height <= 0.0 \
		and producer.build_progress >= 1.0 and producer.owner == attachment.owner \
		and int(producer.get("attachment_tag", 0)) == attachment.tag and int(attachment.get("attachment_parent_tag", 0)) == producer.tag \
		and attachment.pos.is_equal_approx(production_attachment_pad(producer))

func production_attachment(producer: Dictionary, completed_only: bool = true) -> Dictionary:
	var attachment: Dictionary = units.get(int(producer.get("attachment_tag", 0)), {})
	if not _attachment_link_valid(producer, attachment) or (completed_only and attachment.build_progress < 1.0):
		return {}
	return attachment

func _is_light_infantry_job(job: Dictionary) -> bool:
	var definition: Dictionary = RTSData.get_unit_def(str(job.get("unit_type", "")))
	return definition.get("attributes", []).has("Light")

func active_production_slots(producer: Dictionary) -> int:
	var queue: Array = producer.production_queue
	if queue.is_empty() or producer.flight_height > 0.0 or (requires_power(producer.unit_type) and not is_powered(producer.owner, producer.pos)):
		return 0
	var required_attachment := str(queue[0].get("requires_attachment", ""))
	if not required_attachment.is_empty() and production_attachment(producer).get("unit_type") != required_attachment:
		return 0
	if uses_brood_slots(producer):
		return queue.size()
	if queue.size() >= 2 and producer.has("attachment_tag") and production_attachment(producer).get("unit_type") == "fabrication_module":
		# Heavy units and research are FIFO barriers. Neither lane can skip a job.
		if _is_light_infantry_job(queue[0]) and _is_light_infantry_job(queue[1]):
			return 2
	return 1

func attachment_block_reason(producer: Dictionary, attachment_type: String) -> String:
	var definition: Dictionary = RTSData.get_unit_def(attachment_type)
	if producer.is_empty() or not units.has(producer.tag) or producer.unit_type != definition.get("attachment_for") \
		or producer.faction != definition.get("faction") or not players.has(producer.owner):
		return "This structure cannot build that attachment."
	if producer.build_progress < 1.0 or producer.hp <= 0.0 or producer.flight_height > 0.0:
		return "Requires a completed, grounded Muster Hall."
	if not production_attachment(producer, false).is_empty():
		return "The attachment pad is already in use."
	var pad := production_attachment_pad(producer)
	if not can_see_position(producer.owner, pad):
		return "The attachment pad must be visible."
	if not can_place_structure(attachment_type, pad) or _ground_mobile_overlaps(pad, float(definition.radius)) \
		or not is_equal_approx(get_elevation_at(pad), get_elevation_at(producer.pos)):
		return "The attachment pad is blocked."
	var player: Dictionary = players[producer.owner]
	if player.crystal < int(definition.crystal_cost):
		return "Not enough crystal."
	if player.aether < int(definition.aether_cost):
		return "Not enough aether."
	return ""

func _start_production_attachment(producer: Dictionary, attachment_type: String) -> bool:
	var reason := attachment_block_reason(producer, attachment_type)
	if not reason.is_empty():
		notice.emit(producer.owner, reason, "error")
		return false
	var definition: Dictionary = RTSData.get_unit_def(attachment_type)
	var cost := Vector2i(definition.crystal_cost, definition.aether_cost)
	players[producer.owner].crystal -= cost.x
	players[producer.owner].aether -= cost.y
	var attachment := spawn_unit(attachment_type, producer.owner, production_attachment_pad(producer), "", 0.1)
	attachment["construction_cost"] = cost
	attachment["auto_summon"] = true
	_link_production_attachment(producer, attachment)
	return true

func _link_production_attachment(producer: Dictionary, attachment: Dictionary) -> void:
	attachment["attachment_parent_tag"] = producer.tag
	producer["attachment_tag"] = attachment.tag

func _unlink_attachment(attachment: Dictionary) -> void:
	var producer: Dictionary = units.get(int(attachment.get("attachment_parent_tag", 0)), {})
	if int(producer.get("attachment_tag", 0)) == attachment.tag:
		producer.erase("attachment_tag")
	attachment.erase("attachment_parent_tag")

func _orphan_attachment(attachment: Dictionary) -> void:
	_unlink_attachment(attachment)
	if attachment.build_progress < 1.0:
		_confirm_waiting_attack_loss(attachment)
		units.erase(attachment.tag)
		nav_dirty = true
		unit_destroyed.emit(attachment.duplicate(true))

func detach_production_attachment(producer: Dictionary) -> void:
	var attachment: Dictionary = units.get(int(producer.get("attachment_tag", 0)), {})
	if int(attachment.get("attachment_parent_tag", 0)) == producer.tag:
		_orphan_attachment(attachment)
	producer.erase("attachment_tag")

func lift_block_reason(producer: Dictionary) -> String:
	var definition: Dictionary = RTSData.get_unit_def(producer.unit_type)
	if not definition.has("lift_speed") or producer.flight_height > 0.0 or producer.build_progress < 1.0:
		return "Requires a completed, grounded Meridian production structure."
	var attachment := production_attachment(producer, false)
	if not attachment.is_empty() and attachment.build_progress < 1.0:
		return "Finish or cancel the attachment before lifting."
	return ""

func _set_producer_airborne(producer: Dictionary, airborne: bool) -> void:
	var definition: Dictionary = RTSData.get_unit_def(producer.unit_type)
	producer.flight_height = PRODUCTION_FLIGHT_HEIGHT if airborne else 0.0
	producer.speed = float(definition.lift_speed) if airborne else float(definition.get("speed", 0.0))
	producer.orders.clear()
	producer.path.clear()
	producer.vel = Vector2.ZERO
	producer.has_home_pos = false
	nav_dirty = true

func _detached_module_at_pad(producer: Dictionary, center: Vector2, tolerance: float) -> Dictionary:
	if producer.unit_type != "muster_hall":
		return {}
	var pad := center + ATTACHMENT_PAD_OFFSET
	var best := {}
	var nearest := tolerance * tolerance
	for module in units.values():
		if not module.is_structure or module.owner != producer.owner or module.has("attachment_parent_tag") \
			or module.build_progress < 1.0 or module.hp <= 0.0 or module.flight_height > 0.0:
			continue
		var distance: float = module.pos.distance_squared_to(pad)
		if distance > nearest or (not best.is_empty() and distance == nearest):
			continue
		if RTSData.get_unit_def(module.unit_type).get("attachment_for") != producer.unit_type:
			continue
		if not is_equal_approx(get_elevation_at(module.pos), get_elevation_at(module.pos - ATTACHMENT_PAD_OFFSET)):
			continue
		best = module
		nearest = distance
	return best

func production_landing_position(producer: Dictionary, requested: Vector2) -> Vector2:
	if not requested.is_finite():
		return requested
	var module := _detached_module_at_pad(producer, requested, ATTACHMENT_LANDING_SNAP)
	return module.pos - ATTACHMENT_PAD_OFFSET if not module.is_empty() else requested

func landing_block_reason(producer: Dictionary, position: Vector2) -> String:
	if not RTSData.get_unit_def(producer.unit_type).has("lift_speed") or producer.flight_height <= 0.0:
		return "Requires an airborne Meridian production structure."
	if not position.is_finite() or not can_see_position(producer.owner, position):
		return "Choose a visible landing site."
	if not can_place_structure(producer.unit_type, position) or _ground_mobile_overlaps(position, producer.radius):
		return "The landing footprint is blocked."
	return ""

func _land_production(producer: Dictionary, position: Vector2) -> void:
	producer.pos = position
	producer.prev_pos = position
	producer.facing = 0.0 if producer.owner == 1 else PI
	_set_producer_airborne(producer, false)
	# Movement later in this tick must already collide with the landed hull.
	_index_footprint(producer)
	var module := _detached_module_at_pad(producer, position, 0.01)
	if not module.is_empty() and module.pos.is_equal_approx(production_attachment_pad(producer)):
		_link_production_attachment(producer, module)

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
		elif footprint.flight_height <= 0.0 and can_see_unit(player, footprint):
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
		if tile.terrain == "brush":
			_brush_cells[Vector2i((rect.position / 4.0).floor())] = true
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
	if def.get("faction") == "neutral":
		owner_id = 0
		build_progress = 1.0

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
		"flight_height": float(def.get("flight_height", 0.0)),
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
		"attack_windup_duration": 0.0,
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
	if def.has("living_ground_radius"):
		u["living_ground_radius"] = def.living_ground_radius
	if def.has("living_ground_speed_bonus"):
		u["living_ground_speed_bonus"] = def.living_ground_speed_bonus
	if unit_type == "brood_nest":
		u["brood_slots"] = BROOD_SLOTS
		u["brood_recharge"] = 0.0
		u["worker_rally_route"] = []
	if def.has("support"):
		u["support"] = def.support
		u["energy"] = def.support.starting_energy
		u["support_target_tag"] = 0
		u["next_support_cue"] = 0
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
		"heartstone": return PRODUCTION_BOOST_COST
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

func unit_elevation(unit: Dictionary) -> float:
	return float(unit.flight_height) if unit.flight_height > 0.0 else get_elevation_at(unit.pos)

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
		if u.has("expires_tick") and tick >= int(u.expires_tick):
			_release_mining_slot(u)
			_confirm_waiting_attack_loss(u)
			units.erase(tag)
			unit_destroyed.emit(u)
			continue
		u["prev_pos"] = u["pos"]
		_update_unit_timers(u, TICK_DT)
		if u.has("support") and _step_support(u, TICK_DT):
			continue
		if u.is_structure and u.flight_height <= 0.0 and (not u.armed_structure or u.build_progress < 1.0):
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
	if tick % LivingGround.UPDATE_TICKS == 0:
		living_ground.update(units, tick, _can_spread_living_ground)
	if tick % VISION_UPDATE_TICKS == 0 and (vision != null or not watch_stations.is_empty()):
		_refresh_vision()
	_check_match_result()
	emit_signal("simulation_ticked", tick)

func _rebuild_astar_grid() -> void:
	_navigation_revision += 1
	_static_structures.clear()
	_footprint_bins.clear()
	_clearance_grids.clear()
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
		if u["is_structure"] and not u["is_walkable_structure"] and u.flight_height <= 0.0:
			_static_structures.append(u)
			_index_footprint(u)
		else:
			u.path.clear()
	_fill_navigation_grid(astar_grid, INFANTRY_CLEARANCE, false)

func _index_footprint(footprint: Dictionary) -> void:
	# Each trace segment checks the bins at its endpoint. Include a trace
	# step so a footprint crossed just before a bin boundary is still found.
	var reach := Vector2.ONE * (float(footprint.radius) + MAX_GROUND_CLEARANCE + WALK_TRACE_STEP)
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

func _fill_navigation_grid(grid: AStarGrid2D, clearance: float, ignore_cliffs: bool, cell_size: float = PATH_CELL_SIZE, lattice_offset: float = 0.5) -> void:
	grid.clear()
	grid.region = Rect2i(0, 0, ceili(map_width / cell_size), ceili(map_height / cell_size))
	grid.cell_size = Vector2.ONE * cell_size
	grid.offset = grid.cell_size * lattice_offset
	grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	grid.update()
	if not ignore_cliffs:
		for obs in terrain_obstacles:
			var expanded := obs.grow(clearance)
			var first := Vector2i(((expanded.position - grid.offset) / cell_size).ceil())
			var last := Vector2i(((expanded.end - grid.offset) / cell_size).ceil())
			grid.fill_solid_region(Rect2i(first, last - first).intersection(grid.region))
		var water_scale := roundi(PATH_CELL_SIZE / cell_size)
		for cell in water_cells:
			grid.fill_solid_region(Rect2i(cell * water_scale, Vector2i.ONE * water_scale).intersection(grid.region))
	for footprint in resources.values():
		if deposit_present(footprint):
			_mark_footprint(grid, footprint, clearance)
	for footprint in _static_structures:
		_mark_footprint(grid, footprint, clearance)

func _mark_footprint(grid: AStarGrid2D, footprint: Dictionary, clearance: float) -> void:
	# Leave a margin at lattice vertices so edges can round circular footprints.
	var reach := float(footprint.radius) + clearance + FOOTPRINT_LATTICE_MARGIN
	var first := _path_cell(grid, footprint.pos - Vector2.ONE * reach)
	var last := _path_cell(grid, footprint.pos + Vector2.ONE * reach)
	for x in range(first.x, last.x + 1):
		for y in range(first.y, last.y + 1):
			var cell := Vector2i(x, y)
			if grid.get_point_position(cell).distance_squared_to(footprint.pos) < reach * reach:
				grid.set_point_solid(cell)

func _navigation_grid(radius: float, ignore_cliffs: bool, cell_size: float = PATH_CELL_SIZE, lattice_offset: float = 0.5) -> AStarGrid2D:
	if cell_size == PATH_CELL_SIZE and not ignore_cliffs and is_equal_approx(radius, INFANTRY_CLEARANCE):
		return astar_grid
	var key := Vector4(radius, float(ignore_cliffs), cell_size, lattice_offset)
	if not _clearance_grids.has(key):
		var grid: AStarGrid2D
		if cell_size == PATH_CELL_SIZE or _has_off_grid_crossing(radius, lattice_offset):
			grid = AStarGrid2D.new()
			_fill_navigation_grid(grid, radius, ignore_cliffs, cell_size, lattice_offset)
		_clearance_grids[key] = grid
	return _clearance_grids[key]

func _has_off_grid_crossing(radius: float, lattice_offset: float) -> bool:
	# A continuous opening can fall entirely between coarse grid rows or columns.
	# Check for such a gap before allocating a second grid on a partial route.
	if terrain_obstacles.is_empty():
		return false
	var gates: Array[Rect2] = []
	for footprint in _static_structures:
		if footprint.unit_type == "silo":
			var extent := Vector2.ONE * (float(footprint.radius) + FOOTPRINT_LATTICE_MARGIN)
			gates.append(Rect2(footprint.pos - extent, extent * 2.0))
	for i in range(terrain_obstacles.size()):
		var a: Rect2 = terrain_obstacles[i]
		for j in range(i + 1, terrain_obstacles.size()):
			if _has_off_grid_gap_between(a, terrain_obstacles[j], radius, lattice_offset):
				return true
		for gate in gates:
			if _has_off_grid_gap_between(a, gate, radius, lattice_offset):
				return true
	return false

func _has_off_grid_gap_between(a: Rect2, b: Rect2, radius: float, lattice_offset: float) -> bool:
	for axis in range(2):
		var along := 1 - axis
		if maxf(a.position[along], b.position[along]) >= minf(a.end[along], b.end[along]):
			continue
		var first := minf(a.end[axis], b.end[axis]) + radius
		var last := maxf(a.position[axis], b.position[axis]) - radius
		if first < last and _first_path_center(first, PATH_CELL_SIZE) >= last and _first_path_center(first, NARROW_PATH_CELL_SIZE, lattice_offset) < last:
			return true
	return false

func _first_path_center(edge: float, cell_size: float, lattice_offset: float = 0.5) -> float:
	return (ceilf(edge / cell_size - lattice_offset) + lattice_offset) * cell_size

func _path_cell(grid: AStarGrid2D, pos: Vector2) -> Vector2i:
	var center_shift := grid.cell_size * 0.5 - grid.offset
	return Vector2i((pos + center_shift) / grid.cell_size).clamp(Vector2i.ZERO, grid.region.size - Vector2i.ONE)

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

	var path := _trace_navigation_grid(_navigation_grid(unit_radius, ignore_cliffs), start_pos, goal, unit_radius, ignore_cliffs)
	if not ignore_cliffs and not path.back().is_equal_approx(goal):
		# An integer-centered lane avoids giving a one-unit passage two
		# parallel tracks. Try the half-cell lattice if the centered route fails.
		for lattice_offset in [0.0, 0.5]:
			var narrow_grid := _navigation_grid(unit_radius, false, NARROW_PATH_CELL_SIZE, lattice_offset)
			if narrow_grid == null:
				continue
			var narrow_path := _trace_navigation_grid(narrow_grid, start_pos, goal, unit_radius, false)
			if narrow_path.back().is_equal_approx(goal):
				return narrow_path
	return path

func _trace_navigation_grid(grid: AStarGrid2D, start_pos: Vector2, goal: Vector2, unit_radius: float, ignore_cliffs: bool) -> Array[Vector2]:
	# A unit displaced at a choke lip can be in an open cell with its center
	# across the cliff corner. Snap to a center the unit can actually reach.
	var start_clearance := -1.0 if _is_point_blocked_by_static(start_pos, unit_radius, ignore_cliffs) else unit_radius
	var start := _find_nearest_walkable_cell(grid, start_pos, start_pos, start_clearance, ignore_cliffs)
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
	if smoothed.is_empty():
		smoothed.append(start_pos)
	return smoothed

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

func _find_nearest_walkable_cell(grid: AStarGrid2D, pos: Vector2, approach: Vector2, clearance: float = -1.0, ignore_cliffs: bool = false) -> Vector2i:
	var cell := _path_cell(grid, pos)
	if not grid.is_point_solid(cell) and (clearance < 0.0 or _has_clear_line_of_walk(pos, grid.get_point_position(cell), clearance, ignore_cliffs)):
		return cell
	var size := grid.region.size
	var best := cell
	var best_distance := INF
	var best_approach := INF
	# Visibility is needed only for the local bridge from a physical start
	# to the lattice. Keep that search bounded on legitimately isolated terrain.
	var search_limit := 3 if clearance >= 0.0 else maxi(size.x, size.y)
	for radius in range(1, search_limit):
		for side in [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]:
			var along := Vector2i(-side.y, side.x)
			for offset in range(-radius, radius):
				var candidate: Vector2i = cell + side * radius + along * offset
				if not grid.region.has_point(candidate) or grid.is_point_solid(candidate):
					continue
				var point := grid.get_point_position(candidate)
				if clearance >= 0.0 and not _has_clear_line_of_walk(pos, point, clearance, ignore_cliffs):
					continue
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
	if b.x < radius or b.y < radius or b.x > map_width - radius or b.y > map_height - radius:
		return false
	if not ignore_cliffs:
		for obstacle in terrain_obstacles:
			if _walk_segment_enters_rect(a, b, obstacle.grow(radius)):
				return false
	var check_water := not ignore_cliffs and not water_cells.is_empty()
	if not check_water and _footprint_bins.is_empty():
		return true
	var steps := maxi(1, ceili(a.distance_to(b) / WALK_TRACE_STEP))
	var previous := a
	for i in range(1, steps + 1):
		var p := a.lerp(b, float(i) / float(steps))
		if check_water and is_water_at(p, radius * 0.5):
			return false
		for footprint in _footprint_bins.get(_footprint_bin(p), NO_FOOTPRINTS):
			var reach: float = footprint.radius + radius
			var closest := Geometry2D.get_closest_point_to_segment(footprint.pos, previous, p)
			if closest.distance_squared_to(footprint.pos) < reach * reach:
				return false
		previous = p
	return true

func _walk_segment_enters_rect(a: Vector2, b: Vector2, rect: Rect2) -> bool:
	# Slab intersection catches brief diagonal corner crossings between grid
	# samples. A tangent that merely touches a boundary remains walkable.
	var motion := b - a
	var enter := 0.0
	var leave := 1.0
	for axis in range(2):
		if is_zero_approx(motion[axis]):
			if a[axis] <= rect.position[axis] or a[axis] >= rect.end[axis]:
				return false
			continue
		var first := (rect.position[axis] - a[axis]) / motion[axis]
		var last := (rect.end[axis] - a[axis]) / motion[axis]
		enter = maxf(enter, minf(first, last))
		leave = minf(leave, maxf(first, last))
		if enter >= leave:
			return false
	return true

func _is_point_blocked_by_static(p: Vector2, radius: float, ignore_cliffs: bool = false) -> bool:
	if p.x < radius or p.y < radius or p.x > map_width - radius or p.y > map_height - radius:
		return true
	if not ignore_cliffs:
		if is_water_at(p, radius * 0.5):
			return true
		for obs in terrain_obstacles:
			if obs.grow(radius).has_point(p):
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
	var reach := radius + _max_unit_radius
	var x0 := floori((center.x - reach) / SPATIAL_CELL_SIZE)
	var x1 := floori((center.x + reach) / SPATIAL_CELL_SIZE)
	var y0 := floori((center.y - reach) / SPATIAL_CELL_SIZE)
	var y1 := floori((center.y + reach) / SPATIAL_CELL_SIZE)
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
				var tags: Variant = grid.get(Vector2i(x, y))
				if tags == null:
					continue
				for tag in tags:
					var unit: Variant = units.get(tag)
					if unit == null:
						continue
					var combined_radius: float = radius + unit.radius
					if center.distance_squared_to(unit.pos) <= combined_radius * combined_radius:
						result.append(unit)
	return result

func _update_structures(dt: float) -> void:
	var arrivals: Array[Dictionary] = []
	for u in units.values():
		if not u["is_structure"]:
			continue
		if u.has("attachment_parent_tag") and not _attachment_link_valid(units.get(u.attachment_parent_tag, {}), u):
			_orphan_attachment(u)
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
		if u.unit_type == "colony_hub" or u.unit_type == "heartstone":
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
		var active := active_production_slots(u)
		# The tick at the deadline consumes the final interval of the boost.
		var boost_active := active > 0 and int(u.get("production_boost_until", -1)) >= tick and is_powered(u.owner, u.pos)
		var index := 0
		while index < active:
			var item: Dictionary = queue[index]
			var progress_dt := dt * PRODUCTION_BOOST_RATE if boost_active and item.has("unit_type") else dt
			item.progress = minf(item.progress + progress_dt, item.total_time)
			if item.progress < item.total_time or tick < int(item.get("exit_retry_tick", 0)):
				index += 1
			elif _try_finish_production(u, index, arrivals):
				active -= 1
			else:
				item["exit_retry_tick"] = tick + PRODUCTION_EXIT_RETRY_TICKS
				index += 1

func _try_finish_production(structure: Dictionary, index: int, arrivals: Array[Dictionary]) -> bool:
	var item: Dictionary = structure.production_queue[index]
	if item.has("upgrade"):
		structure.production_queue.remove_at(index)
		match item.upgrade:
			"hub_operations":
				structure["hub_operations"] = true
				notice.emit(structure.owner, "Colony Hub operations upgraded.", "info")
			"surge_efficiency":
				players[structure.owner].surge_efficiency = true
				notice.emit(structure.owner, "Efficient Surge complete.", "info")
			"fast_deployment":
				players[structure.owner].fast_deployment = true
				notice.emit(structure.owner, "Fast Deployment complete.", "info")
			_:
				players[structure.owner].upgrades[item.upgrade] = item.level
				notice.emit(structure.owner, "%s level %d complete." % [str(item.upgrade).capitalize(), item.level], "info")
		return true
	var utype: String = item.unit_type
	var is_worker := bool(RTSData.get_unit_def(utype).get("is_worker", false))
	var route: Array = structure.rally_route
	if structure.unit_type == "brood_nest" and is_worker:
		route = structure.worker_rally_route
	var first := default_rally_position(structure)
	if not route.is_empty():
		first = rally_waypoint_position(route.front())
	var deployment: Vector2 = item.get("deployment_pos", Vector2.INF)
	var deploy_remotely := deployment.is_finite() and fast_deployment_ticks(structure) == 0 and is_powered(structure.owner, structure.pos) \
		and _fast_deployment_site_valid(structure.owner, deployment, utype, arrivals, true)
	var spawn_pos := deployment if deploy_remotely else _rally_spawn_position(structure, first, utype, arrivals)
	if not spawn_pos.is_finite():
		return false
	# The job already reserves this supply. Remove it before spawn_unit counts
	# the recruit so the reservation is transferred exactly once.
	structure.production_queue.remove_at(index)
	var new_unit := spawn_unit(utype, structure.owner, spawn_pos)
	if new_unit.is_empty():
		return true
	arrivals.append(new_unit)
	players[structure.owner].units_trained += 1
	if deploy_remotely:
		structure["fast_deployment_until"] = tick + FAST_DEPLOYMENT_COOLDOWN_TICKS
	unit_production_finished.emit(new_unit, structure)
	if deploy_remotely:
		return true
	if deployment.is_finite():
		notice.emit(structure.owner, "Deployment site unavailable. Unit used the normal exit.", "info")
	if not route.is_empty():
		_apply_rally_route(new_unit, route)
	elif is_worker and not match_state.is_empty():
		issue_SmartHarvest(new_unit.tag)
	elif first.distance_to(structure.pos) > structure.radius + 1.5:
		issue_command([new_unit.tag], "move", first)
	return true

func fast_deployment_ticks(structure: Dictionary) -> int:
	return maxi(0, int(structure.get("fast_deployment_until", 0)) - tick)

func fast_deployment_block_reason(structure: Dictionary) -> String:
	if structure.unit_type != "waystone" or structure.build_progress < 1.0:
		return "Select a completed Waystone."
	if not players[structure.owner].get("fast_deployment", false):
		return "Research Fast Deployment first."
	if not is_powered(structure.owner, structure.pos):
		return "The Waystone needs a Resonator's power field."
	var remaining := fast_deployment_ticks(structure)
	if remaining > 0:
		return "Deployment recharges in %.1fs." % (remaining * TICK_DT)
	if structure.production_queue.is_empty() or not structure.production_queue[0].has("unit_type"):
		return "Queue a paid unit first."
	return ""

func _assign_fast_deployment(structure: Dictionary, pos: Vector2) -> bool:
	if not fast_deployment_block_reason(structure).is_empty():
		return false
	var item: Dictionary = structure.production_queue.front()
	if not _fast_deployment_site_valid(structure.owner, pos, item.unit_type):
		return false
	item["deployment_pos"] = pos
	return true

func _fast_deployment_site_valid(owner: int, pos: Vector2, unit_type: String, arrivals: Array[Dictionary] = [], check_mobiles: bool = false) -> bool:
	if not pos.is_finite() or not can_see_position(owner, pos) or not is_powered(owner, pos):
		return false
	var definition := RTSData.get_unit_def(unit_type)
	var radius: float = definition.get("radius", 0.85)
	var flying := float(definition.get("flight_height", 0.0)) > 0.0
	if _map_clamped_position(pos, radius) != pos or (not flying and _is_point_blocked_by_static(pos, radius)):
		return false
	if not check_mobiles:
		return true
	var nearby := query_units_in_radius(pos, radius)
	nearby.append_array(arrivals)
	for other in nearby:
		if other.is_structure or (other.flight_height > 0.0) != flying:
			continue
		var clearance: float = radius + other.radius
		if pos.distance_squared_to(other.pos) < clearance * clearance:
			return false
	return true

func _rally_spawn_position(structure: Dictionary, first: Vector2, unit_type: String, arrivals: Array[Dictionary] = []) -> Vector2:
	var definition: Dictionary = RTSData.get_unit_def(unit_type)
	var radius: float = definition.get("radius", 0.85)
	var flying: bool = float(definition.get("flight_height", 0.0)) > 0.0
	var cliff_walk := unit_type == "spire_walker"
	var direction: Vector2 = (first - structure.pos).normalized()
	if direction.is_zero_approx():
		direction = Vector2.RIGHT if structure.owner == 1 else Vector2.LEFT
	var rim: float = structure.radius + radius + 0.05
	var distance: float = maxf(structure.radius + 1.8, rim)
	var nearby := query_units_in_radius(structure.pos, distance + radius)
	# The spatial index is built before production. Account for earlier births
	# in this tick, including parallel jobs at the same Brood Nest.
	nearby.append_array(arrivals)
	for i in range(16):
		var turn := ((i + 1) / 2) * (1 if i % 2 == 1 else -1)
		var heading := direction.rotated(float(turn) * TAU / 16.0)
		var position: Vector2 = structure.pos + heading * distance
		if _map_clamped_position(position, radius) != position:
			continue
		if not flying and not _ground_production_exit_open(structure.pos + heading * rim, position, heading, radius, cliff_walk):
			continue
		var occupied := false
		for other in nearby:
			if (other.is_structure and other.flight_height <= 0.0) or (other.flight_height > 0.0) != flying:
				continue
			var clearance: float = radius + other.radius
			if position.distance_squared_to(other.pos) < clearance * clearance:
				occupied = true
				break
		if not occupied:
			return position
	return Vector2.INF

func _ground_production_exit_open(rim: Vector2, position: Vector2, heading: Vector2, radius: float, cliff_walk: bool) -> bool:
	if _is_point_blocked_by_static(rim, radius, cliff_walk) or not _has_clear_line_of_walk(rim, position, radius, cliff_walk):
		return false
	# A free spawn point alone could be a pocket between footprints. Require
	# space to leave it, allowing a turn around an adjacent obstacle.
	for turn in [0.0, PI / 4.0, -PI / 4.0]:
		if _has_clear_line_of_walk(position, position + heading.rotated(turn) * PATH_CELL_SIZE, radius, cliff_walk):
			return true
	return false

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
	if u.has("fighter_mode_until"):
		if tick >= int(u.fighter_mode_until):
			_finish_fighter_mode(u)
		return

	if u["attack_state"] == "windup":
		var target = units.get(u["attack_target_tag"], {})
		if target.is_empty() or target["hp"] <= 0.0 or not can_see_unit(u.owner, target):
			u["attack_state"] = "idle"
		else:
			u["attack_state_timer"] -= dt
			u["facing"] = (target["pos"] - u["pos"]).angle()
			if u["attack_state_timer"] <= 0.0:
				if not _execute_weapon_hit(u, target):
					u.attack_state = "idle"
					return
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

	_start_waiting_target_order(u)
	if u["orders"].is_empty():
		if u.get("auto_repair", false) and tick % 8 == u.tag % 8 and _begin_auto_repair(u):
			return
		# Skirmish guards fire in place until the director commits them.
		var range_only: bool = u.is_structure
		if not range_only and not u.is_worker:
			var directive: Dictionary = RTSCommanderAI.player_directives.get(u.owner, {})
			range_only = directive.get("enabled", false) and directive.get("mode") == "skirmish"
		var enemy = _find_best_attack_target(u, range_only)
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
		"land":
			var position: Vector2 = order.target_pos
			if u.pos.distance_squared_to(position) > 0.04:
				_follow_order_path(u, position, dt)
				return
			var reason := landing_block_reason(u, position)
			if not reason.is_empty():
				u.orders.pop_front()
				u.path.clear()
				notice.emit(u.owner, reason, "warn")
				return
			_land_production(u, position)

		"move":
			var target_pos := _prepare_order_path(u, order)
			var arrival_rad: float = float(order.get("arrival_radius", 0.9))
			if u.path.size() == 1 and u.pos.distance_to(target_pos) <= arrival_rad:
				if not _can_finish_path_order(u, order):
					return
				u["orders"].pop_front()
				u["path"].clear()
				u["home_pos"] = u["pos"]
				u["has_home_pos"] = true
			else:
				if _can_finish_path_order(u, order) and _should_settle_in_group_arrival(u, target_pos, arrival_rad):
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
			if u.has("skirmish_route"):
				u.skirmish_route.erase("blocked_pursuit")
			var range_only := bool(order.get("stay_on_route", false))
			var pursuit_origins: Dictionary = order.get("_pursuit_origins", {})
			var enemy := _find_best_attack_target(u, range_only, pursuit_origins)
			if not enemy.is_empty():
				if otype == "attack_move" and not range_only and not enemy.is_structure and not pursuit_origins.has(enemy.tag):
					# Preserve the acquisition point so a retreating target cannot
					# extend the chase just by staying within the moving scan radius.
					pursuit_origins[enemy.tag] = u.pos
					order["_pursuit_origins"] = pursuit_origins
				var wpn_range = _get_weapon_range(u)
				if _edge_distance(u, enemy) <= wpn_range:
					_begin_attack_on(u, enemy)
				else:
					_approach_target(u, enemy["pos"], dt)
					if u.has("skirmish_route"):
						var reach: float = wpn_range + u.radius + enemy.radius + 0.75
						u.skirmish_route["blocked_pursuit"] = u.path.back().distance_squared_to(enemy.pos) > reach * reach
			else:
				var target_pos := _prepare_order_path(u, order)
				var arrival_rad: float = float(order.get("arrival_radius", 1.5))
				if u.path.size() == 1 and u.pos.distance_to(target_pos) <= arrival_rad:
					if not _can_finish_path_order(u, order):
						return
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
			var intercept: Dictionary = order.get("_defense_intercept", {})
			var target_lost := enemy.is_empty() or not can_see_unit(u.owner, enemy)
			if not intercept.is_empty() and (target_lost or enemy.pos.distance_squared_to(intercept.center) > intercept.radius_squared or not can_attack(u, enemy)):
				u.orders[0] = {"type": "move", "target_pos": intercept.origin}
				u.path.clear()
				return
			if target_lost:
				# Mobile units can continue to the last observed location of an enemy.
				if otype == "attack_target" and not u.is_immobile and order.has("target_pos") and (vision != null or not enemy.is_empty()):
					u.orders[0] = {"type": "attack_move", "target_pos": order.target_pos}
				else:
					u.orders.pop_front()
				u.path.clear()
				return
			if enemy.hp <= 0.0 or not can_attack(u, enemy):
				u["orders"].pop_front()
				u.path.clear()
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
		"unload_transport":
			if u.pos.distance_squared_to(order.target_pos) > 1.0:
				_move_toward_point(u, order.target_pos, dt)
			else:
				if not _unload_transport(u, order.target_pos):
					notice.emit(u.owner, "Deployment site blocked. Troops remain aboard.", "warn")
				u.orders.pop_front()
				u.path.clear()
				u.home_pos = u.pos

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

func _start_waiting_target_order(unit: Dictionary) -> void:
	while not unit.orders.is_empty() and unit.orders[0].get("waiting_for_turn", false):
		var order: Dictionary = unit.orders[0]
		if _waiting_target_lost(unit, order):
			unit.orders.pop_front()
			unit.path.clear()
			continue
		order.erase("waiting_for_turn")
		if order.type == "harvest":
			unit.harvest_target_tag = order.target_tag
		break

func _waiting_target_lost(unit: Dictionary, order: Dictionary) -> bool:
	var target: Dictionary = units.get(order.target_tag, {})
	match order.type:
		"attack_target":
			# Treat an unobserved loss just like an enemy that moved out of sight.
			if target.is_empty():
				return vision == null or order.get("target_lost", false)
			return can_see_unit(unit.owner, target) and (target.hp <= 0.0 or not can_attack(unit, target))
		"force_attack":
			return target.is_empty() or target.hp <= 0.0 or target.owner != unit.owner or not can_attack(unit, target)
		"follow":
			return not _is_friendly_mobile(target, unit.owner)
		"harvest":
			var source: Dictionary = resources.get(order.target_tag, {})
			if source.is_empty():
				if target.is_empty() or not target.is_extractor or target.owner != unit.owner or target.hp <= 0.0:
					return true
				source = resources.get(_gas_source_by_tap.get(target.tag, 0), {})
			elif source.resource_type == "aether_vent":
				var tap_tag: int = _gas_tap_by_vent.get(Vector2i(unit.owner, source.tag), 0)
				var tap: Dictionary = units.get(tap_tag, {})
				if tap.is_empty() or tap.hp <= 0.0:
					return true
			return not source.is_empty() and not unlimited_resources and source.amount <= 0
	return false

func _confirm_waiting_attack_loss(target: Dictionary) -> void:
	if vision == null:
		return
	var visibility := {}
	for unit in units.values():
		for order in unit.orders:
			if order.type != "attack_target" or not order.get("waiting_for_turn", false) or order.target_tag != target.tag:
				continue
			if not visibility.has(unit.owner):
				visibility[unit.owner] = can_see_unit(unit.owner, target)
			if visibility[unit.owner]:
				order["target_lost"] = true

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
		var crystal_trip: bool = u.cargo_type == "crystal"
		if _deliver_worker_cargo(u, dt, hall_tag):
			if u.orders.size() > 1:
				u.orders.pop_front()
				u.path.clear()
			elif crystal_trip:
				var patch: Dictionary = resources.get(res_tag, {})
				if patch.get("resource_type") == "crystal_field" and deposit_present(patch):
					_reassign_crystal_worker(u, order, patch, CrystalSelection.OPEN_SLOT)
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
			if u.unit_type == "prospector":
				u.cargo_amount *= 2
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
		var reach: float = u.radius + target_entity.radius + HARVEST_REACH
		_prepare_path(u, target_entity.pos, 3.0, reach)
		if not is_gas and u.orders.size() == 1 and tick % TICK_RATE == u.tag % TICK_RATE:
			# Retry a partial route once per topology revision, spread over a
			# second so a closed gate cannot replan an entire line in one tick.
			if order.get("_blocked_crystal_revision", -1) != _navigation_revision and u.path.back().distance_squared_to(target_entity.pos) > reach * reach:
				order["_blocked_crystal_revision"] = _navigation_revision
				if _reassign_crystal_worker(u, order, target_entity, CrystalSelection.REACHABLE_PATCH):
					return
		_follow_path(u, dt)

func _reassign_crystal_worker(worker: Dictionary, order: Dictionary, current: Dictionary, mode: CrystalSelection) -> bool:
	var patch := _pick_local_crystal(worker, current, mode)
	if patch.tag == current.tag:
		return false
	order.target_tag = patch.tag
	worker.harvest_target_tag = patch.tag
	worker.path.clear()
	return true

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
					_confirm_waiting_attack_loss(u)
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
	if not worker.is_worker or worker.unit_type == "prospector" or worker.is_immobile or site.build_progress >= 1.0 or site.get("auto_summon", false):
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
	_unlink_attachment(site)
	_confirm_waiting_attack_loss(site)
	units.erase(site.tag)
	nav_dirty = true
	_recompute_supplies()

func _is_finished_silo(unit: Dictionary, owner_id: int) -> bool:
	return not unit.is_empty() and unit.owner == owner_id and unit.unit_type in ["silo", "silo_retracted"] and unit.build_progress >= 1.0

func can_use_hub_power(unit: Dictionary) -> bool:
	return unit.unit_type == "colony_hub" and unit.build_progress >= 1.0 and unit.energy >= HUB_POWER_COST

func hub_upgrade_block_reason(hub: Dictionary) -> String:
	if hub.unit_type != "colony_hub" or hub.build_progress < 1.0:
		return "Requires a completed Colony Hub."
	if hub.get("hub_operations", false):
		return "Operations already upgraded."
	if hub.production_queue.any(func(item): return item.get("upgrade") == "hub_operations"):
		return "Upgrade already queued."
	if not has_tech_structure(hub.owner, "muster_hall"):
		return "Requires Muster Hall."
	if hub.production_queue.size() >= 5:
		return "Colony Hub queue is full."
	var player: Dictionary = players[hub.owner]
	if player.crystal < HUB_OPERATIONS_OFFER.crystal:
		return "Not enough crystal."
	if player.aether < HUB_OPERATIONS_OFFER.aether:
		return "Not enough aether."
	return ""

func _enqueue_hub_upgrade(hub: Dictionary) -> bool:
	if not hub_upgrade_block_reason(hub).is_empty():
		return false
	var player: Dictionary = players[hub.owner]
	player.crystal -= HUB_OPERATIONS_OFFER.crystal
	player.aether -= HUB_OPERATIONS_OFFER.aether
	hub.production_queue.append({"upgrade": "hub_operations", "level": 1, "crystal_cost": HUB_OPERATIONS_OFFER.crystal,
		"aether_cost": HUB_OPERATIONS_OFFER.aether, "progress": 0.0, "total_time": HUB_OPERATIONS_OFFER.time * build_time_scale()})
	return true

func can_use_production_boost(unit: Dictionary) -> bool:
	return unit.unit_type == "heartstone" and unit.build_progress >= 1.0 and unit.energy >= PRODUCTION_BOOST_COST

func production_boost_ticks(unit: Dictionary) -> int:
	return maxi(0, int(unit.get("production_boost_until", 0)) - tick)

func production_boost_target_reason(owner: int, producer: Dictionary) -> String:
	if producer.is_empty() or producer.owner != owner or not producer.is_structure or producer.build_progress < 1.0 or RTSData.get_unit_def(producer.unit_type).get("trains", []).is_empty():
		return "Select a completed friendly producer."
	if not is_powered(owner, producer.pos):
		return "The producer needs a Resonator's power field."
	if production_boost_ticks(producer) > 0:
		return "Production boost is already active."
	return ""

func _cast_production_boost(source: Dictionary, producer: Dictionary) -> bool:
	if not can_use_production_boost(source) or not production_boost_target_reason(source.owner, producer).is_empty():
		return false
	source.energy -= PRODUCTION_BOOST_COST
	producer["production_boost_until"] = tick + PRODUCTION_BOOST_TICKS
	return true

func _use_hub_power(hub: Dictionary, command: String, position: Vector2, target_tag: int) -> bool:
	if not can_use_hub_power(hub):
		return false
	if command == "recon_sweep":
		if vision == null or not position.is_finite() or not Rect2(0, 0, map_width, map_height).has_point(position):
			return false
		vision.add_sweep(hub.owner, position, SWEEP_RADIUS, tick + SWEEP_TICKS)
		_refresh_vision()
	elif command == "deploy_prospector":
		var deposit: Dictionary = resources.get(target_tag, {})
		if not hub.get("hub_operations", false) or deposit.get("resource_type") != "crystal_field" or not deposit_present(deposit) or not can_see_position(hub.owner, deposit.pos):
			return false
		var radius: float = RTSData.get_unit_def("prospector").radius
		var landing := _interaction_destination(hub.pos, deposit.pos, Vector2.INF, radius, radius + deposit.radius + HARVEST_REACH, false)
		if not landing.is_finite():
			return false
		var helper := spawn_unit("prospector", hub.owner, landing)
		helper["expires_tick"] = tick + PROSPECTOR_LIFETIME_TICKS
		issue_command([helper.tag], "harvest", deposit.pos, deposit.tag)
		ability_triggered.emit(helper, command, landing)
		unit_production_finished.emit(helper, hub)
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

func can_restore(source: Dictionary, target: Dictionary) -> bool:
	if not source.has("support") or target.is_empty() or target.tag == source.tag:
		return false
	if target.owner != source.owner or target.hp <= 0.0 or target.build_progress < 1.0:
		return false
	if source.support.stat == "hp":
		return not target.is_structure and target.flight_height <= 0.0 and target.attributes.has("Biological") and target.hp < target.max_hp
	return target.shields < target.max_shields

func _step_support(source: Dictionary, dt: float) -> bool:
	var config: Dictionary = source.support
	var previous: int = source.support_target_tag
	source.support_target_tag = 0
	if source.build_progress < 1.0 or (source.is_structure and not is_powered(source.owner, source.pos)):
		return false
	source.energy = minf(config.max_energy, source.energy + float(config.regen) * dt)
	var order: Dictionary = source.orders.front() if not source.orders.is_empty() else {}
	var target: Dictionary = {}
	if order.get("type") == "restore_vitals":
		target = units.get(order.target_tag, {})
		if not can_restore(source, target):
			source.orders.pop_front()
			source.path.clear()
			return false
		source.vel = Vector2.ZERO
		if _edge_distance(source, target) > float(config.range):
			_follow_order_path(source, target.pos, dt, source.radius + target.radius + float(config.range))
			return true
		source.path.clear()
	elif order.is_empty() or (order.type == "hold_position" and source.orders.size() == 1):
		target = units.get(previous, {})
		if not can_restore(source, target) or _edge_distance(source, target) > float(config.range):
			target = {}
			if tick % 8 == int(source.tag) % 8:
				var nearest := float(config.range)
				for candidate in query_units_in_radius(source.pos, nearest + float(source.radius)):
					if not can_restore(source, candidate):
						continue
					var distance := _edge_distance(source, candidate)
					if distance <= nearest:
						target = candidate
						nearest = distance
	if target.is_empty():
		return false
	var stat: String = config.stat
	var amount := minf(minf(float(config.rate) * dt, source.energy), float(target["max_" + stat]) - float(target[stat]))
	target[stat] += amount
	source.energy -= amount
	source.vel = Vector2.ZERO
	source.support_target_tag = target.tag
	if not source.is_structure:
		source.facing = (target.pos - source.pos).angle()
	if previous != target.tag and tick >= source.next_support_cue:
		source.next_support_cue = tick + 64
		ability_triggered.emit(source, config.ability, target.pos)
	return true

func _approach_target(u: Dictionary, target_pos: Vector2, dt: float) -> void:
	_prepare_path(u, target_pos, 1.0)
	_follow_path(u, dt)

func _follow_order_path(u: Dictionary, target_pos: Vector2, dt: float, reach: float = INF) -> void:
	_prepare_path(u, target_pos, 3.0, reach)
	_follow_path(u, dt)

func _prepare_order_path(u: Dictionary, order: Dictionary) -> Vector2:
	var goal: Vector2 = order.get("target_pos", u.pos)
	if u.path.is_empty() and order.has("_formation") and not order.has("arrival_pos"):
		# A clear path through a slot to the requested anchor needs no second
		# full-distance scan. Obstructed approaches use the regular pathfinder.
		var anchor := _map_clamped_position(goal, u.radius)
		var flying: bool = u.flight_height > 0.0
		var cliff_walk: bool = u.unit_type == "spire_walker"
		if flying or not _is_point_blocked_by_static(anchor, u.radius, cliff_walk):
			var slot := _find_group_arrival(u, order["_formation"], anchor)
			if slot.is_finite() and (flying or _has_clear_line_of_walk(u.pos, slot, u.radius, cliff_walk)):
				_reserve_group_arrival(u, order, anchor, slot)
				u.path = [slot]
				u["nav_goal"] = goal
				_update_path_reach(u, order, goal, anchor)
				return slot
	if _prepare_path(u, goal, 0.05):
		var endpoint: Vector2 = u.path.back()
		if order.has("_formation"):
			_apply_group_arrival(u, order)
		_update_path_reach(u, order, goal, endpoint)
	return u.path.back()

func _update_path_reach(u: Dictionary, order: Dictionary, requested: Vector2, endpoint: Vector2) -> void:
	if u.flight_height > 0.0:
		return
	var revised: bool = order.get("navigation_revision", -1) != _navigation_revision
	var show_feedback := not order_path_resolved.get_connections().is_empty()
	var shortened := requested.is_finite() and endpoint.distance_squared_to(requested) > 1.0
	var status := ""
	if revised or (show_feedback and shortened):
		var projected: Vector2 = _project_destination(u.pos, requested, u.radius, u.unit_type == "spire_walker") if requested.is_finite() else u.pos
		var reaches_goal := endpoint.distance_squared_to(projected) <= 1.0
		if revised:
			# A raised gate or new foundation can cover the click itself.
			# A newly projected edge does not complete a formerly exact leg.
			var displaced: bool = shortened and order.get("_reachable_request", Vector2.INF) == requested
			var reaches_active_leg := reaches_goal and not displaced
			order["waiting_for_route"] = order.get("route_was_reachable", false) and not reaches_active_leg
			order["route_was_reachable"] = order.get("route_was_reachable", false) or reaches_active_leg
			order["navigation_revision"] = _navigation_revision
		if show_feedback and shortened:
			status = "waiting" if order.get("waiting_for_route", false) else ("adjusted" if reaches_goal else "partial")
	if requested.is_finite() and not shortened:
		order["_reachable_request"] = requested
	if show_feedback:
		# Test reach against the unformed endpoint, then mark the actual slot.
		order_path_resolved.emit(u, order, requested, u.path.back(), status)

func _can_finish_path_order(u: Dictionary, order: Dictionary) -> bool:
	return u.flight_height > 0.0 or (not nav_dirty and not order.get("waiting_for_route", false))

func _prepare_path(u: Dictionary, target_pos: Vector2, tolerance: float, reach: float = INF) -> bool:
	if u.path.is_empty() or u.get("nav_goal", Vector2.INF).distance_squared_to(target_pos) > tolerance * tolerance:
		if u.flight_height > 0.0:
			u.path = [_map_clamped_position(target_pos, u.radius) if target_pos.is_finite() else u.pos]
		else:
			u.path = compute_smooth_path(u.pos, target_pos, u.radius, u.unit_type == "spire_walker", reach)
		u["nav_goal"] = target_pos
		return true
	return false

func _apply_group_arrival(u: Dictionary, order: Dictionary) -> void:
	# Allocate at the start of each leg, from the reachable endpoint of its
	# current path. Each queued click owns its own set of reservations.
	var formation: MoveFormation = order["_formation"]
	var anchor: Vector2 = u.path.back()
	var slot: Vector2 = order.get("arrival_pos", Vector2.INF)
	var flying: bool = u.flight_height > 0.0
	var cliff_walk: bool = u.unit_type == "spire_walker"
	if not slot.is_finite() or not anchor.is_equal_approx(order.get("_formation_anchor", Vector2.INF)) or (not flying and not _has_clear_line_of_walk(anchor, slot, u.radius, cliff_walk)):
		if slot.is_finite() and int(formation.slots.get(slot, {}).get("tag", 0)) == int(u.tag):
			formation.slots.erase(slot)
			formation.bins[Vector2i((slot / formation.spacing).floor())].erase(slot)
			formation.first_open_ring.clear()
		slot = _find_group_arrival(u, formation, anchor)
		if slot.is_finite():
			_reserve_group_arrival(u, order, anchor, slot)
		else:
			slot = anchor
			order["_formation_anchor"] = anchor
			order["arrival_pos"] = slot
	if slot.is_equal_approx(anchor):
		return
	var approach: Vector2 = u.pos if u.path.size() == 1 else u.path[-2]
	if flying or _has_clear_line_of_walk(approach, slot, u.radius, cliff_walk):
		u.path[-1] = slot
	else:
		u.path.append(slot)

func _reserve_group_arrival(u: Dictionary, order: Dictionary, anchor: Vector2, slot: Vector2) -> void:
	var formation: MoveFormation = order["_formation"]
	formation.slots[slot] = {"tag": u.tag, "radius": u.radius}
	var cell := Vector2i((slot / formation.spacing).floor())
	var bin: Array = formation.bins.get(cell, [])
	bin.append(slot)
	formation.bins[cell] = bin
	order["_formation_anchor"] = anchor
	order["arrival_pos"] = slot

func _find_group_arrival(u: Dictionary, formation: MoveFormation, anchor: Vector2) -> Vector2:
	var flying: bool = u.flight_height > 0.0
	var cliff_walk: bool = u.unit_type == "spire_walker"
	var anchor_key := Vector3(anchor.x, anchor.y, u.radius)
	var start_ring: int = formation.first_open_ring.get(anchor_key, 0)
	for ring in range(start_ring, formation.rings.size()):
		var best := Vector2.INF
		var best_score := INF
		var all_reserved := true
		for offset in formation.rings[ring]:
			var point := _map_clamped_position(anchor + offset, u.radius)
			if formation.slots.has(point):
				continue
			all_reserved = false
			var score: float = point.distance_to(anchor) + 0.25 * point.distance_to(u.pos)
			if score >= best_score or _group_arrival_overlaps(point, u.radius, formation):
				continue
			if not flying and not _has_clear_line_of_walk(anchor, point, u.radius, cliff_walk):
				continue
			best = point
			best_score = score
		if best.is_finite():
			return best
		if all_reserved and ring == int(formation.first_open_ring.get(anchor_key, 0)):
			formation.first_open_ring[anchor_key] = ring + 1
	return Vector2.INF

func _group_arrival_overlaps(point: Vector2, radius: float, formation: MoveFormation) -> bool:
	var cell := Vector2i((point / formation.spacing).floor())
	for y in range(-1, 2):
		for x in range(-1, 2):
			for slot: Vector2 in formation.bins.get(cell + Vector2i(x, y), []):
				var clearance: float = radius + float(formation.slots[slot].radius) + 1.5
				if point.distance_squared_to(slot) < clearance * clearance:
					return true
	return false

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
	u["vel"] = dir * effective_move_speed(u)
	u["facing"] = dir.angle()

func active_living_ground_speed_bonus(unit: Dictionary) -> float:
	var bonus := float(unit.get("living_ground_speed_bonus", 0.0))
	return bonus if bonus > 0.0 and unit.flight_height <= 0.0 and has_living_ground(unit.pos) else 0.0

func effective_move_speed(unit: Dictionary) -> float:
	if unit.is_immobile:
		return 0.0
	var speed: float = unit.speed
	if unit.surge_timer > 0.0:
		speed *= 1.5
	if unit.charge_timer > 0.0:
		speed *= 1.8
	if unit.slow_timer > 0.0:
		speed *= 0.5
	return speed * (1.0 + active_living_ground_speed_bonus(unit))

func _should_settle_in_group_arrival(u: Dictionary, target_pos: Vector2, base_arrival: float) -> bool:
	var dist = u["pos"].distance_to(target_pos)
	if dist > base_arrival * 2.8:
		return false
	var neighbors = query_units_in_radius(u["pos"], u["radius"] * 2.4)
	for n in neighbors:
		if n["tag"] == u["tag"] or n["owner"] != u["owner"]:
			continue
		if (u.flight_height > 0.0) != (n.flight_height > 0.0):
			continue
		if n["orders"].is_empty() and n["home_pos"].distance_to(target_pos) <= base_arrival * 3.0:
			if u["pos"].distance_to(n["pos"]) <= (u["radius"] + n["radius"]) * 1.35:
				return true
	return false

func _start_choke_yield(leader: Dictionary, blocker: Dictionary, direction: Vector2, mineral_walkers: Dictionary) -> void:
	var across := direction.orthogonal()
	var gap: float = leader.radius + blocker.radius + 0.6
	var midpoint: Vector2 = (leader.pos + blocker.pos) * 0.5
	if direction.dot((blocker.pos - leader.pos).normalized()) < 0.65:
		return
	if not blocker.orders.is_empty():
		if blocker.vel.dot(direction) >= -0.25:
			return
		# A consistent direction wins a head-on tie across the whole line.
		if (direction.x if absf(direction.x) >= absf(direction.y) else direction.y) < 0.0:
			return
	var cliff_walk: bool = blocker.unit_type == "spire_walker"
	if not (_is_point_blocked_by_static(midpoint + across * gap, blocker.radius, cliff_walk) and _is_point_blocked_by_static(midpoint - across * gap, blocker.radius, cliff_walk)):
		return
	for unit in query_units_in_radius(blocker.pos, 9.0):
		if unit.owner != leader.owner or unit.is_structure or unit.is_immobile or unit.flight_height > 0.0 or unit.has("choke_yield") or mineral_walkers.has(unit.tag):
			continue
		if unit.attack_state != "idle":
			continue
		var offset: Vector2 = unit.pos - leader.pos
		if offset.dot(direction) <= 0.0 or absf(offset.dot(across)) > gap or unit.vel.dot(direction) > 0.25:
			continue
		if not unit.orders.is_empty() and unit.vel.dot(direction) >= -0.25:
			continue
		var berth := _find_choke_berth(unit, direction, across, leader.radius + unit.radius + 0.8)
		if not berth.is_empty():
			unit["choke_yield"] = {"leader": leader.tag, "direction": direction, "turn": berth[0], "point": berth[1], "expires": tick + 6 * 64}

func _find_choke_berth(unit: Dictionary, direction: Vector2, across: Vector2, gap: float) -> Array[Vector2]:
	var from: Vector2 = unit.pos
	var radius: float = unit.radius
	var cliff_walk: bool = unit.unit_type == "spire_walker"
	var side := 1.0 if unit.tag % 2 == 0 else -1.0
	for step in range(25):
		var turn := from + direction * float(step) * 0.5
		if _is_point_blocked_by_static(turn, radius, cliff_walk):
			break
		for sign_value in [side, -side]:
			var point := turn + across * gap * float(sign_value)
			if _has_clear_line_of_walk(turn, point, radius, cliff_walk):
				return [turn, point]
	return []

func _follow_choke_yield(unit: Dictionary, dt: float, mineral_walkers: Dictionary) -> void:
	var yield_order: Dictionary = unit.choke_yield
	var leader: Dictionary = units.get(yield_order.leader, {})
	var direction: Vector2 = yield_order.direction
	var point: Vector2 = yield_order.point
	if leader.is_empty() or unit.attack_state != "idle" or tick >= int(yield_order.expires) or _is_point_blocked_by_static(point, unit.radius, unit.unit_type == "spire_walker"):
		unit.erase("choke_yield")
		unit.path.clear()
		return
	unit.pushed_timer = 0.35
	var turn: Vector2 = yield_order.turn
	if not yield_order.get("turn_reached", false) and unit.pos.distance_squared_to(turn) > 0.22:
		_move_toward_point(unit, turn, dt)
		return
	yield_order["turn_reached"] = true
	if unit.pos.distance_squared_to(point) > 0.16:
		_move_toward_point(unit, point, dt)
		return
	unit.vel = Vector2.ZERO
	if tick % 8 != int(unit.tag) % 8 or (leader.pos - turn).dot(direction) < 1.0:
		return
	for follower in query_units_in_radius(turn, 7.0):
		if follower.flight_height > 0.0 or mineral_walkers.has(follower.tag):
			continue
		if follower.owner == unit.owner and follower.vel.dot(direction) > 0.25 and (follower.pos - turn).dot(direction) < 1.0 and absf((follower.pos - turn).dot(direction.orthogonal())) < 2.5:
			return
	unit.erase("choke_yield")
	unit.path.clear()

func _apply_steering_and_push_resolution(all_tags: Array, dt: float, mineral_walkers: Dictionary = {}) -> void:
	var neighbors_by_tag: Dictionary = {}
	for tag in all_tags:
		if not units.has(tag):
			continue
		var u: Dictionary = units[tag]
		if (u.is_structure and u.flight_height <= 0.0) or u.is_immobile:
			continue
		if u.has("choke_yield"):
			if mineral_walkers.has(tag):
				u.erase("choke_yield")
			else:
				_follow_choke_yield(u, dt, mineral_walkers)

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
		var flying: bool = u.flight_height > 0.0
		for neighbor in neighbors:
			var n: Dictionary = neighbor
			if n["tag"] == tag or flying != (n.flight_height > 0.0):
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

			if is_moving and (not n.is_structure or flying):
				if not flying and n.owner == owner_id and n.attack_state == "idle" and not n.is_immobile and not u.has("choke_yield") and not n.has("choke_yield") and tick % 4 == int(tag) % 4 and dist < min_sep * 2.0:
					_start_choke_yield(u, n, desired_vel.normalized(), mineral_walkers)
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
		var max_spd := effective_move_speed(u)
		if final_vel.length() > max_spd and max_spd > 0.0:
			final_vel = final_vel.normalized() * max_spd

		if final_vel.length_squared() > 0.001:
			_move_on_terrain(u, position + final_vel * dt)
			u["vel"] = final_vel
		if not flying and is_moving and not u.path.is_empty() and not u.has("choke_yield") and tick % 16 == int(tag) % 16:
			# Crowd steering can move a unit off the clear segment it planned
			# through a choke. Replan from its new approach if the wall stops it.
			var minimum_progress := speed * dt * 0.2
			if position.distance_squared_to(u.pos) < minimum_progress * minimum_progress:
				var cliff_walk: bool = u.unit_type == "spire_walker"
				if not _is_point_blocked_by_static(u.pos, radius, cliff_walk) and not _has_clear_line_of_walk(u.pos, u.path.front(), radius, cliff_walk):
					u.path.clear()

	for tag in all_tags:
		if not units.has(tag):
			continue
		var u: Dictionary = units[tag]
		if u.is_structure and u.flight_height <= 0.0:
			continue
		# Ground structures never moved between the passes; nearby mobiles moved by less
		# than a tick. The wider steering query already covers collision contacts.
		var neighbors: Array = neighbors_by_tag[tag] if neighbors_by_tag.has(tag) else query_units_in_radius(u["pos"], u["radius"] + 1.8)
		var mineral_walking := mineral_walkers.has(tag)
		var flying: bool = u.flight_height > 0.0
		for n in neighbors:
			if n["tag"] <= u["tag"] or flying != (n.flight_height > 0.0):
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
				if (n.is_structure and not flying) or n.is_immobile:
					_move_on_terrain(u, u.pos + nrm * pen)
				elif u["is_immobile"]:
					_move_on_terrain(n, n.pos - nrm * pen)
				else:
					_move_on_terrain(u, u.pos + nrm * (pen * 0.5))
					_move_on_terrain(n, n.pos - nrm * (pen * 0.5))

func _move_on_terrain(unit: Dictionary, pos: Vector2) -> void:
	if unit.flight_height > 0.0:
		unit.pos = _map_clamped_position(pos, unit.radius)
	else:
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
			var exp_rect := obs.grow(radius)
			if previous.is_finite() and not exp_rect.has_point(previous) and _walk_segment_enters_rect(previous, res, exp_rect):
				return _slide_along_static(previous, res, radius, ignore_cliffs)
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
			if previous.is_finite() and previous.distance_squared_to(footprint.pos) >= separation * separation:
				var closest := Geometry2D.get_closest_point_to_segment(footprint.pos, previous, res)
				if closest.distance_squared_to(footprint.pos) < separation * separation:
					return _slide_along_static(previous, res, radius, ignore_cliffs)
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

func _slide_along_static(previous: Vector2, target: Vector2, radius: float, ignore_cliffs: bool) -> Vector2:
	# Keep the move on its original side of the blocker rather than ejecting
	# to the nearest face, which can be across a diagonal corner.
	for slide in [Vector2(target.x, previous.y), Vector2(previous.x, target.y)]:
		if slide != previous and _has_clear_line_of_walk(previous, slide, radius, ignore_cliffs):
			return slide
	return previous

func _get_weapon_range(u: Dictionary) -> float:
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	return float(wpn.get("range", 0.0))

func _edge_distance(a: Dictionary, b: Dictionary) -> float:
	var position: Vector2 = a.pos
	return maxf(0.0, position.distance_to(b.pos) - (float(a.radius) + float(b.radius)))

func can_attack(attacker: Dictionary, target: Dictionary) -> bool:
	return _weapon_can_hit(RTSData.get_unit_def(attacker.unit_type).get("weapon", {}), target)

func _weapon_can_hit(weapon: Dictionary, target: Dictionary) -> bool:
	return not weapon.is_empty() and bool(weapon.get("targets_air", false) if target.flight_height > 0.0 else weapon.get("targets_ground", true))

func _find_best_attack_target(u: Dictionary, range_only: bool, pursuit_origins: Dictionary = {}) -> Dictionary:
	if u.get("hold_fire", false):
		return {}
	var def = RTSData.get_unit_def(u["unit_type"])
	var wpn = def.get("weapon", {})
	if wpn.is_empty():
		return {}
	var wpn_range = float(wpn.get("range", 5.0))
	var min_range = float(wpn.get("min_range", 0.0))
	var scan_radius: float = (wpn_range if range_only else maxf(wpn_range, float(u["sight_range"]))) + 2.5
	var preferences: Dictionary = wpn.get("target_priority", {})

	var candidates = query_units_in_radius(u["pos"], scan_radius, u["owner"])
	var best: Dictionary = {}
	var best_score: float = -999999.0

	for c in candidates:
		if c["owner"] == 0 or c["owner"] == u["owner"] or c["hp"] <= 0.0:
			continue
		if not _weapon_can_hit(wpn, c):
			continue
		var d_edge = _edge_distance(u, c)
		if d_edge < min_range:
			continue
		if range_only and d_edge > wpn_range:
			continue
		if d_edge > wpn_range and pursuit_origins.has(c.tag):
			var origin: Vector2 = pursuit_origins[c.tag]
			var limit := scan_radius + float(c.radius)
			if maxf(origin.distance_squared_to(c.pos), origin.distance_squared_to(u.pos)) > limit * limit:
				continue

		var prio = 200.0
		if c["is_structure"]:
			prio = 20.0
		elif c["is_worker"]:
			prio = 100.0
		if d_edge <= wpn_range:
			prio += 50.0
			for attr in preferences:
				if c.attributes.has(attr):
					prio += float(preferences[attr])
		var score = prio - d_edge * 2.5 - (c["hp"] / c["max_hp"]) * 10.0
		# Only candidates that can win the current priority check need a fog query.
		if score > best_score and can_see_unit(u.owner, c):
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
	if not _weapon_can_hit(wpn, target) or _edge_distance(u, target) < float(wpn.get("min_range", 0.0)):
		return
	var atk_speed_mult = 1.5 if u["surge_timer"] > 0.0 else 1.0
	u["attack_state"] = "windup"
	u["attack_target_tag"] = target["tag"]
	u["attack_windup_duration"] = float(wpn.get("damage_point", 0.08)) / atk_speed_mult
	u["attack_state_timer"] = u["attack_windup_duration"]

func _execute_weapon_hit(attacker: Dictionary, primary_target: Dictionary) -> bool:
	var def = RTSData.get_unit_def(attacker["unit_type"])
	var wpn = def.get("weapon", {})
	if not _weapon_can_hit(wpn, primary_target):
		return false

	var base_dmg = float(wpn.get("damage", 6.0)) + unit_upgrade_level(attacker, "weapons")
	var bonus_dict: Dictionary = wpn.get("bonus", {})
	var splash_rad = float(wpn.get("splash_radius", 0.0))
	var slow_factor = float(wpn.get("concussive_slow", 0.0))
	var hit_shields: bool = float(primary_target.get("shields", 0.0)) > 0.0

	_apply_damage_to_target(attacker, primary_target, base_dmg, bonus_dict, 1.0)
	if slow_factor > 0.0 and not primary_target["is_structure"]:
		primary_target["slow_timer"] = 2.0

	if splash_rad > 0.0:
		var friendly_scale := float(wpn.get("friendly_splash", 0.0))
		var splashed = query_units_in_radius(primary_target["pos"], splash_rad)
		for s in splashed:
			if s["tag"] == primary_target["tag"] or s["tag"] == attacker["tag"] or s["hp"] <= 0.0 or not _weapon_can_hit(wpn, s):
				continue
			var allegiance_scale := friendly_scale if s["owner"] == attacker["owner"] else 1.0
			if allegiance_scale <= 0.0:
				continue
			# The outer query includes units by footprint overlap. Use the
			# same boundary for the inner band so large units match the ring.
			var distance_to_footprint: float = primary_target.pos.distance_to(s.pos) - float(s.radius)
			var mult := 0.5 if distance_to_footprint <= splash_rad * SPLASH_INNER_RADIUS_RATIO else 0.25
			_apply_damage_to_target(attacker, s, base_dmg, bonus_dict, mult * allegiance_scale)

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
	return true

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
	if target.owner != attacker.owner:
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
		var lost_count: int = 1 + target.get("passengers", []).size()
		if target.owner != 0 and attacker.owner != target.owner:
			attacker["kills"] += lost_count
			if players.has(attacker["owner"]):
				players[attacker["owner"]]["units_killed"] += lost_count
		if players.has(target["owner"]):
			players[target["owner"]]["units_lost"] += lost_count
		var dead = target.duplicate(true)
		if target.has("attachment_tag"):
			detach_production_attachment(target)
		if target.has("attachment_parent_tag"):
			_unlink_attachment(target)
		_confirm_waiting_attack_loss(target)
		units.erase(target["tag"])
		if dead["is_structure"]:
			nav_dirty = true
		_recompute_supplies()
		emit_signal("unit_destroyed", dead)

func issue_command(unit_tags: Array, cmd_type: String, target_pos: Vector2 = Vector2.ZERO, target_tag: int = 0, extra: String = "", queue: bool = false, stay_on_route: bool = false) -> Dictionary:
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
	var formation: MoveFormation
	if cmd_type.to_lower() == "move" and group_size > 1 and target_pos.is_finite():
		var mobile := valid_units.filter(func(unit): return not unit.is_structure and not unit.is_immobile)
		if mobile.size() > 1:
			formation = MoveFormation.new()
			for unit in mobile:
				formation.spacing = maxf(formation.spacing, float(unit.radius) * 2.0 + 1.6)
			for ring in range(ceili(sqrt(float(mobile.size()))) + 1):
				var offsets := PackedVector2Array()
				for y in range(-ring, ring + 1):
					for x in range(-ring, ring + 1):
						if maxi(absi(x), absi(y)) == ring:
							offsets.append(Vector2(x, y) * formation.spacing)
				formation.rings.append(offsets)

	for u in valid_units:
		var ctype = cmd_type.to_lower()
		if ctype in ["fighter_assault", "fighter_intercept"]:
			var reason := fighter_mode_block_reason(u, ctype)
			if not reason.is_empty():
				notice.emit(u.owner, reason, "warn")
				continue
			u.fighter_mode_until = tick + FIGHTER_TRANSITION_TICKS
			u.is_immobile = true
			u.attack_state = "idle"
			u.attack_state_timer = 0.0
			u.orders.clear()
			u.path.clear()
			u.vel = Vector2.ZERO
			ability_triggered.emit(u, ctype, u.pos)
			accepted += 1
			continue
		if u.armed_structure and not ctype in ["attack", "attack_target", "force_attack", "hold_fire", "stop", "cancel_construction"]:
			continue
		if u.armed_structure and (ctype == "attack_target" or ctype == "force_attack" or ctype == "attack") and (u.build_progress < 1.0 or target_tag <= 0):
			continue
		if ctype == "lift":
			var reason := lift_block_reason(u)
			if not reason.is_empty():
				notice.emit(u.owner, reason, "error")
				continue
			detach_production_attachment(u)
			_set_producer_airborne(u, true)
			accepted += 1
			continue
		if ctype == "land":
			var site := production_landing_position(u, target_pos)
			var reason := landing_block_reason(u, site)
			if not reason.is_empty():
				notice.emit(u.owner, reason, "error")
				continue
			if not queue:
				u.orders.clear()
				u.path.clear()
			u.orders.append({"type": "land", "target_pos": site})
			accepted += 1
			continue
		if u.is_structure and u.flight_height > 0.0 and not ctype in ["move", "stop", "cancel_training"]:
			continue
		if u.is_structure and u.flight_height <= 0.0 and ctype == "move":
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
		if ctype in ["recon_sweep", "reinforce_supply", "deploy_prospector"]:
			if accepted == 0 and _use_hub_power(u, ctype, target_pos, target_tag):
				accepted += 1
			continue
		if ctype == "upgrade_hub":
			if _enqueue_hub_upgrade(u):
				accepted += 1
			continue
		if ctype == "production_boost":
			if accepted == 0 and _cast_production_boost(u, units.get(target_tag, {})):
				accepted += 1
			continue
		if ctype == "load_transport":
			if _load_transport(u):
				accepted += 1
			elif RTSData.get_unit_def(u.unit_type).has("transport_capacity") and u.get("passengers", []).size() < RTSData.get_unit_def(u.unit_type).transport_capacity:
				notice.emit(u.owner, "No troops in boarding range.", "warn")
			continue
		if ctype == "unload_transport" and not _valid_unload_order(u, target_pos):
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
		if ctype.begins_with("attach_"):
			var ability: Dictionary = RTSData.get_ability_def(ctype)
			if ability.get("attachment", false) and _start_production_attachment(u, str(ability.structure)):
				accepted += 1
			continue
		if ctype == "resume_construction" and (accepted > 0 or not can_resume_construction(u, units.get(target_tag, {}))):
			continue
		if ctype == "repair" and not can_repair(u, units.get(target_tag, {})):
			continue
		if ctype == "restore_vitals" and (u.is_structure or not can_restore(u, units.get(target_tag, {}))):
			continue
		if ctype == "follow" and (u.is_structure or u.is_immobile or u.tag == target_tag or not _is_friendly_mobile(units.get(target_tag, {}), u.owner)):
			continue
		if ctype == "harvest" and (not u.is_worker or u.is_immobile):
			continue
		if ctype == "harvest" and u.unit_type == "prospector" and resources.get(target_tag, {}).get("resource_type") != "crystal_field":
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
			if friendly.is_empty() or friendly.owner != u.owner or friendly.tag == u.tag or not can_attack(u, friendly):
				continue
		elif ctype == "attack_target" or (ctype in ["attack", "attack_move"] and target_tag > 0):
			var target: Dictionary = units.get(target_tag, {})
			if target.is_empty() or target.owner == u.owner or not can_attack(u, target) or not can_see_unit(u.owner, target):
				continue
		if ctype.begins_with("build_") or ctype == "build":
			var stype_check = ctype.trim_prefix("build_") if ctype != "build" else extra
			if not _can_build(u, stype_check, target_pos):
				continue

		if queue and ctype in ["stop", "hold_position"]:
			u.orders.append({"type": ctype})
			accepted += 1
			continue

		# An appended order must leave the active shot and recovery alone.
		# Phase Step is an immediate ability even when Shift is held.
		var immediate := not queue or ctype == "phase_step"
		if immediate and u["attack_state"] == "backswing" and ctype in ["move", "attack_move", "patrol", "phase_step"]:
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0
			if players.has(u["owner"]):
				players[u["owner"]]["stutter_step_cancels"] += 1
		elif immediate and u["attack_state"] == "windup" and ctype in ["move", "stop", "phase_step"]:
			u["attack_state"] = "idle"
			u["attack_state_timer"] = 0.0

		if ctype == "surge":
			var hp_cost := surge_hp_cost(u)
			if u["unit_type"] in ["rifleman", "breacher"] and u["hp"] > hp_cost:
				u["hp"] -= hp_cost
				u["surge_timer"] = float(RTSData.get_ability_def("surge").duration)
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
		elif ctype == "fast_deploy":
			if accepted == 0 and _assign_fast_deployment(u, target_pos):
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
			u.erase("choke_yield")
			u["orders"].clear()
			u["path"].clear()
			u["vel"] = Vector2.ZERO
			u["home_pos"] = u["pos"]
			accepted += 1
			continue

		elif ctype == "hold_position":
			_release_mining_slot(u)
			u.erase("choke_yield")
			u["orders"] = [{"type": "hold_position"}]
			u["path"].clear()
			u["vel"] = Vector2.ZERO
			u["home_pos"] = u["pos"]
			accepted += 1
			continue

		if not queue:
			_release_mining_slot(u)
			u.erase("choke_yield")
			u["orders"].clear()
			u["path"].clear()

		if ctype == "move":
			u["orders"].append({
				"type": "move",
				"target_pos": target_pos,
				"arrival_radius": dynamic_arrival
			})
			if formation != null and not u.is_structure and not u.is_immobile:
				u.orders.back()["_formation"] = formation
				u.orders.back()["arrival_radius"] = 0.9
			u["has_home_pos"] = false
			accepted += 1

		elif ctype == "patrol":
			u.orders.append({"type": "patrol", "target_pos": target_pos})
			u.has_home_pos = false
			accepted += 1

		elif ctype == "follow":
			_append_target_order(u, {"type": "follow", "target_tag": target_tag})
			u.has_home_pos = false
			accepted += 1

		elif ctype in ["attack", "attack_move"]:
			if target_tag > 0 and units.has(target_tag):
				_append_target_order(u, {
					"type": "attack_target",
					"target_tag": target_tag,
					"target_pos": units[target_tag].pos
				})
			else:
				u["orders"].append({
					"type": "attack_move",
					"target_pos": target_pos,
					"arrival_radius": dynamic_arrival
				})
				if stay_on_route:
					u.orders.back()["stay_on_route"] = true
			accepted += 1

		elif ctype in ["attack_target", "force_attack"]:
			_append_target_order(u, {
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
			if u.orders.is_empty():
				u["harvest_target_tag"] = harvest_tag
			_append_target_order(u, {
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

		elif ctype in ["repair", "restore_vitals"]:
			u.orders.append({"type": ctype, "target_tag": target_tag})
			accepted += 1
		elif ctype == "unload_transport":
			u.orders.append({"type": ctype, "target_pos": target_pos})
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

func _append_target_order(unit: Dictionary, order: Dictionary) -> void:
	if not unit.orders.is_empty():
		order["waiting_for_turn"] = true
	unit.orders.append(order)

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

func _load_transport(transport: Dictionary) -> bool:
	var capacity: int = RTSData.get_unit_def(transport.unit_type).get("transport_capacity", 0)
	var passengers: Array = transport.get("passengers", [])
	if passengers.size() >= capacity:
		return false
	var candidates := units.values().filter(func(unit):
		return _is_friendly_mobile(unit, transport.owner) and unit.flight_height <= 0.0 and not unit.is_worker and not unit.is_immobile \
			and transport.pos.distance_squared_to(unit.pos) <= TRANSPORT_PICKUP_RADIUS * TRANSPORT_PICKUP_RADIUS)
	candidates.sort_custom(func(a, b):
		var a_distance: float = transport.pos.distance_squared_to(a.pos)
		var b_distance: float = transport.pos.distance_squared_to(b.pos)
		return a.tag < b.tag if a_distance == b_distance else a_distance < b_distance)
	var loaded := false
	for passenger in candidates:
		if passengers.size() >= capacity:
			break
		passenger.orders.clear()
		passenger.path.clear()
		passenger.attack_state = "idle"
		passenger.vel = Vector2.ZERO
		_confirm_waiting_attack_loss(passenger)
		passengers.append(passenger)
		units.erase(passenger.tag)
		loaded = true
	if loaded:
		transport["passengers"] = passengers
	return loaded

func _valid_unload_order(transport: Dictionary, point: Vector2) -> bool:
	if transport.get("passengers", []).is_empty() or not point.is_finite() or _map_clamped_position(point, transport.radius) != point:
		return false
	return not can_see_position(transport.owner, point) or not _is_point_blocked_by_static(point, INFANTRY_CLEARANCE)

func is_embarked(tag: int, owner: int) -> bool:
	for unit in units.values():
		if unit.owner == owner and unit.has("passengers") and unit.passengers.any(func(passenger): return passenger.tag == tag):
			return true
	return false

func _unload_transport(transport: Dictionary, center: Vector2) -> bool:
	if _is_point_blocked_by_static(center, INFANTRY_CLEARANCE):
		return false
	var passengers: Array = transport.passengers
	var ground := units.values().filter(func(unit): return unit.flight_height <= 0.0 and unit.pos.distance_squared_to(center) < 100.0)
	var positions: Array[Vector2] = []
	var candidates: Array[Vector2] = [center]
	for distance in [2.7, 5.4]:
		for step in range(12):
			candidates.append(center + Vector2.from_angle(TAU * step / 12.0) * float(distance))
	for passenger in passengers:
		var spot := Vector2.INF
		for candidate in candidates:
			if _map_clamped_position(candidate, passenger.radius) != candidate or _is_point_blocked_by_static(candidate, passenger.radius):
				continue
			if ground.any(func(unit): return candidate.distance_squared_to(unit.pos) < pow(passenger.radius + unit.radius, 2.0)):
				continue
			var clear := true
			for i in range(positions.size()):
				if candidate.distance_squared_to(positions[i]) < pow(passenger.radius + passengers[i].radius, 2.0):
					clear = false
					break
			if clear:
				spot = candidate
				break
		if not spot.is_finite():
			return false
		positions.append(spot)
	for i in range(passengers.size()):
		var passenger: Dictionary = passengers[i]
		passenger.pos = positions[i]
		passenger.prev_pos = positions[i]
		passenger.home_pos = positions[i]
		units[passenger.tag] = passenger
	passengers.clear()
	return true

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
	var worker: String = RTSData.faction_info[structure.faction].worker
	var spawn := _rally_spawn_position(structure, default_rally_position(structure), worker)
	if not spawn.is_finite():
		return {}
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

func _fighter_landing_clear(fighter: Dictionary) -> bool:
	var point: Vector2 = fighter.pos
	return not _is_point_blocked_by_static(point, fighter.radius) and not _ground_mobile_overlaps(point, fighter.radius)

func fighter_mode_block_reason(fighter: Dictionary, ability: String) -> String:
	var expected := "kestrel_interceptor" if ability == "fighter_assault" else "kestrel_assault"
	if fighter.unit_type != expected:
		return "Select a Kestrel in the matching mode."
	if fighter.has("fighter_mode_until"):
		return "Kestrel is switching modes."
	if ability == "fighter_assault" and not _fighter_landing_clear(fighter):
		return "Move the Kestrel above clear ground first."
	return ""

func _finish_fighter_mode(fighter: Dictionary) -> void:
	fighter.erase("fighter_mode_until")
	fighter.is_immobile = false
	var landing: bool = fighter.unit_type == "kestrel_interceptor"
	if landing and not _fighter_landing_clear(fighter):
		notice.emit(fighter.owner, "Kestrel landing blocked. Interceptor mode retained.", "warn")
		return
	var next := "kestrel_assault" if landing else "kestrel_interceptor"
	var pending: Array = fighter.orders.duplicate()
	_morph_unit_in_place(fighter, next)
	fighter.orders = pending
	fighter.home_pos = fighter.pos
	var def: Dictionary = RTSData.get_unit_def(next)
	fighter.flight_height = float(def.flight_height)
	fighter.attributes = def.attributes.duplicate()

func _enqueue_unit_production(structure: Dictionary, unit_type: String) -> bool:
	if not structure["is_structure"] or structure["build_progress"] < 1.0 or structure.flight_height > 0.0:
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
	if s_cost > 0 and p["supply_used"] + s_cost > p["supply_cap"]:
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

func surge_hp_cost(unit: Dictionary) -> float:
	var base_cost := float(RTSData.get_ability_def("surge").hp_cost)
	return base_cost * 0.5 if players.get(unit.owner, {}).get("surge_efficiency", false) else base_cost

func research_offer(owner_id: int, upgrade: String) -> Dictionary:
	var player: Dictionary = players.get(owner_id, {})
	if player.is_empty():
		return {}
	if upgrade == "surge_efficiency":
		return {} if player.get("surge_efficiency", false) else {"level": 1, "crystal": 100, "aether": 100, "supply": 0, "time": 45.0, "requires": []}
	if upgrade == "fast_deployment":
		return {} if player.get("fast_deployment", false) else {"level": 1, "crystal": 150, "aether": 150, "supply": 0, "time": 45.0, "requires": []}
	var upgrades: Dictionary = player.get("upgrades", {})
	if not upgrades.has(upgrade):
		return {}
	var completed: int = upgrades[upgrade]
	if completed >= MAX_UPGRADE_LEVEL:
		return {}
	return {"level": completed + 1, "crystal": 100 + completed * 75, "aether": 100 + completed * 75,
		"supply": 0, "time": 40.0 + completed * 15.0, "requires": []}

func research_block_reason(owner_id: int, upgrade: String) -> String:
	if research_offer(owner_id, upgrade).is_empty():
		return "Research already completed." if upgrade in ["surge_efficiency", "fast_deployment"] else "All levels researched."
	for structure in units.values():
		if structure.owner != owner_id or not structure.is_structure:
			continue
		for item in structure.production_queue:
			if item.get("upgrade") == upgrade:
				return "Research already queued."
	return ""

func research_producer_block_reason(structure: Dictionary, upgrade: String) -> String:
	var ability: Dictionary = RTSData.get_ability_def("research_" + upgrade)
	if structure.is_empty() or structure.unit_type != ability.get("producer") or structure.build_progress < 1.0 or structure.flight_height > 0.0:
		return "Requires a completed research producer."
	if requires_power(structure.unit_type) and not is_powered(structure.owner, structure.pos):
		return "The Waystone needs a Resonator's power field."
	var required_attachment := str(ability.get("requires_attachment", ""))
	if not required_attachment.is_empty() and production_attachment(structure).get("unit_type") != required_attachment:
		return "Requires a completed Research Module."
	if structure.production_queue.size() >= 5:
		return "%s queue is full." % structure.name
	return ""

func _enqueue_research(structure: Dictionary, upgrade: String) -> bool:
	if not research_producer_block_reason(structure, upgrade).is_empty():
		return false
	if not research_block_reason(structure.owner, upgrade).is_empty():
		return false
	var offer := research_offer(structure.owner, upgrade)
	var player: Dictionary = players[structure.owner]
	if player.crystal < offer.crystal or player.aether < offer.aether:
		return false
	player.crystal -= offer.crystal
	player.aether -= offer.aether
	var job := {
		"upgrade": upgrade, "level": offer.level,
		"crystal_cost": offer.crystal, "aether_cost": offer.aether,
		"progress": 0.0, "total_time": offer.time * build_time_scale(),
	}
	var required_attachment: String = RTSData.get_ability_def("research_" + upgrade).get("requires_attachment", "")
	if not required_attachment.is_empty():
		job["requires_attachment"] = required_attachment
	structure.production_queue.append(job)
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
		if u.build_progress >= 1.0:
			players[pid]["supply_cap"] += supply_from(u)
		if u["is_structure"]:
			for q in u["production_queue"]:
				if q.has("upgrade"):
					continue
				var q_def = RTSData.get_unit_def(str(q["unit_type"]))
				players[pid]["supply_used"] += int(q_def.get("supply_cost", 1))
		else:
			players[pid]["supply_used"] += int(def.get("supply_cost", 1))
			for passenger in u.get("passengers", []):
				players[pid]["supply_used"] += int(RTSData.get_unit_def(passenger.unit_type).get("supply_cost", 1))
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

func _pick_local_crystal(worker: Dictionary, preferred: Dictionary, mode: CrystalSelection = CrystalSelection.LINE_ASSIGNMENT) -> Dictionary:
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
	var balance_slots := mode == CrystalSelection.OPEN_SLOT
	# The current patch count excludes this worker. A strictly smaller
	# alternative improves the balance after this worker changes patches.
	var best_count := int(assignments.get(preferred.tag, 0)) if balance_slots else 2147483647
	var best_distance := -INF if balance_slots else INF
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
		if balance_slots and patch.mining_worker != 0:
			continue
		var count: int = assignments.get(patch.tag, 0)
		var distance: float = patch.pos.distance_squared_to(worker.pos)
		if count < best_count or (count == best_count and distance < best_distance):
			if mode != CrystalSelection.LINE_ASSIGNMENT:
				if patch.tag == preferred.tag:
					continue
				var reach: float = worker.radius + patch.radius + HARVEST_REACH
				var path := compute_smooth_path(worker.pos, patch.pos, worker.radius, false, reach)
				if path.back().distance_squared_to(patch.pos) > reach * reach:
					continue
			best = patch
			best_count = count
			best_distance = distance
	return best

func _observed_orders(orders: Array) -> Array:
	var observed := orders.duplicate(true)
	for order in observed:
		order.erase("_formation")
		order.erase("_formation_anchor")
		order.erase("_reachable_request")
		order.erase("_pursuit_origins")
		order.erase("_blocked_crystal_revision")
		order.erase("_defense_intercept")
	return observed

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
			"pos": {"x": snappedf(u["pos"].x, 0.01), "y": snappedf(u["pos"].y, 0.01), "z": snappedf(unit_elevation(u), 0.01)},
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
			"orders": [] if limited and u.owner != perspective_player else _observed_orders(u.orders),
			"production_queue_len": 0 if limited and u.owner != perspective_player else u["production_queue"].size(),
			"kills": u["kills"]
		})
		var entry: Dictionary = unit_list.back()
		if u.owner == perspective_player or perspective_player == 0:
			if u.has("passengers"):
				entry["passengers"] = u.passengers.map(func(passenger): return passenger.tag)
		if u.has("expires_tick"):
			entry["lifetime_ticks"] = maxi(0, int(u.expires_tick) - tick)
		if u.has("living_ground_speed_bonus"):
			entry["effective_speed"] = snappedf(effective_move_speed(u), 0.01)
			entry["living_ground_speed_bonus"] = active_living_ground_speed_bonus(u)
		if u.flight_height > 0.0:
			entry["airborne"] = true
		if u.has("fighter_mode_until") and (not limited or u.owner == perspective_player):
			entry["fighter_mode_ticks"] = maxi(0, int(u.fighter_mode_until) - tick)
		if u.get("hold_fire", false):
			entry["hold_fire"] = true
		match u.unit_type:
			"colony_hub", "heartstone":
				entry["energy"] = snappedf(u.energy, 0.01)
				entry["hub_operations"] = u.get("hub_operations", false)
			"skirmisher":
				entry["energy"] = snappedf(u.energy, 0.01)
				entry["cloaked"] = u.get("cloaked", false)
			"silo", "silo_retracted":
				entry["supply_reinforced"] = u.get("supply_reinforced", false)
				entry["salvage_ticks"] = maxi(0, int(u.get("salvage_finish", 0)) - tick)
			"pioneer":
				entry["auto_repair"] = u.get("auto_repair", false)
		if not limited or u.owner == perspective_player:
			if u.unit_type == "waystone":
				entry["fast_deployment_ticks"] = fast_deployment_ticks(u)
				if not u.production_queue.is_empty() and u.production_queue[0].has("deployment_pos"):
					var deployment: Vector2 = u.production_queue[0].deployment_pos
					entry["deployment_target"] = {"x": deployment.x, "y": deployment.y}
			if u.has("production_boost_until"):
				entry["production_boost_ticks"] = production_boost_ticks(u)
			if u.has("attachment_tag"):
				entry["attachment_tag"] = u.attachment_tag
			if u.has("attachment_parent_tag"):
				entry["attachment_parent_tag"] = u.attachment_parent_tag
			if u.has("support"):
				entry["energy"] = snappedf(u.energy, 0.01)
				entry["max_energy"] = u.support.max_energy
				entry["support_target_tag"] = u.support_target_tag
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
			if not u.production_queue.is_empty():
				entry["production_progress"] = u.production_queue.map(func(item): return snappedf(item.progress, 0.01))
				entry["production_active_slots"] = active_production_slots(u)

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
			"terrain_tiles": terrain_tiles.duplicate(true),
			"living_ground": {
				"cell_size": LivingGround.CELL_SIZE,
				"cells": visible_living_ground_cells(perspective_player).map(func(cell): return {"x": cell.x, "y": cell.y}),
			}
		},
		"players": player_view,
		"units": unit_list,
		"resources": res_list,
		"recent_events": events
	}
	if not watch_stations.is_empty():
		observation.map["watch_stations"] = watch_stations.map(func(station):
			return {"x": station.pos.x, "y": station.pos.y, "owner": visible_watch_station_owner(station, perspective_player), "capture_radius": WATCH_STATION_CAPTURE, "sight_radius": WATCH_STATION_SIGHT}
		)
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
