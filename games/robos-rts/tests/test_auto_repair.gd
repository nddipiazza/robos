extends SceneTree

const COVERED_ABILITIES = ["auto_repair"]
var sim: Node
var main: Node
var worker: Dictionary
var target: Dictionary
var checks := 0
var failures: Array = []

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, expectation: String, observed: Variant = null) -> void:
	checks += 1
	if not condition: failures.append({"expected": expectation, "observed": observed})

func near(actual: float, expected: float, expectation: String) -> void:
	check(absf(actual-expected) < 0.00001, expectation, {"actual": actual, "expected": expected})

func fixture(kind: String = "howitzer", hp: float = 35.0, crystal: int = 100, aether: int = 100) -> void:
	sim.reset_state(42, 128, 96)
	sim.match_state = {"mode": "auto_repair_contract"}
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	sim.players[1].crystal = crystal
	sim.players[1].aether = aether
	worker = sim.spawn_unit("pioneer", 1, Vector2(36.5, 40))
	target = sim.spawn_unit(kind, 1, Vector2(40, 40))
	target.hp = hp
	sim.issue_command([target.tag], "hold_position")
	sim.battle_stats.begin(sim.units, sim.tick)

func toggle(state: String = "") -> Dictionary:
	return sim.issue_command([worker.tag], "auto_repair", Vector2.ZERO, 0, state)

func money(crystal: int, aether: int, expectation: String) -> void:
	check(sim.players[1].crystal == crystal and sim.players[1].aether == aether, expectation, [sim.players[1].crystal, sim.players[1].aether])

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	main = load("res://scripts/RTSMain.gd").new()
	root.add_child(main)
	_paid_idle_work()
	_target_selection_and_range()
	_manual_orders_win()
	_toggle_and_groups()
	_budgets_and_shared_costs()
	print(JSON.stringify({"suite": "auto_repair", "checks": checks, "failures": failures}))
	main.queue_free()
	quit(0 if failures.is_empty() else 1)

func _paid_idle_work() -> void:
	fixture()
	check(not worker.auto_repair_enabled, "Auto Repair defaults off")
	sim.step_ticks(64)
	near(target.hp, 35, "Disabled idle Pioneer never repairs or spends automatically")
	money(100, 100, "Default-off stance preserves both resources")
	var result := toggle()
	check(result.accepted == 1 and result.enabled and worker.orders.is_empty(), "Toggle enables future idle work without injecting a manual command")
	money(100, 100, "Toggling is free")
	sim.step_ticks(64)
	near(target.hp, 40.46875, "Idle auto repair restores exactly 175/32 HP per second")
	money(98, 99, "Automatic first second spends exactly two crystal and one aether")
	check(worker.orders[0].type == "repair" and worker.orders[0].automatic, "Acquired repair is explicitly marked automatic")
	sim.step_ticks(25*64)
	near(target.hp, 175, "Automatic repair reaches full HP within 26 seconds")
	money(70, 75, "Automatic 140 HP restoration costs exactly 30 crystal and 25 aether")
	check(worker.orders.is_empty() and worker.auto_repair_enabled, "Completion leaves Pioneer idle with its toggle enabled")
	sim.step_ticks(10*64)
	near(target.hp, 175, "Enabled Pioneer never overheals a full target")
	money(70, 75, "Enabled stance costs nothing with no damage nearby")
	target.hp = 170
	sim.step_ticks(2*64)
	near(target.hp, 175, "Idle Pioneer detects fresh damage without another command")
	money(68, 74, "Later automatic repair preserves the cumulative fractional ledger")
	near(sim.battle_stats.records[worker.tag].hp_repaired, 145, "Telemetry includes actual automatic work")
	near(sim.battle_stats.records[worker.tag].repair_crystal_spent, 32, "Automatic spending appears in worker telemetry")

func _target_selection_and_range() -> void:
	fixture()
	var silo: Dictionary = sim.spawn_unit("silo", 1, Vector2(40, 48))
	silo.hp = 200
	toggle()
	sim.step_ticks(1)
	check(worker.orders[0].target_tag == target.tag, "Nearest eligible target is acquired first")
	near(silo.hp, 200, "Farther eligible target remains untouched while nearest is being repaired")
	sim.step_ticks(42*64)
	near(target.hp, 175, "First target completes")
	near(silo.hp, 400, "Worker automatically retargets a second damaged building")
	money(57, 75, "Two completed targets charge 30+13 crystal and 25 aether")
	for invalid in ["removed", "enemy", "full"]:
		fixture()
		var backup: Dictionary = sim.spawn_unit("silo", 1, Vector2(40, 48))
		backup.hp = 200
		toggle()
		sim.step_ticks(1)
		match invalid:
			"removed": sim.units.erase(target.tag)
			"enemy": target.owner = 2
			"full": target.hp = 175
		sim.step_ticks(32)
		check(not worker.orders.is_empty() and worker.orders[0].target_tag == backup.tag, "Automatic worker releases invalidated target and finds a new friendly building: " + invalid)
	fixture()
	worker.pos = Vector2(40, 40)
	target.pos = Vector2(36.5, 40)
	var tied: Dictionary = sim.spawn_unit("howitzer", 1, Vector2(43.5, 40))
	tied.hp = 35
	sim.issue_command([tied.tag], "hold_position")
	toggle()
	sim.step_ticks(1)
	check(worker.orders[0].target_tag == target.tag, "Equal-distance targets break ties by tag deterministically")
	near(tied.hp, 35, "Tie selection does not work on both targets in one tick")
	for kind in ["rifleman", "brood_nest", "howitzer", "silo", "pioneer"]:
		fixture(kind, 10)
		if kind == "howitzer": target.owner = 2
		if kind == "silo": target.build_progress = 0.5
		if kind == "pioneer":
			target.hp = target.max_hp
			worker.hp = 10
		# Prevent an enemy unit from obscuring eligibility with combat.
		if kind == "howitzer": target.pos = Vector2(48, 40)
		toggle()
		sim.step_ticks(1)
		check(worker.orders.is_empty(), "Auto acquisition rejects biological/enemy/foundation/self targets: " + kind)
		money(100, 100, "Ineligible target never charges: " + kind)
	fixture()
	target.pos = Vector2(49.2, 40) # 10.1 edge distance; just outside the 10-unit area.
	toggle()
	sim.step_ticks(64)
	check(worker.orders.is_empty(), "Targets just beyond ten edge units are not acquired")
	near(target.hp, 35, "Outside target receives no free work")
	money(100, 100, "Outside target costs nothing")
	sim.issue_command([target.tag], "move", Vector2(40, 40))
	sim.step_ticks(20)
	check(not worker.orders.is_empty() and worker.orders[0].automatic, "A target entering the idle area is detected within a bounded scan interval")
	fixture()
	target.pos = Vector2(49, 40) # 9.9 edge distance.
	toggle()
	sim.step_ticks(1)
	check(worker.orders[0].target_tag == target.tag and worker.get("repair_state") == "moving", "Target just inside range causes approach")
	near(target.hp, 35, "Acquisition range does not bypass 1.6 work range")
	money(100, 100, "Approach remains free")
	fixture()
	toggle()
	sim.step_ticks(1)
	sim.issue_command([target.tag], "move", Vector2(60, 40))
	sim.step_ticks(4*64)
	check(worker.orders.is_empty() and worker.auto_repair_enabled and worker.pos.x < 50, "Automatic work drops targets leaving its original idle area instead of chasing across the map")
	var hp: float = target.hp
	var crystal: int = sim.players[1].crystal
	var aether: int = sim.players[1].aether
	sim.step_ticks(8*64)
	near(target.hp, hp, "Worker does not reacquire an escaped target from a drifting search center")
	money(crystal, aether, "Escaped targets stop automatic spending")

func _manual_orders_win() -> void:
	for queued in [false, true]:
		fixture()
		toggle()
		sim.step_ticks(64)
		check(sim.issue_command([worker.tag], "move", Vector2(20, 40), 0, "", queued).accepted == 1, "Manual move accepted while auto repairing; Shift=" + str(queued))
		check(worker.orders.size() == 1 and worker.orders[0].type == "move", "Even Shift move immediately takes priority over automatic work")
		sim.step_ticks(64)
		near(target.hp, 40.46875, "Movement cannot be stolen by Auto Repair")
		money(98, 99, "No charges during manual movement")
		check(worker.auto_repair_enabled and worker.pos.x < 32, "Manual movement preserves enabled stance for later idle work")
	fixture()
	var distant: Dictionary = sim.spawn_unit("silo", 1, Vector2(80, 40))
	distant.hp = 200
	toggle()
	sim.issue_command([worker.tag], "move", Vector2(77, 40))
	sim.step_ticks(22*64)
	near(target.hp, 35, "Pioneer does not stop mid-move for an old nearby target")
	near(distant.hp, 400, "After a manual move finishes, idle acquisition uses the new location")
	money(87, 100, "Only work in the new area is billed")
	for command in ["hold_position", "harvest", "build_silo"]:
		fixture()
		var resource: Dictionary = sim.spawn_resource("crystal_field", Vector2(30, 40), 1500)
		sim.spawn_unit("colony_hub", 1, Vector2(20, 40))
		var pos: Vector2 = Vector2(60, 40) if command == "build_silo" else resource.pos
		check(sim.issue_command([worker.tag], command, pos, resource.tag).accepted == 1, "Busy fixture accepts " + command)
		var before: Array = worker.orders.duplicate(true)
		toggle()
		check(worker.orders == before and worker.auto_repair_enabled, "Toggle preserves current order and queue: " + command)
		sim.step_ticks(64)
		near(target.hp, 35, "Auto Repair never steals hold/gather/construction work: " + command)
		near(target.get("repair_hp_total", 0), 0, "Busy worker does no repair work: " + command)
		toggle("off")
		check(not worker.auto_repair_enabled and not worker.orders.is_empty() and worker.orders[0].type != "repair", "Toggle off also preserves busy work: " + command)
	fixture()
	sim.issue_command([worker.tag], "move", Vector2(32, 40))
	sim.issue_command([worker.tag], "move", Vector2(20, 40), 0, "", true)
	var queue: Array = worker.orders.duplicate(true)
	toggle()
	check(worker.orders == queue, "Enabling stance preserves an existing multi-order queue")
	var visited := false
	for _tick in range(4*64):
		sim.step_ticks(1)
		visited = visited or worker.pos.distance_to(Vector2(32, 40)) < 3
	check(visited and worker.pos.distance_to(Vector2(20, 40)) < 3, "Both manual waypoints finish before automatic acquisition")
	near(target.hp, 35, "Queued waypoints are not diverted to repair nearby damage")
	money(100, 100, "Executing the preserved queue spends no repair resources")
	fixture()
	sim.issue_command([worker.tag], "repair", target.pos, target.tag)
	toggle("on")
	toggle("off")
	check(worker.orders.size() == 1 and not worker.orders[0].get("automatic", false), "Turning off stance preserves explicitly ordered repair")
	sim.step_ticks(64)
	near(target.hp, 40.46875, "Manual repair continues after toggle off")
	money(98, 99, "Preserved manual repair is still paid")
	fixture()
	toggle()
	sim.step_ticks(64)
	toggle()
	check(not worker.auto_repair_enabled and worker.orders.is_empty(), "Turning off cancels the current automatic order immediately")
	sim.step_ticks(5*64)
	near(target.hp, 40.46875, "Toggle off stops automatic healing")
	money(98, 99, "Toggle off stops automatic spending")
	toggle()
	sim.step_ticks(64)
	near(target.hp, 45.9375, "Toggle on resumes paid work without losing fractional credit")
	money(97, 98, "Toggle cycle uses cumulative price, not a fresh rounded fee")
	sim.issue_command([worker.tag], "stop")
	check(not worker.auto_repair_enabled and worker.orders.is_empty(), "Halt disables automatic reacquisition as well as clearing work")
	sim.step_ticks(5*64)
	near(target.hp, 45.9375, "Explicit Halt is respected while the Pioneer remains idle")
	money(97, 98, "Halt prevents renewed automatic spending")

func _toggle_and_groups() -> void:
	fixture()
	var other: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(40, 36.5))
	var rifle: Dictionary = sim.spawn_unit("rifleman", 1, Vector2(30, 36))
	toggle("on")
	main._select_tags([worker.tag, other.tag, rifle.tag])
	var button: Dictionary = main.get_card_buttons().filter(func(b): return b.ability_id == "auto_repair")[0]
	check(button.toggle_state == "Mixed" and button.def.hotkey == "T", "Mixed Pioneer selection exposes a clear toggle state and T hotkey")
	var key := InputEventKey.new()
	key.keycode = KEY_T
	key.pressed = true
	main._handle_hotkey(key)
	check(worker.auto_repair_enabled and other.auto_repair_enabled and not rifle.auto_repair_enabled, "Mixed group hotkey enables all selected Pioneers and leaves nonworkers alone")
	button = main.get_card_buttons().filter(func(b): return b.ability_id == "auto_repair")[0]
	check(button.toggle_state == "On" and button.def.name == "Auto Repair: On", "Card updates to On for an enabled group")
	main._trigger_card_button(button)
	check(not worker.auto_repair_enabled and not other.auto_repair_enabled, "Clicking an enabled group toggle disables every Pioneer")
	check(root.get_node("RTSData").get_ability_def("auto_repair").name == "Auto Repair: Off", "Dynamic button names never mutate registry data")
	check(sim.issue_command([rifle.tag], "auto_repair").accepted == 0, "Non-Pioneers cannot enable Auto Repair")
	worker.hp = 0
	check(toggle().accepted == 0 and not worker.auto_repair_enabled, "Dead Pioneers cannot enable Auto Repair")
	fixture()
	worker.build_progress = 0.5
	check(toggle().accepted == 0, "Incomplete Pioneers cannot enable Auto Repair")
	fixture()
	check(toggle("invalid").accepted == 0 and not worker.auto_repair_enabled, "Invalid stance value has no side effects")
	toggle("on")
	sim.step_ticks(1)
	var before: Array = worker.orders.duplicate(true)
	toggle("on")
	check(worker.orders == before and worker.auto_repair_enabled, "Explicit on is idempotent and preserves current automatic work")
	sim.reset_state()
	var fresh: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(36.5, 40))
	check(not fresh.auto_repair_enabled, "A new scenario does not inherit old toggle state")

func _budgets_and_shared_costs() -> void:
	fixture("howitzer", 35, 0, 0)
	toggle()
	sim.step_ticks(128)
	near(target.hp, 35, "Automatic repair cannot heal for free with zero resources")
	check(worker.get("repair_state") == "resources" and worker.orders[0].automatic, "Unfunded automatic repair waits without losing its target")
	money(0, 0, "Auto Repair never creates negative balances")
	sim.players[1].crystal = 100
	sim.players[1].aether = 100
	sim.step_ticks(64)
	near(target.hp, 40.46875, "New funds resume automatic work")
	money(98, 99, "Resumed automatic work pays exact rate")
	fixture("howitzer", 35, 3, 100)
	toggle()
	sim.step_ticks(5*64)
	near(target.hp, 49, "Three crystal cap automatic repair to fourteen HP")
	money(0, 97, "Budget-limited automatic repair spends exact available crystal and required aether")
	fixture()
	var other: Dictionary = sim.spawn_unit("pioneer", 1, Vector2(40, 36.5))
	check(sim.issue_command([worker.tag, other.tag], "auto_repair").accepted == 2, "Two Pioneers enable as one group")
	sim.step_ticks(64)
	near(target.hp, 45.9375, "Two automatic repairers stack speed")
	money(97, 98, "Multiple automatic repairers share cumulative rounding")
	sim.step_ticks(13*64)
	near(target.hp, 175, "Automatic group completes repair without overheal")
	money(70, 75, "Automatic group pays the same 30/25 total as one worker")
