from math import hypot

from behave import then, when

from tactical_controls_steps import find_unit


@when('a deployment command "{command}" from "{source}" at ({x:d}, {y:d}) is attempted')
def attempt_deployment(context, command, source, x, y):
    context.deployment_result = context.client.command(command, tags=[find_unit(context, source)["tag"]], x=x, y=y)


@then("the deployment command is rejected")
def deployment_rejected(context):
    assert not context.deployment_result["ok"], context.deployment_result


@then("Fast Deployment research is {status}")
def deployment_research_status(context, status):
    player = context.client.get_observation()["players"]["1"]
    assert player["fast_deployment"] == (status == "complete"), player


@then('"{source}" has no planned deployment')
def no_deployment_target(context, source):
    unit = find_unit(context, source)
    assert "deployment_target" not in unit, unit


@then('"{source}" has a deployment planned at ({x:d}, {y:d})')
def deployment_target(context, source, x, y):
    target = find_unit(context, source)["deployment_target"]
    assert hypot(target["x"] - x, target["y"] - y) < 0.2, target


@then('"{source}" has {ticks:d} deployment cooldown ticks')
def deployment_cooldown(context, source, ticks):
    unit = find_unit(context, source)
    assert unit["fast_deployment_ticks"] == ticks, unit


@then("Sunblade {order:d} deployed near ({x:d}, {y:d})")
def sunblade_deployed(context, order, x, y):
    units = context.client.get_observation()["units"]
    sunblades = sorted(
        (unit for unit in units if unit["unit_type"] == "sunblade" and unit["owner"] == 1),
        key=lambda unit: unit["tag"],
    )
    assert len(sunblades) == order, sunblades
    pos = sunblades[-1]["pos"]
    tolerance = 0.3 if order == 1 else 5.0
    assert hypot(pos["x"] - x, pos["y"] - y) < tolerance, pos


@then("the Fast Deployment cooldown is captured")
def capture_deployment_cooldown(context):
    context.client.ui(banner=0, clear_messages=True, hover=[1000, 600])
    result = context.client.screenshot(str(context.reports_dir / "fast-deployment.png"))
    assert result["ok"], result
