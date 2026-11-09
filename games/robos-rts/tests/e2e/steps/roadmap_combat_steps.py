from math import dist, isclose

from behave import then, when

from tactical_controls_steps import find_unit


@then('the selected weapon reads "{state}"')
def weapon_timing(context, state):
    timing = context.client.ui()["state"]["weapon_timing"]
    assert timing["state"] == state, timing
    if state == "Ready":
        assert timing["remaining"] == 0 and timing["progress"] == 1, timing
    else:
        assert timing["remaining"] > 0 and 0 < timing["progress"] < 1, timing


@then('the splash warning marks "{name}" with radius {radius:f}')
def splash_warning(context, name, radius):
    unit = find_unit(context, name)
    state = context.client.ui()["state"]
    warning, = state["area_warnings"]
    assert dist(warning["position"], [unit["pos"]["x"], unit["pos"]["y"]]) < 0.02, warning
    assert warning["radius"] == radius and 0 < warning["fraction"] < 1, warning
    assert warning["remaining"] == state["weapon_timing"]["remaining"], warning


@when("the commander captures the artillery warning")
@when("the commander captures the {kind} splash warning")
def capture_warning(context, kind="artillery"):
    context.client.ui(banner=0, clear_messages=True, hover=[1450, 820])
    result = context.client.screenshot(str(context.reports_dir / f"roadmap-{kind}-warning.png"))
    assert result["ok"], result


@then("the inner splash warning radius is {radius:f}")
def inner_splash_radius(context, radius):
    warning, = context.client.ui()["state"]["area_warnings"]
    assert warning.get("inner_radius") == radius, warning


@then('"{name}" has taken {damage:f} damage')
def splash_damage(context, name, damage):
    unit = find_unit(context, name)
    # Observation rounds health to the nearest tenth.
    assert isclose(unit["max_hp"] - unit["hp"], damage, abs_tol=0.051), unit


@then("no splash warning is visible")
def no_splash_warning(context):
    assert context.client.ui()["state"]["area_warnings"] == []


@then('"{name}" is winding up a shot')
def is_winding_up(context, name):
    assert find_unit(context, name)["attack_state"] == "windup"
