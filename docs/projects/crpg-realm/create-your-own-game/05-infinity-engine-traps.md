---
title: "Game Creator: 5. Infinity Engine Traps"
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 45
permalink: /projects/crpg-realm/create-your-own-game/05-infinity-engine-traps.html
---

# 5. Infinity Engine Traps & Hazards System
{: .no_toc }

A comprehensive architectural guide to concealed floor pressure plates, explosive glyphs, modal thief sweeps, Thieves' Tools disarms, and D&D 5e saving throw triggers.
{: .fs-6 .fw-300 }

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/crpg-realm/crpg_modding_and_traps_architecture.jpg' | relative_url }}" alt="Tactical cRPG Trap Engine & Modding Architecture" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #4a3722; box-shadow: 0 4px 24px rgba(0,0,0,0.6);" />
  <p style="text-align: center; color: #b8860b; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 5.1: Infinity Engine Traps & Hazard Engine — Modal thief detection, divination spell sweeps, pulsing red danger runes, and Thieves' Tools disarm resolution.</em></p>
</div>

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Tactical Philosophy of Infinity Engine Traps

In classic Infinity Engine titles (*Baldur's Gate*, *Icewind Dale*), traps are not mere damage numbers—they are tactical pacing mechanisms that force players to respect ancient crypts, scout dangerous corridors, and deploy specialized party roles:

- **Thief Utility**: Rogues aren't just backstabbers; they are essential survival specialists whose modal search skills save the party from lethal ambushes.
- **Divination Value**: Divine spellcasters can expend spell slots (*Find Traps*) to reveal hazardous corridors when moving through territory too dangerous for foot scouting.
- **Visual Tension**: The iconic **pulsing red danger outline** gives players an unmistakable warning to stop and think before advancing.

```mermaid
flowchart TD
    subgraph Concealment["1. Concealed State"]
        Hidden["Concealed Trap Node (Trap.tscn)<br/>Invisible to party vision"]
    end

    subgraph Detection["2. Detection Phase"]
        ThiefMode["Thief Active 'Find Traps' Mode<br/>Passive Floor: 10 + WIS mod + Prof vs detectDC"]
        ClericSpell["2nd-Level Divination: Find Traps<br/>Radiates holy sight across room (No check needed)"]
        PulseOutline["Pulsing Red Hazard Highlight (Line2D)<br/>Danger label: ⚠️ [TRAP DETECTED]"]
    end

    subgraph Disarm["3. Disarm Phase"]
        ToolsCheck["Thieves' Tools Check<br/>d20 + DEX mod + Prof vs disarmDC"]
        SuccessDisarm["Success: Trap Safely Disarmed<br/>Mechanisms wedged harmlessly (Green highlight)"]
        FumbleDetonation["Critical Fumble (Nat 1 or force_fumble)<br/>💥 Accidental detonation in disarmer's face!"]
    end

    subgraph Trigger["4. Step Trigger Phase"]
        StepTrigger["Victim steps onto Area2D trigger"]
        SavingThrow["Saving Throw: d20 + save_bonus vs save_dc"]
        HalfDmg["Save Passed: Half Damage"]
        FullDmg["Save Failed: Full Damage + Condition<br/>(Poisoned, Stunned, Blinded)"]
    end

    Hidden --> ThiefMode
    Hidden --> ClericSpell
    ThiefMode --> PulseOutline
    ClericSpell --> PulseOutline
    PulseOutline --> ToolsCheck
    ToolsCheck --> SuccessDisarm
    ToolsCheck --> FumbleDetonation
    FumbleDetonation --> StepTrigger
    Hidden --> StepTrigger
    StepTrigger --> SavingThrow
    SavingThrow --> HalfDmg
    SavingThrow --> FullDmg
```

---

## Declarative Trap Schema (`data/v1/traps.json`)

All traps are defined declaratively without hardcoding:

```json
{
  "poison-dart-trap": {
    "id": "poison-dart-trap",
    "title": "Concealed Poison Dart Trap",
    "type": "floor",
    "detectDC": 13,
    "disarmDC": 14,
    "saveStat": "CON",
    "saveDC": 13,
    "damageMin": 2,
    "damageMax": 12,
    "damageType": "poison",
    "statusEffect": "poisoned",
    "statusDuration": 3,
    "description": "Pressure-sensitive stone flagstone triggering concealed wall darts coated in wyvern venom."
  },
  "glyph-of-warding": {
    "id": "glyph-of-warding",
    "title": "Glyph of Warding (Explosive Runes)",
    "type": "glyph",
    "detectDC": 15,
    "disarmDC": 15,
    "saveStat": "DEX",
    "saveDC": 14,
    "damageMin": 3,
    "damageMax": 24,
    "damageType": "fire",
    "statusEffect": "",
    "statusDuration": 0,
    "description": "Ancient glowing runes inscribed upon the crypt dais. Detonates in a roaring burst of flame when disturbed."
  }
}
```

---

## `Trap.gd`: The Hazard Component

The `Trap` class inherits from `Area2D` and handles the full state lifecycle:

```gdscript
class_name Trap
extends Area2D

signal trap_detected(trap_node: Node2D, by_actor: String)
signal trap_disarmed(trap_node: Node2D, by_actor: String)
signal trap_triggered(trap_node: Node2D, victim_name: String)

@export var trap_id: String = "poison-dart-trap"
@export var detection_radius: float = 650.0

@export var is_detected: bool = false
@export var is_disarmed: bool = false
@export var is_triggered: bool = false

var pulse_tween: Tween = null

func _ready() -> void:
    collision_layer = 1
    collision_mask = 1
    body_entered.connect(_on_body_entered)
    _sync_data_store()
    _update_visual_state()

func reveal_trap(by_actor: String = "Divine Divination") -> void:
    if is_disarmed or is_triggered:
        return
    is_detected = true
    _update_visual_state()
    GameState.trap_detected.emit(trap_id, by_actor)
    trap_detected.emit(self, by_actor)
    FloatingTextManager.spawn_status(global_position, "TRAP DETECTED!")

func _start_pulse() -> void:
    _stop_pulse()
    pulse_tween = create_tween().set_loops()
    pulse_tween.tween_property(self, "modulate:a", 0.35, 0.6).set_trans(Tween.TRANS_SINE)
    pulse_tween.tween_property(self, "modulate:a", 1.0, 0.6).set_trans(Tween.TRANS_SINE)
```

---

## Disarm Checks & Critical Fumble Detonation

When a Rogue uses Thieves' Tools to neutralize a revealed trap:

```gdscript
func disarm_trap(disarmer_name: String, force_fumble: bool = false) -> Dictionary:
    if is_disarmed:
        return {"success": true, "already_disarmed": true}
    if is_triggered:
        return {"success": false, "already_triggered": true}

    var cm = _get_combat_manager()
    var tools_bonus = 5 # +3 DEX mod, +2 Thieves' Tools proficiency
    if disarmer_name == GameState.hero_name:
        tools_bonus = GameState.get_stat_modifier(int(GameState.ability_scores.get("DEX", 14))) + 2

    var res = cm.resolve_trap_disarm(disarmer_name, tools_bonus, disarm_dc, trap_name, force_fumble)

    if res.get("success", false):
        is_disarmed = true
        _update_visual_state()
        GameState.trap_disarmed.emit(trap_id, disarmer_name)
        trap_disarmed.emit(self, disarmer_name)
        FloatingTextManager.spawn_status(global_position, "TRAP DISARMED")
        return {"success": true, "disarmed": true}
    elif res.get("fumble", false):
        # Detonate in disarmer's face!
        var trig_res = force_trigger(disarmer_name)
        return {"success": false, "fumble": true, "triggered": true, "trigger_result": trig_res}
```

---

[← 4. Items & Equipment System](/projects/crpg-realm/create-your-own-game/04-items-loot-and-inventory.html) | [Next: 6. Custom Boss Encounters →](/projects/crpg-realm/create-your-own-game/06-boss-fights-and-encounters.html)
