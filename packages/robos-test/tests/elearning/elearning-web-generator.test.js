'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  generateELearningWebsite,
} = require('../../../robos-graph/index');

const rootRepo = path.resolve(__dirname, '../../../../');
const graphFile = path.join(rootRepo, '.robos', 'knowledge-graph.jsonld');

describe('RobOS eLearning Website Generator & GitHub Pages Publishing', () => {
  const store = new SDLCKnowledgeGraphStore({
    filePath: graphFile,
    rootDir: path.join(rootRepo, '.robos'),
  });

  it('1. Generates standalone interactive website for robos-crpg with Jekyll frontmatter for GitHub Pages', () => {
    const targetHtmlPath = path.join(rootRepo, 'docs', 'projects', 'crpg-realm', 'elearning.html');

    const result = store.generateELearningWebsite({
      courseId: 'robos-crpg',
      outputFilePath: targetHtmlPath,
      permalink: '/projects/crpg-realm/elearning/',
    });

    assert.strictEqual(result.ok, true, 'Result ok must be true');
    assert.strictEqual(result.filePath, targetHtmlPath);
    assert.strictEqual(result.permalink, '/projects/crpg-realm/elearning/');
    assert.ok(result.course, 'Must return course node');
    assert.ok(result.application, 'Must return target application node');

    // Verify main HTML file exists
    assert.ok(fs.existsSync(targetHtmlPath), 'docs/projects/crpg-realm/elearning.html must exist on disk');

    // Verify directory index file exists for /projects/crpg-realm/elearning/ routing
    const indexFilePath = path.join(rootRepo, 'docs', 'projects', 'crpg-realm', 'elearning', 'index.html');
    assert.ok(fs.existsSync(indexFilePath), 'Directory index.html must exist for clean URL resolution');

    const content = fs.readFileSync(targetHtmlPath, 'utf8');

    // 1. Verify Jekyll Front Matter
    assert.ok(content.startsWith('---'), 'Must start with Jekyll YAML frontmatter');
    assert.ok(content.includes('layout: null'), 'Must have layout: null for standalone app rendering');
    assert.ok(content.includes('permalink: /projects/crpg-realm/elearning/'), 'Must specify exact GitHub Pages permalink');
    assert.ok(content.includes('parent: Tactical cRPG & Infinity AI Engine'), 'Must place in Crpg documentation parent');
    assert.ok(content.includes('grand_parent: RobOS Projects'), 'Must place in RobOS Projects grand parent');
    assert.ok(content.includes('redirect_from:'), 'Must include redirect_from fallbacks');
    assert.ok(content.includes('/elearning/robos-crpg-engine'), 'Must include legacy redirect fallback');

    // 2. Verify RobOS branding & top navbar
    assert.ok(content.includes('https://rowbose.com/'), 'Must link back to root domain');
    assert.ok(content.includes('RobOS Interactive eLearning'), 'Must show RobOS brand header');
    assert.ok(content.includes('Tactical cRPG Realm'), 'Must include breadcrumb link to project');
    assert.ok(content.includes('Interactive Masterclass'), 'Must include breadcrumb title');

    // 3. Verify all 5 curriculum modules are parsed without leaking template literals in sidebar
    assert.ok(!content.includes('${idx + 1}'), 'Must not leak unparsed template literals');
    const sidebarSection = content.split('<aside class="sidebar">')[1].split('</aside>')[0];
    assert.ok(!sidebarSection.includes('${'), 'Sidebar must not contain unparsed template expressions');
    assert.ok(content.includes('id="nav-mod-0"'), 'Module 0 nav id must be rendered');
    assert.ok(content.includes('onclick="selectModule(0)"'), 'Module 0 click handler must be rendered');
    assert.ok(content.includes('1. D&amp;D 5e Ruleset') || content.includes('1. D&D 5e Ruleset'), 'Module 1 numbered title must be rendered');
    assert.ok(content.includes('2. Godot 4.3 Engine Runtime'), 'Module 2 must be present');
    assert.ok(content.includes('3. Open-Source Asset Harvesting'), 'Module 3 must be present');
    assert.ok(content.includes('4. Autonomous Infinity AI Agent'), 'Module 4 must be present');
    assert.ok(content.includes('5. Knowledge Graph-First Game Development') || content.includes('Knowledge Graph-First Game Architecture'), 'Module 5 must be present');

    // 4. Verify Interactive Labs & Checkbox handlers
    assert.ok(content.includes('toggleLab('), 'Must provide toggleLab interactive handler');
    assert.ok(content.includes('completeAllLabs('), 'Must provide completeAllLabs helper');
    assert.ok(content.includes('localStorage.getItem'), 'Must store progress in localStorage');

    // 5. Verify Knowledge Check Quizzes
    assert.ok(content.includes('answerQuiz('), 'Must provide answerQuiz interactive handler');
    assert.ok(content.includes('Spell Save DC'), 'Must include Module 1 Spell Save DC question');
    assert.ok(content.includes('GL Compatibility'), 'Must include Module 2 GL Compatibility question');

    // 6. Verify Technical Deep Dive theory & Formulas
    assert.ok(content.includes('Ability Score - 10'), 'Must include Ability Modifier formula');
    assert.ok(content.includes('Camera Viewport Clamping'), 'Must include camera clamping formulas');
    assert.ok(content.includes('Activity Log Expansion Tiers'), 'Must include activity log formula breakdown');
    assert.ok(content.includes('140px proximity trigger'), 'Must include threat radar trigger specs');

    // 7. Verify Verifiable Certificate & Cryptographic SHA-256 Hash
    assert.ok(content.includes('ROBOS-CERT-'), 'Must include ROBOS-CERT- verification prefix');
    assert.ok(content.includes('crypto.subtle.digest'), 'Must compute client-side SHA-256 cryptographic hash');
    assert.ok(content.includes('schema:EducationalOccupationalCredential'), 'Must conform to W3C schema standard');
    assert.ok(content.includes('showJsonLdModal'), 'Must provide JSON-LD credential inspector');

    // 8. Verify Mermaid diagrams & Lightbox
    assert.ok(content.includes('class="mermaid"'), 'Must contain Mermaid diagram elements');
    assert.ok(content.includes('openLightbox'), 'Must support screenshot lightbox zoom');
  });

  it('2. Standalone export function handles arbitrary application courses and custom output paths', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-webgen-'));
    const tmpOut = path.join(tmpDir, 'custom-course.html');

    const res = generateELearningWebsite(store, {
      courseId: 'urn:robos:elearning:course:robos-crpg',
      outputFilePath: tmpOut,
      permalink: '/elearning/custom-test',
      autoPublishPages: false,
    });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.filePath, tmpOut);
    assert.ok(fs.existsSync(tmpOut));

    const content = fs.readFileSync(tmpOut, 'utf8');
    assert.ok(content.includes('permalink: /elearning/custom-test'));
    assert.ok(content.includes('<!DOCTYPE html>'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('3. Error gracefully handled when non-existent course ID is requested', () => {
    const res = store.generateELearningWebsite({
      courseId: 'non-existent-course-12345',
      outputFilePath: '/tmp/fake.html',
    });

    assert.strictEqual(res.ok, false);
    assert.ok(res.error.includes('Course not found in Knowledge Graph'));
  });

  it('4. Documentation pages link to the interactive web edition inside RobOS Projects area', () => {
    const masterclassDoc = path.join(rootRepo, 'docs', 'projects', 'crpg-realm', 'elearning-masterclass.md');
    const docContent = fs.readFileSync(masterclassDoc, 'utf8');
    assert.ok(docContent.includes('/projects/crpg-realm/elearning/'), 'elearning-masterclass.md must link to web edition in projects area');

    const realmDoc = path.join(rootRepo, 'docs', 'projects', 'crpg-realm.md');
    const realmContent = fs.readFileSync(realmDoc, 'utf8');
    assert.ok(realmContent.includes('/projects/crpg-realm/elearning/'), 'crpg-realm.md must link to web edition in projects area');
  });
});
