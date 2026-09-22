'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { CRPGGameBuilder } = require('../lib/builder');
const { FLARE_CREATURE_SPRITES, FLARE_TILESETS, FLARE_ICONS } = require('../lib/flare-asset-catalog');
const { SRD_CLASSES, SRD_SPELLS, SRD_MONSTERS, SRD_EQUIPMENT, calcModifier } = require('../lib/srd-data');

test('Flare RPG Asset Catalog contains 8-directional animated creatures', () => {
  assert.ok(FLARE_CREATURE_SPRITES.skeleton, 'Skeleton sprite missing');
  assert.equal(FLARE_CREATURE_SPRITES.skeleton.directions, 8);
  assert.ok(FLARE_CREATURE_SPRITES.skeleton.animations.walk);
  assert.ok(FLARE_CREATURE_SPRITES.skeleton.animations.attack);
  assert.ok(FLARE_CREATURE_SPRITES.skeleton.animations.die);

  assert.ok(FLARE_TILESETS.dungeon_stone, 'Dungeon stone tileset missing');
  assert.equal(FLARE_TILESETS.dungeon_stone.isoProjection, true);
  assert.ok(FLARE_ICONS.weapons.longsword, 'Longsword icon missing');
});

test('D&D 5e SRD rules data contains valid stats and modifiers', () => {
  assert.equal(calcModifier(10), 0);
  assert.equal(calcModifier(14), 2);
  assert.equal(calcModifier(18), 4);
  assert.equal(calcModifier(8), -1);

  const fighter = SRD_CLASSES.find(c => c.id === 'fighter');
  assert.ok(fighter);
  assert.equal(fighter.hitDie, 'd10');

  const magicMissile = SRD_SPELLS.find(s => s.id === 'magic_missile');
  assert.ok(magicMissile);
  assert.equal(magicMissile.autoHit, true);
  assert.equal(magicMissile.damageType, 'force');
});

test('CRPGGameBuilder validates graph and builds engine artifacts', () => {
  const tmpTarget = path.join(__dirname, 'tmp-build');
  const builder = new CRPGGameBuilder({ targetDir: tmpTarget });
  const result = builder.build();

  assert.equal(result.success, true);
  assert.ok(result.nodesEvaluated >= 20);

  assert.ok(fs.existsSync(path.join(tmpTarget, 'data/v1/game.json')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'data/v1/monsters.json')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'data/v1/npcs.json')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'data/v1/dialogue.json')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'data/v1/quests.json')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'src/generated/v1/MonsterData.gd')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'src/generated/v1/DataStoreV1.gd')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'scripts/GameState.gd')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'scenes/CharacterSelect.tscn')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'scenes/Homestead.tscn')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'scenes/VillageSquare.tscn')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'scenes/GarrisonKeep.tscn')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'scenes/VictoryScreen.tscn')));
  assert.ok(fs.existsSync(path.join(tmpTarget, 'project.godot')));

  // Cleanup tmp dir
  fs.rmSync(tmpTarget, { recursive: true, force: true });
});
