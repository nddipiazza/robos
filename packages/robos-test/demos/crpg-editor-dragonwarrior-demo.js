"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "crpg-editor-dragonwarrior";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/378ca830-4ff9-41ba-a48b-b56c4dd0a48f";
const ROBOS_ROOT = "/home/ndipiazza/source/robos";

const MAP_PATH = path.join(ROBOS_ROOT, "games", "crpg-realm", "maps", "tantegel-throne-room.jsonld");
const PNG_PATH = path.join(ROBOS_ROOT, "games", "crpg-realm", "assets", "blockouts", "tantegel-throne-room.png");

const SCRIPT = [
  {
    narration: "Starting with a blank sandboxed RobOS cRPG Editor, we switch to the Tactical Maps Studio.",
    target: ".nav-tab-btn[data-pane='pane-maps']",
    action: "click",
    callout: "Switch to Tactical Maps Studio",
    js: `(() => {
      const btn = document.querySelector(".nav-tab-btn[data-pane='pane-maps']");
      if (btn) btn.click();
    })()`,
    minHold: 3500,
  },
  {
    narration: "The editor starts in a clean empty state with no pre-loaded map, displaying the blueprint creation options.",
    target: "#map-empty-state",
    action: "hover",
    callout: "Verify Clean Empty Editor State",
    js: `(() => {
      const emptyState = document.getElementById('map-empty-state');
      if (emptyState.classList.contains('hidden')) {
        throw new Error('Assertion failed: Editor did not start in empty state!');
      }
      if (state.activeMapData !== null) {
        throw new Error('Assertion failed: state.activeMapData is not null on start!');
      }
      console.log('✔ Verified: Editor started in clean empty state.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We click '+ New' to initialize a fresh, blank tactical battle map blueprint template.",
    target: "#btn-new-map",
    action: "click",
    callout: "File -> New Map Blueprint",
    js: `(() => {
      document.getElementById('btn-new-map')?.click();
      const emptyState = document.getElementById('map-empty-state');
      if (!emptyState.classList.contains('hidden')) {
        throw new Error('Assertion failed: Empty state was not dismissed on New Map!');
      }
      console.log('✔ Initialized new map blueprint template.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We configure the map properties: slug 'tantegel-throne-room', title 'Tantegel Castle - Throne Room (2F)', 60x40 ft dimensions, and stone floor terrain.",
    target: "#map-title",
    action: "hover",
    callout: "Configure Map Properties: 60x40 ft Stone Arena",
    js: `(() => {
      document.getElementById('map-slug').value = 'tantegel-throne-room';
      document.getElementById('map-title').value = 'Tantegel Castle - Throne Room (2F)';
      document.getElementById('map-terrain').value = 'stone';
      document.getElementById('map-width').value = '60';
      document.getElementById('map-height').value = '40';
      if (typeof updateMapDimensionsFromForm === 'function') updateMapDimensionsFromForm();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We populate the map objects for Dragon Warrior 1: King Lorik's throne dais, royal throne, two stone pillars, three treasure chests, royal door, and stairwell.",
    target: "#map-canvas",
    action: "hover",
    callout: "Place Map Objects & Collision Matrix",
    js: `(() => {
      state.activeMapData['@id'] = 'urn:robos:crpg:battle-map:tantegel-throne-room';
      state.activeMapData['robos:mapObjects'] = [
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'throne-dais',
          'robos:objectType': 'wall',
          'robos:shape': 'rect',
          'robos:position': [24, 6],
          'robos:size': [12, 6],
          'dcterms:title': "King Lorik's Throne Dais",
          id: 'throne-dais',
          type: 'wall',
          shape: 'rect',
          x: 24,
          y: 6,
          w: 12,
          h: 6,
          rot: 0,
          stroke: '#ffd700',
          fill: '#b8860b',
          collision: 'blocked',
          opacity: 'opaque',
          height: 6,
          label: "King Lorik's Throne Dais",
          notes: "Elevated throne where King Lorik sits with Imperial Scrolls"
        },
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'king-throne',
          'robos:objectType': 'altar',
          'robos:shape': 'rect',
          'robos:position': [28, 8],
          'robos:size': [4, 3],
          'dcterms:title': "King's Royal Throne",
          id: 'king-throne',
          type: 'altar',
          shape: 'rect',
          x: 28,
          y: 8,
          w: 4,
          h: 3,
          rot: 0,
          stroke: '#ffd700',
          fill: '#ffd700',
          collision: 'blocked',
          opacity: 'transparent',
          height: 4,
          label: "King's Royal Throne",
          notes: "Gilded seat of the monarch of Alefgard"
        },
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'pillar-west',
          'robos:objectType': 'pillar',
          'robos:shape': 'circle',
          'robos:position': [14, 18],
          'robos:radius': 2.5,
          'dcterms:title': 'Stone Pillar West',
          id: 'pillar-west',
          type: 'pillar',
          shape: 'circle',
          x: 14,
          y: 18,
          w: 5,
          h: 5,
          rot: 0,
          stroke: '#8892b0',
          fill: '#495670',
          collision: 'blocked',
          opacity: 'opaque',
          height: 12,
          label: 'Stone Pillar West',
          notes: 'Castle archway support column'
        },
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'pillar-east',
          'robos:objectType': 'pillar',
          'robos:shape': 'circle',
          'robos:position': [42, 18],
          'robos:radius': 2.5,
          'dcterms:title': 'Stone Pillar East',
          id: 'pillar-east',
          type: 'pillar',
          shape: 'circle',
          x: 42,
          y: 18,
          w: 5,
          h: 5,
          rot: 0,
          stroke: '#8892b0',
          fill: '#495670',
          collision: 'blocked',
          opacity: 'opaque',
          height: 12,
          label: 'Stone Pillar East',
          notes: 'Castle archway support column'
        },
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'chest-120g',
          'robos:objectType': 'chest',
          'robos:shape': 'rect',
          'robos:position': [18, 10],
          'robos:size': [3, 3],
          'dcterms:title': 'Treasure Chest (120 Gold)',
          id: 'chest-120g',
          type: 'chest',
          shape: 'rect',
          x: 18,
          y: 10,
          w: 3,
          h: 3,
          rot: 0,
          stroke: '#ffd700',
          fill: '#eab308',
          collision: 'blocked',
          opacity: 'transparent',
          height: 3,
          label: 'Treasure Chest (120 Gold)',
          notes: 'Contains 120 G granted by King Lorik for the quest'
        },
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'chest-torch',
          'robos:objectType': 'chest',
          'robos:shape': 'rect',
          'robos:position': [24, 10],
          'robos:size': [3, 3],
          'dcterms:title': 'Treasure Chest (Torch)',
          id: 'chest-torch',
          type: 'chest',
          shape: 'rect',
          x: 24,
          y: 10,
          w: 3,
          h: 3,
          rot: 0,
          stroke: '#ffd700',
          fill: '#eab308',
          collision: 'blocked',
          opacity: 'transparent',
          height: 3,
          label: 'Treasure Chest (Torch)',
          notes: 'Contains a Torch for illuminating dungeons and caves'
        },
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'chest-magic-key',
          'robos:objectType': 'chest',
          'robos:shape': 'rect',
          'robos:position': [38, 10],
          'robos:size': [3, 3],
          'dcterms:title': 'Treasure Chest (Magic Key)',
          id: 'chest-magic-key',
          type: 'chest',
          shape: 'rect',
          x: 38,
          y: 10,
          w: 3,
          h: 3,
          rot: 0,
          stroke: '#ffd700',
          fill: '#eab308',
          collision: 'blocked',
          opacity: 'transparent',
          height: 3,
          label: 'Treasure Chest (Magic Key)',
          notes: 'Contains a single-use Magic Key that opens royal doors'
        },
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'royal-door',
          'robos:objectType': 'door',
          'robos:shape': 'rect',
          'robos:position': [27, 36],
          'robos:size': [6, 2],
          'dcterms:title': 'Royal Locked Door',
          id: 'royal-door',
          type: 'door',
          shape: 'rect',
          x: 27,
          y: 36,
          w: 6,
          h: 2,
          rot: 0,
          stroke: '#06b6d4',
          fill: '#0891b2',
          collision: 'blocked',
          opacity: 'transparent',
          height: 8,
          label: 'Royal Locked Door',
          notes: 'Requires a Magic Key to pass through to the stairs'
        },
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'stairs-down',
          'robos:objectType': 'stairs',
          'robos:shape': 'rect',
          'robos:position': [48, 30],
          'robos:size': [6, 6],
          'dcterms:title': 'Stairs Down to Castle 1F',
          id: 'stairs-down',
          type: 'stairs',
          shape: 'rect',
          x: 48,
          y: 30,
          w: 6,
          h: 6,
          rot: 0,
          stroke: '#94a3b8',
          fill: '#475569',
          collision: 'open',
          opacity: 'transparent',
          height: 0,
          label: 'Stairs Down to Castle 1F',
          notes: 'Descends to Tantegel Castle 1F Courtyard'
        }
      ];

      if (typeof renderMapObjectsHierarchy === 'function') renderMapObjectsHierarchy();
      if (typeof updateCollisionStats === 'function') updateCollisionStats();
      if (canvasRenderer) {
        canvasRenderer.setMapData(state.activeMapData);
        canvasRenderer.resetView(60, 40);
      }
    })()`,
    minHold: 5000,
  },
  {
    narration: "We click 'Save Map' to persist Tantegel Throne Room JSON-LD to the Knowledge Graph.",
    target: "#btn-save-map",
    action: "click",
    callout: "Save Map: Tantegel Throne Room JSON-LD",
    js: `(async () => {
      const res = await saveCurrentMap();
      console.log('E2E saveCurrentMap result:', JSON.stringify(res));
      return res;
    })()`,
    minHold: 5000,
  },
  {
    narration: "We click 'Build PNG & Grid' to invoke the headless Python compiler and generate the 5-ft cell collision matrix and static background artwork.",
    target: "#btn-build-map",
    action: "click",
    callout: "Build PNG & 5-ft Collision Grid",
    js: `(async () => {
      const res = await buildMapBlockout();
      console.log('E2E buildMapBlockout result:', JSON.stringify(res));
      return res;
    })()`,
    minHold: 6000,
  },
  {
    narration: "Next, we test 'File -> Close' to close the active map and confirm the editor cleanly returns to the empty state.",
    target: "#btn-close-map",
    action: "click",
    callout: "File -> Close Map",
    js: `(() => {
      document.getElementById('btn-close-map')?.click();
      const emptyState = document.getElementById('map-empty-state');
      if (emptyState.classList.contains('hidden')) {
        throw new Error('Assertion failed: Empty state was not shown after Close Map!');
      }
      if (state.activeMapData !== null || state.activeMapSlug !== null) {
        throw new Error('Assertion failed: Active map data was not cleared on close!');
      }
      console.log('✔ Verified: File Close successfully returned editor to empty state.');
    })()`,
    minHold: 4000,
  },
  {
    narration: "We click 'File -> Open' to test loading our saved map from the blueprint library with tree navigation and real-time search.",
    target: "#btn-open-map",
    action: "click",
    callout: "File -> Open Map...",
    js: `(() => {
      document.getElementById('btn-open-map')?.click();
      const modal = document.getElementById('modal-open-map');
      if (modal.classList.contains('hidden')) {
        throw new Error('Assertion failed: Open map modal did not open!');
      }
      console.log('✔ Open map picker modal opened.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "In the Open Map dialog, we search for 'tantegel' to instantly filter the tree down to Tantegel Castle Throne Room.",
    target: "#map-search-input",
    action: "hover",
    callout: "Search 'tantegel' in Map Tree",
    js: `(() => {
      const searchInput = document.getElementById('map-search-input');
      searchInput.value = 'tantegel';
      renderMapModalTree('tantegel');
      console.log('✔ Filtered tree view by search query "tantegel".');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We select 'Tantegel Castle - Throne Room (2F)' from the tree and click 'Open Selected Map' to reload and render it.",
    target: "#btn-confirm-open-map",
    action: "click",
    callout: "Select from Tree & Open Map",
    js: `(async () => {
      const itemEl = document.querySelector('.tree-item[data-slug="tantegel-throne-room"]');
      if (!itemEl) {
        throw new Error('Assertion failed: Tree item for tantegel-throne-room not found!');
      }
      itemEl.click();
      const confirmBtn = document.getElementById('btn-confirm-open-map');
      if (confirmBtn.disabled) {
        throw new Error('Assertion failed: Confirm button not enabled after item selection!');
      }
      confirmBtn.click();

      // Wait briefly for loadMap to complete
      await new Promise(r => setTimeout(r, 600));

      const emptyState = document.getElementById('map-empty-state');
      if (!emptyState.classList.contains('hidden')) {
        throw new Error('Assertion failed: Empty state overlay visible after opening map!');
      }
      if (state.activeMapSlug !== 'tantegel-throne-room') {
        throw new Error('Assertion failed: Active slug is ' + state.activeMapSlug);
      }
      console.log('✔ Successfully re-opened Tantegel Throne Room from tree picker.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "The Tantegel Throne Room battle map is reloaded into the editor with all 9 objects, 60x40 ft dimensions, and compiled blockout artwork.",
    target: "#blockout-status-box",
    action: "hover",
    callout: "Map Reloaded & Lifecycle Verified",
    js: `(() => {
      const title = document.getElementById('map-title').value;
      const width = document.getElementById('map-width').value;
      const height = document.getElementById('map-height').value;
      const objCount = (state.activeMapData['robos:mapObjects'] || []).length;
      if (title !== 'Tantegel Castle - Throne Room (2F)') throw new Error('Title mismatch: ' + title);
      if (width !== '60' || height !== '40') throw new Error('Dimensions mismatch: ' + width + 'x' + height);
      if (objCount !== 9) throw new Error('Object count mismatch: ' + objCount);
      console.log('✔ Map state fully verified in DOM: 9 objects, 60x40 ft.');
    })()`,
    minHold: 4500,
  },
];

async function main() {
  console.log("=== RobOS cRPG Editor E2E: Screen 1 - Tantegel Throne Room Map ===");

  // 1. Pre-test cleanup: Guarantee blank sandboxed state
  console.log("Pre-test sandboxing: Cleaning any existing Tantegel map files...");
  if (fs.existsSync(MAP_PATH)) {
    fs.unlinkSync(MAP_PATH);
    console.log(`Removed pre-existing map: ${MAP_PATH}`);
  }
  if (fs.existsSync(PNG_PATH)) {
    fs.unlinkSync(PNG_PATH);
    console.log(`Removed pre-existing blockout PNG: ${PNG_PATH}`);
  }

  // 2. Run the E2E Demo via runDemo
  await runDemo({
    slug: SLUG,
    appId: "crpg-editor",
    windowTitle: "RobOS cRPG Editor — Campaign, Character, Inventory & Maps Studio",
    scenario: {
      ...scenarios["all-good"],
      useRealBinaries: true,
    },
    prelaunch: async () => {
      console.log("Prelaunch hook: Ensuring pristine workspace for crpg-editor...");
    },
    script: SCRIPT,
    audio: false,
  });

  console.log("\n=== E2E Run Complete: Running Assertions ===");

  // Assertion 1: Map JSON-LD file exists
  if (!fs.existsSync(MAP_PATH)) {
    throw new Error(`Assertion failed: Map file does not exist at ${MAP_PATH}`);
  }
  console.log("✔ Assertion 1 Passed: Map file exists at", MAP_PATH);

  // Assertion 2: Validate JSON-LD contents
  const rawJson = fs.readFileSync(MAP_PATH, "utf8");
  const mapData = JSON.parse(rawJson);

  if (mapData["@id"] !== "urn:robos:crpg:battle-map:tantegel-throne-room") {
    throw new Error(`Assertion failed: Unexpected @id: ${mapData["@id"]}`);
  }
  if (mapData["dcterms:title"] !== "Tantegel Castle - Throne Room (2F)") {
    throw new Error(`Assertion failed: Unexpected title: ${mapData["dcterms:title"]}`);
  }
  if (mapData["robos:terrain"] !== "stone") {
    throw new Error(`Assertion failed: Unexpected terrain: ${mapData["robos:terrain"]}`);
  }
  if (Number(mapData["robos:width"]) !== 60 || Number(mapData["robos:height"]) !== 40) {
    throw new Error(`Assertion failed: Unexpected dimensions: ${mapData["robos:width"]}x${mapData["robos:height"]}`);
  }
  console.log("✔ Assertion 2 Passed: Map metadata validated (60x40 ft stone arena)");

  // Assertion 3: Validate Map Objects
  const objects = mapData["robos:mapObjects"] || [];
  const expectedObjects = [
    "throne-dais",
    "king-throne",
    "pillar-west",
    "pillar-east",
    "chest-120g",
    "chest-torch",
    "chest-magic-key",
    "royal-door",
    "stairs-down"
  ];
  for (const objId of expectedObjects) {
    const found = objects.some(o => (o["robos:objectId"] || o.id) === objId);
    if (!found) {
      throw new Error(`Assertion failed: Required map object '${objId}' not found in mapObjects`);
    }
  }
  console.log(`✔ Assertion 3 Passed: All ${expectedObjects.length} Dragon Warrior 1 map objects verified`);

  // Assertion 4: Blockout PNG exists and is valid
  if (!fs.existsSync(PNG_PATH)) {
    throw new Error(`Assertion failed: Blockout PNG does not exist at ${PNG_PATH}`);
  }
  const stat = fs.statSync(PNG_PATH);
  if (stat.size < 1000) {
    throw new Error(`Assertion failed: Blockout PNG is suspiciously small: ${stat.size} bytes`);
  }
  console.log(`✔ Assertion 4 Passed: Blockout PNG exists (${stat.size} bytes)`);

  // Assertion 5: Headless Python Compiler verification
  console.log("Running Python blockout compiler verification on generated map...");
  const buildOutput = execSync(`python3 -m robos_crpg_blockout build "${MAP_PATH}"`, {
    encoding: "utf8",
    cwd: ROBOS_ROOT,
    env: { ...process.env, PYTHONPATH: path.join(ROBOS_ROOT, "packages", "robos-crpg-blockout") },
  });
  console.log("Compiler output:\n" + buildOutput.trim());
  console.log("✔ Assertion 5 Passed: Python blockout compiler validated map successfully");

  // 3. Copy artifacts to persistent walkthrough and brain directories
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(BRAIN_DIR, { recursive: true });

  const srcVideo = path.join(ROBOS_ROOT, "packages", "robos-test", "run", "demos", SLUG, `${SLUG}.webm`);
  const srcVtt = path.join(ROBOS_ROOT, "packages", "robos-test", "run", "demos", SLUG, `${SLUG}.vtt`);

  if (fs.existsSync(srcVideo)) {
    const finalVideo = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    fs.copyFileSync(srcVideo, finalVideo);
    fs.copyFileSync(srcVideo, path.join(BRAIN_DIR, `${SLUG}-final.webm`));
    console.log(`Archived video: ${finalVideo}`);

    // Extract high-resolution review frames
    const frameEmptyPath = path.join(BRAIN_DIR, "crpg_editor_empty_state.png");
    const frameModalPath = path.join(BRAIN_DIR, "crpg_editor_open_tree_modal.png");
    const framePath = path.join(BRAIN_DIR, "crpg_editor_tantegel_map_screen.png");

    try {
      execSync(`ffmpeg -y -ss 00:00:04 -i "${finalVideo}" -vframes 1 "${frameEmptyPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:00:30 -i "${finalVideo}" -vframes 1 "${frameModalPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:00:38 -i "${finalVideo}" -vframes 1 "${framePath}"`, { stdio: "ignore" });
      console.log(`Extracted review frames:\n  - ${frameEmptyPath}\n  - ${frameModalPath}\n  - ${framePath}`);
    } catch (err) {
      console.warn("Could not extract frames:", err.message);
    }
  }

  if (fs.existsSync(srcVtt)) {
    fs.copyFileSync(srcVtt, path.join(PERSIST_DIR, `${SLUG}.vtt`));
    fs.copyFileSync(srcVtt, path.join(BRAIN_DIR, `${SLUG}.vtt`));
  }

  console.log("\n=======================================================");
  console.log("🎉 SCREEN 1 (MAP) CREATED, SAVED, AND ASSERTED SUCCESSFULLY!");
  console.log("=======================================================");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL ERROR in E2E Map Test:", err);
    process.exit(1);
  });
}
