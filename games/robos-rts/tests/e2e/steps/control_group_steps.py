"""Control-group acceptance checks through the game's public input endpoints."""

import time

from behave import given, then, when


@given("the game view is ready for control group input")
def game_view_ready(context):
    # Map authoring scenarios can leave the editor active. Enter a valid playtest
    # through the public API before loading this feature's isolated battlefield.
    state = context.client.ui()
    if state.get("ok") and "selected" in state.get("state", {}):
        return
    assert context.client.editor("load", slug="frontier-hunters")["ok"]
    assert context.client.editor("playtest", paused=True)["ok"]
    _assert_state(context, lambda s: "selected" in s, "Game view becomes ready")


def _tags(context, names):
    if names == "none":
        return set()
    wanted = {name.strip() for name in names.split(",") if name.strip()}
    units = context.client.get_observation()["units"]
    tags = {u["tag"] for u in units if u["id"] in wanted}
    assert len(tags) == len(wanted), f"Missing fixture units: {wanted}"
    return tags


def _assert_state(context, predicate, description):
    deadline = time.monotonic() + 2
    while True:
        state = context.client.ui().get("state", {})
        if predicate(state):
            return
        assert time.monotonic() < deadline, f"{description}: {state}"
        time.sleep(0.02)


@when('the commander clicks unit "{name}"')
def click_unit(context, name):
    unit = next(u for u in context.client.get_observation()["units"] if u["id"] == name)
    if context.rts_mode != "backend" and not context.live_headless:
        context.client.focus_camera(35, 28, 40)
    x, y = context.client.project((unit["pos"]["x"], unit["pos"]["y"], 1.15))[0]
    context.client.mouse(x, y)
    context.client.mouse(x, y, pressed=False)
    _assert_state(context, lambda s: s["selected"] == [unit["tag"]], f"Click selects {name}")


@when('the commander presses "{shortcut}"')
def press_shortcut(context, shortcut):
    parts = shortcut.split("+")
    context.client.key(parts[-1], ctrl="Ctrl" in parts, shift="Shift" in parts)
    context.client.key(parts[-1], pressed=False)


@when("the commander clears the selection")
def clear_selection(context):
    # An empty-ground click also works in headless mode's deterministic projection.
    context.client.mouse(1800, 100)
    context.client.mouse(1800, 100, pressed=False)
    _assert_state(context, lambda s: s["selected"] == [], "Empty ground clears selection")


@then('the commander has selected "{names}"')
def selected_units(context, names):
    expected = _tags(context, names)
    _assert_state(context, lambda s: set(s["selected"]) == expected, f"Expected selection {names}")


@then('control group {number:d} contains "{names}"')
def group_members(context, number, names):
    expected = _tags(context, names)
    _assert_state(context, lambda s: set(s["control_group_members"].get(str(number), [])) == expected,
                  f"Expected group {number} = {names}")


@when('the commander clicks control slot {number:d} with "{modifiers}"')
def click_slot(context, number, modifiers):
    assert context.rts_mode != "backend", "HUD checks require rendered --human mode"
    x, y = 340 + (number - 1) * 78, 821
    context.client.mouse(x, y, ctrl="Ctrl" in modifiers, shift="Shift" in modifiers)
    context.client.mouse(x, y, pressed=False)


@when("the commander double clicks control slot {number:d}")
def double_click_slot(context, number):
    # Cancel targeting and reset history so neither click inherits a prior tap.
    context.client.key("Escape")
    context.client.focus_camera(35, 28, 40)
    click_slot(context, number, "none")
    click_slot(context, number, "none")


@then('the control group camera is centered on unit "{name}"')
def centered_camera(context, name):
    unit = next(u for u in context.client.get_observation()["units"] if u["id"] == name)
    expected = [unit["pos"]["x"], unit["pos"]["y"]]
    _assert_state(context, lambda s: all(abs(a - b) < 0.1 for a, b in zip(s["camera_focus"], expected)),
                  f"Expected focus {expected}")


@then("the control group HUD proof is captured")
def capture_hud_proof(context):
    context.client.ui(hover=[340, 821], banner=0)
    context.client.set_overlay("", "")
    time.sleep(0.1)
    result = context.client.screenshot(str(context.reports_dir / "control-groups.png"))
    assert result.get("ok"), result
