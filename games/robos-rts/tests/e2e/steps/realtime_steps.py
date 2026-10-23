import json
import os
import time
from behave import given, when, then
from map_authoring_steps import editor_ready
from live_match import LiveMatch


@given('the editor saves a "{build}" scenario against "{difficulty}" "{strategy}" AI with seed {seed:d}')
def author_match(context, build, difficulty, strategy, seed):
    assert context.realtime, "Run this feature with --realtime or --realtime-headless"
    editor_ready(context)
    client = context.client
    assert client.editor("load", slug="frontier-hunters")["ok"]
    slug = f"{build}-vs-{difficulty}-{strategy}-{seed}"
    if "performance" in context.scenario.effective_tags:
        slug += "-responsiveness"
    for key, value in {"id": f"live-{slug}", "label": f"Live: {build} vs {difficulty} {strategy}",
                       "seed": seed, "difficulty": difficulty, "strategy": strategy}.items():
        assert client.editor("set_map", key=key, value=value)["ok"]
    # This authored obstacle must survive save/reload and participate in navigation.
    assert client.editor("paint_terrain", x=96, y=112, terrain="water", size=1)["ok"]
    state = client.editor("state")
    assert not state["issues"], state["issues"]
    context.live = LiveMatch(context, slug, build)
    map_path = context.live.output / "scenario.jsonld"
    assert client.editor("save", path=map_path.as_posix(), overwrite=True)["ok"]
    saved = json.loads(map_path.read_text(encoding="utf-8"))
    assert saved["mode"] == "skirmish" and saved["unlimited_resources"]
    assert len(saved["map"]["starts"]) == 8 and len(saved["map"]["terrain_tiles"]) == 1
    assert client.editor("load", path=map_path.as_posix())["ok"]
    assert client.editor("state")["scenario"] == saved
    context.live.capture_editor()


@given("the saved scenario opens as a paused playtest with the standard opening")
def playtest_saved(context):
    assert context.client.editor("playtest", paused=True)["ok"]
    time.sleep(0.2)  # Let the real scene transition/render settle while the clock is paused.
    obs = context.client.get_observation()
    assert context.client.set_playback(paused=True, speed=1)["ok"]
    assert obs["tick"] == 0, "Editor playtest must stay paused until the opening is checked"
    assert obs["match"]["mode"] == "1p_vs_ai" and set(obs["players"]) == {"1", "2"}
    for pid in (1, 2):
        mine = [u for u in obs["units"] if u["owner"] == pid]
        assert len(mine) == 13 and sum(u["is_worker"] for u in mine) == 12
        assert sum(u["is_structure"] for u in mine) == 1
        assert obs["players"][str(pid)]["crystal"] == 50
        assert obs["players"][str(pid)]["aether"] == 0
    assert len(obs["map"]["terrain_tiles"]) == 1
    assert context.client.health()["manual_step_requests"] == 0
    context.live.opening = obs


@when("the player plays the authored scenario on the live game clock")
def play_live(context):
    context.live.run(speed=int(os.environ.get("RTS_TEST_SPEED", "8")))
    context.last_obs = context.live.final


@then("the match has a valid structure-elimination result")
def result(context):
    obs = context.live.final
    match = obs["match"]
    assert match["status"] == "finished" and match["reason"] == "all_structures_destroyed", match
    assert match["winner"] in (1, 2)
    assert not any(u["owner"] == 3-match["winner"] and u["is_structure"] for u in obs["units"])
    assert any(u["owner"] == match["winner"] and u["is_structure"] for u in obs["units"])


@then("both sides built and fought using their starting economies")
def macro(context):
    for player in context.live.final["players"].values():
        assert player["crystal_collected"] >= 500 and player["structures_built"] >= 2, player
        assert player["units_killed"] > 0, player
    expected = "howitzer" if context.live.build == "siege" else "rifleman"
    assert expected in context.live.bot.produced, context.live.bot.produced
    assert context.live.actions.commands and all(c["owner"] == 1 for c in context.live.actions.commands)
    if context.live.opening["match"]["difficulty"] == "easy":
        assert context.live.final["match"]["winner"] == 1


@then("the live clock advanced without manual simulation steps")
def autonomous_clock(context):
    assert context.live.autonomous_ticks > 0
    assert context.live.final["tick"] > context.live.opening["tick"]
    assert context.client.health()["manual_step_requests"] == 0
    assert context.live.wall_seconds > 0


@then("the result stays frozen while the live application continues running")
def live_freeze(context):
    before = context.client.get_observation()
    time.sleep(0.2)
    assert context.client.get_observation() == before
    own = next(u for u in before["units"] if u["owner"] == before["match"]["winner"])
    assert not context.client.command("move", tags=[own["tag"]], x=128, y=128)["ok"]


@then("the unattended player lost to the built-in AI")
def idle_loss(context):
    assert context.live.final["match"]["winner"] == 2
    assert not context.live.actions.commands
