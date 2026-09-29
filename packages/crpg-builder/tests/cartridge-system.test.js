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
    assert.ok(cartridge.characters['npc-king-loric'], 'Must inline King Loric');
    
    // 3D Model Miniature validation
    const hero = cartridge.characters['hero-of-alefgard'];
    assert.equal(hero.renderMode, '3d_model');
    assert.ok(hero.modelAssetRef.includes('character_knight_pawn.glb'), 'Hero must have 3D Knight pawn model');
    assert.equal(hero.modelType, 'knight');

    const king = cartridge.characters['npc-king-loric'];
    assert.equal(king.renderMode, '3d_model');
    assert.ok(king.modelAssetRef.includes('character_king_pawn.glb'), 'King must have 3D King pawn model');
    assert.equal(king.modelType, 'king');

    const dragon = cartridge.characters['dragonlord'];
    assert.equal(dragon.renderMode, '3d_model');
    assert.ok(dragon.modelAssetRef.includes('monster_dragon_pawn.glb'), 'Dragonlord must have 3D Dragon pawn model');
    assert.ok(dragon.modelScale >= 1.4, 'Dragonlord boss scale must be enlarged');
  });

  test('CartridgeBundler: bundles 3D models for spells, monsters, weapons, and armor', () => {
    const cartridge = bundler.bundle('dragonwarrior-1-usa');
    assert.ok(cartridge.spells, 'Cartridge must contain bundled spells dictionary');
    assert.ok(cartridge.header.spellCount > 0, 'Header must track spellCount');

    // 1. Spells 3D VFX validation
    const fireball = cartridge.spells['fireball'];
    assert.ok(fireball, 'Fireball spell must be bundled');
    assert.ok(fireball.modelAssetRef.includes('spell_fireball_projectile.glb'), 'Fireball must have 3D projectile model');
    assert.equal(fireball.vfxType, 'projectile');

    const magicMissile = cartridge.spells['magic-missile'];
    assert.ok(magicMissile, 'Magic missile spell must be bundled');
    assert.ok(magicMissile.modelAssetRef.includes('spell_magic_missile_orb.glb'), 'Magic missile must have 3D orb model');

    const cureWounds = cartridge.spells['cure-wounds'];
    assert.ok(cureWounds, 'Cure wounds spell must be bundled');
    assert.ok(cureWounds.modelAssetRef.includes('spell_healing_glyph.glb'), 'Cure wounds must have 3D healing glyph model');
    assert.equal(cureWounds.vfxType, 'aura');

    // 2. Weapons 3D Model validation
    const heroSword = cartridge.items['heros-sword'];
    assert.ok(heroSword, 'Hero\'s Sword must be bundled');
    assert.ok(heroSword.modelAssetRef.includes('weapon_sword_hero.glb'), 'Hero sword must have 3D weapon model');
    assert.equal(heroSword.modelSocket, 'main_hand');

    const copperSword = cartridge.items['copper-sword'];
    assert.ok(copperSword, 'Copper sword must be bundled');
    assert.ok(copperSword.modelAssetRef.includes('weapon_sword_iron.glb'), 'Copper sword must have 3D weapon model');

    const club = cartridge.items['club'];
    assert.ok(club, 'Club must be bundled');
    assert.ok(club.modelAssetRef.includes('weapon_club_wood.glb'), 'Club must have 3D weapon model');

    const bamboo = cartridge.items['bamboo-pole'];
    assert.ok(bamboo, 'Bamboo pole must be bundled');
    assert.ok(bamboo.modelAssetRef.includes('weapon_bamboo_pole.glb'), 'Bamboo pole must have 3D weapon model');

    // 3. Armor 3D Model validation
    const leatherArmor = cartridge.items['leather-armor'];
    assert.ok(leatherArmor, 'Leather armor must be bundled');
    assert.ok(leatherArmor.modelAssetRef.includes('armor_suit_leather.glb'), 'Leather armor must have 3D armor model');
    assert.equal(leatherArmor.modelSocket, 'armor');

    // 4. Monsters 3D Model validation
    assert.ok(cartridge.enemies, 'Cartridge must contain bundled enemies');
    const skeleton = cartridge.enemies['skeleton-archer'];
    assert.ok(skeleton, 'Skeleton archer must be bundled');
    assert.ok(skeleton.modelAssetRef.includes('monster_skeleton_pawn.glb'), 'Skeleton must have skeleton pawn model');

    const minotaur = cartridge.enemies['minotaur-marauder'];
    assert.ok(minotaur, 'Minotaur marauder must be bundled');
    assert.ok(minotaur.modelAssetRef.includes('monster_minotaur_pawn.glb'), 'Minotaur must have minotaur pawn model');
    assert.ok(minotaur.modelScale >= 1.3, 'Minotaur must have brute scale');

    const hound = cartridge.enemies['corrupted-hound'];
    assert.ok(hound, 'Corrupted hound must be bundled');
    assert.ok(hound.modelAssetRef.includes('monster_hound_pawn.glb'), 'Hound must have hound pawn model');

    const skirmisher = cartridge.enemies['feral-guard-skirmisher'];
    assert.ok(skirmisher, 'Skirmisher must be bundled');
    assert.ok(skirmisher.modelAssetRef.includes('monster_skirmisher_pawn.glb'), 'Skirmisher must have skirmisher pawn model');
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

