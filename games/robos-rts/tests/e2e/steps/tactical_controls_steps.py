from behave import then, when


@when("the commander frames ({x:d}, {y:d}) at zoom height {height:d}")
def frame_position(context, x, y, height):
    assert context.client.focus_camera(x, y, height)["ok"]


@then("the camera frames ({x:d}, {y:d}) at zoom height {height:d}")
def camera_position(context, x, y, height):
    view = context.client.ui()["state"]
    assert abs(view["camera_focus"][0] - x) < 0.1, view
    assert abs(view["camera_focus"][1] - y) < 0.1, view
    assert abs(view["camera_height"] - height) < 0.1, view


@when('the commander Ctrl-clicks unit "{name}"')
def ctrl_click_unit(context, name):
    unit = next(unit for unit in context.client.get_observation()["units"] if unit["id"] == name)
    x, y = context.client.project((unit["pos"]["x"], unit["pos"]["y"], 1.15))[0]
    context.client.mouse(x, y, ctrl=True)
    context.client.mouse(x, y, pressed=False, ctrl=True)


@then('the active subgroup is "{unit_type}"')
def active_subgroup(context, unit_type):
    view = context.client.ui()["state"]
    assert view["primary_type"] == unit_type, view
