from itertools import product

from behave import given, then, when

from title_screen_steps import click, key, menu_state


@given("the skirmish faction rosters")
def set_rosters(context):
    context.rosters = {
        "humans": ("colony_hub", "pioneer"),
        "monsters": ("brood_nest", "forager"),
        "aliens": ("heartstone", "mote"),
    }


@then("every pairing starts with twelve workers and one base per seat")
def all_matchups(context):
    for player, opponent in product(context.rosters, repeat=2):
        result = context.client.new_match(map_id="iron-narrows", seed=42, player_faction=player, ai_faction=opponent)
        assert result["ok"], result
        observation = context.client.get_observation()
        assert observation["match"]["factions"] == {"1": player, "2": opponent}
        for seat, faction in enumerate((player, opponent), 1):
            hall, worker = context.rosters[faction]
            entities = [unit for unit in observation["units"] if unit["owner"] == seat]
            assert sorted(unit["unit_type"] for unit in entities) == sorted([hall] + [worker] * 12)
            assert all(unit["orders"][0]["type"] == "harvest" for unit in entities if unit["is_worker"])
            treasury = observation["players"][str(seat)]
            assert (treasury["crystal"], treasury["aether"], treasury["supply_used"]) == (50, 0, 12)


@then("the same seed repeats the Random factions and starting sites")
def seeded_random(context):
    start_slots = context.client.get_observation()["match"]["assigned_starts"]
    rolled = set()
    for seed in range(40, 47):
        result = context.client.new_match(map_id="iron-narrows", seed=seed, player_faction="random", ai_faction="random")
        assert result["ok"], result
        match = result["match"]
        rolled.update(match["factions"].values())
        if seed == 42:
            assert match["assigned_starts"] == start_slots
    assert rolled == set(context.rosters)
    assert context.client.surrender()["ok"]
    rematch = context.client.rematch()["match"]
    for key_name in ("seed", "faction_choices", "factions", "assigned_starts"):
        assert rematch[key_name] == match[key_name]


@then("an invalid faction leaves the active match intact")
def invalid_faction(context):
    before = context.client.get_observation()["match"]
    assert not context.client.new_match(player_faction="bogus")["ok"]
    assert context.client.get_observation()["match"] == before


@given('an Iron Narrows match against the "{opponent}" {strategy} AI')
def ai_opening(context, opponent, strategy):
    difficulty = "normal" if strategy == "economy" else "hard"
    result = context.client.new_match(map_id="iron-narrows", seed=42, difficulty=difficulty, strategy=strategy, ai_faction=opponent)
    assert result["ok"], result
    context.combat_types = {
        "monsters": {"skitterling", "bile_crawler", "blight_hurler"},
        "aliens": {"sunblade", "skirmisher", "spire_walker"},
    }[opponent]
    context.finished_types = set()


@when("the commander remains idle for up to {seconds:d} game seconds")
def unattended(context, seconds):
    for remaining in range(seconds * 64, 0, -384):
        observation = context.client.step(min(384, remaining))
        context.finished_types.update(
            unit["unit_type"] for unit in observation["units"]
            if unit["owner"] == 2 and unit["build_progress"] == 1.0
        )
        if observation["match"]["status"] == "finished":
            break
    context.last_obs = observation


@then('the AI wins with paid "{supply}" and "{extractor}" structures and trained combat units')
def paid_victory(context, supply, extractor):
    match = context.last_obs["match"]
    assert (match["status"], match["winner"], match["reason"]) == ("finished", 2, "all_structures_destroyed"), match
    assert {supply, extractor}.issubset(context.finished_types), context.finished_types
    assert context.combat_types & context.finished_types, context.finished_types
    ai = context.last_obs["players"]["2"]
    assert ai["aether_collected"] > 0 and ai["crystal_collected"] > 0 and ai["units_trained"] > 0, ai


@then('the AI has a finished "{hall}" at an expansion')
def economy_expansion(context, hall):
    match = context.last_obs["match"]
    start = match["starts"][match["assigned_starts"]["2"]]
    natural = min(match["expansions"], key=lambda p: (p["x"] - start["x"])**2 + (p["y"] - start["y"])**2)
    bases = [u for u in context.last_obs["units"] if u["owner"] == 2 and u["unit_type"] == hall and u["build_progress"] == 1.0]
    assert any(base["pos"]["x"] == natural["x"] and base["pos"]["y"] == natural["y"] for base in bases), bases


@when("the commander picks Gnarl Brood versus Aurelian Concord")
def pick_factions(context):
    key(context, "Tab", shift=True)
    for button in ("Space", "Down", "Down", "Enter"):
        key(context, button)
    key(context, "Tab", shift=True)
    for button in ("Space", "Down", "Enter", "Tab", "Tab"):
        key(context, button)
    result = context.client.screenshot(str(context.reports_dir / "asymmetric-skirmish-setup.png"))
    assert result["ok"], result


@then("the battlefield starts with Brood Nest versus Heartstone")
def starting_bases(context):
    observation = context.client.get_observation()
    assert observation["match"]["factions"] == {"1": "monsters", "2": "aliens"}
    assert observation["match"]["map_id"] == "iron-narrows"
    bases = sorted(
        (unit["owner"], unit["unit_type"]) for unit in observation["units"]
        if unit["is_structure"] and unit["owner"] in (1, 2)
    )
    assert bases == [(1, "brood_nest"), (2, "heartstone")], bases


def brood_nest(context):
    return next(unit for unit in context.client.get_observation()["units"] if unit["owner"] == 1 and unit["unit_type"] == "brood_nest")


@when("the commander selects their Brood Nest")
def select_nest(context):
    nest = brood_nest(context)
    pos = nest["pos"]
    assert context.client.focus_camera(pos["x"], pos["y"], 42)["ok"]
    x, y = context.client.project((pos["x"], pos["y"], 2))[0]
    click(context, x, y)
    assert menu_state(context)["selected"] == [nest["tag"]]


@then("the Nest has independent army and Forager rallies")
def check_rallies(context):
    nest = brood_nest(context)
    for route, point in (("rally_route", (60, 44)), ("worker_rally_route", (54, 43))):
        waypoint, = nest[route]
        assert abs(waypoint["x"] - point[0]) < 0.1 and abs(waypoint["y"] - point[1]) < 0.1, waypoint


@then("the Brood production HUD is captured")
def brood_hud(context):
    context.client.ui(banner=0, clear_messages=True, hover=[1415, 825])
    result = context.client.screenshot(str(context.reports_dir / "brood-production.png"))
    assert result["ok"], result
