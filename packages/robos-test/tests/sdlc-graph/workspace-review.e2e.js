'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { _electron: electron } = require('playwright-core');
const { GraphWorkspace } = require('../../../robos-graph/lib/graph-workspace');

test('Explorer: prepare evidence brief, preview/refine/discard, save and reopen a real graph', { timeout: 90000 }, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-review-e2e-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const proof = process.env.ROBOS_GRAPH_PROOF_ROOT || path.resolve(__dirname, '../../run/workspace-review');
  fs.mkdirSync(proof, { recursive: true });
  const ws = new GraphWorkspace(tmp);
  const id = 'urn:example:project:catalog';
  ws.apply(ws.propose({ document: { ...ws.empty('Example Engineering'), 'robos:nodes': [{ '@id': id, '@type': ['robos:Project'], 'dcterms:title': 'Service Catalog', 'robos:status': 'active', 'robos:package': 'organization', 'robos:evidence': [{ repository: 'catalog', path: 'README.md', line: 1 }] }] } }));
  const captions = [], started = Date.now();
  const recorder = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-video_size', '1920x1080', '-framerate', '15', '-i', process.env.DISPLAY, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', path.join(proof, 'workspace-review.webm')], { stdio: ['pipe', 'ignore', 'pipe'] });
  let recorderError = '';
  recorder.stderr.on('data', b => { recorderError += b; });
  const electronBin = process.env.ELECTRON_BIN || require('electron');
  const startApp = () => electron.launch({ executablePath: electronBin, args: [path.resolve(__dirname, '../../../robos-graph/main.js'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], env: { ...process.env, ROBOS_GRAPH_ROOT: tmp, ROBOS_TEST: '1' } });
  let app;
  try {
    app = await startApp();
    let page = await app.firstWindow();
    const narrate = async text => {
      captions.push({ time: (Date.now() - started) / 1000, text });
      await page.evaluate(text => {
        let banner = document.getElementById('proof-caption');
        if (!banner) { banner = document.createElement('div'); banner.id = 'proof-caption'; banner.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:999999;background:#163440;color:white;padding:14px;border:2px solid #00bcd4;border-radius:8px;pointer-events:none;font:18px sans-serif'; document.body.append(banner); }
        banner.textContent = text;
      }, text);
      await page.waitForTimeout(900); // Keep each verified action readable in the proof recording.
    };
    await page.locator('#btn-workspace-review').click();
    await page.locator('#workspace-summary').filter({ hasText: 'Example Engineering' }).waitFor();
    await narrate('The external graph opens with its actual package count and saved revision.');
    assert.match(await page.locator('#workspace-summary').textContent(), /1 nodes/);
    await page.locator('#workspace-prompt').fill('Clarify the catalog name while preserving its source evidence.');
    await page.locator('#workspace-context').click();
    await page.locator('#workspace-context-output').filter({ hasText: 'README.md' }).waitFor();
    await narrate('Prepare a bounded agent brief containing the selected graph, schema, and source evidence.');
    await page.screenshot({ path: path.join(proof, '01-agent-brief.png') });
    await page.locator('#workspace-context-details summary').click();
    const edit = { edits: [{ op: 'update', id, set: { 'dcterms:title': 'Engineering Service Catalog' } }] };
    await page.locator('#workspace-edits').fill(JSON.stringify(edit));
    await page.locator('#workspace-propose').click();
    await page.locator('#workspace-status').filter({ hasText: '1 changed' }).waitFor();
    await narrate('Preview the property-level change before any graph files are saved.');
    assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'Service Catalog');
    assert.match(await page.locator('#workspace-diff').textContent(), /Engineering Service Catalog/);
    await page.screenshot({ path: path.join(proof, '02-proposed-change.png') });
    await page.locator('#workspace-discard').click();
    assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'Service Catalog');
    await page.locator('#workspace-propose').click();
    await page.locator('#workspace-apply').click();
    await page.locator('#workspace-status').filter({ hasText: 'Saved revision' }).waitFor();
    await narrate('The reviewed revision is saved to the external package store.');
    assert.equal(ws.read()['robos:nodes'][0]['dcterms:title'], 'Engineering Service Catalog');
    await page.screenshot({ path: path.join(proof, '03-saved-revision.png') });
    await app.close(); app = await startApp(); page = await app.firstWindow();
    await page.locator('#btn-workspace-review').click();
    await page.locator('#workspace-summary').filter({ hasText: 'Example Engineering' }).waitFor();
    await page.locator('#workspace-context').click();
    await page.locator('#workspace-context-output').filter({ hasText: 'Engineering Service Catalog' }).waitFor();
    await narrate('Reopening the app preserves the accepted correction and its evidence.');
    await page.screenshot({ path: path.join(proof, '04-reopened.png') });
    fs.writeFileSync(path.join(proof, 'result.json'), JSON.stringify({ passed: true, assertions: ['external root', 'evidence brief', 'preview does not mutate', 'discard preserves graph', 'save persists change', 'reopen retains correction'], captions }, null, 2));
  } finally {
    if (app) await app.close();
    recorder.stdin.write('q');
    await new Promise(resolve => recorder.on('close', resolve));
    const timestamp = seconds => new Date(Math.floor(seconds * 1000)).toISOString().slice(11, 23);
    fs.writeFileSync(path.join(proof, 'workspace-review.vtt'), 'WEBVTT\n\n' + captions.map((c, i) => `${i + 1}\n${timestamp(c.time)} --> ${timestamp(captions[i + 1]?.time || (Date.now() - started) / 1000)}\n${c.text}\n`).join('\n'));
  }
  assert.equal(recorder.exitCode, 0, recorderError);
  assert.ok(fs.statSync(path.join(proof, 'workspace-review.webm')).size > 1000);
});
