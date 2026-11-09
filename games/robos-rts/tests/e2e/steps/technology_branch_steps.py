from behave import then, when

from title_screen_steps import click, menu_state


def technology(context):
    return menu_state(context)["technology"]


def row(context, tech):
    return next(entry for entry in technology(context)["rows"] if entry["id"] == tech)


@when("the commander opens the faction technology panel")
def open_technology(context):
    click(context, 222, 22)


@when("the commander clicks a technology row")
def click_technology_row(context):
    click(context, 285, 168)


@then('the faction technology panel shows "{faction}"')
def panel_faction(context, faction):
    view = technology(context)
    assert view["visible"] and view["faction"] == faction, view


@then("the faction technology panel is closed")
def panel_closed(context):
    assert not technology(context)["visible"]


@then('technology "{tech}" is "{state}" and costs {crystal:d} crystal, {aether:d} aether, and {supply:d} supply')
def technology_cost(context, tech, state, crystal, aether, supply):
    entry = row(context, tech)
    assert entry["state"] == state, entry
    assert [entry["cost"][key] for key in ("crystal", "aether", "supply")] == [crystal, aether, supply], entry


@then('technology "{tech}" shows prerequisite "{required}" as "{state}"')
def technology_prerequisite(context, tech, required, state):
    entry = row(context, tech)
    assert any(req["id"] == required and req["state"] == state for req in entry["requirements"]), entry


@then("the faction technology panel is captured")
def capture_technology(context):
    faction = technology(context)["faction"]
    context.client.ui(banner=0, clear_messages=True, hover=[1000, 600])
    result = context.client.screenshot(str(context.reports_dir / f"roadmap-technology-{faction}.png"))
    assert result["ok"], result
