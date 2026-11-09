from behave import then, when

from tactical_controls_steps import find_unit


def _click_body(context, name, x_offset, local_height, button):
    pos = find_unit(context, name)["pos"]
    x, y = context.client.project((pos["x"] + x_offset, pos["y"], pos["z"] + local_height))[0]
    assert 0 < x < 1920 and 0 < y < 844, f"{name} must be on the battlefield, got {(x, y)}"
    context.client.mouse(x, y, button=button)
    context.client.mouse(x, y, button=button, pressed=False)


@when('the commander clicks the projected body of "{name}" at ({x:f}, {height:f})')
def click_body(context, name, x, height):
    _click_body(context, name, x, height, 1)


@when('the commander right-clicks the projected body of "{name}" at ({x:f}, {height:f})')
def right_click_body(context, name, x, height):
    _click_body(context, name, x, height, 2)


@then('"{name}" has a "{order_type}" order for "{target}"')
@then('"{name}" has an "{order_type}" order for "{target}"')
def has_order_for(context, name, order_type, target):
    orders = find_unit(context, name)["orders"]
    assert [(order["type"], order.get("target_tag")) for order in orders] == [
        (order_type, find_unit(context, target)["tag"]),
    ], orders
