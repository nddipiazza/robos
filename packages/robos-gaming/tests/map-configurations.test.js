'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HEROQUEST_CLASSIC_CONFIG,
  HEROQUEST_FIRST_LIGHT_CONFIG,
  getMapConfiguration,
  listMapConfigurations,
  registerMapConfiguration,
  BoardGrid
} = require('../index');

describe('RobOS Gaming: Multi-Map Configurations & Quest Grid', () => {
  it('retrieves default HeroQuest Classic Side A configuration', () => {
    const config = getMapConfiguration('heroquest-classic');
    assert.equal(config.id, 'heroquest-classic');
    assert.equal(config.boardSide, 'A');
    assert.deepEqual(config.gridDimensions, [26, 19]);
    assert.equal(config.rooms.length, 17);
    assert.ok(config.calibration.insetLeft > 0);
  });

  it('retrieves HeroQuest First Light Caverns Side B configuration', () => {
    const config = getMapConfiguration('first-light-caverns');
    assert.equal(config.id, 'first-light-caverns');
    assert.equal(config.boardSide, 'B');
    assert.deepEqual(config.gridDimensions, [26, 19]);
    assert.ok(config.rooms.some(r => r.id === 'cavern-center'));
  });

  it('allows registering custom map configurations', () => {
    const custom = {
      id: 'custom-arena-12x12',
      title: 'Gladiator Arena',
      gridDimensions: [12, 12],
      rooms: [
        { id: 'pit', name: 'Fighting Pit', x: 2, y: 2, w: 8, h: 8 }
      ],
      doors: []
    };
    registerMapConfiguration(custom);
    assert.equal(getMapConfiguration('custom-arena-12x12').title, 'Gladiator Arena');
    assert.ok(listMapConfigurations().some(c => c.id === 'custom-arena-12x12'));
  });

  it('builds BoardGrid from MapConfiguration with wall blocks and traps', () => {
    const config = getMapConfiguration('heroquest-classic');
    const quest = {
      wallBlocks: [
        { x: 3, y: 0, type: 'stone-block' }
      ],
      traps: [
        { x: 5, y: 0, trapType: 'pit', damageDice: 1 }
      ]
    };

    const grid = BoardGrid.fromMapConfiguration(config, quest);
    assert.equal(grid.width, 26);
    assert.equal(grid.height, 19);
    assert.ok(grid.hasWallBlock(3, 0));
    assert.ok(grid.isBlocked(3, 0));
    assert.ok(grid.hasTrap(5, 0));
    assert.equal(grid.getTrap(5, 0).trapType, 'pit');
  });
});
