extends SceneTree

const MODULE := "fabrication_module"
const ATTACH := "attach_fabrication_module"

var sim: Node
var data: Node
var births: Array[Dictionary] = []
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	data = root.get_node("RTSData")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	sim.unit_production_finished.connect(_record_birth)
	_test_two_lanes()
	_test_heavy_fifo()
	_test_module_loss()
	print("Dual production checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok

func _record_birth(unit: Dictionary, _producer: Dictionary) -> void:
	births.append({"type": unit.unit_type, "tag": unit.tag, "position": unit.pos, "radius": unit.radius, "tick": sim.tick})

func _cost(type: String) -> Vector2i:
	var definition: Dictionary = data.get_unit_def(type)
	return Vector2i(definition.crystal_cost, definition.aether_cost)

func _stock() -> Vector2i:
	return Vector2i(sim.players[1].crystal, sim.players[1].aether)

func _build_ticks(type: String) -> int:
	return ceili(float(data.get_unit_def(type).build_time) * sim.build_time_scale() / sim.TICK_DT)

func _hall_with_module() -> Dictionary:
	births.clear()
	sim.reset_state(42, 112, 64)
	sim.spawn_unit("colony_hub", 1, Vector2(15, 18))
	var hall: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(30, 30))
	_check(sim.issue_command([hall.tag], ATTACH).ok, "Pay to install the Fabrication Module")
	sim.step_ticks(_build_ticks(MODULE))
	_check(not sim.production_attachment(hall).is_empty(), "The installed module is ready")
	return hall

func _train(hall: Dictionary, types: Array) -> bool:
	for type in types:
		if not _check(sim.issue_command([hall.tag], "train_" + type).ok, "Pay to queue " + type):
			return false
	return true

func _cancel(hall: Dictionary, index: int) -> bool:
	return sim.issue_command([hall.tag], "cancel_training", Vector2.ZERO, 0, str(index)).ok

func _test_two_lanes() -> void:
	var hall := _hall_with_module()
	var starting := _stock()
	if not _train(hall, ["rifleman", "rifleman", "rifleman"]):
		return
	_check(_stock() == starting - _cost("rifleman") * 3 and sim.players[1].supply_used == 3,
		"All three paid jobs reserve normal costs and supply")
	sim.step_ticks(1)
	var queue: Array = hall.production_queue
	_check(sim.active_production_slots(hall) == 2 and queue[0].progress == sim.TICK_DT
		and queue[1].progress == sim.TICK_DT and queue[2].progress == 0.0,
		"Exactly the first two light jobs advance on the same tick")
	sim.step_ticks(_build_ticks("rifleman") - 1)
	if _check(births.size() == 2, "Both identical paid jobs finish on the same scheduled tick"):
		_check(births[0].tick == births[1].tick and births[0].tag < births[1].tag
			and births[0].position.distance_to(births[1].position) >= births[0].radius + births[1].radius,
			"Same-tick jobs deploy in slot order at separate clear positions")
	_check(queue.size() == 1 and queue[0].progress == 0.0 and _stock() == starting - _cost("rifleman") * 3
		and sim.players[1].supply_used == 3, "Deployment transfers both reservations once and starts no third job on that tick")

func _test_heavy_fifo() -> void:
	var hall := _hall_with_module()
	if not _train(hall, ["breacher", "rifleman", "breacher", "rifleman"]):
		return
	var queue: Array = hall.production_queue
	sim.step_ticks(32)
	_check(sim.active_production_slots(hall) == 1 and queue[0].progress > 0.0 and queue[1].progress == 0.0,
		"A heavy job in the first slot runs alone")
	sim.step_ticks(_build_ticks("breacher") - 32)
	if not _check(queue.size() == 3 and queue[0].unit_type == "rifleman", "The first heavy job finishes before either waiting unit"):
		return
	sim.step_ticks(32)
	_check(sim.active_production_slots(hall) == 1 and queue[0].progress > 0.0 and queue[1].progress == 0.0 and queue[2].progress == 0.0,
		"A heavy job in the second slot prevents a later light job skipping ahead")
	var before := _stock()
	_check(_cancel(hall, 1) and _stock() == before + _cost("breacher"), "Cancel refunds the exact waiting heavy job")
	sim.step_ticks(1)
	_check(sim.active_production_slots(hall) == 2 and queue[1].progress == sim.TICK_DT,
		"The next light job becomes active only after the heavy barrier is removed")

func _test_module_loss() -> void:
	var hall := _hall_with_module()
	var module: Dictionary = sim.production_attachment(hall)
	if module.is_empty() or not _train(hall, ["triage_specialist", "rifleman", "rifleman"]):
		return
	var queue: Array = hall.production_queue
	var first: Dictionary = queue[0]
	var second: Dictionary = queue[1]
	var waiting: Dictionary = queue[2]
	sim.step_ticks(16)
	var gun: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, module.pos + Vector2(22, 0))
	module.hp = 1.0
	sim.issue_command([gun.tag], "hold_fire")
	sim.issue_command([gun.tag], "attack_target", module.pos, module.tag)
	sim.step_ticks(32)
	var paused_progress: float = second.progress
	var front_progress: float = first.progress
	var before_rebuild := _stock()
	if not _check(not sim.units.has(module.tag) and sim.active_production_slots(hall) == 1 and paused_progress > 0.0,
		"Combat loss leaves the second paid job in a paused slot"):
		return
	sim.step_ticks(16)
	_check(first.progress > front_progress and second.progress == paused_progress and waiting.progress == 0.0,
		"The front job advances serially while the second job keeps its exact progress")
	_check(sim.issue_command([hall.tag], ATTACH).ok and _stock() == before_rebuild - _cost(MODULE), "Pay normal construction cost to restore the second line")
	var replacement: Dictionary = sim.production_attachment(hall, false)
	if replacement.is_empty():
		return
	for _tick in range(_build_ticks(MODULE)):
		sim.step_ticks(1)
		if replacement.build_progress >= 1.0:
			break
	_check(second.progress == paused_progress and waiting.progress == 0.0, "The foundation grants no concurrent progress")
	sim.step_ticks(1)
	_check(sim.active_production_slots(hall) == 2 and second.progress == paused_progress + sim.TICK_DT and waiting.progress == 0.0,
		"Restoration resumes the same paid second job from its saved progress")
	var before_cancel := _stock()
	var supply_before: int = sim.players[1].supply_used
	var second_progress: float = second.progress
	_check(_cancel(hall, 0) and _stock() == before_cancel + _cost("triage_specialist")
		and sim.players[1].supply_used == supply_before - 2 and queue[0] == second and second.progress == second_progress,
		"Canceling an active job refunds only its own resources and supply and preserves its neighbor")
	sim.step_ticks(1)
	_check(waiting.progress == sim.TICK_DT, "The waiting light job takes the freed line on the next tick")
