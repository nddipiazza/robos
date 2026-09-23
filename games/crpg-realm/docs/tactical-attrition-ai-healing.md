# Tactical Attrition Combat & Autonomous Party AI Healing Engine

The RobOS cRPG engine supports high-stakes tactical attrition encounters where parties of characters face durable, high-health opponents across prolonged real-time-with-pause (RTwP) combat rounds. To prevent player micromanagement fatigue and ensure survivability during attrition battles, the engine features an **Autonomous Party AI Healing Loop** paired with class-specific D&D 5e martial maneuvers.

---

## Technical Architecture Overview

![Tactical Attrition & Autonomous AI Healing Architecture](./images/crpg_fighter_golem_healing_arch.jpg)

```mermaid
flowchart LR
    subgraph Party["Party Composition (3 Fighters)"]
        F1["Commander Vance (100 HP)\n• Tremor Stomp (Knocks Prone)\n• 50 Toolbelt Potions"]
        F2["Sergeant Garrick (100 HP)\n• Crushing Cleave (+2d10)\n• 50 Toolbelt Potions"]
        F3["Corporal Brutus (100 HP)\n• Rallying Stomp (+2d6 Heal, +2 AC)\n• 50 Toolbelt Potions"]
    end

    subgraph HealingLoop["Autonomous Party AI Healing Loop"]
        H1["Health Monitor\n(Every combat round & on damage)"]
        H2{"HP <= 55\n(Below 55% Threshold?)"}
        H3["Administer Toolbelt\nHealing Potion (2d4+2 HP)"]
        H4["Emit Floating Text &\nLog Action [AI HEAL]"]
    end

    subgraph Golems["Enemies (3 Ancient Stone Golems)"]
        G1["Golem Alpha (500 HP)\n• Slam (4-8 dmg)\n• Threat Table"]
        G2["Golem Beta (500 HP)\n• Slam (4-8 dmg)\n• Threat Table"]
        G3["Golem Gamma (500 HP)\n• Slam (4-8 dmg)\n• Threat Table"]
    end

    G1 & G2 & G3 -->|"Balanced Slams (1d6+2)"| Party
    Party --> H1
    H1 --> H2
    H2 -->|Yes| H3
    H3 --> H4
    H4 -->|"Restores HP & Protects Heroes"| Party
    F1 -->|"Tremor Stomp (Knocks Prone)"| G1
    F2 -->|"Crushing Cleave"| G2
    F3 -->|"Rallying Stomp"| G3
```

---

## Fighter Martial Maneuvers

Each fighter possesses a specialized D&D 5e martial ability:

1. **Tremor Stomp** (`tremor-stomp`):
   - **School**: Martial Maneuver
   - **Effect**: Colossal ground slam dealing `2d8` bludgeoning damage and knocking the target **Prone**.
   - **Advantage Mechanic**: In `CombatManager.gd`, any melee attacks targeted at a creature with the `prone` condition roll with **Advantage** (taking the higher of two d20 rolls).

2. **Crushing Cleave** (`crushing-cleave`):
   - **School**: Martial Maneuver
   - **Effect**: Overpowering greatsword cleave adding `+2d10` slashing damage.

3. **Rallying Stomp** (`rallying-stomp`):
   - **School**: Martial Maneuver
   - **Effect**: War cry and defensive stomp restoring `2d6+2` hit points across all living party members and conferring a +2 AC defensive resolve bonus.

---

## Autonomous AI Healing Loop

During attrition combat against high-HP adversaries:
- Whenever a party member suffers damage or during regular combat ticks, `GameState.execute_party_auto_heal(55)` evaluates the health of all fighters.
- If any fighter's HP drops to or below **55 HP**, a party member consumes a `potion-healing` directly from their toolbelt.
- Potion consumption restores `2d4+2` (8–12 HP), logs `🧪 [AI HEAL] <Fighter> drinks Healing Potion! Restored X HP (Y -> Z/100)`, and floats green restorative numbers above their sprite.
- With 50 potions per fighter (150 total), the party can sustain hundreds of golem strikes without any risk of death.

---

## Balanced Golem Tuning

Ancient Stone Golems have 500 Hit Points each and an Armor Class of 14. Their Slam attack is tuned to `1d6+2` (4–8 damage) with a +4 attack bonus against the fighters' 18 AC:
- Moderate damage prevents any single-round burst deaths.
- The 100 HP fighters have ample rounds to react, allowing the autonomous healing engine to preserve all three heroes throughout the battle.
