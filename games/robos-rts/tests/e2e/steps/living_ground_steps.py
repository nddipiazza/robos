from behave import then
from tactical_controls_steps import find_unit


@then("the rendered living ground is hidden")
def ground_hidden(context):
    view = context.client.ui()["state"]
    assert view["living_ground_visible"] == 0, view


@then("the rendered living ground matches the visible map cells")
def ground_matches_sight(context):
    view = context.client.ui()["state"]
    game_map = context.client.get_observation(player=1)["map"]
    cell_count = len(game_map["living_ground"]["cells"])
    assert view["living_ground_visible"] == cell_count > 0, (view, game_map["living_ground"])


@then('the Skitterling tooltip shows {speed:f} speed with the living ground bonus "{activity}"')
def ground_speed_tooltip(context, speed, activity):
    view = context.client.ui(hover=[710, 997])["state"]
    unit = find_unit(context, "runner")
    assert round(unit["effective_speed"], 1) == speed, unit
    assert view["speed_tooltip"] == f"Base 9.8   ·   Living ground +30% ({activity})", view
    if activity == "active":
        result = context.client.screenshot(str(context.reports_dir / "roadmap-living-ground-speed.png"))
        assert result["ok"], result
