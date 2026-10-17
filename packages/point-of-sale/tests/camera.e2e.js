'use strict';
// Webcam scanning, end to end: a generated barcode / QR code is played into Chromium as a fake webcam and the real
// register, self-checkout and item form decode and use it. 1D (UPC/EAN) and modern 2D codes (QR with GS1 Digital Link,
// Data Matrix, Aztec) are covered. Code 128/39, ITF, Codabar and PDF417 are decoded by the same library but have no
// fixture generator here, so they are not exercised by these tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launch } = require('./browser');
const { PointOfSale } = require('../lib/pos');
const { loadSample } = require('../lib/samples');
const { withCheckDigit } = require('../lib/gtin');

const T = { timeout: 120000 };
const sample = new PointOfSale();
loadSample(sample, 'retail');
const item = name => sample.state.items.find(i => i.name === name);
const variantCode = (name, size) => item(name).variants.find(v => v.name === size).barcode;
const gtin14 = code => code.padStart(14, '0');

async function scanWith(b, camera) { // open the register camera and wait for it to read something
  await b.signIn('3333');
  await b.tap(b.tid('camera-scan'));
}

test('register camera reads a UPC-A barcode and adds the item once, even if it stays in view', T, async () => {
  const b = await launch('retail', { camera: { text: item('Canvas Tote').barcode, format: 'UPC_A' } });
  try {
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Added Canvas Tote/);
    await b.shot('retail-camera-upc');
    await b.page.waitForTimeout(3000); // the code is still in front of the camera
    await b.tap(b.tid('camera-done'));
    await b.see(b.tid('lines'), /Canvas Tote/);
    assert.equal(b.pos.state.orders[0].lines.length, 1);
    assert.equal(b.pos.state.orders[0].lines[0].qty, 1);
    await b.see(b.tid('subtotal'), /\$18\.00/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('the same product printed as an EAN-13 (UPC-A with a leading zero) is recognised', T, async () => {
  const b = await launch('retail', { camera: { text: '0' + item('Canvas Tote').barcode, format: 'EAN_13' } });
  try {
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Added Canvas Tote/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('a modern QR code carrying a GS1 Digital Link is read and matched by its GTIN', T, async () => {
  const link = `https://id.gs1.org/01/${gtin14(item('Wool Beanie').barcode)}/10/LOT42`;
  const b = await launch('retail', { camera: { text: link, format: 'QR_CODE' } });
  try {
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Added Wool Beanie/);
    await b.shot('retail-camera-qr');
    await b.tap(b.tid('camera-done'));
    await b.see(b.tid('subtotal'), /\$22\.00/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('a GS1 Data Matrix (GTIN plus lot number) is read', T, async () => {
  const b = await launch('retail', { camera: { text: `01${gtin14(item('Ceramic Mug').barcode)}10LOT-7`, format: 'DATA_MATRIX' } });
  try {
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Added Ceramic Mug/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('an Aztec code holding a SKU is read', T, async () => {
  const b = await launch('retail', { camera: { text: 'HM-SKILLET', format: 'AZTEC' } });
  try {
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Added Cast Iron Skillet/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('a QR code holding a plain SKU is read', T, async () => {
  const b = await launch('retail', { camera: { text: 'GR-WATER', format: 'QR_CODE' } });
  try {
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Added Bottled Water/);
    await b.tap(b.tid('camera-done'));
    await b.see(b.tid('tax'), /\$0\.00/); // groceries are tax-exempt in this shop
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('a sized product is added with the exact size its barcode names', T, async () => {
  const b = await launch('retail', { camera: { text: variantCode('Slim Jeans', '34'), format: 'UPC_A' } });
  try {
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Added Slim Jeans · 34/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('an EAN-8 barcode (small packages) works once the shop has an item with that code', T, async () => {
  const b = await launch('retail', { camera: { text: '96385074', format: 'EAN_8' } });
  try {
    const admin = b.pos.state.staff.find(s => s.role === 'admin');
    b.pos.upsert('items', { name: 'Gum', price: 150, barcode: '96385074', stock: 10 }, admin);
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Added Gum/);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('a valid code that is not in the catalog is explained, and nothing is added', T, async () => {
  const b = await launch('retail', { camera: { text: withCheckDigit('99999999999'), format: 'UPC_A' } });
  try {
    await scanWith(b);
    await b.see(b.tid('camera-last'), /Nothing matches/);
    assert.equal(await b.page.locator(`${b.tid('camera-last')}.warn-text`).count(), 1);
    await b.tap(b.tid('camera-done'));
    assert.equal(b.pos.state.orders.reduce((n, o) => n + o.lines.length, 0), 0);
  } finally { await b.close(); }
});

test('self-checkout: a shopper holds a QR tag to the camera and it lands in the basket', T, async () => {
  const link = `https://id.gs1.org/01/${gtin14(item('Wired Earbuds').barcode)}`;
  const b = await launch('retail', { camera: { text: link, format: 'QR_CODE' } });
  try {
    await b.page.goto(b.base + '/kiosk');
    await b.tap(b.tid('start'));
    await b.tap(b.tid('camera-scan'));
    await b.see(b.tid('camera-last'), /Added Wired Earbuds/);
    await b.tap(b.tid('camera-done'));
    await b.see(b.tid('cart'), /Wired Earbuds[\s\S]*\$29\.99/);
    await b.shot('retail-kiosk-camera');
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('self-checkout: an unknown or age-restricted code is refused with a friendly message', T, async () => {
  const b = await launch('retail', { camera: { text: withCheckDigit('88888888888'), format: 'UPC_A' } });
  try {
    await b.page.goto(b.base + '/kiosk');
    await b.tap(b.tid('start'));
    await b.tap(b.tid('camera-scan'));
    await b.see(b.tid('camera-last'), /could not find that item/);
    await b.tap(b.tid('camera-done'));
    await b.see(b.tid('cart'), /Scan an item/);
    assert.deepEqual(b.errors.filter(e => !/404/.test(e)), []);
  } finally { await b.close(); }
});

test('item form: scanning a QR with a GS1 Digital Link fills the barcode field, and it is saved as a plain GTIN', T, async () => {
  const gtin = withCheckDigit('61200000777');
  const b = await launch('retail', { camera: { text: `https://id.gs1.org/01/${gtin14(gtin)}`, format: 'QR_CODE' } });
  try {
    await b.signIn('1111');
    await b.nav('catalog');
    await b.tap(b.tid('catalog-add'));
    await b.page.fill(b.tid('f-name'), 'Door Mat');
    await b.page.fill(b.tid('f-price'), '24.00');
    await b.tap(b.tid('scan-barcode')); // closes by itself after the first read
    await b.page.waitForFunction(() => document.querySelector('[data-testid="f-barcode"]').value.startsWith('https://'));
    await b.shot('retail-camera-item-form');
    await b.tap(b.tid('catalog-save'));
    await b.see(b.tid('catalog-table'), /Door Mat/);
    assert.equal(b.pos.state.items.find(i => i.name === 'Door Mat').barcode, gtin);
    assert.deepEqual(b.errors, []);
  } finally { await b.close(); }
});

test('without a camera, or with access blocked, the scanner says what is wrong', T, async () => {
  const b = await launch('retail'); // no camera attached
  try {
    await b.signIn('3333');
    await b.tap(b.tid('camera-scan'));
    await b.see(b.tid('camera-status'), /blocked|No camera found/);
    await b.tap(b.tid('camera-done'));
    await b.see(b.tid('total'), /\$0\.00/);
    assert.deepEqual(b.errors.filter(e => !/Permission|NotFound|NotAllowed/i.test(e)), []);
  } finally { await b.close(); }
});
