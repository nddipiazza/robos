from behave import then


@then("Meridian Guard has weapons level {weapons:d} and armor level {armor:d}")
def upgrades(context, weapons, armor):
    levels = context.client.get_observation()["players"]["1"]["upgrades"]
    assert levels == {"weapons": weapons, "armor": armor}, levels


@then("the Workshop research controls are captured")
def capture_workshop(context):
    context.client.ui(banner=0, clear_messages=True, hover=[1732, 894])
    result = context.client.screenshot(str(context.reports_dir / "workshop-research.png"))
    assert result.get("ok"), result
