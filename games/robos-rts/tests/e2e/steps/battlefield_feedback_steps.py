import time

from behave import then, when

from tactical_controls_steps import find_unit
from title_screen_steps import click, key, menu_state, wait_for


@when("the commander selects {profile} and turns edge scrolling {scrolling}")
def choose_controls(context, profile, scrolling):
    assert menu_state(context)["page"] == "settings"
    for _ in range(2):
        key(context, "Tab")
    for direction in ("Down" if profile == "Grid" else "Up", "Down" if scrolling == "On" else "Up"):
        for button in ("Space", direction, "Enter", "Tab"):
            key(context, button)


@then("the battle view is ready")
def battle_ready(context):
    wait_for(lambda: menu_state(context), lambda view: "selected" in view)


@when("the commander clicks Resume Match on the title")
def click_resume(context):
    wait_for(lambda: menu_state(context), lambda view: view.get("page") == "main" and view["resume_available"])
    click(context, 275, 398)


@then('the command card is targeting "{ability}"')
def pending_ability(context, ability):
    assert menu_state(context)["pending_ability"] == ability


@then("moving the mouse to the edge pans the camera")
def camera_edge(context):
    start = menu_state(context)["camera_focus"][0]
    context.client.ui(hover=[1917, 490])
    try:
        wait_for(lambda: menu_state(context), lambda view: view["camera_focus"][0] > start + 2)
    finally:
        context.client.ui(hover=None)


@then("the live battle clock advances")
def clock_advances(context):
    before = context.client.health()
    assert not before["paused"], before
    wait_for(context.client.health, lambda health: health["tick"] > before["tick"])


@then("the live battle clock is paused")
def clock_paused(context):
    before = context.client.health()
    assert before["paused"], before
    time.sleep(0.15)
    assert context.client.health()["tick"] == before["tick"]


@when("the commander holds Alt")
def alt_down(context):
    context.client.key("Alt")


@when("the commander releases Alt")
def alt_up(context):
    context.client.key("Alt", pressed=False)


@then("overhead health bars are temporarily shown")
def show_bars(context):
    assert menu_state(context)["health_bars_revealed"]


@then("overhead health bars return to their configured mode")
def restore_bars(context):
    assert not menu_state(context)["health_bars_revealed"]


@when("the commander {modifier}-clicks selection portrait {index:d}")
def portrait_click(context, modifier, index):
    x = 360 + (index - 1) * 86
    context.client.mouse(x, 905, ctrl=modifier == "Ctrl", shift=modifier == "Shift")
    context.client.mouse(x, 905, pressed=False)


def capture(context, name, hover):
    context.client.ui(hover=hover, banner=0)
    result = context.client.screenshot(str(context.reports_dir / name))
    assert result["ok"], result
    context.client.ui(hover=None)


@then("the multi-building production and supply HUD is captured")
def capture_supply(context):
    capture(context, "battlefield-production-overview.png", [1750, 24])


def deposit(context, name):
    return next(resource for resource in context.client.get_observation()["resources"] if resource["id"] == name)


@when('the commander clicks deposit "{name}"')
def click_deposit(context, name):
    target = deposit(context, name)["pos"]
    context.client.focus_camera(target["x"], target["y"], 40)
    x, y = context.client.project((target["x"], target["y"]))[0]
    context.client.mouse(x, y)
    context.client.mouse(x, y, pressed=False)


@then("no deposit is inspected")
def no_deposit(context):
    assert not menu_state(context)["inspected_deposit"]


@then('deposit "{name}" is inspected with {reserves:d} reserves')
def inspected_deposit(context, name, reserves):
    target = deposit(context, name)
    assert menu_state(context)["inspected_deposit"] == target["tag"]
    assert target["amount"] == reserves, target


@when('the worker gathers from deposit "{name}"')
def order_harvest(context, name):
    target = deposit(context, name)
    worker = find_unit(context, "miner")
    result = context.client.command("harvest", tags=[worker["tag"]], target_tag=target["tag"], owner=1)
    assert result["ok"], result


@then("the commander receives the crystal depletion notice")
def depleted_notice(context):
    assert "Crystal field depleted." in menu_state(context)["messages"]


@then("the depleted deposit HUD is captured")
def capture_deposit(context):
    capture(context, "battlefield-depleted-deposit.png", [1450, 820])
