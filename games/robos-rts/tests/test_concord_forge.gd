extends SceneTree

var sim: Node
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	sim._load_skirmish({"watch_ai": true, "online": true, "seed": 3, "player_faction": "aliens", "ai_faction": "humans",
		"unlimited_resources": false, "map": {"width": 256, "height": 128, "starts": [{"x": 50, "y": 45}, {"x": 205, "y": 45}]}})
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	for unit in sim.units.values():
		if unit.is_worker:
			sim.issue_command([unit.tag], "stop")
	var bank: Dictionary = sim.players[1]
	bank.crystal = 1100
	bank.aether = 1000
	var hall := _find("heartstone")
	var mote := _find("mote")
	var base: Vector2 = hall.pos
	var pylon: Dictionary = sim.spawn_unit("resonator", 1, base + Vector2(0, 12))
	var forge_site := base + Vector2(-8, 13)
	var relay_site := Vector2.INF
	for offset in [Vector2(8, 13), Vector2(7, 19), Vector2(12, 13), Vector2(6, 22)]:
		var candidate: Vector2 = base + offset
		if sim.can_place_structure("aegis_relay", candidate):
			relay_site = candidate
			break
	if not relay_site.is_finite():
		_check(false, "Forge fixture has a clear Relay site")
		_finish()
		return
	sim._refresh_vision()
	_check(not sim.issue_command([mote.tag], "build_aegis_relay", relay_site).ok, "Relay requires a completed Forge")
	_check(sim.issue_command([mote.tag], "build_prism_forge", forge_site).ok, "Mote can start powered Forge construction")
	sim.step_ticks(40 * sim.TICK_RATE)
	var forge := _find("prism_forge")
	if forge.is_empty() or forge.build_progress < 1.0:
		_check(false, "Forge completes at the build site")
		_finish()
		return
	_check(bank.crystal == 950, "Forge costs 150 crystal")
	_check(sim.issue_command([mote.tag], "build_aegis_relay", relay_site).ok, "Completed Forge unlocks Relay")
	_check(sim.issue_command([forge.tag], "research_concord_shields").ok
		and sim.issue_command([forge.tag], "research_concord_ground_armor").ok
		and sim.issue_command([forge.tag], "research_concord_ground_weapons").ok, "Forge queues all three paid research tracks")
	for i in range(3):
		sim.step_ticks(ceili(121.429 * sim.TICK_RATE))
	var relay := _find("aegis_relay")
	if relay.is_empty() or relay.build_progress < 1.0:
		_check(false, "Relay completes at the build site")
		_finish()
		return
	_check(bank.crystal == 450 and bank.aether == 650, "Relay and each level one research cost the ladder amounts")
	_check(not sim.issue_command([forge.tag], "research_concord_shields").ok, "Level two requires a Twilight Array")
	sim.spawn_unit("twilight_array", 1, base + Vector2(0, 22))
	_check(sim.issue_command([forge.tag], "research_concord_shields").ok and bank.aether == 450, "Twilight unlocks level two at 200 aether")
	var sunblade: Dictionary = sim.spawn_unit("sunblade", 1, base + Vector2(-5, 3))
	var air: Dictionary = sim.spawn_unit("kestrel_interceptor", 2, relay.pos + Vector2(11, 0))
	sim.step_ticks(24)
	_check(air.hp < air.max_hp and relay.armed_structure and not relay.has("support"), "The ladder Relay attacks air and leaves shield restoration to the Capacitor")
	var healthy: float = sunblade.hp
	sunblade.shields = 2.0
	sim._apply_damage_to_target(air, sunblade, 10.0, {}, 1.0)
	_check(sunblade.shields == 0.0 and sunblade.hp == healthy - 5.0, "Shield armor applies before overflow and ground armor reduces HP damage")
	_check(sim.unit_upgrade_level(relay, "shields") == 1 and sim.unit_upgrade_level(relay, "armor") == 0
		and sim.unit_upgrade_level(sunblade, "weapons") == 1, "Shield upgrades cover structures and ground upgrades cover infantry")
	sim._remove_destroyed_unit(pylon)
	var last_hp: float = air.hp
	var progress: float = forge.production_queue[0].progress
	sim.step_ticks(sim.TICK_RATE)
	_check(air.hp == last_hp and forge.production_queue[0].progress == progress, "Losing power disables Relay attacks and Forge research")
	sim.spawn_unit("resonator", 1, base + Vector2(0, 12))
	sim.step_ticks(ceili(144.643 * sim.TICK_RATE))
	_check(bank.upgrades.get("concord_shields", 0) == 2, "Power restores queued research and completes level two")
	_check(sim.issue_command([forge.tag], "research_concord_shields").ok and bank.aether == 200, "Level three costs 250 aether")
	sim.step_ticks(ceili(167.857 * sim.TICK_RATE))
	_check(sim.unit_upgrade_level(relay, "shields") == 3 and not sim.issue_command([forge.tag], "research_concord_shields").ok,
		"Shield armor stops at three completed levels")
	_finish()

func _find(kind: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.owner == 1 and unit.unit_type == kind:
			return unit
	return {}

func _check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _finish() -> void:
	print("Concord Forge checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
