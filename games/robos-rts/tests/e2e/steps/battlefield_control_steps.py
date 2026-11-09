from math import hypot

from behave import then, when

from tactical_controls_steps import find_unit
from worker_macro_steps import click_world


@then('"{name}" has spent its starting Hub energy')
def energy_spent(context, name):
    assert find_unit(context, name)["energy"] == 0


@when("the commander clicks the power target at ({x:d}, {y:d})")
def power_target(context, x, y):
    click_world(context, x, y)


@then('"{name}" is reinforced and player 1 has {supply:d} supply capacity')
def reinforced(context, name, supply):
    assert find_unit(context, name)["supply_reinforced"]
    assert context.client.get_observation()["players"]["1"]["supply_cap"] == supply


@then('"{name}" is salvaging')
def salvaging(context, name):
    assert find_unit(context, name)["salvage_ticks"] > 0


@then("the two halls have a balanced batch of five units in production")
def balanced_batch(context):
    counts = sorted(find_unit(context, name)["production_queue_len"] for name in ("hall_a", "hall_b"))
    assert counts == [2, 3], counts


@then('the camera is tracking "{name}"')
def tracking(context, name):
    unit = find_unit(context, name)
    view = context.client.ui()["state"]
    assert view["camera_follow_tag"] == unit["tag"], view
    focus = view["camera_focus"]
    assert hypot(focus[0] - unit["pos"]["x"], focus[1] - unit["pos"]["y"]) < 0.15, view


@then("the camera has stopped tracking")
def stopped_tracking(context):
    assert context.client.ui()["state"]["camera_follow_tag"] == 0


@then("the commander can cycle and click the two battle alerts")
def cycle_alerts(context):
    history = context.client.ui()["state"]["attack_history"]
    assert len(history) == 2 and {round(point[0]) for point in history} == {25, 65}, history
    for point in history:
        context.client.key("Space")
        context.client.key("Space", pressed=False)
        assert_camera_near(context, point)
    game_map = context.client.get_observation()["map"]
    x, y = history[0]
    sx, sy = 26 + 252 * x / game_map["width"], 876 + 189 * y / game_map["height"]
    context.client.mouse(sx, sy)
    context.client.mouse(sx, sy, pressed=False)
    assert_camera_near(context, history[0])


def assert_camera_near(context, point):
    focus = context.client.ui()["state"]["camera_focus"]
    assert hypot(focus[0] - point[0], focus[1] - point[1]) < 0.1, (focus, point)


@when("the commander surrenders and records the finished match")
def record_result(context):
    result = context.client.surrender()
    assert result["ok"], result
    context.finished_match = result["match"]


@when("the commander queues a worker and starts a selection drag before surrender")
def prepare_rematch_selection(context):
    hub = next(unit for unit in context.client.get_observation()["units"]
               if unit["owner"] == 1 and unit["unit_type"] == "colony_hub")
    x, y = hub["pos"]["x"], hub["pos"]["y"]
    context.client.focus_camera(x, y, 45)
    click_world(context, x, y, height=2.0)
    assert context.client.ui()["state"]["selected"] == [hub["tag"]]
    context.client.key("1", ctrl=True)
    context.client.key("1", pressed=False)
    context.client.key("S")
    context.client.key("S", pressed=False)
    assert find_unit(context, hub["id"])["production_queue_len"] == 1
    center_x, center_y = context.client.project((x, y, 1.0))[0]
    context.client.mouse(center_x - 240, center_y - 150)
    context.rematch_drag_end = (center_x + 240, center_y + 150)
    context.client.mouse_move(*context.rematch_drag_end)


@when("the commander releases the pre-rematch selection drag")
def release_rematch_selection(context):
    context.client.mouse(*context.rematch_drag_end, pressed=False)


@then("the scorecard shows both commanders' mining totals")
def scorecard(context):
    assert context.client.ui()["state"]["scorecard_visible"]
    observation = context.client.get_observation()
    assert context.finished_match["reason"] == "surrender" and context.finished_match["winner"] == 2
    for player in ("1", "2"):
        score = context.finished_match["scorecard"][player]
        assert score["crystal_collected"] == observation["players"][player]["crystal_collected"] > 0
    result = context.client.screenshot(str(context.reports_dir / "match-scorecard.png"))
    assert result["ok"], result


@then("the same opening is ready with fresh scores")
def rematched(context):
    observation = context.client.get_observation()
    match = observation["match"]
    assert match["status"] == "playing" and "scorecard" not in match, match
    for field in ("seed", "difficulty", "strategy", "assigned_starts"):
        assert match[field] == context.finished_match[field], match
    assert all(observation["players"][seat]["crystal_collected"] == 0 for seat in ("1", "2"))
    assert observation["players"]["1"]["crystal"] == 50
    assert all(unit["production_queue_len"] == 0 for unit in observation["units"])
    ui = context.client.ui()["state"]
    assert not ui["scorecard_visible"]
    assert not ui["selected"] and not ui["control_group_members"], ui
