extends SceneTree

const ABILITY := "attach_fabrication_module"
const MODULE := "fabrication_module"

var sim: Node
var failures: Array[String] = []
var cost: Vector2i
var build_ticks: int

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	var definition: Dictionary = root.get_node("RTSData").get_unit_def(MODULE)
	cost = Vector2i(definition.crystal_cost, definition.aether_cost)
	build_ticks = ceili(float(definition.build_time) / sim.TICK_DT)
	_test_blocked_pads()
	_test_payment_and_cancel()
	_test_training_around_pad()
	_test_combat_loss()
	_test_airborne_parent()
	print("Production attachment checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, label: String) -> bool:
	if not ok:
		failures.append(label)
	return ok

func _reset_hall(pos: Vector2 = Vector2(30, 30)) -> Dictionary:
	sim.reset_state(42, 96, 64)
	return sim.spawn_unit("muster_hall", 1, pos)

func _stock(owner: int = 1) -> Vector2i:
	var player: Dictionary = sim.players[owner]
	return Vector2i(player.crystal, player.aether)

func _start(hall: Dictionary) -> Dictionary:
	if not _check(sim.issue_command([hall.tag], ABILITY, Vector2(80, 50)).ok, "A completed Hall starts the paid attachment"):
		return {}
	return sim.production_attachment(hall, false)

func _test_blocked_pads() -> void:
	var hall := _reset_hall()
	var pad: Vector2 = sim.production_attachment_pad(hall)
	sim.spawn_unit("silo", 1, pad)
	_check(not sim.issue_command([hall.tag], ABILITY).ok and _stock() == Vector2i(400, 150), "A structure occupying the pad blocks payment")
	hall = _reset_hall()
	sim.spawn_resource("crystal_field", pad)
	_check(not sim.issue_command([hall.tag], ABILITY).ok, "A deposit occupying the pad blocks construction")
	hall = _reset_hall()
	var blocker: Dictionary = sim.spawn_unit("pioneer", 1, pad)
	_check(not sim.issue_command([hall.tag], ABILITY).ok, "A ground unit occupying the pad blocks construction")
	sim.issue_command([blocker.tag], "move", Vector2(46, 40))
	sim.step_ticks(128)
	sim.spawn_unit("kestrel_interceptor", 1, pad)
	_check(sim.issue_command([hall.tag], ABILITY).ok, "The clear ground pad remains available under a flyer")
	hall = _reset_hall(Vector2(90, 30))
	_check(not sim.issue_command([hall.tag], ABILITY).ok, "The entire attachment must fit inside the map")
	sim.load_scenario_dict({"paused": true, "map": {
		"width": 96, "height": 64, "water_channels": [{"width": 4, "points": [[35.5, 0], [35.5, 64]]}],
	}})
	hall = sim.spawn_unit("muster_hall", 1, Vector2(30, 30))
	_check(sim.is_water_at(pad) and not sim.issue_command([hall.tag], ABILITY).ok, "Water at the fixed pad blocks construction")

func _test_payment_and_cancel() -> void:
	var hall := _reset_hall()
	var worker: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(20, 20))
	var unfinished: Dictionary = sim.spawn_unit("muster_hall", 1, Vector2(62, 36), "", 0.5)
	_check(not sim.issue_command([worker.tag], "build_" + MODULE, Vector2(20, 30)).ok, "A worker cannot place a module anywhere")
	_check(not sim.issue_command([unfinished.tag], ABILITY).ok, "An incomplete Hall cannot build an attachment")
	sim.players[1].crystal = cost.x - 1
	_check(not sim.issue_command([hall.tag], ABILITY).ok and _stock().x == cost.x - 1, "Insufficient crystal leaves the pad empty")
	sim.players[1].crystal = 400
	sim.players[1].aether = cost.y - 1
	_check(not sim.issue_command([hall.tag], ABILITY).ok and _stock().y == cost.y - 1, "Insufficient aether leaves the pad empty")
	sim.players[1].aether = 150
	var starting := _stock()
	var site := _start(hall)
	if not _check(not site.is_empty(), "The foundation is linked to its Hall"):
		return
	_check(site.owner == hall.owner and site.attachment_parent_tag == hall.tag and site.pos == sim.production_attachment_pad(hall),
		"The fixed pad and ownership come from the producer")
	_check(sim.production_attachment(hall).is_empty() and _stock() == starting - cost, "An unfinished attachment is paid but grants no completed link")
	_check(not sim.issue_command([hall.tag], ABILITY).ok and _stock() == starting - cost, "One Hall has exactly one paid attachment slot")
	sim.step_ticks(32)
	_check(is_equal_approx(site.build_progress, 0.5 / 50.0), "The attachment constructs itself at its listed Normal rate")
	var refund := Vector2i(floori(cost.x * sim.CONSTRUCTION_REFUND), floori(cost.y * sim.CONSTRUCTION_REFUND))
	_check(sim.issue_command([site.tag], "cancel_construction").ok and _stock() == starting - cost + refund,
		"Cancel refunds the standard paid construction fraction")
	_check(not sim.units.has(site.tag) and not hall.has("attachment_tag"), "Cancel clears both the entity and Hall slot")
	site = _start(hall)
	if site.is_empty():
		return
	sim.step_ticks(build_ticks)
	_check(sim.production_attachment(hall).get("tag") == site.tag and not sim.issue_command([site.tag], "cancel_construction").ok,
		"The replacement completes and cannot be canceled as a foundation")

func _destroy(target: Dictionary) -> void:
	var gun: Dictionary = sim.spawn_unit("howitzer_emplaced", 2, target.pos + Vector2(23, 0))
	target.hp = 1.0
	sim.issue_command([gun.tag], "hold_fire")
	_check(sim.issue_command([gun.tag], "attack_target", target.pos, target.tag).ok, "Enemy artillery can target the structure independently")
	sim.step_ticks(32)
	_check(not sim.units.has(target.tag), "Enemy artillery destroys its chosen target")

func _test_training_around_pad() -> void:
	var hall := _reset_hall()
	sim.spawn_unit("colony_hub", 1, Vector2(16, 18))
	var goal := Vector2(52, 30)
	sim.issue_command([hall.tag], "rally", goal)
	for _unit in range(2):
		if not _check(sim.issue_command([hall.tag], "train_rifleman").ok, "The Hall accepts training before construction"):
			return
	sim.step_ticks(32)
	var progress: float = hall.production_queue[0].progress
	var site := _start(hall)
	if site.is_empty():
		return
	var paid := _stock()
	_check(not sim.issue_command([hall.tag], "train_rifleman").ok and _stock() == paid and hall.production_queue.size() == 2,
		"The Hall rejects new training without charging for it while its attachment builds")
	sim.step_ticks(64)
	_check(progress > 0.0 and hall.production_queue[0].progress == progress and hall.production_queue[1].progress == 0.0
		and site.build_progress < 1.0, "An unfinished module pauses paid jobs at their current progress")
	sim.step_ticks(build_ticks * 4)
	var recruits: Array = sim.units.values().filter(func(unit): return unit.unit_type == "rifleman" and unit.owner == 1)
	_check(recruits.size() == 2 and recruits.all(func(unit): return unit.pos.distance_to(goal) < 5.0),
		"Paid recruits detour around the completed attachment to their rally")

func _test_combat_loss() -> void:
	var hall := _reset_hall()
	var site := _start(hall)
	if site.is_empty():
		return
	sim.step_ticks(build_ticks)
	var paid := _stock()
	_destroy(site)
	_check(sim.units.has(hall.tag) and not hall.has("attachment_tag") and _stock() == paid, "Destroying the attachment frees its pad without refunding it")
	site = _start(hall)
	if site.is_empty():
		return
	sim.step_ticks(build_ticks)
	paid = _stock()
	_destroy(hall)
	_check(sim.units.has(site.tag) and not site.has("attachment_parent_tag") and _stock() == paid,
		"A completed attachment stays on the ground when its parent is destroyed")
	hall = _reset_hall()
	site = _start(hall)
	if site.is_empty():
		return
	paid = _stock()
	_destroy(hall)
	_check(not sim.units.has(site.tag) and _stock() == paid, "Losing the parent discards an unfinished attachment without a refund")

func _test_airborne_parent() -> void:
	var hall := _reset_hall()
	var site := _start(hall)
	if site.is_empty():
		return
	sim.step_ticks(build_ticks)
	var pad: Vector2 = site.pos
	# A later lift command can set the same airborne state without moving the module.
	hall.flight_height = 7.0
	sim.step_ticks(1)
	_check(sim.production_attachment(hall).is_empty() and not hall.has("attachment_tag") and not site.has("attachment_parent_tag"),
		"An airborne parent detaches cleanly")
	_check(site.pos == pad and sim.units.has(site.tag) and not sim.issue_command([hall.tag], ABILITY).ok,
		"The detached module remains on the ground and an airborne Hall cannot build")
