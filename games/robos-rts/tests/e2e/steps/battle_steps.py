from behave import when, then


@then("the Rifleman arena has two mirrored healthy squads ready at tick zero")
def ready(context):
    obs = context.client.get_observation()
    assert obs["tick"] == 0
    assert obs["match"]["mode"] == "unit_battle"
    assert obs["match"]["status"] == "ready"
    assert context.client.health()["paused"]
    assert context.client.step(128)["tick"] == 0, "The ready arena must wait for Fight"
    assert len(obs["units"]) == 20
    sides = [[u for u in obs["units"] if u["owner"] == pid] for pid in (1, 2)]
    for squad in sides:
        assert len(squad) == 10
        assert all(u["unit_type"] == "rifleman" and u["hp"] == 45 for u in squad)
    left = sorted((u["pos"]["x"], u["pos"]["y"]) for u in sides[0])
    right = sorted((96-u["pos"]["x"], u["pos"]["y"]) for u in sides[1])
    assert left == right, (left, right)


@when("the arena fight starts")
def fight(context):
    assert context.client.battle("start")["ok"]
    obs = context.client.get_observation()
    assert obs["match"]["status"] == "playing"
    assert not context.client.battle("start")["ok"], "A running fight must not restart"


def resolve(context):
    for _ in range(60):
        obs = context.client.step(64)
        if obs["match"]["status"] == "finished":
            assert obs["match"]["reason"] == "army_eliminated"
            counts = {pid: sum(u["owner"] == pid for u in obs["units"]) for pid in (1, 2)}
            winner = obs["match"]["winner"]
            assert min(counts.values()) == 0
            assert winner in (1, 2) and counts[winner] > 0
            assert sum(p["units_killed"] for p in obs["players"].values()) == 20-len(obs["units"])
            return {"match": obs["match"], "units": obs["units"], "tick": obs["tick"]}
    raise AssertionError("Arena failed to reach elimination within 60 game seconds")


@then("the arena fight resolves through combat within 60 game seconds")
def resolved(context):
    context.first_battle = resolve(context)


@then("the completed arena rejects further commands and freezes its clock")
def frozen(context):
    obs = context.client.get_observation()
    result = context.client.command("move", tags=[u["tag"] for u in obs["units"]], x=10, y=10)
    assert result.get("accepted", 0) == 0
    assert context.client.step(128)["tick"] == obs["tick"]


@when("the arena is reset")
def reset(context):
    assert context.client.battle("reset")["ok"]


@then("the arena repeats the same combat result")
def repeated(context):
    assert resolve(context) == context.first_battle
