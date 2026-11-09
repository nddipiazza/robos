import json
import os
from pathlib import Path
import subprocess
import time

from behave import given, then, when

from frontier_bot import FrontierBuildBot
from live_match import PlayerActions


@given("a finite Iron Narrows soak match starts with standard economies")
def prepare_soak(context):
    assert context.realtime, "Use --realtime --tags=@soak"
    if context.live_headless:
        context.scenario.skip("Scene and process-memory measurements require a rendered game")
        return
    client = context.client
    assert client.new_match("normal", "economy", 81, map_id="iron-narrows")["ok"]
    assert client.set_playback(paused=True, speed=1)["ok"]
    source_path = Path(__file__).resolve().parents[3] / "scenarios" / "iron-narrows.jsonld"
    source = json.loads(source_path.read_text(encoding="utf-8"))
    source.update(seed=81, difficulty="normal", strategy="economy")
    obs = client.get_observation()
    shortened = {f"start_{seat}_crystal_{slot}" for seat in (0, 1) for slot in (2, 3, 4, 5)}
    source["resources"] = [
        {"id": r["id"], "type": r["resource_type"], "x": r["pos"]["x"], "y": r["pos"]["y"],
         "amount": 90 if r["id"] in shortened else r["amount"]}
        for r in obs["resources"]
    ]
    assert client.load_scenario(source)["ok"]
    assert client.set_playback(paused=True, speed=1)["ok"]
    context.soak_opening = _opening_signature(client.get_observation())
    assert context.soak_opening["banks"] == [(50, 0), (50, 0)]
    assert context.soak_opening["rosters"] == [["colony_hub"] + ["pioneer"] * 12] * 2
    context.soak_proof = {"seed": 81, "map": "iron-narrows", "shortened": sorted(shortened)}


@when("the player runs a paid economy and army on the live clock")
def play_soak(context):
    client = context.client
    actions = PlayerActions(client)
    bot = FrontierBuildBot(actions, "economy")
    assert client.set_playback(paused=False, speed=8)["ok"]
    end_time = time.monotonic() + 240
    last_decision = -4
    last_kills = 0
    waves = []
    expanded = False
    expansion_ordered = False
    while time.monotonic() < end_time:
        obs = client.get_observation()
        seconds = obs["sim_time"]
        kills = sum(p["units_killed"] for p in obs["players"].values())
        if kills > last_kills and (not waves or seconds - waves[-1] >= 12):
            waves.append(seconds)
        last_kills = kills
        expanded |= any(sum(u["owner"] == seat and u["unit_type"] == "colony_hub"
                            and u["build_progress"] == 1 for u in obs["units"]) > 1 for seat in (1, 2))
        if seconds >= 360 or obs["match"]["status"] == "finished":
            break
        if seconds - last_decision >= 4:
            actions.observe(obs)
            if expansion_ordered:
                bot.on_step(obs)
            elif obs["players"]["1"]["crystal"] >= 400:
                mine = [u for u in obs["units"] if u["owner"] == 1]
                hub = next(u for u in mine if u["unit_type"] == "colony_hub")
                site = min(obs["match"]["expansions"], key=lambda pos: bot.distance(hub["pos"], pos))
                builder = min((u for u in mine if u["is_worker"]), key=lambda u: bot.distance(u["pos"], site))
                expansion_ordered = actions.command("build_colony_hub", tags=[builder["tag"]], x=site["x"], y=site["y"])["ok"]
            last_decision = seconds
        time.sleep(0.04)
    else:
        raise AssertionError("The live soak exceeded its wall-clock deadline")
    context.soak_proof.update(seconds=seconds, expanded=expanded, combat_waves=waves, kills=kills,
                              depleted=sum(r["resource_type"] == "crystal_field" and r["amount"] == 0 for r in obs["resources"]),
                              accepted_commands=sum(c["accepted"] for c in actions.commands))


@then("the live match sustained depletion, an expansion and repeated combat")
def check_soak(context):
    proof = context.soak_proof
    assert proof["seconds"] >= 300 and proof["depleted"] >= 2 and proof["expanded"], proof
    assert len(proof["combat_waves"]) >= 2 and proof["kills"] >= 5 and proof["accepted_commands"] > 10, proof
    assert context.client.health()["manual_step_requests"] == 0


@when("the player restarts the same match four times and pays for a worker each time")
def replay_soak(context):
    client = context.client
    measurements = []
    for _ in range(4):
        if client.get_observation()["match"]["status"] == "playing":
            assert client.surrender()["ok"]
        assert client.rematch()["ok"]
        assert client.set_playback(paused=True, speed=1)["ok"]
        time.sleep(0.30)
        obs = client.get_observation()
        assert _opening_signature(obs) == context.soak_opening
        ui = client.ui()["state"]
        assert not ui["selected"] and not ui["control_group_members"] and not ui["scorecard_visible"]
        performance = client._request("GET", "/performance")
        measurements.append({"nodes": performance["scene_nodes"], "rss_bytes": _rss(context.godot_proc.pid)})
        hub = next(u for u in obs["units"] if u["unit_type"] == "colony_hub" and u["owner"] == 1)
        assert client.command("train_pioneer", tags=[hub["tag"]])["accepted"] == 1
        assert client.set_playback(paused=False, speed=8)["ok"]
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            if client.get_observation()["players"]["1"]["units_trained"] == 1:
                break
            time.sleep(0.08)
        else:
            raise AssertionError("The live rematch never completed its paid worker")
    context.soak_proof["rematches"] = measurements


@then("the rematches reset the battlefield without growing its scene nodes or memory")
def check_rematches(context):
    proof = context.soak_proof
    samples = proof["rematches"]
    assert len(samples) == 4 and all(s["nodes"] > 0 and s["rss_bytes"] > 0 for s in samples), samples
    stable = samples[1:]
    assert max(s["nodes"] for s in stable) - min(s["nodes"] for s in stable) <= 4, samples
    assert stable[-1]["rss_bytes"] <= stable[0]["rss_bytes"] + 32 * 1024**2, samples
    assert context.client.health()["manual_step_requests"] == 0
    (context.reports_dir / "finite-skirmish-soak.json").write_text(json.dumps(proof, indent=2), encoding="utf-8")
    print(json.dumps(proof), flush=True)


def _opening_signature(obs):
    return {
        "banks": [(obs["players"][p]["crystal"], obs["players"][p]["aether"]) for p in ("1", "2")],
        "rosters": [sorted(u["unit_type"] for u in obs["units"] if u["owner"] == seat) for seat in (1, 2)],
        "queues": [u["production_queue_len"] for u in obs["units"]],
        "deposits": [(r["id"], r["amount"]) for r in obs["resources"]],
    }


def _rss(pid):
    if os.name == "nt":
        output = subprocess.check_output(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                                          f"(Get-Process -Id {int(pid)}).WorkingSet64"],
                                         creationflags=subprocess.CREATE_NO_WINDOW, text=True)
        return int(output.strip())
    return int(subprocess.check_output(["ps", "-o", "rss=", "-p", str(pid)], text=True).strip()) * 1024
