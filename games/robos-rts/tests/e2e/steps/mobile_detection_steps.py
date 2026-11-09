from behave import then, when

from tactical_controls_steps import find_unit
from title_screen_steps import menu_state


def veilseeker(context):
    units = context.client.get_observation()["units"]
    return next(unit for unit in units if unit["unit_type"] == "veilseeker" and unit["owner"] == 1)


@then("the concealed enemies are {status}")
def concealed_enemies(context, status):
    assert find_unit(context, "cloaker")["cloaked"]
    visible = {unit["id"] for unit in context.client.get_observation(player=1)["units"]}
    for name in ("cloaker", "brush_guard"):
        assert (name in visible) == (status == "revealed"), (name, visible)


@then("no selected mobile detection ring is shown")
def no_detection_ring(context):
    assert not menu_state(context)["mobile_detection_ranges"]


@then("the Veilseeker displays a {radius:d}-unit detection ring")
def detector_ring(context, radius):
    ranges = menu_state(context)["mobile_detection_ranges"]
    assert ranges == [{"tag": veilseeker(context)["tag"], "radius": radius}], ranges


@then("the warden cannot target the concealed Skirmisher")
def hidden_target_rejected(context):
    result = context.client.command(
        "attack_target", tags=[find_unit(context, "warden")["tag"]], target_tag=find_unit(context, "cloaker")["tag"],
    )
    assert not result["ok"], result


@when("the opposing gun targets the Veilseeker")
def target_detector(context):
    result = context.client.command(
        "attack_target", tags=[find_unit(context, "gun")["tag"]], target_tag=veilseeker(context)["tag"], owner=2,
    )
    assert result["ok"], result
