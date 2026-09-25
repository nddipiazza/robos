"""
Step library for the Infinity AI scenario engine (tests/e2e/features/engine/).

A scenario is a robos:CRPGTestScenario KGraph node: a battle map, the game state
(party, enemies, traps) and Infinity AI directives that steer any party member or
NPC. Given steps load it, When steps feed player inputs or let the Infinity AI
play, Then steps assert on the engine's state and event log.

CRPG_MODE=human  : the fight is shown in the ScenarioArena (video, overlays, pauses).
CRPG_MODE=backend: engine only, headless, no pauses — as fast as the rules resolve.
"""

from __future__ import annotations

import json
import os
import time
import urllib.request

from behave import given, when, then

try:
    from tests.e2e.proof_helpers import proof
except Exception:  # pragma: no cover
    def proof(context, evidence):
        context.step_proofs = getattr(context, "step_proofs", []) + [evidence]

MODE = os.environ.get("CRPG_MODE", "human").strip().lower()
HUMAN = MODE != "backend"
TURN_PACE = float(os.environ.get("CRPG_TURN_PACE", "0.7"))
SHOW_PAUSE = float(os.environ.get("CRPG_SHOW_PAUSE", "0.9"))
SCENARIOS_DIR = "scenarios"


# ── HTTP ──────────────────────────────────────────────────────────────────────

def _api(context, method: str, endpoint: str, payload: dict | None = None, timeout: float = 120.0) -> dict:
    url = f"http://127.0.0.1:{context.web_port}/api/v1/scenario/{endpoint}"
    data = json.dumps(payload or {}).encode("utf-8") if method == "POST" else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _post(context, endpoint, payload=None, timeout=120.0):
    return _api(context, "POST", endpoint, payload, timeout)


def _get(context, endpoint):
    return _api(context, "GET", endpoint)


def _pause(seconds: float = SHOW_PAUSE):
    if HUMAN and seconds > 0:
        time.sleep(seconds)


def _qa(context, endpoint: str, payload: dict):
    if not HUMAN:
        return
    try:
        url = f"http://127.0.0.1:{context.web_port}/api/v1/qa/{endpoint}"
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=2).read()
    except Exception:
        pass


# ── Scenario building ─────────────────────────────────────────────────────────

def _defining(context) -> dict:
    """For steps that build the scenario: they must all come before any step that
    touches the loaded scenario, or their data would be silently ignored."""
    assert not getattr(context, "engine_loaded", False) or getattr(context, "engine_spec", None) is None, (
        "This step defines the scenario, but the scenario was already loaded by an earlier step. "
        "Put party, enemies, traps, map, round limit and directive steps before steps like "
        "'\"x\" is standing at', 'the next d20 roll is' or any When step.")
    return _spec(context)


def _spec(context) -> dict:
    if not hasattr(context, "engine_spec") or context.engine_spec is None:
        context.engine_spec = {"name": getattr(context, "scenario_name", "scenario"), "seed": 1,
                               "party": [], "enemies": [], "directives": [], "traps": []}
        context.engine_loaded = False
    return context.engine_spec


def _num(v: str):
    v = v.strip()
    if v == "":
        return None
    if v.lower() in ("true", "yes"):
        return True
    if v.lower() in ("false", "no"):
        return False
    try:
        return int(v)
    except ValueError:
        try:
            return float(v)
        except ValueError:
            return v


def _row_to_dict(row) -> dict:
    out = {}
    for h in row.headings:
        v = row[h].strip()
        if v == "":
            continue
        key = h.strip()
        if key in ("spells", "inventory", "conditions", "preferSpells", "forbidSpells", "resistances", "immunities",
                   "vulnerabilities", "condition_immunities", "accessories"):
            out[key] = [x.strip() for x in v.split(",") if x.strip()]
        elif key == "position":
            x, y = [float(p) for p in v.replace("(", "").replace(")", "").split(",")]
            out["x"], out["y"] = x, y
        else:
            out[key] = _num(v)
    return out


def _load(context, payload: dict) -> dict:
    payload = dict(payload)
    payload["mode"] = "human" if HUMAN else "backend"
    res = _post(context, "load", payload)
    assert res.get("success"), "Scenario failed to load: %s" % json.dumps(res.get("errors", res))
    context.engine_payload = {k: v for k, v in payload.items() if k != "mode"}
    context.engine_loaded = True
    context.engine_load_result = res
    context.event_cursor = 0
    context.last_result = None
    if HUMAN:
        st = _get(context, "state")
        party = [a for a in st["actors"].values() if a["side"] == "party"]
        foes = [a for a in st["actors"].values() if a["side"] != "party"]
        _qa(context, "scenario_splash", {
            "scenario_name": st.get("name") or context.scenario_name,
            "description": getattr(context, "scenario_description", "") or "Infinity AI scenario engine test",
            "starting_scene": "ScenarioArena · seed %d" % st.get("seed", 0),
            "game_state_summary": "Party: %s  vs  %s" % (
                ", ".join("%s (L%d %s)" % (a["name"], a["level"], a["class"]) for a in party),
                ", ".join(a["name"] for a in foes) or "no enemies"),
            "duration": 2.5,
        })
        time.sleep(2.6)
    return res


def ensure_loaded(context):
    if getattr(context, "engine_loaded", False):
        return
    spec = _spec(context)
    _load(context, {"scenario": spec})


def _state(context) -> dict:
    ensure_loaded(context)
    return _get(context, "state")


def _actor(context, actor_id: str) -> dict:
    st = _state(context)
    assert actor_id in st["actors"], "No actor '%s' (have: %s)" % (actor_id, ", ".join(st["actors"]))
    return st["actors"][actor_id]


def _new_events(context, type_: str = "") -> list:
    res = _post(context, "events", {"since": getattr(context, "event_cursor_before_action", 0), "type": type_})
    return res["events"]


def _all_events(context, type_: str = "") -> list:
    return _post(context, "events", {"since": 0, "type": type_})["events"]


def _begin_action(context):
    ensure_loaded(context)
    context.event_cursor_before_action = _state(context)["events"]


def _do_input(context, actor: str, action: dict):
    _begin_action(context)
    body = dict(action)
    body["actor"] = actor
    context.last_result = _post(context, "input", body)
    _pause()
    return context.last_result


@given('the scenario description "{text}"')
def step_description(context, text):
    context.scenario_description = text


@given('the cRPG test scenario "{name}" from the knowledge graph')
def step_load_file(context, name):
    path = name if name.endswith(".jsonld") or name.endswith(".json") else f"{SCENARIOS_DIR}/{name}.jsonld"
    if not path.startswith(SCENARIOS_DIR + "/") and "/" not in path:
        path = f"{SCENARIOS_DIR}/{path}"
    context.engine_spec = None
    res = _load(context, {"file": path})
    proof(context, "loaded %s: %d actors, order %s" % (path, res["actors"], " → ".join(res["order"])))


@given('a cRPG test scenario')
def step_load_inline(context):
    context.engine_spec = None
    res = _load(context, {"scenario": json.loads(context.text)})
    proof(context, "loaded inline scenario: %d actors" % res["actors"])


@given('a cRPG test scenario "{name}" with seed {seed:d}')
def step_new_scenario(context, name, seed):
    context.engine_spec = None
    spec = _spec(context)
    spec["name"] = name
    spec["seed"] = seed


@given('the round limit is {n:d}')
def step_round_limit(context, n):
    _defining(context)["max_rounds"] = n


@given('reactions are disabled')
def step_no_reactions(context):
    _defining(context)["reactions"] = False


@given('the party')
def step_party(context):
    spec = _defining(context)
    for row in context.table:
        spec["party"].append(_row_to_dict(row))


@given('the enemies')
def step_enemies(context):
    spec = _defining(context)
    for row in context.table:
        spec["enemies"].append(_row_to_dict(row))


@given('the traps')
def step_traps(context):
    spec = _defining(context)
    for row in context.table:
        spec["traps"].append(_row_to_dict(row))


@given('the Infinity AI directives')
def step_directives(context):
    spec = _defining(context)
    if context.text:
        d = json.loads(context.text)
        spec["directives"].extend(d if isinstance(d, list) else [d])
    else:
        for row in context.table:
            spec["directives"].append(_row_to_dict(row))


@given('the scripted player inputs for "{actor}"')
def step_scripted_inputs(context, actor):
    spec = _defining(context)
    inputs = []
    for row in context.table:
        d = _row_to_dict(row)
        if "point" in d and isinstance(d["point"], str):
            d["point"] = [float(p) for p in d["point"].split(",")]
        if "to" in d and isinstance(d["to"], str):
            d["to"] = [float(p) for p in d["to"].split(",")]
        inputs.append(d)
    existing = next((d for d in spec["directives"] if d.get("actor") == actor), None)
    if existing is None:
        existing = {"actor": actor, "controller": "infinity_ai"}
        spec["directives"].append(existing)
    existing["inputs"] = inputs


@given('the next dice rolls are {values}')
def step_dice_any(context, values):
    ensure_loaded(context)
    _post(context, "dice", {"force": [int(v) for v in values.replace(" and ", ",").split(",")]})


@given('the next d{sides:d} rolls are {values}')
def step_dice_sized(context, sides, values):
    ensure_loaded(context)
    _post(context, "dice", {"force": [{"d": sides, "v": int(v)} for v in values.replace(" and ", ",").split(",")]})


@given('the next d{sides:d} roll is {value:d}')
def step_dice_one(context, sides, value):
    ensure_loaded(context)
    _post(context, "dice", {"force": [{"d": sides, "v": value}]})


@given('"{actor}" is at {hp:d} HP')
def step_set_hp(context, actor, hp):
    ensure_loaded(context)
    _post(context, "patch", {"actor": actor, "hp": hp})


@given('"{actor}" is {condition} for {rounds:d} rounds')
def step_set_condition_rounds(context, actor, condition, rounds):
    ensure_loaded(context)
    _post(context, "patch", {"actor": actor, "add_conditions": [condition], "rounds": rounds})


@given('"{actor}" is standing at {x:d},{y:d}')
def step_set_pos(context, actor, x, y):
    ensure_loaded(context)
    _post(context, "patch", {"actor": actor, "x": x, "y": y})


@given('"{actor}" has no spell slots left')
def step_no_slots(context, actor):
    ensure_loaded(context)
    a = _actor(context, actor)
    _post(context, "patch", {"actor": actor, "slots": {k: 0 for k in a["slots"]}})


@given('the scenario is loaded')
@when('the scenario is loaded')
def step_ensure(context):
    ensure_loaded(context)
    proof(context, "initiative order: %s" % " → ".join(context.engine_load_result["order"]))


# ── Player inputs given by the test ──────────────────────────────────────────

@when('"{actor}" attacks "{target}"')
def step_attack(context, actor, target):
    _do_input(context, actor, {"type": "attack", "target": target})


@when('"{actor}" casts "{spell}" at "{target}"')
def step_cast_target(context, actor, spell, target):
    _do_input(context, actor, {"type": "cast", "spell": spell, "target": target})


@when('"{actor}" casts "{spell}" at point {x:d},{y:d}')
def step_cast_point(context, actor, spell, x, y):
    _do_input(context, actor, {"type": "cast", "spell": spell, "point": [x, y]})


@when('"{actor}" casts "{spell}"')
def step_cast_self(context, actor, spell):
    _do_input(context, actor, {"type": "cast", "spell": spell})


@when('"{actor}" uses "{item}" on "{target}"')
def step_use_on(context, actor, item, target):
    _do_input(context, actor, {"type": "use_item", "item": item, "target": target})


@when('"{actor}" uses "{item}"')
def step_use(context, actor, item):
    _do_input(context, actor, {"type": "use_item", "item": item})


@when('"{actor}" moves to {x:d},{y:d}')
def step_move(context, actor, x, y):
    _do_input(context, actor, {"type": "move", "to": [x, y]})


@when('"{actor}" disengages and moves to {x:d},{y:d}')
def step_disengage_move(context, actor, x, y):
    _do_input(context, actor, {"type": "move", "to": [x, y], "disengage": True})


@when('"{actor}" dodges')
def step_dodge(context, actor):
    _do_input(context, actor, {"type": "dodge"})


@when('"{actor}" searches for traps')
def step_search(context, actor):
    _do_input(context, actor, {"type": "search"})


@when('"{actor}" disarms "{trap}"')
def step_disarm(context, actor, trap):
    _do_input(context, actor, {"type": "disarm", "trap": trap})


# ── The Infinity AI plays ─────────────────────────────────────────────────────

@when('the Infinity AI plays "{actor}"\'s turn')
def step_ai_turn(context, actor):
    _begin_action(context)
    context.last_result = _post(context, "turn", {"actor": actor})
    _pause()


@when('the Infinity AI plays the next {n:d} turns')
def step_ai_turns(context, n):
    _begin_action(context)
    for _ in range(n):
        context.last_result = _post(context, "turn", {})
        _pause(TURN_PACE)


@when('the Infinity AI plays the battle to the end')
def step_ai_run(context):
    _begin_action(context)
    context.last_result = _post(context, "run", {"pace": TURN_PACE if HUMAN else 0}, timeout=1800)
    proof(context, "%s after %d rounds, %d events" % (context.last_result["outcome"], context.last_result["rounds"], context.last_result["events"]))
    _pause()


@when('the Infinity AI plays up to {n:d} rounds')
def step_ai_rounds(context, n):
    _begin_action(context)
    context.last_result = _post(context, "run", {"pace": TURN_PACE if HUMAN else 0, "max_rounds": n}, timeout=1800)
    _pause()


# ── Assertions ───────────────────────────────────────────────────────────────

@then('"{actor}" has {hp:d} HP')
def step_hp(context, actor, hp):
    a = _actor(context, actor)
    proof(context, "%s HP %d/%d" % (actor, a["hp"], a["max_hp"]))
    assert a["hp"] == hp, "%s has %d HP, expected %d" % (actor, a["hp"], hp)


@then('"{actor}" has at most {hp:d} HP')
def step_hp_max(context, actor, hp):
    a = _actor(context, actor)
    proof(context, "%s HP %d/%d" % (actor, a["hp"], a["max_hp"]))
    assert a["hp"] <= hp, "%s has %d HP, expected at most %d" % (actor, a["hp"], hp)


@then('"{actor}" has at least {hp:d} HP')
def step_hp_min(context, actor, hp):
    a = _actor(context, actor)
    proof(context, "%s HP %d/%d" % (actor, a["hp"], a["max_hp"]))
    assert a["hp"] >= hp, "%s has %d HP, expected at least %d" % (actor, a["hp"], hp)


@then('"{actor}" has full HP')
def step_full_hp(context, actor):
    a = _actor(context, actor)
    proof(context, "%s HP %d/%d" % (actor, a["hp"], a["max_hp"]))
    assert a["hp"] == a["max_hp"], "%s has %d/%d HP" % (actor, a["hp"], a["max_hp"])


@then('"{actor}" has {hp:d} max HP and AC {ac:d}')
def step_hp_ac(context, actor, hp, ac):
    a = _actor(context, actor)
    proof(context, "%s max HP %d, AC %d" % (actor, a["max_hp"], a["ac"]))
    assert a["max_hp"] == hp and a["ac"] == ac, "%s has max HP %d, AC %d" % (actor, a["max_hp"], a["ac"])


@then('"{actor}" has AC {ac:d}')
def step_ac(context, actor, ac):
    a = _actor(context, actor)
    proof(context, "%s AC %d (base %d)" % (actor, a["ac"], a["base_ac"]))
    assert a["ac"] == ac, "%s has AC %d, expected %d" % (actor, a["ac"], ac)


@then('"{actor}" is dead')
def step_dead(context, actor):
    a = _actor(context, actor)
    proof(context, "%s dead=%s hp=%d" % (actor, a["dead"], a["hp"]))
    assert a["dead"], "%s is not dead (HP %d)" % (actor, a["hp"])


@then('"{actor}" is alive')
def step_alive(context, actor):
    a = _actor(context, actor)
    proof(context, "%s dead=%s hp=%d" % (actor, a["dead"], a["hp"]))
    assert not a["dead"], "%s is dead" % actor


@then('"{actor}" is standing')
def step_standing(context, actor):
    a = _actor(context, actor)
    proof(context, "%s HP %d, conditions %s" % (actor, a["hp"], a["condition_list"]))
    assert not a["down"], "%s is down" % actor


@then('"{actor}" is down')
def step_down(context, actor):
    a = _actor(context, actor)
    proof(context, "%s HP %d, dead=%s" % (actor, a["hp"], a["dead"]))
    assert a["down"], "%s is still standing with %d HP" % (actor, a["hp"])


@then('"{actor}" is not {condition}')
def step_not_condition(context, actor, condition):
    a = _actor(context, actor)
    proof(context, "%s conditions: %s" % (actor, ", ".join(a["condition_list"]) or "none"))
    assert condition not in a["condition_list"], "%s is still %s" % (actor, condition)


@then('"{actor}" is at {x:d},{y:d}')
def step_at(context, actor, x, y):
    a = _actor(context, actor)
    proof(context, "%s at %s" % (actor, a["pos"]))
    assert [round(a["pos"][0]), round(a["pos"][1])] == [x, y], "%s is at %s" % (actor, a["pos"])


@then('"{actor}" has {n:d} death save successes and {m:d} failures')
def step_death_saves(context, actor, n, m):
    a = _actor(context, actor)
    ds = a["death_saves"]
    proof(context, "%s death saves %s" % (actor, ds))
    assert ds["success"] == n and ds["failure"] == m, "%s death saves are %s" % (actor, ds)


@then('"{actor}" has {n:d} level-{lvl:d} spell slots left')
def step_slots(context, actor, n, lvl):
    a = _actor(context, actor)
    have = int(a["slots"].get(str(lvl), 0))
    proof(context, "%s slots %s" % (actor, a["slots"]))
    assert have == n, "%s has %d level-%d slots, expected %d" % (actor, have, lvl, n)


@then('"{actor}" has {n:d} "{item}" left')
def step_item_count(context, actor, n, item):
    a = _actor(context, actor)
    have = a["inventory"].count(item)
    proof(context, "%s inventory %s" % (actor, a["inventory"]))
    assert have == n, "%s carries %d %s" % (actor, have, item)


@then('the action is refused because "{reason}"')
def step_refused(context, reason):
    r = context.last_result or {}
    proof(context, "result: %s" % json.dumps(r)[:160])
    assert not r.get("success", True), "Action succeeded: %s" % r
    assert r.get("reason") == reason, "Refused because %r, expected %r" % (r.get("reason"), reason)


@then('the action succeeds')
def step_action_ok(context):
    r = context.last_result or {}
    assert r.get("success"), "Action failed: %s" % r


def _last(context, type_: str, **match) -> dict:
    evs = [e for e in _new_events(context, type_) if all(str(e.get(k)) == str(v) for k, v in match.items())]
    assert evs, "No %s event %s since the last action" % (type_, match)
    return evs[-1]


@then('the attack hits')
def step_hit(context):
    e = _last(context, "attack")
    proof(context, e["text"])
    assert e["hit"], e["text"]


@then('the attack misses')
def step_miss(context):
    e = _last(context, "attack")
    proof(context, e["text"])
    assert not e["hit"], e["text"]


@then('the attack is a critical hit')
def step_crit(context):
    e = _last(context, "attack")
    proof(context, e["text"])
    assert e["crit"], e["text"]


@then('the attack was rolled with advantage')
def step_adv(context):
    e = _last(context, "attack")
    proof(context, "%s | advantage from %s" % (e["text"], e["adv_sources"]))
    assert e["advantage"], "no advantage: %s / %s" % (e["adv_sources"], e["dis_sources"])


@then('the attack was rolled with disadvantage')
def step_dis(context):
    e = _last(context, "attack")
    proof(context, "%s | disadvantage from %s" % (e["text"], e["dis_sources"]))
    assert e["disadvantage"], "no disadvantage: %s / %s" % (e["adv_sources"], e["dis_sources"])


@then('"{actor}" took {n:d} {dtype} damage')
def step_took(context, actor, n, dtype):
    e = _last(context, "damage", target=actor)
    proof(context, e["text"])
    assert e["adjusted"] == n and e["damage_type"] == dtype, e["text"]


@then('"{actor}" took no damage')
def step_no_damage(context, actor):
    evs = [e for e in _new_events(context, "damage") if e["target"] == actor and e["adjusted"] > 0]
    proof(context, "damage events on %s: %d" % (actor, len(evs)))
    assert not evs, evs[-1]["text"]


@then('"{actor}" made a {ability} saving throw')
def step_made_save(context, actor, ability):
    e = _last(context, "saving_throw", actor=actor, ability=ability)
    proof(context, e["text"])


@then('"{actor}" was not affected')
def step_not_affected(context, actor):
    evs = [e for e in _new_events(context) if e.get("target") == actor and e["type"] in ("damage", "condition_applied", "saving_throw")]
    evs += [e for e in _new_events(context, "saving_throw") if e.get("actor") == actor]
    proof(context, "events touching %s: %d" % (actor, len(evs)))
    assert not evs, "%s was affected: %s" % (actor, evs[-1]["text"])


@then('the Infinity AI made "{actor}" {verb} "{what}"')
def step_ai_chose(context, actor, verb, what):
    inputs = [e for e in _all_events(context, "player_input") if e["actor"] == actor]
    assert inputs, "The Infinity AI gave %s no input" % actor
    got = [e["input"] for e in inputs]
    proof(context, " | ".join(e["text"] for e in inputs))
    key = {"attack": ("attack", "target"), "cast": ("cast", "spell"), "use": ("use_item", "item"),
           "target": (None, "target")}[verb]
    ok = any((key[0] is None or i.get("type") == key[0]) and str(i.get(key[1])) == what for i in got)
    assert ok, "Inputs for %s were %s" % (actor, got)


@then('the Infinity AI made "{actor}" {action}')
def step_ai_action(context, actor, action):
    inputs = [e for e in _all_events(context, "player_input") if e["actor"] == actor]
    proof(context, " | ".join(e["text"] for e in inputs) or "no input")
    want = {"move": "move", "dodge": "dodge", "wait": "wait"}[action]
    assert any(e["input"].get("type") == want for e in inputs), "Inputs: %s" % [e["input"] for e in inputs]


@then('the Infinity AI never made "{actor}" cast "{spell}"')
def step_ai_never(context, actor, spell):
    bad = [e for e in _all_events(context, "player_input") if e["actor"] == actor and e["input"].get("spell") == spell]
    proof(context, "%s cast %s %d times" % (actor, spell, len(bad)))
    assert not bad, bad[0]["text"]


@then('every input "{actor}" gave came from its script')
def step_all_scripted(context, actor):
    evs = [e for e in _all_events(context, "player_input") if e["actor"] == actor]
    proof(context, " | ".join("%s:%s" % (e["source"], e["input"].get("type")) for e in evs))
    assert evs and all(e["source"] == "script" for e in evs), [e["source"] for e in evs]


@then('the outcome is "{outcome}"')
def step_outcome(context, outcome):
    st = _state(context)
    proof(context, "outcome %s after %d rounds" % (st["outcome"] or st["status"], st["round"]))
    assert st["outcome"] == outcome, "Outcome is %r" % st["outcome"]


@then('the battle lasted at most {n:d} rounds')
def step_rounds(context, n):
    st = _state(context)
    proof(context, "%d rounds" % st["round"])
    assert st["round"] <= n, "Battle lasted %d rounds" % st["round"]


@then('the event log shows "{text}"')
def step_log_text(context, text):
    evs = [e for e in _all_events(context) if text in e.get("text", "")]
    proof(context, evs[-1]["text"] if evs else "not found")
    assert evs, "No event text contains %r" % text


@then('the engine audit is clean')
def step_audit(context):
    a = _get(context, "audit")
    proof(context, "%d events, %d dice rolls, %d violations" % (a["events"], a["dice_rolls"], a["count"]))
    assert a["count"] == 0, "Audit violations: %s" % json.dumps(a["violations"][:5], indent=1)


@then('replaying the scenario produces the identical battle')
def step_replay(context):
    """Replays the scenario from scratch twice in backend mode and compares event logs.
    If the original run was played purely by the Infinity AI (no test inputs or state
    patches), it must match the replays too."""
    original = _all_events(context)
    payload = dict(context.engine_payload, mode="backend")
    logs = []
    for _ in range(2):
        _post(context, "load", payload)
        _post(context, "run", {})
        logs.append(_all_events(context))
    same = json.dumps(logs[0], sort_keys=True) == json.dumps(logs[1], sort_keys=True)
    pure = not any(e["type"] == "state_patched" or (e["type"] == "player_input" and e["source"] == "test") for e in original)
    proof(context, "replays: %d and %d events; original %d events (%s run)" % (len(logs[0]), len(logs[1]), len(original), "pure AI" if pure else "test-driven"))
    assert same, "Two replays of the same seed diverged"
    if pure:
        assert json.dumps(original, sort_keys=True) == json.dumps(logs[0], sort_keys=True), "Replay diverged from the original run"


@when('the Infinity AI plays {count:d} random scenarios from seed {seed:d}')
def step_fuzz(context, count, seed):
    context.fuzz = _post(context, "fuzz", {"seed": seed, "count": count, "max_rounds": 25}, timeout=600)
    outcomes = {}
    for r in context.fuzz["runs"]:
        outcomes[r["outcome"]] = outcomes.get(r["outcome"], 0) + 1
    proof(context, "%d battles: %s" % (count, outcomes))


@then('every random battle finished with a clean audit')
def step_fuzz_clean(context):
    bad = [r for r in context.fuzz["runs"] if r["violations"]]
    proof(context, "%d battles with violations" % len(bad))
    assert not bad, json.dumps({"scenario": bad[0]["scenario"], "violations": bad[0]["violations"][:5]}, indent=1)
    unfinished = [r for r in context.fuzz["runs"] if r["outcome"] not in ("victory", "defeat", "timeout")]
    assert not unfinished, "Battles without an outcome: %s" % unfinished[0]["scenario"]


@then('every random battle replayed identically')
def step_fuzz_det(context):
    proof(context, "%d nondeterministic" % context.fuzz["nondeterministic"])
    assert context.fuzz["nondeterministic"] == 0


@then('the engine has exercised every {kind} in the content data')
def step_coverage(context, kind):
    cov = _get(context, "coverage")
    missing = cov["missing"].get(kind, [])
    used = len(cov["content"].get(kind, {}))
    proof(context, "%s: %d exercised, missing %s" % (kind, used, missing or "none"))
    assert not missing, "Never exercised %s: %s" % (kind, missing)


@then('the damage included {dice} of sneak attack')
def step_sneak(context, dice):
    e = _last(context, "damage")
    extra = [x for x in e.get("extra", []) if x["source"] == "sneak_attack"]
    proof(context, "%s | sneak attack %s" % (e["text"], [x["roll"]["dice"] + "=" + str(x["roll"]["total"]) for x in extra]))
    assert extra and extra[0]["roll"]["dice"] == dice, "No %s sneak attack in %s" % (dice, e.get("extra"))


@given('"{actor}" has {n:d} level-{lvl:d} spell slots')
def step_set_slots(context, actor, n, lvl):
    ensure_loaded(context)
    _post(context, "patch", {"actor": actor, "slots": {str(lvl): n}})


@then('"{actor}" has {n:d} maneuvers left')
def step_maneuvers(context, actor, n):
    a = _actor(context, actor)
    proof(context, "%s resources %s" % (actor, a["resources"]))
    assert int(a["resources"].get("maneuver", 0)) == n, "%s has %s maneuvers" % (actor, a["resources"])


@then('"{a}" and "{b}" are in different squares')
def step_diff_squares(context, a, b):
    pa, pb = _actor(context, a)["pos"], _actor(context, b)["pos"]
    d = max(abs(pa[0] - pb[0]), abs(pa[1] - pb[1]))
    proof(context, "%s at %s, %s at %s (%.1f ft apart)" % (a, pa, b, pb, d))
    assert d >= 5, "%s and %s share a square" % (a, b)


@then('"{actor}" has speed {n:d}')
def step_speed(context, actor, n):
    a = _actor(context, actor)
    proof(context, "%s speed %s" % (actor, a["speed"]))
    assert int(a["speed"]) == n, "%s has speed %s" % (actor, a["speed"])


@then('the battle has ended')
def step_ended(context):
    st = _state(context)
    proof(context, "status %s, outcome %s, round %d" % (st["status"], st["outcome"], st["round"]))
    assert st["status"] == "ended" and st["outcome"] in ("victory", "defeat", "timeout"), st["status"]


@then('applying "{condition}" to the {who} means it {effect}')
def step_condition_effect(context, condition, who, effect):
    """One checkable consequence per condition. `who` is attacker (vance) or target (guard)."""
    ensure_loaded(context)
    subject = "vance" if who == "attacker" else "guard"
    patch = {"actor": subject, "add_conditions": [condition], "rounds": 10}
    if condition == "charmed":
        patch["by"] = "guard"
    _post(context, "patch", patch)
    if effect in ("attacks with disadvantage", "is attacked with advantage", "attacks with advantage"):
        _post(context, "dice", {"force": [{"d": 20, "v": 11}, {"d": 20, "v": 12}]})
        _do_input(context, "vance", {"type": "attack", "target": "guard"})
        e = _last(context, "attack")
        proof(context, "%s | adv %s dis %s" % (e["text"], e["adv_sources"], e["dis_sources"]))
        want_adv = effect != "attacks with disadvantage"
        assert (e["advantage"] if want_adv else e["disadvantage"]), "%s: adv=%s dis=%s" % (condition, e["adv_sources"], e["dis_sources"])
    elif effect == "cannot act":
        r = _do_input(context, subject, {"type": "attack", "target": "vance" if subject == "guard" else "guard"})
        proof(context, "result %s" % r)
        assert not r["success"] and r["reason"] == "incapacitated", r
    elif effect == "cannot move":
        r = _do_input(context, subject, {"type": "move", "to": [0, 30]})
        proof(context, "result %s" % r)
        assert not r["success"] and r["reason"].startswith("speed_zero"), r
    elif effect == "cannot attack its charmer":
        r = _do_input(context, "vance", {"type": "attack", "target": "guard"})
        proof(context, "result %s" % r)
        assert not r["success"] and r["reason"] == "charmed", r
    elif effect == "still acts normally":
        r = _do_input(context, "vance", {"type": "attack", "target": "guard"})
        proof(context, "result %s" % ("acted" if r.get("success") else r))
        assert r.get("success"), r
    elif effect == "forces a WIS save to attack it":
        _post(context, "patch", {"actor": "guard", "remove_conditions": ["sanctuary"]})
        _post(context, "patch", {"actor": "guard", "add_conditions": ["sanctuary"], "rounds": 10})
        _do_input(context, "vance", {"type": "attack", "target": "guard"})
        e = _last(context, "saving_throw", actor="vance", ability="WIS")
        proof(context, e["text"])
    elif effect == "sees invisible creatures":
        _post(context, "patch", {"actor": "guard", "add_conditions": ["invisible"], "rounds": 10})
        _post(context, "dice", {"force": [{"d": 20, "v": 11}]})
        _do_input(context, "vance", {"type": "attack", "target": "guard"})
        e = _last(context, "attack")
        proof(context, "%s | dis %s" % (e["text"], e["dis_sources"]))
        assert not e["disadvantage"], e["dis_sources"]
    else:
        raise AssertionError("No check defined for effect %r" % effect)


@then('the engine has exercised every rule path it defines')
def step_rule_coverage(context):
    """Every literal _cov_rule("...") in the engine must have fired at least once."""
    import re
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, "..", "..", "..", "..", "scripts", "engine", "ScenarioEngine.gd"), encoding="utf-8").read()
    defined = sorted(set(re.findall(r'_cov_rule\("([a-z0-9_.]+)"\)', src)))
    hit = _get(context, "coverage")["rules"]
    missing = [r for r in defined if r not in hit]
    proof(context, "%d rule paths defined, %d exercised, missing %s" % (len(defined), len(defined) - len(missing), missing or "none"))
    assert not missing, "Rule paths never exercised: %s" % missing


@then('"{actor}" took at least {n:d} {dtype} damage')
def step_took_min(context, actor, n, dtype):
    e = _last(context, "damage", target=actor)
    proof(context, e["text"])
    assert e["adjusted"] >= n and e["damage_type"] == dtype, e["text"]


@when('"{actor}" takes the disengage action')
def step_disengage_action(context, actor):
    _do_input(context, actor, {"type": "disengage"})


@given('"{actor}" carries "{item}"')
def step_carries(context, actor, item):
    ensure_loaded(context)
    a = _actor(context, actor)
    _post(context, "patch", {"actor": actor, "inventory": a["inventory"] + [item]})



# ── Blockout maps (robos-crpg-blockout) ──────────────────────────────────────

@given('the battle map "{slug}"')
def step_battle_map(context, slug):
    _defining(context)["map"] = {"@id": "urn:robos:crpg:battle-map:%s" % slug}


@given('"{actor}" has speed {n:d}')
def step_set_speed(context, actor, n):
    ensure_loaded(context)
    _post(context, "patch", {"actor": actor, "speed": n})


@then('the last move cost {n:d} ft')
def step_move_cost(context, n):
    e = _last(context, "moved")
    proof(context, "%s via %s" % (e["text"], e.get("path")))
    assert int(round(e["feet"])) == n, "Move cost %s ft, expected %d (path %s)" % (e["feet"], n, e.get("path"))


@then('the last move passed through {x:d},{y:d}')
def step_move_through(context, x, y):
    e = _last(context, "moved")
    proof(context, "path %s" % e.get("path"))
    assert [x, y] in [[round(p[0]), round(p[1])] for p in e.get("path", [])], "Path %s doesn't pass %d,%d" % (e.get("path"), x, y)


@then('the attack was against AC {ac:d} with {source}')
def step_ac_source(context, ac, source):
    e = _last(context, "attack")
    proof(context, "%s | AC sources %s" % (e["text"], e["ac_sources"]))
    assert e["ac"] == ac and any(source in s for s in e["ac_sources"]), "AC %d from %s" % (e["ac"], e["ac_sources"])


@then('every blockout map is up to date with its objects')
def step_maps_fresh(context):
    import glob
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__))
    game_dir = os.path.abspath(os.path.join(here, "..", "..", "..", ".."))
    pkg = os.path.abspath(os.path.join(game_dir, "..", "..", "packages", "robos-crpg-blockout"))
    maps = sorted(glob.glob(os.path.join(game_dir, "maps", "*.jsonld")))
    out = subprocess.run(["python3", "-m", "robos_crpg_blockout", "check"] + maps, cwd=pkg, capture_output=True, text=True)
    proof(context, "%d maps checked: %s" % (len(maps), out.stdout.strip() or "all up to date"))
    assert out.returncode == 0, out.stdout



@then('every engine scenario also passes in the in-game demo runner')
def step_demo_parity(context):
    url = f"http://127.0.0.1:{context.web_port}/api/v1/demo/run_all"
    req = urllib.request.Request(url, data=b"{}", method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        res = json.loads(resp.read().decode("utf-8"))
    failed = [r for r in res["results"] if r["status"] not in ("passed", "skipped")]
    proof(context, "in-game runner: %s" % res["counts"])
    assert res["results"], "The in-game runner found no engine scenarios"
    assert not failed, "Failed in the in-game runner: %s" % json.dumps(failed[:5], indent=1)


# Registered last: behave tries steps in registration order, so the specific
# "is dead", "is not ..." and "is at ..." steps above must win first.
@then('"{actor}" is {condition}')
def step_condition(context, actor, condition):
    a = _actor(context, actor)
    proof(context, "%s conditions: %s" % (actor, ", ".join(a["condition_list"]) or "none"))
    assert condition in a["condition_list"], "%s is not %s (has %s)" % (actor, condition, a["condition_list"])


# ── KGraph conformance and validation ────────────────────────────────────────

@then('every scenario file conforms to the robos:CRPGTestScenario SHACL shapes')
def step_shacl(context):
    import glob
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__))
    game_dir = os.path.abspath(os.path.join(here, "..", "..", "..", ".."))
    files = sorted(glob.glob(os.path.join(game_dir, SCENARIOS_DIR, "*.jsonld")) + glob.glob(os.path.join(game_dir, "maps", "*.jsonld")))
    assert files, "No scenario files in %s" % SCENARIOS_DIR
    out = subprocess.run(["node", os.path.join(game_dir, "tests", "e2e", "validate_scenarios_kgraph.js")] + files,
                         capture_output=True, text=True)
    report = json.loads(out.stdout)
    for r in report:
        proof(context, "%s: %s (%d nodes)" % (r["file"], "conforms" if r["conforms"] else "VIOLATES", r["nodes"]))
    bad = [r for r in report if not r["conforms"]]
    assert not bad, json.dumps(bad[0]["violations"][:3], indent=1)


@then('loading this scenario fails with "{message}"')
def step_load_fails(context, message):
    res = _post(context, "load", {"scenario": json.loads(context.text), "mode": "backend"})
    proof(context, "errors: %s" % res.get("errors"))
    assert not res.get("success"), "Scenario loaded but should have been rejected"
    assert any(message in e for e in res.get("errors", [])), "Errors were %s" % res.get("errors")
