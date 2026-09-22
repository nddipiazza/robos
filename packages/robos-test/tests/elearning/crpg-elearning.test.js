'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { SDLCKnowledgeGraphStore } = require('../../../robos-graph/lib/graph-store');

const rootRepo = path.resolve(__dirname, '../../../../');
const graphFile = path.join(rootRepo, '.robos', 'knowledge-graph.jsonld');

describe('Tactical cRPG Knowledge Graph eLearning Course Tests', () => {
  const store = new SDLCKnowledgeGraphStore({
    filePath: graphFile,
    rootDir: path.join(rootRepo, '.robos'),
  });

  let issuedCertId = null;

  after(() => {
    if (issuedCertId) {
      try {
        store.deleteNode(issuedCertId);
      } catch {}
    }
  });

  it('Course node exists in Knowledge Graph store with correct metadata', () => {
    const course = store.findELearning('robos-crpg');
    assert.ok(course, 'Course robos-crpg should be found in store');
    assert.strictEqual(course['@id'], 'urn:robos:elearning:course:robos-crpg');
    assert.ok(course['dcterms:title'].includes('Tactical cRPG Architecture'));
    assert.strictEqual(course['robos:topic'], 'Tactical cRPG & Infinity Engine Architecture');
    assert.strictEqual(course['robos:difficulty'], 'Advanced');
    assert.strictEqual(course['robos:targetApplication'], 'urn:robos:crpg:game:realm-of-heroes');
    assert.strictEqual(course['robos:engineArchitecture'], 'urn:robos:infinity:engine:gemrb-infinity');
    assert.strictEqual(course['robos:modulesCount'], 5);
  });

  it('cRPG PCGame node links back to the eLearning course via robos:hasELearning', () => {
    const gameNode = store.getNode('urn:robos:crpg:game:realm-of-heroes');
    assert.ok(gameNode, 'Game node should exist in Knowledge Graph');
    assert.ok(Array.isArray(gameNode['robos:hasELearning']), 'hasELearning must be an array');
    assert.ok(
      gameNode['robos:hasELearning'].includes('urn:robos:elearning:course:robos-crpg'),
      'Game node must link to robos-crpg course'
    );
  });

  it('Course contains all 5 nerd-tailored modules with labs and quizzes', () => {
    const course = store.findELearning('robos-crpg');
    const modules = course['robos:modules'];
    assert.strictEqual(modules.length, 5, 'Must contain exactly 5 modules');

    // Module 1: D&D 5e Ruleset
    const m1 = modules[0];
    assert.strictEqual(m1.id, 'mod-01-dnd5e-rules');
    assert.ok(m1.title.includes('D&D 5e Ruleset'));
    assert.ok(m1.overview.includes('d20 attack rolls vs AC'));
    assert.ok(m1.labSteps.length >= 3);
    assert.ok(m1.quiz.length >= 3);
    const dcQ = m1.quiz.find(q => q.question.includes('Spell Save DC'));
    assert.ok(dcQ);
    assert.strictEqual(dcQ.answer, '8 + Proficiency Bonus + Spellcasting Ability Modifier');

    // Module 2: Godot Engine
    const m2 = modules[1];
    assert.strictEqual(m2.id, 'mod-02-godot-engine');
    assert.ok(m2.overview.includes('GL Compatibility'));
    assert.ok(m2.overview.includes('2560x1440'));
    assert.ok(m2.labSteps.some(s => s.includes('Pathfinder.gd')));
    const glQ = m2.quiz.find(q => q.question.includes('GL Compatibility'));
    assert.ok(glQ);
    assert.ok(glQ.answer.includes('Xvfb'));

    // Module 3: Open-Source Assets & Infinity HUD
    const m3 = modules[2];
    assert.strictEqual(m3.id, 'mod-03-assets-and-hud');
    assert.ok(m3.overview.includes('Flare RPG'));
    assert.ok(m3.overview.includes('3-mode expandable Activity Log'));
    const logQ = m3.quiz.find(q => q.question.includes('Activity Log'));
    assert.ok(logQ);
    assert.ok(logQ.answer.includes('Small (124px combat), Medium (240px dialogue), Large (420px'));

    // Module 4: Autonomous Infinity AI Agent
    const m4 = modules[3];
    assert.strictEqual(m4.id, 'mod-04-infinity-ai-agent');
    assert.ok(m4.overview.includes('140px spatial threat radar'));
    assert.ok(m4.overview.includes('combined-arms tactics'));
    const radarQ = m4.quiz.find(q => q.question.includes('threat radar'));
    assert.ok(radarQ);
    assert.ok(radarQ.answer.includes('140px proximity trigger'));

    // Module 5: Knowledge Graph Architecture
    const m5 = modules[4];
    assert.strictEqual(m5.id, 'mod-05-kgraph-architecture');
    assert.ok(m5.overview.includes('W3C SHACL shape validation'));
    assert.ok(m5.labSteps.some(s => s.includes('crpg-builder.js validate')));
    const typeQ = m5.quiz.find(q => q.question.includes('DataStoreV1.gd'));
    assert.ok(typeQ);
    assert.ok(typeQ.answer.includes('static type safety'));
  });

  it('Verifiable Certificate of Completion can be issued for robos-crpg', () => {
    const cert = store.issueCertificateOfCompletion({
      courseId: 'urn:robos:elearning:course:robos-crpg',
      appId: 'urn:robos:crpg:game:realm-of-heroes',
      userId: 'dungeon-master-robos',
      scorePercentage: 100,
    });

    assert.ok(cert);
    assert.strictEqual(cert.ok, true);
    assert.ok(cert.certificate);
    issuedCertId = cert.certificate['@id'];
    assert.strictEqual(cert.certificate['robos:recipientUser'], 'dungeon-master-robos');
    assert.strictEqual(cert.certificate['robos:scorePercentage'], 100);
    assert.ok(cert.certificate['robos:verificationHash'].startsWith('ROBOS-CERT-'));
  });

  it('Living documentation page and diagrams exist with verified screenshot assets', () => {
    const docPath = path.resolve(rootRepo, 'docs/projects/crpg-realm/elearning-masterclass.md');
    assert.ok(fs.existsSync(docPath), 'elearning-masterclass.md must exist');
    const content = fs.readFileSync(docPath, 'utf8');

    // Verify key nerd topics are documented in depth
    assert.ok(content.includes('Mathematical Combat Formulas'));
    assert.ok(content.includes('Godot 4.3 GL Compatibility'));
    assert.ok(content.includes('StaticBody2D Colliders (Layer 1 Physical Buildings)'));
    assert.ok(content.includes('Pathfinder.gd'));
    assert.ok(content.includes('Flare RPG'));
    assert.ok(content.includes('InfinityAIAgent'));

    // Verify screenshots referenced exist on disk
    const imageMatches = content.match(/\/assets\/images\/crpg-realm\/[a-zA-Z0-9_\-]+\.png/g);
    assert.ok(imageMatches && imageMatches.length >= 8, 'Must reference at least 8 screenshots');
    for (const imgUrl of imageMatches) {
      const relPath = imgUrl.replace('/assets/images/', '');
      const fullImgPath = path.resolve(rootRepo, 'docs/assets/images', relPath);
      assert.ok(fs.existsSync(fullImgPath), `Image ${fullImgPath} must exist on disk`);
    }

    // Verify Mermaid diagrams present
    const mermaidBlocks = content.match(/```mermaid/g);
    assert.ok(mermaidBlocks && mermaidBlocks.length >= 4, 'Must include at least 4 Mermaid diagrams');
  });

  it('Standalone launcher package robos-crpg-elearning is configured properly', () => {
    const pkgDir = path.resolve(rootRepo, 'packages/robos-crpg-elearning');
    assert.ok(fs.existsSync(path.join(pkgDir, 'package.json')));
    assert.ok(fs.existsSync(path.join(pkgDir, 'main.js')));
    assert.ok(fs.existsSync(path.join(pkgDir, 'icon.svg')));
    assert.ok(fs.existsSync(path.join(pkgDir, 'robos-crpg-elearning.desktop')));

    const mainCode = fs.readFileSync(path.join(pkgDir, 'main.js'), 'utf8');
    assert.ok(mainCode.includes('--course=robos-crpg'));
    assert.ok(mainCode.includes('robos-elearning/main'));
  });
});
