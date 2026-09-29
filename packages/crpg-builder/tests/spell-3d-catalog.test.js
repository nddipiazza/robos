'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  SPELL_3D_CATALOG,
  getSpell3D,
  getAllSpells3D,
  getSpellsByDeliveryType,
  resolveSpellVFX
} = require('../lib/crpg-spell-3d-catalog');

const MODELS_DIR = path.resolve(__dirname, '../../../games/crpg-realm/assets/models');

test('3D Spell Catalog: Structure and Integrity', async (t) => {
  await t.test('catalog contains canonical spells across 5 delivery types', () => {
    const spells = getAllSpells3D();
    assert.ok(spells.length >= 10, 'Expected at least 10 spells in catalog');

    const deliveryTypes = new Set(spells.map(s => s.deliveryType));
    assert.ok(deliveryTypes.has('projectile'), 'Missing projectile delivery type');
    assert.ok(deliveryTypes.has('burst'), 'Missing burst delivery type');
    assert.ok(deliveryTypes.has('aura'), 'Missing aura delivery type');
    assert.ok(deliveryTypes.has('beam'), 'Missing beam delivery type');
    assert.ok(deliveryTypes.has('barrier'), 'Missing barrier delivery type');
  });

  await t.test('all referenced model3dAsset files exist on disk in games/crpg-realm/assets/models', () => {
    const spells = getAllSpells3D();
    for (const s of spells) {
      const p = s.model3dAsset.replace('res://assets/models/', '');
      const fullPath = path.join(MODELS_DIR, p);
      assert.ok(
        fs.existsSync(fullPath),
        `Referenced model3dAsset file missing on disk for spell "${s.id}": ${fullPath}`
      );

      if (s.burst3dAsset) {
        const bp = s.burst3dAsset.replace('res://assets/models/', '');
        const burstFullPath = path.join(MODELS_DIR, bp);
        assert.ok(
          fs.existsSync(burstFullPath),
          `Referenced burst3dAsset file missing on disk for spell "${s.id}": ${burstFullPath}`
        );
      }
    }
  });

  await t.test('getSpell3D supports exact ids and aliases', () => {
    const fb = getSpell3D('fireball');
    assert.ok(fb);
    assert.equal(fb.id, 'fireball');
    assert.equal(fb.deliveryType, 'projectile');

    const fbExp = getSpell3D('fireball-explosion');
    assert.ok(fbExp);
    assert.equal(fbExp.deliveryType, 'burst');

    const aliasFb = getSpell3D('fireball_spell');
    assert.ok(aliasFb);
    assert.equal(aliasFb.id, 'fireball');

    const aliasDispel = getSpell3D('dispel_magic');
    assert.ok(aliasDispel);
    assert.equal(aliasDispel.id, 'dispel-magic');
  });

  await t.test('getSpellsByDeliveryType filters properly', () => {
    const projectiles = getSpellsByDeliveryType('projectile');
    assert.ok(projectiles.length >= 3);
    assert.ok(projectiles.some(s => s.id === 'fireball'));

    const bursts = getSpellsByDeliveryType('burst');
    assert.ok(bursts.length >= 2);
    assert.ok(bursts.some(s => s.id === 'fireball-explosion'));
  });

  await t.test('resolveSpellVFX infers matching spell effect for custom/unregistered spells', () => {
    const ice = resolveSpellVFX({ name: 'Ice Lance', damageType: 'cold' });
    assert.ok(ice);
    assert.equal(ice.id, 'frost-shard');

    const fire = resolveSpellVFX({ name: 'Inferno Pyre', damageType: 'fire' });
    assert.ok(fire);
    assert.equal(fire.id, 'fireball');

    const water = resolveSpellVFX({ name: 'Geyser', damageType: 'water' });
    assert.ok(water);
    assert.equal(water.id, 'water-splash');

    const dispel = resolveSpellVFX({ name: 'Nullify Arcana', school: 'Abjuration' });
    assert.ok(dispel);
    assert.equal(dispel.id, 'dispel-magic');
  });
});
