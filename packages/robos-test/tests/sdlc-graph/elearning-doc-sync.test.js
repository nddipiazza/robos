'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  SDLCKnowledgeGraphStore,
  OSLCGraphParser,
  SHACLValidator,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS eLearning Generator & Living Documentation Sync E2E Test Suite', () => {
  it('executes full E2E lifecycle: existing course lookup, new course synthesis, GitOps sync, and AI doc sync prompt', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-e2e-elearning-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    // Step 1: Baseline Verification
    const initialCourses = store.getELearningNodes();
    assert.ok(initialCourses.length >= 1, 'Should contain baseline microservices-contracts course');
    const baselineCourse = initialCourses[0];
    assert.strictEqual(baselineCourse['dcterms:title'], 'Building Event-Driven Microservices with OpenAPI & Gherkin BDD');
    assert.strictEqual(baselineCourse['robos:gitopsFile'], '.robos/elearning.yaml');

    // Step 2: SHACL Shape Conformance
    const validator = new SHACLValidator();
    const report1 = validator.validateGraph(store.parser);
    assert.strictEqual(report1.conforms, true, 'Knowledge Graph must conform to ELearningShape and all SHACL rules');

    // Step 3: Lookup Existing eLearning
    const lookupResult = store.generateELearningCourse({ prompt: 'Building Event-Driven Microservices with OpenAPI' });
    assert.strictEqual(lookupResult.ok, true);
    assert.strictEqual(lookupResult.existing, true);
    assert.strictEqual(lookupResult.created, false);
    assert.strictEqual(lookupResult.node['@id'], 'urn:robos:elearning:microservices-contracts');
    assert.ok(lookupResult.docSyncPrompt, 'Lookup should generate a doc sync advisory review');

    // Step 4: Synthesize New Course & Verify GitOps
    const newCourseTitle = 'Distributed Architecture and Service Mesh Routing';
    const genResult = store.generateELearningCourse({
      prompt: newCourseTitle,
      difficulty: 'Advanced',
    });
    assert.strictEqual(genResult.ok, true);
    assert.strictEqual(genResult.existing, false);
    assert.strictEqual(genResult.created, true);
    assert.ok(genResult.node['@id'].startsWith('urn:robos:elearning:'));
    assert.strictEqual(genResult.node['robos:difficulty'], 'Advanced');
    assert.strictEqual(genResult.node['robos:gitopsFile'], '.robos/elearning.yaml');
    assert.ok(Array.isArray(genResult.node['robos:modules']));
    assert.strictEqual(genResult.node['robos:modules'].length, 3);

    // Step 5: Verify Conformance of Synthesized Course
    const report2 = validator.validateGraph(store.parser);
    assert.strictEqual(report2.conforms, true, 'Synthesized course must strictly conform to SHACL ELearningShape');

    // Step 6: Verify Living Documentation Sync Prompt
    const docPrompt = genResult.docSyncPrompt;
    assert.ok(docPrompt, 'Must generate AI documentation sync prompt');
    assert.strictEqual(docPrompt.hasNoticeableUpdates, true);
    assert.strictEqual(docPrompt.changeType, 'created');
    assert.ok(docPrompt.aiPrompt.includes('[RobOS Doc Sync Agent Prompt]'));
    assert.ok(docPrompt.aiPrompt.includes('Action Required'));
    assert.ok(docPrompt.suggestedFiles.includes('docs/index.md'));
    assert.ok(docPrompt.suggestedFiles.includes('.robos/elearning.yaml'));

    // Step 7: Verify GitOps .robos/elearning.yaml File
    const gitopsPath = path.join(process.cwd(), '.robos', 'elearning.yaml');
    assert.ok(fs.existsSync(gitopsPath), '.robos/elearning.yaml must be present on disk');
    const gitopsText = fs.readFileSync(gitopsPath, 'utf8');
    assert.ok(gitopsText.includes('kind: ELearningCatalog'));
    assert.ok(gitopsText.includes('microservices-contracts'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs interactive GUI E2E flow: filter pills, generator modal, textarea submission, inspector rendering, and doc sync banner', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug server port should be active');

      // 1. Check Initial State & Nodes Count
      const statNodes = await evalJS(app.port, `document.getElementById('stat-nodes').textContent`);
      assert.ok(statNodes.includes('Nodes'), 'Stat bar must render active nodes count');

      // 2. Filter by eLearning Category
      await evalClick(app.port, '.filter-pill[data-filter="elearning"]');
      await new Promise(r => setTimeout(r, 400));
      const badgeText = await evalJS(app.port, `document.getElementById('nodes-count-badge').textContent`);
      assert.ok(badgeText.includes('Nodes'), 'Nodes badge should update upon category filter');

      // 3. Open eLearning Generator Modal
      await evalClick(app.port, '#btn-open-elearning-modal');
      await new Promise(r => setTimeout(r, 400));
      const isModalVisible = await evalJS(app.port, `
        (() => {
          const m = document.getElementById('elearning-modal');
          return m && m.style.display === 'flex';
        })()
      `);
      assert.strictEqual(isModalVisible, true, 'eLearning modal must open on header button click');

      // 4. Verify AI Textarea Component in Modal
      const textareaExists = await evalJS(app.port, `
        (() => {
          const t = document.getElementById('elearning-prompt');
          return !!t;
        })()
      `);
      assert.strictEqual(textareaExists, true, '<robos-ai-textarea id="elearning-prompt"> must exist in modal');

      // 5. Submit Course Prompt: Look up existing course
      const lookupRes = await evalJS(app.port, `window.submitELearning('Building Event-Driven Microservices')`);
      assert.strictEqual(lookupRes.ok, true);
      assert.strictEqual(lookupRes.existing, true);

      // 6. Verify Visual Inspector Renders Curriculum
      await new Promise(r => setTimeout(r, 600));
      const inspectorTitle = await evalJS(app.port, `
        (() => {
          const t = document.querySelector('.inspector-card .card-title span');
          return t ? t.textContent : '';
        })()
      `);
      assert.ok(inspectorTitle.includes('Building Event-Driven Microservices'), 'Inspector must render course title');

      const moduleCardsCount = await evalJS(app.port, `document.querySelectorAll('.elearning-module-card').length`);
      assert.ok(moduleCardsCount >= 3, 'Must render at least 3 curriculum module cards');

      // 7. Submit Course Prompt: Generate a brand new course
      await evalClick(app.port, '#btn-open-elearning-modal');
      await new Promise(r => setTimeout(r, 300));
      const genRes = await evalJS(app.port, `window.submitELearning('Zero-Trust API Security and Mutual TLS Verification')`);
      assert.strictEqual(genRes.ok, true);
      assert.strictEqual(genRes.created, true);

      // 8. Verify Documentation Synchronization Advisory Banner
      await new Promise(r => setTimeout(r, 600));
      const bannerVisible = await evalJS(app.port, `
        (() => {
          const b = document.getElementById('doc-sync-banner');
          return b && b.style.display === 'flex';
        })()
      `);
      assert.strictEqual(bannerVisible, true, 'Documentation sync advisory banner must be visible');

      const bannerDesc = await evalJS(app.port, `document.getElementById('doc-sync-desc').textContent`);
      assert.ok(bannerDesc.includes('Noticeable updates detected'), 'Banner must describe detected KGraph update');
      assert.ok(bannerDesc.includes('AI prompted to discern documentation updates'), 'Banner must state AI documentation prompt');

      // 9. Inspect GitOps Tab for elearning.yaml
      await evalClick(app.port, '#tab-btn-gitops');
      await new Promise(r => setTimeout(r, 400));
      await evalClick(app.port, '#gitops-file-elearning');
      await new Promise(r => setTimeout(r, 400));

      const filePreContent = await evalJS(app.port, `
        (() => {
          const pre = document.getElementById('gitops-file-content-pre');
          return pre ? pre.textContent : '';
        })()
      `);
      assert.ok(filePreContent.includes('kind: ELearningCatalog'), 'GitOps pre must render ELearningCatalog YAML');
      assert.ok(filePreContent.includes('microservices-contracts'), 'GitOps pre must contain courses');

      // 10. Trigger Auto-Sync Docs Action
      const syncResult = await evalJS(app.port, `window.syncDocsAction()`);
      assert.strictEqual(syncResult.ok, true, 'syncDocsAction must successfully acknowledge doc sync');
    } finally {
      await killApp(app);
    }
  });
});
