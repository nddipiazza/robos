from behave import then, when
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


@when("the artillery holds fire for the living ground test")
def artillery_hold_fire(context):
    gun = find_unit(context, "artillery")
    assert context.client.command("hold_fire", tags=[gun["tag"]], owner=2)["ok"]


@when("the commander places a Growth Node at ({x:d}, {y:d})")
def place_growth_node(context, x, y):
    assert context.client.ui()["state"]["pending_ability"] == "build_brood_growth_node"
    sx, sy = context.client.project((x, y))[0]
    context.client.mouse(sx, sy)
    context.client.mouse(sx, sy, pressed=False)


@when("the artillery destroys the Growth Node")
def artillery_destroy_node(context):
    gun = find_unit(context, "artillery")
    node = next(u for u in context.client.get_observation()["units"] if u["unit_type"] == "brood_growth_node")
    assert context.client.command("attack_target", tags=[gun["tag"]], owner=2, target_tag=node["tag"])["ok"]
    for _ in range(50):
        observation = context.client.step(32)
        if all(u["tag"] != node["tag"] for u in observation["units"]):
            return
    raise AssertionError("The artillery did not destroy the Growth Node")


@then("the rendered living ground {coverage:w} ({x:d}, {y:d})")
def ground_cell_coverage(context, coverage, x, y):
    view = context.client.ui()["state"]
    ground = context.client.get_observation(player=1)["map"]["living_ground"]
    cell_size = ground["cell_size"]
    cell = {"x": x // cell_size, "y": y // cell_size}
    assert view["living_ground_visible"] == len(ground["cells"]), (view, ground)
    assert (cell in ground["cells"]) == (coverage == "covers"), (cell, coverage, ground)
