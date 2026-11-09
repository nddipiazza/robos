extends SceneTree

const CAST := "inject_brood"
const TRAIN := "train_brood_keeper"

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	_test_paid_injection()
	_test_destroyed_target()
	print("Brood Keeper checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> bool:
	if not ok:
		failures.append(message)
	return ok

func _reset() -> Array:
	sim.load_scenario_dict({
		"paused": true, "victory": "all_structures", "map": {"width": 128, "height": 80},
		"players": {"1": {"faction": "monsters"}},
		"units": [
			{"type": "brood_nest", "owner": 1, "x": 30, "y": 30},
			{"type": "brood_nest", "owner": 2, "x": 109, "y": 60},
		],
	})
	return sim.units.values()

func _cast(keeper: Dictionary, nest: Dictionary) -> bool:
	return sim.issue_command([keeper.tag], CAST, nest.pos, nest.tag).ok

func _test_paid_injection() -> void:
	var bases := _reset()
	var nest: Dictionary = bases[0]
	var enemy: Dictionary = bases[1]
	_check(sim.issue_command([nest.tag], "rally", Vector2(60, 30)).ok, "The paid Keeper receives the normal Nest rally")
	_check(sim.issue_command([nest.tag], TRAIN).ok and nest.brood_slots == 2, "Training the Keeper reserves a brood slot")
	_check(sim.players[1].crystal == 275 and sim.players[1].aether == 125 and sim.players[1].supply_used == 2, "The paid job reserves its exact resources and supply")
	sim.step_ticks(2600)
	var trained: Array = sim.units.values().filter(func(unit): return unit.unit_type == "brood_keeper")
	if not _check(trained.size() == 1, "A Keeper hatches through normal production"):
		return
	var keeper: Dictionary = trained[0]
	var start: Vector2 = keeper.pos
	var energy: float = keeper.energy
	var unfinished: Dictionary = sim.spawn_unit("brood_nest", 1, Vector2(28, 53), "", 0.25)
	_check(not _cast(keeper, enemy) and not _cast(keeper, unfinished) and keeper.energy == energy, "Foreign and unfinished Nests reject injection without spending energy")
	_check(_cast(keeper, nest), "The Keeper accepts an injection order from outside cast range")
	var ordered_tick: int = sim.tick
	sim.step_ticks(32)
	_check(keeper.pos.distance_to(nest.pos) < start.distance_to(nest.pos) and keeper.energy > energy and sim.brood_inject_remaining(nest) == 0.0, "The Keeper approaches and keeps its energy until casting")
	for i in range(400):
		if sim.brood_inject_remaining(nest) > 0.0:
			break
		sim.step_ticks(1)
	var earned: float = float(sim.tick - ordered_tick) * sim.TICK_DT * keeper.energy_profile.regen
	_check(sim.brood_inject_remaining(nest) == 12.0 and is_equal_approx(keeper.energy, energy + earned - 25.0), "Casting starts an exact 12 second timer and spends 25 energy")
	var second: Dictionary = sim.spawn_unit("brood_keeper", 1, Vector2(29, 39))
	_check(not _cast(second, nest) and second.energy == 25.0, "A Nest accepts only one pending clutch")
	sim.step_ticks(sim.BROOD_INJECT_DELAY - 1)
	_check(nest.brood_slots == 3, "A pending clutch grants no early slot")
	sim.step_ticks(1)
	_check(nest.brood_slots == 5 and sim.brood_inject_remaining(nest) == 0.0, "The clutch adds exactly two brood slots on its completion tick")
	_check(not _cast(second, nest) and second.energy > 25.0, "A full Nest rejects another clutch")
	for i in range(5):
		_check(sim.issue_command([nest.tag], "train_skitterling").ok, "All five available slots accept paid work")
	_check(nest.brood_slots == 0 and sim.active_production_slots(nest) == 5 and sim.players[1].crystal == 150 and sim.players[1].supply_used == 9, "All paid jobs run concurrently and hold resources")
	for i in range(2):
		_check(sim.issue_command([nest.tag], "cancel_training", Vector2.ZERO, 0, "0").ok, "Bonus jobs can be canceled normally")
	_check(nest.brood_slots == 2 and nest.brood_bonus_slots == 2 and sim.players[1].crystal == 200 and sim.players[1].supply_used == 7, "Cancellation restores the two injected slots and exact resources")
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, keeper.pos + Vector2(0, -7))
	_check(sim.issue_command([keeper.tag], "attack_target", air.pos, air.tag).ok, "The Keeper can defend against an airborne threat")
	sim.step_ticks(32)
	_check(air.hp < air.max_hp, "The Keeper's defensive attack hits the flyer")

func _test_destroyed_target() -> void:
	var bases := _reset()
	var nest: Dictionary = bases[0]
	sim.spawn_unit("brood_pod", 1, Vector2(20, 64))
	var keeper: Dictionary = sim.spawn_unit("brood_keeper", 1, Vector2(27, 37))
	_check(_cast(keeper, nest), "The second fixture starts an injection at the Nest")
	sim.step_ticks(1)
	var finish: int = nest.get("brood_inject_finish", 0)
	_check(finish > 0, "The pending clutch belongs to the targeted Nest")
	var artillery: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, Vector2(53, 30))
	nest.hp = 1.0
	sim.issue_command([artillery.tag], "attack_target", nest.pos, nest.tag)
	sim.step_ticks(32)
	if not _check(not sim.units.has(nest.tag), "An enemy attack destroys the injected Nest before it hatches"):
		return
	sim.issue_command([artillery.tag], "hold_fire")
	var replacement: Dictionary = sim.spawn_unit("brood_nest", 1, nest.pos)
	sim.step_ticks(sim.BROOD_INJECT_DELAY)
	_check(replacement.brood_slots == 3 and sim.brood_inject_remaining(replacement) == 0.0 and keeper.energy < 25.0, "Nest death loses its clutch and its spent energy")
