#!/usr/bin/env node
// Rasterise an SVG (or any local page) with the Chromium that ships with Playwright.
//   node scripts/future/shot.mjs <in.svg|html> <out.png> [width] [fontOverride]
// Pass an http(s) URL to shoot a served page; a 5th argument 'light' or 'dark' sets the site theme.
// fontOverride, e.g. "DejaVu Sans", forces a wider fallback font so we can check that text still
// fits for viewers whose system lacks Inter (an SVG shown via <img> cannot load page web fonts).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const [, , input, output, widthArg, font, theme] = process.argv;
const width = parseInt(widthArg || '1600', 10);
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
let url = /^https?:/.test(input) ? input : 'file://' + resolve(input);
if (theme) await page.addInitScript((t) => { try { localStorage.setItem('rb2-theme', t); } catch (e) {} }, theme);
if (input.endsWith('.svg') && !/^https?:/.test(input)) {
  let svg = readFileSync(input, 'utf8');
  if (font) svg = svg.replace(/font-family="[^"]*"/g, `font-family="${font}"`);
  await page.setContent(`<html><body style="margin:0;background:#888"><div style="width:${width}px">${svg.replace(/width="\d+" height="\d+"/, 'width="100%"')}</div></body></html>`);
} else {
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
}
await page.screenshot({ path: output, fullPage: true });
await browser.close();
console.log('wrote', output);
