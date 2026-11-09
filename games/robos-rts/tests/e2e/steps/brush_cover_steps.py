from behave import then, when


@when("both sides hold fire for the scouting check")
def hold_fire(context):
    for unit in context.client.get_observation()["units"]:
        result = context.client.command("hold_fire", [unit["tag"]], owner=unit["owner"])
        assert result["ok"], result


@then('player 1 {visibility} see "{unit_id}" through the brush')
def brush_visibility(context, visibility, unit_id):
    visible = {unit["id"] for unit in context.client.get_observation(player=1)["units"]}
    assert (unit_id in visible) == (visibility == "can"), visible


@when("the commander captures the revealed brush")
def capture_brush(context):
    context.client.ui(banner=0, clear_messages=True, hover=[1450, 820])
    result = context.client.screenshot(str(context.reports_dir / "roadmap-brush-cover.png"))
    assert result["ok"], result
