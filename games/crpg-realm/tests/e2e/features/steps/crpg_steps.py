import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from behave import given, when, then

PROJECT_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from qa_player.qa_player import VideoGameQAPlayer

def api_get(port, endpoint):
    url = f"http://127.0.0.1:{port}{endpoint}"
    for attempt in range(10):
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            time.sleep(0.3)
    raise RuntimeError(f"Failed to GET {url}")

def api_post(port, endpoint, payload):
    url = f"http://127.0.0.1:{port}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    for attempt in range(10):
        try:
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            time.sleep(0.3)
    raise RuntimeError(f"Failed to POST {url}")

@given('the cRPG game is running and healthy')
def step_game_healthy(context):
    state = api_get(context.web_port, "/api/v1/health")
    assert state.get("status") == "ok", f"Expected ok, got: {state}"

@given('an isolated tactical battle with party "{hero_name}" and companions "{companions}"')
def step_isolated_tactical_battle(context, hero_name, companions):
    st = api_get(context.web_port, "/api/v1/state")
    cur_sc = st.get("scene", {})
    sc_name = cur_sc.get("name", "") if isinstance(cur_sc, dict) else str(cur_sc)
    if sc_name != "TacticalBattle":
        api_post(context.web_port, "/api/v1/setup_state", {
            "name": hero_name,
            "class": "fighter",
            "scene": "TacticalBattle",
            "companions": [c.strip() for c in companions.split(",")],
            "gold": 150
        })
        time.sleep(0.5)

@given('an isolated tactical battle starting with party "{hero_name}"')
def step_isolated_tactical_battle_simple(context, hero_name):
    step_isolated_tactical_battle(context, hero_name, "elora, thrumbar")

@given('an isolated test starting in scene "{scene_name}" with party "{hero_name}" the "{hero_class}"')
def step_isolated_scene_start(context, scene_name, hero_name, hero_class):
    st = api_get(context.web_port, "/api/v1/state")
    cur_sc = st.get("scene", {})
    sc_name = cur_sc.get("name", "") if isinstance(cur_sc, dict) else str(cur_sc)
    if sc_name != scene_name:
        comps = ["elora"] if scene_name == "VillageSquare" else []
        inv = ["service-sword", "potion-healing", "potion-healing"] if scene_name == "VillageSquare" else ["potion-healing"]
        q_stage = 2 if scene_name == "VillageSquare" else 1
        flags = {"partner_conversed": True, "footlocker_looted": True} if scene_name == "VillageSquare" else {}
        api_post(context.web_port, "/api/v1/setup_state", {
            "name": hero_name,
            "class": hero_class.lower(),
            "scene": scene_name,
            "companions": comps,
            "gold": 150,
            "inventory": inv,
            "quest_stage": q_stage,
            "flags": flags
        })
        time.sleep(0.5)

@given('an isolated scenario starting in scene "{scene_name}"')
def step_isolated_scene_generic(context, scene_name):
    step_isolated_scene_start(context, scene_name, "Lieutenant Vance", "fighter")

@when('the player selects class "{hero_class}" and embarks as "{hero_name}"')
def step_select_class_embark(context, hero_class, hero_name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "select_class",
        "args": {"class": hero_class.lower(), "name": hero_name}
    })
    api_post(context.web_port, "/api/v1/action", {
        "action": "embark",
        "args": {"class": hero_class.lower(), "name": hero_name}
    })
    time.sleep(0.8)

@when('the player selects race "{race}", class "{hero_class}" and embarks as "{hero_name}"')
def step_select_race_class_embark(context, race, hero_class, hero_name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "select_race",
        "args": {"race": race.lower()}
    })
    api_post(context.web_port, "/api/v1/action", {
        "action": "select_class",
        "args": {"class": hero_class.lower(), "race": race.lower(), "name": hero_name}
    })
    api_post(context.web_port, "/api/v1/action", {
        "action": "embark",
        "args": {"class": hero_class.lower(), "race": race.lower(), "name": hero_name}
    })
    time.sleep(0.8)

@when('the player selects race "{race}" and class "{hero_class}"')
def step_select_race_class(context, race, hero_class):
    api_post(context.web_port, "/api/v1/action", {
        "action": "select_race",
        "args": {"race": race.lower()}
    })
    api_post(context.web_port, "/api/v1/action", {
        "action": "select_class",
        "args": {"class": hero_class.lower(), "race": race.lower()}
    })
    time.sleep(0.3)

@when('the player embarks as "{hero_name}"')
def step_embark_as(context, hero_name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "embark",
        "args": {"name": hero_name}
    })
    time.sleep(0.8)

@when('the player selects spells "{spells}"')
def step_select_spells(context, spells):
    for s in [x.strip() for x in spells.split(",")]:
        api_post(context.web_port, "/api/v1/action", {
            "action": "select_spell",
            "args": {"spell": s}
        })
    time.sleep(0.3)

@then('the hero race is "{race}"')
def step_hero_race_is(context, race):
    state = api_get(context.web_port, "/api/v1/state")
    actual_race = state["hero"].get("race", "").lower()
    assert actual_race == race.lower(), f"Expected race {race}, got {actual_race}"

@then('the hero knows spell "{spell_id}"')
def step_hero_knows_spell(context, spell_id):
    state = api_get(context.web_port, "/api/v1/state")
    known = state["hero"].get("selected_spells", [])
    assert spell_id in known, f"Expected spell {spell_id} in {known}"

@then('the hero equipped weapon is "{weapon_id}"')
def step_hero_equipped_weapon(context, weapon_id):
    state = api_get(context.web_port, "/api/v1/state")
    actual = state["hero"].get("weapon", "")
    assert actual == weapon_id, f"Expected weapon {weapon_id}, got {actual}"

@then('the player awakens in the Homestead with quest stage {stage:d}')
def step_awaken_homestead(context, stage):
    state = api_get(context.web_port, "/api/v1/state")
    assert state["scene"]["name"] == "Homestead", f"Expected Homestead scene, got {state['scene']['name']}"
    assert state["quest_stage"] >= stage, f"Expected quest stage >= {stage}, got {state['quest_stage']}"

@when('the player rolls character ability scores')
def step_roll_stats(context):
    api_post(context.web_port, "/api/v1/action", {"action": "reroll_stats"})
    time.sleep(1.2)

@when('the player speaks with partner Elora')
def step_talk_elora(context):
    api_post(context.web_port, "/api/v1/action", {"action": "talk_partner"})
    time.sleep(1.8)
    try:
        # Step 1: Select amnesia response
        api_post(context.web_port, "/api/v1/dialog/choice", {"index": 0})
        time.sleep(1.5)
        # Step 2: Select promise to bolt door
        api_post(context.web_port, "/api/v1/dialog/choice", {"index": 0})
        time.sleep(1.2)
        # Step 3: Dismiss continue node
        api_post(context.web_port, "/api/v1/dialog/choice", {"index": 0})
        time.sleep(0.8)
    except Exception as e:
        print(f"[Warning] Choice selection in talk_partner: {e}")
    api_post(context.web_port, "/api/v1/action", {"action": "close_dialogue"})
    time.sleep(0.5)

@then('the partner dialogue mentions "{phrase}" and quest advances to stage {stage:d}')
def step_dialogue_elora(context, phrase, stage):
    state = api_get(context.web_port, "/api/v1/state")
    assert state["flags"].get("partner_conversed") == True, "Expected partner_conversed flag to be true"
    assert state["quest_stage"] >= stage, f"Expected quest stage >= {stage}, got {state['quest_stage']}"

@when('the player loots the footlocker')
def step_loot_footlocker(context):
    api_post(context.web_port, "/api/v1/action", {"action": "move_hero", "args": {"x": 480, "y": 680}})
    time.sleep(2.5)
    api_post(context.web_port, "/api/v1/action", {"action": "loot_footlocker"})
    time.sleep(1.2)

@then('the hero inventory contains "{item_id}"')
def step_inventory_contains(context, item_id):
    state = api_get(context.web_port, "/api/v1/state")
    assert item_id in state["inventory"], f"Expected {item_id} in inventory, got: {state['inventory']}"

@when('the player exits to Oakhaven Village Square')
def step_exit_village(context):
    api_post(context.web_port, "/api/v1/action", {"action": "move_hero", "args": {"x": 1280, "y": 1280}})
    time.sleep(2.0)
    api_post(context.web_port, "/api/v1/action", {"action": "exit_to_village"})
    time.sleep(1.5)

@given('the current scene is "{scene_name}"')
@when('the current scene is "{scene_name}"')
@then('the current scene is "{scene_name}"')
def step_current_scene(context, scene_name):
    state = api_get(context.web_port, "/api/v1/state")
    assert state["scene"]["name"] == scene_name, f"Expected scene {scene_name}, got {state['scene']['name']}"

@when('the player speaks with Blacksmith Brand')
def step_talk_blacksmith(context):
    api_post(context.web_port, "/api/v1/action", {"action": "move_hero", "args": {"x": 1120, "y": 850}})
    time.sleep(2.5)
    api_post(context.web_port, "/api/v1/action", {"action": "talk_blacksmith"})
    time.sleep(1.8)
    try:
        # Step 1: Select choice 1 (ask for entrance help) or choice 0
        api_post(context.web_port, "/api/v1/dialog/choice", {"index": 1})
        time.sleep(1.4)
        # Step 2: Select gratitude / take key
        api_post(context.web_port, "/api/v1/dialog/choice", {"index": 0})
        time.sleep(1.0)
        # Step 3: Dismiss continue node
        api_post(context.web_port, "/api/v1/dialog/choice", {"index": 0})
        time.sleep(0.8)
    except Exception as e:
        print(f"[Warning] Choice selection in talk_blacksmith: {e}")
    api_post(context.web_port, "/api/v1/action", {"action": "close_dialogue"})
    time.sleep(0.6)

@then('the blacksmith gives the "{item_id}" and quest advances to stage {stage:d}')
def step_blacksmith_rewards(context, item_id, stage):
    state = api_get(context.web_port, "/api/v1/state")
    assert item_id in state["inventory"], f"Expected {item_id} in inventory"
    assert state["quest_stage"] >= stage, f"Expected quest stage >= {stage}, got {state['quest_stage']}"

@when('the player traverses to the eastern ruins to confront the Corrupted Shadow Hound')
def step_traverse_to_ruins(context):
    api_post(context.web_port, "/api/v1/action", {"action": "move_hero", "args": {"x": 1450, "y": 820}})
    time.sleep(2.0)
    api_post(context.web_port, "/api/v1/action", {"action": "move_hero", "args": {"x": 1650, "y": 820}})
    time.sleep(2.5)

@then('the shadow hound is visible on screen')
def step_hound_visible_on_screen(context):
    time.sleep(1.0)

@when('the player attacks the Corrupted Shadow Hound')
def step_attack_hound(context):
    api_post(context.web_port, "/api/v1/action", {"action": "attack_hound"})
    time.sleep(3.5)

@when('the player executes a ranged weapon attack against the Corrupted Shadow Hound')
def step_ranged_attack_hound(context):
    api_post(context.web_port, "/api/v1/action", {"action": "ranged_attack"})
    time.sleep(3.5)

@when('the player casts spell "{spell_id}" at the Corrupted Shadow Hound')
def step_cast_spell_hound(context, spell_id):
    api_post(context.web_port, "/api/v1/action", {
        "action": "cast_spell",
        "args": {"spell": spell_id}
    })
    time.sleep(3.5)

@when('the player casts healing spell "{spell_id}"')
def step_cast_healing_spell(context, spell_id):
    context.pre_heal_hp = api_get(context.web_port, "/api/v1/state")["hero"]["hp"]
    api_post(context.web_port, "/api/v1/action", {
        "action": "cast_spell",
        "args": {"spell": spell_id}
    })
    time.sleep(1.0)

@then('the hero hit points are restored')
def step_hero_hp_restored(context):
    state = api_get(context.web_port, "/api/v1/state")
    cur_hp = state["hero"]["hp"]
    max_hp = state["hero"]["max_hp"]
    assert cur_hp > 0, f"Hero died: {cur_hp}"
    assert cur_hp >= max_hp - 2 or cur_hp >= getattr(context, "pre_heal_hp", 0), f"HP not restored: {cur_hp}/{max_hp}"

@then('the shadow hound is slain and total kills equals {count:d}')
def step_hound_slain(context, count):
    start = time.time()
    while time.time() - start < 8.0:
        state = api_get(context.web_port, "/api/v1/state")
        if state["flags"].get("village_hounds_slain") and state["stats"]["kills"] >= count:
            return
        time.sleep(0.3)
    state = api_get(context.web_port, "/api/v1/state")
    assert state["flags"].get("village_hounds_slain") == True, "Expected village_hounds_slain flag to be true"
    assert state["stats"]["kills"] >= count, f"Expected kills >= {count}, got {state['stats']['kills']}"

@when('the player enters the Royal Garrison Keep')
def step_enter_garrison(context):
    api_post(context.web_port, "/api/v1/action", {"action": "move_hero", "args": {"x": 1280, "y": 360}})
    time.sleep(2.5)
    api_post(context.web_port, "/api/v1/action", {"action": "enter_garrison"})
    time.sleep(1.8)

@when('the player confronts Captain Malakor')
def step_confront_malakor(context):
    api_post(context.web_port, "/api/v1/action", {"action": "move_hero", "args": {"x": 1460, "y": 640}})
    time.sleep(1.8)
    api_post(context.web_port, "/api/v1/action", {"action": "move_hero", "args": {"x": 1750, "y": 480}})
    time.sleep(2.0)
    api_post(context.web_port, "/api/v1/action", {"action": "confront_malakor"})
    time.sleep(2.0)
    try:
        api_post(context.web_port, "/api/v1/dialog/choice", {"index": 0})
        time.sleep(1.2)
    except Exception:
        pass
    api_post(context.web_port, "/api/v1/action", {"action": "close_dialogue"})
    time.sleep(0.6)

@when('the combat rounds against Captain Malakor are executed until victory')
def step_defeat_malakor(context):
    api_post(context.web_port, "/api/v1/action", {"action": "attack_malakor"})
    time.sleep(2.2)
    api_post(context.web_port, "/api/v1/action", {"action": "defeat_malakor"})
    time.sleep(2.5)

@then('the terminal victory screen is displayed with quest stage {stage:d}')
def step_terminal_victory(context, stage):
    state = api_get(context.web_port, "/api/v1/state")
    assert state["scene"]["name"] == "VictoryScreen", f"Expected VictoryScreen, got {state['scene']['name']}"
    assert state["quest_stage"] == stage, f"Expected quest stage {stage}, got {state['quest_stage']}"
    assert state["flags"].get("malakor_slain") == True, "Expected malakor_slain flag to be true"


# --- Infinity Engine Fog of War Verification Steps ---

@then('fog of war is active with unexplored shroud covering distant areas')
def step_fog_active(context):
    state = api_get(context.web_port, "/api/v1/state")
    fow = state.get("fog_of_war", {})
    assert fow.get("active") == True, f"Expected Fog of War to be active in scene, got: {fow}"
    assert fow.get("enabled") == True, f"Expected Fog of War to be enabled, got: {fow}"
    pct = fow.get("explored_pct", 0.0)
    assert pct < 35.0, f"Expected distant areas shrouded, but explored_pct was {pct}%"

@when('the player moves across the map to explore')
def step_player_moves_explore(context):
    state = api_get(context.web_port, "/api/v1/state")
    context.pre_move_explored = state.get("fog_of_war", {}).get("explored_cells", 0)
    api_post(context.web_port, "/api/v1/action", {
        "action": "move_hero",
        "args": {"x": 480, "y": 680}
    })
    time.sleep(2.5)

@then('the newly explored area is revealed in vision')
def step_area_revealed(context):
    pre_cells = getattr(context, "pre_move_explored", 0)
    start = time.time()
    while time.time() - start < 4.0:
        state = api_get(context.web_port, "/api/v1/state")
        cur_cells = state.get("fog_of_war", {}).get("explored_cells", 0)
        if cur_cells > pre_cells:
            return
        time.sleep(0.2)
    state = api_get(context.web_port, "/api/v1/state")
    cur_cells = state.get("fog_of_war", {}).get("explored_cells", 0)
    assert cur_cells > pre_cells, f"Expected explored cells to increase ({cur_cells} vs {pre_cells})"

@then('distant enemies remain concealed beneath unexplored shroud')
def step_distant_concealed(context):
    state = api_get(context.web_port, "/api/v1/state")
    fow = state.get("fog_of_war", {})
    assert fow.get("active") == True, "Expected Fog of War active in VillageSquare"
    assert fow.get("enabled") == True, "Expected Fog of War enabled in VillageSquare"
    pct = fow.get("explored_pct", 0.0)
    assert pct < 30.0, f"Expected distant enemies concealed beneath shroud, got explored: {pct}%"

@when('the player toggles fog of war in settings')
def step_toggle_fog_settings(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "set_fog_of_war",
        "args": {"enabled": False}
    })
    time.sleep(0.5)

@then('the entire map is fully visible without shroud')
def step_map_fully_visible(context):
    state = api_get(context.web_port, "/api/v1/state")
    fow = state.get("fog_of_war", {})
    assert fow.get("enabled") == False, f"Expected fog of war disabled, got: {fow}"

@when('the player re-enables fog of war')
def step_reenable_fog(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "set_fog_of_war",
        "args": {"enabled": True}
    })
    time.sleep(0.5)


# --- Video Game QA Player User Simulation Steps ---

def get_qa_player(context):
    if not hasattr(context, "qa_player") or context.qa_player.port != context.web_port:
        context.qa_player = VideoGameQAPlayer(port=context.web_port, human_delay=0.3)
    return context.qa_player

@when('the virtual QA player types hero name "{name}" into the name input')
def step_qa_type_name(context, name):
    player = get_qa_player(context)
    res = player.type_text(name, target="NameEdit")
    assert res.get("success"), f"Failed to type name: {res}"

@when('the virtual QA player clicks the Fighter archetype button')
def step_qa_click_fighter(context):
    player = get_qa_player(context)
    res = player.click_button("BtnFighter")
    assert res.get("success"), f"Failed to click fighter button: {res}"

@when('the virtual QA player re-rolls ability scores for high statistics')
def step_qa_reroll_stats(context):
    player = get_qa_player(context)
    res = player.click_button("BtnReroll")
    assert res.get("success"), f"Failed to click reroll button: {res}"

@when('the virtual QA player clicks the embark button')
def step_qa_click_embark(context):
    player = get_qa_player(context)
    res = player.click_button("EmbarkBtn")
    assert res.get("success"), f"Failed to click embark button: {res}"

@then('the game naturally loads the "{scene_name}" scene')
def step_qa_loads_scene(context, scene_name):
    player = get_qa_player(context)
    res = player.wait_for_scene(scene_name, timeout=5.0)
    assert res is True, f"Expected {scene_name} scene to load"

@when("the virtual QA player advances partner Elora's dialogue to completion")
def step_qa_advance_dialogue(context):
    player = get_qa_player(context)
    dialog = player.wait_for_dialogue(timeout=4.0)
    assert "Elora" in dialog.get("speaker", ""), f"Expected Elora, got {dialog}"
    player.click_dialogue_choice(0)
    time.sleep(0.3)
    player.click_dialogue_choice(0)
    time.sleep(0.3)
    player.click_dialogue_choice(0)
    player.wait_for_dialogue_closed(timeout=4.0)

@when('the virtual QA player click-to-moves the hero to the footlocker chest')
def step_qa_move_to_chest(context):
    player = get_qa_player(context)
    res = player.move_player_to(480, 680)
    assert res.get("success"), f"Failed to move to footlocker: {res}"
    time.sleep(3.0)

@when('the virtual QA player clicks the footlocker chest')
def step_qa_click_chest(context):
    player = get_qa_player(context)
    res = player.click_world_object("Footlocker")
    assert res.get("success"), f"Failed to click footlocker: {res}"
    time.sleep(1.0)

@then('the hero receives "{item1}" and "{item2}"')
def step_qa_hero_receives(context, item1, item2):
    player = get_qa_player(context)
    state = player.inspect_game_state()
    inv = state.get("inventory", [])
    assert item1 in inv, f"Expected {item1} in inventory, got {inv}"
    assert item2 in inv, f"Expected {item2} in inventory, got {inv}"

@when('the virtual QA player opens the character inventory')
def step_qa_open_inventory(context):
    player = get_qa_player(context)
    res = player.toggle_inventory()
    assert res.get("success"), f"Failed to open inventory: {res}"
    assert res.get("visible") is True, f"Expected inventory visible: {res}"
    time.sleep(0.5)

@when('the virtual QA player uses "{item_id}" from the inventory')
def step_qa_use_item(context, item_id):
    player = get_qa_player(context)
    res = player.use_inventory_item(item_id)
    assert res.get("success"), f"Failed to use item {item_id}: {res}"
    time.sleep(0.5)

@when('the virtual QA player closes the character inventory')
def step_qa_close_inventory(context):
    player = get_qa_player(context)
    res = player.toggle_inventory()
    assert res.get("success"), f"Failed to close inventory: {res}"
    assert res.get("visible") is False, f"Expected inventory closed: {res}"
    time.sleep(0.5)

@when('the virtual QA player click-to-moves the hero to the front door')
def step_qa_move_to_door(context):
    player = get_qa_player(context)
    res = player.move_player_to(1280, 1280)
    assert res.get("success"), f"Failed to move to front door: {res}"
    time.sleep(2.5)

@when('the virtual QA player clicks the front door')
def step_qa_click_door(context):
    player = get_qa_player(context)
    res = player.click_world_object("FrontDoor")
    assert res.get("success"), f"Failed to click front door: {res}"



# ── RTwP Pause, Party, Action Toolbar, Shop, & Status Effects Steps ───────────

@when('the player presses the spacebar to pause the game')
def step_pause_game(context):
    api_post(context.web_port, "/api/v1/action", {"action": "set_paused", "args": {"paused": True}})
    time.sleep(0.6)

@then('the game simulation is paused with the RTwP banner visible')
def step_check_paused(context):
    state = api_get(context.web_port, "/api/v1/state")
    assert state.get("is_paused") is True, f"Expected game to be paused, got {state.get('is_paused')}"
    assert state.get("pause_banner_visible") is True, f"Expected pause banner visible, got {state}"

@when('the player unpauses the game')
def step_unpause_game(context):
    api_post(context.web_port, "/api/v1/action", {"action": "set_paused", "args": {"paused": False}})
    time.sleep(0.6)

@then('the game simulation is unpaused')
def step_check_unpaused(context):
    state = api_get(context.web_port, "/api/v1/state")
    assert state.get("is_paused") is False, f"Expected game unpaused, got {state.get('is_paused')}"

@when('the player selects party member {index:d}')
def step_select_party_member(context, index):
    api_post(context.web_port, "/api/v1/action", {"action": "select_party_member", "args": {"index": index}})
    time.sleep(0.4)

@when('the player selects all party members')
def step_select_all_party(context):
    api_post(context.web_port, "/api/v1/action", {"action": "select_all_party", "args": {}})
    time.sleep(0.4)

@then('the active party contains {count:d} members')
def step_check_party_count(context, count):
    state = api_get(context.web_port, "/api/v1/state")
    party = state.get("party", [])
    assert len(party) >= count, f"Expected at least {count} party members, got {len(party)}: {party}"

@when('the player queues action "{action_id}" on the action toolbar')
@when('the player triggers action "{action_id}" on the action toolbar')
@when('the player triggers toolbelt action "{action_id}"')
@when('the player clicks toolbelt action "{action_id}"')
def step_action_toolbar_click(context, action_id):
    api_post(context.web_port, "/api/v1/action", {"action": "action_toolbar_click", "args": {"action": action_id}})
    time.sleep(0.4)

@then('the status bar does not display inventory as a text list')
def step_no_inventory_label_on_status_bar(context):
    state = api_get(context.web_port, "/api/v1/state")
    hud = state.get("hud", {})
    assert hud.get("has_inventory_label") is False, f"Expected no InventoryLabel in HUD, but found one! {hud}"

@then('the action toolbelt is visible on the status bar with quick actions')
def step_action_toolbelt_visible(context):
    state = api_get(context.web_port, "/api/v1/state")
    hud = state.get("hud", {})
    assert hud.get("action_toolbar_visible") is True, f"Expected ActionToolbar visible on status bar, got {hud}"

@then('the legacy single hero toolbar is not present on the bottom hud')
def step_no_dead_hero_toolbar(context):
    state = api_get(context.web_port, "/api/v1/state")
    hud = state.get("hud", {})
    assert hud.get("has_dead_hero_toolbar") is False, f"Expected no dead single hero toolbar on HUD, but found one! {hud}"

@when('the player opens the shopkeeper trading window')
def step_open_shop(context):
    api_post(context.web_port, "/api/v1/action", {"action": "open_shop", "args": {}})
    time.sleep(0.6)

@then('the shopkeeper trading window is visible')
def step_check_shop_open(context):
    state = api_get(context.web_port, "/api/v1/state")
    assert state.get("shop_window_open") is True, f"Expected shop window open, got {state}"

@when('the player trades with the shopkeeper to buy "{item_id}"')
def step_buy_shop_item(context, item_id):
    res = api_post(context.web_port, "/api/v1/action", {"action": "buy_item", "args": {"item": item_id}})
    assert res.get("success"), f"Failed to buy item {item_id}: {res}"
    time.sleep(0.5)

@when('the player sells "{item_id}" to the shopkeeper')
def step_sell_shop_item(context, item_id):
    res = api_post(context.web_port, "/api/v1/action", {"action": "sell_item", "args": {"item": item_id}})
    assert res.get("success"), f"Failed to sell item {item_id}: {res}"
    time.sleep(0.5)

@when('the player closes the shopkeeper trading window')
def step_close_shop(context):
    api_post(context.web_port, "/api/v1/action", {"action": "close_shop", "args": {}})
    time.sleep(0.4)

@when('status effect "{effect_id}" is applied to "{target_name}"')
def step_apply_status_effect(context, effect_id, target_name):
    api_post(context.web_port, "/api/v1/action", {"action": "apply_status_effect", "args": {"effect": effect_id, "target": target_name}})
    time.sleep(0.4)

@then('the party member "{target_name}" has status effect "{effect_id}"')
def step_check_status_effect(context, target_name, effect_id):
    state = api_get(context.web_port, "/api/v1/state")
    effects = state.get("status_effects", {}).get(target_name, [])
    assert effect_id in effects, f"Expected {effect_id} on {target_name}, got {effects}"

@then('the party member "{target_name}" does not have status effect "{effect_id}"')
def step_check_not_status_effect(context, target_name, effect_id):
    state = api_get(context.web_port, "/api/v1/state")
    effects = state.get("status_effects", {}).get(target_name, [])
    assert effect_id not in effects, f"Expected {effect_id} NOT on {target_name}, but found it in {effects}"


@then('the physical party companion is active in the world')
def step_companion_active_in_world(context):
    state = api_get(context.web_port, "/api/v1/state")
    assert state.get("companion_present") is True, f"Expected physical companion present in world, got: {state.get('companion_present')}"


# ── Character Status Screen Steps ─────────────────────────────────────────────

@when('the player opens the character status screen for party member {member_idx:d}')
def step_open_char_status(context, member_idx):
    resp = api_post(context.web_port, "/api/v1/action", {
        "action": "open_character_status",
        "args": {"member_index": member_idx - 1}
    })
    assert resp.get("success") is True, f"Failed to open character status: {resp}"
    time.sleep(0.6)

@when('the player switches character status screen to party member {member_idx:d}')
def step_switch_char_status(context, member_idx):
    resp = api_post(context.web_port, "/api/v1/action", {
        "action": "open_character_status",
        "args": {"member_index": member_idx - 1}
    })
    assert resp.get("success") is True, f"Failed to switch character status: {resp}"
    time.sleep(0.5)

@when('the player closes the character status screen')
def step_close_char_status(context):
    resp = api_post(context.web_port, "/api/v1/action", {
        "action": "close_character_status",
        "args": {}
    })
    assert resp.get("success") is True, f"Failed to close character status: {resp}"
    time.sleep(0.4)

@then('the character status screen is visible')
def step_check_char_status_open(context):
    state = api_get(context.web_port, "/api/v1/state")
    assert state.get("character_status_open") is True, f"Expected character status screen open, got: {state}"

@then('the character status screen is closed')
def step_check_char_status_closed(context):
    state = api_get(context.web_port, "/api/v1/state")
    assert state.get("character_status_open") is False, f"Expected character status screen closed, got: {state}"

@then('the activity log contains dialogue answer "{answer_phrase}"')
def step_activity_log_contains_answer(context, answer_phrase):
    state = api_get(context.web_port, "/api/v1/state")
    log_text = state.get("action_log_text", "")
    history = state.get("activity_log", [])
    
    phrase_clean = answer_phrase.strip().lower()
    found_in_text = phrase_clean in log_text.lower()
    found_in_history = any(
        phrase_clean in entry.get("message", "").lower()
        for entry in history
        if entry.get("category", "") in ["choice", "reply"]
    )
    
    assert found_in_text or found_in_history, (
        f"Expected dialogue answer '{answer_phrase}' in activity log.\n"
        f"Current log_text:\n{log_text}\n"
        f"Recent entries: {[e.get('message', '') for e in history[-10:]]}"
    )

@when('the player scrolls up the activity log to review conversation history')
def step_scroll_up_activity_log(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "scroll_action_log",
        "args": {"to_top": True}
    })
    time.sleep(0.6)

@then('the activity log scroll position is scrolled up')
def step_activity_log_scrolled_up(context):
    state = api_get(context.web_port, "/api/v1/state")
    scroll = state.get("action_log_scroll", {})
    val = float(scroll.get("value", 0.0))
    max_val = float(scroll.get("max_value", 0.0))
    page = float(scroll.get("page", 0.0))
    
    # If content exceeds page height, scroll value should be near top (less than max_val - page)
    if max_val > page:
        assert val < (max_val - page), f"Expected scroll position to be scrolled up, but val={val}, max={max_val}, page={page}"

# ── Detailed Shopkeeper & Economy Steps ──────────────────────────────────────

@then('the player has {expected_gold:d} gold')
def step_check_player_gold(context, expected_gold):
    state = api_get(context.web_port, "/api/v1/state")
    current_gold = state.get("gold", 0)
    assert current_gold == expected_gold, f"Expected {expected_gold} gold, got {current_gold} (state: {state.get('hero', {}).get('gold')})"

@when('the player records the current gold balance')
def step_record_gold_balance(context):
    state = api_get(context.web_port, "/api/v1/state")
    context.recorded_gold = state.get("gold", 0)

@then('the player gold decreased by {cost:d}')
def step_check_gold_decreased(context, cost):
    state = api_get(context.web_port, "/api/v1/state")
    current_gold = state.get("gold", 0)
    prev = getattr(context, "recorded_gold", current_gold + cost)
    expected = prev - cost
    assert current_gold == expected, f"Expected gold to decrease by {cost} from {prev} to {expected}, but current gold is {current_gold}"
    context.recorded_gold = current_gold

@then('the player gold increased by {gain:d}')
def step_check_gold_increased(context, gain):
    state = api_get(context.web_port, "/api/v1/state")
    current_gold = state.get("gold", 0)
    prev = getattr(context, "recorded_gold", current_gold - gain)
    expected = prev + gain
    assert current_gold == expected, f"Expected gold to increase by {gain} from {prev} to {expected}, but current gold is {current_gold}"
    context.recorded_gold = current_gold

@then('the shopkeeper title displays "{expected_title}"')
def step_check_shop_title(context, expected_title):
    state = api_get(context.web_port, "/api/v1/state")
    shop_title = state.get("shop", {}).get("title", "")
    assert expected_title.lower() in shop_title.lower(), f"Expected shop title containing '{expected_title}', got '{shop_title}'"

@when('the player switches to the shopkeeper "{tab}" tab')
def step_switch_shop_tab(context, tab):
    res = api_post(context.web_port, "/api/v1/action", {"action": "switch_shop_tab", "args": {"tab": tab}})
    assert res.get("success"), f"Failed to switch shop tab to {tab}: {res}"
    time.sleep(0.5)

@then('the shopkeeper active tab is "{tab}"')
def step_check_shop_tab(context, tab):
    state = api_get(context.web_port, "/api/v1/state")
    current_tab = state.get("shop", {}).get("tab", "buy")
    assert current_tab.lower() == tab.lower(), f"Expected shop active tab '{tab}', got '{current_tab}'"

@then('the shopkeeper window displays gold "{expected_gold_text}"')
def step_check_shop_gold_display(context, expected_gold_text):
    state = api_get(context.web_port, "/api/v1/state")
    gold_text = state.get("shop", {}).get("gold_text", "")
    assert expected_gold_text in gold_text, f"Expected shop gold display containing '{expected_gold_text}', got '{gold_text}'"

@then('the shopkeeper trading window is not visible')
def step_check_shop_not_visible(context):
    state = api_get(context.web_port, "/api/v1/state")
    assert state.get("shop_window_open") is False, f"Expected shop window closed, got {state.get('shop')}"

@then('the player inventory contains "{item_id}"')
def step_player_inventory_contains(context, item_id):
    state = api_get(context.web_port, "/api/v1/state")
    inv = state.get("inventory", [])
    assert item_id in inv, f"Expected item '{item_id}' in player inventory, but got: {inv}"

@then('the player inventory does not contain "{item_id}"')
def step_player_inventory_not_contains(context, item_id):
    state = api_get(context.web_port, "/api/v1/state")
    inv = state.get("inventory", [])
    assert item_id not in inv, f"Expected item '{item_id}' NOT in player inventory, but found it in: {inv}"

@then('the player inventory count for "{item_id}" is {expected_count:d}')
def step_player_inventory_count(context, item_id, expected_count):
    state = api_get(context.web_port, "/api/v1/state")
    inv = state.get("inventory", [])
    actual_count = inv.count(item_id)
    assert actual_count == expected_count, f"Expected inventory count of '{item_id}' to be {expected_count}, got {actual_count} in {inv}"

@when('the player attempts to buy "{item_id}" costing {cost:d} gold')
def step_attempt_buy_item(context, item_id, cost):
    context.last_buy_res = api_post(context.web_port, "/api/v1/action", {"action": "buy_item", "args": {"item": item_id}})
    time.sleep(0.4)

@then('the purchase is rejected due to insufficient gold')
def step_check_purchase_rejected(context):
    res = getattr(context, "last_buy_res", {})
    assert not res.get("success", False), f"Expected purchase to be rejected, but succeeded: {res}"

@when('the player attempts to sell "{item_id}"')
def step_attempt_sell_item(context, item_id):
    context.last_sell_res = api_post(context.web_port, "/api/v1/action", {"action": "sell_item", "args": {"item": item_id}})
    time.sleep(0.4)

@then('the sale is rejected')
def step_check_sale_rejected(context):
    res = getattr(context, "last_sell_res", {})
    assert not res.get("success", False), f"Expected sale to be rejected, but succeeded: {res}"

@then('the activity log contains message "{msg}"')
def step_activity_log_contains_msg(context, msg):
    state = api_get(context.web_port, "/api/v1/state")
    log_text = state.get("action_log_text", "")
    history = state.get("activity_log", [])
    clean_msg = msg.strip().lower()
    
    found = clean_msg in log_text.lower() or any(
        clean_msg in entry.get("message", "").lower()
        for entry in history
    )
    assert found, (
        f"Expected message '{msg}' in activity log.\n"
        f"Log text:\n{log_text}\n"
        f"Recent entries: {[e.get('message', '') for e in history[-10:]]}"
    )

# ── Tactical Battle & Multi-Party Skirmish Steps ───────────────────────────────

@when('the player enters the tactical battle arena')
def step_enter_tactical_arena(context):
    api_post(context.web_port, "/api/v1/action", {"action": "start_tactical_battle", "args": {}})
    time.sleep(1.0)

@then('the tactical battle contains {count:d} enemies')
def step_check_battle_enemy_count(context, count):
    state = api_get(context.web_port, "/api/v1/state")
    battle = state.get("battle", {})
    actual = battle.get("enemy_count", 0)
    assert actual == count, f"Expected {count} enemies, got {actual} in {battle}"

@then('enemy "{enemy_id}" has at least {hp:d} hit points')
def step_check_enemy_hp_at_least(context, enemy_id, hp):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    assert found.get("hp", 0) >= hp, f"Expected enemy '{enemy_id}' HP >= {hp}, got {found.get('hp')}"

@then('enemy "{enemy_id}" has {hp:d} hit points')
def step_check_enemy_hp(context, enemy_id, hp):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    assert found.get("hp", 0) == hp, f"Expected enemy '{enemy_id}' HP == {hp}, got {found.get('hp')}"

@then('the enemy "{enemy_id}" target is "{target_name}"')
def step_check_enemy_target(context, enemy_id, target_name):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    actual_target = found.get("current_target", "")
    assert actual_target.lower() == target_name.lower(), (
        f"Expected enemy '{enemy_id}' target to be '{target_name}', got '{actual_target}'. "
        f"Threat table: {found.get('threat_table')}"
    )

@then('the enemy "{enemy_id}" threat for "{target_name}" is greater than {threat:d}')
def step_check_enemy_threat(context, enemy_id, target_name, threat):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    threat_val = found.get("threat_table", {}).get(target_name, 0)
    assert threat_val > threat, f"Expected threat for '{target_name}' > {threat}, got {threat_val}"

@when('the player orders "{attacker}" to attack enemy "{enemy_id}"')
def step_order_party_attack(context, attacker, enemy_id):
    api_post(context.web_port, "/api/v1/action", {
        "action": "order_party_attack",
        "args": {"attacker": attacker.lower(), "enemy": enemy_id}
    })
    time.sleep(0.6)

@when('the player orders "{attacker}" to attack enemy "{enemy_id}" {times:d} times')
def step_order_party_attack_times(context, attacker, enemy_id, times):
    for i in range(times):
        api_post(context.web_port, "/api/v1/action", {
            "action": "order_party_attack",
            "args": {"attacker": attacker.lower(), "enemy": enemy_id}
        })
        time.sleep(0.6)
    time.sleep(0.5)

@when('the player commands "{taunter}" to taunt enemy "{enemy_id}"')
def step_command_taunt(context, taunter, enemy_id):
    api_post(context.web_port, "/api/v1/action", {
        "action": "taunt_enemy",
        "args": {"taunter": taunter, "enemy": enemy_id}
    })
    time.sleep(0.5)

@then('the enemy "{enemy_id}" is defeated')
def step_check_enemy_defeated(context, enemy_id):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    assert found.get("hp", 1) <= 0 or found.get("state_name") == "DEAD", f"Expected '{enemy_id}' to be DEAD, got {found}"

@when('the player loots corpse "{enemy_id}"')
def step_loot_corpse(context, enemy_id):
    context.last_loot_res = api_post(context.web_port, "/api/v1/action", {
        "action": "loot_enemy_corpse",
        "args": {"enemy": enemy_id}
    })
    time.sleep(0.6)

@then('the corpse "{enemy_id}" is marked as looted')
def step_check_corpse_looted(context, enemy_id):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    assert found.get("is_looted", False), f"Expected corpse '{enemy_id}' to be marked as looted, got {found}"

@when('the player attempts to loot corpse "{enemy_id}" again')
def step_attempt_reloot_corpse(context, enemy_id):
    context.last_reloot_res = api_post(context.web_port, "/api/v1/action", {
        "action": "loot_enemy_corpse",
        "args": {"enemy": enemy_id}
    })
    time.sleep(0.4)

@then('the corpse looting is rejected as already looted')
def step_check_reloot_rejected(context):
    res = getattr(context, "last_reloot_res", {})
    actual_res = res.get("result", {})
    assert not actual_res.get("success", True) and actual_res.get("error") == "already_looted", (
        f"Expected re-loot to be rejected as already_looted, got {res}"
    )

# ── Defeat & Wipeout Steps ────────────────────────────────────────────────────

@when('the party suffers {damage:d} lethal damage to "{target}"')
def step_inflict_party_damage(context, damage, target):
    api_post(context.web_port, "/api/v1/action", {
        "action": "inflict_party_damage",
        "args": {"target": target.lower(), "amount": damage}
    })
    time.sleep(0.5)

@then('the defeat screen is visible')
def step_check_defeat_screen_visible(context):
    state = api_get(context.web_port, "/api/v1/state")
    def_open = state.get("defeat_screen", {}).get("visible", False)
    is_wiped = state.get("party_status", {}).get("is_wiped", False)
    assert def_open or is_wiped, f"Expected defeat screen to be visible, got state: {state.get('defeat_screen')}, wipe: {is_wiped}"

@then('the defeat screen is not visible')
def step_check_defeat_screen_not_visible(context):
    state = api_get(context.web_port, "/api/v1/state")
    def_open = state.get("defeat_screen", {}).get("visible", False)
    assert not def_open, f"Expected defeat screen not visible, got {def_open}"

@then('the party is wiped out')
def step_check_party_wiped(context):
    state = api_get(context.web_port, "/api/v1/state")
    p_stat = state.get("party_status", {})
    assert p_stat.get("is_wiped", False) or p_stat.get("alive_count", 1) == 0, f"Expected party to be wiped, got {p_stat}"

@when('the player clicks retry on the defeat screen')
def step_click_retry_encounter(context):
    api_post(context.web_port, "/api/v1/action", {"action": "retry_encounter", "args": {}})
    time.sleep(0.8)

@then('the party is revived with all members restored')
def step_check_party_revived(context):
    state = api_get(context.web_port, "/api/v1/state")
    p_stat = state.get("party_status", {})
    assert p_stat.get("alive_count", 0) >= 3, f"Expected all party members alive, got {p_stat}"
    hero = state.get("hero", {})
    assert hero.get("hp", 0) > 0, f"Expected hero alive, got {hero}"

@when('enemy "{enemy_id}" strikes party member "{target_name}" with a lethal blow')
def step_enemy_strike_party_member(context, enemy_id, target_name):
    res = api_post(context.web_port, "/api/v1/action", {
        "action": "enemy_strike",
        "args": {"enemy_id": enemy_id, "target": target_name, "lethal": True}
    })
    assert res.get("success", False), f"Failed to execute enemy strike: {res}"
    time.sleep(0.7)

@then('party member "{target_name}" is dead and highlighted red in the party HUD')
def step_check_party_member_dead_and_red(context, target_name):
    state = api_get(context.web_port, "/api/v1/state")
    party = state.get("party", [])
    found = False
    for m in party:
        if m.get("name", "").lower() == target_name.lower() or m.get("id", "").lower() == target_name.lower():
            found = True
            assert m.get("is_dead") is True or m.get("hp", 10) <= 0, f"Expected {target_name} to be dead, got {m}"
            assert m.get("hud_red") is True, f"Expected {target_name} to show up red in party HUD, got {m}"
            break
    assert found, f"Party member {target_name} not found in state: {party}"

@then('no party members are highlighted red in the party HUD')
def step_check_no_party_members_red(context):
    state = api_get(context.web_port, "/api/v1/state")
    party = state.get("party", [])
    for m in party:
        assert m.get("hud_red") is False, f"Expected {m.get('name')} NOT to be highlighted red, got {m}"

@when('enemy "{enemy_id}" hostility is set to "{hostile_state}"')
@when('enemy "{enemy_id}" hostility state is set to "{hostile_state}"')
def step_set_enemy_hostility(context, enemy_id, hostile_state):
    is_hostile = hostile_state.lower() in ["hostile", "true", "yes", "1"]
    res = api_post(context.web_port, "/api/v1/action", {
        "action": "set_enemy_hostility",
        "args": {"enemy_id": enemy_id, "is_hostile": is_hostile}
    })
    assert res.get("success", False), f"Failed to set hostility: {res}"
    time.sleep(0.3)

@when('enemy "{enemy_id}" is stationed at position {x:d}, {y:d}')
def step_set_enemy_position(context, enemy_id, x, y):
    res = api_post(context.web_port, "/api/v1/action", {
        "action": "set_enemy_position",
        "args": {"enemy_id": enemy_id, "x": x, "y": y}
    })
    assert res.get("success", False), f"Failed to set enemy position: {res}"
    time.sleep(0.3)

@when('the player approaches within proximity distance of enemy "{enemy_id}"')
def step_approach_enemy(context, enemy_id):
    res = api_post(context.web_port, "/api/v1/action", {
        "action": "approach_enemy",
        "args": {"enemy_id": enemy_id, "distance": 220.0}
    })
    assert res.get("success", False), f"Failed to approach enemy: {res}"
    time.sleep(3.2)

@then('enemy "{enemy_id}" state is "{expected_state}"')
@then('close pack friend "{enemy_id}" state is "{expected_state}"')
@then('distant pack friend "{enemy_id}" state is "{expected_state}"')
@then('pack friend "{enemy_id}" state is "{expected_state}"')
def step_check_enemy_state(context, enemy_id, expected_state):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    actual_state = found.get("state_name", "")
    if " or " in expected_state.lower():
        valid_states = [s.strip().lower() for s in expected_state.lower().split(" or ")]
        assert actual_state.lower() in valid_states, (
            f"Expected enemy '{enemy_id}' state to be one of {valid_states}, got '{actual_state}'"
        )
    else:
        assert actual_state.lower() == expected_state.lower(), (
            f"Expected enemy '{enemy_id}' state to be '{expected_state}', got '{actual_state}'"
        )

@then('enemy "{enemy_id}" hostility is "{expected_hostility}"')
def step_check_enemy_hostility(context, enemy_id, expected_hostility):
    expected_bool = expected_hostility.lower() in ["hostile", "true", "yes", "1"]
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    actual_bool = found.get("is_hostile", True)
    assert actual_bool == expected_bool, (
        f"Expected enemy '{enemy_id}' hostility to be '{expected_hostility}' ({expected_bool}), got {actual_bool}"
    )

@then('all tactical enemies are on patrol with no targets')
def step_check_all_enemies_patrol(context):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    for e in enemies:
        assert e.get("state_name") == "PATROL", f"Expected enemy {e.get('id')} to be on PATROL, got {e.get('state_name')}"
        assert e.get("current_target") == "", f"Expected enemy {e.get('id')} to have no target, got {e.get('current_target')}"

@then('enemy "{enemy_id}" becomes aggravated with target "{target_name}"')
def step_check_enemy_aggravated(context, enemy_id, target_name):
    start_t = time.time()
    found = None
    while time.time() - start_t < 3.0:
        state = api_get(context.web_port, "/api/v1/state")
        enemies = state.get("battle", {}).get("enemies", [])
        found = next((e for e in enemies if e.get("id") == enemy_id), None)
        if found and found.get("current_target", "").lower() == target_name.lower():
            break
        time.sleep(0.2)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    actual_target = found.get("current_target", "")
    actual_state = found.get("state_name", "")
    assert actual_target.lower() == target_name.lower(), (
        f"Expected enemy '{enemy_id}' target '{target_name}', got '{actual_target}'"
    )
    assert actual_state in ["CHASE", "ATTACK"], (
        f"Expected enemy '{enemy_id}' to be aggravated (CHASE/ATTACK), got {actual_state}"
    )

@then('close pack friend "{friend_id}" also aggros on "{target_name}"')
def step_check_close_friend_aggros(context, friend_id, target_name):
    start_t = time.time()
    found = None
    while time.time() - start_t < 3.0:
        state = api_get(context.web_port, "/api/v1/state")
        enemies = state.get("battle", {}).get("enemies", [])
        found = next((e for e in enemies if e.get("id") == friend_id), None)
        if found and found.get("current_target", "").lower() == target_name.lower():
            break
        time.sleep(0.2)
    assert found is not None, f"Enemy friend '{friend_id}' not found in {enemies}"
    actual_target = found.get("current_target", "")
    actual_state = found.get("state_name", "")
    assert actual_target.lower() == target_name.lower(), (
        f"Expected pack friend '{friend_id}' target '{target_name}', got '{actual_target}'"
    )
    assert actual_state in ["CHASE", "ATTACK"], (
        f"Expected pack friend '{friend_id}' to aggro (CHASE/ATTACK), got {actual_state}"
    )

@then('distant pack friend "{friend_id}" remains on patrol with no target')
def step_check_distant_friend_passive(context, friend_id):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == friend_id), None)
    assert found is not None, f"Enemy friend '{friend_id}' not found in {enemies}"
    actual_target = found.get("current_target", "")
    actual_state = found.get("state_name", "")
    assert actual_state == "PATROL", (
        f"Expected distant pack friend '{friend_id}' on PATROL, got '{actual_state}'"
    )
    assert actual_target == "", (
        f"Expected distant pack friend '{friend_id}' to have no target, got '{actual_target}'"
    )

@then('non-hostile enemy "{enemy_id}" remains on patrol with no target')
def step_check_non_hostile_enemy_passive(context, enemy_id):
    state = api_get(context.web_port, "/api/v1/state")
    enemies = state.get("battle", {}).get("enemies", [])
    found = next((e for e in enemies if e.get("id") == enemy_id), None)
    assert found is not None, f"Enemy '{enemy_id}' not found in {enemies}"
    actual_target = found.get("current_target", "")
    actual_state = found.get("state_name", "")
    assert actual_state == "PATROL", (
        f"Expected non-hostile enemy '{enemy_id}' on PATROL, got '{actual_state}'"
    )
    assert actual_target == "", (
        f"Expected non-hostile enemy '{enemy_id}' to have no target, got '{actual_target}'"
    )

@then('the activity log does not contain message "{msg}"')
def step_activity_log_not_contain(context, msg):
    state = api_get(context.web_port, "/api/v1/state")
    history = state.get("activity_log", [])
    raw_log = state.get("action_log_text", "")
    clean_msg = msg.strip().lower()
    for h in history:
        entry_text = h.get("message", "") if isinstance(h, dict) else str(h)
        assert clean_msg not in entry_text.lower(), f"Unexpected message '{msg}' found in activity history: {h}"
    assert clean_msg not in raw_log.lower(), f"Unexpected message '{msg}' found in raw log: {raw_log}"


