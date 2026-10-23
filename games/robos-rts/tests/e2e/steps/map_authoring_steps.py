import time
from behave import given, when, then


def editor_ready(context):
    context.client.editor("open")
    for _ in range(100):
        state = context.client.editor("state")
        if state.get("ok"):
            return state
        time.sleep(0.05)
    raise AssertionError("Editor did not open")


@given("the Frontier Hunters map is open in the editor")
def load_frontier_editor(context):
    editor_ready(context)
    assert context.client.editor("load", slug="frontier-hunters")["ok"]


@then("the editor preserves the 256 square map, waterways, unlimited resources and eight starts")
def editor_preserves(context):
    state = context.client.editor("state")
    scenario = state["scenario"]
    assert scenario["map"]["width"] == scenario["map"]["height"] == 256
    assert len(scenario["map"]["starts"]) == 8
    assert len(scenario["map"]["water_channels"]) == 11
    assert scenario["unlimited_resources"] and scenario["mode"] == "skirmish"
    assert len(scenario["resources"]) == 170
    assert state["issues"] == [], state["issues"]


@when("a mouse stroke paints water from ({x0:f}, {y0:f}) to ({x1:f}, {y1:f})")
def mouse_stroke(context, x0, y0, x1, y1):
    ui = context.client.editor("tool", tool="terrain_brush", terrain="water", size=1)["ui"]
    rect, scale, offset = ui["canvas_rect"], ui["canvas_scale"], ui["canvas_offset"]
    def screen(x, y):
        return rect[0] + offset[0] + x * scale, rect[1] + offset[1] + y * scale
    start, end = screen(x0, y0), screen(x1, y1)
    context.client.mouse(*start, 1, True)
    context.client.mouse_move(*end)
    context.client.mouse(*end, 1, False)


@then("the editor has {count:d} painted terrain cells")
def terrain_count(context, count):
    state = context.client.editor("state")
    assert state["summary"]["terrain_tiles"] == count, state["summary"]


@when("the editor redoes the last edit")
def redo(context):
    assert context.client.editor("redo")["ok"]


@then("the engine plays the authored map with its painted terrain and unlimited deposits")
def authored_play(context):
    obs = context.client.step(64)
    assert obs["match"]["mode"] == "1p_vs_ai" and obs["match"]["unlimited_resources"]
    assert obs["map"]["width"] == obs["map"]["height"] == 256
    assert len(obs["map"]["terrain_tiles"]) == 5
    assert len(obs["units"]) == 26 and len(obs["resources"]) == 170


@when("the player returns to the editor")
def return_to_editor(context):
    context.client.key("F10")
    for _ in range(100):
        if context.client.editor("state").get("ok"):
            return
        time.sleep(0.05)
    raise AssertionError("F10 did not return to the editor")


@when('the editor fills terrain at ({x:f}, {y:f}) with "{terrain}"')
def fill(context, x, y, terrain):
    assert context.client.editor("fill_terrain", x=x, y=y, terrain=terrain)["ok"]


@when("a starting location is moved into a waterway")
def invalidate(context):
    assert context.client.editor("set_field", layer="starts", index=0, key="x", value=72)["ok"]
    assert context.client.editor("set_field", layer="starts", index=0, key="y", value=4)["ok"]


@then("the editor blocks playtesting the invalid map")
def validation_gate(context):
    result = context.client.editor("playtest")
    assert not result["ok"] and "start" in result["error"], result
