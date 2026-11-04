'use strict';

// The rules of Ember Quest, with no drawing: keys go in, state comes out. The page
// draws this state, and the robot player reads it to check what really happened.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EmberEngine = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const STEPS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const MOSSLING_AT = { map: 'Emberfall Cave', x: 8, y: 9 };

  function createGame(data, { spawn } = {}) {
    const start = { ...data.start, ...(spawn || {}) };
    const state = {
      map: start.map, x: start.x, y: start.y, gold: data.startingGold, hp: 30, maxHp: 30, weapon: null,
      inventory: [], openedChests: [], defeated: [], mode: 'walk', menuIndex: 0, battle: null, message: `Welcome to ${start.map}.`, stepsTaken: 0,
    };
    const tileAt = (map, x, y) => {
      const row = data.maps[map].grid[y];
      return row && row[x] !== undefined ? data.tiles[row[x]] : null;
    };
    const enemy = name => data.enemies.find(e => e.name === name);
    const startBattle = (name) => {
      const foe = enemy(name);
      state.mode = 'battle';
      state.battle = { name: foe.name, hp: foe.hp, maxHp: foe.hp, attack: foe.attack, defense: foe.defense, boss: foe.boss };
      state.message = `${foe.name} attacks! Press Enter to strike.`;
    };
    const arrive = () => {
      const tile = tileAt(state.map, state.x, state.y);
      if (state.map === MOSSLING_AT.map && state.x === MOSSLING_AT.x && state.y === MOSSLING_AT.y && !state.defeated.includes('Mossling')) return startBattle('Mossling');
      if (tile.special === 'shop') { state.mode = 'shop'; state.menuIndex = 0; state.message = 'What will you buy? Press Escape to leave.'; }
      if (tile.special === 'chest') {
        const id = `${state.map}:${state.x},${state.y}`;
        const chest = data.chests.find(c => c.map === state.map && c.x === state.x && c.y === state.y);
        if (chest && !state.openedChests.includes(id)) {
          state.openedChests.push(id);
          const gold = chest.contents.match(/^(\d+) gold$/);
          if (gold) state.gold += Number(gold[1]);
          else state.inventory.push(chest.contents);
          state.message = `The chest held: ${chest.contents}.`;
        }
      }
      if (tile.special === 'cave') {
        state.map = 'Emberfall Cave'; state.x = 1; state.y = 10;
        state.message = 'You step into Emberfall Cave.';
      } else if (tile.special === 'town') {
        state.map = 'Ashford Town'; state.x = 13; state.y = 5;
        state.message = 'Back in the fresh air of Ashford Town.';
      } else if (tile.special === 'boss' && !state.defeated.includes('Cinder Wyrm')) startBattle('Cinder Wyrm');
    };
    const walk = (key) => {
      const [dx, dy] = STEPS[key];
      const tile = tileAt(state.map, state.x + dx, state.y + dy);
      if (!tile || !tile.walkable) { state.message = 'Something blocks the way.'; return; }
      state.x += dx; state.y += dy; state.stepsTaken++;
      arrive();
    };
    const buy = () => {
      const item = data.weapons[state.menuIndex];
      if (state.gold < item.price) { state.message = `Not enough gold for the ${item.name}.`; return; }
      state.gold -= item.price;
      state.weapon = item;
      state.message = `You bought the ${item.name} for ${item.price} gold.`;
    };
    const strike = () => {
      const { battle } = state;
      const damage = Math.max(1, (state.weapon ? state.weapon.damage : 1) + 2 - battle.defense);
      battle.hp = Math.max(0, battle.hp - damage);
      if (battle.hp === 0) {
        const foe = enemy(battle.name);
        state.gold += foe.gold;
        state.defeated.push(battle.name);
        state.mode = battle.boss ? 'won' : 'walk';
        state.message = battle.boss ? `The ${battle.name} falls. You saved Ashford Town!` : `You beat the ${battle.name} and found ${foe.gold} gold.`;
        state.battle = null;
        return;
      }
      state.hp = Math.max(0, state.hp - battle.attack);
      state.message = `You hit for ${damage}. The ${battle.name} hits back for ${battle.attack}.`;
      if (state.hp === 0) { state.mode = 'lost'; state.message = `The ${battle.name} was too strong.`; }
    };
    const press = (key) => {
      if (state.mode === 'walk' && STEPS[key]) walk(key);
      else if (state.mode === 'shop') {
        if (key === 'ArrowUp') state.menuIndex = (state.menuIndex + data.weapons.length - 1) % data.weapons.length;
        if (key === 'ArrowDown') state.menuIndex = (state.menuIndex + 1) % data.weapons.length;
        if (key === 'Enter') buy();
        if (key === 'Escape') { state.mode = 'walk'; state.message = 'Come again!'; }
      } else if (state.mode === 'battle' && key === 'Enter') strike();
      return state;
    };
    /** The keys that walk from where the hero stands to a tile, around anything that blocks the way. */
    const route = (toX, toY) => {
      const seen = new Set([`${state.x},${state.y}`]);
      const queue = [{ x: state.x, y: state.y, keys: [] }];
      while (queue.length) {
        const at = queue.shift();
        if (at.x === toX && at.y === toY) return at.keys;
        for (const [key, [dx, dy]] of Object.entries(STEPS)) {
          const x = at.x + dx;
          const y = at.y + dy;
          const tile = tileAt(state.map, x, y);
          const special = tile && tile.special && !(x === toX && y === toY);
          if (tile && tile.walkable && !special && !seen.has(`${x},${y}`)) {
            seen.add(`${x},${y}`);
            queue.push({ x, y, keys: [...at.keys, key] });
          }
        }
      }
      throw new Error(`No way to walk to (${toX}, ${toY}) on ${state.map}`);
    };
    return { data, state, press, route, tileAt };
  }

  return { createGame, MOSSLING_AT };
}));
