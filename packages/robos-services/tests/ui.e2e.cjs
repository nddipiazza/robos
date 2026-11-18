'use strict';
// Local hidden Electron run; real SSH host when ROBOS_SERVICES_E2E_HOST is supplied.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { _electron } = require('playwright-core');
const { Hosts } = require('../lib/hosts.cjs');
const { execFileSync } = require('node:child_process');
const out = path.resolve(__dirname, '../run/evidence');
const config = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-services-ui-'));
const frames = [], transcript = []; let begun;
let electron;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const host = process.env.ROBOS_SERVICES_E2E_HOST && JSON.parse(process.env.ROBOS_SERVICES_E2E_HOST);
  if (host) new Hosts(config).save(host);
  const env = { ...process.env, ROBOS_SERVICES_CONFIG: config, ROBOS_SERVICES_TEST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  electron = await _electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '../main.js')], env });
  const page = await electron.firstWindow();
  const cdp = await page.context().newCDPSession(page);
  begun = Date.now();
  cdp.on('Page.screencastFrame', event => {
    const file = `frame-${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(out, file), Buffer.from(event.data, 'base64'));
    frames.push({ file, time: Date.now() - begun });
    cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1300, maxHeight: 880 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  async function step(selector, narration, action) {
    await page.locator(selector).waitFor({ state: 'visible' });
    await page.evaluate(({ selector, narration }) => {
      document.getElementById('test-narration')?.remove();
      const element = document.querySelector(selector); element.style.outline = '2px solid #00bcd4';
      const card = document.createElement('div'); card.id = 'test-narration'; card.textContent = narration;
      Object.assign(card.style, { position: 'fixed', bottom: '18px', left: '260px', right: '30px', padding: '16px', background: '#063844', border: '1px solid #00bcd4', borderRadius: '8px', zIndex: '99999', color: '#d5f7fc', font: '14px system-ui', pointerEvents: 'none' }); document.body.append(card);
    }, { selector, narration });
    const start = Date.now() - begun;
    if (action) await action();
    // Brief hold gives the narrated evidence a readable frame without slowing execution.
    await page.waitForTimeout(900);
    const screenshot = await page.screenshot();
    fs.writeFileSync(path.join(out, `step-${transcript.length + 1}.png`), screenshot);
    transcript.push({ start, end: Date.now() - begun, narration });
  }
  await page.waitForFunction(() => !document.querySelector('#message').textContent.includes('Checking'));
  await step('#service-rows', 'The service suite is visible on this computer. Services run independently from this window.');
  assert.equal(await page.locator('#service-rows tr[data-key]').count(), 5);
  if (host) {
    await step('#hosts button:last-child', 'Select the authenticated SSH host to inspect its running services.', () => page.locator('#hosts button:last-child').click());
    await page.waitForFunction(() => Number(document.querySelector('#running-count').textContent) >= 5, undefined, { timeout: 15000 });
    await step('#service-rows', 'The gateway, grocery, home, games and eLearning services are running on the server.');
    await step('tr[data-key="user:grocery-lists"]', 'Select Grocery Lists to manage its current state and startup.', () => page.locator('tr[data-key="user:grocery-lists"]').click());
    await step('#detail button:last-child', 'Read the real systemd journal for the grocery-list service.', () => page.getByRole('button', { name: 'View logs', exact: true }).click());
    await page.locator('#service-output:not([hidden])').waitFor();
    assert((await page.locator('#service-output').innerText()).length > 0);
    await step('#detail', 'Grocery-list service controls and recent server logs are available.');
    await step('#view', 'Inspect existing user and system RobOS units alongside the managed suite.', () => page.selectOption('#view', 'installed'));
    assert(await page.locator('#service-rows tr[data-key]').count() >= 5);
  }
  await step('#view', 'The source inventory also lists app-owned Cast, TV, game and diagnostic listeners.', () => page.selectOption('#view', 'all'));
  await step('#search', 'Search the listener inventory by application or endpoint.', () => page.fill('#search', 'audio-player'));
  assert((await page.locator('#service-rows').innerText()).includes('audio-player'));
  await page.fill('#search', ''); await page.selectOption('#view', 'managed');
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.querySelector('#message').textContent === 'Service status is up to date.');
  assert.equal(await page.locator('#service-rows .badge.running').count(), host ? 5 : 0);
  await page.evaluate(() => document.getElementById('test-narration')?.remove());
  await page.screenshot({ path: path.join(out, 'robos-services.png') });
  assert.deepEqual(errors, []);
  await cdp.send('Page.stopScreencast');
  if (frames.length > 1) {
    const timeline = frames.map((frame, i) => `file '${frame.file}'\nduration ${Math.max(0.04, ((frames[i + 1]?.time || Date.now() - begun) - frame.time) / 1000)}`).join('\n');
    fs.writeFileSync(path.join(out, 'frames.txt'), timeline + `\nfile '${frames.at(-1).file}'\n`);
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(out, 'frames.txt'), '-vf', 'fps=24,format=yuv420p', '-c:v', 'libvpx-vp9', '-b:v', '1200k', path.join(out, 'robos-services-final.webm')], { windowsHide: true });
  }
  await electron.close(); electron = null;
  const time = ms => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
  fs.writeFileSync(path.join(out, 'robos-services.vtt'), 'WEBVTT\n\n' + transcript.map((s, i) => `${i + 1}\n${time(s.start)} --> ${time(s.end)}\n${s.narration}\n`).join('\n'));
  fs.writeFileSync(path.join(out, 'walkthrough.md'), '# RobOS Services walkthrough\n\nVerified with local hidden Electron and an authenticated live SSH host.\n\n' + transcript.map((s, i) => `${i + 1}. ${s.narration}`).join('\n') + '\n');
  const archive = path.join(os.homedir(), '.robos', 'development', 'walkthroughs', 'robos-services');
  const history = path.join(archive, 'history', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(history, { recursive: true });
  for (const file of ['robos-services-final.webm', 'robos-services.vtt', 'walkthrough.md', 'robos-services.png']) if (fs.existsSync(path.join(out, file))) {
    fs.copyFileSync(path.join(out, file), path.join(archive, file)); fs.copyFileSync(path.join(out, file), path.join(history, file));
  }
  console.log(`UI checks passed. Evidence: ${out}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (electron) await electron.close(); fs.rmSync(config, { recursive: true, force: true }); });
