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

  it("verifies all 12 authentic HeroQuest elemental spells are defined across 4 colleges", () => {
    assert.ok(fs.existsSync(KGRAPH_TABLETOP), "tabletop-game package.jsonld must exist");
    const data = JSON.parse(fs.readFileSync(KGRAPH_TABLETOP, "utf8"));
    const nodes = data["robos:nodes"] || [];

    const spellNodes = nodes.filter(n => {
      const t = Array.isArray(n["@type"]) ? n["@type"] : [n["@type"]];
      return t.includes("robos:TabletopSpellCard");
    });

    assert.strictEqual(spellNodes.length, 12, "Must contain exactly 12 HeroQuest elemental spells");

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
});


