"use strict";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const scenarios = require("../lib/scenarios");
const { runDemo } = require("../lib/demo-runner");

const SLUG = "crpg-editor-dragonwarrior";
const PERSIST_DIR = path.join(process.env.HOME || "/home/ndipiazza", ".robos", "development", "walkthroughs", SLUG);
const BRAIN_DIR = "/home/ndipiazza/.gemini/antigravity/brain/378ca830-4ff9-41ba-a48b-b56c4dd0a48f";

const SCRIPT = [
  {
    narration: "RobOS cRPG Editor consolidates Campaigns, independent Characters & NPCs, Party Inventory, and Tactical Maps into a unified studio.",
    target: ".top-header",
    action: "hover",
    callout: "RobOS cRPG Editor — Unified Studio Overview",
    minHold: 4000,
  },
  {
    narration: "We switch to the Tactical Maps Studio to create the starting battle arena for Dragon Warrior 1.",
    target: ".nav-tab-btn[data-pane='pane-maps']",
    action: "click",
    callout: "Switch to Tactical Maps Studio",
    js: `(() => {
      const btn = document.querySelector(".nav-tab-btn[data-pane='pane-maps']");
      if (btn) btn.click();
    })()`,
    minHold: 4000,
  },
  {
    narration: "We create the independent battle map 'tantegel-throne-room' with 60x40 ft stone floor, King Loric's throne dais, royal stone pillars, and treasure chest.",
    target: "#btn-new-map",
    action: "click",
    callout: "Create Map: Tantegel Castle Throne Room (2F)",
    js: `(() => {
      document.getElementById('btn-new-map')?.click();
      document.getElementById('map-slug').value = 'tantegel-throne-room';
      document.getElementById('map-title').value = 'Tantegel Castle - Throne Room (2F)';
      document.getElementById('map-terrain').value = 'stone';
      document.getElementById('map-width').value = '60';
      document.getElementById('map-height').value = '40';
      if (typeof updateMapDimensionsFromForm === 'function') updateMapDimensionsFromForm();

      state.activeMapData['@id'] = 'urn:robos:crpg:battle-map:tantegel-throne-room';
      state.activeMapData['robos:mapObjects'] = [
        {
          '@type': 'robos:CRPGMapObject',
          'robos:objectId': 'throne-dais',
          'robos:objectType': 'wall',
          'robos:shape': 'rect',
          'robos:position': [24, 6],
          'robos:size': [12, 6],
          'dcterms:title': "King Loric's Throne Dais",
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
          label: "King Loric's Throne Dais",
          notes: "Elevated throne where King Loric sits with Imperial Scrolls"
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
          'robos:objectId': 'chest-gold',
          'robos:objectType': 'chest',
          'robos:shape': 'rect',
          'robos:position': [38, 6],
          'robos:size': [3, 3],
          'dcterms:title': 'Chest (120 Gold)',
          id: 'chest-gold',
          type: 'chest',
          shape: 'rect',
          x: 38,
          y: 6,
          w: 3,
          h: 3,
          rot: 0,
          stroke: '#ffd700',
          fill: '#8b4513',
          collision: 'blocked',
          opacity: 'transparent',
          height: 3,
          label: 'Chest (120 Gold)',
          notes: 'Contains 120 G granted by King Loric'
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
    narration: "We save the map and trigger the automated build pipeline to compile the static PNG and 5-foot collision grid.",
    target: "#btn-save-map",
    action: "click",
    callout: "Save Map & Compile 5-ft Blockout PNG",
    js: `(() => {
      document.getElementById('btn-save-map')?.click();
      setTimeout(() => {
        document.getElementById('btn-build-map')?.click();
      }, 1000);
    })()`,
    minHold: 6000,
  },
  {
    narration: "We switch to the Characters & NPCs Studio to manage heroes and NPCs as independent linked entities.",
    target: ".nav-tab-btn[data-pane='pane-characters']",
    action: "click",
    callout: "Switch to Characters & NPCs Studio",
    js: `(() => {
      const btn = document.querySelector(".nav-tab-btn[data-pane='pane-characters']");
      if (btn) btn.click();
    })()`,
    minHold: 4000,
  },
  {
    narration: "We click '+ Hero' to scaffold the Hero of Alefgard with D&D 5e Fighter heritage and Erdrick's bloodline.",
    target: "#btn-add-hero",
    action: "click",
    callout: "Author Hero: Hero of Alefgard",
    js: `(() => {
      document.getElementById('btn-add-hero')?.click();
      document.getElementById('hero-name').value = 'Hero of Alefgard';
      document.getElementById('hero-slug').value = 'hero-of-alefgard';
      document.getElementById('hero-portrait').value = '⚔️';
      document.getElementById('hero-race').value = 'Human';
      document.getElementById('hero-class').value = 'Fighter';
      document.getElementById('hero-subclass').value = 'Descendant of Erdrick';
      document.getElementById('hero-background').value = 'Erdrick Bloodline';
      document.getElementById('hero-alignment').value = 'Lawful Good';
      document.getElementById('hero-level').value = '1';
      document.getElementById('hero-xp').value = '0';

      document.getElementById('attr-str').value = '16';
      if (typeof updateAbilityModifier === 'function') updateAbilityModifier('str', 16);
      document.getElementById('attr-dex').value = '14';
      if (typeof updateAbilityModifier === 'function') updateAbilityModifier('dex', 14);
      document.getElementById('attr-con').value = '15';
      if (typeof updateAbilityModifier === 'function') updateAbilityModifier('con', 15);
      document.getElementById('attr-int').value = '11';
      if (typeof updateAbilityModifier === 'function') updateAbilityModifier('int', 11);
      document.getElementById('attr-wis').value = '12';
      if (typeof updateAbilityModifier === 'function') updateAbilityModifier('wis', 12);
      document.getElementById('attr-cha').value = '13';
      if (typeof updateAbilityModifier === 'function') updateAbilityModifier('cha', 13);

      document.getElementById('vital-ac').value = '12';
      document.getElementById('vital-hp-max').value = '15';
      document.getElementById('vital-hp-cur').value = '15';
      document.getElementById('vital-speed').value = '30';
      document.getElementById('vital-init').value = '2';
      document.getElementById('vital-prof').value = '2';

      document.getElementById('hero-spells').value = 'HEAL (Cantrip: 3-5 HP), SIZZ (Fire Spell, 2 MP)';
      document.getElementById('hero-backstory').value = 'Direct bloodline descendant of legendary hero Erdrick. Answering King Lorics summons in Alefgard to defeat the Dragonlord and reclaim the Ball of Light.';

      const avatar = document.getElementById('hero-avatar-display');
      if (avatar) avatar.textContent = '⚔️';
      const titleEl = document.getElementById('sheet-hero-title');
      if (titleEl) titleEl.textContent = 'Hero of Alefgard (Hero)';
    })()`,
    minHold: 5500,
  },
  {
    narration: "We click 'Save Character' to persist the Hero of Alefgard as an independent JSON-LD entity.",
    target: "#btn-save-character",
    action: "click",
    callout: "Save Hero Character Entity",
    js: `(() => {
      document.getElementById('btn-save-character')?.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We click '+ NPC' to author King Loric with save-game interaction, Tantegel Castle placement, and royal dialogue.",
    target: "#btn-add-npc",
    action: "click",
    callout: "Author NPC: King Loric (Monarch of Tantegel)",
    js: `(() => {
      document.getElementById('btn-add-npc')?.click();
      document.getElementById('hero-name').value = 'King Loric';
      document.getElementById('hero-slug').value = 'npc-king-loric';
      document.getElementById('hero-portrait').value = '👑';
      document.getElementById('hero-alignment').value = 'Lawful Good';
      document.getElementById('npc-role').value = 'king';
      document.getElementById('npc-interaction').value = 'save';
      document.getElementById('npc-location').value = 'tantegel-throne-room';
      document.getElementById('npc-facing').value = 'down';
      document.getElementById('npc-col').value = '4';
      document.getElementById('npc-row').value = '4';
      document.getElementById('npc-dialogue').value = 'Descendant of Erdrick, listen now to my words. It is told that in ages past Erdrick fought demons with a Ball of Light.\\n\\nThen came the Dragonlord who stole the precious globe and hid it in the darkness.\\n\\nNow, Hero, thou must help us recover the Ball of Light and restore peace to our land. Take now whatever thou may find in these Treasure Chests.\\n\\nMay the light shine upon thee, Hero.';
      document.getElementById('hero-backstory').value = 'Monarch of Tantegel Castle who chronicles deeds of valor on the Imperial Scrolls of Honor.';

      const avatar = document.getElementById('hero-avatar-display');
      if (avatar) avatar.textContent = '👑';
      const titleEl = document.getElementById('sheet-hero-title');
      if (titleEl) titleEl.textContent = 'King Loric (NPC)';
    })()`,
    minHold: 5500,
  },
  {
    narration: "We save King Loric as an independent NPC entity in the Knowledge Graph.",
    target: "#btn-save-character",
    action: "click",
    callout: "Save King Loric NPC Entity",
    js: `(() => {
      document.getElementById('btn-save-character')?.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: "We click '+ NPC' to create Princess Gwaelin, assigning role 'princess' and her authentic dialogue script.",
    target: "#btn-add-npc",
    action: "click",
    callout: "Author NPC: Princess Gwaelin",
    js: `(() => {
      document.getElementById('btn-add-npc')?.click();
      document.getElementById('hero-name').value = 'Princess Gwaelin';
      document.getElementById('hero-slug').value = 'npc-princess-gwaelin';
      document.getElementById('hero-portrait').value = '👸';
      document.getElementById('hero-alignment').value = 'Neutral Good';
      document.getElementById('npc-role').value = 'princess';
      document.getElementById('npc-interaction').value = 'talk';
      document.getElementById('npc-location').value = 'tantegel-throne-room';
      document.getElementById('npc-facing').value = 'down';
      document.getElementById('npc-col').value = '6';
      document.getElementById('npc-row').value = '19';
      document.getElementById('npc-dialogue').value = 'I have waited so long for thee, brave Hero. I knew the bloodline of Erdrick would save our realm.\\n\\nWilt thou take me back to Tantegel Castle?';
      document.getElementById('hero-backstory').value = 'Beloved princess of Alefgard kidnapped by the Dragonlord in a swamp cave.';

      const avatar = document.getElementById('hero-avatar-display');
      if (avatar) avatar.textContent = '👸';
      const titleEl = document.getElementById('sheet-hero-title');
      if (titleEl) titleEl.textContent = 'Princess Gwaelin (NPC)';
    })()`,
    minHold: 5500,
  },
  {
    narration: "We save Princess Gwaelin and demonstrate the responsive Hero vs NPC classification filters.",
    target: "#btn-save-character",
    action: "click",
    callout: "Save Princess Gwaelin & Test Roster Filters",
    js: `(() => {
      document.getElementById('btn-save-character')?.click();
      setTimeout(() => {
        document.getElementById('pill-filter-heroes')?.click();
      }, 1500);
      setTimeout(() => {
        document.getElementById('pill-filter-npcs')?.click();
      }, 3000);
      setTimeout(() => {
        document.getElementById('pill-filter-all')?.click();
      }, 4500);
    })()`,
    minHold: 6000,
  },
  {
    narration: "We switch to the Campaign module to compose the maps, heroes, NPCs, and quests into Dragon Warrior 1 USA.",
    target: ".nav-tab-btn[data-pane='pane-campaign']",
    action: "click",
    callout: "Switch to Campaign Management",
    js: `(() => {
      const btn = document.querySelector(".nav-tab-btn[data-pane='pane-campaign']");
      if (btn) btn.click();
    })()`,
    minHold: 4000,
  },
  {
    narration: "We author the campaign metadata, select 'tantegel-throne-room' as primary starting map, link characters, and log quests.",
    target: "#btn-new-campaign",
    action: "click",
    callout: "Author Campaign: Dragon Warrior (USA)",
    js: `(() => {
      document.getElementById('btn-new-campaign')?.click();
      document.getElementById('camp-title').value = 'Dragon Warrior (USA)';
      document.getElementById('camp-slug').value = 'dragonwarrior-1-usa';
      document.getElementById('camp-setting').value = 'Alefgard (NES / Chunsoft)';
      document.getElementById('camp-ruleset').value = 'D&D 5e SRD';
      document.getElementById('camp-difficulty').value = 'Core Rules';
      document.getElementById('camp-desc').value = 'Darkness enshrouds the realm of Alefgard after the sinister Dragonlord plundered the sacred Ball of Light. King Loric summons the last descendant of Erdrick to embark on the quest.';

      // Select starting map
      const startMapSelect = document.getElementById('camp-starting-map');
      if (startMapSelect) startMapSelect.value = 'tantegel-throne-room';

      // Check Maps
      document.querySelectorAll('#camp-maps-checklist .camp-map-chk').forEach(chk => {
        chk.checked = (chk.getAttribute('data-slug') === 'tantegel-throne-room');
      });
      if (typeof updateCampaignMapsFromChecklist === 'function') updateCampaignMapsFromChecklist();

      // Check Characters
      document.querySelectorAll('#camp-characters-checklist .camp-char-chk').forEach(chk => {
        const slug = chk.getAttribute('data-slug');
        chk.checked = ['hero-of-alefgard', 'npc-king-loric', 'npc-princess-gwaelin'].includes(slug);
      });
      if (typeof updateCampaignCharactersFromChecklist === 'function') updateCampaignCharactersFromChecklist();

      // Add Quests
      const gs = getGameState();
      gs['robos:questLog'] = [
        {
          id: 'quest-defeat-dragonlord',
          title: 'Defeat the Dragonlord',
          status: 'active',
          description: 'Journey across Alefgard, breach Charlock Castle, and vanquish the Dragonlord.',
          reward: 'Ball of Light, Peace in Alefgard'
        },
        {
          id: 'quest-rescue-gwaelin',
          title: 'Rescue Princess Gwaelin',
          status: 'active',
          description: 'Search the swamp cave south of Tantegel Castle and defeat the Green Dragon to free Princess Gwaelin.',
          reward: "Princess Gwaelin's Love, 100 XP"
        }
      ];
      if (typeof renderQuestLog === 'function') renderQuestLog();

      // Add Story Flags
      gs['robos:worldFlags'] = {
        ball_of_light_stolen: true,
        dragonlord_threat: true,
        princess_rescued: false
      };
      if (typeof renderStoryFlags === 'function') renderStoryFlags();
      if (typeof updateCampaignSummaryStats === 'function') updateCampaignSummaryStats();
    })()`,
    minHold: 6000,
  },
  {
    narration: "We click 'Save Campaign' to persist the campaign and its compositional relations in the Knowledge Graph.",
    target: "#btn-save-campaign",
    action: "click",
    callout: "Save Campaign & Link KGraph Relations",
    js: `(() => {
      document.getElementById('btn-save-campaign')?.click();
    })()`,
    minHold: 5000,
  },
  {
    narration: "We switch to the Inventory Editor to equip the Hero of Alefgard with starting gear and 120 Gold from the King's chests.",
    target: ".nav-tab-btn[data-pane='pane-inventory']",
    action: "click",
    callout: "Equip Hero & Set Starting Party Gold",
    js: `(() => {
      const btn = document.querySelector(".nav-tab-btn[data-pane='pane-inventory']");
      if (btn) btn.click();
      setTimeout(() => {
        document.getElementById('gold-gp').value = '120';
        document.getElementById('equip-mainhand').value = 'Bamboo Pole (Club 1d4)';
        document.getElementById('equip-offhand').value = 'Small Shield (+1 AC)';
        document.getElementById('equip-armor').value = 'Clothes (AC 10+DEX)';
        document.getElementById('equip-quickitems').value = 'Herb, Torch, Magic Key';
        document.getElementById('shared-items-textarea').value = 'Herb (Restores 20-35 HP)\\nTorch (Lights Dungeons 3x3)\\nMagic Key (Opens Royal Doors)';

        const firstHeroCheck = document.querySelector('#party-checklist .party-check-input');
        if (firstHeroCheck) firstHeroCheck.checked = true;
      }, 500);
    })()`,
    minHold: 5500,
  },
  {
    narration: "We return to the Campaign module to review the verified summary stats: 1 Hero roster, 1 Active Party member, 2 Quests, and 120 GP purse.",
    target: ".nav-tab-btn[data-pane='pane-campaign']",
    action: "click",
    callout: "Review Verified Campaign Summary Stats",
    js: `(() => {
      const btn = document.querySelector(".nav-tab-btn[data-pane='pane-campaign']");
      if (btn) btn.click();
      setTimeout(() => {
        document.getElementById('btn-save-campaign')?.click();
      }, 1000);
    })()`,
    minHold: 5000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ":99";
  const binDir = path.join(process.env.HOME || "/home/ndipiazza", ".local", "bin");

  runDemo({
    slug: SLUG,
    appId: "crpg-editor",
    windowTitle: "RobOS cRPG Editor — Campaign, Character, Inventory & Maps Studio",
    scenario: {
      ...scenarios["all-good"],
      useRealBinaries: true,
    },
    audio: false,
    env: {
      ROBOS_DEMO_SHOW: "1",
      ROBOS_REAL_BINARIES: "1",
      PATH: `${binDir}:${process.env.PATH}`,
    },
    script: SCRIPT,
    prelaunch: async (app) => {
      try {
        execSync(`wmctrl -r "RobOS cRPG Editor" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    if (!fs.existsSync(BRAIN_DIR)) {
      fs.mkdirSync(BRAIN_DIR, { recursive: true });
    }

    // Extract key frames for walkthrough verification
    try {
      execSync(`ffmpeg -y -ss 00:00:03 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/crpg_editor_overview_frame.png`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:00:12 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/crpg_editor_tantegel_map_frame.png`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:00:23 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/crpg_editor_hero_alefgard_frame.png`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:00:33 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/crpg_editor_king_loric_npc_frame.png`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:00:43 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/crpg_editor_princess_gwaelin_frame.png`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:00:54 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/crpg_editor_campaign_dragonwarrior_frame.png`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:01:05 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/crpg_editor_inventory_equipped_frame.png`, { stdio: "ignore" });
      execSync(`ffmpeg -y -ss 00:01:12 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/crpg_editor_final_summary_frame.png`, { stdio: "ignore" });

      fs.copyFileSync(videoPath, `${BRAIN_DIR}/${SLUG}-final.webm`);
      fs.copyFileSync(vttPath, `${BRAIN_DIR}/${SLUG}.vtt`);
    } catch (err) {
      console.warn("Frame extraction warning:", err.message);
    }

    console.log("✓ Dragon Warrior 1 (USA) Full E2E Demo Finished Successfully!");
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
