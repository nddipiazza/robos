from behave import then, when

from tactical_controls_steps import find_unit


@when('"{worker}" is assigned to "{target}"')
def assign_worker(context, worker, target):
    obs = context.client.get_observation()
    node = next(entity for entity in obs["units"] + obs["resources"] if entity["id"] == target)
    result = context.client.command("harvest", tags=[find_unit(context, worker)["tag"]], target_tag=node["tag"])
    assert result["ok"], result


@then('"{name}" shows {assigned:d} of {ideal:d} workers assigned')
def saturation(context, name, assigned, ideal):
    site = context.client.ui()["state"]["worker_saturation"][str(find_unit(context, name)["tag"])]
    assert (site["assigned"], site["ideal"]) == (assigned, ideal), site


def click_world(context, x, y, height=0, shift=False):
    sx, sy = context.client.project((x, y, height))[0]
    context.client.mouse(sx, sy, shift=shift)
    context.client.mouse(sx, sy, pressed=False, shift=shift)


@when("the commander places a building at ({x:d}, {y:d})")
def place(context, x, y):
    click_world(context, x, y)


@when("the commander Shift-places a building at ({x:d}, {y:d})")
def shift_place(context, x, y):
    click_world(context, x, y, shift=True)


@when("the commander Shift-right-clicks at ({x:d}, {y:d})")
def shift_context_click(context, x, y):
    sx, sy = context.client.project((x, y, 0))[0]
    context.client.mouse(sx, sy, button=2, shift=True)
    context.client.mouse(sx, sy, button=2, pressed=False, shift=True)


@when("the commander holds Shift")
def hold_shift(context):
    context.client.key("Shift")


@when("the commander releases Shift")
def release_shift(context):
    context.client.key("Shift", pressed=False)


def click_card(context, slot, button):
    x = 1592 + ((slot - 1) % 5) * 70
    y = 894 + ((slot - 1) // 5) * 70
    context.client.mouse(x, y, button=button)
    context.client.mouse(x, y, button=button, pressed=False)


@when("the commander clicks worker card slot {slot:d}")
def click_worker_card(context, slot):
    click_card(context, slot, 1)


@when("the commander right-clicks worker card slot {slot:d}")
@when("the commander right-clicks command card slot {slot:d}")
def context_worker_card(context, slot):
    click_card(context, slot, 2)


@then('the worker build page is "{page}"')
def worker_build_page(context, page):
    assert (context.client.ui()["state"]["worker_build_page"] or "root") == page


@then("no placement is active")
def no_placement(context):
    assert not context.client.ui()["state"]["pending_ability"]


@then('"{name}" has Auto-Repair {status}')
def auto_repair(context, name, status):
    assert find_unit(context, name)["auto_repair"] == (status == "on")


@when("the commander selects the building at ({x:d}, {y:d})")
def select_building(context, x, y):
    click_world(context, x, y, height=1.15)


def building_at(context, x, y):
    return next(
        (u for u in context.client.get_observation()["units"]
         if u["is_structure"] and abs(u["pos"]["x"] - x) < 0.2 and abs(u["pos"]["y"] - y) < 0.2),
        None,
    )


@then("construction at ({x:d}, {y:d}) stays unfinished without a builder")
def stalled_site(context, x, y):
    before = building_at(context, x, y)
    assert before and 0.1 < before["build_progress"] < 1, before
    context.client.step(80)
    after = building_at(context, x, y)
    assert after["build_progress"] == before["build_progress"], after


@then('a finished "{type_id}" stands at ({x:d}, {y:d})')
def finished_site(context, type_id, x, y):
    site = building_at(context, x, y)
    assert site and site["unit_type"] == type_id and site["build_progress"] == 1.0, site


@then("no building stands at ({x:d}, {y:d})")
def cancelled_site(context, x, y):
    assert building_at(context, x, y) is None


@then("construction at ({x:d}, {y:d}) is progressing")
def progressing_site(context, x, y):
    site = building_at(context, x, y)
    assert site and 0.1 < site["build_progress"] < 1.0, site


@then('"{name}" is fully repaired at a crystal cost')
def repaired(context, name):
    unit = find_unit(context, name)
    assert unit["hp"] == unit["max_hp"], unit
    assert context.client.get_observation()["players"]["1"]["crystal"] < 400
