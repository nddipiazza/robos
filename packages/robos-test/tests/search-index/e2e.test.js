'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, getSnapshot } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Search Index App E2E Test Suite with In-Depth Assertions', () => {
  it('launches Search Index manager, validates indexes list, rebuilds index, creates custom index, and tests search query', async () => {
    // 1. Launch search-index in test harness
    const app = await launchApp('search-index', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'search-index debug port should be allocated');

      // 2. Assert Initial Indexes List
      const indexes = await evalJS(app.port, `window.si.listIndexes()`);
      assert.ok(indexes.length >= 2, 'Must list at least 2 default indexes');
      assert.ok(indexes.some(i => i.id === 'source'), 'Source Projects index must exist');
      assert.ok(indexes.some(i => i.id === 'robos-config'), 'RobOS Config index must exist');

      // 3. Create mock files in sandbox home for indexing
      const mockProjectDir = path.join(app.sandboxHome, 'source', 'sample-app');
      fs.mkdirSync(mockProjectDir, { recursive: true });
      fs.writeFileSync(path.join(mockProjectDir, 'server.js'), 'console.log("server running");');
      fs.writeFileSync(path.join(mockProjectDir, 'config.json'), '{"port": 8080}');

      // 4. Select and Rebuild Source Index
      await evalJS(app.port, `window.selectIndex('source')`);
      await new Promise(r => setTimeout(r, 300));
      await evalJS(app.port, `window.rebuildCurrent()`);
      await new Promise(r => setTimeout(r, 600));

      const sourceIndexFile = path.join(app.sandboxHome, '.config', 'robos', 'search-index', 'source.txt');
      assert.ok(fs.existsSync(sourceIndexFile), 'source.txt index file must exist on disk');
      const sourceIndexContent = fs.readFileSync(sourceIndexFile, 'utf8');
      assert.ok(sourceIndexContent.includes('server.js'), 'server.js must be indexed in source.txt');

      // 5. Add Custom Index
      const docsDir = path.join(app.sandboxHome, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'architecture.md'), '# Architecture Overview');

      const addResult = await evalJS(app.port, `window.si.addIndex({ name: 'Architecture Docs', paths: ['${docsDir}'] })`);
      assert.strictEqual(addResult.ok, true, 'addIndex should succeed');

      await evalJS(app.port, `load()`);
      await new Promise(r => setTimeout(r, 400));

      const updatedIndexes = await evalJS(app.port, `window.si.listIndexes()`);
      assert.ok(updatedIndexes.some(i => i.id === 'architecture-docs'), 'Custom index must be listed');

      // Rebuild custom index
      await evalJS(app.port, `window.si.rebuildIndex('architecture-docs')`);
      await new Promise(r => setTimeout(r, 500));

      // 6. Test Search Query
      await evalJS(app.port, `window.searchQuery('architecture')`);
      await new Promise(r => setTimeout(r, 500));

      const searchResultsCount = await evalJS(app.port, `document.querySelectorAll('.search-result-row').length`);
      assert.ok(searchResultsCount >= 1, 'Search query for "architecture" must return at least 1 result');

      const firstResultText = await evalJS(app.port, `document.querySelector('.search-result-row').textContent`);
      assert.ok(firstResultText.includes('architecture.md'), 'Search result must include architecture.md');
    } finally {
      // Clean Teardown
      await killApp(app);
    }
  });
});
