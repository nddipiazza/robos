'use strict';
// Starts a real server over a sample business and drives it with a touch-enabled Chromium (Playwright).
const fs = require('node:fs');
const path = require('node:path');
const { PointOfSale } = require('../lib/pos');
const { createServer, listen } = require('../lib/server');
const { loadSample } = require('../lib/samples');

function playwright() {
  const candidates = ['playwright-core', path.join(__dirname, '../../robos-test/node_modules/playwright-core'), '/opt/node-tools/node_modules/playwright-core'];
  for (const c of candidates) { try { return require(c); } catch { /* try next */ } }
  throw new Error('playwright-core not found. Install it (npm i -D playwright-core) or run tests inside the RobOS test container.');
}

function chromiumPath() {
  if (process.env.POS_CHROMIUM) return process.env.POS_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(root)) {
    const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    if (dir) return path.join(root, dir, 'chrome-linux', 'chrome');
  }
  return undefined; // let Playwright find its own
}

async function launch(profile, { date = new Date(2026, 9, 14, 10, 0), touch = true, viewport = { width: 1280, height: 800 } } = {}) {
  const clock = { date };
  const pos = new PointOfSale({ now: () => clock.date });
  if (profile) loadSample(pos, profile);
  const server = createServer(pos);
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const { chromium } = playwright();
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const proofDir = process.env.POS_PROOF_DIR || path.join(__dirname, '..', '.proof');
  const shots = [];
  const api = {
    pos, base, page, context, browser, clock, errors,
    // Touch-friendly tap: uses the touchscreen, as a worker's finger would.
    tap: async selector => { const loc = page.locator(selector).first(); await loc.waitFor({ state: 'visible' }); await loc.tap(); },
    // Wait until an element's text matches (the UI updates after a network round trip).
    async see(selector, pattern, timeout = 8000) {
      try { await page.waitForFunction(([sel, src, flags]) => new RegExp(src, flags).test((document.querySelector(sel) || {}).innerText || ''), [selector, pattern.source, pattern.flags], { timeout }); }
      catch { throw new Error(`Expected ${selector} to match ${pattern}, got: ${JSON.stringify(await page.locator(selector).first().innerText().catch(() => '(missing)'))}`); }
    },
    // Any visible toast may match: an older error toast can still be on screen when a newer one appears.
    async seeToast(pattern, timeout = 8000) {
      try { await page.waitForFunction(([src, flags]) => [...document.querySelectorAll('[data-testid="toast"]')].some(t => new RegExp(src, flags).test(t.innerText)), [pattern.source, pattern.flags], { timeout }); }
      catch { throw new Error(`Expected a toast matching ${pattern}, saw: ${JSON.stringify(await page.locator('[data-testid="toast"]').allInnerTexts())}`); }
    },
    tid: id => `[data-testid="${id}"]`,
    // Type a number on the on-screen pad using taps only.
    async keys(text) { for (const ch of String(text)) await page.locator(`.numpad button[data-key="${ch}"]`).last().tap(); },
    async shot(name) { fs.mkdirSync(proofDir, { recursive: true }); const file = path.join(proofDir, `${name}.png`); await page.screenshot({ path: file }); shots.push(file); },
    async signIn(pin) { await page.goto(base + '/'); await api.keys(pin); await api.tap('[data-testid="login-submit"]'); await page.locator('[data-testid="whoami"]').waitFor(); },
    async nav(view) { await api.tap(`[data-testid="nav-${view}"]`); await page.locator(`[data-testid="view-${view}"]`).waitFor(); },
    async close() { await browser.close(); await new Promise(r => server.close(r)); },
  };
  return api;
}

module.exports = { launch, playwright };
