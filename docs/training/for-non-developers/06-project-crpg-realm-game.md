---
title: "6. Project 2: Building crpg-realm (Your First Video Game)"
layout: default
parent: For Non-Developers
grand_parent: Training
nav_order: 6
permalink: /training/for-non-developers/06-project-crpg-realm-game.html
---

# Module 6: Project 2 — Building crpg-realm (Your First Video Game)
{: .no_toc }

A complete real-world case study: How a creator designs, authors, and plays a party-based isometric tactical RPG in Godot 4 using the visual Campaign Editor and autonomous Infinity AI agents.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Game Development Without GDScript or Matrix Math

Building a 2D/3D video game has historically been one of the steepest mountains in software:
- You had to master game engine scene trees and node hierarchies.
- You had to write pathfinding algorithms and collision polygon physics.
- You had to hand-code turn-based or real-time dice roll combat math.

In RobOS, you don't write GDScript or calculate vector dot products. Instead:
1. You use the **RobOS cRPG Campaign Editor** (`packages/crpg-editor`) to visually design maps, characters, quests, and loot.
2. RobOS stores your world as declarative Knowledge Graph data (`data/v1/`).
3. Autonomous AI agents assemble the Godot 4.3 game engine, hook up character bodies, wire audio, and run automated bots to play through your dungeon!

---

## Step 1: Visual World Design in the Campaign Editor

When you launch the **cRPG Campaign Editor** from the desktop launcher, you are greeted with the visual campaign dashboard:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/crpg-editor-overview.png' | relative_url }}" alt="cRPG Campaign Editor Main Dashboard" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 6.1: The RobOS cRPG Campaign Editor visual authoring suite.</em></p>
</div>

### Designing Maps & Placing Buildings
In the **Map Editor** tab, you load high-resolution 2560×1440 map backgrounds (like Candlekeep, Homestead, or the Ancient Catacombs) and drop visual structures:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/crpg-editor-tantegel-map.png' | relative_url }}" alt="Campaign Editor Map and Collider Editor" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 6.2: Painting structures, collision footprints, and door portals on the map.</em></p>
</div>

> [!TIP]
> **The Foundation Footprint Rule**: Notice where the solid red collision box is placed on the building above. It covers only the **bottom 25%–35%** of the structure. Why? Because in 2.5D isometric games, you want heroes to be able to walk *behind* the roof and chimney! If you collidered the entire building, heroes couldn't walk around the back.

---

## Step 2: Authoring the D&D 5e Character Roster

Next, click on the **Characters** tab to assemble your adventuring party.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/crpg-editor-hero-alefgard.png' | relative_url }}" alt="Campaign Editor Character Sheet and Ability Scores" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 6.3: Configuring character stats, ability scores, and portraits.</em></p>
</div>

Here you visually configure:
- **Hero Name &amp; Class**: Sir Caleb (Paladin), Elora (Elven Ranger/Rogue), Torvald (Dwarven Cleric).
- **Ability Scores**: Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma.
- **Starting Hit Points &amp; Armor Class**: Automatically calculated based on D&D 5e SRD rules!

---

## Step 3: Equipping Weapons, Armor & Loot

In the **Inventory &amp; Items** tab, you configure weapons, potions, and equipment:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/crpg-editor-inventory-equipped.png' | relative_url }}" alt="Campaign Editor Inventory and Equipment Configuration" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 6.4: Equipping swords, plate armor, and inventory slots.</em></p>
</div>

You can forge legendary equipment like **The Hero's Sword**:
- Slot: Main Hand
- Damage: `1d8 + 3` slashing
- Value: 250 gold pieces
- Icon: Lucide sword badge

---

## Step 4: The Infinity AI Playthrough Bot (Zero-Playtest Burden)

How do you know the dungeon isn't too hard, or that a door trigger isn't broken?
Normally, game creators have to spend hundreds of hours manually playtesting every single tweak.

In RobOS, **Infinity AI Bots** test the game for you:
1. When you save your campaign, the agent boots Godot headlessly in a virtual screen (Xvfb).
2. The AI bot connects to the game's internal HTTP control port (`:8080`).
3. It moves characters, navigates around obstacles, disarms traps with the rogue, casts spells, fights the boss, and verifies victory!

---

## Step 5: Launching & Playing Your Game in Godot 4!

Once the tests pass, you launch the game natively on your desktop!

### 1. Exploring the Village Square
Your hero and companions spawn in the village square:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/crpg-realm/village_square_overview.png' | relative_url }}" alt="Godot 4 Live Village Square Exploration" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 6.5: Live Godot 4 runtime showing the 4-member party in the Village Square.</em></p>
</div>

- **Click-to-Move**: Left-click anywhere on the ground to move the party with smooth string-pulled A* pathfinding.
- **Interact**: Click on NPCs (Guildmaster, Blacksmith) to open dialogue trees and buy potions.

---

### 2. Tactical Real-Time with Pause (RTwP) Combat
When enemies like Shadow Hounds or Minotaurs engage, combat begins:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/crpg-realm/combat_battlefield.png' | relative_url }}" alt="Real Time With Pause Combat in Godot 4" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 6.6: Tactical party combat with active pause and spell targeting.</em></p>
</div>

- **Spacebar**: Pauses time instantly so you can assess the battlefield.
- **Issue Orders**: Select your wizard to cast Fireball, tell your paladin to engage the minotaur, and order your rogue into the shadows.
- **Unpause**: Hit Spacebar again to watch your tactical strategy execute in real time with floating combat numbers!

---

### 3. Victory!
Defeating the boss unlocks legendary ground loot and triggers the victory screen:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/crpg-realm/victory_screen.png' | relative_url }}" alt="Game Victory Screen" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 6.7: Quest complete and kingdom saved!</em></p>
</div>

You just designed and played a complete tactical fantasy video game with 2.5D graphics, D&D 5e math, inventory looting, and multi-scene level transitions without writing a single line of game engine code!

---

Now for the grand finale: How do you sign off on features and package your apps for other people to use?

Proceed to **[Module 7: The Review Theater &amp; Running Your Creations]({{ '/training/for-non-developers/07-review-theater-and-running-apps.html' | relative_url }})**!
