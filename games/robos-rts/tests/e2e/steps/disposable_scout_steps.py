from math import hypot

from behave import then, when

from tactical_controls_steps import find_unit
from title_screen_steps import click, menu_state


def wisp(context):
    units = context.client.get_observation()["units"]
    return next(unit for unit in units if unit["unit_type"] == "farsight_wisp" and unit["owner"] == 1)


@when("the commander selects the Farsight Wisp body")
def select_wisp(context):
    unit = wisp(context)
    pos = unit["pos"]
    click(context, *context.client.project((pos["x"], pos["y"], pos["z"] + 0.54))[0])
    assert menu_state(context)["selected"] == [unit["tag"]]


@then("the Farsight Wisp has {ticks:d} lifetime ticks")
def wisp_lifetime(context, ticks):
    unit = wisp(context)
    assert unit["lifetime_ticks"] == ticks and unit["max_hp"] == 22 and unit["max_shields"] == 0, unit


@then("the Farsight Wisp is airborne near ({x:d}, {y:d})")
def wisp_position(context, x, y):
    unit = wisp(context)
    pos = unit["pos"]
    assert unit["airborne"] and hypot(pos["x"] - x, pos["y"] - y) < 2, unit


@then("the scouting cell at ({x:d}, {y:d}) is {state}")
def scouting_cell(context, x, y, state):
    fog = context.client.get_observation(player=1)["vision"]
    index = int(y // fog["cell_size"]) * fog["width"] + int(x // fog["cell_size"])
    assert fog["cells"][index] == {"unexplored": 0, "explored": 1, "visible": 2}[state], fog["cells"][index]


@then("player 1 sees the guard and the cloaker stays hidden")
def cloaker_not_detected(context):
    assert find_unit(context, "cloaker")["cloaked"]
    names = {unit["id"] for unit in context.client.get_observation(player=1)["units"]}
    assert "guard" in names and "cloaker" not in names, names


@then("the Farsight Wisp cannot attack the guard")
def wisp_cannot_attack(context):
    result = context.client.command("attack_target", tags=[wisp(context)["tag"]], target_tag=find_unit(context, "guard")["tag"])
    assert not result["ok"] and not wisp(context)["orders"], result


@then("the guard still has full health and shields")
def guard_unharmed(context):
    guard = find_unit(context, "guard")
    assert guard["hp"] == guard["max_hp"] and guard["shields"] == guard["max_shields"], guard


@then("the guard is outside live vision")
def guard_hidden_again(context):
    assert all(unit["id"] != "guard" for unit in context.client.get_observation(player=1)["units"])
