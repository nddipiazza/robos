#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const learningPkgPath = path.join(rootDir, '.robos', 'kgraphs', 'learning', 'package.jsonld');
const aggregatedGraphPath = path.join(rootDir, '.robos', 'knowledge-graph.jsonld');
const crpgPkgPath = path.join(rootDir, '.robos', 'kgraphs', 'crpg', 'package.jsonld');

const courseNode = {
  "@id": "urn:robos:elearning:course:crpg-game-builder",
  "@type": [
    "oslc_am:Resource",
    "robos:ELearningCourse",
    "robos:ELearning",
    "schema:Course"
  ],
  "dcterms:title": "RobOS cRPG Game Builder & Tactical Engine Academy",
  "dcterms:description": "The definitive hands-on training module for building, extending, and autonomously verifying party-based tactical cRPGs in Godot 4.3 with D&D 5e SRD rules, 2.5D isometric geometry, Infinity Engine traps, and automated video proof-of-work.",
  "robos:topic": "cRPG Game Engine Architecture & Godot 4 Development",
  "robos:difficulty": "Advanced",
  "robos:targetAudience": "Game Developers, Systems Programmers, D&D Dungeon Masters, AI Agent Architects",
  "robos:estimatedDuration": "75 minutes",
  "robos:modulesCount": 7,
  "robos:gitopsFile": ".robos/elearning.yaml",
  "robos:targetApplication": "urn:robos:crpg:game:realm-of-heroes",
  "robos:engineArchitecture": "urn:robos:infinity:engine:gemrb-infinity",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:schemaOrgType": "https://schema.org/Course",
  "robos:domainStandard": "https://schema.org/Course",
  "robos:status": "published",
  "robos:modules": [
    {
      "id": "mod-01-godot-architecture",
      "title": "Module 1: Godot 4 SceneTree, Entity Hierarchy & 2.5D Y-Sorting",
      "durationMinutes": 12,
      "overview": "Master Godot 4's scene tree hierarchy for software engineers: Node2D transforms, CharacterBody2D movement, 2.5D Y-sorting depth pipeline, and persistent autoload singletons.",
      "labSteps": [
        "Inspect SceneTree hierarchy in games/crpg-realm/scenes/AncientCatacombs.tscn",
        "Verify y_sort_enabled = true on parent Node2D and character foot anchors",
        "Test singleton state persistence across scene transitions via GameState.gd"
      ],
      "quiz": [
        {
          "question": "Why must character sprites in a 2.5D isometric game have their local origin (0, 0) placed at their feet rather than sprite center?",
          "options": [
            "So the Y-Sort engine sorts rendering depth by where characters contact the ground",
            "Because Godot physics engines only detect collisions at (0, 0)",
            "To reduce texture memory usage during animation cycles",
            "To prevent sprites from rotating when moving diagonally"
          ],
          "answer": "So the Y-Sort engine sorts rendering depth by where characters contact the ground"
        },
        {
          "question": "Where does persistent global state (party roster, gold, active quest stage) live across scene changes?",
          "options": [
            "In autoload singletons like GameState.gd registered in project.godot",
            "In local variables declared on the active scene root",
            "In temporary environment variables passed through the OS shell",
            "Inside the CollisionShape2D user metadata"
          ],
          "answer": "In autoload singletons like GameState.gd registered in project.godot"
        }
      ]
    },
    {
      "id": "mod-02-scenes-and-portals",
      "title": "Module 2: Location Scenes, Level Transitions & Door Portals",
      "durationMinutes": 10,
      "overview": "Implement interconnected campaign scenes, two-way DoorPortal Area2D triggers, arrival spawn coordinates, and companion party synchronization.",
      "labSteps": [
        "Inspect DoorPortal.gd trigger volume and collision layer 1 masking",
        "Verify two-way teleport coordinates and key requirements in AncientCatacombs.tscn",
        "Review dynamic PartyCompanion instancing in location scene _ready() hooks"
      ],
      "quiz": [
        {
          "question": "What node type is used to construct trigger zones for doors, portals, and room transitions?",
          "options": [
            "Area2D with body_entered signals",
            "StaticBody2D with immovable colliders",
            "CharacterBody2D with move_and_slide()",
            "CanvasLayer with screen-pinned overlays"
          ],
          "answer": "Area2D with body_entered signals"
        },
        {
          "question": "How are recruited companions positioned when transitioning into a newly loaded zone?",
          "options": [
            "Instantiated dynamically in _ready() adjacent to the hero's arrival coordinates",
            "Hardcoded into every location scene file manually",
            "Loaded as separate sub-scenes through external HTTP requests",
            "Kept in an invisible queue until combat begins"
          ],
          "answer": "Instantiated dynamically in _ready() adjacent to the hero's arrival coordinates"
        }
      ]
    },
    {
      "id": "mod-03-maps-and-geometry",
      "title": "Module 3: 2560x1440 Maps, Foundation Colliders & Camera Limits",
      "durationMinutes": 12,
      "overview": "Render high-resolution 2560x1440 maps, enforce the foundation footprint rule, clamp camera limits, and navigate using two-tier pathfinding.",
      "labSteps": [
        "Verify 2560x1440 full-bleed TextureRect configuration with mouse_filter = 2",
        "Apply the Foundation Footprint rule: colliders on bottom 25-35% of structures only",
        "Execute Camera2D.set_camera_limits(0, 0, 2560, 1440) to prevent black border leaks"
      ],
      "quiz": [
        {
          "question": "What is the Foundation Footprint Rule in 2.5D isometric geometry?",
          "options": [
            "Place colliders only on the bottom 25-35% base of buildings so characters can walk behind roofs",
            "Build building foundations using 3D meshes rather than 2D sprites",
            "Require all structures to share identical square dimensions",
            "Lock camera zoom whenever characters are near building doors"
          ],
          "answer": "Place colliders only on the bottom 25-35% base of buildings so characters can walk behind roofs"
        },
        {
          "question": "Why must Camera2D limits be clamped to (0, 0, 2560, 1440) on map load?",
          "options": [
            "To prevent the viewport from scrolling past map edges and revealing black margins",
            "To lock the mouse cursor inside the operating system window",
            "To improve frame rates by skipping invisible off-screen rendering",
            "To enable hardware anti-aliasing on the ground texture"
          ],
          "answer": "To prevent the viewport from scrolling past map edges and revealing black margins"
        }
      ]
    },
    {
      "id": "mod-04-items-and-inventory",
      "title": "Module 4: Zero-Hardcoding JSON DataStore, Inventory & D&D 5e Equipment",
      "durationMinutes": 10,
      "overview": "Architect declarative data-driven item registries, GroundItem pickup physics, multi-slot equipment, and D&D 5e Armor Class calculations.",
      "labSteps": [
        "Explore declarative item definitions in games/crpg-realm/data/v1/items.json",
        "Inspect GroundItem.tscn Area2D pickup trigger and bounce tween",
        "Verify D&D 5e Armor Class calculation accounting for base AC, DEX caps, and shields"
      ],
      "quiz": [
        {
          "question": "Where do item statistics, values, and equip slot properties live in cRPG Realm?",
          "options": [
            "In declarative JSON files (data/v1/items.json and mods/) loaded by DataStore",
            "Hardcoded directly inside GDScript weapon scripts",
            "Stored in a remote PostgreSQL database queried over WebSockets",
            "Embedded inside PNG texture EXIF metadata"
          ],
          "answer": "In declarative JSON files (data/v1/items.json and mods/) loaded by DataStore"
        },
        {
          "question": "In D&D 5e SRD, how does heavy armor like Full Plate interact with a character's Dexterity modifier?",
          "options": [
            "It provides a high flat base AC (18) and adds zero Dexterity bonus (maxDexBonus = 0)",
            "It doubles the Dexterity modifier for reflex saves",
            "It penalizes AC by the Dexterity modifier value",
            "It requires rolling a d20 every turn to check if the armor holds"
          ],
          "answer": "It provides a high flat base AC (18) and adds zero Dexterity bonus (maxDexBonus = 0)"
        }
      ]
    },
    {
      "id": "mod-05-infinity-traps",
      "title": "Module 5: Infinity Engine Traps, Modal Thief Perception & Spell Divination",
      "durationMinutes": 15,
      "overview": "Build classic Infinity Engine dungeon traps: concealed floor plates, Rogue active modal sweeps with passive perception floor, 2nd-level Find Traps divination, pulsing red hazard highlights, Thieves' Tools disarm checks, critical fumble detonations, and D&D 5e saving throws.",
      "labSteps": [
        "Inspect games/crpg-realm/scripts/Trap.gd state machine and Line2D pulsing danger highlight",
        "Verify modal Find Traps sweep with D&D 5e passive perception floor (10 + WIS mod + prof)",
        "Test Thieves' Tools disarm checks and critical fumble detonation in CombatManager.gd",
        "Execute Cucumber feature: python3 -m behave tests/e2e/features/normal/12_infinity_engine_traps_detection_and_disarm.feature"
      ],
      "quiz": [
        {
          "question": "What visual cue alerts the player that a concealed Infinity Engine trap has been detected?",
          "options": [
            "A pulsing red danger highlight outlining the hazard polygon with status text",
            "A full-screen flash and camera shake",
            "An immediate pause dialog asking to reload the save",
            "A green waypoint marker on the minimap only"
          ],
          "answer": "A pulsing red danger highlight outlining the hazard polygon with status text"
        },
        {
          "question": "What happens if a rogue critically fumbles (force_fumble or natural 1) while attempting to disarm a trap?",
          "options": [
            "The delicate mechanism prematurely springs and detonates directly in the disarmer's face",
            "The thieves' tools are permanently destroyed with no damage taken",
            "The trap is safely disarmed anyway due to passive proficiency",
            "The disarm attempt is cancelled with no consequence"
          ],
          "answer": "The delicate mechanism prematurely springs and detonates directly in the disarmer's face"
        }
      ]
    },
    {
      "id": "mod-06-boss-encounters",
      "title": "Module 6: Multi-Phase Boss Encounters & Real-Time with Pause Combat",
      "durationMinutes": 12,
      "overview": "Script intense boss encounters with proximity cutscene dialogs, 50% HP necrotic invulnerability shields, summoned minion waves, enrage timers, and victory rewards.",
      "labSteps": [
        "Inspect boss proximity cutscene and dialog choices in GarrisonKeep.gd",
        "Implement Phase 2 transition logic at 50% HP with invulnerability barrier",
        "Wire minion death signals to shatter the boss shield and trigger victory loot on defeat"
      ],
      "quiz": [
        {
          "question": "How is boss invulnerability handled during the Phase 2 shield transition?",
          "options": [
            "A boolean flag ignores incoming damage while a visual shield effect activates until summoned minions are slain",
            "The boss teleported off-screen into an unreachable room",
            "The game engine pauses all player input until a timer expires",
            "Incoming damage is converted into healing hit points"
          ],
          "answer": "A boolean flag ignores incoming damage while a visual shield effect activates until summoned minions are slain"
        },
        {
          "question": "What happens when a boss reaches 0 HP in cRPG Realm?",
          "options": [
            "Sets quest flag, plays victory fanfare, spawns legendary ground loot, and transitions to VictoryScreen.tscn",
            "Immediately crashes the game engine to prevent save scumming",
            "Spawns another identical boss in an infinite loop",
            "Resets the hero to Act 1 Homestead"
          ],
          "answer": "Sets quest flag, plays victory fanfare, spawns legendary ground loot, and transitions to VictoryScreen.tscn"
        }
      ]
    },
    {
      "id": "mod-07-modding-and-bdd",
      "title": "Module 7: Zero-Code Modding & Autonomous Cucumber BDD Verification",
      "durationMinutes": 14,
      "overview": "Package community content with mod.json manifests, write Cucumber BDD Gherkin specifications, and capture 1080p video proof-of-work in headless Xvfb.",
      "labSteps": [
        "Inspect games/crpg-realm/mods/catacomb-traps-mod/mod.json manifest and custom traps.json",
        "Verify DataStoreV1 automatic directory scanning across res://mods/ and user://mods/",
        "Execute headless Cucumber BDD test suite: python3 games/crpg-realm/run_cucumber_tests.py --normal",
        "Inspect generated interactive HTML report and MP4 video recordings in tests/e2e/reports/"
      ],
      "quiz": [
        {
          "question": "How does the RobOS cRPG Mod Loader discover custom content packages?",
          "options": [
            "It automatically scans res://mods/ and user://mods/ directories for valid mod.json manifests",
            "It requires recompiling the Godot C++ engine binary with custom mod flags",
            "It downloads mods from an external proprietary cloud server on every boot",
            "It parses comments inside .tscn scene files"
          ],
          "answer": "It automatically scans res://mods/ and user://mods/ directories for valid mod.json manifests"
        },
        {
          "question": "Why does the RobOS verification harness run games inside an Xvfb virtual framebuffer?",
          "options": [
            "To execute tests headlessly in CI/CD while capturing real 1080p video proof-of-work without physical monitors",
            "To bypass Godot's graphics rendering pipeline completely",
            "To overclock the GPU for faster frame rates",
            "Because Godot cannot run on Linux without virtual framebuffers"
          ],
          "answer": "To execute tests headlessly in CI/CD while capturing real 1080p video proof-of-work without physical monitors"
        }
      ]
    }
  ]
};

// 1. Update .robos/kgraphs/learning/package.jsonld
try {
  const learningPkg = JSON.parse(fs.readFileSync(learningPkgPath, 'utf8'));
  const nodes = learningPkg['robos:nodes'] || [];
  const existingIdx = nodes.findIndex(n => n['@id'] === courseNode['@id']);
  if (existingIdx >= 0) {
    nodes[existingIdx] = courseNode;
  } else {
    nodes.push(courseNode);
  }
  learningPkg['robos:nodes'] = nodes;
  fs.writeFileSync(learningPkgPath, JSON.stringify(learningPkg, null, 2) + '\n', 'utf8');
  console.log('✔ Updated .robos/kgraphs/learning/package.jsonld with crpg-game-builder course.');
} catch (e) {
  console.error('Error updating learning package:', e);
}

// 2. Update .robos/knowledge-graph.jsonld
try {
  const fullGraph = JSON.parse(fs.readFileSync(aggregatedGraphPath, 'utf8'));
  const nodes = fullGraph['robos:nodes'] || [];
  const existingIdx = nodes.findIndex(n => n['@id'] === courseNode['@id']);
  if (existingIdx >= 0) {
    nodes[existingIdx] = courseNode;
  } else {
    nodes.push(courseNode);
  }
  fullGraph['robos:nodes'] = nodes;
  fs.writeFileSync(aggregatedGraphPath, JSON.stringify(fullGraph, null, 2) + '\n', 'utf8');
  console.log('✔ Updated .robos/knowledge-graph.jsonld with crpg-game-builder course.');
} catch (e) {
  console.error('Error updating aggregated graph:', e);
}

// 3. Link from cRPG application node in crpg package
try {
  const crpgPkg = JSON.parse(fs.readFileSync(crpgPkgPath, 'utf8'));
  const app = (crpgPkg['robos:nodes'] || []).find(n => n['@id'] === 'urn:robos:crpg:game:realm-of-heroes');
  if (app) {
    if (!Array.isArray(app['robos:hasELearning'])) {
      app['robos:hasELearning'] = [app['robos:hasELearning']].filter(Boolean);
    }
    if (!app['robos:hasELearning'].includes(courseNode['@id'])) {
      app['robos:hasELearning'].push(courseNode['@id']);
      fs.writeFileSync(crpgPkgPath, JSON.stringify(crpgPkg, null, 2) + '\n', 'utf8');
      console.log('✔ Linked crpg-game-builder to urn:robos:crpg:game:realm-of-heroes.');
    }
  }
} catch (e) {
  console.error('Error updating crpg package:', e);
}

// 4. Generate the standalone interactive eLearning training module
const { SDLCKnowledgeGraphStore, generateELearningWebsite } = require('../packages/robos-graph/index.js');
const store = new SDLCKnowledgeGraphStore({
  filePath: aggregatedGraphPath,
  rootDir: path.join(rootDir, '.robos')
});

const targetOutputHtml = path.join(rootDir, 'docs', 'projects', 'crpg-realm', 'create-your-own-game', 'elearning', 'index.html');
const res = store.generateELearningWebsite({
  courseId: courseNode['@id'],
  outputFilePath: targetOutputHtml,
  permalink: '/projects/crpg-realm/create-your-own-game/elearning/',
  docFilePath: path.join(rootDir, 'docs', 'projects', 'crpg-realm', 'create-your-own-game.md'),
  title: 'RobOS cRPG Game Builder & Tactical Engine Academy'
});

console.log('✔ Standalone Training Module Result:', res.ok ? 'SUCCESS' : res.error);
console.log('  Location:', targetOutputHtml);

if (fs.existsSync(targetOutputHtml)) {
  let content = fs.readFileSync(targetOutputHtml, 'utf8');
  content = content.replace(/^---[\s\S]*?---/, `---
layout: null
title: "cRPG Game Builder & Tactical Engine Academy"
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 49
permalink: /projects/crpg-realm/create-your-own-game/elearning/
redirect_from:
  - /projects/crpg-realm/create-your-own-game/elearning
  - /projects/crpg-realm/create-your-own-game/elearning.html
---`);
  fs.writeFileSync(targetOutputHtml, content, 'utf8');
}

// 5. Scaffold standalone Electron desktop app
const scaffoldPath = path.join(rootDir, 'packages', 'crpg-game-builder-elearning');
fs.mkdirSync(scaffoldPath, { recursive: true });

const pkgJson = {
  "name": "crpg-game-builder-elearning",
  "version": "1.0.0",
  "description": "RobOS cRPG Game Builder & Tactical Engine Academy — Standalone Interactive Desktop Training Module",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "keywords": ["robos", "crpg", "elearning", "godot4", "dnd5e"],
  "author": "RobOS Autonomous SDLC Harness",
  "license": "Apache-2.0"
};

fs.writeFileSync(path.join(scaffoldPath, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');

const mainJs = `'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0e0c12',
    title: 'RobOS cRPG Game Builder & Tactical Engine Academy',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const localDoc = path.join(__dirname, '../../docs/projects/crpg-realm/create-your-own-game/elearning/index.html');
  win.loadFile(localDoc);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`;

fs.writeFileSync(path.join(scaffoldPath, 'main.js'), mainJs, 'utf8');

const desktopFile = `[Desktop Entry]
Name=cRPG Game Builder Academy
Comment=Interactive training module for building tactical cRPGs in Godot 4
Exec=electron /home/ndipiazza/source/robos/packages/crpg-game-builder-elearning
Icon=robos-elearning
Terminal=false
Type=Application
Categories=Development;Education;
`;

fs.writeFileSync(path.join(scaffoldPath, 'crpg-game-builder-elearning.desktop'), desktopFile, 'utf8');
console.log('✔ Scaffolded standalone Electron desktop training app at packages/crpg-game-builder-elearning');
