extends SceneTree

const NODE := "brood_growth_node"
const BUILD := "build_brood_growth_node"
const SITE := Vector2(54, 30)
const INNER := Vector2(58, 30)
const EDGE := Vector2(70, 30)

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	_test_growth_and_refill()
	print("Living ground node checks: ", "passed" if failures.is_empty() else str(failures))
	quit(0 if failures.is_empty() else 1)

func _check(ok: bool, message: String) -> bool:
	if not ok:
		failures.append(message)
	return ok

func _node() -> Dictionary:
	for unit in sim.units.values():
		if unit.unit_type == NODE:
			return unit
	return {}

func _test_growth_and_refill() -> void:
	sim.reset_state(42, 128, 72)
	sim.spawn_unit("brood_nest", 2, Vector2(30, 30))
	sim.spawn_unit("brood_nest", 3, Vector2(102, 30))
	sim.step_ticks(1600)
	var worker: Dictionary = sim.spawn_unit("forager", 2, Vector2(50.5, 30))
	var hostile_ground := Vector2(94, 30)
	_check(not sim.issue_command([worker.tag], BUILD, Vector2(74, 30)).ok and not sim.issue_command([worker.tag], BUILD, hostile_ground).ok and sim.players[2].crystal == 400, "Only active friendly ground can accept a node")
	_check(sim.issue_command([worker.tag], BUILD, SITE).ok, "The Forager can place the paid node at the Nest's edge")
	sim.step_ticks(1)
	var site := _node()
	if not _check(not site.is_empty(), "The order creates the Growth Node foundation"):
		return
	_check(site.build_progress < 1.0 and not sim.units.has(worker.tag) and sim.players[2].crystal == 340, "The foundation pays exactly 60 crystal and morphs one Forager")
	sim.step_ticks(128)
	_check(not sim.has_living_ground(INNER) and not sim.has_living_ground(EDGE), "The unfinished node has no coverage")
	_check(sim.issue_command([site.tag], "cancel_construction").ok and sim.players[2].crystal == 385 and _node().is_empty(), "Cancellation applies the normal 75 percent refund")
	var restored: Array = sim.units.values().filter(func(unit): return unit.unit_type == "forager" and unit.owner == 2)
	if not _check(restored.size() == 1, "Cancellation restores exactly one Forager"):
		return
	_check(sim.issue_command([restored[0].tag], BUILD, SITE).ok, "The restored Forager can retry the paid morph")
	sim.step_ticks(1000)
	var node := _node()
	if not _check(not node.is_empty() and node.build_progress == 1.0 and sim.players[2].crystal == 325, "The retry finishes as a paid node"):
		return
	_check(sim.has_active_living_ground(EDGE, 2) and not sim.has_living_ground(Vector2(74, 30)), "The mature node extends the connected layer by its radius")

	var attacker: Dictionary = sim.spawn_unit("howitzer_emplaced", 1, Vector2(76, 30))
	node.hp = 1.0
	sim.issue_command([attacker.tag], "attack_target", SITE, node.tag)
	for i in range(96):
		sim.step_ticks(1)
		if not sim.units.has(node.tag):
			break
	if not _check(not sim.units.has(node.tag), "Enemy artillery destroys the node through combat"):
		return
	sim.issue_command([attacker.tag], "hold_fire")
	var pulse: int = sim.LivingGround.UPDATE_TICKS
	var retire_tick := ceili(float(sim.tick) / pulse) * pulse
	sim.step_ticks(retire_tick - sim.tick)
	_check(sim.has_living_ground(EDGE, 2) and not sim.has_active_living_ground(EDGE, 2) and sim.has_active_living_ground(SITE, 2), "Death starts a grace period and leaves overlapping live coverage")
	worker = sim.spawn_unit("forager", 2, Vector2(50.5, 30))
	_check(not sim.issue_command([worker.tag], BUILD, INNER).ok, "Fading ground cannot anchor another node")
	_check(sim.issue_command([worker.tag], BUILD, SITE).ok, "The remaining Nest allows the node to be rebuilt")
	var first_expiry: int = sim.LivingGround.DECAY_DELAY_TICKS
	sim.step_ticks(first_expiry - 1)
	_check(sim.has_living_ground(EDGE, 2), "The outer ring remains through the last tick of its grace period")
	sim.step_ticks(1)
	_check(not sim.has_living_ground(EDGE, 2) and sim.has_living_ground(INNER, 2), "Outer coverage decays before inner coverage")
	sim.step_ticks(256)
	_check(sim.has_active_living_ground(INNER, 2) and sim.has_living_ground(INNER, 2), "Rebuilt coverage survives the old inner ring's expiration")
	sim.step_ticks(640)
	_check(sim.has_active_living_ground(EDGE, 2), "The rebuilt node refills the outer ring")
