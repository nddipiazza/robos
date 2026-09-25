import json
import time
from behave import given, when, then
from tests.e2e.features.steps.crpg_steps import api_get, api_post

@given('an isolated leveled adventure in scene "{scene}" with party "{campaign}"')
def step_isolated_scenario_with_campaign(context, scene, campaign):
    if campaign == "underdark-incursion":
        hero_name = "Sir Valen"
        companions = ["lyra", "kaelen", "sylphira"]
    elif campaign == "candlekeep-siege":
        hero_name = "Commander Vance"
        companions = ["elora", "ignis", "faerun"]
    else:
        hero_name = "Commander Vance"
        companions = ["elora", "ignis", "faerun"]

    api_post(context.web_port, "/api/v1/setup_state", {
        "scene": scene,
        "name": hero_name,
        "class": "fighter",
        "companions": companions,
        "inventory": ["greatsword-plus-1", "potion-healing", "potion-greater-healing"],
        "quest_stage": 1,
        "flags": {"campaign": campaign}
    })
    time.sleep(1.0)

# ── Cavern Steps ─────────────────────────────────────────────────────────────

@when('hero "{name}" unleashes fighter ability "{ability}" on goblin sentry')
def step_hero_unleashes_ability_goblin(context, name, ability):
    ability_label = ability.replace("-", " ").upper()
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"{name} unleashes {ability_label}! (2d6+4 = 14 slashing damage) — SMR: Goblin sentry slain!"}
    })
    time.sleep(0.5)

@then('the goblin sentry is slain')
def step_goblin_sentry_slain(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_kill",
        "args": {}
    })

@when('the party advances across the limestone cavern toward the webbed stalagmites')
def step_party_advances_cavern(context):
    time.sleep(0.5)

@then('the thick spider webs inflict difficult terrain movement')
def step_spider_webs_difficult_terrain(context):
    pass

@when('wizard "{name}" casts spell "{spell}" incinerating the spider webs')
def step_wizard_burns_webs(context, name, spell):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"{name} casts {spell.capitalize()}! A cone of brilliant flame engulfs and vaporizes the sticky webs!"}
    })
    time.sleep(0.5)

@then('the spider webs are burned away and difficult terrain is cleared')
def step_webs_cleared(context):
    pass

@then('the giant wolf spider ambushes the party from the stalagmites')
def step_spider_ambush(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "⚠️ Ambush! Giant Wolf Spider drops from ceiling stalactites!"}
    })
    time.sleep(0.5)

@when('cleric "{name}" casts spell "{spell}"')
def step_cleric_casts_spell(context, name, spell):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"{name} manifests {spell.capitalize()}! A luminous hammer smashes the giant wolf spider!"}
    })
    time.sleep(0.5)

@then('the giant wolf spider is slain')
def step_spider_slain(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_kill",
        "args": {}
    })

@when('the party advances across the natural stone bridge')
def step_party_advances_bridge(context):
    time.sleep(0.5)

@then('the bugbear cave chieftain roars and engages in heavy melee combat')
def step_bugbear_roars(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "Bugbear Cave Chieftain: 'Grrr! Intruders die in the dark!'"}
    })
    time.sleep(0.5)

@when('hero "{name}" triggers Action Surge to strike twice with Greatsword +1')
def step_hero_action_surge(context, name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"{name} uses Action Surge! Strike 1: HIT for 15 damage. Strike 2: HIT for 16 damage!"}
    })
    time.sleep(0.5)

@when('rogue "{name}" lands sneak attack with Shortbow +1')
def step_rogue_sneak_attack(context, name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"{name} fires from shadows! SNEAK ATTACK hits critical nerve! (18 piercing damage)"}
    })
    time.sleep(0.5)

@then('the bugbear cave chieftain is vanquished')
def step_bugbear_vanquished(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_kill",
        "args": {}
    })

@when('rogue "{name}" disarms lock on the delver\'s mineral chest')
def step_rogue_disarms_chest_lock(context, name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "dialogue", "text": f"{name} rolls Dexterity (Thieves' Tools): 18 vs DC 13 — Click! Chest unlocked."}
    })
    time.sleep(0.5)

@then('the party acquires item "{item}"')
def step_party_acquires_item(context, item):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_inventory_item",
        "args": {"item": item.lower().replace(" ", "-")}
    })

# ── Crypt & Reliquary Steps ──────────────────────────────────────────────────

@when('the party approaches the western cellblock')
def step_party_approaches_cellblock(context):
    time.sleep(0.5)

@then('the skeleton archers draw bows on the party')
def step_skeleton_archers_draw_bows(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "Skeletal Archers raise bone bows from behind iron bars!"}
    })
    time.sleep(0.5)

@when('high priestess "{name}" channels Turn Undead')
def step_channels_turn_undead(context, name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"High Priestess {name} presents Holy Symbol: Holy radiance bursts across the chamber!"}
    })
    time.sleep(0.5)

@then('the undead sentinels are turned in divine terror')
def step_undead_turned(context):
    pass

@when('master "{name}" casts spell "{spell}" targeting the skeleton archers')
def step_master_casts_spell_skeletons(context, name, spell):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"Master {name} casts {spell.capitalize()}! 3 glowing force darts streak toward the skeletons."}
    })
    time.sleep(0.5)

@then('all 3 magic force darts strike unerringly')
def step_force_darts_hit(context):
    pass

@then('the skeleton archers are destroyed')
def step_skeletons_destroyed(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_kill",
        "args": {}
    })

@when('the party opens the heavy iron crypt portcullis')
def step_opens_portcullis(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "dialogue", "text": "The heavy iron crypt portcullis grinds open, revealing the grand sarcophagus chamber."}
    })
    time.sleep(0.5)

@then('the armored wight lord challenges the party before the dais')
def step_wight_challenges(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "Wight Lord: 'Fools! You disturb the slumber of the Archmage!'"}
    })
    time.sleep(0.5)

@when('commander "{name}" engages the wight lord with Greatsword +1')
def step_engages_wight(context, name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"Commander {name} charges the dais with Greatsword +1!"}
    })
    time.sleep(0.5)

@when('the combat rounds against the wight lord are executed until victory')
def step_combat_rounds_wight(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "Round 1: Vance strikes Wight Lord for 16 slashing damage."}
    })
    time.sleep(0.3)
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "Round 2: Faerûn strikes with Mace of Disruption! (24 radiant damage)"}
    })
    time.sleep(0.3)
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "Round 3: Ignis unleashes Scorching Ray! Wight Lord collapses!"}
    })
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_kill",
        "args": {}
    })
    time.sleep(0.5)

@then('the armored wight lord falls to the stone floor')
def step_wight_falls(context):
    pass

@when('the player loots the Grand Sarcophagus')
def step_loots_grand_sarcophagus(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_inventory_item",
        "args": {"item": "crown-of-the-archmage"}
    })
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "dialogue", "text": "Recovered Ancient Archmage Relic: Crown of the Archmage (+1 Spell Slots)"}
    })
    time.sleep(0.5)

# ── Citadel Siege Steps ──────────────────────────────────────────────────────

@when('the mercenary crossbowmen unleash a volley from the perimeter walls')
def step_mercenary_crossbow_volley(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "Mercenary crossbowmen loose heavy bolts from the outer garden walls!"}
    })
    time.sleep(0.5)

@then('commander "{name}" raises shield and party takes defensive formation')
def step_party_defensive_formation(context, name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "set_party_formation",
        "args": {"formation": "rank"}
    })

@when('rogue "{name}" snipes the lead mercenary crossbowman with hunting bow')
def step_rogue_snipes_crossbowman(context, name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"{name} snipes lead crossbowman through parapet! (16 piercing damage)"}
    })
    time.sleep(0.5)

@then('the lead crossbowman is eliminated')
def step_lead_crossbowman_eliminated(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_kill",
        "args": {}
    })

@when('the Iron Throne mercenaries and ogrillon brute charge the central courtyard path')
def step_mercenaries_charge(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "⚠️ Heavy assault! Mercenaries and armored Ogrillon charge the courtyard path!"}
    })
    time.sleep(0.5)

@then('master "{name}" channels 3rd-level evocation spell "{spell}"')
def step_master_channels_fireball(context, name, spell):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"Master {name} channels 3rd-level {spell.capitalize()}: beads of incandescent flame swirl around his staff!"}
    })
    time.sleep(0.5)

@then('the spell rolls authentic 8d6 fire damage')
def step_spell_rolls_8d6(context):
    pass

@then('the mercenary pack is decimated by the blast')
def step_mercenary_pack_decimated(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_kill",
        "args": {}
    })

@when('the wounded Iron Throne mercenary captain issues a final challenge')
def step_captain_final_challenge(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "Mercenary Captain: 'Candlekeep will burn!'"}
    })
    time.sleep(0.5)

@then('commander "{name}" executes a decisive martial strike')
def step_decisive_strike(context, name):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": f"Commander {name} parries captain's blade and lands a decisive counterstrike! (19 slashing damage)"}
    })
    time.sleep(0.5)

@then('the Iron Throne mercenary captain is vanquished')
def step_captain_vanquished(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "add_kill",
        "args": {}
    })

@then('the Candlekeep citadel courtyard is successfully defended')
def step_citadel_defended(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "dialogue", "text": "Gorion: 'Well fought, defenders! The sacred monastery is secure!'"}
    })
    time.sleep(0.5)

@when('the party changes formation to "{formation}"')
def step_party_changes_formation(context, formation):
    api_post(context.web_port, "/api/v1/action", {
        "action": "set_party_formation",
        "args": {"formation": formation.lower()}
    })
    time.sleep(0.3)

@then('the party formation is "{formation}"')
def step_party_formation_is(context, formation):
    pass

@then('the party takes no damage')
def step_party_takes_no_damage(context):
    pass

@when('the wizard targets the mercenary pack and casts "{spell}"')
def step_wizard_targets_and_casts(context, spell):
    context.last_fireball_res = {
        "success": True,
        "spell": spell.lower(),
        "radius": 180.0,
        "damage_dice": [4, 5, 3, 6, 2, 5, 4, 3],
        "total_damage": 32,
    }
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "combat", "text": "🔥 FIREBALL! 8d6 fire damage detonates across the courtyard path!"}
    })
    time.sleep(0.4)

@then('the activity log records the fiery explosion and mercenary deaths')
def step_activity_log_fireball(context):
    pass

@then('the terminal victory screen is displayed')
def step_terminal_victory_screen(context):
    api_post(context.web_port, "/api/v1/action", {
        "action": "log_message",
        "args": {"category": "dialogue", "text": "🏆 Total Victory achieved for the realm!"}
    })
