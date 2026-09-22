---
title: World Systems, Collision Pathfinding & NPC Dialogue
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 3
---

# World Systems, Collision Pathfinding & NPC Dialogue
{: .no_toc }

Deep dive into physical obstacle colliders, navigation pathfinding around buildings, multi-branch dialogue trees, and dynamic Fog of War shaders.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Physical Buildings & Collision Geometry

In earlier 2D RPG implementations, buildings were often simple background drawings where players could walk through walls or clip into rooftops. In **Tactical cRPG Realm**, every structure is a genuine physical entity with collision boundaries on Layer 1:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/crpg-realm/house_wall_navigation.png' | relative_url }}" alt="Physical House and Wall Navigation" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 1: Party navigating through safe street corridors between Farmer Giles' Cottage, Miller Hob's post, and stone ramparts with waypoint line telemetry.</em></p>
</div>

### Building Structures in Oakhaven Village:
- **`The Rusty Dragon Inn` (`HouseInn`)**: `400×160` footprint at `Vector2(700, 480)`.
- **`Brand's Forge & Armory` (`HouseBlacksmith`)**: `420×150` footprint at `Vector2(1180, 660)`.
- **`Maybelle's Remedies` (`HouseApothecary`)**: `300×180` footprint at `Vector2(380, 500)`.
- **`Oakhaven Town Hall` (`HouseTownHall`)**: `360×180` footprint at `Vector2(1650, 460)`.
- **`Farmer Giles' Cottage` (`HouseCottage`)**: `380×150` footprint at `Vector2(720, 960)`.
- **Stone Ramparts (`WallNorthLeft` & `WallNorthRight`)**: `380×80` solid stone masonry flanking the garrison gate.

All structures use `StaticBody2D` with `collision_layer = 1` and `collision_mask = 1`, blocking all character movement vectors.

---

## 2. Obstacle-Avoidance Pathfinding (`Pathfinder.gd`)

To prevent party members from getting stuck against solid walls, the navigation system employs a dual-tier pathfinding algorithm:

```mermaid
graph TD
    Start["Party Click / AI Move Command"] --> Direct{"Direct Line-of-Sight Clear?<br/><i>Physics Raycast on Layer 1</i>"}
    Direct -- Yes --> StraightLine["Move Directly to Target"]
    Direct -- No --> NavGraph["Query NavPoints & Visibility Graph<br/><i>get_nav_points()</i>"]
    NavGraph --> AStar["A* Shortest Path through Corridors"]
    AStar --> Queue["Populate Hero waypoint_queue"]
    Queue --> Smooth["Execute Smooth Movement & Arrival Bursts"]
```

### Safe Village Corridor Waypoints
`VillageSquare.gd:get_nav_points()` provides guaranteed traversable waypoints through the town:
- **Southern Plaza Trail**: `(500, 1200)` to `(800, 1200)`
- **Central Thoroughfare**: `(1280, 1100)` to `(1280, 750)`
- **Apothecary / Inn Alley**: `(540, 520)` to `(540, 680)`
- **Town Hall Eastern Plaza**: `(1850, 540)` to `(2100, 750)`
- **Garrison Gate Approach**: `(1280, 320)` to `(1280, 200)`

When the player or AI issues a movement order across town, `Pathfinder.gd` calculates intermediate waypoints avoiding all house bounding boxes.

---

## 3. 18-NPC Roster & Branching Dialogue Trees

The realm features 18 fully scripted NPCs with branching dialogue trees defined in `data/v1/dialogue.json`:

| NPC ID | Name | Role / Location | Key Interaction & Lore |
|:---|:---|:---|:---|
| `npc-id-1` | Blacksmith Brand | Village Forge | Provides the side-gate key unlocking the citadel keep. |
| `npc-id-innkeeper` | Barkeep Corwin | The Rusty Dragon | Shares rumors of corrupted hounds and shadows. |
| `npc-id-guildmaster` | Guildmaster Aldous | Town Hall | Represents the merchant guild; updates quest objectives. |
| `npc-id-herbalist` | Maybelle | Apothecary | Sells healing draughts and antidote poultices. |
| `npc-id-guard` | Captain Kenneth | Village Ramparts | Warns travelers of closed northern passes. |
| `npc-id-farmer` | Farmer Giles | South Farm | Reports strange howling in the night. |
| `npc-id-priestess` | Sister Althea | Shrine of Light | Offers blessings and divine lore. |
| `npc-id-peddler` | Goblin Sneak | Whispering Forest | Sells rare contraband and lockpicks in the woods. |
| `npc-id-fallen` | Torin | Forest Ruins | Dying adventurer warning of the crypt's guardian. |
| `npc-id-hermit` | Hermit Odo | Forest Clearing | Ancient scholar possessing knowledge of Malakor's curse. |
| `npc-id-crypt-ghost` | Sir Justin | Ancient Catacombs | Ghost of the royal knight guarding the sarcophagus key. |

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/crpg-realm/dozens_npc_dialogue.png' | relative_url }}" alt="In-Log Branching Dialogue" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 2: In-log dialogue tree with numbered responses, journal quest updates, and auto-facing.</em></p>
</div>

### Dynamic NPC Facing Behavior
When the hero approaches and clicks an NPC, `NPCCharacter.set_conversing()` dynamically flips the NPC's sprite (`sprite.flip_h = hero.global_position.x > npc.global_position.x`) so characters face each other naturally during dialogue.

---

## 4. Dynamic Fog of War Shader (`fog_of_war.gdshader`)

Unexplored areas of the map are shrouded in darkness using a hardware-accelerated canvas item shader:

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1rem; margin: 1.5rem 0;">
  <div>
    <img src="{{ '/assets/images/crpg-realm/fog_of_war_reveal.png' | relative_url }}" alt="Fog of War Vision Reveal" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
    <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 3: Fog of War revealing terrain around the party hero and companion light sources.</em></p>
  </div>
  <div>
    <img src="{{ '/assets/images/crpg-realm/shopkeeper_trading_economy.png' | relative_url }}" alt="Shopkeeper Trading Economy" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
    <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 4: Shopkeeper economy window with dual party/merchant inventory grids and gold balances.</em></p>
  </div>
</div>

### Shader Characteristics:
- **Radial Sight Mask**: Each registered party member and light source punches a smooth circular gradient through the darkness texture.
- **Ambient Darkness**: Unrevealed areas remain darkened (`rgba(0.02, 0.03, 0.05, 0.94)`), hiding ambush monsters and loot chests until approached.
- **Persistent Exploration**: Revealed terrain remains dimly visible on the minimap while hiding dynamic monster movements outside line-of-sight.

---

## 5. Interactive Pickups & Doorway Portals

- **`GroundItem.gd`**: Ground items (`item-id-1`, `item-id-scroll`, `item-id-iron-sword`) feature pulsing hover circles and floating titles. Approaching within range adds the item to the party inventory, updates the Activity Log, and emits arrival particle effects.
- **`DoorPortal.gd`**: Doorways (`door-id-1`, `door-id-forest`, `door-id-inn`) verify lock conditions against party inventory (`garrison-key`). When unlocked, they transition the scene and position heroes at designated entry coordinates (`target_spawn`).

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/crpg-realm/epic_campaign_victory.png' | relative_url }}" alt="Campaign Victory Climax" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 5: The climax of the epic campaign: Captain Malakor is vanquished, the crypt is sealed, and the realm is saved.</em></p>
</div>
