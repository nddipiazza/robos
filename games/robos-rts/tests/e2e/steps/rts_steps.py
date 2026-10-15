"""
rts_steps.py — Cucumber step definitions for RobOS RTS 
"""

from __future__ import annotations

import json
from behave import given, when, then


@given('the RTS test scenario "{slug}" from the knowledge graph')
def step_load_kgraph_scenario(context, slug: str) -> None:
    res = context.client.load_scenario_slug(slug)
    assert res.get("ok"), f"Failed to load scenario {slug}: {res}"
    context.last_obs = context.client.get_observation()


@given("an RTS test scenario")
def step_load_inline_scenario(context) -> None:
    data = json.loads(context.text)
    res = context.client.load_scenario(data)
    assert res.get("ok"), f"Failed to load inline scenario: {res}"
    context.last_obs = context.client.get_observation()


@when('player {player:d} issues "{command}" to unit "{unit_id}" toward ({x:f}, {y:f})')
def step_issue_command_to_unit_id(context, player: int, command: str, unit_id: str, x: float, y: float) -> None:
    obs = context.client.get_observation()
    tags = [u["tag"] for u in obs["units"] if (u["id"] == unit_id or u["unit_type"] == unit_id) and u["owner"] == player]
    assert len(tags) > 0, f"No unit matching {unit_id} for player {player}"
    res = context.client.command(command, tags=tags, x=x, y=y, owner=player)
    assert res.get("ok"), f"Command failed: {res}"


@when('player {player:d} issues "{command}" to all "{unit_type}" units')
def step_issue_command_to_type(context, player: int, command: str, unit_type: str) -> None:
    res = context.client.command(command, unit_type=unit_type, owner=player)
    assert res.get("ok"), f"Command {command} on {unit_type} failed: {res}"


@when('player {player:d} orders a worker to build "{structure_type}" at ({x:f}, {y:f})')
def step_worker_build_structure(context, player: int, structure_type: str, x: float, y: float) -> None:
    obs = context.client.get_observation()
    workers = [u["tag"] for u in obs["units"] if u["owner"] == player and u["is_worker"]]
    assert len(workers) > 0, f"No workers found for player {player}"
    res = context.client.command(f"build_{structure_type}", tags=[workers[0]], x=x, y=y, owner=player)
    assert res.get("ok"), f"Build command failed: {res}"


@when('player {player:d} enables the "{mode}" AI directive')
def step_enable_ai_directive(context, player: int, mode: str) -> None:
    res = context.client.set_directive(player, mode, True)
    assert res.get("ok"), f"Directive failed: {res}"


@when("the simulation advances {ticks:d} ticks")
def step_advance_simulation_ticks(context, ticks: int) -> None:
    context.last_obs = context.client.step(ticks)


@then('unit "{unit_id}" is within {dist:f} units of ({x:f}, {y:f})')
def step_assert_unit_near_point(context, unit_id: str, dist: float, x: float, y: float) -> None:
    obs = context.client.get_observation()
    matches = [u for u in obs["units"] if u["id"] == unit_id or u["unit_type"] == unit_id]
    assert len(matches) > 0, f"Unit {unit_id} not found in observation"
    u = matches[0]
    dx = u["pos"]["x"] - x
    dy = u["pos"]["y"] - y
    actual_d = (dx * dx + dy * dy) ** 0.5
    assert actual_d <= dist, f"Expected {unit_id} within {dist} of ({x}, {y}), but at ({u['pos']['x']}, {u['pos']['y']}) (d={actual_d:.2f})"


@then('player {player:d} has at least {count:d} surviving "{unit_type}" units')
def step_assert_surviving_unit_count(context, player: int, count: int, unit_type: str) -> None:
    obs = context.client.get_observation()
    alive = [u for u in obs["units"] if u["owner"] == player and u["unit_type"] == unit_type and u["hp"] > 0]
    assert len(alive) >= count, f"Expected player {player} to have >= {count} {unit_type}, found {len(alive)}"


@then('player {player:d} has {count:d} surviving "{unit_type}" units')
def step_assert_exact_surviving_unit_count(context, player: int, count: int, unit_type: str) -> None:
    obs = context.client.get_observation()
    alive = [u for u in obs["units"] if u["owner"] == player and u["unit_type"] == unit_type and u["hp"] > 0]
    assert len(alive) == count, f"Expected player {player} to have == {count} {unit_type}, found {len(alive)}"


@then("player {player:d} has recorded at least {min_cancels:d} stutter-step backswing cancels")
def step_assert_stutter_step_cancels(context, player: int, min_cancels: int) -> None:
    obs = context.client.get_observation()
    p = obs["players"].get(str(player), obs["players"].get(player, {}))
    cancels = int(p.get("stutter_step_cancels", 0))
    assert cancels >= min_cancels, f"Expected >= {min_cancels} stutter-step cancels for player {player}, got {cancels}"


@then("player {player:d} has executed at least {min_phase_steps:d} Skirmisher Phase Steps")
def step_assert_phase_steps_executed(context, player: int, min_phase_steps: int) -> None:
    obs = context.client.get_observation()
    p = obs["players"].get(str(player), obs["players"].get(player, {}))
    phase_steps = int(p.get("phase_steps_executed", 0))
    assert phase_steps >= min_phase_steps, f"Expected >= {min_phase_steps} Phase Steps for player {player}, got {phase_steps}"


@then("player {player:d} has collected at least {min_crystal:d} crystal")
def step_assert_crystal_collected(context, player: int, min_crystal: int) -> None:
    obs = context.client.get_observation()
    p = obs["players"].get(str(player), obs["players"].get(player, {}))
    collected = int(p.get("crystal_collected", 0))
    assert collected >= min_crystal, f"Expected >= {min_crystal} crystal collected, got {collected}"


@then("player {player:d} has supply cap of at least {min_cap:d}")
def step_assert_supply_cap(context, player: int, min_cap: int) -> None:
    obs = context.client.get_observation()
    p = obs["players"].get(str(player), obs["players"].get(player, {}))
    cap = int(p.get("supply_cap", 0))
    assert cap >= min_cap, f"Expected supply_cap >= {min_cap}, got {cap}"


@then("the simulation has reached tick {tick:d}")
def step_assert_tick_reached(context, tick: int) -> None:
    obs = context.client.get_observation()
    assert obs["tick"] >= tick, f"Expected the simulation to reach tick {tick}, got {obs['tick']}"

