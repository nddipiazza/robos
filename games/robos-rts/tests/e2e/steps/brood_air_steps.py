from behave import then


@then('"{unit_type}" has flown over the Brood air test wall')
def beyond_wall(context, unit_type):
    view = context.client.get_observation()
    unit = next(unit for unit in view["units"] if unit["unit_type"] == unit_type)
    assert unit["airborne"] and unit["pos"]["x"] > 55, unit
