from behave import then

from tactical_controls_steps import find_unit


@then('entrances "{first}" and "{second}" are linked')
def tunnel_link(context, first, second):
    entrance, exit_ = find_unit(context, first), find_unit(context, second)
    assert entrance["tunnel_partner"] == exit_["tag"], entrance
    assert exit_["tunnel_partner"] == entrance["tag"], exit_


@then('"{entrance}" is sending {count:d} unit with {ticks:d} ticks left')
def tunnel_transit(context, entrance, count, ticks):
    unit = find_unit(context, entrance)
    assert len(unit["passengers"]) == count and unit["tunnel_ticks"] == ticks, unit


@then('"{name}" has crossed to the eastern tunnel')
def tunnel_exit(context, name):
    unit = find_unit(context, name)
    assert 60 < unit["pos"]["x"] < 74, unit
