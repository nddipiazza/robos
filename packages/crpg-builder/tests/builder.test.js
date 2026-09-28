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

test('Skyrim-style side quests, faction quests, and misc tasks validate and serialize into quests.json', () => {
  const tmpTarget = path.join(__dirname, 'tmp-quest-build');
  const builder = new CRPGGameBuilder({ targetDir: tmpTarget });
  const result = builder.build();

  assert.equal(result.success, true);
  const questsFile = path.join(tmpTarget, 'data/v1/quests.json');
  assert.ok(fs.existsSync(questsFile));

  const quests = JSON.parse(fs.readFileSync(questsFile, 'utf8'));
  assert.ok(quests.length >= 4, 'Expected at least 4 quests');

  const mainQuest = quests.find(q => q.questType === 'main');
  assert.ok(mainQuest, 'Expected a main quest');
  assert.equal(mainQuest.id, 'night-without-memory');
  assert.ok(mainQuest.objectives.length > 0, 'Main quest should have objectives');

  const sideQuest = quests.find(q => q.questType === 'side');
  assert.ok(sideQuest, 'Expected a side quest');
  assert.equal(sideQuest.id, 'firebead-scroll');
  assert.equal(sideQuest.category, 'Candlekeep Side Quests');
  assert.equal(sideQuest.giver, 'Firebead Elfmirk');
  assert.ok(sideQuest.objectives.some(o => o.id === 'obj-fetch-scroll'));
  assert.ok(sideQuest.rewards.experience > 0);

  const factionQuest = quests.find(q => q.questType === 'faction');
  assert.ok(factionQuest, 'Expected a faction quest');
  assert.equal(factionQuest.category, 'Harpers Guild');

  const miscQuest = quests.find(q => q.questType === 'miscellaneous');
  assert.ok(miscQuest, 'Expected a miscellaneous quest');
  assert.equal(miscQuest.category, 'Miscellaneous Favors');

  fs.rmSync(tmpTarget, { recursive: true, force: true });
});

test('validateGraph rejects invalid quest types', () => {
  const builder = new CRPGGameBuilder({});
  const mockNodes = [
    {
      '@id': 'urn:robos:crpg:game:test',
      '@type': ['robos:CRPGGame'],
      'dcterms:title': 'Test Game',
      'robos:startingZone': 'urn:robos:crpg:zone:test'
    },
    {
      '@id': 'urn:robos:crpg:zone:test',
      '@type': ['robos:CRPGMapZone'],
      'dcterms:title': 'Test Zone'
    },
    {
      '@id': 'urn:robos:crpg:quest:invalid-type-quest',
      '@type': ['robos:CRPGQuest'],
      'dcterms:title': 'Invalid Quest',
      'robos:questType': 'alien-quest-type',
      'robos:questStages': [{ stage: 1, description: 'Step 1' }]
    }
  ];

  const validation = builder.validateGraph(mockNodes);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some(e => e.includes("invalid robos:questType 'alien-quest-type'")));
});
