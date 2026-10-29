extends SceneTree

var failures: Array = []
var sim: Node

func _initialize() -> void:
	call_deferred("_run")

func _fixture(stim: bool = false) -> Dictionary:
	sim.reset_state(42, 96, 64)
	var shooter = sim.spawn_unit("rifleman", 1, Vector2(40, 32))
	var target = sim.spawn_unit("rifleman", 2, Vector2(50, 32))
	for u in [shooter, target]:
		u.hp = 10000.0
		u.max_hp = 10000.0
	target.weapon_cooldown = 10000.0
	sim.issue_command([target.tag], "hold_position")
	if stim:
		sim.issue_command([shooter.tag], "surge")
	sim.issue_command([shooter.tag], "attack_target", target.pos, target.tag)
	return {"shooter": shooter, "target": target}

func _cadence(stim: bool) -> float:
	var f = _fixture(stim)
	sim.step_ticks(512)
	var shots: Array = sim.recent_events.filter(func(e): return e.type == "weapon_fire" and e.attacker_tag == f.shooter.tag)
	var cadence = float(shots.back().tick - shots.front().tick) * sim.TICK_DT / float(shots.size() - 1)
	var expected = 0.61 / (1.5 if stim else 1.0)
	if absf(cadence - expected) > sim.TICK_DT:
		failures.append("Wrong shot-to-shot interval: %.5f vs %.5f" % [cadence, expected])
	return cadence

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	var normal = _cadence(false)
	var surge = _cadence(true)
	var f = _fixture()
	sim.step_ticks(1)
	if f.target.hp != 10000.0 or f.shooter.attack_state != "windup":
		failures.append("Damage applied before the wind-up")
	sim.issue_command([f.shooter.tag], "move", Vector2(35, 32))
	sim.step_ticks(5)
	if f.target.hp != 10000.0 or f.shooter.weapon_cooldown > 0.0:
		failures.append("Cancel before damage must not fire or consume the weapon cooldown")
	f = _fixture()
	while f.target.hp == 10000.0:
		sim.step_ticks(1)
	if f.target.hp != 9994.0:
		failures.append("Hitscan must apply exactly six damage at the damage point")
	var cooldown = f.shooter.weapon_cooldown
	var position: Vector2 = f.shooter.pos
	sim.issue_command([f.shooter.tag], "move", Vector2(35, 32))
	sim.step_ticks(4)
	if f.shooter.pos.distance_to(position) < 0.1 or f.shooter.weapon_cooldown >= cooldown or f.shooter.weapon_cooldown <= 0.0:
		failures.append("Movement must cancel recovery while cooldown keeps running")
	# Armor reduces each hit; it cannot reduce damage below half a hit point.
	f = _fixture()
	f.target.armor = 100.0
	while f.target.hp == 10000.0:
		sim.step_ticks(1)
	if f.target.hp != 9999.5:
		failures.append("Minimum damage must be 0.5")
	print(JSON.stringify({"normal_interval": normal, "surge_interval": surge, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
