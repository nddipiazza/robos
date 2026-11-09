from behave import then, when

from tactical_controls_steps import find_unit


@when("the commander targets the Nest for a clutch")
def target_clutch(context):
    nest = find_unit(context, "nest")
    assert context.client.ui()["state"]["pending_ability"] == "inject_brood"
    x, y = context.client.project((nest["pos"]["x"], nest["pos"]["y"], 1.2))[0]
    context.client.mouse(x, y)
    context.client.mouse(x, y, pressed=False)


@then('"{name}" holds {slots:d} brood slots with {status} clutch growing')
def clutch_slots(context, name, slots, status):
    nest = find_unit(context, name)
    assert nest["brood_slots"] == slots, nest
    assert (nest["brood_inject_remaining"] > 0) == (status == "a"), nest
