const { describe, it } = require("node:test");
const assert = require("node:assert");
const { UniversalDiceEngine, dice } = require("../lib/dice");

describe("RobOS Gaming: Dice Subsystem", () => {
  it("rolls standard polyhedral dice expressions accurately", () => {
    const res = dice.roll("2d6");
    assert.strictEqual(res.count, 2);
    assert.strictEqual(res.sides, 6);
    assert.strictEqual(res.rolls.length, 2);
    assert.ok(res.total >= 2 && res.total <= 12, "Total should be within 2 and 12");
  });

  it("handles modifiers like 1d20+5", () => {
    const res = dice.roll("1d20+5");
    assert.strictEqual(res.modifier, 5);
    assert.ok(res.total >= 6 && res.total <= 25, "Total should be within 6 and 25");
  });

  it("rolls HeroQuest combat dice with correct faces and counts", () => {
    const res = dice.rollCombatDice(6);
    assert.strictEqual(res.diceCount, 6);
    assert.strictEqual(res.faces.length, 6);
    const sum = res.skulls + res.whiteShields + res.blackShields;
    assert.strictEqual(sum, 6);
  });

  it("resolves combat with attack skulls and defense shields", () => {
    // Deterministic mock test
    let callIdx = 0;
    // mock rolls:
    // Attacker: face 0 (skull), face 1 (skull) -> 2 skulls
    // Defender: face 3 (white_shield), face 0 (skull) -> 1 white shield
    const mockVals = [0.1, 0.2, 0.6, 0.1];
    const mockEngine = new UniversalDiceEngine(() => mockVals[callIdx++ % mockVals.length]);

    const result = mockEngine.resolveCombat({
      attackDice: 2,
      defendDice: 2,
      isHeroDefending: true
    });

    assert.strictEqual(result.totalSkulls, 2);
    assert.strictEqual(result.effectiveShields, 1);
    assert.strictEqual(result.woundsInflicted, 1);
    assert.strictEqual(result.isBlocked, false);
  });
});
