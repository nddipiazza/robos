'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const { _electron: electron } = require('playwright-core');
const { GraphWorkspace, hash } = require('../../../robos-graph/lib/graph-workspace');

test('real Electron classification tree, filters, custom types, persistence and directional dependency links', { timeout: 120000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-classification-'));
  const proof = path.resolve(__dirname, '../../run/classification');
  fs.mkdirSync(proof, { recursive: true });
  fs.writeFileSync(path.join(proof, 'result.json'), JSON.stringify({ passed: false, status: 'running' }));
  const evidence = [{ repository: 'example', path: 'catalog.md', line: 1 }];
  const n = (id, type, extra = {}) => ({ '@id': 'urn:example:' + id, '@type': [].concat(type), 'dcterms:title': id, 'robos:package': 'services', 'robos:evidence': evidence, ...extra });
  const nodes = [
    n('service:api', 'robos:Microservice', { 'robos:repository': 'https://example.org/api', 'robos:uses': { '@id': 'urn:example:data:store' }, 'robos:calls': { '@id': 'urn:example:service:worker' } }),
    n('service:worker', 'robos:Microservice', { 'robos:repository': 'https://example.org/worker', 'robos:classification': [{ '@id': 'https://robos.dev/ns/sdlc#classification/services' }], 'robos:classificationOrigin': 'inferred' }),
    n('data:store', 'robos:DataStore', { 'robos:engine': 'sqlite', 'robos:package': 'core-platform' }),
    n('source:enum', ['robos:SourceArtifact', 'schema:CreativeWork'], { 'robos:sourceKind': 'protobuf-enum', 'robos:sourcePath': 'api.proto', 'robos:inRepository': 'https://example.org/api' }),
    n('custom:declared', 'example:Custom', { 'robos:classification': { '@id': 'https://robos.dev/ns/sdlc#classification/documentation' } }),
    n('custom:unknown', 'example:Unregistered'),
    n('multi:role', ['robos:Microservice', 'robos:DataStore'], { 'robos:repository': 'https://example.org/multi', 'robos:engine': 'sqlite' }),
  ];
  const ws = new GraphWorkspace(tmp);
  ws.apply(ws.propose({ document: { ...ws.empty('Generic classification proof'), 'robos:nodes': nodes } }));
  const before = hash(ws.read()), captions = [], start = Date.now(), errors = [];
  const recorder = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1920x1080', '-framerate', '15', '-i', process.env.DISPLAY, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', path.join(proof, 'classification.webm')], { stdio: ['pipe', 'ignore', 'pipe'] });
  let recorderError = ''; recorder.stderr.on('data', b => { recorderError += b; });
  let app;
  try {
    const launch = () => electron.launch({ executablePath: process.env.ELECTRON_BIN || require('electron'), args: [path.resolve(__dirname, '../../../robos-graph/main.js'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], env: { ...process.env, ROBOS_GRAPH_ROOT: tmp, ROBOS_TEST: '1' } });
    app = await launch();
    let page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    const step = async (selector, text, action) => {
      const target = page.locator(selector); await target.first().scrollIntoViewIfNeeded();
      captions.push({ time: (Date.now() - start) / 1000, text, target: selector });
      await page.evaluate(({ selector, text }) => {
        document.querySelectorAll('[data-proof-target]').forEach(el => { el.style.outline = ''; el.removeAttribute('data-proof-target'); });
        const el = document.querySelector(selector); el.style.outline = '3px solid #00bcd4'; el.dataset.proofTarget = 'true';
        let banner = document.getElementById('proof-caption');
        if (!banner) { banner = document.createElement('div'); banner.id = 'proof-caption'; banner.style.cssText = 'position:fixed;bottom:10px;left:12px;right:12px;z-index:999999;background:#163440;color:white;padding:14px;border:2px solid #00bcd4;pointer-events:none;font:18px sans-serif'; document.body.append(banner); }
        banner.textContent = text;
      }, { selector, text });
      if (action) await action(target);
      await page.waitForTimeout(800);
    };
    await page.locator('[data-group="classification:unclassified"]').waitFor();
    assert.match(await page.locator('#btn-group-classification').getAttribute('class'), /active/);
    assert.equal(await page.locator('#nodes-list .node-item').count(), 7);
    await step('#nodes-list', 'All seven nodes are grouped by the shared classification catalog.');
    assert.equal(await page.locator('[data-status="inferred"]').count(), 5);
    assert.equal(await page.locator('[data-status="declared"]').count(), 1);
    assert.match(await page.locator('[data-group="classification:unclassified"]').textContent(), /Unclassified.*unknown-type|Unclassified.*No registered/s);
    await page.screenshot({ path: path.join(proof, '01-classification.png') });
    await step('#btn-collapse-all-groups', 'Collapse groups: counts remain available.', el => el.click());
    assert.equal(await page.locator('#nodes-list .node-item').count(), 0);
    assert.match(await page.locator('#nodes-count-badge').textContent(), /7 of 7/);
    await step('#node-search-input', 'Search protobuf-enum: matching source artifacts automatically expand.', el => el.fill('protobuf-enum'));
    assert.equal(await page.locator('#nodes-list .node-item').count(), 1);
    assert.match(await page.locator('#nodes-list').textContent(), /source:enum/);
    assert.equal(await page.locator('#node-urn_example_source_enum .classification-warning').count(), 0);
    await page.screenshot({ path: path.join(proof, '02-source-search.png') });
    await step('#btn-clear-node-search', 'Clear search: the prior collapse state returns.', el => el.click());
    assert.equal(await page.locator('#nodes-list .node-item').count(), 0);
    await step('#btn-expand-all-groups', 'Expand all groups.', el => el.click());
    await step('#node-classification-filter', 'Data classification finds both the store and the node with multiple roles.', el => el.selectOption('data'));
    assert.equal(await page.locator('#nodes-list .node-item').count(), 2);
    await step('#node-package-filter', 'Combine classification and package filters to isolate the core store.', el => el.selectOption('core-platform'));
    assert.equal(await page.locator('#nodes-list .node-item').count(), 1);
    await step('#node-package-filter', 'Restore all packages.', el => el.selectOption('all'));
    await step('#node-classification-filter', 'Restore all classifications.', el => el.selectOption('all'));
    for (const [button, prefix] of [['#btn-group-package', 'package:'], ['#btn-group-category', 'type:']]) {
      await step(button, 'Switch tree grouping while preserving all seven nodes.', el => el.click());
      assert.equal(await page.locator('#nodes-list .node-item').count(), 7);
      assert.ok((await page.locator('#nodes-list .node-group').first().getAttribute('data-group')).startsWith(prefix));
    }
    await step('#node-type-filter', 'Exact RDF type filtering includes both DataStore nodes.', el => el.selectOption('robos:DataStore'));
    assert.equal(await page.locator('#nodes-list .node-item').count(), 2);
    await step('#node-type-filter', 'Restore all RDF types.', el => el.selectOption('all'));
    await step('#btn-group-flat', 'The flat alternative preserves classification status and warnings.', el => el.click());
    assert.equal(await page.locator('#nodes-list .node-group').count(), 0);
    assert.equal(await page.locator('#nodes-list .node-item').count(), 7);
    await step('#node-urn_example_service_api', 'Select the API node with explicit uses and calls references.', el => el.click());
    await step('#tab-btn-impact', 'Inspect modeled dependency direction for the API.', el => el.click());
    await step('[onclick="window.setImpactDirection(\'upstream\')"]', 'Upstream dependencies resolve JSON-LD object references to the store and worker.', el => el.click());
    assert.match(await page.locator('.impact-tree-list').textContent(), /data:store/);
    assert.match(await page.locator('.impact-tree-list').textContent(), /service:worker/);
    await page.screenshot({ path: path.join(proof, '03-upstream.png') });
    await step('#node-urn_example_custom_unknown', 'An unregistered node remains selectable; absent edges do not establish safety.', el => el.click());
    assert.match(await page.locator('.impact-tree-list').textContent(), /not a safety guarantee/);
    assert.doesNotMatch(await page.locator('.impact-tree-list').textContent(), /safe to (change|modify)/i);
    await page.screenshot({ path: path.join(proof, '04-unknown.png') });
    assert.equal(hash(ws.read()), before, 'read-only viewing preserves declared and inferred distinction');
    assert.deepEqual(errors, []);
    await app.close(); app = await launch(); page = await app.firstWindow();
    await page.locator('[data-group="classification:unclassified"]').waitFor();
    assert.equal(await page.locator('#nodes-list .node-item').count(), 7);
    assert.equal(await page.locator('[data-status="declared"]').count(), 1);
    fs.writeFileSync(path.join(proof, 'result.json'), JSON.stringify({ passed: true, nodeCount: 7, captions, errors, assertions: ['default catalog grouping', 'declared vs inferred', 'unknown remains visible', 'collapse counts', 'search expands', 'combined filters', 'multi-type membership', 'package/type/flat', 'object-reference upstream uses/calls', 'absence is not safety', 'unchanged graph', 'reopen'] }, null, 2));
  } finally {
    if (app) await app.close();
    recorder.stdin.write('q');
    await new Promise(resolve => recorder.once('close', resolve));
    const timestamp = seconds => new Date(Math.floor(seconds * 1000)).toISOString().slice(11, 23);
    fs.writeFileSync(path.join(proof, 'classification.vtt'), 'WEBVTT\n\n' + captions.map((c, i) => `${i+1}\n${timestamp(c.time)} --> ${timestamp(captions[i+1]?.time || (Date.now()-start)/1000)}\n${c.text}\n`).join('\n'));
    fs.writeFileSync(path.join(proof, 'walkthrough.md'), '# Generic classification proof\n\n| Time | Visible action |\n|---|---|\n' + captions.map(c => `| ${timestamp(c.time)} | ${c.text} |`).join('\n'));
  }
  assert.equal(recorder.exitCode, 0, recorderError);
  assert.ok(fs.statSync(path.join(proof, 'classification.webm')).size > 1000);
});
