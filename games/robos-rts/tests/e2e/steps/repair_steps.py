from behave import given, when, then
from shift_steps import play_scene


def repair_unit(context, kind):
    return next(u for u in context.client.get_observation()["units"] if u["owner"] == 1 and u["unit_type"] == kind)


def click_repair_target(context, kind, button=2, **mods):
    unit = repair_unit(context, kind)
    height = max(2.4, unit["radius"] * 1.5) if unit["is_structure"] else 1.9 + unit["radius"] * .5
    x, y = context.client.project((unit["pos"]["x"], unit["pos"]["y"], height * .45))[0]
    context.client.mouse(x, y, button=button, pressed=True, **mods)
    context.client.mouse(x, y, button=button, pressed=False, **mods)


@given("the paused Pioneer repair fixture with 100 crystal and 100 aether")
def repair_fixture(context):
    play_scene(context)
    assert context.client.load_scenario_slug("pioneer-repair")["ok"]
    context.client.pause(True)
    context.repair_worker = repair_unit(context, "pioneer")["tag"]
    context.client.select(tags=[context.repair_worker])
    context.client.focus_camera(40, 43, height=64)


@when("the Pioneer right-clicks the damaged Howitzer")
def repair_howitzer(context):
    click_repair_target(context, "howitzer")
    worker = repair_unit(context, "pioneer")
    assert worker["orders"][0]["type"] == "repair", worker
    feedback = context.client.ui()["state"]["command_feedback"]
    assert feedback["kind"] == "repair" and feedback["accepted"] == 1


@then("one second restores exactly 5.46875 HP and spends 2 crystal and 1 aether")
def one_second(context):
    obs = context.client.step(64)
    target = repair_unit(context, "howitzer")
    # Public HP is rounded to a tenth; cumulative repair work is unrounded.
    assert abs(target["hp"] - 40.46875) <= .05, target
    assert abs(target["repair_hp_total"] - 5.46875) < .00001, target
    assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (98, 99)


@then("completing the repair restores 140 HP for exactly 30 crystal and 25 aether")
def full_repair(context):
    obs = context.client.step(25 * 64)
    assert repair_unit(context, "howitzer")["hp"] == 175
    assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (70, 75)
    assert not repair_unit(context, "pioneer")["orders"]


@when("the player presses Halt and five seconds pass")
def halt_repair(context):
    context.client.key("S", True)
    context.client.key("S", False)
    context.client.step(5 * 64)


@then("the Howitzer stays at 40.46875 HP and the resource balances stay at 98 and 99")
def halted_outcome(context):
    obs = context.client.get_observation()
    target = repair_unit(context, "howitzer")
    assert abs(target["hp"] - 40.46875) <= .05, target
    assert abs(target["repair_hp_total"] - 5.46875) < .00001, target
    assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (98, 99)
    assert not repair_unit(context, "pioneer")["orders"]


@when("the player uses E on the damaged Silo and Shift-right-clicks a destination")
def targeted_repair(context):
    context.client.key("E", True)
    context.client.key("E", False)
    click_repair_target(context, "silo", button=1)
    x, y = context.client.project((60, 56, 0))[0]
    context.client.mouse(x, y, button=2, pressed=True, shift=True)
    context.client.mouse(x, y, button=2, pressed=False, shift=True)
    assert [o["type"] for o in repair_unit(context, "pioneer")["orders"]] == ["repair", "move"]


@then("the Silo reaches 400 HP for 13 crystal and the Pioneer follows the queued move")
def silo_outcome(context):
    obs = context.client.step(30 * 64)
    assert repair_unit(context, "silo")["hp"] == 400
    assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (87, 100)
    p = repair_unit(context, "pioneer")["pos"]
    assert (p["x"] - 60) ** 2 + (p["y"] - 56) ** 2 < 9


@when("the Pioneer right-clicks the damaged Aether Tap")
def tap_repair(context):
    click_repair_target(context, "aether_tap")
    assert repair_unit(context, "pioneer")["orders"][0]["type"] == "repair"


@then("the Tap reaches 500 HP for 10 crystal and zero aether")
def tap_outcome(context):
    obs = context.client.step(25 * 64)
    assert repair_unit(context, "aether_tap")["hp"] == 500
    assert (obs["players"]["1"]["crystal"], obs["players"]["1"]["aether"]) == (90, 100)


@then("right-clicking the healthy Tap orders gas gathering")
def tap_gather(context):
    click_repair_target(context, "aether_tap")
    assert repair_unit(context, "pioneer")["orders"][0]["type"] == "harvest"
