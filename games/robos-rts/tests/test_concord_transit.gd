extends SceneTree

const Rules = preload("res://scripts/engine/RTSLadderRules.gd")
const TICKS := 64

var failures: Array[String] = []
var sim: Node

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	sim = root.get_node("SimEngine")
	sim.rts_mode = "backend"
	sim._load_skirmish({
		"watch_ai": true, "online": true, "seed": 3, "player_faction": "aliens", "ai_faction": "humans",
		"unlimited_resources": false, "map": {"width": 256, "height": 128,
			"starts": [{"x": 50, "y": 45}, {"x": 205, "y": 45}]},
	})
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	for unit in sim.units.values():
		if unit.is_worker:
			sim.issue_command([unit.tag], "stop")
	var hall := _owned("heartstone")
	var base: Vector2 = hall.pos
	var pylon: Dictionary = sim.spawn_unit("resonator", 1, base + Vector2(0, 10))
	var gate: Dictionary = sim.spawn_unit("waystone", 1, base + Vector2(10, 11))
	var mote := _owned("mote")
	var core_site := base + Vector2(-8, 13)
	var bank: Dictionary = sim.players[1]
	bank.crystal = 850
	bank.aether = 500
	sim._refresh_vision()
	_check(not sim.issue_command([gate.tag], "train_skirmisher").ok, "Skirmisher requires a completed Concord Core")
	_check(not sim.issue_command([gate.tag], "open_transit").ok, "Transit mode requires research")
	_check(sim.issue_command([mote.tag], "build_concord_core", core_site).ok, "Mote can summon the Core")
	for step in range(600):
		if not _owned("concord_core").is_empty():
			break
		sim.step_ticks(1)
	var core := _owned("concord_core")
	if core.is_empty():
		_check(false, "The Core construction starts")
		_finish()
		return
	_check(bank.crystal == 700 and sim.units.has(mote.tag), "The paid Core preserves its Mote")
	var build_ticks := 50 * TICKS
	sim.step_ticks(build_ticks - 1)
	_check(core.build_progress < 1.0, "Core does not finish early")
	sim.step_ticks(1)
	_check(core.build_progress == 1.0, "Core completes at its full ladder build time")
	_check(sim.issue_command([core.tag], "research_transit").ok and bank.crystal == 650 and bank.aether == 450,
		"Research is paid once at the Concord Core")
	_check(sim.issue_command([hall.tag], "production_boost", core.pos, core.tag).ok, "Heartstone can boost Core research")
	sim.step_ticks(20 * TICKS)
	_check(is_equal_approx(float(core.production_queue[0].progress), 30.0), "Twenty seconds of boost advances thirty seconds of research")
	sim._remove_destroyed_unit(pylon)
	sim.step_ticks(TICKS)
	_check(core.production_queue[0].progress == 30.0, "Unpowered research pauses")
	sim.spawn_unit("resonator", 1, base + Vector2(0, 10))
	sim.step_ticks(70 * TICKS)
	_check(bank.upgrades.get("transit", 0) == 1, "Research resumes after power is restored")
	var original_tag: int = gate.tag
	_check(sim.issue_command([gate.tag], "open_transit").ok, "Waystone begins a zero-cost transformation")
	_check(not sim.issue_command([gate.tag], "train_sunblade").ok, "Transforming Waystone cannot train")
	var morph_ticks := ceili(Rules.TRANSIT_MORPH_SECONDS * TICKS)
	sim.step_ticks(morph_ticks - 1)
	_check(gate.unit_type == "waystone", "Transit mode does not activate early")
	sim.step_ticks(1)
	_check(gate.unit_type == "transit_waystone" and gate.tag == original_tag and bank.crystal == 650,
		"Waystone keeps its identity and switches mode on schedule")

	var fast_site := base + Vector2(0, 17)
	var slow_pylon: Dictionary = sim.spawn_unit("resonator", 1, base + Vector2(0, 48))
	var slow_site := base + Vector2(5, 48)
	sim._refresh_vision()
	_check(sim.transit_field_time(1, fast_site) == Rules.TRANSIT_FAST_SECONDS
		and sim.transit_field_time(1, slow_site) == Rules.TRANSIT_SLOW_SECONDS, "Fast and isolated fields use separate ladder durations")
	var supply_before: float = bank.supply_used
	_check(sim.issue_command([gate.tag], "transit_sunblade", fast_site).ok, "Transit accepts visible, powered ground")
	var projection := _owned("sunblade")
	if projection.is_empty():
		_check(false, "Deployment creates a targetable projection")
		_finish()
		return
	_check(projection.pos == fast_site and projection.has("transit_finish") and bank.supply_used == supply_before + 2 and bank.crystal == 550,
		"Deployment creates a paid, supply-using projection at the target")
	_check(not sim.issue_command([projection.tag], "move", fast_site + Vector2(5, 0)).ok, "Projection cannot move before it materializes")
	_check(not sim.issue_command([gate.tag], "transit_skirmisher", slow_site).ok, "A gate shares cooldown across its unit offers")
	var fast_ticks := ceili(Rules.TRANSIT_FAST_SECONDS * TICKS)
	sim.step_ticks(fast_ticks - 1)
	_check(projection.has("transit_finish"), "Fast deployment remains a projection before its deadline")
	sim.step_ticks(1)
	_check(not projection.has("transit_finish") and projection.build_progress == 1.0, "Fast deployment finishes at the target")
	sim.step_ticks(28 * TICKS - fast_ticks)
	_check(sim.issue_command([gate.tag], "transit_skirmisher", slow_site).ok, "The gate recharges after twenty-eight seconds")
	var second := _owned("skirmisher")
	_check(not second.is_empty() and second.get("transit_finish", 0) - sim.tick == ceili(Rules.TRANSIT_SLOW_SECONDS * TICKS),
		"An isolated field uses the full slow warp-in time")
	sim._remove_destroyed_unit(slow_pylon)
	sim.step_ticks(1)
	_check(not second.is_empty() and not sim.units.has(second.tag), "A projection collapses when its supporting power is lost")
	_check(sim.issue_command([gate.tag], "close_transit").ok, "Transit Waystone can return to normal production")
	sim.step_ticks(morph_ticks)
	_check(gate.unit_type == "waystone" and gate.tag == original_tag, "The reverse transformation completes in place")
	_test_energy_recharge(hall)
	_test_ladder_recall(hall)
	_test_concord_support_tech(hall)
	_finish()

func _test_concord_support_tech(hall: Dictionary) -> void:
	# Start the isolated research checks before the scripted idle economy draws.
	sim._ladder_last_progress_tick = sim.tick
	var base: Vector2 = hall.pos
	var capacitor: Dictionary = sim.spawn_unit("aegis_capacitor", 1, base + Vector2(-9, 19))
	var remote: Dictionary = sim.spawn_unit("aegis_capacitor", 1, base + Vector2(-5, 51))
	_check(capacitor.energy == 100.0 and remote.energy == 50.0 and capacitor.auto_aegis,
		"Capacitors start with location-dependent energy and autocast")
	_check(sim.issue_command([capacitor.tag], "auto_aegis").ok and not capacitor.auto_aegis, "Restore autocast can be turned off")
	var sunblade: Dictionary = sim.spawn_unit("sunblade", 1, base + Vector2(-16, 21))
	var victim: Dictionary = sim.spawn_unit("rifleman", 2, base + Vector2(-25, 23))
	var skirmisher: Dictionary = sim.spawn_unit("skirmisher", 1, base + Vector2(15, 13))
	var array: Dictionary = sim.spawn_unit("twilight_array", 1, base + Vector2(6, 19))
	sim._refresh_vision()
	sunblade.shields = 0.0
	sunblade.out_of_combat_timer = 0.0
	_check(sim.issue_command([capacitor.tag], "restore_aegis", sunblade.pos, sunblade.tag).ok,
		"Manual restore works with autocast off")
	sim.step_ticks(1)
	_check(is_equal_approx(sunblade.shields, 50.4 / TICKS) and is_equal_approx(capacitor.energy, 100.0 - 50.4 / (3 * TICKS)),
		"Restore uses the ladder rate and restores three shields per energy")
	_check(not sim.issue_command([sunblade.tag], "charge", victim.pos, victim.tag).ok,
		"Charge is gated by research")
	var blink_site: Vector2 = skirmisher.pos + Vector2(8, 4)
	_check(not sim.issue_command([skirmisher.tag], "phase_step", blink_site).ok, "Phase Step is gated by research")
	_check(not sim.issue_command([skirmisher.tag], "phase_cloak").ok, "Ladder Skirmishers cannot cloak")
	sim._remove_destroyed_unit(victim)
	var bank: Dictionary = sim.players[1]
	bank.crystal = 350
	bank.aether = 350
	_check(sim.issue_command([array.tag], "research_charge").ok and sim.issue_command([array.tag], "research_phase_step").ok
		and bank.crystal == 100 and bank.aether == 100, "Twilight Array accepts both paid research orders")
	sim.step_ticks(100 * TICKS - 1)
	_check(not bank.upgrades.get("charge", 0), "Charge research has the full ladder duration")
	sim.step_ticks(1)
	_check(bank.upgrades.get("charge", 0) == 1 and is_equal_approx(sunblade.speed, Rules.SUNBLADE_UPGRADED_SPEED),
		"Charge research increases the speed of existing Sunblades")
	sim.step_ticks(ceili(121.429 * TICKS))
	_check(bank.upgrades.get("phase_step", 0) == 1, "Phase Step completes second")
	var prior: Vector2 = skirmisher.pos
	_check(not sim.issue_command([skirmisher.tag], "phase_step", prior + Vector2(21, 0)).ok, "Phase Step rejects a target beyond range")
	blink_site = prior + Vector2(8, 4)
	_check(sim.issue_command([skirmisher.tag], "phase_step", blink_site).ok and skirmisher.pos == blink_site,
		"Researched Phase Step lands at the selected clear point")
	_check(not sim.issue_command([skirmisher.tag], "phase_step", prior).ok, "Phase Step has a cooldown")
	var first: Dictionary = sim.spawn_unit("skirmisher", 1, base + Vector2(18, 4))
	var second: Dictionary = sim.spawn_unit("skirmisher", 1, base + Vector2(19, 8))
	var group_site := base + Vector2(25, 6)
	sim._refresh_vision()
	_check(sim.issue_command([first.tag, second.tag], "phase_step", group_site).accepted == 2
		and first.pos == group_site and first.pos.distance_to(second.pos) >= first.radius + second.radius,
		"Group Phase Step assigns distinct clear landing points")
	var fighter: Dictionary = sim.spawn_unit("sunblade", 1, base + Vector2(-21, -17))
	var enemy: Dictionary = sim.spawn_unit("rifleman", 2, fighter.pos + Vector2(8, 0))
	sim._refresh_vision()
	_check(is_equal_approx(fighter.speed, Rules.SUNBLADE_UPGRADED_SPEED) and fighter.auto_charge,
		"New Sunblades inherit the speed upgrade and start with autocast")
	_check(sim.issue_command([fighter.tag], "auto_charge").ok and not fighter.auto_charge,
		"Charge autocast can be turned off")
	_check(sim.issue_command([fighter.tag], "charge", enemy.pos, enemy.tag).ok
		and is_equal_approx(sim.effective_move_speed(fighter), Rules.CHARGE_SPEED),
		"Manual Charge commits a nearby ground target and reaches the ladder dash speed")
	_check(not sim.issue_command([fighter.tag], "charge", enemy.pos, enemy.tag).ok, "Charge respects its cooldown")

func _test_energy_recharge(hall: Dictionary) -> void:
	var base: Vector2 = hall.pos
	var expansion: Dictionary = sim.spawn_unit("heartstone", 1, base + Vector2(70, 0))
	var warden: Dictionary = sim.spawn_unit("aegis_warden", 1, expansion.pos + Vector2(25, 0))
	var distant: Dictionary = sim.spawn_unit("aegis_warden", 1, expansion.pos + Vector2(31, 0))
	var rival: Dictionary = sim.spawn_unit("aegis_warden", 2, expansion.pos + Vector2(24, 4))
	sim.step_ticks(1)
	hall.energy = 100.0
	warden.energy = 25.0
	distant.energy = 25.0
	rival.energy = 25.0
	_check(not sim.issue_command([hall.tag], "energy_recharge", distant.pos, distant.tag).ok,
		"Energy Recharge checks distance to the closest completed Heartstone")
	_check(not sim.issue_command([hall.tag], "energy_recharge", rival.pos, rival.tag).ok and hall.energy == 100.0,
		"Out-of-range and enemy targets leave the caster's energy intact")
	_check(sim.issue_command([hall.tag], "energy_recharge", warden.pos, warden.tag).ok
		and warden.energy == 75.0 and hall.energy == 50.0, "Energy Recharge spends fifty and grants fifty at another friendly base")
	_check(not sim.issue_command([expansion.tag], "energy_recharge", warden.pos, warden.tag).ok,
		"The cooldown is shared across Heartstones")
	sim.step_ticks(Rules.ENERGY_RECHARGE_SECONDS * TICKS - 1)
	_check(sim.energy_recharge_ticks(1) == 1, "The cooldown lasts the full forty-five seconds")
	sim.step_ticks(1)
	warden.energy = warden.energy_profile.max - 10.0
	_check(sim.issue_command([expansion.tag], "energy_recharge", warden.pos, warden.tag).ok and warden.energy == warden.energy_profile.max,
		"The second cast caps at the target's maximum energy")

func _test_ladder_recall(hall: Dictionary) -> void:
	var site: Vector2 = hall.pos + Vector2(0, 35)
	var troop: Dictionary = sim.spawn_unit("sunblade", 1, site)
	var outside: Dictionary = sim.spawn_unit("sunblade", 1, site + Vector2(7, 0))
	var rival: Dictionary = sim.spawn_unit("rifleman", 2, site + Vector2(30, 0))
	var alternate: Dictionary = sim.spawn_unit("heartstone", 1, hall.pos + Vector2(45, 0))
	sim._refresh_vision()
	hall.energy = 100.0
	_check(sim.issue_command([hall.tag], "defensive_recall", site).ok and hall.energy == 50.0, "Defensive Recall costs fifty energy")
	_check(troop.has("recall_channel") and not outside.has("recall_channel"), "Recall locks units inside the ladder radius")
	_check(not sim.issue_command([troop.tag], "move", site + Vector2(0, 12)).ok, "Channeling units cannot take movement orders")
	var shields: float = troop.shields
	sim._apply_damage_to_target(rival, troop, 7.0, {}, 1.0)
	_check(troop.shields < shields, "Recall channeling units remain vulnerable")
	var channel_ticks := Rules.RECALL_CHANNEL_SECONDS * TICKS
	sim.step_ticks(channel_ticks - 1)
	_check(troop.pos == site and troop.has("recall_channel"), "Recall takes four full seconds")
	sim.step_ticks(1)
	_check(troop.pos.distance_to(hall.pos) < 14.0 and not troop.is_immobile, "Recalled units can act after landing")
	_check(outside.pos.distance_to(site) >= 6.25, "Units outside the circle stay in place")
	shields = troop.shields
	sim._apply_damage_to_target(rival, troop, 7.0, {}, 1.0)
	_check(troop.shields == shields, "Units are protected right after landing")
	sim.step_ticks(ceili(Rules.RECALL_ARRIVAL_PROTECTION_SECONDS * TICKS))
	sim._apply_damage_to_target(rival, troop, 7.0, {}, 1.0)
	_check(troop.shields < shields, "Arrival protection expires")
	_check(not sim.issue_command([alternate.tag], "defensive_recall", troop.pos).ok, "All Heartstones share the recall cooldown")
	var cooldown: int = sim.defensive_recall_cooldown_ticks(1)
	sim.step_ticks(cooldown)
	_check(sim.issue_command([alternate.tag], "defensive_recall", troop.pos).ok, "Recall can be cast again after the shared cooldown")
	sim._remove_destroyed_unit(alternate)
	sim.step_ticks(1)
	_check(not troop.has("recall_channel") and not troop.is_immobile, "Destroying the casting Heartstone releases channeling units")

func _owned(kind: String) -> Dictionary:
	for unit in sim.units.values():
		if unit.owner == 1 and unit.unit_type == kind:
			return unit
	return {}

func _check(ok: bool, label: String) -> void:
	if not ok:
		failures.append(label)

func _finish() -> void:
	print("Concord transit checks: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
