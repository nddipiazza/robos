from math import hypot

from behave import then, when

from title_screen_steps import click, menu_state


def carrier(context):
    units = context.client.get_observation()["units"]
    return next(unit for unit in units if unit["unit_type"] == "lumen_carrier" and unit["owner"] == 1)


@when("the commander selects the Lumen Carrier")
def select_carrier(context):
    pos = carrier(context)["pos"]
    click(context, *context.client.project((pos["x"], pos["y"], 1.25))[0])
    assert menu_state(context)["primary_type"] == "lumen_carrier"


@then("the Lumen Carrier is near ({x:d}, {y:d})")
def carrier_near(context, x, y):
    pos = carrier(context)["pos"]
    assert hypot(pos["x"] - x, pos["y"] - y) < 2, pos


@then("the Lumen Carrier has {active:d} active field ticks and {rearm:d} recharge ticks")
def carrier_field_time(context, active, rearm):
    unit = carrier(context)
    assert unit["power_field_active"] == (active > 0), unit
    assert (unit["power_field_ticks"], unit["power_field_rearm_ticks"]) == (active, rearm), unit


@then("the Lumen Carrier refuses movement and keeps its anchor")
def carrier_anchor(context):
    unit = carrier(context)
    context.carrier_anchor = unit["pos"]
    assert not unit["orders"], unit
    for command in ("move", "deploy_power_field"):
        result = context.client.command(command, tags=[unit["tag"]], x=75, y=40, queue=True)
        assert not result["ok"], result


@then("the Lumen Carrier remains at its anchor")
def carrier_at_anchor(context):
    assert carrier(context)["pos"] == context.carrier_anchor


@then("the selected carrier has a temporary {radius:d}-unit power field")
def carrier_overlay(context, radius):
    view = menu_state(context)["power_overlay"]
    field = next(field for field in view["fields"] if field["tag"] == carrier(context)["tag"])
    assert field["selected"] and field["temporary"] and field["radius"] == radius, field


@then("the anchored carrier is captured")
def capture_carrier(context):
    context.client.ui(banner=0, clear_messages=True, hover=[1000, 600])
    result = context.client.screenshot(str(context.reports_dir / "mobile-power-carrier.png"))
    assert result["ok"], result
