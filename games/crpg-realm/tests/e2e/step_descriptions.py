"""
Step Descriptions Registry for RobOS cRPG BDD E2E Walkthroughs.
Provides narrative explanations for Cucumber steps to display on the in-engine BDD overlay.
"""

import re

STEP_PATTERNS = [
    (r'the cRPG game is running and healthy', 
     'Verifying Godot 4 engine execution and HTTP GameControlServer health.'),
    (r'the player selects race "([^"]+)" and class "([^"]+)"', 
     'Configuring character identity: selecting {0} race and {1} class archetype.'),
    (r'the player rolls character ability scores', 
     'Rolling 4d6 (drop lowest) ability scores across STR, DEX, CON, INT, WIS, and CHA.'),
    (r'the player embarks as "([^"]+)"', 
     'Finalizing character creation and embarking into the realm as {0}.'),
    (r'the current scene is "([^"]+)"', 
     'Verifying scene transition and active world map: {0}.'),
    
    # Infinity AI Agent Steps
    (r'the infinity ai agent creates a character with race "([^"]+)" and class "([^"]+)" named "([^"]+)"',
     'Infinity AI Agent onboard: creating character "{2}" ({0} {1}), rolling ability scores, and embarking.'),
    (r'the infinity ai agent creates character "([^"]+)" as a "([^"]+)" "([^"]+)" with spells "([^"]+)"',
     'Infinity AI Agent onboard: creating character "{0}" ({1} {2}), memorizing spells {3}, and embarking.'),
    (r'the infinity ai agent quests through Homestead from awakening to the village portal',
     'Infinity AI Agent Act 1: awakening in Homestead, conversing with Elora, looting armory footlocker, and exiting.'),
    (r'the infinity ai agent quests through Oakhaven Village Square and unlocks the garrison gate',
     'Infinity AI Agent Act 2: traversing Village Square, consulting Blacksmith Brand, defeating Corrupted Hound, and unlocking Keep.'),
    (r'the infinity ai agent infiltrates the Garrison Keep and defeats Captain Malakor',
     'Infinity AI Agent Act 3: breaching the Keep, showdown dialogue with Captain Malakor, tactical boss combat, and Victory!'),
    (r'the infinity ai agent plays through the full campaign journey from "([^"]+)" to "([^"]+)" as "([^"]+)" "([^"]+)"',
     'Infinity AI Agent: autonomous start-to-finish playthrough from {0} to {1} as {2} {3}.'),
    (r'the infinity ai agent commands the party to engage and vanquish all threats in the arena',
     'Infinity AI Agent: coordinating combined-arms tactical strike across party to clear all arena hostiles.'),
    (r'the infinity ai agent loots all fallen enemy corpses',
     'Infinity AI Agent: searching and harvesting all fallen enemy corpses across the battlefield.'),
    (r'the infinity ai agent attacks target "([^"]+)"',
     'Infinity AI Agent: executing targeted combat attack against {0}.'),
    (r'the infinity ai agent casts spell "([^"]+)" on target "([^"]+)"',
     'Infinity AI Agent: casting spell {0} on target {1}.'),
    (r'the heroes have state "([^"]+)"',
     'Initializing heroes and world map state: {0}.'),
    (r'the infinity ai engine handles the enemy encounters as they come',
     'Infinity AI Engine: detecting hostiles, deploying party combat routines, and clearing encounter threats.'),
    (r'the infinity ai agent moves to "([^"]+)"',
     'Infinity AI Agent: navigating collision-aware path around obstacles to reach {0}.'),
    (r'the infinity ai agent moves to the door "([^"]+)"',
     'Infinity AI Agent: pathfinding to doorway {0}.'),
    (r'the infinity ai agent talks to NPC "([^"]+)"',
     'Infinity AI Agent: approaching NPC {0}, conversing through dialogue tree, and updating quest log.'),
    (r'the infinity ai agent picks up item "([^"]+)"',
     'Infinity AI Agent: acquiring ground item {0} into party inventory.'),
    (r'the infinity ai agent enters door "([^"]+)"',
     'Infinity AI Agent: unlocking and transitioning through door portal {0}.'),
    (r'the infinity ai agent plays through the expanded epic campaign as "([^"]+)" "([^"]+)" named "([^"]+)"',
     'Infinity AI Agent: autonomous 5-act epic campaign playthrough as {0} {1} named {2}.'),
    (r'the party has acquired item "([^"]+)"',
     'Verifying party inventory contains {0}.'),
    (r'the quest stage is advanced to (\d+)',
     'Verifying quest journal progress advanced to stage {0}.'),
    (r'all enemies on the battlefield are defeated',
     'Confirming total tactical victory: all arena hostiles neutralized.'),
    (r'the victory screen is visible',
     'Validating terminal victory state: Victory Screen displayed with campaign completion summary.'),

    # Tactical Combat Arena
    (r'the player enters the tactical battle arena', 
     'Deploying party formation into the tactical arena to confront the invading enemy pack.'),
    (r'the tactical battle contains (\d+) enemies', 
     'Detecting and initializing {0} active adversaries in the tactical encounter.'),
    (r'enemy "([^"]+)" has at least (\d+) hit points', 
     'Asserting enemy {0} has initialized with at least {1} maximum hit points.'),
    (r'the player orders "([^"]+)" to attack enemy "([^"]+)" (\d+) times', 
     'Ordering {0} to execute {2} coordinated tactical strikes against enemy {1}.'),
    (r'the player orders "([^"]+)" to attack enemy "([^"]+)"', 
     'Directing {0} to engage enemy {1} in real-time tactical combat.'),
    (r'the enemy "([^"]+)" is defeated', 
     'Confirming enemy {0} hit points reduced to 0 and transitioned to defeated state.'),
    (r'(?:the\s+)?enemy "([^"]+)" target is "([^"]+)"', 
     'Validating dynamic AI targeting: enemy {0} actively focuses on {1}.'),
    (r'linked pack friend "([^"]+)" also auto-aggravates on "([^"]+)"', 
     'Validating Infinity Engine pack call-to-arms: linked friend {0} auto-aggravates to defend against {1}.'),
    (r'the enemy "([^"]+)" threat for "([^"]+)" is greater than (\d+)', 
     'Auditing Infinity Engine threat table: {1} has accumulated >{2} threat on {0}.'),
    (r'the player commands "([^"]+)" to taunt enemy "([^"]+)"', 
     '{0} executes martial taunt against {1}, forcefully diverting aggro back to tank.'),

    # Corpse Looting
    (r'the player records the current gold balance', 
     'Recording baseline party treasury balance prior to battle looting or trade.'),
    (r'the player loots corpse "([^"]+)"', 
     'Approaching and searching fallen enemy {0} corpse to collect gold and valuables.'),
    (r'the corpse "([^"]+)" is marked as looted', 
     'Confirming corpse {0} visual indicator transitions to empty stripped state.'),
    (r'the player attempts to loot corpse "([^"]+)" again', 
     'Testing anti-exploit guard: attempting duplicate search on stripped corpse {0}.'),
    (r'the corpse looting is rejected as already looted', 
     'Verifying duplicate looting attempt was cleanly rejected by the loot manager.'),
    (r'the player gold increased by (\d+)', 
     'Verifying party wealth increased by exactly {0} Gold Pieces.'),
    (r'the player gold decreased by (\d+)', 
     'Verifying party wealth decreased by exactly {0} Gold Pieces after transaction.'),
    (r'the player inventory contains "([^"]+)"', 
     'Auditing carried inventory: verifying acquisition of item "{0}".'),

    # Defeat & Wipeout
    (r'the defeat screen is not visible', 
     'Ensuring Defeat Screen modal remains hidden during normal combat operation.'),
    (r'the party suffers (\d+) lethal damage to "([^"]+)"', 
     'Simulating catastrophic lethal combat damage ({0} dmg) across party members.'),
    (r'the party is wiped out', 
     'Verifying all party members collapsed at 0 HP with [UNCONSCIOUS] condition.'),
    (r'the defeat screen is visible', 
     'Confirming full-screen Defeat Screen modal display with casualty statistics.'),
    (r'the player clicks retry on the defeat screen', 
     'Engaging "Retry Encounter" action to revive party and reset tactical arena.'),
    (r'the party is revived with all members restored', 
     'Validating party revival: unconscious condition removed and full HP restored.'),

    # General & Logging
    (r'the activity log contains message "([^"]+)"', 
     'Auditing Activity Log: verifying transparent entry "{0}".'),
    (r'the player moves to position \((\d+),\s*(\d+)\)', 
     'Navigating party leader across map terrain towards waypoint ({0}, {1}).'),
]

def get_step_description(step_type: str, step_name: str, step_docstring: str = None) -> str:
    """
    Returns a descriptive explanation for a step.
    Prefers explicit Gherkin docstrings (step_docstring) if provided.
    Falls back to regex pattern matching against STEP_PATTERNS.
    """
    if step_docstring and step_docstring.strip():
        lines = [l.strip() for l in step_docstring.strip().splitlines() if l.strip()]
        return " ".join(lines)

    for pattern, template in STEP_PATTERNS:
        match = re.search(pattern, step_name, re.IGNORECASE)
        if match:
            groups = match.groups()
            try:
                return template.format(*groups)
            except Exception:
                return template

    return f"Executing {step_type.upper()} verification: {step_name}"
