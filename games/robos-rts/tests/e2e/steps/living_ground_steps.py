from behave import then


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
