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
    await page.locator('[data-view="reports"]').click(); await page.locator('#open-check-in').click();
    await page.locator('#check-in-form [name="vehicle"]').selectOption(camry); const intake = await page.evaluate(() => new Date(Date.now() - 2 * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    await page.locator('#check-in-form [name="checkedInAt"]').fill(intake); await page.locator('#check-in-form [name="location"]').fill('Bay 2'); await page.locator('#check-in-form button').click();
    await page.waitForFunction(() => document.querySelectorAll('#held-cars .held-car').length === 2);
    await page.getByRole('tab', { name: 'Payments', exact: true }).click();
    async function receipt(title, amount, direction = 'received') {
      const form = page.locator('#payment-form'); await form.locator('[name="job"]').selectOption({ label: (await form.locator('[name="job"] option').allTextContents()).find(t => t.startsWith(title)) });
      await form.locator('[name="direction"]').selectOption(direction); if (direction === 'refund') {const labels=await form.locator('[name="refundOf"] option').allTextContents();await form.locator('[name="refundOf"]').selectOption({label:labels.find(t=>t.includes(title))});await form.locator('[name="notes"]').fill('Synthetic test refund');}
      await form.locator('[name="amount"]').fill(amount); const count = await page.locator('#recent-payments tr').count(); await form.locator('button').click();
      await page.waitForFunction(n => document.querySelectorAll('#recent-payments tr').length === n, count + 1);
    }
    await receipt('Brake service', '200.10'); await receipt('Oil service', '100.20'); await receipt('Brake service', '20.10', 'refund'); await receipt('Phone estimate', '75.00');
    const r = await page.evaluate(() => window.auto.reports()); assert.equal(r.heldCount, 2); assert.equal(r.openJobs, 3); assert.equal(r.readyForPickup, 1);
    assert.equal(r.revenue.day.netMinor, '28020'); assert.equal(r.balance.outstandingMinor, '7000'); assert.equal(r.balance.creditMinor, '20'); assert.equal(r.money.CAD.day.netMinor, '7500');

    await page.getByRole('tab', { name: 'Profit & costs', exact: true }).click();
    await page.locator('#finance-form').locator('..').locator('summary').click();
    async function financial(kind, title, category, amount, direction = 'charge') {
      const form = page.locator('#finance-form');
      await form.locator('[name="direction"]').selectOption(direction);
      if (direction === 'credit') {
        const labels = await form.locator('[name="creditOf"] option').allTextContents();
        await form.locator('[name="creditOf"]').selectOption({ label: labels.find(t => t.includes('Test parts cost')) });
      } else {
        await form.locator('[name="kind"]').selectOption(kind);
        if (title) { const labels = await form.locator('[name="job"] option').allTextContents(); await form.locator('[name="job"]').selectOption({ label: labels.find(t => t.startsWith(title)) }); }
        else await form.locator('[name="job"]').selectOption('');
        await form.locator('[name="category"]').selectOption(category);
      }
      await form.locator('[name="amount"]').fill(amount);
      await form.locator('[name="description"]').fill(`Test ${category} ${direction === 'credit' ? 'supplier credit' : 'cost'}`);
      await form.locator('[name="reference"]').fill('Synthetic invoice EXP-001');
      const count = await page.locator('#finance-entries tr').count(); await form.locator('button').click();
      await page.waitForFunction(n => document.querySelectorAll('#finance-entries tr').length === n, count + 1);
    }
    await financial('sale', 'Brake service', 'other', '250.00');
    await financial('sale', 'Oil service', 'other', '100.00');
    await financial('expense', 'Brake service', 'parts', '60.00');
    await financial('expense', 'Brake service', 'labor', '80.00');
    await financial('expense', 'Oil service', 'supplies', '10.00');
    await financial('expense', '', 'rent', '20.00');
    await financial('expense', 'Brake service', 'parts', '10.00', 'credit');
    const profit = (await page.evaluate(() => window.auto.reports())).profit;
    assert.equal(profit.periods.day.profitMinor, '19000'); assert.equal(profit.periods.week.profitMinor, '19000'); assert.equal(profit.periods.month.profitMinor, '19000');
    assert.equal(profit.periods.month.salesMinor, '35000'); assert.equal(profit.periods.month.costsMinor, '16000');
    assert.equal(profit.jobs.find(j => j.job['dcterms:title'].startsWith('Brake')).profitMinor, '12000');
    assert.match(await page.locator('#profit-cards').innerText(), /\$190\.00/);
    assert.match(await page.locator('#job-profit').innerText(), /\$120\.00/);
    await page.locator('#finance-form').locator('..').locator('summary').click();
    await page.locator('#report-filters button').click(); await page.waitForFunction(() => document.querySelector('#revenue-cards').textContent.includes('$280.20'));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(proof, 'profit-reports.png') });
    await page.locator('#job-profit').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(proof, 'job-profit.png') });
    await page.getByRole('tab', { name: 'Shop floor', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(proof, 'center-reports.png') });
    await page.locator('#held-cars').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(proof, 'cars-at-center.png') });
    await page.locator('#report-currency').selectOption('CAD'); await page.locator('#report-filters button').click(); await page.waitForFunction(() => document.querySelector('#revenue-cards').textContent.includes('CA$75.00'));
    await page.locator('#report-currency').selectOption('USD'); await page.locator('#report-filters button').click();
    const held = page.locator('#held-cars .held-car').filter({ has: page.getByRole('heading', { name: 'Demo Camry — test vehicle', exact: true }) }); await held.locator('.collection-controls summary').click(); await held.getByRole('button', { name: 'Record vehicle collected' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#held-cars .held-car').length === 1);
    await page.reload(); await page.locator('#reports').waitFor(); await page.waitForFunction(() => document.querySelectorAll('#held-cars .held-car').length === 1);
    assert.match(await page.locator('#profit-cards').innerText(), /\$190\.00/); assert.match(await page.locator('#revenue-cards').innerText(), /\$280\.20/); assert.equal((await page.evaluate(() => window.auto.reports())).openJobs, 3);
    const floorTab = page.getByRole('tab', { name: 'Shop floor', exact: true });
    await floorTab.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Profit & costs', exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#panel-floor').isVisible(), false);
    await page.keyboard.press('End'); assert.equal(await page.locator('#panel-performance').isVisible(), true);
    await page.keyboard.press('Home'); assert.equal(await page.locator('#panel-floor').isVisible(), true);
    await page.setViewportSize({ width: 900, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: path.join(proof, 'center-reports-compact.png') });
    await page.setViewportSize({ width: 600, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.locator('#mode').selectOption('owner'); await page.locator('#garage').waitFor(); await assert.rejects(() => page.evaluate(() => window.auto.reports()), /maintenance center/); assert.deepEqual(errors, []);
    console.log('Actual reporting screen proof: ' + proof);
  } finally { await app.close(); }
});
