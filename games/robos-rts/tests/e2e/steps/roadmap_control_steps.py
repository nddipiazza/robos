from math import dist

from behave import then, when

from asymmetric_skirmish_steps import brood_nest
from title_screen_steps import click, key, menu_state


@when("the commander clicks a targeted point at ({x:d}, {y:d})")
def click_target(context, x, y):
    click(context, *context.client.project((x, y))[0])


@then("both personal pings are visible to the commander")
def visible_pings(context):
    first, second = menu_state(context)["pings"]
    assert dist(first, (40, 31)) < 0.15, first
    assert dist(second, (54, 31)) < 0.15, second


@then("the selected Howitzer shows both weapon ranges")
def weapon_ranges(context):
    assert any(r["minimum"] == 5 and r["maximum"] == 31 for r in menu_state(context)["weapon_ranges"])


@then("no weapon ranges are shown")
def no_weapon_ranges(context):
    assert not menu_state(context)["weapon_ranges"]


@when("the commander holds Shift for waypoints")
def hold_shift(context):
    context.client.key("Shift")


@when("the commander releases Shift for waypoints")
def release_shift(context):
    context.client.key("Shift", pressed=False)
    assert not menu_state(context)["pending_ability"]


@when("the commander clicks the idle production button")
def click_idle_production(context):
    click(context, 175, 802)


@then("both Nest rally routes are reset")
def reset_rallies(context):
    nest = brood_nest(context)
    assert "rally_route" not in nest and "worker_rally_route" not in nest


@when("the commander chooses fast panning and Shift-only order lines")
def choose_pan_and_orders(context):
    for _ in range(4):
        key(context, "Tab")
    for button in ("Space", "Down", "Enter", "Tab", "Space", "Down", "Enter"):
        key(context, button)


@then("the fast pan setting is active")
def fast_pan(context):
    assert menu_state(context)["camera_pan_speed"] == 72


@then("selected order lines are {visibility}")
def order_lines(context, visibility):
    assert menu_state(context)["order_lines_visible"] == (visibility == "visible")
