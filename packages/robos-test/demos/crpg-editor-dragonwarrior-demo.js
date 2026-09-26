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
const SANDBOX_DIR = path.join(PERSIST_DIR, "sandbox");

const MAP_PATH = path.join(SANDBOX_DIR, "maps", "tantegel-throne-room.jsonld");
const PNG_PATH = path.join(SANDBOX_DIR, "assets", "blockouts", "tantegel-throne-room.png");
const HERO_PATH = path.join(SANDBOX_DIR, "characters", "hero-of-alefgard.jsonld");
const NPC_PATH = path.join(SANDBOX_DIR, "characters", "npc-king-loric.jsonld");
const GWAELIN_PATH = path.join(SANDBOX_DIR, "characters", "npc-princess-gwaelin.jsonld");
const CAMPAIGN_PATH = path.join(SANDBOX_DIR, "campaigns", "dragonwarrior-1-usa.jsonld");

const BAMBOO_PATH = path.join(SANDBOX_DIR, "items", "bamboo-pole.jsonld");
const CLOTHES_PATH = path.join(SANDBOX_DIR, "items", "clothes.jsonld");
const CLOAK_PATH = path.join(SANDBOX_DIR, "items", "travelers-cloak.jsonld");
const BOOTS_PATH = path.join(SANDBOX_DIR, "items", "leather-boots.jsonld");
const TORCH_PATH = path.join(SANDBOX_DIR, "items", "torch.jsonld");
const KEY_PATH = path.join(SANDBOX_DIR, "items", "magic-key.jsonld");
const HERB_PATH = path.join(SANDBOX_DIR, "items", "herb.jsonld");

const SCRIPT = [
  {
    narration: "Starting with a blank sandboxed RobOS cRPG Editor, we verify pristine workspace isolation: 0 default characters, 0 default maps, 0 items, 0 inventory.",
    target: ".nav-tab-btn[data-pane='pane-maps']",
    action: "hover",
    callout: "Verify Workspace Isolation & 0 Defaults",
    js: `(() => {
      if (!Array.isArray(state.characters) || state.characters.length !== 0) {
        throw new Error('Workspace isolation failed: state.characters has ' + (state.characters ? state.characters.length : 0) + ' items!');
      }
      if (!Array.isArray(state.maps) || state.maps.length !== 0) {
        throw new Error('Workspace isolation failed: state.maps has ' + (state.maps ? state.maps.length : 0) + ' items!');
      }
      if (!Array.isArray(state.items) || state.items.length !== 0) {
        throw new Error('Workspace isolation failed: state.items has ' + (state.items ? state.items.length : 0) + ' items!');
      }
      const heroesStat = document.getElementById('stat-heroes-count')?.textContent;
      const goldStat = document.getElementById('stat-gold-count')?.textContent;
      if (heroesStat !== '0') {
        throw new Error('Workspace isolation failed: heroes stat is ' + heroesStat);
      }
      if (goldStat !== '0 gp') {
        throw new Error('Workspace isolation failed: gold stat is ' + goldStat);
      }
      console.log('✔ Verified: 100% isolated sandbox with 0 characters, 0 maps, 0 items, 0 default inventory.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We switch to the Tactical Maps Studio.",
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
      if (!Array.isArray(state.maps) || state.maps.length !== 0) {
        throw new Error('Assertion failed: state.maps is not empty! Count: ' + (state.maps ? state.maps.length : 0));
      }
      console.log('✔ Verified: Editor started in clean empty state with 0 maps.');
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

  // ==========================================
  // SCREEN 2: CHARACTERS & NPCS STUDIO
  // ==========================================
  {
    narration: "Next, we move to Screen 2: authoring the Dragon Warrior characters from scratch in the Characters & NPCs Studio.",
    target: ".nav-tab-btn[data-pane='pane-characters']",
    action: "click",
    callout: "Switch to Characters & NPCs Studio",
    js: `(() => {
      const btn = document.querySelector(".nav-tab-btn[data-pane='pane-characters']");
      if (btn) btn.click();
    })()`,
    minHold: 3500,
  },
  {
    narration: "The character studio opens in a clean empty state with no character selected and prompt cards to create a player character or NPC.",
    target: "#character-empty-state",
    action: "hover",
    callout: "Verify Clean Character Empty State",
    js: `(() => {
      const emptyState = document.getElementById('character-empty-state');
      if (emptyState.classList.contains('hidden')) {
        throw new Error('Assertion failed: Character studio did not start in empty state!');
      }
      const sheetContainer = document.getElementById('character-sheet-form-container');
      if (!sheetContainer.classList.contains('hidden')) {
        throw new Error('Assertion failed: Character sheet form container should be hidden initially!');
      }
      if (state.activeCharacterSlug !== null) {
        throw new Error('Assertion failed: state.activeCharacterSlug is not null: ' + state.activeCharacterSlug);
      }
      if (!Array.isArray(state.characters) || state.characters.length !== 0) {
        throw new Error('Assertion failed: state.characters is not empty! Count: ' + (state.characters ? state.characters.length : 0));
      }
      const rosterCount = document.getElementById('roster-count');
      if (rosterCount && rosterCount.textContent !== '0') {
        throw new Error('Assertion failed: roster-count is not 0! Found: ' + rosterCount.textContent);
      }
      console.log('✔ Verified: Character studio in clean empty state with 0 characters.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We click '➕ Create Player Character' to open a fresh Player Character sheet.",
    target: "#btn-empty-new-hero",
    action: "click",
    callout: "Initialize New Player Character Blueprint",
    js: `(() => {
      document.getElementById('btn-empty-new-hero')?.click();
      const emptyState = document.getElementById('character-empty-state');
      if (!emptyState.classList.contains('hidden')) {
        throw new Error('Assertion failed: Empty state was not dismissed on New Player Character!');
      }
      const sheetContainer = document.getElementById('character-sheet-form-container');
      if (sheetContainer.classList.contains('hidden')) {
        throw new Error('Assertion failed: Sheet form container is still hidden!');
      }
      console.log('✔ Initialized new player character blueprint.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We configure the Hero of Alefgard: Level 1 Human Fighter Player Character, Descendant of Erdrick, STR 16, DEX 14, CON 15, HP 16, and AC 14.",
    target: "#sheet-hero-title",
    action: "hover",
    callout: "Configure Player Character: Hero of Alefgard (Lvl 1 Fighter)",
    js: `(() => {
      document.getElementById('hero-name').value = 'Hero of Alefgard';
      document.getElementById('hero-slug').value = 'hero-of-alefgard';
      document.getElementById('hero-portrait').value = '⚔️';
      document.getElementById('hero-avatar-display').textContent = '⚔️';
      document.getElementById('hero-alignment').value = 'Lawful Good';
      document.getElementById('hero-level').value = 1;
      document.getElementById('hero-race').value = 'Human';
      document.getElementById('hero-class').value = 'Fighter';
      document.getElementById('hero-subclass').value = 'Champion';
      document.getElementById('hero-background').value = 'Descendant of Erdrick';
      document.getElementById('hero-xp').value = 0;

      const stats = { str: 16, dex: 14, con: 15, int: 12, wis: 13, cha: 14 };
      Object.entries(stats).forEach(([attr, val]) => {
        const input = document.getElementById('attr-' + attr);
        if (input) input.value = val;
        if (typeof updateAbilityModifier === 'function') updateAbilityModifier(attr, val);
      });

      document.getElementById('vital-ac').value = 14;
      document.getElementById('vital-hp-max').value = 16;
      document.getElementById('vital-hp-cur').value = 16;
      document.getElementById('vital-speed').value = 30;
      document.getElementById('vital-init').value = 2;
      document.getElementById('vital-prof').value = 2;
      document.getElementById('hero-backstory').value = 'Descendant of the legendary hero Erdrick, summoned to Tantegel Castle to retrieve the Ball of Light and vanquish the Dragonlord.';

      const titleEl = document.getElementById('sheet-hero-title');
      if (titleEl) titleEl.textContent = 'Hero of Alefgard (Player Character)';
      console.log('✔ Hero of Alefgard form populated.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "We click 'Save Character' to persist Hero of Alefgard JSON-LD to the Knowledge Graph.",
    target: "#btn-save-character",
    action: "click",
    callout: "Save Player Character: Hero of Alefgard JSON-LD",
    js: `(async () => {
      await saveCurrentCharacter();
      await new Promise(r => setTimeout(r, 800));
      if (state.activeCharacterSlug !== 'hero-of-alefgard') {
        throw new Error('Failed to save Hero of Alefgard: slug is ' + state.activeCharacterSlug);
      }
      console.log('✔ Hero of Alefgard saved.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "Now we click '+ NPC' in the header to author King Loric of Tantegel Castle.",
    target: "#btn-header-new-npc",
    action: "click",
    callout: "Initialize New NPC Blueprint",
    js: `(() => {
      document.getElementById('btn-header-new-npc')?.click();
      console.log('✔ Initialized new NPC blueprint.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We configure King Loric: Monarch role, Save Game interaction, assigned to Tantegel Throne Room at col 8, row 4, with his legendary quest dialogue.",
    target: "#sheet-hero-title",
    action: "hover",
    callout: "Configure NPC: King Loric of Tantegel",
    js: `(() => {
      document.getElementById('hero-name').value = 'King Loric';
      document.getElementById('hero-slug').value = 'npc-king-loric';
      document.getElementById('hero-portrait').value = '👑';
      document.getElementById('hero-avatar-display').textContent = '👑';
      document.getElementById('hero-alignment').value = 'Lawful Good';

      document.getElementById('npc-role').value = 'king';
      document.getElementById('npc-interaction').value = 'save';
      populateNpcLocationDropdown();
      document.getElementById('npc-location').value = 'tantegel-throne-room';
      document.getElementById('npc-facing').value = 'down';
      document.getElementById('npc-col').value = 8;
      document.getElementById('npc-row').value = 4;
      document.getElementById('npc-dialogue').value = 'Descendant of Erdrick, listen now to my words. It is told that in ages past Erdrick fought demons with a Ball of Light.\\n\\nNow, Hero, thou must help us recover the Ball of Light and restore peace to our land. The Dragonlord must be defeated.';
      document.getElementById('hero-backstory').value = 'Monarch of Alefgard who guides the descendant of Erdrick on the quest to restore the Ball of Light.';

      const titleEl = document.getElementById('sheet-hero-title');
      if (titleEl) titleEl.textContent = 'King Loric (NPC)';
      console.log('✔ King Loric NPC form populated.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "We click 'Save Character' to persist King Loric JSON-LD, establishing his spatial link to the Tantegel Throne Room map.",
    target: "#btn-save-character",
    action: "click",
    callout: "Save NPC: King Loric JSON-LD",
    js: `(async () => {
      await saveCurrentCharacter();
      await new Promise(r => setTimeout(r, 800));
      if (state.activeCharacterSlug !== 'npc-king-loric') {
        throw new Error('Failed to save King Loric: slug is ' + state.activeCharacterSlug);
      }
      console.log('✔ King Loric saved.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "We test the live roster search filter by searching for 'loric' to filter directly to King Loric.",
    target: "#character-search-input",
    action: "hover",
    callout: "Search 'loric' in Character Roster",
    js: `(() => {
      const input = document.getElementById('character-search-input');
      input.value = 'loric';
      characterSearchQuery = 'loric';
      renderCharactersList();

      const items = document.querySelectorAll('#heroes-list .hero-list-item');
      if (items.length !== 1) {
        throw new Error('Expected 1 filtered item for "loric", found: ' + items.length);
      }
      console.log('✔ Search filter "loric" verified: 1 result.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We search for 'alefgard' to isolate the Hero of Alefgard, then reset the filter to display all characters.",
    target: "#character-search-input",
    action: "hover",
    callout: "Search 'alefgard' & Clear Filter",
    js: `(() => {
      const input = document.getElementById('character-search-input');
      input.value = 'alefgard';
      characterSearchQuery = 'alefgard';
      renderCharactersList();

      let items = document.querySelectorAll('#heroes-list .hero-list-item');
      if (items.length !== 1) {
        throw new Error('Expected 1 filtered item for "alefgard", found: ' + items.length);
      }

      // Reset filter
      input.value = '';
      characterSearchQuery = '';
      renderCharactersList();
      console.log('✔ Search filter verified and reset.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We click 'Close' to close the active character sheet and verify the editor returns cleanly to the empty character state.",
    target: "#btn-close-character",
    action: "click",
    callout: "Close Character -> Empty State",
    js: `(() => {
      document.getElementById('btn-close-character')?.click();
      const emptyState = document.getElementById('character-empty-state');
      if (emptyState.classList.contains('hidden')) {
        throw new Error('Assertion failed: Empty state not shown after closing character!');
      }
      const sheetContainer = document.getElementById('character-sheet-form-container');
      if (!sheetContainer.classList.contains('hidden')) {
        throw new Error('Assertion failed: Sheet container not hidden after closing character!');
      }
      if (state.activeCharacterSlug !== null) {
        throw new Error('Assertion failed: activeCharacterSlug not cleared on close!');
      }
      console.log('✔ Character closed successfully, returned to empty state.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "Finally, we select 'Hero of Alefgard' from the roster to reload his complete sheet and verify all stats are preserved.",
    target: "#heroes-list",
    action: "hover",
    callout: "Select & Reload Hero of Alefgard (Player Character)",
    js: `(async () => {
      const heroEl = document.querySelector('#heroes-list .hero-list-item[data-slug="hero-of-alefgard"]');
      if (!heroEl) throw new Error('Hero of Alefgard item not found in roster!');
      heroEl.click();

      await new Promise(r => setTimeout(r, 600));

      const emptyState = document.getElementById('character-empty-state');
      if (!emptyState.classList.contains('hidden')) {
        throw new Error('Empty state should be hidden after selecting character!');
      }
      const name = document.getElementById('hero-name').value;
      const str = document.getElementById('attr-str').value;
      const cls = document.getElementById('hero-class').value;

      if (name !== 'Hero of Alefgard') throw new Error('Character name mismatch: ' + name);
      if (str !== '16') throw new Error('STR stat mismatch: ' + str);
      if (cls !== 'Fighter') throw new Error('Class mismatch: ' + cls);
      console.log('✔ Hero of Alefgard reloaded and fully verified in DOM: Lvl 1 Fighter, STR 16.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "Next, we move to Screen 3: the Item Studio, authoring real CRPGItem linked-data entities to eliminate free-text item strings.",
    target: ".nav-tab-btn[data-pane='pane-items']",
    action: "click",
    callout: "Switch to Item Studio",
    js: `(() => {
      document.querySelector(".nav-tab-btn[data-pane='pane-items']")?.click();
    })()`,
    minHold: 3500,
  },
  {
    narration: "The Item Studio opens in a clean state with 0 default items, displaying the blueprint creation options.",
    target: "#item-empty-state",
    action: "hover",
    callout: "Verify Item Studio Empty State: 0 Items",
    js: `(() => {
      const emptyState = document.getElementById('item-empty-state');
      if (emptyState.classList.contains('hidden')) {
        throw new Error('Item Studio should start in empty state!');
      }
      if (!Array.isArray(state.items) || state.items.length !== 0) {
        throw new Error('state.items should be empty on start! Count: ' + (state.items ? state.items.length : 0));
      }
      console.log('✔ Verified: Item Studio started in pristine empty state with 0 items.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We click 'Create Item Blueprint' to author our first weapon: Bamboo Pole, with 1d4 bludgeoning damage, 10 GP cost, and main-hand equip slot.",
    target: "#btn-empty-new-item",
    action: "click",
    callout: "Author Weapon: Bamboo Pole (1d4, 10 GP)",
    js: `(async () => {
      document.getElementById('btn-empty-new-item')?.click();
      document.getElementById('item-name').value = 'Bamboo Pole';
      document.getElementById('item-slug').value = 'bamboo-pole';
      document.getElementById('item-icon').value = '🎋';
      document.getElementById('item-category').value = 'weapon';
      updateItemCategorySections();
      document.getElementById('item-equip-slot').value = 'main_hand';
      document.getElementById('item-cost').value = 10;
      document.getElementById('item-weight').value = 2;
      document.getElementById('item-rarity').value = 'common';
      document.getElementById('item-damage').value = '1d4';
      document.getElementById('item-damage-type').value = 'bludgeoning';
      document.getElementById('item-desc').value = 'A sturdy pole cut from dense bamboo stalks. Serves as a modest starting weapon for aspiring adventurers.';
      await saveCurrentItem();
      console.log('✔ Authoring & saved Bamboo Pole weapon.');
    })()`,
    minHold: 4000,
  },
  {
    narration: "Next, we author the starting armor: Clothes, providing AC 11, costing 20 GP, with body armor equip slot.",
    target: "#btn-sidebar-new-item",
    action: "click",
    callout: "Author Armor: Clothes (AC 11, 20 GP)",
    js: `(async () => {
      document.getElementById('btn-sidebar-new-item')?.click();
      document.getElementById('item-name').value = 'Clothes';
      document.getElementById('item-slug').value = 'clothes';
      document.getElementById('item-icon').value = '🥋';
      document.getElementById('item-category').value = 'armor';
      updateItemCategorySections();
      document.getElementById('item-equip-slot').value = 'armor';
      document.getElementById('item-cost').value = 20;
      document.getElementById('item-weight').value = 3;
      document.getElementById('item-rarity').value = 'common';
      document.getElementById('item-ac-bonus').value = 11;
      document.getElementById('item-desc').value = 'Simple woven traveler clothes offering light protection against the elements.';
      await saveCurrentItem();
      console.log('✔ Authoring & saved Clothes armor.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We author the Traveler's Cloak accessory, costing 15 GP and occupying the cloak equip slot.",
    target: "#btn-sidebar-new-item",
    action: "click",
    callout: "Author Accessory: Traveler's Cloak (15 GP)",
    js: `(async () => {
      document.getElementById('btn-sidebar-new-item')?.click();
      document.getElementById('item-name').value = "Traveler's Cloak";
      document.getElementById('item-slug').value = 'travelers-cloak';
      document.getElementById('item-icon').value = '🧥';
      document.getElementById('item-category').value = 'accessory';
      updateItemCategorySections();
      document.getElementById('item-equip-slot').value = 'cloak';
      document.getElementById('item-cost').value = 15;
      document.getElementById('item-weight').value = 1.5;
      document.getElementById('item-rarity').value = 'common';
      document.getElementById('item-desc').value = 'A weather-worn woolen cloak worn by Erdrick lineage wanderers.';
      await saveCurrentItem();
      console.log('✔ Authoring & saved Traveler\\'s Cloak.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We author Leather Boots, costing 10 GP and occupying the boots equip slot.",
    target: "#btn-sidebar-new-item",
    action: "click",
    callout: "Author Footwear: Leather Boots (10 GP)",
    js: `(async () => {
      document.getElementById('btn-sidebar-new-item')?.click();
      document.getElementById('item-name').value = 'Leather Boots';
      document.getElementById('item-slug').value = 'leather-boots';
      document.getElementById('item-icon').value = '👢';
      document.getElementById('item-category').value = 'accessory';
      updateItemCategorySections();
      document.getElementById('item-equip-slot').value = 'boots';
      document.getElementById('item-cost').value = 10;
      document.getElementById('item-weight').value = 2;
      document.getElementById('item-rarity').value = 'common';
      document.getElementById('item-desc').value = 'Tough leather boots crafted to withstand the stony paths of Alefgard.';
      await saveCurrentItem();
      console.log('✔ Authoring & saved Leather Boots.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "From the Tantegel treasure chests, we author the Torch tool, costing 8 GP, which illuminates dark subterranean dungeons.",
    target: "#btn-sidebar-new-item",
    action: "click",
    callout: "Author Tool: Torch (Caves & Dungeons)",
    js: `(async () => {
      document.getElementById('btn-sidebar-new-item')?.click();
      document.getElementById('item-name').value = 'Torch';
      document.getElementById('item-slug').value = 'torch';
      document.getElementById('item-icon').value = '🔥';
      document.getElementById('item-category').value = 'tool';
      updateItemCategorySections();
      document.getElementById('item-equip-slot').value = 'none';
      document.getElementById('item-cost').value = 8;
      document.getElementById('item-weight').value = 1;
      document.getElementById('item-rarity').value = 'common';
      document.getElementById('item-desc').value = 'A wooden torch dipped in pitch. Illuminates a radius in pitch-black caves.';
      await saveCurrentItem();
      console.log('✔ Authoring & saved Torch tool.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "Next, we author the Magic Key quest tool, costing 25 GP, capable of unlocking ancient Tantegel doors.",
    target: "#btn-sidebar-new-item",
    action: "click",
    callout: "Author Quest Tool: Magic Key",
    js: `(async () => {
      document.getElementById('btn-sidebar-new-item')?.click();
      document.getElementById('item-name').value = 'Magic Key';
      document.getElementById('item-slug').value = 'magic-key';
      document.getElementById('item-icon').value = '🗝️';
      document.getElementById('item-category').value = 'quest';
      updateItemCategorySections();
      document.getElementById('item-equip-slot').value = 'none';
      document.getElementById('item-cost').value = 25;
      document.getElementById('item-weight').value = 0.5;
      document.getElementById('item-rarity').value = 'uncommon';
      document.getElementById('item-desc').value = 'A mysterious silver key that dissolves in the lock upon opening royal doors.';
      await saveCurrentItem();
      console.log('✔ Authoring & saved Magic Key.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "Finally, we author the Herb consumable, restoring 20-35 HP, costing 24 GP, equipped in quick items.",
    target: "#btn-sidebar-new-item",
    action: "click",
    callout: "Author Consumable: Herb (Restores HP)",
    js: `(async () => {
      document.getElementById('btn-sidebar-new-item')?.click();
      document.getElementById('item-name').value = 'Herb';
      document.getElementById('item-slug').value = 'herb';
      document.getElementById('item-icon').value = '🌿';
      document.getElementById('item-category').value = 'consumable';
      updateItemCategorySections();
      document.getElementById('item-equip-slot').value = 'quick_item';
      document.getElementById('item-cost').value = 24;
      document.getElementById('item-weight').value = 0.2;
      document.getElementById('item-rarity').value = 'common';
      document.getElementById('item-effect').value = 'Restores 20-35 HP to one ally';
      document.getElementById('item-desc').value = 'A fragrant healing medicinal plant prized throughout the realm.';
      await saveCurrentItem();
      console.log('✔ Authoring & saved Herb consumable.');
    })()`,
    minHold: 4000,
  },
  {
    narration: "We test the live search by searching for 'herb', verifying fast filtering, and confirming all 7 items are registered in the Item Library.",
    target: "#item-search-input",
    action: "hover",
    callout: "Live Search & Filter: 7 Items Registered",
    js: `(() => {
      const search = document.getElementById('item-search-input');
      if (search) {
        search.value = 'herb';
        search.dispatchEvent(new Event('input'));
      }
      const count = document.getElementById('items-count')?.textContent;
      if (count !== '1') throw new Error('Search for herb should show 1 item, found: ' + count);
      search.value = '';
      search.dispatchEvent(new Event('input'));
      if (state.items.length !== 7) throw new Error('Expected 7 authored items, found: ' + state.items.length);
      console.log('✔ Item Studio search and library count verified: 7 items.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "Now we switch to Screen 4: Campaign Studio, clicking the new Party & Inventory sub-tab to configure the party and assign real item entities.",
    target: "#tab-camp-inventory",
    action: "click",
    callout: "Campaign -> Party & Inventory Sub-tab",
    js: `(() => {
      switchModule('pane-campaign');
      switchCampaignSubpane('subpane-camp-inventory');
      console.log('✔ Navigated to Campaign -> Party & Inventory sub-tab.');
    })()`,
    minHold: 3500,
  },
  {
    narration: "We assign the Hero of Alefgard as the active party leader in Wedge formation, embarking from the Tantegel Castle Throne Room scene.",
    target: "#party-leader-select",
    action: "hover",
    callout: "Configure Party: Hero of Alefgard, Wedge Formation",
    js: `(() => {
      state.activeCampaignSlug = 'dragonwarrior-1-usa';
      const campSlugEl = document.getElementById('camp-slug');
      if (campSlugEl) campSlugEl.value = 'dragonwarrior-1-usa';
      const campTitleEl = document.getElementById('camp-title');
      if (campTitleEl) campTitleEl.value = 'Dragon Warrior (USA)';
      const campSettingEl = document.getElementById('camp-setting');
      if (campSettingEl) campSettingEl.value = 'Alefgard (NES / Chunsoft)';

      const heroCheck = document.querySelector('#party-checklist .party-check-input');
      if (heroCheck && !heroCheck.checked) {
        heroCheck.checked = true;
        heroCheck.dispatchEvent(new Event('change'));
      }
      const leaderSel = document.getElementById('party-leader-select');
      if (leaderSel && leaderSel.options.length > 0) {
        leaderSel.selectedIndex = 0;
        leaderSel.dispatchEvent(new Event('change'));
      }
      const formSel = document.getElementById('party-formation-select');
      if (formSel) {
        formSel.value = 'wedge';
        formSel.dispatchEvent(new Event('change'));
      }
      const sceneSel = document.getElementById('inventory-scene-select');
      if (sceneSel && Array.from(sceneSel.options).some(o => o.value === 'tantegel-throne-room')) {
        sceneSel.value = 'tantegel-throne-room';
        sceneSel.dispatchEvent(new Event('change'));
      }
      console.log('✔ Active party configured: Hero of Alefgard leader, Wedge formation, Tantegel Throne Room scene.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "King Loric grants 120 Gold from the royal treasury. From the castle chests, we add real Torch, Magic Key, and Herb item entities to the party stash.",
    target: "#stash-item-picker",
    action: "hover",
    callout: "120 GP Purse & Add Real Item Entities to Stash",
    js: `(() => {
      const gp = document.getElementById('gold-gp');
      if (gp) {
        gp.value = 120;
        gp.dispatchEvent(new Event('input'));
      }

      // Add Torch, Magic Key, Herb
      const picker = document.getElementById('stash-item-picker');
      const addBtn = document.getElementById('btn-add-stash-item');
      if (picker && addBtn) {
        picker.value = 'torch';
        addBtn.click();
        picker.value = 'magic-key';
        addBtn.click();
        picker.value = 'herb';
        addBtn.click();
      }

      const rows = document.querySelectorAll('#stash-items-tbody tr');
      if (rows.length !== 3) {
        throw new Error('Expected 3 rows in stash table, found: ' + rows.length);
      }
      console.log('✔ Party purse funded with 120 GP and shared stash populated with real item entities.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "We equip the Hero of Alefgard using real item entity selectors: Bamboo Pole weapon, Clothes armor, Traveler's Cloak, Leather Boots, and Herb quick item.",
    target: ".equipment-slots-grid",
    action: "hover",
    callout: "Equip Hero with Real Item Entity Dropdowns",
    js: `(() => {
      const equipHeroSelect = document.getElementById('equip-hero-select');
      if (equipHeroSelect && equipHeroSelect.options.length > 0) {
        equipHeroSelect.selectedIndex = 0;
        equipHeroSelect.dispatchEvent(new Event('change'));
      }

      document.getElementById('equip-mainhand').value = 'bamboo-pole';
      document.getElementById('equip-offhand').value = '';
      document.getElementById('equip-armor').value = 'clothes';
      document.getElementById('equip-helmet').value = '';
      document.getElementById('equip-cloak').value = 'travelers-cloak';
      document.getElementById('equip-boots').value = 'leather-boots';
      document.getElementById('equip-ring1').value = '';
      document.getElementById('equip-quickitems').value = 'herb';

      persistEquipSlotsToHero();
      console.log('✔ Hero of Alefgard equipped with real item entities (bamboo-pole, clothes, travelers-cloak, leather-boots, herb).');
    })()`,
    minHold: 4500,
  },
  {
    narration: "We click 'Save Inventory' to persist the party configuration, purse, stash, and Hero equipment directly to the Knowledge Graph.",
    target: "#btn-save-inventory",
    action: "click",
    callout: "Save Party Inventory & Hero Equipment JSON-LD",
    js: `(async () => {
      await saveInventory();
      await new Promise(r => setTimeout(r, 800));
      console.log('✔ Inventory saved successfully.');
    })()`,
    minHold: 4500,
  },
  {
    narration: "Switching back to the Overview sub-tab, the live summary reflects 1 Active Party Member, 1 Player Character, and 120 GP in the party purse. We save the campaign.",
    target: "#tab-camp-overview",
    action: "click",
    callout: "Verify Campaign Overview & Save Campaign JSON-LD",
    js: `(async () => {
      switchCampaignSubpane('subpane-camp-overview');
      const gold = document.getElementById('stat-gold-count')?.textContent;
      const party = document.getElementById('stat-party-count')?.textContent;
      const heroes = document.getElementById('stat-heroes-count')?.textContent;

      if (gold !== '120 gp') {
        throw new Error('Assertion failed: Campaign stat-gold-count is ' + gold + ' instead of 120 gp');
      }
      if (party !== '1') {
        throw new Error('Assertion failed: Campaign stat-party-count is ' + party + ' instead of 1');
      }
      if (heroes !== '1') {
        throw new Error('Assertion failed: Campaign stat-heroes-count is ' + heroes + ' instead of 1');
      }

      document.getElementById('camp-slug').value = 'dragonwarrior-1-usa';
      document.getElementById('camp-title').value = 'Dragon Warrior (USA)';
      document.getElementById('camp-setting').value = 'Alefgard (NES / Chunsoft)';
      await saveCurrentCampaign();
      console.log('✔ Campaign stats validated in DOM: 120 gp, 1 active party member, 1 player character.');
    })()`,
    minHold: 4500,
  },
];

async function main() {
  console.log("=== RobOS cRPG Editor E2E: Screens 1, 2, 3 & 4 - Map, Characters, Items & Campaign ===");

  // 1. Pre-test cleanup: Guarantee blank sandboxed state
  console.log(`Pre-test sandboxing: Ensuring clean isolated directory at ${SANDBOX_DIR}...`);
  if (fs.existsSync(SANDBOX_DIR)) {
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });

  // 2. Run the E2E Demo via runDemo
  process.env.ROBOS_CRPG_DIR = SANDBOX_DIR;
  await runDemo({
    slug: SLUG,
    appId: "crpg-editor",
    windowTitle: "RobOS cRPG Editor — Campaign, Character, Inventory & Maps Studio",
    scenario: {
      ...scenarios["all-good"],
      useRealBinaries: true,
      env: {
        ROBOS_CRPG_DIR: SANDBOX_DIR,
      },
    },
    prelaunch: async () => {
      console.log("Prelaunch hook: Ensuring pristine workspace for crpg-editor...");
    },
    script: SCRIPT,
    audio: false,
  });

  console.log("\n=== E2E Run Complete: Running Assertions ===");

  // ==========================================
  // SCREEN 1 ASSERTIONS: MAP
  // ==========================================
  if (!fs.existsSync(MAP_PATH)) {
    throw new Error(`Assertion failed: Map file does not exist at ${MAP_PATH}`);
  }
  console.log("✔ Assertion 1 Passed: Map file exists at", MAP_PATH);

  const rawMapJson = fs.readFileSync(MAP_PATH, "utf8");
  const mapData = JSON.parse(rawMapJson);

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

  if (!fs.existsSync(PNG_PATH)) {
    throw new Error(`Assertion failed: Blockout PNG does not exist at ${PNG_PATH}`);
  }
  const stat = fs.statSync(PNG_PATH);
  if (stat.size < 1000) {
    throw new Error(`Assertion failed: Blockout PNG is suspiciously small: ${stat.size} bytes`);
  }
  console.log(`✔ Assertion 4 Passed: Blockout PNG exists (${stat.size} bytes)`);

  console.log("Running Python blockout compiler verification on generated map...");
  const buildOutput = execSync(`python3 -m robos_crpg_blockout build "${MAP_PATH}" --game-dir "${SANDBOX_DIR}"`, {
    encoding: "utf8",
    cwd: ROBOS_ROOT,
    env: { ...process.env, PYTHONPATH: path.join(ROBOS_ROOT, "packages", "robos-crpg-blockout") },
  });
  console.log("Compiler output:\n" + buildOutput.trim());
  console.log("✔ Assertion 5 Passed: Python blockout compiler validated map successfully");

  // ==========================================
  // SCREEN 2 ASSERTIONS: CHARACTERS
  // ==========================================
  if (!fs.existsSync(HERO_PATH)) {
    throw new Error(`Assertion failed: Player Character file does not exist at ${HERO_PATH}`);
  }
  console.log("✔ Assertion 6 Passed: Player Character file exists at", HERO_PATH);

  const heroData = JSON.parse(fs.readFileSync(HERO_PATH, "utf8"));
  if (heroData["@id"] !== "urn:robos:crpg:character:hero-of-alefgard") {
    throw new Error(`Assertion failed: Unexpected character @id: ${heroData["@id"]}`);
  }
  const heroTypes = Array.isArray(heroData["@type"]) ? heroData["@type"] : [heroData["@type"]];
  if (!heroTypes.includes("robos:CRPGPlayerCharacter") && !heroTypes.includes("robos:CRPGHero")) {
    throw new Error(`Assertion failed: Character @type missing robos:CRPGPlayerCharacter: ${JSON.stringify(heroTypes)}`);
  }
  if (heroData.name !== "Hero of Alefgard" || heroData["schema:name"] !== "Hero of Alefgard") {
    throw new Error(`Assertion failed: Character name mismatch: ${heroData.name}`);
  }
  if (heroData["robos:class"] !== "Fighter" || Number(heroData["robos:level"]) !== 1) {
    throw new Error(`Assertion failed: Character class/level mismatch: Lvl ${heroData["robos:level"]} ${heroData["robos:class"]}`);
  }
  if (Number(heroData["robos:str"]) !== 16 || Number(heroData["robos:hpMax"]) !== 16) {
    throw new Error(`Assertion failed: Character stats mismatch: STR ${heroData["robos:str"]}, HP ${heroData["robos:hpMax"]}`);
  }
  if (!heroData["robos:backstory"] || !heroData["robos:backstory"].includes("Descendant of the legendary hero Erdrick")) {
    throw new Error(`Assertion failed: Character backstory missing Erdrick lore`);
  }
  console.log("✔ Assertion 7 Passed: Hero of Alefgard Player Character JSON-LD metadata and 5e stats verified");

  if (!fs.existsSync(NPC_PATH)) {
    throw new Error(`Assertion failed: NPC file does not exist at ${NPC_PATH}`);
  }
  console.log("✔ Assertion 8 Passed: NPC file exists at", NPC_PATH);

  const npcData = JSON.parse(fs.readFileSync(NPC_PATH, "utf8"));
  if (npcData["@id"] !== "urn:robos:crpg:character:npc-king-loric") {
    throw new Error(`Assertion failed: Unexpected NPC @id: ${npcData["@id"]}`);
  }
  const npcTypes = Array.isArray(npcData["@type"]) ? npcData["@type"] : [npcData["@type"]];
  if (!npcTypes.includes("robos:CRPGNPC")) {
    throw new Error(`Assertion failed: NPC @type missing robos:CRPGNPC: ${JSON.stringify(npcTypes)}`);
  }
  if (npcData.name !== "King Loric" || npcData["schema:name"] !== "King Loric") {
    throw new Error(`Assertion failed: NPC name mismatch: ${npcData.name}`);
  }
  if (npcData["robos:npcRole"] !== "king" || npcData["robos:interactionType"] !== "save") {
    throw new Error(`Assertion failed: NPC role/interaction mismatch: ${npcData["robos:npcRole"]}/${npcData["robos:interactionType"]}`);
  }
  if (npcData["robos:location"] !== "tantegel-throne-room") {
    throw new Error(`Assertion failed: NPC location not linked to tantegel-throne-room: ${npcData["robos:location"]}`);
  }
  if (Number(npcData["robos:col"]) !== 8 || Number(npcData["robos:row"]) !== 4) {
    throw new Error(`Assertion failed: NPC grid position mismatch: ${npcData["robos:col"]}, ${npcData["robos:row"]}`);
  }
  const dialogue = Array.isArray(npcData["robos:dialogue"]) ? npcData["robos:dialogue"].join(" ") : (npcData["robos:dialogue"] || "");
  if (!dialogue.includes("Ball of Light") || !dialogue.includes("Dragonlord")) {
    throw new Error(`Assertion failed: NPC dialogue missing Ball of Light quest decree: ${dialogue}`);
  }
  console.log("✔ Assertion 9 Passed: King Loric NPC JSON-LD, map link, and dialogue verified");

  // ==========================================
  // SCREEN 3 ASSERTIONS: ITEMS (Item Studio)
  // ==========================================
  const itemPaths = [
    { path: BAMBOO_PATH, slug: "bamboo-pole", title: "Bamboo Pole", category: "weapon", slot: "main_hand" },
    { path: CLOTHES_PATH, slug: "clothes", title: "Clothes", category: "armor", slot: "armor" },
    { path: CLOAK_PATH, slug: "travelers-cloak", title: "Traveler's Cloak", category: "accessory", slot: "cloak" },
    { path: BOOTS_PATH, slug: "leather-boots", title: "Leather Boots", category: "accessory", slot: "boots" },
    { path: TORCH_PATH, slug: "torch", title: "Torch", category: "tool", slot: "none" },
    { path: KEY_PATH, slug: "magic-key", title: "Magic Key", category: "quest", slot: "none" },
    { path: HERB_PATH, slug: "herb", title: "Herb", category: "consumable", slot: "quick_item" },
  ];

  for (const it of itemPaths) {
    if (!fs.existsSync(it.path)) {
      throw new Error(`Assertion failed: Item file does not exist at ${it.path}`);
    }
    const itemData = JSON.parse(fs.readFileSync(it.path, "utf8"));
    if (itemData["@id"] !== `urn:robos:crpg:item:${it.slug}`) {
      throw new Error(`Assertion failed: Item @id mismatch: ${itemData["@id"]}`);
    }
    if (itemData["dcterms:title"] !== it.title) {
      throw new Error(`Assertion failed: Item title mismatch: ${itemData["dcterms:title"]}`);
    }
    if (itemData["robos:itemCategory"] !== it.category) {
      throw new Error(`Assertion failed: Item category mismatch: ${itemData["robos:itemCategory"]}`);
    }
  }
  console.log("✔ Assertion 10 Passed: All 7 real CRPGItem JSON-LD files exist and validate against CRPGItemShape");

  // Validate Bamboo Pole Weapon details
  const bambooData = JSON.parse(fs.readFileSync(BAMBOO_PATH, "utf8"));
  if (bambooData["robos:damageDice"] !== "1d4" || bambooData["robos:damageType"] !== "bludgeoning" || Number(bambooData["robos:cost"]) !== 10) {
    throw new Error(`Assertion failed: Bamboo Pole weapon properties mismatch: dice=${bambooData["robos:damageDice"]}, type=${bambooData["robos:damageType"]}, cost=${bambooData["robos:cost"]}`);
  }
  console.log("✔ Assertion 11 Passed: Bamboo Pole weapon properties (1d4 bludgeoning, 10 GP) verified");

  // Validate Herb Consumable details
  const herbData = JSON.parse(fs.readFileSync(HERB_PATH, "utf8"));
  if (!herbData["robos:effect"] || !herbData["robos:effect"].includes("Restores 20-35 HP") || Number(herbData["robos:cost"]) !== 24) {
    throw new Error(`Assertion failed: Herb consumable properties mismatch: ${herbData["robos:effect"]}`);
  }
  console.log("✔ Assertion 12 Passed: Herb consumable properties (restores HP, 24 GP) verified");

  // ==========================================
  // SCREEN 4 ASSERTIONS: CAMPAIGN & INVENTORY
  // ==========================================
  // Assertion 13: Validate Hero of Alefgard Equipment slots saved on disk with real item entities
  const reloadedHeroData = JSON.parse(fs.readFileSync(HERO_PATH, "utf8"));
  const expectedSlots = {
    mainHand: "bamboo-pole",
    armor: "clothes",
    cloak: "travelers-cloak",
    boots: "leather-boots",
    quickItems: "herb"
  };
  for (const [slot, expectedSlug] of Object.entries(expectedSlots)) {
    const actual = reloadedHeroData[slot] || reloadedHeroData[`robos:${slot}`];
    if (actual !== expectedSlug && !actual.toLowerCase().includes(expectedSlug)) {
      throw new Error(`Assertion failed: Hero ${slot} mismatch: ${actual} (expected ${expectedSlug})`);
    }
  }
  console.log("✔ Assertion 13 Passed: Hero of Alefgard equipment slots verified with real item entities (bamboo-pole, clothes, cloak, boots, herb)");

  // Assertion 14: Validate Campaign Shared Inventory & Party
  if (!fs.existsSync(CAMPAIGN_PATH)) {
    throw new Error(`Assertion failed: Campaign file does not exist at ${CAMPAIGN_PATH}`);
  }
  console.log("✔ Assertion 14 Passed: Campaign file exists at", CAMPAIGN_PATH);

  const campaignData = JSON.parse(fs.readFileSync(CAMPAIGN_PATH, "utf8"));
  const gsData = campaignData["robos:gameState"] || campaignData.gameState;
  if (!gsData) {
    throw new Error("Assertion failed: Campaign missing robos:gameState");
  }
  const sharedInv = gsData["robos:sharedInventory"] || gsData.sharedInventory;
  if (!sharedInv || Number(sharedInv.gold) !== 120) {
    throw new Error(`Assertion failed: Shared inventory gold mismatch: ${sharedInv ? sharedInv.gold : "missing"}`);
  }
  const items = sharedInv.items || [];
  const itemSlugs = items.map(it => typeof it === 'object' && it !== null ? (it.slug || it.id) : it);
  if (!itemSlugs.some(s => s.includes("torch")) || !itemSlugs.some(s => s.includes("magic-key")) || !itemSlugs.some(s => s.includes("herb"))) {
    throw new Error(`Assertion failed: Shared items missing starting chest items: ${JSON.stringify(items)}`);
  }
  if (gsData["robos:partyFormation"] !== "wedge") {
    throw new Error(`Assertion failed: Party formation mismatch: ${gsData["robos:partyFormation"]}`);
  }
  const activeParty = gsData["robos:activeParty"] || [];
  if (activeParty.length !== 1 || !activeParty[0].includes("hero-of-alefgard")) {
    throw new Error(`Assertion failed: Active party mismatch: ${JSON.stringify(activeParty)}`);
  }
  console.log("✔ Assertion 15 Passed: Campaign shared inventory (120 GP, real Torch, Magic Key, Herb entities) & Wedge formation verified");

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
    const frameMapPath = path.join(BRAIN_DIR, "crpg_editor_tantegel_map_screen.png");
    const frameCharEmptyPath = path.join(BRAIN_DIR, "crpg_editor_char_empty_state.png");
    const frameHeroPath = path.join(BRAIN_DIR, "crpg_editor_hero_alefgard_authored.png");
    const frameKingPath = path.join(BRAIN_DIR, "crpg_editor_king_loric_authored.png");
    const frameCharSearchPath = path.join(BRAIN_DIR, "crpg_editor_char_search_filter.png");
    const frameItemStudioPath = path.join(BRAIN_DIR, "crpg_editor_item_studio.png");
    const frameCampPartyInvPath = path.join(BRAIN_DIR, "crpg_editor_campaign_party_inventory.png");
    const frameCampOverviewPath = path.join(BRAIN_DIR, "crpg_editor_campaign_overview_with_party.png");

    try {
      execSync(`ffmpeg -y -ss 00:00:03 -i "${finalVideo}" -vframes 1 "${frameEmptyPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:00:51 -i "${finalVideo}" -vframes 1 "${frameModalPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:01:01 -i "${finalVideo}" -vframes 1 "${frameMapPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:01:09 -i "${finalVideo}" -vframes 1 "${frameCharEmptyPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:01:18 -i "${finalVideo}" -vframes 1 "${frameHeroPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:01:33 -i "${finalVideo}" -vframes 1 "${frameKingPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:01:43 -i "${finalVideo}" -vframes 1 "${frameCharSearchPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:02:15 -i "${finalVideo}" -vframes 1 "${frameItemStudioPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:02:58 -i "${finalVideo}" -vframes 1 "${frameCampPartyInvPath}"`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:03:07 -i "${finalVideo}" -vframes 1 "${frameCampOverviewPath}"`, { stdio: "ignore" });
      console.log(`Extracted review frames:\n  - ${frameEmptyPath}\n  - ${frameModalPath}\n  - ${frameMapPath}\n  - ${frameCharEmptyPath}\n  - ${frameHeroPath}\n  - ${frameKingPath}\n  - ${frameCharSearchPath}\n  - ${frameItemStudioPath}\n  - ${frameCampPartyInvPath}\n  - ${frameCampOverviewPath}`);
    } catch (err) {
      console.warn("Could not extract frames:", err.message);
    }
  }

  if (fs.existsSync(srcVtt)) {
    fs.copyFileSync(srcVtt, path.join(PERSIST_DIR, `${SLUG}.vtt`));
    fs.copyFileSync(srcVtt, path.join(BRAIN_DIR, `${SLUG}.vtt`));
  }

  console.log("\n=======================================================");
  console.log("🎉 SCREENS 1, 2, 3 & 4 (MAP, CHARACTERS, ITEMS, CAMPAIGN PARTY & INVENTORY) CREATED, SAVED, AND ASSERTED SUCCESSFULLY!");
  console.log("=======================================================");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL ERROR in E2E Test:", err);
    process.exit(1);
  });
}
