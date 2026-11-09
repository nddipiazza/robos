from behave import then

from title_screen_steps import menu_state


@then("the visible Lattice Burst is {phase} with radius {radius:d} and {ticks:d} remaining simulation ticks")
@then("the visible Lattice Burst is {phase} with radius {radius:d} and {ticks:d} remaining simulation tick")
def lattice_visible(context, phase, radius, ticks):
    zones = menu_state(context)["lattice_bursts"]
    assert len(zones) == 1, zones
    zone = zones[0]
    assert zone["warning"] == (phase == "warning"), zone
    assert zone["radius"] == radius and zone["ticks"] == ticks, zone


@then("the Lattice Burst display is empty")
def lattice_expired(context):
    assert not menu_state(context)["lattice_bursts"]
