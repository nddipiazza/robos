extends RefCounted

enum { ASSAULT, RECOVERY, DEFENSE, EVACUATION }

const DIFFICULTIES := ["casual", "normal", "hard", "brutal"]
const CASUAL_DISABLED_STRUCTURES := ["field_armory", "sentry_turret"]
const CONSTRUCTION_TIMES := {"muster_hall": 60.0, "field_bunker": 30.0}
const INFANTRY_RESEARCH_SECONDS := 160.0
const DIRECTORATE_HEALING_MULTIPLIER := 1.25
const MISSIONS := [
	{"id": "campaign-cut-the-signal", "title": "Cut the Signal", "brief": "Lead Vale's squad through Vesper Gate."},
	{"id": "campaign-white-ridge", "title": "The White Ridge Job", "brief": "Build an army and seize the artifact at White Ridge."},
	{"id": "campaign-hold-for-dawn", "title": "Hold for Dawn", "brief": "Defend the bridges until the rescue ship arrives."},
	{"id": "campaign-last-road", "title": "The Last Road", "brief": "Escort Bracken's colonists to the colony ships."},
]
const ROSTER_UNLOCKS := [
	{"units": ["rifleman"], "structures": [], "research": []},
	{"units": ["pioneer", "triage_specialist"], "structures": ["colony_hub", "silo", "aether_tap", "muster_hall", "research_module"], "research": []},
	{"units": [], "structures": ["field_bunker", "field_armory", "sentry_turret"], "research": ["weapons", "armor"]},
	{"units": ["torchguard"], "structures": ["fabrication_module"], "research": []},
]
const DEFERRED_ABILITIES := ["surge", "upgrade_hub", "recon_sweep", "reinforce_supply", "deploy_prospector"]
const DEFENSE_BUNKERS := ["north_bunker", "west_bunker"]
const HARD_ASSAULT_GUARDS := [
	[0, "rifleman", Vector2(94, 145)], [1, "rifleman", Vector2(28, 119)],
	[3, "rifleman", Vector2(33, 56)], [4, "breacher", Vector2(95, 24)],
]
const BRUTAL_ASSAULT_GUARDS := [
	[0, "rifleman", Vector2(102, 143)], [3, "breacher", Vector2(37, 53)],
	[4, "rifleman", Vector2(86, 18)], [4, "howitzer", Vector2(102, 20)],
]
const CHECKPOINTS := [
	{"title": "Clear the roadblock", "point": Vector2(95, 141), "guards": ["checkpoint_1", "checkpoint_2", "checkpoint_3"], "cue": "road"},
	{"title": "Secure the lower junction", "point": Vector2(32, 118), "guards": ["bend_guard"], "cue": ""},
	{"title": "Secure the town square", "point": Vector2(55, 95), "guards": ["square_1", "square_2", "square_3", "square_4"], "cue": "square"},
	{"title": "Break the detention convoy", "point": Vector2(37, 59), "guards": ["convoy_guard", "convoy_transport"], "cue": "convoy"},
	{"title": "Destroy the Directorate relay HQ", "point": Vector2(94, 11), "guards": ["relay_hq"], "cue": ""},
]
const STATUES := ["statue_1", "statue_2", "statue_3", "statue_4", "statue_5", "statue_6"]
const REINFORCEMENTS := {
	"road": {"point": Vector2(84, 144), "units": ["rifleman", "rifleman", "rifleman"]},
	"square": {"point": Vector2(46, 99), "units": ["rifleman", "rifleman"]},
}
const UPRISING_PERIMETER := Vector2(93, 27)
const UPRISING_FLIGHT_SECONDS := 0.375
const UPRISING_RELAY_DEFENDERS := ["relay_guard_1", "relay_guard_2", "relay_guard_3", "relay_turret"]
const UPRISING_POSTS := [
	Vector2(105, 17), Vector2(105, 20), Vector2(105, 23),
	Vector2(108, 16), Vector2(108, 19), Vector2(108, 25),
]
const UPRISING_WAVE := [
	["rifleman", Vector2(88, 18)], ["rifleman", Vector2(90, 20)],
	["breacher", Vector2(91, 17)], ["rifleman", Vector2(94, 19)],
	["breacher", Vector2(96, 21)], ["howitzer", Vector2(96, 24)],
]
const DIG_SITE := Vector2(39, 29)
const DIG_TARGETS := ["dig_hub", "dig_hall", "dig_workshop"]
const CAMP_BEACON := Vector2(32, 120)
const CAMP_UNITS := [
	"camp_hall", "camp_silo", "camp_rifle_1", "camp_rifle_2", "camp_rifle_3",
	"camp_rifle_4", "camp_rifle_5", "camp_medic",
]
const CACHE_SITES := [
	{"point": Vector2(99, 83), "crystal": 100, "aether": 0},
	{"point": Vector2(104, 86), "crystal": 0, "aether": 100},
	{"point": Vector2(93, 51), "crystal": 100, "aether": 0},
	{"point": Vector2(100, 55), "crystal": 100, "aether": 0},
	{"point": Vector2(104, 58), "crystal": 0, "aether": 100},
	{"point": Vector2(43, 127), "crystal": 100, "aether": 0},
	{"point": Vector2(38, 140), "crystal": 0, "aether": 100},
]
const DEFENSE_CACHE_SITES := [
	{"point": Vector2(118, 53), "crystal": 100, "aether": 0},
	{"point": Vector2(125, 55), "crystal": 0, "aether": 100},
	{"point": Vector2(54, 69), "crystal": 100, "aether": 0},
	{"point": Vector2(61, 70), "crystal": 0, "aether": 100},
]
const RAIDS := [
	{"at": 48, "units": {"rifleman": 3}},
	{"at": 108, "units": {"rifleman": 4, "breacher": 1}},
	{"at": 170, "units": {"rifleman": 5, "breacher": 1}},
	{"at": 235, "units": {"rifleman": 6, "breacher": 2}},
]
const RELICS := [Vector2(148, 35), Vector2(30, 52)]
const STRANDED_SQUADS := [
	{"at": 150, "point": Vector2(158, 55), "approach": Vector2(150, 56), "direction": "northeast road", "cue": "distress_north"},
	{"at": 360, "point": Vector2(70, 56), "approach": Vector2(79, 56), "direction": "lowland ruins", "cue": "distress_ruins"},
	{"at": 660, "point": Vector2(20, 72), "approach": Vector2(29, 72), "direction": "western road", "cue": "distress_west"},
]
const WAVE_LANES := [Vector2(138, 8), Vector2(111, 26), Vector2(21, 78), Vector2(129, 49)]
const WAVES := [
	{"at": 50, "lanes": [[1, {"skitterling": 5}]]},
	{"at": 125, "lanes": [[0, {"skitterling": 7, "bile_crawler": 2}]]},
	{"at": 205, "lanes": [[2, {"skitterling": 9, "bile_crawler": 3}]]},
	{"at": 295, "lanes": [[1, {"skitterling": 8, "bile_crawler": 3}], [0, {"skitterling": 5}]]},
	{"at": 385, "lanes": [[0, {"skitterling": 8, "bile_crawler": 4}], [2, {"skitterling": 8, "blight_hurler": 1}]]},
	{"at": 475, "lanes": [[1, {"skitterling": 11, "bile_crawler": 4, "blight_hurler": 1}], [2, {"skitterling": 8}], [3, {"needlewing": 2}]]},
	{"at": 565, "lanes": [[0, {"skitterling": 11, "bile_crawler": 4, "blight_hurler": 1}], [1, {"skitterling": 8, "carapace_bulwark": 1}], [2, {"skitterling": 5}], [3, {"needlewing": 3}]]},
	{"at": 655, "lanes": [[0, {"skitterling": 12, "bile_crawler": 5}], [2, {"skitterling": 14, "blight_hurler": 1}], [3, {"needlewing": 3}]]},
	{"at": 745, "lanes": [[1, {"skitterling": 14, "bile_crawler": 6, "blight_hurler": 1}], [2, {"skitterling": 12, "carapace_bulwark": 2}], [3, {"needlewing": 3}]]},
	{"at": 835, "lanes": [[0, {"skitterling": 15, "bile_crawler": 6}], [2, {"skitterling": 13, "blight_hurler": 1, "carapace_bulwark": 2}], [3, {"needlewing": 3}]]},
	{"at": 925, "lanes": [[1, {"skitterling": 16, "bile_crawler": 6, "blight_hurler": 1}], [2, {"skitterling": 13, "carapace_bulwark": 2}], [3, {"needlewing": 4}]]},
	{"at": 990, "lanes": [[0, {"skitterling": 17, "bile_crawler": 6}], [2, {"skitterling": 13, "blight_hurler": 2, "carapace_bulwark": 2}], [3, {"needlewing": 4}]]},
	{"at": 1045, "lanes": [[1, {"skitterling": 17, "bile_crawler": 6, "blight_hurler": 2}], [2, {"skitterling": 13, "carapace_bulwark": 2}], [3, {"needlewing": 4}]]},
	{"at": 1090, "lanes": [[0, {"skitterling": 15, "bile_crawler": 6, "blight_hurler": 2}], [2, {"skitterling": 13, "carapace_bulwark": 2}], [3, {"needlewing": 4}]]},
	{"at": 1130, "lanes": [[1, {"skitterling": 16, "bile_crawler": 6, "blight_hurler": 1}], [2, {"skitterling": 12, "carapace_bulwark": 2}], [3, {"needlewing": 4}]]},
	{"at": 1160, "lanes": [[0, {"skitterling": 16, "bile_crawler": 6, "blight_hurler": 1}], [2, {"skitterling": 12, "carapace_bulwark": 2}], [3, {"needlewing": 4}]]},
	{"at": 1180, "lanes": [[0, {"skitterling": 16, "bile_crawler": 6}], [1, {"skitterling": 5, "blight_hurler": 1}], [2, {"skitterling": 11, "carapace_bulwark": 2}], [3, {"needlewing": 5}]]},
]
const RESCUE_AT := 1200
const TUNNEL_AT := 975
const RESCUE_ENTRY := Vector2(165, 157)
const LANDING_ZONE := Vector2(128, 141)
const MILITIA_RESCUE_WINDOW_SECONDS := 180
const ARTIFACT_PICKUP_RADIUS := 2.5
const ARTIFACT_RETURN_RADIUS := 8.5
const CUES := {
	"arrival": ["Captain Vale", "Vesper Gate, this is Vale. We're taking the relay. Follow the road and clear the Directorate checkpoints.", 7.5, Vector2(121, 119)],
	"road": ["Corporal Rook", "Vale? We were pinned behind the checkpoint. Three rifles, ready to move. We're with you.", 7.0, Vector2(91, 142)],
	"square": ["Captain Vale", "Two more survivors. Fall in. Follow the road north. The Directorate has a convoy blocking the way.", 7.5, Vector2(54, 95)],
	"convoy": ["Captain Vale", "The transport is down. The detainees are clear. Take out the relay headquarters before they call for help.", 7.5, Vector2(37, 59)],
	"perimeter_low": ["Captain Vale", "We're running low. Hold the perimeter.", 3.25, Vector2.INF],
	"uprising": ["Vesper Gate Resistance", "It's time to fight! Vale's here!", 4.5, Vector2(99, 24)],
	"signal_off": ["Captain Vale", "The signal is down. Vesper Gate can call for help again.", 4.5, Vector2.INF],
	"dig_brief": ["Captain Vale", "The Directorate found something under White Ridge. Get the workers mining and raise an army. We need that artifact.", 8.0, Vector2(100, 124)],
	"camp_siege": ["Corporal Rook", "White Ridge militia calling. Directorate infantry are closing on our outpost. Anyone on this channel, we could use a hand.", 8.0, Vector2.INF],
	"camp_rescued": ["Corporal Rook", "We owe you one. Our troops and muster hall are yours. Let's take that ridge.", 6.0, Vector2.INF],
	"dig_exposed": ["Captain Vale", "Their production line is down. Send a soldier to the excavation and secure the artifact.", 6.0, Vector2.INF],
	"dig_secured": ["Captain Vale", "Artifact secured. Get it to the evacuation outpost. The Brood are already on the move.", 6.0, Vector2.INF],
	"siege": ["Pilot Sable", "I'm coming for you, but I need time to reach the outpost. Keep that Colony Hub standing and hold the line.", 7.5, Vector2(120, 120)],
	"distress_north": ["Corporal Rook", "Militia pinned down beyond the north bridge. If you've got a squad to spare, we can still get them out.", 7.0, Vector2.INF],
	"distress_ruins": ["Captain Vale", "Another distress call from the lowland ruins. Send help before the Brood cut them off.", 6.0, Vector2.INF],
	"distress_west": ["Corporal Rook", "Last militia squad is up the road from the west bridge. Their signal is fading.", 5.5, Vector2.INF],
	"pressure": ["Captain Vale", "They're splitting up. Cover both bridges and watch for flyers over the river.", 5.5, Vector2.INF],
	"last_wave": ["Pilot Sable", "One last push. My ship's on final approach. Keep the pad clear.", 5.0, Vector2.INF],
	"inbound": ["Pilot Sable", "Rampart inbound from the southeast. I have the landing lights.", 5.0, Vector2.INF],
	"rescued": ["Pilot Sable", "We're on the pad. Get everyone aboard. We're going home.", 4.5, Vector2.INF],
	"evac_arrival": ["Pilot Sable", "You're down. Follow the road west to Bracken. The settlers are waiting for an escort.", 6.0, Vector2(113.3, 150)],
	"evac_settlement": ["Dr. Aster", "You made it. The trucks will head north as soon as we're loaded. Keep the road open.", 7.0, Vector2.INF],
	"evac_departure": ["Dr. Aster", "First truck is rolling. The bunkers cover the bends. Keep an escort with the truck between them.", 7.0, Vector2.INF],
	"evac_truck_lost": ["Dr. Aster", "The truck is down. Some people got out. Cover them while they make for the ships.", 6.0, Vector2.INF],
	"evac_complete": ["Pilot Sable", "Fifty aboard and climbing. Bracken is clear. Good work down there.", 7.0, Vector2.INF],
}

var mission_index: int
var difficulty: String
const Mutators = preload("res://scripts/engine/RTSCampaignMutators.gd")
const Evacuation = preload("res://scripts/engine/RTSEvacuation.gd")
var mutators: Mutators
var evacuation: Evacuation
var status := "playing"
var reason := ""
var stage := 0
var waves_sent := 0
var last_wave_size := 0
var troops_joined := 0
var cue: Dictionary = {}
var cue_history: Array[String] = []
var artifacts: Array[Dictionary] = []
var tags_by_id := {}
var rescue_tag := 0
var camp_rescued := false
var camp_siege_tags: Array[int] = []
var cache_claimed := {}
var squads: Array[Dictionary] = []
var squads_rescued := 0
var _tick_rate: int
var roster := {"units": [], "structures": [], "research": []}
var defense_turret_definition: Dictionary = {}
var _assault_guards := {}
var _uprising_civilians: Array[int] = []
var _uprising_wave: Array[int] = []
var _uprising_entrance_tick := 0
var _uprising_shots := 0
var _next_uprising_throw := 0
var _uprising_impact: Dictionary = {}
var _uprising_clear := false
var _breaches := 0
var _tunnel_tag := 0
var _next_tunnel_wave := 0

static func mission_for_path(path: String) -> int:
	for index in MISSIONS.size():
		if path == "res://scenarios/%s.json" % MISSIONS[index].id:
			return index
	return -1

static func _progress_path() -> String:
	var override := OS.get_environment("RTS_CAMPAIGN_PROGRESS_PATH")
	return "user://starfall-campaign.cfg" if override.is_empty() else override

static func completed_missions() -> Array[String]:
	var config := ConfigFile.new()
	var completed: Array[String] = []
	if config.load(_progress_path()) != OK:
		return completed
	if config.has_section_key("ashfall_signal", "completed_ids"):
		for mission in MISSIONS:
			if mission.id in config.get_value("ashfall_signal", "completed_ids", []):
				completed.append(mission.id)
		return completed
	var old_count := int(config.get_value("ashfall_signal", "completed", 0))
	if old_count >= 1:
		completed.append(MISSIONS[ASSAULT].id)
	if old_count >= 2:
		completed.append(MISSIONS[DEFENSE].id)
	return completed

static func mission_available(index: int, completed: Array[String]) -> bool:
	return index == 0 or MISSIONS[index].id in completed or MISSIONS[index - 1].id in completed

static func save_completion(index: int, brood_research: int = 0) -> Error:
	var completed := completed_missions()
	var id: String = MISSIONS[index].id
	var config := ConfigFile.new()
	config.load(_progress_path())
	var prior := int(config.get_value("brood_research", id, 0))
	if id in completed and brood_research <= prior:
		return OK
	if id not in completed:
		completed.append(id)
	config.set_value("ashfall_signal", "completed_ids", completed)
	if brood_research > prior:
		config.set_value("brood_research", id, brood_research)
	return config.save(_progress_path())

func _init(engine, index: int, selected_difficulty: String = "normal") -> void:
	mission_index = index
	difficulty = selected_difficulty
	_tick_rate = engine.TICK_RATE
	for unlocked_index in range(index + 1):
		for category in roster:
			roster[category].append_array(ROSTER_UNLOCKS[unlocked_index][category])
	if mission_index == DEFENSE:
		defense_turret_definition = engine.get_node("/root/RTSData").get_unit_def("sentry_turret").duplicate(true)
		defense_turret_definition["requires"] = ["field_armory"]
		defense_turret_definition["blurb"] = "Fires missiles at aircraft and reveals cloaked enemies. Requires a Field Armory."
		defense_turret_definition.weapon["targets_ground"] = false
	if mission_index == DEFENSE and difficulty == "casual":
		for structure in CASUAL_DISABLED_STRUCTURES:
			roster.structures.erase(structure)
		roster.research.clear()
	for unit in engine.units.values():
		tags_by_id[unit.id] = unit.tag
		_tune_enemy(unit)
	match mission_index:
		ASSAULT:
			var vale: Dictionary = _named(engine, "captain_vale")
			vale.merge({"name": "Captain Vale", "voice_profile": "captain_vale", "hp": 245.0, "max_hp": 245.0, "armor": 2.0}, true)
			if difficulty in ["hard", "brutal"]:
				_add_assault_guards(engine, HARD_ASSAULT_GUARDS)
			if difficulty == "brutal":
				_add_assault_guards(engine, BRUTAL_ASSAULT_GUARDS)
			_speak(engine, "arrival")
		RECOVERY:
			for id in CAMP_UNITS:
				var unit: Dictionary = _named(engine, id)
				_reserve(engine, unit)
			if difficulty in ["hard", "brutal"]:
				_spawn_force(engine, 2, Vector2(99, 52), {"rifleman": 2, "breacher": 1})
			if difficulty == "brutal":
				_spawn_force(engine, 2, Vector2(45, 23), {"howitzer_emplaced": 1})
				_spawn_force(engine, 2, Vector2(107, 61), {"triage_specialist": 1})
			engine._recompute_supplies()
			_speak(engine, "dig_brief")
		DEFENSE:
			for id in DEFENSE_BUNKERS:
				var bunker := _named(engine, id)
				if bunker.get("unit_type") != "field_bunker":
					continue
				for _i in 4:
					engine.spawn_unit("rifleman", 1, bunker.pos)
				engine._load_transport(bunker)
			for point in RELICS:
				artifacts.append({"point": point, "carrier": 0, "delivered": false})
			for _entry in STRANDED_SQUADS:
				squads.append({"tags": [], "state": "waiting"})
			_speak(engine, "siege")
		EVACUATION:
			evacuation = Evacuation.new()
			evacuation.begin(engine, self)

func _tune_enemy(unit: Dictionary) -> void:
	if unit.owner != 2:
		return
	if difficulty == "casual":
		unit.max_hp = maxf(1.0, floorf(unit.max_hp * 0.5))
		unit.hp = minf(unit.max_hp, maxf(1.0, floorf(unit.hp * 0.5)))
	if mission_index == RECOVERY and difficulty in ["hard", "brutal"] and not unit.is_structure and not unit.is_worker:
		unit["campaign_weapons"] = 1
		unit["campaign_armor"] = 1
		if unit.unit_type == "triage_specialist":
			unit["campaign_healing_multiplier"] = DIRECTORATE_HEALING_MULTIPLIER

func _add_assault_guards(engine, guards: Array) -> void:
	for guard in guards:
		var unit: Dictionary = engine.spawn_unit(guard[1], 2, guard[2])
		_tune_enemy(unit)
		var tags: Array = _assault_guards.get(guard[0], [])
		tags.append(unit.tag)
		_assault_guards[guard[0]] = tags

func allows_training(unit_type: String) -> bool:
	return mission_index != ASSAULT and unit_type in roster.units

func allows_research(upgrade: String) -> bool:
	return upgrade in roster.research

func playback_speed() -> float:
	if mission_index == DEFENSE:
		if difficulty == "hard":
			return 1.2
		if difficulty == "brutal":
			return 1.4
	return 1.0

func allows_ability(id: String, ability: Dictionary) -> bool:
	if id in DEFERRED_ABILITIES:
		return false
	if id == "call_roadwardens":
		return mission_index == EVACUATION
	if id in ["lift", "land"]:
		return "muster_hall" in roster.structures
	if ability.has("unit"):
		return allows_training(ability.unit)
	if ability.has("structure"):
		return ability.structure in roster.structures
	if ability.has("upgrade"):
		return allows_research(ability.upgrade)
	return true

func _speak(engine, id: String) -> void:
	var line: Array = CUES[id]
	cue = {
		"id": id, "speaker": line[0], "text": line[1],
		"start_tick": engine.tick, "end_tick": engine.tick + int(float(line[2]) * _tick_rate),
		"point": line[3],
	}
	cue_history.append(id)

func step(engine) -> void:
	if status != "playing":
		return
	if evacuation != null:
		evacuation.move_truck(engine)
	if engine.tick % 8 != 0:
		return
	match mission_index:
		ASSAULT: _step_assault(engine)
		RECOVERY: _step_recovery(engine)
		DEFENSE: _step_defense(engine)
		EVACUATION: evacuation.step(engine, self)

func selected_mutators() -> Array:
	return [] if mutators == null else mutators.ids.duplicate()

func _step_assault(engine) -> void:
	if _named(engine, "captain_vale").is_empty():
		_finish(engine, false, "Captain Vale was lost.")
		return
	var objective: Dictionary = CHECKPOINTS[stage]
	if stage == CHECKPOINTS.size() - 1:
		if _uprising_civilians.is_empty():
			if _uprising_entrance_tick == 0 and (_squad_near(engine, UPRISING_PERIMETER, 12.0) or _squad_near(engine, objective.point, 11.0)):
				_speak(engine, "perimeter_low")
				_uprising_entrance_tick = int(cue.end_tick)
			elif _uprising_entrance_tick > 0 and engine.tick >= _uprising_entrance_tick:
				_start_uprising(engine)
		else:
			_step_uprising(engine)
		if _uprising_clear and not _any_named_alive(engine, objective.guards):
			stage += 1
			_finish(engine, true, "The resistance cleared the square and the Directorate relay has gone silent.", "signal_off")
		return
	if _any_named_alive(engine, objective.guards):
		return
	if _assault_guards.get(stage, []).any(func(tag): return engine.units.has(tag)):
		return
	if _squad_near(engine, objective.point, 6.0):
		stage += 1
		if not objective.cue.is_empty():
			_join_survivors(engine, objective.cue, objective.point)
			_speak(engine, objective.cue)

func _start_uprising(engine) -> void:
	var gate := _named(engine, "resistance_gate")
	if not gate.is_empty():
		engine._remove_destroyed_unit(gate)
	for index in UPRISING_POSTS.size():
		var start := Vector2(111.0 + float(index % 2) * 1.9, 20.0 + floorf(float(index) / 2.0) * 1.8)
		var civilian: Dictionary = engine.spawn_unit("resistance_civilian", 1, start, "uprising_civilian_%d" % index)
		if index == 0:
			civilian["name"] = "Resistance Leader"
			civilian["uprising_leader"] = true
		engine.issue_command([civilian.tag], "move", UPRISING_POSTS[index])
		civilian["campaign_scripted"] = true
		civilian["campaign_reserve"] = true
		civilian["rescue_cover_until"] = 0x7fffffff
		_uprising_civilians.append(civilian.tag)
	for entry in UPRISING_WAVE:
		var enemy: Dictionary = engine.spawn_unit(entry[0], 2, entry[1], "uprising_wave_%d" % _uprising_wave.size())
		if enemy.unit_type == "howitzer":
			enemy["name"] = "Directorate Patrol Vehicle"
			enemy.hp = 85.0
			enemy.max_hp = 85.0
		_tune_enemy(enemy)
		_uprising_wave.append(enemy.tag)
	engine.issue_command(_uprising_wave, "attack_move", UPRISING_PERIMETER + Vector2(0, 4))
	for id in UPRISING_RELAY_DEFENDERS:
		var defender := _named(engine, id)
		if not defender.is_empty():
			_uprising_wave.append(defender.tag)
	_uprising_wave.append_array(_assault_guards.get(stage, []))
	var relay := _named(engine, "relay_hq")
	if not relay.is_empty():
		_uprising_wave.append(relay.tag)
	_next_uprising_throw = engine.tick + int(_tick_rate * 1.5)
	_speak(engine, "uprising")

func _step_uprising(engine) -> void:
	if _uprising_clear:
		return
	if not _uprising_impact.is_empty() and engine.tick >= _next_uprising_throw:
		var impact := _uprising_impact
		_uprising_impact = {}
		engine.ability_triggered.emit(impact.source, "uprising_impact", impact.point)
		engine.apply_uprising_blast(impact.source, engine.units.get(impact.target, {}), impact.point, _uprising_wave)
	var survivors: Array = _uprising_wave.filter(func(tag): return engine.units.has(tag))
	if survivors.is_empty() and _uprising_shots >= _uprising_civilians.size():
		if engine.tick >= int(cue.end_tick):
			_uprising_clear = true
			for tag in _uprising_civilians:
				if engine.units.has(tag):
					engine.units[tag].erase("rescue_cover_until")
		return
	if engine.tick < _next_uprising_throw:
		return
	var index := _uprising_shots % _uprising_civilians.size()
	var civilian: Dictionary = engine.units.get(_uprising_civilians[index], {})
	_uprising_shots += 1
	_next_uprising_throw = engine.tick + roundi(UPRISING_FLIGHT_SECONDS * _tick_rate)
	if civilian.is_empty():
		return
	var target := _uprising_target(engine, survivors)
	var point := UPRISING_PERIMETER + Vector2(-3.0 + float(index), -6.0)
	if not target.is_empty():
		point = target.pos + target.vel * UPRISING_FLIGHT_SECONDS
	civilian.facing = (point - civilian.pos).angle()
	civilian["uprising_throw_tick"] = engine.tick
	engine.ability_triggered.emit(civilian, "uprising_throw", point)
	_uprising_impact = {"source": civilian, "target": target.get("tag", 0), "point": point}

func _uprising_target(engine, survivors: Array) -> Dictionary:
	var best: Dictionary = {}
	var best_score := -INF
	for tag in survivors:
		var target: Dictionary = engine.units[tag]
		# Clear the advancing force first, then help Vale take down the relay.
		var score := -100.0 if target.id == "relay_hq" else (1.5 if target.attributes.has("Armored") else 0.0)
		for other_tag in survivors:
			if other_tag != tag and target.pos.distance_squared_to(engine.units[other_tag].pos) <= 16.0:
				score += 1.0
		if score > best_score:
			best = target
			best_score = score
	return best

func _join_survivors(engine, id: String, rally: Vector2) -> void:
	if not REINFORCEMENTS.has(id):
		return
	var group: Dictionary = REINFORCEMENTS[id]
	var tags: Array[int] = []
	for unit_type in group.units:
		var point: Vector2 = group.point + Vector2(tags.size() * 2.0, 0)
		var unit: Dictionary = engine.spawn_unit(unit_type, 1, point, "survivor_%s_%d" % [id, tags.size()])
		tags.append(unit.tag)
	engine.issue_command(tags, "move", rally)
	troops_joined += tags.size()
	engine.notice.emit(1, "%d survivors joined your squad." % tags.size(), "info")

func _is_ground_squad(unit: Dictionary) -> bool:
	return unit.owner == 1 and not unit.get("campaign_scripted", false) and not unit.is_structure and not unit.is_worker and unit.flight_height <= 0.0 and not unit.has("embarked_in")

func _nearest_ground_squad(engine, point: Vector2, radius: float) -> Dictionary:
	var nearest := {}
	var nearest_distance := radius * radius
	for unit in engine.query_units_in_radius(point, radius):
		var distance: float = unit.pos.distance_squared_to(point)
		if _is_ground_squad(unit) and distance <= nearest_distance:
			nearest = unit
			nearest_distance = distance
	return nearest

func _squad_near(engine, point: Vector2, radius: float) -> bool:
	return not _nearest_ground_squad(engine, point, radius).is_empty()

func _named(engine, id: String) -> Dictionary:
	return engine.units.get(tags_by_id.get(id, 0), {})

func _any_named_alive(engine, ids: Array) -> bool:
	for id in ids:
		if engine.units.has(tags_by_id.get(id, 0)):
			return true
	return false

func _reserve(engine, unit: Dictionary) -> void:
	if unit.is_empty():
		return
	if not unit.is_structure:
		engine.issue_command([unit.tag], "hold_position")
	unit["campaign_scripted"] = true
	unit["campaign_reserve"] = true

func _release_reserves(engine, tags: Array) -> void:
	var joined := 0
	for tag in tags:
		var unit: Dictionary = engine.units.get(tag, {})
		if unit.is_empty():
			continue
		unit.erase("campaign_scripted")
		unit.erase("campaign_reserve")
		unit.erase("campaign_stranded")
		if not unit.is_structure:
			joined += 1
			engine.issue_command([tag], "stop")
	troops_joined += joined
	engine._recompute_supplies()

func _spawn_force(engine, owner: int, origin: Vector2, composition: Dictionary) -> Array[int]:
	var tags: Array[int] = []
	for unit_type in composition:
		for _i in int(composition[unit_type]):
			var index := tags.size()
			var point := origin + Vector2(float(index % 5 - 2), float(index / 5)) * 2.1
			var unit: Dictionary = engine.spawn_unit(unit_type, owner, point)
			_tune_enemy(unit)
			tags.append(unit.tag)
	return tags

func _step_recovery(engine) -> void:
	var hub := _named(engine, "recovery_hub")
	if hub.is_empty():
		_finish(engine, false, "The White Ridge staging base was lost.")
		return
	_collect_supply_caches(engine, CACHE_SITES)
	if camp_siege_tags.is_empty() and engine.tick >= 34 * _tick_rate:
		var attackers := {"rifleman": 3}
		match difficulty:
			"casual": attackers = {"rifleman": 1}
			"hard": attackers = {"rifleman": 3, "breacher": 1}
			"brutal": attackers = {"rifleman": 5, "breacher": 1}
		camp_siege_tags = _spawn_force(engine, 2, Vector2(44, 114), attackers)
		engine.issue_command(camp_siege_tags, "attack_move", CAMP_BEACON)
		if _any_named_alive(engine, CAMP_UNITS):
			_speak(engine, "camp_siege")
	var siege_over := not camp_siege_tags.is_empty() and not camp_siege_tags.any(func(tag): return engine.units.has(tag))
	if not camp_rescued and siege_over and _any_named_alive(engine, CAMP_UNITS) and _squad_near(engine, CAMP_BEACON, 8.0):
		camp_rescued = true
		_release_reserves(engine, CAMP_UNITS.map(func(id): return tags_by_id[id]))
		_speak(engine, "camp_rescued")
	if waves_sent < RAIDS.size() and engine.tick >= _scaled_time(RAIDS[waves_sent].at) * _tick_rate and not _named(engine, "dig_hall").is_empty():
		var attackers := _spawn_force(engine, 2, Vector2(32, 71), _wave_composition(RAIDS[waves_sent].units))
		waves_sent += 1
		engine.issue_command(attackers, "attack_move", hub.pos)
		engine.notice.emit(1, "Directorate patrol moving toward the staging base.", "warn")
	if stage == 0 and not _any_named_alive(engine, DIG_TARGETS):
		stage = 1
		_speak(engine, "dig_exposed")
	if stage == 1 and _squad_near(engine, DIG_SITE, ARTIFACT_PICKUP_RADIUS):
		stage = 2
		_finish(engine, true, "The White Ridge artifact was secured.", "dig_secured")

func _step_defense(engine) -> void:
	var hub: Dictionary = engine.units.get(tags_by_id.get("evac_hub", 0), {})
	if hub.is_empty():
		_finish(engine, false, "The outpost's Colony Hub was destroyed.")
		return
	_collect_supply_caches(engine, DEFENSE_CACHE_SITES)
	_recover_artifacts(engine, hub)
	_step_stranded_squads(engine, hub.pos)
	if difficulty in ["hard", "brutal"]:
		_step_defense_escalation(engine, hub.pos)
	if waves_sent < WAVES.size() and engine.tick >= int(WAVES[waves_sent].at) * _tick_rate:
		_send_wave(engine, hub.pos)
	if rescue_tag == 0 and engine.tick >= RESCUE_AT * _tick_rate:
		var ship: Dictionary = engine.spawn_unit("rampart_transport", 1, RESCUE_ENTRY, "rescue_rampart")
		rescue_tag = ship.tag
		engine.issue_command([rescue_tag], "move", LANDING_ZONE)
		ship["campaign_scripted"] = true
		_speak(engine, "inbound")
	elif rescue_tag != 0:
		var ship: Dictionary = engine.units.get(rescue_tag, {})
		if ship.is_empty():
			_finish(engine, false, "The rescue ship was shot down.")
		elif ship.pos.distance_squared_to(LANDING_ZONE) <= 4.0:
			_finish(engine, true, "The rescue ship reached the landing zone.", "rescued")

func _collect_supply_caches(engine, sites: Array) -> void:
	for index in sites.size():
		var cache: Dictionary = sites[index]
		if not cache_claimed.has(index) and _squad_near(engine, cache.point, 2.8):
			cache_claimed[index] = true
			engine.players[1].crystal += cache.crystal
			engine.players[1].aether += cache.aether
			engine.notice.emit(1, "Supplies recovered: +%d %s." % [maxi(cache.crystal, cache.aether), "crystal" if cache.crystal > 0 else "aether"], "info")

func _step_stranded_squads(engine, outpost: Vector2) -> void:
	for index in squads.size():
		var squad: Dictionary = squads[index]
		var site: Dictionary = STRANDED_SQUADS[index]
		if squad.state == "waiting" and engine.tick >= int(site.at) * _tick_rate:
			squad.tags = _spawn_force(engine, 1, site.point + Vector2(1, 0), {"rifleman": 3, "triage_specialist": 1})
			squad.deadline = engine.tick + MILITIA_RESCUE_WINDOW_SECONDS * _tick_rate
			for tag in squad.tags:
				_reserve(engine, engine.units[tag])
				engine.units[tag]["campaign_stranded"] = true
				engine.units[tag]["rescue_cover_until"] = squad.deadline
			squad.ambush = _spawn_force(engine, 2, site.approach, _stranded_guards(index))
			engine.issue_command(squad.ambush, "attack_move", site.point)
			engine._recompute_supplies()
			squad.state = "stranded"
			engine.notice.emit(1, "Distress call near the %s. The militia can hold for %d minutes." % [site.direction, MILITIA_RESCUE_WINDOW_SECONDS / 60], "warn")
			_speak(engine, site.cue)
		if squad.state != "stranded":
			continue
		if not squad.tags.any(func(tag): return engine.units.has(tag)):
			squad.state = "lost"
			var survivors: Array = squad.ambush.filter(func(tag):
				return engine.units.get(tag, {}).get("owner", 0) == 2)
			var message := "The Brood overran the militia near the %s." % site.direction
			if not survivors.is_empty():
				engine.issue_command(survivors, "attack_move", outpost)
				message += " The attackers are moving toward the outpost."
			engine.notice.emit(1, message, "warn")

func on_player_hit_enemy(engine, target_tag: int) -> void:
	if mission_index != DEFENSE or status != "playing":
		return
	for squad in squads:
		if squad.state != "stranded" or target_tag not in squad.ambush:
			continue
		if not squad.tags.any(func(tag): return engine.units.has(tag)):
			return
		squad.state = "rescued"
		squads_rescued += 1
		for tag in squad.tags:
			if engine.units.has(tag):
				engine.units[tag].erase("rescue_cover_until")
		_release_reserves(engine, squad.tags)
		engine.notice.emit(1, "Militia reinforcements have joined your army.", "info")
		engine.militia_recruited.emit(1)
		return

func _stranded_guards(index: int) -> Dictionary:
	var guards := {"skitterling": 4}
	if index == 0:
		return guards
	if difficulty != "casual":
		guards["bile_crawler"] = index
	if difficulty in ["hard", "brutal"]:
		guards.skitterling += index * 2
		guards.bile_crawler += 1
	if difficulty == "brutal":
		guards["blight_hurler"] = index
	return guards

func _recover_artifacts(engine, hub: Dictionary) -> void:
	for artifact in artifacts:
		if artifact.delivered:
			continue
		if artifact.carrier != 0:
			var carrier: Dictionary = engine.units.get(artifact.carrier, {})
			if carrier.is_empty():
				artifact.carrier = 0
				engine.notice.emit(1, "Artifact dropped. Send another soldier to recover it.", "info")
			else:
				artifact.point = carrier.pos
				if carrier.pos.distance_to(hub.pos) <= ARTIFACT_RETURN_RADIUS:
					artifact.delivered = true
					artifact.carrier = 0
					engine.notice.emit(1, "Artifact secured at the Colony Hub.", "info")
			continue
		for unit in engine.units.values():
			if _is_ground_squad(unit) and unit.pos.distance_to(artifact.point) <= ARTIFACT_PICKUP_RADIUS:
				artifact.carrier = unit.tag
				engine.notice.emit(1, "Artifact recovered. Bring the carrier back to the Colony Hub.", "info")
				break

func _scaled_time(seconds: int) -> int:
	match difficulty:
		"casual": return roundi(seconds * 1.08)
		"hard": return roundi(seconds * 0.9)
		"brutal": return roundi(seconds * 0.82)
	return seconds

func _wave_composition(original: Dictionary) -> Dictionary:
	var result := {}
	for unit_type in original:
		var count: int = original[unit_type]
		match difficulty:
			"casual":
				if unit_type in ["needlewing", "carapace_bulwark", "blight_hurler"]:
					continue
				count = maxi(1, ceili(count * 0.6))
			"hard": count = ceili(count * 1.18) if unit_type != "blight_hurler" else count
			"brutal": count = ceili(count * 1.35) if unit_type != "blight_hurler" else count
		result[unit_type] = count
	return result

func _step_defense_escalation(engine, target: Vector2) -> void:
	var brutal := difficulty == "brutal"
	var elapsed: int = engine.tick / _tick_rate
	var breach_times := [410, 710, 1010] if brutal else [575, 915]
	if _breaches < breach_times.size() and elapsed >= int(breach_times[_breaches]):
		var point := Vector2(154, 111) if _breaches % 2 == 0 else Vector2(143, 146)
		_breaches += 1
		var attackers := _spawn_force(engine, 2, point, {"skitterling": 6, "bile_crawler": 2} if brutal else {"skitterling": 5})
		engine.issue_command(attackers, "attack_move", target)
		engine.notice.emit(1, "Brood drop inside the perimeter.", "warn")
	if brutal and elapsed >= TUNNEL_AT and _tunnel_tag == 0:
		var tunnel: Dictionary = engine.spawn_unit("tunnel_mouth", 2, Vector2(150, 97), "assault_tunnel")
		_tunnel_tag = tunnel.tag
		_next_tunnel_wave = elapsed + 6
		engine.notice.emit(1, "Brood tunnel detected on the eastern ridge.", "warn")
	if _tunnel_tag != 0 and engine.units.has(_tunnel_tag) and elapsed >= _next_tunnel_wave:
		var attackers := _spawn_force(engine, 2, Vector2(151, 102), {"skitterling": 4, "bile_crawler": 1})
		engine.issue_command(attackers, "attack_move", target)
		_next_tunnel_wave = elapsed + 20

func _send_wave(engine, target: Vector2) -> void:
	var wave: Dictionary = WAVES[waves_sent]
	waves_sent += 1
	last_wave_size = 0
	for lane in wave.lanes:
		var composition := _wave_composition(lane[1])
		if composition.is_empty():
			continue
		var origin: Vector2 = WAVE_LANES[lane[0]]
		if lane[0] == 0 and difficulty in ["hard", "brutal"]:
			origin.y -= 5
		var tags := _spawn_force(engine, 2, origin, composition)
		last_wave_size += tags.size()
		engine.issue_command(tags, "attack_move", target)
	if difficulty == "brutal" and waves_sent in [3, 5, 12, 15]:
		var flank := _spawn_force(engine, 2, Vector2(161, 65), {"needlewing": 4})
		last_wave_size += flank.size()
		engine.issue_command(flank, "attack_move", target)
	if waves_sent == 4:
		_speak(engine, "pressure")
	elif waves_sent == WAVES.size():
		_speak(engine, "last_wave")

func _finish(engine, won: bool, message: String, final_cue: String = "") -> void:
	status = "victory" if won else "defeat"
	reason = message
	engine.paused = true
	if final_cue.is_empty():
		cue.clear()
	else:
		_speak(engine, final_cue)

func _marker(point: Vector2, label: String, bonus: bool = false, kind: String = "") -> Dictionary:
	return {"point": [point.x, point.y], "label": label, "bonus": bonus, "kind": kind}

func snapshot(engine, viewer: int = 0) -> Dictionary:
	var markers: Array[Dictionary] = []
	var primary := ""
	var bonus := ""
	var bonus_done := 0
	var bonus_total := 0
	var next_wave_in := -1
	var rescue_in := -1
	var extra := ""
	var extra_done := 0
	var extra_total := 0
	var mission_note := ""
	if mission_index == ASSAULT:
		var objective: Dictionary = CHECKPOINTS[mini(stage, CHECKPOINTS.size() - 1)]
		primary = objective.title
		var objective_point: Vector2 = objective.point
		if stage == CHECKPOINTS.size() - 1 and _uprising_entrance_tick > 0 and not _uprising_clear and (
				_uprising_wave.is_empty() or _uprising_wave.any(func(tag): return engine.units.has(tag) and tag != tags_by_id.get("relay_hq", 0))):
			primary = "Repel the Directorate counterattack"
			objective_point = UPRISING_PERIMETER
		markers.append(_marker(objective_point, primary))
		var vale := _named(engine, "captain_vale")
		mission_note = "Keep Captain Vale alive"
		if not vale.is_empty():
			mission_note += "  •  %d/%d HP" % [ceili(vale.hp), int(vale.max_hp)]
			markers.append(_marker(vale.pos, "Captain Vale", false, "hero"))
		bonus = "Destroy Directorate statues"
		bonus_total = STATUES.size()
		for id in STATUES:
			var statue: Dictionary = engine.units.get(tags_by_id.get(id, 0), {})
			if statue.is_empty():
				bonus_done += 1
			else:
				markers.append(_marker(statue.pos, "Directorate statue", true))
	elif mission_index == RECOVERY:
		primary = "Destroy the Directorate dig base" if stage == 0 else "Secure the exposed artifact"
		markers.append(_marker(DIG_SITE, primary, false, "artifact" if stage == 1 else ""))
		bonus = "Rescue the militia outpost"
		bonus_total = 1
		bonus_done = int(camp_rescued)
		if not camp_rescued and _any_named_alive(engine, CAMP_UNITS):
			markers.append(_marker(CAMP_BEACON, "Militia outpost", true))
		mission_note = "Research Module unlocks Triage Specialists"
	elif mission_index == DEFENSE:
		rescue_in = maxi(0, ceili(float(RESCUE_AT * _tick_rate - engine.tick) / _tick_rate))
		if viewer == 0 and waves_sent < WAVES.size():
			next_wave_in = ceili(float(int(WAVES[waves_sent].at) * _tick_rate - engine.tick) / _tick_rate)
		primary = "Protect the Colony Hub until rescue arrives" if rescue_tag == 0 else "Protect the landing zone"
		if rescue_tag != 0:
			markers.append(_marker(LANDING_ZONE, "Landing zone"))
		bonus = "Rescue stranded squads"
		bonus_done = squads_rescued
		bonus_total = squads.size()
		for index in squads.size():
			var squad: Dictionary = squads[index]
			if squad.state == "stranded":
				var marker := _marker(STRANDED_SQUADS[index].point, "Rescue militia", true)
				marker["cover_seconds"] = maxi(0, ceili(float(squad.deadline - engine.tick) / _tick_rate))
				markers.append(marker)
		extra = "Return artifacts to the Colony Hub"
		extra_total = artifacts.size()
		for artifact in artifacts:
			if artifact.delivered:
				extra_done += 1
			elif artifact.carrier != 0:
				markers.append(_marker(artifact.point, "Artifact carrier", true, "carrier"))
			else:
				markers.append(_marker(artifact.point, "Recover artifact", true, "artifact"))
	elif mission_index == EVACUATION:
		var objective := evacuation.objectives(engine, self)
		primary = objective.primary
		mission_note = objective.note
		markers.append_array(objective.markers)
		bonus = "Collect chrysalis samples"
		bonus_done = evacuation.samples_collected.size()
		bonus_total = Evacuation.SAMPLES.size()
		extra = "Clear Brood nests and hives"
		extra_total = Evacuation.BROOD_BASES.size()
		for id in Evacuation.BROOD_BASES:
			if _named(engine, id).is_empty():
				extra_done += 1
	var supply_caches := CACHE_SITES if mission_index == RECOVERY else DEFENSE_CACHE_SITES if mission_index == DEFENSE else []
	for index in supply_caches.size():
		if not cache_claimed.has(index):
			var cache: Dictionary = supply_caches[index]
			var crystal: bool = cache.crystal > 0
			var marker := _marker(cache.point, "Crystal cache" if crystal else "Aether cache", true, "cache")
			marker["pickup"] = "crystal_cache" if crystal else "aether_cache"
			markers.append(marker)
	if viewer != 0:
		markers = markers.filter(func(marker):
			return engine.can_see_position(viewer, Vector2(marker.point[0], marker.point[1]))
		)
	var public_cue := {}
	if not cue.is_empty() and engine.tick < int(cue.end_tick):
		public_cue = cue.duplicate()
		var point: Vector2 = public_cue.point
		public_cue.point = [point.x, point.y] if point.is_finite() else []
	var result := {
		"mission": mission_index + 1, "title": MISSIONS[mission_index].title, "difficulty": difficulty,
		"mutators": selected_mutators(),
		"status": status, "reason": reason, "primary": primary, "stage": stage,
		"stage_total": CHECKPOINTS.size() if mission_index == ASSAULT else 2 if mission_index in [RECOVERY, EVACUATION] else 0,
		"troops_joined": troops_joined,
		"bonus": bonus, "bonus_done": bonus_done, "bonus_total": bonus_total,
		"extra": extra, "extra_done": extra_done, "extra_total": extra_total, "mission_note": mission_note,
		"caches_claimed": cache_claimed.size(),
		"waves_sent": waves_sent, "wave_total": WAVES.size() if mission_index == DEFENSE else 0,
		"last_wave_size": last_wave_size,
		"rescue_in": rescue_in, "rescue_tag": rescue_tag,
		"markers": markers, "cue": public_cue, "cue_history": cue_history.duplicate(),
	}
	if viewer == 0:
		result["next_wave_in"] = next_wave_in
	if evacuation != null:
		result["colonists_safe"] = evacuation.safe
		result["colonists_lost"] = evacuation.lost
		result["convoys_sent"] = evacuation.convoys_sent
		result["convoy_tag"] = evacuation.truck_tag
		result["brood_research"] = evacuation.samples_collected.size()
		if viewer == 0:
			result["convoy_attacks_sent"] = evacuation.attacks_sent
	return result
