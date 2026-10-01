'use strict';

/**
 * RobOS Gaming Subsystem: Universal Dice Subsystem
 * Supports standard polyhedral dice expressions (1d20+3, 2d6, 3d8) and
 * Tabletop Combat Dice (HeroQuest style: Skull, White Shield, Black Shield).
 */

const COMBAT_DICE_FACES = [
  'skull',        // Face 1: Attack hit
  'skull',        // Face 2: Attack hit
  'skull',        // Face 3: Attack hit (50% skull probability)
  'white_shield', // Face 4: Hero defense (33.3% probability)
  'white_shield', // Face 5: Hero defense
  'black_shield'  // Face 6: Monster defense (16.7% probability)
];

class UniversalDiceEngine {
  constructor(randomFn = Math.random) {
    this.random = randomFn;
  }

  /**
   * Roll a single dN (e.g. d6, d20).
   */
  rollDie(sides = 6) {
    return Math.floor(this.random() * sides) + 1;
  }

  /**
   * Parse and roll a polyhedral notation string: e.g. "2d6", "1d20+5", "3d8-2", "4d6kh3".
   */
  roll(notation = '1d6') {
    if (typeof notation === 'number') {
      return { total: notation, rolls: [notation], modifier: 0, notation: String(notation) };
    }

    const clean = String(notation).trim().toLowerCase();
    const match = clean.match(/^(\d+)?d(\d+)([+-]\d+)?$/);
    if (!match) {
      const numOnly = parseInt(clean, 10);
      if (!isNaN(numOnly)) {
        return { total: numOnly, rolls: [numOnly], modifier: 0, notation };
      }
      throw new Error(`Invalid dice notation: "${notation}"`);
    }

    const count = match[1] ? parseInt(match[1], 10) : 1;
    const sides = parseInt(match[2], 10);
    const mod = match[3] ? parseInt(match[3], 10) : 0;

    const rolls = [];
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const r = this.rollDie(sides);
      rolls.push(r);
      sum += r;
    }

    const total = sum + mod;
    return {
      total,
      rolls,
      sides,
      count,
      modifier: mod,
      notation
    };
  }

  /**
   * Roll a set of HeroQuest tabletop combat dice.
   * Standard die has 3 skulls, 2 white shields, 1 black shield.
   */
  rollCombatDice(numDice = 2) {
    const faces = [];
    let skulls = 0;
    let whiteShields = 0;
    let blackShields = 0;

    for (let i = 0; i < numDice; i++) {
      const idx = Math.floor(this.random() * 6);
      const face = COMBAT_DICE_FACES[idx];
      faces.push(face);
      if (face === 'skull') skulls++;
      else if (face === 'white_shield') whiteShields++;
      else if (face === 'black_shield') blackShields++;
    }

    return {
      diceCount: numDice,
      faces,
      skulls,
      whiteShields,
      blackShields
    };
  }

  /**
   * Resolve an attack vs defense roll in HeroQuest combat rules.
   * @param {Object} options
   * @param {number} options.attackDice Number of combat dice rolled by attacker
   * @param {number} options.defendDice Number of combat dice rolled by defender
   * @param {boolean} options.isHeroDefending If true, white shields block skulls; if false, black shields block.
   * @param {number} [options.bonusDamage=0] Guaranteed bonus skulls/damage
   */
  resolveCombat(options = {}) {
    const {
      attackDice = 2,
      defendDice = 2,
      isHeroDefending = false,
      bonusDamage = 0
    } = options;

    const attackResult = this.rollCombatDice(attackDice);
    const defendResult = this.rollCombatDice(defendDice);

    const totalSkulls = attackResult.skulls + bonusDamage;
    const effectiveShields = isHeroDefending ? defendResult.whiteShields : defendResult.blackShields;
    const woundsInflicted = Math.max(0, totalSkulls - effectiveShields);

    return {
      attack: attackResult,
      defense: defendResult,
      totalSkulls,
      effectiveShields,
      isHeroDefending,
      woundsInflicted,
      isBlocked: woundsInflicted === 0
    };
  }
}

module.exports = {
  COMBAT_DICE_FACES,
  UniversalDiceEngine,
  dice: new UniversalDiceEngine()
};
