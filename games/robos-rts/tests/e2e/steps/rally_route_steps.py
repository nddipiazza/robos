from math import hypot

from behave import then, when

from tactical_controls_steps import find_unit


@when("the commander right-clicks a crystal shard at ({x:f}, {y:f}, {height:f})")
def rally_to_shard(context, x, y, height):
    sx, sy = context.client.project((x, y, height))[0]
    context.client.mouse(sx, sy, button=2)
    context.client.mouse(sx, sy, button=2, pressed=False)


@then('"{producer}" has a harvest rally centered on "{name}"')
def check_crystal_rally(context, producer, name):
    resource = next(r for r in context.client.get_observation()["resources"] if r["id"] == name)
    waypoint = find_unit(context, producer)["rally_route"][-1]
    assert waypoint == {
        "kind": "harvest", "target_tag": resource["tag"],
        "x": resource["pos"]["x"], "y": resource["pos"]["y"],
    }, waypoint


@when("the commander Shift-right-clicks terrain at ({x:d}, {y:d})")
def append_rally(context, x, y):
    sx, sy = context.client.project((x, y))[0]
    context.client.mouse(sx, sy, button=2, shift=True)
    context.client.mouse(sx, sy, button=2, shift=True, pressed=False)


@then('"{producer}" has a rally route ending at "{leader}"')
def check_route(context, producer, leader):
    route = find_unit(context, producer)["rally_route"]
    assert [point["kind"] for point in route] == ["move", "move", "follow"], route
    assert route[-1]["target_tag"] == find_unit(context, leader)["tag"], route


def new_rifleman(context):
    soldiers = [u for u in context.client.get_observation()["units"] if u["unit_type"] == "rifleman" and u["owner"] == 1]
    assert len(soldiers) == 1, soldiers
    return soldiers[0]


@then('the new Rifleman has queued moves followed by an order to follow "{leader}"')
def check_spawn_orders(context, leader):
    orders = new_rifleman(context)["orders"]
    assert [order["type"] for order in orders] == ["move", "move", "follow"], orders
    assert orders[-1]["target_tag"] == find_unit(context, leader)["tag"], orders


def assert_near(first, second, distance):
    assert hypot(first["pos"]["x"] - second["pos"]["x"], first["pos"]["y"] - second["pos"]["y"]) < distance


@then('"{first}" is within {distance:d} units of "{second}"')
def follow_distance(context, first, distance, second):
    assert_near(find_unit(context, first), find_unit(context, second), distance)


@then('the new Rifleman is within {distance:d} units of "{leader}"')
def reinforcement_distance(context, distance, leader):
    assert_near(new_rifleman(context), find_unit(context, leader), distance)
