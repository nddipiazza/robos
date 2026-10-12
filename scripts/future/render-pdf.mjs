#!/usr/bin/env node
// Print an HTML file to PDF with the Chromium that ships with Playwright.
//   node scripts/future/render-pdf.mjs <in.html> <out.pdf> "<footer text>"
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const [, , input, output, footer = ''] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('file://' + resolve(input), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const style = "font-family: Inter, 'Liberation Sans', Arial, sans-serif; font-size: 7.5pt; color: #6b7280; width: 100%; padding: 0 0.8in;";
await page.pdf({
  path: output,
  preferCSSPageSize: true,
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="${style} display:flex; justify-content:space-between;"><span>${footer}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  tagged: true,
  outline: true,
});
await browser.close();
console.log('wrote', output);
