---
title: Controls
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 2
description: "Every keyboard and mouse binding in Realm of Heroes, with the script that handles each one."
---

# Controls
{: .no_toc }

Every keyboard and mouse input the game handles, taken from the input handlers in `games/crpg-realm/scripts/`. The *Handled in* column tells you where to look if you want to change a binding.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Mouse

| Input | Action | Handled in |
|:---|:---|:---|
| **Left-click** ground | Move the selected party members in the current formation | `HeroPlayer._unhandled_input` → `GameState.move_party_formation` |
| **Shift + left-click** ground | Queue a waypoint instead of replacing the destination | same |
| **Left-click** NPC | Talk (dialogue opens in the activity log) | `NPCCharacter._input_event` |
| **Left-click** enemy | Target / attack | `TacticalEnemy._input_event` (invisible enemies ignore clicks unless you can see invisible) |
| **Left-click** door or gate | Walk through (locked doors need their key) | `DoorPortal._input_event` → `try_enter()` |
| **Left-click** item on the ground | Pick it up | `GroundItem._input_event` |
| **Left-click** chest | Open and loot | `TreasureChest._input_event` |
| **Left-click** detected trap | Attempt to disarm | `Trap._input_event` |
| **Left-click** portrait | Select that member **and** make them party leader | `PortraitToolbar` card `gui_input` |
| **Shift + left-click** portrait | Add or remove that member from the selection | same |
| **Right-click** portrait | Open that member's status window | same |
| **Mouse wheel** over the log | Scroll the log | `ActionLog` |

## Keyboard

| Key | Action | Handled in |
|:---|:---|:---|
| **Space** | Pause / resume (real-time with pause) | `HeroPlayer._unhandled_key_input` → `GameState.toggle_pause()` |
| **1**, **2**, **3** | Select party member 1, 2 or 3 (does *not* change the leader) | `HeroPlayer` → `GameState.select_party_member()` |
| **\\** or **=** | Select the whole party | `HeroPlayer` → `GameState.select_all_party_members()` |
| **W A S D** | Move the hero directly (cancels click-to-move) | `HeroPlayer._physics_process` |
| **Arrow keys** | Pan the camera | `HeroPlayer._unhandled_key_input` |
| **Home** | Centre the camera on the hero | `HeroPlayer.center_camera_on_hero()` |
| **C** or **R** | Toggle the character sheet | `HeroPlayer` → `PartyHUD.toggle_character_status()` |
| **1**–**9** *(during dialogue)* | Choose a numbered reply | `ActionLog._unhandled_key_input` |
| **Tab** or **L** | Cycle the log size: Small (124 px) → Medium (240 px) → Large (420 px) | `ActionLog.cycle_size_mode()` |
| **Page Up / Page Down** | Scroll the log | `ActionLog` |
| **I**, **B** or **Esc** | Close the inventory | `InventoryWindow._unhandled_input` |
| **O** or **Esc** | Close the settings window | `SettingsModal._unhandled_input` |

{: .note }
**1–3** are bound twice. During a dialogue, `ActionLog` uses them to pick a reply, and `HeroPlayer` may also change the selected party member. Selection doesn't affect dialogue, so this is harmless, but keep it in mind if you add more number-key bindings.

## On-screen buttons

The HUD adds buttons for actions without a hotkey.

- **Inventory, Options and Character** buttons (`PartyHUD.gd`) open the matching windows. The inventory and settings windows have close keys but no open key.
- **Action toolbar** (`ActionToolbar.gd`):
  - Attack, Move, Guard and Pause.
  - Spell: shows the prepared spell's name.
  - Special: changes by class. Second Wind for fighters, Find Traps for rogues (shows *Traps (ON)* while active), Turn for clerics, Recovery for wizards.
  - Healing potion and antidote: each shows how many you carry.
  - Six formation buttons: Rank, Wedge, Line, Column, Square, Scatter.

The layout is in [Party Dynamics & Formations]({{ '/projects/crpg-realm/create-your-own-game/09-party-dynamics-and-formations.html' | relative_url }}).

## Changing a binding

Only **Space** is registered in Godot's Input Map (`toggle_pause` in `project.godot`). Every other key is matched on `event.keycode` inside the scripts listed above. To rebind one:

1. Change the `KEY_*` constant in that script's handler.
2. Better: add an action under **Project → Project Settings → Input Map** and switch the handler to `event.is_action_pressed("your_action")`, so players and tests can remap it later.

The BDD tests don't press keys. They call the HTTP API (for example `/api/v1/user_input/pan_camera`), so rebinding keys won't break them.
