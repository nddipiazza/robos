const { describe, it } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { spawnSync } = require("child_process");
const { countBlockoutStats } = require("../lib/blockout-stats");

const BLOCKOUT_DIR = path.join(__dirname, "..", "..", "robos-crpg-blockout");

// Builds a small map with robos-crpg-blockout and returns the robos:blockout
// grid it writes, or null when python3 or Pillow is not available.
function gridFromBlockoutPackage() {
  const script = [
    "import json",
    "from robos_crpg_blockout import MapBuilder, compute_blockout",
    "m = (MapBuilder('t', 't', 40, 40)",
    "     .tree('oak', 10, 10, radius=5)",
    "     .rect('idol', 'statue', 30, 30, 5, 5)",
    "     .wall('w', (0, 0), (0, 20))",
    "     .rect('pond', 'water', 20, 0, 5, 5).build())",
    "print(json.dumps(compute_blockout(m)))",
  ].join("\n");
  const res = spawnSync("python3", ["-c", script], {
    cwd: BLOCKOUT_DIR,
    env: { ...process.env, PYTHONPATH: BLOCKOUT_DIR },
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) return null;
  return JSON.parse(res.stdout);
}

describe("cRPG Editor blockout stats", () => {

  it("counts cover from cover.half and cover['three-quarters']", () => {
    const stats = countBlockoutStats({
      blocked: [[0, 0], [1, 0], [2, 2]],
      opaque: [[0, 0]],
      difficult: [[5, 5], [5, 6]],
      cover: { half: [[2, 2], [3, 3]], "three-quarters": [[4, 4]] },
    });
    assert.deepStrictEqual(stats, {
      blocked: 3,
      opaque: 1,
      difficult: 2,
      halfCover: 2,
      threeQuarterCover: 1,
    });
  });

  it("still reads the old flat halfCover and threeQuarterCover keys", () => {
    const stats = countBlockoutStats({ halfCover: [[1, 1]], threeQuarterCover: [[2, 2], [3, 3]] });
    assert.strictEqual(stats.halfCover, 1);
    assert.strictEqual(stats.threeQuarterCover, 2);
  });

  it("returns zeros for a missing or empty grid", () => {
    const zeros = { blocked: 0, opaque: 0, difficult: 0, halfCover: 0, threeQuarterCover: 0 };
    assert.deepStrictEqual(countBlockoutStats(undefined), zeros);
    assert.deepStrictEqual(countBlockoutStats({}), zeros);
  });

  it("counts cover in a grid written by robos-crpg-blockout", (t) => {
    const grid = gridFromBlockoutPackage();
    if (!grid) {
      t.skip("python3 with Pillow is not available");
      return;
    }
    const stats = countBlockoutStats(grid);
    assert.strictEqual(stats.halfCover, grid.cover.half.length);
    assert.strictEqual(stats.threeQuarterCover, grid.cover["three-quarters"].length);
    assert.ok(stats.halfCover > 0, "the tree should give half cover");
    assert.ok(stats.threeQuarterCover > 0, "the statue should give three-quarters cover");
    assert.strictEqual(stats.blocked, grid.blocked.length);
    assert.strictEqual(stats.difficult, grid.difficult.length);
  });
});
