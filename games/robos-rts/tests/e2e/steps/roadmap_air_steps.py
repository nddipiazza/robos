from behave import then, when

from tactical_controls_steps import find_unit


@then("the interceptor is beyond the wall and the infantry is not")
def crossing(context):
    units = context.client.get_observation()["units"]
    flyer = next(u for u in units if u["unit_type"] == "kestrel_interceptor")
    assert flyer["airborne"] and flyer["pos"]["z"] > 5 and flyer["pos"]["x"] > 63, flyer
    assert find_unit(context, "infantry")["pos"]["x"] < 44


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
