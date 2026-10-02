'use strict';

/**
 * RobOS Gaming Subsystem: Game Cartridge Bundler
 * Universal packager for self-contained Player Cartridges (.cartridge.json)
 * supporting both tactical cRPGs and tabletop dungeon crawlers.
 */

const fs = require("fs");
const path = require("path");

class GameCartridgeBundler {
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
  }

  /**
   * Validate cartridge header and mandatory sections.
   */
  validateCartridge(cartridge) {
    const errors = [];
    if (!cartridge) {
      errors.push("Cartridge data is null or undefined");
      return { valid: false, errors };
    }

    if (!cartridge.cartridgeId) errors.push("Missing cartridgeId");
    if (!cartridge.header) {
      errors.push("Missing cartridge header");
    } else {
      if (!cartridge.header.title) errors.push("Header missing title");
      if (!cartridge.header.gameType) errors.push("Header missing gameType (crpg, tabletop)");
      if (!cartridge.header.ruleset) errors.push("Header missing ruleset");
    }

    if (!cartridge.maps || Object.keys(cartridge.maps).length === 0) {
      errors.push("Cartridge contains no maps");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Bundle a tabletop RPG cartridge (HeroQuest style).
   */
  bundleTabletop({
    cartridgeId,
    title,
    description = "",
    ruleset = "heroquest",
    heroes = [],
    monsters = [],
    spells = [],
    items = [],
    quests = [],
    maps = {},
    spellAllocation = null,
    startingMap = "the-trial",
    startingPosition = [1, 1],
    coverColor = "#78350f",
    icon = "🛡️"
  }) {
    const header = {
      title,
      slug: cartridgeId,
      author: "RobOS Tabletop Studio",
      gameType: "tabletop",
      genre: "Tabletop Dungeon Crawler",
      ruleset,
      description,
      coverColor,
      icon,
      mapCount: Object.keys(maps).length,
      heroCount: heroes.length,
      monsterCount: monsters.length,
      spellCount: spells.length,
      itemCount: items.length,
      questCount: quests.length,
      startingMap,
      startingPosition,
      createdDate: new Date().toISOString()
    };

    const cartridge = {
      cartridgeVersion: "2.0.0",
      cartridgeId,
      header,
      heroes: Object.fromEntries(heroes.map(h => [h.id || h.slug, h])),
      monsters: Object.fromEntries(monsters.map(m => [m.id || m.slug, m])),
      spells: Object.fromEntries(spells.map(s => [s.id || s.slug, s])),
      items: Object.fromEntries(items.map(i => [i.id || i.slug, i])),
      maps,
      quests
    };
    if (spellAllocation) {
      cartridge.spellAllocation = spellAllocation;
    }

    const validation = this.validateCartridge(cartridge);
    if (!validation.valid) {
      throw new Error("Invalid Tabletop Cartridge: " + validation.errors.join(", "));
    }

    return cartridge;
  }

  /**
   * Save cartridge to disk.
   */
  saveCartridge(cartridge, outputPath) {
    const targetDir = path.dirname(outputPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(cartridge, null, 2) + "\n", "utf8");
    return outputPath;
  }

  /**
   * Read cartridge from disk.
   */
  loadCartridge(inputPath) {
    if (!fs.existsSync(inputPath)) {
      throw new Error("Cartridge not found: " + inputPath);
    }
    const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const val = this.validateCartridge(data);
    if (!val.valid) {
      console.warn("[GameCartridgeBundler] Warning: Cartridge validation issues:", val.errors);
    }
    return data;
  }
}

module.exports = {
  GameCartridgeBundler
};
