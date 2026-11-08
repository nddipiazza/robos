from itertools import combinations
from math import hypot

from behave import then, when


@when('player {player:d} sends all workers to gather from "{resource_id}"')
def send_workers(context, player, resource_id):
    obs = context.client.get_observation()
    tags = [u["tag"] for u in obs["units"] if u["owner"] == player and u["is_worker"]]
    patch = next(r for r in obs["resources"] if r["id"] == resource_id)
    result = context.client.command("harvest", tags=tags, owner=player, target_tag=patch["tag"])
    assert result["ok"], result


@then("a returning worker passes through an outbound worker")
def opposite_trips_overlap(context):
    for _ in range(120):
        workers = [u for u in context.client.step(8)["units"] if u["is_worker"]]
        for first, second in combinations(workers, 2):
            if bool(first["cargo_amount"]) == bool(second["cargo_amount"]):
                continue
            distance = hypot(first["pos"]["x"] - second["pos"]["x"], first["pos"]["y"] - second["pos"]["y"])
            if distance < 0.4 * (first["radius"] + second["radius"]):
                if context.rts_mode == "human":
                    assert context.client.focus_camera(29, 24, 32)["ok"]
                    result = context.client.screenshot(str(context.reports_dir / "mineral-walking.png"))
                    assert result["ok"], result
                return
    raise AssertionError("A loaded worker and an empty worker never overlapped")


@then("the patch is empty and player 1 has delivered exactly {amount:d} crystal")
def all_crystal_delivered(context, amount):
    obs = context.client.get_observation()
    assert obs["resources"][0]["amount"] == 0
    assert obs["players"]["1"]["crystal_collected"] == amount
