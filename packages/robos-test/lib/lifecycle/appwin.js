'use strict';
/**
 * The sample app running in its own browser window ("popped up" next to the review
 * window). Used by the scripted agent (walkthrough) and by the recording itself
 * (the first and last slides show the app before the change and once it is deployed).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const APP_PORT = 4173, CDP_PORT = 9333;
const CHROME = process.env.FAKE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ping = (port, p = '/') => new Promise(res => { const r = http.get({ host: '127.0.0.1', port, path: p, timeout: 800 }, x => { x.resume(); res(x.statusCode); }); r.on('error', () => res(0)); r.on('timeout', () => { r.destroy(); res(0); }); });
async function until(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; }

const runDir = () => process.env.FAKE_RUN_DIR || '/tmp/robos-fake-run';
const pidFile = (n) => path.join(runDir(), n + '.pid');
function killPid(file) {
  try { const pid = Number(fs.readFileSync(file, 'utf8')); process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  try { fs.unlinkSync(file); } catch { /* none */ }
}

/** Start the dev server (from `ws`) and a browser window showing it. Idempotent. */
async function ensureApp(ws, { position = '40,480', size = '1300,560' } = {}) {
  fs.mkdirSync(runDir(), { recursive: true });
  if (await ping(APP_PORT) !== 200) {
    const p = spawn('node', ['src/server.js'], { cwd: ws, env: { ...process.env, PORT: String(APP_PORT) }, detached: true, stdio: 'ignore' });
    fs.writeFileSync(pidFile('server'), String(p.pid)); p.unref();
    await until(async () => (await ping(APP_PORT)) === 200);
  }
  if (await ping(CDP_PORT, '/json/version') !== 200) {
    const p = spawn(CHROME, ['--no-sandbox', '--test-type', '--disable-gpu', '--disable-infobars', '--disable-features=Translate,MediaRouter', '--no-first-run', '--no-default-browser-check',
      `--user-data-dir=${path.join(runDir(), 'chrome-profile')}`, `--remote-debugging-port=${CDP_PORT}`,
      `--window-position=${position}`, `--window-size=${size}`, `--app=http://127.0.0.1:${APP_PORT}/`],
      { detached: true, stdio: 'ignore', env: { ...process.env, GOOGLE_API_KEY: 'no', GOOGLE_DEFAULT_CLIENT_ID: 'no', GOOGLE_DEFAULT_CLIENT_SECRET: 'no' } });
    fs.writeFileSync(pidFile('chrome'), String(p.pid)); p.unref();
    await until(async () => (await ping(CDP_PORT, '/json/version')) === 200, 15000);
    await sleep(1200);
  }
}

/** Connect to the popped-up window. Close the returned browser when done (it only drops the connection). */
async function appPage() {
  const { chromium } = require(path.resolve(__dirname, '../../node_modules/playwright-core'));
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith(`http://127.0.0.1:${APP_PORT}`)) || browser.contexts()[0].pages()[0];
  return { browser, page };
}

function stopApp() {
  killPid(pidFile('chrome'));
  killPid(pidFile('server'));
}

module.exports = { ensureApp, appPage, stopApp, APP_PORT, CDP_PORT };
