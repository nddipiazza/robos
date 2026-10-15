'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { _electron: electron } = require('../../robos-test/node_modules/playwright-core');
test('shop dashboard uses real custody, billing and payment entries and persists accurate reports', { timeout: 180000 }, async () => {
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-auto-reports-e2e-'));
  const proof = path.join(os.homedir(), '.robos/development/walkthroughs/auto-center'); fs.mkdirSync(proof, { recursive: true });
  const app = await electron.launch({ executablePath: require('../node_modules/electron'), args: [path.resolve(__dirname, '../main.js'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], env: { ...process.env, ROBOS_AUTO_PRIVATE: privateRoot } });
  try {
    const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector('#count').textContent.includes('graph entries'));
    await page.locator('#mode').selectOption('shop'); await page.locator('#reports').waitFor();
    await page.waitForFunction(() => document.querySelector('#operation-cards').textContent.includes('Vehicles at the center'));
    assert.match(await page.locator('#held-cars').innerText(), /No vehicles/);
    async function vehicle(name) {
      await page.locator('[data-view="garage"]').click(); await page.locator('#vehicle-form [name="name"]').fill(name);
      await page.locator('#vehicle-form [name="year"]').fill('2020'); await page.locator('#vehicle-form [name="make"]').fill('Toyota'); await page.locator('#vehicle-form [name="model"]').fill('Camry');
      await page.locator('#vehicle-form [name="owner"]').fill('Synthetic customer record'); await page.locator('#vehicle-form button:not([type])').click();
      await page.waitForFunction(name => [...document.querySelectorAll('#vehicles option')].some(o => o.textContent === name), name);
      return page.locator('#vehicles option').filter({ hasText: name }).getAttribute('value');
    }
    async function job(vehicle, title, technician, status, total, currency, checkIn) {
      await page.locator('[data-view="shop"]').click(); await page.locator('#job-form [name="vehicle"]').selectOption(vehicle);
      await page.locator('#job-form [name="name"]').fill(title); await page.locator('#job-form [name="technician"]').fill(technician);
      await page.locator('#job-form [name="checkIn"]').setChecked(checkIn); await page.locator('#job-form button').click();
      const card = page.locator('#job-list .card').filter({ has: page.getByRole('heading', { name: title, exact: true }) }); await card.waitFor();
      await card.locator('[aria-label="Repair job status"]').selectOption(status); await card.locator('[aria-label="Customer charge total"]').fill(total); await card.locator('[aria-label="Job billing currency"]').selectOption(currency); await card.getByRole('button', { name: 'Save job update' }).click();
      await page.waitForFunction(title => document.querySelector('#git-status').textContent.includes('update repair job') && [...document.querySelectorAll('#job-list h3')].some(h => h.textContent === title), title);
      await page.waitForFunction(() => document.querySelector('#message').textContent.includes('Repair job updated'));
    }
    const camry = await vehicle('Demo Camry — test vehicle'), transit = await vehicle('Demo delivery car — test vehicle'), offsite = await vehicle('Demo off-site vehicle — test');
    await job(camry, 'Brake service — test job', 'Alex', 'in-progress', '250.00', 'USD', false);
    await job(transit, 'Oil service — test job', 'Morgan', 'ready', '100.00', 'USD', true);
    await job(offsite, 'Phone estimate — test job', '', 'received', '75.00', 'CAD', false);
    await page.locator('[data-view="reports"]').click(); await page.locator('#check-in-form').locator('..').locator('summary').click();
    await page.locator('#check-in-form [name="vehicle"]').selectOption(camry); const intake = await page.evaluate(() => new Date(Date.now() - 2 * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    await page.locator('#check-in-form [name="checkedInAt"]').fill(intake); await page.locator('#check-in-form [name="location"]').fill('Bay 2'); await page.locator('#check-in-form button').click();
    await page.waitForFunction(() => document.querySelectorAll('#held-cars .held-car').length === 2);
    async function receipt(title, amount, direction = 'received') {
      const form = page.locator('#payment-form'); await form.locator('[name="job"]').selectOption({ label: (await form.locator('[name="job"] option').allTextContents()).find(t => t.startsWith(title)) });
      await form.locator('[name="direction"]').selectOption(direction); if (direction === 'refund') {const labels=await form.locator('[name="refundOf"] option').allTextContents();await form.locator('[name="refundOf"]').selectOption({label:labels.find(t=>t.includes(title))});await form.locator('[name="notes"]').fill('Synthetic test refund');}
      await form.locator('[name="amount"]').fill(amount); const count = await page.locator('#recent-payments tr').count(); await form.locator('button').click();
      await page.waitForFunction(n => document.querySelectorAll('#recent-payments tr').length === n, count + 1);
    }
    await receipt('Brake service', '200.10'); await receipt('Oil service', '100.20'); await receipt('Brake service', '20.10', 'refund'); await receipt('Phone estimate', '75.00');
    const r = await page.evaluate(() => window.auto.reports()); assert.equal(r.heldCount, 2); assert.equal(r.openJobs, 3); assert.equal(r.readyForPickup, 1);
    assert.equal(r.revenue.day.netMinor, '28020'); assert.equal(r.balance.outstandingMinor, '7000'); assert.equal(r.balance.creditMinor, '20'); assert.equal(r.money.CAD.day.netMinor, '7500');
    await page.locator('#report-filters button').click(); await page.waitForFunction(() => document.querySelector('#revenue-cards').textContent.includes('$280.20'));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(proof, 'center-reports.png') });
    await page.locator('#held-cars').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(proof, 'cars-at-center.png') });
    await page.locator('#report-currency').selectOption('CAD'); await page.locator('#report-filters button').click(); await page.waitForFunction(() => document.querySelector('#revenue-cards').textContent.includes('CA$75.00'));
    await page.locator('#report-currency').selectOption('USD'); await page.locator('#report-filters button').click();
    const held = page.locator('#held-cars .held-car').filter({ has: page.getByRole('heading', { name: 'Demo Camry — test vehicle', exact: true }) }); await held.getByRole('button', { name: 'Record vehicle collected' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#held-cars .held-car').length === 1);
    await page.reload(); await page.locator('#reports').waitFor(); await page.waitForFunction(() => document.querySelectorAll('#held-cars .held-car').length === 1);
    assert.match(await page.locator('#revenue-cards').innerText(), /\$280\.20/); assert.equal((await page.evaluate(() => window.auto.reports())).openJobs, 3);
    await page.locator('#mode').selectOption('owner'); await page.locator('#garage').waitFor(); await assert.rejects(() => page.evaluate(() => window.auto.reports()), /maintenance center/); assert.deepEqual(errors, []);
    console.log('Actual reporting screen proof: ' + proof);
  } finally { await app.close(); }
});
