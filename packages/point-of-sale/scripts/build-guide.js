#!/usr/bin/env node
'use strict';
// Builds rowbose.com/point-of-sale from the real test titles and the screenshots the browser suites save.
//   POS_PROOF_DIR=.proof npm run test:e2e && node scripts/build-guide.js
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const proof = process.env.POS_PROOF_DIR || path.join(root, '.proof');
const outPage = path.join(repo, 'site', 'point-of-sale.html');
const outAssets = path.join(repo, 'site', 'assets', 'point-of-sale');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const titles = file => [...fs.readFileSync(path.join(root, 'tests', file), 'utf8').matchAll(/^test\('((?:[^'\\]|\\.)*)'/gm)].map(m => m[1].replace(/\\'/g, "'"));

const CHAPTERS = [
  {
    id: 'clothing', eyebrow: 'Sample 1 · Retail', title: 'Clothing store', api: 'clothing.api.test.js', ui: 'clothing.e2e.js',
    intro: 'Threadwell Clothing sells tees, jeans and jackets in sizes, each with its own barcode and stock count. Scan a tag or tap an item and pick a size. Promo codes, returns and exchanges are built in, and a shopper can scan their own items at the self-checkout.',
    shots: [['clothing-register-promo', 'Scan or tap items, pick a size, apply a promo code'], ['clothing-manager-override', 'A cashier cannot refund alone: a manager types their PIN on the spot'], ['clothing-receipt', 'Cash sale with change due and the receipt'], ['clothing-inventory', 'Inventory input: new stock, deliveries, shelf counts, CSV import'], ['clothing-catalog-editor', 'Add a product with sizes; barcodes are check-digit validated'], ['clothing-kiosk-cart', 'Self-checkout: the shopper scans a tag, picks a size and pays'], ['clothing-reports', 'Sales by category and tender']],
  },
  {
    id: 'coffee', eyebrow: 'Sample 2 · Food service', title: 'Coffee shop', api: 'coffee.api.test.js', ui: 'coffee.e2e.js',
    intro: 'Bean There Coffee sells drinks and food. A latte needs a size and a milk; extras cost extra. Every cup uses up beans, milk and a cup from stock. Paid orders appear on the barista and kitchen screens, and a customer-facing board shows the number when it is ready. Customers can order and pay themselves at the self-checkout.',
    shots: [['coffee-register-latte', 'Worker order entry with required choices and a tip'], ['coffee-pay-cash', 'Quick-tender cash buttons and change due'], ['coffee-prep-queue', 'The prep screen for the barista and kitchen'], ['coffee-ready', 'The order-ready board for customers'], ['coffee-kiosk-welcome', 'Self-checkout welcome screen'], ['coffee-kiosk-menu', 'Self-checkout menu with big touch targets'], ['coffee-kiosk-review', 'Check the order, add a tip, pay by card or at the counter'], ['coffee-menu-editor', 'Menu input: add an item and sell it immediately'], ['coffee-phone', 'The register also works on a phone-sized screen']],
  },
  {
    id: 'bar', eyebrow: 'Sample 3 · Bar', title: 'Bar', api: 'bar.api.test.js', ui: 'bar.e2e.js',
    intro: 'The Rusty Anchor runs on open tabs. Rounds are sent to the bar and the kitchen as they are ordered, happy-hour prices apply by themselves, and alcohol cannot be paid for until someone has checked ID. Comps and voids need a manager and a reason. Checks can be split by person or by item.',
    shots: [['bar-tab-register', 'An open tab with a round sent to the bar'], ['bar-open-tabs', 'Open tabs, ready to be picked up again'], ['bar-happy-hour', 'Happy-hour price applied automatically'], ['bar-split-payment', 'Split the check: part card, part cash'], ['bar-receipt', 'Closed tab with mixed taxes and a tip']],
  },
  {
    id: 'cash', eyebrow: 'Every business', title: 'The cash drawer and cash settings', api: null, ui: null,
    intro: 'Cash is handled the way a till is: a counted float at the start, paid-in and paid-out entries with a reason, a blind count by bill and coin at the end, and a Z-report that shows over or short. Managers decide whether cash is accepted at all, whether prices round to the nearest 5 cents, what the quick-tender buttons are, and how much over/short a cashier may close without a manager. The cash scenarios appear under each business above.',
    shots: [['coffee-cash-admin', 'Cash payment settings (manager)'], ['coffee-count-drawer', 'Counting the drawer with bill and coin buttons']],
  },
];

fs.mkdirSync(outAssets, { recursive: true });
const haveConvert = (() => { try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
function publish(name) {
  const src = path.join(proof, `${name}.png`);
  if (!fs.existsSync(src)) return null;
  const ext = haveConvert ? 'jpg' : 'png';
  const dest = path.join(outAssets, `${name}.${ext}`);
  if (haveConvert) execFileSync('convert', [src, '-strip', '-quality', '82', dest]); else fs.copyFileSync(src, dest);
  return `/assets/point-of-sale/${name}.${ext}`;
}
const url = p => `{{ '${p}' | relative_url }}`;

let apiTotal = 0, uiTotal = 0;
const body = CHAPTERS.map((c, i) => {
  const api = c.api ? titles(c.api) : [], ui = c.ui ? titles(c.ui) : [];
  apiTotal += api.length; uiTotal += ui.length;
  const shots = c.shots.map(([name, caption]) => { const p = publish(name); return p ? `<figure class="guide-shot"><a href="${url(p)}"><img src="${url(p)}" alt="${esc(caption)}" loading="lazy" width="1280" height="800"></a><figcaption>${esc(caption)}</figcaption></figure>` : ''; }).join('');
  const list = (label, items) => items.length ? `<details class="guide-steps"><summary>${label} (${items.length})</summary><ol>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>` : '';
  return `<section class="guide-chapter" id="${c.id}"><p class="eyebrow">${esc(c.eyebrow)}</p><h2>${esc(c.title)}</h2><p class="chapter-intro">${esc(c.intro)}</p>
<div class="guide-shots">${shots}</div>
${list('Use cases checked against the real server', api)}${list('Use cases tapped through on a touchscreen browser', ui)}</section>`;
}).join('\n');

const api = `<section class="guide-chapter" id="checkout-api"><p class="eyebrow">For developers</p><h2>The open checkout API</h2><p class="chapter-intro">Websites, apps and agents can create a checkout session, update it, and complete it with a payment token. The shape follows the open Agentic Commerce Protocol checkout flow; amounts are whole cents and retries are safe with an <code>Idempotency-Key</code>. Card payments go through a plug-in provider, so the register never touches card numbers. The OpenAPI document is served at <code>/api/openapi.json</code>.</p>
<pre class="guide-code" style="overflow:auto;padding:14px;border:1px solid var(--line);border-radius:10px;font-size:.85rem"><code>curl -X POST http://127.0.0.1:3410/api/v1/checkout_sessions \\
  -H "Authorization: Bearer $POS_KEY" -H "Content-Type: application/json" \\
  -d '{"items":[{"id":"&lt;item id, SKU or barcode&gt;","quantity":2}],"fulfillment_option_id":"takeout"}'

curl -X POST http://127.0.0.1:3410/api/v1/checkout_sessions/&lt;id&gt;/complete \\
  -H "Authorization: Bearer $POS_KEY" -H "Idempotency-Key: order-1001" -H "Content-Type: application/json" \\
  -d '{"payment_data":{"token":"tok_visa","provider":"mock"}}'</code></pre></section>`;

const toc = [...CHAPTERS.map(c => [c.id, c.title]), ['checkout-api', 'The open checkout API']].map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('');
const page = `---
layout: default
title: Point of Sale
permalink: /point-of-sale/
body_class: guide
extra_css: /assets/auto-guide.css
description: "RobOS Point of Sale: an open-source cash register for shops, cafés and bars. Touchscreen order entry, self-checkout, inventory, cash drawer controls and an open checkout API, tested for a clothing store, a coffee shop and a bar."
---
<section class="hero" style="padding-bottom:24px"><div class="wrap">
<span class="pill"><b>RobOS Point of Sale</b> · Retail, food service and bars</span>
<h1>An open-source cash register that runs on any touchscreen</h1>
<p class="lead">Take orders, scan items, split checks, run self-checkout, track stock and count the drawer, with no subscription and no cloud account. Your data stays in one file on your own machine. This guide is built from the project's own tests: ${apiTotal} checked against the real server and ${uiTotal} tapped through in a touch-enabled browser, across a clothing store, a coffee shop and a bar. Screenshots come from those runs, using labelled test data.</p>
<div class="cta"><a class="btn" href="#clothing">See the three sample businesses</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/packages/point-of-sale">Source code</a></div>
</div></section>
<section style="padding-top:24px"><div class="wrap">
<ol class="flow"><li><b>Set up</b><span>Menu, stock, team</span></li><li><b>Sell</b><span>Tap, scan or self-checkout</span></li><li><b>Get paid</b><span>Cash, card, split</span></li><li><b>Prepare</b><span>Kitchen, barista, bar</span></li><li><b>Close</b><span>Count the drawer</span></li><li><b>Review</b><span>Reports and refunds</span></li></ol>
<div class="guide-layout"><nav class="guide-toc" aria-label="Guide contents"><h4>In this guide</h4><ol>${toc}</ol></nav><div class="guide-body">
${body}
${api}
</div></div></div></section>
`;
fs.writeFileSync(outPage, page);
console.log(`Wrote ${path.relative(repo, outPage)} (${apiTotal} API + ${uiTotal} touchscreen scenarios) and assets in ${path.relative(repo, outAssets)}`);
