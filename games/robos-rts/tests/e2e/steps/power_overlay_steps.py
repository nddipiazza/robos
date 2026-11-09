from math import dist

from behave import then, when

from tactical_controls_steps import find_unit
from title_screen_steps import menu_state


def overlay(context):
    return menu_state(context)["power_overlay"]


def tags(context, names):
    return {find_unit(context, name)["tag"] for name in names.split(",")} if names != "none" else set()


@then("the infrastructure overlay is hidden")
def hidden_overlay(context):
    assert not overlay(context)["visible"]


@then('only power fields "{names}" are shown')
def power_fields(context, names):
    view = overlay(context)
    assert view["visible"] and {field["tag"] for field in view["fields"]} == tags(context, names), view


@then('only "{name}" is the highlighted power source')
def highlighted_source(context, name):
    fields = overlay(context)["fields"]
    assert {field["tag"] for field in fields if field["selected"]} == tags(context, name), fields


@then('the power overlay shows "{name}" as "{status}" with "{sources}"')
def waystone_sources(context, name, status, sources):
    unit = find_unit(context, name)
    entry = next(row for row in overlay(context)["waystones"] if row["tag"] == unit["tag"])
    expected = tags(context, sources)
    assert entry["state"] == status and set(entry["sources"]) == expected, entry
    assert unit["powered"] == bool(expected), unit


@then("the opposing Resonator is still hidden")
def opposing_source_hidden(context):
    visible = context.client.get_observation(player=1)["units"]
    assert all(unit["id"] != "hidden_source" for unit in visible), visible


@then("the power coverage overlay is captured")
def capture_power_overlay(context):
    context.client.ui(banner=0, clear_messages=True, hover=[1000, 600])
    result = context.client.screenshot(str(context.reports_dir / "roadmap-power-coverage.png"))
    assert result["ok"], result


@when("the opposing gun fires on the western power source")
def attack_western_source(context):
    result = context.client.command(
        "attack_target", tags=[find_unit(context, "gun")["tag"]],
        target_tag=find_unit(context, "west_source")["tag"], owner=2,
    )
    assert result["ok"], result


@then('the "{name}" Waystone has a rally at ({x:d}, {y:d})')
def waystone_rally(context, name, x, y):
    route = find_unit(context, name)["rally_route"]
    waypoint, = route
    assert waypoint["kind"] == "move" and dist((waypoint["x"], waypoint["y"]), (x, y)) < 0.5, route
