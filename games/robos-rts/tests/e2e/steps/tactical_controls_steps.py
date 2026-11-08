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
