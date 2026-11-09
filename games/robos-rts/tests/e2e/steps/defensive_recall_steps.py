from math import dist, isclose

from behave import then, when

from tactical_controls_steps import find_unit
from title_screen_steps import menu_state


@when("the Mote loads crystal and holds it")
def mote_cargo(context):
    worker = find_unit(context, "worker")
    deposit = next(res for res in context.client.get_observation()["resources"] if res["id"] == "crystal")
    point = deposit["pos"]
    result = context.client.command("harvest", tags=[worker["tag"]], target_tag=deposit["tag"], x=point["x"], y=point["y"])
    assert result["ok"], result
    for _ in range(120):
        context.client.step(4)
        worker = find_unit(context, "worker")
        if worker["cargo_amount"] > 0:
            assert worker["cargo_type"] == "crystal", worker
            assert context.client.command("stop", tags=[worker["tag"]])["ok"]
            return
    raise AssertionError(worker)


@when("the commander records the recall participants")
def record_participants(context):
    observation = context.client.get_observation()
    names = {"stayer", "worker", "flyer"}
    context.recall_units = {unit["id"]: unit for unit in observation["units"] if unit["id"] in names}
    player = observation["players"]["1"]
    context.recall_bank = (player["crystal"], player["aether"], player["supply_used"])


@when('the commander records "{name}" Heartstone energy')
def record_recall_energy(context, name):
    context.recall_energy = find_unit(context, name)["energy"]


@then('"{name}" has spent {energy:d} recall energy')
def recall_spent(context, name, energy):
    difference = context.recall_energy - find_unit(context, name)["energy"]
    assert isclose(difference, energy, abs_tol=0.02), difference


@when('a direct recall from "{name}" at ({x:d}, {y:d}) is attempted')
def try_recall(context, name, x, y):
    context.recall_result = context.client.command("defensive_recall", tags=[find_unit(context, name)["tag"]], x=x, y=y)


@then("the direct recall is rejected")
def recall_rejected(context):
    assert not context.recall_result["ok"], context.recall_result


@then("the recall marker at ({x:d}, {y:d}) has {ticks:d} ticks and an {radius:d}-unit radius")
def recall_marker(context, x, y, ticks, radius):
    marker, = menu_state(context)["recall_markers"]
    assert dist((marker["x"], marker["y"]), (x, y)) < 0.2, marker
    assert (marker["ticks"], marker["radius"]) == (ticks, radius), marker


@then("the recall marker is private to its owner")
def private_recall(context):
    assert context.client.get_observation(player=1)["recall_markers"]
    assert not context.client.get_observation(player=2)["recall_markers"]


@then("no defensive recall marker remains")
def no_recall_marker(context):
    assert not menu_state(context)["recall_markers"]


@then("the recalled ground units have clear, distinct exits")
def clear_exits(context):
    units = [find_unit(context, name) for name in ("stayer", "worker")]
    positions = [(unit["pos"]["x"], unit["pos"]["y"]) for unit in units]
    assert dist(*positions) >= sum(unit["radius"] for unit in units), units
    for unit, (x, y) in zip(units, positions):
        r = unit["radius"]
        assert not (27 - r <= x <= 33 + r and 33 - r <= y <= 38 + r), unit


@then("the recall preserved tags, cargo and supply")
def preserved_recall_state(context):
    for name, before in context.recall_units.items():
        unit = find_unit(context, name)
        for key in ("tag", "hp", "cargo_amount", "cargo_type"):
            assert unit[key] == before[key], unit
    player = context.client.get_observation()["players"]["1"]
    assert (player["crystal"], player["aether"], player["supply_used"]) == context.recall_bank, player


@when("the opposing gun targets the casting Heartstone")
def target_recall_source(context):
    result = context.client.command(
        "attack_target", tags=[find_unit(context, "gun")["tag"]], target_tag=find_unit(context, "home")["tag"], owner=2,
    )
    assert result["ok"], result
