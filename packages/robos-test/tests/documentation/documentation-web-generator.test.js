'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const {
  SDLCKnowledgeGraphStore,
  generateDocumentationWebsite,
} = require('../../../robos-graph/index');
const { startViewer } = require('../../../robos-documentation/test-viewer');

describe('RobOS Documentation GitHub Pages Export & Test Viewer', () => {
  it('1. Generates standalone responsive HTML website with Jekyll YAML frontmatter for GitHub Pages', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-web-doc-'));
    const targetHtmlPath = path.join(tmpDir, 'system-documentation', 'index.html');
    const store = new SDLCKnowledgeGraphStore();

    const result = store.generateDocumentationWebsite({
      outputFilePath: targetHtmlPath,
      permalink: '/system-documentation/',
    });

    assert.strictEqual(result.ok, true, 'Generation must succeed');
    assert.strictEqual(result.filePath, targetHtmlPath);
    assert.strictEqual(result.permalink, '/system-documentation/');
    assert.ok(result.entriesCount > 0, 'Must export at least one documented entity');
    assert.ok(fs.existsSync(targetHtmlPath), 'Export file must exist on disk: ' + targetHtmlPath);

    const content = fs.readFileSync(targetHtmlPath, 'utf8');

    // 1. Jekyll Front Matter
    assert.ok(content.startsWith('---'), 'Must start with Jekyll YAML frontmatter');
    assert.ok(content.includes('layout: null'), 'Must declare layout: null for standalone reading application');
    assert.ok(content.includes('permalink: /system-documentation/'), 'Must declare exact permalink');

    // 2. RobOS Branding & Navigation
    assert.ok(content.includes('https://rowbose.com/'), 'Must link to rowbose.com');
    assert.ok(content.includes('RobOS System Documentation'), 'Must show RobOS System Documentation branding');

    // 3. Accessibility & Structure
    assert.ok(content.includes('class="skip-link"'), 'Must include WCAG skip-link');
    assert.ok(content.includes('id="a11y-announcer"'), 'Must include screen reader announcer');
    assert.ok(content.includes('role="tablist"'), 'Must use role="tablist" for keyboard navigation');

    // 4. Interactive Components
    assert.ok(content.includes('id="doc-search"'), 'Must contain instant search filter input');
    assert.ok(content.includes('category-pills'), 'Must contain category filtering pills');
    assert.ok(content.includes('DOC_ITEMS'), 'Must embed serialized documentation items');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('2. Starts Test Viewer HTTP server, serves exported documentation on port, responds with HTTP 200, and stops cleanly', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-test-viewer-'));
    const docPath = path.join(tmpDir, 'index.html');
    const testPort = 13890;

    // Start test viewer
    const viewer = await startViewer({
      port: testPort,
      output: docPath,
      exportFirst: true,
    });

    assert.ok(viewer.server, 'Server must be instantiated');
    assert.strictEqual(viewer.port, testPort);
    assert.ok(viewer.url.includes(String(testPort)));

    // Perform HTTP GET request to verify serving
    const response = await new Promise((resolve, reject) => {
      http.get(viewer.url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });

    assert.strictEqual(response.statusCode, 200, 'Test viewer must return HTTP 200');
    assert.ok(response.headers['content-type'].includes('text/html'), 'Must serve text/html');
    assert.ok(response.body.includes('RobOS System Documentation'), 'Body must contain documentation hub markup');
    assert.ok(response.body.includes('doc-search'), 'Body must include search box');

    // Also check health endpoint
    const healthRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${testPort}/health`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      }).on('error', reject);
    });

    assert.strictEqual(healthRes.statusCode, 200);
    assert.strictEqual(healthRes.body.status, 'ok');
    assert.strictEqual(healthRes.body.app, 'robos-documentation-viewer');

    // Clean up
    await viewer.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
