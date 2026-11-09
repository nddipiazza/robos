from math import hypot

from behave import then, when

from tactical_controls_steps import find_unit
from title_screen_steps import menu_state


def friendly_units(context, unit_type):
    units = context.client.get_observation()["units"]
    return [unit for unit in units if unit["owner"] == 1 and unit["unit_type"] == unit_type]


@then("a direct Crownspire production request is rejected")
def reject_crownspire_training(context):
    result = context.client.command("train_crownspire", tags=[find_unit(context, "source")["tag"]])
    assert not result["ok"], result


@then("the Crownspire is airborne near ({x:d}, {y:d})")
def crownspire_position(context, x, y):
    unit, = friendly_units(context, "crownspire")
    pos = unit["pos"]
    assert unit["airborne"] and pos["z"] == 9 and hypot(pos["x"] - x, pos["y"] - y) < 2, unit


@then("the ground-only mortar cannot target the Crownspire")
def reject_ground_weapon(context):
    unit, = friendly_units(context, "crownspire")
    result = context.client.command(
        "attack_target", tags=[find_unit(context, "mortar")["tag"]], target_tag=unit["tag"], owner=2,
    )
    assert not result["ok"], result


@then('the first Crown Lance hit removes {damage:d} vitals from "{name}"')
def crown_lance_damage(context, damage, name):
    target = find_unit(context, name)
    before = target["hp"] + target["shields"]
    for _ in range(28):
        context.client.step(8)
        target = find_unit(context, name)
        removed = before - target["hp"] - target["shields"]
        if removed > 0:
            assert removed == damage, target
            return
    raise AssertionError(target)


@then("the Crownspire is at full health and shields")
def crownspire_unharmed(context):
    unit, = friendly_units(context, "crownspire")
    assert unit["hp"] == unit["max_hp"] and unit["shields"] == unit["max_shields"], unit


@when("the commander selects the two paid Kestrels")
def select_kestrel_wing(context):
    first, second = friendly_units(context, "kestrel_interceptor")
    tags = [first["tag"], second["tag"]]
    assert context.client.select(tags=tags)["ok"]
    assert set(menu_state(context)["selected"]) == set(tags)


@then("the affordable Kestrel wing wins the air engagement")
def affordable_air_counter(context):
    observation = context.client.get_observation()
    assert all(unit["id"] != "capital" for unit in observation["units"]), observation
    survivors = friendly_units(context, "kestrel_interceptor")
    assert len(survivors) == 2 and any(unit["hp"] < unit["max_hp"] for unit in survivors), survivors
    assert any(event.get("weapon") == "Crown Lance" for event in observation["recent_events"])
    player = observation["players"]["1"]
    assert (player["crystal"], player["aether"]) == (150, 50), player
