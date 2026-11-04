'use strict';

// A robot player for Ember Quest. It reads plain-English steps from a .feature file,
// presses the same keys a person would, and checks the game's state after each step.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EmberRobot = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const WHERE = {
    'the weapon shop': { map: 'Ashford Town', x: 3, y: 3 },
    'the town chest': { map: 'Ashford Town', x: 12, y: 3 },
    'Emberfall Cave': { map: 'Ashford Town', x: 14, y: 5 },
    'the Mossling': { map: 'Emberfall Cave', x: 8, y: 9 },
    'the altar': { map: 'Emberfall Cave', x: 12, y: 4 },
  };

  function expectEqual(actual, expected, what) {
    if (actual !== expected) throw new Error(`Expected ${what} to be ${JSON.stringify(expected)} but it is ${JSON.stringify(actual)}`);
  }

  const STEP_DEFINITIONS = [
    [/^a new game has started in (.+)$/, ({ game }, map) => expectEqual(game.state.map, map, 'the map')],
    [/^the hero has (\d+) gold$/, ({ game }, gold) => expectEqual(game.state.gold, Number(gold), 'the gold')],
    [/^the hero walks to (.+)$/, async ({ game, press }, place) => {
      const to = WHERE[place];
      if (!to) throw new Error(`The robot does not know where ${place} is`);
      expectEqual(game.state.map, to.map, 'the map');
      for (const key of game.route(to.x, to.y)) await press(key);
    }],
    [/^the hero buys the "(.+)"$/, async ({ game, press }, name) => {
      const index = game.data.weapons.findIndex(w => w.name === name);
      expectEqual(game.state.mode, 'shop', 'the screen');
      for (let i = 0; i < index; i++) await press('ArrowDown');
      await press('Enter');
      await press('Escape');
    }],
    [/^the hero carries the "(.+)"$/, ({ game }, name) => {
      const carried = [...game.state.inventory, game.state.weapon && game.state.weapon.name];
      if (!carried.includes(name)) throw new Error(`The hero carries ${JSON.stringify(carried)}, not "${name}"`);
    }],
    [/^the current map is (.+)$/, ({ game }, map) => expectEqual(game.state.map, map, 'the map')],
    [/^the hero fights until the battle ends$/, async ({ game, press }) => {
      expectEqual(game.state.mode, 'battle', 'the screen');
      while (game.state.mode === 'battle') await press('Enter');
    }],
    [/^"(.+)" has been defeated$/, ({ game }, name) => {
      if (!game.state.defeated.includes(name)) throw new Error(`${name} is still standing`);
    }],
    [/^the game shows the victory screen$/, ({ game }) => expectEqual(game.state.mode, 'won', 'the screen')],
  ];

  function parseFeature(text) {
    const scenarios = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      const scenario = line.match(/^Scenario:\s*(.+)$/);
      if (scenario) scenarios.push({ name: scenario[1], steps: [] });
      else if (/^(Given|When|Then|And)\s/.test(line) && scenarios.length) scenarios[scenarios.length - 1].steps.push(line);
    }
    return scenarios;
  }

  async function run(text, { game, press, onStep = () => {} }) {
    const results = [];
    for (const scenario of parseFeature(text)) {
      for (const line of scenario.steps) {
        const sentence = line.replace(/^(Given|When|Then|And)\s+/, '');
        const definition = STEP_DEFINITIONS.find(([re]) => re.test(sentence));
        onStep({ line, status: 'running' });
        try {
          if (!definition) throw new Error('The robot has no instructions for this sentence');
          await definition[1]({ game, press }, ...sentence.match(definition[0]).slice(1));
          results.push({ line, status: 'passed' });
          onStep({ line, status: 'passed' });
        } catch (e) {
          results.push({ line, status: 'failed', error: e.message });
          onStep({ line, status: 'failed', error: e.message });
          return results;
        }
      }
    }
    return results;
  }

  return { parseFeature, run };
}));
