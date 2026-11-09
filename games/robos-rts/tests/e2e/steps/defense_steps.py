from behave import given, then, when

from tactical_controls_steps import find_unit


@given("a finite Iron Narrows skirmish")
def iron_narrows(context):
    result = context.client.new_match("normal", "balanced", 9, map_id="iron-narrows", unlimited_resources=False)
    assert result["ok"] and result["match"]["map_id"] == "iron-narrows", result
    assert not result["match"]["unlimited_resources"]


@then("the Sentry fired without an attack order")
def sentry_fired(context):
    obs = context.client.get_observation()
    assert any(event.get("weapon") == "Sentry Coilgun" for event in obs["recent_events"])


@then('"{name}" is cloaked and hidden from player {player:d}')
def cloaked(context, name, player):
    unit = find_unit(context, name)
    assert unit["cloaked"] and unit["energy"] == 50, unit
    assert not any(u["tag"] == unit["tag"] for u in context.client.get_observation(player)["units"])


@then('player {player:d} can see the uncloaked "{name}"')
def revealed(context, player, name):
    unit = find_unit(context, name)
    assert not unit["cloaked"]
    assert any(u["tag"] == unit["tag"] for u in context.client.get_observation(player)["units"])


@then('"{name}" is holding fire')
def holding_fire(context, name):
    assert find_unit(context, name)["hold_fire"]


@when("the commander Alt-clicks the attack target at ({x:d}, {y:d})")
def force_target(context, x, y):
    sx, sy = context.client.project((x, y, 1.15))[0]
    context.client.mouse(sx, sy, alt=True)
    context.client.mouse(sx, sy, alt=True, pressed=False)


@then('"{name}" has taken damage')
def damaged(context, name):
    unit = find_unit(context, name)
    assert unit["hp"] < unit["max_hp"], unit


def key(context, name):
    context.client.key(name)
    context.client.key(name, pressed=False)


@when("the commander chooses Iron Narrows in the map picker")
def choose_iron_narrows(context):
    key(context, "Space")
    key(context, "Down")
    key(context, "Enter")
    assert context.client.ui()["state"]["setup_map"] == "iron-narrows"


@when("the commander chooses Glassline Basin in the map picker")
def choose_glassline_basin(context):
    for button in ("Space", "Down", "Down", "Enter"):
        key(context, button)
    assert context.client.ui()["state"]["setup_map"] == "glassline-basin"


@then("the preview shows Frontier Hunters with eight candidate starts and its bridges")
def frontier_preview(context):
    preview = context.client.ui()["state"]["map_preview"]
    assert preview["map_id"] == "frontier-hunters" and preview["starts"] == 8 and preview["bridges"] > 2


@then("the preview shows Glassline Basin with its starts, expansions, stations and blockers")
def glassline_preview(context):
    preview = context.client.ui()["state"]["map_preview"]
    assert preview == {"map_id": "glassline-basin", "starts": 2, "expansions": 4, "bridges": 0,
                       "watch_stations": 2, "route_blockers": 2}
    result = context.client.screenshot(str(context.reports_dir / "glassline-map-preview.png"))
    assert result["ok"], result


@when("the commander starts the selected map from the picker")
def start_from_map_picker(context):
    for _ in range(7):
        key(context, "Tab")
    key(context, "Enter")


@then("Glassline Basin starts with two economies and two flanking lanes")
def glassline_opening(context):
    obs = context.client.get_observation()
    assert obs["match"]["map_id"] == "glassline-basin" and not obs["match"]["unlimited_resources"], obs["match"]
    assert (obs["map"]["width"], obs["map"]["height"]) == (160, 112)
    assert len(obs["match"]["expansions"]) == 4 and len(obs["map"]["obstacles"]) == 3
    assert not context.client.ui()["state"].get("map_preview")
    for seat in (1, 2):
        assert sum(u["owner"] == seat and u["is_worker"] and u["orders"][0]["type"] == "harvest"
                   for u in obs["units"]) == 12


@then("the setup uses finite deposits")
def finite_setup(context):
    assert not context.client.ui()["state"]["setup_unlimited_resources"]


@when("the commander changes and restores the overhead health-bar mode")
def toggle_health_mode(context):
    previous = context.client.ui()["state"]["health_bar_mode"]
    for _ in range(6):
        key(context, "Tab")
    direction = "Up" if previous == 2 else "Down"
    key(context, "Space")
    key(context, direction)
    key(context, "Enter")
    assert context.client.ui()["state"]["health_bar_mode"] != previous
    key(context, "Space")
    key(context, "Down" if direction == "Up" else "Up")
    key(context, "Enter")
    assert context.client.ui()["state"]["health_bar_mode"] == previous


@when("the commander starts the selected skirmish")
def start_skirmish(context):
    key(context, "Tab")
    key(context, "Enter")


@then("Iron Narrows is running with finite deposits")
def finite_duel(context):
    obs = context.client.get_observation()
    assert obs["match"]["map_id"] == "iron-narrows"
    assert not obs["match"]["unlimited_resources"]
    assert (obs["map"]["width"], obs["map"]["height"]) == (128, 96)


@then("the observer can select the hidden enemy base")
def observe_enemy(context):
    obs = context.client.get_observation()
    base = next(u for u in obs["units"] if u["owner"] == 2 and u["unit_type"] == "colony_hub")
    assert not any(u["tag"] == base["tag"] for u in context.client.get_observation(1)["units"]), "Player fog reveals the enemy base"
    assert context.client.ui()["state"]["observer_player"] == 0, "The results shortcut did not enter observer mode"
    x, y = base["pos"]["x"], base["pos"]["y"]
    context.client.focus_camera(x, y, 40)
    sx, sy = context.client.project((x, y, 1.15))[0]
    context.client.mouse(sx, sy)
    context.client.mouse(sx, sy, pressed=False)
    selected = context.client.ui()["state"]["selected"]
    assert selected == [base["tag"]], (selected, base["tag"], sx, sy)


@then("the observer sees through player 1's fog again")
def observe_player(context):
    view = context.client.ui()["state"]
    assert view["observer_player"] == 1 and not view["selected"], view
