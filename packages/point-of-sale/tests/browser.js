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

async function launch(profile, { date = new Date(2026, 9, 14, 10, 0), touch = true, viewport = { width: 1280, height: 800 }, camera = null } = {}) {
  const clock = { date };
  const recording = process.env.POS_DEMO_RECORD === '1';
  const videoDir = process.env.POS_VIDEO_DIR || path.join(__dirname, '..', '.proof', 'videos');
  if (recording) fs.mkdirSync(path.join(videoDir, 'raw'), { recursive: true });
  const pos = new PointOfSale({ now: () => clock.date });
  if (profile) loadSample(pos, profile);
  const server = createServer(pos);
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  const { chromium } = playwright();
  // camera: { text, format } puts that code in front of a fake webcam; without it there is no camera at all.
  const clip = camera ? await barcodeClip(camera) : null;
  const cameraArgs = clip ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${clip}`] : [];
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', ...cameraArgs] });
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: false, permissions: clip ? ['camera'] : [], ...(recording ? { recordVideo: { dir: path.join(videoDir, 'raw'), size: viewport } } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const proofDir = process.env.POS_PROOF_DIR || path.join(__dirname, '..', '.proof');
  const shots = [];
  const api = {
    pos, base, page, context, browser, clock, errors,
    async step(title) {
      if (!recording) return;
      await page.evaluate(({ title, profile }) => {
        let caption = document.getElementById('pos-test-walkthrough');
        if (!caption) { caption = document.createElement('div'); caption.id = 'pos-test-walkthrough'; document.body.append(caption); }
        caption.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);max-width:90%;z-index:99999;padding:10px 18px;background:#17272ff2;color:white;border:1px solid #71818b;border-radius:4px;font:15px/1.4 system-ui;pointer-events:none;text-align:center';
        caption.textContent = `${title} · ${profile} test shop · demo payments`;
      }, { title, profile });
      await page.waitForTimeout(1600);
    },
    // Touch-friendly tap: uses the touchscreen, as a worker's finger would.
    tap: async selector => { const loc = page.locator(selector).first(); await loc.waitFor({ state: 'visible' }); await loc.tap(); if (recording) await page.waitForTimeout(300); },
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
    async close() {
      if (recording) { await page.waitForTimeout(1500); const video = page.video(); await context.close(); await video.saveAs(path.join(videoDir, `${profile}-walkthrough.webm`)); }
      await browser.close(); await new Promise(r => server.close(r));
    },
  };
  return api;
}


// ---- fake webcam support -------------------------------------------------------------------------------------
// Renders a barcode with ZXing's encoders, saves a short MJPEG clip of it, and returns the path. Chromium can play the
// clip back as a webcam (--use-file-for-fake-video-capture), so the camera scanner is tested with real decoding.
async function barcodeClip({ text, format, frames = 45 }) {
  const { chromium } = playwright();
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage({ viewport: { width: 700, height: 520 } });
    await page.setContent('<canvas id="c" width="640" height="480"></canvas>');
    await page.addScriptTag({ path: path.join(__dirname, '..', 'renderer', 'vendor', 'zxing-library.min.js') });
    const jpegBase64 = await page.evaluate(({ text, format }) => {
      const Z = window.ZXing;
      // ZXing-js can only *write* QR, Data Matrix and Aztec, so the retail 1D codes are drawn by hand here.
      const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
      const R = L.map(c => c.replace(/[01]/g, d => (d === '0' ? '1' : '0')));
      const G = R.map(c => [...c].reverse().join(''));
      const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
      const ean13 = d => { const par = PARITY[d[0]]; let bits = '101'; for (let i = 1; i < 7; i++) bits += (par[i - 1] === 'L' ? L : G)[d[i]]; bits += '01010'; for (let i = 7; i < 13; i++) bits += R[d[i]]; return bits + '101'; };
      const ean8 = d => { let bits = '101'; for (let i = 0; i < 4; i++) bits += L[d[i]]; bits += '01010'; for (let i = 4; i < 8; i++) bits += R[d[i]]; return bits + '101'; };
      const canvas = document.getElementById('c'); const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#000';
      const hints = new Map([[Z.EncodeHintType.MARGIN, 4]]);
      if (format === 'EAN_13' || format === 'UPC_A' || format === 'EAN_8') {
        const digits = format === 'UPC_A' ? '0' + text : text;
        const bits = format === 'EAN_8' ? ean8(digits) : ean13(digits);
        const mod = Math.floor(520 / (bits.length + 18)); const ox = Math.floor((canvas.width - bits.length * mod) / 2);
        for (let i = 0; i < bits.length; i++) if (bits[i] === '1') ctx.fillRect(ox + i * mod, 120, mod, 240);
      } else {
        const writer = { QR_CODE: new Z.QRCodeWriter(), DATA_MATRIX: new Z.DataMatrixWriter(), AZTEC: new Z.AztecCodeWriter() }[format];
        if (!writer) throw new Error(`No fixture generator for ${format}`);
        // Data Matrix rescales to the requested pixel size, so ask for the raw modules.
        const matrix = format === 'DATA_MATRIX' ? writer.encode(text, Z.BarcodeFormat[format], 1, 1) : writer.encode(text, Z.BarcodeFormat[format], 300, 300, hints);
        const w = matrix.getWidth(), h = matrix.getHeight();
        const scale = Math.max(1, Math.floor(Math.min(560 / w, 420 / h)));
        const ox = Math.floor((canvas.width - w * scale) / 2), oy = Math.floor((canvas.height - h * scale) / 2);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (matrix.get(x, y)) ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
      return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
    }, { text, format });
    const frame = Buffer.from(jpegBase64, 'base64');
    const file = path.join(require('node:os').tmpdir(), `pos-clip-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mjpeg`);
    fs.writeFileSync(file, Buffer.concat(Array.from({ length: frames }, () => frame)));
    return file;
  } finally { await browser.close(); }
}

module.exports = { launch, playwright, barcodeClip };
