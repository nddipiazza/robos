from behave import then, when

from tactical_controls_steps import find_unit


@then("the watch station belongs to player {owner:d}")
def station_owner(context, owner):
    station, = context.client.get_observation()["map"]["watch_stations"]
    assert station["owner"] == owner, station
    assert station["capture_radius"] == 4 and station["sight_radius"] == 32, station


@then("the distant contact is {visibility} to player 1")
def contact_visibility(context, visibility):
    visible = {unit["id"] for unit in context.client.get_observation(player=1)["units"]}
    assert ("distant" in visible) == (visibility == "visible"), visible


@then("player 1 cannot see the watch station's owner")
def hidden_owner(context):
    station, = context.client.get_observation(player=1)["map"]["watch_stations"]
    assert station["owner"] == 0, station


@when("the commander captures the held watch station")
def capture_station(context):
    context.client.ui(banner=0, clear_messages=True, hover=[1450, 820])
    result = context.client.screenshot(str(context.reports_dir / "roadmap-watch-station.png"))
    assert result["ok"], result


@when("the contender moves to ({x:d}, {y:d})")
def move_contender(context, x, y):
    contender = find_unit(context, "contender")
    result = context.client.command("move", [contender["tag"]], x=x, y=y, owner=2)
    assert result["ok"], result
