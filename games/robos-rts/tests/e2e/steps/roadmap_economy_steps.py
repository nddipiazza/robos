from behave import then, when

from tactical_controls_steps import find_unit


@then("three workers are assigned to the unfinished extractor")
def gas_assignment(context):
    tap = find_unit(context, "tap")
    assert tap["build_progress"] < 1
    workers = [u for u in context.client.get_observation()["units"] if u["is_worker"]]
    assigned = [u for u in workers if u["orders"] and u["orders"][0]["target_tag"] == tap["tag"]]
    assert len(assigned) == 3 and all(u["cargo_amount"] == 0 for u in assigned), assigned


@then("the remaining worker is still idle")
def remaining_worker(context):
    workers = [u for u in context.client.get_observation()["units"] if u["is_worker"]]
    assert sum(not u["orders"] for u in workers) == 1


@when("the snapped build grid is captured near ({x:d}, {y:d})")
def capture_build_grid(context, x, y):
    screen = context.client.project((x, y))[0]
    context.client.ui(hover=screen, banner=0, clear_messages=True)
    result = context.client.screenshot(str(context.reports_dir / "roadmap-build-grid.png"))
    assert result["ok"], result
    context.client.ui(hover=None)
