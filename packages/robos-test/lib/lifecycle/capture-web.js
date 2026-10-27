'use strict';
/**
 * Captures one evidence scenario in a real browser: runs the Pawfinder dev server from
 * the base checkout (before) and from the branch (after), does the same action on both,
 * and saves a screenshot of each plus what the page showed.
 *
 *   node capture-web.js '<json: {baseDir, headDir, outDir, scenario}>'
 * Prints one JSON line: { before: {file, shown}, after: {file, shown} }.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require(path.resolve(__dirname, '../../node_modules/playwright-core'));

const CHROME = process.env.FAKE_CHROME || '/opt/pw-browsers/chromium';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ping = (port) => new Promise(res => { const r = http.get({ host: '127.0.0.1', port, path: '/', timeout: 500 }, x => { x.resume(); res(x.statusCode === 200); }); r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); });

async function serve(dir, port) {
  const child = spawn('node', ['src/server.js'], { cwd: dir, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await ping(port)); i++) await sleep(100);
  return child;
}

/** Do the scenario's action on the page; returns a one-line account of what it shows. */
async function act(page, base, steps) {
  if (steps.url) {
    const status = (await page.goto(base + steps.url)).status();
    const text = (await page.textContent('body')).trim();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return `HTTP ${status}, ${data.length} pets returned: ${data.map(p => p.name).join(', ')}`;
      if (data.error) return `HTTP ${status}, error: ${data.error}`;
    } catch { /* not JSON */ }
    return text.slice(0, 400);
  }
  await page.goto(base + '/');
  await page.waitForSelector('.pet');
  const notes = [];
  if (steps.species) {
    if (await page.$('#species')) await page.selectOption('#species', steps.species);
    else if (await page.$('#chips')) await page.click(`#chips button[data-s="${steps.species}"]`);
    else notes.push('no species control on this page');
  }
  if (steps.q !== undefined) await page.fill('#q', steps.q);
  await sleep(500);   // the page searches as you type
  const names = await page.$$eval('.pet b', els => els.map(e => e.textContent));
  return (notes.length ? notes.join('; ') + '. ' : '') + `${names.length} shown: ${names.join(', ') || '(none)'}`;
}

(async () => {
  const { baseDir, headDir, outDir, scenario } = JSON.parse(process.argv[2]);
  const ports = { before: 4300 + Math.floor(Math.random() * 300), after: 4700 + Math.floor(Math.random() * 300) };
  const servers = [await serve(baseDir, ports.before), await serve(headDir, ports.after)];
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const out = {};
  try {
    for (const side of ['before', 'after']) {
      const page = await browser.newPage({ viewport: { width: 1040, height: 600 } });
      const shown = await act(page, `http://127.0.0.1:${ports[side]}`, scenario.steps);
      const file = path.join(outDir, `${scenario.id}-${side}.png`);
      await page.screenshot({ path: file });
      await page.close();
      out[side] = { file, shown };
    }
  } finally {
    await browser.close();
    for (const s of servers) s.kill();
  }
  console.log(JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
