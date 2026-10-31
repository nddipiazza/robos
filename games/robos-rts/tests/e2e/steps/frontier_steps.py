import json
import sys
from pathlib import Path
from behave import given, when, then

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from frontier_bot import FrontierBuildBot


@given('a Frontier Hunters match on "{difficulty}" difficulty with "{strategy}" AI and seed {seed:d}')
def new_match(context, difficulty, strategy, seed):
    assert context.client.new_match(difficulty, strategy, seed)["ok"]
    context.last_obs = context.client.get_observation()


@then("exactly two players each start with a main base and 12 harvesting workers")
def opening(context):
    obs = context.client.get_observation()
    assert set(obs["players"]) == {"1", "2"}
    assignments = obs["match"]["assigned_starts"]
    assert assignments["1"] != assignments["2"]
    for pid in (1, 2):
        mine = [u for u in obs["units"] if u["owner"] == pid]
        assert len(mine) == 13
        assert sum(u["unit_type"] == "colony_hub" for u in mine) == 1
        workers = [u for u in mine if u["is_worker"]]
        assert len(workers) == 12 and all(w["orders"][0]["type"] == "harvest" for w in workers)
        assert obs["players"][str(pid)]["crystal"] == 50
        assert obs["players"][str(pid)]["aether"] == 0
        assert obs["players"][str(pid)]["supply_used"] == 12
        start = obs["match"]["starts"][assignments[str(pid)]]
        hall = next(u for u in mine if u["is_structure"])
        assert hall["pos"]["x"] == start["x"] and hall["pos"]["y"] == start["y"]


@then("all eight starting sites have rich crystal and aether deposits")
def deposits(context):
    obs = context.client.get_observation()
    assert obs["map"]["width"] == obs["map"]["height"] == 256
    assert obs["map"]["water"] and obs["map"]["bridges"]
    assert obs["match"]["unlimited_resources"]
    assert len(obs["match"]["starts"]) == 8
    for slot in range(8):
        resources = [r for r in obs["resources"] if r["id"].startswith(f"start_{slot}_")]
        assert sum(r["resource_type"] == "crystal_field" for r in resources) == 8
        assert sum(r["resource_type"] == "aether_vent" for r in resources) == 2
        assert sorted(r["amount"] for r in resources if r["resource_type"]=="crystal_field")==[900]*4+[1800]*4
        assert all(r["amount"]==2250 for r in resources if r["resource_type"]=="aether_vent")
        assert all(r["unlimited"] for r in resources)


@given("two workers gathering from one-unit unlimited deposits")
def unlimited_fixture(context):
    assert context.client.load_scenario({
        "name": "Unlimited resource proof", "unlimited_resources": True,
        "resources": [{"id": "crystal", "type": "crystal_field", "x": 25, "y": 20, "amount": 1},
                      {"id": "gas", "type": "aether_vent", "x": 15, "y": 35, "amount": 1}],
        "units": [{"type": "colony_hub", "owner": 1, "x": 15, "y": 20},
                  {"type": "aether_tap", "owner": 1, "x": 15, "y": 35},
                  {"id": "miner", "type": "pioneer", "owner": 1, "x": 23, "y": 20},
                  {"id": "gas_worker", "type": "pioneer", "owner": 1, "x": 15, "y": 32}]
    })["ok"]
    obs = context.client.get_observation()
    for worker_id, resource_id in [("miner", "crystal"), ("gas_worker", "gas")]:
        worker = next(u for u in obs["units"] if u["id"] == worker_id)
        resource = next(r for r in obs["resources"] if r["id"] == resource_id)
        assert context.client.command("harvest", tags=[worker["tag"]], target_tag=resource["tag"])["ok"]


@then("both resources still contain one unit after paying multiple harvests")
def inexhaustible(context):
    obs = context.client.get_observation()
    assert all(r["amount"] == 1 and r["unlimited"] for r in obs["resources"])
    assert obs["players"]["1"]["crystal_collected"] >= 20
    assert obs["players"]["1"]["aether_collected"] >= 16


@then("seeded matches reproduce their starts and can select every site")
def seeds(context):
    covered = {1: set(), 2: set()}
    for seed in range(64):
        assert context.client.new_match(seed=seed)["ok"]
        obs = context.client.get_observation()
        for pid in (1, 2):
            covered[pid].add(obs["match"]["assigned_starts"][str(pid)])
    assert covered == {1: set(range(8)), 2: set(range(8))}
    context.client.new_match(seed=42)
    first = context.client.step(512)
    context.client.surrender()
    context.client.new_match(seed=42)
    second = context.client.step(512)
    assert first == second, "Identical seeded commands must produce identical simulation state"


def play(context, seconds, build=None):
    bot = FrontierBuildBot(context.client, build) if build else None
    trace = []
    for _ in range(seconds // 4):
        obs = context.client.get_observation()
        if obs["match"]["status"] == "finished":
            break
        if bot:
            bot.on_step(obs)
        obs = context.client.step(256)
        if obs["tick"] % 2048 == 0 or obs["match"]["status"] == "finished":
            trace.append({"time": obs["sim_time"], "players": obs["players"], "match": obs["match"], "units": len(obs["units"])})
    context.last_obs = context.client.get_observation()
    context.produced = bot.produced if bot else set()
    slug = f"frontier-{context.last_obs['match'].get('difficulty')}-{context.last_obs['match'].get('strategy')}-{build or 'idle'}"
    (context.reports_dir / f"{slug}.json").write_text(json.dumps(trace, indent=2), encoding="utf-8")
    assert context.last_obs["match"]["status"] == "finished", f"Match timed out at {context.last_obs['sim_time']}s: {trace[-1:]}"


@when('the player plays the "{build}" build at accelerated speed for up to {seconds:d} game seconds')
def play_build(context, build, seconds):
    play(context, seconds, build)


@when("the player remains idle for up to {seconds:d} accelerated game seconds")
def play_idle(context, seconds):
    play(context, seconds)


@then("the match ends by destroying every structure of the defeated player")
def terminal_result(context):
    obs = context.last_obs
    result = obs["match"]
    assert result["status"] == "finished" and result["reason"] == "all_structures_destroyed"
    assert result["winner"] in (1, 2)
    if result.get("difficulty") == "easy":
        assert result["winner"] == 1, "The rush build should be able to defeat Easy AI"
    loser = 3 - result["winner"]
    assert not any(u["is_structure"] and u["owner"] == loser for u in obs["units"])
    assert any(u["is_structure"] and u["owner"] == result["winner"] for u in obs["units"])


@then("both commanders harvested resources and built their armies from scratch")
def macro_evidence(context):
    for p in context.last_obs["players"].values():
        assert p["crystal_collected"] >= 500 and p["structures_built"] >= 2, p
        assert p["units_killed"] > 0, p


@then('the player produced a "{unit}" through the build order')
def produced(context, unit):
    assert unit in context.produced, context.produced


@then("the finished match rejects commands and freezes further simulation")
def freezes(context):
    before = context.client.get_observation(0)
    tag = before["units"][0]["tag"]
    assert not context.client.command("move", tags=[tag], x=96, y=96)["ok"]
    assert context.client.step(1024) == before


@then("the AI wins by eliminating the human structures")
def ai_wins(context):
    terminal_result(context)
    assert context.last_obs["match"]["winner"] == 2


@given("a skirmish base-race fixture with an expansion and surviving workers")
def base_race(context):
    assert context.client.load_scenario({
        "name": "Annihilation expansion regression", "victory": "all_structures",
        "map": {"width": 128, "height": 96}, "units": [
            {"id": "home", "type": "colony_hub", "owner": 1, "x": 18, "y": 30},
            {"id": "attackers", "type": "breacher", "owner": 1, "x": 50, "y": 30, "count": 6},
            {"id": "enemy_main", "type": "colony_hub", "owner": 2, "x": 65, "y": 30, "hp": 100},
            {"id": "expansion", "type": "silo", "owner": 2, "x": 100, "y": 30, "hp": 100, "build_progress": 0.5},
            {"id": "survivor", "type": "pioneer", "owner": 2, "x": 100, "y": 75}
        ]})["ok"]


def destroy(context, identifier):
    obs = context.client.get_observation()
    target = next(u for u in obs["units"] if u["id"] == identifier)
    tags = [u["tag"] for u in obs["units"] if u["owner"] == 1 and not u["is_structure"]]
    assert context.client.command("attack_target", tags=tags, target_tag=target["tag"])["ok"]
    for _ in range(30):
        obs = context.client.step(64)
        if not any(u["id"] == identifier for u in obs["units"]):
            context.last_obs = obs
            return
    assert False, f"Attack failed to destroy {identifier}"


@when("the attackers destroy the main base")
def destroy_main(context):
    destroy(context, "enemy_main")


@then("the match continues while the expansion survives")
def expansion_survives(context):
    assert context.last_obs["match"]["status"] == "playing"
    assert any(u["id"] == "expansion" for u in context.last_obs["units"])


@when("the attackers destroy the expansion")
def destroy_expansion(context):
    destroy(context, "expansion")


@then("player 1 wins while enemy workers are still alive")
def player_wins(context):
    assert context.last_obs["match"]["winner"] == 1
    assert any(u["owner"] == 2 and u["is_worker"] for u in context.last_obs["units"])


@when("the player surrenders")
def surrender(context):
    assert context.client.surrender()["ok"]


@then("the AI wins by surrender")
def surrender_result(context):
    result = context.client.get_observation()["match"]
    assert result["status"] == "finished" and result["winner"] == 2 and result["reason"] == "surrender"


@when("a new Frontier Hunters match starts")
def restart(context):
    assert context.client.new_match()["ok"]


@then("military units cannot be trained at the main base")
def illegal_training(context):
    obs = context.client.get_observation()
    assert not context.client.command("train_rifleman", unit_type="colony_hub")["ok"]
    assert context.client.get_observation() == obs


@then("only workers can build valid unoccupied structures with required technology")
def illegal_building(context):
    obs = context.client.get_observation()
    hall = next(u for u in obs["units"] if u["owner"] == 1 and u["is_structure"])
    worker = next(u for u in obs["units"] if u["owner"] == 1 and u["is_worker"])
    for tags, kind, pos in [([hall["tag"]], "silo", {"x": 96, "y": 96}),
                             ([worker["tag"]], "missing", {"x": 96, "y": 96}),
                             ([worker["tag"]], "silo", hall["pos"]),
                             ([worker["tag"]], "silo", {"x": -5, "y": 96}),
                             ([worker["tag"]], "workshop", {"x": 96, "y": 96})]:
        assert not context.client.command("build_" + kind, tags=tags, x=pos["x"], y=pos["y"])["ok"]
    after = context.client.get_observation()
    assert after["units"] == obs["units"] and after["players"] == obs["players"]
