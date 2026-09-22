#!/usr/bin/env python3
"""
Infinity AI Agent Cucumber Step Definitions
High-level BDD steps empowering the Infinity AI Agent to autonomously
navigate, battle, cast spells, loot, and complete quests from Point A to Point B.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from behave import given, when, then

PROJECT_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from qa_player.infinity_ai_agent import InfinityAIAgent

def get_infinity_ai(context) -> InfinityAIAgent:
    if not hasattr(context, "infinity_ai") or context.infinity_ai.port != context.web_port:
        context.infinity_ai = InfinityAIAgent(port=context.web_port, human_delay=0.3)
    return context.infinity_ai


# ── High-Level Character Creation ──────────────────────────────────────────

@when('the infinity ai agent creates a character with race "{race}" and class "{hero_class}" named "{name}"')
def step_ai_create_character(context, race: str, hero_class: str, name: str):
    ai = get_infinity_ai(context)
    st = ai.create_character(race=race, hero_class=hero_class, name=name)
    context.hero_state = st

@when('the infinity ai agent creates character "{name}" as a "{race}" "{hero_class}" with spells "{spells}"')
def step_ai_create_character_spells(context, name: str, race: str, hero_class: str, spells: str):
    ai = get_infinity_ai(context)
    spell_list = [s.strip() for s in spells.split(",")]
    st = ai.create_character(race=race, hero_class=hero_class, name=name, spells=spell_list)
    context.hero_state = st


# ── High-Level Zone Questing ───────────────────────────────────────────────

@when('the infinity ai agent quests through Homestead from awakening to the village portal')
def step_ai_quest_homestead(context):
    ai = get_infinity_ai(context)
    st = ai.quest_through_homestead()
    context.last_state = st

@when('the infinity ai agent quests through Oakhaven Village Square and unlocks the garrison gate')
def step_ai_quest_village(context):
    ai = get_infinity_ai(context)
    st = ai.quest_through_village_square()
    context.last_state = st

@when('the infinity ai agent infiltrates the Garrison Keep and defeats Captain Malakor')
def step_ai_quest_keep(context):
    ai = get_infinity_ai(context)
    st = ai.quest_through_garrison_keep()
    context.last_state = st

@when('the infinity ai agent embarks and quests from "{start_point}" to "{end_point}" as "{race}" "{hero_class}"')
def step_ai_play_full_journey(context, start_point: str, end_point: str, race: str, hero_class: str):
    ai = get_infinity_ai(context)
    st = ai.play_full_journey(race=race, hero_class=hero_class, name=f"Hero {race.capitalize()}")
    context.last_state = st

@when('the infinity ai agent plays through the full campaign journey as "{race}" "{hero_class}" named "{name}" with spells "{spells}"')
def step_ai_play_full_journey_spells(context, race: str, hero_class: str, name: str, spells: str):
    ai = get_infinity_ai(context)
    spell_list = [s.strip() for s in spells.split(",")]
    st = ai.play_full_journey(race=race, hero_class=hero_class, name=name, spells=spell_list)
    context.last_state = st


# ── Tactical Arena & Combat Commands ───────────────────────────────────────

@when('the infinity ai agent commands the party to engage and vanquish all threats in the arena')
def step_ai_tactical_arena(context):
    ai = get_infinity_ai(context)
    st = ai.execute_tactical_arena_clearing()
    context.last_state = st

@when('the infinity ai agent loots all fallen enemy corpses')
def step_ai_loot_corpses(context):
    ai = get_infinity_ai(context)
    st = ai.loot_all_corpses()
    context.last_state = st

@when('the infinity ai agent attacks target "{target_name}"')
def step_ai_attack_target(context, target_name: str):
    ai = get_infinity_ai(context)
    st = ai.attack_target(target_name)
    context.last_state = st

@when('the infinity ai agent casts spell "{spell_name}" on target "{target_name}"')
def step_ai_cast_spell(context, spell_name: str, target_name: str):
    ai = get_infinity_ai(context)
    st = ai.cast_spell(spell_name, target=target_name)
    context.last_state = st


# ── High-Level Verifications ───────────────────────────────────────────────

@then('all enemies on the battlefield are defeated')
def step_ai_all_enemies_defeated(context):
    ai = get_infinity_ai(context)
    st = ai.inspect_game_state()
    enemies = st.get("battle", {}).get("enemies", [])
    for e in enemies:
        hp = e.get("hp", 0)
        state_name = e.get("state_name", "")
        assert hp <= 0 or state_name in ["DEAD", "DEFEATED"], f"Adversary '{e.get('id')}' is still active (HP: {hp}, state: {state_name})"

@then('the victory screen is visible')
def step_ai_victory_screen_visible(context):
    ai = get_infinity_ai(context)
    st = ai.inspect_game_state()
    cur_sc = st.get("scene", {})
    sc_name = cur_sc.get("name", "") if isinstance(cur_sc, dict) else str(cur_sc)
    flags = st.get("flags", {})
    assert sc_name == "VictoryScreen" or flags.get("malakor_slain", False), (
        f"Expected VictoryScreen, but current scene is '{sc_name}' and flags={flags}"
    )


# ── State Initialization & Autonomous Interaction Steps ─────────────────────

@given('the heroes have state "{state_spec}"')
def step_given_heroes_state(context, state_spec: str):
    ai = get_infinity_ai(context)
    st = ai.setup_heroes_state(state_spec)
    context.hero_state = st
    context.last_state = st

@when('the infinity ai engine handles the enemy encounters as they come')
def step_ai_handles_encounters(context):
    ai = get_infinity_ai(context)
    st = ai.handle_encounters_as_they_come()
    context.last_state = st

@when('the infinity ai agent moves to "{target_id}"')
def step_ai_move_to_target(context, target_id: str):
    ai = get_infinity_ai(context)
    st = ai.move_to(target_id)
    context.last_state = st

@when('the infinity ai agent moves to the door "{target_id}"')
def step_ai_move_to_door(context, target_id: str):
    ai = get_infinity_ai(context)
    st = ai.move_to(target_id)
    context.last_state = st

@when('the infinity ai agent talks to NPC "{npc_id}"')
def step_ai_talk_to_npc(context, npc_id: str):
    ai = get_infinity_ai(context)
    st = ai.talk_to_npc(npc_id)
    context.last_state = st

@when('the infinity ai agent picks up item "{item_id}"')
def step_ai_pickup_item(context, item_id: str):
    ai = get_infinity_ai(context)
    st = ai.pickup_item(item_id)
    context.last_state = st

@when('the infinity ai agent enters door "{door_id}"')
def step_ai_enter_door(context, door_id: str):
    ai = get_infinity_ai(context)
    st = ai.enter_door(door_id)
    context.last_state = st

@when('the infinity ai agent plays through the expanded epic campaign as "{race}" "{hero_class}" named "{name}"')
def step_ai_play_expanded_epic_campaign(context, race: str, hero_class: str, name: str):
    ai = get_infinity_ai(context)
    st = ai.play_epic_campaign_journey(race=race, hero_class=hero_class, name=name)
    context.last_state = st

@then('the party has acquired item "{item_id}"')
def step_ai_party_has_item(context, item_id: str):
    ai = get_infinity_ai(context)
    st = ai.inspect_game_state()
    inv = st.get("hero", {}).get("inventory", st.get("inventory", []))
    assert item_id in inv, f"Expected item '{item_id}' in party inventory, but inventory contains: {inv}"

@then('the quest stage is advanced to {stage:d}')
def step_ai_quest_stage_advanced(context, stage: int):
    ai = get_infinity_ai(context)
    st = ai.inspect_game_state()
    qs = st.get("hero", {}).get("quest_stage", st.get("quest_stage", 1))
    assert qs >= stage, f"Expected quest stage >= {stage}, but current stage is {qs}"

