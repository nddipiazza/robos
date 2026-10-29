import json
from pathlib import Path
from behave import given, when, then


@given('a "{layout}" allied holding-line fixture')
def holding_fixture(context, layout):
    scenario = json.loads((Path(__file__).resolve().parents[3]/"scenarios/allied-crowd-flank.jsonld").read_text(encoding="utf-8"))
    context.crowd_mirror = layout == "mirrored"
    if context.crowd_mirror:
        for unit in scenario["units"]:
            unit["x"] = 96-unit["x"]
    assert context.client.load_scenario(scenario)["ok"]
    obs = context.client.get_observation()
    context.crowd_rear = next(u["tag"] for u in obs["units"] if u["id"] == "rear")
    context.crowd_enemy = next(u for u in obs["units"] if u["id"] == "enemy")
    context.crowd_holders = {u["tag"]: u["pos"] for u in obs["units"] if u["tag"] != context.crowd_rear}
    assert context.client.command("hold_position", tags=list(context.crowd_holders))["accepted"] == 10
    assert context.client.command("attack_target", tags=[context.crowd_rear], target_tag=context.crowd_enemy["tag"])["accepted"] == 1


@when("the rear Rifleman seeks the enemy for up to 10 game seconds")
def seek(context):
    context.crowd_crossing = None
    context.crowd_fired = False
    for _ in range(80):
        obs = context.client.step(8)
        rear = next((u for u in obs["units"] if u["tag"] == context.crowd_rear), None)
        assert rear, "The blocked Rifleman died before reaching a firing position"
        x, y = rear["pos"]["x"], rear["pos"]["y"]
        if context.crowd_crossing is None and (x < 60 if context.crowd_mirror else x > 36):
            context.crowd_crossing = y
        if any(e["type"] == "weapon_fire" and e["attacker_tag"] == context.crowd_rear for e in obs["recent_events"]):
            context.crowd_fired = True
            break
    context.crowd_final = obs


@then("it fires after crossing outside the allied line")
def fired(context):
    assert context.crowd_fired, "The rear Rifleman never obtained a shot"
    assert context.crowd_crossing is not None and abs(context.crowd_crossing-32) > 9.5, context.crowd_crossing


@then("every holding unit remains in its original position")
def not_displaced(context):
    for u in context.crowd_final["units"]:
        if u["tag"] in context.crowd_holders:
            expected = context.crowd_holders[u["tag"]]
            assert abs(expected["x"]-u["pos"]["x"]) < .05 and abs(expected["y"]-u["pos"]["y"]) < .05, u
