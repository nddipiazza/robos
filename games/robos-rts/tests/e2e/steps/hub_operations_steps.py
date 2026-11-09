from behave import then, when

from worker_macro_steps import click_world


def _units(context, unit_type):
    return [u for u in context.client.get_observation()["units"] if u["unit_type"] == unit_type]


@then("the Hub's field operations are upgraded")
def operations_complete(context):
    assert _units(context, "colony_hub")[0]["hub_operations"]


@when("the commander marks the Prospector's crystal field")
def mark_crystal(context):
    click_world(context, 34, 21)


@then("a Prospector is mining with a fresh deployment timer")
def mining_prospector(context):
    prospector, = _units(context, "prospector")
    assert prospector["lifetime_ticks"] == 45 * 64 and prospector["orders"][0]["type"] == "harvest"


@when("the commander selects the Prospector")
def select_prospector(context):
    prospector, = _units(context, "prospector")
    click_world(context, prospector["pos"]["x"], prospector["pos"]["y"], height=0.6)
    assert context.client.ui()["state"]["selected"] == [prospector["tag"]]


@then("the Prospector's timer is captured")
def capture_timer(context):
    result = context.client.screenshot(str(context.reports_dir / "prospector-timer.png"))
    assert result["ok"], result


@then("the Prospector is gone after its deployment expires")
def expired_prospector(context):
    assert not _units(context, "prospector")
    assert not context.client.ui()["state"]["selected"]
