const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  EQUIPMENT_3D_CATALOG,
  getEquipment3D,
  getAllEquipment3D,
  getEquipmentByCategory,
  resolveModelForItem
} = require('../lib/crpg-equipment-3d-catalog');

const { CartridgeBundler } = require('../lib/cartridge-bundler');

describe('RobOS cRPG 3D Equipment Catalog Test Suite', () => {
  const modelsDir = path.resolve(__dirname, '../../../games/crpg-realm/assets/models');

  it('defines a comprehensive catalog of 3D weapons, armor, shields, and helms', () => {
    const items = getAllEquipment3D();
    assert.ok(items.length >= 30, `Expected at least 30 equipment items, got ${items.length}`);

    const weapons = getEquipmentByCategory('weapon');
    const armors = getEquipmentByCategory('armor');
    const shields = getEquipmentByCategory('shield');
    const helms = getEquipmentByCategory('helmet');

    assert.ok(weapons.length >= 15, `Expected >= 15 weapons, got ${weapons.length}`);
    assert.ok(armors.length >= 8, `Expected >= 8 armors, got ${armors.length}`);
    assert.ok(shields.length >= 3, `Expected >= 3 shields, got ${shields.length}`);
    assert.ok(helms.length >= 2, `Expected >= 2 helmets, got ${helms.length}`);
  });

  it('every catalog item points to an existing .glb model file on disk', () => {
    const items = getAllEquipment3D();
    for (const item of items) {
      assert.ok(item.model3dAsset, `Item ${item.id} must have model3dAsset`);
      assert.ok(item.model3dAsset.startsWith('res://assets/models/'), `Item ${item.id} path must start with res://assets/models/`);
      assert.ok(item.model3dAsset.endsWith('.glb'), `Item ${item.id} model must be .glb`);

      const filename = path.basename(item.model3dAsset);
      const diskPath = path.join(modelsDir, filename);
      assert.ok(fs.existsSync(diskPath), `Model file for ${item.id} must exist at ${diskPath}`);

      const stats = fs.statSync(diskPath);
      assert.ok(stats.size > 500, `Model file ${filename} must have valid non-empty byte size, got ${stats.size} bytes`);
      // Assert it is ultra-compact (< 50 KB)
      assert.ok(stats.size < 60000, `Model file ${filename} should be compact (< 60KB), got ${stats.size} bytes`);
    }
  });

  it('every catalog item defines valid character rig socket and D&D mechanics', () => {
    const validSockets = new Set(['main_hand', 'off_hand', 'chest', 'armor', 'head']);
    for (const item of getAllEquipment3D()) {
      assert.ok(validSockets.has(item.model3dSocket), `Item ${item.id} has invalid socket: ${item.model3dSocket}`);
      assert.ok(item.model3dScale > 0.5 && item.model3dScale < 2.0, `Item ${item.id} scale out of bounds: ${item.model3dScale}`);
      assert.ok(item.cost >= 0, `Item ${item.id} must have non-negative cost`);
      assert.ok(item.weight >= 0, `Item ${item.id} must have non-negative weight`);

      if (item.category === 'weapon') {
        assert.ok(item.damageDice, `Weapon ${item.id} must have damageDice`);
        assert.ok(item.damageType, `Weapon ${item.id} must have damageType`);
      } else if (item.category === 'armor') {
        assert.ok(item.acBonus > 0, `Armor ${item.id} must have acBonus`);
      }
    }
  });

  it('getEquipment3D retrieves items by exact id, alias, or slug', () => {
    const longsword = getEquipment3D('longsword');
    assert.strictEqual(longsword.id, 'longsword');
    assert.strictEqual(longsword.model3dSocket, 'main_hand');

    const plate = getEquipment3D('plate-armor');
    assert.strictEqual(plate.id, 'plate-armor');
    assert.strictEqual(plate.model3dSocket, 'armor');

    const shield = getEquipment3D('shield-round');
    assert.strictEqual(shield.id, 'shield-round');
    assert.strictEqual(shield.model3dSocket, 'off_hand');

    const helm = getEquipment3D('helm-iron');
    assert.strictEqual(helm.id, 'helm-iron');
    assert.strictEqual(helm.model3dSocket, 'head');
  });

  it('resolveModelForItem matches both direct and heuristic queries', () => {
    const rapierMatch = resolveModelForItem({ id: 'duelist-rapier', title: 'Fine Rapier' });
    assert.ok(rapierMatch, 'Rapier should be resolved');
    assert.strictEqual(rapierMatch.model3dAsset, 'res://assets/models/weapon_rapier.glb');
    assert.strictEqual(rapierMatch.model3dSocket, 'main_hand');

    const greatswordMatch = resolveModelForItem({ id: 'iron-claymore', title: 'Two-Handed Claymore' });
    assert.ok(greatswordMatch, 'Claymore should resolve to greatsword');
    assert.strictEqual(greatswordMatch.model3dAsset, 'res://assets/models/weapon_greatsword.glb');

    const warhammerMatch = resolveModelForItem({ id: 'dwarf-maul', title: 'Dwarven Warhammer' });
    assert.ok(warhammerMatch, 'Warhammer should resolve');
    assert.strictEqual(warhammerMatch.model3dAsset, 'res://assets/models/weapon_warhammer.glb');

    const towerMatch = resolveModelForItem({ id: 'heavy-tower-shield', title: 'Legion Tower Shield' });
    assert.ok(towerMatch, 'Tower shield should resolve');
    assert.strictEqual(towerMatch.model3dAsset, 'res://assets/models/armor_shield_tower.glb');
  });

  it('data/v1/items.json items with 3D model references all point to existing files', () => {
    const itemsPath = path.resolve(__dirname, '../../../games/crpg-realm/data/v1/items.json');
    const items = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));

    const itemsWith3D = items.filter(it => it.model3dAsset);
    assert.ok(itemsWith3D.length >= 30, `Expected >= 30 items with 3D models in items.json, got ${itemsWith3D.length}`);

    for (const item of itemsWith3D) {
      const filename = path.basename(item.model3dAsset);
      const diskPath = path.join(modelsDir, filename);
      assert.ok(fs.existsSync(diskPath), `Model file for ${item.id} must exist at ${diskPath}`);
    }
  });

  it('CartridgeBundler automatically bundles 3D equipment models into cartridges', () => {
    const bundler = new CartridgeBundler();
    const cartridge = bundler.bundle('rescue-the-princess');

    assert.ok(cartridge.items, 'Cartridge must contain items array/dict');
    const weapons = Object.values(cartridge.items).filter(it => (it['robos:itemCategory'] || it.category) === 'weapon');
    for (const w of weapons) {
      assert.ok(w['robos:modelAssetRef'] || w.model3dAsset, `Weapon ${w.id} must have 3D model ref in cartridge`);
    }
  });
});
