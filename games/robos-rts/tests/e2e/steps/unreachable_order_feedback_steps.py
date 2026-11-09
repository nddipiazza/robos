from math import dist

from behave import then

from tactical_controls_steps import find_unit
from title_screen_steps import menu_state, wait_for


def point(value):
    return tuple(map(float, value.strip("()").split(",")))


@then('only "{name}" has "{status}" route feedback west of {wall:d}')
def shortened_route_feedback(context, name, status, wall):
    unit = find_unit(context, name)
    markers = menu_state(context).get("path_feedback", [])
    assert len(markers) == 1, markers
    marker = markers[0]
    assert marker["tag"] == unit["tag"] and marker["status"] == status, marker
    assert unit["pos"]["x"] < marker["endpoint"][0] + 1 and marker["endpoint"][0] < wall, marker
    order = unit["orders"][0]
    if "arrival_pos" in order:
        assert dist(marker["endpoint"], point(order["arrival_pos"])) < 0.01, (marker, order)


@then('"{name}" has a formation slot away from ({x:d}, {y:d})')
def formation_offset(context, name, x, y):
    order = find_unit(context, name)["orders"][0]
    assert dist(point(order["arrival_pos"]), (x, y)) > 1.0, order


@then("no selected routes are marked")
def no_markers(context):
    assert not menu_state(context).get("path_feedback", [])


@then("shortened route markers fade")
def markers_fade(context):
    assert menu_state(context)["path_feedback"]
    wait_for(lambda: menu_state(context)["path_feedback"], lambda markers: not markers)
