const { describe, it } = require("node:test");
const assert = require("node:assert");
const { BoardGrid } = require("../lib/board-grid");
const {
  HEROQUEST_BOARD_WIDTH,
  HEROQUEST_BOARD_HEIGHT,
  HEROQUEST_ROOMS,
  HEROQUEST_STANDARD_DOORS,
  buildHeroQuestGrid
} = require("../lib/heroquest-board-spec");

describe("RobOS Gaming: Board Grid & HeroQuest Blueprint", () => {
  it("initializes a valid 26x19 board grid", () => {
    assert.strictEqual(HEROQUEST_BOARD_WIDTH, 26);
    assert.strictEqual(HEROQUEST_BOARD_HEIGHT, 19);
    const grid = new BoardGrid(26, 19);
    assert.ok(grid.inBounds(0, 0));
    assert.ok(grid.inBounds(25, 18));
    assert.ok(!grid.inBounds(26, 19));
  });

  it("builds the HeroQuest grid with rooms, walls, and registered doors", () => {
    const grid = buildHeroQuestGrid(BoardGrid);
    assert.ok(HEROQUEST_ROOMS.length >= 16, "HeroQuest has at least 16 defined rooms");
    assert.ok(HEROQUEST_STANDARD_DOORS.length >= 10, "Has doors");

    // Door initially closed
    const door = grid.getDoor(2, 0, 2, 1);
    assert.ok(door, "Door exists leading into Northwest corner room");
    assert.strictEqual(door.isOpen, false);
    assert.strictEqual(grid.canTraverse(2, 0, 2, 1), false);

    // Open door
    assert.ok(grid.openDoor(2, 0, 2, 1));
    assert.strictEqual(grid.canTraverse(2, 0, 2, 1), true);
  });

  it("calculates movement reach budget along corridors", () => {
    const grid = new BoardGrid(26, 19);
    // Move along open corridor at (0,0) for 4 steps
    const reach = grid.getReachableTiles(0, 0, 4);
    assert.ok(reach.length > 0);
    const hasDist4 = reach.some(t => t.dist === 4);
    assert.ok(hasDist4);
    const exceeded = reach.some(t => t.dist > 4);
    assert.ok(!exceeded);
  });
});
