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

const prose = (id, eyebrow, title, intro, html) => `<section class="guide-chapter" id="${id}"><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2><p class="chapter-intro">${intro}</p>${html}</section>`;
const table = (head, rows) => `<table class="guide-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const start = prose('start', 'Step 1', 'Install it and open your first shop', 'It is a normal RobOS app. You can also run it on any computer with Node.js, with no account and no internet connection.', `<ol class="guide-list">
<li><b>Open it.</b> Launch <em>RobOS Point of Sale</em> from the App Launcher, or run <code>cd packages/point-of-sale &amp;&amp; npm install &amp;&amp; npm start</code>.</li>
<li><b>Pick a starting point.</b> On first launch choose <em>Clothing store</em>, <em>Coffee shop</em> or <em>Bar</em> to get a ready-made menu, stock, taxes and team. You can edit everything afterwards, or replace it with another sample from <em>Settings</em>.</li>
<li><b>Sign in with a PIN.</b> The samples use owner <code>1111</code>, manager <code>2222</code> and cashier <code>3333</code>. Add your own team in <em>Team &amp; API</em> and retire the sample PINs before real use.</li>
<li><b>Open the drawer.</b> Go to <em>Cash</em>, count your starting cash, type it on the number pad and press <em>Open drawer</em>. Card sales do not need the drawer; cash sales do.</li>
<li><b>Ring a sale.</b> On the <em>Register</em> tap items (or scan them), press <em>Pay</em>, choose cash or card. The receipt appears with any change due.</li></ol>
<p>Your data lives in one file, <code>~/.config/robos/point-of-sale/store.json</code>, readable only by you. Back it up by copying it.</p>`);

const roles = prose('roles', 'Step 2', 'Who can do what', 'Every team member signs in with a 4 to 8 digit PIN. Lower roles can borrow a manager for a single action without switching users.', table(['Role', 'Everyday work', 'Also allowed'], [
  ['<b>Cashier / server</b>', 'Sell, hold tabs, take cash and card, discounts up to the limit, prep screen, open and close their own drawer', '—'],
  ['<b>Manager</b>', 'Everything a cashier does', 'Refunds, comps, voiding sent items, big discounts, paid in / paid out, receiving and counting stock, reports, <b>cash payment settings</b>, closing a drawer that is over or short'],
  ['<b>Admin</b>', 'Everything a manager does', 'Menu and catalog, taxes, promo codes, happy-hour rules, team, API keys, settings, loading samples']]) + '<p>When a cashier taps something that needs a manager (a refund, a comp, a 40% discount), a PIN pad appears. The manager types their PIN, the action goes through, and the approval is recorded in the audit log next to the cashier\'s name. Five wrong PINs in a row lock the sign-in screen for a minute.</p>');

const screens = prose('screens', 'Step 3', 'The screens', 'Each screen is built for fingers: large buttons, an on-screen number pad for PINs, cash and quantities, and no tiny controls. Text fields such as item names use the device\'s own on-screen keyboard.', table(['Screen', 'What you do there'], [
  ['<b>Register</b>', 'Choose the order type (dine in, take-out, tab, retail), tap items, pick sizes and options, apply promo codes or discounts, add a tip, check ID, send to the kitchen or bar, hold, void or pay. Pay supports exact change, quick-tender buttons, split by 2, 3 or 4, or by item.'],
  ['<b>Tabs</b>', 'Open tabs and self-checkout orders waiting to be paid. Tap one to carry on. Type an order number to find a customer\'s order.'],
  ['<b>Prep</b>', 'One screen per station (kitchen, barista, bar). Start, Ready, Picked up. The customer-facing board at <code>/ready</code> shows numbers that are ready.'],
  ['<b>Orders</b>', 'Recent orders and receipts. Open one to refund items (a manager approves) and put returned items back in stock.'],
  ['<b>Inventory</b>', 'Receive a delivery, count the shelf (a reason is required), add stock items, import a CSV, spot low stock. Food and drink recipes use ingredients up automatically.'],
  ['<b>Menu &amp; Catalog</b>', 'Items with sizes, barcodes and prep stations; option groups such as Size and Milk; categories; taxes; promo codes; happy-hour rules. Hiding an item keeps its history.'],
  ['<b>Cash</b>', 'Open and close the drawer, paid in and paid out, and the cash payment settings.'],
  ['<b>Reports</b>', 'Sales by category, tender and item for today or all time, drawer history, CSV export.'],
  ['<b>Team &amp; API</b>', 'Add or deactivate team members and create checkout API keys.'],
  ['<b>Settings</b>', 'Business name and type, tax included in prices or added on top, tipping, card provider, self-checkout options, stock rules, and sample businesses.']]));

const cashAdmin = prose('cash-admin', 'Step 4', 'Setting up cash payments', 'Managers and admins decide how cash behaves. Open <em>Cash</em> and scroll to <em>Cash payment settings</em>.', table(['Setting', 'What it does'], [
  ['Accept cash payments', 'Turn off for a card-only shop. The Cash button disappears from the pay sheet and the server refuses cash.'],
  ['Require an open drawer', 'On by default. Cash sales and cash refunds need a counted drawer so the day always balances.'],
  ['Cash rounding', 'None, or nearest 5, 10, 25 cents or $1 for places without pennies. The rounding shows as its own line on the receipt and in the Z-report.'],
  ['Quick-tender buttons', 'Up to six dollar amounts shown on the pay sheet, plus Exact and the next whole dollar.'],
  ['Largest cash tender', 'Guards against a typo like $5000 instead of $50.'],
  ['Over/short limit', 'How far off a cashier\'s count may be before a manager has to approve closing the drawer.'],
  ['Bills and coins counted', 'The denominations shown as tap-to-count buttons when closing. The count is blind: cashiers do not see the expected total until they have counted.']]) + '<p>End of shift: <em>Cash &rarr; Count &amp; close drawer</em>, tap the bills and coins, press <em>Close drawer</em>. The Z-report shows expected, counted and over or short, plus the day\'s sales.</p>');

const kiosk = prose('self-checkout', 'Step 5', 'Self-checkout and customer displays', 'Self-checkout is a customer-facing page that only does one thing: build a basket and pay. It cannot see staff data, prices of hidden items, or other customers\' orders.', `<ul class="guide-list">
<li><b>Open it</b> from <em>RobOS Point of Sale &rarr; Open self-checkout window</em>, or browse to <code>/kiosk</code>. For a dedicated screen, start the app with <code>--kiosk</code>.</li>
<li><b>A tablet on the shop network.</b> Run <code>node serve.js --host 0.0.0.0</code> on the till computer and open <code>http://&lt;till-ip&gt;:3410/kiosk</code> on the tablet. There is no encryption on this connection, so use a network you trust.</li>
<li><b>Retail:</b> a scan box accepts a barcode scanner that types into a field. <b>Food:</b> big icon tiles, required choices, tips.</li>
<li><b>Paying.</b> Card is shown only when the card provider can run unattended (a gateway, not a standalone terminal where a worker types the approval code). <em>Pay at the counter</em> gives the customer a number; the cashier finds it under <em>Tabs</em> and takes cash.</li>
<li><b>Safety.</b> Age-restricted items are never offered, and the server rejects them even if someone calls the API directly. Baskets nobody paid for are cleared after 30 minutes. Switch self-checkout off, or turn off pay-at-the-counter, in <em>Settings</em>.</li>
<li><b>Order-ready board.</b> Put <code>/ready</code> on a second screen; it shows pick-up numbers as the kitchen marks them ready.</li></ul>`);

const limits = prose('limits', 'Good to know', 'What it does not do yet', 'Being honest about the edges saves surprises on opening day.', `<ul class="guide-list">
<li><b>Card processing.</b> The built-in card options are a standalone terminal (you key in its approval code) and a demo gateway that approves any card, which must never be used for real sales. To take cards online or unattended, add a provider for your processor; the README shows the small interface.</li>
<li><b>Tax.</b> A flat rate per item, either added on top or already included in prices. There is no address-based lookup, so confirm your local rules.</li>
<li><b>Hardware.</b> Barcode scanners that type into a text box work. Receipts print through the system print dialog and are also available as plain text for ESC/POS printers. There are no direct cash-drawer or printer drivers yet.</li>
<li><b>Not included yet:</b> gift cards, loyalty, several locations syncing together, staff time clocks.</li>
<li><b>Backups.</b> One shop file on one computer. Copy it regularly.</li></ul>`);

const api = `<section class="guide-chapter" id="checkout-api"><p class="eyebrow">For developers</p><h2>The open checkout API</h2><p class="chapter-intro">Websites, apps and agents can create a checkout session, update it, and complete it with a payment token. The shape follows the open Agentic Commerce Protocol checkout flow; amounts are whole cents and retries are safe with an <code>Idempotency-Key</code>. Card payments go through a plug-in provider, so the register never touches card numbers. The OpenAPI document is served at <code>/api/openapi.json</code>.</p>
<h3>Endpoints</h3>${table(['Method and path', 'Purpose'], [
  ['<code>POST /api/v1/checkout_sessions</code>', 'Create a session from <code>items</code> (id, SKU or barcode, <code>quantity</code>, optional <code>variant_id</code> and <code>modifiers</code>), optional <code>buyer</code> and <code>fulfillment_option_id</code>. Returns 201.'],
  ['<code>GET /api/v1/checkout_sessions/{id}</code>', 'Current status, line items and totals.'],
  ['<code>POST /api/v1/checkout_sessions/{id}</code>', 'Change items, buyer, fulfillment option or add a promo <code>code</code>.'],
  ['<code>POST /api/v1/checkout_sessions/{id}/complete</code>', 'Pay with <code>payment_data.token</code> (and <code>provider</code>). A declined card returns 402 and the session stays open.'],
  ['<code>POST /api/v1/checkout_sessions/{id}/cancel</code>', 'Cancel an unpaid session.']])}<p>Status moves <code>not_ready_for_payment</code> &rarr; <code>ready_for_payment</code> &rarr; <code>completed</code> (or <code>canceled</code>). Totals come back as a list of <code>items_base_amount</code>, <code>subtotal</code>, <code>tax</code> and <code>total</code> in cents. Age-restricted items are refused at completion. Send <code>Authorization: Bearer &lt;key&gt;</code>; create keys in <em>Team &amp; API</em>. This follows the shape of the Agentic Commerce Protocol checkout flow but is not a certified implementation, so test an agent against it before relying on it.</p>
<pre class="guide-code" style="overflow:auto;padding:14px;border:1px solid var(--line);border-radius:10px;font-size:.85rem"><code>curl -X POST http://127.0.0.1:3410/api/v1/checkout_sessions \\
  -H "Authorization: Bearer $POS_KEY" -H "Content-Type: application/json" \\
  -d '{"items":[{"id":"&lt;item id, SKU or barcode&gt;","quantity":2}],"fulfillment_option_id":"takeout"}'

curl -X POST http://127.0.0.1:3410/api/v1/checkout_sessions/&lt;id&gt;/complete \\
  -H "Authorization: Bearer $POS_KEY" -H "Idempotency-Key: order-1001" -H "Content-Type: application/json" \\
  -d '{"payment_data":{"token":"tok_visa","provider":"mock"}}'</code></pre></section>`;

const toc = [['start', 'Install it and open your first shop'], ['roles', 'Who can do what'], ['screens', 'The screens'], ['cash-admin', 'Setting up cash payments'], ['self-checkout', 'Self-checkout and customer displays'], ...CHAPTERS.map(c => [c.id, c.title]), ['checkout-api', 'The open checkout API'], ['limits', 'What it does not do yet']].map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('');
const guideCss = `<style>.guide-table{width:100%;border-collapse:collapse;margin:14px 0}.guide-table th,.guide-table td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line)}.guide-table th{color:var(--muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.05em}.guide-list{padding-left:20px;line-height:1.6}.guide-list li{margin:8px 0}</style>`;
const page = `---
layout: default
title: Point of Sale
permalink: /point-of-sale/
body_class: guide
extra_css: /assets/auto-guide.css
description: "RobOS Point of Sale: an open-source cash register for shops, cafés and bars. Touchscreen order entry, self-checkout, inventory, cash drawer controls and an open checkout API, tested for a clothing store, a coffee shop and a bar."
---
${guideCss}
<section class="hero" style="padding-bottom:24px"><div class="wrap">
<span class="pill"><b>RobOS Point of Sale</b> · Retail, food service and bars</span>
<h1>An open-source cash register that runs on any touchscreen</h1>
<p class="lead">Take orders, scan items, split checks, run self-checkout, track stock and count the drawer, with no subscription and no cloud account. Your data stays in one file on your own machine. This guide is built from the project's own tests: ${apiTotal} checked against the real server and ${uiTotal} tapped through in a touch-enabled browser, across a clothing store, a coffee shop and a bar. Screenshots come from those runs, using labelled test data.</p>
<div class="cta"><a class="btn" href="#start">Get started</a><a class="btn btn-ghost" href="#clothing">See the three sample businesses</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/packages/point-of-sale">Source code</a></div>
</div></section>
<section style="padding-top:24px"><div class="wrap">
<ol class="flow"><li><b>Set up</b><span>Menu, stock, team</span></li><li><b>Sell</b><span>Tap, scan or self-checkout</span></li><li><b>Get paid</b><span>Cash, card, split</span></li><li><b>Prepare</b><span>Kitchen, barista, bar</span></li><li><b>Close</b><span>Count the drawer</span></li><li><b>Review</b><span>Reports and refunds</span></li></ol>
<div class="guide-layout"><nav class="guide-toc" aria-label="Guide contents"><h4>In this guide</h4><ol>${toc}</ol></nav><div class="guide-body">
${start}
${roles}
${screens}
${cashAdmin}
${kiosk}
${body}
${api}
${limits}
</div></div></div></section>
`;
fs.writeFileSync(outPage, page);
console.log(`Wrote ${path.relative(repo, outPage)} (${apiTotal} API + ${uiTotal} touchscreen scenarios) and assets in ${path.relative(repo, outAssets)}`);
