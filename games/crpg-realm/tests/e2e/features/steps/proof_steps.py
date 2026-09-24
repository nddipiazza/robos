"""
proof_steps.py — state-API-backed verification steps.

Each step reads the GameState API and the engine event journal, asserts on the concrete
values, and attaches those values as on-screen evidence via ``proof()`` so the scenario
video shows *why* the step passed.
"""

import math
import time

from behave import then, when

from tests.e2e.proof_helpers import (PX_PER_FOOT, enemy, events, mark, proof, state,
                                     wait_for_event, _get, _post)


def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


# ── Traps ──────────────────────────────────────────────────────────────────────

def _trap(context, trap_id):
    for t in state(context).get("traps", []):
        if t.get("id") == trap_id:
            return t
    raise AssertionError(f"Trap '{trap_id}' not found")


@then('the trap "{trap_id}" is armed and highlighted on the map')
def step_trap_armed_highlighted(context, trap_id):
    t = _trap(context, trap_id)
    assert t["is_detected"] and not t["is_disarmed"] and not t["is_triggered"], t
    assert t["node_visible"] and t["modulate_alpha"] > 0.3, f"Detected trap should be drawn: {t}"
    assert not t["collision_disabled"] and t["monitoring"], f"Armed trap must still have a live pressure plate: {t}"
    proof(context, f"visible=True alpha={t['modulate_alpha']:.2f} label={t['label_visible']} collision=ON monitoring=ON")


@then('the trap "{trap_id}" vanishes from the map after the disarm flash')
def step_trap_vanishes(context, trap_id):
    dis = wait_for_event(context, "trap_disarmed", lambda e: e.get("trap_id") == trap_id)
    assert dis, "No trap_disarmed event in the engine journal"
    van = wait_for_event(context, "trap_vanished", lambda e: e.get("id") == trap_id, timeout=3.0)
    assert van, "Trap never reported trap_vanished — it is still being drawn"
    t = _trap(context, trap_id)
    for k, want in [("node_visible", False), ("collision_disabled", True), ("monitoring", False),
                    ("input_pickable", False), ("label_visible", False), ("is_appearing_on_map", False)]:
        assert t.get(k) == want, f"Expected {k}={want} for vanished trap, got {t.get(k)}: {t}"
    assert t["modulate_alpha"] <= 0.01, f"Trap glyph should be fully faded, alpha={t['modulate_alpha']}"
    fade_ms = van["t_ms"] - dis["t_ms"]
    proof(context, f"disarmed seq#{dis['seq']} → vanished seq#{van['seq']} after {fade_ms} ms")
    proof(context, "visible=False alpha=0.00 collision=OFF monitoring=OFF clickable=OFF label=hidden")


@when('"{actor}" walks straight across the neutralized trap "{trap_id}"')
def step_walk_across_trap(context, actor, trap_id):
    t = _trap(context, trap_id)
    context.hp_before_walk = state(context).get("hero", {}).get("hp")
    context.walk_mark = mark(context)
    x, y = t["position"]
    res = _post(context.web_port, "/api/v1/action", {"action": "move_to", "args": {"x": x + 70, "y": y}})
    assert res.get("success") is True, res
    time.sleep(0.8)
    res = _post(context.web_port, "/api/v1/action", {"action": "move_to", "args": {"x": x - 10, "y": y}})
    assert res.get("success") is True, res
    for _ in range(40):
        hp = state(context).get("hero", {}).get("position", [0, 0])
        if _dist(hp, [x - 10, y]) < 20:
            break
        time.sleep(0.1)
    context.walk_closest = _dist(state(context).get("hero", {}).get("position", [0, 0]), [x, y])
    time.sleep(0.6)


@then('the trap "{trap_id}" does not fire and the party takes no damage')
def step_trap_did_not_fire(context, trap_id):
    trig = [e for e in events(context, "trap_triggered", context.walk_mark) if e.get("trap_id") == trap_id]
    assert not trig, f"Neutralized trap fired again: {trig}"
    hp_now = state(context).get("hero", {}).get("hp")
    assert hp_now == context.hp_before_walk, f"HP changed {context.hp_before_walk} → {hp_now}"
    proof(context, f"hero passed {context.walk_closest:.0f}px from the plate · trap_triggered events=0 · HP {context.hp_before_walk}→{hp_now}")


@then('the engine restored trap "{trap_id}" as already neutralized')
def step_trap_restored(context, trap_id):
    ev = wait_for_event(context, "trap_restored_neutralized", lambda e: e.get("id") == trap_id)
    assert ev, "No trap_restored_neutralized event after re-entering the area"
    assert ev["previous_state"] == "disarmed" and ev["node_visible"] is False and ev["collision_disabled"] is True, ev
    proof(context, f"re-entry seq#{ev['seq']}: previous_state={ev['previous_state']} visible=False collision=OFF")


# ── Magic Missile ──────────────────────────────────────────────────────────────

@then('{count:d} unerring force darts struck "{enemy_id}"')
def step_darts_struck(context, count, enemy_id):
    since = getattr(context, "cast_mark", context.scenario_event_mark)
    darts = [e for e in events(context, "mm_dart_impact", since) if e.get("target_id") == enemy_id]
    assert len(darts) == count, f"Expected {count} dart impacts on {enemy_id}, journal has {len(darts)}: {darts}"
    for d in darts:
        assert 2 <= d["value"] <= 5, f"Dart value {d['value']} outside 1d4+1"
        assert d["miss_distance_px"] <= 18.0, f"Dart {d['index']} landed {d['miss_distance_px']:.0f}px off target"
    context.mm_darts = darts
    vals = " + ".join(str(d["value"]) for d in darts)
    proof(context, f"{count} impacts on {enemy_id}: {vals} (each 1d4+1) · max miss {max(d['miss_distance_px'] for d in darts):.0f}px")


@then('the damage landed the instant the last dart hit')
def step_damage_instant(context):
    darts = context.mm_darts
    since = getattr(context, "cast_mark", context.scenario_event_mark)
    tid = darts[0]["target_id"]
    dmg = [e for e in events(context, "damage_applied", since) if e.get("target_id") == tid]
    assert dmg, "No damage_applied event for the dart target"
    last_hit = max(d["t_ms"] for d in darts)
    lag = dmg[0]["t_ms"] - last_hit
    assert -5 <= lag <= 250, f"Damage applied {lag} ms after the last dart (was a 2500 ms stall before the fix)"
    res = [e for e in events(context, "spell_resolved", since) if e.get("spell") == "magic-missile"]
    assert res and res[-1]["latency_ms"] < 2000, f"Cast took too long to resolve: {res}"
    proof(context, f"last dart → HP change: {lag} ms · cast→resolved: {res[-1]['latency_ms']} ms (old engine stalled ≥2500 ms)")


@then('enemy "{enemy_id}" lost exactly the sum of the darts')
def step_lost_sum(context, enemy_id):
    since = getattr(context, "cast_mark", context.scenario_event_mark)
    dmg = [e for e in events(context, "damage_applied", since) if e.get("target_id") == enemy_id]
    total = sum(d["value"] for d in context.mm_darts)
    assert dmg and dmg[0]["amount"] == total, f"Expected {total} damage, journal: {dmg}"
    en = enemy(context, enemy_id)
    proof(context, f"{enemy_id} HP {dmg[0]['hp_before']} → {dmg[0]['hp_after']} (−{total}) · now {en['hp']}/{en['max_hp']}"
          + (" · SLAIN" if en.get("state_name") == "DEAD" else ""))


@then('all {count:d} darts splashed off the Shield ward and "{enemy_id}" kept every hit point')
def step_darts_absorbed(context, count, enemy_id):
    since = getattr(context, "cast_mark", context.scenario_event_mark)
    absorbed = [e for e in events(context, "mm_dart_absorbed", since) if e.get("target_id") == enemy_id]
    hits = [e for e in events(context, "mm_dart_impact", since) if e.get("target_id") == enemy_id]
    dmg = [e for e in events(context, "damage_applied", since) if e.get("target_id") == enemy_id]
    assert len(absorbed) == count and not hits and not dmg, f"absorbed={len(absorbed)} hits={len(hits)} dmg={dmg}"
    en = enemy(context, enemy_id)
    assert en["hp"] == en["max_hp"], en
    proof(context, f"absorbed={len(absorbed)} damaging hits=0 damage events=0 · HP {en['hp']}/{en['max_hp']}")


@when('the hero targets "{target_id}" and casts spell "{spell_id}" with proof capture')
def step_cast_with_capture(context, target_id, spell_id):
    context.cast_mark = mark(context)
    res = _post(context.web_port, "/api/v1/action", {"action": "cast_spell", "args": {"spell": spell_id, "target": target_id}}, timeout=18)
    assert res.get("success") is True, res
    context.last_spell_telemetry = res.get("telemetry", {})
    time.sleep(1.2)


# ── Ground hazards (Stinking Cloud / Blizzard ice) ─────────────────────────────

_HAZ_KEY = {"stinking cloud": ("stinking_clouds", "stinking_cloud"), "ice patch": ("ice_patches", "ice_patch"),
            "slippery ice patch": ("ice_patches", "ice_patch")}


def _hazard(context, name):
    key, _ = _HAZ_KEY[name]
    items = state(context).get(key, [])
    assert items, f"No {name} in state"
    return items[-1]


@then('the {hazard} footprint is {feet:d} feet in radius with matching collision and visuals')
def step_hazard_footprint(context, hazard, feet):
    h = _hazard(context, hazard)
    want = feet * PX_PER_FOOT
    assert abs(h["radius"] - want) <= 1, f"radius {h['radius']} != {want}"
    assert abs(h["collision_radius"] - want) <= 1, f"collision radius {h['collision_radius']} != {want}"
    assert 0.85 * want <= h["visual_radius"] <= 1.2 * want, f"visual extent {h['visual_radius']:.0f}px doesn't match {want}px"
    assert h["y_sort_enabled"], "hazard must participate in Y-sort"
    proof(context, f"radius {h['radius']:.0f}px = {h['feet']:.0f} ft · collision {h['collision_radius']:.0f}px · drawn extent {h['visual_radius']:.0f}px")
    proof(context, f"floor layer sorts at y={h['floor_sort_y']:.0f} (back edge) z={h['floor_z']}")


@then('the hero touched the {hazard} inside its radius and is drawn on top of its floor layer')
def step_hazard_contact_drawn_above(context, hazard):
    _, kind = _HAZ_KEY[hazard]
    ev = wait_for_event(context, "hazard_contact", lambda e: e.get("kind") == kind and e.get("actor_is_hero"))
    assert ev, f"No hazard_contact event for the hero on the {hazard}"
    assert ev["distance_from_center"] <= ev["radius"] + 1, ev
    assert ev["actor_drawn_above_floor"] is True, f"Hero rendered UNDER the {hazard} floor: {ev}"
    st = state(context)
    hy = st["hero"]["position"][1]
    h = _hazard(context, hazard)
    assert hy > h["floor_sort_y"], f"hero y {hy} not below floor pivot {h['floor_sort_y']}"
    context.hazard_contact = ev
    proof(context, f"contact seq#{ev['seq']} in IE round {ev['round']}: {ev['distance_from_center']:.0f}px from centre (r={ev['radius']:.0f})")
    proof(context, f"draw order: hero y={hy:.0f} > floor pivot y={h['floor_sort_y']:.0f}, same z → hero rendered ON TOP")


@then('the {hazard} wisps drift in front of the hero')
def step_wisps_in_front(context, hazard):
    h = _hazard(context, hazard)
    assert h.get("front_wisps_z", 0) > 0, h
    proof(context, f"front wisp layer z={h['front_wisps_z']} > actor z=0 · floor layer z={h['floor_z']} → hero is immersed, not erased")


@then('the knockdown lasted less than one Infinity Engine round')
def step_knockdown_round(context):
    since = getattr(context, "hazard_contact", {}).get("seq", context.scenario_event_mark) - 1
    ps = wait_for_event(context, "prone_start", lambda e: e.get("actor_kind") == "hero", since=since)
    pe = wait_for_event(context, "prone_end", lambda e: e.get("actor_kind") == "hero", since=since, timeout=8.0)
    assert ps and pe, f"prone_start={ps} prone_end={pe}"
    dur = (pe["t_ms"] - ps["t_ms"]) / 1000.0
    rounds = pe["round"] - ps["round"]
    assert 2.5 <= dur < 6.0, f"Knockdown lasted {dur:.2f}s (IE round = 6 s)"
    assert rounds <= 1, f"Knockdown spanned {rounds} round boundaries"
    proof(context, f"down in round {ps['round']} @{ps['round_t']:.1f}s → up in round {pe['round']} @{pe['round_t']:.1f}s = {dur:.2f}s (< 6 s round)")


@then('enemy "{enemy_id}" inside the {hazard} took damage')
def step_enemy_inside_hazard_damaged(context, enemy_id, hazard):
    h = _hazard(context, hazard)
    en = enemy(context, enemy_id)
    d = _dist(en["position"], h["position"])
    dmg = [e for e in events(context, "damage_applied") if e.get("target_id") == enemy_id]
    assert dmg, f"No damage_applied for {enemy_id}"
    assert d <= h["radius"] + 60, f"{enemy_id} {d:.0f}px from centre"
    proof(context, f"{enemy_id} HP {dmg[0]['hp_before']}→{dmg[0]['hp_after']} (−{dmg[0]['amount']}) at {d:.0f}px from centre (r={h['radius']:.0f})")


# ── Dispel Magic area burst ────────────────────────────────────────────────────

@then('the dispel burst stripped "{a}" and "{b}" but not "{c}" outside its {feet:d} foot radius')
def step_dispel_burst(context, a, b, c, feet):
    ev = wait_for_event(context, "dispel_burst")
    assert ev, "No dispel_burst event"
    r = ev["radius_px"]
    assert abs(r - feet * PX_PER_FOOT) <= 1, ev
    aff = {x["id"]: x for x in ev["affected"]}
    out = {x["id"]: x for x in ev["outside"]}
    for eid in (a, b):
        assert eid in aff and "invisible" in aff[eid]["removed"] and aff[eid]["distance_px"] <= r, f"{eid} not stripped: {ev}"
    assert c in out and out[c]["distance_px"] > r and "invisible" in out[c]["kept"], f"{c} should keep invisibility: {ev}"
    proof(context, f"burst r={r:.0f}px ({ev['radius_ft']:.0f} ft) at ({ev['center'][0]:.0f},{ev['center'][1]:.0f})")
    proof(context, f"{a} @{aff[a]['distance_px']:.0f}px stripped {aff[a]['removed']} · {b} @{aff[b]['distance_px']:.0f}px stripped {aff[b]['removed']}")
    proof(context, f"{c} @{out[c]['distance_px']:.0f}px > {r:.0f}px kept {out[c]['kept']}")


# ── Visual range / true sight ──────────────────────────────────────────────────

@then('the hero\'s visual range equals the fog-of-war sight circle')
def step_visual_range_is_fog(context):
    h = state(context)["hero"]
    assert abs(h["visual_range_px"] - h["fog_vision_radius_px"]) < 1, h
    proof(context, f"visual range {h['visual_range_px']:.0f}px ({h['visual_range_ft']:.0f} ft) == FogOfWar radius {h['fog_vision_radius_px']:.0f}px (IE: 448 units)")


@then('a true-sight reveal of "{enemy_id}" fired inside visual range with clear line of sight')
def step_true_sight_reveal(context, enemy_id):
    ev = wait_for_event(context, "true_sight_reveal", lambda e: e.get("target_id") == enemy_id)
    assert ev, "No true_sight_reveal event"
    assert ev["distance_px"] <= ev["visual_range_px"] and ev["line_of_sight"], ev
    assert 0.1 <= ev["sprite_opacity"] <= 0.8, ev
    proof(context, f"revealed seq#{ev['seq']} at {ev['distance_px']:.0f}px ≤ {ev['visual_range_px']:.0f}px · LOS clear · shimmer opacity {ev['sprite_opacity']:.2f}")


# ── Glyphs / fonts ─────────────────────────────────────────────────────────────

@then('the label "{fragment}" renders every glyph with the bundled font chain')
def step_label_glyphs(context, fragment):
    g = _get(context.web_port, "/api/v1/ui/glyphs")
    missing = [m for m in g["missing"] if fragment.lower() in m["text"].lower()]
    assert not missing, f"Tofu glyphs in '{fragment}': {missing}"
    assert g["missing_count"] == 0, f"Other labels render tofu: {g['missing']}"
    cov = g["covered"]
    dove = cov.get("U+1F54A")
    assert dove and "NotoEmoji" in dove["font"], f"🕊 not covered by the emoji font: {cov}"
    proof(context, f"🕊 U+1F54A → {dove['font']} · U+FE0F selector handled · 0 missing glyphs in {g['labels_scanned']} labels")


# ── Saving-throw AoE damage (dice-exact, not "at least N") ─────────────────────

@then('enemy "{enemy_id}" took the rolled {spell} damage, halved on a successful save')
def step_aoe_damage_exact(context, enemy_id, spell):
    st = state(context)
    telem = st.get("last_spell_telemetry", {}) or getattr(context, "last_spell_telemetry", {})
    hit = next((t for t in telem.get("targets_hit", []) if t.get("id") == enemy_id), None)
    assert hit, f"{enemy_id} not in {spell} targets_hit: {telem}"
    total = int(telem["total_damage"])
    want = (total + 1) // 2 if hit["save_passed"] else total
    assert hit["damage_taken"] == want, f"damage {hit['damage_taken']} != expected {want} (total {total}, save={hit['save_passed']})"
    dmg = [e for e in events(context, "damage_applied") if e.get("target_id") == enemy_id]
    assert dmg and dmg[-1]["amount"] == want, f"journal disagrees: {dmg}"
    dice = telem.get("damage_dice", [])
    proof(context, f"dice {dice} = {total} · save d20={hit['d20']} vs DC {telem.get('save_dc')} → {'SAVED (half)' if hit['save_passed'] else 'FAILED (full)'}")
    ev = dmg[-1]
    push = f" · pushed {hit['pushback']}" if "pushback" in hit else (" · pushed back 10 ft" if hit.get("pushed") else "")
    proof(context, f"{enemy_id} HP {ev['hp_before']}→{ev['hp_after']} (−{want}) at {hit.get('distance', 0):.0f}px from the blast{push}")
