'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { CRPGMapNavigator } = require('../lib/map-navigator');
const { CRPG_SHACL_SHAPES } = require('../lib/crpg-ontology');

// Load campaigns
const campaignsDir = path.resolve(__dirname, '../../../games/crpg-realm/campaigns');
const mapsDir = path.resolve(__dirname, '../../../games/crpg-realm/maps');

const dwCampaign = JSON.parse(fs.readFileSync(path.join(campaignsDir, 'dragonwarrior-1-usa.jsonld'), 'utf8'));
const ckCampaign = JSON.parse(fs.readFileSync(path.join(campaignsDir, 'candlekeep-prologue.jsonld'), 'utf8'));

const navigator = new CRPGMapNavigator({ mapsDir });

test('Scenario 1: What map appears first? — Resolves starting map and valid spawn coords', () => {
  // Test Dragon Warrior 1 starting map
  const dwStart = navigator.getStartingMap(dwCampaign);
  assert.equal(dwStart.mapSlug, 'tantegel-throne-room');
  assert.equal(dwStart.title, 'Tantegel Castle - Throne Room (2F)');
  assert.deepEqual(dwStart.spawn, [28, 14]);
  assert.equal(dwStart.facing, 'south');
  assert.ok(dwStart.entryDescription.includes('Erdrick'));
  assert.ok(dwStart.width >= 60 && dwStart.height >= 40);

  // Assert spawn is within map bounds
  assert.ok(dwStart.spawn[0] >= 0 && dwStart.spawn[0] <= dwStart.width);
  assert.ok(dwStart.spawn[1] >= 0 && dwStart.spawn[1] <= dwStart.height);

  // Test Candlekeep Prologue starting map
  const ckStart = navigator.getStartingMap(ckCampaign);
  assert.equal(ckStart.mapSlug, 'candlekeep');
  assert.deepEqual(ckStart.spawn, [270, 95]);
  assert.equal(ckStart.facing, 'south');
  assert.ok(ckStart.entryDescription.includes('Candlekeep'));
});

test('Scenario 2: What maps are connected to that map? — Discovers spatial transitions and lock states', () => {
  const connections = navigator.getConnectedMaps(dwCampaign, 'tantegel-throne-room');

  assert.ok(connections.length >= 2, `Expected at least 2 connections, found ${connections.length}`);

  // Connection 1: Stairs down to courtyard
  const stairsConn = connections.find(c => c.fromObjectId === 'stairs-down');
  assert.ok(stairsConn, 'stairs-down connection must exist');
  assert.equal(stairsConn.toMap, 'homestead-yard');
  assert.deepEqual(stairsConn.toSpawn, [10, 15]);
  assert.equal(stairsConn.transitionType, 'stairs');
  assert.equal(stairsConn.isLocked, false);

  // Connection 2: Royal locked door to catacombs
  const doorConn = connections.find(c => c.fromObjectId === 'royal-door');
  assert.ok(doorConn, 'royal-door connection must exist');
  assert.equal(doorConn.toMap, 'catacomb-antechamber');
  assert.deepEqual(doorConn.toSpawn, [20, 15]);
  assert.equal(doorConn.transitionType, 'door');
  assert.equal(doorConn.isLocked, true);
  assert.equal(doorConn.requiredKey, 'magic-key');
});

test('Scenario 3: Physical Traversal — Player walks through open stairs and can return', () => {
  const initialState = {
    currentScene: 'tantegel-throne-room',
    partyPosition: [28, 14],
    facing: 'south'
  };

  // Traverse down stairs to courtyard
  const resDown = navigator.traverse(dwCampaign, initialState, 'stairs-down');
  assert.equal(resDown.success, true);
  assert.equal(resDown.currentScene, 'homestead-yard');
  assert.deepEqual(resDown.partyPosition, [10, 15]);
  assert.equal(resDown.facing, 'south');
  assert.ok(resDown.message.includes('Descending'));

  // Now in homestead-yard, traverse back up through homestead_door
  const resUp = navigator.traverse(dwCampaign, resDown.gameState, 'homestead_door');
  assert.equal(resUp.success, true);
  assert.equal(resUp.currentScene, 'tantegel-throne-room');
  assert.deepEqual(resUp.partyPosition, [48, 25]);
  assert.equal(resUp.facing, 'north');
});

test('Scenario 4: Locked Door Enforcement — Gating without Magic Key and unlocking with Magic Key', () => {
  const initialState = {
    currentScene: 'tantegel-throne-room',
    partyPosition: [27, 34],
    facing: 'south'
  };

  // Attempt to enter royal door with empty inventory -> FAILS
  const resFail = navigator.traverse(dwCampaign, initialState, 'royal-door', []);
  assert.equal(resFail.success, false);
  assert.equal(resFail.reason, 'locked_missing_key');
  assert.equal(resFail.requiredKey, 'magic-key');
  assert.ok(resFail.message.includes('Magic Key'));

  // Player acquires Magic Key into inventory
  const inventoryWithKey = [{ slug: 'magic-key', name: 'Magic Key', quantity: 1 }];

  // Attempt to enter royal door with Magic Key -> SUCCEEDS
  const resSuccess = navigator.traverse(dwCampaign, initialState, 'royal-door', inventoryWithKey);
  assert.equal(resSuccess.success, true);
  assert.equal(resSuccess.currentScene, 'catacomb-antechamber');
  assert.deepEqual(resSuccess.partyPosition, [20, 15]);
  assert.equal(resSuccess.facing, 'south');
  assert.ok(resSuccess.message.includes('catacombs'));
});

test('Scenario 5: Action & Event Transport — Scripted and story-driven party relocation', () => {
  const currentGameState = {
    currentScene: 'candlekeep',
    partyPosition: [270, 95],
    facing: 'south',
    worldFlags: {}
  };

  // 5A. Event Transport via Infinity Engine BCS Script (evt-candlekeep-gate-departure)
  const departureEvent = {
    'robos:eventType': 'area_transition',
    'robos:transport': {
      targetMap: 'candlekeep-exterior',
      targetSpawn: [15, 20],
      targetFacing: 'south',
      cutscene: 'Cut01A',
      narration: 'Gorion guides you past the iron gates into the foggy night.'
    },
    'robos:stateDelta': {
      'robos:currentScene': 'candlekeep-exterior',
      'robos:partyPosition': [15, 20],
      'robos:facing': 'south',
      gate_unlocked: true,
      departed_candlekeep: true
    },
    'robos:infinityInteraction': {
      'robos:bcsAction': [
        'SetGlobal("gate_unlocked", "GLOBAL", 1)',
        'LeaveAreaLUA("candlekeep-exterior", "", [15, 20], 0)',
        'StartCutScene("Cut01A")'
      ]
    }
  };

  const transportRes = navigator.executeActionTransport(ckCampaign, currentGameState, departureEvent);
  assert.equal(transportRes.success, true);
  assert.equal(transportRes.currentScene, 'candlekeep-exterior');
  assert.deepEqual(transportRes.partyPosition, [15, 20]);
  assert.equal(transportRes.facing, 'south');
  assert.equal(transportRes.cutscene, 'Cut01A');
  assert.equal(transportRes.gameState['robos:worldFlags'].gate_unlocked, true);
  assert.equal(transportRes.gameState['robos:worldFlags'].departed_candlekeep, true);

  // 5B. Spell Action Transport (Casting "Return" or using "Wings of the Wyvern")
  const returnSpellAction = {
    transport: {
      targetMap: 'tantegel-throne-room',
      targetSpawn: [28, 14],
      targetFacing: 'south',
      narration: 'A divine vortex whisks the party instantly back to the throne of King Loric.'
    }
  };

  const returnRes = navigator.executeActionTransport(dwCampaign, transportRes.gameState, returnSpellAction);
  assert.equal(returnRes.success, true);
  assert.equal(returnRes.currentScene, 'tantegel-throne-room');
  assert.deepEqual(returnRes.partyPosition, [28, 14]);
  assert.equal(returnRes.facing, 'south');
  assert.ok(returnRes.narration.includes('King Loric'));
});

test('Scenario 6: Campaign Topology Graph Validation — Verifies bounds, reaches, and no broken links', () => {
  const dwTopology = navigator.validateTopology(dwCampaign);
  assert.equal(dwTopology.valid, true, `DW Topology errors: ${dwTopology.errors.join('; ')}`);
  assert.ok(dwTopology.mapCount >= 4);
  assert.ok(dwTopology.connectionCount >= 2);
  assert.ok(dwTopology.reachableMaps.includes('tantegel-throne-room'));
  assert.ok(dwTopology.reachableMaps.includes('homestead-yard'));
  assert.ok(dwTopology.reachableMaps.includes('catacomb-antechamber'));

  const ckTopology = navigator.validateTopology(ckCampaign);
  assert.equal(ckTopology.valid, true, `CK Topology errors: ${ckTopology.errors.join('; ')}`);
  assert.ok(ckTopology.mapCount >= 10);
  assert.ok(ckTopology.connectionCount >= 4);
  assert.ok(ckTopology.reachableMaps.includes('candlekeep'));
});

test('Scenario 7: SHACL Shape Compliance — Campaign and Map Transition Shapes', () => {
  const campaignShape = CRPG_SHACL_SHAPES.find(s => s.targetClass === 'robos:CRPGCampaign');
  assert.ok(campaignShape, 'CRPGCampaignShape must be defined in ontology');
  assert.equal(campaignShape.refersFrom, 'https://schema.org/CreativeWork');
  assert.ok(campaignShape.properties.some(p => p.path === 'robos:startingMap'));
  assert.ok(campaignShape.properties.some(p => p.path === 'robos:maps'));

  const transitionShape = CRPG_SHACL_SHAPES.find(s => s.targetClass === 'robos:CRPGMapTransition');
  assert.ok(transitionShape, 'CRPGMapTransitionShape must be defined in ontology');
  assert.ok(transitionShape.properties.some(p => p.path === 'robos:targetMap'));
  assert.ok(transitionShape.properties.some(p => p.path === 'robos:targetSpawn'));
});
