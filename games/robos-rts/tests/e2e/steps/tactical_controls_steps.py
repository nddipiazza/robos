from math import hypot

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


@when("the commander targets minimap point ({x:d}, {y:d})")
@when("the commander targets minimap point ({x:d}, {y:d}) with {modifier}")
def target_minimap(context, x, y, modifier=""):
    game_map = context.client.get_observation()["map"]
    sx = 26 + 252 * x / game_map["width"]
    sy = 876 + 189 * y / game_map["height"]
    context.client.mouse(sx, sy, shift=modifier == "Shift")
    context.client.mouse(sx, sy, pressed=False)


def find_unit(context, name):
    return next(unit for unit in context.client.get_observation()["units"] if unit["id"] == name)


@then('"{name}" has orders "{orders}"')
def unit_orders(context, name, orders):
    expected = [] if orders == "none" else orders.split(",")
    actual = [order["type"] for order in find_unit(context, name)["orders"]]
    assert actual == expected, actual


@then('"{name}" reaches ({x:d}, {y:d}) and returns to ({origin_x:d}, {origin_y:d}) while patrolling')
def patrol_round_trip(context, name, x, y, origin_x, origin_y):
    for goal in [(x, y), (origin_x, origin_y)]:
        for _ in range(40):
            context.client.step(24)
            unit = find_unit(context, name)
            assert unit["orders"][0]["type"] == "patrol", unit
            if hypot(unit["pos"]["x"] - goal[0], unit["pos"]["y"] - goal[1]) < 2:
                break
        else:
            raise AssertionError(f"{name} never patrolled to {goal}")
