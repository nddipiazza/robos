import os

from behave import given, then, when

from hold_for_dawn import HoldForDawn


@given("the real Hold for Dawn campaign opens")
def open_hold_for_dawn(context):
    assert context.realtime, "Run this feature with --realtime or --realtime-headless"
    difficulty = os.environ.get("RTS_CAMPAIGN_DIFFICULTY", "normal")
    assert context.client.load_scenario_slug("campaign-hold-for-dawn", difficulty)["ok"]
    assert context.client.pause()["ok"]
    context.live = HoldForDawn(context, difficulty)
    context.live.opening = context.client.get_observation(player=1)
    mission = context.live.opening["campaign"]
    assert mission["mission"] == 3 and mission["difficulty"] == difficulty, mission
    assert mission["rescue_in"] == 1200, mission
    assert context.client.health()["speed"] == {"hard": 1.2, "brutal": 1.4}.get(difficulty, 1.0)


@when("the commander holds both bridges and leads the rescue expeditions")
def play_hold_for_dawn(context):
    context.live.run(speed=int(os.environ.get("RTS_TEST_SPEED", "8")))


@then("the transport reaches the pad with all three militia squads rescued")
def assert_extraction(context):
    obs = context.live.final
    mission = obs["campaign"]
    assert mission["status"] == "victory" and mission["bonus_done"] == 3, mission
    assert mission["rescue_in"] == 0 and mission["waves_sent"] == mission["wave_total"], mission
    assert any(u["id"] == "evac_hub" for u in obs["units"])
    assert obs["players"]["1"]["structures_built"] >= 3
    assert obs["players"]["1"]["crystal_collected"] >= 500
    assert obs["players"]["1"]["units_killed"] >= 100
