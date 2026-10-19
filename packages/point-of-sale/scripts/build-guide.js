#!/usr/bin/env node
'use strict';
// Builds rowbose.com/point-of-sale from the real test titles and the screenshots the browser suites save.
//   POS_PROOF_DIR=.proof npm run test:e2e && node scripts/build-guide.js
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const businessGuide = require('./business-guide');
const businesses = require('../guide/businesses.json');
businessGuide.validate(businesses);

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const proof = process.env.POS_PROOF_DIR || path.join(root, '.proof');
const outPage = path.join(repo, 'site', 'point-of-sale.html');
const outAssets = path.join(repo, 'site', 'assets', 'point-of-sale');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const titles = file => [...fs.readFileSync(path.join(root, 'tests', file), 'utf8').matchAll(/^test\('((?:[^'\\]|\\.)*)'/gm)].map(m => m[1].replace(/\\'/g, "'"));


// ---- scanning chapter extras ----
const scanFlow = `<figure class="guide-diagram" style="margin:20px 0"><svg viewBox="0 0 800 250" role="img" aria-labelledby="flow-t flow-d" style="width:100%;height:auto;color:inherit" font-family="system-ui,sans-serif" font-size="15"><title id="flow-t">How a scan becomes a sale</title><desc id="flow-d">A barcode gun, a webcam and a shopper at self-checkout all send a code to the register, which works out the product from it and adds it to the order.</desc>
<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>
<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
<rect x="10" y="20" width="200" height="58" rx="10"/><rect x="10" y="96" width="200" height="58" rx="10"/><rect x="10" y="172" width="200" height="58" rx="10"/>
<path d="M210 49h60M210 125h60M210 201h60" marker-end="url(#arr)" opacity=".55"/><path d="M270 49v152M270 125h20" opacity=".55"/>
<rect x="290" y="88" width="210" height="74" rx="10"/><path d="M500 125h50" marker-end="url(#arr)"/>
<rect x="550" y="88" width="240" height="74" rx="10"/></g>
<g fill="currentColor" text-anchor="middle"><text x="110" y="45" font-weight="600">Barcode gun</text><text x="110" y="65" opacity=".7">types the code + Enter</text>
<text x="110" y="121" font-weight="600">Webcam on the till</text><text x="110" y="141" opacity=".7">reads 1D and 2D codes</text>
<text x="110" y="197" font-weight="600">Self-checkout camera</text><text x="110" y="217" opacity=".7">shopper scans a tag</text>
<text x="395" y="119" font-weight="600">Work out the product</text><text x="395" y="140" opacity=".7">any padding, any format</text>
<text x="670" y="119" font-weight="600">Line added to the order</text><text x="670" y="140" opacity=".7">with the right size</text></g></svg>
<figcaption style="color:var(--muted);font-size:.9rem">Every path ends in the same lookup, so a product can be printed as a UPC, an EAN or a QR code and still be found.</figcaption></figure>`;

const scanTable = `<table class="guide-table"><thead><tr><th>What you scan</th><th>What it contains</th><th>How the register uses it</th></tr></thead><tbody>
<tr><td><b>UPC-A / EAN-13 / EAN-8</b> barcode</td><td>A product number (GTIN)</td><td>Matched however it was printed: a UPC-A, the same number as an EAN-13 with a leading zero, or a 14-digit GTIN are one product.</td></tr>
<tr><td><b>UPC-E</b> small-package barcode</td><td>A compressed UPC-A</td><td>Expanded to the full UPC-A before matching.</td></tr>
<tr><td><b>QR code with a GS1 Digital Link</b></td><td>A web address such as <code>https://id.gs1.org/01/09506000134352/10/LOT7</code></td><td>The GTIN in the address is the product. Lot and serial numbers are ignored for pricing.</td></tr>
<tr><td><b>Data Matrix</b> (GS1)</td><td>A GTIN followed by lot or expiry data, e.g. <code>01&hellip;10LOT-7</code></td><td>The GTIN is the product.</td></tr>
<tr><td><b>QR or Aztec code with your own text</b></td><td>A SKU you made up, such as <code>HM-MUG</code></td><td>Matched to the SKU (or barcode field) of an item.</td></tr>
<tr><td><b>Sized goods</b></td><td>A barcode that belongs to one size</td><td>Adds that exact size. A code that names only the product asks the shopper or cashier to choose a size.</td></tr>
<tr><td><b>Anything else</b> (a web address, a code not in the catalog)</td><td>&mdash;</td><td>Nothing is added, and the screen says so.</td></tr></tbody></table>`;

const scanWays = `<ol class="guide-list"><li><b>Barcode gun (USB or Bluetooth).</b> Most scanners act like a keyboard: they type the code and press Enter. Click the scan box on the Register (it is focused for you in a retail shop) and scan. No setup.</li>
<li><b>Webcam.</b> Press the camera button. Choose the camera if you have more than one, hold the barcode or QR code in front of it, and wait for the beep. A code held in view counts once; take it away and show it again to add another.</li>
<li><b>Self-checkout.</b> The same two options, for shoppers: the scan box for a gun, or the camera button.</li>
<li><b>Adding products.</b> On <em>Menu &amp; Catalog &rarr; Add item</em>, press the camera button next to the barcode field and scan the package. A Digital Link QR is saved as the plain product number.</li></ol>
<p>Cameras only work on <code>localhost</code> or an <code>https://</code> address, and the desktop app asks for video access only. A tablet opening the till over plain <code>http://</code> on the shop network should use a barcode gun instead.</p>`;

const CHAPTERS = [
  {
    id: 'retail', eyebrow: 'Sample 1 · Retail', title: 'Retail store', api: 'retail.api.test.js', ui: 'retail.e2e.js',
    intro: 'Main Street General Store stands in for any shop that sells things on shelves: apparel in sizes, home goods, electronics, groceries and stationery. Sized goods carry a barcode per size; plain goods have one barcode; groceries can be tax-exempt while everything else is taxed. Scan a tag or tap an item, apply promo codes, take returns and exchanges, and let shoppers scan their own items at the self-checkout. The same screens work for a hardware store, a bookshop, a pharmacy counter or a market stall.',
    shots: [['retail-register-promo', 'Scan or tap items, pick a size, apply a promo code'], ['retail-manager-override', 'A cashier cannot refund alone: a manager types their PIN on the spot'], ['retail-receipt', 'Cash sale with change due and the receipt'], ['retail-inventory', 'Inventory input: new stock, deliveries, shelf counts, CSV import'], ['retail-catalog-editor', 'Add a product with sizes; barcodes are check-digit validated, or scanned with the camera'], ['retail-kiosk-cart', 'Self-checkout: the shopper picks a size and pays'], ['retail-reports', 'Sales by category and tender']],
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
    id: 'scanning', eyebrow: 'Retail and anywhere with a shelf', title: 'Barcodes, QR codes and the webcam', api: null, ui: 'camera.e2e.js',
    intro: 'Plug in any barcode gun or use a webcam. The camera reads the classic UPC and EAN barcodes and the newer 2D codes: QR codes (including GS1 Digital Link, which carries a product number as a web address), Data Matrix and Aztec. However a code was printed, the register works out which product it means.',
    extra: () => `${scanFlow}<h3>Three ways to scan</h3>${scanWays}<h3>What you can scan</h3>${scanTable}<h3>Seen in the app</h3><p class="chapter-intro">Each picture below is a real screenshot from the automated tests: a generated code is played into a test webcam and the register reads it. (Cameras for the pictures are simulated; the decoding and the register are real.)</p>`,
    shots: [['retail-scan-gun', 'A barcode gun types into the scan box and the item is added'], ['retail-camera-upc', 'Webcam: a classic UPC-A barcode'], ['retail-camera-ean13', 'Webcam: the same product as an EAN-13 (UPC-A with a leading zero)'], ['retail-camera-ean8', 'Webcam: an EAN-8 on a small package'], ['retail-camera-qr', 'Webcam: a QR code holding a GS1 Digital Link'], ['retail-camera-datamatrix', 'Webcam: a GS1 Data Matrix with a lot number'], ['retail-camera-aztec', 'Webcam: an Aztec code holding a SKU'], ['retail-camera-sku-qr', 'Webcam: a QR code holding your own SKU'], ['retail-camera-size', 'A barcode that names one size adds exactly that size'], ['retail-camera-unknown', 'A code that is not in the catalog is explained, nothing is added'], ['retail-kiosk-camera', 'Self-checkout: a shopper scans a tag'], ['retail-camera-item-form', 'Adding a product: the camera fills in the barcode field']],
  },
  {
    id: 'cash', eyebrow: 'Every business', title: 'The cash drawer and cash settings', api: null, ui: null,
    intro: 'Cash is handled the way a till is: a counted float at the start, paid-in and paid-out entries with a reason, a blind count by bill and coin at the end, and a Z-report that shows over or short. Managers decide whether cash is accepted at all, whether prices round to the nearest 5 cents, what the quick-tender buttons are, and how much over/short a cashier may close without a manager. Use the business tutorials above to try a sample sale, then follow the drawer setup below.',
    shots: [['coffee-cash-admin', 'Cash payment settings (manager)'], ['coffee-count-drawer', 'Counting the drawer with bill and coin buttons']],
  },
];

fs.mkdirSync(outAssets, { recursive: true });
const haveConvert = (() => { try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
function publish(name) {
  const src = path.join(proof, `${name}.png`);
  if (!fs.existsSync(src)) {
    const ext = ['jpg', 'png'].find(ext => fs.existsSync(path.join(outAssets, `${name}.${ext}`)));
    return ext ? `/assets/point-of-sale/${name}.${ext}` : null;
  }
  const ext = haveConvert ? 'jpg' : 'png';
  const dest = path.join(outAssets, `${name}.${ext}`);
  if (haveConvert) execFileSync('convert', [src, '-strip', '-quality', '82', dest]); else fs.copyFileSync(src, dest);
  return `/assets/point-of-sale/${name}.${ext}`;
}
const url = p => `{{ '${p}' | relative_url }}`;

let apiTotal = 0, uiTotal = 0;
const body = CHAPTERS.filter(c => !businesses.some(b => b.id === c.id)).map((c, i) => {
  const api = c.api ? titles(c.api) : [], ui = c.ui ? titles(c.ui) : [];
  apiTotal += api.length; uiTotal += ui.length;
  const shots = c.shots.map(([name, caption]) => { const p = publish(name); return p ? `<figure class="guide-shot"><a href="${url(p)}"><img src="${url(p)}" alt="${esc(caption)}" loading="lazy" width="1280" height="800"></a><figcaption>${esc(caption)}</figcaption></figure>` : ''; }).join('');
  const list = (label, items) => items.length ? `<details class="guide-steps"><summary>${label} (${items.length})</summary><ol>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>` : '';
  return `<section class="guide-chapter" id="${c.id}"><p class="eyebrow">${esc(c.eyebrow)}</p><h2>${esc(c.title)}</h2><p class="chapter-intro">${esc(c.intro)}</p>
${c.extra ? c.extra() : ''}<div class="guide-shots">${shots}</div>
${list('Use cases checked against the real server', api)}${list('Use cases tapped through on a touchscreen browser', ui)}</section>`;
}).join('\n');

const prose = (id, eyebrow, title, intro, html) => `<section class="guide-chapter" id="${id}"><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2><p class="chapter-intro">${intro}</p>${html}</section>`;
const table = (head, rows) => `<table class="guide-table"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const start = prose('start', 'Step 1', 'Install it and open your first shop', 'It is a normal RobOS app. You can also run it on any computer with Node.js, with no account and no internet connection.', `<ol class="guide-list">
<li><b>Open it.</b> Launch <em>RobOS Point of Sale</em> from the App Launcher, or run <code>cd packages/point-of-sale &amp;&amp; npm install &amp;&amp; npm start</code>.</li>
<li><b>Pick a starting point.</b> On first launch choose <em>Retail store</em>, <em>Coffee shop</em> or <em>Bar</em> to get a ready-made menu, stock, taxes and team. You can edit everything afterwards, or replace it with another sample from <em>Settings</em>.</li>
<li><b>Sign in with a PIN.</b> The samples use owner <code>1111</code>, manager <code>2222</code> and cashier <code>3333</code>. Add your own team in <em>Team &amp; API</em> and retire the sample PINs before real use.</li>
<li><b>Open the drawer.</b> Go to <em>Cash</em>, count your starting cash, type it on the number pad and press <em>Open drawer</em>. Card sales do not need the drawer; cash sales do.</li>
<li><b>Ring a sale.</b> On the <em>Register</em> tap items (or scan them with a scanner or the camera), press <em>Pay</em>, choose cash or card. The receipt appears with any change due.</li></ol>
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
<li><b>Retail:</b> a scan box accepts a barcode scanner that types into a field, and a camera button reads barcodes and QR codes from a webcam. <b>Food:</b> big icon tiles, required choices, tips.</li>
<li><b>Paying.</b> Card is shown only when the card provider can run unattended (a gateway, not a standalone terminal where a worker types the approval code). <em>Pay at the counter</em> gives the customer a number; the cashier finds it under <em>Tabs</em> and takes cash.</li>
<li><b>Safety.</b> Age-restricted items are never offered, and the server rejects them even if someone calls the API directly. Baskets nobody paid for are cleared after 30 minutes. Switch self-checkout off, or turn off pay-at-the-counter, in <em>Settings</em>.</li>
<li><b>Order-ready board.</b> Put <code>/ready</code> on a second screen; it shows pick-up numbers as the kitchen marks them ready.</li></ul>`);

const limits = prose('limits', 'Good to know', 'What it does not do yet', 'Being honest about the edges saves surprises on opening day.', `<ul class="guide-list">
<li><b>Card processing.</b> The built-in card options are a standalone terminal (you key in its approval code) and a demo gateway that approves any card, which must never be used for real sales. To take cards online or unattended, add a provider for your processor; the README shows the small interface.</li>
<li><b>Tax.</b> A flat rate per item, either added on top or already included in prices. There is no address-based lookup, so confirm your local rules.</li>
<li><b>Hardware.</b> Barcode scanners that type into a text box work, and so does a webcam. The browser only allows camera use on <code>localhost</code> or an <code>https://</code> address, so a tablet that opens the till over plain <code>http://</code> on the shop network cannot use its camera; give it a hardware scanner or put the till behind HTTPS. Receipts print through the system print dialog and are also available as plain text for ESC/POS printers. There are no direct cash-drawer or printer drivers yet.</li>
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

const toc = [['start', 'Install it and open your first shop'], ['roles', 'Who can do what'], ['screens', 'The screens'], ['cash-admin', 'Setting up cash payments'], ['self-checkout', 'Self-checkout and customer displays'], ...CHAPTERS.filter(c => !businesses.some(b => b.id === c.id)).map(c => [c.id, c.title]), ['checkout-api', 'The open checkout API'], ['limits', 'What it does not do yet']].map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('');
const page = `---
layout: default
title: Point of Sale
permalink: /point-of-sale/
body_class: guide
extra_css: /assets/pos-guide.css?v=20261019
description: "RobOS Point of Sale: an open-source cash register for shops, cafés and bars. Touchscreen order entry, self-checkout, inventory, cash drawer controls and an open checkout API, tested for a retail store, a coffee shop and a bar."
---
<section class="hero pos-intro"><div class="wrap">
<span class="pill"><b>RobOS Point of Sale</b> · Retail, coffee shops and bars</span>
<h1>Your counter. Your business. Your point of sale.</h1>
<p class="lead">An open-source register for the way you work: scan a shelf item, build a custom coffee, or keep a tab open for the next round. Take orders, track stock, manage prep and count the drawer on your own computer.</p>
<p>No subscription or cloud account. A touchscreen interface, staff permissions, customer self-checkout and an open checkout API, with your shop data stored locally.</p>
<div class="cta"><a class="btn" href="#businesses">Find your business</a><a class="btn btn-ghost" href="#guide">RobOS Point of Sale Guide</a><a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/packages/point-of-sale">Source code</a></div>
</div></section>
<section id="businesses"><div class="wrap"><p class="eyebrow">Choose your starting point</p><h2>One register, three ways to run your counter</h2><p>Each business has its own sample shop, step-by-step tutorial and short video. Try the sample, then make the menu, team and settings your own.</p><nav class="pos-jump" aria-label="Business types">${businesses.map(b => `<a href="#${b.id}">${esc(b.title)}</a>`).join('')}</nav>
${businesses.map(businessGuide.section).join('\n')}
<div class="pos-guide-heading" id="guide"><p class="eyebrow">Shared setup and reference</p><h2>RobOS Point of Sale Guide</h2><p>Install the app, set up your team and payments, then use the reference below for cash, scanning, self-checkout and the checkout API. Sample card payments are demonstrations; configure a real payment workflow before trading.</p></div>
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
for (const b of businesses) {
  const dir = path.join(repo, 'site', 'point-of-sale', b.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), businessGuide.tutorial(b, businesses, publish));
}
console.log(`Wrote the Point of Sale overview, three business tutorials and assets in ${path.relative(repo, outAssets)}`);
