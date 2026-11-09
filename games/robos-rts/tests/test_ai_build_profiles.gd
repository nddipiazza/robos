extends SceneTree

const PROFILES := {
	"humans": {"basic": "rifleman", "siege": "howitzer"},
	"monsters": {"basic": "skitterling", "siege": "blight_hurler"},
	"aliens": {"basic": "sunblade", "siege": "spire_walker"},
}

var sim: Node
var data: Node
var roster: Dictionary
var starting_base: Vector2
var trained: Dictionary
var expansion: float
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	data = root.get_node("RTSData")
	sim.unit_production_finished.connect(_record_training)
	sim.structure_construction_finished.connect(_record_expansion)
	# Accept a strategy after Godot's argument separator for targeted replays.
	var args := OS.get_cmdline_user_args()
	var strategies := ["rush", "economy", "siege"] if args.is_empty() else [args[0]]
	for faction in PROFILES:
		var dispatch := {}
		for strategy in strategies:
			dispatch[strategy] = _play_opening(faction, strategy)
		if args.is_empty():
			_check(dispatch.rush < dispatch.economy and dispatch.rush < dispatch.siege, faction + " rush sends the earliest attack")
	print("AI build profiles: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _play_opening(faction: String, strategy: String) -> float:
	var label := "%s %s" % [faction, strategy]
	var result: Dictionary = sim.start_skirmish("iron-narrows", {
		"seed": 42, "difficulty": "normal", "strategy": strategy, "ai_faction": faction,
	})
	if not result.ok:
		_check(false, label + " could not start")
		return INF
	roster = data.faction_info[faction]
	var initial_site: Dictionary = result.match.starts[result.match.assigned_starts["2"]]
	starting_base = Vector2(initial_site.x, initial_site.y)
	trained = {}
	expansion = INF
	var first_dispatch := INF
	var dispatch_size := 0
	var profile: Dictionary = PROFILES[faction]
	var start: Dictionary = sim.players[2]
	_check(start.crystal == 50 and start.aether == 0 and start.units_trained == 0
		and not sim.units.values().any(func(unit): return unit.owner == 2 and not unit.is_structure and not unit.is_worker),
		label + " starts with the standard bank and no military")
	for _second in range(440):
		sim.step_ticks(64)
		if not is_finite(first_dispatch):
			var dispatched: Array = sim.units.values().filter(func(unit):
				return unit.owner == 2 and unit.has("skirmish_route") and not unit.orders.is_empty())
			if not dispatched.is_empty():
				first_dispatch = sim.sim_time
				dispatch_size = dispatched.size()
		var plan_ready := (strategy != "economy" or is_finite(expansion)) and (strategy != "siege" or trained.has(profile.siege))
		if (is_finite(first_dispatch) and plan_ready) or sim.match_state.status == "finished":
			break
	var player: Dictionary = sim.players[2]
	print(JSON.stringify({"profile": label, "dispatch": first_dispatch if is_finite(first_dispatch) else null, "attackers": dispatch_size,
		"expansion": expansion if is_finite(expansion) else null, "units": trained,
		"crystal_collected": player.crystal_collected, "aether_collected": player.aether_collected}))
	_check(is_finite(first_dispatch) and dispatch_size >= 4 and player.crystal_collected > 0 and player.units_trained >= dispatch_size,
		label + " launches a paid army")
	match strategy:
		"rush":
			_check(trained.has(profile.basic) and not is_finite(expansion) and player.aether_collected == 0,
				label + " commits basic units before gas or an expansion")
		"economy":
			_check(is_finite(expansion) and expansion < first_dispatch, label + " completes a resource expansion before dispatch")
		"siege":
			_check(trained.has(profile.siege) and float(trained.get(profile.siege, INF)) <= first_dispatch + 55.0 and player.aether_collected > 0,
				label + " fields its signature gas unit in the opening")
		_:
			_check(false, "Unknown profile " + strategy)
	return first_dispatch

func _record_training(unit: Dictionary, _producer: Dictionary) -> void:
	if unit.owner == 2 and not unit.is_worker and not trained.has(unit.unit_type):
		trained[unit.unit_type] = sim.sim_time

func _record_expansion(structure: Dictionary) -> void:
	if structure.owner == 2 and structure.unit_type == roster.town_hall and structure.pos.distance_to(starting_base) >= 20.0 and not is_finite(expansion):
		expansion = sim.sim_time
