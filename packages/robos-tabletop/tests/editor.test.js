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

  it("loads multiple map configurations including First Light Caverns", () => {
    const { listMapConfigurations, getMapConfiguration } = require(path.join(REPO_ROOT, "packages/robos-gaming"));
    const configs = listMapConfigurations();
    assert.ok(configs.length >= 2, "Must support at least 2 map configurations");

    const classic = getMapConfiguration("heroquest-classic");
    assert.strictEqual(classic.boardSide, "A");
    assert.deepEqual(classic.gridDimensions, [26, 19]);

    const firstLight = getMapConfiguration("first-light-caverns");
    assert.strictEqual(firstLight.boardSide, "B");
    assert.deepEqual(firstLight.gridDimensions, [26, 19]);
    assert.ok(firstLight.rooms.length > 10, "First Light must define cavern rooms");
  });

  it("verifies board image assets exist for both sides of the board", () => {
    const boardSideA = path.join(REPO_ROOT, "games/tabletop-rpg/assets/boards/heroquest_board.png");
    const boardSideB = path.join(REPO_ROOT, "games/tabletop-rpg/assets/boards/first_light_caverns.png");

    assert.ok(fs.existsSync(boardSideA), "Side A heroquest_board.png must exist");
    assert.ok(fs.existsSync(boardSideB), "Side B first_light_caverns.png must exist");
  });
});
