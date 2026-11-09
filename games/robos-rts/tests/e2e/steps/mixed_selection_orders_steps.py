from math import hypot

from behave import then, when

from tactical_controls_steps import find_unit


@when('the commander selects the mixed group "{names}"')
def select_mixed_group(context, names):
    for index, name in enumerate(names.split(",")):
        unit = find_unit(context, name.strip())
        pos = unit["pos"]
        x, y = context.client.project((pos["x"], pos["y"], 1.15))[0]
        context.client.mouse(x, y, shift=index > 0)
        context.client.mouse(x, y, pressed=False, shift=index > 0)


@then('"{name}" gathers from deposit "{deposit}"')
def gathers_from_deposit(context, name, deposit):
    resource = next(r for r in context.client.get_observation()["resources"] if r["id"] == deposit)
    order = find_unit(context, name)["orders"][0]
    assert order["type"] == "harvest" and order["target_tag"] == resource["tag"], order


@then('"{name}" is ordered to move toward ({x:d}, {y:d})')
def ordered_to_move(context, name, x, y):
    order = find_unit(context, name)["orders"][0]
    assert order["type"] == "move", order
    # The JSON observation serializes Godot vectors as "(x, y)".
    px, py = map(float, order["target_pos"].strip("()").split(","))
    assert hypot(px - x, py - y) < 0.15, order
