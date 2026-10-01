const { describe, it } = require("node:test");
const assert = require("node:assert");
const { GameCartridgeBundler } = require("../lib/cartridge-bundler");

describe("RobOS Gaming: Cartridge Bundler", () => {
  it("bundles and validates a tabletop RPG cartridge", () => {
    const bundler = new GameCartridgeBundler();
    const cartridge = bundler.bundleTabletop({
      cartridgeId: "heroquest-the-trial",
      title: "HeroQuest: The Trial",
      description: "Enter the dungeon and defeat the Orc Warlord Verag.",
      heroes: [
        { id: "barbarian", name: "Barbarian", bodyPoints: 8, mindPoints: 2, attackDice: 3, defendDice: 2 },
        { id: "dwarf", name: "Dwarf", bodyPoints: 7, mindPoints: 3, attackDice: 2, defendDice: 2 },
        { id: "elf", name: "Elf", bodyPoints: 6, mindPoints: 4, attackDice: 2, defendDice: 2 },
        { id: "wizard", name: "Wizard", bodyPoints: 4, mindPoints: 6, attackDice: 1, defendDice: 2 }
      ],
      monsters: [
        { id: "goblin", name: "Goblin", bodyPoints: 1, attackDice: 2, defendDice: 1, movementSquares: 10 },
        { id: "orc", name: "Orc", bodyPoints: 1, attackDice: 3, defendDice: 2, movementSquares: 8 }
      ],
      maps: {
        "the-trial": {
          width: 26,
          height: 19,
          title: "The Trial Dungeon Map"
        }
      },
      quests: [
        { id: "quest-1", title: "Defeat Verag and Escape" }
      ]
    });

    assert.strictEqual(cartridge.cartridgeId, "heroquest-the-trial");
    assert.strictEqual(cartridge.header.heroCount, 4);
    assert.strictEqual(cartridge.header.monsterCount, 2);
    assert.strictEqual(cartridge.header.gameType, "tabletop");
    assert.ok(cartridge.heroes.barbarian);
    assert.ok(cartridge.monsters.goblin);
  });
});
