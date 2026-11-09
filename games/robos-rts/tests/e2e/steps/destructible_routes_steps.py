from behave import then, when

from tactical_controls_steps import find_unit


@then("the barrier is intact and the scout is west of the crossing")
def blocked_route(context):
    barrier = find_unit(context, "barrier")
    assert barrier["owner"] == 0 and barrier["hp"] == barrier["max_hp"], barrier
    assert find_unit(context, "scout")["pos"]["x"] < 38


@then("the barrier is destroyed")
def barrier_destroyed(context):
    view = context.client.get_observation()
    assert all(unit["id"] != "barrier" for unit in view["units"]), view["units"]
    assert view["players"]["1"]["units_killed"] == 0


@then("the scout reaches the far side of the crossing")
def opened_route(context):
    scout = find_unit(context, "scout")
    assert scout["pos"]["x"] > 58 and abs(scout["pos"]["y"] - 26) < 2, scout


@when('the commander captures the crossing "{state}"')
def capture_crossing(context, state):
    context.client.ui(banner=0, clear_messages=True, hover=[1450, 820])
    result = context.client.screenshot(str(context.reports_dir / f"roadmap-crossing-{state}.png"))
    assert result["ok"], result
