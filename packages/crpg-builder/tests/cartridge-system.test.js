const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CartridgeBundler } = require('../lib/cartridge-bundler');

describe('Player Cartridge System Test Suite', () => {
  let bundler;

  before(() => {
    bundler = new CartridgeBundler();
  });

  test('CartridgeBundler: bundles rescue-the-princess into complete Player Cartridge', () => {
    const cartridge = bundler.bundle('rescue-the-princess');
    assert.ok(cartridge, 'Cartridge should not be null');
    assert.equal(cartridge.crpgCartridgeVersion, '1.0.0');
    assert.equal(cartridge.cartridgeId, 'rescue-the-princess');

    // Header validation
    const header = cartridge.header;
    assert.equal(header.title, 'Rescue of Princess Jennifer');
    assert.equal(header.startingMap, 'throne-room');
    assert.deepEqual(header.startingPosition, { x: 25, y: 20 });
    assert.equal(header.mapCount, 4);
    assert.equal(header.characterCount, 6);
    assert.equal(header.questCount, 2);

    // Maps inlined
    assert.ok(cartridge.maps['throne-room'], 'Must inline throne-room map');
    assert.ok(cartridge.maps['main-castle'], 'Must inline main-castle map');
    assert.ok(cartridge.maps['world-overworld'], 'Must inline world-overworld map');
    assert.ok(cartridge.maps['dark-lord-lair'], 'Must inline dark-lord-lair map');

    // Map objects present
    assert.ok(cartridge.maps['throne-room']['robos:mapObjects'].length > 0, 'Throne room mapObjects present');

    // Characters inlined
    assert.ok(cartridge.characters['hero-sir-caleb'], 'Must inline Sir Caleb hero');
    assert.ok(cartridge.characters['npc-king-alden'], 'Must inline King Alden');
    assert.ok(cartridge.characters['npc-blacksmith-torvald'], 'Must inline Blacksmith Torvald');
    assert.ok(cartridge.characters['boss-dark-lord-malakor'], 'Must inline Dark Lord Malakor');

    // Item inlined
    assert.ok(cartridge.items['heros-sword'], 'Must inline Hero\'s Sword');
    assert.equal(cartridge.items['heros-sword']['robos:damageDice'], '1d8');
    assert.equal(cartridge.items['heros-sword']['robos:cost'], 500);

    // Quests present
    assert.equal(cartridge.quests.length, 2);
    assert.equal(cartridge.quests[0].questType, 'main');
    assert.equal(cartridge.quests[1].questType, 'side');
  });

  test('CartridgeBundler: bundles dragonwarrior-1-usa cartridge with Tantegel Castle', () => {
    const cartridge = bundler.bundle('dragonwarrior-1-usa');
    assert.equal(cartridge.header.slug, 'dragonwarrior-1-usa');
    assert.ok(cartridge.maps['tantegel-throne-room'], 'Must inline Tantegel Throne Room');
    assert.ok(cartridge.characters['hero-of-alefgard'], 'Must inline Hero of Alefgard');
    assert.ok(cartridge.characters['npc-king-loric'], 'Must inline King Loric');
  });

  test('CartridgeBundler: saveCartridge writes valid JSON file', () => {
    const tmpOut = path.join(__dirname, 'tmp-test.cartridge.json');
    try {
      const { targetPath, cartridge } = bundler.saveCartridge('rescue-the-princess', tmpOut);
      assert.equal(targetPath, tmpOut);
      assert.ok(fs.existsSync(tmpOut));

      const parsed = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
      assert.equal(parsed.cartridgeId, 'rescue-the-princess');
      assert.equal(parsed.header.mapCount, 4);
    } finally {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }
  });
});
