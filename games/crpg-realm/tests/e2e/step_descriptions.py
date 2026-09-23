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

    # Feature 14: Formations and Interchangeable Leader
    (r'the player loads a tactical party in "([^"]+)"',
     'Loading tactical battle arena "{0}" with 3-member party for formation inspection.'),
    (r'the party has (\d+) members and default leader is "([^"]+)"',
     'Verifying party composition: {0} members initialized with default leader "{1}".'),
    (r'the active formation is "([^"]+)"',
     'Verifying current tactical formation: [{0}].'),
    (r'the formation icon toolbar is visible with buttons for "([^"]+)"',
     'Auditing ActionToolbar: verifying icon-based formation controls for tactical ranks.'),
    (r'the player commands the party to move to \((\d+),\s*(\d+)\)',
     'Player orders party movement to destination ({0}, {1}) in formation ranks.'),
    (r'the active leader "([^"]+)" moves directly to destination \((\d+),\s*(\d+)\)',
     'Active leader "{0}" leads party and moves directly to destination ({1}, {2}).'),
    (r'companion "([^"]+)" independently pathfinds to rank slot (\d+) in "([^"]+)" formation',
     'Companion "{0}" pathfinds independently to assigned rank slot {1} in [{2}] formation.'),
    (r'all party members arrive at their desired rank coordinates',
     'Verifying all party characters arrive at their distinct formation rank positions.'),
    (r'the player selects party member "([^"]+)" as the active party leader',
     'Interchangeable Leader: selecting "{0}" in portrait toolbar to promote to Party Leader.'),
    (r'the active party leader is "([^"]+)"',
     'Verifying active party leader promoted to "{0}".'),
    (r'the portrait toolbar displays the leader crown badge on "([^"]+)"',
     'Verifying golden crown badge 👑 [LEADER] displayed on "{0}" portrait card.'),
    (r'protagonist "([^"]+)" acts symmetrically as a follower and pathfinds to rank slot (\d+)',
     'Protagonist "{0}" acts symmetrically as follower: moving independently to assigned rank slot {1}.'),
    (r'companion "([^"]+)" pathfinds to rank slot (\d+) in "([^"]+)" formation',
     'Companion "{0}" takes up tactical rank slot {1} in [{2}] formation.'),
    (r'the camera smoothly tracks the active party leader',
     'Verifying dynamic camera tracking: viewport smoothly follows active party leader.'),
    (r'the player selects formation "([^"]+)" from the action toolbar',
     'Tactical Formations: clicking [{0}] formation button in ActionToolbar.'),
    (r'the "([^"]+)" formation icon is highlighted on the action toolbar',
     'Verifying [{0}] formation icon highlighted with active cyan/gold border.'),
    (r'the leader moves to \((\d+),\s*(\d+)\)',
     'Active leader leads march and arrives at waypoint ({0}, {1}).'),
    (r'the followers align into rank coordinates forming a V-shape wedge',
     'Verifying V-formation: followers flank leader at angled spearhead coordinates.'),
    (r'the party members line up abreast perpendicular to the travel vector',
     'Verifying Shield Wall Line: party members line up abreast perpendicular to travel vector.'),
    (r'the party members align in a single-file column behind the leader',
     'Verifying Marching Column: party members line up in single file along travel vector.'),
    (r'the active leader "([^"]+)" leads the party to \((\d+),\s*(\d+)\)',
     'Leader "{0}" leads party to destination ({1}, {2}).'),
    (r'companions "([^"]+)" and "([^"]+)" position themselves at the defensive square rank coordinates',
     'Verifying Defensive Square: "{0}" and "{1}" hold perimeter corners in box formation.'),

    # Feature 15: Classic 8d6 Fireball AoE Spell & Goblin Crowd Decimation
    (r'an isolated goblin crowd encounter with wizard "([^"]+)" and (\d+) goblins of (\d+) HP each',
     'Setting up classic encounter: Wizard "{0}" confronts a tightly packed horde of {1} Goblins ({2} HP each).'),
    (r'the wizard hero has class "([^"]+)" and (\d+) HP',
     'Verifying wizard hero class archetype "{0}" and base vitality {1} HP.'),
    (r'the tactical battle contains (\d+) goblins with (\d+) HP each',
     'Verifying battlefield populated with {0} hostile Goblins ({1} HP each) clustered around campsite.'),
    (r'the wizard targets the goblin crowd at \((\d+),\s*(\d+)\) and casts "([^"]+)"',
     'Wizard targets goblin crowd coordinates ({0}, {1}) and channels 3rd-level evocation spell "{2}".'),
    (r'a fiery projectile streaks to the target point and detonates in a 20ft radius explosion',
     'Fiery projectile streaks 150ft across the arena and detonates in a 20ft (180px) radius blast sphere.'),
    (r'the spell rolls authentic 8d6 fire damage with minimum 8 damage',
     'Resolving authentic 8d6 fire damage dice roll (min 8, avg 28, max 48) without mocked stats.'),
    (r'each goblin within the 180px blast radius rolls a Dexterity saving throw vs DC (\d+)',
     'Each goblin caught in 180px blast sphere rolls D&D 5e Dexterity saving throw (d20 + 2) vs Spell Save DC {0}.'),
    (r'all (\d+) goblins take lethal fire damage exceeding their (\d+) HP',
     'Fire blast inflicts lethal fire damage on all {0} goblins, exceeding their {1} HP threshold.'),
    (r'all (\d+) goblins are slain simultaneously by the fire blast',
     'All {0} goblins fall simultaneously, transitioning to State.DEAD and leaving lootable corpses.'),
    (r'the activity log records the fiery explosion and goblin deaths',
     'Verifying activity log entries documenting Fireball detonation, saving throw checks, and goblin demise.'),
    (r'the tactical battle signals total victory over the goblin horde',
     'Combat manager verifies all hostile enemies eliminated, triggering total victory state.'),
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
