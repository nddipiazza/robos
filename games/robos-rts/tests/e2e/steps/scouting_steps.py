from behave import then


@then('player {player:d} has no sight of "{first}" or "{second}"')
def hidden_units(context, player, first, second):
    visible = {unit["id"] for unit in context.client.get_observation(player)["units"]}
    assert not {first, second} & visible, visible


@then('player {player:d} can see "{first}" and "{second}"')
def visible_units(context, player, first, second):
    visible = {unit["id"] for unit in context.client.get_observation(player)["units"]}
    assert {first, second} <= visible, visible


@then('player {player:d} has no record of "{name}"')
def no_memory(context, player, name):
    view = context.client.get_observation(player)
    target = next(u for u in context.client.get_observation(0)["units"] if u["id"] == name)
    assert not any(b["tag"] == target["tag"] for b in view["vision"]["last_seen_buildings"])
    assert set(view["vision"]["cells"]) == {0, 2}


@then("player {player:d} remembers the outpost at ({x:d}, {y:d})")
def building_memory(context, player, x, y):
    view = context.client.get_observation(player)
    vision = view["vision"]
    memory = vision["last_seen_buildings"]
    assert len(memory) == 1, memory
    assert memory[0]["pos"] == {"x": x, "y": y}
    cell = (y // int(vision["cell_size"])) * vision["width"] + (x // int(vision["cell_size"]))
    assert vision["cells"][cell] == 1
    if context.rts_mode == "human":
        context.client.focus_camera(56, 30, 48)
        result = context.client.screenshot(str(context.reports_dir / "scouting-memory.png"))
        assert result.get("ok"), result
