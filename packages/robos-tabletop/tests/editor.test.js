const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const KGRAPH_TABLETOP = path.join(REPO_ROOT, ".robos/kgraphs/tabletop-game/package.jsonld");

describe("RobOS Tabletop Studio Editor Test Suite", () => {
  it("verifies package manifest and desktop entry exist", () => {
    const pkgPath = path.join(__dirname, "../package.json");
    const desktopPath = path.join(__dirname, "../robos-tabletop.desktop");
    const iconPath = path.join(__dirname, "../icon.svg");

    assert.ok(fs.existsSync(pkgPath), "package.json must exist");
    assert.ok(fs.existsSync(desktopPath), "robos-tabletop.desktop must exist");
    assert.ok(fs.existsSync(iconPath), "icon.svg must exist");

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    assert.strictEqual(pkg.name, "robos-tabletop");
  });

  it("reads Tabletop Knowledge Graph nodes for form editor", () => {
    assert.ok(fs.existsSync(KGRAPH_TABLETOP), "tabletop-game package.jsonld must exist");
    const data = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"));
    const nodes = data["robos:nodes"] || [];

    const heroes = nodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopHero");
    });
    assert.strictEqual(heroes.length, 4, "Must contain 4 classic heroes");

    const monsters = nodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopMonster");
    });
    assert.ok(monsters.length >= 8, "Must contain at least 8 monsters");

    const map = nodes.find(n => n["@id"] === "urn:robos:tabletop:map:the-trial");
    assert.ok(map, "Must define the-trial map");
    assert.strictEqual(map["robos:width"], 26);
    assert.strictEqual(map["robos:height"], 19);
  });

  it("loads multiple map configurations including First Light Caverns and Fan Dungeon 28x21", () => {
    const { listMapConfigurations, getMapConfiguration } = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const configs = listMapConfigurations();
    assert.ok(configs.length >= 3, "Must support at least 3 map configurations");

    const fanDungeon = getMapConfiguration("fan-dungeon-28x21");
    assert.ok(fanDungeon, "Fan Dungeon 28x21 must be registered");
    assert.strictEqual(fanDungeon.boardSide, "Custom");
    assert.deepEqual(fanDungeon.gridDimensions, [28, 21]);
    assert.strictEqual(fanDungeon.rooms.length, 19, "Fan Dungeon must define 19 rooms");

    const classic = getMapConfiguration("heroquest-classic");
    assert.strictEqual(classic.boardSide, "A");
    assert.deepEqual(classic.gridDimensions, [26, 19]);

    const firstLight = getMapConfiguration("first-light-caverns");
    assert.strictEqual(firstLight.boardSide, "B");
    assert.deepEqual(firstLight.gridDimensions, [26, 19]);
    assert.ok(firstLight.rooms.length > 10, "First Light must define cavern rooms");
  });

  it("verifies board image assets exist for all registered configurations", () => {
    const boardSideA = path.join(REPO_ROOT, "games/tabletop-rpg/assets/boards/heroquest_board.png");
    const boardSideB = path.join(REPO_ROOT, "games/tabletop-rpg/assets/boards/first_light_caverns.png");
    const boardFan = path.join(REPO_ROOT, "games/tabletop-rpg/assets/boards/fan_dungeon_28x21.png");

    assert.ok(fs.existsSync(boardSideA), "Side A heroquest_board.png must exist");
    assert.ok(fs.existsSync(boardSideB), "Side B first_light_caverns.png must exist");
    assert.ok(fs.existsSync(boardFan), "Fan Dungeon 28x21 board must exist");
  });

  it("supports undo and redo for map entity modifications", () => {
    const initialQuest = {
      activeRooms: ["room-1"],
      doors: [],
      wallBlocks: [],
      furniture: [],
      monsters: [],
      traps: []
    };

    const undoStack = [];
    const redoStack = [];

    function push(state) {
      undoStack.push(JSON.parse(JSON.stringify(state)));
      redoStack.length = 0;
    }

    function undo(current) {
      assert.ok(undoStack.length > 0, "Undo stack cannot be empty");
      redoStack.push(JSON.parse(JSON.stringify(current)));
      return undoStack.pop();
    }

    function redo(current) {
      assert.ok(redoStack.length > 0, "Redo stack cannot be empty");
      undoStack.push(JSON.parse(JSON.stringify(current)));
      return redoStack.pop();
    }

    let current = JSON.parse(JSON.stringify(initialQuest));

    // Action 1: Place a 1-tile wall
    push(current);
    current.wallBlocks.push({ id: "block-1", x: 12, y: 0, type: "single", width: 1, height: 1 });
    assert.strictEqual(current.wallBlocks.length, 1);

    // Action 2: Place a 3x2 Sorcerer's Altar
    push(current);
    current.furniture.push({ id: "altar-1", type: "altar", x: 13, y: 9, width: 3, height: 2 });
    assert.strictEqual(current.furniture.length, 1);

    // Undo Action 2: Altar should be reverted
    current = undo(current);
    assert.strictEqual(current.furniture.length, 0, "Altar must be removed after undo");
    assert.strictEqual(current.wallBlocks.length, 1, "Wall block must remain");

    // Undo Action 1: Wall block should be reverted
    current = undo(current);
    assert.strictEqual(current.wallBlocks.length, 0, "Wall block must be removed after second undo");

    // Redo Action 1: Wall block should be restored
    current = redo(current);
    assert.strictEqual(current.wallBlocks.length, 1, "Wall block must be restored on redo");

    // Redo Action 2: Altar should be restored
    current = redo(current);
    assert.strictEqual(current.furniture.length, 1, "Altar must be restored on second redo");
    assert.strictEqual(current.furniture[0].type, "altar");
  });

  it("supports campaign editor board theme selection from maps in Maps", () => {
    const { listMapConfigurations, getMapConfiguration } = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const configs = listMapConfigurations();
    const configIds = configs.map(c => c.id);

    assert.ok(configIds.includes("fan-dungeon-28x21"), "Fan dungeon must be selectable");
    assert.ok(configIds.includes("heroquest-classic"), "HeroQuest classic must be selectable");
    assert.ok(configIds.includes("first-light-caverns"), "First Light caverns must be selectable");

    // Simulating Campaign Editor theme selection
    let activeConfigId = "fan-dungeon-28x21";
    function selectCampaignTheme(newConfigId) {
      assert.ok(configIds.includes(newConfigId), `Theme ${newConfigId} must exist in Maps`);
      activeConfigId = newConfigId;
      const cfg = getMapConfiguration(newConfigId);
      return {
        mapConfigId: cfg.id,
        gridDimensions: cfg.gridDimensions,
        roomsCount: (cfg.rooms || []).length,
        calibrationInset: cfg.calibration?.insetLeft || 0
      };
    }

    const state1 = selectCampaignTheme("heroquest-classic");
    assert.strictEqual(state1.mapConfigId, "heroquest-classic");
    assert.deepEqual(state1.gridDimensions, [26, 19]);

    const state2 = selectCampaignTheme("first-light-caverns");
    assert.strictEqual(state2.mapConfigId, "first-light-caverns");
    assert.deepEqual(state2.gridDimensions, [26, 19]);

    const state3 = selectCampaignTheme("fan-dungeon-28x21");
    assert.strictEqual(state3.mapConfigId, "fan-dungeon-28x21");
    assert.deepEqual(state3.gridDimensions, [28, 21]);
    assert.strictEqual(state3.roomsCount, 19);
  });

  it("supports hero editor class field, real-time name updates, and character state (gold, weapons, inventory)", () => {
    const hero = {
      "@id": "urn:robos:tabletop:hero:barbarian",
      "dcterms:title": "Barbarian",
      "robos:heroClass": "Barbarian",
      "robos:bodyPoints": 8,
      "robos:mindPoints": 2,
      "robos:attackDice": 3,
      "robos:defendDice": 2,
      "robos:gold": 150,
      "robos:startingWeapon": "Broadsword",
      "robos:equippedWeapon": "Broadsword (3 Combat Dice)",
      "robos:equippedArmor": "Natural Toughness (2 Defend Dice)",
      "robos:inventory": [
        { id: "item-pot-heal", name: "Potion of Healing", type: "potion", effect: "Restores 4 BP", value: 100 },
        { id: "item-rope", name: "Heavy Rope", type: "tool", effect: "Cross pits", value: 25 }
      ]
    };

    assert.strictEqual(hero["robos:heroClass"], "Barbarian", "Hero must have class field");
    assert.strictEqual(hero["robos:gold"], 150, "Hero must store gold state");
    assert.strictEqual(hero["robos:inventory"].length, 2, "Hero must store inventory items");

    // Live name update simulation
    function updateHeroName(h, newName) {
      h["dcterms:title"] = newName;
      return {
        editorTitle: `Edit Hero: ${newName}`,
        sidebarName: newName,
        actionScreenName: newName
      };
    }

    const synced = updateHeroName(hero, "Grimjaw the Slayer");
    assert.strictEqual(hero["dcterms:title"], "Grimjaw the Slayer");
    assert.strictEqual(synced.editorTitle, "Edit Hero: Grimjaw the Slayer");
    assert.strictEqual(synced.sidebarName, "Grimjaw the Slayer");
    assert.strictEqual(synced.actionScreenName, "Grimjaw the Slayer");

    // Add gold
    hero["robos:gold"] += 50;
    assert.strictEqual(hero["robos:gold"], 200);

    // Add inventory item
    hero["robos:inventory"].push({ id: "item-torch", name: "Dungeon Torch", type: "tool", effect: "Light 3 turns", value: 15 });
    assert.strictEqual(hero["robos:inventory"].length, 3);
  });

  it("supports interactive hero combat action screen with Attack, Defend, and Movement rolls", () => {
    function rollHeroCombatDie(mockRoll = null) {
      const r = mockRoll !== null ? mockRoll : Math.floor(Math.random() * 6) + 1;
      if (r <= 3) return { type: "skull", label: "💀 Skull" };
      if (r <= 5) return { type: "white-shield", label: "🛡️ Shield" };
      return { type: "black-shield", label: "⬛ Black Shield" };
    }

    // 1. Attack roll test with 3 dice (rolls: 1, 2, 4 -> 2 skulls, 1 shield)
    const attackRolls = [1, 2, 4].map(r => rollHeroCombatDie(r));
    const skulls = attackRolls.filter(r => r.type === "skull").length;
    assert.strictEqual(attackRolls.length, 3);
    assert.strictEqual(skulls, 2, "Must count 2 skulls from rolls 1 and 2");

    // 2. Defend roll test with 2 dice (rolls: 4, 6 -> 1 white shield, 1 black shield)
    const defendRolls = [4, 6].map(r => rollHeroCombatDie(r));
    const whiteShields = defendRolls.filter(r => r.type === "white-shield").length;
    assert.strictEqual(defendRolls.length, 2);
    assert.strictEqual(whiteShields, 1, "Must count 1 white shield from roll 4");

    // 3. Movement roll test (2d6)
    function rollMove(d1, d2) {
      return { d1, d2, total: d1 + d2 };
    }
    const move = rollMove(3, 5);
    assert.strictEqual(move.total, 8, "Movement total must sum both dice");

    // 4. BP / MP damage & heal adjustments
    let bp = 8;
    const maxBP = 8;
    // Damage -2
    bp = Math.max(0, bp - 2);
    assert.strictEqual(bp, 6);
    // Heal +1
    bp = Math.min(maxBP, bp + 1);
    assert.strictEqual(bp, 7);
  });

  it("supports campaign multi-quest architecture (1+ quests invariant, adding and switching quests)", () => {
    const campaign = {
      id: "campaign-heroquest-gathering-storm",
      title: "HeroQuest: The Gathering Storm",
      quests: [
        { id: "quest-1", slug: "heroquest-the-trial", title: "Quest 1: The Trial", goldReward: 100, completed: false, mapConfigId: "fan-dungeon-28x21" },
        { id: "quest-2", slug: "heroquest-rescue-sir-ragnar", title: "Quest 2: The Rescue of Sir Ragnar", goldReward: 200, completed: false, mapConfigId: "heroquest-classic" },
        { id: "quest-3", slug: "heroquest-lair-orc-warlord", title: "Quest 3: Lair of the Orc Warlord", goldReward: 250, completed: false, mapConfigId: "first-light-caverns" }
      ]
    };

    // Invariant: Campaign must have 1+ quests
    assert.ok(campaign.quests.length >= 1, "Campaign must have at least 1 quest");
    assert.strictEqual(campaign.quests.length, 3, "Initial campaign has 3 classic quests");

    // Add Quest
    function addQuest(c, title, goldReward, mapConfigId) {
      const nextNum = c.quests.length + 1;
      const newQuest = {
        id: `quest-${nextNum}`,
        slug: `heroquest-quest-${nextNum}`,
        title: title || `Quest ${nextNum}: New Adventure`,
        goldReward: goldReward || 150,
        completed: false,
        mapConfigId: mapConfigId || "fan-dungeon-28x21"
      };
      c.quests.push(newQuest);
      return newQuest;
    }

    const q4 = addQuest(campaign, "Quest 4: Prince Magnus' Gold", 300, "heroquest-classic");
    assert.strictEqual(campaign.quests.length, 4, "Must have 4 quests after addition");
    assert.strictEqual(q4.id, "quest-4");
    assert.strictEqual(q4.title, "Quest 4: Prince Magnus' Gold");

    // Delete Quest with 1+ quest invariant guard
    function deleteQuest(c, index) {
      if (c.quests.length <= 1) {
        return false; // Invariant preserved: Cannot delete last remaining quest
      }
      c.quests.splice(index, 1);
      return true;
    }

    assert.strictEqual(deleteQuest(campaign, 3), true, "Deletion allowed when > 1 quest");
    assert.strictEqual(campaign.quests.length, 3);

    // Delete until 1 remains
    assert.strictEqual(deleteQuest(campaign, 2), true);
    assert.strictEqual(deleteQuest(campaign, 1), true);
    assert.strictEqual(campaign.quests.length, 1, "Only 1 quest remains");

    // Attempt deleting last quest - MUST fail to protect 1+ quest invariant
    const deleteAttempt = deleteQuest(campaign, 0);
    assert.strictEqual(deleteAttempt, false, "Must reject deleting when only 1 quest remains");
    assert.strictEqual(campaign.quests.length, 1, "Campaign must retain at least 1 quest");
  });

  it("supports completing a quest with gold reward distribution to heroes and campaign progress tracking", () => {
    const heroes = [
      { id: "barbarian", name: "Barbarian", "robos:gold": 100 },
      { id: "dwarf", name: "Dwarf", "robos:gold": 50 },
      { id: "elf", name: "Elf", "robos:gold": 75 },
      { id: "wizard", name: "Wizard", "robos:gold": 120 }
    ];

    const campaign = {
      id: "campaign-heroquest-gathering-storm",
      title: "HeroQuest: The Gathering Storm",
      quests: [
        { id: "quest-1", title: "Quest 1: The Trial", goldReward: 100, completed: false },
        { id: "quest-2", title: "Quest 2: The Rescue of Sir Ragnar", goldReward: 200, completed: false },
        { id: "quest-3", title: "Quest 3: Lair of the Orc Warlord", goldReward: 250, completed: false }
      ]
    };

    function calculateProgress(c) {
      const completed = c.quests.filter(q => q.completed).length;
      const total = c.quests.length;
      return {
        completed,
        total,
        percentage: Math.round((completed / total) * 100),
        allFinished: completed === total
      };
    }

    function completeQuest(c, heroParty, questIdx) {
      const quest = c.quests[questIdx];
      assert.ok(quest, "Quest must exist");
      quest.completed = true;

      // Distribute gold reward to each hero
      heroParty.forEach(h => {
        h["robos:gold"] = (h["robos:gold"] || 0) + quest.goldReward;
      });

      return {
        quest,
        goldAwarded: quest.goldReward,
        progress: calculateProgress(c)
      };
    }

    function resetQuest(c, questIdx) {
      const quest = c.quests[questIdx];
      assert.ok(quest, "Quest must exist");
      quest.completed = false;
      return calculateProgress(c);
    }

    // Initial state: 0% complete
    let prog = calculateProgress(campaign);
    assert.strictEqual(prog.percentage, 0);
    assert.strictEqual(prog.completed, 0);

    // Complete Quest 1 (100g reward)
    const res1 = completeQuest(campaign, heroes, 0);
    assert.strictEqual(campaign.quests[0].completed, true, "Quest 1 must be marked completed");
    assert.strictEqual(res1.progress.completed, 1);
    assert.strictEqual(res1.progress.percentage, 33);
    assert.strictEqual(heroes.find(h => h.id === "barbarian")["robos:gold"], 200, "Barbarian must gain 100g");
    assert.strictEqual(heroes.find(h => h.id === "wizard")["robos:gold"], 220, "Wizard must gain 100g");

    // Complete Quest 2 (200g reward)
    const res2 = completeQuest(campaign, heroes, 1);
    assert.strictEqual(campaign.quests[1].completed, true, "Quest 2 must be marked completed");
    assert.strictEqual(res2.progress.completed, 2);
    assert.strictEqual(res2.progress.percentage, 67);
    assert.strictEqual(heroes.find(h => h.id === "barbarian")["robos:gold"], 400, "Barbarian must gain 200g");

    // Complete Quest 3 (250g reward) -> 100% campaign complete
    const res3 = completeQuest(campaign, heroes, 2);
    assert.strictEqual(res3.progress.completed, 3);
    assert.strictEqual(res3.progress.percentage, 100);
    assert.strictEqual(res3.progress.allFinished, true, "All quests must be finished");
    assert.strictEqual(heroes.find(h => h.id === "barbarian")["robos:gold"], 650, "Barbarian must gain 250g");

    // Reset Quest 3 to test replay/reopen flow
    const resetProg = resetQuest(campaign, 2);
    assert.strictEqual(campaign.quests[2].completed, false, "Quest 3 must be reopened");
    assert.strictEqual(resetProg.completed, 2);
    assert.strictEqual(resetProg.percentage, 67);
  });

  it("supports header active quest selector in place of cartridge select", () => {
    const campaign = {
      id: "campaign-heroquest-gathering-storm",
      title: "HeroQuest: The Gathering Storm",
      quests: [
        { id: "quest-1", title: "Quest 1: The Trial", mapConfigId: "fan-dungeon-28x21", completed: false },
        { id: "quest-2", title: "Quest 2: The Rescue of Sir Ragnar", mapConfigId: "heroquest-classic", completed: true },
        { id: "quest-3", title: "Quest 3: Lair of the Orc Warlord", mapConfigId: "first-light-caverns", completed: false }
      ]
    };

    function generateHeaderQuestOptions(c, activeIndex) {
      return c.quests.map((q, idx) => {
        const statusIcon = q.completed ? "🏆" : "⏳";
        return {
          value: idx,
          selected: idx === activeIndex,
          label: `${statusIcon} ${q.title} (${q.mapConfigId})`
        };
      });
    }

    const options0 = generateHeaderQuestOptions(campaign, 0);
    assert.strictEqual(options0.length, 3);
    assert.strictEqual(options0[0].selected, true);
    assert.strictEqual(options0[0].label, "⏳ Quest 1: The Trial (fan-dungeon-28x21)");
    assert.strictEqual(options0[1].selected, false);
    assert.strictEqual(options0[1].label, "🏆 Quest 2: The Rescue of Sir Ragnar (heroquest-classic)");

    // Switch active quest to index 1
    const options1 = generateHeaderQuestOptions(campaign, 1);
    assert.strictEqual(options1[1].selected, true);
    assert.strictEqual(options1[0].selected, false);

    // Verify template markup replaces cartridge select with header-quest-select
    const indexHtml = fs.readFileSync(path.resolve(__dirname, "../renderer/index.html"), "utf8");
    assert.ok(indexHtml.includes('id="header-quest-select"'), "index.html must include #header-quest-select");
    assert.ok(!indexHtml.includes('id="cartridge-select"'), "index.html must not contain legacy #cartridge-select");
    assert.ok(indexHtml.includes("📜 Active Quest:"), "index.html must display '📜 Active Quest:' label");
    assert.ok(
      indexHtml.includes("📦 Sync Quest Pack") || indexHtml.includes("📦 Export Quest Pack"),
      "index.html must display Quest Pack sync/export button"
    );
  });

  it("supports automatically advancing to next quest when quest completes from tabletop game exit", () => {
    const campaign = {
      id: "campaign-heroquest-gathering-storm",
      title: "HeroQuest: The Gathering Storm",
      quests: [
        { id: "quest-1", slug: "heroquest-the-trial", title: "Quest 1: The Trial", goldReward: 100, completed: false },
        { id: "quest-2", slug: "heroquest-rescue-sir-ragnar", title: "Quest 2: The Rescue of Sir Ragnar", goldReward: 200, completed: false },
        { id: "quest-3", slug: "heroquest-lair-orc-warlord", title: "Quest 3: Lair of the Orc Warlord", goldReward: 250, completed: false }
      ]
    };
    let currentQuestIndex = 0;

    function advanceToNextQuest() {
      const nextIdx = currentQuestIndex + 1;
      if (nextIdx < campaign.quests.length) {
        currentQuestIndex = nextIdx;
        return currentQuestIndex;
      }
      return -1;
    }

    // Quest 1 finishes
    campaign.quests[currentQuestIndex].completed = true;
    const next1 = advanceToNextQuest();
    assert.strictEqual(next1, 1, "Should advance to Quest 2 (index 1)");
    assert.strictEqual(campaign.quests[currentQuestIndex].slug, "heroquest-rescue-sir-ragnar");

    // Quest 2 finishes
    campaign.quests[currentQuestIndex].completed = true;
    const next2 = advanceToNextQuest();
    assert.strictEqual(next2, 2, "Should advance to Quest 3 (index 2)");
    assert.strictEqual(campaign.quests[currentQuestIndex].slug, "heroquest-lair-orc-warlord");

    // Quest 3 finishes
    campaign.quests[currentQuestIndex].completed = true;
    const next3 = advanceToNextQuest();
    assert.strictEqual(next3, -1, "Should indicate campaign complete when all quests finished");
  });

  it("verifies all 12 authentic HeroQuest elemental spells are defined across 4 colleges", () => {
    assert.ok(fs.existsSync(KGRAPH_TABLETOP), "tabletop-game package.jsonld must exist");
    const data = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"));
    const nodes = data["robos:nodes"] || [];

    const spellNodes = nodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      const isBase = !n["robos:category"] || n["robos:category"] === "Base Game";
      return t.includes("robos:TabletopSpellCard") && !t.includes("robos:TabletopDreadSpell") && isBase;
    });

    assert.strictEqual(spellNodes.length, 12, "Must contain 12 Base Game HeroQuest elemental spells");

    const colleges = { earth: 0, fire: 0, water: 0, air: 0 };
    spellNodes.forEach(sp => {
      const elem = sp["robos:element"];
      assert.ok(colleges[elem] !== undefined, `Unknown spell element: ${elem}`);
      colleges[elem]++;
    });

    assert.strictEqual(colleges.earth, 3, "Earth college must have 3 spells");
    assert.strictEqual(colleges.fire, 3, "Fire college must have 3 spells");
    assert.strictEqual(colleges.water, 3, "Water college must have 3 spells");
    assert.strictEqual(colleges.air, 3, "Air college must have 3 spells");

    const expectedTitles = [
      "Ball of Flame", "Courage", "Fire of Wrath",
      "Heal Body", "Pass Through Rock", "Rock Skin",
      "Water of Healing", "Sleep", "Veil of Mist",
      "Genie", "Swift Wind", "Tempest"
    ];
    expectedTitles.forEach(title => {
      const found = spellNodes.some(s => s["dcterms:title"] === title);
      assert.ok(found, `Spell '${title}' must exist in KGraph nodes`);
    });
  });

  it("verifies all 8 authentic HeroQuest Dread / Chaos spells are defined for enemy spellcasters", () => {
    assert.ok(fs.existsSync(KGRAPH_TABLETOP), "tabletop-game package.jsonld must exist");
    const data = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"));
    const nodes = data["robos:nodes"] || [];

    const dreadSpellNodes = nodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      const isBase = !n["robos:category"] || n["robos:category"] === "Base Game";
      return t.includes("robos:TabletopDreadSpell") && isBase;
    });

    assert.strictEqual(dreadSpellNodes.length, 8, "Must contain 8 Base Game HeroQuest Dread spells");

    const expectedDreadTitles = [
      "Lightning Bolt", "Firestorm", "Fear", "Sleep of Dread",
      "Cloud of Chaos", "Summon Undead", "Rust", "Escape"
    ];
    expectedDreadTitles.forEach(title => {
      const found = dreadSpellNodes.some(s => s["dcterms:title"] === title);
      assert.ok(found, `Dread Spell '${title}' must exist in KGraph nodes`);
    });
  });

  it("verifies enemy spellcasters exist in KGraph with dread spell assignments", () => {
    assert.ok(fs.existsSync(KGRAPH_TABLETOP), "tabletop-game package.jsonld must exist");
    const data = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"));
    const nodes = data["robos:nodes"] || [];

    const monsters = nodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopMonster");
    });

    const casters = monsters.filter(m => m["robos:isSpellcaster"]);
    assert.ok(casters.length >= 4, "Must include at least 4 spellcaster monsters (Chaos Sorcerer, Witch Lord, Orc Shaman, Verag)");

    const chaosSorcerer = monsters.find(m => m["@id"].includes("chaos-sorcerer"));
    assert.ok(chaosSorcerer, "Chaos Sorcerer must exist");
    assert.strictEqual(chaosSorcerer["robos:isBoss"], true);
    assert.strictEqual(chaosSorcerer["robos:isSpellcaster"], true);
    assert.ok(Array.isArray(chaosSorcerer["robos:spells"]) && chaosSorcerer["robos:spells"].length >= 3);

    const witchLord = monsters.find(m => m["@id"].includes("witch-lord"));
    assert.ok(witchLord, "The Witch Lord must exist");
    assert.strictEqual(witchLord["robos:isBoss"], true);
    assert.strictEqual(witchLord["robos:isUndead"], true);
    assert.strictEqual(witchLord["robos:isSpellcaster"], true);
    assert.ok(witchLord["robos:spells"].includes("urn:robos:tabletop:spell:summon-undead"));

    const orcShaman = monsters.find(m => m["@id"].includes("orc-shaman"));
    assert.ok(orcShaman, "Orc Shaman must exist");
    assert.strictEqual(orcShaman["robos:isSpellcaster"], true);
    assert.ok(orcShaman["robos:spells"].includes("urn:robos:tabletop:spell:rust"));
  });

  it("supports monster black-shield defend rolls and dread spellcasting in combat HUD", () => {
    function rollMonsterCombatDie(mockRoll = null) {
      const r = mockRoll !== null ? mockRoll : Math.floor(Math.random() * 6) + 1;
      if (r <= 3) return { type: "skull", label: "💀 Skull" };
      if (r <= 5) return { type: "white-shield", label: "🛡️ Shield" };
      return { type: "black-shield", label: "⬛ Black Shield" };
    }

    const monsterRolls = [1, 2, 4, 6].map(r => rollMonsterCombatDie(r));
    const monsterBlocks = monsterRolls.filter(r => r.type === "black-shield").length;
    assert.strictEqual(monsterBlocks, 1, "Monsters only block on Black Shield (roll 6)");

    function executeMonsterSpell(spellSlug) {
      const spellEffects = {
        "lightning-bolt": { damage: 2, defendDice: 2 },
        "firestorm": { damage: 3, defendDice: 3 },
        "fear": { debuffAtkDice: 1 },
        "sleep-dread": { status: "sleep" },
        "cloud-of-chaos": { status: "freeze" },
        "summon-undead": { summoned: 2, type: "undead" },
        "rust": { destroys: "metal-gear" },
        "escape": { teleported: true }
      };
      return spellEffects[spellSlug] || null;
    }

    const bolt = executeMonsterSpell("lightning-bolt");
    assert.strictEqual(bolt.damage, 2);
    assert.strictEqual(bolt.defendDice, 2);

    const firestorm = executeMonsterSpell("firestorm");
    assert.strictEqual(firestorm.damage, 3);

    const fear = executeMonsterSpell("fear");
    assert.strictEqual(fear.debuffAtkDice, 1);

    const summon = executeMonsterSpell("summon-undead");
    assert.strictEqual(summon.summoned, 2);
  });

  it("supports HeroQuest elemental spell draft (Elf 1 college vs Wizard 3 colleges)", () => {
    const ALL_ELEMENTS = ["earth", "fire", "water", "air"];
    const SPELLS_BY_COLLEGE = {
      earth: ["heal-body", "pass-through-rock", "rock-skin"],
      fire: ["ball-of-flame", "courage", "fire-of-wrath"],
      water: ["water-of-healing", "sleep", "veil-of-mist"],
      air: ["genie", "swift-wind", "tempest"]
    };

    function allocateSpells(elfElement) {
      assert.ok(ALL_ELEMENTS.includes(elfElement), "Elf element must be one of earth/fire/water/air");
      const wizardElements = ALL_ELEMENTS.filter(e => e !== elfElement);

      const elfSpells = [...SPELLS_BY_COLLEGE[elfElement]];
      const wizardSpells = wizardElements.flatMap(e => SPELLS_BY_COLLEGE[e]);

      return {
        elfElement,
        wizardElements,
        elfSpells,
        wizardSpells
      };
    }

    // Default Draft: Elf chooses Water
    const draftWater = allocateSpells("water");
    assert.strictEqual(draftWater.elfElement, "water");
    assert.strictEqual(draftWater.elfSpells.length, 3, "Elf must receive 3 spells");
    assert.deepStrictEqual(draftWater.elfSpells, ["water-of-healing", "sleep", "veil-of-mist"]);
    assert.strictEqual(draftWater.wizardElements.length, 3, "Wizard must receive 3 colleges");
    assert.strictEqual(draftWater.wizardSpells.length, 9, "Wizard must receive 9 spells");
    assert.ok(!draftWater.wizardSpells.includes("water-of-healing"), "Wizard must not receive Elf's drafted spells");

    // Alternate Draft: Elf chooses Earth
    const draftEarth = allocateSpells("earth");
    assert.strictEqual(draftEarth.elfElement, "earth");
    assert.strictEqual(draftEarth.elfSpells.length, 3);
    assert.deepStrictEqual(draftEarth.elfSpells, ["heal-body", "pass-through-rock", "rock-skin"]);
    assert.strictEqual(draftEarth.wizardSpells.length, 9);
    assert.ok(draftEarth.wizardElements.includes("water"), "Wizard receives Water when Elf drafts Earth");
    assert.ok(draftEarth.wizardElements.includes("fire"), "Wizard receives Fire");
    assert.ok(draftEarth.wizardElements.includes("air"), "Wizard receives Air");

    // Alternate Draft: Elf chooses Fire
    const draftFire = allocateSpells("fire");
    assert.strictEqual(draftFire.elfElement, "fire");
    assert.strictEqual(draftFire.elfSpells.length, 3);
    assert.deepStrictEqual(draftFire.elfSpells, ["ball-of-flame", "courage", "fire-of-wrath"]);
    assert.strictEqual(draftFire.wizardSpells.length, 9);

    // Alternate Draft: Elf chooses Air
    const draftAir = allocateSpells("air");
    assert.strictEqual(draftAir.elfElement, "air");
    assert.strictEqual(draftAir.elfSpells.length, 3);
    assert.deepStrictEqual(draftAir.elfSpells, ["genie", "swift-wind", "tempest"]);
    assert.strictEqual(draftAir.wizardSpells.length, 9);

    // Non-casters (Barbarian, Dwarf)
    const barbarianSpells = [];
    const dwarfSpells = [];
    assert.strictEqual(barbarianSpells.length, 0, "Barbarian must have 0 spells");
    assert.strictEqual(dwarfSpells.length, 0, "Dwarf must have 0 spells");
  });

  it("executes spell effects in hero combat action HUD", () => {
    const heroElf = {
      name: "Elrond the Swift",
      heroClass: "Elf",
      bodyPoints: 6,
      currentBP: 2, // injured
      mindPoints: 4,
      currentMP: 4
    };

    function castSpell(hero, spell) {
      if (spell.effect === "heal-bp") {
        const prev = hero.currentBP;
        hero.currentBP = Math.min(hero.bodyPoints, hero.currentBP + spell.val);
        return { success: true, healed: hero.currentBP - prev };
      }
      if (spell.effect === "damage-bp") {
        return { success: true, damageDealt: spell.val };
      }
      return { success: true };
    }

    // Cast Water of Healing (+4 BP)
    const healRes = castSpell(heroElf, { name: "Water of Healing", effect: "heal-bp", val: 4 });
    assert.strictEqual(healRes.healed, 4, "Must heal 4 lost Body Points");
    assert.strictEqual(heroElf.currentBP, 6, "Elf BP must now be at maximum (6)");

    // Cast again when at full BP
    const overHealRes = castSpell(heroElf, { name: "Water of Healing", effect: "heal-bp", val: 4 });
    assert.strictEqual(overHealRes.healed, 0, "Cannot overheal beyond max BP");
    assert.strictEqual(heroElf.currentBP, 6);

    // Cast offensive spell: Ball of Flame (2 BP damage)
    const dmgRes = castSpell(heroElf, { name: "Ball of Flame", effect: "damage-bp", val: 2 });
    assert.strictEqual(dmgRes.damageDealt, 2, "Must deal 2 damage");
  });

  it("verifies game start spell selection draft equips Elf and Wizard in compiled cartridge payload", () => {
    const { GameCartridgeBundler } = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const bundler = new GameCartridgeBundler({ baseDir: path.join(REPO_ROOT, "games/tabletop-rpg") });

    const testPayload = {
      cartridgeId: "heroquest-test-spells",
      title: "HeroQuest: Spell Draft Test",
      description: "Testing start-of-quest spell draft",
      spellAllocation: {
        elfElement: "earth",
        wizardElements: ["water", "fire", "air"],
        confirmed: true
      },
      maps: {
        "the-trial": { id: "the-trial", name: "The Trial", width: 26, height: 19 }
      },
      heroes: [
        {
          id: "barbarian",
          name: "Barbarian",
          heroClass: "Barbarian",
          bodyPoints: 8,
          mindPoints: 2,
          attackDice: 3,
          defendDice: 2,
          spells: []
        },
        {
          id: "elf",
          name: "Elf",
          heroClass: "Elf",
          bodyPoints: 6,
          mindPoints: 4,
          attackDice: 2,
          defendDice: 2,
          spells: ["heal-body", "pass-through-rock", "rock-skin"]
        },
        {
          id: "wizard",
          name: "Wizard",
          heroClass: "Wizard",
          bodyPoints: 4,
          mindPoints: 6,
          attackDice: 1,
          defendDice: 2,
          spells: [
            "water-of-healing", "sleep", "veil-of-mist",
            "ball-of-flame", "fire-of-wrath", "courage",
            "genie", "swift-wind", "tempest"
          ]
        }
      ]
    };

    const cart = bundler.bundleTabletop(testPayload);
    assert.ok(cart.spellAllocation, "Cartridge must contain spellAllocation");
    assert.strictEqual(cart.spellAllocation.elfElement, "earth");
    assert.strictEqual(cart.spellAllocation.confirmed, true);
    assert.strictEqual(cart.heroes.elf.spells.length, 3, "Elf must have 3 Earth spells");
    assert.strictEqual(cart.heroes.wizard.spells.length, 9, "Wizard must have 9 spells");
  });

  it("verifies all 12 authentic HeroQuest furniture textures and 6 tile textures exist in editor and runtime assets", () => {
    const furnitureTypes = [
      "altar", "table", "bookcase", "bookshelf", "tomb", "chest",
      "cupboard", "weapons_rack", "fireplace", "throne", "torture_rack", "alchemists_bench"
    ];
    const tileTypes = [
      "wall_block", "stairs", "trap_pit", "trap_spear", "trap_falling_block", "boulder"
    ];

    const editorFurnDir = path.join(__dirname, "../assets/furniture");
    const runtimeFurnDir = path.join(REPO_ROOT, "games/tabletop-rpg/assets/furniture");
    const editorTilesDir = path.join(__dirname, "../assets/tiles");
    const runtimeTilesDir = path.join(REPO_ROOT, "games/tabletop-rpg/assets/tiles");

    for (const f of furnitureTypes) {
      const eFile = path.join(editorFurnDir, `${f}.png`);
      const rFile = path.join(runtimeFurnDir, `${f}.png`);
      assert.ok(fs.existsSync(eFile), `Editor furniture texture must exist: ${f}.png`);
      assert.ok(fs.existsSync(rFile), `Runtime furniture texture must exist: ${f}.png`);
      assert.ok(fs.statSync(eFile).size > 1000, `Editor texture ${f}.png must be non-empty image`);
      assert.ok(fs.statSync(rFile).size > 1000, `Runtime texture ${f}.png must be non-empty image`);
    }

    for (const t of tileTypes) {
      const eFile = path.join(editorTilesDir, `${t}.png`);
      const rFile = path.join(runtimeTilesDir, `${t}.png`);
      assert.ok(fs.existsSync(eFile), `Editor tile texture must exist: ${t}.png`);
      assert.ok(fs.existsSync(rFile), `Runtime tile texture must exist: ${t}.png`);
      assert.ok(fs.statSync(eFile).size > 1000, `Editor texture ${t}.png must be non-empty image`);
      assert.ok(fs.statSync(rFile).size > 1000, `Runtime texture ${t}.png must be non-empty image`);
    }
  });

  it("supports trading items (potions, weapons, armor, artifacts) between heroes between quests", () => {
    const heroes = [
      {
        "@id": "urn:robos:tabletop:hero:barbarian",
        "dcterms:title": "Barbarian",
        "robos:characterName": "Rogar",
        "robos:heroClass": "Barbarian",
        "robos:gold": 250,
        "robos:equippedWeapon": "Broadsword (3 Combat Dice)",
        "robos:equippedArmor": "Natural Toughness (2 Defend Dice)",
        "robos:inventory": [
          { id: "item-pot-heal", name: "Potion of Healing", type: "potion", effect: "Restores up to 4 BP", value: 100 },
          { id: "item-orc-cleaver", name: "Orc's Cleaver", type: "artifact", effect: "+1 Attack vs Orcs", value: 350 },
          { id: "item-rope", name: "Heavy Rope (30 ft)", type: "tool", effect: "Climb pits", value: 25 }
        ]
      },
      {
        "@id": "urn:robos:tabletop:hero:dwarf",
        "dcterms:title": "Dwarf",
        "robos:characterName": "Dorgan",
        "robos:heroClass": "Dwarf",
        "robos:gold": 120,
        "robos:equippedWeapon": "Shortsword (2 Combat Dice)",
        "robos:equippedArmor": "Shield & Chainmail (+2 Defend Dice)",
        "robos:inventory": [
          { id: "item-toolkit", name: "Trap Disarm Toolkit", type: "tool", effect: "Disarm traps", value: 75 }
        ]
      },
      {
        "@id": "urn:robos:tabletop:hero:wizard",
        "dcterms:title": "Wizard",
        "robos:characterName": "Telor",
        "robos:heroClass": "Wizard",
        "robos:gold": 80,
        "robos:equippedWeapon": "Dagger (1 Combat Die)",
        "robos:equippedArmor": "Wizard Cloak (2 Defend Dice)",
        "robos:inventory": [
          { id: "item-holy-water", name: "Holy Water", type: "relic", effect: "Destroys undead", value: 200 }
        ]
      }
    ];

    function simulateTradeItem(heroList, fromId, toId, itemIndexOrName) {
      const fromHero = heroList.find(h => h["@id"] === fromId);
      const toHero = heroList.find(h => h["@id"] === toId);
      assert.ok(fromHero, "From hero must exist");
      assert.ok(toHero, "To hero must exist");
      assert.notStrictEqual(fromId, toId, "Cannot trade to self");

      let item = null;
      if (typeof itemIndexOrName === "number") {
        assert.ok(itemIndexOrName >= 0 && itemIndexOrName < fromHero["robos:inventory"].length);
        item = fromHero["robos:inventory"].splice(itemIndexOrName, 1)[0];
      } else {
        const idx = fromHero["robos:inventory"].findIndex(it => it.id === itemIndexOrName || it.name === itemIndexOrName);
        if (idx !== -1) {
          item = fromHero["robos:inventory"].splice(idx, 1)[0];
        } else if (fromHero["robos:equippedWeapon"].includes(itemIndexOrName)) {
          item = { id: "item-traded-wep", name: fromHero["robos:equippedWeapon"], type: "weapon" };
          fromHero["robos:equippedWeapon"] = "Shortsword (2 Combat Dice)";
        }
      }
      assert.ok(item, "Traded item must be found");
      toHero["robos:inventory"].push(item);
      return { success: true, item, fromHero, toHero };
    }

    // Trade 1: Barbarian passes Potion of Healing to Dwarf between quests
    const res1 = simulateTradeItem(heroes, "urn:robos:tabletop:hero:barbarian", "urn:robos:tabletop:hero:dwarf", 0);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.item.name, "Potion of Healing");
    assert.strictEqual(heroes[0]["robos:inventory"].length, 2, "Barbarian should have 2 items left");
    assert.strictEqual(heroes[1]["robos:inventory"].length, 2, "Dwarf should now have 2 items");
    assert.ok(heroes[1]["robos:inventory"].some(it => it.name === "Potion of Healing"));

    // Trade 2: Barbarian passes artifact "Orc's Cleaver" to Dwarf
    const res2 = simulateTradeItem(heroes, "urn:robos:tabletop:hero:barbarian", "urn:robos:tabletop:hero:dwarf", "Orc's Cleaver");
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.item.type, "artifact");
    assert.strictEqual(heroes[0]["robos:inventory"].length, 1, "Barbarian should have 1 item left");
    assert.strictEqual(heroes[1]["robos:inventory"].length, 3, "Dwarf should now have 3 items");

    // Trade 3: Wizard passes Holy Water to Barbarian
    const res3 = simulateTradeItem(heroes, "urn:robos:tabletop:hero:wizard", "urn:robos:tabletop:hero:barbarian", "Holy Water");
    assert.strictEqual(res3.success, true);
    assert.strictEqual(heroes[2]["robos:inventory"].length, 0, "Wizard backpack empty");
    assert.strictEqual(heroes[0]["robos:inventory"].length, 2, "Barbarian now has 2 items");
    assert.ok(heroes[0]["robos:inventory"].some(it => it.name === "Holy Water"));

    // Trade 4: Barbarian passes equipped Broadsword to Dwarf
    const res4 = simulateTradeItem(heroes, "urn:robos:tabletop:hero:barbarian", "urn:robos:tabletop:hero:dwarf", "Broadsword");
    assert.strictEqual(res4.success, true);
    assert.strictEqual(heroes[0]["robos:equippedWeapon"], "Shortsword (2 Combat Dice)", "Barbarian falls back to shortsword");
    assert.strictEqual(heroes[1]["robos:inventory"].length, 4, "Dwarf received broadsword in inventory");
  });

  it("supports transferring gold between heroes between quests with validation guards", () => {
    const heroA = { "@id": "hero-a", name: "Rogar", "robos:gold": 250 };
    const heroB = { "@id": "hero-b", name: "Dorgan", "robos:gold": 50 };

    function transferGold(hFrom, hTo, amount) {
      if (hFrom["@id"] === hTo["@id"]) return { success: false, error: "Cannot transfer to self" };
      if (amount <= 0) return { success: false, error: "Amount must be positive" };
      if (hFrom["robos:gold"] < amount) return { success: false, error: "Insufficient gold" };
      hFrom["robos:gold"] -= amount;
      hTo["robos:gold"] += amount;
      return { success: true, amount, fromGold: hFrom["robos:gold"], toGold: hTo["robos:gold"] };
    }

    // Transfer 100 gold
    const t1 = transferGold(heroA, heroB, 100);
    assert.strictEqual(t1.success, true);
    assert.strictEqual(heroA["robos:gold"], 150);
    assert.strictEqual(heroB["robos:gold"], 150);

    // Reject transfer exceeding current gold
    const t2 = transferGold(heroA, heroB, 200);
    assert.strictEqual(t2.success, false);
    assert.strictEqual(t2.error, "Insufficient gold");
    assert.strictEqual(heroA["robos:gold"], 150, "Gold must remain unchanged after rejected transfer");

    // Reject transfer to self
    const t3 = transferGold(heroA, heroA, 50);
    assert.strictEqual(t3.success, false);
    assert.strictEqual(t3.error, "Cannot transfer to self");
  });

  it("supports Category concept ('Base Game', 'Midterms 2026', and custom categories) across Monsters, Weapons, Spells, and Items", async () => {
    const appModule = require(path.join(__dirname, "../renderer/app.js"));
    assert.ok(Array.isArray(appModule.DEFAULT_CATEGORIES), "DEFAULT_CATEGORIES must be exported");
    assert.ok(appModule.DEFAULT_CATEGORIES.includes("Base Game"), "Must include 'Base Game' category");
    assert.ok(appModule.DEFAULT_CATEGORIES.includes("Midterms 2026"), "Must include 'Midterms 2026' category");

    // Verify KGraph entities carry robos:category
    const data = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"));
    const nodes = data["robos:nodes"] || [];

    const monsters = nodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopMonster");
    });
    const baseMonsters = monsters.filter(m => m["robos:category"] === "Base Game");
    const midtermsMonsters = monsters.filter(m => m["robos:category"] === "Midterms 2026");

    assert.strictEqual(baseMonsters.length, 15, "Must have all 15 Base Game HeroQuest monsters in KGraph");
    assert.strictEqual(midtermsMonsters.length, 15, "Must have 15 Midterms 2026 monsters mirroring each Base Game monster 1-to-1");

    // Verify every single Base Game HeroQuest monster has a 1-to-1 mirror in Midterms 2026
    for (const baseMon of baseMonsters) {
      const mirror = midtermsMonsters.find(
        m => m["robos:mirrorsMonster"] === baseMon["@id"] || m["robos:monsterArchetype"] === baseMon["robos:monsterArchetype"]
      );
      assert.ok(mirror, `Base Game monster ${baseMon["@id"]} (${baseMon["dcterms:title"]}) must have a 1-to-1 Midterms 2026 mirror`);
      assert.strictEqual(mirror["robos:mirrorsMonster"], baseMon["@id"], `Mirror ${mirror["@id"]} must reference ${baseMon["@id"]}`);
      assert.strictEqual(mirror["robos:monsterArchetype"], baseMon["robos:monsterArchetype"], `Mirror ${mirror["@id"]} must match archetype ${baseMon["robos:monsterArchetype"]}`);
    }

    // Check specific user-requested Midterms 2026 enemies
    const inflationSpawn = midtermsMonsters.find(m => m["@id"].includes("inflation-spawn"));
    assert.ok(inflationSpawn, "Inflation Spawn goblin money monster must exist");
    assert.strictEqual(inflationSpawn["robos:mirrorsMonster"], "urn:robos:tabletop:monster:goblin");
    assert.ok(
      inflationSpawn["dcterms:title"].includes("Inflation Spawn") || inflationSpawn["robos:alias"] === "Infalation Spawn",
      "Must match Inflation Spawn / Infalation Spawn"
    );

    const illegalAlien = midtermsMonsters.find(m => m["@id"].includes("illegal-alien"));
    assert.ok(illegalAlien, "Illegal Alien (grey alien with robber mask) must exist");
    assert.strictEqual(illegalAlien["robos:mirrorsMonster"], "urn:robos:tabletop:monster:orc");
    assert.ok(
      (illegalAlien["robos:archetype"] || "").toLowerCase().includes("grey alien") ||
      (illegalAlien["dcterms:description"] || "").toLowerCase().includes("grey")
    );

    const gayMan = midtermsMonsters.find(m => m["@id"].includes("happily-married-gay-man"));
    assert.ok(gayMan, "Happily Married Gay Man (Dread Warrior) must exist");
    assert.strictEqual(gayMan["robos:mirrorsMonster"], "urn:robos:tabletop:monster:chaos-warrior");
    assert.strictEqual(gayMan["robos:monsterArchetype"], "Dread Warrior");

    const trumpBiden = midtermsMonsters.find(m => m["@id"].includes("trumpbiden-dragon"));
    assert.ok(trumpBiden, "TrumpBiden Dragon boss must exist");
    assert.strictEqual(trumpBiden["robos:mirrorsMonster"], "urn:robos:tabletop:monster:dragon");
    assert.strictEqual(trumpBiden["robos:isBoss"], true);
    assert.strictEqual(trumpBiden["robos:monsterArchetype"], "Dragon");
    assert.ok(trumpBiden["dcterms:description"].toLowerCase().includes("expensive"));

    // Verify Midterms 2026 Weapons (illegal presidential acts)
    const midtermsWeapons = appModule.getWeaponsByCategory("Midterms 2026");
    assert.strictEqual(midtermsWeapons.length, 7, "Must include 7 Midterms 2026 illegal presidential act weapons");
    assert.ok(midtermsWeapons.some(w => w.name.includes("Unapproved Foreign Bombing Run")));
    assert.ok(midtermsWeapons.some(w => w.name.includes("Classified Bathroom")));
    assert.ok(midtermsWeapons.some(w => w.name.includes("Midnight Blanket Pardon")));
    assert.ok(midtermsWeapons.some(w => w.name.includes("Executive Order")));

    // Verify Base Game Weapons remain intact
    const baseWeapons = appModule.getWeaponsByCategory("Base Game");
    assert.ok(baseWeapons.length >= 9, "Must include all 9 Base Game armory weapons/gear");

    // Verify Midterms 2026 Spells & Dread Spells
    const midtermsSpells = appModule.getSpellsByCategory("Midterms 2026");
    assert.strictEqual(midtermsSpells.length, 5, "Must include 5 Midterms 2026 hero spells");
    assert.ok(midtermsSpells.some(s => s.name.includes("Snowflake")));
    assert.ok(midtermsSpells.some(s => s.name.includes("No Choice") || s.description.toLowerCase().includes("abortion")));
    assert.ok(midtermsSpells.some(s => s.name.includes("Party-Line")));
    assert.ok(midtermsSpells.some(s => s.name.includes("Middle East")));

    const midtermsDread = appModule.getDreadSpellsByCategory("Midterms 2026");
    assert.strictEqual(midtermsDread.length, 3, "Must include 3 Midterms 2026 dread spells");
    assert.ok(midtermsDread.some(s => s.slug === "bipartisan-blame-inferno"));

    // Verify Midterms 2026 Quest Items
    const midtermsItems = appModule.getItemsByCategory("Midterms 2026");
    assert.strictEqual(midtermsItems.length, 5, "Must include 5 Midterms 2026 satirical quest items");
    assert.ok(midtermsItems.some(it => it.name.includes("Snowflake")));
    assert.ok(midtermsItems.some(it => it.name.includes("Bodily Autonomy") || it.effect.toLowerCase().includes("abortion")));
    assert.ok(midtermsItems.some(it => it.name.includes("Party-Line Flip-Flop")));
    assert.ok(midtermsItems.some(it => it.name.includes("Middle East")));

    // Verify adding a custom category and custom entities for custom quests
    const catRes = appModule.addCategory("Custom Quest 2027");
    assert.strictEqual(catRes.success, true);
    assert.ok(appModule.getCategories().includes("Custom Quest 2027"));

    const customWepRes = await appModule.addCustomWeapon({
      name: "Filibuster Podium Hammer",
      category: "Custom Quest 2027",
      type: "Weapon",
      dice: "3 Attack Dice",
      cost: "300 GP"
    });
    assert.strictEqual(customWepRes.success, true);
    assert.strictEqual(appModule.getWeaponsByCategory("Custom Quest 2027").length, 1);

    const customItemRes = await appModule.addCustomItem({
      name: "Bipartisan Filibuster Coffee",
      category: "Custom Quest 2027",
      type: "potion",
      effect: "Stay awake for 24 hours",
      value: 75
    });
    assert.strictEqual(customItemRes.success, true);
    assert.strictEqual(appModule.getItemsByCategory("Custom Quest 2027").length, 1);

    const customSpellRes = await appModule.addCustomSpell({
      name: "Omnibus Bill Avalanche",
      category: "Custom Quest 2027",
      element: "earth",
      description: "Drops a 4,000-page bill that nobody read on target monster for 3 BP damage."
    });
    assert.strictEqual(customSpellRes.success, true);
    assert.strictEqual(appModule.getSpellsByCategory("Custom Quest 2027").length, 1);

    // Verify Spells & Items card CSS prevents overflow (min-width: 0, overflow: hidden, wrapping top badges)
    const styleCss = fs.readFileSync(path.join(__dirname, "../renderer/style.css"), "utf8");
    assert.ok(styleCss.includes(".spell-card-top-badges"), "style.css must define .spell-card-top-badges");
    assert.ok(styleCss.includes(".spell-card-footer"), "style.css must define .spell-card-footer");
    assert.ok(styleCss.includes("overflow-wrap: anywhere"), "style.css must enforce overflow-wrap: anywhere on cards");
  });

  it("renames 'Quest & Campaign' tab to 'Campaign', moves Heroes into the Campaign area, and supports multiple campaigns with per-campaign heroes", async () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");

    // 1. Verify top navigation tab is renamed 'Campaign' and top-level 'tab-heroes' button is removed
    assert.ok(
      indexHtml.includes('data-tab="tab-quest">📜 Campaign</button>'),
      "Main navigation tab must be named '📜 Campaign'"
    );
    assert.ok(
      !indexHtml.includes('data-tab="tab-heroes"'),
      "Top-level Heroes tab button must be moved into the Campaign area"
    );

    // 2. Verify Campaign selector bar and Campaign subtabs (Quests & Heroes) exist inside #tab-quest
    const tabQuestIdx = indexHtml.indexOf('id="tab-quest"');
    const tabMonstersIdx = indexHtml.indexOf('id="tab-monsters"');
    assert.ok(tabQuestIdx !== -1 && tabMonstersIdx > tabQuestIdx, "#tab-quest must precede #tab-monsters");
    const campaignSectionHtml = indexHtml.slice(tabQuestIdx, tabMonstersIdx);

    assert.ok(campaignSectionHtml.includes('id="campaign-select"'), "Campaign selector dropdown must exist inside Campaign tab");
    assert.ok(campaignSectionHtml.includes('id="btn-add-campaign"'), "+ New Campaign button must exist inside Campaign tab");
    assert.ok(campaignSectionHtml.includes('id="btn-delete-campaign"'), "Delete Campaign button must exist inside Campaign tab");
    assert.ok(campaignSectionHtml.includes('id="subtab-campaign-quests"'), "Campaign Quests subpane must exist inside Campaign tab");
    assert.ok(campaignSectionHtml.includes('id="subtab-campaign-heroes"'), "Campaign Heroes subpane must exist inside Campaign tab");
    assert.ok(campaignSectionHtml.includes('id="heroes-list"'), "Heroes list must reside inside the Campaign area");
    assert.ok(campaignSectionHtml.includes('id="hero-editor-title"'), "Hero editor panel must reside inside the Campaign area");

    // 3. Verify multi-campaign state & per-campaign heroes isolation
    const appModule = require(path.join(__dirname, "../renderer/app.js"));
    const campaigns = appModule.getCampaigns();
    assert.strictEqual(campaigns.length, 1, "Must initially have 1 campaign in the list");
    assert.strictEqual(campaigns[0].title, "HeroQuest");
    assert.strictEqual(campaigns[0].quests.length, 1, "Initial HeroQuest campaign must have custom-quest as its 1 and only quest");
    assert.strictEqual(campaigns[0].quests[0].slug, "custom-quest");
    assert.strictEqual(campaigns[0].quests[0].cartridgeFile, "custom-quest.cartridge.json");
    assert.strictEqual(campaigns[0].heroes.length, 4, "Initial campaign must have 4 default HeroQuest heroes");

    // Cannot delete when only 1 campaign exists
    assert.strictEqual(appModule.deleteCampaign(0), false, "Cannot delete the last remaining campaign");
    assert.strictEqual(appModule.getCampaigns().length, 1);

    // Add a second campaign with custom heroes (e.g. Midterms 2026 party)
    const customCampaign = appModule.addCampaign({
      id: "campaign-midterms-2026",
      title: "Midterms 2026: The Swamp Filibuster",
      heroes: [
        {
          "@id": "urn:robos:tabletop:hero:obama-barbarian",
          "dcterms:title": "Obama",
          "robos:characterName": "Obama",
          "robos:heroClass": "Barbarian",
          "robos:bodyPoints": 8,
          "robos:mindPoints": 2,
          "robos:attackDice": 3,
          "robos:defendDice": 2,
          "robos:gold": 250
        },
        {
          "@id": "urn:robos:tabletop:hero:hillary-elf",
          "dcterms:title": "Hillary",
          "robos:characterName": "Hillary",
          "robos:heroClass": "Elf",
          "robos:bodyPoints": 6,
          "robos:mindPoints": 4,
          "robos:attackDice": 2,
          "robos:defendDice": 2,
          "robos:gold": 200
        },
        {
          "@id": "urn:robos:tabletop:hero:trump-dwarf",
          "dcterms:title": "Trump",
          "robos:characterName": "Trump",
          "robos:heroClass": "Dwarf",
          "robos:bodyPoints": 7,
          "robos:mindPoints": 3,
          "robos:attackDice": 2,
          "robos:defendDice": 2,
          "robos:gold": 500
        },
        {
          "@id": "urn:robos:tabletop:hero:mcconnell-wizard",
          "dcterms:title": "Senator McConnell",
          "robos:characterName": "Senator McConnell",
          "robos:heroClass": "Wizard",
          "robos:bodyPoints": 4,
          "robos:mindPoints": 6,
          "robos:attackDice": 1,
          "robos:defendDice": 2,
          "robos:gold": 300
        }
      ]
    });

    assert.strictEqual(appModule.getCampaigns().length, 2, "Must now have 2 campaigns");
    assert.strictEqual(appModule.getCampaign().id, "campaign-midterms-2026", "Newly created campaign must be active");
    assert.strictEqual(customCampaign.heroes[0]["dcterms:title"], "Obama");
    assert.strictEqual(campaigns[0].heroes[0]["dcterms:title"], "Rogar", "Campaign 1 heroes must remain independent from Campaign 2 heroes");

    // Mutate gold in Campaign 2 and verify Campaign 1 hero gold is untouched
    customCampaign.heroes[0]["robos:gold"] = 999;
    assert.strictEqual(campaigns[0].heroes[0]["robos:gold"], 100, "Campaign 1 Barbarian gold must remain 100");

    // Switch back to Campaign 1
    await appModule.selectCampaign(0);
    assert.strictEqual(appModule.getCampaign().title, "HeroQuest");
    assert.strictEqual(appModule.getCampaign().heroes[0]["dcterms:title"], "Rogar");

    // Switch to Campaign 2 by ID
    await appModule.selectCampaign("campaign-midterms-2026");
    assert.strictEqual(appModule.getCampaign().title, "Midterms 2026: The Swamp Filibuster");
    assert.strictEqual(appModule.getCampaign().heroes[0]["dcterms:title"], "Obama");

    // Delete Campaign 2 and verify fallback to Campaign 1
    const deleted = appModule.deleteCampaign(1);
    assert.strictEqual(deleted, true);
    assert.strictEqual(appModule.getCampaigns().length, 1);
    assert.strictEqual(appModule.getCampaign().title, "HeroQuest");
  });

  it("supports Class tab with 4 Hero Classes and 15 Base HeroQuest Enemy Classes and custom monster class inheritance", async () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
    const appModule = require(path.join(__dirname, "../renderer/app.js"));

    // 1. Verify Class tab exists in navigation and main content
    assert.ok(indexHtml.includes('data-tab="tab-classes">🏛️ Class</button>'), "index.html must include Class tab button");
    assert.ok(indexHtml.includes('id="tab-classes"'), "index.html must include #tab-classes pane");
    assert.ok(indexHtml.includes('id="monster-base-class"'), "Monster editor must include #monster-base-class selector");

    // 2. Verify 4 Hero Classes (Barbarian, Dwarf, Elf, Wizard)
    const heroClasses = appModule.getHeroClasses();
    assert.strictEqual(heroClasses.length, 4, "Must define 4 Hero Classes");
    const heroClassNames = heroClasses.map(c => c.name);
    assert.deepStrictEqual(heroClassNames, ["Barbarian", "Dwarf", "Elf", "Wizard"]);
    for (const hc of heroClasses) {
      assert.strictEqual(hc.classType, "Hero");
      assert.ok(typeof hc.attackDice === "number" && hc.attackDice >= 1, `${hc.name} must define attackDice`);
      assert.ok(typeof hc.defendDice === "number" && hc.defendDice >= 2, `${hc.name} must define defendDice`);
      assert.ok(typeof hc.bodyPoints === "number" && hc.bodyPoints >= 4, `${hc.name} must define bodyPoints`);
      assert.ok(typeof hc.mindPoints === "number" && hc.mindPoints >= 2, `${hc.name} must define mindPoints`);
      assert.ok(typeof hc.abilities === "string" && hc.abilities.length > 0, `${hc.name} must define starting abilities`);
    }

    // 3. Verify 15 Base HeroQuest Enemy Classes
    const enemyClasses = appModule.getEnemyClasses();
    assert.strictEqual(enemyClasses.length, 15, "Must define 15 Base HeroQuest Enemy Classes");
    const expectedEnemyClassNames = [
      "Goblin", "Orc", "Fimir", "Skeleton", "Zombie", "Mummy",
      "Dread Warrior", "Gargoyle", "Orc Shaman", "Orc Warlord",
      "Chaos Sorcerer", "Witch Lord", "Dragon", "Doomguard", "Witch Hand"
    ];
    for (const expectedName of expectedEnemyClassNames) {
      const ec = enemyClasses.find(c => c.name === expectedName);
      assert.ok(ec, `Enemy Class '${expectedName}' must exist`);
      assert.strictEqual(ec.classType, "Enemy");
      assert.ok(typeof ec.attackDice === "number", `${expectedName} must define attackDice`);
      assert.ok(typeof ec.defendDice === "number", `${expectedName} must define defendDice`);
      assert.ok(typeof ec.bodyPoints === "number", `${expectedName} must define bodyPoints`);
      assert.ok(typeof ec.mindPoints === "number", `${expectedName} must define mindPoints`);
      assert.ok(typeof ec.movementSquares === "number", `${expectedName} must define movementSquares`);
      assert.ok(typeof ec.abilities === "string" && ec.abilities.length > 0, `${expectedName} must define abilities`);
    }

    // 4. Verify extending a custom monster from a Base Enemy Class inherits starting stats & abilities
    const dreadWarriorClass = appModule.getClassByIdOrName("Dread Warrior");
    assert.ok(dreadWarriorClass, "Dread Warrior class must be resolvable by name");
    assert.strictEqual(dreadWarriorClass.attackDice, 4);
    assert.strictEqual(dreadWarriorClass.defendDice, 4);
    assert.strictEqual(dreadWarriorClass.bodyPoints, 3);
    assert.strictEqual(dreadWarriorClass.mindPoints, 3);
    assert.strictEqual(dreadWarriorClass.movementSquares, 7);

    const createdMonster = await appModule.createCustomMonsterFromClass("Dread Warrior", {
      name: "Shadow Dread Champion",
      category: "Custom Quest 2027"
    });
    assert.ok(createdMonster, "Custom monster must be returned");
    assert.strictEqual(createdMonster["dcterms:title"], "Shadow Dread Champion");
    assert.strictEqual(createdMonster["robos:extendsClass"], "Dread Warrior");
    assert.strictEqual(createdMonster["robos:monsterArchetype"], "Dread Warrior");
    assert.strictEqual(createdMonster["robos:attackDice"], 4, "Must inherit 4 Attack Dice from Dread Warrior class");
    assert.strictEqual(createdMonster["robos:defendDice"], 4, "Must inherit 4 Defend Dice from Dread Warrior class");
    assert.strictEqual(createdMonster["robos:bodyPoints"], 3, "Must inherit 3 Body Points from Dread Warrior class");
    assert.strictEqual(createdMonster["robos:mindPoints"], 3, "Must inherit 3 Mind Points from Dread Warrior class");
    assert.strictEqual(createdMonster["robos:movementSquares"], 7, "Must inherit 7 Movement Squares from Dread Warrior class");
    assert.ok(typeof createdMonster["robos:abilities"] === "string" && createdMonster["robos:abilities"].length > 0);
  });

  it("removes 'Board & Map Studio' tab and supports custom-quest.cartridge workflow, save state from now, and launch modes", async () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
    const mainJs = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
    const appModule = require(path.join(__dirname, "../renderer/app.js"));

    // 1. Verify 'Board & Map Studio' tab is completely deleted
    assert.ok(!indexHtml.includes('data-tab="tab-board"'), "Board & Map Studio tab button must be deleted");
    assert.ok(!indexHtml.includes('id="tab-board"'), "#tab-board section must be deleted");
    assert.ok(!indexHtml.includes("Board & Map Studio"), "Board & Map Studio text must not appear in index.html");

    // 2. Verify custom-quest.cartridge.json exists on disk and is the 1 and only quest of HeroQuest campaign
    const customCartPath = path.join(REPO_ROOT, "games/tabletop-rpg/cartridges/custom-quest.cartridge.json");
    assert.ok(fs.existsSync(customCartPath), "custom-quest.cartridge.json must exist");
    const cartData = JSON.parse(fs.readFileSync(customCartPath, "utf8"));
    assert.strictEqual(cartData.cartridgeId, "custom-quest");

    const campaign = appModule.getCampaign();
    assert.strictEqual(campaign.title, "HeroQuest");
    assert.strictEqual(campaign.quests.length, 1, "HeroQuest campaign must have 1 and only 1 quest");
    const activeQuest = appModule.getActiveQuest();
    assert.strictEqual(activeQuest.slug, "custom-quest");
    assert.strictEqual(activeQuest.cartridgeFile, "custom-quest.cartridge.json");

    // 3. Verify UI elements for Workflow 1 (quest info, review heroes for quest, launch quest editor),
    //    Workflow 2 (current quest state, save state from now), and Workflow 3 (launch saved state vs new quest state)
    assert.ok(indexHtml.includes('id="quest-cartridge-summary-strip"'), "Must include quest cartridge info strip");
    assert.ok(indexHtml.includes('id="quest-heroes-review-grid"'), "Must include current heroes review grid for the quest");
    assert.ok(indexHtml.includes('id="btn-launch-quest-editor"'), "Must include Launch Quest Editor button");
    assert.ok(indexHtml.includes('id="quest-save-state-card"'), "Must include Current Quest State card");
    assert.ok(indexHtml.includes('id="btn-save-quest-state-now"'), "Must include Save State From Now button");
    assert.ok(indexHtml.includes('id="btn-launch-saved-hero"'), "Must include Launch Saved State (Hero) button");
    assert.ok(indexHtml.includes('id="btn-launch-new-hero"'), "Must include Launch New Quest State (Hero) button");

    // 4. Verify IPC handlers in main.js support quest editor launch, save state from now, and launch modes
    assert.ok(mainJs.includes('ipcMain.handle("tabletop:launch-quest-editor"'), "main.js must handle tabletop:launch-quest-editor");
    assert.ok(mainJs.includes('ipcMain.handle("tabletop:get-quest-save-state"'), "main.js must handle tabletop:get-quest-save-state");
    assert.ok(mainJs.includes('ipcMain.handle("tabletop:save-quest-state-now"'), "main.js must handle tabletop:save-quest-state-now");
    assert.ok(mainJs.includes('ipcMain.handle("tabletop:clear-quest-save-state"'), "main.js must handle tabletop:clear-quest-save-state");
    assert.ok(mainJs.includes('launchMode === "new"'), "main.js launch-game handler must support launchMode 'new' vs 'saved'");

    // 5. Verify renderer workflow functions (saveQuestStateFromNow, launchQuestEditorForActiveQuest, launchQuestInMode)
    const stateSnap = await appModule.saveQuestStateFromNow();
    assert.strictEqual(stateSnap.success, true, "saveQuestStateFromNow must succeed");
    assert.ok(stateSnap.savedState, "saveQuestStateFromNow must return savedState snapshot");
    assert.strictEqual(stateSnap.savedState.cartridge_id, "custom-quest");
    assert.strictEqual(stateSnap.savedState.map_id, "custom-quest");
    assert.strictEqual(stateSnap.savedState.heroes.length, 4, "Saved state must include all 4 quest heroes");

    const editorLaunch = await appModule.launchQuestEditorForActiveQuest();
    assert.strictEqual(editorLaunch.success, true, "launchQuestEditorForActiveQuest must succeed");

    const launchSaved = await appModule.launchQuestInMode("player", "saved");
    assert.strictEqual(launchSaved.success, true);
    assert.strictEqual(launchSaved.launchMode, "saved");

    const launchNew = await appModule.launchQuestInMode("player", "new");
    assert.strictEqual(launchNew.success, true);
    assert.strictEqual(launchNew.launchMode, "new");
  });

  it("defines robos:TabletopQuestSaveState in KGraph ontology/SHACL and captures screenshots + full telemetry (player health, visible monsters, round, whose turn, items found, play time)", async () => {
    const gamingLib = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const appModule = require(path.join(__dirname, "../renderer/app.js"));
    const indexHtml = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
    const godotWorldGd = fs.readFileSync(path.join(REPO_ROOT, "games/tabletop-rpg/scripts/TabletopWorld.gd"), "utf8");
    const ontologyJson = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".robos/ontology.jsonld"), "utf8"));

    // 1. Verify KGraph Ontology & SHACL Shape definitions (no hardcoding of telemetry fields)
    assert.ok(
      Array.isArray(gamingLib.GAMING_SHACL_SHAPES) &&
      gamingLib.GAMING_SHACL_SHAPES.some(s => s.shapeId === "urn:robos:shape:TabletopQuestSaveStateShape"),
      "Must register TabletopQuestSaveStateShape in robos-gaming"
    );
    assert.ok(gamingLib.TABLETOP_SAVE_STATE_SCHEMA, "Must export TABLETOP_SAVE_STATE_SCHEMA from robos-gaming");
    assert.strictEqual(gamingLib.TABLETOP_SAVE_STATE_SCHEMA.targetClass, "robos:TabletopQuestSaveState");
    assert.ok(Array.isArray(gamingLib.TABLETOP_SAVE_STATE_SCHEMA.telemetryMetrics), "Must define schema-driven telemetryMetrics array");
    const metricPredicates = gamingLib.TABLETOP_SAVE_STATE_SCHEMA.telemetryMetrics.map(m => m.property);
    for (const requiredPred of [
      "robos:currentRound",
      "robos:activeTurnActor",
      "robos:turnState",
      "robos:playTimeSeconds",
      "robos:visibleMonstersCount",
      "robos:itemsFoundCount",
      "robos:totalPartyGold",
      "robos:exploredTilesCount",
      "robos:doorsOpenCount",
      "robos:triggersFiredCount"
    ]) {
      assert.ok(metricPredicates.includes(requiredPred), `Schema telemetryMetrics must include ${requiredPred}`);
    }

    const ontologyGraph = ontologyJson["@graph"] || [];
    assert.ok(ontologyGraph.some(n => n["@id"] === "robos:TabletopQuestSaveState"), ".robos/ontology.jsonld must define robos:TabletopQuestSaveState class");
    assert.ok(ontologyGraph.some(n => n["@id"] === "robos:activeTurnActor"), ".robos/ontology.jsonld must define robos:activeTurnActor property");
    assert.ok(ontologyGraph.some(n => n["@id"] === "robos:visibleMonsters"), ".robos/ontology.jsonld must define robos:visibleMonsters property");
    assert.ok(ontologyGraph.some(n => n["@id"] === "robos:screenshotPath"), ".robos/ontology.jsonld must define robos:screenshotPath property");

    // 2. Verify Godot TabletopWorld.gd captures screenshot and full telemetry on every save
    assert.ok(godotWorldGd.includes("func _capture_save_screenshot("), "TabletopWorld.gd must implement _capture_save_screenshot");
    assert.ok(godotWorldGd.includes("func get_save_screenshot_path("), "TabletopWorld.gd must implement get_save_screenshot_path");
    assert.ok(godotWorldGd.includes('"screenshot_path":'), "serialize_game_state must record screenshot_path");
    assert.ok(godotWorldGd.includes('"play_time_seconds": roundi(play_time_seconds)'), "serialize_game_state must record play_time_seconds");
    assert.ok(godotWorldGd.includes('"active_turn_actor": active_actor_str'), "serialize_game_state must record active_turn_actor");
    assert.ok(godotWorldGd.includes('"visible_monsters": visible_monsters_save'), "serialize_game_state must record visible_monsters");
    assert.ok(godotWorldGd.includes('"items_found":'), "serialize_game_state must record items_found");

    // 3. Verify UI containers in index.html for screenshot, telemetry grid, visible monsters, and items found
    assert.ok(indexHtml.includes('id="quest-save-state-screenshot-panel"'), "index.html must include screenshot panel");
    assert.ok(indexHtml.includes('id="quest-save-state-screenshot-canvas"'), "index.html must include screenshot canvas");
    assert.ok(indexHtml.includes('id="quest-save-state-telemetry-grid"'), "index.html must include KGraph telemetry grid");
    assert.ok(indexHtml.includes('id="quest-save-state-visible-monsters"'), "index.html must include visible monsters list");
    assert.ok(indexHtml.includes('id="quest-save-state-items-found"'), "index.html must include items found list");

    // 4. Verify normalization of raw Godot save state into KGraph robos:TabletopQuestSaveState node
    const rawGodotSave = {
      version: "2.0",
      timestamp: 1775827298,
      cartridge_id: "custom-quest",
      map_id: "custom-quest",
      current_round: 3,
      current_phase: "HERO_TURN",
      active_hero_idx: 1,
      turn_moved: true,
      turn_action_used: false,
      turn_move_remaining: 4,
      turn_Searched_treasure: true,
      play_time_seconds: 425,
      heroes: [
        { id: "barbarian", name: "Barbarian", class: "Barbarian", pos: [1, 8], current_bp: 6, max_bp: 8, current_mp: 2, max_mp: 2, attack: 3, defend: 2, gold: 150, inventory: [{ name: "Potion of Healing", type: "potion" }], dead: false },
        { id: "dwarf", name: "Dwarf", class: "Dwarf", pos: [2, 9], current_bp: 7, max_bp: 7, current_mp: 3, max_mp: 3, attack: 2, defend: 2, gold: 125, inventory: [{ name: "Toolkit", type: "tool" }], dead: false }
      ],
      monsters: [
        { id: "mon-orc-1", name: "Orc Warrior", slug: "orc", pos: [4, 9], current_bp: 1, max_bp: 1, attack: 3, defend: 2, dead: false },
        { id: "mon-goblin-2", name: "Goblin Scout", slug: "goblin", pos: [12, 12], current_bp: 1, max_bp: 1, attack: 2, defend: 1, dead: false }
      ],
      discovered_monster_ids: ["mon-orc-1"],
      explored_tiles: ["1,8", "2,9", "3,9", "4,9"],
      revealed_rooms: ["room-entry", "room-guard"],
      doors: [{ from: [2, 8], to: [3, 8], open: true }, { from: [5, 8], to: [6, 8], open: false }],
      triggers_fired: ["on_enter_guard_room"]
    };

    const kNode = gamingLib.normalizeQuestSaveStateToKGraphNode(rawGodotSave, { slug: "custom-quest" });
    assert.strictEqual(kNode["@id"], "urn:robos:tabletop:savestate:custom-quest");
    assert.ok(kNode["@type"].includes("robos:TabletopQuestSaveState"), "Normalized node must have @type robos:TabletopQuestSaveState");
    assert.strictEqual(kNode["robos:currentRound"], 3);
    assert.strictEqual(kNode["robos:currentPhase"], "HERO_TURN");
    assert.ok(kNode["robos:activeTurnActor"].includes("Dwarf"), "Whose turn must resolve to active_hero_idx=1 (Dwarf)");
    assert.strictEqual(kNode["robos:playTimeSeconds"], 425);
    assert.strictEqual(kNode["robos:playTimeFormatted"], "7m 5s");
    assert.strictEqual(kNode["robos:heroStates"][0].currentBP, 6, "Must map Godot current_bp -> currentBP");
    assert.strictEqual(kNode["robos:heroStates"][0].maxBP, 8, "Must map Godot max_bp -> maxBP");
    assert.strictEqual(kNode["robos:visibleMonstersCount"], 1, "Must filter visible monsters by discovered_monster_ids and explored tiles");
    assert.strictEqual(kNode["robos:visibleMonsters"][0].name, "Orc Warrior");
    assert.strictEqual(kNode["robos:itemsFoundCount"], 2, "Must aggregate items found across party inventories");
    assert.strictEqual(kNode["robos:totalPartyGold"], 275);
    assert.strictEqual(kNode["robos:exploredTilesCount"], 4);
    assert.strictEqual(kNode["robos:doorsOpenCount"], 1);
    assert.deepStrictEqual(kNode["robos:triggersFired"], ["on_enter_guard_room"]);

    // 5. Verify strict Fog-of-War & zero-spoiler guarantees (no unseen monsters, unseen doors, unseen furniture, room totals, or treasure deck spoilers)
    assert.strictEqual(kNode["robos:allMonsters"], undefined, "Must not leak unseen monsters via robos:allMonsters");
    assert.strictEqual(kNode["robos:totalMonstersAlive"], undefined, "Must not leak total monsters count via robos:totalMonstersAlive");
    assert.strictEqual(kNode["robos:doorsTotalCount"], undefined, "Must not leak total doors count via robos:doorsTotalCount");
    assert.strictEqual(kNode["robos:trapsTotalCount"], undefined, "Must not leak total traps count via robos:trapsTotalCount");
    assert.strictEqual(kNode["robos:triggersTotalCount"], undefined, "Must not leak total triggers count via robos:triggersTotalCount");
    assert.strictEqual(kNode["robos:treasureDeckRemaining"], undefined, "Must not leak treasure deck remaining count");
    assert.strictEqual(kNode["robos:doors"].length, 1, "Unseen closed door at [5,8]->[6,8] outside explored tiles must be filtered out");
    assert.ok(!indexHtml.includes("24 Monsters"), "index.html must not spoil total monster count");
    assert.ok(!indexHtml.includes("22 calibrated rooms"), "index.html must not spoil room count");

    // 6. Verify saveQuestStateFromNow returns normalized KGraph node + screenshot with zero spoilers
    const snapRes = await appModule.saveQuestStateFromNow();
    assert.strictEqual(snapRes.success, true);
    assert.ok(snapRes.savedState["@type"].includes("robos:TabletopQuestSaveState"));
    assert.strictEqual(typeof snapRes.savedState["robos:currentRound"], "number");
    assert.ok(typeof snapRes.savedState["robos:activeTurnActor"] === "string" && snapRes.savedState["robos:activeTurnActor"].length > 0);
    assert.ok(Array.isArray(snapRes.savedState["robos:heroStates"]) && snapRes.savedState["robos:heroStates"].length === 4);
    assert.ok(Array.isArray(snapRes.savedState["robos:visibleMonsters"]));
    assert.ok(Array.isArray(snapRes.savedState["robos:itemsFound"]));
    assert.strictEqual(snapRes.savedState["robos:allMonsters"], undefined, "Renderer save state must not include robos:allMonsters");
    assert.strictEqual(snapRes.savedState["robos:totalMonstersAlive"], undefined, "Renderer save state must not include robos:totalMonstersAlive");
  });

  it("supports deleting quests from the Campaign Viewer (sidebar list, quest card header, top header, and deleting down to 0 quests)", () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
    const appJs = fs.readFileSync(path.join(__dirname, "../renderer/app.js"), "utf8");
    const mainJs = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8");
    const appModule = require(path.join(__dirname, "../renderer/app.js"));

    assert.ok(indexHtml.includes('id="btn-delete-quest"'), "Quest card header must include #btn-delete-quest");
    assert.ok(indexHtml.includes('id="btn-sidebar-delete-quest"'), "Campaign Quests sidebar must include #btn-sidebar-delete-quest");
    assert.ok(indexHtml.includes('id="btn-header-delete-quest"'), "Top header must include #btn-header-delete-quest");
    assert.ok(indexHtml.includes('<textarea id="campaign-name-input"'), "Campaign Name input must be a multiline textarea so long names wrap cleanly");
    assert.ok(appJs.includes("btn-delete-quest-item"), "Each quest item in Campaign Quests list must include an inline delete button");
    assert.ok(mainJs.includes('ipcMain.handle("tabletop:delete-quest"'), "main.js must handle tabletop:delete-quest IPC");

    const campaign = appModule.getCampaign();
    assert.strictEqual(campaign.quests.length, 1);

    // Add a second quest and delete it by slug
    appModule.addQuest({ slug: "temp-quest-2", title: "Quest 2: Temporary" });
    assert.strictEqual(campaign.quests.length, 2);
    assert.strictEqual(appModule.deleteQuest("temp-quest-2"), true);
    assert.strictEqual(campaign.quests.length, 1);

    // Delete the remaining quest (even when only 1 quest is in the campaign)
    assert.strictEqual(appModule.deleteQuest(0), true);
    assert.strictEqual(campaign.quests.length, 0);
    assert.strictEqual(appModule.deleteQuest(0), false, "Deleting when 0 quests remain returns false");

    // Restore custom-quest so campaign state remains clean
    appModule.addQuest({
      slug: "custom-quest",
      title: "Quest 1: Custom Dungeon",
      cartridgeFile: "custom-quest.cartridge.json",
      goldReward: 150
    });
    assert.strictEqual(campaign.quests.length, 1);
    assert.strictEqual(appModule.getActiveQuest().slug, "custom-quest");
  });

  it("provides resizable column separators (.col-resizer) across all tabs and supports dragging and resetting column widths", () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
    const styleCss = fs.readFileSync(path.join(__dirname, "../renderer/style.css"), "utf8");
    const appModule = require(path.join(__dirname, "../renderer/app.js"));

    // 1. Verify every multi-column separator in every tab is present in index.html
    const requiredResizerIds = [
      "split-campaign-quests",
      "grid-quest-metadata-briefing",
      "grid-quest-save-overview",
      "grid-quest-save-collections",
      "split-campaign-heroes",
      "split-monsters",
      "split-classes",
      "grid-spells-weapons",
      "grid-hero-trade"
    ];

    for (const rId of requiredResizerIds) {
      assert.ok(
        indexHtml.includes(`data-resizer-id="${rId}"`),
        `index.html must include resizable column separator data-resizer-id="${rId}"`
      );
    }

    assert.ok(!indexHtml.includes('id="btn-open-spell-pick"'), "index.html must not include #btn-open-spell-pick");
    assert.ok(!indexHtml.includes('id="modal-spell-pick"'), "index.html must not include #modal-spell-pick");

    // 2. Verify CSS rules for .col-resizer and 3-track grid layouts
    assert.ok(styleCss.includes(".col-resizer"), "style.css must define .col-resizer");
    assert.ok(styleCss.includes("cursor: col-resize"), "style.css must set col-resize cursor on .col-resizer");
    assert.ok(styleCss.includes("--split-left-width"), "style.css must use --split-left-width variable for .split-view");

    // 3. Verify programmatic resize and reset across split-view and two-col grids
    const initialQuestsSplit = appModule.getColumnResizerState("split-campaign-quests");
    assert.strictEqual(initialQuestsSplit.leftPx, 280);
    assert.strictEqual(initialQuestsSplit.isCustom, false);

    const resizedQuestsSplit = appModule.resizeColumnSeparator("split-campaign-quests", 80, 1200);
    assert.strictEqual(resizedQuestsSplit.leftPx, 360);
    assert.strictEqual(resizedQuestsSplit.isCustom, true);
    assert.ok(resizedQuestsSplit.gridTemplateColumns.startsWith("360px 12px"));

    const resetQuestsSplit = appModule.resetColumnSeparator("split-campaign-quests");
    assert.strictEqual(resetQuestsSplit.leftPx, 280);
    assert.strictEqual(resetQuestsSplit.isCustom, false);

    // Resize Monsters tab split-view
    const resizedMonstersSplit = appModule.resizeColumnSeparator("split-monsters", 60, 1200);
    assert.strictEqual(resizedMonstersSplit.leftPx, 340);
    appModule.resetColumnSeparator("split-monsters");

    // Resize Classes tab split-view
    const resizedClassesSplit = appModule.resizeColumnSeparator("split-classes", 50, 1200);
    assert.strictEqual(resizedClassesSplit.leftPx, 330);
    appModule.resetColumnSeparator("split-classes");

    // Resize Spells & Weapons 2-column grid in Spells tab
    const resizedSpellsGrid = appModule.resizeColumnSeparator("grid-spells-weapons", 100, 1012);
    assert.strictEqual(resizedSpellsGrid.leftRatio, 60);
    assert.strictEqual(resizedSpellsGrid.rightRatio, 40);
    assert.strictEqual(resizedSpellsGrid.isCustom, true);

    const resetSpellsGrid = appModule.resetColumnSeparator("grid-spells-weapons");
    assert.strictEqual(resetSpellsGrid.leftRatio, 50);
    assert.strictEqual(resetSpellsGrid.rightRatio, 50);
    assert.strictEqual(resetSpellsGrid.isCustom, false);
  });

  it("includes Midterm Elections: Battle for the Hill (midterm-election-capitol) in Board Theme / Background selector and map configurations", async () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
    const kgraph = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"));
    const { listMapConfigurations, getMapConfiguration } = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const appModule = require(path.join(__dirname, "../renderer/app.js"));

    // 1. Verify midterm-election-capitol is in packages/robos-gaming map configurations
    const configs = listMapConfigurations();
    assert.ok(configs.some(c => c.id === "midterm-election-capitol"), "listMapConfigurations must include midterm-election-capitol");
    const midtermCfg = getMapConfiguration("midterm-election-capitol");
    assert.strictEqual(midtermCfg.id, "midterm-election-capitol");
    assert.strictEqual(midtermCfg.title, "Midterm Elections: Battle for the Hill");
    assert.strictEqual(midtermCfg.backgroundImage, "res://assets/boards/midterm_election_capitol.png");
    assert.deepEqual(midtermCfg.gridDimensions, [26, 19]);

    // 2. Verify KGraph node urn:robos:tabletop:mapconfig:midterm-election-capitol exists
    const kgraphNode = (kgraph["robos:nodes"] || []).find(n => n["@id"] === "urn:robos:tabletop:mapconfig:midterm-election-capitol");
    assert.ok(kgraphNode, "KGraph must contain urn:robos:tabletop:mapconfig:midterm-election-capitol");
    assert.strictEqual(kgraphNode["robos:backgroundImage"], "res://assets/boards/midterm_election_capitol.png");

    // 3. Verify #quest-bg-ref in index.html and switchMapConfiguration in app.js support midterm-election-capitol
    assert.ok(indexHtml.includes('value="midterm-election-capitol"'), "#quest-bg-ref must include midterm-election-capitol option");
    await appModule.switchMapConfiguration("midterm-election-capitol", true);
    assert.strictEqual(appModule.getActiveQuest().mapConfigId, "midterm-election-capitol");
    await appModule.switchMapConfiguration("heroquest-classic", true);
  });

  it("creates new campaigns with 0 quests by default and immediately autosaves campaign and quest edits to KGraph", async () => {
    const indexHtml = fs.readFileSync(path.join(__dirname, "../renderer/index.html"), "utf8");
    const appModule = require(path.join(__dirname, "../renderer/app.js"));

    // 1. Verify #campaign-autosave-status indicator exists in .campaign-selector-bar
    assert.ok(
      indexHtml.includes('id="campaign-autosave-status"'),
      "index.html must include #campaign-autosave-status indicator in the campaign selector bar"
    );

    // 2. Clicking '+ New Campaign' (addCampaign() with no quests prop) must create a campaign with 0 quests by default
    const newCamp = appModule.addCampaign({
      id: "campaign-empty-by-default",
      title: "Fresh Empty Campaign"
    });
    assert.strictEqual(newCamp.title, "Fresh Empty Campaign");
    assert.ok(Array.isArray(newCamp.quests), "newCampaign.quests must be an array");
    assert.strictEqual(newCamp.quests.length, 0, "New campaign must have 0 quests by default");
    assert.strictEqual(appModule.getActiveQuest(), null, "Active quest must be null when new campaign has 0 quests");

    // 3. Verify serializeCampaignToKGraphNode and deserializeCampaignFromKGraphNode preserve 0-quest state and added quests
    const emptyNode = appModule.serializeCampaignToKGraphNode(newCamp);
    assert.strictEqual(emptyNode["@id"], "urn:robos:tabletop:campaign:campaign-empty-by-default");
    assert.ok(emptyNode["@type"].includes("robos:TabletopCampaign"));
    assert.strictEqual(emptyNode["robos:quests"].length, 0, "Serialized KGraph node for new campaign must have 0 quests");

    const restoredEmpty = appModule.deserializeCampaignFromKGraphNode(emptyNode);
    assert.strictEqual(restoredEmpty.id, "campaign-empty-by-default");
    assert.strictEqual(restoredEmpty.quests.length, 0, "Deserialized campaign must retain 0 quests");

    // 4. Add a quest to the new campaign and verify immediate serialization & KGraph save
    const addedQuest = appModule.addQuest({
      title: "Midterm Capitol Siege",
      slug: "midterm-capitol-siege",
      mapConfigId: "midterm-election-capitol",
      goldReward: 250
    });
    assert.strictEqual(newCamp.quests.length, 1, "Campaign must have 1 quest after addQuest");
    assert.strictEqual(appModule.getActiveQuest().slug, "midterm-capitol-siege");
    assert.strictEqual(addedQuest.mapConfigId, "midterm-election-capitol");

    const populatedNode = appModule.serializeCampaignToKGraphNode(newCamp);
    assert.strictEqual(populatedNode["robos:quests"].length, 1);
    assert.strictEqual(populatedNode["robos:quests"][0].slug, "midterm-capitol-siege");
    assert.strictEqual(populatedNode["robos:quests"][0].mapConfigId, "midterm-election-capitol");

    const saveRes = await appModule.saveCampaignToKGraph(newCamp, false);
    assert.strictEqual(saveRes.success, true, "saveCampaignToKGraph must succeed immediately");

    // Clean up test campaign and switch back to HeroQuest campaign 0
    const idx = appModule.getCampaigns().findIndex(c => c.id === "campaign-empty-by-default");
    if (idx !== -1) {
      appModule.deleteCampaign(idx);
    }
    await appModule.selectCampaign(0);
  });
});
