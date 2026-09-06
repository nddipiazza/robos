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
  BulkRepoImporter,
} = require('../../../robos-graph/index');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('RobOS Bulk Repository Importer & Multi-App Archetype E2E Test Suite', () => {
  const SAMPLE_REPOS = [
    'https://github.com/acme/order-processing-java-service',
    'https://github.com/acme/user-auth-go-service',
    'https://github.com/acme/dev-terminal-desktop',
    'https://github.com/acme/cloud-deploy-cli',
    'https://github.com/acme/recommendation-pipeline',
    'https://github.com/acme/field-ops-mobile',
    'https://github.com/acme/shared-domain-sdk',
  ];

  it('bulk-imports diverse GitHub URLs and generates specialized KGraph archetypes with OpenAPI & CLI models', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-bulk-import-'));
    const filePath = path.join(tmpDir, 'knowledge-graph.jsonld');
    const store = new SDLCKnowledgeGraphStore({ filePath });

    const initialCount = store.parser.nodes.length;

    // 1. Execute Bulk Import
    const importRes = store.bulkImportRepositories(SAMPLE_REPOS);
    assert.strictEqual(importRes.ok, true, 'Bulk import must return ok: true');
    assert.strictEqual(importRes.summary.total, 7, 'Must process all 7 repositories');
    assert.strictEqual(importRes.summary.microservices, 2, 'Should detect 2 microservices');
    assert.strictEqual(importRes.summary.desktopApps, 1, 'Should detect 1 desktop app');
    assert.strictEqual(importRes.summary.consoleApps, 1, 'Should detect 1 console app');
    assert.strictEqual(importRes.summary.dataPipelines, 1, 'Should detect 1 data pipeline');
    assert.strictEqual(importRes.summary.mobileApps, 1, 'Should detect 1 mobile app');
    assert.strictEqual(importRes.summary.libraries, 1, 'Should detect 1 library');
    assert.strictEqual(importRes.summary.contracts, 3, 'Should generate OpenAPI contracts for services & library');

    // 2. Verify Java Spring Boot Microservice & OpenAPI YAML Contract
    const javaService = store.getNode('urn:robos:service:order-processing-java-service');
    assert.ok(javaService, 'Java Spring Boot microservice node must exist in graph');
    assert.strictEqual(javaService['robos:technology'], 'Java 21 / Spring Boot 3');
    assert.strictEqual(javaService['robos:implementsContract'], 'urn:robos:contract:order-processing-java-service-v1');

    const javaContract = store.getNode('urn:robos:contract:order-processing-java-service-v1');
    assert.ok(javaContract, 'OpenAPI contract node must exist');
    assert.strictEqual(javaContract['robos:protocol'], 'OpenAPI 3.1');
    assert.ok(javaContract['robos:contractYaml'].includes('openapi: 3.1.0'), 'Must contain valid OpenAPI 3.1 YAML header');
    assert.ok(javaContract['robos:contractYaml'].includes('/api/v1/order-processing-java-service'), 'Must define REST resource endpoint');
    assert.ok(javaContract['robos:contractYaml'].includes('components:'), 'Must generate OpenAPI schema components');
    assert.ok(javaContract['robos:endpoints'].length >= 3, 'Must contain enumerated endpoint operations');

    // 3. Verify Desktop Application Archetype
    const desktopApp = store.getNode('urn:robos:desktop-app:dev-terminal-desktop');
    assert.ok(desktopApp, 'Desktop App node must exist in graph');
    assert.ok(desktopApp['@type'].includes('robos:DesktopApp'), 'Node must be typed as robos:DesktopApp');
    assert.strictEqual(desktopApp['robos:desktopFramework'], 'Electron');
    assert.strictEqual(desktopApp['robos:executableName'], 'dev-terminal-desktop-gui');
    assert.strictEqual(desktopApp['robos:windowConfig'].defaultWidth, 1200);
    assert.strictEqual(desktopApp['robos:windowConfig'].defaultHeight, 800);

    // 4. Verify Console / CLI Application Archetype
    const consoleApp = store.getNode('urn:robos:console-app:cloud-deploy-cli');
    assert.ok(consoleApp, 'Console App node must exist in graph');
    assert.ok(consoleApp['@type'].includes('robos:ConsoleApp'), 'Node must be typed as robos:ConsoleApp');
    assert.strictEqual(consoleApp['robos:cliCommand'], 'cloud-deploy');
    assert.ok(Array.isArray(consoleApp['robos:subcommands']), 'Must define CLI subcommands');
    assert.ok(consoleApp['robos:subcommands'].some(s => s.name === 'deploy'), 'Must contain deploy subcommand');
    assert.ok(consoleApp['robos:subcommands'].some(s => s.name === 'status'), 'Must contain status subcommand');
    assert.ok(Array.isArray(consoleApp['robos:globalFlags']), 'Must define CLI global flags');

    // 5. Verify Data Pipeline Archetype
    const pipeline = store.getNode('urn:robos:pipeline:recommendation-pipeline');
    assert.ok(pipeline, 'Data Pipeline node must exist in graph');
    assert.ok(pipeline['@type'].includes('robos:DataPipeline'), 'Node must be typed as robos:DataPipeline');
    assert.strictEqual(pipeline['robos:pipelineEngine'], 'Kafka Streams');
    assert.ok(pipeline['robos:inputTopics'].length > 0, 'Must declare input Kafka topics');
    assert.ok(pipeline['robos:outputTopics'].length > 0, 'Must declare output Kafka topics');

    // 6. Verify Mobile Application Archetype
    const mobileApp = store.getNode('urn:robos:mobile-app:field-ops-mobile');
    assert.ok(mobileApp, 'Mobile App node must exist in graph');
    assert.ok(mobileApp['@type'].includes('robos:MobileApp'), 'Node must be typed as robos:MobileApp');
    assert.deepStrictEqual(mobileApp['robos:platform'], ['iOS', 'Android']);
    assert.ok(mobileApp['robos:bundleId'].includes('fieldopsmobile'), 'Must generate bundle identifier');

    // 7. Verify SHACL Conformance for ALL Generated Archetypes
    const validator = new SHACLValidator();
    const valReport = validator.validateGraph(store.parser);
    assert.strictEqual(valReport.conforms, true, 'All generated nodes must satisfy SHACL constraint shapes');
    assert.strictEqual(valReport.resultsCount, 0, 'Must have zero SHACL violations');

    // 8. Verify Living Documentation Synchronization Prompt
    const docPrompt = importRes.docSyncPrompt;
    assert.ok(docPrompt, 'Bulk import must trigger an automated doc sync prompt');
    assert.strictEqual(docPrompt.changeType, 'bulk-repo-import');
    assert.ok(docPrompt.aiPrompt.includes('Total Repositories Processed: 7'));
    assert.ok(docPrompt.aiPrompt.includes('Generated Desktop Apps: 1'));
    assert.ok(docPrompt.aiPrompt.includes('Generated Console Apps: 1'));
    assert.ok(docPrompt.suggestedFiles.includes('.robos/packages.yaml'));
  });

  it('runs interactive GUI E2E flow: Git Projects ingestion, Agent Sessions, Notifications, archetypes, and per-app doc updates', async () => {
    const app = await launchApp('robos-graph', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'robos-graph debug server port must be active');

      // 1. Initial State Check
      const statNodes = await evalJS(app.port, `document.getElementById('stat-nodes').textContent`);
      assert.ok(statNodes.includes('Nodes'), 'Stat bar must display active node count');

      // 2. Configure Git Projects in RobOS configuration directory
      const gitProjectsConfig = {
        projects: SAMPLE_REPOS.map(repoUrl => {
          const parts = repoUrl.replace('https://github.com/', '').split('/');
          return {
            org: parts[0],
            repo: parts[1],
            url: repoUrl,
            host: 'github.com',
            localPath: path.join(app.sandboxHome, 'source', 'github.com', parts[0], parts[1]),
          };
        }),
      };
      const gitProjectsFile = path.join(app.sandboxHome, '.config', 'robos', 'git-projects.json');
      fs.mkdirSync(path.dirname(gitProjectsFile), { recursive: true });
      fs.writeFileSync(gitProjectsFile, JSON.stringify(gitProjectsConfig, null, 2), 'utf8');

      // 3. Trigger Ingestion from RobOS Git Projects
      const importResult = await evalJS(app.port, `window.syncFromGitProjects()`);
      assert.strictEqual(importResult.ok, true, 'syncFromGitProjects must succeed');
      assert.strictEqual(importResult.summary.desktopApps, 1);
      assert.strictEqual(importResult.summary.consoleApps, 1);

      // 4. Verify RobOS Agent Session Created
      const sessionDir = path.join(app.sandboxHome, '.config', 'robos', 'agent-sessions');
      assert.ok(fs.existsSync(sessionDir), 'Agent sessions directory must exist in ~/.config/robos/');
      const sessionFiles = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
      assert.ok(sessionFiles.length >= 1, 'Must create an agent session record file');
      const sessionData = JSON.parse(fs.readFileSync(path.join(sessionDir, sessionFiles[0]), 'utf8'));
      assert.strictEqual(sessionData.agentId, 'kgraph-ingestion-agent');
      assert.strictEqual(sessionData.status, 'completed');
      assert.strictEqual(sessionData.projectsCount, 7);
      assert.ok(sessionData.duration >= 0);
      assert.ok(sessionData.filesChanged.includes('.robos/knowledge-graph.jsonld'));

      // 5. Verify RobOS Notification Posted
      const notifFile = path.join(app.sandboxHome, '.config', 'robos', 'notifications.json');
      assert.ok(fs.existsSync(notifFile), 'notifications.json must exist in ~/.config/robos/');
      const notifs = JSON.parse(fs.readFileSync(notifFile, 'utf8'));
      assert.ok(Array.isArray(notifs) && notifs.length >= 1, 'Must record notification');
      const kgraphNotif = notifs.find(n => n.title.includes('Knowledge Graph Ingestion Completed'));
      assert.ok(kgraphNotif, 'Must post Knowledge Graph Ingestion Completed notification');
      assert.strictEqual(kgraphNotif.category, 'agent');
      assert.strictEqual(kgraphNotif.tier, 'info');
      assert.ok(kgraphNotif.message.includes('7 Git project(s)'));

      // 6. Test Category Filter Pill for Desktop Apps
      await new Promise(r => setTimeout(r, 500));
      await evalClick(app.port, '.filter-pill[data-filter="desktop-app"]');
      await new Promise(r => setTimeout(r, 400));

      const desktopListCount = await evalJS(app.port, `
        document.querySelectorAll('.node-item').length
      `);
      assert.ok(desktopListCount >= 1, 'Should filter and display desktop app node(s)');

      // 5. Select Desktop App Node & Verify Inspector
      await evalClick(app.port, '.node-item:first-child');
      await new Promise(r => setTimeout(r, 500));

      const inspectorTitle = await evalJS(app.port, `
        (() => {
          const t = document.querySelector('.inspector-card .card-title span');
          return t ? t.textContent : '';
        })()
      `);
      assert.ok(inspectorTitle.includes('Desktop') || inspectorTitle.includes('App Wizard'), 'Inspector title must reflect desktop application');

      const desktopFramework = await evalJS(app.port, `
        (() => {
          const vals = Array.from(document.querySelectorAll('.field-value')).map(el => el.textContent);
          return vals.join(' ');
        })()
      `);
      assert.ok(desktopFramework.includes('Electron'), 'Inspector must render Electron desktop framework');

      // 6. Test Category Filter Pill for Console Apps
      await evalClick(app.port, '.filter-pill[data-filter="console-app"]');
      await new Promise(r => setTimeout(r, 400));

      const consoleListCount = await evalJS(app.port, `
        document.querySelectorAll('.node-item').length
      `);
      assert.ok(consoleListCount >= 1, 'Should filter and display console app node(s)');

      // Select Console App Node & Verify Subcommands in Inspector
      await evalClick(app.port, '.node-item:first-child');
      await new Promise(r => setTimeout(r, 500));

      const subcmdTableRows = await evalJS(app.port, `
        document.querySelectorAll('.matrix-table tbody tr').length
      `);
      assert.ok(subcmdTableRows >= 3, 'Must render CLI subcommands in table');

      // 7. Test Category Filter Pill for Contracts
      await evalClick(app.port, '.filter-pill[data-filter="contract"]');
      await new Promise(r => setTimeout(r, 400));
      await evalJS(app.port, `window.selectNode('urn:robos:contract:order-processing-java-service-v1')`);
      await new Promise(r => setTimeout(r, 500));

      const yamlContent = await evalJS(app.port, `
        (() => {
          const pre = document.querySelector('.json-pre');
          return pre ? pre.textContent : '';
        })()
      `);
      assert.ok(yamlContent.includes('openapi: 3.1.0'), 'Inspector must render OpenAPI 3.1 YAML contract');

      // 8. Verify Documentation Synchronization Banner
      const bannerVisible = await evalJS(app.port, `
        (() => {
          const b = document.getElementById('doc-sync-banner');
          return b && b.style.display === 'flex';
        })()
      `);
      assert.strictEqual(bannerVisible, true, 'Documentation sync banner must be visible after bulk import');

      // 9. Trigger Auto-Sync Docs Action
      const syncResult = await evalJS(app.port, `window.syncDocsAction()`);
      assert.strictEqual(syncResult.ok, true, 'Auto-sync docs action must complete cleanly');

      // 10. Open Per-App Documentation Updates Modal
      await evalJS(app.port, `window.openAppDocModal('urn:robos:desktop-app:dev-terminal-desktop')`);
      await new Promise(r => setTimeout(r, 400));

      const appDocModalOpen = await evalJS(app.port, `
        (() => {
          const m = document.getElementById('app-doc-modal');
          return m && m.style.display === 'flex';
        })()
      `);
      assert.strictEqual(appDocModalOpen, true, 'Per-app doc modal must be visible');

      const modalTitle = await evalJS(app.port, `document.getElementById('app-doc-modal-title').textContent`);
      assert.ok(modalTitle.includes('Dev Terminal Desktop'), 'Modal title must reflect selected app');

      const appDocPromptExists = await evalJS(app.port, `!!document.getElementById('app-doc-prompt')`);
      assert.strictEqual(appDocPromptExists, true, '<robos-ai-textarea id="app-doc-prompt"> must exist in modal');

      // 11. Submit Per-App Documentation Change Request
      const appDocResult = await evalJS(app.port, `
        window.submitAppDocUpdates('Document Tilix terminal integration and add keyboard shortcuts guide')
      `);
      assert.strictEqual(appDocResult.ok, true, 'submitAppDocUpdates must succeed');
      assert.ok(appDocResult.appTitle.includes('Dev Terminal Desktop'));
      assert.ok(appDocResult.aiPrompt.includes('Tilix terminal integration'));
      assert.ok(appDocResult.suggestedFiles.includes('docs/desktop-applications.md'));
    } finally {
      await killApp(app);
    }
  });
});
