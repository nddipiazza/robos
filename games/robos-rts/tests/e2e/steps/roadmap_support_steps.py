from behave import then, when

from tactical_controls_steps import find_unit


@when('the commander selects the completed "{unit_type}"')
def select_completed(context, unit_type):
    unit = next(u for u in context.client.get_observation()["units"]
                if u["unit_type"] == unit_type and u["owner"] == 1 and u["build_progress"] == 1)
    height = unit["pos"]["z"] + (1.0 if unit["is_structure"] else 1.35)
    x, y = context.client.project((unit["pos"]["x"], unit["pos"]["y"], height))[0]
    context.client.mouse(x, y)
    context.client.mouse(x, y, pressed=False)
    assert context.client.ui()["state"]["selected"] == [unit["tag"]]


@then('no "{unit_type}" exists')
def no_unit(context, unit_type):
    assert all(u["unit_type"] != unit_type for u in context.client.get_observation()["units"])


@then('"{unit_type}" spends energy supporting "{patient_id}"')
def support_target(context, unit_type, patient_id):
    support = next(u for u in context.client.get_observation()["units"] if u["unit_type"] == unit_type)
    patient = find_unit(context, patient_id)
    assert support["support_target_tag"] == patient["tag"], (support, patient)
    if unit_type == "triage_specialist":
        assert patient["hp"] > 20 and support["energy"] < 45, (support, patient)
    else:
        assert patient["shields"] > 50 and support["energy"] < 50 and support["powered"], (support, patient)


@then('the battlefield is captured as "{name}"')
def capture_battlefield(context, name):
    context.client.ui(banner=0, clear_messages=True, hover=[1450, 820])
    result = context.client.screenshot(str(context.reports_dir / f"roadmap-{name}.png"))
    assert result["ok"], result
