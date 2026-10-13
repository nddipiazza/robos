'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SkillIntentResolver,
  defaultIntentResolver,
  detectAmbientNoise,
  matchTabletopSkills,
  matchPlatformSkills
} = require('../../../voice-prompt/lib/skill-intent-resolver');

test('SkillIntentResolver: Ambient Noise Detection', async (t) => {
  await t.test('detects "(wind blowing)" as ambient noise', () => {
    const res = detectAmbientNoise('(wind blowing)');
    assert.strictEqual(res.isAmbient, true);
    assert.strictEqual(res.reason, 'wind blowing');
  });

  await t.test('detects bracketed and parenthetical acoustic cues', () => {
    assert.strictEqual(detectAmbientNoise('[wind blowing]').isAmbient, true);
    assert.strictEqual(detectAmbientNoise('(applause)').isAmbient, true);
    assert.strictEqual(detectAmbientNoise('(laughter)').isAmbient, true);
    assert.strictEqual(detectAmbientNoise('[coughing]').isAmbient, true);
    assert.strictEqual(detectAmbientNoise('(music)').isAmbient, true);
    assert.strictEqual(detectAmbientNoise('*sigh*').isAmbient, true);
    assert.strictEqual(detectAmbientNoise('um').isAmbient, true);
    assert.strictEqual(detectAmbientNoise('uh').isAmbient, true);
  });

  await t.test('does not classify command speech as ambient', () => {
    assert.strictEqual(detectAmbientNoise('add 2 skeletons to room 1').isAmbient, false);
    assert.strictEqual(detectAmbientNoise('Add one skeleton to room 2.').isAmbient, false);
    assert.strictEqual(detectAmbientNoise('open task explorer').isAmbient, false);
    assert.strictEqual(detectAmbientNoise('validate knowledge graph').isAmbient, false);
  });
});

test('SkillIntentResolver: Tabletop Quest Editor Skills', async (t) => {
  await t.test('resolves "add 2 skeletons to room 1"', () => {
    const skills = matchTabletopSkills('add 2 skeletons to room 1');
    assert.strictEqual(skills.length, 1);
    const s = skills[0];
    assert.strictEqual(s.id, 'tabletop:place-monster');
    assert.strictEqual(s.name, 'Place Monster');
    assert.strictEqual(s.title, 'Place 2 Skeletons in Room 1');
    assert.strictEqual(s.params.monster, 'skeleton');
    assert.strictEqual(s.params.count, 2);
    assert.strictEqual(s.params.room, '1');
    assert.ok(s.confidence >= 0.9);
  });

  await t.test('resolves "Add one skeleton to room 2."', () => {
    const skills = matchTabletopSkills('Add one skeleton to room 2.');
    assert.strictEqual(skills.length, 1);
    const s = skills[0];
    assert.strictEqual(s.id, 'tabletop:place-monster');
    assert.strictEqual(s.title, 'Place 1 Skeleton in Room 2');
    assert.strictEqual(s.params.monster, 'skeleton');
    assert.strictEqual(s.params.count, 1);
    assert.strictEqual(s.params.room, '2');
  });

  await t.test('resolves furniture and trap commands', () => {
    const furn = matchTabletopSkills('place a treasure chest in room 3');
    assert.strictEqual(furn.length, 1);
    assert.strictEqual(furn[0].id, 'tabletop:place-furniture');
    assert.strictEqual(furn[0].params.room, '3');

    const trap = matchTabletopSkills('put a spear trap in room 4');
    assert.strictEqual(trap.length, 1);
    assert.strictEqual(trap[0].id, 'tabletop:place-trap');
    assert.strictEqual(trap[0].params.room, '4');
  });
});

test('SkillIntentResolver: Full resolveLikelySkills Workflow', async (t) => {
  const resolver = new SkillIntentResolver();

  await t.test('evaluates "add 2 skeletons to room 1"', () => {
    const res = resolver.resolveLikelySkills('add 2 skeletons to room 1', {
      activeApp: 'tabletop-quest-editor'
    });
    assert.strictEqual(res.isAmbient, false);
    assert.strictEqual(res.likelySkills.length, 1);
    assert.strictEqual(res.likelySkills[0].id, 'tabletop:place-monster');
    assert.strictEqual(res.likelySkills[0].params.count, 2);
  });

  await t.test('evaluates "Add one skeleton to room 2."', () => {
    const res = resolver.resolveLikelySkills('Add one skeleton to room 2.', {
      activeApp: 'tabletop-quest-editor'
    });
    assert.strictEqual(res.isAmbient, false);
    assert.strictEqual(res.likelySkills.length, 1);
    assert.strictEqual(res.likelySkills[0].id, 'tabletop:place-monster');
    assert.strictEqual(res.likelySkills[0].params.count, 1);
    assert.strictEqual(res.likelySkills[0].params.room, '2');
  });

  await t.test('evaluates "(wind blowing)" as ambient with 0 likely skills', () => {
    const res = resolver.resolveLikelySkills('(wind blowing)', {
      activeApp: 'tabletop-quest-editor'
    });
    assert.strictEqual(res.isAmbient, true);
    assert.strictEqual(res.ambientReason, 'wind blowing');
    assert.strictEqual(res.likelySkills.length, 0);
  });

  await t.test('evaluates SDLC command "validate knowledge graph"', () => {
    const res = resolver.resolveLikelySkills('validate knowledge graph');
    assert.strictEqual(res.isAmbient, false);
    assert.strictEqual(res.likelySkills.length, 1);
    assert.strictEqual(res.likelySkills[0].id, 'kgraph-validate');
  });

  await t.test('evaluates SDLC command "open task explorer"', () => {
    const res = resolver.resolveLikelySkills('open task explorer');
    assert.strictEqual(res.isAmbient, false);
    assert.strictEqual(res.likelySkills.length, 1);
    assert.strictEqual(res.likelySkills[0].id, 'open-app');
    assert.strictEqual(res.likelySkills[0].params.target, 'task explorer');
  });

  await t.test('evaluates SDLC command "add a task to verify OAuth login"', () => {
    const res = resolver.resolveLikelySkills('add a task to verify OAuth login');
    assert.strictEqual(res.isAmbient, false);
    assert.strictEqual(res.likelySkills.length, 1);
    assert.strictEqual(res.likelySkills[0].id, 'add-task');
    assert.strictEqual(res.likelySkills[0].params.title, 'verify OAuth login');
  });
});

test('STTEngine: AI Bubble Stream Tracking & Multi-Bubble Resolution', async (t) => {
  const { STTEngine } = require('../../../voice-prompt/lib/stt-engine');
  const engine = new STTEngine();
  engine.setContext({ activeApp: 'tabletop-quest-editor', guidancePrompt: 'Tabletop Quest Map Editor' });

  const streamedBubbles = [];
  engine.on('bubble', (b) => {
    streamedBubbles.push(b);
  });

  await t.test('tracks Bubble 1: "add 2 skeletons to room 1" with timestamp, msg, and likely skills', () => {
    const b1 = engine.simulateStreamChunk('add 2 skeletons to room 1', true);
    assert.ok(b1.bubbleId, 'Bubble must have unique id');
    assert.ok(b1.timestamp, 'Bubble must have formatted timestamp');
    assert.ok(b1.isoTime, 'Bubble must have ISO time');
    assert.strictEqual(b1.msg, 'add 2 skeletons to room 1');
    assert.strictEqual(b1.isFinal, true);
    assert.strictEqual(b1.isAmbient, false);
    assert.strictEqual(b1.likelySkills.length, 1);
    assert.strictEqual(b1.likelySkills[0].id, 'tabletop:place-monster');
    assert.strictEqual(b1.likelySkills[0].params.monster, 'skeleton');
    assert.strictEqual(b1.likelySkills[0].params.count, 2);
    assert.strictEqual(b1.likelySkills[0].params.room, '1');
  });

  await t.test('tracks Bubble 2: "Add one skeleton to room 2." with timestamp, msg, and likely skills', () => {
    const b2 = engine.simulateStreamChunk('Add one skeleton to room 2.', true);
    assert.ok(b2.timestamp);
    assert.strictEqual(b2.msg, 'Add one skeleton to room 2.');
    assert.strictEqual(b2.isAmbient, false);
    assert.strictEqual(b2.likelySkills.length, 1);
    assert.strictEqual(b2.likelySkills[0].id, 'tabletop:place-monster');
    assert.strictEqual(b2.likelySkills[0].params.count, 1);
    assert.strictEqual(b2.likelySkills[0].params.room, '2');
  });

  await t.test('tracks Bubble 3: "(wind blowing)" as ambient noise with 0 likely skills', () => {
    const b3 = engine.simulateStreamChunk('(wind blowing)', true);
    assert.ok(b3.timestamp);
    assert.strictEqual(b3.msg, '(wind blowing)');
    assert.strictEqual(b3.isAmbient, true);
    assert.strictEqual(b3.ambientReason, 'wind blowing');
    assert.strictEqual(b3.likelySkills.length, 0);
  });

  await t.test('emitted 3 bubble stream events with tracking data', () => {
    assert.strictEqual(streamedBubbles.length, 3);
    assert.strictEqual(streamedBubbles[0].likelySkills[0].params.count, 2);
    assert.strictEqual(streamedBubbles[1].likelySkills[0].params.count, 1);
    assert.strictEqual(streamedBubbles[2].isAmbient, true);
  });
});

