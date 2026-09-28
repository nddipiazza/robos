'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { CRPGMapNavigator } = require('../lib/map-navigator');
const { CRPG_SHACL_SHAPES } = require('../lib/crpg-ontology');

const campaignsDir = path.resolve(__dirname, '../../../games/crpg-realm/campaigns');
const mapsDir = path.resolve(__dirname, '../../../games/crpg-realm/maps');

const campaign = JSON.parse(fs.readFileSync(path.join(campaignsDir, 'rescue-the-princess.jsonld'), 'utf8'));
const navigator = new CRPGMapNavigator({ mapsDir });

test('Rescue the Princess: Starting Map & Spawn Resolution', () => {
  const start = navigator.getStartingMap(campaign);
  assert.equal(start.mapSlug, 'throne-room');
  assert.equal(start.title, 'Royal Throne Room');
  assert.deepEqual(start.spawn, [25, 20]);
  assert.equal(start.facing, 'north');
  assert.ok(start.entryDescription.includes('King Alden'));
  assert.ok(start.width >= 50 && start.height >= 40);
});

test('Rescue the Princess: Map Connectivity Chain (Throne -> Castle -> World -> Lair)', () => {
  // 1. Throne Room -> Main Castle
  const throneExits = navigator.getConnectedMaps(campaign, 'throne-room');
  const castleExit = throneExits.find(e => e.toMap === 'main-castle');
  assert.ok(castleExit, 'Throne Room must have an exit leading to main-castle');
  assert.deepEqual(castleExit.toSpawn, [25, 8]);
  assert.equal(castleExit.transitionType, 'door');

  // 2. Main Castle -> World Overworld (Gated by Hero's Sword flag)
  const castleExits = navigator.getConnectedMaps(campaign, 'main-castle');
  const worldExit = castleExits.find(e => e.toMap === 'world-overworld');
  assert.ok(worldExit, 'Main Castle must have an exit leading to world-overworld');
  assert.equal(worldExit.requiredFlag, 'obtained_heros_sword');
  assert.deepEqual(worldExit.toSpawn, [15, 20]);

  // 3. World Overworld -> Dark Lord's Lair
  const worldExits = navigator.getConnectedMaps(campaign, 'world-overworld');
  const lairExit = worldExits.find(e => e.toMap === 'dark-lord-lair');
  assert.ok(lairExit, 'World Overworld must have an exit leading to dark-lord-lair');
  assert.deepEqual(lairExit.toSpawn, [12, 25]);

  // 4. Dark Lord's Lair -> World Overworld
  const lairExits = navigator.getConnectedMaps(campaign, 'dark-lord-lair');
  const returnWorldExit = lairExits.find(e => e.toMap === 'world-overworld');
  assert.ok(returnWorldExit, 'Dark Lord Lair must have an exit portal back to world-overworld');
});

test('Rescue the Princess: Gated Castle Gate Traversal', () => {
  const gameState = { currentScene: 'main-castle', partyPosition: [10, 10], facing: 'south' };

  // Attempt traversal without flag
  const blocked = navigator.traverse(campaign, gameState, 'castle-world-gate', [], {
    obtained_heros_sword: false
  });
  assert.equal(blocked.success, false);
  assert.equal(blocked.reason, 'locked_missing_flag');
  assert.equal(blocked.requiredFlag, 'obtained_heros_sword');

  // Traversal with Hero's Sword flag
  const allowed = navigator.traverse(campaign, gameState, 'castle-world-gate', ['heros-sword'], {
    obtained_heros_sword: true
  });
  assert.equal(allowed.success, true);
  assert.equal(allowed.currentScene, 'world-overworld');
  assert.deepEqual(allowed.partyPosition, [15, 20]);
});

test('Rescue the Princess: Story Flow Topological Progression & Win Condition', () => {
  const story = campaign['robos:storyFlow'];
  assert.ok(story, 'Story flow must exist');
  assert.equal(story['robos:rootNodeId'], 'node-kings-plea');

  const nodes = story['robos:storyNodes'];
  assert.equal(nodes.length, 6, 'Must contain 6 story nodes');

  const startNode = nodes.find(n => n.id === 'node-kings-plea');
  assert.equal(startNode['robos:nodeType'], 'game_start');
  assert.equal(startNode['robos:choices'][0].targetNodeId, 'node-dragonclaw-forge-trial');

  const trialNode = nodes.find(n => n.id === 'node-dragonclaw-forge-trial');
  assert.equal(trialNode['robos:choices'][0].targetNodeId, 'node-slay-projection-goblin');

  const combatNode = nodes.find(n => n.id === 'node-slay-projection-goblin');
  assert.equal(combatNode['robos:nodeType'], 'combat_trial');
  assert.equal(combatNode['robos:choices'][0].targetNodeId, 'node-journey-through-world');

  const journeyNode = nodes.find(n => n.id === 'node-journey-through-world');
  assert.equal(journeyNode['robos:choices'][0].targetNodeId, 'node-confront-dark-lord');

  const bossNode = nodes.find(n => n.id === 'node-confront-dark-lord');
  assert.equal(bossNode['robos:nodeType'], 'combat_trial');
  assert.equal(bossNode['robos:choices'][0].targetNodeId, 'node-triumphant-return');

  const victoryNode = nodes.find(n => n.id === 'node-triumphant-return');
  assert.equal(victoryNode['robos:nodeType'], 'end_game_state');
  assert.equal(victoryNode['robos:victoryStatus'], 'victory');
  assert.ok(victoryNode['robos:epilogueText'].includes('Dark Lord Malakor vanquished'));
});

test('Rescue the Princess: Skyrim Quest Journal Validation', () => {
  const questLog = campaign['robos:questLog'];
  assert.equal(questLog.length, 2);

  const mainQuest = questLog.find(q => q.id === 'quest-rescue-princess');
  assert.equal(mainQuest.type, 'main');
  assert.equal(mainQuest['robos:questObjectives'].length, 5);

  const sideQuest = questLog.find(q => q.id === 'quest-dragonclaw-trial');
  assert.equal(sideQuest.type, 'side');
  assert.equal(sideQuest['robos:questObjectives'].length, 3);
});
