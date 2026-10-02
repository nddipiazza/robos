const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

describe("cRPG Map & Blockmap Studio History Test Suite", () => {
  it("verifies package manifest and desktop entry exist", () => {
    const pkgPath = path.join(__dirname, "../package.json");
    const desktopPath = path.join(__dirname, "../crpg-editor.desktop");

    assert.ok(fs.existsSync(pkgPath), "package.json must exist");
    assert.ok(fs.existsSync(desktopPath), "crpg-editor.desktop must exist");
  });

  it("verifies undo and redo for map objects and terrain", () => {
    const initialMap = {
      "@id": "urn:robos:crpg:battle-map:dungeon-1",
      slug: "dungeon-1",
      "dcterms:title": "Dungeon Level 1",
      "robos:width": 120,
      "robos:height": 80,
      "robos:terrain": "stone",
      "robos:mapObjects": []
    };

    const undoStack = [];
    const redoStack = [];

    function snapshot(data) {
      return {
        mapObjects: JSON.parse(JSON.stringify(data["robos:mapObjects"] || [])),
        terrain: data["robos:terrain"],
        width: data["robos:width"],
        height: data["robos:height"]
      };
    }

    function push(data) {
      undoStack.push(snapshot(data));
      redoStack.length = 0;
    }

    function undo(current) {
      assert.ok(undoStack.length > 0, "Undo stack cannot be empty");
      redoStack.push(snapshot(current));
      const prev = undoStack.pop();
      current["robos:mapObjects"] = JSON.parse(JSON.stringify(prev.mapObjects));
      current["robos:terrain"] = prev.terrain;
      current["robos:width"] = prev.width;
      current["robos:height"] = prev.height;
      return current;
    }

    function redo(current) {
      assert.ok(redoStack.length > 0, "Redo stack cannot be empty");
      undoStack.push(snapshot(current));
      const next = redoStack.pop();
      current["robos:mapObjects"] = JSON.parse(JSON.stringify(next.mapObjects));
      current["robos:terrain"] = next.terrain;
      current["robos:width"] = next.width;
      current["robos:height"] = next.height;
      return current;
    }

    let map = JSON.parse(JSON.stringify(initialMap));

    // Action 1: Place a wall pillar object
    push(map);
    map["robos:mapObjects"].push({
      id: "wall_pillar_1",
      type: "wall",
      shape: "rect",
      x: 10,
      y: 10,
      width: 5,
      height: 5
    });
    assert.strictEqual(map["robos:mapObjects"].length, 1);

    // Action 2: Change terrain to grass
    push(map);
    map["robos:terrain"] = "grass";
    assert.strictEqual(map["robos:terrain"], "grass");

    // Action 3: Drag wall pillar to [25, 30]
    push(map);
    map["robos:mapObjects"][0].x = 25;
    map["robos:mapObjects"][0].y = 30;

    // Undo Action 3 (drag): object should return to [10, 10]
    map = undo(map);
    assert.strictEqual(map["robos:mapObjects"][0].x, 10);
    assert.strictEqual(map["robos:mapObjects"][0].y, 10);
    assert.strictEqual(map["robos:terrain"], "grass");

    // Undo Action 2 (terrain): terrain should revert to stone
    map = undo(map);
    assert.strictEqual(map["robos:terrain"], "stone");
    assert.strictEqual(map["robos:mapObjects"].length, 1);

    // Undo Action 1 (placement): object should be removed
    map = undo(map);
    assert.strictEqual(map["robos:mapObjects"].length, 0);

    // Redo Action 1 (placement restored)
    map = redo(map);
    assert.strictEqual(map["robos:mapObjects"].length, 1);
    assert.strictEqual(map["robos:mapObjects"][0].id, "wall_pillar_1");

    // Redo Action 2 (terrain restored)
    map = redo(map);
    assert.strictEqual(map["robos:terrain"], "grass");

    // Redo Action 3 (drag position restored)
    map = redo(map);
    assert.strictEqual(map["robos:mapObjects"][0].x, 25);
    assert.strictEqual(map["robos:mapObjects"][0].y, 30);
  });
});
