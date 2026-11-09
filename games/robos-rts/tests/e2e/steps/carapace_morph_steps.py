from behave import then

from tactical_controls_steps import find_unit


@then('"{name}" is "{unit_type}" with {ticks:d} evolution ticks left')
def evolution_state(context, name, unit_type, ticks):
    unit = find_unit(context, name)
    assert unit["unit_type"] == unit_type and unit.get("carapace_morph_ticks", 0) == ticks, unit
