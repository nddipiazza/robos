from behave import then

from title_screen_steps import menu_state


@then("the visible Phase Barrier has radius {radius:d} and {ticks:d} ticks remaining")
def barrier_visible(context, radius, ticks):
    barriers = menu_state(context)["phase_barriers"]
    assert len(barriers) == 1, barriers
    assert barriers[0]["radius"] == radius and barriers[0]["ticks"] == ticks, barriers


@then("the Phase Barrier display is empty")
def barrier_expired(context):
    assert not menu_state(context)["phase_barriers"]
