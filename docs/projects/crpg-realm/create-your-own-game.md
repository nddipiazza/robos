---
title: Creating Your Own Game with robos-crpg
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
permalink: /projects/crpg-realm/create-your-own-game.html
nav_order: 4
---

# Creating Your Own Game with robos-crpg
{: .no_toc }

A complete engineering masterclass and living documentation section on building, extending, and autonomously verifying party-based tactical isometric cRPGs using Godot 4.3, D&D 5e SRD rules, and the RobOS AI governance harness.
{: .fs-6 .fw-300 }

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/crpg-realm/crpg_game_builder_architecture.jpg' | relative_url }}" alt="Tactical cRPG Architecture and Game Builder Diagram" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #4a3722; box-shadow: 0 4px 24px rgba(0,0,0,0.6);" />
  <p style="text-align: center; color: #b8860b; font-size: 0.85rem; margin-top: 0.5rem;"><em>Figure 1: Tactical Isometric RPG Architecture Codex — Complete game loop, party management, combat resolution, and scene portal flow.</em></p>
</div>

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Documentation Chapters & Technical Modules

This guide has been expanded into a comprehensive multi-chapter engineering curriculum. Select any module below to dive into code samples, architecture schematics, and implementation standards:

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; margin: 1.5rem 0;">

  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #58a6ff; font-weight: bold; margin-bottom: 0.4rem;">Chapter 1</div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #00bcd4;"><a href="/projects/crpg-realm/create-your-own-game/01-godot-architecture.html" style="color: #00bcd4; text-decoration: none;">Godot 4 Architecture for Programmers</a></h3>
      <p style="font-size: 0.9rem; color: #8b949e; margin: 0 0 1rem 0;">The mental model for software engineers: SceneTree hierarchy, Node2D, CharacterBody2D, Y-Sort depth pipeline, and persistent autoload singletons.</p>
    </div>
    <a href="/projects/crpg-realm/create-your-own-game/01-godot-architecture.html" class="btn btn-primary" style="align-self: flex-start; font-size: 0.85rem;">Read Chapter 1 →</a>
  </div>

  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #58a6ff; font-weight: bold; margin-bottom: 0.4rem;">Chapter 2</div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #00bcd4;"><a href="/projects/crpg-realm/create-your-own-game/02-scenes-and-portals.html" style="color: #00bcd4; text-decoration: none;">Scenes, Level Transitions & Door Portals</a></h3>
      <p style="font-size: 0.9rem; color: #8b949e; margin: 0 0 1rem 0;">Structuring location scenes, building two-way DoorPortal components with Area2D, coordinate offsets, and dynamic companion spawning.</p>
    </div>
    <a href="/projects/crpg-realm/create-your-own-game/02-scenes-and-portals.html" class="btn btn-primary" style="align-self: flex-start; font-size: 0.85rem;">Read Chapter 2 →</a>
  </div>

  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #58a6ff; font-weight: bold; margin-bottom: 0.4rem;">Chapter 3</div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #00bcd4;"><a href="/projects/crpg-realm/create-your-own-game/03-maps-and-isometric-geometry.html" style="color: #00bcd4; text-decoration: none;">2560×1440 Maps & Isometric World Layers</a></h3>
      <p style="font-size: 0.9rem; color: #8b949e; margin: 0 0 1rem 0;">Rendering 2560×1440 plates, applying the Foundation Footprint rule to colliders, camera limit clamping, and two-tier click-to-move pathfinding.</p>
    </div>
    <a href="/projects/crpg-realm/create-your-own-game/03-maps-and-isometric-geometry.html" class="btn btn-primary" style="align-self: flex-start; font-size: 0.85rem;">Read Chapter 3 →</a>
  </div>

  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #58a6ff; font-weight: bold; margin-bottom: 0.4rem;">Chapter 4</div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #00bcd4;"><a href="/projects/crpg-realm/create-your-own-game/04-items-loot-and-inventory.html" style="color: #00bcd4; text-decoration: none;">Items, Inventory & D&D 5e Equipment</a></h3>
      <p style="font-size: 0.9rem; color: #8b949e; margin: 0 0 1rem 0;">Zero-hardcoding JSON schemas, GroundItem pickup triggers, container footlockers, and D&D 5e Armor Class (AC) and damage calculations.</p>
    </div>
    <a href="/projects/crpg-realm/create-your-own-game/04-items-loot-and-inventory.html" class="btn btn-primary" style="align-self: flex-start; font-size: 0.85rem;">Read Chapter 4 →</a>
  </div>

  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #58a6ff; font-weight: bold; margin-bottom: 0.4rem;">Chapter 5</div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #00bcd4;"><a href="/projects/crpg-realm/create-your-own-game/05-infinity-engine-traps.html" style="color: #00bcd4; text-decoration: none;">Infinity Engine Traps & Hazards System</a></h3>
      <p style="font-size: 0.9rem; color: #8b949e; margin: 0 0 1rem 0;">Concealed traps, Rogue modal Find Traps skill, 2nd-level divination spell sweeps, pulsing red danger outlines, Thieves' Tools disarms, and fumble detonation.</p>
    </div>
    <a href="/projects/crpg-realm/create-your-own-game/05-infinity-engine-traps.html" class="btn btn-primary" style="align-self: flex-start; font-size: 0.85rem;">Read Chapter 5 →</a>
  </div>

  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #58a6ff; font-weight: bold; margin-bottom: 0.4rem;">Chapter 6</div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #00bcd4;"><a href="/projects/crpg-realm/create-your-own-game/06-boss-fights-and-encounters.html" style="color: #00bcd4; text-decoration: none;">Custom Boss Encounters & Multi-Phase Logic</a></h3>
      <p style="font-size: 0.9rem; color: #8b949e; margin: 0 0 1rem 0;">Building multi-phase boss state machines: cutscenes, Phase 1 combat, 50% HP necrotic invulnerability shields, summoned minion waves, and victory fanfares.</p>
    </div>
    <a href="/projects/crpg-realm/create-your-own-game/06-boss-fights-and-encounters.html" class="btn btn-primary" style="align-self: flex-start; font-size: 0.85rem;">Read Chapter 6 →</a>
  </div>

  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #58a6ff; font-weight: bold; margin-bottom: 0.4rem;">Chapter 7</div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #00bcd4;"><a href="/projects/crpg-realm/create-your-own-game/07-modding-and-custom-content.html" style="color: #00bcd4; text-decoration: none;">Modding Engine, Manifests & Data Overrides</a></h3>
      <p style="font-size: 0.9rem; color: #8b949e; margin: 0 0 1rem 0;">Zero-code Mod Loader architecture: mod.json manifests, registering custom traps, spells, items, and monsters without modifying core source files.</p>
    </div>
    <a href="/projects/crpg-realm/create-your-own-game/07-modding-and-custom-content.html" class="btn btn-primary" style="align-self: flex-start; font-size: 0.85rem;">Read Chapter 7 →</a>
  </div>

  <div style="background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
    <div>
      <div style="font-size: 0.8rem; text-transform: uppercase; color: #58a6ff; font-weight: bold; margin-bottom: 0.4rem;">Chapter 8</div>
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #00bcd4;"><a href="/projects/crpg-realm/create-your-own-game/08-cucumber-bdd-testing.html" style="color: #00bcd4; text-decoration: none;">Automated Cucumber BDD & Xvfb Framebuffers</a></h3>
      <p style="font-size: 0.9rem; color: #8b949e; margin: 0 0 1rem 0;">Headless verification harness: driving Godot via REST (:18090), virtual display :99, 1080p MP4 proof-of-work video recording, and GameState telemetry.</p>
    </div>
    <a href="/projects/crpg-realm/create-your-own-game/08-cucumber-bdd-testing.html" class="btn btn-primary" style="align-self: flex-start; font-size: 0.85rem;">Read Chapter 8 →</a>
  </div>

</div>

---

## Interactive eLearning & Training Modules

Interested in a hands-on, self-paced curriculum with quizzes, interactive code playgrounds, and a verifiable completion certificate?

- 🎓 **[cRPG Game Builder & Tactical Engine Academy (Self-Paced Training Module)](/projects/crpg-realm/create-your-own-game/elearning/)** — 7 modules, practical labs, and interactive knowledge checks covering custom maps, items, traps, boss scripting, and Cucumber BDD.
  ```bash
  electron packages/crpg-game-builder-elearning
  ```
- ⚔️ **[Tactical cRPG Architecture & Masterclass](/projects/crpg-realm/elearning/)** — Full deep-dive into D&D 5e SRD implementation, Infinity Engine systems, and turn-based tactical combat.
  ```bash
  electron packages/robos-crpg-elearning
  ```

---

## Architectural Rules & Standards Reference

| Architecture Rule | Implementation Standard | Why It Matters |
|:---|:---|:---|
| **Zero-Hardcoding** | All item, enemy, trap, and dialogue data lives in `data/v1/*.json` or `mods/` | Ensures tests, UI, and Godot stay 100% synchronized without drift. |
| **Layer 1 Colliders** | Place `StaticBody2D` only on physical foundation footprints (bottom 30%) | Allows natural 2.5D depth sorting with `y_sort_enabled = true`. |
| **Camera Limits** | Call `set_camera_limits()` on map load | Prevents revealing black margins outside 2560×1440 plates. |
| **Dual Testing** | Write Normal tests for fast iteration; Full Playthroughs for CI/CD | Guarantees genuine game completability without sacrificing test speed. |
| **Single Responsibility Singletons** | Route state through `GameState`, rolls through `CombatManager` | Prevents tangled scene coupling and makes state injection trivial. |
| **Modular Modding** | Place extensions in `mods/<mod-id>/` with `mod.json` manifests | Enables community content packs and custom hazards without touching core code. |
| **Technical Documentation Diagrams** | Include Gemini 3.8 AI-generated schematics alongside Mermaid syntax | Ensures documentation is crystal-clear, developer-friendly, and professional without AI bling. |
