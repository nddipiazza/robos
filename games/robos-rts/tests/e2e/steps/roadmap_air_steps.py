from behave import then, when

from tactical_controls_steps import find_unit


@then("the interceptor is beyond the wall and the infantry is not")
def crossing(context):
    units = context.client.get_observation()["units"]
    flyer = next(u for u in units if u["unit_type"] == "kestrel_interceptor")
    assert flyer["airborne"] and flyer["pos"]["z"] > 5 and flyer["pos"]["x"] > 63, flyer
    assert find_unit(context, "infantry")["pos"]["x"] < 44


@then("the Rampart carries two Riflemen")
def transport_cargo(context):
    units = context.client.get_observation()["units"]
    transport = next(unit for unit in units if unit["unit_type"] == "rampart_transport")
    assert len(transport["passengers"]) == 2, transport
    assert not any(unit["id"] in {"first", "second"} for unit in units), units
    result = context.client.screenshot(str(context.reports_dir / "rampart-troop-lift.png"))
    assert result.get("ok"), result


@then('"{first}" and "{second}" are deployed across the wall')
def transport_drop(context, first, second):
    for name in (first, second):
        unit = find_unit(context, name)
        assert unit["pos"]["x"] > 60 and not unit.get("airborne", False), unit
    units = context.client.get_observation()["units"]
    transport = next(unit for unit in units if unit["unit_type"] == "rampart_transport")
    assert transport["passengers"] == [], transport


@then('"{name}" is in "{mode}" with {ticks:d} switch ticks left')
def fighter_mode(context, name, mode, ticks):
    unit = find_unit(context, name)
    assert unit["unit_type"] == mode and unit.get("fighter_mode_ticks", 0) == ticks, unit
    assert unit.get("airborne", False) == (mode == "kestrel_interceptor"), unit


@when('the commander clicks the airborne unit "{name}"')
def click_airborne(context, name):
    _click_airborne(context, name, 1)


@when('the commander right-clicks the airborne unit "{name}"')
def right_click_airborne(context, name):
    _click_airborne(context, name, 2)


def _click_airborne(context, name, button):
    unit = find_unit(context, name)
    assert unit["airborne"], unit
    x, y = context.client.project((unit["pos"]["x"], unit["pos"]["y"], unit["pos"]["z"] + 0.8))[0]
    context.client.mouse(x, y, button=button)
    context.client.mouse(x, y, button=button, pressed=False)


@then('the mortar damages "{ground}" without hitting "{air}"')
def mortar_impact(context, ground, air):
    ground_unit = find_unit(context, ground)
    flyer = find_unit(context, air)
    assert ground_unit["hp"] < ground_unit["max_hp"] and flyer["hp"] == flyer["max_hp"], (ground_unit, flyer)
